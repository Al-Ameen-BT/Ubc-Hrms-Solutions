/* Payroll engine — the monthly payroll RUN, layered on top of the
 * per-employee "Estimated payslip" preview (see payslipCard etc. in
 * views-master.js, reused here for the drill-down on one employee's
 * frozen payslip line).
 *
 * Screens:
 *   /payroll            list of past runs for this organisation + a
 *                        "Process payroll" form (year/month -> new run)
 *   /payroll/:id         one run's totals + every employee's line,
 *                        approve/reject/mark-paid actions, CSV downloads
 */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;

  var PROCESSORS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'];
  var APPROVERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'APPROVING_AUTHORITY'];
  // Everyone who can see the Payroll screen at all (mirrors the backend's VIEWERS list, minus SUPER_ADMIN who administers the platform, not a bank's own runs).
  var PAYROLL_VIEWERS = { roles: ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'] };

  var MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function monthLabel(run) { return MONTH_NAMES[run.month] + ' ' + run.year; }

  var STATUS_KIND = { PROCESSED: '', APPROVED: 'ok', REJECTED: 'warn', PAID: 'ok' };

  function orgId() { return H.user().organizationId; }
  function base() { return '/organizations/' + orgId() + '/payroll-runs'; }

  function downloadCsv(path, filename, noticeSel) {
    var s = H.getSession();
    fetch('/api/v1' + base() + path, { headers: { Authorization: 'Bearer ' + (s && s.token) } })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (j) { throw new Error((j && j.message) || 'Download failed.'); });
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      })
      .catch(function (err) { if (noticeSel) H.notice(noticeSel, 'error', err.message); });
  }

  // --------------------------------------------------------------- list

  function viewPayrollRuns() {
    var canProcess = PROCESSORS.indexOf(H.role()) >= 0;
    var now = new Date();

    H.shell(
      H.pageHead('Payroll', 'Process a monthly payroll run for every active employee at once, then route it through approval before disbursement.', '', [['Payroll']]) +
      '<div class="notice" id="pr-notice"></div>' +
      (canProcess ? '<div class="card"><h3>Process payroll</h3><div class="card-body">' +
        '<p class="small muted">Computes and freezes an estimated payslip for every active employee for the chosen month. Re-processing a month that is still "Processed" (not yet approved) recalculates and replaces it — nothing is final until it\'s approved.</p>' +
        '<div class="inline-form">' +
          H.select('pr-month', MONTH_NAMES.slice(1).map(function (m, i) { return [String(i + 1), m]; }), String(now.getMonth() + 1)) +
          '<input type="number" id="pr-year" class="year-input" value="' + now.getFullYear() + '" min="2000" max="2100">' +
          '<button type="button" id="pr-process">Process payroll</button>' +
        '</div>' +
      '</div></div>' : '') +
      '<div class="card"><h3>Runs</h3><div id="pr-list">' + H.loading() + '</div></div>'
    );

    function renderList(runs) {
      if (!runs.length) { H.$('#pr-list').innerHTML = '<div class="card-body"><p class="empty">No payroll has been processed yet.</p></div>'; return; }
      H.$('#pr-list').innerHTML = '<div class="table-wrap"><table><thead><tr>' +
        '<th>Month</th><th>Status</th><th>Employees</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Processed</th><th></th>' +
        '</tr></thead><tbody>' +
        runs.map(function (r) {
          return '<tr>' +
            '<td><a href="#/payroll/' + r.id + '">' + esc(monthLabel(r)) + '</a></td>' +
            '<td>' + H.badge(r.status, STATUS_KIND[r.status]) + '</td>' +
            '<td>' + r.employeeCount + '</td>' +
            '<td>' + H.money(r.totalGrossEarnings) + '</td>' +
            '<td>' + H.money(r.totalDeductions) + '</td>' +
            '<td><strong>' + H.money(r.totalNetPay) + '</strong></td>' +
            '<td>' + H.fmtDateTime(r.processedAt) + '</td>' +
            '<td><a href="#/payroll/' + r.id + '">View</a></td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>';
    }

    H.api('GET', base()).then(function (res) { renderList(res.data); })
      .catch(function (err) { H.$('#pr-list').innerHTML = H.errorBox(err); });

    H.on('#pr-process', 'click', function () {
      var btn = this; H.busy(btn, true, 'Processing…');
      H.api('POST', base(), { year: Number(H.val('#pr-year')), month: Number(H.$('#pr-month').value) }).then(function (res) {
        var run = res.data;
        // Sending payslips isn't gated to this moment — it's always
        // available from the run's own page too — but this is the most
        // natural point to offer it, right after a run has numbers to send.
        // Wait for the send to finish (or fail) before navigating, so the
        // run page's per-employee "Payslip email" column already reflects
        // it on first load rather than racing that page's own load.
        if (window.confirm('Payroll processed for ' + run.employeeCount + ' employee(s). Email the payslip PDF to everyone now?\n\n(You can also send or resend payslips at any time from the run\'s page.)')) {
          H.busy(btn, true, 'Sending payslips…');
          H.api('POST', base() + '/' + run.id + '/send-payslips', {}).then(function () {
            H.busy(btn, false); H.go('/payroll/' + run.id);
          }).catch(function () { H.busy(btn, false); H.go('/payroll/' + run.id); });
        } else {
          H.busy(btn, false); H.go('/payroll/' + run.id);
        }
      }).catch(function (err) { H.busy(btn, false); H.notice('#pr-notice', 'error', err.message); });
    });
  }

  // ------------------------------------------------------------- detail

  function runHeaderCard(run) {
    var canApprove = APPROVERS.indexOf(H.role()) >= 0;
    var canProcess = PROCESSORS.indexOf(H.role()) >= 0;
    var actions = [];
    if (run.status === 'PROCESSED') {
      if (canApprove) { actions.push('<button type="button" id="pr-approve">Approve</button>'); actions.push('<button type="button" class="secondary" id="pr-reject">Reject</button>'); }
      if (canProcess) actions.push('<button type="button" class="secondary" id="pr-reprocess">Re-process</button>');
      if (canProcess) actions.push('<button type="button" class="danger" id="pr-delete">Delete</button>');
    } else if (run.status === 'REJECTED') {
      if (canProcess) actions.push('<button type="button" class="danger" id="pr-delete">Delete</button>');
    } else if (run.status === 'APPROVED') {
      if (canApprove) actions.push('<button type="button" id="pr-mark-paid">Mark as paid</button>');
    }
    actions.push('<button type="button" class="secondary" id="pr-register-csv">Download register (CSV)</button>');
    if (run.status === 'APPROVED' || run.status === 'PAID') actions.push('<button type="button" class="secondary" id="pr-bank-csv">Download bank transfer file (CSV)</button>');
    // Payslips can be emailed at any time after processing, for any run
    // status except REJECTED (a rejected run's numbers were wrong, so its
    // payslips should never reach anyone) — not just right after processing,
    // so a run can be re-sent later or sent to stragglers.
    if (run.status !== 'REJECTED' && canProcess) actions.push('<button type="button" class="secondary" id="pr-send-payslips">Send payslips</button>');

    return H.pageHead(monthLabel(run) + ' payroll', null, actions.join(' '), [['Payroll', '/payroll'], [monthLabel(run)]]) +
      '<div class="notice" id="pr-notice"></div>' +
      (run.status === 'REJECTED' && run.rejectionReason ? '<div class="notice warn">Rejected: ' + esc(run.rejectionReason) + '</div>' : '') +
      '<div class="card"><div class="card-body"><div class="grid-2">' +
        '<dl class="kv"><dt>Status</dt><dd>' + H.badge(run.status, STATUS_KIND[run.status]) + '</dd>' +
          '<dt>Employees</dt><dd>' + run.employeeCount + '</dd>' +
          '<dt>Processed</dt><dd>' + H.fmtDateTime(run.processedAt) + '</dd>' +
          (run.approvedAt ? '<dt>Approved</dt><dd>' + H.fmtDateTime(run.approvedAt) + '</dd>' : '') +
          (run.paidAt ? '<dt>Paid</dt><dd>' + H.fmtDateTime(run.paidAt) + '</dd>' : '') +
        '</dl>' +
        '<dl class="kv"><dt>Total gross earnings</dt><dd>' + H.money(run.totalGrossEarnings) + '</dd>' +
          '<dt>Total deductions</dt><dd>' + H.money(run.totalDeductions) + '</dd>' +
          '<dt><strong>Total net pay</strong></dt><dd><strong>' + H.money(run.totalNetPay) + '</strong></dd>' +
        '</dl>' +
      '</div></div></div>';
  }

  function viewPayrollRunDetail(params) {
    var runId = params[0];
    var run = null; var lines = [];
    var openLineId = null;

    function payslipStatusCell(l) {
      var canProcess = PROCESSORS.indexOf(H.role()) >= 0;
      var status = l.payslipEmailError ? H.badge('Failed', 'warn') : (l.payslipEmailedAt ? H.badge('Sent ' + H.fmtDateTime(l.payslipEmailedAt), 'ok') : H.badge('Not sent', ''));
      var title = l.payslipEmailError ? ' title="' + esc(l.payslipEmailError) + '"' : '';
      var resend = canProcess && run.status !== 'REJECTED'
        ? ' <button type="button" class="link pr-line-send" data-emp="' + l.employeeId + '">' + (l.payslipEmailedAt || l.payslipEmailError ? 'Resend' : 'Send') + '</button>'
        : '';
      return '<span' + title + '>' + status + '</span>' + resend;
    }

    function draw() {
      H.shell(
        runHeaderCard(run) +
        '<div class="card"><h3>Employees</h3><div class="table-wrap"><table><thead><tr>' +
          '<th>Emp. code</th><th>Name</th><th>Post</th><th>LOP days</th><th>Gross</th><th>Deductions</th><th>Net pay</th><th>Bank details</th><th>Payslip email</th><th></th>' +
          '</tr></thead><tbody>' +
          lines.map(function (l) {
            return '<tr><td>' + esc(l.empCode) + '</td><td>' + esc(l.employeeName) + '</td><td>' + esc(l.postName || '—') + '</td>' +
              '<td>' + (Number(l.lopDays) > 0 ? l.lopDays : '—') + '</td>' +
              '<td>' + H.money(l.grossEarnings) + '</td><td>' + H.money(l.totalDeductions) + '</td><td><strong>' + H.money(l.netPay) + '</strong></td>' +
              '<td>' + (l.hasBankDetails ? H.badge('On file', 'ok') : H.badge('Missing', 'warn')) + '</td>' +
              '<td>' + payslipStatusCell(l) + '</td>' +
              '<td><button type="button" class="link pr-line-toggle" data-emp="' + l.employeeId + '">' + (openLineId === l.employeeId ? 'Hide' : 'View payslip') + '</button></td>' +
              '</tr>' +
              (openLineId === l.employeeId ? '<tr><td colspan="10"><div id="pr-line-detail">' + H.loading() + '</div></td></tr>' : '');
          }).join('') +
          '</tbody></table></div>' +
          (!lines.length ? '<div class="card-body"><p class="empty">No employees were active for this run.</p></div>' : '') +
        '</div>'
      );
      wire();
      if (openLineId) loadLine(openLineId);
    }

    function loadLine(empId) {
      H.api('GET', base() + '/' + run.id + '/lines/' + empId).then(function (res) {
        var el = H.$('#pr-line-detail'); if (!el) return;
        var p = res.data.payslip;
        var downloadInfo = { buttonId: 'pr-line-pdf', heading: 'Payslip — ' + monthLabel(run), path: base() + '/' + run.id + '/lines/' + empId + '/payslip.pdf', filename: 'payslip-' + empId + '-' + run.year + '-' + run.month + '.pdf', notice: '#pr-notice' };
        el.innerHTML = window.HRMS.payslipCard ? window.HRMS.payslipCard(p, downloadInfo) : '<pre>' + esc(JSON.stringify(p, null, 2)) + '</pre>';
        if (window.HRMS.wirePayslipDownload) window.HRMS.wirePayslipDownload(downloadInfo);
      }).catch(function (err) { var el = H.$('#pr-line-detail'); if (el) el.innerHTML = H.errorBox(err); });
    }

    function reload() {
      return Promise.all([
        H.api('GET', base() + '/' + runId),
        H.api('GET', base() + '/' + runId + '/lines'),
      ]).then(function (res) { run = res[0].data; lines = res[1].data; draw(); });
    }

    function wire() {
      H.$$('.pr-line-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var empId = Number(btn.dataset.emp);
          openLineId = openLineId === empId ? null : empId;
          draw();
        });
      });
      H.on('#pr-approve', 'click', function () {
        if (!window.confirm('Approve ' + monthLabel(run) + ' payroll for ' + run.employeeCount + ' employee(s)? Once approved, this run is locked and cannot be re-processed.')) return;
        var btn = this; H.busy(btn, true, 'Approving…');
        H.api('POST', base() + '/' + run.id + '/approve').then(function () { H.busy(btn, false); reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#pr-notice', 'error', err.message); });
      });
      H.on('#pr-reject', 'click', function () {
        var reason = window.prompt('Reason for rejecting this run (optional):') || '';
        var btn = this; H.busy(btn, true, 'Rejecting…');
        H.api('POST', base() + '/' + run.id + '/reject', { reason: reason }).then(function () { H.busy(btn, false); reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#pr-notice', 'error', err.message); });
      });
      H.on('#pr-reprocess', 'click', function () {
        if (!window.confirm('Re-process ' + monthLabel(run) + ' payroll from the latest employee data? This replaces every line in this run.')) return;
        var btn = this; H.busy(btn, true, 'Processing…');
        H.api('POST', base(), { year: run.year, month: run.month }).then(function () { H.busy(btn, false); reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#pr-notice', 'error', err.message); });
      });
      H.on('#pr-mark-paid', 'click', function () {
        if (!window.confirm('Mark ' + monthLabel(run) + ' payroll as paid out? This is a record-keeping step and does not itself move any money.')) return;
        var btn = this; H.busy(btn, true, 'Saving…');
        H.api('POST', base() + '/' + run.id + '/mark-paid').then(function () { H.busy(btn, false); reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#pr-notice', 'error', err.message); });
      });
      H.on('#pr-delete', 'click', function () {
        if (!window.confirm('Delete this ' + monthLabel(run) + ' payroll run? This cannot be undone.')) return;
        H.api('DELETE', base() + '/' + run.id).then(function () { H.go('/payroll'); })
          .catch(function (err) { H.notice('#pr-notice', 'error', err.message); });
      });
      H.on('#pr-register-csv', 'click', function () {
        downloadCsv('/' + run.id + '/register.csv', 'payroll-register-' + run.year + '-' + run.month + '.csv', '#pr-notice');
      });
      H.on('#pr-bank-csv', 'click', function () {
        downloadCsv('/' + run.id + '/bank-transfer.csv', 'bank-transfer-' + run.year + '-' + run.month + '.csv', '#pr-notice');
      });
      H.on('#pr-send-payslips', 'click', function () {
        if (!window.confirm('Email the payslip PDF to every employee (' + lines.length + ') in this run?')) return;
        sendPayslips(this, null);
      });
      H.$$('.pr-line-send').forEach(function (btn) {
        btn.addEventListener('click', function () { sendPayslips(btn, [Number(btn.dataset.emp)]); });
      });
    }

    // employeeIds: null = every employee in the run (see backend's
    // POST .../send-payslips, which treats an omitted list the same way).
    function sendPayslips(btn, employeeIds) {
      H.busy(btn, true, 'Sending…');
      H.api('POST', base() + '/' + run.id + '/send-payslips', employeeIds ? { employeeIds: employeeIds } : {}).then(function (res) {
        H.busy(btn, false);
        var d = res.data;
        var kind = d.failed ? 'error' : 'ok';
        H.notice('#pr-notice', kind, d.sent + ' of ' + d.total + ' payslip(s) emailed successfully' + (d.failed ? '; ' + d.failed + ' failed — see the Payslip email column for details.' : '.'));
        reload();
      }).catch(function (err) { H.busy(btn, false); H.notice('#pr-notice', 'error', err.message); });
    }

    H.shell(H.pageHead('Payroll', null) + H.loading());
    reload().catch(function (err) { H.shell(H.pageHead('Payroll', null) + H.errorBox(err)); });
  }

  H.route('/payroll', viewPayrollRuns, PAYROLL_VIEWERS);
  H.route(/^\/payroll\/(\d+)$/, viewPayrollRunDetail, PAYROLL_VIEWERS);
})();
