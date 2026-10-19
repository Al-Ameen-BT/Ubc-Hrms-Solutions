/* Shared UI building blocks: form fields, the one-time password panel, the
 * logo uploader, the SMTP settings form, the audit table and tabs. Used by
 * both the platform (Super Admin) and the bank (Org Admin) screens so the
 * two behave identically. */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;

  // ---------------------------------------------------------- form bits

  /** <div class="field"> wrapper. `control` is raw HTML (already escaped). */
  H.field = function (id, label, control, hint, extraClass) {
    return '<div class="field' + (extraClass ? ' ' + extraClass : '') + '">' +
      (label ? '<label for="' + esc(id) + '">' + esc(label) + '</label>' : '') + control +
      (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  };

  H.input = function (id, type, value, attrs) {
    return '<input type="' + (type || 'text') + '" id="' + esc(id) + '" value="' + esc(value === null || value === undefined ? '' : value) + '"' + (attrs ? ' ' + attrs : '') + '>';
  };

  H.textarea = function (id, value, attrs) {
    return '<textarea id="' + esc(id) + '"' + (attrs ? ' ' + attrs : '') + '>' + esc(value || '') + '</textarea>';
  };

  /** options: [[value, label], ...] */
  H.select = function (id, options, value, attrs) {
    return '<select id="' + esc(id) + '"' + (attrs ? ' ' + attrs : '') + '>' + options.map(function (o) {
      var v = o[0] === null || o[0] === undefined ? '' : String(o[0]);
      return '<option value="' + esc(v) + '"' + (String(value === null || value === undefined ? '' : value) === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  };

  H.checkbox = function (id, label, checked, hint) {
    return '<div class="field check"><label class="check-label"><input type="checkbox" id="' + esc(id) + '"' + (checked ? ' checked' : '') + '> ' + esc(label) + '</label>' +
      (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  };

  H.tabs = function (items, active) {
    return '<div class="tabs" role="tablist">' + items.map(function (t) {
      return '<a href="#' + t[0] + '" class="tab' + (t[0] === active ? ' active' : '') + '" role="tab">' + esc(t[1]) + '</a>';
    }).join('') + '</div>';
  };

  H.statTile = function (label, value, sub, kind) {
    return '<div class="stat' + (kind ? ' ' + kind : '') + '"><div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value">' + esc(value) + '</div>' + (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
  };

  /** "3 / 5" with a warn/off badge colour as it approaches the limit. */
  H.usageText = function (used, max) {
    if (max === null || max === undefined) return esc(used) + ' <span class="muted">/ unlimited</span>';
    var kind = used >= max ? 'off' : (used >= max * 0.8 ? 'warn' : 'ok');
    return '<span class="badge ' + kind + '">' + esc(used) + ' / ' + esc(max) + '</span>';
  };

  /** Licence state as a badge, with days-left when relevant. */
  H.licenceBadge = function (lic, status) {
    if (status && status !== 'ACTIVE') return H.badge('Suspended', 'off');
    if (!lic) return H.badge('—');
    if (lic.state === 'ORG_LICENSE_EXPIRED') return H.badge('Expired', 'off');
    if (lic.state === 'ORG_LICENSE_NOT_STARTED') return H.badge('Starts ' + H.fmtDay(lic.startsAt), 'warn');
    if (lic.state === 'ORG_SUSPENDED') return H.badge('Suspended', 'off');
    if (lic.daysLeft !== null && lic.daysLeft !== undefined && lic.daysLeft <= 30) return H.badge(lic.daysLeft + ' days left', 'warn');
    return H.badge('Active', 'ok');
  };

  // ------------------------------------------------ one-time credentials

  /**
   * Panel for a freshly issued temporary password. It is bcrypt-hashed on
   * the server and can never be shown again — only re-issued.
   */
  H.credPanel = function (email, tempPassword, emailResult) {
    var mailLine = '';
    if (emailResult && emailResult.requested) {
      mailLine = emailResult.sent
        ? '<p class="mail-ok">A welcome email with these details was sent to ' + esc(email) + '.</p>'
        : '<p class="mail-fail">The welcome email could not be sent' + (emailResult.error ? ' (' + esc(emailResult.error) + ')' : '') + ' — give the password to the user yourself.</p>';
    }
    return '<div class="cred">' +
      '<h4>Temporary password — shown once</h4>' +
      '<p>Give this to <strong>' + esc(email) + '</strong> through a channel you trust. It is stored only in hashed form and cannot be shown again — ' +
      'if it is lost, use <em>Reset password</em> to issue a new one. They must change it at first sign-in.</p>' +
      mailLine +
      '<div class="pair"><code id="temp-pw">' + esc(tempPassword) + '</code>' +
      '<button type="button" class="secondary sm" id="copy-pw">Copy</button><span class="small muted" id="copy-done" hidden>Copied</span></div>' +
      '</div>';
  };
  H.wireCopy = function () {
    H.on('#copy-pw', 'click', function () { H.copyText(H.$('#temp-pw').textContent, H.$('#copy-done')); });
  };

  // ----------------------------------------------------- logo uploader

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read the file.')); };
      r.readAsDataURL(file);
    });
  }
  H.readAsDataUrl = readAsDataUrl;

  /** Fetches a stored file with the auth header (a plain <a href> can't send one) and opens it in a new tab. */
  H.openAuthedFile = function (apiPath) {
    var s = H.getSession();
    return fetch('/api/v1' + apiPath, { headers: { Authorization: 'Bearer ' + (s && s.token) } })
      .then(function (r) { if (!r.ok) throw new Error('Could not load the file.'); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      });
  };

  /** Fetches a stored/generated file with the auth header and triggers a real browser download (not just an open-in-tab), e.g. a PDF payslip or a CSV export. */
  H.downloadFile = function (apiPath, filename, noticeSel) {
    var s = H.getSession();
    return fetch('/api/v1' + apiPath, { headers: { Authorization: 'Bearer ' + (s && s.token) } })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return null; }).then(function (j) { throw new Error((j && j.message) || 'Download failed.'); });
        return r.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      })
      .catch(function (err) { if (noticeSel) H.notice(noticeSel, 'error', err.message); else throw err; });
  };

  /**
   * opts: { el, id, title, description, currentUrl, limitBytes, allowIco,
   *         uploadPath, removePath, previewClass, onChange(infoOrNull) }
   */
  H.logoUploader = function (opts) {
    var id = opts.id;
    var accept = 'image/png,image/jpeg,image/webp' + (opts.allowIco ? ',image/x-icon,.ico' : '');
    function draw(url) {
      opts.el.innerHTML =
        '<div class="card"><h3>' + esc(opts.title) + '</h3><div class="card-body">' +
          (opts.description ? '<p class="small muted">' + opts.description + '</p>' : '') +
          '<div class="notice" id="' + id + '-notice"></div>' +
          '<div class="logo-row">' +
            '<div class="logo-preview ' + (opts.previewClass || '') + '">' +
              (url ? '<img src="' + esc(url) + '" alt="Current image">' : '<span class="muted small">No image uploaded</span>') +
            '</div>' +
            '<div class="logo-actions">' +
              '<input type="file" id="' + id + '-file" accept="' + accept + '">' +
              '<div class="hint">PNG, JPEG or WebP' + (opts.allowIco ? ' (or ICO)' : '') + ', up to ' + Math.round(opts.limitBytes / 1024) + ' KB. SVG is not accepted.</div>' +
              '<div class="btn-row spaced"><button type="button" id="' + id + '-upload">Upload</button>' +
              (url ? '<button type="button" class="danger" id="' + id + '-remove">Remove</button>' : '') + '</div>' +
            '</div>' +
          '</div>' +
        '</div></div>';

      H.on('#' + id + '-upload', 'click', function () {
        var input = H.$('#' + id + '-file');
        var file = input.files && input.files[0];
        if (!file) return H.notice('#' + id + '-notice', 'error', 'Choose an image file first.');
        if (file.size > opts.limitBytes) return H.notice('#' + id + '-notice', 'error', 'That file is ' + Math.ceil(file.size / 1024) + ' KB — the limit is ' + Math.round(opts.limitBytes / 1024) + ' KB.');
        var btn = this;
        H.busy(btn, true, 'Uploading…');
        readAsDataUrl(file).then(function (dataUrl) {
          return H.api('PUT', opts.uploadPath, { dataUrl: dataUrl });
        }).then(function (res) {
          var base = opts.currentUrlBase || opts.currentUrl.split('?')[0];
          var newUrl = base + '?v=' + res.data.version;
          opts.currentUrl = newUrl;
          draw(newUrl);
          H.notice('#' + id + '-notice', 'ok', 'Uploaded.');
          if (opts.onChange) opts.onChange(res.data);
        }).catch(function (err) {
          H.busy(btn, false);
          H.notice('#' + id + '-notice', 'error', err.message);
        });
      });
      H.on('#' + id + '-remove', 'click', function () {
        if (!window.confirm('Remove this image?')) return;
        var btn = this;
        H.busy(btn, true, 'Removing…');
        H.api('DELETE', opts.removePath).then(function () {
          draw(null);
          H.notice('#' + id + '-notice', 'ok', 'Removed.');
          if (opts.onChange) opts.onChange(null);
        }).catch(function (err) { H.busy(btn, false); H.notice('#' + id + '-notice', 'error', err.message); });
      });
    }
    draw(opts.currentUrl && opts.hasImage ? opts.currentUrl : null);
  };

  // ------------------------------------------------------- SMTP form

  /**
   * opts: { el, basePath: '/admin/settings/smtp' | '/org/settings/smtp',
   *         data: publicView, intro: html }
   */
  H.smtpForm = function (opts) {
    function draw(d) {
      var last = '';
      if (d.lastTestAt) {
        last = '<div class="smtp-last ' + (d.lastTestOk ? 'ok' : 'fail') + '">Last test ' + H.fmtDateTime(d.lastTestAt) + ': ' +
          (d.lastTestOk ? 'succeeded' : 'failed') + (d.lastTestMessage ? ' — ' + esc(d.lastTestMessage) : '') + '</div>';
      }
      opts.el.innerHTML =
        '<div class="card"><h3>Outgoing email (SMTP)</h3><div class="card-body">' +
          (opts.intro ? '<p class="small muted">' + opts.intro + '</p>' : '') +
          '<div class="notice" id="smtp-notice"></div>' +
          '<form id="smtp-form" autocomplete="off">' +
            H.checkbox('smtp-enabled', 'Send email through this server', d.enabled) +
            '<div class="grid-2">' +
              H.field('smtp-host', 'SMTP server', H.input('smtp-host', 'text', d.host, 'placeholder="smtp.hostinger.com"')) +
              H.field('smtp-port', 'Port', H.input('smtp-port', 'number', d.port, 'min="1" max="65535"')) +
              H.field('smtp-security', 'Security', H.select('smtp-security', [['STARTTLS', 'STARTTLS (usually port 587)'], ['SSL', 'SSL/TLS (usually port 465)'], ['NONE', 'None — test servers only']], d.security)) +
              H.field('smtp-user', 'Username', H.input('smtp-user', 'text', d.username, 'autocomplete="off"')) +
              H.field('smtp-pass', 'Password', H.input('smtp-pass', 'password', '', 'autocomplete="new-password" placeholder="' + (d.hasPassword ? 'Saved — leave blank to keep' : '') + '"'),
                d.hasPassword ? 'A password is saved (encrypted). Type a new one only to replace it.' : 'Stored encrypted; never shown again after saving.') +
              H.field('smtp-from-name', 'From name', H.input('smtp-from-name', 'text', d.fromName, 'placeholder="HR Department"')) +
              H.field('smtp-from', 'From address', H.input('smtp-from', 'email', d.fromEmail, 'placeholder="noreply@yourbank.in"')) +
              H.field('smtp-reply', 'Reply-to (optional)', H.input('smtp-reply', 'email', d.replyTo)) +
            '</div>' +
            (d.hasPassword ? H.checkbox('smtp-clear-pass', 'Remove the saved password', false) : '') +
            '<div class="btn-row"><button type="submit" id="smtp-save">Save email settings</button></div>' +
          '</form>' +
          '<hr class="sep">' +
          '<h4 class="sub-h">Send a test message</h4>' +
          '<p class="small muted">Uses the saved settings above. Save first if you changed anything.</p>' +
          '<div class="inline-form">' + H.input('smtp-test-to', 'email', (H.user() || {}).email, 'aria-label="Test recipient"') +
          '<button type="button" class="secondary" id="smtp-test">Send test</button></div>' +
          last +
        '</div></div>';

      H.on('#smtp-form', 'submit', function (e) {
        e.preventDefault();
        var btn = H.$('#smtp-save');
        var body = {
          enabled: H.$('#smtp-enabled').checked,
          host: H.val('#smtp-host'),
          port: H.val('#smtp-port'),
          security: H.val('#smtp-security'),
          username: H.val('#smtp-user'),
          fromName: H.val('#smtp-from-name'),
          fromEmail: H.val('#smtp-from'),
          replyTo: H.val('#smtp-reply')
        };
        var pw = H.$('#smtp-pass').value;
        if (pw) body.password = pw;
        if (H.$('#smtp-clear-pass') && H.$('#smtp-clear-pass').checked) body.clearPassword = true;
        H.busy(btn, true, 'Saving…');
        H.api('PUT', opts.basePath, body).then(function (res) {
          draw(res.data);
          H.notice('#smtp-notice', 'ok', 'Email settings saved.');
        }).catch(function (err) { H.busy(btn, false); H.notice('#smtp-notice', 'error', err.message); });
      });

      H.on('#smtp-test', 'click', function () {
        var btn = this;
        var to = H.val('#smtp-test-to');
        if (!to) return H.notice('#smtp-notice', 'error', 'Enter a recipient for the test message.');
        H.busy(btn, true, 'Sending…');
        H.api('POST', opts.basePath + '/test', { to: to }).then(function (res) {
          draw(res.data);
          H.notice('#smtp-notice', 'ok', res.message);
        }).catch(function (err) {
          if (err.data && err.data.data) draw(err.data.data);
          else H.busy(btn, false);
          H.notice('#smtp-notice', 'error', 'Test failed: ' + err.message);
        });
      });
    }
    draw(opts.data);
  };

  // ------------------------------------------------------- audit table

  var ACTION_LABELS = {
    'auth.login': 'Signed in',
    'auth.login.failed': 'Sign-in failed',
    'auth.login.password_ok_mfa_pending': 'Password accepted, awaiting MFA code',
    'auth.password.change': 'Changed own password',
    'auth.mfa.enable': 'Turned on two-factor authentication',
    'auth.mfa.disable': 'Turned off two-factor authentication',
    'auth.reset.requested': 'Requested password reset email',
    'auth.reset.requested_unknown': 'Password reset requested for unknown email',
    'auth.reset.completed': 'Reset password via email link',
    'user.create': 'Created user',
    'user.update': 'Updated user',
    'user.deactivate': 'Deactivated user',
    'user.reactivate': 'Reactivated user',
    'user.password.reset': 'Issued temporary password',
    'user.mfa.reset': 'Reset user\'s two-factor authentication',
    'org.create': 'Onboarded organisation',
    'org.profile.update': 'Updated organisation profile',
    'org.license.update': 'Changed licence',
    'org.suspend': 'Suspended organisation',
    'org.reactivate': 'Reactivated organisation',
    'org.logo.update': 'Uploaded organisation logo',
    'org.logo.remove': 'Removed organisation logo',
    'org.smtp.update': 'Changed organisation email settings',
    'org.smtp.test': 'Sent organisation SMTP test',
    'platform.settings.update': 'Changed platform settings',
    'platform.logo.update': 'Uploaded platform logo',
    'platform.logo.remove': 'Removed platform logo',
    'platform.favicon.update': 'Uploaded platform favicon',
    'platform.favicon.remove': 'Removed platform favicon',
    'platform.smtp.update': 'Changed platform email settings',
    'platform.smtp.test': 'Sent platform SMTP test',
    'payscale.stages.update': 'Updated pay scale stages',
    'servicebook.event.add': 'Added service book entry'
  };

  function detailText(a) {
    var d = a.details;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return d; } }
    if (!d) return '';
    if (a.action === 'auth.login.failed' && d.reason) {
      var reasons = { unknown_user: 'unknown email', bad_password: 'wrong password', inactive: 'account deactivated', wrong_login_page: 'used platform login page', bad_mfa_code: 'wrong MFA code', ORG_SUSPENDED: 'organisation suspended', ORG_LICENSE_EXPIRED: 'licence expired', ORG_LICENSE_NOT_STARTED: 'licence not started' };
      return reasons[d.reason] || d.reason;
    }
    if (d.before && d.after) {
      var ch = [];
      Object.keys(d.after).forEach(function (k) {
        if (String(d.after[k]) !== String(d.before[k])) ch.push(k + ': ' + (d.before[k] === null ? '—' : d.before[k]) + ' → ' + (d.after[k] === null ? '—' : d.after[k]));
      });
      return ch.join('; ');
    }
    return Object.keys(d).filter(function (k) { return d[k] !== null && d[k] !== undefined && typeof d[k] !== 'object'; })
      .map(function (k) { return k + ': ' + d[k]; }).join(', ');
  }

  /**
   * opts: { el, path: '/admin/audit' | '/org/audit', orgs: [{id,name,code}] (Super Admin filter),
   *         canPurge (Super Admin only — shows a manual "Purge now" action) }
   */
  H.auditTable = function (opts) {
    var orgName = {};
    (opts.orgs || []).forEach(function (o) { orgName[o.id] = o.shortName || o.code; });
    var rows = [];
    var page = 1;
    var meta = { total: 0, totalPages: 1, auditRetentionDays: null };
    var filters = { organizationId: '', action: '' };
    var PAGE_SIZE = 50;

    opts.el.innerHTML =
      '<div class="card"><div class="card-body filters">' +
        (opts.orgs ? H.field('au-org', 'Organisation', H.select('au-org', [['', 'All'], ['platform', 'Platform only']].concat(opts.orgs.map(function (o) { return [o.id, o.code + ' — ' + o.name]; })), '')) : '') +
        H.field('au-action', 'Activity', H.select('au-action', [['', 'All activity'], ['auth.login', 'Sign-ins'], ['auth.login.failed', 'Failed sign-ins'], ['auth.', 'Authentication & MFA'], ['user.', 'User management'], ['org.', 'Organisation & licence'], ['platform.', 'Platform settings'], ['payscale.', 'Pay scales'], ['payroll.', 'Payroll'], ['servicebook.', 'Service book']], '')) +
      '</div>' +
      '<p class="small muted au-retention" id="au-retention"></p>' +
      '<div id="au-list">' + H.loading() + '</div>' +
      '<div class="card-foot btn-row" id="au-pager" hidden>' +
        '<button type="button" class="secondary sm" id="au-prev">Newer</button>' +
        '<span class="small muted" id="au-page-label"></span>' +
        '<button type="button" class="secondary sm" id="au-next">Older</button>' +
        (opts.canPurge ? '<button type="button" class="secondary sm push-right" id="au-purge">Purge expired entries now</button>' : '') +
      '</div></div>';

    function load() {
      var q = ['page=' + page, 'pageSize=' + PAGE_SIZE];
      if (filters.organizationId) q.push('organizationId=' + encodeURIComponent(filters.organizationId));
      if (filters.action) q.push('action=' + encodeURIComponent(filters.action));
      H.$('#au-list').innerHTML = H.loading();
      H.api('GET', opts.path + '?' + q.join('&')).then(function (res) {
        rows = res.data;
        meta = { total: res.total, totalPages: res.totalPages, auditRetentionDays: res.auditRetentionDays };
        draw();
      }).catch(function (err) { H.$('#au-list').innerHTML = H.errorBox(err); });
    }

    function draw() {
      if (meta.auditRetentionDays) {
        H.$('#au-retention').textContent = 'Entries older than ' + meta.auditRetentionDays + ' days are automatically removed by a nightly cleanup.';
      }
      H.$('#au-pager').hidden = meta.total === 0;
      if (H.$('#au-page-label')) H.$('#au-page-label').textContent = 'Page ' + page + ' of ' + meta.totalPages + ' (' + meta.total + ' entries)';
      if (H.$('#au-prev')) H.$('#au-prev').disabled = page <= 1;
      if (H.$('#au-next')) H.$('#au-next').disabled = page >= meta.totalPages;
      if (!rows.length) { H.$('#au-list').innerHTML = '<div class="empty">No matching activity.</div>'; return; }
      H.$('#au-list').innerHTML = '<div class="table-wrap"><table class="audit"><thead><tr><th>When</th><th>Who</th><th>Activity</th>' +
        (opts.orgs ? '<th>Organisation</th>' : '') + '<th>Details</th><th>IP address</th></tr></thead><tbody>' +
        rows.map(function (a) {
          var failed = /failed/.test(a.action);
          return '<tr' + (failed ? ' class="row-warn"' : '') + '><td class="nowrap">' + H.fmtDateTime(a.createdAt) + '</td>' +
            '<td>' + esc(a.actorEmail || '—') + '</td>' +
            '<td>' + esc(ACTION_LABELS[a.action] || a.action) + '</td>' +
            (opts.orgs ? '<td>' + (a.organizationId ? esc(orgName[a.organizationId] || '#' + a.organizationId) : '<span class="muted">Platform</span>') + '</td>' : '') +
            '<td class="small">' + esc(detailText(a)) + '</td>' +
            '<td class="small mono">' + esc(a.ip || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    if (H.$('#au-org')) H.on('#au-org', 'change', function () { filters.organizationId = this.value; page = 1; load(); });
    H.on('#au-action', 'change', function () { filters.action = this.value; page = 1; load(); });
    H.on('#au-prev', 'click', function () { if (page > 1) { page--; load(); } });
    H.on('#au-next', 'click', function () { if (page < meta.totalPages) { page++; load(); } });
    H.on('#au-purge', 'click', function () {
      var btn = this; H.busy(btn, true, 'Purging…');
      H.api('POST', '/admin/audit/purge-now').then(function (res) {
        H.busy(btn, false);
        page = 1; load();
        H.notice('#au-retention', 'ok', res.data.deleted + ' entr' + (res.data.deleted === 1 ? 'y' : 'ies') + ' older than ' + res.data.days + ' days removed.');
      }).catch(function (err) { H.busy(btn, false); H.notice('#au-retention', 'error', err.message); });
    });
    load();
  };
})();
