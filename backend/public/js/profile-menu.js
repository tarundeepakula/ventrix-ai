// Top-right profile circle for the dashboard pages.
// Shows the logged-in person's initials, and opens a small menu
// with their name, email, Settings and Logout when clicked.
// To use it on a page, add this line just before </body>:
//   <script src="js/profile-menu.js"></script>
(function () {
  const avatar = document.querySelector('.topbar-right .avatar');
  if (!avatar || avatar.dataset.menuReady) return;
  avatar.dataset.menuReady = '1';

  // ----- Styles for the menu -----
  const style = document.createElement('style');
  style.textContent = `
    .vx-profile{position:relative}
    .vx-profile > .avatar{cursor:pointer;border:0;font-family:inherit;transition:box-shadow .2s}
    .vx-profile > .avatar:hover,.vx-profile.open > .avatar{box-shadow:0 0 0 4px rgba(41,112,255,.18)}
    .vx-menu{display:none;position:absolute;right:0;top:calc(100% + 14px);z-index:200;width:260px;padding:8px;background:#fff;border:1px solid #e4e7ec;border-radius:14px;box-shadow:0 18px 40px rgba(16,24,40,.16);text-align:left}
    .vx-menu.open{display:block}
    .vx-head{display:flex;align-items:center;gap:10px;padding:8px 8px 12px;margin-bottom:6px;border-bottom:1px solid #e4e7ec}
    .vx-head .avatar{flex-shrink:0}
    .vx-head .avatar{width:40px;height:40px}
    .vx-head strong{display:block;color:#172b4d;font-size:14px}
    .vx-head span{display:block;color:#667085;font-size:11px;word-break:break-all}
    .vx-menu a,.vx-logout{display:flex;align-items:center;gap:10px;width:100%;padding:10px;border-radius:9px;font-size:12.5px;font-weight:600;color:#172b4d;background:none;border:0;cursor:pointer;text-align:left;font-family:inherit;text-decoration:none}
    .vx-menu a:hover{background:#f5f7fa}
    .vx-logout{color:#d92d20}
    .vx-logout:hover{background:#fef3f2}
  `;
  document.head.appendChild(style);

  // Keep the menu above the page content
  const topbar = avatar.closest('.topbar');
  if (topbar) {
    if (getComputedStyle(topbar).position === 'static') topbar.style.position = 'relative';
    topbar.style.zIndex = '100';
  }

  // ----- Who is logged in (saved at login / signup) -----
  let acc = null;
  try { acc = JSON.parse(localStorage.getItem('selectedAccount')); } catch (e) {}
  const name = acc && acc.name ? acc.name : 'My Account';
  const initials = acc && acc.name
    ? acc.name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '';

  if (initials) avatar.textContent = initials;
  avatar.title = name;
  avatar.setAttribute('role', 'button');
  avatar.tabIndex = 0;

  // ----- Build the menu -----
  const wrap = document.createElement('div');
  wrap.className = 'vx-profile';
  avatar.parentNode.insertBefore(wrap, avatar);
  wrap.appendChild(avatar);

  const menu = document.createElement('div');
  menu.className = 'vx-menu';
  menu.innerHTML =
    '<div class="vx-head"><div class="avatar"></div><div><strong></strong><span></span></div></div>' +
    '<a href="settings.html"><i class="bi bi-gear"></i> Settings</a>' +
    '<button type="button" class="vx-logout"><i class="bi bi-box-arrow-right"></i> Logout</button>';
  menu.querySelector('.vx-head .avatar').innerHTML = initials ? '' : avatar.innerHTML;
  if (initials) menu.querySelector('.vx-head .avatar').textContent = initials;
  menu.querySelector('.vx-head strong').textContent = name;
  menu.querySelector('.vx-head span').textContent = 'Growth Plan';
  wrap.appendChild(menu);

  // ----- Open / close -----
  function toggle(e) { e.stopPropagation(); wrap.classList.toggle('open', menu.classList.toggle('open')); }
  avatar.addEventListener('click', toggle);
  avatar.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
  function close() { menu.classList.remove('open'); wrap.classList.remove('open'); }
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // ----- Logout -----
  async function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    // Ends the login on the server (works when the backend is running)
    try { if (window.api) await window.api('/auth/logout', { method: 'POST' }); } catch (e) {}
    try { localStorage.removeItem('selectedAccount'); } catch (e) {}
    window.location.href = 'login.html';
  }
  menu.querySelector('.vx-logout').addEventListener('click', logout);

  // The sidebar "Logout" link should log out properly too
  document.querySelectorAll('.sidebar a[href="login.html"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      logout();
    });
  });
})();
