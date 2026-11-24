'use strict';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'iam-rbac-test-jwt-secret';

const EventEmitter = require('node:events');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
const {
  sequelize, Organization, OrganizationBranch: Branch,
  OrganizationDepartment: Department, Employee, PostCadre, User,
  OrganizationRole: Role, OrganizationRolePermission: RolePermission,
  UserRoleAssignment: Assignment, UserRoleBranch, EmployeeOrganizationAssignment,
} = models;
const secretBox = require('../src/services/secretBox');
const { effectiveAccess, can, scopedWhere, authCache } = require('../src/services/accessControl');
const { requirePermission } = require('../src/middleware/permissions');
const { invalidateUserAccess } = require('../src/services/userAdmin');

let serial = 0;
const at = new Date().toISOString().slice(0, 10);

before(() => sequelize.sync());
after(() => sequelize.close());

beforeEach(async () => {
  await authCache.clear();
});

test('secretBox: DATA_ENCRYPTION_KEY is decoupled from JWT_SECRET and supports fallback decryption', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalDataKey = process.env.DATA_ENCRYPTION_KEY;

  try {
    // 1. Backward compatibility: only JWT_SECRET set
    process.env.JWT_SECRET = 'initial-jwt-secret';
    delete process.env.DATA_ENCRYPTION_KEY;

    const legacyPlain = 'totp-seed-or-smtp-pass';
    const legacyEncrypted = secretBox.encrypt(legacyPlain);
    assert.equal(secretBox.decrypt(legacyEncrypted), legacyPlain);

    // 2. Migration: DATA_ENCRYPTION_KEY is now introduced
    process.env.DATA_ENCRYPTION_KEY = 'new-separate-data-key';

    // Ciphertext created under JWT_SECRET decrypts successfully via fallback
    assert.equal(secretBox.decrypt(legacyEncrypted), legacyPlain);

    // New values are encrypted with DATA_ENCRYPTION_KEY
    const newPlain = 'new-totp-seed';
    const newEncrypted = secretBox.encrypt(newPlain);
    assert.equal(secretBox.decrypt(newEncrypted), newPlain);

    // 3. Safe JWT rotation: changing JWT_SECRET does NOT invalidate secrets encrypted with DATA_ENCRYPTION_KEY
    process.env.JWT_SECRET = 'rotated-jwt-secret-2026';
    assert.equal(secretBox.decrypt(newEncrypted), newPlain);

    // 4. Missing both keys throws descriptive error
    delete process.env.JWT_SECRET;
    delete process.env.DATA_ENCRYPTION_KEY;
    assert.throws(() => secretBox.encrypt('test'), /DATA_ENCRYPTION_KEY or JWT_SECRET is not set/);
    assert.throws(() => secretBox.decrypt(newEncrypted), /DATA_ENCRYPTION_KEY or JWT_SECRET is not set/);
  } finally {
    process.env.JWT_SECRET = originalJwtSecret;
    if (originalDataKey !== undefined) process.env.DATA_ENCRYPTION_KEY = originalDataKey;
    else delete process.env.DATA_ENCRYPTION_KEY;
  }
});

