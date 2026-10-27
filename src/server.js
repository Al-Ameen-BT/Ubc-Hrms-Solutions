'use strict';

/**
 * Application server for the UCB HRMS/Payroll system.
 *
 * Serves both the JSON API (/api/v1/*) and the web console UI. The console
 * is served from frontend/dist when that build is present, otherwise from the
 * incumbent public/ bundle. Always bind to process.env.PORT.
 */

require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sequelize, User } = require('./models');
const { hashPassword } = require('./services/authService');
const { migrate } = require('./scripts/migrate');
const redis = require('./services/redis');
const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind reverse proxy (Nginx / Cloudflare), so req.ip reflects
// the real client rather than the proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Request correlation ID tracking (Protocol 60)
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

/**
 * Security headers. The Content-Security-Policy is deliberately strict:
 * everything the console needs is served from this origin, so there is no
 * need for 'unsafe-inline' — public/js/app.js uses addEventListener and
 * external CSS rather than inline handlers/styles, which keeps it that way.
 * A development-only allowance for impeccable live mode is included;
 * it is guarded by NODE_ENV and only active in development.
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "http://localhost:8400"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", "http://localhost:8400"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  // HSTS is only meaningful once the domain is HTTPS-only; harmless here
  // and required by the RBI/CERT-In baseline once this holds real data.
  hsts: { maxAge: 15552000, includeSubDomains: true },
  referrerPolicy: { policy: 'same-origin' },
}));

app.use(express.json({ limit: '1mb' }));

/**
 * Brute-force protection on the login endpoint: per IP, counting only
 * FAILED attempts (skipSuccessfulRequests). Counting every sign-in would
 * lock out a whole bank branch — staff there typically share one office
 * NAT address, so 15 people signing in at opening time looks like one IP
 * making 15 attempts. LOGIN_MAX_FAILURES tunes the ceiling (default 20 per
 * 15 minutes).
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_MAX_FAILURES) || 20,
  store: redis.getRateStore('login') || undefined,
  passOnStoreError: true,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many failed sign-in attempts from this network. Please wait 15 minutes and try again.' },
});
app.use('/api/v1/auth/login', loginLimiter);

// Same idea for the 6-digit MFA code checks — both the mid-login challenge
// and setup confirmation — so a code can't be brute-forced either.
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MFA_MAX_FAILURES) || 10,
  store: redis.getRateStore('mfa') || undefined,
  passOnStoreError: true,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many attempts. Please wait 15 minutes and try again.' },
});
app.use('/api/v1/auth/mfa/verify-login', mfaLimiter);
app.use('/api/v1/auth/mfa/confirm', mfaLimiter);

// Password-reset requests send email, so they're capped harder per IP —
// otherwise the form could be used to flood someone's inbox.
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many password reset requests. Please try again in an hour.' },
  store: redis.getRateStore('reset') || undefined,
  passOnStoreError: true,
});
app.use('/api/v1/auth/forgot-password', resetLimiter);
app.use('/api/v1/auth/reset-password', mfaLimiter);

// Wider limiter for the one-time setup endpoints — they're token-gated, but
// a limiter means the token itself can't be brute-forced either.
const setupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, store: redis.getRateStore('setup') || undefined, passOnStoreError: true });
app.use('/admin/setup', (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SETUP) {
    return res.status(403).json({ status: 'error', message: 'Setup endpoints are disabled in production mode.' });
  }
  next();
}, setupLimiter);

// Global API rate limit on all tenant/admin endpoints (Protocol 1: Traffic management)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'API rate limit exceeded. Please retry shortly.' },
  store: redis.getRateStore('api') || undefined,
  passOnStoreError: true,
});
app.use('/api/v1', apiLimiter);

// Master-data CRUD + Service Book + Auth + multi-tenant admin routes.
// /api/v1/auth/login is the only public route under here; every other
// route requires a Bearer token (see middleware/auth.js) and is tenant-scoped.
app.use('/api/v1', apiRoutes);

// ------------------------------------------------------------ web console root
// Serve the built React console (frontend/dist) when it exists, otherwise the
// incumbent public/ bundle. Resolved once at boot.
const fs = require('fs');
const distRoot = path.join(__dirname, '..', 'frontend', 'dist');
const WEB_ROOT = fs.existsSync(path.join(distRoot, 'index.html'))
  ? distRoot
  : path.join(__dirname, '..', 'public');

// ------------------------------------------------------------ branding
// Logos/favicon live in the database (see models/brandAsset.js). Served
// here, outside /api, so <img> and <link rel=icon> can use them directly.
const brand = require('./services/brandAssets');
const { scheduleDailyPurge } = require('./services/auditRetention');
const { findOrgByCode } = require('./routes/public');

app.get(['/assets/platform/favicon', '/favicon.ico'], async (req, res, next) => {
  try {
    const row = await brand.find(null, 'FAVICON');
    // No upload yet: serve the Banihal round favicon directly
    if (!row) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.sendFile(path.join(__dirname, '..', 'public', 'favicon.png'));
    }
    return brand.send(res, row);
  } catch (err) { next(err); }
});

app.get('/assets/platform/logo', async (req, res, next) => {
  try {
    const row = await brand.find(null, 'LOGO');
    if (!row) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.sendFile(path.join(__dirname, '..', 'public', 'banihal-round.png'));
    }
    return brand.send(res, row);
  } catch (err) { next(err); }
});

app.get('/assets/org/:code/logo', async (req, res, next) => {
  try {
    const org = await findOrgByCode(req.params.code);
    const row = org && await brand.find(org.id, 'LOGO');
    if (!row) return res.status(404).end();
    return brand.send(res, row);
  } catch (err) { next(err); }
});

app.get('/assets/org/:code/favicon', async (req, res, next) => {
  try {
    const org = await findOrgByCode(req.params.code);
    if (!org) return res.status(404).end();
    const favRow = await brand.find(org.id, 'FAVICON');
    if (favRow) return brand.send(res, favRow);

    // Fallback to the organisation's logo if uploaded
    const logoRow = await brand.find(org.id, 'LOGO');
    if (logoRow) return brand.send(res, logoRow);

    // Default to platform round favicon
    res.set('Cache-Control', 'public, max-age=300');
    return res.sendFile(path.join(__dirname, '..', 'public', 'favicon.png'));
  } catch (err) { next(err); }
});

// Board/management member headshots (Organisation Profile, task 75) — public
// like the logo above rather than behind the org-settings router's own
// authenticate+requireRole('ORG_ADMIN') middleware, because a plain <img>
// tag can't carry an Authorization header, and these photos are meant to
// appear on public-facing documents anyway (same reasoning as the logo).
app.get('/assets/org/:code/board/:memberId/photo', async (req, res, next) => {
  try {
    const org = await findOrgByCode(req.params.code);
    if (!org) return res.status(404).end();
    const { OrganizationBoardMember } = require('./models');
    const row = await OrganizationBoardMember.findOne({ where: { id: req.params.memberId, organizationId: org.id } });
    if (!row || !row.photoData) return res.status(404).end();
    res.set({
      'Content-Type': row.photoMimeType,
      'Content-Length': String(row.photoSizeBytes || row.photoData.length),
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.end(Buffer.from(row.photoData));
  } catch (err) { next(err); }
});

// Each bank's own sign-in page: /o/<CODE>. Same single-page console; the
// script reads the code from the path and brands/scopes the login to it.
app.get(['/o/:code', '/o/:code/'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});

// Web console UI. The React console builds to frontend/dist; when that build
// is present it is served in preference to the incumbent public/ bundle, so
// deploying the rebuild is "run the build", not "delete files". Both are
// plain static assets — the JSON API and its middleware are untouched.
app.use(express.static(WEB_ROOT, {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
}));

// Liveness probe (Protocol 56/57): confirms the process is alive.
app.get(['/health', '/healthz'], (req, res) => {
  res.json({ status: 'ok', service: 'ucb-hrms-payroll', env: process.env.NODE_ENV || 'development' });
});

// Readiness probe (Protocol 56/57): confirms the database connection is healthy.
app.get(['/health/db', '/ready'], async (req, res) => {
  try {
    await sequelize.authenticate();
    const redisStatus = await redis.probeRedis();
    const body = {
      status: 'ok',
      dialect: sequelize.getDialect(),
      redis: redisStatus.status,
    };
    res.json(body);
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

/**
 * One-time, token-protected table setup — for hosting setups where there's
 * no shell access into the same environment the app actually runs in, so
 * `npm run db:init` can't be run directly. Non-destructive: only creates
 * tables that don't exist yet, never drops or alters existing ones (same as
 * db:init).
 *
 * Requires a SETUP_TOKEN environment variable to be set to a random value
 * before this will do anything. Remove the SETUP_TOKEN env var (and
 * redeploy) once you've used this, so the endpoint locks itself out again.
 */
