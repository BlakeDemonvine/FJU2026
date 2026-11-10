/* =====================================================================
 * app.js — 路由與啟動
 * ===================================================================== */

window.App = (function () {

  var app = document.getElementById('app');
  var refreshTimer = null;

  /* 首頁最上面的主視覺幻燈片。要加減圖片就改這個陣列（檔案放進 assets/）。
     第一張也是 index.html 裡 preload 的那張，換圖時記得一起改。
     config.js 若有設 BANNERS 會以那邊為準。 */
  var HERO_BANNERS = [
    'assets/fju2026.jpg',
    'assets/fju2026b.jpg',
    'assets/fju2026c.jpg'
  ];

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
    if (!hero) return;
    hero.hidden = !on;
    if (!on || hero.__built) return;
    hero.__built = true;
    var cfg = window.APP_CONFIG || {};
    var list = cfg.BANNERS || HERO_BANNERS;
    hero.innerHTML = UI.bannerHTML(list, (cfg.EVENT_TITLE || '活動') + ' 主視覺');
    UI.initSlideshows(hero);
  }

  /**
   * 右上角的登出按鈕。攤商／總召登入後由各自的畫面呼叫，
   * 傳 null 就把按鈕收起來。
   */
  function setLogout(handler, label) {
    var btn = document.getElementById('logoutBtn');
    if (!btn) return;
    if (!handler) { btn.hidden = true; btn.onclick = null; return; }
    btn.hidden = false;
    btn.textContent = label || '登出';
    btn.onclick = handler;
  }

  function route() {
    clearRefresh();
    UI.stopSlideshows();
    setLogout(null);
    var r = parseHash();
    showHero(r.name === 'home' || r.name === 'mine');

    /* 「滑下去會停在上半地圖、下半攤位」這個效果只在攤位首頁開。
       其他頁如果也開著，手機上會一直被吸到頁尾。

       除了切換 class，還直接寫 inline style 把它關掉：
       Safari 有時候會晚一拍才套用 class 的變更，結果換頁的瞬間捲動對齊還開著，
       而這時候畫面上唯一的對齊點是頁尾 —— 就會整個被甩到最下面。
       inline style 是立刻生效的，不會有這個時間差。 */
    var html = document.documentElement;
    var atHome = r.name === 'home';
    html.classList.toggle('snap-home', atHome);
    html.style.scrollSnapType = atHome ? '' : 'none';

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
      case 'area':
        setActiveNav('home');
        PlayerView.renderArea(app, decodeURIComponent(r.arg || ''));
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

    /* 換頁後再確認兩次位置。有些手機瀏覽器會在內容換掉之後自己又捲一次，
       使用者一點進攤位就被丟到最底下。只要這段期間使用者沒有自己碰螢幕，
       位置不對就拉回最上面。 */
    if (!atHome) {
      var touched = false;
      var onTouch = function () { touched = true; };
      window.addEventListener('touchstart', onTouch, { passive: true });
      var reassert = function () {
        if (!touched && (window.pageYOffset || document.documentElement.scrollTop) > 0) {
          window.scrollTo(0, 0);
        }
      };
      requestAnimationFrame(reassert);
      setTimeout(reassert, 150);
      setTimeout(function () {
        reassert();
        window.removeEventListener('touchstart', onTouch);
      }, 400);
    }
  }

  function start() {
    UI.paintGrowth(false);
    window.addEventListener('hashchange', route);
    route();
  }

  document.addEventListener('DOMContentLoaded', start);

  return { setRefresh: setRefresh, clearRefresh: clearRefresh, route: route, setLogout: setLogout };
})();
