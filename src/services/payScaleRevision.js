'use strict';

/**
 * Lets a Super Admin apply a new Government-ordered pay scale revision to
 * one organisation at a time, via a CSV template rather than re-typing each
 * post's scale expression by hand in a form.
 *
 * Flow:
 *   1. GET the template for an org (payScaleTemplateRows) — one row per
 *      ACTIVE post, pre-filled with its current scale so the Super Admin
 *      only has to edit the figures that actually changed.
 *   2. Edit `newScaleExpression` (and, if needed, `payableDays`/`monthDays`)
 *      for the revised posts, leaving the rest blank.
 *   3. POST it back (applyRevision) with a revision name + effective date.
 *
 * Applying a row creates a NEW PayScale (+ PayStage ladder) under a new
 * PayRevision, marks the post's previous "current" scale SUPERSEDED, and
 * repoints PostCadre.defaultPayScaleId at the new one — exactly how
 * services/payScaleLibrary.js's own createRevisionScaleStages works, reused
 * here for revising EXISTING posts rather than seeding new ones.
 *
 * Deliberately NOT touched: employees already on the old scale keep their
 * currentPayScaleId/currentStageId — moving them onto the new scale is a
 * separate Pay Fixation action (never silently reassigned by a bulk upload,
 * consistent with this project's "never rewrite pay history" rule).
 */

const { PayRevision, PayScale, PayStage, PostCadre } = require('../models');
const { expandScaleExpression } = require('./payScaleExpr');

const TEMPLATE_HEADERS = ['postCode', 'postName', 'currentScaleCode', 'currentScaleExpression', 'payableDays', 'monthDays', 'newScaleExpression'];
const APPLY_HEADERS = ['postCode', 'newScaleExpression', 'payableDays', 'monthDays'];

/** One row per ACTIVE post in the org, for the downloadable template CSV. */
async function templateRows(organizationId) {
  const posts = await PostCadre.findAll({ where: { organizationId, status: 'ACTIVE' }, order: [['code', 'ASC']] });
  const scaleIds = posts.map((p) => p.defaultPayScaleId).filter(Boolean);
  const scales = scaleIds.length ? await PayScale.findAll({ where: { id: scaleIds } }) : [];
  const scaleById = {}; scales.forEach((s) => { scaleById[s.id] = s; });
  return posts.map((p) => {
    const cur = scaleById[p.defaultPayScaleId];
    return {
      postCode: p.code,
      postName: p.name,
      currentScaleCode: cur ? cur.code : '',
      currentScaleExpression: cur ? cur.scaleExpression : '',
      payableDays: cur && cur.payableDays != null ? cur.payableDays : '',
      monthDays: cur && cur.monthDays != null ? cur.monthDays : '',
      newScaleExpression: '', // left blank for the Super Admin to fill in for posts that changed
    };
  });
}

class RevisionError extends Error { constructor(m) { super(m); this.status = 400; } }

/**
 * @param {object} input — { organizationId, revisionName, effectiveDate, description, rows }
 *   rows: parsed CSV rows (objects with postCode/newScaleExpression/payableDays/monthDays keys);
 *   rows with a blank newScaleExpression are skipped (that post is unchanged).
 */
