/* =====================================================================
 * player.js — 玩家端：攤位列表、攤位詳情與報名、我的報名
 * ===================================================================== */

window.PlayerView = (function () {

  var esc = UI.esc;

  /* ================= 首頁：所有攤位 ================= */

  function renderHome(app) {
    app.innerHTML =
      '<div class="searchbar">' +
        '<span class="ico">🔍</span>' +
        '<input type="text" id="boothSearch" placeholder="搜尋攤位名稱或關鍵字" aria-label="搜尋攤位">' +
      '</div>' +
      '<div id="boothList">' + UI.loadingHTML('正在載入攤位…') + '</div>';

    var all = [];

    function paint(keyword) {
      var box = document.getElementById('boothList');
      var list = all;
      if (keyword) {
        var k = keyword.toLowerCase();
        list = all.filter(function (b) {
          return (b.name + ' ' + b.description).toLowerCase().indexOf(k) > -1;
        });
      }
      if (!list.length) {
        box.innerHTML = keyword
          ? UI.emptyHTML('🔍', '找不到符合的攤位', '換個關鍵字試試')
          : UI.emptyHTML('🎪', '目前還沒有攤位開放報名', '攤商正在準備中，等等再來看看吧');
        return;
      }
      // 還能報名的排前面
      list = list.slice().sort(function (a, b) { return (a.allClosed ? 1 : 0) - (b.allClosed ? 1 : 0); });

      box.innerHTML = '<div class="booth-grid">' + list.map(boothCard).join('') + '</div>';
      UI.initSlideshows(box);
      UI.$$('.booth-thumb img', box).forEach(function (im) {
        im.onerror = function () {
          var alt = im.dataset.altUrl;
          if (alt && im.src !== alt) { im.src = alt; im.dataset.altUrl = ''; }
          else { im.parentNode.innerHTML = '<span class="placeholder">🎪</span>'; }
        };
      });
    }

    function boothCard(b) {
      var photo = (b.photos && b.photos[0]) || null;
      var thumb = photo
        ? '<img src="' + esc(photo.url) + '" alt="' + esc(b.name) + '" loading="lazy" data-alt-url="' + esc(photo.altUrl || '') + '">'
        : '<span class="placeholder">🎪</span>';
      var badge = (b.photos && b.photos.length > 1)
        ? '<span class="count-badge">📷 ' + b.photos.length + '</span>' : '';

      var status = b.allClosed
        ? '<span class="tag tag-danger">已截止報名</span>'
        : '<span class="tag tag-ok">尚餘 ' + b.totalRemaining + ' 個名額</span>';

      var dur = UI.formatDuration(b.duration);

      return '<a class="booth-card' + (b.allClosed ? ' is-closed' : '') + '" href="#/booth/' + esc(b.boothId) + '">' +
        '<div class="booth-thumb">' + thumb + badge + '</div>' +
        '<div class="booth-body">' +
          '<h3>' + esc(b.name) + '</h3>' +
          '<p class="booth-desc">' + esc(b.description || '這個攤位還沒有填寫簡介') + '</p>' +
          '<div class="booth-foot">' + status +
            '<span class="tag tag-muted">' + b.slotCount + ' 個時段</span>' +
            (dur ? '<span class="tag tag-amber">⏱ ' + esc(dur) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</a>';
    }

    function load() {
      return API.listBooths().then(function (res) {
        all = res.booths || [];
        paint(document.getElementById('boothSearch').value.trim());
      }).catch(function (e) {
        document.getElementById('boothList').innerHTML = UI.errorHTML(e.message);
      });
    }

    document.getElementById('boothSearch').addEventListener('input', function () {
      paint(this.value.trim());
    });

    load();

    if (window.APP_CONFIG.AUTO_REFRESH_MS > 0) {
      App.setRefresh(load, window.APP_CONFIG.AUTO_REFRESH_MS);
    }
  }

  /* ================= 攤位詳情 ================= */

  function renderBooth(app, boothId) {
    app.innerHTML = UI.loadingHTML('載入攤位資訊…');

    function load() {
      return API.getBooth(boothId).then(function (res) {
        paint(res.booth);
      }).catch(function (e) {
        app.innerHTML = '<a class="back" href="#/">← 回到攤位列表</a>' + UI.errorHTML(e.message);
      });
    }

    function paint(b) {
      var closedNotice = b.allClosed
        ? '<div class="notice notice-warn">這個攤位目前所有時段都已經停止報名了。</div>' : '';

      var dur = UI.formatDuration(b.duration);

      app.innerHTML =
        '<div class="page-head">' +
          '<a class="back" href="#/">← 回到攤位列表</a>' +
          '<h1>' + esc(b.name) + '</h1>' +
          (dur ? '<p class="sub">⏱ 預計遊玩時數 ' + esc(dur) + '</p>' : '') +
        '</div>' +
        UI.slideshowHTML(b.photos) +
        (b.description
          ? '<div class="card mt"><h2>攤位簡介</h2><p style="margin:0">' + UI.nl2br(b.description) + '</p></div>'
          : '') +
        '<div class="card mt">' +
          '<div class="card-title"><h2>選擇報名時段</h2>' +
            '<a class="small muted" href="#/mine">查詢／取消我的報名 →</a></div>' +
          closedNotice +
          '<div class="slot-list">' + (b.slots.length
            ? b.slots.map(slotRow).join('')
            : '<p class="muted">攤商還沒有設定時段。</p>') +
          '</div>' +
        '</div>';

      UI.initSlideshows(app);

      UI.$$('[data-signup]', app).forEach(function (btn) {
        btn.onclick = function () {
          var slot = b.slots.filter(function (s) { return s.id === btn.dataset.signup; })[0];
          openSignupModal(b, slot, load);
        };
      });
    }

    function slotRow(s) {
      var pct = s.capacity ? Math.min(100, Math.round(s.taken / s.capacity * 100)) : 100;
      var cls = s.closed ? 'stopped' : (s.remaining <= 0 ? 'full' : '');

      var right;
      if (s.closed) right = '<span class="tag tag-muted">已停止報名</span>';
      else if (s.remaining <= 0) right = '<span class="tag tag-danger">名額已滿</span>';
      else right = '<button class="btn" data-signup="' + esc(s.id) + '">我要報名</button>';

      return '<div class="slot-row ' + cls + '">' +
        '<div style="flex:1;min-width:190px">' +
          '<div class="slot-time">' + esc(s.label) + '</div>' +
          '<div class="slot-meta">' + s.taken + ' / ' + s.capacity + ' 人' +
            (!s.closed && s.remaining > 0 ? '　·　還剩 <strong>' + s.remaining + '</strong> 個名額' : '') +
          '</div>' +
          '<div class="meter' + (s.remaining <= 0 ? ' is-full' : '') + '"><span style="width:' + pct + '%"></span></div>' +
        '</div>' +
        '<div class="spacer"></div>' + right +
      '</div>';
    }

    load();
  }

  /* ================= 報名表單 ================= */

  function openSignupModal(booth, slot, onDone) {
    var me = UI.store('me') || {};

    UI.modal(
      '<h3>報名「' + esc(booth.name) + '」</h3>' +
      '<p class="muted small">時段：<strong>' + esc(slot.label) + '</strong>　·　剩餘 ' + slot.remaining + ' 個名額</p>' +
      '<div class="field"><label for="suName">姓名</label>' +
        '<input type="text" id="suName" maxlength="20" placeholder="請填真實姓名，方便現場核對" value="' + esc(me.name || '') + '"></div>' +
      '<div class="field"><label for="suPhone">手機號碼</label>' +
        '<input type="tel" id="suPhone" inputmode="numeric" maxlength="13" placeholder="0912345678" value="' + esc(me.phone || '') + '">' +
        '<p class="hint">取消報名時要用同一組姓名與手機號碼查詢，請填正確喔。</p></div>' +
      '<div class="btn-row">' +
        '<button class="btn btn-ghost" data-cancel>再想想</button>' +
        '<button class="btn" data-ok>確認報名</button>' +
      '</div>',
      function (root, close) {
        var nameEl = root.querySelector('#suName');
        var phoneEl = root.querySelector('#suPhone');
        nameEl.focus();

        root.querySelector('[data-cancel]').onclick = close;

        function submit() {
          var btn = root.querySelector('[data-ok]');
          var name = nameEl.value.trim();
          var phone = phoneEl.value.replace(/\D/g, '');

          if (name.length < 2) return UI.err('請填寫 2 個字以上的姓名');
          if (!/^09\d{8}$/.test(phone)) return UI.err('手機號碼格式不對（09 開頭共 10 碼）');

          UI.busy(btn, true, '報名中…');
          API.signup({ boothId: booth.boothId, slotId: slot.id, name: name, phone: phone })
            .then(function (res) {
              UI.store('me', { name: name, phone: phone });
              UI.bumpGrowth(1);
              close();
              UI.ok('報名成功！' + esc(booth.name) + ' ' + slot.label);
              if (res.warning) setTimeout(function () { UI.toast(res.warning); }, 900);
              if (onDone) onDone();
            })
            .catch(function (e) {
              UI.busy(btn, false);
              UI.err(e.message);
              if (/已滿|停止/.test(e.message) && onDone) { close(); onDone(); }
            });
        }

        root.querySelector('[data-ok]').onclick = submit;
        [nameEl, phoneEl].forEach(function (el) {
          el.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
        });
      }
    );
  }

  /* ================= 我的報名 ================= */

  function renderMine(app) {
    var me = UI.store('me') || {};

    app.innerHTML =
      '<div class="card">' +
        '<div class="row">' +
          '<div class="field" style="margin-bottom:0"><label for="myName">姓名</label>' +
            '<input type="text" id="myName" maxlength="20" value="' + esc(me.name || '') + '" placeholder="王小明"></div>' +
          '<div class="field" style="margin-bottom:0"><label for="myPhone">手機號碼</label>' +
            '<input type="tel" id="myPhone" inputmode="numeric" maxlength="13" value="' + esc(me.phone || '') + '" placeholder="0912345678"></div>' +
        '</div>' +
        '<div class="btn-row mt"><button class="btn" id="lookupBtn">查詢我的報名</button></div>' +
      '</div>' +
      '<div id="mineResult" class="mt"></div>';

    var box = document.getElementById('mineResult');

    function lookup(silent) {
      var name = document.getElementById('myName').value.trim();
      var phone = document.getElementById('myPhone').value.replace(/\D/g, '');
      if (name.length < 2 || !/^09\d{8}$/.test(phone)) {
        if (!silent) UI.err('請填寫正確的姓名與手機號碼');
        return;
      }
      UI.store('me', { name: name, phone: phone });
      box.innerHTML = UI.loadingHTML('查詢中…');

      API.lookupSignups({ name: name, phone: phone })
        .then(function (res) { paint(res.signups || [], phone); })
        .catch(function (e) { box.innerHTML = UI.errorHTML(e.message); });
    }

    function paint(list, phone) {
      UI.setGrowth(list.length);   // 以後端查到的筆數為準，校正左上角的圖示
      if (!list.length) {
        box.innerHTML = '<div class="card">' +
          UI.emptyHTML('📭', '查不到報名紀錄', '請確認姓名與手機號碼和報名時填的完全一樣') + '</div>';
        return;
      }
      box.innerHTML = '<div class="card"><div class="card-title"><h2>共 ' + list.length + ' 筆報名</h2></div>' +
        '<div class="slot-list">' + list.map(function (s) {
          return '<div class="slot-row">' +
            '<div style="flex:1;min-width:180px">' +
              '<div style="font-weight:700">' + esc(s.boothName) + '</div>' +
              '<div class="slot-meta">🕘 ' + esc(s.slotLabel) + '　·　報名於 ' + esc(s.createdAt) + '</div>' +
            '</div>' +
            '<div class="spacer"></div>' +
            '<a class="btn btn-ghost btn-sm" href="#/booth/' + esc(s.boothId) + '">看攤位</a>' +
            '<button class="btn btn-danger-ghost btn-sm" data-cancel="' + esc(s.signupId) + '" ' +
              'data-label="' + esc(s.boothName + ' ' + s.slotLabel) + '">取消報名</button>' +
          '</div>';
        }).join('') + '</div></div>';

      UI.$$('[data-cancel]', box).forEach(function (btn) {
        btn.onclick = function () {
          UI.confirm({
            title: '確定要取消報名嗎？',
            message: btn.dataset.label + '\n取消後名額會馬上釋出給其他人。',
            confirmText: '取消報名',
            danger: true
          }).then(function (yes) {
            if (!yes) return;
            UI.busy(btn, true, '處理中');
            API.cancelSignup({ signupId: btn.dataset.cancel, phone: phone })
              .then(function () { UI.bumpGrowth(-1); UI.ok('已取消報名'); lookup(true); })
              .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
          });
        };
      });
    }

    document.getElementById('lookupBtn').onclick = function () { lookup(false); };
    UI.$$('#myName, #myPhone').forEach(function (el) {
      el.onkeydown = function (e) { if (e.key === 'Enter') lookup(false); };
    });

    if (me.name && me.phone) lookup(true);
  }

  return { renderHome: renderHome, renderBooth: renderBooth, renderMine: renderMine };
})();
