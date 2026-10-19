/* DA Arrears Management — see src/services/arrears.js and src/routes/arrears.js.
 *
 * Screens:
 *   /da-revisions            list of DA Revision orders + a "New revision" form
 *   /da-revisions/:id        one revision: fields, GO document, status
 *                             actions, "Calculate arrears" and the resulting
 *                             per-employee cases table
 *   /arrears-cases/:id       one employee's case: month-by-month calculation
 *                             ledger, Manual Adjustment, and the 3-mode
 *                             payment-plan builder (Single Shot / Installment
 *                             / Custom Installment), plus the installments table
 */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;

  var PROCESSORS = ['SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'];
  var APPROVERS = ['SUPER_ADMIN', 'ORG_ADMIN', 'APPROVING_AUTHORITY'];
  var VIEWERS = { roles: ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'] };

  var MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function monthLabel(y, m) { return MONTH_NAMES[m] + ' ' + y; }
  function monthOptions() { var o = []; for (var i = 1; i <= 12; i++) o.push([String(i), MONTH_NAMES[i]]); return o; }

  var REV_STATUS_KIND = { DRAFT: '', APPROVED: 'ok', ACTIVE: 'ok', CLOSED: 'warn' };
  var CASE_STATUS_KIND = { CALCULATED: '', PLAN_SET: 'ok', PARTIALLY_PAID: 'ok', FULLY_PAID: 'ok' };
  var NEXT_STATUS = { DRAFT: 'APPROVED', APPROVED: 'ACTIVE', ACTIVE: 'CLOSED' };

  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function downloadAuthed(path, filenameFallback, noticeSel) {
    var s = H.getSession();
    fetch('/api/v1' + path, { headers: { Authorization: 'Bearer ' + (s && s.token) } }).then(function (res) {
      if (!res.ok) throw new Error('Download failed.');
      var cd = res.headers.get('Content-Disposition') || '';
      var m = /filename="([^"]*)"/.exec(cd);
      return res.blob().then(function (blob) { return { blob: blob, name: m ? m[1] : filenameFallback }; });
    }).then(function (r) {
      var url = URL.createObjectURL(r.blob);
      var a = document.createElement('a'); a.href = url; a.download = r.name; document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }).catch(function (err) { if (noticeSel) H.notice(noticeSel, 'error', err.message); });
  }

  // --------------------------------------------------------------- list

  function viewDaRevisions() {
    var canCreate = PROCESSORS.indexOf(H.role()) >= 0;
    H.shell(
      H.pageHead('DA Arrears Management', 'Record a DA revision order, calculate the arrears it creates from its Effective From date, then decide how each employee is paid.', '', [['DA Arrears']]) +
      '<div class="notice" id="dr-notice"></div>' +
      (canCreate ? '<div class="card"><h3>New DA Revision</h3><div class="card-body">' + newRevisionForm() + '</div></div>' : '') +
      '<div class="card"><h3>Revisions</h3><div id="dr-list">' + H.loading() + '</div></div>'
    );

    function renderList(rows) {
      // The user may have already navigated off this list (e.g. clicked
      // into a revision) before this fetch resolves — #dr-list is then
      // gone from the DOM, so bail out rather than crashing on a null.
      var el = H.$('#dr-list');
      if (!el) return;
      if (!rows.length) { el.innerHTML = '<div class="card-body"><p class="empty">No DA revisions recorded yet.</p></div>'; return; }
      el.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
        '<th>Order No.</th><th>Order Date</th><th>Effective From</th><th>Previous DA %</th><th>Increase %</th><th>Revised DA %</th><th>Status</th><th></th>' +
        '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td><a href="#/da-revisions/' + r.id + '">' + esc(r.orderNumber) + '</a></td>' +
            '<td>' + H.fmtDay(r.orderDate) + '</td><td>' + H.fmtDay(r.effectiveFrom) + '</td>' +
            '<td>' + r.previousDaPercent + '%</td><td>' + r.increasePercent + '%</td><td><strong>' + r.revisedDaPercent + '%</strong></td>' +
            '<td>' + H.badge(r.status, REV_STATUS_KIND[r.status]) + '</td>' +
            '<td><a href="#/da-revisions/' + r.id + '">View</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    H.api('GET', '/da-revisions').then(function (res) { renderList(res.data); })
      .catch(function (err) { var el = H.$('#dr-list'); if (el) el.innerHTML = H.errorBox(err); });

    wireNewRevisionForm();
  }

  function newRevisionForm() {
    return '<form id="dr-new-form" novalidate><div class="grid-2">' +
      H.field('dr-orderNumber', 'Order Number', H.input('dr-orderNumber', 'text', '', 'placeholder="GO-DA-2026-XX" required')) +
      H.field('dr-orderDate', 'Order Date', H.input('dr-orderDate', 'date', '')) +
      H.field('dr-effectiveFrom', 'Effective From', H.input('dr-effectiveFrom', 'date', '')) +
      H.field('dr-effectiveTo', 'Effective To', H.input('dr-effectiveTo', 'date', ''), 'Leave blank if still open-ended.') +
      H.field('dr-previousDaPercent', 'Previous DA %', H.input('dr-previousDaPercent', 'number', '', 'step="0.001"')) +
      H.field('dr-increasePercent', 'Increase %', H.input('dr-increasePercent', 'number', '', 'step="0.001"')) +
      H.field('dr-applicableServiceCategory', 'Applicable Service Category', H.select('dr-applicableServiceCategory', [['ALL', 'All'], ['REGULAR', 'Regular'], ['PART_TIME_CONTINGENT', 'Part-Time Contingent']], 'ALL')) +
      H.field('dr-applicableEmployeeCategory', 'Applicable Employee Category', H.input('dr-applicableEmployeeCategory', 'text', 'ALL'), 'Match against an employee\'s Category field, or "ALL".') +
      '</div>' +
      H.field('dr-remarks', 'Remarks', H.textarea('dr-remarks', '', 'rows="2"')) +
      '<div class="btn-row"><button type="submit">Create revision (Draft)</button></div></form>';
  }

  function wireNewRevisionForm() {
    H.on('#dr-new-form', 'submit', function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type="submit"]');
      H.busy(btn, true, 'Saving…');
      H.api('POST', '/da-revisions', {
        orderNumber: H.val('#dr-orderNumber'), orderDate: H.val('#dr-orderDate'),
        effectiveFrom: H.val('#dr-effectiveFrom'), effectiveTo: H.val('#dr-effectiveTo') || null,
        previousDaPercent: H.val('#dr-previousDaPercent'), increasePercent: H.val('#dr-increasePercent'),
        applicableServiceCategory: H.$('#dr-applicableServiceCategory').value,
        applicableEmployeeCategory: H.val('#dr-applicableEmployeeCategory') || 'ALL',
        remarks: H.val('#dr-remarks'),
      }).then(function (res) { H.go('/da-revisions/' + res.data.id); })
        .catch(function (err) { H.busy(btn, false); H.notice('#dr-notice', 'error', err.message); });
    });
  }

  // ------------------------------------------------------------- detail

  function viewDaRevisionDetail(params) {
    var id = params[0];
    var revision = null; var cases = [];
    var canWrite = PROCESSORS.indexOf(H.role()) >= 0;

    function headerCard() {
      var actions = [];
      var next = NEXT_STATUS[revision.status];
      if (next) {
        var allowed = (revision.status === 'DRAFT' ? APPROVERS : PROCESSORS).indexOf(H.role()) >= 0;
        if (allowed) actions.push('<button type="button" id="dr-advance" data-to="' + next + '">Mark ' + next + '</button>');
      }
      if (canWrite && ['APPROVED', 'ACTIVE'].indexOf(revision.status) >= 0) actions.push('<button type="button" class="secondary" id="dr-calculate">Calculate arrears</button>');

      return H.pageHead(revision.orderNumber, null, actions.join(' '), [['DA Arrears', '/da-revisions'], [revision.orderNumber]]) +
        '<div class="notice" id="dr-notice"></div>' +
        '<div class="card"><div class="card-body"><div class="grid-2">' +
          '<dl class="kv"><dt>Status</dt><dd>' + H.badge(revision.status, REV_STATUS_KIND[revision.status]) + '</dd>' +
            '<dt>Order Date</dt><dd>' + H.fmtDay(revision.orderDate) + '</dd>' +
            '<dt>Effective From</dt><dd>' + H.fmtDay(revision.effectiveFrom) + '</dd>' +
            '<dt>Effective To</dt><dd>' + (revision.effectiveTo ? H.fmtDay(revision.effectiveTo) : 'Open-ended') + '</dd>' +
          '</dl>' +
          '<dl class="kv"><dt>Previous DA %</dt><dd>' + revision.previousDaPercent + '%</dd>' +
            '<dt>Increase %</dt><dd>' + revision.increasePercent + '%</dd>' +
            '<dt><strong>Revised DA %</strong></dt><dd><strong>' + revision.revisedDaPercent + '%</strong></dd>' +
            '<dt>Applies to</dt><dd>' + esc(revision.applicableServiceCategory) + (revision.applicableEmployeeCategory && revision.applicableEmployeeCategory !== 'ALL' ? ' · ' + esc(revision.applicableEmployeeCategory) : '') + '</dd>' +
          '</dl>' +
        '</div>' + (revision.remarks ? '<p class="small muted">' + esc(revision.remarks) + '</p>' : '') + '</div></div>';
    }

    function docCard() {
      var d = revision.document;
      return '<div class="card"><h3>Supporting Government Order document</h3><div class="card-body">' +
        (d ? '<p>' + esc(d.label || 'Document') + ' — ' + fmtBytes(d.sizeBytes) + ' <button type="button" class="secondary sm" id="dr-doc-dl">Download</button>' +
          (canWrite ? ' <button type="button" class="danger sm" id="dr-doc-del">Delete</button>' : '') + '</p>' :
          '<p class="empty">No document uploaded.</p>') +
        (canWrite ? '<form id="dr-doc-form" novalidate><div class="grid-2">' +
          H.field('dr-doc-label', 'Label', H.input('dr-doc-label', 'text', '', 'placeholder="Optional"')) +
          H.field('dr-doc-file', 'File (PDF/PNG/JPEG/WebP, up to 5 MB)', '<input type="file" id="dr-doc-file" accept="application/pdf,image/png,image/jpeg,image/webp">') +
          '</div><div class="btn-row"><button type="submit">Upload</button></div></form>' : '') +
        '</div></div>';
    }

    function casesCard() {
      if (!cases.length) return '<div class="card"><h3>Employee arrears cases</h3><div class="card-body"><p class="empty">Not calculated yet. Use "Calculate arrears" above once this revision is Approved or Active.</p></div></div>';
      var totalCalc = cases.reduce(function (s, c) { return s + Number(c.totalCalculatedAmount); }, 0);
      var totalEff = cases.reduce(function (s, c) { return s + Number(c.effectiveTotalAmount); }, 0);
      return '<div class="card"><h3>Employee arrears cases (' + cases.length + ')</h3>' +
        '<div class="table-wrap"><table><thead><tr><th>Emp. code</th><th>Name</th><th>Months</th><th>Calculated</th><th>Effective total</th><th>Payment mode</th><th>Status</th><th></th></tr></thead><tbody>' +
        cases.map(function (c) {
          return '<tr><td>' + esc(c.empCode) + '</td><td>' + esc(c.employeeName) + '</td><td>' + c.monthsCount + '</td>' +
            '<td>' + H.money(c.totalCalculatedAmount) + '</td><td><strong>' + H.money(c.effectiveTotalAmount) + '</strong></td>' +
            '<td>' + esc(c.paymentMode) + '</td><td>' + H.badge(c.status, CASE_STATUS_KIND[c.status]) + '</td>' +
            '<td><a href="#/arrears-cases/' + c.id + '">Manage</a></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="card-body small muted">Total calculated: ' + H.money(totalCalc) + ' · Total effective (after any adjustments): ' + H.money(totalEff) + '</div>' +
        '</div>';
    }

    function draw() {
      H.shell(headerCard() + docCard() + casesCard());
      wire();
    }

    function reload() {
      return Promise.all([H.api('GET', '/da-revisions/' + id), H.api('GET', '/da-revisions/' + id + '/cases')])
        .then(function (res) { revision = res[0].data; cases = res[1].data; draw(); });
    }

    function wire() {
      H.on('#dr-advance', 'click', function () {
        var to = this.getAttribute('data-to');
        if (!window.confirm('Move this revision to ' + to + '?')) return;
        var btn = this; H.busy(btn, true, 'Saving…');
        H.api('POST', '/da-revisions/' + id + '/status', { status: to }).then(function () { H.busy(btn, false); reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#dr-notice', 'error', err.message); });
      });
      H.on('#dr-calculate', 'click', function () {
        var msg = cases.length
          ? 'Recalculate arrears for every eligible employee? This replaces each case\'s month-by-month ledger and clears any pending (not-yet-paid) payment plan — cases with a paid installment are skipped with an error.'
          : 'Calculate arrears for every eligible employee under this revision, using each employee\'s actual applicable Basic Pay for each affected month?';
        if (!window.confirm(msg)) return;
        var btn = this; H.busy(btn, true, 'Calculating…');
        H.api('POST', '/da-revisions/' + id + '/calculate').then(function (res) {
          H.busy(btn, false);
          H.notice('#dr-notice', 'ok', 'Calculated for ' + res.data.employeeCount + ' employee(s), total ' + H.money(res.data.totalAmount) + '.');
          reload();
        }).catch(function (err) { H.busy(btn, false); H.notice('#dr-notice', 'error', err.message); });
      });
      H.on('#dr-doc-dl', 'click', function () { downloadAuthed('/da-revisions/' + id + '/document/file', 'document', '#dr-notice'); });
      H.on('#dr-doc-del', 'click', function () {
        if (!window.confirm('Delete this document?')) return;
        H.api('DELETE', '/da-revisions/' + id + '/document').then(function () { reload(); })
          .catch(function (err) { H.notice('#dr-notice', 'error', err.message); });
      });
      H.on('#dr-doc-form', 'submit', function (e) {
        e.preventDefault();
        var fileInput = H.$('#dr-doc-file');
        var file = fileInput && fileInput.files && fileInput.files[0];
        if (!file) return H.notice('#dr-notice', 'error', 'Choose a file to upload.');
        var btn = e.target.querySelector('button[type="submit"]');
        H.busy(btn, true, 'Uploading…');
        H.readAsDataUrl(file).then(function (dataUrl) {
          return H.api('POST', '/da-revisions/' + id + '/document', { label: H.val('#dr-doc-label'), dataUrl: dataUrl });
        }).then(function () { reload(); }).catch(function (err) { H.busy(btn, false); H.notice('#dr-notice', 'error', err.message); });
      });
    }

    H.shell(H.pageHead('DA Revision', null) + H.loading());
    reload().catch(function (err) { H.shell(H.pageHead('DA Revision', null) + H.errorBox(err)); });
  }

  // --------------------------------------------------------- case detail

  function monthsTable(months) {
    if (!months.length) return '<p class="empty">No months in range.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Month</th><th>Basic Pay applicable</th><th>Source</th><th>DA Difference %</th><th>Arrears amount</th></tr></thead><tbody>' +
      months.map(function (m) {
        var srcLabel = { PAYROLL_RUN: 'Payroll run', PAY_HISTORY: 'Pay history', CURRENT_ESTIMATE: 'Current pay (estimate)' }[m.basicPaySource] || m.basicPaySource;
        return '<tr><td>' + esc(monthLabel(m.year, m.month)) + '</td><td>' + H.money(m.basicPayApplicable) + '</td>' +
          '<td class="small">' + esc(srcLabel) + '</td><td>' + m.daDifferencePercent + '%</td><td>' + H.money(m.arrearsAmount) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function installmentsTable(installments, canWrite) {
    if (!installments.length) return '<p class="empty">No payment plan set yet.</p>';
    return '<p class="small muted">Arrears are paid separately from salary — use "Pay now" below to settle an installment on its own; it has nothing to do with any payroll run.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Month</th><th>Amount</th><th>Status</th><th>Paid on</th><th></th></tr></thead><tbody>' +
      installments.map(function (i) {
        var action = i.status === 'PAID'
          ? '<button type="button" class="secondary sm" data-receipt="' + i.id + '">Download receipt</button>'
          : (canWrite ? '<button type="button" class="sm" data-pay="' + i.id + '">Pay now</button>' : '');
        return '<tr><td>' + esc(monthLabel(i.year, i.month)) + '</td><td>' + H.money(i.amount) + '</td>' +
          '<td>' + H.badge(i.status, i.status === 'PAID' ? 'ok' : '') + '</td>' +
          '<td>' + (i.paidAt ? H.fmtDay(i.paidAt) : '—') + '</td>' +
          '<td>' + action + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function viewArrearsCaseDetail(params) {
    var id = params[0];
    var data = null;
    var canWrite = PROCESSORS.indexOf(H.role()) >= 0;
    var planMode = 'SINGLE_SHOT';

    function planForm() {
      if (!canWrite) return '';
      var hasPaid = data.installments.some(function (i) { return i.status === 'PAID'; });
      return '<div class="card"><h3>Set payment plan</h3><div class="card-body">' +
        (hasPaid ? '<p class="small muted">Part of this case has already been paid — a new plan replaces only the still-pending installments.</p>' : '') +
        '<div class="field"><label>Payment mode</label>' +
        H.select('acp-mode', [['SINGLE_SHOT', 'Single Shot'], ['INSTALLMENT', 'Installment (equal split)'], ['CUSTOM_INSTALLMENT', 'Custom Installment']], planMode) +
        '</div><div id="acp-mode-fields"></div>' +
        '<div class="btn-row"><button type="button" id="acp-save">Save payment plan</button> ' +
        '<button type="button" class="secondary" id="acp-clear">Clear pending plan</button></div>' +
        '</div></div>';
    }

    function modeFieldsHtml(mode) {
      var now = new Date();
      if (mode === 'SINGLE_SHOT') {
        return '<div class="grid-2">' + H.field('acp-ss-month', 'Target month', H.select('acp-ss-month', monthOptions(), String(now.getMonth() + 1))) +
          H.field('acp-ss-year', 'Target year', H.input('acp-ss-year', 'number', now.getFullYear())) + '</div>';
      }
      if (mode === 'INSTALLMENT') {
        return '<div class="grid-2">' + H.field('acp-in-count', 'Number of installments', H.input('acp-in-count', 'number', '6', 'min="1" max="60"')) +
          H.field('acp-in-month', 'Starting month', H.select('acp-in-month', monthOptions(), String(now.getMonth() + 1))) +
          H.field('acp-in-year', 'Starting year', H.input('acp-in-year', 'number', now.getFullYear())) + '</div>';
      }
      return H.field('acp-cu-rows', 'One "YYYY-MM amount" per line', H.textarea('acp-cu-rows', '', 'rows="6" placeholder="2026-10 15000\n2026-11 10000"'),
        'Must total the effective amount (' + H.money(data.case.effectiveTotalAmount) + ').');
    }

    function adjustForm() {
      if (!canWrite) return '';
      return '<div class="card"><h3>Manual adjustment</h3><div class="card-body">' +
        '<p class="small muted">Override the calculated total with a mandatory reason (spec payment mode 4). This clears any pending payment plan, since the total changes.</p>' +
        '<div class="grid-2">' +
        H.field('adj-amount', 'Approved amount', H.input('adj-amount', 'number', data.case.effectiveTotalAmount, 'step="0.01" min="0"')) +
        H.field('adj-reason', 'Reason (required)', H.textarea('adj-reason', '', 'rows="2"')) +
        '</div><div class="btn-row"><button type="button" id="adj-save">Save adjustment</button></div>' +
        '</div></div>';
    }

    function draw() {
      var c = data.case;
      H.shell(
        H.pageHead(c.employeeName + ' (' + c.empCode + ')', 'Arrears case under ' + (data.revision ? data.revision.orderNumber : ''), '', [['DA Arrears', '/da-revisions'], [data.revision ? data.revision.orderNumber : '', data.revision ? '/da-revisions/' + data.revision.id : ''], [c.employeeName]]) +
        '<div class="notice" id="ac-notice"></div>' +
        '<div class="card"><div class="card-body"><div class="grid-2">' +
          '<dl class="kv"><dt>Months covered</dt><dd>' + c.monthsCount + '</dd>' +
            '<dt>Calculated total</dt><dd>' + H.money(c.totalCalculatedAmount) + '</dd>' +
            (c.totalAdjustedAmount != null ? '<dt>Adjusted total</dt><dd>' + H.money(c.totalAdjustedAmount) + '</dd>' : '') +
          '</dl>' +
          '<dl class="kv"><dt><strong>Effective total</strong></dt><dd><strong>' + H.money(c.effectiveTotalAmount) + '</strong></dd>' +
            '<dt>Payment mode</dt><dd>' + esc(c.paymentMode) + '</dd>' +
            '<dt>Status</dt><dd>' + H.badge(c.status, CASE_STATUS_KIND[c.status]) + '</dd>' +
          '</dl>' +
        '</div>' + (c.adjustmentReason ? '<p class="small muted">Adjustment reason: ' + esc(c.adjustmentReason) + '</p>' : '') + '</div></div>' +
        '<div class="card"><h3>Month-by-month calculation</h3>' + monthsTable(data.months) + '</div>' +
        '<div class="card"><h3>Installments</h3>' + installmentsTable(data.installments, canWrite) + '</div>' +
        adjustForm() + planForm()
      );
      wire();
    }

    function reload() {
      return H.api('GET', '/arrears-cases/' + id).then(function (res) { data = res.data; draw(); });
    }

    function wire() {
      H.on('#adj-save', 'click', function () {
        var btn = this; H.busy(btn, true, 'Saving…');
        H.api('PUT', '/arrears-cases/' + id + '/adjust', { approvedAmount: H.val('#adj-amount'), reason: H.val('#adj-reason') })
          .then(function () { H.busy(btn, false); reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#ac-notice', 'error', err.message); });
      });
      var modeFieldsEl = H.$('#acp-mode-fields');
      if (modeFieldsEl) modeFieldsEl.innerHTML = modeFieldsHtml(planMode);
      H.on('#acp-mode', 'change', function () { planMode = this.value; H.$('#acp-mode-fields').innerHTML = modeFieldsHtml(planMode); });
      H.on('#acp-save', 'click', function () {
        var btn = this; var body = { mode: planMode };
        if (planMode === 'SINGLE_SHOT') { body.year = H.val('#acp-ss-year'); body.month = H.$('#acp-ss-month').value; }
        else if (planMode === 'INSTALLMENT') { body.numberOfInstallments = H.val('#acp-in-count'); body.startYear = H.val('#acp-in-year'); body.startMonth = H.$('#acp-in-month').value; }
        else {
          var text = H.val('#acp-cu-rows');
          var rows = [];
          var bad = false;
          text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).forEach(function (line) {
            var m = /^(\d{4})-(\d{1,2})\s+([\d.]+)$/.exec(line);
            if (!m) { bad = true; return; }
            rows.push({ year: Number(m[1]), month: Number(m[2]), amount: Number(m[3]) });
          });
          if (bad || !rows.length) { H.notice('#ac-notice', 'error', 'Each line must read "YYYY-MM amount", e.g. "2026-10 15000".'); return; }
          body.installments = rows;
        }
        H.busy(btn, true, 'Saving…');
        H.api('POST', '/arrears-cases/' + id + '/payment-plan', body).then(function () { H.busy(btn, false); reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#ac-notice', 'error', err.message); });
      });
      H.on('#acp-clear', 'click', function () {
        if (!window.confirm('Clear the pending (not-yet-paid) part of this payment plan?')) return;
        var btn = this; H.busy(btn, true, 'Saving…');
        H.api('DELETE', '/arrears-cases/' + id + '/payment-plan').then(function () { H.busy(btn, false); reload(); })
          .catch(function (err) { H.busy(btn, false); H.notice('#ac-notice', 'error', err.message); });
      });
      document.querySelectorAll('[data-pay]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var installmentId = this.getAttribute('data-pay');
          if (!window.confirm('Pay this installment now? This is a standalone payment, separate from salary — it will be recorded on the employee\'s Service Book and a PDF receipt will become available. This cannot be undone.')) return;
          H.busy(this, true, 'Paying…');
          H.api('POST', '/arrears-cases/' + id + '/installments/' + installmentId + '/pay', {})
            .then(function () { reload(); })
            .catch(function (err) { H.busy(btn, false); H.notice('#ac-notice', 'error', err.message); });
        });
      });
      document.querySelectorAll('[data-receipt]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var installmentId = this.getAttribute('data-receipt');
          downloadAuthed('/arrears-cases/' + id + '/installments/' + installmentId + '/receipt.pdf', 'arrears-receipt.pdf', '#ac-notice');
        });
      });
    }

    H.shell(H.pageHead('Arrears case', null) + H.loading());
    reload().catch(function (err) { H.shell(H.pageHead('Arrears case', null) + H.errorBox(err)); });
  }

  H.route('/da-revisions', viewDaRevisions, VIEWERS);
  H.route(/^\/da-revisions\/(\d+)$/, viewDaRevisionDetail, VIEWERS);
  H.route(/^\/arrears-cases\/(\d+)$/, viewArrearsCaseDetail, VIEWERS);
})();
