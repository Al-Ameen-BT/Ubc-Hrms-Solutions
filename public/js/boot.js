/* Starts the console: loads branding for this entry point (platform or
 * /o/CODE), restores any message carried across a redirect, then renders. */
(function () {
  'use strict';
  var H = window.HRMS;
  try {
    var f = sessionStorage.getItem('ucb.flash');
    if (f) { H.flash = JSON.parse(f); sessionStorage.removeItem('ucb.flash'); }
  } catch (e) { /* ignore */ }
  window.addEventListener('hashchange', function () { H.render(); });
  H.loadContext().then(function () { H.render(); });
})();
