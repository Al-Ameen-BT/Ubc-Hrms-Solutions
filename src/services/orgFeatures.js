'use strict';

const { OrganizationFeature, Organization } = require('../models');

/**
 * Server-owned master catalogue of toggleable organisation features.
 * Features default to enabled: true unless specified otherwise.
 */
const FEATURE_CATALOGUE = Object.freeze([
  {
    code: 'payroll',
    name: 'Payroll & Salary Computation',
    description: 'Monthly payroll runs, salary slips generation, earnings & deductions computation.',
    category: 'Core HR & Finance',
    defaultEnabled: true,
  },
  {
    code: 'leave',
    name: 'Leave Management',
    description: 'Leave balances, casual/earned/sick leave applications and manager approval workflows.',
    category: 'Core HR & Finance',
    defaultEnabled: true,
  },
  {
    code: 'attendance',
    name: 'Attendance & Time Tracking',
    description: 'Daily check-in/out records, shift schedules, overtime and attendance exceptions.',
    category: 'Core HR & Finance',
    defaultEnabled: true,
  },
  {
    code: 'expenses',
    name: 'Expense Reimbursements',
    description: 'Travel and incidental reimbursement claims with receipt photo and PDF vouchers.',
    category: 'Core HR & Finance',
    defaultEnabled: true,
  },
  {
    code: 'arrears',
    name: 'Arrears & Instalment Plans',
    description: 'DA revision arrears, pay revision arrears calculations, and monthly instalment distributions.',
    category: 'Financial Operations',
    defaultEnabled: true,
  },
  {
    code: 'compensation',
    name: 'Compensation & Allowances',
    description: 'Grade allowances, risk allowances, CCA, conveyance and festival advances.',
    category: 'Financial Operations',
    defaultEnabled: true,
  },
  {
    code: 'transfers',
    name: 'Inter-Branch Transfers',
    description: 'Staff transfers across bank branches and departments with effective dating.',
    category: 'Core HR & Finance',
    defaultEnabled: true,
  },
  {
    code: 'government_orders',
    name: 'Government Orders & KSR Rules',
    description: 'Official Government Order repository, circulars and Kerala Service Rules references.',
    category: 'Governance & Rules',
    defaultEnabled: true,
  },
  {
    code: 'pay_revisions',
    name: 'Pay Scale Revisions',
    description: 'Pay fixation policy, scale revisions, and bulk cadre fixation tools.',
    category: 'Financial Operations',
    defaultEnabled: true,
  },
  {
    code: 'dpdp_compliance',
    name: 'DPDP Privacy & Compliance',
    description: 'Statutory DPDP Act data subject requests, consent notices, breach logs and DPO audit console.',
    category: 'Governance & Rules',
    defaultEnabled: true,
  },
  {
    code: 'mobile_app',
    name: 'Employee Mobile App',
    description: 'QR-code device pairing and access to employee mobile application.',
    category: 'Employee Access',
    defaultEnabled: true,
  },
  {
    code: 'self_service',
    name: 'Employee Self-Service Portal',
    description: 'Web portal access for employees to download payslips, apply for leave, and view policies.',
    category: 'Employee Access',
    defaultEnabled: true,
  },
  {
    code: 'geofence',
    name: 'Geofenced Attendance',
    description: 'GPS geofencing verification for mobile check-ins at designated bank branches.',
    category: 'Advanced Controls',
    defaultEnabled: false,
  },
  {
    code: 'financial_approvals',
    name: 'Financial Change Proposals',
    description: 'Maker-checker dual approval workflows for salary, increment, and allowance modifications.',
    category: 'Financial Operations',
    defaultEnabled: true,
  },
  {
    code: 'bulk_import',
    name: 'Bulk Employee Import',
    description: 'Excel/CSV bulk import tools for employee records and opening service history.',
    category: 'Data Management',
    defaultEnabled: true,
  },
  {
    code: 'audit',
    name: 'Tenant Audit Logs',
    description: 'Detailed immutable audit logs of user actions, financial approvals, and data accesses.',
    category: 'Governance & Rules',
    defaultEnabled: true,
  },
  {
    code: 'mfa',
    name: 'Multi-Factor Authentication',
    description: 'TOTP 2FA configuration and enforcement for tenant staff and administrative logins.',
    category: 'Security & Access',
    defaultEnabled: true,
  },
]);