test('authorization caching: effectiveAccess results cached keyed by ${userId}:${accessVersion} with 10-minute TTL', async () => {
  const org = await Organization.create({ code: `CACHETEST${++serial}`, name: 'Cache Bank', accessControlMode: 'PERMISSIONS' });
  const post = await PostCadre.create({ organizationId: org.id, code: `CADRE${serial}`, name: 'Cadre' });
  const branch = await Branch.create({ organizationId: org.id, code: `HO${serial}`, name: 'HO', unitType: 'HEAD_OFFICE' });
  const emp = await Employee.create({ organizationId: org.id, empCode: `E${serial}`, name: 'Emp', doj: '2020-01-01', postCadreId: post.id, branchId: branch.id });
  await EmployeeOrganizationAssignment.create({ organizationId: org.id, employeeId: emp.id, branchId: branch.id, effectiveFrom: at });
  const user = await User.create({ organizationId: org.id, employeeId: emp.id, email: `cacheuser${serial}@test.invalid`, name: 'Cache User', passwordHash: 'unused', role: 'EMPLOYEE', accessVersion: 0 });

  const role = await Role.create({ organizationId: org.id, code: `ROLE${serial}`, name: `Role ${serial}`, templateCode: 'HR_OFFICER' });
  await RolePermission.create({ organizationId: org.id, roleId: role.id, permissionCode: 'people.view' });
  const assignment = await Assignment.create({ organizationId: org.id, userId: user.id, roleId: role.id, scopeType: 'SELECTED_BRANCHES', effectiveFrom: at });
  await UserRoleBranch.create({ organizationId: org.id, userRoleAssignmentId: assignment.id, branchId: branch.id });

  // 1. Initial compute with accessVersion caches result
  const key = `${user.id}:${user.accessVersion}`;
  assert.equal(await authCache.get(key), null);

  const access1 = await effectiveAccess(user.id, at, null, user.accessVersion);
  assert.ok(access1.grants.some(g => g.action === 'people.view'));

  // Verify memory cache holds the entry keyed by `${userId}:${accessVersion}`
  const cached = await authCache.get(key);
  assert.ok(cached, 'Cache must contain entry for key');
  assert.deepEqual(cached.permissionCodes, access1.permissionCodes);

  // Check TTL is roughly 10 minutes (between 590s and 600s)
  const memEntry = authCache.getMemoryCache().get(key);
  assert.ok(memEntry, 'Memory cache entry exists');
  const ttlMs = memEntry.expiresAt - Date.now();
  assert.ok(ttlMs > 590 * 1000 && ttlMs <= 600 * 1000, `Expected ~10min TTL, got ${ttlMs}ms`);

  // 2. Subsequent call returns cached object
  let queryCount = 0;
  const originalQuery = sequelize.query.bind(sequelize);
  sequelize.query = function(...args) { queryCount++; return originalQuery(...args); };

  try {
    const access2 = await effectiveAccess(user.id, at, null, user.accessVersion);
    assert.deepEqual(access2.permissionCodes, access1.permissionCodes);
    assert.equal(queryCount, 0, 'Cached effectiveAccess should execute zero database queries');
  } finally {
    sequelize.query = originalQuery;
  }

  // 3. accessVersion bump (e.g. invalidation) changes key, bypassing stale cache
  await user.increment('accessVersion');
  await user.reload();
  assert.equal(user.accessVersion, 1);

  const newKey = `${user.id}:${user.accessVersion}`;
  assert.equal(await authCache.get(newKey), null, 'New accessVersion key must be a cache miss');

  const access3 = await effectiveAccess(user.id, at, null, user.accessVersion);
  assert.ok(await authCache.get(newKey), 'New accessVersion must be cached');
});

