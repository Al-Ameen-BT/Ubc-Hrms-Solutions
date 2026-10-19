'use strict';

/**
 * Per-organisation custom domains ("the client points a CNAME at us").
 *
 * A bank may run the console on its own subdomain (e.g. hrms.theirbank.in)
 * instead of the shared /o/<CODE> address. The DNS side is the client's job;
 * this module (a) resolves an incoming Host header to the owning tenant so
 * that domain serves the right bank's login/branding, and (b) checks whether
 * the client's DNS actually points at this application, so onboarding can
 * confirm the connection before the domain is relied on.
 *
 * TLS/termination happens at the reverse proxy in front of the app; nothing
 * here mutates DNS or certificates.
 */

const dns = require('dns').promises;
const { Organization } = require('../models');
const { appBaseUrl } = require('./settings');

/** Lower-case, strip scheme/path/port/trailing dot — a bare hostname. */
function cleanHost(host) {
  return String(host || '').trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '');
}

/**
 * The hostname clients should point their CNAME at — the public host the app
 * is served on. Derived from the existing base-URL resolution (platform
 * setting → APP_BASE_URL → this request's Host), so it matches the links the
 * app already puts in emails.
 */
async function cnameTargetFor(req) {
  const base = await appBaseUrl(req);
  return cleanHost(base) || null;
}

/**
 * True when `host` is the application's own host (or a loopback/localhost
 * name) and must never be claimed as a tenant's custom domain.
 */
async function isReservedHost(host, req) {
  const h = cleanHost(host);
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // bare IPv4
  if (h.includes(':')) return true;                   // bare IPv6
  const target = await cnameTargetFor(req);
  return !!target && h === target;
}

/** Resolve the tenant whose custom domain matches this request Host. */
async function findOrgByDomain(host) {
  const h = cleanHost(host);
  if (!h) return null;
  return Organization.findOne({ where: { customDomain: h } });
}

async function resolveAddresses(host) {
  const out = [];
  for (const fn of ['resolve4', 'resolve6']) {
    try { out.push(...await dns[fn](host)); } catch { /* no records of this family */ }
  }
  return out;
}

/**
 * Check whether `domain` actually points at `expectedHost`, so the client's
 * CNAME step can be confirmed. A CNAME straight to the target is the
 * intended setup; an A/AAAA that matches one of the target's own addresses
 * also counts (a proxied/CDN'd target, or an apex domain that can't CNAME).
 * Always resolves (never throws) with a human-readable `message`.
 */
async function verifyDomain(domain, expectedHost) {
  const d = cleanHost(domain);
  const target = cleanHost(expectedHost);
  if (!d || !target) {
    return { ok: false, method: null, domain: d || null, target: target || null, cname: [], addresses: [], targetAddresses: [], message: 'No domain or target to check.' };
  }

  const result = { domain: d, target, cname: [], addresses: [], targetAddresses: [] };

  try {
    result.cname = await dns.resolveCname(d);
    if (result.cname.some((c) => cleanHost(c) === target)) {
      return { ...result, ok: true, method: 'CNAME', message: `${d} is a CNAME to ${target} — connected.` };
    }
  } catch { /* no CNAME record — fall through to A/AAAA */ }

  const [addresses, targetAddresses] = await Promise.all([
    resolveAddresses(d),
    resolveAddresses(target),
  ]);
  result.addresses = addresses;
  result.targetAddresses = targetAddresses;
  const shared = addresses.filter((a) => targetAddresses.includes(a));
  if (shared.length) {
    return { ...result, ok: true, method: 'A', message: `${d} resolves to ${shared.join(', ')}, the same address as ${target} — connected.` };
  }

  if (result.cname.length) {
    return { ...result, ok: false, method: 'CNAME', message: `${d} is a CNAME to ${result.cname.join(', ')}, not ${target}.` };
  }
  if (!addresses.length) {
    return { ...result, ok: false, method: null, message: `No DNS records found for ${d}. Create a CNAME to ${target}, then try again (DNS can take up to 24 hours to propagate).` };
  }
  return { ...result, ok: false, method: 'A', message: `${d} resolves to ${addresses.join(', ')}, which does not point at ${target}.` };
}

module.exports = { cleanHost, cnameTargetFor, isReservedHost, findOrgByDomain, verifyDomain };
