/* Organisation (bank) administration: overview, users, settings (profile,
 * logo, email), audit log. H.usersView is also used by Super Admins to
 * manage a bank's users from the platform side. */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;
  var OA = { roles: ['ORG_ADMIN'] };

  // ----------------------------------------------------------- overview

  function viewOrgDashboard(params, state) {
    var user = H.user();
    H.shell(H.pageHead(user.organization.name, 'Organisation overview.') + '<div class="notice" id="od-notice"></div><div id="odash">' + H.loading() + '</div>');
    if (state && state.notice) H.notice('#od-notice', state.kind || 'ok', state.notice);
    H.api('GET', '/org/settings').then(function (res) {
      var d = res.data; var lic = d.license;
      var validity = lic.expiresAt ? H.fmtDay(lic.expiresAt) : 'No expiry';
      H.$('#odash').innerHTML =
        '<div class="stats">' +
          H.statTile('Licence', lic.plan ? lic.plan.charAt(0) + lic.plan.slice(1).toLowerCase() : 'Active', 'Valid until ' + validity, lic.daysLeft !== null && lic.daysLeft <= 30 ? 'warn' : '') +
          H.statTile('Active users', d.usage.users + (lic.maxUsers ? ' / ' + lic.maxUsers : ''), lic.maxUsers ? (lic.maxUsers - d.usage.users) + ' seats free' : 'No limit', lic.maxUsers && d.usage.users >= lic.maxUsers ? 'off' : '') +
          H.statTile('Active employees', d.usage.employees + (lic.maxEmployees ? ' / ' + lic.maxEmployees : ''), lic.maxEmployees ? (lic.maxEmployees - d.usage.employees) + ' records free' : 'No limit', lic.maxEmployees && d.usage.employees >= lic.maxEmployees ? 'off' : '') +
          H.statTile('Email', d.smtp.enabled ? 'Own' : (d.platformSmtpAvailable ? 'Platform' : 'Not set up'), d.smtp.enabled ? esc(d.smtp.fromEmail) : (d.platformSmtpAvailable ? 'Using the platform server · ' : '') + '<a href="#/org-settings/email">Configure</a>', !d.smtp.enabled && !d.platformSmtpAvailable ? 'warn' : '') +
        '</div>' +
        '<div class="card"><h3>Your sign-in address</h3><div class="card-body">' +
          '<p class="small muted">Share this with your staff. It shows your bank\'s name and logo, and only your bank\'s users can sign in there.</p>' +
          '<div class="inline-form"><code class="inline big">' + esc(d.loginUrl) + '</code><button type="button" class="secondary sm" id="lu-copy">Copy</button><span class="small muted" id="lu-done" hidden>Copied</span></div>' +
        '</div></div>' +
        '<div class="card"><h3>Getting started</h3><div class="card-body"><ol class="checklist">' +
          step(!!d.logo, 'Upload your bank\'s logo', '#/org-profile') +
          step(d.smtp.enabled || d.platformSmtpAvailable, 'Set up email so the system can send sign-in details and password resets', '#/org-settings/email') +
          step(user.mfaEnabled, 'Turn on two-factor authentication for your own account', '#/account') +
          step(d.usage.users > 1, 'Create accounts for your HR and accounts staff', '#/users') +
          step(d.usage.employees > 0, 'Add posts, pay scales and employees', '#/posts') +
        '</ol></div></div>';
      H.on('#lu-copy', 'click', function () { H.copyText(d.loginUrl, H.$('#lu-done')); });
    }).catch(function (err) { H.$('#odash').innerHTML = H.errorBox(err); });
  }

  function step(done, text, href) {
    return '<li class="' + (done ? 'done' : '') + '">' + (done ? H.badge('Done', 'ok') : H.badge('To do', 'warn')) + ' <a href="' + href + '">' + esc(text) + '</a></li>';
  }

  // --------------------------------------------------------------- users

  /** Users of one organisation. Used by ORG_ADMIN (own org) and SUPER_ADMIN (any org). */
  H.usersView = function (orgId, state) {
    var me = H.user();
    var isSuper = me.role === 'SUPER_ADMIN';
    var crumbs = isSuper ? [['Organisations', '/organisations'], ['Organisation', '/organisations/' + orgId], ['Users']] : null;
    H.shell(
      H.pageHead('Users', 'Each person signs in with their own account — shared logins break the audit trail that service-book and payroll changes depend on.',
        '<button type="button" id="new-user">New user</button>', crumbs) +
      '<div class="notice" id="user-notice"></div><div id="user-cred"></div><div id="seat-line"></div>' +
      '<div class="card" id="user-form-card" hidden><h3>New user</h3><div class="card-body">' +
        '<form id="user-form" novalidate><div class="grid-2">' +
          H.field('u-name', 'Full name', H.input('u-name', 'text', '')) +
          H.field('u-email', 'Email', H.input('u-email', 'email', '')) +
          H.field('u-role', 'Role', H.select('u-role', H.ORG_ROLES.map(function (r) { return [r, H.roleLabel(r)]; }), 'HR_OFFICER')) +
        '</div>' +
        H.checkbox('u-send', 'Email the sign-in details to this person', false, 'The temporary password is shown here either way.') +
        '<div class="btn-row"><button type="submit" id="user-save">Create user</button><button type="button" class="secondary" id="user-cancel">Cancel</button></div></form>' +
      '</div></div>' +
      '<div class="card"><h3>All users</h3><div id="user-list">' + H.loading() + '</div></div>'
    );
    if (state && state.notice) H.notice('#user-notice', state.kind || 'ok', state.notice);
    H.on('#new-user', 'click', function () { H.$('#user-form-card').hidden = false; H.$('#u-name').focus(); });
    H.on('#user-cancel', 'click', function () { H.$('#user-form-card').hidden = true; });
    H.on('#user-form', 'submit', function (e) {
      e.preventDefault();
      var body = { name: H.val('#u-name'), email: H.val('#u-email'), role: H.val('#u-role'), sendEmail: H.$('#u-send').checked };
      if (!body.name || !body.email) return H.notice('#user-notice', 'error', 'Name and email are required.');
      var btn = H.$('#user-save');
      H.busy(btn, true, 'Creating…');
      H.api('POST', '/organizations/' + orgId + '/users', body).then(function (res) {
        H.busy(btn, false);
        H.$('#user-form').reset();
        H.$('#user-form-card').hidden = true;
        H.$('#user-cred').innerHTML = H.credPanel(res.data.email, res.tempPassword, res.email);
        H.wireCopy();
        H.notice('#user-notice', 'ok', 'User created.');
        window.scrollTo(0, 0);
        loadUsers(orgId);
      }).catch(function (err) { H.busy(btn, false); H.notice('#user-notice', 'error', err.message); });
    });
    loadUsers(orgId);
  };

  function seatInfo(orgId) {
    var me = H.user();
    if (me.role === 'SUPER_ADMIN') {
      return H.api('GET', '/admin/organizations/' + orgId).then(function (r) { var o = r.data.organization; return { max: o.maxUsers, name: o.name }; });
    }
    return H.refreshMe().then(function (u) { return { max: u.organization.license.maxUsers, name: u.organization.name }; });
  }

  function loadUsers(orgId) {
    var me = H.user();
    Promise.all([H.api('GET', '/organizations/' + orgId + '/users'), seatInfo(orgId)]).then(function (r) {
      if (!H.$('#user-list')) return; // page changed while this was in flight
      var users = r[0].data; var seat = r[1];
      var active = users.filter(function (u) { return u.status === 'ACTIVE'; }).length;
      H.$('#seat-line').innerHTML = seat.max
        ? '<p class="small seat">' + esc(seat.name) + ' — active users: ' + H.usageText(active, seat.max) +
          (active >= seat.max ? ' <span class="muted">The licence limit is reached. Deactivate an unused account to add someone new.</span>' : '') + '</p>'
        : '';
      if (!users.length) { H.$('#user-list').innerHTML = '<div class="empty">No users yet.</div>'; return; }
      H.$('#user-list').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>MFA</th><th>Last sign-in</th><th></th></tr></thead><tbody>' +
        users.map(function (u) {
          var self = u.id === me.id;
          var a = function (act, label, cls) { return '<button type="button" class="' + (cls || 'secondary') + ' sm" data-act="' + act + '" data-id="' + u.id + '" data-email="' + esc(u.email) + '">' + label + '</button>'; };
          var actions = self ? '<span class="small muted">You</span>' :
            a('role', 'Change role') + a('reset', 'Reset password') + (u.mfaEnabled ? a('mfa', 'Reset MFA') : '') +
            (u.status === 'ACTIVE' ? a('off', 'Deactivate', 'danger') : a('on', 'Reactivate') + a('del', 'Delete permanently', 'danger'));
          return '<tr' + (u.status !== 'ACTIVE' ? ' class="row-muted"' : '') + '><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td>' +
            '<td><span class="badge role">' + esc(H.roleLabel(u.role)) + '</span></td>' +
            '<td>' + H.statusBadge(u.status) + (u.mustChangePassword ? ' ' + H.badge('Temp password', 'warn') : '') + '</td>' +
            '<td>' + (u.mfaEnabled ? H.badge('On', 'ok') : '<span class="muted small">Off</span>') + '</td>' +
            '<td class="small">' + H.fmtDateTime(u.lastLoginAt) + '</td><td class="actions">' + actions + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      H.$$('#user-list button[data-act]').forEach(function (b) { b.addEventListener('click', function () { userAction(orgId, b, users); }); });
    }).catch(function (err) { if (H.$('#user-list')) H.$('#user-list').innerHTML = H.errorBox(err); });
  }

  function userAction(orgId, b, users) {
    var id = b.getAttribute('data-id'); var email = b.getAttribute('data-email'); var act = b.getAttribute('data-act');
    var base = '/organizations/' + orgId + '/users/' + id;
    var p;
    if (act === 'role') {
      // Inline editor in place of the action buttons.
      var u = users.filter(function (x) { return String(x.id) === id; })[0];
      var td = b.parentNode;
      td.innerHTML = '<div class="inline-form">' + H.select('re-' + id, H.ORG_ROLES.map(function (r) { return [r, H.roleLabel(r)]; }), u.role, 'aria-label="Role"') +
        '<button type="button" class="sm" id="re-save-' + id + '">Save</button><button type="button" class="secondary sm" id="re-cancel-' + id + '">Cancel</button></div>';
      H.on('#re-cancel-' + id, 'click', function () { loadUsers(orgId); });
      H.on('#re-save-' + id, 'click', function () {
        var role = H.val('#re-' + id);
        var sb = this;
        H.busy(sb, true, 'Saving…');
        H.api('PUT', base, { role: role }).then(function () {
          H.notice('#user-notice', 'ok', email + ' is now ' + H.roleLabel(role) + '.');
          loadUsers(orgId);
        }).catch(function (err) { H.busy(sb, false); H.notice('#user-notice', 'error', err.message); });
      });
      return;
    } else if (act === 'reset') {
      if (!window.confirm('Issue a new temporary password for ' + email + '? Their current password stops working immediately.')) return;
      var send = window.confirm('Also email the new temporary password to ' + email + '?\n\nOK = email it, Cancel = only show it here.');
      H.busy(b, true, 'Resetting…');
      p = H.api('POST', base + '/reset-password', { sendEmail: send }).then(function (res) {
        H.$('#user-cred').innerHTML = H.credPanel(email, res.tempPassword, res.email); H.wireCopy(); window.scrollTo(0, 0);
      });
    } else if (act === 'mfa') {
      if (!window.confirm('Turn off two-factor authentication for ' + email + '?\n\nDo this only after confirming who is asking — e.g. they lost their phone. They can set it up again from My account.')) return;
      H.busy(b, true, 'Resetting…');
      p = H.api('POST', base + '/reset-mfa', {}).then(function () { H.notice('#user-notice', 'ok', 'Two-factor authentication cleared for ' + email + '.'); });
    } else if (act === 'off') {
      if (!window.confirm('Deactivate ' + email + '?\n\nThey will be signed out and unable to sign in. The account and its history are kept.')) return;
      H.busy(b, true, 'Deactivating…');
      p = H.api('DELETE', base).then(function () { H.notice('#user-notice', 'ok', email + ' deactivated.'); });
    } else if (act === 'on') {
      H.busy(b, true, 'Reactivating…');
      p = H.api('PUT', base, { status: 'ACTIVE' }).then(function () { H.notice('#user-notice', 'ok', email + ' reactivated.'); });
    } else if (act === 'del') {
      if (!window.confirm('Permanently delete ' + email + '?\n\nThis cannot be undone — the account and its history will be removed for good.')) return;
      H.busy(b, true, 'Deleting…');
      p = H.api('DELETE', base).then(function () { H.notice('#user-notice', 'ok', email + ' permanently deleted.'); });
    }
    p.then(function () { loadUsers(orgId); }).catch(function (err) { H.busy(b, false); H.notice('#user-notice', 'error', err.message); });
  }

  // ------------------------------------------------------------ settings

  // Logo upload used to live here too (a "Logo" tab) as well as on
  // Organisation Profile — the same single BrandAsset, uploaded from two
  // different screens. Consolidated (task: "logo upload in 2 places,
  // please make one") onto Organisation Profile only, since that's where
  // the rest of the bank's identity (address, registration, documents)
  // already lives — see viewOrgProfile below. A stale '/org-settings/branding'
  // link/bookmark still resolves (falls through to the Organisation tab)
  // rather than 404ing.
  var TABS = [['/org-settings', 'Organisation'], ['/org-settings/email', 'Email (SMTP)'], ['/org-settings/payroll', 'Payroll'], ['/org-settings/mandatory-fields', 'Mandatory fields']];

  function viewOrgSettings(params) {
    var tab = params[0] || '';
    var path = '/org-settings' + (tab ? '/' + tab : '');
    H.shell(H.pageHead('Settings', 'Your organisation\'s details, email server and payroll rates.') + H.tabs(TABS, tab === 'branding' ? '/org-settings' : path) + '<div id="os">' + H.loading() + '</div>');
    if (tab === 'payroll') { return drawPayrollSettings(); }
    if (tab === 'mandatory-fields') { return drawMandatoryFields(); }
    H.api('GET', '/org/settings').then(function (res) {
      var d = res.data;
      if (tab === 'email') {
        return H.smtpForm({
          el: H.$('#os'), basePath: '/org/settings/smtp', data: d.smtp,
          intro: 'Mail about your bank — sign-in details for new staff and password-reset links — goes out from this server when it is switched on. ' +
            (d.platformSmtpAvailable ? 'While it is off, the platform\'s email server is used instead.' : 'While it is off, no email can be sent (the platform has no email server either), so temporary passwords must be handed over in person.')
        });
      }
      drawProfile(d);
    }).catch(function (err) { H.$('#os').innerHTML = H.errorBox(err); });
  }

  function drawProfile(d) {
    var o = d.organization; var lic = d.license;
    H.$('#os').innerHTML =
      '<div class="card"><h3>Organisation details</h3><div class="card-body"><div class="notice" id="op-notice"></div>' +
        '<dl class="kv spaced-b"><dt>Registered name</dt><dd>' + esc(o.name) + '</dd><dt>Code</dt><dd><code class="inline">' + esc(o.code) + '</code></dd>' +
        '<dt>Regulator</dt><dd>' + esc(o.regulator || '—') + '</dd></dl>' +
        '<p class="small muted">The registered name and code are set by Banihal Technologies. Ask them to correct these if needed.</p>' +
        '<form id="op-form" novalidate><div class="grid-2">' +
          H.field('op-short', 'Short name', H.input('op-short', 'text', o.shortName, 'maxlength="64"'), 'Shown at the top of every page.') +
          H.field('op-email', 'Contact email', H.input('op-email', 'email', o.contactEmail)) +
          H.field('op-phone', 'Contact phone', H.input('op-phone', 'text', o.contactPhone)) +
          H.field('op-web', 'Website', H.input('op-web', 'text', o.website)) +
        '</div>' + H.field('op-addr', 'Address', H.textarea('op-addr', o.address)) +
        '<button type="submit" id="op-save">Save</button></form>' +
      '</div></div>' +
      '<div class="card"><h3>Licence</h3><div class="card-body"><dl class="kv">' +
        '<dt>Plan</dt><dd>' + esc(lic.plan || '—') + '</dd>' +
        '<dt>Valid from</dt><dd>' + (lic.startsAt ? H.fmtDay(lic.startsAt) : 'Immediately') + '</dd>' +
        '<dt>Valid until</dt><dd>' + (lic.expiresAt ? H.fmtDay(lic.expiresAt) + (lic.daysLeft !== null ? ' <span class="muted">(' + lic.daysLeft + ' days)</span>' : '') : 'No expiry') + '</dd>' +
        '<dt>Active users</dt><dd>' + H.usageText(d.usage.users, lic.maxUsers) + '</dd>' +
        '<dt>Active employees</dt><dd>' + H.usageText(d.usage.employees, lic.maxEmployees) + '</dd>' +
      '</dl><p class="small muted spaced">To renew or change your licence, contact ' + esc((H.branding && H.branding.companyName) || 'Banihal Technologies') + '.</p></div></div>';
    H.on('#op-form', 'submit', function (e) {
      e.preventDefault();
      var btn = H.$('#op-save');
      H.busy(btn, true, 'Saving…');
      H.api('PUT', '/org/settings', {
        shortName: H.val('#op-short'), contactEmail: H.val('#op-email'), contactPhone: H.val('#op-phone'), website: H.val('#op-web'), address: H.val('#op-addr')
      }).then(function () {
        H.busy(btn, false);
        H.notice('#op-notice', 'ok', 'Saved.');
        return H.refreshMe();
      }).catch(function (err) { H.busy(btn, false); H.notice('#op-notice', 'error', err.message); });
    });
  }

  // Organisation-wide payroll rates (see src/services/payrollSettings.js /
  // src/models/orgPayrollSetting.js). Used by every employee's payslip
  // (src/services/payslip.js) unless a field is overridden per employee.
  function drawPayrollSettings() {
    H.api('GET', '/org/settings/payroll').then(function (res) {
      var s = res.data;
      H.$('#os').innerHTML =
        '<div class="card"><h3>Earnings &amp; deductions rates</h3><div class="card-body"><div class="notice" id="pr-notice"></div>' +
          '<p class="small muted">These rates apply to every employee\'s payslip unless a field on their own record overrides it (e.g. a per-employee GSLI or Professional Tax amount).</p>' +
          '<form id="pr-form" novalidate>' +
          '<h4>Leave &amp; Year-End</h4><div class="grid-2">' +
            H.field('pr-year-type', 'Financial year convention', H.select('pr-year-type', [['CALENDAR', 'Calendar year (Jan–Dec)'], ['FINANCIAL', 'Indian financial year (Apr–Mar)']], s.yearType || 'CALENDAR'), 'Used by Leave balances and Year-End Process to decide what "a year" means for this bank.') +
          '</div>' +
          '<h4>Earnings</h4><div class="grid-2">' +
            H.field('pr-da', 'DA (% of Basic)', H.input('pr-da', 'number', s.daPercent, 'step="0.001" min="0"')) +
            H.field('pr-hra', 'HRA (% of Basic)', H.input('pr-hra', 'number', s.hraPercent, 'step="0.001" min="0"')) +
          '</div>' +
          '<h4>Provident Fund</h4><div class="grid-2">' +
            H.field('pr-pfe', 'PF — Employee (%)', H.input('pr-pfe', 'number', s.pfEmployeePercent, 'step="0.001" min="0"')) +
            H.field('pr-pfr', 'PF — Employer (%)', H.input('pr-pfr', 'number', s.pfEmployerPercent, 'step="0.001" min="0"'), 'Informational — not deducted from pay.') +
            H.field('pr-pf-base', 'Calculated on', H.select('pr-pf-base', [['BASIC', 'Basic pay only'], ['BASIC_PLUS_DA', 'Basic + DA']], s.pfCalculationBase || 'BASIC'), 'Applies to both the employee\'s and employer\'s PF, and VPF.') +
          '</div>' +
          '<h4>GSLI</h4><div class="grid-2">' +
            H.field('pr-gsli-amt', 'Default amount (₹)', H.input('pr-gsli-amt', 'number', s.gsliAmount, 'step="0.01" min="0"')) +
            H.field('pr-gsli-cut', 'Applies to employees who joined before', H.input('pr-gsli-cut', 'date', s.gsliCutoffDate)) +
          '</div>' +
          '<h4>Professional Tax</h4><div class="grid-2">' +
            H.field('pr-pt-sched', 'Schedule', H.select('pr-pt-sched', [['MONTHLY', 'Monthly'], ['HALF_YEARLY', 'Twice a year']], s.ptSchedule)) +
            '<div></div>' +
            H.field('pr-pt-m1', 'First month (1–12)', H.input('pr-pt-m1', 'number', s.ptMonth1, 'min="1" max="12"')) +
            H.field('pr-pt-m2', 'Second month (1–12)', H.input('pr-pt-m2', 'number', s.ptMonth2, 'min="1" max="12"')) +
          '</div>' +
          '<h4>Employee Overdraft</h4><div class="grid-2">' +
            H.field('pr-od-mult', 'Limit multiplier (× Basic+DA)', H.input('pr-od-mult', 'number', s.odMultiplier, 'step="0.01" min="0"')) +
            H.field('pr-od-max', 'Maximum amount (₹)', H.input('pr-od-max', 'number', s.odMaxAmount, 'step="0.01" min="0"')) +
            H.field('pr-od-months', 'Maximum repayment period (months)', H.input('pr-od-months', 'number', s.odMaxRepayMonths, 'min="1"')) +
            H.field('pr-od-rate', 'Interest rate (%)', H.input('pr-od-rate', 'number', s.odInterestRatePercent, 'step="0.001" min="0"'), 'Applies to Overdrafts availed from now on. Each existing Overdraft keeps the rate that was current the day it was availed.') +
          '</div>' +
          '<h4>Festival Advance</h4><div class="grid-2">' +
            H.field('pr-fa-months', 'Repayment period (months)', H.input('pr-fa-months', 'number', s.festivalAdvanceRepayMonths, 'min="1"'), 'Standard period; an employee may repay faster, never slower.') +
          '</div>' +
          '<h4>Vehicle Loan</h4><div class="grid-2">' +
            H.field('pr-vl-rate', 'Interest rate (%)', H.input('pr-vl-rate', 'number', s.vehicleLoanInterestRatePercent, 'step="0.001" min="0"'), 'Diminishing-balance rate applied to a new Vehicle Loan (an employee can still enter a manual EMI instead).') +
            '<div></div>' +
          '</div>' +
          H.checkbox('pr-vl-multi', 'Allow an employee to hold more than one Vehicle Loan at a time', !!s.vehicleLoanAllowMultiple, 'Off by default — one Vehicle Loan at a time.') +
          '<h4>City Compensatory &amp; Conveyance Allowance</h4><div class="grid-2">' +
            H.field('pr-cca-amt', 'City Compensatory Allowance (₹/month)', H.input('pr-cca-amt', 'number', s.ccaAmount, 'step="0.01" min="0"'), 'Default amount; an employee can override or opt out.') +
            H.field('pr-conv-amt', 'Conveyance Allowance (₹/month)', H.input('pr-conv-amt', 'number', s.conveyanceAmount, 'step="0.01" min="0"'), 'Default amount; an employee can override or opt out.') +
          '</div>' +
          '<h4>Medical Allowance</h4><div class="grid-2">' +
            H.field('pr-med-amt', 'Amount per year (₹)', H.input('pr-med-amt', 'number', s.medicalAllowanceAmount, 'step="0.01" min="0"')) +
            H.field('pr-med-month', 'Paid in month (1–12)', H.input('pr-med-month', 'number', s.medicalAllowanceMonth, 'min="1" max="12"')) +
          '</div>' +
          '<h4>Bonus</h4>' +
          '<p class="small muted">Paid once a year in the month below. Set this year\'s result before that month\'s payroll — until it\'s set, no bonus is paid.</p>' +
          '<div class="grid-2">' +
            H.field('pr-bonus-month', 'Paid in month (1–12)', H.input('pr-bonus-month', 'number', s.bonusMonth, 'min="1" max="12"')) +
            H.field('pr-bonus-result', 'This year\'s result', H.select('pr-bonus-result', [['', '— Not yet declared —'], ['PROFIT', 'Profit'], ['LOSS', 'Loss']], s.bonusResult || '')) +
            H.field('pr-bonus-profit-pct', 'If Profit: % of Basic added (on top of Basic)', H.input('pr-bonus-profit-pct', 'number', s.bonusProfitPercent, 'step="0.001" min="0"')) +
            H.field('pr-bonus-profit-max', 'If Profit: maximum bonus (₹)', H.input('pr-bonus-profit-max', 'number', s.bonusProfitMaxAmount, 'step="0.01" min="0"')) +
            H.field('pr-bonus-loss-pct', 'If Loss: % of Basic added (on top of Basic)', H.input('pr-bonus-loss-pct', 'number', s.bonusLossPercent, 'step="0.001" min="0"')) +
            H.field('pr-bonus-loss-max', 'If Loss: maximum bonus (₹)', H.input('pr-bonus-loss-max', 'number', s.bonusLossMaxAmount, 'step="0.01" min="0"')) +
          '</div>' +
          '<h4>Stagnation increment</h4><div class="grid-2">' +
            H.field('pr-stag-years', 'Years without promotion', H.input('pr-stag-years', 'number', s.stagnationYears, 'min="1"'), 'An employee stuck on the same post this long gets an extra stage jump.') +
            H.field('pr-stag-stages', 'Extra stages granted', H.input('pr-stag-stages', 'number', s.stagnationExtraStages, 'min="1"')) +
          '</div>' +
          '<h4>Retirement</h4><div class="grid-2">' +
            H.field('pr-retire-age', 'Standard retirement age (years)', H.input('pr-retire-age', 'number', s.retirementAge, 'min="45" max="75"'), 'Every employee\'s Date of Retirement is Date of Birth + this age, unless overridden for that one employee on their record.') +
            '<div></div>' +
          '</div>' +
          '<button type="submit" id="pr-save">Save</button></form>' +
        '</div></div>';
      H.on('#pr-form', 'submit', function (e) {
        e.preventDefault();
        var btn = H.$('#pr-save');
        H.busy(btn, true, 'Saving…');
        H.api('PUT', '/org/settings/payroll', {
          yearType: H.val('#pr-year-type'),
          daPercent: H.val('#pr-da'), hraPercent: H.val('#pr-hra'),
          pfEmployeePercent: H.val('#pr-pfe'), pfEmployerPercent: H.val('#pr-pfr'), pfCalculationBase: H.val('#pr-pf-base'),
          gsliAmount: H.val('#pr-gsli-amt'), gsliCutoffDate: H.val('#pr-gsli-cut'),
          ptSchedule: H.val('#pr-pt-sched'), ptMonth1: H.val('#pr-pt-m1'), ptMonth2: H.val('#pr-pt-m2'),
          odMultiplier: H.val('#pr-od-mult'), odMaxAmount: H.val('#pr-od-max'), odMaxRepayMonths: H.val('#pr-od-months'),
          odInterestRatePercent: H.val('#pr-od-rate'),
          vehicleLoanInterestRatePercent: H.val('#pr-vl-rate'), vehicleLoanAllowMultiple: H.$('#pr-vl-multi').checked,
          ccaAmount: H.val('#pr-cca-amt'), conveyanceAmount: H.val('#pr-conv-amt'),
          festivalAdvanceRepayMonths: H.val('#pr-fa-months'),
          medicalAllowanceAmount: H.val('#pr-med-amt'), medicalAllowanceMonth: H.val('#pr-med-month'),
          bonusMonth: H.val('#pr-bonus-month'), bonusResult: H.val('#pr-bonus-result'),
          bonusProfitPercent: H.val('#pr-bonus-profit-pct'), bonusProfitMaxAmount: H.val('#pr-bonus-profit-max'),
          bonusLossPercent: H.val('#pr-bonus-loss-pct'), bonusLossMaxAmount: H.val('#pr-bonus-loss-max'),
          stagnationYears: H.val('#pr-stag-years'), stagnationExtraStages: H.val('#pr-stag-stages'),
          retirementAge: H.val('#pr-retire-age'),
        }).then(function () { H.busy(btn, false); H.notice('#pr-notice', 'ok', 'Saved.'); })
          .catch(function (err) { H.busy(btn, false); H.notice('#pr-notice', 'error', err.message); });
      });
    }).catch(function (err) { H.$('#os').innerHTML = H.errorBox(err); });
  }

  // Per-organisation mandatory Employee fields (task 73). Every field
  // defaults to mandatory; an Org Admin may switch individual ones off for
  // this bank only — see src/services/orgFields.js.
  function drawMandatoryFields() {
    H.api('GET', '/org/mandatory-fields').then(function (res) {
      var fields = res.data.fields; var config = res.data.config;
      H.$('#os').innerHTML =
        '<div class="card"><h3>Mandatory employee fields</h3><div class="card-body"><div class="notice" id="mf-notice"></div>' +
          '<p class="small muted">These fields are required when creating or updating an employee record in ' + esc(H.user().organization.name) + '. ' +
          'Emp Code, Name, Date of Joining and Post are always required and cannot be turned off. Turning a field off here only affects this organisation — it does not change any other bank\'s policy.</p>' +
          '<form id="mf-form" novalidate><div class="grid-2">' +
          fields.map(function (f) {
            return H.checkbox('mf-' + f.key, f.label, !!config[f.key]);
          }).join('') +
          '</div><button type="submit" id="mf-save">Save</button></form>' +
        '</div></div>';
      H.on('#mf-form', 'submit', function (e) {
        e.preventDefault();
        var body = {};
        fields.forEach(function (f) { body[f.key] = H.$('#mf-' + f.key).checked; });
        var btn = H.$('#mf-save');
        H.busy(btn, true, 'Saving…');
        H.api('PUT', '/org/mandatory-fields', { config: body }).then(function () {
          H.busy(btn, false); H.notice('#mf-notice', 'ok', 'Saved.');
        }).catch(function (err) { H.busy(btn, false); H.notice('#mf-notice', 'error', err.message); });
      });
    }).catch(function (err) { H.$('#os').innerHTML = H.errorBox(err); });
  }

  // --------------------------------------------------- organisation profile

  var BOARD_ROLE_LABELS = {
    CHAIRMAN: 'Chairman', VICE_CHAIRMAN: 'Vice Chairman', MEMBER: 'Board member',
    MANAGING_DIRECTOR: 'Managing Director', GENERAL_MANAGER: 'General Manager',
    ASSISTANT_GENERAL_MANAGER: 'Assistant General Manager', OTHER: 'Other',
  };

  // Organisation Profile (task 75) — bank identity, branches, and board /
  // management members, used for document headers/footers (task 76) and
  // shown here for the Org Admin to maintain.
  function viewOrgProfile() {
    H.shell(H.pageHead('Organisation Profile', 'Your bank\'s registration details, branch offices and board/management members. Shown on downloaded documents.') +
      '<div class="notice" id="opr-notice"></div><div id="opr">' + H.loading() + '</div>');
    loadOrgProfile();
  }

  function loadOrgProfile() {
    H.api('GET', '/org/profile').then(function (res) {
      var d = res.data; var o = d.organization;
      H.$('#opr').innerHTML =
        '<div class="card"><h3>Bank identity</h3><div class="card-body">' +
          '<p class="small muted">This address is also shown on the footer of every downloaded document (payslips etc.) as the Head Office address.</p>' +
          '<form id="opr-form" novalidate><div class="grid-2">' +
            H.field('opr-year', 'Established year', H.input('opr-year', 'number', o.establishedYear, 'min="1800" max="' + new Date().getFullYear() + '"')) +
            H.field('opr-reg', 'Registration number', H.input('opr-reg', 'text', o.registrationNumber)) +
            H.field('opr-rbi-no', 'RBI licence number', H.input('opr-rbi-no', 'text', o.rbiLicenseNumber)) +
            H.field('opr-rbi-date', 'RBI licence date', H.input('opr-rbi-date', 'date', o.rbiLicenseDate)) +
            H.field('opr-gstn', 'GSTN', H.input('opr-gstn', 'text', o.gstn)) +
            H.field('opr-pan', 'PAN', H.input('opr-pan', 'text', o.panNumber)) +
          '</div>' + H.field('opr-address', 'Organisation address', H.textarea('opr-address', o.address)) +
          '<button type="submit" id="opr-save">Save</button></form>' +
        '</div></div>' +
        '<div id="opr-logo"></div>' +
        '<div class="card"><h3>Branches</h3><div class="card-body">' +
          '<div class="notice" id="brn-notice"></div>' +
          '<div id="brn-list">' + branchTable(d.branches) + '</div>' +
          branchForm(null) +
        '</div></div>' +
        '<div class="card"><h3>Board &amp; management</h3><div class="card-body">' +
          '<p class="small muted">Chairman, Vice Chairman, board members, Managing Director, General Manager and Assistant General Manager — with an optional photo.</p>' +
          '<div class="notice" id="brd-notice"></div>' +
          '<div id="brd-list">' + boardTable(d.board) + '</div>' +
          boardForm(null) +
        '</div></div>' +
        '<div class="card"><h3>Documents</h3><div class="card-body">' +
          '<p class="small muted">RBI licence, incorporation/registration certificate, PAN, GSTN, TAN, or any other statutory document you want on file for this bank (PDF, PNG, JPEG or WebP, up to 5 MB).</p>' +
          '<div class="notice" id="doc-notice"></div>' +
          '<div id="doc-list">' + docTable(d.documents) + '</div>' +
          docForm(d.documentTypes) +
        '</div></div>';

      H.logoUploader({
        el: H.$('#opr-logo'), id: 'oprlogo', title: 'Bank logo',
        description: 'Shown left-aligned on the header of every downloaded document (payslips etc.), alongside the bank name and registration number.',
        hasImage: !!d.logo, currentUrl: '/assets/org/' + encodeURIComponent(H.user().organization.code) + '/logo' + (d.logo ? '?v=' + d.logo.version : ''),
        currentUrlBase: '/assets/org/' + encodeURIComponent(H.user().organization.code) + '/logo',
        limitBytes: 512 * 1024, uploadPath: '/org/settings/logo', removePath: '/org/settings/logo',
        onChange: function () { H.refreshMe(); },
      });

      H.on('#opr-form', 'submit', function (e) {
        e.preventDefault();
        var btn = H.$('#opr-save');
        H.busy(btn, true, 'Saving…');
        H.api('PUT', '/org/profile', {
          establishedYear: H.val('#opr-year'), registrationNumber: H.val('#opr-reg'),
          rbiLicenseNumber: H.val('#opr-rbi-no'), rbiLicenseDate: H.val('#opr-rbi-date'),
          gstn: H.val('#opr-gstn'), panNumber: H.val('#opr-pan'), address: H.val('#opr-address'),
        }).then(function () { H.busy(btn, false); H.notice('#opr-notice', 'ok', 'Saved.'); H.refreshMe(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#opr-notice', 'error', err.message); });
      });

      wireBranchForm(null);
      wireBoardForm(null);
      wireDocForm();
      H.$$('#brn-list button[data-act]').forEach(function (b) { b.addEventListener('click', function () { branchAction(b); }); });
      H.$$('#brd-list button[data-act]').forEach(function (b) { b.addEventListener('click', function () { boardAction(b); }); });
      H.$$('#doc-list button[data-act]').forEach(function (b) { b.addEventListener('click', function () { docAction(b); }); });
    }).catch(function (err) { H.$('#opr').innerHTML = H.errorBox(err); });
  }

  function branchTable(rows) {
    if (!rows.length) return '<div class="empty">No branches added yet.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Code</th><th>Address</th><th>Phone</th><th>HO</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.code || '—') + '</td><td class="small">' + esc(r.address || '—') + '</td><td>' + esc(r.phone || '—') + '</td>' +
          '<td>' + (r.isHeadOffice ? H.badge('Head Office', 'ok') : '') + '</td>' +
          '<td class="actions"><button type="button" class="secondary sm" data-act="edit" data-id="' + r.id + '">Edit</button>' +
          '<button type="button" class="danger sm" data-act="del" data-id="' + r.id + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function branchForm(row) {
    var id = row ? row.id : 'new';
    return '<form class="inline-form-block" id="brn-form-' + id + '" data-id="' + id + '" novalidate><div class="grid-2">' +
      H.field('brn-name-' + id, 'Branch name', H.input('brn-name-' + id, 'text', row ? row.name : '')) +
      H.field('brn-code-' + id, 'Branch code', H.input('brn-code-' + id, 'text', row ? row.code : '')) +
      H.field('brn-phone-' + id, 'Phone', H.input('brn-phone-' + id, 'text', row ? row.phone : '')) +
      '<div>' + H.checkbox('brn-ho-' + id, 'Head Office', row ? !!row.isHeadOffice : false) + '</div>' +
      '</div>' + H.field('brn-addr-' + id, 'Address', H.textarea('brn-addr-' + id, row ? row.address : '')) +
      '<div class="btn-row"><button type="submit">' + (row ? 'Save' : 'Add branch') + '</button>' +
      (row ? '<button type="button" class="secondary" data-cancel="' + id + '">Cancel</button>' : '') + '</div></form>';
  }

  function wireBranchForm(row) {
    var id = row ? row.id : 'new';
    H.on('#brn-form-' + id, 'submit', function (e) {
      e.preventDefault();
      var body = {
        name: H.val('#brn-name-' + id), branchCode: H.val('#brn-code-' + id), phone: H.val('#brn-phone-' + id),
        address: H.val('#brn-addr-' + id), isHeadOffice: H.$('#brn-ho-' + id).checked,
      };
      if (!body.name) return H.notice('#brn-notice', 'error', 'Branch name is required.');
      var p = row ? H.api('PUT', '/org/profile/branches/' + row.id, body) : H.api('POST', '/org/profile/branches', body);
      p.then(function () { H.notice('#brn-notice', 'ok', 'Saved.'); loadOrgProfile(); })
        .catch(function (err) { H.notice('#brn-notice', 'error', err.message); });
    });
    if (row) H.on('[data-cancel="' + id + '"]', 'click', function () { loadOrgProfile(); });
  }

  function branchAction(b) {
    var id = b.getAttribute('data-id'); var act = b.getAttribute('data-act');
    if (act === 'del') {
      if (!window.confirm('Delete this branch?')) return;
      H.api('DELETE', '/org/profile/branches/' + id).then(function () { H.notice('#brn-notice', 'ok', 'Deleted.'); loadOrgProfile(); })
        .catch(function (err) { H.notice('#brn-notice', 'error', err.message); });
    } else if (act === 'edit') {
      H.api('GET', '/org/profile/branches').then(function (res) {
        var row = res.data.filter(function (r) { return String(r.id) === id; })[0];
        if (!row) return;
        var container = b.closest('tr'); var wrap = document.createElement('tr'); var td = document.createElement('td');
        td.colSpan = 6; td.innerHTML = branchForm(row); wrap.appendChild(td);
        container.parentNode.insertBefore(wrap, container.nextSibling);
        wireBranchForm(row);
      });
    }
  }

  function boardTable(rows) {
    if (!rows.length) return '<div class="empty">No board/management members added yet.</div>';
    return '<div class="table-wrap"><table><thead><tr><th></th><th>Name</th><th>Role</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var role = r.role === 'OTHER' ? esc(r.roleOther || 'Other') : esc(BOARD_ROLE_LABELS[r.role] || r.role);
        // A plain <img> can't carry an Authorization header, so this goes
        // through the public, org-code-keyed route (server.js), same as the
        // bank logo — not the authenticated /org/profile/board/:id/photo API.
        return '<tr><td>' + (r.hasPhoto ? '<img class="board-photo" src="/assets/org/' + encodeURIComponent(H.user().organization.code) + '/board/' + r.id + '/photo" alt="">' : '<span class="muted small">No photo</span>') + '</td>' +
          '<td>' + esc(r.name) + '</td><td>' + role + '</td>' +
          '<td class="actions"><button type="button" class="secondary sm" data-act="edit" data-id="' + r.id + '">Edit</button>' +
          '<button type="button" class="danger sm" data-act="del" data-id="' + r.id + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function boardForm(row) {
    var id = row ? row.id : 'new';
    var roleOpts = Object.keys(BOARD_ROLE_LABELS).map(function (k) { return [k, BOARD_ROLE_LABELS[k]]; });
    return '<form class="inline-form-block" id="brd-form-' + id + '" data-id="' + id + '" novalidate><div class="grid-2">' +
      H.field('brd-name-' + id, 'Name', H.input('brd-name-' + id, 'text', row ? row.name : '')) +
      H.field('brd-role-' + id, 'Role', H.select('brd-role-' + id, roleOpts, row ? row.role : 'MEMBER')) +
      H.field('brd-roleother-' + id, 'If "Other", designation', H.input('brd-roleother-' + id, 'text', row ? row.roleOther : '')) +
      H.field('brd-photo-' + id, 'Photo (PNG/JPEG/WebP, up to 512 KB)', '<input type="file" id="brd-photo-' + id + '" accept="image/png,image/jpeg,image/webp">') +
      '</div>' +
      (row && row.hasPhoto ? H.checkbox('brd-rmphoto-' + id, 'Remove current photo', false) : '') +
      '<div class="btn-row"><button type="submit">' + (row ? 'Save' : 'Add member') + '</button>' +
      (row ? '<button type="button" class="secondary" data-cancel="' + id + '">Cancel</button>' : '') + '</div></form>';
  }

  function wireBoardForm(row) {
    var id = row ? row.id : 'new';
    H.on('#brd-form-' + id, 'submit', function (e) {
      e.preventDefault();
      var body = { name: H.val('#brd-name-' + id), role: H.val('#brd-role-' + id), roleOther: H.val('#brd-roleother-' + id) };
      if (!body.name) return H.notice('#brd-notice', 'error', 'Name is required.');
      if (row && H.$('#brd-rmphoto-' + id) && H.$('#brd-rmphoto-' + id).checked) body.removePhoto = true;
      var fileInput = H.$('#brd-photo-' + id);
      var file = fileInput && fileInput.files && fileInput.files[0];
      var go = function () {
        var p = row ? H.api('PUT', '/org/profile/board/' + row.id, body) : H.api('POST', '/org/profile/board', body);
        p.then(function () { H.notice('#brd-notice', 'ok', 'Saved.'); loadOrgProfile(); })
          .catch(function (err) { H.notice('#brd-notice', 'error', err.message); });
      };
      if (file) {
        if (file.size > 512 * 1024) return H.notice('#brd-notice', 'error', 'That photo is ' + Math.ceil(file.size / 1024) + ' KB — the limit is 512 KB.');
        H.readAsDataUrl(file).then(function (dataUrl) { body.photoDataUrl = dataUrl; go(); })
          .catch(function (err) { H.notice('#brd-notice', 'error', err.message); });
      } else go();
    });
    if (row) H.on('[data-cancel="' + id + '"]', 'click', function () { loadOrgProfile(); });
  }

  function boardAction(b) {
    var id = b.getAttribute('data-id'); var act = b.getAttribute('data-act');
    if (act === 'del') {
      if (!window.confirm('Delete this board/management member?')) return;
      H.api('DELETE', '/org/profile/board/' + id).then(function () { H.notice('#brd-notice', 'ok', 'Deleted.'); loadOrgProfile(); })
        .catch(function (err) { H.notice('#brd-notice', 'error', err.message); });
    } else if (act === 'edit') {
      H.api('GET', '/org/profile/board').then(function (res) {
        var row = res.data.filter(function (r) { return String(r.id) === id; })[0];
        if (!row) return;
        var container = b.closest('tr'); var wrap = document.createElement('tr'); var td = document.createElement('td');
        td.colSpan = 4; td.innerHTML = boardForm(row); wrap.appendChild(td);
        container.parentNode.insertBefore(wrap, container.nextSibling);
        wireBoardForm(row);
      });
    }
  }

  // Statutory document uploads on Organisation Profile (task 79).
  var DOC_TYPE_LABELS = {
    RBI_LICENSE: 'RBI Licence', INCORPORATION_CERTIFICATE: 'Incorporation / Registration Certificate',
    PAN: 'PAN Card', GSTN: 'GST Registration Certificate', TAN: 'TAN Allotment Letter', OTHER: 'Other',
  };

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function docTable(rows) {
    if (!rows.length) return '<div class="empty">No documents uploaded yet.</div>';
    return '<div class="table-wrap"><table><thead><tr><th>Type</th><th>File</th><th>Size</th><th>Uploaded</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var typeLabel = r.docType === 'OTHER' && r.label ? esc(r.label) : esc(DOC_TYPE_LABELS[r.docType] || r.docType);
        return '<tr><td>' + typeLabel + (r.docType !== 'OTHER' && r.label ? '<div class="small muted">' + esc(r.label) + '</div>' : '') + '</td>' +
          '<td class="small">' + esc(r.fileName || '—') + '</td><td class="small">' + fmtBytes(r.sizeBytes) + '</td>' +
          '<td class="small">' + H.fmtDay(r.createdAt) + '</td>' +
          '<td class="actions"><button type="button" class="secondary sm" data-act="dl" data-id="' + r.id + '">Download</button>' +
          '<button type="button" class="danger sm" data-act="del" data-id="' + r.id + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function docForm(types) {
    var opts = (types && types.length ? types : Object.keys(DOC_TYPE_LABELS).map(function (k) { return { key: k, label: DOC_TYPE_LABELS[k] }; }))
      .map(function (t) { return [t.key, t.label]; });
    return '<form class="inline-form-block" id="doc-form" novalidate><div class="grid-2">' +
      H.field('doc-type', 'Document type', H.select('doc-type', opts, 'RBI_LICENSE')) +
      H.field('doc-label', 'Label', H.input('doc-label', 'text', '', 'placeholder="Required if type is Other"')) +
      H.field('doc-file', 'File (PDF, PNG, JPEG or WebP, up to 5 MB)', '<input type="file" id="doc-file" accept="application/pdf,image/png,image/jpeg,image/webp">') +
      '</div><div class="btn-row"><button type="submit">Upload</button></div></form>';
  }

  function wireDocForm() {
    H.on('#doc-form', 'submit', function (e) {
      e.preventDefault();
      var fileInput = H.$('#doc-file');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) return H.notice('#doc-notice', 'error', 'Choose a file to upload.');
      if (file.size > 5 * 1024 * 1024) return H.notice('#doc-notice', 'error', 'That file is ' + fmtBytes(file.size) + ' — the limit is 5 MB.');
      var docType = H.val('#doc-type'); var label = H.val('#doc-label');
      if (docType === 'OTHER' && !label) return H.notice('#doc-notice', 'error', 'Give a label for "Other" documents.');
      var btn = e.target.querySelector('button[type="submit"]');
      H.busy(btn, true, 'Uploading…');
      H.readAsDataUrl(file).then(function (dataUrl) {
        return H.api('POST', '/org/profile/documents', { docType: docType, label: label, fileName: file.name, fileDataUrl: dataUrl });
      }).then(function () { H.notice('#doc-notice', 'ok', 'Uploaded.'); loadOrgProfile(); })
        .catch(function (err) { H.busy(btn, false); H.notice('#doc-notice', 'error', err.message); });
    });
  }

  function docAction(b) {
    var id = b.getAttribute('data-id'); var act = b.getAttribute('data-act');
    if (act === 'del') {
      if (!window.confirm('Delete this document?')) return;
      H.api('DELETE', '/org/profile/documents/' + id).then(function () { H.notice('#doc-notice', 'ok', 'Deleted.'); loadOrgProfile(); })
        .catch(function (err) { H.notice('#doc-notice', 'error', err.message); });
    } else if (act === 'dl') {
      // Authenticated download — a plain <a href> can't carry the Bearer
      // token, so fetch the bytes ourselves and hand the browser a blob URL.
      var s = H.getSession();
      fetch('/api/v1/org/profile/documents/' + id + '/file', { headers: { Authorization: 'Bearer ' + (s && s.token) } })
        .then(function (res) {
          if (!res.ok) throw new Error('Download failed.');
          var cd = res.headers.get('Content-Disposition') || '';
          var m = /filename="([^"]*)"/.exec(cd);
          return res.blob().then(function (blob) { return { blob: blob, name: m ? m[1] : 'document' }; });
        })
        .then(function (r) {
          var url = URL.createObjectURL(r.blob);
          var a = document.createElement('a'); a.href = url; a.download = r.name; document.body.appendChild(a); a.click();
          document.body.removeChild(a); URL.revokeObjectURL(url);
        })
        .catch(function (err) { H.notice('#doc-notice', 'error', err.message); });
    }
  }

  // --------------------------------------------------------- year-end process

  // See src/routes/yearEnd.js, services/yearEnd.js. Closing a year is a
  // governance action (freezes a summary, blocks new payroll runs for any
  // month inside it) — reopening undoes that block.
  var YE_VIEWERS = { roles: ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'] };
  var YE_STATUS_KIND = { OPEN: '', CLOSED: 'ok' };

  function viewYearEndList() {
    var orgId = H.user().organizationId;
    H.shell(
      H.pageHead('Year-End Process', 'Close a year once its payroll is finalised — a closed year blocks new payroll runs for any month inside it until reopened.', '', [['Year-End Process']]) +
      '<div class="notice" id="ye-notice"></div>' +
      '<div class="card"><h3>Open / view a year</h3><div class="card-body"><div class="inline-form">' +
        H.field('ye-year-input', 'Year', H.input('ye-year-input', 'number', new Date().getFullYear(), 'min="2000" max="2100"')) +
        '<button type="button" id="ye-open">View / open</button></div></div></div>' +
      '<div class="card"><h3>Years on record</h3><div id="ye-list">' + H.loading() + '</div></div>'
    );
    H.on('#ye-open', 'click', function () {
      var y = H.val('#ye-year-input');
      if (!y) return H.notice('#ye-notice', 'error', 'Enter a year.');
      H.go('/year-end/' + y);
    });
    H.api('GET', '/organizations/' + orgId + '/year-end').then(function (res) {
      var rows = res.data;
      var el = H.$('#ye-list');
      if (!el) return;
      if (!rows.length) { el.innerHTML = '<div class="empty">No years touched yet — use the box above to open one.</div>'; return; }
      el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Year</th><th>Type</th><th>Period</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + r.year + '</td><td>' + (r.yearType === 'FINANCIAL' ? 'Financial' : 'Calendar') + '</td>' +
            '<td>' + H.fmtDay(r.startDate) + ' – ' + H.fmtDay(r.endDate) + '</td><td>' + H.badge(r.status, YE_STATUS_KIND[r.status]) + '</td>' +
            '<td><a href="#/year-end/' + r.year + '">View</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function (err) { var el = H.$('#ye-list'); if (el) el.innerHTML = H.errorBox(err); });
  }

  function viewYearEndDetail(params) {
    var year = params[0];
    var orgId = H.user().organizationId;
    var CLOSE_ROLES = ['ORG_ADMIN', 'APPROVING_AUTHORITY'];
    var REOPEN_ROLES = ['ORG_ADMIN'];
    function canClose() { return CLOSE_ROLES.indexOf(H.role()) >= 0 || H.role() === 'SUPER_ADMIN'; }
    function canReopen() { return REOPEN_ROLES.indexOf(H.role()) >= 0 || H.role() === 'SUPER_ADMIN'; }

    function draw(d) {
      var c = d.closure;
      var actions = '';
      if (c.status === 'OPEN' && canClose()) actions += '<button type="button" id="ye-close">Close year</button>';
      if (c.status === 'CLOSED' && canReopen()) actions += '<button type="button" class="secondary" id="ye-reopen">Reopen year</button>';
      H.shell(
        H.pageHead('Year ' + c.year, (c.yearType === 'FINANCIAL' ? 'Financial year' : 'Calendar year') + ' · ' + H.fmtDay(c.startDate) + ' – ' + H.fmtDay(c.endDate), actions, [['Year-End Process', '/year-end'], [String(c.year)]]) +
        '<div class="notice" id="ye-notice"></div>' +
        '<div class="card"><div class="card-body"><div class="grid-2">' +
          '<dl class="kv"><dt>Status</dt><dd>' + H.badge(c.status, YE_STATUS_KIND[c.status]) + '</dd>' +
            '<dt>Payroll runs included</dt><dd>' + d.payrollRunsIncluded + ' of ' + d.payrollRunsExpected + ' months</dd>' +
            (c.closedAt ? '<dt>Closed on</dt><dd>' + H.fmtDateTime(c.closedAt) + '</dd>' : '') +
          '</dl>' +
          '<dl class="kv"><dt>Total gross earnings</dt><dd>' + H.money(d.totals.grossEarnings) + '</dd>' +
            '<dt>Total deductions</dt><dd>' + H.money(d.totals.deductions) + '</dd>' +
            '<dt><strong>Total net pay</strong></dt><dd><strong>' + H.money(d.totals.netPay) + '</strong></dd>' +
          '</dl>' +
        '</div>' + (c.remarks ? '<p class="small muted">' + esc(c.remarks) + '</p>' : '') + '</div></div>' +
        '<div class="card"><h3>Payroll runs in this year</h3>' +
          (d.runs.length ? '<div class="table-wrap"><table><thead><tr><th>Month</th><th>Status</th><th>Gross</th><th>Deductions</th><th>Net</th></tr></thead><tbody>' +
            d.runs.map(function (r) {
              return '<tr><td>' + r.month + '/' + r.year + '</td><td>' + H.badge(r.status, r.status === 'PAID' ? 'ok' : '') + '</td>' +
                '<td>' + H.money(r.totalGrossEarnings) + '</td><td>' + H.money(r.totalDeductions) + '</td><td>' + H.money(r.totalNetPay) + '</td></tr>';
            }).join('') + '</tbody></table></div>' : '<div class="card-body"><p class="empty">No approved/paid payroll runs in this period yet.</p></div>') +
        '</div>'
      );
      H.on('#ye-close', 'click', function () {
        if (!window.confirm('Close year ' + c.year + '?\n\nThis blocks any new payroll run for a month inside this year until reopened.')) return;
        var btn = H.$('#ye-close'); H.busy(btn, true, 'Closing…');
        H.api('POST', '/organizations/' + orgId + '/year-end/' + year + '/close', {}).then(function () { reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#ye-notice', 'error', err.message); });
      });
      H.on('#ye-reopen', 'click', function () {
        if (!window.confirm('Reopen year ' + c.year + '? This allows payroll runs to be processed for it again.')) return;
        var btn = H.$('#ye-reopen'); H.busy(btn, true, 'Reopening…');
        H.api('POST', '/organizations/' + orgId + '/year-end/' + year + '/reopen', {}).then(function () { reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#ye-notice', 'error', err.message); });
      });
    }

    function reload() {
      return H.api('GET', '/organizations/' + orgId + '/year-end/' + year).then(function (res) { draw(res.data); });
    }

    H.shell(H.pageHead('Year ' + year, null) + H.loading());
    reload().catch(function (err) { H.shell(H.pageHead('Year ' + year, null) + H.errorBox(err)); });
  }

  function viewOrgAudit() {
    H.shell(H.pageHead('Audit log', 'Sign-ins, failed sign-ins and administrative changes in your organisation. Entries cannot be edited or deleted before their retention period expires.') + '<div id="audit"></div>');
    H.auditTable({ el: H.$('#audit'), path: '/org/audit' });
  }

  H.route('/dashboard', viewOrgDashboard, OA);
  H.route('/users', function (p, s) { H.usersView(H.user().organizationId, s); }, OA);
  H.route(/^\/org-settings(?:\/(branding|email|payroll|mandatory-fields))?$/, viewOrgSettings, OA);
  H.route('/org-profile', viewOrgProfile, OA);
  H.route('/audit', viewOrgAudit, OA);
  H.route('/year-end', viewYearEndList, YE_VIEWERS);
  H.route(/^\/year-end\/(\d+)$/, viewYearEndDetail, YE_VIEWERS);
})();
