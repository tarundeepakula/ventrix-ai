// Protects every page that needs a logged-in user.
//   <script src="js/auth-guard.js"></script>                      dashboard pages
//   <script src="js/auth-guard.js" data-step="payment"></script>  setup step pages
// It asks the server who is logged in, sends logged-out visitors to login.html,
// sends unfinished accounts to the right setup step, shows the person's initials,
// and makes every Logout button really log out.
(function () {
  const script = document.currentScript;
  const pageStep = (script && script.dataset.step) || 'dashboard';
  const STEP_PAGES = { payment: 'payment.html', 'verify-phone': 'verify-phone.html', dashboard: 'dashboard.html' };

  // Hide the page until we know who is logged in (no flash of private data).
  document.documentElement.style.visibility = 'hidden';

  function initials(name) {
    return (name || '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'VT';
  }

  async function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* leave anyway */ }
    try { localStorage.removeItem('selectedAccount'); } catch (e) {}
    window.location.href = 'login.html';
  }

  function applyUser(me) {
    window.currentUser = me;

    // Pages that read the name from localStorage get the real one.
    try {
      localStorage.setItem('selectedAccount', JSON.stringify({
        name: me.user.fullName, email: me.user.email, phone: me.user.phone, business: me.business.name,
      }));
    } catch (e) {}

    // The profile circle(s) at the top right, and the name in the profile menu.
    document.querySelectorAll('#profileAvatar, #menuAvatar, .topbar-right .avatar, .vx-head .avatar').forEach((el) => {
      el.textContent = initials(me.user.fullName);
      el.title = me.user.fullName;
    });
    document.querySelectorAll('#menuName, .vx-head strong').forEach((el) => { el.textContent = me.user.fullName; });

    // Pages that call logout() directly get the real one too.
    window.logout = logout;
    window.logoutNow = logout;

    document.documentElement.style.visibility = '';
    // Pages can wait for this before loading their own data.
    document.dispatchEvent(new CustomEvent('ventrix:ready', { detail: me }));
  }

  // Every "Logout" link or button on the page ends the session on the server.
  // This listens before the page's own (demo) logout code, so that never runs.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('a, button');
    if (!el) return;
    const isLogout = el.getAttribute('href') === 'login.html' || el.textContent.trim().toLowerCase() === 'logout';
    if (!isLogout) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    logout();
  }, true);

  api('/auth/me')
    .then((me) => {
      const step = (me.account && me.account.nextStep) || 'dashboard';
      if (step !== pageStep) {
        window.location.replace(STEP_PAGES[step] || 'dashboard.html');
        return;
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyUser(me));
      } else {
        applyUser(me);
      }
    })
    .catch((err) => {
      if (err.status === 401) {
        const page = window.location.pathname.split('/').pop() || 'dashboard.html';
        window.location.replace('login.html?next=' + encodeURIComponent(page));
      } else {
        // Server unreachable: show the page and report the problem.
        document.documentElement.style.visibility = '';
        console.error('Could not check login:', err);
      }
    });
})();