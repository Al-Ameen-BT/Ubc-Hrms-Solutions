'use strict';

/**
 * Generic CRUD router factory for master-data tables.
 *
 * Every route created by this factory requires a valid Bearer token
 * (`authenticate`). Two access patterns are supported:
 *
 *  - `superAdminOnly: true` — the whole resource is SUPER_ADMIN-only
 *    (used for the Organization/tenant table itself).
 *  - `orgFilterField` set (the default, `'organizationId'`) — the resource
 *    is tenant-scoped. SUPER_ADMIN may act on any organization (and may
 *    filter the list by `?organizationId=`); every other role is pinned to
 *    their own `req.user.organizationId` regardless of what the request
 *    body/query claims — list is force-filtered to it, create is
 *    force-stamped with it (any organizationId in the body is overwritten),
 *    and get/update/delete 404 (not 403, to avoid confirming another
 *    tenant's row exists) when the row belongs to a different org.
 *
 * Delete is always a soft delete (flips a status field to an "inactive"
 * value) — master data used by historical transactions is never
 * hard-deleted, consistent with the "never overwrite historical data" rule
 * the rest of the schema follows.
 *
 * @param {import('sequelize').ModelStatic} model
 * @param {object} options
 * @param {string[]} options.fields - allowed keys on create/update (whitelist, avoids mass-assignment of unexpected fields)
 * @param {string} [options.softDeleteField='status'] - column flipped on DELETE
 * @param {string} [options.softDeleteValue='INACTIVE'] - value it's set to
 * @param {string|null} [options.orgFilterField='organizationId'] - column used to scope by tenant; pass null for a resource with no tenant column (only valid together with superAdminOnly)
 * @param {boolean} [options.superAdminOnly=false] - restrict every route on this resource to SUPER_ADMIN
 * @param {string[]} [options.readRoles] - roles allowed to GET (SUPER_ADMIN always allowed). Default: every org role except EMPLOYEE.
 * @param {string[]} [options.writeRoles] - roles allowed to POST/PUT/DELETE (SUPER_ADMIN always allowed). Default: ORG_ADMIN, HR_ADMIN.
 * @param {(req, payload) => Promise<void>} [options.beforeCreate] - may throw an Error with .status to refuse (e.g. licence limit)
 * @param {(req, row, payload) => Promise<void>} [options.beforeUpdate] - same, for updates
 * @param {Object<string, ModelStatic|Function>} [options.refs] - foreign-key fields to verify belong to the
 *   same organisation as the row (e.g. { postCadreId: PostCadre }). A function value gets (id, orgId) and
 *   returns true/false, for references without their own organizationId column (pay stages).
 */
const DEFAULT_READ = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD'];
const DEFAULT_WRITE = ['ORG_ADMIN', 'HR_ADMIN'];

class RefError extends Error { constructor(m) { super(m); this.status = 400; } }

/**
 * Tenant check on references: without this, a bank user could attach an
 * employee to another bank's post or pay scale just by guessing its id.
 */
async function checkRefs(refs, payload, orgId) {
  if (!refs) return;
  for (const [field, target] of Object.entries(refs)) {
    const id = payload[field];
    if (id === undefined || id === null || id === '') continue;
    let ok;
    if (typeof target === 'function' && !target.findByPk) {
      ok = await target(id, orgId);
    } else {
      const ref = await target.findByPk(id);
      ok = !!ref && String(ref.organizationId) === String(orgId);
    }
    if (!ok) throw new RefError(`${field}: no such record in this organisation.`);
  }
}

function errStatus(err, fallback) {
  return err.status || fallback;
}

