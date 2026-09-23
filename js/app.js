/* =====================================================================
 * app.js — 路由與啟動
 * ===================================================================== */

window.App = (function () {

  var app = document.getElementById('app');
  var refreshTimer = null;

  function setRefresh(fn, ms) {
    clearRefresh();
    // 分頁被切到背景時不打後端，省 Apps Script 的執行配額
    refreshTimer = setInterval(function () {
      if (document.hidden) return;
      fn();
    }, ms);
  }
  function clearRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function parseHash() {
    var h = (location.hash || '#/').replace(/^#\/?/, '');
    var parts = h.split('/').filter(Boolean);
    return { name: parts[0] || 'home', arg: parts[1] || null };
  }

  function setActiveNav(route) {
    UI.$$('#nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.route === route);
    });
  }

  function showHero(on) {
    var hero = document.getElementById('hero');
    if (hero) hero.hidden = !on;
  }

  function route() {
    clearRefresh();
    UI.stopSlideshows();
    var r = parseHash();
    showHero(r.name === 'home' || r.name === 'mine');

    if (!API.isConfigured()) {
      setActiveNav('');
      showHero(false);
      app.innerHTML =
        '<div class="card auth-card">' +
          '<h1>還差一步 🔧</h1>' +
          '<p>前端已經就緒，但還沒有連上後端。</p>' +
          '<ol class="small muted">' +
            '<li>依照 <code>README.md</code> 建立 Google 試算表與 Apps Script，部署成網頁應用程式。</li>' +
            '<li>把部署網址貼到 <code>js/config.js</code> 的 <code>GAS_URL</code>。</li>' +
            '<li>重新整理這一頁。</li>' +
          '</ol>' +
        '</div>';
      return;
    }

    switch (r.name) {
      case 'booth':
        setActiveNav('home');
        PlayerView.renderBooth(app, r.arg);
        break;
      case 'mine':
        setActiveNav('mine');
        PlayerView.renderMine(app);
        break;
      case 'vendor':
        setActiveNav('vendor');
        VendorView.render(app);
        break;
      case 'admin':
        setActiveNav('admin');
        AdminView.render(app);
        break;
      default:
        setActiveNav('home');
        PlayerView.renderHome(app);
    }
    window.scrollTo(0, 0);
  }

  function start() {
    UI.initTheme();
    UI.paintGrowth(false);
    window.addEventListener('hashchange', route);
    route();
  }

  document.addEventListener('DOMContentLoaded', start);

  return { setRefresh: setRefresh, clearRefresh: clearRefresh, route: route };
})();
