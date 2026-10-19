/* Sign-in, two-factor step, forgot/reset password, forced password change,
 * and My account (profile, password, two-factor authentication). */
(function () {
  'use strict';
  var H = window.HRMS;
  var esc = H.esc;

  // ----------------------------------------------------- login frame

  /** The card header: the bank's logo+name on /o/CODE, Banihal's on /. */
  function loginHeader(subtitle) {
    var b = H.branding || {};
    if (H.orgCode) {
      var o = H.orgCard || {};
      if (o.missing) {
        return '<div class="login-mark">?</div><h1>Unknown organisation</h1>' +
          '<p class="sub">There is no organisation with the code <strong>' + esc(H.orgCode) + '</strong>. Check the sign-in address you were given.</p>';
      }
      var mark = o.logoUrl ? '<img class="login-logo" src="' + esc(o.logoUrl) + '" alt="">' : '<div class="login-mark">' + esc(H.initials(o.name)) + '</div>';
      return mark + '<h1>' + esc(o.name) + '</h1><p class="sub">' + esc(subtitle || 'Sign in to HRMS & Payroll') + '</p>';
    }
    var pmark = b.logoUrl ? '<img class="login-logo" src="' + esc(b.logoUrl) + '" alt="">' : '<div class="login-mark">' + esc(H.initials(b.companyName || 'Banihal')) + '</div>';
    return pmark + '<h1>' + esc(b.platformName || 'UCB HRMS & Payroll') + '</h1><p class="sub">' + esc(subtitle || 'Platform administration') + '</p>';
  }

  function loginFooter() {
    var b = H.branding || {};
    var support = b.supportEmail || b.supportPhone
      ? '<div class="small muted">Help: ' + [b.supportEmail ? esc(b.supportEmail) : '', b.supportPhone ? esc(b.supportPhone) : ''].filter(Boolean).join(' · ') + '</div>'
      : '';
    return '<div class="login-foot">' + (H.orgCode ? H.poweredBy() : '') + support + '</div>';
  }

  function frame(inner, subtitle) {
    H.root.innerHTML = '<div class="login-wrap"><div class="login-card">' + loginHeader(subtitle) + inner + '</div>' + loginFooter() + '</div>';
  }

  function applySession(data) {
    H.setSession({ token: data.token, user: data.user });
    H.applyBranding();
    if (data.previousLoginAt) H.flash = { notice: 'Welcome back. Your previous sign-in was ' + H.fmtDateTime(data.previousLoginAt) + '.', kind: 'ok' };
    H.go(data.user.mustChangePassword ? '/change-password' : H.defaultPath(data.user), H.flash);
    H.flash = null;
  }

  // ------------------------------------------------------------ login

  function viewLogin(params, state) {
    if (H.orgCode && H.orgCard && H.orgCard.missing) { frame(''); return; }
    var b = H.branding || {};
    frame(
      (b.loginMessage ? '<div class="notice info">' + esc(b.loginMessage) + '</div>' : '') +
      '<div class="notice" id="login-notice"></div>' +
      '<form id="login-form" autocomplete="on" novalidate>' +
        H.field('email', 'Email address', '<input type="email" id="email" name="email" required autocomplete="username" autofocus>') +
        H.field('password', 'Password', '<input type="password" id="password" name="password" required autocomplete="current-password">') +
        '<button type="submit" id="login-btn" class="block">Sign in</button>' +
      '</form>' +
      '<div class="login-links"><a href="#/forgot-password">Forgot password?</a></div>'
    );
    if (state && state.notice) H.notice('#login-notice', state.kind || 'warn', state.notice);

    H.on('#login-form', 'submit', function (e) {
      e.preventDefault();
      var email = H.val('#email');
      var password = H.$('#password').value;
      if (!email || !password) return H.notice('#login-notice', 'error', 'Enter your email address and password.');
      var btn = H.$('#login-btn');
      H.busy(btn, true, 'Signing in…');
      H.clearNotice('#login-notice');
      var body = { email: email, password: password };
      if (H.orgCode) body.orgCode = H.orgCode;
      H.api('POST', '/auth/login', body).then(function (data) {
        if (data.mfaRequired) return viewMfaChallenge(data);
        applySession(data);
      }).catch(function (err) {
        H.busy(btn, false);
        if (err.code === 'ORG_LOGIN_REQUIRED' && err.data && err.data.loginPath) {
          var el = H.$('#login-notice');
          el.className = 'notice warn';
          el.innerHTML = 'This account belongs to a bank. Sign in from its own page: <a href="' + esc(err.data.loginPath) + '">' +
            esc(window.location.origin + err.data.loginPath) + '</a>';
          return;
        }
        H.notice('#login-notice', 'error', err.message);
      });
    });
  }

  function viewMfaChallenge(data) {
    frame(
      '<div class="notice" id="mfa-notice"></div>' +
      '<p class="small">Signed in as <strong>' + esc(data.user.email) + '</strong>. Open your authenticator app and enter the 6-digit code for this account.</p>' +
      '<form id="mfa-form" autocomplete="off" novalidate>' +
        H.field('mfa-code', 'Authentication code', '<input type="text" id="mfa-code" class="otp-input" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" autofocus>') +
        '<button type="submit" id="mfa-btn" class="block">Verify</button>' +
      '</form>' +
      '<div class="login-links"><a href="#/login" id="mfa-back">Use a different account</a></div>',
      'Two-factor authentication'
    );
    H.$('#mfa-code').focus();
    H.on('#mfa-form', 'submit', function (e) {
      e.preventDefault();
      var code = H.val('#mfa-code').replace(/\s+/g, '');
      if (!/^\d{6}$/.test(code)) return H.notice('#mfa-notice', 'error', 'Enter the 6-digit code from your authenticator app.');
      var btn = H.$('#mfa-btn');
      H.busy(btn, true, 'Verifying…');
      H.api('POST', '/auth/mfa/verify-login', { mfaToken: data.mfaToken, code: code }).then(applySession).catch(function (err) {
        H.busy(btn, false);
        if (err.code === 'MFA_EXPIRED') return H.go('/login', { notice: err.message, kind: 'warn' });
        H.notice('#mfa-notice', 'error', err.message);
        H.$('#mfa-code').value = '';
        H.$('#mfa-code').focus();
      });
    });
    H.on('#mfa-back', 'click', function (e) { e.preventDefault(); H.render(); });
  }

  // ------------------------------------------------ forgot / reset

  function viewForgot() {
    if (H.orgCode && H.orgCard && H.orgCard.missing) { frame(''); return; }
    frame(
      '<div class="notice" id="fp-notice"></div>' +
      '<p class="small">Enter your account\'s email address. If it matches an account' + (H.orgCode ? ' at this organisation' : '') +
      ', we\'ll send a link to choose a new password. The link is valid for 30 minutes.</p>' +
      '<form id="fp-form" novalidate>' +
        H.field('fp-email', 'Email address', '<input type="email" id="fp-email" required autocomplete="username" autofocus>') +
        '<button type="submit" id="fp-btn" class="block">Send reset link</button>' +
      '</form>' +
      '<div class="login-links"><a href="#/login">Back to sign in</a></div>',
      'Reset your password'
    );
    H.on('#fp-form', 'submit', function (e) {
      e.preventDefault();
      var email = H.val('#fp-email');
      if (!email) return H.notice('#fp-notice', 'error', 'Enter your email address.');
      var btn = H.$('#fp-btn');
      H.busy(btn, true, 'Sending…');
      var body = { email: email };
      if (H.orgCode) body.orgCode = H.orgCode;
      H.api('POST', '/auth/forgot-password', body).then(function (res) {
        H.$('#fp-form').hidden = true;
        H.notice('#fp-notice', 'ok', res.message + ' If nothing arrives, ask your administrator to issue a temporary password instead.');
      }).catch(function (err) { H.busy(btn, false); H.notice('#fp-notice', 'error', err.message); });
    });
  }

  function viewReset() {
    var token = H.queryParam('token');
    frame(
      '<div class="notice" id="rp-notice"></div>' +
      (token ? '<form id="rp-form" novalidate>' +
        H.field('rp-new', 'New password', '<input type="password" id="rp-new" minlength="8" autocomplete="new-password" autofocus>', 'At least 8 characters.') +
        H.field('rp-confirm', 'Confirm new password', '<input type="password" id="rp-confirm" minlength="8" autocomplete="new-password">') +
        '<button type="submit" id="rp-btn" class="block">Set new password</button></form>'
        : '') +
      '<div class="login-links"><a href="#/login">Back to sign in</a></div>',
      'Choose a new password'
    );
    if (!token) return H.notice('#rp-notice', 'error', 'This reset link is incomplete. Open the link from the email again, or request a new one.');
    H.on('#rp-form', 'submit', function (e) {
      e.preventDefault();
      var pw = H.$('#rp-new').value;
      if (pw.length < 8) return H.notice('#rp-notice', 'error', 'The new password must be at least 8 characters.');
      if (pw !== H.$('#rp-confirm').value) return H.notice('#rp-notice', 'error', 'The two passwords do not match.');
      var btn = H.$('#rp-btn');
      H.busy(btn, true, 'Saving…');
      H.api('POST', '/auth/reset-password', { token: token, newPassword: pw }).then(function (res) {
        H.go('/login', { notice: res.message, kind: 'ok' });
      }).catch(function (err) { H.busy(btn, false); H.notice('#rp-notice', 'error', err.message); });
    });
  }

  // --------------------------------------------------- change password

  function passwordForm(prefix) {
    return '<form id="' + prefix + '-form" novalidate>' +
      H.field(prefix + '-current', 'Current password', '<input type="password" id="' + prefix + '-current" autocomplete="current-password">') +
      H.field(prefix + '-next', 'New password', '<input type="password" id="' + prefix + '-next" minlength="8" autocomplete="new-password">', 'At least 8 characters. Use a passphrase you don\'t use anywhere else.') +
      H.field(prefix + '-confirm', 'Confirm new password', '<input type="password" id="' + prefix + '-confirm" minlength="8" autocomplete="new-password">') +
      '<button type="submit" id="' + prefix + '-btn">Change password</button></form>';
  }

  function wirePasswordForm(prefix, noticeSel, onDone) {
    H.on('#' + prefix + '-form', 'submit', function (e) {
      e.preventDefault();
      var cur = H.$('#' + prefix + '-current').value;
      var next = H.$('#' + prefix + '-next').value;
      if (!cur) return H.notice(noticeSel, 'error', 'Enter your current password.');
      if (next.length < 8) return H.notice(noticeSel, 'error', 'The new password must be at least 8 characters.');
      if (next !== H.$('#' + prefix + '-confirm').value) return H.notice(noticeSel, 'error', 'The two new-password fields do not match.');
      var btn = H.$('#' + prefix + '-btn');
      H.busy(btn, true, 'Saving…');
      H.api('POST', '/auth/change-password', { currentPassword: cur, newPassword: next }).then(function () {
        var s = H.getSession();
        s.user.mustChangePassword = false;
        H.setSession(s);
        onDone();
      }).catch(function (err) { H.busy(btn, false); H.notice(noticeSel, 'error', err.message); });
    });
  }

  function viewChangePassword(params, state) {
    var user = H.user();
    if (!user.mustChangePassword) return H.go('/account');
    // No navigation while a temporary password is in force.
    H.root.innerHTML = '<div class="login-wrap"><div class="login-card">' +
      loginHeaderForUser(user) +
      '<div class="notice" id="cp-notice"></div>' +
      '<p class="small">Hello ' + esc(user.name) + '. Your account was set up with a temporary password — choose your own to continue.</p>' +
      passwordForm('cp') +
      '<div class="login-links"><a href="#" id="cp-logout">Sign out</a></div>' +
      '</div>' + loginFooter() + '</div>';
    if (state && state.notice) H.notice('#cp-notice', state.kind || 'warn', state.notice);
    H.on('#cp-logout', 'click', function (e) { e.preventDefault(); H.logout('You have been signed out.', 'ok'); });
    wirePasswordForm('cp', '#cp-notice', function () {
      H.go(H.defaultPath(H.user()), { notice: 'Password changed. You can turn on two-factor authentication from My account for extra protection.', kind: 'ok' });
    });
  }

  function loginHeaderForUser(user) {
    if (user.organization) {
      var o = user.organization;
      return (o.logoUrl ? '<img class="login-logo" src="' + esc(o.logoUrl) + '" alt="">' : '<div class="login-mark">' + esc(H.initials(o.name)) + '</div>') +
        '<h1>Set your password</h1><p class="sub">' + esc(o.name) + '</p>';
    }
    return loginHeader('Set your password');
  }

  // --------------------------------------------------------- account

  function viewAccount(params, state) {
    var user = H.user();
    H.shell(
      H.pageHead('My account', 'Your sign-in details and security settings.') +
      '<div class="notice" id="acc-notice"></div>' +
      '<div class="grid-cards">' +
        '<div class="card"><h3>Profile</h3><div class="card-body"><dl class="kv">' +
          '<dt>Name</dt><dd>' + esc(user.name) + '</dd>' +
          '<dt>Email</dt><dd>' + esc(user.email) + '</dd>' +
          '<dt>Role</dt><dd>' + esc(H.roleLabel(user.role)) + '</dd>' +
          (user.organization ? '<dt>Organisation</dt><dd>' + esc(user.organization.name) + '</dd>' : '') +
          '<dt>Last sign-in</dt><dd>' + H.fmtDateTime(user.lastLoginAt) + '</dd>' +
        '</dl></div></div>' +
        '<div class="card"><h3>Change password</h3><div class="card-body"><div class="notice" id="pw-notice"></div>' + passwordForm('pw') + '</div></div>' +
      '</div>' +
      '<div id="mfa-card"></div>'
    );
    if (state && state.notice) H.notice('#acc-notice', state.kind || 'ok', state.notice);
    wirePasswordForm('pw', '#pw-notice', function () {
      H.$('#pw-form').reset();
      H.busy(H.$('#pw-btn'), false);
      H.notice('#pw-notice', 'ok', 'Password changed.');
    });
    H.refreshMe().then(function (me) { drawMfa(me); }).catch(function () { drawMfa(user); });
  }

  function drawMfa(me) {
    var el = H.$('#mfa-card');
    if (!el) return;
    if (me.mfaEnabled) {
      el.innerHTML = '<div class="card"><h3>Two-factor authentication</h3><div class="card-body">' +
        '<div class="notice" id="mfa-notice"></div>' +
        '<div class="mfa-status-row">' + H.badge('On', 'ok') + '<span class="small">Since ' + H.fmtDateTime(me.mfaEnrolledAt) + '. Each sign-in asks for a code from your authenticator app.</span></div>' +
        '<details class="spaced"><summary>Turn off two-factor authentication</summary>' +
          '<p class="small muted">Your account will then be protected by your password alone. Confirm with your password.</p>' +
          '<form id="mfa-off-form" class="inline-form">' + H.input('mfa-off-pw', 'password', '', 'autocomplete="current-password" placeholder="Current password" aria-label="Current password"') +
          '<button type="submit" class="danger" id="mfa-off-btn">Turn off</button></form>' +
        '</details>' +
        '<p class="small muted spaced">Lost your phone? Ask ' + (me.role === 'SUPER_ADMIN' ? 'another Super Admin' : 'your Organisation Admin') + ' to reset your two-factor authentication.</p>' +
        '</div></div>';
      H.on('#mfa-off-form', 'submit', function (e) {
        e.preventDefault();
        var pw = H.$('#mfa-off-pw').value;
        if (!pw) return H.notice('#mfa-notice', 'error', 'Enter your password to confirm.');
        var btn = H.$('#mfa-off-btn');
        H.busy(btn, true, 'Turning off…');
        H.api('POST', '/auth/mfa/disable', { password: pw }).then(function (res) {
          return H.refreshMe().then(function (u) { drawMfa(u); H.notice('#mfa-notice', 'ok', res.message); });
        }).catch(function (err) { H.busy(btn, false); H.notice('#mfa-notice', 'error', err.message); });
      });
      return;
    }
    el.innerHTML = '<div class="card"><h3>Two-factor authentication</h3><div class="card-body">' +
      '<div class="notice" id="mfa-notice"></div>' +
      '<div class="mfa-status-row">' + H.badge('Off', '') + '<span class="small">Add a second step at sign-in: a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) on your phone.' +
      (me.role === 'SUPER_ADMIN' || me.role === 'ORG_ADMIN' ? ' <strong>Recommended for administrator accounts.</strong>' : '') + '</span></div>' +
      '<div class="btn-row spaced"><button type="button" id="mfa-start">Set up two-factor authentication</button></div>' +
      '<div id="mfa-setup"></div></div></div>';
    H.on('#mfa-start', 'click', function () {
      var btn = this;
      H.busy(btn, true, 'Preparing…');
      H.api('GET', '/auth/mfa/setup').then(function (res) {
        btn.hidden = true;
        var d = res.data;
        var grouped = d.secret.replace(/(.{4})/g, '$1 ').trim();
        H.$('#mfa-setup').innerHTML = '<div class="mfa-setup spaced">' +
          '<div class="qr"><img src="' + esc(d.qrCodeDataUrl) + '" alt="QR code for your authenticator app"></div>' +
          '<div class="steps"><ol>' +
            '<li>Open your authenticator app and add a new account.</li>' +
            '<li>Scan this QR code. If you can\'t scan, enter this key instead:</li></ol>' +
            '<div class="manual-key"><code id="mfa-key">' + esc(grouped) + '</code><button type="button" class="secondary sm" id="mfa-copy">Copy</button><span class="small muted" id="mfa-copied" hidden>Copied</span></div>' +
            '<ol start="3"><li>Enter the 6-digit code the app now shows:</li></ol>' +
            '<form id="mfa-confirm-form" class="inline-form">' +
              '<input type="text" id="mfa-confirm-code" class="otp-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="6-digit code">' +
              '<button type="submit" id="mfa-confirm-btn">Turn on</button>' +
              '<button type="button" class="secondary" id="mfa-cancel">Cancel</button>' +
            '</form></div></div>';
        H.on('#mfa-copy', 'click', function () { H.copyText(d.secret, H.$('#mfa-copied')); });
        H.on('#mfa-cancel', 'click', function () { drawMfa(me); });
        H.$('#mfa-confirm-code').focus();
        H.on('#mfa-confirm-form', 'submit', function (e) {
          e.preventDefault();
          var code = H.val('#mfa-confirm-code').replace(/\s+/g, '');
          if (!/^\d{6}$/.test(code)) return H.notice('#mfa-notice', 'error', 'Enter the 6-digit code shown in your app.');
          var b2 = H.$('#mfa-confirm-btn');
          H.busy(b2, true, 'Checking…');
          H.api('POST', '/auth/mfa/confirm', { secret: d.secret, code: code }).then(function (r2) {
            return H.refreshMe().then(function (u) { drawMfa(u); H.notice('#mfa-notice', 'ok', r2.message + ' You will be asked for a code at your next sign-in.'); });
          }).catch(function (err) { H.busy(b2, false); H.notice('#mfa-notice', 'error', err.message); });
        });
      }).catch(function (err) { H.busy(btn, false); H.notice('#mfa-notice', 'error', err.message); });
    });
  }

  H.route('/login', viewLogin, { public: true, redirectIfSignedIn: true });
  H.route('/forgot-password', viewForgot, { public: true, redirectIfSignedIn: true });
  H.route('/reset-password', viewReset, { public: true });
  H.route('/change-password', viewChangePassword);
  H.route('/account', viewAccount);
})();
