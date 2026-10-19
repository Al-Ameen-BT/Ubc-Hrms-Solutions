/* Leave Policy — leave type master (Casual/Earned/Half Pay/Maternity/...),
 * seeding a KSR-style starting set, and running monthly/annual accrual.
 * See src/routes/leave.js (types router), services/leave.js.
 *
 * Per-employee leave balances, applications and File Leave live on the
 * Service Book (views-master.js viewServiceBook), not here.
 */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;

  var VIEWERS = { roles: ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'] };
  var WRITE_ROLES = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'];
  function canWrite() { return WRITE_ROLES.indexOf(H.role()) >= 0 || H.role() === 'SUPER_ADMIN'; }

  function label(v) {
    if (v === null || v === undefined || v === '') return '';
    return String(v).replace(/_/g, ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); });
  }

  var MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function viewLeaveTypes() {
    var writable = canWrite();
    var rows = []; var editing = null;

    H.shell(
      H.pageHead('Leave Policy', 'The leave types your bank offers — accrual method, annual entitlement and carry-forward rules.',
        (writable ? '<button type="button" id="lt-new">New leave type</button> <button type="button" class="secondary" id="lt-seed">Seed defaults</button>' : ''), [['Leave Policy']]) +
      '<div class="notice" id="lt-notice"></div>' +
      '<div class="card" id="lt-form-card" hidden><h3 id="lt-form-title"></h3><div class="card-body"><form id="lt-form" novalidate></form></div></div>' +
      '<div class="card" id="lt-accrue-card" hidden><h3>Run accrual</h3><div class="card-body"><div class="notice" id="lt-accrue-notice"></div><div id="lt-accrue-body"></div></div></div>' +
      '<div class="card"><div id="lt-list">' + H.loading() + '</div></div>'
    );

    function formHtml(row) {
      return '<div class="grid-2">' +
        H.field('ltf-code', 'Code', H.input('ltf-code', 'text', row ? row.code : ''), 'Short and unique, e.g. CL') +
        H.field('ltf-name', 'Name', H.input('ltf-name', 'text', row ? row.name : '')) +
        H.field('ltf-accrual', 'Accrual method', H.select('ltf-accrual', [['FIXED_ANNUAL', 'Fixed annual (credited once a year)'], ['ACCRUAL_PER_MONTH', 'Accrual per month'], ['NONE', 'Not balance-tracked']], row ? row.accrualMethod : 'FIXED_ANNUAL')) +
        H.field('ltf-days', 'Annual days', H.input('ltf-days', 'number', row ? row.annualDays : '', 'step="0.5" min="0"')) +
        H.field('ltf-max', 'Max accumulation (blank = unlimited)', H.input('ltf-max', 'number', row ? row.maxAccumulation : '', 'step="0.5" min="0"')) +
        H.field('ltf-paid', 'Paid % (of pay, while on this leave)', H.input('ltf-paid', 'number', row ? row.paidPercent : '100', 'step="1" min="0" max="100"')) +
      '</div>' +
      H.checkbox('ltf-carry', 'Carries forward to the next year', row ? !!row.carryForward : true) +
      H.checkbox('ltf-encash', 'Encashable', row ? !!row.encashable : false) +
      H.checkbox('ltf-approval', 'Requires approval before it is credited against the balance', row ? row.requiresApproval !== false : true) +
      H.field('ltf-remarks', 'Remarks', H.textarea('ltf-remarks', row ? row.remarks : ''));
    }

    function openForm(row) {
      editing = row;
      H.$('#lt-accrue-card').hidden = true;
      H.$('#lt-form-title').textContent = row ? 'Edit leave type' : 'New leave type';
      H.$('#lt-form').innerHTML = formHtml(row) +
        '<div class="btn-row"><button type="submit">' + (row ? 'Save changes' : 'Create') + '</button><button type="button" class="secondary" id="lt-cancel">Cancel</button></div>';
      H.$('#lt-form-card').hidden = false;
      H.on('#lt-cancel', 'click', function () { H.$('#lt-form-card').hidden = true; });
      H.$('#ltf-code').focus();
      H.$('#lt-form-card').scrollIntoView({ block: 'nearest' });
    }

    H.on('#lt-form', 'submit', function (e) {
      e.preventDefault();
      var body = {
        code: H.val('#ltf-code'), name: H.val('#ltf-name'), accrualMethod: H.val('#ltf-accrual'),
        annualDays: H.val('#ltf-days'), maxAccumulation: H.val('#ltf-max') || null, paidPercent: H.val('#ltf-paid'),
        carryForward: H.$('#ltf-carry').checked, encashable: H.$('#ltf-encash').checked, requiresApproval: H.$('#ltf-approval').checked,
        remarks: H.val('#ltf-remarks'),
      };
      var btn = e.target.querySelector('button[type="submit"]');
      H.busy(btn, true, 'Saving…');
      var p = editing ? H.api('PUT', '/leave-types/' + editing.id, body) : H.api('POST', '/leave-types', body);
      p.then(function () {
        H.$('#lt-form-card').hidden = true;
        H.notice('#lt-notice', 'ok', editing ? 'Saved.' : 'Leave type created.');
        load();
      }).catch(function (err) { H.busy(btn, false); H.notice('#lt-notice', 'error', err.message); });
    });

    H.on('#lt-seed', 'click', function () {
      var btn = H.$('#lt-seed');
      H.busy(btn, true, 'Seeding…');
      H.api('POST', '/leave-types/seed-defaults', {}).then(function () {
        H.busy(btn, false);
        H.notice('#lt-notice', 'ok', 'Default leave types added (existing codes were left untouched).');
        load();
      }).catch(function (err) { H.busy(btn, false); H.notice('#lt-notice', 'error', err.message); });
    });

    function openAccrue(row) {
      H.$('#lt-form-card').hidden = true;
      H.$('#lt-accrue-card').hidden = false;
      var now = new Date();
      H.$('#lt-accrue-body').innerHTML =
        '<p class="small muted">Credits ' + esc(row.code) + ' — ' + esc(row.name) + ' for every active employee, for the chosen month. Safe to re-run: an employee already credited that month is skipped.</p>' +
        '<div class="grid-2">' +
          H.field('lta-month', 'Month', H.select('lta-month', MONTH_NAMES.slice(1).map(function (m, i) { return [String(i + 1), m]; }), String(now.getMonth() + 1))) +
          H.field('lta-year', 'Year', H.input('lta-year', 'number', now.getFullYear())) +
        '</div><div class="btn-row"><button type="button" id="lta-run">Run accrual</button><button type="button" class="secondary" id="lta-cancel">Cancel</button></div>';
      H.on('#lta-cancel', 'click', function () { H.$('#lt-accrue-card').hidden = true; });
      H.on('#lta-run', 'click', function () {
        var btn = this; H.busy(btn, true, 'Running…');
        H.api('POST', '/leave-types/' + row.id + '/accrue', { year: H.val('#lta-year'), month: H.val('#lta-month') }).then(function (res) {
          H.busy(btn, false);
          H.notice('#lt-notice', 'ok', res.data.employeesCredited + ' employee(s) credited for ' + MONTH_NAMES[res.data.month] + ' ' + res.data.year + '.');
          H.$('#lt-accrue-card').hidden = true;
        }).catch(function (err) { H.busy(btn, false); H.notice('#lt-accrue-notice', 'error', err.message); });
      });
    }

    function draw() {
      if (!rows.length) { H.$('#lt-list').innerHTML = '<div class="empty">No leave types yet.' + (writable ? ' Use <strong>New leave type</strong> or <strong>Seed defaults</strong>.' : '') + '</div>'; return; }
      H.$('#lt-list').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Accrual</th><th>Annual days</th><th>Carry fwd</th><th>Paid %</th><th>Status</th>' + (writable ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          var acts = writable ?
            '<button type="button" class="secondary sm" data-act="edit" data-id="' + r.id + '">Edit</button>' +
            (r.accrualMethod !== 'NONE' ? '<button type="button" class="secondary sm" data-act="accrue" data-id="' + r.id + '">Accrue…</button>' : '') +
            '<button type="button" class="' + (r.status === 'ACTIVE' ? 'danger' : 'secondary') + ' sm" data-act="toggle" data-id="' + r.id + '">' + (r.status === 'ACTIVE' ? 'Deactivate' : 'Activate') + '</button>' : '';
          return '<tr' + (r.status !== 'ACTIVE' ? ' class="row-muted"' : '') + '><td><code class="inline">' + esc(r.code) + '</code></td><td>' + esc(r.name) + '</td>' +
            '<td>' + esc(label(r.accrualMethod)) + '</td><td>' + r.annualDays + '</td><td>' + (r.carryForward ? 'Yes' : 'No') + '</td><td>' + r.paidPercent + '%</td>' +
            '<td>' + H.statusBadge(r.status) + '</td>' + (writable ? '<td class="actions">' + acts + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
      H.$$('#lt-list button[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var row = rows.filter(function (x) { return String(x.id) === b.getAttribute('data-id'); })[0];
          var act = b.getAttribute('data-act');
          if (act === 'edit') return openForm(row);
          if (act === 'accrue') return openAccrue(row);
          if (act === 'toggle') {
            var to = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
            H.busy(b, true, '…');
            H.api('POST', '/leave-types/' + row.id + '/status', { status: to }).then(function () {
              H.notice('#lt-notice', 'ok', 'Saved.'); load();
            }).catch(function (err) { H.busy(b, false); H.notice('#lt-notice', 'error', err.message); });
          }
        });
      });
    }

    function load() {
      H.api('GET', '/leave-types').then(function (res) { rows = res.data; draw(); })
        .catch(function (err) { var el = H.$('#lt-list'); if (el) el.innerHTML = H.errorBox(err); });
    }

    load();
  }

  H.route('/leave-types', viewLeaveTypes, VIEWERS);
})();
