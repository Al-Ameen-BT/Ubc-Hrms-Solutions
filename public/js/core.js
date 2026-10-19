/* UCB HRMS & Payroll — console core.
 *
 * Plain ES5-style JavaScript, no framework, no build step: files are served
 * as-is. Two entry points share this one page:
 *
 * Two entry points share this one page:
 *   /            platform sign-in (Super Admins), Banihal branding
 *   /o/<CODE>    a bank's own sign-in page, with that bank's name and logo
 *
 * Security notes:
 *  - The JWT lives in sessionStorage, so it dies with the browser tab
 *    rather than persisting on a shared branch machine.
 *  - Every interpolated value goes through H.esc(); innerHTML is never
 *    built from an unescaped server string.
 *  - No inline event handlers, inline <script> or style="" attributes, so
 *    the strict CSP set in src/server.js holds without 'unsafe-inline'.
 */
(function () {
  'use strict';

  var H = window.HRMS = {};
  var API = '/api/v1';

  H.root = document.getElementById('root');

  H.ROLE_LABELS = {
    SUPER_ADMIN: 'Super Admin',
    ORG_ADMIN: 'Organisation Admin',
    HR_ADMIN: 'HR Admin',
    HR_OFFICER: 'HR Officer',
    ACCOUNTS_OFFICER: 'Accounts Officer',
    PAYROLL_OFFICER: 'Payroll Officer',
    APPROVING_AUTHORITY: 'Approving Authority',
    DEPARTMENT_HEAD: 'Department Head',
    EMPLOYEE: 'Employee'
  };
  H.ORG_ROLES = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'EMPLOYEE'];
  // Roles that may see master data (mirrors DEFAULT_READ in crudFactory.js).
  H.STAFF_ROLES = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD'];

  // ------------------------------------------------------------ context
  // Which login page are we on? /o/CODE → a bank; anything else → platform.

  var m = /^\/o\/([A-Za-z0-9_-]{2,32})\/?$/.exec(window.location.pathname);
  H.orgCode = m ? m[1].toUpperCase() : null;
  H.branding = null;   // platform branding (always loaded)
  H.orgCard = null;    // the bank's public card when on /o/CODE

  H.loadContext = function () {
    var url = H.orgCode ? '/public/org/' + encodeURIComponent(H.orgCode) : '/public/branding';
    return fetch(API + url, { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, body: j }; }); })
      .then(function (r) {
        if (H.orgCode) {
          if (r.ok) {
            H.orgCard = r.body.data;
            H.branding = r.body.data.platform;
          } else {
            H.orgCard = { missing: true, code: H.orgCode };
            return fetch(API + '/public/branding').then(function (x) { return x.json(); }).then(function (j) { H.branding = j.data; });
          }
        } else {
          H.branding = r.body.data;
        }
      })
      .catch(function () {
        H.branding = H.branding || { platformName: 'UCB HRMS & Payroll', companyName: 'Banihal Technologies LLP', faviconUrl: '/favicon.svg' };
      })
      .then(H.applyBranding);
  };

  H.applyBranding = function () {
    var b = H.branding || {};
    var link = document.getElementById('favicon');
    if (link && b.faviconUrl) link.href = b.faviconUrl;
    var sess = H.getSession();
    var orgName = (sess && sess.user.organization && sess.user.organization.shortName) ||
      (sess && sess.user.organization && sess.user.organization.name) ||
      (H.orgCard && !H.orgCard.missing && (H.orgCard.shortName || H.orgCard.name));
    document.title = orgName ? orgName + ' · ' + (b.platformName || 'HRMS') : (b.platformName || 'UCB HRMS & Payroll');
  };

  // ------------------------------------------------------------ session

  var KEY = 'ucb.session';
  H.getSession = function () {
    try { var raw = sessionStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  };
  H.setSession = function (s) {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: session lasts this page only */ }
    H._memSession = s;
  };
  H.clearSession = function () {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    H._memSession = null;
  };
  H.user = function () { var s = H.getSession(); return s ? s.user : null; };
  H.role = function () { var u = H.user(); return u ? u.role : null; };
  H.hasRole = function () {
    var r = H.role();
    for (var i = 0; i < arguments.length; i++) if (arguments[i] === r) return true;
    return false;
  };

  /** The sign-in page this user belongs on: '/' for Super Admins, '/o/CODE' for bank users. */
  H.homePathFor = function (user) {
    return user && user.organization ? '/o/' + user.organization.code : '/';
  };

  H.logout = function (msg, kind) {
    var u = H.user();
    H.clearSession();
    var target = u ? H.homePathFor(u) : (H.orgCode ? '/o/' + H.orgCode : '/');
    var here = H.orgCode ? '/o/' + H.orgCode : '/';
    H.flash = msg ? { notice: msg, kind: kind || 'warn' } : null;
    if (target !== here) {
      try { sessionStorage.setItem('ucb.flash', JSON.stringify(H.flash)); } catch (e) { /* ignore */ }
      window.location.href = target + '#/login';
      return;
    }
    H.go('/login', H.flash);
  };

  /** Refreshes the stored user (licence, logo, MFA state) from /auth/me. */
  H.refreshMe = function () {
    return H.api('GET', '/auth/me').then(function (r) {
      var s = H.getSession();
      if (s) { s.user = r.data; H.setSession(s); }
      return r.data;
    });
  };

  // ---------------------------------------------------------------- api

  H.api = function (method, path, body) {
    var s = H.getSession();
    var headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (s && s.token) headers.Authorization = 'Bearer ' + s.token;
    return fetch(API + path, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON error page */ }
          var isAuthCall = /^\/auth\/(login|mfa\/verify-login|forgot-password|reset-password)/.test(path);
          if (res.status === 401 && !isAuthCall) {
            H.logout('Your session has ended. Please sign in again.');
            throw new Error('Session ended');
          }
          if (res.status === 403 && data && /^ORG_(SUSPENDED|LICENSE_EXPIRED|LICENSE_NOT_STARTED)$/.test(data.code || '') && !isAuthCall) {
            // The bank itself was cut off mid-session — nothing else will work.
            H.logout(data.message, 'error');
            throw new Error(data.message);
          }
          if (!res.ok) {
            var err = new Error((data && data.message) || ('Request failed (HTTP ' + res.status + ')'));
            err.status = res.status;
            err.code = data && data.code;
            err.data = data;
            throw err;
          }
          return data;
        });
      });
  };

  // ------------------------------------------------------------ helpers

  H.esc = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  H.roleLabel = function (r) { return H.ROLE_LABELS[r] || r; };
  H.$ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  H.$$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  H.on = function (sel, evt, fn, ctx) { var el = H.$(sel, ctx); if (el) el.addEventListener(evt, fn); return el; };
  H.val = function (sel) { var el = H.$(sel); return el ? el.value.trim() : ''; };

  H.fmtDateTime = function (v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return H.esc(v);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  /** 'YYYY-MM-DD' → '31 Mar 2027' without timezone drift. */
  H.fmtDay = function (v) {
    if (!v) return '—';
    var p = String(v).slice(0, 10).split('-');
    if (p.length !== 3) return H.esc(v);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return +p[2] + ' ' + months[+p[1] - 1] + ' ' + p[0];
  };
  H.money = function (v) {
    if (v === null || v === undefined || v === '') return '—';
    var n = Number(v);
    return isNaN(n) ? H.esc(v) : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };
  H.todayYmd = function () {
    var d = new Date(Date.now() + 5.5 * 3600000);
    return d.toISOString().slice(0, 10);
  };
  H.addDays = function (ymd, days) {
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + days));
    return d.toISOString().slice(0, 10);
  };
  H.addYears = function (ymd, years) {
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0] + years, +p[1] - 1, +p[2]));
    return H.addDays(d.toISOString().slice(0, 10), -1);
  };

  H.badge = function (text, kind) { return '<span class="badge ' + (kind || '') + '">' + H.esc(text) + '</span>'; };
  H.statusBadge = function (s) { return H.badge(s, s === 'ACTIVE' ? 'ok' : (s === 'DRAFT' ? 'warn' : 'off')); };

  H.notice = function (sel, kind, message) {
    var el = H.$(sel);
    if (!el) return;
    el.className = 'notice ' + kind;
    el.textContent = message;
    if (kind === 'error' && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  };
  H.clearNotice = function (sel) { var el = H.$(sel); if (el) { el.className = 'notice'; el.textContent = ''; } };

  H.busy = function (btn, isBusy, text) {
    if (!btn) return;
    if (isBusy) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Working…'; btn.disabled = true; }
    else { if (btn.dataset.label) btn.textContent = btn.dataset.label; btn.disabled = false; }
  };

  H.copyText = function (text, doneEl) {
    var done = function () { if (doneEl) { doneEl.hidden = false; setTimeout(function () { doneEl.hidden = true; }, 2000); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  };

  /** Initials for a text logo mark when no image is uploaded. */
  H.initials = function (name) {
    var words = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) {
      return w && !/^(the|of|and|ltd|limited|bank|co|operative|urban)$/i.test(w);
    });
    var s = words.slice(0, 3).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
    return s || 'UCB';
  };

  // ------------------------------------------------------------- router

  var routes = [];
  H.pendingState = null;

  /**
   * Registers a view.
   * @param {RegExp|string} pattern  '/users' or /^\/employees\/(\d+)$/
   * @param {Function} view  (params[], state) => void
   * @param {object} [opts]  { roles: [...], public: bool }
   */
  H.route = function (pattern, view, opts) {
    routes.push({ pattern: pattern, view: view, opts: opts || {} });
  };

  H.go = function (path, state) {
    H.pendingState = state || null;
    if (('#' + path) === window.location.hash) H.render();
    else window.location.hash = path;
  };

  H.currentPath = function () {
    var h = window.location.hash || '';
    var p = h.charAt(0) === '#' ? h.slice(1) : '/';
    return p.split('?')[0] || '/';
  };
  H.queryParam = function (name) {
    var h = window.location.hash || '';
    var q = h.indexOf('?') >= 0 ? h.slice(h.indexOf('?') + 1) : '';
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      if (decodeURIComponent(kv[0]) === name) return decodeURIComponent(kv.slice(1).join('=') || '');
    }
    return null;
  };

  function match(r, path) {
    if (typeof r.pattern === 'string') return r.pattern === path ? [] : null;
    var mm = r.pattern.exec(path);
    return mm ? mm.slice(1) : null;
  }

  H.defaultPath = function (user) {
    if (!user) return '/login';
    if (user.role === 'SUPER_ADMIN') return '/dashboard';
    if (user.role === 'ORG_ADMIN') return '/dashboard';
    if (H.STAFF_ROLES.indexOf(user.role) >= 0) return '/employees';
    return '/account';
  };

  H.render = function () {
    var state = H.pendingState; H.pendingState = null;
    if (!state && H.flash) { state = H.flash; H.flash = null; }
    var path = H.currentPath();
    var session = H.getSession();

    // Public routes (login, forgot/reset password) work with or without a session.
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (!r.opts.public) continue;
      var p = match(r, path);
      if (p) {
        if (session && r.opts.redirectIfSignedIn) return H.go(H.defaultPath(session.user));
        return r.view(p, state);
      }
    }
    if (!session) return H.go('/login', state);

    // A signed-in user on the wrong entry point is moved to theirs, so a
    // bank's pages always show that bank's branding.
    var here = H.orgCode ? '/o/' + H.orgCode : '/';
    var home = H.homePathFor(session.user);
    if (home.toUpperCase() !== here.toUpperCase()) {
      window.location.href = home + '#' + path;
      return;
    }

    if (session.user.mustChangePassword && path !== '/change-password') {
      return H.go('/change-password', { notice: 'You are signed in with a temporary password. Choose a new password to continue.' });
    }

    for (var j = 0; j < routes.length; j++) {
      var rt = routes[j];
      if (rt.opts.public) continue;
      var params = match(rt, path);
      if (!params) continue;
      if (rt.opts.roles && rt.opts.roles.indexOf(session.user.role) < 0) continue;
      window.scrollTo(0, 0);
      return rt.view(params, state);
    }
    return H.go(H.defaultPath(session.user));
  };

  // -------------------------------------------------------------- shell

  function navLink(href, label, path) {
    var active = (path === href || path.indexOf(href + '/') === 0) ? ' class="active"' : '';
    return '<a href="#' + href + '"' + active + '>' + H.esc(label) + '</a>';
  }

  function navFor(user, path) {
    var r = user.role;
    var out = '';
    var L = function (h, l) { out += navLink(h, l, path); };
    var label = function (t) { out += '<div class="label">' + H.esc(t) + '</div>'; };
    if (r === 'SUPER_ADMIN') {
      label('Platform');
      L('/dashboard', 'Overview'); L('/organisations', 'Organisations'); L('/platform-users', 'Platform users');
      label('Administration');
      L('/settings', 'Settings'); L('/audit', 'Audit log');
    } else {
      if (r === 'ORG_ADMIN') {
        label('Organisation');
        L('/dashboard', 'Overview'); L('/users', 'Users');
      }
      if (H.STAFF_ROLES.indexOf(r) >= 0) {
        label('Establishment');
        L('/employees', 'Employees'); L('/posts', 'Posts & cadres'); L('/pay-scales', 'Pay scales');
        if (r !== 'SUPER_ADMIN' && r !== 'DEPARTMENT_HEAD') { L('/payroll', 'Payroll'); L('/da-revisions', 'DA Arrears'); L('/allowances', 'Allowances'); L('/leave-types', 'Leave Types'); L('/year-end', 'Year-End Process'); }
        label('Rules');
        L('/government-orders', 'GO register'); L('/ksr-rules', 'KSR rules');
      }
      if (r === 'ORG_ADMIN') {
        label('Administration');
        L('/org-settings', 'Settings'); L('/org-profile', 'Organisation Profile'); L('/audit', 'Audit log');
      }
    }
    label('You');
    L('/account', 'My account');
    return out;
  }

  function brandBlock(user) {
    var b = H.branding || {};
    if (user.organization) {
      var o = user.organization;
      var mark = o.logoUrl
        ? '<img class="brand-logo" src="' + H.esc(o.logoUrl) + '" alt="">'
        : '<span class="brand-mark">' + H.esc(H.initials(o.name)) + '</span>';
      return mark + '<div class="brand-text"><strong>' + H.esc(o.shortName || o.name) + '</strong><small>' + H.esc(b.platformName || 'HRMS & Payroll') + '</small></div>';
    }
    var pmark = b.logoUrl
      ? '<img class="brand-logo" src="' + H.esc(b.logoUrl) + '" alt="">'
      : '<span class="brand-mark">' + H.esc(H.initials(b.companyName || 'Banihal')) + '</span>';
    return pmark + '<div class="brand-text"><strong>' + H.esc(b.platformName || 'UCB HRMS & Payroll') + '</strong><small>Platform administration</small></div>';
  }

  /** "Powered by" line with the platform's favicon-type logo — shown on every bank page. */
  H.poweredBy = function () {
    var b = H.branding || {};
    return '<div class="powered">' +
      '<img src="' + H.esc(b.faviconUrl || '/favicon.svg') + '" alt="">' +
      '<span>Powered by ' + H.esc(b.companyName || 'Banihal Technologies LLP') + '</span></div>';
  };

  function licenceBanner(user) {
    var lic = user.organization && user.organization.license;
    if (!lic || lic.daysLeft === null || lic.daysLeft === undefined || lic.daysLeft > 30) return '';
    var msg = lic.daysLeft <= 0
      ? 'This organisation\'s licence expires today.'
      : 'This organisation\'s licence expires in ' + lic.daysLeft + ' day' + (lic.daysLeft === 1 ? '' : 's') + ' (' + H.fmtDay(lic.expiresAt) + ').';
    return '<div class="notice warn licence-banner">' + H.esc(msg) +
      (user.role === 'ORG_ADMIN' ? ' Contact ' + H.esc((H.branding && H.branding.companyName) || 'Banihal Technologies') + ' to renew.' : '') + '</div>';
  }

  /** Renders the signed-in layout around `inner` HTML. */
  H.shell = function (inner) {
    var user = H.user();
    var path = H.currentPath();
    H.root.innerHTML =
      '<div class="shell">' +
        '<header class="topbar">' +
          '<a class="brand" href="#' + H.defaultPath(user) + '">' + brandBlock(user) + '</a>' +
          '<div class="who">' +
            '<div class="meta"><strong>' + H.esc(user.name) + '</strong>' +
              '<span>' + H.esc(H.roleLabel(user.role)) + (user.organization ? ' · ' + H.esc(user.organization.shortName || user.organization.code) : '') + '</span></div>' +
            '<button type="button" class="on-brand sm" id="logout">Sign out</button>' +
          '</div>' +
        '</header>' +
        '<div class="body">' +
          '<nav class="sidebar"><div class="nav-links">' + navFor(user, path) + '</div>' +
            (user.organization ? H.poweredBy() : '') + '</nav>' +
          '<main class="main">' + licenceBanner(user) + inner + '</main>' +
        '</div>' +
      '</div>';
    H.on('#logout', 'click', function () { H.logout('You have been signed out.', 'ok'); });
  };

  /** Standard page header. */
  H.pageHead = function (title, sub, actionsHtml, crumbs) {
    var bc = crumbs ? '<div class="breadcrumb">' + crumbs.map(function (c) {
      return c[1] ? '<a href="#' + c[1] + '">' + H.esc(c[0]) + '</a>' : H.esc(c[0]);
    }).join(' › ') + '</div>' : '';
    return bc + '<div class="page-head"><div><h2>' + H.esc(title) + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      (actionsHtml ? '<div class="btn-row">' + actionsHtml + '</div>' : '') + '</div>';
  };

  H.loading = function () { return '<div class="empty">Loading…</div>'; };
  H.errorBox = function (err) { return '<div class="notice error">' + H.esc(err && err.message ? err.message : err) + '</div>'; };
})();