async function applyRevision({ organizationId, revisionName, effectiveDate, description, rows }) {
  if (!revisionName || !String(revisionName).trim()) throw new RevisionError('A revision name is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate || ''))) throw new RevisionError('A valid effective date (YYYY-MM-DD) is required.');
  const changed = (rows || []).filter((r) => r.newScaleExpression && String(r.newScaleExpression).trim());
  if (!changed.length) throw new RevisionError('No rows have a newScaleExpression — nothing to apply. Leave a row blank to keep that post unchanged.');

  const posts = await PostCadre.findAll({ where: { organizationId } });
  const postByCode = {}; posts.forEach((p) => { postByCode[p.code] = p; });
  const currentScaleIds = posts.map((p) => p.defaultPayScaleId).filter(Boolean);
  const currentScales = currentScaleIds.length ? await PayScale.findAll({ where: { id: currentScaleIds } }) : [];
  const scaleById = {}; currentScales.forEach((s) => { scaleById[s.id] = s; });
  const currentScaleByPostId = {}; posts.forEach((p) => { if (p.defaultPayScaleId && scaleById[p.defaultPayScaleId]) currentScaleByPostId[p.id] = scaleById[p.defaultPayScaleId]; });

  // Validate every changed row BEFORE writing anything.
  const prepared = [];
  const rowErrors = [];
  changed.forEach((r, i) => {
    const rowNo = i + 2;
    const post = r.postCode ? postByCode[String(r.postCode).trim()] : null;
    if (!r.postCode) { rowErrors.push(`Row ${rowNo}: postCode is required`); return; }
    if (!post) { rowErrors.push(`Row ${rowNo}: postCode "${r.postCode}" not found in this organisation`); return; }
    let amounts;
    try {
      amounts = expandScaleExpression(r.newScaleExpression).amounts;
    } catch (err) {
      rowErrors.push(`Row ${rowNo} (${r.postCode}): ${err.message}`);
      return;
    }
    const payableDays = r.payableDays !== undefined && r.payableDays !== '' ? Number(r.payableDays) : null;
    const monthDays = r.monthDays !== undefined && r.monthDays !== '' ? Number(r.monthDays) : null;
    if (r.payableDays !== undefined && r.payableDays !== '' && !(payableDays > 0)) { rowErrors.push(`Row ${rowNo} (${r.postCode}): payableDays must be a positive number`); return; }
    if (r.monthDays !== undefined && r.monthDays !== '' && !(monthDays > 0)) { rowErrors.push(`Row ${rowNo} (${r.postCode}): monthDays must be a positive number`); return; }
    prepared.push({ post, scaleExpression: String(r.newScaleExpression).trim(), amounts, payableDays, monthDays });
  });
  if (rowErrors.length) throw new RevisionError(rowErrors.join(' | '));

  const { sequelize } = require('../models');
  const results = await sequelize.transaction(async (t) => {
    const revision = await PayRevision.create({
      organizationId, name: String(revisionName).trim(), effectiveDate,
      description: description ? String(description).slice(0, 2000) : null,
      status: 'ACTIVE',
    }, { transaction: t });

    const out = [];
    for (const item of prepared) {
      const post = item.post;
      const codeSuffix = `GOV${revision.id}`;
      let code = `${post.code}-${codeSuffix}`;
      // Extremely unlikely, but guard the unique (organizationId, code) index.
      let n = 1;
      // eslint-disable-next-line no-await-in-loop
      while (await PayScale.findOne({ where: { organizationId, code }, transaction: t })) { code = `${post.code}-${codeSuffix}-${++n}`; }

      // eslint-disable-next-line no-await-in-loop
      const newScale = await PayScale.create({
        organizationId, payRevisionId: revision.id, code,
        name: `${post.name} (${revisionName})`,
        scaleExpression: item.scaleExpression,
        payableDays: item.payableDays != null ? item.payableDays : 31,
        monthDays: item.monthDays,
        effectiveFrom: effectiveDate,
        status: 'ACTIVE',
      }, { transaction: t });
      // eslint-disable-next-line no-await-in-loop
      await PayStage.bulkCreate(item.amounts.map((amount, idx) => ({ payScaleId: newScale.id, stageNo: idx + 1, amount })), { transaction: t });

      const oldScale = currentScaleByPostId[post.id];
      if (oldScale && oldScale.status === 'ACTIVE') {
        const dayBefore = new Date(effectiveDate); dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
        // eslint-disable-next-line no-await-in-loop
        await oldScale.update({ status: 'SUPERSEDED', effectiveTo: dayBefore.toISOString().slice(0, 10) }, { transaction: t });
      }
      // eslint-disable-next-line no-await-in-loop
      await post.update({ defaultPayScaleId: newScale.id }, { transaction: t });

      out.push({ postCode: post.code, postName: post.name, newScaleId: newScale.id, newScaleCode: newScale.code, stages: item.amounts.length, previousScaleCode: oldScale ? oldScale.code : null });
    }
    return { revision, applied: out };
  });

  return results;
}

module.exports = { templateRows, applyRevision, RevisionError, TEMPLATE_HEADERS, APPLY_HEADERS };
