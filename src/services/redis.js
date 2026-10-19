/**
 * Redis integration for the UCB HRMS backend.
 *
 * Responsibilities:
 * 1. Detect REDIS_URL at process start (isRedisConfigured()).
 * 2. Give each of the five rate limiters (login/mfa/reset/setup/api) its
 *    own rate-limit-redis v5 store. v5's constructor ONLY takes
 *    `sendCommand` (a raw command passthrough) and `prefix` — there is no
 *    `client:`/`keyPrefix` option anymore.
 * 3. Deal with the boot race honestly: limiters are created synchronously
 *    at server.js module load, but Redis reachability is only known after
 *    the client connects. getRateStore() therefore returns an ADAPTIVE
 *    store that satisfies the express-rate-limit v7 contract and awaits a
 *    one-shot boot decision (ioredis 'ready' vs 2s timeout) on first use.
 *    Decision 'redis'  → delegate to the real RedisStore.
 *    Decision 'memory' → count locally forever, log the pinned warning.
 *    A runtime Redis outage *after* a healthy boot surfaces as a thrown
 *    error from the delegate, which each limiter's passOnStoreError:true
 *    (set in server.js) converts to "pass through without limiting".
 * 4. probeRedis() pings on demand for the /ready enrichment; never throws.
 *
 * Exported API (used by src/server.js):
 *   isRedisConfigured()   → bool
 *   getRateStore(name)    → adaptive store | null   (never throws)
 *   probeRedis()          → Promise<{ configured, ok, status }>
 */

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;

let redisClient = null;
let decisionPromise = null; // one-shot boot decision shared by all stores

function isRedisConfigured() {
  return Boolean(REDIS_URL);
}

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      lazyConnect: false, // start connecting right away; 'ready' is the verdict
      connectTimeout: 2000,
    });
    // Suppress hot-loop error spam while the client is unreachable.
    redisClient.on('error', () => {});

    decisionPromise = new Promise((resolve) => {
      let done = false;
      const settle = (mode) => {
        if (done) return;
        done = true;
        if (mode === 'memory') {
          console.warn('[redis] unreachable — falling back to in-memory rate stores');
        }
        resolve(mode);
      };
      // 'ready' fires only after the handshake succeeded — commands work.
      redisClient.once('ready', () => settle('redis'));
      const t = setTimeout(() => settle('memory'), 2000);
      if (typeof t.unref === 'function') t.unref();
    });
    if (typeof decisionPromise.unref === 'function') decisionPromise.unref();
  } catch (e) {
    console.warn('[redis] init failed ("%s") — falling back to in-memory rate stores', e.message);
    redisClient = null;
    decisionPromise = null;
  }
}

/**
 * Tenant of getRateStore(): waits for the boot decision, then delegates
 * every express-rate-limit store call to the real RedisStore — or runs a
 * local fixed-window counter when Redis lost the boot race.
 */
class AdaptiveStore {
  constructor(name, RedisStore, client) {
    this.prefix = `hrms:rl:${name}:`;
    this._delegate = new RedisStore({
      sendCommand: (...args) => client.call(...args),
      prefix: this.prefix,
    });
    this._mode = null; // 'redis' | 'memory' once decided
    this._local = new Map(); // key → { count, expiresAt }
    this._windowMs = 60000; // corrected by init() with the limiter's real window
  }

  /* express-rate-limit v7 calls this once at middleware creation. */
  init(options) {
    if (options && Number(options.windowMs) > 0) this._windowMs = Number(options.windowMs);
  }

  async _target() {
    if (this._mode === 'redis') return this._delegate;
    if (this._mode === 'memory') return null;
    this._mode = await decisionPromise;
    return this._mode === 'redis' ? this._delegate : null;
  }

  async increment(key) {
    const t = await this._target();
    if (t) return t.increment(key);
    // local fixed-window fallback
    const now = Date.now();
    let entry = this._local.get(key);
    if (!entry || now >= entry.expiresAt) {
      entry = { count: 0, expiresAt: now + this._windowMs };
      this._local.set(key, entry);
    }
    entry.count += 1;
    return { totalHits: entry.count, resetTime: new Date(entry.expiresAt) };
  }

  async decrement(key) {
    const t = await this._target();
    if (t) return t.decrement(key);
  }

  async resetKey(key) {
    const t = await this._target();
    if (t) await t.resetKey(key);
    else this._local.delete(key);
  }

  async resetAll() {
    const t = await this._target();
    if (t) await t.resetAll();
    else this._local.clear();
  }
}

const stores = new Map(); // name → AdaptiveStore (one per limiter)

/**
 * Returns the limiter's adaptive store, or null whenever Redis is not
 * configured at all (limiters then use express-rate-limit's MemoryStore —
 * `|| undefined` at the call sites). Safe to call repeatedly.
 */
function getRateStore(name) {
  if (!redisClient || !decisionPromise) return null;
  if (stores.has(name)) return stores.get(name);
  try {
    // Lazy require: paid only when REDIS_URL is actually set.
    const { RedisStore } = require('rate-limit-redis');
    const store = new AdaptiveStore(name, RedisStore, redisClient);
    stores.set(name, store);
    return store;
  } catch (e) {
    console.warn('[redis] store creation failed ("%s") — memory store for %s', e.message, name);
    return null;
  }
}

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