test('authorization caching: handles Redis client with key scoping and graceful fallback on Redis outage', async () => {
  const fakeRedisStore = new Map();
  let failRedis = false;

  const mockRedisClient = {
    status: 'ready',
    get: async key => {
      if (failRedis) throw new Error('ECONNREFUSED simulated Redis failure');
      return fakeRedisStore.get(key) || null;
    },
    set: async (key, val, ex, ttl) => {
      if (failRedis) throw new Error('ECONNREFUSED simulated Redis failure');
      fakeRedisStore.set(key, val);
      return 'OK';
    },
    del: async (...keys) => {
      if (failRedis) throw new Error('ECONNREFUSED simulated Redis failure');
      for (const k of keys) fakeRedisStore.delete(k);
      return keys.length;
    },
    keys: async pattern => {
      if (failRedis) throw new Error('ECONNREFUSED simulated Redis failure');
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return [...fakeRedisStore.keys()].filter(k => regex.test(k));
    },
  };

  authCache.setRedisClient(mockRedisClient);

  try {
    const testKey = '42:1';
    const testData = { userId: 42, permissionCodes: ['audit.view'] };

    // 1. Works with healthy Redis: verify key is scoped under hrms:auth:
    await authCache.set(testKey, testData, 600);
    assert.ok(fakeRedisStore.has('hrms:auth:' + testKey), 'Value should be stored in Redis scoped under hrms:auth:');
    const resultFromRedis = await authCache.get(testKey);
    assert.deepEqual(resultFromRedis, testData);

    // 2. Scoped delAuthCache by userId removes all keys for that user from Redis and memory
    await authCache.set('42:2', { userId: 42, version: 2 }, 600);
    assert.ok(fakeRedisStore.has('hrms:auth:42:2'));
    await authCache.del(42);
    assert.equal(fakeRedisStore.has('hrms:auth:42:1'), false, 'delAuthCache(userId) should remove user keys from Redis');
    assert.equal(fakeRedisStore.has('hrms:auth:42:2'), false, 'delAuthCache(userId) should remove all user keys from Redis');

    // 3. Scoped clearAuthCache removes all hrms:auth:* keys from Redis without touching other keys
    fakeRedisStore.set('hrms:rl:login:127.0.0.1', '5'); // simulated rate limiter key
    await authCache.set('99:0', { userId: 99 }, 600);
    assert.ok(fakeRedisStore.has('hrms:auth:99:0'));
    await authCache.clear();
    assert.equal(fakeRedisStore.has('hrms:auth:99:0'), false, 'clearAuthCache must purge auth keys in Redis');
    assert.equal(fakeRedisStore.has('hrms:rl:login:127.0.0.1'), true, 'clearAuthCache must NOT touch rate limiter keys');

    // 4. Redis outage: gracefully falls back to memory cache without throwing
    await authCache.set(testKey, testData, 600);
    failRedis = true;
    const resultFromFallback = await authCache.get(testKey);
    assert.deepEqual(resultFromFallback, testData, 'Should return data from memory fallback on Redis failure');

    // Writes during outage don't crash
    await authCache.set('43:0', { userId: 43 }, 600);
    assert.deepEqual(await authCache.get('43:0'), { userId: 43 });
  } finally {
    authCache.setRedisClient(null);
  }
});

test('cache invalidation hooks: User record updates invalidate that specific user in authCache', async () => {
  const org = await Organization.create({ code: `HOOKTEST${++serial}`, name: 'Hook Bank', accessControlMode: 'PERMISSIONS' });
  const post = await PostCadre.create({ organizationId: org.id, code: `CADRE${serial}`, name: 'Cadre' });
  const branch = await Branch.create({ organizationId: org.id, code: `HO${serial}`, name: 'HO', unitType: 'HEAD_OFFICE' });
  const emp = await Employee.create({ organizationId: org.id, empCode: `HE${serial}`, name: 'Hook Emp', doj: '2020-01-01', postCadreId: post.id, branchId: branch.id });
  const user = await User.create({ organizationId: org.id, employeeId: emp.id, email: `hookuser${serial}@test.invalid`, name: 'Hook User', passwordHash: 'unused', role: 'EMPLOYEE', accessVersion: 0 });

  // Pre-seed cache
  await authCache.set(`${user.id}:0`, { userId: user.id, accessVersion: 0 });
  assert.ok(await authCache.get(`${user.id}:0`));

  // Update user (which uses instance.id, not instance.userId)
  user.name = 'Updated Hook User';
  await user.save();

  // User update hook should have triggered del(user.id)
  assert.equal(await authCache.get(`${user.id}:0`), null, 'Updating User should invalidate user authCache via instance.id');
});

test('effectiveAccess: historical date does not populate or collide with live user authorization cache', async () => {
  const org = await Organization.create({ code: `DATETEST${++serial}`, name: 'Date Bank', accessControlMode: 'PERMISSIONS' });
  const post = await PostCadre.create({ organizationId: org.id, code: `CADRE${serial}`, name: 'Cadre' });
  const branch = await Branch.create({ organizationId: org.id, code: `HO${serial}`, name: 'HO', unitType: 'HEAD_OFFICE' });
  const emp = await Employee.create({ organizationId: org.id, empCode: `DE${serial}`, name: 'Date Emp', doj: '2020-01-01', postCadreId: post.id, branchId: branch.id });
  const user = await User.create({ organizationId: org.id, employeeId: emp.id, email: `dateuser${serial}@test.invalid`, name: 'Date User', passwordHash: 'unused', role: 'EMPLOYEE', accessVersion: 0 });

  const historicalDate = '2020-05-15';
  await effectiveAccess(user.id, historicalDate, null, user.accessVersion);

  // Live cache key must remain unset
  const liveKey = `${user.id}:${user.accessVersion}`;
  assert.equal(await authCache.get(liveKey), null, 'Historical date query must not populate active authorization cache');
});

