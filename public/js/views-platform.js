/* Super Admin screens: overview, organisations (onboarding, licence,
 * suspension, logo, admins), platform users, platform settings (general,
 * branding, email) and the platform audit log. */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;
  var SA = { roles: ['SUPER_ADMIN'] };

  // Suggested starting values per plan — they only pre-fill the form; the
  // Super Admin can change any of them before saving.
  var PLANS = {
    TRIAL: { label: 'Trial', days: 30, maxUsers: 5, maxEmployees: 50 },
    STANDARD: { label: 'Standard', years: 1, maxUsers: 25, maxEmployees: 500 },
    PROFESSIONAL: { label: 'Professional', years: 1, maxUsers: 75, maxEmployees: 2000 },
    ENTERPRISE: { label: 'Enterprise', years: 1, maxUsers: null, maxEmployees: null },
    CUSTOM: { label: 'Custom' }
  };
  var PLAN_OPTIONS = [['', '— none —']].concat(Object.keys(PLANS).map(function (k) { return [k, PLANS[k].label]; }));
  function planLabel(p) { return p && PLANS[p] ? PLANS[p].label : (p || '—'); }

  // The 6 Kerala UCB licensing classes (KSR pay-scale annexure). Chosen
  // once, at organisation-creation time — see src/services/payScaleLibrary.js,
  // which seeds the matching post/pay-scale library into the new org.
  var BANK_CLASSES = {
    SPECIAL_GRADE: 'Special Grade Urban Banks (Licensed Banks)',
    CLASS_I: 'Class I Urban Banks (Licensed Banks)',
    CLASS_II: 'Class II Urban Banks (Licensed Banks)',
    CLASS_III: 'Class III Urban Banks (Licensed Banks)',
    CLASS_IV: 'Class IV Urban Banks (Licensed Banks)',
    CLASS_V: 'Class V Urban Banks (Licensed Banks)'
  };
  var BANK_CLASS_OPTIONS = [['', '— select —']].concat(Object.keys(BANK_CLASSES).map(function (k) { return [k, BANK_CLASSES[k]]; }));
  function bankClassLabel(c) { return c && BANK_CLASSES[c] ? BANK_CLASSES[c] : (c || '—'); }

  function loginUrl(code) { return window.location.origin + '/o/' + code; }

  // ---------------------------------------------------------- licence form

  function licenceFields(prefix, o) {
    o = o || {};
    return '<div class="grid-2">' +
      H.field(prefix + '-plan', 'Licence plan', H.select(prefix + '-plan', PLAN_OPTIONS, o.licensePlan), 'Choosing a plan fills in suggested dates and limits. You can adjust them.') +
      H.field(prefix + '-start', 'Valid from', H.input(prefix + '-start', 'date', o.licenseStartsAt), 'Leave empty to start immediately.') +
      H.field(prefix + '-expiry', 'Valid until', H.input(prefix + '-expiry', 'date', o.licenseExpiresAt), 'Access stops after this day. Leave empty for no expiry.') +
      H.field(prefix + '-maxu', 'Maximum active users', H.input(prefix + '-maxu', 'number', o.maxUsers, 'min="1" placeholder="Unlimited"')) +
      H.field(prefix + '-maxe', 'Maximum active employees', H.input(prefix + '-maxe', 'number', o.maxEmployees, 'min="1" placeholder="Unlimited"')) +
      H.field(prefix + '-notes', 'Licence notes', H.input(prefix + '-notes', 'text', o.licenseNotes, 'maxlength="500" placeholder="PO number, invoice, remarks…"')) +
    '</div>';
  }

  function wirePlanPresets(prefix) {
    H.on('#' + prefix + '-plan', 'change', function () {
      var p = PLANS[this.value];
      if (!p || this.value === 'CUSTOM') return;
      var start = H.val('#' + prefix + '-start') || H.todayYmd();
      if (!H.val('#' + prefix + '-start')) H.$('#' + prefix + '-start').value = start;
      H.$('#' + prefix + '-expiry').value = p.days ? H.addDays(start, p.days - 1) : H.addYears(start, p.years);
      H.$('#' + prefix + '-maxu').value = p.maxUsers === null ? '' : p.maxUsers;
      H.$('#' + prefix + '-maxe').value = p.maxEmployees === null ? '' : p.maxEmployees;
    });
  }

  function readLicence(prefix) {
    return {
      licensePlan: H.val('#' + prefix + '-plan'),
      licenseStartsAt: H.val('#' + prefix + '-start'),
      licenseExpiresAt: H.val('#' + prefix + '-expiry'),
      maxUsers: H.val('#' + prefix + '-maxu'),
      maxEmployees: H.val('#' + prefix + '-maxe'),
      licenseNotes: H.val('#' + prefix + '-notes')
    };
  }

  // ------------------------------------------------------------- overview

  function viewDashboard(params, state) {
    H.shell(H.pageHead('Overview', 'Platform status across all organisations.') + '<div class="notice" id="dash-notice"></div><div id="dash">' + H.loading() + '</div>');
    if (state && state.notice) H.notice('#dash-notice', state.kind || 'ok', state.notice);
    Promise.all([H.api('GET', '/admin/dashboard'), H.api('GET', '/admin/organizations')]).then(function (r) {
      var d = r[0].data;
      var orgs = r[1].data;
      var attention = orgs.filter(function (o) {
        var s = o.license && o.license.state;
        return o.status !== 'ACTIVE' || s !== 'ACTIVE' || (o.license.daysLeft !== null && o.license.daysLeft <= 30) ||
          (o.maxUsers && o.usage.users >= o.maxUsers) || (o.maxEmployees && o.usage.employees >= o.maxEmployees);
      });
      H.$('#dash').innerHTML =
        '<div class="stats">' +
          H.statTile('Organisations', d.organisations.total, d.organisations.active + ' active') +
          H.statTile('Expiring within 30 days', d.organisations.expiringSoon, '', d.organisations.expiringSoon ? 'warn' : '') +
          H.statTile('Expired or suspended', d.organisations.expired + d.organisations.suspended, d.organisations.suspended + ' suspended · ' + d.organisations.expired + ' expired', (d.organisations.expired + d.organisations.suspended) ? 'off' : '') +
          H.statTile('Bank users', d.orgUsers, 'active accounts') +
          H.statTile('Platform users', d.platformUsers, 'Super Admins') +
          H.statTile('Failed sign-ins (24 h)', d.failedLogins24h, '<a href="#/audit">View audit log</a>', d.failedLogins24h > 20 ? 'warn' : '') +
        '</div>' +
        '<div class="card"><h3>Needs attention</h3>' +
        (attention.length ? orgTable(attention) : '<div class="empty">Nothing needs attention — every organisation is active, within its licence and limits.</div>') +
        '</div>';
      wireOrgRows();
    }).catch(function (err) { if (H.$('#dash')) H.$('#dash').innerHTML = H.errorBox(err); });
  }

  function orgTable(rows) {
    return '<div class="table-wrap"><table class="clickable"><thead><tr><th>Code</th><th>Organisation</th><th>Plan</th><th>Valid until</th><th>Users</th><th>Employees</th><th>Status</th></tr></thead><tbody>' +
      rows.map(function (o) {
        return '<tr data-href="#/organisations/' + o.id + '">' +
          '<td>' + (o.logo ? '<img class="row-logo" src="/assets/org/' + encodeURIComponent(o.code) + '/logo?v=' + esc(o.logo.version) + '" alt=""> ' : '') + '<code class="inline">' + esc(o.code) + '</code></td>' +
          '<td><a href="#/organisations/' + o.id + '">' + esc(o.name) + '</a></td>' +
          '<td>' + esc(planLabel(o.licensePlan)) + '</td>' +
          '<td>' + (o.licenseExpiresAt ? H.fmtDay(o.licenseExpiresAt) : '<span class="muted">No expiry</span>') + '</td>' +
          '<td>' + H.usageText(o.usage.users, o.maxUsers) + '</td>' +
          '<td>' + H.usageText(o.usage.employees, o.maxEmployees) + '</td>' +
          '<td>' + H.licenceBadge(o.license, o.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function wireOrgRows() {
    H.$$('tr[data-href]').forEach(function (tr) {
      tr.addEventListener('click', function (e) { if (e.target.tagName !== 'A') window.location.hash = tr.getAttribute('data-href'); });
    });
  }

  // -------------------------------------------------------- organisations

  function viewOrgList(params, state) {
    H.shell(
      H.pageHead('Organisations', 'Each Urban Co-operative Bank is a separate organisation with its own users, data, licence and sign-in page.',
        '<button type="button" id="new-org">Onboard organisation</button>') +
      '<div class="notice" id="org-notice"></div>' +
      '<div class="card" id="org-form-card" hidden><h3>Onboard a new organisation</h3><div class="card-body">' +
        '<form id="org-form" novalidate>' +
          '<div class="grid-2">' +
            H.field('o-code', 'Organisation code', H.input('o-code', 'text', '', 'maxlength="32" placeholder="TUCB" autocomplete="off"'), 'Letters/digits, 2–32 characters. Becomes the bank\'s sign-in address: <code class="inline">' + esc(window.location.origin) + '/o/<span id="o-code-echo">CODE</span></code>. Cannot be changed later.') +
            H.field('o-name', 'Registered name', H.input('o-name', 'text', '', 'placeholder="The … Urban Co-operative Bank Ltd"')) +
            H.field('o-short', 'Short name', H.input('o-short', 'text', '', 'maxlength="64" placeholder="TUCB"')) +
            H.field('o-reg', 'Regulator', H.input('o-reg', 'text', 'RBI / Registrar of Co-operative Societies, Kerala')) +
            H.field('o-class', 'Bank class', H.select('o-class', BANK_CLASS_OPTIONS, ''), 'One of the 6 KSR licensing classes. Sets this bank\'s starting pay-scale/post library — can be changed later from the organisation\'s profile.') +
          '</div>' +
          H.field('o-addr', 'Address', H.textarea('o-addr', '')) +
          '<h4 class="sub-h">Licence</h4>' + licenceFields('ol', {}) +
          '<div class="btn-row"><button type="submit" id="org-save">Create organisation</button><button type="button" class="secondary" id="org-cancel">Cancel</button></div>' +
        '</form></div></div>' +
      '<div class="card"><h3>All organisations</h3><div id="org-list">' + H.loading() + '</div></div>'
    );
    if (state && state.notice) H.notice('#org-notice', state.kind || 'ok', state.notice);
    wirePlanPresets('ol');
    H.on('#new-org', 'click', function () { H.$('#org-form-card').hidden = false; H.$('#o-code').focus(); });
    H.on('#org-cancel', 'click', function () { H.$('#org-form-card').hidden = true; });
    H.on('#o-code', 'input', function () { H.$('#o-code-echo').textContent = this.value.toUpperCase() || 'CODE'; });
    H.on('#org-form', 'submit', function (e) {
      e.preventDefault();
      var body = Object.assign({
        code: H.val('#o-code'), name: H.val('#o-name'), shortName: H.val('#o-short'),
        regulator: H.val('#o-reg'), address: H.val('#o-addr'), bankClass: H.val('#o-class')
      }, readLicence('ol'));
      if (!body.code || !body.name) return H.notice('#org-notice', 'error', 'Organisation code and registered name are required.');
      if (!body.bankClass) return H.notice('#org-notice', 'error', 'Bank class is required.');
      var btn = H.$('#org-save');
      H.busy(btn, true, 'Creating…');
      H.api('POST', '/admin/organizations', body).then(function (res) {
        H.go('/organisations/' + res.data.id, { notice: 'Organisation ' + res.data.code + ' created. Next, create its Organisation Admin below.', kind: 'ok' });
      }).catch(function (err) { H.busy(btn, false); H.notice('#org-notice', 'error', err.message); });
    });
    H.api('GET', '/admin/organizations').then(function (res) {
      H.$('#org-list').innerHTML = res.data.length ? orgTable(res.data) : '<div class="empty">No organisations yet. Use <strong>Onboard organisation</strong> to add the first bank.</div>';
      wireOrgRows();
    }).catch(function (err) { H.$('#org-list').innerHTML = H.errorBox(err); });
  }

  function viewOrgDetail(params, state) {
    var orgId = params[0];
    H.shell('<div id="od">' + H.loading() + '</div>');
    H.api('GET', '/admin/organizations/' + orgId).then(function (res) {
      drawOrg(res.data, state);
    }).catch(function (err) { H.$('#od').innerHTML = H.errorBox(err); });
  }

  function drawOrg(d, state) {
    var o = d.organization;
    var admins = d.users.filter(function (u) { return u.role === 'ORG_ADMIN'; });
    var suspended = o.status !== 'ACTIVE';
    H.$('#od').innerHTML =
      H.pageHead(o.name,
        '<code class="inline">' + esc(o.code) + '</code> ' + H.licenceBadge(o.license, o.status) + (o.licensePlan ? ' ' + H.badge(planLabel(o.licensePlan), 'role') : '') + (o.bankClass ? ' ' + H.badge(bankClassLabel(o.bankClass), 'role') : ''),
        '<a class="button secondary" href="#/organisations/' + o.id + '/users">Manage all users</a>',
        [['Organisations', '/organisations'], [o.shortName || o.code]]) +
      '<div class="notice" id="od-notice"></div>' +
      '<div id="od-cred"></div>' +

      '<div class="card"><h3>Sign-in address</h3><div class="card-body">' +
        '<p class="small muted">Give this address to the bank. Only this organisation\'s users can sign in there, and it shows the bank\'s own name and logo.</p>' +
        '<div class="inline-form"><code class="inline big" id="od-url">' + esc(loginUrl(o.code)) + '</code>' +
        '<button type="button" class="secondary sm" id="od-url-copy">Copy</button><span class="small muted" id="od-url-done" hidden>Copied</span>' +
        '<a class="button secondary sm" href="/o/' + encodeURIComponent(o.code) + '" target="_blank" rel="noopener">Open</a></div>' +
      '</div></div>' +

      '<div class="card"><h3>Licence &amp; access</h3><div class="card-body">' +
        '<div class="notice" id="lic-notice"></div>' +
        '<div class="usage-row">' +
          '<div><span class="muted small">Active users</span><div>' + H.usageText(o.usage.users, o.maxUsers) + '</div></div>' +
          '<div><span class="muted small">Active employees</span><div>' + H.usageText(o.usage.employees, o.maxEmployees) + '</div></div>' +
          '<div><span class="muted small">Access</span><div>' + H.licenceBadge(o.license, o.status) + '</div></div>' +
        '</div>' +
        '<form id="lic-form" novalidate>' + licenceFields('lic', o) +
          '<div class="btn-row"><button type="submit" id="lic-save">Save licence</button>' +
          '<button type="button" class="secondary" id="lic-extend">Extend by 1 year</button></div>' +
        '</form>' +
        '<hr class="sep">' +
        '<div class="access-row">' +
          (suspended
            ? '<div><strong>Access is suspended.</strong> <span class="small muted">No one from this organisation can sign in or use existing sessions.</span></div><button type="button" id="od-reactivate">Reactivate access</button>'
            : '<div><strong>Suspend access</strong> <span class="small muted">Immediately signs out every user of this organisation and blocks sign-in. Nothing is deleted; you can reactivate at any time.</span></div><button type="button" class="danger" id="od-suspend">Suspend organisation</button>') +
        '</div>' +
      '</div></div>' +

      '<div class="card"><h3>Organisation profile</h3><div class="card-body"><div class="notice" id="prof-notice"></div>' +
        '<form id="prof-form" novalidate><div class="grid-2">' +
          H.field('p-name', 'Registered name', H.input('p-name', 'text', o.name)) +
          H.field('p-short', 'Short name', H.input('p-short', 'text', o.shortName, 'maxlength="64"')) +
          H.field('p-reg', 'Regulator', H.input('p-reg', 'text', o.regulator)) +
          H.field('p-email', 'Contact email', H.input('p-email', 'email', o.contactEmail)) +
          H.field('p-phone', 'Contact phone', H.input('p-phone', 'text', o.contactPhone)) +
          H.field('p-web', 'Website', H.input('p-web', 'text', o.website)) +
          H.field('p-class', 'Bank class', H.select('p-class', BANK_CLASS_OPTIONS, o.bankClass || ''), 'Can be changed at any time. Switching adds that class\'s posts/pay scales if the bank doesn\'t already have them — nothing existing is ever removed.') +
        '</div>' + H.field('p-addr', 'Address', H.textarea('p-addr', o.address)) +
        '<button type="submit" id="prof-save">Save profile</button></form>' +
      '</div></div>' +

      '<div id="od-logo"></div>' +

      '<div class="card"><h3>Pay scale revision</h3><div class="card-body">' +
        '<p class="small muted">When the Government revises a pay scale, download this bank\'s current posts as a CSV, fill in <code>newScaleExpression</code> only for the posts that changed (leave the rest blank), and upload it back. Each upload creates one new pay revision for this organisation; the previous scale for each changed post is superseded, and its post is repointed at the new scale. Employees already on the old scale keep it until fixed onto the new one separately (Pay Fixation is not automatic).</p>' +
        '<div class="notice" id="psr-notice"></div>' +
        '<div class="btn-row"><button type="button" class="secondary" id="psr-template">Download current pay scale template (CSV)</button></div>' +
        '<form id="psr-form" novalidate class="spaced">' +
          '<div class="grid-2">' +
            H.field('psr-name', 'Revision name', H.input('psr-name', 'text', ''), 'e.g. "2026 Pay Revision"') +
            H.field('psr-date', 'Effective date', H.input('psr-date', 'date', H.todayYmd())) +
          '</div>' +
          H.field('psr-desc', 'Notes / Government Order reference', H.textarea('psr-desc', '')) +
          H.field('psr-file', 'Filled-in CSV', '<input type="file" id="psr-file" accept=".csv,text/csv">') +
          '<button type="submit" id="psr-save">Apply revision</button>' +
        '</form>' +
        '<div id="psr-result"></div>' +
      '</div></div>' +

      '<div class="card"><h3>Organisation Admins</h3>' +
        (admins.length ? '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Password</th><th>MFA</th><th>Last sign-in</th></tr></thead><tbody>' +
          admins.map(function (u) {
            return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + H.statusBadge(u.status) + '</td>' +
              '<td>' + (u.mustChangePassword ? H.badge('Temporary', 'warn') : H.badge('Set', 'ok')) + '</td>' +
              '<td>' + (u.mfaEnabled ? H.badge('On', 'ok') : H.badge('Off')) + '</td><td class="small">' + H.fmtDateTime(u.lastLoginAt) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
          : '<div class="empty">No Organisation Admin yet — create one below so the bank can start using the system.</div>') +
        '<div class="card-body bordered-top"><h4 class="sub-h">' + (admins.length ? 'Add another Organisation Admin' : 'Create the Organisation Admin') + '</h4>' +
          '<div class="notice" id="adm-notice"></div>' +
          '<form id="admin-form" novalidate><div class="grid-2">' +
            H.field('adm-name', 'Full name', H.input('adm-name', 'text', '')) +
            H.field('adm-email', 'Email', H.input('adm-email', 'email', '')) +
          '</div>' + H.checkbox('adm-send', 'Email the sign-in details to this person', false, 'Uses the bank\'s email settings, or the platform\'s if the bank has none.') +
          '<button type="submit" id="adm-save">Create Organisation Admin</button></form>' +
        '</div></div>';

    if (state && state.notice) H.notice('#od-notice', state.kind || 'ok', state.notice);
    H.on('#od-url-copy', 'click', function () { H.copyText(loginUrl(o.code), H.$('#od-url-done')); });

    H.logoUploader({
      el: H.$('#od-logo'), id: 'ol', title: 'Organisation logo',
      description: 'Shown on the bank\'s sign-in page and at the top of every page its users see. A wide logo on a transparent background works best.',
      hasImage: !!o.logo, currentUrl: '/assets/org/' + encodeURIComponent(o.code) + '/logo' + (o.logo ? '?v=' + o.logo.version : ''),
      currentUrlBase: '/assets/org/' + encodeURIComponent(o.code) + '/logo',
      limitBytes: 512 * 1024, uploadPath: '/admin/organizations/' + o.id + '/logo', removePath: '/admin/organizations/' + o.id + '/logo'
    });

    wirePlanPresets('lic');
    function saveOrg(body, btn, noticeSel, okMsg) {
      H.busy(btn, true, 'Saving…');
      return H.api('PUT', '/admin/organizations/' + o.id, body).then(function () {
        return H.api('GET', '/admin/organizations/' + o.id);
      }).then(function (res) {
        drawOrg(res.data);
        H.notice(noticeSel, 'ok', okMsg);
      }).catch(function (err) { H.busy(btn, false); H.notice(noticeSel, 'error', err.message); });
    }
    H.on('#lic-form', 'submit', function (e) { e.preventDefault(); saveOrg(readLicence('lic'), H.$('#lic-save'), '#lic-notice', 'Licence saved.'); });
    H.on('#lic-extend', 'click', function () {
      var today = H.todayYmd();
      var cur = H.val('#lic-expiry');
      var from = cur && cur >= today ? H.addDays(cur, 1) : today;
      H.$('#lic-expiry').value = H.addYears(from, 1);
      H.notice('#lic-notice', 'warn', 'Expiry moved to ' + H.fmtDay(H.$('#lic-expiry').value) + '. Click Save licence to apply.');
    });
    H.on('#od-suspend', 'click', function () {
      if (!window.confirm('Suspend ' + o.name + '?\n\nEvery user of this organisation will be signed out immediately and unable to sign in until you reactivate it. No data is deleted.')) return;
      saveOrg({ status: 'INACTIVE' }, this, '#lic-notice', 'Organisation suspended. Its users have been signed out.');
    });
    H.on('#od-reactivate', 'click', function () { saveOrg({ status: 'ACTIVE' }, this, '#lic-notice', 'Access reactivated.'); });
    H.on('#prof-form', 'submit', function (e) {
      e.preventDefault();
      var body = {
        name: H.val('#p-name'), shortName: H.val('#p-short'), regulator: H.val('#p-reg'),
        contactEmail: H.val('#p-email'), contactPhone: H.val('#p-phone'), website: H.val('#p-web'), address: H.val('#p-addr')
      };
      if (!H.val('#p-class')) return H.notice('#prof-notice', 'error', 'Bank class is required.');
      body.bankClass = H.val('#p-class');
      saveOrg(body, H.$('#prof-save'), '#prof-notice', 'Profile saved.');
    });
    H.on('#admin-form', 'submit', function (e) {
      e.preventDefault();
      var name = H.val('#adm-name');
      var email = H.val('#adm-email');
      if (!name || !email) return H.notice('#adm-notice', 'error', 'Name and email are required.');
      var btn = H.$('#adm-save');
      H.busy(btn, true, 'Creating…');
      H.api('POST', '/admin/organizations/' + o.id + '/admin-users', { name: name, email: email, sendEmail: H.$('#adm-send').checked })
        .then(function (res) {
          return H.api('GET', '/admin/organizations/' + o.id).then(function (r2) {
            drawOrg(r2.data, { notice: 'Organisation Admin created.', kind: 'ok' });
            H.$('#od-cred').innerHTML = H.credPanel(res.data.email, res.tempPassword, res.email);
            H.wireCopy();
            window.scrollTo(0, 0);
          });
        }).catch(function (err) { H.busy(btn, false); H.notice('#adm-notice', 'error', err.message); });
    });

    H.on('#psr-template', 'click', function () {
      var s = H.getSession();
      fetch('/api/v1/admin/organizations/' + o.id + '/pay-scale-template.csv', { headers: { Authorization: 'Bearer ' + (s && s.token) } })
        .then(function (res) { if (!res.ok) throw new Error('Could not download the template.'); return res.blob(); })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a'); a.href = url; a.download = 'pay-scale-template-' + o.code + '.csv'; document.body.appendChild(a); a.click();
          document.body.removeChild(a); URL.revokeObjectURL(url);
        }).catch(function (err) { H.notice('#psr-notice', 'error', err.message); });
    });
    H.on('#psr-file', 'change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { H.$('#psr-form').dataset.csv = String(reader.result || ''); };
      reader.readAsText(f);
    });
    H.on('#psr-form', 'submit', function (e) {
      e.preventDefault();
      var csv = H.$('#psr-form').dataset.csv;
      if (!csv || !csv.trim()) return H.notice('#psr-notice', 'error', 'Choose the filled-in CSV file first.');
      var name = H.val('#psr-name'); var date = H.val('#psr-date');
      if (!name) return H.notice('#psr-notice', 'error', 'A revision name is required.');
      if (!date) return H.notice('#psr-notice', 'error', 'An effective date is required.');
      var btn = H.$('#psr-save');
      H.busy(btn, true, 'Applying…');
      H.api('POST', '/admin/organizations/' + o.id + '/pay-scales/bulk-apply', {
        revisionName: name, effectiveDate: date, description: H.val('#psr-desc'), csv: csv,
      }).then(function (res) {
        H.busy(btn, false);
        H.notice('#psr-notice', 'ok', res.data.applied.length + ' post(s) moved onto the new "' + esc(res.data.revision.name) + '" revision.');
        H.$('#psr-result').innerHTML = '<div class="card"><h3>Applied</h3><div class="table-wrap"><table><thead><tr><th>Post</th><th>Previous scale</th><th>New scale</th><th>Stages</th></tr></thead><tbody>' +
          res.data.applied.map(function (r) {
            return '<tr><td>' + esc(r.postName) + ' <span class="small muted">(' + esc(r.postCode) + ')</span></td><td>' + esc(r.previousScaleCode || '—') + '</td><td>' + esc(r.newScaleCode) + '</td><td>' + r.stages + '</td></tr>';
          }).join('') + '</tbody></table></div></div>';
        H.$('#psr-file').value = ''; delete H.$('#psr-form').dataset.csv;
      }).catch(function (err) { H.busy(btn, false); H.notice('#psr-notice', 'error', err.message); });
    });
  }

  // ------------------------------------------------------ platform users

  function viewPlatformUsers(params, state) {
    H.shell(
      H.pageHead('Platform users', 'Super Admin accounts for Banihal staff. They can manage every organisation, so keep this list short and turn on two-factor authentication for each.',
        '<button type="button" id="new-pu">New platform user</button>') +
      '<div class="notice" id="pu-notice"></div><div id="pu-cred"></div>' +
      '<div class="card" id="pu-form-card" hidden><h3>New platform user</h3><div class="card-body">' +
        '<form id="pu-form" novalidate><div class="grid-2">' +
          H.field('pu-name', 'Full name', H.input('pu-name', 'text', '')) +
          H.field('pu-email', 'Email', H.input('pu-email', 'email', '')) +
        '</div>' + H.checkbox('pu-send', 'Email the sign-in details to this person', false, 'Uses the platform email settings.') +
        '<div class="btn-row"><button type="submit" id="pu-save">Create Super Admin</button><button type="button" class="secondary" id="pu-cancel">Cancel</button></div></form>' +
      '</div></div>' +
      '<div class="card"><h3>Super Admins</h3><div id="pu-list">' + H.loading() + '</div></div>'
    );
    if (state && state.notice) H.notice('#pu-notice', state.kind || 'ok', state.notice);
    H.on('#new-pu', 'click', function () { H.$('#pu-form-card').hidden = false; H.$('#pu-name').focus(); });
    H.on('#pu-cancel', 'click', function () { H.$('#pu-form-card').hidden = true; });
    H.on('#pu-form', 'submit', function (e) {
      e.preventDefault();
      var name = H.val('#pu-name'); var email = H.val('#pu-email');
      if (!name || !email) return H.notice('#pu-notice', 'error', 'Name and email are required.');
      var btn = H.$('#pu-save');
      H.busy(btn, true, 'Creating…');
      H.api('POST', '/admin/platform-users', { name: name, email: email, sendEmail: H.$('#pu-send').checked }).then(function (res) {
        H.busy(btn, false);
        H.$('#pu-form').reset();
        H.$('#pu-form-card').hidden = true;
        H.$('#pu-cred').innerHTML = H.credPanel(res.data.email, res.tempPassword, res.email);
        H.wireCopy();
        H.notice('#pu-notice', 'ok', 'Super Admin created.');
        loadPlatformUsers();
      }).catch(function (err) { H.busy(btn, false); H.notice('#pu-notice', 'error', err.message); });
    });
    loadPlatformUsers();
  }

  function loadPlatformUsers() {
    var me = H.user();
    H.api('GET', '/admin/platform-users').then(function (res) {
      if (!H.$('#pu-list')) return; // page changed while this was in flight
      H.$('#pu-list').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>MFA</th><th>Last sign-in</th><th></th></tr></thead><tbody>' +
        res.data.map(function (u) {
          var self = u.id === me.id;
          var actions = self ? '<span class="small muted">You</span>' :
            '<button type="button" class="secondary sm" data-act="reset" data-id="' + u.id + '" data-email="' + esc(u.email) + '">Reset password</button>' +
            (u.mfaEnabled ? '<button type="button" class="secondary sm" data-act="mfa" data-id="' + u.id + '" data-email="' + esc(u.email) + '">Reset MFA</button>' : '') +
            (u.status === 'ACTIVE'
              ? '<button type="button" class="danger sm" data-act="off" data-id="' + u.id + '" data-email="' + esc(u.email) + '">Deactivate</button>'
              : '<button type="button" class="secondary sm" data-act="on" data-id="' + u.id + '" data-email="' + esc(u.email) + '">Reactivate</button>' +
                '<button type="button" class="danger sm" data-act="del" data-id="' + u.id + '" data-email="' + esc(u.email) + '">Delete permanently</button>');
          return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + H.statusBadge(u.status) +
            (u.mustChangePassword ? ' ' + H.badge('Temp password', 'warn') : '') + '</td>' +
            '<td>' + (u.mfaEnabled ? H.badge('On', 'ok') : H.badge('Off', 'warn')) + '</td><td class="small">' + H.fmtDateTime(u.lastLoginAt) + '</td>' +
            '<td class="actions">' + actions + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      H.$$('#pu-list button[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-id'); var email = b.getAttribute('data-email'); var act = b.getAttribute('data-act');
          var p;
          if (act === 'reset') {
            if (!window.confirm('Issue a new temporary password for ' + email + '? Their current password stops working.')) return;
            H.busy(b, true, 'Resetting…');
            p = H.api('POST', '/admin/platform-users/' + id + '/reset-password', {}).then(function (res) {
              H.$('#pu-cred').innerHTML = H.credPanel(email, res.tempPassword, res.email); H.wireCopy(); window.scrollTo(0, 0);
            });
          } else if (act === 'mfa') {
            if (!window.confirm('Turn off two-factor authentication for ' + email + '? Do this only after confirming their identity — e.g. they lost their phone.')) return;
            H.busy(b, true, 'Resetting…');
            p = H.api('POST', '/admin/platform-users/' + id + '/reset-mfa', {}).then(function () { H.notice('#pu-notice', 'ok', 'Two-factor authentication cleared for ' + email + '.'); });
          } else if (act === 'del') {
            if (!window.confirm('Permanently delete ' + email + '?\n\nThis cannot be undone — the account and its history will be removed for good.')) return;
            H.busy(b, true, 'Deleting…');
            p = H.api('DELETE', '/admin/platform-users/' + id).then(function () { H.notice('#pu-notice', 'ok', email + ' permanently deleted.'); });
          } else {
            if (act === 'off' && !window.confirm('Deactivate ' + email + '? They will be signed out immediately.')) return;
            H.busy(b, true, 'Saving…');
            p = H.api('PUT', '/admin/platform-users/' + id, { status: act === 'off' ? 'INACTIVE' : 'ACTIVE' }).then(function () {
              H.notice('#pu-notice', 'ok', email + (act === 'off' ? ' deactivated.' : ' reactivated.'));
            });
          }
          p.then(loadPlatformUsers).catch(function (err) { H.busy(b, false); H.notice('#pu-notice', 'error', err.message); });
        });
      });
    }).catch(function (err) { if (H.$('#pu-list')) H.$('#pu-list').innerHTML = H.errorBox(err); });
  }

  // -------------------------------------------------------------- settings

  var SETTINGS_TABS = [['/settings', 'General'], ['/settings/branding', 'Branding'], ['/settings/email', 'Email (SMTP)']];

  function viewSettings(params) {
    var tab = params[0] || '';
    var path = '/settings' + (tab ? '/' + tab : '');
    H.shell(H.pageHead('Platform settings', 'Applies to the whole platform. Each bank manages its own logo and email settings from its Settings page.') +
      H.tabs(SETTINGS_TABS, path) + '<div id="st">' + H.loading() + '</div>');
    H.api('GET', '/admin/settings').then(function (res) {
      var d = res.data;
      if (tab === 'branding') return drawBranding(d);
      if (tab === 'email') {
        return H.smtpForm({
          el: H.$('#st'), basePath: '/admin/settings/smtp', data: d.smtp,
          intro: 'Used for Super Admin mail, and for any bank that has not set up its own email server — welcome emails with temporary passwords, and password-reset links. ' +
            'For SMTP via a third-party provider see the provider-specific docs; otherwise use the host:port provided in the settings UI.'
        });
      }
      return drawGeneral(d.settings);
    }).catch(function (err) { H.$('#st').innerHTML = H.errorBox(err); });
  }

  function drawGeneral(s) {
    H.$('#st').innerHTML = '<div class="card"><h3>General</h3><div class="card-body"><div class="notice" id="gen-notice"></div>' +
      '<form id="gen-form" novalidate><div class="grid-2">' +
        H.field('g-name', 'Platform name', H.input('g-name', 'text', s.platformName, 'maxlength="128"'), 'Shown in page titles, sign-in pages and emails.') +
        H.field('g-company', 'Company name', H.input('g-company', 'text', s.companyName, 'maxlength="255"'), 'Shown as "Powered by …" on every bank\'s pages.') +
        H.field('g-semail', 'Support email', H.input('g-semail', 'email', s.supportEmail), 'Shown on sign-in pages.') +
        H.field('g-sphone', 'Support phone', H.input('g-sphone', 'text', s.supportPhone)) +
        H.field('g-url', 'Application URL', H.input('g-url', 'text', s.appBaseUrl, 'placeholder="https://hrms.banihal.in"'), 'Used in emailed links. Leave empty to use the address the request came from.') +
        H.field('g-retention', 'Audit log retention (days)', H.input('g-retention', 'number', s.auditRetentionDays, 'min="30" max="3650"'), 'Sign-ins and admin activity older than this are permanently removed by a nightly cleanup, freeing that space for new entries. Default 180 days.') +
      '</div>' +
      H.field('g-msg', 'Sign-in page message (optional)', H.input('g-msg', 'text', s.loginMessage, 'maxlength="500" placeholder="e.g. Scheduled maintenance on Sunday 2–4 AM"'), 'Shown on every sign-in page — use for maintenance notices.') +
      '<button type="submit" id="gen-save">Save settings</button></form></div></div>';
    H.on('#gen-form', 'submit', function (e) {
      e.preventDefault();
      var btn = H.$('#gen-save');
      H.busy(btn, true, 'Saving…');
      H.api('PUT', '/admin/settings', {
        platformName: H.val('#g-name'), companyName: H.val('#g-company'), supportEmail: H.val('#g-semail'),
        supportPhone: H.val('#g-sphone'), appBaseUrl: H.val('#g-url'), loginMessage: H.val('#g-msg'),
        auditRetentionDays: H.val('#g-retention'),
      }).then(function () {
        H.busy(btn, false);
        H.notice('#gen-notice', 'ok', 'Settings saved.');
        return H.loadContext();
      }).catch(function (err) { H.busy(btn, false); H.notice('#gen-notice', 'error', err.message); });
    });
  }

  function drawBranding(d) {
    H.$('#st').innerHTML = '<div id="br-logo"></div><div id="br-fav"></div>';
    var refresh = function () { H.loadContext().then(function () { H.render(); }); };
    H.logoUploader({
      el: H.$('#br-logo'), id: 'plogo', title: 'Main logo',
      description: 'The Banihal logo on the platform sign-in page and at the top of Super Admin pages.',
      hasImage: !!d.logo, currentUrl: '/assets/platform/logo' + (d.logo ? '?v=' + d.logo.version : ''), currentUrlBase: '/assets/platform/logo',
      limitBytes: d.limits.LOGO, uploadPath: '/admin/settings/logo', removePath: '/admin/settings/logo', onChange: refresh
    });
    H.logoUploader({
      el: H.$('#br-fav'), id: 'pfav', title: 'Favicon (small logo)', allowIco: true, previewClass: 'square',
      description: 'The small square mark shown in browser tabs everywhere, and in the "Powered by" line on every bank\'s pages and sign-in page. Use a square image, ideally 64×64 or larger.',
      hasImage: !!d.favicon, currentUrl: '/assets/platform/favicon' + (d.favicon ? '?v=' + d.favicon.version : ''), currentUrlBase: '/assets/platform/favicon',
      limitBytes: d.limits.FAVICON, uploadPath: '/admin/settings/favicon', removePath: '/admin/settings/favicon', onChange: refresh
    });
  }

  // ----------------------------------------------------------------- audit

  function viewAudit() {
    H.shell(H.pageHead('Audit log', 'Every sign-in, failed sign-in and administrative change, across the platform. Entries cannot be edited or deleted before their retention period expires.') + '<div id="audit"></div>');
    H.api('GET', '/admin/organizations').then(function (res) {
      H.auditTable({ el: H.$('#audit'), path: '/admin/audit', orgs: res.data, canPurge: true });
    }).catch(function (err) { H.$('#audit').innerHTML = H.errorBox(err); });
  }

  H.route('/dashboard', viewDashboard, SA);
  H.route('/organisations', viewOrgList, SA);
  H.route(/^\/organisations\/(\d+)$/, viewOrgDetail, SA);
  H.route(/^\/organisations\/(\d+)\/users$/, function (p, s) { H.usersView(p[0], s); }, SA);
  H.route('/platform-users', viewPlatformUsers, SA);
  H.route(/^\/settings(?:\/(branding|email))?$/, viewSettings, SA);
  H.route('/audit', viewAudit, SA);
})();
