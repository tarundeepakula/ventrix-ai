// Add to every page that needs a logged-in user (dashboard, contacts, ...).
// It checks the session, sends logged-out visitors to login.html,
// fills in the profile menu, and makes every Logout button really log out.
(function () {
  // Hide the page until we know who is logged in, so nobody sees a flash
  // of the dashboard before being redirected.
  document.documentElement.style.visibility = 'hidden';

  function initials(name) {
    return (
      (name || '')
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'VT'
    );
  }

  function setAvatar(el, me) {
    if (!el) return;
    el.textContent = '';
    if (me.user.avatarUrl) {
      const img = new Image();
      img.alt = me.user.fullName;
      img.src = me.user.avatarUrl;
      img.onerror = () => (el.textContent = initials(me.user.fullName));
      el.appendChild(img);
    } else {
      el.textContent = initials(me.user.fullName);
    }
  }

  async function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (e) {
      // Even if the request fails, still leave the page.
    }
    try {
      localStorage.removeItem('selectedAccount');
    } catch (e) {}
    window.location.href = 'login.html';
  }

  function applyUser(me) {
    window.currentUser = me;

    const avatar = document.getElementById('profileAvatar');
    if (avatar) avatar.title = me.user.fullName;
    setAvatar(avatar, me);
    setAvatar(document.getElementById('menuAvatar'), me);
    const menuName = document.getElementById('menuName');
    if (menuName) menuName.textContent = me.user.fullName;

    // Replace the page's demo logout() with the real one.
    window.logout = logout;
    // Sidebar "Logout" links point at login.html; make them log out first.
    document.querySelectorAll('a[href="login.html"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    });

    document.documentElement.style.visibility = '';
    // Pages can listen for this to load their own data:
    // document.addEventListener('ventrix:ready', (e) => { const me = e.detail; ... });
    document.dispatchEvent(new CustomEvent('ventrix:ready', { detail: me }));
  }

  api('/auth/me')
    .then((me) => {
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
        // Server unreachable: show the page anyway and report the problem.
        document.documentElement.style.visibility = '';
        console.error('Could not check login:', err);
      }
    });
})();