test('refactored employeeIds: index-backed join generates clean SQL without multi-layered COUNT(*) = 1', async () => {
  const org = await Organization.create({ code: `JOINTEST${++serial}`, name: 'Join Bank', accessControlMode: 'PERMISSIONS' });
  const post = await PostCadre.create({ organizationId: org.id, code: `CADRE${serial}`, name: 'Cadre' });
  const b1 = await Branch.create({ organizationId: org.id, code: `B1_${serial}`, name: 'Branch 1' });
  const b2 = await Branch.create({ organizationId: org.id, code: `B2_${serial}`, name: 'Branch 2' });
  const d1 = await Department.create({ organizationId: org.id, branchId: b1.id, code: `D1_${serial}`, name: 'Dept 1' });

  const e1 = await Employee.create({ organizationId: org.id, empCode: `JE1_${serial}`, name: 'Emp 1', doj: '2020-01-01', postCadreId: post.id, branchId: b1.id, departmentId: d1.id });
  const e2 = await Employee.create({ organizationId: org.id, empCode: `JE2_${serial}`, name: 'Emp 2', doj: '2020-01-01', postCadreId: post.id, branchId: b2.id });
  await EmployeeOrganizationAssignment.create({ organizationId: org.id, employeeId: e1.id, branchId: b1.id, departmentId: d1.id, effectiveFrom: at });
  await EmployeeOrganizationAssignment.create({ organizationId: org.id, employeeId: e2.id, branchId: b2.id, effectiveFrom: at });

  const fakeAccess = {
    userId: 999,
    organizationId: org.id,
    accessControlMode: 'PERMISSIONS',
    at,
    activeBranchIds: [b1.id, b2.id],
    activeDepartmentIds: [d1.id],
    grants: [
      { action: 'people.view', scope: 'SELECTED_BRANCHES', branchIds: [b1.id], departmentIds: [] },
    ],
  };

  const where = scopedWhere(fakeAccess, 'people.view', 'Employee');
  const matchedEmployees = await Employee.findAll({ where, order: [['id', 'ASC']] });
  assert.equal(matchedEmployees.length, 1);
  assert.equal(matchedEmployees[0].id, e1.id);

  // Check generated SQL representation for absence of COUNT(*) = 1 and presence of index-backed JOIN
  const q = models.sequelize.getQueryInterface().queryGenerator;
  const sqlString = q.selectQuery(Employee.getTableName(), { where });
  assert.equal(sqlString.includes('COUNT(*) = 1'), false, 'SQL must not contain multi-layered COUNT(*) = 1 subqueries');
  assert.ok(sqlString.includes('INNER JOIN'), 'SQL must use index-backed INNER JOIN');
});

