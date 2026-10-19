/**
 * Redis integration for the UCB HRMS backend.
 *
 * Responsibilities:
 * 1. Detect whether REDIS_URL is set at process start (isRedisConfigured()).
 * 2. Attempt to create a RedisStore for express-rate-limit via rate-limit-redis,
 *    returning null on any error so the limiters silently fall back to the
 *    built-in memory store.  This keeps the app from crashing if the package
 *    versions are incompatible in the current environment.
 * 3. Probe Redis once for the /ready endpoint (ping), never throwing.
 *
 * Exported API (used by src/server.js):
 *   isRedisConfigured()    → bool   (true when REDIS_URL is set in env)
 *   getRateStore()       → RedisStore|null  (never throws; null = use memory)
 *   probeRedis()         → { configured, ok, status }   for /ready enrichment
 */

const Redis = require('ioredis');

// REDIS_URL is normally set in the container env, e.g.
//   redis://10.89.0.30:6379
const REDIS_URL = process.env.REDIS_URL;

let redisClient = null;
let configured = false;

// ---------------------------------------------------
// 1. Initialise the client if a URL was given
// ---------------------------------------------------
if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      lazyConnect: true,          // connect on first use, not at import time
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // Silence unhandled-error spam when the URL points at nothing.
    redisClient.on('error', () => {});
    configured = true;
  } catch (e) {
    // ioredis or rate-limit-redis incompatible – keep client null
    console.error('[redis] init error:', e.message);
    redisClient = null;
    configured = false;
  }
} else {
  configured = false;
}

/**
 * Returns true when a REDIS_URL was supplied at process-startup.
 * The actual store creation is best-effort; if it fails the caller should
 * pass `undefined` to express-rate-limit's `store` option and the limiter
 * will use its built-in memory store.
 */
function isRedisConfigured() {
  return configured;
}

/**
 * Best-effort factory for a rate-limit-redis RedisStore.
 * Returns a store instance when Redis is reachable, or null on any error.
 * Calling code must pass the result as `store: getRateStore() || undefined`
 * in the rate-limit options.
 */
function getRateStore() {
  if (!redisClient) {
    return null;
  }
  // Attempt to create a RedisStore; any error (version mismatch, etc.)
  // results in null so the limiter falls back to memory store.
  try {
    // rate-limit-redis may not be installed or may be incompatible;
    // guard against ReferenceError / TypeError gracefully.
    let RedisStore;
    try {
      RedisStore = require('rate-limit-redis').RedisStore;
    } catch (_) {
      return null;
    }
    if (typeof RedisStore !== 'function') {
      return null;
    }
    return new RedisStore({
      client: redisClient,
      keyPrefix: 'hrms:rl:',
    });
  } catch (e) {
    console.error('[redis] store creation error:', e.message);
    return null;
  }
}

/**
 * Probe Redis once and return status info for the /ready endpoint.
 * Returns a Promise that resolves to an object with `configured`, `ok`, and `status`.
 * If Redis is not configured, the promise resolves to `{configured: false, ok: false, status: 'unconfigured'}`.
 * If Redis is configured but unreachable, the promise resolves to `{configured: true, ok: false, status: 'degraded'}`.
 * If Redis is reachable, the promise resolves to `{configured: true, ok: true, status: 'ok'}`.
 */
function probeRedis() {
  if (!redisClient) {
    return { configured: false, ok: false, status: 'unconfigured' };
  }
  return new Promise(resolve => {
    redisClient.ping((err, res) => {
      if (err || res !== 'PONG') {
        resolve({ configured: true, ok: false, status: 'degraded' });
      } else {
        resolve({ configured: true, ok: true, status: 'ok' });
      }
    });
  });
}

module.exports = {
  isRedisConfigured,
  getRateStore,
  probeRedis,
};