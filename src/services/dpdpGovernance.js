'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  Organization,
  User,
  Employee,
  OrganizationRole,
  OrganizationRolePermission,
  UserRoleAssignment,
  OrganizationResponsibilityAssignment,
  DpdpDocument,
  DpdpOrganizationProfile,
  AuditLog,
} = require('../models');
const { template } = require('./permissionCatalog');
const { invalidateUserAccess } = require('./userAdmin');

/**
 * Checks DPDP compliance readiness for an organisation.
 * An organisation is ready only when:
 * 1. An active employee-linked DPO is assigned.
 * 2. All 3 required documents are published:
 *    - Platform Terms (TERMS)
 *    - Platform Privacy Notice (PLATFORM_PRIVACY)
 *    - Bank Employee DPDP Notice (EMPLOYEE_NOTICE)
 */
async function readiness(organizationId, transaction) {
  const options = transaction ? { transaction } : {};
  const today = new Date().toISOString().slice(0, 10);

  // 1. Check for active DPO responsibility
  const dpoAssignment = await OrganizationResponsibilityAssignment.findOne({
    where: {
      organizationId,
      responsibility: 'DATA_PROTECTION_OFFICER',
      status: 'ACTIVE',
      effectiveFrom: { [Op.lte]: today },
      [Op.or]: [
        { effectiveTo: null },
        { effectiveTo: { [Op.gte]: today } },
      ],
    },
    ...options,
  });

  const blockers = [];
  if (!dpoAssignment) {
    blockers.push({
      code: 'DPO_REQUIRED',
      message: 'An active employee-linked Data Protection Officer must be assigned.',
    });
  }

  // 2. Check required published documents
  const [terms, platformPrivacy, employeeNotice] = await Promise.all([
    DpdpDocument.findOne({
      where: { ownerType: 'PLATFORM', type: 'TERMS', state: 'PUBLISHED' },
      order: [['publishedAt', 'DESC'], ['id', 'DESC']],
      ...options,
    }),
    DpdpDocument.findOne({
      where: { ownerType: 'PLATFORM', type: 'PLATFORM_PRIVACY', state: 'PUBLISHED' },
      order: [['publishedAt', 'DESC'], ['id', 'DESC']],
      ...options,
    }),
    DpdpDocument.findOne({
      where: { ownerType: 'ORGANIZATION', organizationId, type: 'EMPLOYEE_NOTICE', state: 'PUBLISHED' },
      order: [['publishedAt', 'DESC'], ['id', 'DESC']],
      ...options,
    }),
  ]);

  const missingDocs = [];
  if (!terms) missingDocs.push('TERMS');
  if (!platformPrivacy) missingDocs.push('PLATFORM_PRIVACY');
  if (!employeeNotice) missingDocs.push('EMPLOYEE_NOTICE');

  if (missingDocs.length > 0) {
    blockers.push({
      code: 'DOCUMENTS_REQUIRED',
      missingDocuments: missingDocs,
      message: `Required DPDP documents missing: ${missingDocs.join(', ')}.`,
    });
  }

  // 3. Organization profile
  let profile = await DpdpOrganizationProfile.findOne({
    where: { organizationId },
    ...options,
  });

  const isReady = blockers.length === 0;

  if (profile && isReady && profile.complianceStatus !== 'READY') {
    profile.complianceStatus = 'READY';
    await profile.save(options);
  }

  return {
    organizationId,
    isReady,
    blockers,
    dpo: dpoAssignment ? {
      id: dpoAssignment.id,
      userId: dpoAssignment.userId,
      employeeId: dpoAssignment.employeeId,
      effectiveFrom: dpoAssignment.effectiveFrom,
      effectiveTo: dpoAssignment.effectiveTo,
    } : null,
    documents: {
      terms: terms ? { id: terms.id, version: terms.version, title: terms.title } : null,
      platformPrivacy: platformPrivacy ? { id: platformPrivacy.id, version: platformPrivacy.version, title: platformPrivacy.title } : null,
      employeeNotice: employeeNotice ? { id: employeeNotice.id, version: employeeNotice.version, title: employeeNotice.title } : null,
    },
    profile,
  };
}

/**
 * Assigns an active employee-linked user as the organisation's DPO.
 * Executed in a single transaction:
 * - Validates tenant isolation and active employee link
 * - Concludes prior DPO responsibility assignment
 * - Creates new responsibility assignment
 * - Ensures protected DATA_PROTECTION_OFFICER role and assignment
 * - Invalidates sessions for previous and new DPO users
 * - Updates DpdpOrganizationProfile
 * - Audits the action
 */