test('authorization caching: supports Redis scanStream and scan for non-blocking key eviction', async () => {
  const store = new Map();
  let scanStreamCalled = false;
  let scanCalled = false;

  const mockClientWithScanStream = {
    status: 'ready',
    get: async k => store.get(k) || null,
    set: async (k, v) => { store.set(k, v); return 'OK'; },
    del: async (...ks) => { for (const k of ks) store.delete(k); return ks.length; },
    scanStream: ({ match }) => {
      scanStreamCalled = true;
      const emitter = new EventEmitter();
      process.nextTick(() => {
        const regex = new RegExp('^' + match.replace(/\*/g, '.*') + '$');
        const matched = [...store.keys()].filter(k => regex.test(k));
        emitter.emit('data', matched);
        emitter.emit('end');
      });
      return emitter;
    },
  };

  authCache.setRedisClient(mockClientWithScanStream);
  try {
    await authCache.set('77:1', { ok: true });
    await authCache.set('77:2', { ok: true });
    await authCache.del(77);
    assert.equal(scanStreamCalled, true, 'delAuthCache should invoke scanStream when available');
    assert.equal(await authCache.get('77:1'), null);
  } finally {
    authCache.setRedisClient(null);
  }

  const mockClientWithScan = {
    status: 'ready',
    get: async k => store.get(k) || null,
    set: async (k, v) => { store.set(k, v); return 'OK'; },
    del: async (...ks) => { for (const k of ks) store.delete(k); return ks.length; },
    scan: async (cursor, match, pattern) => {
      scanCalled = true;
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const matched = [...store.keys()].filter(k => regex.test(k));
      return ['0', matched];
    },
  };

  authCache.setRedisClient(mockClientWithScan);
  try {
    await authCache.set('88:1', { ok: true });
    await authCache.clear();
    assert.equal(scanCalled, true, 'clearAuthCache should invoke scan when available');
    assert.equal(await authCache.get('88:1'), null);
  } finally {
    authCache.setRedisClient(null);
  }
});

test('invalidateUserAccess evicts authCache entries for affected user IDs', async () => {
  const org = await Organization.create({ code: `INVALTEST${++serial}`, name: 'Inval Bank', accessControlMode: 'PERMISSIONS' });
  const post = await PostCadre.create({ organizationId: org.id, code: `CADRE${serial}`, name: 'Cadre' });
  const branch = await Branch.create({ organizationId: org.id, code: `HO${serial}`, name: 'HO', unitType: 'HEAD_OFFICE' });
  const emp = await Employee.create({ organizationId: org.id, empCode: `IE${serial}`, name: 'Inval Emp', doj: '2020-01-01', postCadreId: post.id, branchId: branch.id });
  const user = await User.create({ organizationId: org.id, employeeId: emp.id, email: `invaluser${serial}@test.invalid`, name: 'Inval User', passwordHash: 'unused', role: 'EMPLOYEE', accessVersion: 0 });

  await authCache.set(`${user.id}:0`, { userId: user.id, accessVersion: 0 });
  assert.ok(await authCache.get(`${user.id}:0`));

  await invalidateUserAccess([user.id], { reason: 'test.invalidation' });
  assert.equal(await authCache.get(`${user.id}:0`), null, 'invalidateUserAccess must purge user authCache');
});

test('cache invalidation hooks: Organization and Employee updates clear authCache', async () => {
  const org = await Organization.create({ code: `ORGINVAL${++serial}`, name: 'Org Inval Bank', accessControlMode: 'LEGACY' });
  const post = await PostCadre.create({ organizationId: org.id, code: `CADRE${serial}`, name: 'Cadre' });
  const branch = await Branch.create({ organizationId: org.id, code: `HO${serial}`, name: 'HO', unitType: 'HEAD_OFFICE' });
  const emp = await Employee.create({ organizationId: org.id, empCode: `OE${serial}`, name: 'Org Emp', doj: '2020-01-01', postCadreId: post.id, branchId: branch.id });

  await authCache.set('999:0', { dummy: true });
  assert.ok(await authCache.get('999:0'));

  // Updating Organization should clear cache
  org.name = 'Updated Org Inval Bank';
  await org.save();
  assert.equal(await authCache.get('999:0'), null, 'Updating Organization must invalidate authCache');

  await authCache.set('999:0', { dummy: true });
  assert.ok(await authCache.get('999:0'));

  // Updating Employee should clear cache
  emp.name = 'Updated Emp Name';
  await emp.save();
  assert.equal(await authCache.get('999:0'), null, 'Updating Employee must invalidate authCache');
});

test('delAuthCache does not delete keys of users with prefix-matching numeric IDs (e.g. 4 vs 42)', async () => {
  await authCache.set('4:0', { userId: 4 });
  await authCache.set('42:0', { userId: 42 });

  await authCache.del(4);
  assert.equal(await authCache.get('4:0'), null, 'User 4 cache should be deleted');
  assert.deepEqual(await authCache.get('42:0'), { userId: 42 }, 'User 42 cache must NOT be deleted when deleting user 4');
});
