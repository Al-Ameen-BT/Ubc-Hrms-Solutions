'use strict';

/**
 * Provisions an organisation's starting Post/Cadre + Pay Revision/Scale/
 * Stage records from the Kerala UCB reference library (src/seed/payScalesUCB.js)
 * the moment the organisation is created, based on the bank class chosen at
 * that time (Organization.bankClass).
 *
 * This is deliberately NOT a shared/global table: every model in this app
 * (PostCadre, PayRevision, PayScale) is organization-scoped by design (see
 * models/index.js), so "provision a copy into the new org" is how a
 * library becomes available without changing that architecture. Once
 * provisioned, the org's Pay Scale admin screens (views-master.js) can
 * edit/extend these like any other org data — they are a starting point,
 * not a locked template.
 *
 * IMPORTANT — effective dates: the source PDF gives "Pre-Revised" and
 * "Revised" scales but no Government Order date for either. The dates used
 * below are placeholders (organisation creation date for the current/
 * revised scale; an arbitrary earlier date for the superseded one) so the
 * records are usable immediately. Per this project's rule — never invent
 * KSR dates — both revisions are created with status/description flagged
 * "Rule verification required": confirm the actual GO effective dates and
 * correct them before relying on this for historical pay fixation.
 */

const { CLASSES, PART_TIME_CONTINGENT } = require('../seed/payScalesUCB');
const { expandScaleExpression } = require('./payScaleExpr');
const { PayRevision, PayScale, PayStage, PostCadre } = require('../models');

const BANK_CLASS_LABELS = Object.fromEntries(
  Object.entries(CLASSES).map(([code, cls]) => [code, cls.label])
);

// Short prefix per class, used to namespace PostCadre/PayScale codes
// (e.g. "C1_PEON") so the same post (Peon, Junior Clerk, ...) can be seeded
// under more than one class for the same org without a code clash. This is
// what makes changing an organisation's bankClass additive rather than a
// no-op: each class's "PEON" is a distinct post/scale from every other
// class's "PEON", not the same row reused.
const CLASS_PREFIX = {
  SPECIAL_GRADE: 'SG', CLASS_I: 'C1', CLASS_II: 'C2', CLASS_III: 'C3', CLASS_IV: 'C4', CLASS_V: 'C5',
};

const BANK_CLASS_LIST = Object.entries(CLASSES).map(([code, cls]) => ({
  code,
  label: cls.label,
  postCount: cls.posts.length,
  note: cls.note || null,
}));

const VERIFY_NOTE = 'Seeded from the Kerala UCB pay-scale annexure. Government Order effective date not stated in the source — Rule verification required before relying on this for historical pay fixation.';

async function createRevisionScaleStages({ organizationId, revisionName, effectiveDate, status, posts, revisionKey, codePrefix, transaction }) {
  const revision = await PayRevision.create({
    organizationId,
    name: revisionName,
    effectiveDate,
    status,
    description: VERIFY_NOTE,
  }, { transaction });

  const scaleByPostCode = {};
  for (const post of posts) {
    const expr = post[revisionKey];
    const { amounts } = expandScaleExpression(expr);
    const scale = await PayScale.create({
      organizationId,
      payRevisionId: revision.id,
      code: `${codePrefix}${post.code}-${revisionKey.toUpperCase()}`,
      name: `${post.name} (${revisionName})`,
      scaleExpression: expr,
      effectiveFrom: effectiveDate,
      status: status === 'ACTIVE' ? 'ACTIVE' : 'SUPERSEDED',
    }, { transaction });
    await PayStage.bulkCreate(
      amounts.map((amount, idx) => ({ payScaleId: scale.id, stageNo: idx + 1, amount })),
      { transaction }
    );
    scaleByPostCode[post.code] = scale;
  }
  return { revision, scaleByPostCode };
}

/**
 * Seeds whichever of the given posts the organisation doesn't already have
 * (matched by the prefixed PostCadre.code — see CLASS_PREFIX), plus their
 * Pre-Revised/Revised pay revisions, scales and stage ladders. Additive and
 * idempotent — safe to call again after an organisation's bankClass
 * changes, since an org may change class at any time (Super Admin) and
 * existing posts/scales already in use by employees are never touched or
 * removed, only added to.
 */
async function seedMissingPosts(org, postsList, { transaction, label, cadreLabel, codePrefix = '' } = {}) {
  const prefixedCodes = postsList.map((p) => `${codePrefix}${p.code}`);
  const existing = await PostCadre.findAll({
    where: { organizationId: org.id, code: prefixedCodes },
    attributes: ['code'],
    transaction,
  });
  const existingCodes = new Set(existing.map((p) => p.code));
  const missing = postsList.filter((p) => !existingCodes.has(`${codePrefix}${p.code}`));
  if (!missing.length) return { posts: {}, seeded: false };

  const today = new Date().toISOString().slice(0, 10);
  const previousDate = '2000-01-01';

  const pre = await createRevisionScaleStages({
    organizationId: org.id,
    revisionName: `${label} — Pre-Revised Scale`,
    effectiveDate: previousDate,
    status: 'SUPERSEDED',
    posts: missing,
    revisionKey: 'pre',
    codePrefix,
    transaction,
  });
  const rev = await createRevisionScaleStages({
    organizationId: org.id,
    revisionName: `${label} — Revised Scale`,
    effectiveDate: today,
    status: 'ACTIVE',
    posts: missing,
    revisionKey: 'rev',
    codePrefix,
    transaction,
  });

  const posts = {};
  for (const post of missing) {
    const currentScale = rev.scaleByPostCode[post.code];
    const postCadre = await PostCadre.create({
      organizationId: org.id,
      code: `${codePrefix}${post.code}`,
      name: post.name,
      cadre: cadreLabel || label,
      defaultPayScaleId: currentScale.id,
      status: 'ACTIVE',
    }, { transaction });
    posts[post.code] = postCadre;
  }

  return { posts, seeded: true, preRevision: pre.revision, revRevision: rev.revision };
}

/**
 * Seeds the chosen bankClass's post/pay-scale library into an organisation
 * — at creation, or again later if the Super Admin changes its bankClass
 * (organisations may change class at any time). Only posts the org doesn't
 * already have (by code) are added; nothing already there — including
 * anything an employee references — is ever changed or removed, so an org
 * that has switched class more than once simply accumulates each class's
 * posts (namespaced by class, e.g. "C1_PEON" vs "SG_PEON") rather than
 * overwriting them. Also seeds the Part-Time Contingent scale, common to
 * every organisation regardless of class, if it isn't already present.
 */
async function provisionForOrganization(organization, { transaction } = {}) {
  const org = organization;
  const cls = CLASSES[org.bankClass];
  if (!cls) throw new Error(`Unknown or unset bankClass "${org.bankClass}" — cannot provision pay scale library`);
  const prefix = CLASS_PREFIX[org.bankClass] ? `${CLASS_PREFIX[org.bankClass]}_` : '';

  const classResult = await seedMissingPosts(org, cls.posts, { transaction, label: cls.label, cadreLabel: cls.label, codePrefix: prefix });
  const ptResult = await seedMissingPosts(org, [PART_TIME_CONTINGENT], {
    transaction, label: PART_TIME_CONTINGENT.name, cadreLabel: 'Part-Time Contingent (common to all classes)',
  });

  return { posts: classResult.posts, partTimePost: ptResult.posts[PART_TIME_CONTINGENT.code] };
}

module.exports = { BANK_CLASS_LABELS, BANK_CLASS_LIST, provisionForOrganization, VERIFY_NOTE };
