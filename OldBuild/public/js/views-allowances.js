/* Allowances — admin-defined allowance master, on top of the fixed set
 * (DA/HRA/Risk/Other/CCA/Conveyance/Medical/Bonus) services/payslip.js
 * already computes. See src/routes/allowanceTypes.js, services/allowances.js.
 *
 * Screen: /allowances — list, create/edit form, ACTIVE/INACTIVE toggle,
 * and a "Posts" panel to restrict an allowance to specific Post Cadres
 * (empty selection = applies to every post).
 */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;

  var VIEWERS = { roles: ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'] };
  var WRITE_ROLES = ['ORG_ADMIN', 'HR_ADMIN'];
  function canWrite() { return WRITE_ROLES.indexOf(H.role()) >= 0 || H.role() === 'SUPER_ADMIN'; }

  function label(v) {
    if (v === null || v === undefined || v === '') return '';
    return String(v).replace(/_/g, ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); });
  }

  function viewAllowances() {
    var writable = canWrite();
    var rows = []; var posts = []; var editing = null;

    H.shell(
      H.pageHead('Allowances', 'Admin-defined allowances on top of DA/HRA and the other standard pay elements — add a new one without a code change.',
        writable ? '<button type="button" id="al-new">New allowance</button>' : '', [['Allowances']]) +
      '<div class="notice" id="al-notice"></div>' +
      '<div class="card" id="al-form-card" hidden><h3 id="al-form-title"></h3><div class="card-body"><form id="al-form" novalidate></form></div></div>' +
      '<div class="card" id="al-posts-card" hidden><h3>Applicable posts</h3><div class="card-body"><div class="notice" id="al-posts-notice"></div><div id="al-posts-body"></div></div></div>' +
      '<div class="card"><div id="al-list">' + H.loading() + '</div></div>'
    );

    function fieldEl(id) { var el = H.$('#' + id); return el ? el.closest('.field') : null; }

    function formHtml(row) {
      return '<div class="grid-2">' +
        H.field('af-name', 'Name', H.input('af-name', 'text', row ? row.name : '')) +
        H.field('af-frequency', 'Frequency', H.select('af-frequency', [['MONTHLY', 'Monthly'], ['YEARLY', 'Yearly'], ['ONE_TIME', 'One-time']], row ? row.frequency : 'MONTHLY')) +
        H.field('af-month', 'Month (1–12)', H.input('af-month', 'number', row ? row.month : '', 'min="1" max="12"'), 'Required for Yearly/One-time.') +
        H.field('af-year', 'Year', H.input('af-year', 'number', row ? row.year : '', 'min="2000" max="2100"'), 'Required for One-time only.') +
        H.field('af-amount', 'Amount (₹)', H.input('af-amount', 'number', row ? row.amount : '', 'step="0.01" min="0.01"')) +
      '</div>' + H.field('af-remarks', 'Remarks', H.textarea('af-remarks', row ? row.remarks : ''));
    }

    function applyFreqVisibility() {
      var freq = H.val('#af-frequency');
      var mf = fieldEl('af-month'); var yf = fieldEl('af-year');
      if (mf) mf.hidden = freq === 'MONTHLY';
      if (yf) yf.hidden = freq !== 'ONE_TIME';
    }

    function openForm(row) {
      editing = row;
      H.$('#al-posts-card').hidden = true;
      H.$('#al-form-title').textContent = row ? 'Edit allowance' : 'New allowance';
      H.$('#al-form').innerHTML = formHtml(row) +
        '<div class="btn-row"><button type="submit">' + (row ? 'Save changes' : 'Create') + '</button><button type="button" class="secondary" id="al-cancel">Cancel</button></div>';
      H.$('#al-form-card').hidden = false;
      H.on('#al-cancel', 'click', function () { H.$('#al-form-card').hidden = true; });
      H.on('#af-frequency', 'change', applyFreqVisibility);
      applyFreqVisibility();
      H.$('#af-name').focus();
      H.$('#al-form-card').scrollIntoView({ block: 'nearest' });
    }

    H.on('#al-form', 'submit', function (e) {
      e.preventDefault();
      var body = {
        name: H.val('#af-name'), frequency: H.val('#af-frequency'),
        month: H.val('#af-month') || null, year: H.val('#af-year') || null,
        amount: H.val('#af-amount'), remarks: H.val('#af-remarks'),
      };
      var btn = e.target.querySelector('button[type="submit"]');
      H.busy(btn, true, 'Saving…');
      var p = editing ? H.api('PUT', '/allowance-types/' + editing.id, body) : H.api('POST', '/allowance-types', body);
      p.then(function () {
        H.$('#al-form-card').hidden = true;
        H.notice('#al-notice', 'ok', editing ? 'Saved.' : 'Allowance created.');
        load();
      }).catch(function (err) { H.busy(btn, false); H.notice('#al-notice', 'error', err.message); });
    });

    function postsSummary(row) {
      var ps = row.AllowanceTypePosts || [];
      if (!ps.length) return 'All posts';
      return ps.length + ' post' + (ps.length === 1 ? '' : 's');
    }

    function openPosts(row) {
      H.$('#al-form-card').hidden = true;
      H.$('#al-posts-card').hidden = false;
      var current = (row.AllowanceTypePosts || []).map(function (p) { return String(p.postCadreId); });
      var active = posts.filter(function (p) { return p.status === 'ACTIVE'; });
      H.$('#al-posts-body').innerHTML =
        '<p class="small muted">Leave every box unchecked to apply this allowance to every post; check specific posts to restrict it to just those.</p>' +
        (active.length ? '<div class="grid-2">' + active.map(function (p) {
          return H.checkbox('alp-' + p.id, p.code + ' — ' + p.name, current.indexOf(String(p.id)) >= 0);
        }).join('') + '</div>' : '<p class="empty">No active posts yet.</p>') +
        '<div class="btn-row"><button type="button" id="al-posts-save">Save</button><button type="button" class="secondary" id="al-posts-cancel">Cancel</button></div>';
      H.on('#al-posts-cancel', 'click', function () { H.$('#al-posts-card').hidden = true; });
      H.on('#al-posts-save', 'click', function () {
        var ids = active.filter(function (p) { var box = H.$('#alp-' + p.id); return box && box.checked; }).map(function (p) { return p.id; });
        var btn = this; H.busy(btn, true, 'Saving…');
        H.api('PUT', '/allowance-types/' + row.id + '/posts', { postCadreIds: ids }).then(function () {
          H.$('#al-posts-card').hidden = true;
          H.notice('#al-notice', 'ok', 'Applicable posts saved.'); load();
        }).catch(function (err) { H.busy(btn, false); H.notice('#al-posts-notice', 'error', err.message); });
      });
    }

    function draw() {
      if (!rows.length) { H.$('#al-list').innerHTML = '<div class="empty">No allowances yet.' + (writable ? ' Use <strong>New allowance</strong> to add one.' : '') + '</div>'; return; }
      H.$('#al-list').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Frequency</th><th>Amount</th><th>Applies to</th><th>Status</th>' + (writable ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          var when = r.frequency === 'ONE_TIME' ? (' (' + r.month + '/' + r.year + ')') : (r.frequency === 'YEARLY' ? (' (month ' + r.month + ')') : '');
          var acts = writable ?
            '<button type="button" class="secondary sm" data-act="edit" data-id="' + r.id + '">Edit</button>' +
            '<button type="button" class="secondary sm" data-act="posts" data-id="' + r.id + '">Posts</button>' +
            '<button type="button" class="' + (r.status === 'ACTIVE' ? 'danger' : 'secondary') + ' sm" data-act="toggle" data-id="' + r.id + '">' + (r.status === 'ACTIVE' ? 'Deactivate' : 'Activate') + '</button>' : '';
          return '<tr' + (r.status !== 'ACTIVE' ? ' class="row-muted"' : '') + '><td>' + esc(r.name) + '</td><td>' + esc(label(r.frequency) + when) + '</td>' +
            '<td>' + H.money(r.amount) + '</td><td>' + esc(postsSummary(r)) + '</td><td>' + H.statusBadge(r.status) + '</td>' +
            (writable ? '<td class="actions">' + acts + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
      H.$$('#al-list button[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var row = rows.filter(function (x) { return String(x.id) === b.getAttribute('data-id'); })[0];
          var act = b.getAttribute('data-act');
          if (act === 'edit') return openForm(row);
          if (act === 'posts') return openPosts(row);
          if (act === 'toggle') {
            var to = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
            H.busy(b, true, '…');
            H.api('POST', '/allowance-types/' + row.id + '/status', { status: to }).then(function () {
              H.notice('#al-notice', 'ok', 'Saved.'); load();
            }).catch(function (err) { H.busy(b, false); H.notice('#al-notice', 'error', err.message); });
          }
        });
      });
    }

    function load() {
      Promise.all([H.api('GET', '/allowance-types'), H.api('GET', '/post-cadres')]).then(function (r) {
        rows = r[0].data; posts = r[1].data; draw();
      }).catch(function (err) { var el = H.$('#al-list'); if (el) el.innerHTML = H.errorBox(err); });
    }

    if (writable) H.on('#al-new', 'click', function () { openForm(null); });
    load();
  }

  H.route('/allowances', viewAllowances, VIEWERS);
})();
