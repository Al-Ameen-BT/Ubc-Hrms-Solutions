'use strict';

const { Op } = require('sequelize');
const {
  DpdpRetentionRule,
  ExpenseReceipt,
  ExpenseClaim,
  AuditLog,
} = require('../models');

const STATUTORY_EXCLUDED_CATEGORIES = Object.freeze([
  'PAYROLL',
  'AUDIT_LOG',
  'SERVICE_BOOK',
  'STATUTORY_CONTRIBUTIONS',
]);

const RETENTION_CATEGORIES = Object.freeze([
  'EXPENSE_RECEIPTS',
  'EMPLOYEE_SESSION_LOGS',
  'TEMP_ATTACHMENTS',
  'RECRUITMENT_RECORDS',
]);

/**
 * List configured retention rules for an organisation.
 */
async function listRules({ organizationId }) {
  if (!organizationId) throw new Error('organizationId is required');
  return DpdpRetentionRule.findAll({
    where: { organizationId },
    order: [['category', 'ASC']],
  });
}

/**
 * Upsert a retention rule for a category in an organisation.
 */
async function upsertRule({ organizationId, category, periodMonths = 36, legalHold = false, notes = null, actor = null }) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!category) throw new Error('category is required');

  if (STATUTORY_EXCLUDED_CATEGORIES.includes(category)) {
    throw new Error(`Category ${category} is statutory and excluded from automated retention configuration.`);
  }

  let rule = await DpdpRetentionRule.findOne({
    where: { organizationId, category },
  });

  if (rule) {
    await rule.update({
      periodMonths: Math.max(1, Number(periodMonths)),
      legalHold: Boolean(legalHold),
      notes: notes ? String(notes).trim() : null,
    });
  } else {
    rule = await DpdpRetentionRule.create({
      organizationId,
      category,
      periodMonths: Math.max(1, Number(periodMonths)),
      legalHold: Boolean(legalHold),
      notes: notes ? String(notes).trim() : null,
    });
  }

  return rule;
}

/**
 * Generate report-only expiry candidates for an organisation as of a date.
 * Strictly read-only: does not perform deletions.
 */
async function expiryCandidates({ organizationId, asOf = new Date() }) {
  if (!organizationId) throw new Error('organizationId is required');
  const rules = await listRules({ organizationId });

  const results = [];
  const cutoffDate = (months) => {
    const d = new Date(asOf);
    d.setMonth(d.getMonth() - months);
    return d;
  };

  for (const rule of rules) {
    if (rule.legalHold) {
      results.push({
        category: rule.category,
        periodMonths: rule.periodMonths,
        legalHold: true,
        candidateCount: 0,
        status: 'HELD',
        notes: rule.notes,
      });
      continue;
    }

    let candidateCount = 0;
    const cutoff = cutoffDate(rule.periodMonths);

    if (rule.category === 'EXPENSE_RECEIPTS') {
      try {
        candidateCount = await ExpenseReceipt.count({
          include: [{
            model: ExpenseClaim,
            where: {
              organizationId,
              createdAt: { [Op.lt]: cutoff },
            },
            required: true,
          }],
        });
      } catch {
        candidateCount = 0;
      }
    } else {
      // General categories without destructive models count 0 candidates
      candidateCount = 0;
    }

    results.push({
      category: rule.category,
      periodMonths: rule.periodMonths,
      legalHold: false,
      candidateCount,
      status: 'REPORT_ONLY',
      notes: rule.notes,
    });
  }

  return results;
}

module.exports = {
  STATUTORY_EXCLUDED_CATEGORIES,
  RETENTION_CATEGORIES,
  listRules,
  upsertRule,
  expiryCandidates,
};
