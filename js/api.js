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

  function call(action, payload) {
    if (!isConfigured()) {
      return Promise.reject(new Error('尚未設定後端網址，請編輯 js/config.js 的 GAS_URL'));
    }

    var body = Object.assign({ action: action }, payload || {});

    return fetch(cfg.GAS_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('連線失敗（HTTP ' + res.status + '）');
        return res.text();
      })
      .then(function (text) {
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
      });
  }

  /* ---------- 玩家 ---------- */
  var listBooths      = function ()        { return call('listBooths'); };
  var getBooth        = function (boothId) { return call('getBooth', { boothId: boothId }); };
  var signup          = function (p)       { return call('signup', p); };
  var lookupSignups   = function (p)       { return call('lookupSignups', p); };
  var cancelSignup    = function (p)       { return call('cancelSignup', p); };

  /* ---------- 攤商 ---------- */
  var vendorLogin       = function (code)  { return call('vendorLogin', { code: code }); };
  var vendorSave        = function (p)     { return call('vendorSave', p); };
  var vendorUploadPhoto = function (p)     { return call('vendorUploadPhoto', p); };
  var vendorSignups     = function (code)  { return call('vendorSignups', { code: code }); };
  var vendorRemoveSignup= function (p)     { return call('vendorRemoveSignup', p); };

  /* ---------- 總召 ---------- */
  var adminLogin        = function (c)     { return call('adminLogin', { adminCode: c }); };
  var adminOverview     = function (c)     { return call('adminOverview', { adminCode: c }); };
  var adminCreateBooth  = function (p)     { return call('adminCreateBooth', p); };
  var adminResetCode    = function (p)     { return call('adminResetCode', p); };
  var adminDeleteBooth  = function (p)     { return call('adminDeleteBooth', p); };

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
    vendorSave: vendorSave,
    vendorUploadPhoto: vendorUploadPhoto,
    vendorSignups: vendorSignups,
    vendorRemoveSignup: vendorRemoveSignup,
    adminLogin: adminLogin,
    adminOverview: adminOverview,
    adminCreateBooth: adminCreateBooth,
    adminResetCode: adminResetCode,
    adminDeleteBooth: adminDeleteBooth
  };
})();