function crudRouter(model, options) {
  const express = require('express');
  const { authenticate, requireRole } = require('../middleware/auth');
  const router = express.Router();
  const fields = options.fields;
  const softDeleteField = options.softDeleteField || 'status';
  const softDeleteValue = options.softDeleteValue || 'INACTIVE';
  const orgFilterField = options.orgFilterField === undefined ? 'organizationId' : options.orgFilterField;
  const superAdminOnly = !!options.superAdminOnly;

  const readRoles = ['SUPER_ADMIN', ...(options.readRoles || DEFAULT_READ)];
  const writeRoles = ['SUPER_ADMIN', ...(options.writeRoles || DEFAULT_WRITE)];

  router.use(authenticate);
  if (superAdminOnly) {
    router.use(requireRole('SUPER_ADMIN'));
  } else {
    router.use((req, res, next) => {
      const allowed = req.method === 'GET' ? readRoles : writeRoles;
      if (!allowed.includes(req.user.role)) {
        return res.status(403).json({ status: 'error', message: req.method === 'GET' ? 'Your role cannot view this data.' : 'Your role cannot change this data.' });
      }
      next();
    });
  }

  function pick(body) {
    const out = {};
    for (const key of fields) {
      // '' from an empty form field means "no value" — MySQL strict mode
      // rejects '' for INT/DATE columns, so normalise it to NULL here.
      if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key] === '' ? null : body[key];
    }
    return out;
  }

  function isTenantScoped() {
    return !superAdminOnly && orgFilterField && model.rawAttributes[orgFilterField];
  }

  // GET /  — list. Tenant-scoped resources: non-SUPER_ADMIN always see only
  // their own org's rows; SUPER_ADMIN may optionally filter with ?organizationId=.
  router.get('/', async (req, res) => {
    try {
      const where = {};
      if (isTenantScoped()) {
        if (req.user.role === 'SUPER_ADMIN') {
          if (req.query.organizationId) where[orgFilterField] = req.query.organizationId;
        } else {
          where[orgFilterField] = req.user.organizationId;
        }
      }
      const rows = await model.findAll({ where, order: [['id', 'ASC']] });
      res.json({ data: rows });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /:id
  router.get('/:id', async (req, res) => {
    try {
      const row = await model.findByPk(req.params.id);
      if (!row) return res.status(404).json({ status: 'error', message: 'Not found' });
      if (isTenantScoped() && req.user.role !== 'SUPER_ADMIN' && String(row[orgFilterField]) !== String(req.user.organizationId)) {
        return res.status(404).json({ status: 'error', message: 'Not found' });
      }
      res.json({ data: row });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /
  router.post('/', async (req, res) => {
    try {
      const payload = pick(req.body || {});
      if (isTenantScoped() && req.user.role !== 'SUPER_ADMIN') {
        payload[orgFilterField] = req.user.organizationId; // force-stamp own org, ignore any value the client sent
      }
      await checkRefs(options.refs, payload, payload[orgFilterField]);
      if (options.beforeCreate) await options.beforeCreate(req, payload);
      const row = await model.create(payload);
      res.status(201).json({ data: row });
    } catch (err) {
      res.status(errStatus(err, 400)).json({ status: 'error', code: err.code, message: friendly(err) });
    }
  });

  // PUT /:id
  router.put('/:id', async (req, res) => {
    try {
      const row = await model.findByPk(req.params.id);
      if (!row) return res.status(404).json({ status: 'error', message: 'Not found' });
      if (isTenantScoped() && req.user.role !== 'SUPER_ADMIN' && String(row[orgFilterField]) !== String(req.user.organizationId)) {
        return res.status(404).json({ status: 'error', message: 'Not found' });
      }
      const payload = pick(req.body || {});
      if (isTenantScoped() && req.user.role !== 'SUPER_ADMIN') {
        delete payload[orgFilterField]; // can't move a row to another tenant
      }
      await checkRefs(options.refs, payload, row[orgFilterField]);
      if (options.beforeUpdate) await options.beforeUpdate(req, row, payload);
      await row.update(payload);
      res.json({ data: row });
    } catch (err) {
      res.status(errStatus(err, 400)).json({ status: 'error', code: err.code, message: friendly(err) });
    }
  });

  // DELETE /:id — soft delete only
  router.delete('/:id', async (req, res) => {
    try {
      const row = await model.findByPk(req.params.id);
      if (!row) return res.status(404).json({ status: 'error', message: 'Not found' });
      if (isTenantScoped() && req.user.role !== 'SUPER_ADMIN' && String(row[orgFilterField]) !== String(req.user.organizationId)) {
        return res.status(404).json({ status: 'error', message: 'Not found' });
      }
      if (!model.rawAttributes[softDeleteField]) {
        return res.status(400).json({ status: 'error', message: `Model has no ${softDeleteField} field to soft-delete with` });
      }
      await row.update({ [softDeleteField]: softDeleteValue });
      res.json({ data: row, message: `Deactivated (${softDeleteField} = ${softDeleteValue}). Row was not hard-deleted.` });
    } catch (err) {
      res.status(400).json({ status: 'error', message: err.message });
    }
  });

  return router;
}

/** Turns Sequelize validation/unique errors into a sentence a clerk can act on. */
function friendly(err) {
  if (err.name === 'SequelizeUniqueConstraintError') {
    const fields = err.errors ? err.errors.map((e) => e.path).join(', ') : '';
    return `A record with the same ${fields || 'code'} already exists.`;
  }
  if (err.name === 'SequelizeValidationError' && err.errors && err.errors[0]) {
    const e = err.errors[0];
    if (e.type === 'notNull Violation') return `${e.path} is required.`;
    return e.message;
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') return 'A referenced record (post, pay scale, GO…) does not exist.';
  return err.message;
}

module.exports = crudRouter;