app.get('/admin/setup/init-db', async (req, res) => {
  const provided = req.query.token || req.headers['x-setup-token'];
  if (!process.env.SETUP_TOKEN) {
    return res.status(403).json({ status: 'error', message: 'SETUP_TOKEN is not set — this endpoint is disabled.' });
  }
  if (provided !== process.env.SETUP_TOKEN) {
    return res.status(403).json({ status: 'error', message: 'Invalid or missing token.' });
  }
  try {
    await sequelize.sync(); // no force, no alter — additive only, same as npm run db:init
    const added = await migrate(); // adds any columns a later slice introduced to an already-existing table
    res.json({
      status: 'ok',
      message: 'Tables created (any that already existed were left untouched). Now remove the SETUP_TOKEN environment variable and redeploy to disable this endpoint.',
      columnsAdded: added,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * One-time, token-protected bootstrap for the very first SUPER_ADMIN
 * account. There is no self-service signup anywhere in this system — every
 * other user is created by a SUPER_ADMIN (org onboarding) or an ORG_ADMIN
 * (their own org's users) through the authenticated API. This endpoint is
 * the one deliberate exception, for the chicken-and-egg problem of creating
 * the first login on a fresh deployment with no shell access.
 *
 * Requires SETUP_TOKEN (same env var as /admin/setup/init-db — one shared
 * "operator setup mode" switch) plus SUPER_ADMIN_EMAIL and
 * SUPER_ADMIN_PASSWORD to already be set. Refuses to run if a SUPER_ADMIN
 * already exists. Remove SETUP_TOKEN (and redeploy) once you've used this.
 */
app.get('/admin/setup/bootstrap-super-admin', async (req, res) => {
  const provided = req.query.token || req.headers['x-setup-token'];
  if (!process.env.SETUP_TOKEN) {
    return res.status(403).json({ status: 'error', message: 'SETUP_TOKEN is not set — this endpoint is disabled.' });
  }
  if (provided !== process.env.SETUP_TOKEN) {
    return res.status(403).json({ status: 'error', message: 'Invalid or missing token.' });
  }
  if (!process.env.SUPER_ADMIN_EMAIL || !process.env.SUPER_ADMIN_PASSWORD) {
    return res.status(400).json({ status: 'error', message: 'Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars first.' });
  }
  try {
    const existing = await User.findOne({ where: { role: 'SUPER_ADMIN' } });
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'A SUPER_ADMIN already exists. This endpoint refuses to create another.' });
    }
    const user = await User.create({
      organizationId: null,
      email: String(process.env.SUPER_ADMIN_EMAIL).toLowerCase().trim(),
      name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(process.env.SUPER_ADMIN_PASSWORD),
      mustChangePassword: true,
      status: 'ACTIVE',
    });
    res.json({
      status: 'ok',
      message: 'SUPER_ADMIN created. Now remove SETUP_TOKEN (and SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD, optional) and redeploy to disable this endpoint.',
      data: { id: user.id, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

/**
 * Break-glass: clears MFA on the (first) SUPER_ADMIN account. A Super Admin
 * has no admin above them in-app to reset their MFA if they lose their
 * authenticator device — Org Admins and their users can be recovered by
 * their Super Admin or Org Admin via "Reset MFA" in the console, but the
 * platform's own Super Admin needs an equivalent outside the app. Same
 * token-gated pattern as the other /admin/setup/* endpoints: turn
 * SETUP_TOKEN on temporarily, hit this once, turn it back off.
 */
app.get('/admin/setup/reset-super-admin-mfa', async (req, res) => {
  const provided = req.query.token || req.headers['x-setup-token'];
  if (!process.env.SETUP_TOKEN) {
    return res.status(403).json({ status: 'error', message: 'SETUP_TOKEN is not set — this endpoint is disabled.' });
  }
  if (provided !== process.env.SETUP_TOKEN) {
    return res.status(403).json({ status: 'error', message: 'Invalid or missing token.' });
  }
  try {
    const user = await User.findOne({ where: { role: 'SUPER_ADMIN' }, order: [['id', 'ASC']] });
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'No SUPER_ADMIN account exists yet.' });
    }
    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaEnrolledAt = null;
    await user.save();
    res.json({
      status: 'ok',
      message: `MFA cleared for ${user.email}. They can sign in with just their password and re-enrol MFA from My account. Now remove SETUP_TOKEN and redeploy.`,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// API index. The web console lives at '/' (served statically above); this
// is the machine-readable route listing that used to sit there.
app.get('/api', (req, res) => {
  res.json({
    service: 'UCB HRMS & Payroll',
    ui: '/',
    endpoints: {
      health: ['/health', '/health/db'],
      public: ['/api/v1/public/branding', '/api/v1/public/org/:code', '/o/:code (bank login page)'],
      auth: [
        'POST /api/v1/auth/login {email,password,orgCode?}', 'POST /api/v1/auth/mfa/verify-login', 'GET /api/v1/auth/me',
        'POST /api/v1/auth/change-password', 'POST /api/v1/auth/forgot-password', 'POST /api/v1/auth/reset-password',
        'GET /api/v1/auth/mfa/setup', 'POST /api/v1/auth/mfa/confirm', 'POST /api/v1/auth/mfa/disable',
      ],
      superAdmin: [
        '/api/v1/admin/dashboard', '/api/v1/admin/organizations[/:id]', '/api/v1/admin/organizations/:id/admin-users',
        '/api/v1/admin/organizations/:id/logo', '/api/v1/admin/platform-users[/:id]', '/api/v1/admin/settings',
        '/api/v1/admin/settings/{logo,favicon,smtp}', '/api/v1/admin/settings/smtp/test', '/api/v1/admin/audit',
      ],
      orgAdmin: ['/api/v1/org/settings', '/api/v1/org/settings/{logo,smtp}', '/api/v1/org/settings/smtp/test', '/api/v1/org/audit', '/api/v1/organizations/:orgId/users[/:id]'],
      masterData: [
        '/api/v1/post-cadres', '/api/v1/government-orders', '/api/v1/ksr-rules', '/api/v1/pay-revisions',
        '/api/v1/pay-scales', '/api/v1/pay-scales/:id/stages', '/api/v1/employees', '/api/v1/employees/:id/service-book',
      ],
      assets: ['/assets/platform/logo', '/assets/platform/favicon', '/assets/org/:code/logo'],
    },
  });
});

// Unmatched API paths return JSON, not the HTML console — otherwise a typo
// in a client call comes back as a 200 page and looks like a success.
app.use('/api', (req, res) => {
  res.status(404).json({ status: 'error', message: `No such API route: ${req.method} ${req.originalUrl}` });
});

// Last-resort error handler: JSON for API calls, never a stack trace to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ status: 'error', message: 'Upload is too large.' });
  }
  res.status(err.status || 500).json({ status: 'error', message: err.status ? err.message : 'Internal error' });
});

/**
 * Schema upgrade on startup: create any missing tables and add any missing
 * columns before serving requests, so a new deploy never runs against an
 * older database (the cause of "Unknown column ..." errors). Additive only —
 * the same non-destructive steps as db:init / /admin/setup/init-db; it never
 * drops or alters existing columns. Set AUTO_MIGRATE=false to turn it off
 * (e.g. on production, if schema changes must be applied by hand).
 */
async function prepareDatabase() {
  if (String(process.env.AUTO_MIGRATE).toLowerCase() === 'false') return;
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    const added = await migrate();
    console.log(added.length ? `Schema upgraded — added: ${added.join(', ')}` : 'Schema up to date.');
  } catch (err) {
    // Still start, so /ready can report the problem instead of the site being simply down.
    console.error(`*** Schema check failed: ${err.message}`);
  }
}

function enforceProductionGuards() {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET || '';
  if (isProd) {
    if (!secret || secret.length < 32 || secret.includes('local-test-jwt-secret')) {
      console.error('\n*** CRITICAL SECURITY FAILURE: In production (NODE_ENV=production), JWT_SECRET must be configured with at least 32 cryptographically random characters.');
      process.exit(1);
    }
  } else if (!secret) {
    console.warn(
      '\n*** WARNING: JWT_SECRET is not set. Sign-in will fail until it is.\n' +
      '    Set it in the environment (see .env.example) and restart.\n'
    );
  }
  if (process.env.SETUP_TOKEN && isProd && !process.env.ALLOW_PROD_SETUP) {
    console.warn('*** SECURITY WARNING: SETUP_TOKEN is present in production environment. Setup routes are disabled unless ALLOW_PROD_SETUP is set.');
  }
}

enforceProductionGuards();

prepareDatabase().then(() => app.listen(PORT, () => {
  console.log(`ucb-hrms-payroll listening on port ${PORT} (dialect: ${sequelize.getDialect()})`);
  console.log(`web console root: ${WEB_ROOT}`);
  scheduleDailyPurge();
}));

module.exports = app;