async function assignDpo({ organizationId, actor, userId, effectiveFrom, transaction: externalTx }) {
  const run = async (t) => {
    const today = new Date().toISOString().slice(0, 10);
    const effFrom = effectiveFrom || today;

    // 1. Validate user and tenant isolation
    const user = await User.findByPk(userId, { transaction: t });
    if (!user || user.organizationId !== organizationId) {
      const err = new Error('User must belong to the organisation.');
      err.status = 403;
      throw err;
    }

    if (user.status !== 'ACTIVE') {
      const err = new Error('DPO user account must be active.');
      err.status = 400;
      throw err;
    }

    if (!user.employeeId) {
      const err = new Error('DPO user must be linked to an active employee.');
      err.status = 400;
      throw err;
    }

    const employee = await Employee.findByPk(user.employeeId, { transaction: t });
    if (!employee || employee.organizationId !== organizationId || employee.status !== 'ACTIVE') {
      const err = new Error('DPO employee must be active within the same organisation.');
      err.status = 400;
      throw err;
    }

    // 2. Conclude any current active DPO responsibility
    const priorAssignments = await OrganizationResponsibilityAssignment.findAll({
      where: {
        organizationId,
        responsibility: 'DATA_PROTECTION_OFFICER',
        status: 'ACTIVE',
      },
      transaction: t,
    });

    const affectedUserIds = [user.id];
    for (const prior of priorAssignments) {
      if (prior.userId) affectedUserIds.push(prior.userId);
      prior.status = 'INACTIVE';
      prior.effectiveTo = effFrom;
      await prior.save({ transaction: t });
    }

    // 3. Create new DPO responsibility assignment
    const assignment = await OrganizationResponsibilityAssignment.create({
      organizationId,
      employeeId: employee.id,
      userId: user.id,
      responsibility: 'DATA_PROTECTION_OFFICER',
      scopeType: 'ORGANISATION',
      effectiveFrom: effFrom,
      assignedBy: actor?.id || null,
      status: 'ACTIVE',
    }, { transaction: t });

    // 4. Ensure protected DATA_PROTECTION_OFFICER role exists
    const dpoTemplate = template('DATA_PROTECTION_OFFICER');
    const [dpoRole] = await OrganizationRole.findOrCreate({
      where: { organizationId, code: 'DATA_PROTECTION_OFFICER' },
      defaults: {
        name: 'Data Protection Officer',
        templateCode: 'DATA_PROTECTION_OFFICER',
        isProtected: true,
        status: 'ACTIVE',
      },
      transaction: t,
    });

    if (dpoTemplate) {
      for (const permCode of dpoTemplate.permissionCodes) {
        await OrganizationRolePermission.findOrCreate({
          where: { organizationId, roleId: dpoRole.id, permissionCode: permCode },
          transaction: t,
        });
      }
    }

    // Assign protected role to the new DPO user
    await UserRoleAssignment.findOrCreate({
      where: {
        organizationId,
        userId: user.id,
        roleId: dpoRole.id,
        scopeType: 'ORGANISATION',
        status: 'ACTIVE',
      },
      defaults: {
        effectiveFrom: effFrom,
      },
      transaction: t,
    });

    // End DPO role assignment for former DPOs if applicable
    for (const prior of priorAssignments) {
      if (prior.userId && prior.userId !== user.id) {
        await UserRoleAssignment.update(
          { status: 'INACTIVE', effectiveTo: effFrom },
          { where: { organizationId, userId: prior.userId, roleId: dpoRole.id, status: 'ACTIVE' }, transaction: t }
        );
      }
    }

    // 5. Invalidate sessions for old and new DPO users
    await invalidateUserAccess(affectedUserIds, {
      transaction: t,
      reason: 'dpdp.dpo.assigned',
      actor,
    });

    // 6. Update or create DpdpOrganizationProfile
    let [profile] = await DpdpOrganizationProfile.findOrCreate({
      where: { organizationId },
      defaults: {
        dpoName: user.name,
        dpoEmail: user.email,
        complianceStatus: 'IN_PROGRESS',
      },
      transaction: t,
    });
    profile.dpoName = user.name;
    profile.dpoEmail = user.email;
    await profile.save({ transaction: t });

    // 7. Audit log
    await AuditLog.create({
      organizationId,
      actorUserId: actor?.id || null,
      action: 'dpdp.dpo.assign',
      targetType: 'user',
      targetId: String(user.id),
      details: {
        employeeId: employee.id,
        effectiveFrom: effFrom,
        previousDpoUserIds: priorAssignments.map((p) => p.userId).filter(Boolean),
      },
    }, { transaction: t });

    return { assignment, profile };
  };

  if (externalTx) {
    return run(externalTx);
  }
  return sequelize.transaction(run);
}

/**
 * Updates DpdpOrganizationProfile fields (contact info, grievance procedure, retention policy).
 */
async function updateProfile({ organizationId, actor, data }) {
  return sequelize.transaction(async (t) => {
    let [profile] = await DpdpOrganizationProfile.findOrCreate({
      where: { organizationId },
      defaults: { complianceStatus: 'IN_PROGRESS' },
      transaction: t,
    });

    const allowed = ['dpoName', 'dpoEmail', 'dpoPhone', 'dpoAddress', 'grievanceProcedure', 'dataRetentionPolicy'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        profile[key] = data[key];
      }
    }
    await profile.save({ transaction: t });

    await AuditLog.create({
      organizationId,
      actorUserId: actor?.id || null,
      action: 'dpdp.profile.update',
      targetType: 'organization',
      targetId: String(organizationId),
      details: { updatedFields: Object.keys(data).filter((k) => allowed.includes(k)) },
    }, { transaction: t });

    return profile;
  });
}

module.exports = {
  readiness,
  assignDpo,
  updateProfile,
};