const VALID_FEATURE_CODES = new Set(FEATURE_CATALOGUE.map(f => f.code));
const DEFAULT_MAP = new Map(FEATURE_CATALOGUE.map(f => [f.code, f.defaultEnabled]));

/**
 * Returns merged feature list for an organisation.
 * Each feature has code, name, description, category, enabled (boolean), notes, updatedAt.
 */
async function getFeatures(organizationId) {
  if (!organizationId) return FEATURE_CATALOGUE.map(f => ({ ...f, enabled: f.defaultEnabled }));

  const rows = await OrganizationFeature.findAll({
    where: { organizationId },
    raw: true,
  });

  const overrideMap = new Map(rows.map(r => [r.featureCode, r]));

  return FEATURE_CATALOGUE.map(catalogItem => {
    const override = overrideMap.get(catalogItem.code);
    return {
      code: catalogItem.code,
      name: catalogItem.name,
      description: catalogItem.description,
      category: catalogItem.category,
      enabled: override ? Boolean(override.enabled) : catalogItem.defaultEnabled,
      isDefault: !override,
      notes: override?.notes || null,
      updatedAt: override?.updatedAt || null,
    };
  });
}

/**
 * Checks if a specific feature is enabled for an organisation.
 * Uses request-scoped caching if req is provided to avoid duplicate queries within the same HTTP request.
 * Zero-cache across distinct requests (always fresh from DB).
 */
async function isFeatureEnabled(organizationId, featureCode, req = null) {
  if (!organizationId) return false;
  if (!VALID_FEATURE_CODES.has(featureCode)) return false;

  // Request-scoped cache (per-request memory only, 0ms latency across separate requests)
  if (req) {
    if (!req._featureCache) req._featureCache = new Map();
    if (req._featureCache.has(featureCode)) {
      return req._featureCache.get(featureCode);
    }
  }

  const row = await OrganizationFeature.findOne({
    where: { organizationId, featureCode },
    attributes: ['enabled'],
    raw: true,
  });

  const enabled = row ? Boolean(row.enabled) : (DEFAULT_MAP.get(featureCode) ?? false);

  if (req && req._featureCache) {
    req._featureCache.set(featureCode, enabled);
  }

  return enabled;
}

/**
 * Returns an array of enabled feature codes for an organisation.
 */
async function getEnabledFeatureCodes(organizationId) {
  const features = await getFeatures(organizationId);
  return features.filter(f => f.enabled).map(f => f.code);
}

/**
 * Toggles a single feature for an organisation.
 */
async function setFeature(organizationId, featureCode, enabled, userId = null, notes = null) {
  if (!VALID_FEATURE_CODES.has(featureCode)) {
    const error = new Error(`Invalid feature code: "${featureCode}"`);
    error.status = 400;
    throw error;
  }

  const org = await Organization.findByPk(organizationId);
  if (!org) {
    const error = new Error('Organisation not found');
    error.status = 404;
    throw error;
  }

  const now = new Date();
  const values = {
    organizationId,
    featureCode,
    enabled: Boolean(enabled),
    updatedByUserId: userId || null,
    notes: notes != null ? String(notes).trim().slice(0, 500) : null,
    enabledAt: enabled ? now : null,
    disabledAt: !enabled ? now : null,
  };

  const existing = await OrganizationFeature.findOne({ where: { organizationId, featureCode } });
  if (existing) {
    Object.assign(existing, values);
    await existing.save();
    return existing;
  }

  return OrganizationFeature.create(values);
}

/**
 * Bulk updates multiple features for an organisation.
 */
async function setFeatures(organizationId, featuresArray, userId = null) {
  if (!Array.isArray(featuresArray)) {
    const error = new Error('Features must be an array of { code, enabled, notes? }');
    error.status = 400;
    throw error;
  }

  const results = [];
  for (const item of featuresArray) {
    if (!item || !item.code) continue;
    const res = await setFeature(organizationId, item.code, item.enabled, userId, item.notes);
    results.push(res);
  }
  return results;
}

module.exports = {
  FEATURE_CATALOGUE,
  VALID_FEATURE_CODES,
  getFeatures,
  isFeatureEnabled,
  getEnabledFeatureCodes,
  setFeature,
  setFeatures,
};
