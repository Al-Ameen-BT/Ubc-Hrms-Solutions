/* Establishment master data: employees, posts & cadres, pay revisions,
 * pay scales (+ stage ladder), GO register, KSR rules, and the Service Book.
 *
 * Most screens are one config-driven component (crudView): a searchable
 * list, a create/edit form, and soft-delete. The server enforces roles and
 * tenant isolation; the UI only hides buttons a role can't use. */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;
  // Bank data screens are for bank staff; Super Admins administer the platform, not a bank's records.
  var STAFF = { roles: H.STAFF_ROLES.filter(function (r) { return r !== 'SUPER_ADMIN'; }) };

  function canWrite(roles) { return roles.indexOf(H.role()) >= 0 || H.role() === 'SUPER_ADMIN'; }

  function label(v) {
    if (v === null || v === undefined || v === '') return '';
    return String(v).replace(/_/g, ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function enumOptions(values, withBlank) {
    var o = values.map(function (v) { return [v, label(v)]; });
    return withBlank ? [['', '—']].concat(o) : o;
  }
  function refOptions(rows, text, blank) {
    return [['', blank || '—']].concat((rows || []).map(function (r) { return [r.id, text(r)]; }));
  }
  function byId(rows) { var m = {}; (rows || []).forEach(function (r) { m[r.id] = r; }); return m; }

  // ------------------------------------------------------------ crudView

  /**
   * cfg: {
   *   title, intro, api, noun, writeRoles[], lookups {name: apiPath},
   *   columns: [{ label, html(row, L) }], search(row, L) => string,
   *   fields: [{ key, label, type, required, options(L)|[], hint, def, wide }],
   *   deleteLabel, deletedValue, inactive(row) => bool,
   *   rowActions(row) => html, onRowAction(act, row, L),
   *   afterForm(row, L), crumbs, tabs
   * }
   */
  function crudView(cfg) {
    var writable = canWrite(cfg.writeRoles);
    // Pre-seed every configured lookup as an empty array/map, not undefined
    // — load() below fills these in asynchronously, and a fast click on
    // "New" (or Enter-key double-submit) can otherwise open the form
    // before that request resolves, crashing any field's options(L) that
    // does L.posts.filter(...) on an as-yet-undefined L.posts.
    var L = {};
    Object.keys(cfg.lookups || {}).forEach(function (n) { L[n] = []; L[n + 'ById'] = {}; });
    var rows = [];
    var editing = null;
    var showInactive = false;

    H.shell(
      H.pageHead(cfg.title, cfg.intro, (writable ? '<button type="button" id="crud-new">New ' + esc(cfg.noun) + '</button>' : '') + (cfg.extraHeaderActions || ''), cfg.crumbs) +
      (cfg.tabs || '') +
      '<div class="notice" id="crud-notice"></div>' +
      '<div class="card" id="crud-form-card" hidden><h3 id="crud-form-title"></h3><div class="card-body"><form id="crud-form" novalidate></form></div></div>' +
      '<div class="card"><div class="card-body filters">' +
        '<input type="search" id="crud-q" placeholder="Search ' + esc(cfg.title.toLowerCase()) + '…" aria-label="Search">' +
        '<label class="check-label small"><input type="checkbox" id="crud-inactive"> Show ' + esc((cfg.deletedValue || 'inactive').toLowerCase()) + '</label>' +
      '</div><div id="crud-list">' + H.loading() + '</div></div>'
    );

    function fieldHtml(f, row) {
      var v = row ? row[f.key] : (typeof f.def === 'function' ? f.def() : f.def);
      var id = 'f-' + f.key;
      var req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
      var ctl;
      if (f.type === 'select') ctl = H.select(id, typeof f.options === 'function' ? f.options(L) : f.options, v);
      else if (f.type === 'textarea') ctl = H.textarea(id, v);
      else if (f.type === 'json') ctl = H.textarea(id, v ? (typeof v === 'string' ? v : JSON.stringify(v, null, 2)) : '', 'class="mono" rows="4"');
      else if (f.type === 'checkbox') return H.checkbox(id, f.label, !!v, f.hint);
      // tribool: a nullable boolean (NULL = "automatic", left to the server to derive), shown as a 3-way select.
      else if (f.type === 'tribool') ctl = H.select(id, [['', f.blankLabel || '— Automatic —'], ['true', f.trueLabel || 'Yes'], ['false', f.falseLabel || 'No']], v === true ? 'true' : v === false ? 'false' : '');
      else ctl = H.input(id, f.type || 'text', v, f.type === 'number' ? 'step="any"' : '');
      return '<div class="field' + (f.wide ? ' wide' : '') + '"><label for="' + id + '">' + esc(f.label) + req + '</label>' + ctl +
        (f.hint ? '<div class="hint">' + f.hint + '</div>' : '') + '</div>';
    }

    function openForm(row) {
      editing = row;
      H.$('#crud-form-title').textContent = row ? 'Edit ' + cfg.noun : 'New ' + cfg.noun;
      H.$('#crud-form').innerHTML = '<div class="grid-2">' + cfg.fields.filter(function (f) { return f.type !== 'checkbox' && !f.wide; }).map(function (f) { return fieldHtml(f, row); }).join('') + '</div>' +
        cfg.fields.filter(function (f) { return f.wide; }).map(function (f) { return fieldHtml(f, row); }).join('') +
        cfg.fields.filter(function (f) { return f.type === 'checkbox'; }).map(function (f) { return fieldHtml(f, row); }).join('') +
        '<div class="btn-row"><button type="submit" id="crud-save">' + (row ? 'Save changes' : 'Create') + '</button><button type="button" class="secondary" id="crud-cancel">Cancel</button></div>';
      H.$('#crud-form-card').hidden = false;
      H.on('#crud-cancel', 'click', function () { H.$('#crud-form-card').hidden = true; });
      if (cfg.afterForm) cfg.afterForm(row, L);
      var first = H.$('#crud-form input, #crud-form select');
      if (first) first.focus();
      H.$('#crud-form-card').scrollIntoView({ block: 'nearest' });
    }

    function readForm() {
      var body = {};
      for (var i = 0; i < cfg.fields.length; i++) {
        var f = cfg.fields[i];
        var el = H.$('#f-' + f.key);
        if (!el) continue;
        var v;
        if (f.type === 'checkbox') v = el.checked;
        else if (f.type === 'tribool') v = el.value === '' ? null : el.value === 'true';
        else if (f.type === 'json') {
          var t = el.value.trim();
          if (!t) v = null;
          else { try { v = JSON.parse(t); } catch (e) { throw new Error(f.label + ' must be valid JSON (or empty).'); } }
        } else v = el.value.trim();
        if (f.required && (v === '' || v === null)) throw new Error(f.label + ' is required.');
        body[f.key] = v;
      }
      return body;
    }

    H.on('#crud-form', 'submit', function (e) {
      e.preventDefault();
      var body;
      try { body = readForm(); } catch (err) { return H.notice('#crud-notice', 'error', err.message); }
      var btn = H.$('#crud-save');
      H.busy(btn, true, 'Saving…');
      var p = editing ? H.api('PUT', cfg.api + '/' + editing.id, body) : H.api('POST', cfg.api, body);
      p.then(function () {
        H.$('#crud-form-card').hidden = true;
        H.notice('#crud-notice', 'ok', editing ? 'Saved.' : cfg.noun.charAt(0).toUpperCase() + cfg.noun.slice(1) + ' created.');
        load();
      }).catch(function (err) { H.busy(btn, false); H.notice('#crud-notice', 'error', err.message); });
    });

    function isInactive(r) { return cfg.inactive ? cfg.inactive(r) : r.status && r.status !== 'ACTIVE'; }

    function draw() {
      var q = (H.val('#crud-q') || '').toLowerCase();
      var list = rows.filter(function (r) {
        if (!showInactive && isInactive(r)) return false;
        return !q || (cfg.search ? cfg.search(r, L) : JSON.stringify(r)).toLowerCase().indexOf(q) >= 0;
      });
      if (!list.length) {
        H.$('#crud-list').innerHTML = '<div class="empty">' + (rows.length ? 'Nothing matches.' : 'No ' + esc(cfg.title.toLowerCase()) + ' yet.' + (writable ? ' Use <strong>New ' + esc(cfg.noun) + '</strong> to add one.' : '')) + '</div>';
        return;
      }
      H.$('#crud-list').innerHTML = '<div class="table-wrap"><table><thead><tr>' + cfg.columns.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
        list.map(function (r) {
          var acts = (cfg.rowActions ? cfg.rowActions(r) : '') +
            (writable ? '<button type="button" class="secondary sm" data-act="edit" data-id="' + r.id + '">Edit</button>' +
              (!isInactive(r) ? '<button type="button" class="danger sm" data-act="del" data-id="' + r.id + '">' + esc(cfg.deleteLabel || 'Deactivate') + '</button>' : '') : '');
          return '<tr' + (isInactive(r) ? ' class="row-muted"' : '') + '>' + cfg.columns.map(function (c) { return '<td>' + c.html(r, L) + '</td>'; }).join('') +
            '<td class="actions">' + acts + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      H.$$('#crud-list button[data-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          var row = rows.filter(function (x) { return String(x.id) === b.getAttribute('data-id'); })[0];
          var act = b.getAttribute('data-act');
          if (act === 'edit') return openForm(row);
          if (act === 'del') {
            if (!window.confirm((cfg.deleteLabel || 'Deactivate') + ' this ' + cfg.noun + '?\n\nIt stays on record (history that refers to it is kept) but is marked ' + (cfg.deletedValue || 'inactive').toLowerCase() + '.')) return;
            H.busy(b, true, '…');
            return H.api('DELETE', cfg.api + '/' + row.id).then(function () { H.notice('#crud-notice', 'ok', 'Done.'); load(); })
              .catch(function (err) { H.busy(b, false); H.notice('#crud-notice', 'error', err.message); });
          }
          if (cfg.onRowAction) cfg.onRowAction(act, row, L);
        });
      });
    }

    function load() {
      var names = Object.keys(cfg.lookups || {});
      Promise.all([H.api('GET', cfg.api)].concat(names.map(function (n) { return H.api('GET', cfg.lookups[n]); }))).then(function (r) {
        rows = r[0].data;
        names.forEach(function (n, i) { L[n] = r[i + 1].data; L[n + 'ById'] = byId(r[i + 1].data); });
        draw();
      }).catch(function (err) {
        // Guard against having already navigated off this page (e.g. right
        // after a create/edit/delete triggers this reload) before the
        // request settles — #crud-list is then gone from the DOM.
        var el = H.$('#crud-list');
        if (el) el.innerHTML = H.errorBox(err);
      });
    }

    H.on('#crud-new', 'click', function () { openForm(null); });
    H.on('#crud-q', 'input', draw);
    H.on('#crud-inactive', 'change', function () { showInactive = this.checked; draw(); });
    load();
  }

  // --------------------------------------------------------------- posts

  function viewPosts() {
    crudView({
      title: 'Posts & cadres', noun: 'post', api: '/post-cadres',
      intro: 'The sanctioned posts in your bank and how they rank. Employees are appointed to a post; promotions move them up this ladder.',
      writeRoles: ['ORG_ADMIN', 'HR_ADMIN'],
      lookups: { posts: '/post-cadres', scales: '/pay-scales' },
      columns: [
        { label: 'Code', html: function (r) { return '<code class="inline">' + esc(r.code) + '</code>'; } },
        { label: 'Post', html: function (r) { return esc(r.name); } },
        { label: 'Cadre', html: function (r) { return esc(r.cadre || '—'); } },
        { label: 'Level', html: function (r) { return esc(r.cadreLevel === null ? '—' : r.cadreLevel); } },
        { label: 'Promotes to', html: function (r, L) { var p = L.postsById[r.parentPostId]; return p ? esc(p.name) : '—'; } },
        { label: 'Default pay scale', html: function (r, L) { var s = L.scalesById[r.defaultPayScaleId]; return s ? esc(s.code) : '—'; } },
        { label: 'Status', html: function (r) { return H.statusBadge(r.status); } }
      ],
      fields: [
        { key: 'code', label: 'Code', required: true, hint: 'Short and unique, e.g. CLK' },
        { key: 'name', label: 'Post name', required: true },
        { key: 'cadre', label: 'Cadre', hint: 'e.g. Clerical, Officer, Subordinate' },
        { key: 'cadreLevel', label: 'Level in cadre', type: 'number', hint: 'Lower number = junior' },
        { key: 'parentPostId', label: 'Promotes to', type: 'select', options: function (L) { return refOptions(L.posts, function (p) { return p.code + ' — ' + p.name; }); } },
        { key: 'defaultPayScaleId', label: 'Default pay scale', type: 'select', options: function (L) { return refOptions(L.scales, function (s) { return s.code + ' — ' + s.name; }); } },
        { key: 'status', label: 'Status', type: 'select', options: enumOptions(['ACTIVE', 'INACTIVE']), def: 'ACTIVE' }
      ]
    });
  }

  // ---------------------------------------------------------- pay scales

  function payTabs(active) { return H.tabs([['/pay-scales', 'Pay scales'], ['/pay-revisions', 'Pay revisions']], active); }

  function viewPayRevisions() {
    crudView({
      title: 'Pay revisions', noun: 'pay revision', api: '/pay-revisions', tabs: payTabs('/pay-revisions'),
      intro: 'Each pay revision (settlement / GO) groups a set of pay scales that took effect together.',
      inactive: function (r) { return r.status === 'SUPERSEDED'; },
      writeRoles: ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'],
      deleteLabel: 'Supersede', deletedValue: 'Superseded',
      lookups: { rules: '/ksr-rules' },
      columns: [
        { label: 'Revision', html: function (r) { return esc(r.name); } },
        { label: 'Effective', html: function (r) { return H.fmtDay(r.effectiveDate); } },
        { label: 'Authority', html: function (r, L) { var x = L.rulesById[r.ruleReferenceId]; return x ? esc(x.title) : '<span class="muted">—</span>'; } },
        { label: 'Status', html: function (r) { return H.statusBadge(r.status); } }
      ],
      fields: [
        { key: 'name', label: 'Name', required: true, hint: 'e.g. 11th Pay Revision (2019)' },
        { key: 'effectiveDate', label: 'Effective date', type: 'date', required: true },
        { key: 'ruleReferenceId', label: 'Authorising rule / GO', type: 'select', options: function (L) { return refOptions(L.rules, function (x) { return x.title; }); } },
        { key: 'status', label: 'Status', type: 'select', options: enumOptions(['DRAFT', 'ACTIVE', 'SUPERSEDED']), def: 'DRAFT' },
        { key: 'description', label: 'Notes', type: 'textarea', wide: true }
      ]
    });
  }

  function viewPayScales() {
    crudView({
      title: 'Pay scales', noun: 'pay scale', api: '/pay-scales', tabs: payTabs('/pay-scales'),
      intro: 'A pay scale is a ladder of stages. Use <strong>Stages</strong> to enter the amounts.',
      writeRoles: ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'],
      deleteLabel: 'Supersede', deletedValue: 'Superseded',
      lookups: { revisions: '/pay-revisions' },
      columns: [
        { label: 'Code', html: function (r) { return '<code class="inline">' + esc(r.code) + '</code>'; } },
        { label: 'Scale', html: function (r) { return esc(r.name) + (r.scaleExpression ? '<div class="small muted mono">' + esc(r.scaleExpression) + '</div>' : ''); } },
        { label: 'Pay revision', html: function (r, L) { var x = L.revisionsById[r.payRevisionId]; return x ? esc(x.name) : '—'; } },
        { label: 'Effective', html: function (r) { return H.fmtDay(r.effectiveFrom) + (r.effectiveTo ? ' – ' + H.fmtDay(r.effectiveTo) : ''); } },
        { label: 'Status', html: function (r) { return H.statusBadge(r.status); } }
      ],
      rowActions: function (r) { return '<a class="button secondary sm" href="#/pay-scales/' + r.id + '">Stages</a>'; },
      fields: [
        { key: 'code', label: 'Code', required: true },
        { key: 'name', label: 'Name', required: true },
        { key: 'payRevisionId', label: 'Pay revision', type: 'select', required: true, options: function (L) { return refOptions(L.revisions, function (x) { return x.name; }, '— choose —'); } },
        { key: 'scaleExpression', label: 'Scale as written', hint: 'e.g. 20000-800-24000-1000-30000 (for reference; stages are entered separately)' },
        { key: 'payableDays', label: 'Payable Days', type: 'number', def: 31, hint: 'Shown on the employee\'s payslip as this grade\'s Grade Details.' },
        { key: 'monthDays', label: 'Month Days', type: 'number', hint: 'Optional — only if this grade uses a fixed divisor different from the calendar month.' },
        { key: 'effectiveFrom', label: 'Effective from', type: 'date', required: true },
        { key: 'effectiveTo', label: 'Effective to', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: enumOptions(['ACTIVE', 'SUPERSEDED']), def: 'ACTIVE' }
      ]
    });
  }

  function viewStages(params) {
    var id = params[0];
    var writable = canWrite(['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER']);
    H.shell('<div id="stg">' + H.loading() + '</div>');
    Promise.all([H.api('GET', '/pay-scales/' + id), H.api('GET', '/pay-scales/' + id + '/stages')]).then(function (r) {
      var scale = r[0].data; var stages = r[1].data;
      var draft = stages.map(function (s) { return { stageNo: s.stageNo, amount: s.amount, inUse: s.inUse, saved: true }; });
      function draw() {
        H.$('#stg').innerHTML =
          H.pageHead('Stages — ' + scale.code, esc(scale.name) + (scale.scaleExpression ? ' · <span class="mono">' + esc(scale.scaleExpression) + '</span>' : ''), '',
            [['Pay scales', '/pay-scales'], [scale.code]]) +
          '<div class="notice" id="stg-notice"></div>' +
          '<div class="card"><h3>Stage ladder</h3><div class="card-body">' +
            '<p class="small muted">Amounts must rise with each stage. Stages cannot be removed once saved, and a stage already used in an employee\'s pay record is locked — introduce a new pay revision to change pay.</p>' +
            '<div class="table-wrap"><table class="stages"><thead><tr><th>Stage</th><th>Basic pay (₹)</th><th>Increment</th><th></th></tr></thead><tbody>' +
            draft.map(function (s, i) {
              var inc = i > 0 ? Number(s.amount) - Number(draft[i - 1].amount) : null;
              return '<tr><td>' + s.stageNo + '</td><td>' +
                (writable && !s.inUse ? '<input type="number" class="stage-amt" data-i="' + i + '" value="' + esc(s.amount) + '" min="1" step="any" aria-label="Stage ' + s.stageNo + ' amount">' : H.money(s.amount)) + '</td>' +
                '<td class="small muted">' + (inc === null ? '—' : (inc > 0 ? '+' : '') + H.money(inc)) + '</td>' +
                '<td class="small">' + (s.inUse ? H.badge('In use', 'role') : (!s.saved ? H.badge('Unsaved', 'warn') + ' <button type="button" class="link" data-rm="' + i + '">remove</button>' : '')) + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            (writable ? '<div class="inline-form spaced"><label class="small" for="stg-add-amt">Next stage amount</label>' + H.input('stg-add-amt', 'number', '', 'min="1" step="any"') +
              '<button type="button" class="secondary" id="stg-add">Add stage</button>' +
              '<span class="small muted">or</span> <button type="button" class="secondary" id="stg-bulk">Paste several…</button></div>' +
              '<div id="stg-bulk-box" hidden class="spaced">' + H.field('stg-bulk-text', 'Amounts, one per line or separated by commas', H.textarea('stg-bulk-text', '', 'rows="4" class="mono"')) +
              '<button type="button" class="secondary" id="stg-bulk-add">Add these stages</button></div>' +
              '<div class="btn-row spaced"><button type="button" id="stg-save">Save stages</button></div>' : '') +
          '</div></div>';
        H.$$('.stage-amt').forEach(function (inp) {
          inp.addEventListener('change', function () { draft[+inp.getAttribute('data-i')].amount = Number(inp.value); draw(); });
        });
        H.$$('button[data-rm]').forEach(function (b) { b.addEventListener('click', function () { draft.splice(+b.getAttribute('data-rm'), 1); draw(); }); });
        H.on('#stg-add', 'click', function () {
          var a = Number(H.val('#stg-add-amt'));
          if (!(a > 0)) return H.notice('#stg-notice', 'error', 'Enter the amount for the next stage.');
          draft.push({ stageNo: draft.length ? draft[draft.length - 1].stageNo + 1 : 1, amount: a });
          draw();
          H.$('#stg-add-amt').focus();
        });
        H.on('#stg-bulk', 'click', function () { H.$('#stg-bulk-box').hidden = false; H.$('#stg-bulk-text').focus(); });
        H.on('#stg-bulk-add', 'click', function () {
          var nums = H.val('#stg-bulk-text').split(/[\s,;]+/).filter(Boolean).map(Number);
          if (!nums.length || nums.some(function (n) { return !(n > 0); })) return H.notice('#stg-notice', 'error', 'Enter positive numbers only.');
          nums.forEach(function (n) { draft.push({ stageNo: draft.length ? draft[draft.length - 1].stageNo + 1 : 1, amount: n }); });
          draw();
        });
        H.on('#stg-save', 'click', function () {
          var btn = this;
          H.busy(btn, true, 'Saving…');
          H.api('PUT', '/pay-scales/' + id + '/stages', { stages: draft.map(function (s) { return { stageNo: s.stageNo, amount: s.amount }; }) }).then(function (res) {
            draft = res.data.map(function (s) { return { stageNo: s.stageNo, amount: s.amount, inUse: s.inUse, saved: true }; });
            draw();
            H.notice('#stg-notice', 'ok', 'Stages saved.');
          }).catch(function (err) { H.busy(btn, false); H.notice('#stg-notice', 'error', err.message); });
        });
      }
      draw();
    }).catch(function (err) { H.$('#stg').innerHTML = H.errorBox(err); });
  }

  // ----------------------------------------------------------- employees

  var EMPLOYMENT = ['ACTIVE', 'LWA', 'SUSPENDED', 'BREAK_IN_SERVICE', 'RESIGNED', 'RETIRED', 'TERMINATED'];
  var EMPLOYMENT_TYPE = ['REGULAR', 'PART_TIME_CONTINGENT'];
  var TAX_REGIME = ['NEW', 'OLD'];

  // Task 78: maps a GET /org/mandatory-fields config key to the employee
  // form field(s) it governs. Every key is the same as its field's `key`
  // below except bankDetails, which the config treats as one togglable
  // unit but the form renders as three separate fields — see
  // services/orgFields.js MANDATORY_FIELD_DEFS (the source of truth for
  // which keys exist and their labels).
  var MANDATORY_FIELD_APPLY_MAP = { bankDetails: ['bankName', 'bankAccountNumber', 'bankIfsc'] };

  function viewEmployees() {
    // Field defs live in their own array (rather than inline in the
    // crudView() call below) so task 78 can fetch the org's mandatory-fields
    // config and flip f.required on the matching entries in place — crudView
    // reads f.required at render/validate time, so mutating these objects
    // even after the page has already painted is enough.
    var employeeFields = [
        // ---- 1. Identity ----
        { key: 'empCode', label: 'Employee code', required: true },
        { key: 'name', label: 'Full name', required: true },
        { key: 'fatherName', label: "Father's Name" },
        { key: 'spouseName', label: 'Spouse Name' },
        { key: 'gender', label: 'Gender', type: 'select', options: enumOptions(['MALE', 'FEMALE', 'OTHER'], true) },
        { key: 'dob', label: 'Date of birth', type: 'date' },
        { key: 'bloodGroup', label: 'Blood Group', type: 'select', options: [['', '— choose —'], ['A+', 'A+'], ['A-', 'A-'], ['B+', 'B+'], ['B-', 'B-'], ['AB+', 'AB+'], ['AB-', 'AB-'], ['O+', 'O+'], ['O-', 'O-']] },
        { key: 'educationalQualification', label: 'Educational Qualification' },

        // ---- 2. Identity / statutory numbers ----
        { key: 'panNumber', label: 'PAN Number' },
        { key: 'aadhaarNumber', label: 'Aadhaar Number' },
        { key: 'uanNumber', label: 'UAN' },
        { key: 'pfNumber', label: 'PF Number' },

        // ---- 3. Contact ----
        { key: 'officeEmail', label: 'Office Email', type: 'email' },
        { key: 'personalEmail', label: 'Personal Email', type: 'email' },
        { key: 'residenceAddress', label: 'Residence Address', type: 'textarea', wide: true },
        { key: 'emergencyContactName', label: 'Emergency Contact Name' },
        { key: 'emergencyContactNumber', label: 'Emergency Contact Number' },
        { key: 'emergencyContactRelation', label: 'Emergency Contact Relation' },

        // ---- 4. Bank account (salary credit) ----
        { key: 'bankName', label: 'Bank Name' },
        { key: 'bankAccountNumber', label: 'Bank Account Number' },
        { key: 'bankIfsc', label: 'Bank IFSC' },

        // ---- 5. Employment & posting ----
        { key: 'doj', label: 'Date of joining', type: 'date', required: true },
        { key: 'doa', label: 'Date of appointment to present post', type: 'date' },
        { key: 'dateOfConfirmation', label: 'Date of Confirmation', type: 'date', hint: 'Leave blank if the same as Date of appointment to present post — only enter this when confirmation happened on a different date.' },
        { key: 'employmentType', label: 'Employment type', type: 'select', options: enumOptions(EMPLOYMENT_TYPE), def: 'REGULAR',
          hint: 'Part-Time Contingent uses the one common scale for that category (same for every bank class) — not the regular class-based scales.' },
        { key: 'postCadreId', label: 'Post', type: 'select', required: true, options: function (L) { return refOptions(L.posts.filter(function (p) { return p.status === 'ACTIVE'; }), function (p) { return p.code + ' — ' + p.name; }, '— choose —'); } },
        { key: 'designation', label: 'Designation' },
        { key: 'department', label: 'Department' },
        { key: 'branchName', label: 'Branch Name' },
        { key: 'branchCode', label: 'Branch Code' },
        { key: 'category', label: 'Category' },
        { key: 'currentPayScaleId', label: 'Grade', type: 'select', options: function (L) { return refOptions(L.scales.filter(function (s) { return s.status === 'ACTIVE'; }), function (s) { return s.code + ' — ' + s.name; }); },
          hint: 'The full Grade Details (basic scale, payable days) are shown on the payslip automatically — no need to re-enter them here.' },
        { key: 'currentStageId', label: 'Stage', type: 'select', options: [['', '— choose a pay scale first —']] },
        { key: 'currentBasicPay', label: 'Current basic pay (₹)', type: 'number', hint: 'Filled from the stage when you pick one.' },
        { key: 'employeeSpecificIncrementDate', label: 'Employee-specific increment date', type: 'date', hint: 'Only if the increment policy uses per-employee dates.' },
        { key: 'lastPromotionDate', label: 'Date of last promotion to present post', type: 'date', hint: 'Resets the stagnation-increment clock. Leave blank to use Date of appointment.' },
        { key: 'dateOfRetirement', label: 'Date of Retirement', type: 'date', hint: 'Auto-calculated from Date of Birth and your organisation\'s standard retirement age (Payroll Settings). Only set this to override it for one employee.' },
        { key: 'employmentStatus', label: 'Service status', type: 'select', options: enumOptions(EMPLOYMENT), def: 'ACTIVE' },
        { key: 'status', label: 'Record', type: 'select', options: enumOptions(['ACTIVE', 'INACTIVE']), def: 'ACTIVE', hint: 'An active record uses one of your licence\'s employee seats.' },

        // ---- 6. Earnings ---- HRA is not entered here: it's computed
        // automatically as a % of Basic from the organisation's Payroll
        // Settings (see #/org-settings/payroll). See services/payslip.js.
        { key: 'daType', label: 'DA type', type: 'select', options: enumOptions(['VARIABLE', 'FIXED', 'BOTH']), def: 'VARIABLE',
          hint: 'Variable = % of Basic, follows the organisation\'s DA rate automatically. Fixed = a flat amount instead, that does not change when the org rate does. Both = the variable amount plus the fixed amount on top of it.' },
        { key: 'fixedDaAmount', label: 'Fixed DA amount (₹/month)', type: 'number', hint: 'Used when DA type is Fixed or Both.' },
        { key: 'riskAllowance', label: 'Risk Allowance (₹/month, optional)', type: 'number' },
        { key: 'otherAllowance', label: 'Other Allowance (₹/month, optional)', type: 'number' },
        { key: 'ccaOptIn', label: 'City Compensatory Allowance', type: 'tribool', blankLabel: 'Automatic — org default', trueLabel: 'Always pay', falseLabel: 'Never pay' },
        { key: 'ccaAmount', label: 'CCA amount (₹/month)', type: 'number', hint: 'Leave blank to use the organisation\'s default amount.' },
        { key: 'conveyanceOptIn', label: 'Conveyance Allowance', type: 'tribool', blankLabel: 'Automatic — org default', trueLabel: 'Always pay', falseLabel: 'Never pay' },
        { key: 'conveyanceAmount', label: 'Conveyance amount (₹/month)', type: 'number', hint: 'Leave blank to use the organisation\'s default amount.' },

        // ---- 7. Deductions ----
        { key: 'vpfPercent', label: 'Voluntary Provident Fund (% of Basic, optional)', type: 'number', hint: 'On top of the standard 12% employee PF.' },
        { key: 'welfareFundOptIn', label: 'Welfare Fund', type: 'checkbox' },
        { key: 'welfareFundAmount', label: 'Welfare Fund amount (₹/month)', type: 'number', hint: 'Only deducted when Welfare Fund is opted in above.' },
        { key: 'gsliOptIn', label: 'GSLI (Group Savings Linked Insurance)', type: 'tribool',
          blankLabel: 'Automatic — only if joined before 01/09/2014', trueLabel: 'Always deduct', falseLabel: 'Never deduct',
          hint: 'Rule: applies only to employees who joined before 01/09/2014. Use Automatic unless this particular employee needs an exception.' },
        { key: 'gsliAmount', label: 'GSLI amount (₹/month)', type: 'number', hint: 'Leave blank to use the organisation\'s default amount (₹20 unless changed in Payroll Settings).' },
        { key: 'ptAmount', label: 'Professional Tax (₹, per the org\'s schedule)', type: 'number', hint: 'Deducted monthly or twice a year per Payroll Settings, depending on the employee\'s PT slab.' },

        // ---- 8. Income tax ----
        { key: 'taxRegime', label: 'Income Tax regime', type: 'select', options: enumOptions(TAX_REGIME), def: 'NEW' },
        { key: 'taxOtherDeductions', label: 'Other declared tax deductions (₹/year)', type: 'number', hint: 'Old regime only — 80C/80D etc. declared beyond PF/VPF. Ignored under the New regime.' },
    ];

    // Task 78: "enabling a mandatory field doesn't reflect on the employee
    // form" — apply the org's config onto the matching field defs. Fetched
    // once per page visit; failure just leaves the form's built-in required
    // flags (empCode/name/doj/postCadreId) in place.
    var employeeFieldsByKey = {};
    employeeFields.forEach(function (f) { employeeFieldsByKey[f.key] = f; });
    H.api('GET', '/org/mandatory-fields').then(function (r) {
      var config = (r.data && r.data.config) || {};
      Object.keys(config).forEach(function (key) {
        (MANDATORY_FIELD_APPLY_MAP[key] || [key]).forEach(function (fk) {
          if (employeeFieldsByKey[fk]) employeeFieldsByKey[fk].required = !!config[key];
        });
      });
    }).catch(function () { /* non-fatal */ });

    crudView({
      title: 'Employees', noun: 'employee', api: '/employees',
      intro: 'The employee master. Each record links to a post, a pay scale and stage — the Service Book is kept against it.',
      writeRoles: ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER'],
      extraHeaderActions: canWrite(['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']) ? '<a class="button secondary" href="#/employees/bulk-import">Bulk import</a>' : '',
      lookups: { posts: '/post-cadres', scales: '/pay-scales' },
      search: function (r, L) { var p = L.postsById[r.postCadreId]; return [r.empCode, r.name, p && p.name, r.grade, r.category].join(' '); },
      columns: [
        { label: 'Emp. code', html: function (r) { return '<code class="inline">' + esc(r.empCode) + '</code>'; } },
        { label: 'Name', html: function (r) { return esc(r.name); } },
        { label: 'Post', html: function (r, L) { var p = L.postsById[r.postCadreId]; return p ? esc(p.name) : '—'; } },
        { label: 'Joined', html: function (r) { return H.fmtDay(r.doj); } },
        { label: 'Basic pay', html: function (r) { return H.money(r.currentBasicPay); } },
        { label: 'Service status', html: function (r) { return r.employmentStatus === 'ACTIVE' ? H.badge('In service', 'ok') : H.badge(label(r.employmentStatus), 'warn'); } },
        { label: 'Record', html: function (r) { return H.statusBadge(r.status); } }
      ],
      rowActions: function (r) { return '<a class="button secondary sm" href="#/employees/' + r.id + '/service-book">Service book</a>'; },
      fields: employeeFields,
      afterForm: function (row, L) {
        // Stage list depends on the chosen scale; picking a stage fills basic pay.
        var scaleSel = H.$('#f-currentPayScaleId');
        var stageSel = H.$('#f-currentStageId');
        var postSel = H.$('#f-postCadreId');
        var typeSel = H.$('#f-employmentType');
        var stagesCache = {};
        // Convenience: switching to Part-Time Contingent points the post
        // (and so the scale) at the one common Part-Time post every
        // organisation is seeded with (PostCadre.code 'PART_TIME'), instead
        // of leaving the regular class-based posts selected.
        if (typeSel && postSel && L && L.posts) {
          typeSel.addEventListener('change', function () {
            if (typeSel.value !== 'PART_TIME_CONTINGENT') return;
            var pt = L.posts.filter(function (p) { return p.code === 'PART_TIME'; })[0];
            if (!pt) return;
            postSel.value = pt.id;
            if (pt.defaultPayScaleId && scaleSel) {
              scaleSel.value = pt.defaultPayScaleId;
              scaleSel.dispatchEvent(new Event('change'));
            }
          });
        }
        function loadStages(keep) {
          var sid = scaleSel.value;
          if (!sid) { stageSel.innerHTML = '<option value="">— choose a pay scale first —</option>'; return; }
          var p = stagesCache[sid] ? Promise.resolve(stagesCache[sid]) : H.api('GET', '/pay-scales/' + sid + '/stages').then(function (r) { stagesCache[sid] = r.data; return r.data; });
          p.then(function (st) {
            stageSel.innerHTML = '<option value="">' + (st.length ? '— choose —' : 'No stages entered for this scale') + '</option>' + st.map(function (s) {
              return '<option value="' + s.id + '" data-amt="' + esc(s.amount) + '"' + (String(keep) === String(s.id) ? ' selected' : '') + '>Stage ' + s.stageNo + ' — ' + H.money(s.amount) + '</option>';
            }).join('');
          });
        }
        scaleSel.addEventListener('change', function () { loadStages(null); });
        stageSel.addEventListener('change', function () {
          var o = stageSel.options[stageSel.selectedIndex];
          if (o && o.getAttribute('data-amt')) H.$('#f-currentBasicPay').value = o.getAttribute('data-amt');
        });
        loadStages(row ? row.currentStageId : null);
      }
    });
  }

  // ------------------------------------------------------ bulk employee import

  function viewEmployeeBulkImport() {
    H.shell(
      H.pageHead('Bulk import employees', 'Download the template, fill it in (post and pay scale are referenced by their Code), then upload it here. Each row is created independently — a mistake in one row does not stop the rest.', '', [['Employees', '/employees'], ['Bulk import']]) +
      '<div class="notice" id="bi-notice"></div>' +
      '<div class="card"><h3>1. Get the template</h3><div class="card-body">' +
        '<p class="small muted">Posts and pay scales must already exist (see <a href="#/posts">Posts &amp; cadres</a> / <a href="#/pay-scales">Pay scales</a>) — the template\'s example row shows the code format.</p>' +
        '<button type="button" class="secondary" id="bi-template">Download CSV template</button>' +
      '</div></div>' +
      '<div class="card"><h3>2. Upload your file</h3><div class="card-body">' +
        '<input type="file" id="bi-file" accept=".csv,text/csv">' +
        '<p class="small muted spaced">or paste CSV text directly:</p>' +
        H.textarea('bi-text', '', 'rows="6" class="mono"') +
        '<div class="btn-row spaced"><button type="button" id="bi-run">Upload &amp; create</button></div>' +
      '</div></div>' +
      '<div id="bi-results"></div>'
    );
    H.on('#bi-template', 'click', function () {
      var s = H.getSession();
      fetch('/api/v1/employees/bulk-template.csv', { headers: { Authorization: 'Bearer ' + (s && s.token) } })
        .then(function (res) { return res.blob(); })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a'); a.href = url; a.download = 'employee-bulk-upload-template.csv'; document.body.appendChild(a); a.click();
          document.body.removeChild(a); URL.revokeObjectURL(url);
        }).catch(function () { H.notice('#bi-notice', 'error', 'Could not download the template.'); });
    });
    H.on('#bi-file', 'change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { H.$('#bi-text').value = String(reader.result || ''); };
      reader.readAsText(f);
    });
    H.on('#bi-run', 'click', function () {
      var csv = H.val('#bi-text');
      if (!csv || !csv.trim()) return H.notice('#bi-notice', 'error', 'Choose a file or paste CSV text first.');
      var btn = this; H.busy(btn, true, 'Uploading…');
      H.api('POST', '/employees/bulk-import', { csv: csv }).then(function (res) {
        H.busy(btn, false);
        H.notice('#bi-notice', res.summary.failed ? 'warn' : 'ok', res.summary.created + ' created, ' + res.summary.failed + ' failed (of ' + res.summary.total + ' rows).');
        H.$('#bi-results').innerHTML = '<div class="card"><h3>Results</h3><div class="table-wrap"><table><thead><tr><th>Row</th><th>Emp. code</th><th>Result</th></tr></thead><tbody>' +
          res.data.map(function (r) {
            return '<tr' + (r.status === 'error' ? ' class="row-muted"' : '') + '><td>' + r.row + '</td><td>' + esc(r.empCode || '') + '</td><td>' +
              (r.status === 'created' ? H.badge('Created', 'ok') : H.badge('Error', 'warn') + ' <span class="small">' + esc(r.message) + '</span>') + '</td></tr>';
          }).join('') + '</tbody></table></div></div>';
      }).catch(function (err) { H.busy(btn, false); H.notice('#bi-notice', 'error', err.message); });
    });
  }

  // --------------------------------------------------------- service book

  var EVENT_TYPES = ['APPOINTMENT', 'PROBATION', 'CONFIRMATION', 'TRANSFER', 'SUSPENSION', 'LWA', 'BREAK_IN_SERVICE', 'DISCIPLINARY', 'RETIREMENT', 'OTHER'];

  // Estimated monthly payslip preview (see src/services/payslip.js). Phase 1
  // covers DA/HRA/allowances/Medical Allowance/Bonus, PF/VPF, Welfare Fund,
  // GSLI, Professional Tax, Income Tax, and the Festival Advance/Overdraft/
  // Recurring Deposit instalments currently active for this employee.
  // PF and Professional Tax always show (even ₹0) since they're standard,
  // ongoing lines — everything else only shows when it applies this month.
  function gradeDetailsCard(g) {
    if (!g) return '';
    return '<div class="card"><h3>Grade Details</h3><div class="card-body">' +
      '<div class="table-wrap"><table><thead><tr><th>Grade Name</th><th>Basic Scale</th><th>payable Days</th><th>Month Days</th></tr></thead><tbody>' +
        '<tr><td>' + esc(g.name || '—') + '</td><td>' + esc(g.scaleExpression || '—') + '</td>' +
          '<td>' + (g.payableDays != null ? g.payableDays : '—') + '</td><td>' + (g.monthDays != null ? g.monthDays : '') + '</td></tr>' +
      '</tbody></table></div>' +
    '</div></div>';
  }

  // Amount / Interest / Total Amount breakdown for the items that actually
  // carry interest — Festival Advance (always 0% — no rate field on the
  // model, shown for completeness), Overdraft, and each active Housing/
  // Vehicle Loan. LIC (a flat premium) and Recurring Deposit (a savings
  // instrument the employee owns, not a loan) have no interest concept and
  // are left out of this table — they already show as a plain figure in
  // the Deductions column above.
  function loanInterestCard(ls) {
    if (!ls) return '';
    var rows = [];
    if (ls.festivalAdvance) rows.push({ item: 'Festival Advance', amount: ls.festivalAdvance.amount, interest: null, total: ls.festivalAdvance.totalRepayable, monthly: ls.festivalAdvance.dueThisMonth, monthlyNote: null });
    // The Overdraft itself is not deducted from pay — only its linked
    // Recurring Deposit instalment is (see the "This month" note below).
    if (ls.overdraft) rows.push({ item: 'Overdraft', amount: ls.overdraft.amount, interest: ls.overdraft.interest, total: ls.overdraft.totalRepayable, monthly: null, monthlyNote: 'Recovered via linked RD' });
    var hls = (ls.housingLoans || []).filter(function (r) { return r.active; });
    hls.forEach(function (r, i) { rows.push({ item: 'Housing Loan' + (hls.length > 1 ? ' #' + (i + 1) : ''), amount: r.amount, interest: r.interest, total: r.totalRepayable, monthly: r.dueThisMonth, monthlyNote: null }); });
    var vls = (ls.vehicleLoans || []).filter(function (r) { return r.active; });
    vls.forEach(function (r, i) { rows.push({ item: 'Vehicle Loan' + (vls.length > 1 ? ' #' + (i + 1) : ''), amount: r.amount, interest: r.interest, total: r.totalRepayable, monthly: r.dueThisMonth, monthlyNote: null }); });
    if (!rows.length) return '';
    return '<div class="card"><h3>Loan &amp; Interest Details</h3><div class="card-body">' +
      '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Amount</th><th>Interest</th><th>Total Amount</th><th>This month</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.item) + '</td><td>' + H.money(r.amount) + '</td><td>' + (r.interest == null ? '—' : H.money(r.interest)) + '</td>' +
            '<td>' + H.money(r.total) + '</td><td>' + (r.monthlyNote ? '<span class="small muted">' + esc(r.monthlyNote) + '</span>' : H.money(r.monthly)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
      '<p class="small muted">Amount is the principal availed; Interest and Total Amount are for the full repayment period, not just this month.</p>' +
    '</div></div>';
  }

  // downloadInfo (optional): { buttonId, heading, path, filename, notice } —
  // when given, adds a "Download PDF" button (id = downloadInfo.buttonId) to
  // the card header. The caller must invoke wirePayslipDownload(downloadInfo)
  // once the returned HTML is in the DOM (mirrors every other card on this
  // page, which is rendered as a plain HTML string and wired separately).
  // Used both for the live/estimated preview (path to the employee's own
  // payslip.pdf) and for a frozen payroll-run line (path to that line's
  // payslip.pdf) via views-payroll.js's drill-down, which reuses this card.
  function payslipCard(p, downloadInfo) {
    var e = p.earnings, ded = p.deductions;
    var daBreakdown = e.daType === 'BOTH' ? ' <span class="small muted">(Variable ' + H.money(e.daVariable) + ' + Fixed ' + H.money(e.daFixed) + ')</span>' : '';
    var att = p.attendance;
    var heading = '<h3>' + (downloadInfo && downloadInfo.heading ? esc(downloadInfo.heading) : 'Estimated payslip (this month)') + '</h3>' +
      (downloadInfo ? '<button type="button" class="secondary sm" id="' + downloadInfo.buttonId + '">Download PDF</button>' : '');
    return gradeDetailsCard(p.grade) +
    '<div class="card"><div class="card-head">' + heading + '</div><div class="card-body">' +
      (att && Number(att.lopDays) > 0 ? '<p class="small muted">Basic, DA and allowances pro-rated for <strong>' + att.lopDays + ' Loss of Pay day(s)</strong> out of ' + att.payableDays + ' payable days (' + att.paidDays + ' days paid).</p>' : '') +
      '<div class="grid-2">' +
        '<div><h4>Earnings</h4><dl class="kv">' +
          (e.actualBasic != null && Number(e.actualBasic) !== Number(e.basic) ? '<dt>Actual Basic</dt><dd>' + H.money(e.actualBasic) + '</dd>' : '') +
          '<dt>Basic' + (e.actualBasic != null && Number(e.actualBasic) !== Number(e.basic) ? ' (after LOP)' : '') + '</dt><dd>' + H.money(e.basic) + '</dd>' +
          '<dt>DA</dt><dd>' + H.money(e.da) + daBreakdown + '</dd>' +
          '<dt>HRA</dt><dd>' + H.money(e.hra) + '</dd>' +
          (e.riskAllowance ? '<dt>Risk Allowance</dt><dd>' + H.money(e.riskAllowance) + '</dd>' : '') +
          (e.otherAllowance ? '<dt>Other Allowance</dt><dd>' + H.money(e.otherAllowance) + '</dd>' : '') +
          (e.cca ? '<dt>City Compensatory Allowance</dt><dd>' + H.money(e.cca) + '</dd>' : '') +
          (e.conveyance ? '<dt>Conveyance Allowance</dt><dd>' + H.money(e.conveyance) + '</dd>' : '') +
          (e.medicalAllowance ? '<dt>Medical Allowance</dt><dd>' + H.money(e.medicalAllowance) + '</dd>' : '') +
          (e.bonus ? '<dt>Bonus</dt><dd>' + H.money(e.bonus) + '</dd>' : '') +
          '<dt><strong>Gross earnings</strong></dt><dd><strong>' + H.money(e.grossEarnings) + '</strong></dd>' +
        '</dl></div>' +
        '<div><h4>Deductions</h4><dl class="kv">' +
          '<dt>Provident Fund (employee)</dt><dd>' + H.money(ded.pfEmployee) + '</dd>' +
          (ded.vpf ? '<dt>Voluntary PF</dt><dd>' + H.money(ded.vpf) + '</dd>' : '') +
          (ded.welfareFund ? '<dt>Welfare Fund</dt><dd>' + H.money(ded.welfareFund) + '</dd>' : '') +
          (ded.gsli ? '<dt>GSLI</dt><dd>' + H.money(ded.gsli) + '</dd>' : '') +
          '<dt>Professional Tax</dt><dd>' + H.money(ded.professionalTax) + '</dd>' +
          (ded.festivalAdvance ? '<dt>Festival Advance</dt><dd>' + H.money(ded.festivalAdvance) + '</dd>' : '') +
          // The Overdraft itself is never deducted from pay directly — only
          // its linked Recurring Deposit instalment (below) is. The
          // Overdraft's own amount/interest/total still show in Loan &
          // Interest Details for reference.
          (ded.recurringDeposit ? '<dt>Recurring Deposit</dt><dd>' + H.money(ded.recurringDeposit) + '</dd>' : '') +
          (ded.lic ? '<dt>LIC</dt><dd>' + H.money(ded.lic) + '</dd>' : '') +
          (ded.housingLoan ? '<dt>Housing Loan</dt><dd>' + H.money(ded.housingLoan) + '</dd>' : '') +
          (ded.vehicleLoan ? '<dt>Vehicle Loan</dt><dd>' + H.money(ded.vehicleLoan) + '</dd>' : '') +
          '<dt>Income Tax (TDS)</dt><dd>' + H.money(ded.incomeTax) + '</dd>' +
          '<dt><strong>Total deductions</strong></dt><dd><strong>' + H.money(ded.totalDeductions) + '</strong></dd>' +
        '</dl></div>' +
      '</div>' +
      '<p class="spaced"><strong>Estimated net pay: ' + H.money(p.netPay) + '</strong></p>' +
      '<p class="small muted">' + esc(p.note) + ' ' + esc(p.incomeTaxDetail.note) + '</p>' +
    '</div></div>' +
    loanInterestCard(p.loanStatus);
  }
  // Exposed so the Payroll engine's run-line drill-down (views-payroll.js)
  // can render a frozen line's payslipJson with the same markup as the
  // live per-employee preview above.
  H.payslipCard = payslipCard;

  // Wires the "Download PDF" button payslipCard() renders when called with a
  // downloadInfo — call this once the card's HTML is in the DOM. See
  // payslipCard() above for the downloadInfo shape.
  function wirePayslipDownload(downloadInfo) {
    if (!downloadInfo) return;
    H.on('#' + downloadInfo.buttonId, 'click', function () {
      var btn = this;
      H.busy(btn, true, 'Preparing…');
      H.downloadFile(downloadInfo.path, downloadInfo.filename, downloadInfo.notice)
        .then(function () { H.busy(btn, false); })
        .catch(function () { H.busy(btn, false); });
    });
  }
  H.wirePayslipDownload = wirePayslipDownload;

  // Festival Advance / Overdraft / Recurring Deposit — record a new one,
  // and show what's currently active with its computed repayment progress.
  function loansCard(id, writable) {
    return '<div class="card"><h3>Festival Advance, Overdraft &amp; Recurring Deposit</h3><div class="card-body">' +
      '<div class="notice" id="ln-notice"></div>' +
      '<div id="ln-fa">' + H.loading() + '</div>' +
      '<div id="ln-od">' + H.loading() + '</div>' +
      '<div id="ln-rd">' + H.loading() + '</div>' +
    '</div></div>' +
    '<div class="card"><h3>LIC, Housing Loan &amp; Vehicle Loan</h3><div class="card-body">' +
      '<div class="notice" id="ln2-notice"></div>' +
      '<div id="ln-lic">' + H.loading() + '</div>' +
      '<div id="ln-hl">' + H.loading() + '</div>' +
      '<div id="ln-vl">' + H.loading() + '</div>' +
    '</div></div>';
  }

  // The user may have navigated away (SPA hash routing) before this
  // resolves — guard every write so a stale response never throws on a
  // since-removed element.
  function loadLoansCard(id, writable) {
    Promise.all([
      H.api('GET', '/employees/' + id + '/festival-advances'),
      H.api('GET', '/employees/' + id + '/overdrafts'),
      H.api('GET', '/employees/' + id + '/recurring-deposits'),
      H.api('GET', '/employees/' + id + '/bank-accounts'),
    ])
      .then(function (r) {
        if (!H.$('#ln-fa')) return; // page changed while this was in flight
        var bankAccounts = r[3].data;
        drawFestivalAdvance(id, writable, r[0].data);
        drawOverdraft(id, writable, r[1], bankAccounts);
        drawRecurringDeposit(id, writable, r[2].data, r[1].data, bankAccounts);
      }).catch(function (err) {
        if (!H.$('#ln-fa')) return;
        H.$('#ln-fa').innerHTML = H.errorBox(err); H.$('#ln-od').innerHTML = ''; H.$('#ln-rd').innerHTML = '';
      });
    Promise.all([H.api('GET', '/employees/' + id + '/lic-policies'), H.api('GET', '/employees/' + id + '/housing-loans'), H.api('GET', '/employees/' + id + '/vehicle-loans')])
      .then(function (r) {
        if (!H.$('#ln-lic')) return;
        drawLic(id, writable, r[0].data);
        drawHousingLoan(id, writable, r[1].data);
        drawVehicleLoan(id, writable, r[2]);
      }).catch(function (err) {
        if (!H.$('#ln-lic')) return;
        H.$('#ln-lic').innerHTML = H.errorBox(err); H.$('#ln-hl').innerHTML = ''; H.$('#ln-vl').innerHTML = '';
      });
    refreshPayslipCard(id);
  }

  // Any change to Festival Advance / Overdraft / Recurring Deposit / LIC /
  // Housing Loan / Vehicle Loan changes the Estimated payslip's Deductions
  // total — loadLoansCard() calls this every time so the payslip card never
  // goes stale on a page the person hasn't reloaded.
  function refreshPayslipCard(id) {
    H.api('GET', '/employees/' + id + '/payslip').then(function (res) {
      if (!H.$('#payslip-wrap')) return; // page changed while this was in flight
      var downloadInfo = { buttonId: 'psc-pdf', path: '/employees/' + id + '/payslip.pdf', filename: 'payslip-' + id + '.pdf', notice: '#sb-notice' };
      H.$('#payslip-wrap').innerHTML = res && res.data ? payslipCard(res.data, downloadInfo) : '';
      if (res && res.data) H.wirePayslipDownload(downloadInfo);
    }).catch(function () { /* payslip is best-effort here; loan cards already show the error if any */ });
  }

  // Attendance / Loss of Pay (LOP) marking — one LOP-day count per calendar
  // month, which the Estimated payslip pro-rates Basic+DA+allowances by
  // (see services/attendance.js, services/payslip.js). A simple 12-month
  // grid for one year at a time.
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function attendanceCard() {
    var thisYear = new Date().getFullYear();
    return '<div class="card"><h3>Attendance &amp; Loss of Pay</h3><div class="card-body">' +
      '<div class="notice" id="att-notice"></div>' +
      '<div class="filters"><label class="small" for="att-year">Year</label> ' + H.select('att-year', [thisYear - 1, thisYear, thisYear + 1].map(function (y) { return [y, String(y)]; }), thisYear) + '</div>' +
      '<div id="att-grid">' + H.loading() + '</div>' +
    '</div></div>';
  }
  function loadAttendanceCard(id, writable, year) {
    H.api('GET', '/employees/' + id + '/attendance?year=' + year).then(function (res) {
      if (!H.$('#att-grid')) return;
      drawAttendance(id, writable, res.data);
    }).catch(function (err) { if (H.$('#att-grid')) H.$('#att-grid').innerHTML = H.errorBox(err); });
  }
  function drawAttendance(id, writable, data) {
    var months = data.months;
    var html = '<div class="table-wrap"><table><thead><tr><th>Month</th><th>Payable-day LOP</th><th>Remarks</th>' + (writable ? '<th></th>' : '') + '</tr></thead><tbody>' +
      months.map(function (m) {
        return '<tr data-month="' + m.month + '">' +
          '<td>' + MONTH_NAMES[m.month - 1] + ' ' + m.year + '</td>' +
          '<td>' + (writable ? H.input('att-lop-' + m.month, 'number', m.lopDays, 'step="0.5" min="0" max="31" class="sm"') : (Number(m.lopDays) || 0)) + '</td>' +
          '<td>' + (writable ? H.input('att-rem-' + m.month, 'text', m.remarks || '', 'maxlength="500" class="sm"') : esc(m.remarks || '—')) + '</td>' +
          (writable ? '<td><button type="button" class="secondary sm" data-act="att-save" data-month="' + m.month + '" data-year="' + m.year + '">Save</button></td>' : '') +
          '</tr>';
      }).join('') + '</tbody></table></div>';
    H.$('#att-grid').innerHTML = html;
    if (writable) {
      Array.prototype.forEach.call(document.querySelectorAll('#att-grid [data-act="att-save"]'), function (btn) {
        btn.addEventListener('click', function () {
          var month = Number(btn.getAttribute('data-month')); var year = Number(btn.getAttribute('data-year'));
          var lopDays = H.val('#att-lop-' + month); var remarks = H.val('#att-rem-' + month);
          H.busy(btn, true, 'Saving…');
          H.api('POST', '/employees/' + id + '/attendance', { year: year, month: month, lopDays: lopDays || 0, remarks: remarks }).then(function () {
            H.busy(btn, false);
            H.notice('#att-notice', 'ok', MONTH_NAMES[month - 1] + ' ' + year + ' saved.');
            refreshPayslipCard(id);
          }).catch(function (err) { H.busy(btn, false); H.notice('#att-notice', 'error', err.message); });
        });
      });
    }
  }

  // Employee document uploads (PAN, Aadhar, Education Certificate, Photo,
  // Others) — stored as bytes in the DB, sent to the server as a base64
  // data URL (the same pattern H.logoUploader uses for org/platform logos).
  var DOC_TYPES = [['PAN', 'PAN'], ['AADHAR', 'Aadhar'], ['EDUCATION_CERTIFICATE', 'Education Certificate'], ['PHOTO', 'Photo'], ['OTHER', 'Others']];
  function docTypeLabel(t) {
    var m = DOC_TYPES.filter(function (x) { return x[0] === t; });
    return m.length ? m[0][1] : t;
  }
  function documentsCard() {
    return '<div class="card"><h3>Documents</h3><div class="card-body">' +
      '<div class="notice" id="doc-notice"></div>' +
      '<div id="doc-list">' + H.loading() + '</div>' +
    '</div></div>';
  }
  function loadDocumentsCard(id, writable) {
    H.api('GET', '/employees/' + id + '/documents').then(function (res) {
      if (!H.$('#doc-list')) return; // page changed while this was in flight
      drawDocuments(id, writable, res.data);
    }).catch(function (err) {
      if (!H.$('#doc-list')) return;
      H.$('#doc-list').innerHTML = H.errorBox(err);
    });
  }
  /** Fetches a document's bytes with the auth header (a plain <a href> can't send one) and opens them in a new tab. */
  function openDocument(id, docId) {
    var s = H.getSession();
    fetch('/api/v1/employees/' + id + '/documents/' + docId + '/file', { headers: { Authorization: 'Bearer ' + (s && s.token) } })
      .then(function (r) { if (!r.ok) throw new Error('Could not load the document.'); return r.blob(); })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }).catch(function (err) { H.notice('#doc-notice', 'error', err.message); });
  }
  function drawDocuments(id, writable, rows) {
    var canDelete = writable && loanCanDelete();
    var html = '';
    if (rows.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Type</th><th>Label</th><th>Size</th><th>Uploaded</th><th></th>' + (canDelete ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(docTypeLabel(r.docType)) + '</td><td>' + esc(r.label || '—') + '</td><td>' + Math.ceil((r.sizeBytes || 0) / 1024) + ' KB</td><td>' + H.fmtDay(r.createdAt) + '</td>' +
            '<td><button type="button" class="secondary sm" data-act="doc-view" data-id="' + r.id + '">View</button></td>' +
            (canDelete ? '<td><button type="button" class="danger sm" data-act="doc-del" data-id="' + r.id + '">Delete</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    } else html += '<p class="small muted">None uploaded.</p>';
    if (writable) {
      html += '<div class="inline-form spaced">' +
        H.select('doc-type', DOC_TYPES, 'OTHER') +
        H.input('doc-label', 'text', '', 'placeholder="Label (optional)" maxlength="255"') +
        '<input type="file" id="doc-file" accept=".pdf,image/png,image/jpeg,image/webp">' +
        '<button type="button" class="secondary sm" id="doc-add">Upload</button></div>' +
        '<p class="small muted">PDF, PNG, JPEG or WebP, up to 5 MB.</p>';
    }
    H.$('#doc-list').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('#doc-list [data-act="doc-view"]'), function (btn) {
      btn.addEventListener('click', function () { openDocument(id, btn.getAttribute('data-id')); });
    });
    if (canDelete) {
      Array.prototype.forEach.call(document.querySelectorAll('#doc-list [data-act="doc-del"]'), function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('Delete this document? This cannot be undone.')) return;
          H.api('DELETE', '/employees/' + id + '/documents/' + btn.getAttribute('data-id')).then(function () {
            H.notice('#doc-notice', 'ok', 'Document deleted.'); loadDocumentsCard(id, writable);
          }).catch(function (err) { H.notice('#doc-notice', 'error', err.message); });
        });
      });
    }
    if (writable) {
      H.on('#doc-add', 'click', function () {
        var fileInput = H.$('#doc-file'); var file = fileInput.files && fileInput.files[0];
        if (!file) return H.notice('#doc-notice', 'error', 'Choose a file first.');
        if (file.size > 5 * 1024 * 1024) return H.notice('#doc-notice', 'error', 'That file is ' + Math.ceil(file.size / 1024) + ' KB — the limit is 5120 KB.');
        var docType = H.val('#doc-type'); var docLabel = H.val('#doc-label');
        var btn = this; H.busy(btn, true, 'Uploading…');
        var reader = new FileReader();
        reader.onload = function () {
          H.api('POST', '/employees/' + id + '/documents', { docType: docType, label: docLabel, dataUrl: reader.result }).then(function () {
            H.notice('#doc-notice', 'ok', 'Document uploaded.'); loadDocumentsCard(id, writable);
          }).catch(function (err) { H.busy(btn, false); H.notice('#doc-notice', 'error', err.message); });
        };
        reader.onerror = function () { H.busy(btn, false); H.notice('#doc-notice', 'error', 'Could not read the file.'); };
        reader.readAsDataURL(file);
      });
    }
  }

  function loanRow(label, r) {
    return '<tr><td>' + label + '</td><td>' + H.money(r.amount) + '</td><td>' + H.fmtDay(r.availedDate) + '</td><td>' + r.repayMonths + ' mo</td>' +
      '<td>' + H.money(r.monthlyInstallment) + '</td><td>' + H.money(r.balanceRemaining) + (r.fullyRepaid ? ' ' + H.badge('Repaid', 'ok') : '') + '</td></tr>';
  }

  // Editing/deleting an existing loan-style entry is restricted server-side
  // to Org Admin/HR Admin/Super Admin — the UI mirrors that by only showing
  // a Delete button to those roles (canWrite(['ORG_ADMIN','HR_ADMIN']) also
  // covers SUPER_ADMIN, per canWrite's own definition above).
  function loanCanDelete() { return canWrite(['ORG_ADMIN', 'HR_ADMIN']); }

  /** Wires every `[data-act="<act>"]` button under `containerSel` to DELETE `apiPath/<id>` and reload the loans card on success. */
  function wireLoanDelete(containerSel, act, apiPath, id, writable, noticeSel, label) {
    Array.prototype.forEach.call(document.querySelectorAll(containerSel + ' [data-act="' + act + '"]'), function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this ' + label + '? This cannot be undone.')) return;
        H.api('DELETE', apiPath + '/' + btn.getAttribute('data-id')).then(function () {
          H.notice(noticeSel, 'ok', label + ' deleted.'); loadLoansCard(id, writable);
        }).catch(function (err) { H.notice(noticeSel, 'error', err.message); });
      });
    });
  }

  function drawFestivalAdvance(id, writable, rows) {
    var active = rows.filter(function (r) { return !r.fullyRepaid; });
    var canDelete = writable && loanCanDelete();
    var html = '<h4>Festival Advance</h4>';
    if (rows.length) {
      html += '<div class="table-wrap"><table><thead><tr><th></th><th>Amount</th><th>Availed</th><th>Repay over</th><th>Monthly</th><th>Balance</th>' + (canDelete ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) { return loanRow('', r).replace('</tr>', (canDelete ? '<td><button type="button" class="danger sm" data-act="fa-del" data-id="' + r.id + '">Delete</button></td>' : '') + '</tr>'); }).join('') + '</tbody></table></div>';
    } else html += '<p class="small muted">None recorded.</p>';
    if (writable && !active.length) {
      html += '<div class="inline-form spaced">' +
        H.field('fa-amount', 'Amount (≤ 1 month Basic+DA)', H.input('fa-amount', 'number', '', 'step="0.01" min="0"')) +
        H.field('fa-date', 'Date availed', H.input('fa-date', 'date', H.todayYmd())) +
        '<button type="button" class="secondary sm" id="fa-add">Record Festival Advance</button></div>';
    }
    if (writable && active.length) {
      html += '<div class="inline-form spaced"><label class="small" for="fa-shorten">Shorten repayment to (months)</label>' +
        H.input('fa-shorten', 'number', active[0].repayMonths, 'min="1" max="' + active[0].repayMonths + '"') +
        '<button type="button" class="secondary sm" id="fa-shorten-btn" data-id="' + active[0].id + '">Save</button></div>';
    }
    H.$('#ln-fa').innerHTML = html;
    H.on('#fa-add', 'click', function () {
      var amount = Number(H.val('#fa-amount')); var date = H.val('#fa-date');
      if (!(amount > 0) || !date) return H.notice('#ln-notice', 'error', 'Enter an amount and date.');
      var btn = this; H.busy(btn, true, '…');
      H.api('POST', '/employees/' + id + '/festival-advances', { amount: amount, availedDate: date }).then(function () {
        H.notice('#ln-notice', 'ok', 'Festival Advance recorded.'); loadLoansCard(id, writable);
      }).catch(function (err) { H.busy(btn, false); H.notice('#ln-notice', 'error', err.message); });
    });
    H.on('#fa-shorten-btn', 'click', function () {
      var months = Number(H.val('#fa-shorten'));
      var btn = this; H.busy(btn, true, '…');
      H.api('PUT', '/employees/' + id + '/festival-advances/' + btn.getAttribute('data-id'), { repayMonths: months }).then(function () {
        H.notice('#ln-notice', 'ok', 'Repayment period updated.'); loadLoansCard(id, writable);
      }).catch(function (err) { H.busy(btn, false); H.notice('#ln-notice', 'error', err.message); });
    });
    if (canDelete) wireLoanDelete('#ln-fa', 'fa-del', '/employees/' + id + '/festival-advances', id, writable, '#ln-notice', 'Festival Advance');
  }

  function drawOverdraft(id, writable, res, bankAccounts) {
    var rows = res.data; var active = rows.filter(function (r) { return !r.fullyRepaid; });
    var currentRate = res.currentInterestRatePercent != null ? res.currentInterestRatePercent : 0;
    var canDelete = writable && loanCanDelete();
    var html = '<h4>Employee Overdraft</h4>' +
      '<p class="small muted">Eligibility: up to ' + H.money(res.eligibility.ceiling) + ' (15× Basic+DA, capped by the organisation\'s limit)' +
      (res.retirementDate ? ' · repayment capped at ' + res.maxRepayMonths + ' months (retirement ' + H.fmtDay(res.retirementDate) + ')' : '') +
      ' · current interest rate ' + currentRate + '%.</p>';
    if (rows.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Amount</th><th>Availed</th><th>Repay over</th><th>Rate</th><th>Interest</th><th>Monthly</th><th>Balance</th>' + (canDelete ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + H.money(r.amount) + '</td><td>' + H.fmtDay(r.availedDate) + '</td><td>' + r.repayMonths + ' mo</td>' +
            '<td>' + r.interestRatePercent + '%</td><td>' + H.money(r.interest) + '</td>' +
            '<td>' + H.money(r.monthlyInstallment) + '</td><td>' + H.money(r.balanceRemaining) + (r.fullyRepaid ? ' ' + H.badge('Repaid', 'ok') : '') + '</td>' +
            (canDelete ? '<td><button type="button" class="danger sm" data-act="od-del" data-id="' + r.id + '">Delete</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="small muted">Interest is locked in on the day each Overdraft is availed and never changes for that Overdraft afterwards, even if the organisation\'s rate later changes.</p>';
    } else html += '<p class="small muted">None recorded.</p>';
    if (writable && !active.length) {
      html += '<div class="inline-form spaced">' +
        H.field('od-amount', 'Amount availed (₹)', H.input('od-amount', 'number', '', 'step="0.01" min="0" max="' + res.eligibility.ceiling + '"')) +
        H.field('od-date', 'Date availed', H.input('od-date', 'date', H.todayYmd())) +
        H.field('od-months', 'Repay over (months)', H.input('od-months', 'number', res.maxRepayMonths, 'min="1" max="' + res.maxRepayMonths + '"')) +
        H.field('od-rate', 'Interest rate (%)', H.input('od-rate', 'number', currentRate, 'step="0.001" min="0"')) +
        H.field('od-account', 'Bank account (optional, type OD)', H.select('od-account', refOptions((bankAccounts || []).filter(function (a) { return a.accountType === 'OD'; }), function (a) { return a.accountNumber + (a.bankName ? ' — ' + a.bankName : ''); }, '— none / not linked —'))) +
        '<button type="button" class="secondary sm" id="od-add">Record Overdraft</button></div>';
    }
    H.$('#ln-od').innerHTML = html;
    H.on('#od-add', 'click', function () {
      var amount = Number(H.val('#od-amount')); var date = H.val('#od-date'); var months = Number(H.val('#od-months')); var rate = H.val('#od-rate');
      var accountId = H.val('#od-account') || null;
      if (!(amount > 0) || !date) return H.notice('#ln-notice', 'error', 'Enter an amount and date.');
      var btn = this; H.busy(btn, true, '…');
      H.api('POST', '/employees/' + id + '/overdrafts', { amount: amount, availedDate: date, repayMonths: months, interestRatePercent: rate, accountId: accountId }).then(function () {
        H.notice('#ln-notice', 'ok', 'Overdraft recorded.'); loadLoansCard(id, writable);
      }).catch(function (err) { H.busy(btn, false); H.notice('#ln-notice', 'error', err.message); });
    });
    if (canDelete) wireLoanDelete('#ln-od', 'od-del', '/employees/' + id + '/overdrafts', id, writable, '#ln-notice', 'Overdraft');
  }

  function drawLic(id, writable, rows) {
    var canDelete = writable && loanCanDelete();
    var html = '<h4>LIC <span class="small muted">(multiple policies allowed)</span></h4>';
    if (rows.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Policy</th><th>Opened</th><th>Started</th><th>Deduction</th><th>Sum assured</th><th>Maturity</th><th>Status</th>' + (canDelete ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.policyNumber || '—') + '</td><td>' + H.fmtDay(r.openingDate) + '</td><td>' + H.fmtDay(r.startedDate) + '</td>' +
            '<td>' + H.money(r.deductionAmount) + '</td><td>' + H.money(r.sumAssuredAmount) + '</td><td>' + H.fmtDay(r.maturityDate) + '</td>' +
            '<td>' + (r.closureDate ? H.statusBadge('CLOSED') + ' ' + H.fmtDay(r.closureDate) : (r.active ? H.badge('Active', 'ok') : H.statusBadge('INACTIVE'))) + '</td>' +
            (canDelete ? '<td><button type="button" class="danger sm" data-act="lic-del" data-id="' + r.id + '">Delete</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    } else html += '<p class="small muted">None recorded.</p>';
    if (writable) {
      html += '<div class="inline-form spaced">' +
        H.field('lic-policy', 'Policy number (optional)', H.input('lic-policy', 'text', '', '')) +
        H.field('lic-open', 'Opening date', H.input('lic-open', 'date', H.todayYmd())) +
        H.field('lic-start', 'Started date', H.input('lic-start', 'date', H.todayYmd())) +
        H.field('lic-amt', 'Deduction amount (₹/month)', H.input('lic-amt', 'number', '', 'step="0.01" min="0"')) +
        H.field('lic-sum', 'Sum assured (₹)', H.input('lic-sum', 'number', '', 'step="0.01" min="0"')) +
        H.field('lic-mat', 'Maturity date (optional)', H.input('lic-mat', 'date', '', '')) +
        '<button type="button" class="secondary sm" id="lic-add">Add LIC policy</button></div>';
    }
    H.$('#ln-lic').innerHTML = html;
    H.on('#lic-add', 'click', function () {
      var b = {
        policyNumber: H.val('#lic-policy'), openingDate: H.val('#lic-open'), startedDate: H.val('#lic-start'),
        deductionAmount: Number(H.val('#lic-amt')), sumAssuredAmount: Number(H.val('#lic-sum')), maturityDate: H.val('#lic-mat') || null,
      };
      if (!b.openingDate || !b.startedDate || !(b.deductionAmount > 0) || !(b.sumAssuredAmount > 0)) return H.notice('#ln2-notice', 'error', 'Fill in opening date, started date, deduction amount and sum assured.');
      var btn = this; H.busy(btn, true, '…');
      H.api('POST', '/employees/' + id + '/lic-policies', b).then(function () {
        H.notice('#ln2-notice', 'ok', 'LIC policy recorded.'); loadLoansCard(id, writable);
      }).catch(function (err) { H.busy(btn, false); H.notice('#ln2-notice', 'error', err.message); });
    });
    if (canDelete) wireLoanDelete('#ln-lic', 'lic-del', '/employees/' + id + '/lic-policies', id, writable, '#ln2-notice', 'LIC policy');
  }

  function drawHousingLoan(id, writable, rows) {
    var canDelete = writable && loanCanDelete();
    var html = '<h4>Housing Loan <span class="small muted">(multiple loans allowed)</span></h4>';
    if (rows.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Amount</th><th>Rate</th><th>EMI start</th><th>EMI end</th><th>Period</th><th>EMI</th><th>Status</th>' + (canDelete ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + H.money(r.totalLoanAmount) + '</td><td>' + r.interestRatePercent + '%</td><td>' + H.fmtDay(r.emiStartDate) + '</td><td>' + H.fmtDay(r.emiEndDate) + '</td>' +
            '<td>' + r.periodMonths + ' mo</td><td>' + H.money(r.emiAmount) + '</td>' +
            '<td>' + (r.closureDate ? H.statusBadge('CLOSED') + ' ' + H.fmtDay(r.closureDate) : (r.active ? H.badge('Active', 'ok') : H.statusBadge('INACTIVE'))) + '</td>' +
            (canDelete ? '<td><button type="button" class="danger sm" data-act="hl-del" data-id="' + r.id + '">Delete</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="small muted">EMI is computed from the standard reducing-balance amortisation formula.</p>';
    } else html += '<p class="small muted">None recorded.</p>';
    if (writable) {
      html += '<div class="inline-form spaced">' +
        H.field('hl-amt', 'Total loan amount (₹)', H.input('hl-amt', 'number', '', 'step="0.01" min="0"')) +
        H.field('hl-rate', 'Interest rate (%)', H.input('hl-rate', 'number', '', 'step="0.001" min="0"')) +
        H.field('hl-start', 'EMI start date', H.input('hl-start', 'date', H.todayYmd())) +
        H.field('hl-end', 'EMI end date', H.input('hl-end', 'date', '')) +
        '<button type="button" class="secondary sm" id="hl-add">Add Housing Loan</button></div>';
    }
    H.$('#ln-hl').innerHTML = html;
    H.on('#hl-add', 'click', function () {
      var b = { totalLoanAmount: Number(H.val('#hl-amt')), interestRatePercent: H.val('#hl-rate'), emiStartDate: H.val('#hl-start'), emiEndDate: H.val('#hl-end') };
      if (!(b.totalLoanAmount > 0) || !b.emiStartDate || !b.emiEndDate) return H.notice('#ln2-notice', 'error', 'Fill in the loan amount and both dates.');
      var btn = this; H.busy(btn, true, '…');
      H.api('POST', '/employees/' + id + '/housing-loans', b).then(function () {
        H.notice('#ln2-notice', 'ok', 'Housing Loan recorded.'); loadLoansCard(id, writable);
      }).catch(function (err) { H.busy(btn, false); H.notice('#ln2-notice', 'error', err.message); });
    });
    if (canDelete) wireLoanDelete('#ln-hl', 'hl-del', '/employees/' + id + '/housing-loans', id, writable, '#ln2-notice', 'Housing Loan');
  }

  function drawVehicleLoan(id, writable, res) {
    var rows = res.data; var allowMultiple = !!res.allowMultiple; var currentRate = res.currentInterestRatePercent != null ? res.currentInterestRatePercent : 0;
    var active = rows.filter(function (r) { return r.active; });
    var canDelete = writable && canWrite(['ORG_ADMIN', 'HR_ADMIN']);
    var html = '<h4>Vehicle Loan <span class="small muted">(' + (allowMultiple ? 'multiple loans allowed' : 'one at a time') + ')</span></h4>';
    if (rows.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Amount</th><th>Vehicle</th><th>Start</th><th>End</th><th>Period</th><th>Rate</th><th>EMI</th><th>Status</th>' + (canDelete ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + H.money(r.totalAmount) + '</td><td>' + esc(r.vehicleType || '—') + '</td><td>' + H.fmtDay(r.startDate) + '</td><td>' + H.fmtDay(r.endDate) + '</td>' +
            '<td>' + r.periodMonths + ' mo</td><td>' + (r.interestRatePercent != null ? r.interestRatePercent + '%' : '—') + '</td><td>' + H.money(r.emiAmount) + '</td>' +
            '<td>' + (r.closureDate ? H.statusBadge('CLOSED') + ' ' + H.fmtDay(r.closureDate) : (r.active ? H.badge('Active', 'ok') : H.statusBadge('INACTIVE'))) + '</td>' +
            (canDelete ? '<td><button type="button" class="danger sm" data-act="vl-del" data-id="' + r.id + '">Delete</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="small muted">EMI uses the standard diminishing-balance (reducing-balance) amortisation formula from the recorded interest rate; leave the rate blank to enter an EMI manually instead.</p>';
    } else html += '<p class="small muted">None recorded.</p>';
    if (writable && (allowMultiple || !active.length)) {
      html += '<div class="inline-form spaced">' +
        H.field('vl-amt', 'Total amount (₹)', H.input('vl-amt', 'number', '', 'step="0.01" min="0"')) +
        H.field('vl-type', 'Type of vehicle', H.input('vl-type', 'text', '', '')) +
        H.field('vl-start', 'Start date', H.input('vl-start', 'date', H.todayYmd())) +
        H.field('vl-end', 'End date', H.input('vl-end', 'date', '')) +
        H.field('vl-rate', 'Interest rate % (blank = manual EMI)', H.input('vl-rate', 'number', currentRate, 'step="0.001" min="0"')) +
        H.field('vl-emi', 'EMI amount (only if rate is blank)', H.input('vl-emi', 'number', '', 'step="0.01" min="0"')) +
        '<button type="button" class="secondary sm" id="vl-add">Add Vehicle Loan</button></div>';
    } else if (writable && !allowMultiple && active.length) {
      html += '<p class="small muted">This employee already has an active Vehicle Loan. The organisation has not enabled multiple Vehicle Loans (see Payroll Settings).</p>';
    }
    H.$('#ln-vl').innerHTML = html;
    H.on('#vl-add', 'click', function () {
      var rateVal = H.val('#vl-rate');
      var b = { totalAmount: Number(H.val('#vl-amt')), vehicleType: H.val('#vl-type'), startDate: H.val('#vl-start'), endDate: H.val('#vl-end') };
      if (rateVal === '') { b.interestRatePercent = null; b.emiAmount = Number(H.val('#vl-emi')); }
      else { b.interestRatePercent = Number(rateVal); }
      if (!(b.totalAmount > 0) || !b.startDate || !b.endDate) return H.notice('#ln2-notice', 'error', 'Fill in the amount and both dates.');
      if (b.interestRatePercent === null && !(b.emiAmount > 0)) return H.notice('#ln2-notice', 'error', 'Enter an EMI amount, or an interest rate to compute it automatically.');
      var btn = this; H.busy(btn, true, '…');
      H.api('POST', '/employees/' + id + '/vehicle-loans', b).then(function () {
        H.notice('#ln2-notice', 'ok', 'Vehicle Loan recorded.'); loadLoansCard(id, writable);
      }).catch(function (err) { H.busy(btn, false); H.notice('#ln2-notice', 'error', err.message); });
    });
    if (canDelete) {
      Array.prototype.forEach.call(document.querySelectorAll('#ln-vl [data-act="vl-del"]'), function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('Delete this Vehicle Loan? This cannot be undone.')) return;
          H.api('DELETE', '/employees/' + id + '/vehicle-loans/' + btn.getAttribute('data-id')).then(function () {
            H.notice('#ln2-notice', 'ok', 'Vehicle Loan deleted.'); loadLoansCard(id, writable);
          }).catch(function (err) { H.notice('#ln2-notice', 'error', err.message); });
        });
      });
    }
  }

  function drawRecurringDeposit(id, writable, rows, overdrafts, bankAccounts) {
    var active = rows.filter(function (r) { return r.status === 'ACTIVE'; });
    var openOD = (overdrafts || []).filter(function (r) { return !r.fullyRepaid; })[0];
    var canDelete = writable && loanCanDelete();
    // Held as security against an Overdraft — always tied to one, never a
    // standalone savings entry.
    var html = '<h4>Recurring Deposit <span class="small muted">(security against the Overdraft)</span></h4>';
    if (rows.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Monthly</th><th>Since</th><th>Linked Overdraft</th><th>Status</th>' + (canDelete ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + H.money(r.monthlyAmount) + '</td><td>' + H.fmtDay(r.startDate) + '</td><td>' + (r.overdraftId ? '#' + r.overdraftId : '—') + '</td><td>' + H.statusBadge(r.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE') + '</td>' +
            (canDelete ? '<td><button type="button" class="danger sm" data-act="rd-del" data-id="' + r.id + '">Delete</button></td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    } else html += '<p class="small muted">None recorded.</p>';
    if (writable && !active.length && openOD) {
      html += '<div class="inline-form spaced">' +
        H.field('rd-amount', 'Monthly amount (₹)', H.input('rd-amount', 'number', openOD.monthlyInstallment, 'step="0.01" min="0"')) +
        H.field('rd-date', 'Start date', H.input('rd-date', 'date', H.todayYmd())) +
        H.field('rd-account', 'Bank account (optional, type RD)', H.select('rd-account', refOptions((bankAccounts || []).filter(function (a) { return a.accountType === 'RD'; }), function (a) { return a.accountNumber + (a.bankName ? ' — ' + a.bankName : ''); }, '— none / not linked —'))) +
        '<button type="button" class="secondary sm" id="rd-add">Record Recurring Deposit</button></div>' +
        '<p class="small muted">Linked to the open Overdraft #' + openOD.id + ' — defaulted to its own instalment (' + H.money(openOD.monthlyInstallment) + '); edit if different.</p>';
    } else if (writable && !active.length && !openOD) {
      html += '<p class="small muted">A Recurring Deposit can only be recorded against an active Overdraft — record an Overdraft first.</p>';
    }
    H.$('#ln-rd').innerHTML = html;
    H.on('#rd-add', 'click', function () {
      var amount = Number(H.val('#rd-amount')); var date = H.val('#rd-date');
      var accountId = H.val('#rd-account') || null;
      if (!(amount > 0) || !date) return H.notice('#ln-notice', 'error', 'Enter an amount and date.');
      var btn = this; H.busy(btn, true, '…');
      H.api('POST', '/employees/' + id + '/recurring-deposits', { monthlyAmount: amount, startDate: date, overdraftId: openOD ? openOD.id : null, accountId: accountId }).then(function () {
        H.notice('#ln-notice', 'ok', 'Recurring Deposit recorded.'); loadLoansCard(id, writable);
      }).catch(function (err) { H.busy(btn, false); H.notice('#ln-notice', 'error', err.message); });
    });
    if (canDelete) wireLoanDelete('#ln-rd', 'rd-del', '/employees/' + id + '/recurring-deposits', id, writable, '#ln-notice', 'Recurring Deposit');
  }

  // ----------------------------------------------------------- bank accounts

  function bankAccountsCard() {
    return '<div class="card"><h3>Bank Accounts</h3><div class="card-body">' +
      '<div class="notice" id="bnk-notice"></div>' +
      '<div id="bnk-list">' + H.loading() + '</div>' +
      '<div id="bnk-salary"></div>' +
      '<div id="bnk-edit-panel"></div>' +
    '</div></div>';
  }

  function loadBankAccountsCard(id, writable) {
    H.api('GET', '/employees/' + id + '/bank-accounts').then(function (res) {
      if (!H.$('#bnk-list')) return; // page changed while this was in flight
      drawBankAccounts(id, writable, res.data, res.salaryCreditAccountId);
    }).catch(function (err) { if (H.$('#bnk-list')) H.$('#bnk-list').innerHTML = H.errorBox(err); });
  }

  function drawBankAccounts(id, writable, rows, salaryCreditAccountId) {
    var canDelete = writable && loanCanDelete();
    var html = '';
    if (rows.length) {
      html += '<div class="table-wrap"><table><thead><tr><th>Type</th><th>Account No.</th><th>Bank</th><th>IFSC</th><th>Branch</th><th>Status</th>' + (writable ? '<th></th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.accountType) + '</td><td>' + esc(r.accountNumber) + '</td><td>' + esc(r.bankName || '—') + '</td><td>' + esc(r.ifsc || '—') + '</td><td>' + esc(r.branchName || '—') + '</td>' +
            '<td>' + H.statusBadge(r.status) + '</td>' +
            (writable ? '<td class="actions"><button type="button" class="secondary sm" data-act="bnk-edit" data-id="' + r.id + '">Edit</button>' +
              (canDelete ? '<button type="button" class="danger sm" data-act="bnk-del" data-id="' + r.id + '">Delete</button>' : '') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    } else html += '<p class="small muted">No bank accounts on record.</p>';
    if (writable) {
      html += '<div class="inline-form spaced">' +
        H.field('bnk-type', 'Type', H.select('bnk-type', enumOptions(['SB', 'OD', 'RD', 'OTHER']), 'SB')) +
        H.field('bnk-number', 'Account number', H.input('bnk-number', 'text', '')) +
        H.field('bnk-bank', 'Bank name', H.input('bnk-bank', 'text', '')) +
        H.field('bnk-ifsc', 'IFSC', H.input('bnk-ifsc', 'text', '')) +
        H.field('bnk-branch', 'Branch', H.input('bnk-branch', 'text', '')) +
        '<button type="button" class="secondary sm" id="bnk-add">Add bank account</button></div>';
    }
    H.$('#bnk-list').innerHTML = html;
    H.$('#bnk-edit-panel').innerHTML = '';

    if (writable) {
      H.on('#bnk-add', 'click', function () {
        var accountType = H.val('#bnk-type'); var accountNumber = H.val('#bnk-number');
        if (!accountNumber) return H.notice('#bnk-notice', 'error', 'Enter the account number.');
        var b = { accountType: accountType, accountNumber: accountNumber, bankName: H.val('#bnk-bank'), ifsc: H.val('#bnk-ifsc'), branchName: H.val('#bnk-branch') };
        var btn = this; H.busy(btn, true, '…');
        H.api('POST', '/employees/' + id + '/bank-accounts', b).then(function () {
          H.notice('#bnk-notice', 'ok', 'Bank account added.'); loadBankAccountsCard(id, writable); loadLoansCard(id, writable);
        }).catch(function (err) { H.busy(btn, false); H.notice('#bnk-notice', 'error', err.message); });
      });
      H.$$('#bnk-list [data-act="bnk-edit"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = rows.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
          if (!row) return;
          H.$('#bnk-edit-panel').innerHTML =
            '<div class="card-body-inset"><h4>Edit bank account — ' + esc(row.accountType) + ' ' + esc(row.accountNumber) + '</h4><div class="grid-2">' +
              H.field('bnke-bank', 'Bank name', H.input('bnke-bank', 'text', row.bankName)) +
              H.field('bnke-ifsc', 'IFSC', H.input('bnke-ifsc', 'text', row.ifsc)) +
              H.field('bnke-branch', 'Branch', H.input('bnke-branch', 'text', row.branchName)) +
              H.field('bnke-status', 'Status', H.select('bnke-status', enumOptions(['ACTIVE', 'INACTIVE']), row.status)) +
            '</div><div class="btn-row"><button type="button" id="bnke-save">Save</button><button type="button" class="secondary" id="bnke-cancel">Cancel</button></div></div>';
          H.on('#bnke-cancel', 'click', function () { H.$('#bnk-edit-panel').innerHTML = ''; });
          H.on('#bnke-save', 'click', function () {
            var body = { bankName: H.val('#bnke-bank'), ifsc: H.val('#bnke-ifsc'), branchName: H.val('#bnke-branch'), status: H.val('#bnke-status') };
            var sb = this; H.busy(sb, true, 'Saving…');
            H.api('PUT', '/employees/' + id + '/bank-accounts/' + row.id, body).then(function () {
              H.notice('#bnk-notice', 'ok', 'Saved.'); loadBankAccountsCard(id, writable); loadLoansCard(id, writable);
            }).catch(function (err) { H.busy(sb, false); H.notice('#bnk-notice', 'error', err.message); });
          });
        });
      });
      if (canDelete) {
        H.$$('#bnk-list [data-act="bnk-del"]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (!confirm('Delete this bank account? This cannot be undone.')) return;
            H.busy(btn, true, '…');
            H.api('DELETE', '/employees/' + id + '/bank-accounts/' + btn.getAttribute('data-id')).then(function () {
              H.notice('#bnk-notice', 'ok', 'Bank account deleted.'); loadBankAccountsCard(id, writable); loadLoansCard(id, writable);
            }).catch(function (err) { H.busy(btn, false); H.notice('#bnk-notice', 'error', err.message); });
          });
        });
      }
    }

    H.$('#bnk-salary').innerHTML =
      '<div class="inline-form spaced"><label class="small" for="bnk-salary-sel">Salary credit account</label>' +
      H.select('bnk-salary-sel', refOptions(rows, function (a) { return a.accountType + ' — ' + a.accountNumber + (a.bankName ? ' (' + a.bankName + ')' : ''); }, '— Use default (legacy bank fields) —'), salaryCreditAccountId || '') +
      (writable ? '<button type="button" class="secondary sm" id="bnk-salary-save">Save</button>' : '') + '</div>';
    if (writable) {
      H.on('#bnk-salary-save', 'click', function () {
        var accountId = H.val('#bnk-salary-sel') || null;
        var btn = this; H.busy(btn, true, 'Saving…');
        H.api('PUT', '/employees/' + id + '/salary-credit-account', { accountId: accountId }).then(function () {
          H.busy(btn, false); H.notice('#bnk-notice', 'ok', 'Salary credit account updated.'); refreshPayslipCard(id);
        }).catch(function (err) { H.busy(btn, false); H.notice('#bnk-notice', 'error', err.message); });
      });
    }
  }

  // ------------------------------------------------------------------ leave

  var LEAVE_STATUS_KIND = { PENDING: 'warn', APPROVED: 'ok', REJECTED: 'off', CANCELLED: 'off' };
  function canDecideLeave() { return canWrite(['ORG_ADMIN', 'HR_ADMIN']) || H.role() === 'APPROVING_AUTHORITY'; }

  function leaveCard(writable) {
    return '<div class="card"><h3>Leave</h3><div class="card-body">' +
      '<div class="notice" id="lv-notice"></div>' +
      '<h4>Balances</h4><div id="lv-balances">' + H.loading() + '</div>' +
      '<h4>Applications</h4><div id="lv-apps">' + H.loading() + '</div>' +
      (writable ? '<h4>File leave</h4><div id="lv-file"></div>' : '') +
    '</div></div>';
  }

  function loadLeaveCard(id, writable) {
    Promise.all([
      H.api('GET', '/employees/' + id + '/leave-balances'),
      H.api('GET', '/employees/' + id + '/leave-applications'),
      H.api('GET', '/leave-types'),
    ]).then(function (r) {
      if (!H.$('#lv-balances')) return; // page changed while this was in flight
      drawLeaveBalances(r[0].data, r[0].year);
      drawLeaveApplications(id, writable, r[1].data);
      if (writable) drawFileLeaveForm(id, writable, r[2].data);
    }).catch(function (err) {
      if (!H.$('#lv-balances')) return;
      H.$('#lv-balances').innerHTML = H.errorBox(err); H.$('#lv-apps').innerHTML = '';
    });
  }

  function drawLeaveBalances(rows, year) {
    var el = H.$('#lv-balances');
    if (!rows.length) { el.innerHTML = '<p class="small muted">No balances yet for ' + year + ' — accrue leave from the Leave Policy screen.</p>'; return; }
    el.innerHTML = '<p class="small muted">Year: ' + year + '</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Leave type</th><th>Opening</th><th>Accrued</th><th>Availed</th><th>Closing</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var lt = r.LeaveType || {};
        return '<tr><td>' + esc(lt.code || '') + ' — ' + esc(lt.name || '') + '</td><td>' + r.openingBalance + '</td><td>' + r.accrued + '</td><td>' + r.availed + '</td><td><strong>' + r.closingBalance + '</strong></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function drawLeaveApplications(id, writable, rows) {
    var canDecide = canDecideLeave();
    var el = H.$('#lv-apps');
    if (!rows.length) { el.innerHTML = '<p class="small muted">No leave applications yet.</p>'; return; }
    el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Leave type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Reason</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var lt = r.LeaveType || {};
        var acts = '';
        if (r.status === 'PENDING' && canDecide) {
          acts += '<button type="button" class="sm" data-act="lv-approve" data-id="' + r.id + '">Approve</button> ' +
                  '<button type="button" class="danger sm" data-act="lv-reject" data-id="' + r.id + '">Reject</button> ';
        }
        if ((r.status === 'PENDING' || r.status === 'APPROVED') && writable) {
          acts += '<button type="button" class="secondary sm" data-act="lv-cancel" data-id="' + r.id + '">Cancel</button>';
        }
        return '<tr><td>' + esc(lt.code || '') + '</td><td>' + H.fmtDay(r.fromDate) + '</td><td>' + H.fmtDay(r.toDate) + '</td><td>' + r.days + '</td>' +
          '<td>' + H.badge(r.status, LEAVE_STATUS_KIND[r.status]) + '</td><td class="small">' + esc(r.reason || '—') + '</td>' +
          '<td class="actions">' + acts + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    H.$$('#lv-apps [data-act="lv-approve"]').forEach(function (btn) {
      btn.addEventListener('click', function () { decideLeaveApp(id, writable, btn.getAttribute('data-id'), 'APPROVED'); });
    });
    H.$$('#lv-apps [data-act="lv-reject"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var reason = window.prompt('Reason for rejecting (optional):', '');
        if (reason === null) return;
        decideLeaveApp(id, writable, btn.getAttribute('data-id'), 'REJECTED', reason);
      });
    });
    H.$$('#lv-apps [data-act="lv-cancel"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!window.confirm('Cancel this leave application?')) return;
        var appId = btn.getAttribute('data-id');
        H.busy(btn, true, '…');
        H.api('POST', '/leave-applications/' + appId + '/cancel', {}).then(function () {
          H.notice('#lv-notice', 'ok', 'Cancelled.'); loadLeaveCard(id, writable);
        }).catch(function (err) { H.busy(btn, false); H.notice('#lv-notice', 'error', err.message); });
      });
    });
  }

  function decideLeaveApp(id, writable, appId, decision, reason) {
    H.api('POST', '/leave-applications/' + appId + '/decide', { decision: decision, reason: reason || undefined }).then(function () {
      H.notice('#lv-notice', 'ok', decision === 'APPROVED' ? 'Approved.' : 'Rejected.'); loadLeaveCard(id, writable);
    }).catch(function (err) { H.notice('#lv-notice', 'error', err.message); });
  }

  function drawFileLeaveForm(id, writable, leaveTypes) {
    var el = H.$('#lv-file'); if (!el) return;
    var active = leaveTypes.filter(function (t) { return t.status === 'ACTIVE'; });
    el.innerHTML = '<div class="inline-form spaced">' +
      H.field('lv-type', 'Leave type', H.select('lv-type', refOptions(active, function (t) { return t.code + ' — ' + t.name; }, '— choose —'))) +
      H.field('lv-from', 'From', H.input('lv-from', 'date', H.todayYmd())) +
      H.field('lv-to', 'To', H.input('lv-to', 'date', H.todayYmd())) +
      H.field('lv-reason', 'Reason', H.input('lv-reason', 'text', '')) +
      '<button type="button" class="secondary sm" id="lv-file-btn">File leave</button></div>';
    H.on('#lv-file-btn', 'click', function () {
      var leaveTypeId = H.val('#lv-type');
      if (!leaveTypeId) return H.notice('#lv-notice', 'error', 'Choose a leave type.');
      var body = { leaveTypeId: leaveTypeId, fromDate: H.val('#lv-from'), toDate: H.val('#lv-to'), reason: H.val('#lv-reason') };
      var btn = this; H.busy(btn, true, '…');
      H.api('POST', '/employees/' + id + '/leave-applications', body).then(function () {
        H.notice('#lv-notice', 'ok', 'Leave application filed.'); loadLeaveCard(id, writable);
      }).catch(function (err) { H.busy(btn, false); H.notice('#lv-notice', 'error', err.message); });
    });
  }

  function viewServiceBook(params) {
    var id = params[0];
    var writable = canWrite(['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER']);
    H.shell('<div id="sb">' + H.loading() + '</div>');
    Promise.all([H.api('GET', '/employees/' + id + '/service-book'), H.api('GET', '/government-orders'), H.api('GET', '/employees/' + id + '/payslip').catch(function () { return null; })]).then(function (r) {
      var d = r[0].data; var gos = r[1].data; var e = d.employee; var payslip = r[2] && r[2].data;
      H.$('#sb').innerHTML =
        H.pageHead('Service Book — ' + e.name, '<code class="inline">' + esc(e.empCode) + '</code> · ' + esc(e.PostCadre ? e.PostCadre.name : '') , '', [['Employees', '/employees'], [e.empCode]]) +
        '<div class="notice" id="sb-notice"></div>' +
        '<div class="card"><h3>Present position</h3><div class="card-body"><dl class="kv cols">' +
          '<dt>Date of birth</dt><dd>' + H.fmtDay(e.dob) + '</dd>' +
          '<dt>Date of joining</dt><dd>' + H.fmtDay(e.doj) + '</dd>' +
          // Date of appointment to present post and Date of Confirmation are
          // often the same day — show one combined row instead of two
          // identical-looking dates when they match.
          (e.doa && e.dateOfConfirmation && String(e.doa) === String(e.dateOfConfirmation)
            ? '<dt>Date of appointment / confirmation</dt><dd>' + H.fmtDay(e.doa) + '</dd>'
            : (e.doa ? '<dt>Date of appointment to present post</dt><dd>' + H.fmtDay(e.doa) + '</dd>' : '') +
              (e.dateOfConfirmation ? '<dt>Date of Confirmation</dt><dd>' + H.fmtDay(e.dateOfConfirmation) + '</dd>' : '')) +
          '<dt>Post</dt><dd>' + esc(e.PostCadre ? e.PostCadre.name : '—') + '</dd>' +
          '<dt>Grade</dt><dd>' + esc(e.CurrentPayScale ? e.CurrentPayScale.code + ' — ' + e.CurrentPayScale.name : '—') + '</dd>' +
          '<dt>Stage</dt><dd>' + (e.CurrentPayStage ? 'Stage ' + e.CurrentPayStage.stageNo : '—') + '</dd>' +
          '<dt>Basic pay</dt><dd>' + H.money(e.currentBasicPay) + '</dd>' +
          '<dt>Service status</dt><dd>' + esc(label(e.employmentStatus)) + '</dd>' +
          '<dt>Date of Retirement</dt><dd>' + (d.effectiveRetirementDate ? H.fmtDay(d.effectiveRetirementDate) : '—') +
            (d.effectiveRetirementDate && !e.dateOfRetirement ? ' <span class="small muted">(auto, from DOB)</span>' : '') + '</dd>' +
        '</dl></div></div>' +
        '<div id="payslip-wrap">' + (payslip ? payslipCard(payslip) : '') + '</div>' +
        documentsCard() +
        attendanceCard() +
        bankAccountsCard() +
        loansCard(id, writable) +
        leaveCard(writable) +
        (writable ? '<div class="card"><h3>Add an entry</h3><div class="card-body">' +
          '<p class="small muted">Entries are permanent — a mistake is corrected by a further entry, as in a paper service book. Increments, promotions and pay revisions are posted by the pay engines, not entered here.</p>' +
          '<form id="sb-form" novalidate><div class="grid-2">' +
            H.field('sb-type', 'Event', H.select('sb-type', enumOptions(EVENT_TYPES), 'OTHER')) +
            H.field('sb-date', 'Date', H.input('sb-date', 'date', H.todayYmd())) +
            H.field('sb-order', 'Order / reference no.', H.input('sb-order', 'text', '', 'maxlength="128"')) +
            H.field('sb-go', 'Government Order', H.select('sb-go', refOptions(gos, function (g) { return g.goNumber + (g.subject ? ' — ' + g.subject : ''); }))) +
          '</div>' + H.field('sb-remarks', 'Remarks', H.textarea('sb-remarks', '')) +
          H.field('sb-doc', 'Attach a document (optional)', '<input type="file" id="sb-doc" accept=".pdf,image/png,image/jpeg,image/webp">', 'PDF, PNG, JPEG or WebP, up to 5 MB.') +
          '<button type="submit" id="sb-save">Add to service book</button></form></div></div>' : '') +
        '<div class="card"><h3>Service history (' + d.timelineCount + ')</h3>' +
          (d.timeline.length ? '<ol class="timeline">' + d.timeline.map(function (t) {
            var pay = t.PayHistoryEntry;
            return '<li><div class="tl-date">' + H.fmtDay(t.eventDate) + '</div><div class="tl-body"><strong>' + esc(label(t.eventType)) + '</strong>' +
              (t.orderRef ? ' <span class="small muted">Order ' + esc(t.orderRef) + '</span>' : '') +
              (pay ? '<div class="small">Basic pay ' + H.money(pay.previousBasicPay) + ' → <strong>' + H.money(pay.newBasicPay) + '</strong></div>' : '') +
              (t.GovernmentOrder ? '<div class="small muted">GO ' + esc(t.GovernmentOrder.goNumber) + '</div>' : '') +
              (t.RuleReference ? '<div class="small muted">Rule: ' + esc(t.RuleReference.title) + '</div>' : '') +
              (t.remarks ? '<div class="small">' + esc(t.remarks) + '</div>' : '') +
              (t.document ? '<div class="small"><a href="#" class="sb-doc-view" data-id="' + t.id + '">' + esc(t.document.label || 'View attached document') + '</a></div>' : '') + '</div></li>';
          }).join('') + '</ol>' : '<div class="empty">No entries yet.</div>') +
        '</div>';
      loadLoansCard(id, writable);
      loadDocumentsCard(id, writable);
      loadBankAccountsCard(id, writable);
      loadLeaveCard(id, writable);
      loadAttendanceCard(id, writable, new Date().getFullYear());
      H.on('#att-year', 'change', function () { loadAttendanceCard(id, writable, Number(H.val('#att-year'))); });
      Array.prototype.forEach.call(document.querySelectorAll('.sb-doc-view'), function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          H.openAuthedFile('/employees/' + id + '/service-book/events/' + a.getAttribute('data-id') + '/document/file')
            .catch(function (err) { H.notice('#sb-notice', 'error', err.message); });
        });
      });
      H.on('#sb-form', 'submit', function (ev) {
        ev.preventDefault();
        var btn = H.$('#sb-save');
        var body = { eventType: H.val('#sb-type'), eventDate: H.val('#sb-date'), orderRef: H.val('#sb-order'), governmentOrderId: H.val('#sb-go') || null, remarks: H.val('#sb-remarks') };
        if (!body.eventDate) return H.notice('#sb-notice', 'error', 'Enter the date of the event.');
        if (!window.confirm('Add this ' + label(body.eventType) + ' entry dated ' + H.fmtDay(body.eventDate) + '?\n\nService book entries cannot be edited or removed.')) return;
        var fileInput = H.$('#sb-doc');
        var file = fileInput && fileInput.files && fileInput.files[0];
        if (file && file.size > 5 * 1024 * 1024) return H.notice('#sb-notice', 'error', 'That file is ' + Math.ceil(file.size / 1024) + ' KB — the limit is 5120 KB.');
        H.busy(btn, true, 'Adding…');
        (file ? H.readAsDataUrl(file) : Promise.resolve(null)).then(function (dataUrl) {
          if (dataUrl) { body.documentDataUrl = dataUrl; body.documentLabel = file.name; }
          return H.api('POST', '/employees/' + id + '/service-book/events', body);
        }).then(function () {
          viewServiceBook(params);
        }).catch(function (err) { H.busy(btn, false); H.notice('#sb-notice', 'error', err.message); });
      });
    }).catch(function (err) { H.$('#sb').innerHTML = H.errorBox(err); });
  }

  // --------------------------------------------------------- GO register

  function viewGOs() {
    crudView({
      title: 'GO register', noun: 'Government Order', api: '/government-orders',
      intro: 'Government Orders and circulars your rules and pay revisions rely on. Every rule should cite the GO that authorises it.',
      writeRoles: ['ORG_ADMIN', 'HR_ADMIN'], deleteLabel: 'Supersede', deletedValue: 'Superseded',
      inactive: function (r) { return r.status === 'SUPERSEDED'; },
      columns: [
        { label: 'GO number', html: function (r) { return '<strong>' + esc(r.goNumber) + '</strong>'; } },
        { label: 'Date', html: function (r) { return H.fmtDay(r.goDate); } },
        { label: 'Issued by', html: function (r) { return esc(r.issuingAuthority || '—'); } },
        { label: 'Subject', html: function (r) { return esc(r.subject || '—') + (r.documentUrl && /^https?:\/\//i.test(r.documentUrl) ? ' <a href="' + esc(r.documentUrl) + '" target="_blank" rel="noopener noreferrer" class="small">Document</a>' : ''); } },
        { label: 'Status', html: function (r) { return H.statusBadge(r.status); } }
      ],
      fields: [
        { key: 'goNumber', label: 'GO number', required: true, hint: 'e.g. G.O.(P) No. 27/2021/Fin' },
        { key: 'goDate', label: 'GO date', type: 'date', required: true },
        { key: 'issuingAuthority', label: 'Issuing authority', hint: 'e.g. Finance Department, Govt. of Kerala' },
        { key: 'status', label: 'Status', type: 'select', options: enumOptions(['DRAFT', 'ACTIVE', 'SUPERSEDED']), def: 'DRAFT' },
        { key: 'subject', label: 'Subject', wide: true },
        { key: 'documentUrl', label: 'Link to document', wide: true, hint: 'Optional https:// link to the scanned GO.' },
        { key: 'description', label: 'Notes', type: 'textarea', wide: true }
      ],
      afterForm: function (row) {
        if (!row) return; // uploading a scan needs an existing GO id
        var formEl = H.$('#crud-form');
        var panel = document.createElement('div');
        panel.className = 'card-body-inset';
        panel.innerHTML = '<h4>Scanned document</h4><div class="notice" id="go-doc-notice"></div>' +
          '<div id="go-doc-status" class="small muted">Loading…</div>' +
          '<div class="inline-form spaced">' +
            '<input type="file" id="go-doc-file" accept=".pdf,image/png,image/jpeg,image/webp">' +
            '<button type="button" class="secondary sm" id="go-doc-upload">Upload / replace</button>' +
            '<button type="button" class="danger sm" id="go-doc-remove" hidden>Remove</button>' +
          '</div><p class="small muted">PDF, PNG, JPEG or WebP, up to 5 MB.</p>';
        var btnRow = formEl.querySelector('.btn-row');
        formEl.insertBefore(panel, btnRow);

        function refreshStatus() {
          H.api('GET', '/government-orders/' + row.id + '/document').then(function (r) {
            if (!H.$('#go-doc-status')) return; // navigated away while this was in flight
            var meta = r.data;
            H.$('#go-doc-remove').hidden = !meta;
            H.$('#go-doc-status').innerHTML = meta
              ? 'Uploaded: <a href="#" id="go-doc-view">' + esc(meta.label || 'view file') + '</a> (' + Math.ceil((meta.sizeBytes || 0) / 1024) + ' KB, ' + H.fmtDay(meta.createdAt) + ')'
              : 'No document uploaded.';
            H.on('#go-doc-view', 'click', function (e) { e.preventDefault(); H.openAuthedFile('/government-orders/' + row.id + '/document/file').catch(function (err) { H.notice('#go-doc-notice', 'error', err.message); }); });
          }).catch(function (err) { if (H.$('#go-doc-notice')) H.notice('#go-doc-notice', 'error', err.message); });
        }
        refreshStatus();

        H.on('#go-doc-upload', 'click', function () {
          var input = H.$('#go-doc-file');
          var file = input.files && input.files[0];
          if (!file) return H.notice('#go-doc-notice', 'error', 'Choose a file first.');
          if (file.size > 5 * 1024 * 1024) return H.notice('#go-doc-notice', 'error', 'That file is ' + Math.ceil(file.size / 1024) + ' KB — the limit is 5120 KB.');
          var btn = this;
          H.busy(btn, true, 'Uploading…');
          H.readAsDataUrl(file).then(function (dataUrl) {
            return H.api('POST', '/government-orders/' + row.id + '/document', { dataUrl: dataUrl, label: file.name });
          }).then(function () {
            H.busy(btn, false);
            H.notice('#go-doc-notice', 'ok', 'Uploaded.');
            input.value = '';
            refreshStatus();
          }).catch(function (err) { H.busy(btn, false); H.notice('#go-doc-notice', 'error', err.message); });
        });
        H.on('#go-doc-remove', 'click', function () {
          if (!window.confirm('Remove the uploaded document?')) return;
          var btn = this;
          H.busy(btn, true, 'Removing…');
          H.api('DELETE', '/government-orders/' + row.id + '/document').then(function () {
            H.busy(btn, false);
            H.notice('#go-doc-notice', 'ok', 'Removed.');
            refreshStatus();
          }).catch(function (err) { H.busy(btn, false); H.notice('#go-doc-notice', 'error', err.message); });
        });
      }
    });
  }

  // ------------------------------------------------------------ KSR rules

  var RULE_TYPES = ['INCREMENT', 'PROMOTION', 'HIGHER_GRADE', 'PAY_REVISION', 'LEAVE', 'PENSION', 'SETTLEMENT', 'GENERAL'];

  function viewRules() {
    crudView({
      title: 'KSR rules', noun: 'rule', api: '/ksr-rules',
      intro: 'The Kerala Service Rules and bank regulations the system applies. <strong>A rule is used in calculations only once it is marked verified</strong> against its source — unverified rules are shown for reference only.',
      writeRoles: ['ORG_ADMIN', 'HR_ADMIN'], deleteLabel: 'Supersede', deletedValue: 'Superseded',
      inactive: function (r) { return r.status === 'SUPERSEDED'; },
      lookups: { posts: '/post-cadres', gos: '/government-orders' },
      search: function (r) { return [r.title, r.ruleType, r.part, r.chapter, r.ruleNumber, r.goNumber].join(' '); },
      columns: [
        { label: 'Rule', html: function (r) { return '<strong>' + esc(r.title) + '</strong>' + ([r.part, r.chapter, r.ruleNumber].filter(Boolean).length ? '<div class="small muted">' + esc([r.part && 'Part ' + r.part, r.chapter && 'Ch. ' + r.chapter, r.ruleNumber && 'Rule ' + r.ruleNumber].filter(Boolean).join(' · ')) + '</div>' : ''); } },
        { label: 'Type', html: function (r) { return esc(label(r.ruleType)); } },
        { label: 'Authority', html: function (r, L) { var g = L.gosById[r.governmentOrderId]; return g ? esc(g.goNumber) : esc(r.goNumber || '—'); } },
        { label: 'In force', html: function (r) { return r.effectiveFrom ? H.fmtDay(r.effectiveFrom) + (r.effectiveTo ? ' – ' + H.fmtDay(r.effectiveTo) : ' onward') : '—'; } },
        { label: 'Verified', html: function (r) { return r.isVerified ? H.badge('Verified', 'ok') : H.badge('Not verified', 'warn'); } },
        { label: 'Status', html: function (r) { return H.statusBadge(r.status); } }
      ],
      fields: [
        { key: 'title', label: 'Title', required: true, wide: true },
        { key: 'ruleType', label: 'Rule type', type: 'select', required: true, options: enumOptions(RULE_TYPES), def: 'GENERAL' },
        { key: 'part', label: 'KSR part' },
        { key: 'chapter', label: 'Chapter' },
        { key: 'ruleNumber', label: 'Rule number' },
        { key: 'applicableEmployeeCategory', label: 'Applies to category', hint: 'Leave empty if it applies to everyone.' },
        { key: 'applicablePostCadreId', label: 'Applies to post', type: 'select', options: function (L) { return refOptions(L.posts, function (p) { return p.code + ' — ' + p.name; }, 'All posts'); } },
        { key: 'governmentOrderId', label: 'Authorising GO', type: 'select', options: function (L) { return refOptions(L.gos, function (g) { return g.goNumber + (g.subject ? ' — ' + g.subject : ''); }); } },
        { key: 'effectiveFrom', label: 'In force from', type: 'date' },
        { key: 'effectiveTo', label: 'In force until', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: enumOptions(['DRAFT', 'ACTIVE', 'SUPERSEDED']), def: 'DRAFT' },
        { key: 'calculationMethod', label: 'Calculation method', wide: true, hint: 'How the engine applies this rule, in words — e.g. "Notional increment in lower post, then next higher stage".' },
        { key: 'conditions', label: 'Conditions (JSON, advanced)', type: 'json', wide: true, hint: 'Optional machine-readable conditions the engines read.' },
        { key: 'description', label: 'Rule text / notes', type: 'textarea', wide: true },
        { key: 'isVerified', label: 'I have verified this rule against the official source', type: 'checkbox', hint: 'Only verified rules are applied in pay calculations.' }
      ]
    });
  }

  H.route('/employees', viewEmployees, STAFF);
  H.route('/employees/bulk-import', viewEmployeeBulkImport, STAFF);
  H.route(/^\/employees\/(\d+)\/service-book$/, viewServiceBook, STAFF);
  H.route('/posts', viewPosts, STAFF);
  H.route('/pay-scales', viewPayScales, STAFF);
  H.route(/^\/pay-scales\/(\d+)$/, viewStages, STAFF);
  H.route('/pay-revisions', viewPayRevisions, STAFF);
  H.route('/government-orders', viewGOs, STAFF);
  H.route('/ksr-rules', viewRules, STAFF);
})();
