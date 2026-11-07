/* =====================================================================
 * api.js — 與 Google Apps Script 後端溝通
 *
 * 注意：Content-Type 一定要用 text/plain，
 * 否則瀏覽器會先送出 OPTIONS 預檢請求，而 Apps Script 不支援預檢，
 * 會直接變成 CORS 錯誤。
 * ===================================================================== */

window.API = (function () {

  var cfg = window.APP_CONFIG;

  function isConfigured() {
    return !!cfg.GAS_URL && cfg.GAS_URL.indexOf('請貼上') === -1;
  }

  /**
   * 只有「讀取類」的操作可以安全重試。
   * 報名、取消、儲存這些會改資料的動作不重試，免得重複送出。
   */
  var RETRYABLE = {
    ping: 1, listBooths: 1, getBooth: 1, lookupSignups: 1,
    vendorLogin: 1, vendorSignups: 1, adminLogin: 1, adminOverview: 1
  };

  var MAX_RETRY = 2;        // 最多再試兩次
  var TIMEOUT_MS = 30000;   // 單次請求逾時

  /** Apps Script 偶爾會回這些，通常再試一次就好 */
  function worthRetrying(status) {
    return status === 0 || status === 404 || status === 429 ||
           status === 408 || status >= 500;
  }

  function describe(status) {
    if (status === 404) return '後端暫時沒有回應（HTTP 404）';
    if (status === 429) return '後端忙碌中（HTTP 429）';
    if (status >= 500) return '後端出錯（HTTP ' + status + '）';
    return '連線失敗（HTTP ' + status + '）';
  }

  /** 把回傳的文字變成資料，順便把常見的部署錯誤翻成看得懂的話 */
  function parseBody(text) {
    if (text && typeof text === 'object') return text;   // 重試成功時已經是物件
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (/Google Drive|需要權限|Authorization|登入/i.test(text)) {
        throw new Error('後端權限設定有誤：部署時請把「具有存取權的使用者」設為「所有人」');
      }
      throw new Error('後端回傳格式錯誤');
    }
    if (!data.ok) throw new Error(data.error || '操作失敗');
    return data;
  }

  /**
   * index.html 在 <head> 就先把攤位清單的請求送出去了，
   * 第一次呼叫直接接手那個結果，不用再等一次來回。
   */
  function takePreload(action) {
    var pre = window.__preload;
    if (!pre || pre.action !== action) return null;
    window.__preload = null;
    // 放太久的結果就不要用了，名額可能已經變了
    if (pre.t && Date.now() - pre.t > 20000) return null;
    return pre.p;
  }

  function call(action, payload, attempt) {
    if (!isConfigured()) {
      return Promise.reject(new Error('尚未設定後端網址，請編輯 js/config.js 的 GAS_URL'));
    }
    attempt = attempt || 0;

    if (attempt === 0) {
      var pre = takePreload(action);
      if (pre) {
        return pre.then(parseBody, function () {
          return call(action, payload, 0);   // 預先送出的那次失敗了就正常再送一次
        });
      }
    }

    var body = Object.assign({ action: action }, payload || {});

    // 逾時就中斷，不要讓畫面一直轉
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;

    var opts = {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    };
    if (ctrl) opts.signal = ctrl.signal;

    /** 可以重試就等一下再來，否則把錯誤丟出去 */
    function recover(status, message) {
      if (RETRYABLE[action] && attempt < MAX_RETRY && worthRetrying(status)) {
        var wait = 600 * (attempt + 1);
        return new Promise(function (resolve) { setTimeout(resolve, wait); })
          .then(function () { return call(action, payload, attempt + 1); });
      }
      throw new Error(message);
    }

    return fetch(cfg.GAS_URL, opts)
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) return recover(res.status, describe(res.status));
        return res.text();
      }, function (err) {
        if (timer) clearTimeout(timer);
        var msg = (err && err.name === 'AbortError')
          ? '後端太久沒有回應，請再試一次'
          : '連不上後端，請確認網路後再試一次';
        return recover(0, msg);
      })
      .then(parseBody);
  }

  /* ---------- 瀏覽統計 ----------
   * 每個瀏覽器存一組固定的 visitorId（算「人數」用），
   * 同一個人同一個頁面 30 分鐘內只記一次，來回點來點去不會灌水。
   * 整段都是「送出去就算了」，失敗不影響任何畫面。
   */
  var TRACK_GAP_MS = 30 * 60 * 1000;

  function visitorId() {
    var id = UI.store('visitorId');
    if (!id) {
      id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      UI.store('visitorId', id);
    }
    return id;
  }

  function trackedRecently(key) {
    try {
      var map = JSON.parse(sessionStorage.getItem('fju_tracked') || '{}');
      if (map[key] && Date.now() - map[key] < TRACK_GAP_MS) return true;
      map[key] = Date.now();
      sessionStorage.setItem('fju_tracked', JSON.stringify(map));
    } catch (e) { /* 無痕模式：就讓它每次都記 */ }
    return false;
  }

  var track = function (type, boothId) {
    try {
      if (!cfg.GAS_URL || cfg.GAS_URL.indexOf('請貼上') > -1) return;
      var key = type + ':' + (boothId || '');
      if (trackedRecently(key)) return;
      call('track', { type: type, boothId: boothId || '', visitorId: visitorId() })
        .catch(function () {});
    } catch (e) {}
  };

  /* ---------- 玩家 ---------- */
  var listBooths      = function ()        { return call('listBooths'); };
  var getBooth        = function (boothId) { return call('getBooth', { boothId: boothId }); };
  var signup          = function (p)       { return call('signup', p); };
  var lookupSignups   = function (p)       { return call('lookupSignups', p); };
  var cancelSignup    = function (p)       { return call('cancelSignup', p); };

  /* ---------- 攤商 ---------- */
  var vendorLogin       = function (code)  { return call('vendorLogin', { code: code }); };
  var vendorSave        = function (p)     { return call('vendorSave', p); };
  var vendorSetPrice    = function (p)     { return call('vendorSetPrice', p); };
  var vendorUploadPhoto = function (p)     { return call('vendorUploadPhoto', p); };
  var vendorSignups     = function (code)  { return call('vendorSignups', { code: code }); };
  var vendorRemoveSignup= function (p)     { return call('vendorRemoveSignup', p); };

  /* ---------- 總召 ---------- */
  var adminLogin        = function (c)     { return call('adminLogin', { adminCode: c }); };
  var adminOverview     = function (c)     { return call('adminOverview', { adminCode: c }); };
  var adminCreateBooth  = function (p)     { return call('adminCreateBooth', p); };
  var adminSetBoothNo   = function (p)     { return call('adminSetBoothNo', p); };
  var adminSetBoothPos  = function (p)     { return call('adminSetBoothPos', p); };
  var adminSetBoothMode = function (p)     { return call('adminSetBoothMode', p); };
  var adminSetSignup    = function (p)     { return call('adminSetSignup', p); };
  var adminPurgeCancelled = function (p)   { return call('adminPurgeCancelled', p); };
  var adminResetCode    = function (p)     { return call('adminResetCode', p); };
  var adminDeleteBooth  = function (p)     { return call('adminDeleteBooth', p); };
  var adminRecount      = function (c)     { return call('adminRecount', { adminCode: c }); };

  var ping              = function ()      { return call('ping'); };

  return {
    isConfigured: isConfigured,
    call: call,
    ping: ping,
    listBooths: listBooths,
    getBooth: getBooth,
    signup: signup,
    lookupSignups: lookupSignups,
    cancelSignup: cancelSignup,
    vendorLogin: vendorLogin,
    track: track,
    vendorSave: vendorSave,
    vendorSetPrice: vendorSetPrice,
    vendorUploadPhoto: vendorUploadPhoto,
    vendorSignups: vendorSignups,
    vendorRemoveSignup: vendorRemoveSignup,
    adminLogin: adminLogin,
    adminOverview: adminOverview,
    adminCreateBooth: adminCreateBooth,
    adminSetBoothNo: adminSetBoothNo,
    adminSetBoothPos: adminSetBoothPos,
    adminSetBoothMode: adminSetBoothMode,
    adminSetSignup: adminSetSignup,
    adminPurgeCancelled: adminPurgeCancelled,
    adminResetCode: adminResetCode,
    adminDeleteBooth: adminDeleteBooth,
    adminRecount: adminRecount
  };
})();
