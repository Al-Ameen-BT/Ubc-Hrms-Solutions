/**
 * Redis integration for the UCB HRMS backend.
 *
 * Responsibilities:
 * 1. Detect whether REDIS_URL is set at process start (isRedisConfigured()).
 * 2. Build the rate-limit store with rate-limit-redis v5, whose constructor
 *    accepts ONLY sendCommand (a raw command passthrough) and `prefix`.
 *    There is a DISTINCT prefix per limiter (login/mfa/reset/setup/api):
 *    sharing one bucket would merge every limiter's counts and expiry into
 *    one key per IP.
 * 3. Health-based fallback: one boot-time ping decides whether the store is
 *    wired at all; when Redis is down at boot (or REDIS_URL missing), every
 *    limiter silently uses express-rate-limit's memory store. At runtime a
 *    fresh outage is contained by `passOnStoreError: true` on each limiter
 *    (the caller in src/server.js sets it) so UAT never 500s on a cache outage.
 * 4. probeRedis() pings for the /ready enrichment; never throws.
 *
 * Exported API (used by src/server.js):
 *   isRedisConfigured()          → bool
 *   getRateStore(name)           → RedisStore|null  (never throws)
 *   probeRedis()                 → Promise<{ configured, ok, status }>
 */

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;

let redisClient = null;
let configured = false;
let healthyAtBoot = false;
let bootProbe = null; // promise resolving to boolean

function isRedisConfigured() {
  return Boolean(REDIS_URL);
}

/**
 * One-time ping at boot. Resolves true only if Redis answered PONG.
 */
function startBootProbe() {
  if (!configured) return;
  bootProbe = new Promise(resolve => {
    const t = setTimeout(() => {
      console.warn('[redis] unreachable — falling back to in-memory rate stores');
      resolve(false);
    }, 1500);
    redisClient.ping()
      .then(() => { clearTimeout(t); healthyAtBoot = true; resolve(true); })
      .catch(() => {
        clearTimeout(t);
        console.warn('[redis] unreachable — falling back to in-memory rate stores');
        resolve(false);
      });
  });
}

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Don't let connection churn at boot; we only need one decisive probe.
      connectTimeout: 1500,
    });
    // Suppress hot-loop error spam when nothing is listening yet.
    redisClient.on('error', () => {});
    configured = true;
    startBootProbe();
  } catch (e) {
    console.warn('[redis] init failed ("%s") — falling back to in-memory rate stores', e.message);
    configured = false;
    healthyAtBoot = false;
  }
}

/**
 * Creates (and caches) a RedisStore for one specific limiter.
 *      getRateStore('login') / ('mfa'|'reset'|'setup'|'api')
 * Returns null whenever Redis is not usable right now — callers treat that
 * as "use the memory store". Safe to call repeatedly; one store per name.
 */
function getRateStore(name) {
  if (!healthyAtBoot) return null;
  if (stores.get(name)) return stores.get(name);
  try {
    const { RedisStore } = require('rate-limit-redis');
    const store = new RedisStore({
      // ioredis exposes .call(command, ...args) — exactly what v5 wants.
      sendCommand: (...args) => redisClient.call(...args),
      prefix: `hrms:rl:${name}:`,
    });
    stores.set(name, store);
    return store;
  } catch (e) {
    console.warn('[redis] store creation failed ("%s") — memory store for %s', e.message, name);
    return null;
  }
}
const stores = new Map();

/**
 * Ping-on-demand for /ready. Always resolves (never rejects) with a status:
 *   'ok'            reachable
 *   'degraded'      configured but unreachable
 *   'unconfigured'  no REDIS_URL at all
 */
function probeRedis() {
  if (!redisClient) {
    return Promise.resolve({ configured: false, ok: false, status: 'unconfigured' });
  }
  return redisClient.ping()
    .then(() => ({ configured: true, ok: true, status: 'ok' }))
    .catch(() => ({ configured: true, ok: false, status: 'degraded' }));
}

module.exports = {
  isRedisConfigured,
  getRateStore,
  probeRedis,
};