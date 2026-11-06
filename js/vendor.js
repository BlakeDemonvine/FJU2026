/* =====================================================================
 * vendor.js — 攤商端：代碼登入、攤位資訊編輯、時段管理、報名名單
 * ===================================================================== */

window.VendorView = (function () {

  var esc = UI.esc;
  var state = { code: null, booth: null, tab: 'info', photos: [], slots: [], stats: null };

  /* ================= 進入點 ================= */

  function render(app) {
    var saved = UI.store('vendorCode');
    if (saved) {
      app.innerHTML = UI.loadingHTML('登入中…');
      API.vendorLogin(saved)
        .then(function (res) { enter(app, saved, res.booth, res.stats); })
        .catch(function () { UI.store('vendorCode', null); renderLogin(app); });
    } else {
      renderLogin(app);
    }
  }

  function renderLogin(app, message) {
    app.innerHTML =
      '<div class="card auth-card">' +
        '<h1 style="margin-bottom:6px">攤商登入</h1>' +
        '<p class="muted small">請輸入總召給你的攤位代碼（一個攤位一組）。</p>' +
        (message ? '<div class="notice notice-danger">' + esc(message) + '</div>' : '') +
        '<div class="field"><label for="vCode">攤位代碼</label>' +
          '<input type="text" id="vCode" placeholder="FJU-XXXXXX" autocomplete="off" ' +
          'style="text-transform:uppercase;letter-spacing:.08em;font-family:ui-monospace,monospace"></div>' +
        '<button class="btn btn-block" id="vLogin">登入</button>' +
        '<hr class="divider">' +
        '<p class="small muted" style="margin:0">還沒有代碼嗎？請先向總召報名攤位，他會發一組代碼給你。</p>' +
      '</div>';

    var input = document.getElementById('vCode');
    input.focus();

    function go() {
      var code = input.value.trim().toUpperCase();
      if (!code) return UI.err('請輸入代碼');
      var btn = document.getElementById('vLogin');
      UI.busy(btn, true, '驗證中…');
      API.vendorLogin(code)
        .then(function (res) {
          UI.store('vendorCode', code);
          enter(app, code, res.booth, res.stats);
        })
        .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
    }

    document.getElementById('vLogin').onclick = go;
    input.onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  function enter(app, code, booth, stats) {
    state.code = code;
    state.booth = booth;
    if (stats) state.stats = stats;
    state.photos = (booth.photos || []).slice();
    state.slots = (booth.slots || []).map(function (s) {
      var parts = (s.start && s.end) ? { start: s.start, end: s.end } : UI.splitLabel(s.label);
      return {
        id: s.id, label: s.label,
        start: parts.start, end: parts.end,
        capacity: Number(s.capacity) || 0,
        closed: !!s.closed, taken: Number(s.taken) || 0
      };
    });
    state.tab = state.tab || 'info';
    paint(app);

    /* 之前就把照片、簡介都放上來、但還沒填價格的攤商，
       一登入就跳一個彈窗請他補填（只補價格，不會動到其他設定）。 */
    if (!booth.infoOnly && !UI.hasPrice(booth.price) && looksConfigured(booth)) promptPrice(app);
  }

  /** 這個攤位已經有在用了嗎（有名字、照片、簡介或時段其中之一） */
  function looksConfigured(b) {
    return !!(String(b.name || '').trim() ||
              (b.photos || []).length ||
              String(b.description || '').trim() ||
              (b.slots || []).length);
  }

  /** 登入後提醒補填價格的彈窗 */
  function promptPrice(app) {
    UI.modal(
      '<h3>請補填參加費用</h3>' +
      '<p class="muted">系統新增了「參加費用」這一欄，你的攤位還沒有填。' +
      '填好之後玩家在攤位列表上就會看到費用。</p>' +
      '<div class="field">' +
        '<label for="mPrice">參加費用（元）</label>' +
        '<input type="number" id="mPrice" min="0" max="99999" step="5" inputmode="numeric" ' +
          'placeholder="不收費請填 0">' +
        '<p class="muted small" style="margin:6px 0 0">填 <strong>0</strong> 會顯示「免費」。</p>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn btn-ghost" data-free>我們是免費的</button>' +
        '<button class="btn" data-save>儲存費用</button>' +
      '</div>',
      function (root, close) {
        var input = root.querySelector('#mPrice');
        var saveBtn = root.querySelector('[data-save]');
        input.focus();

        function send(price, btn) {
          UI.busy(btn, true, '儲存中…');
          API.vendorSetPrice({ code: state.code, price: price })
            .then(function (res) {
              close();
              UI.ok('已儲存費用');
              state.booth = res.booth;
              paint(app);
            })
            .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
        }

        root.querySelector('[data-free]').onclick = function () { send(0, this); };
        saveBtn.onclick = function () {
          var n = parseInt(input.value.trim(), 10);
          if (isNaN(n) || n < 0) return UI.err('請填 0 或正整數');
          send(n, this);
        };
        input.onkeydown = function (e) { if (e.key === 'Enter') saveBtn.click(); };
      }
    );
  }

  /* ================= 主畫面 ================= */

  function paint(app) {
    var b = state.booth;
    App.setLogout(function () {
      UI.store('vendorCode', null);
      state = { code: null, booth: null, tab: 'info', photos: [], slots: [], stats: null };
      App.setLogout(null);
      renderLogin(app);
    }, '登出');

    app.innerHTML =
      '<div class="page-head">' +
        (b.boothNo ? '<div><span class="booth-no">攤位：' + esc(b.boothNo) + '</span></div>' : '') +
        '<h1>' + esc(b.name || '尚未命名的攤位') + '</h1>' +
        '<p class="sub">攤位代碼 <span class="code-chip">' + esc(b.code) + '</span>' +
        (b.closed ? '　<span class="tag tag-danger">已停止報名</span>' : '') + '</p>' +
      '</div>' +
      statBar() +
      '<div class="nav mb" style="margin-left:0">' +
        '<a href="javascript:void 0" data-tab="info" class="' + (state.tab === 'info' ? 'active' : '') + '">攤位設定</a>' +
        '<a href="javascript:void 0" data-tab="signups" class="' + (state.tab === 'signups' ? 'active' : '') + '">報名名單</a>' +
      '</div>' +
      '<div id="vBody"></div>';

    UI.$$('[data-tab]', app).forEach(function (a) {
      a.onclick = function () {
        state.tab = a.dataset.tab;
        paint(app);
      };
    });

    if (state.tab === 'info') paintInfo(app);
    else paintSignups(app);
  }

  /** 把報名數與名額從目前的時段資料加總起來 */
  function totals() {
    var slots = (state.booth && state.booth.slots) || [];
    return {
      taken: slots.reduce(function (a, s) { return a + (Number(s.taken) || 0); }, 0),
      capacity: slots.reduce(function (a, s) { return a + (Number(s.capacity) || 0); }, 0),
      slotCount: slots.length
    };
  }

  function pct(a, b) {
    if (!b) return '—';
    return Math.round(a / b * 100) + '%';
  }

  /**
   * 頁面最上面那排數字。
   *   瀏覽人數  有多少不同的人點進這一攤（同一個人重複看只算一次）
   *   報名率    這些人裡面有多少真的報名了
   *   名額使用  已經報名的人數 ÷ 總名額
   */
  function statBar() {
    var st = state.stats;
    if (!st) return '';
    var b = state.booth;
    var t = totals();

    var cells = [
      ['' + st.people, '本攤瀏覽人數', st.views + ' 次瀏覽'],
      ['' + st.sitePeople, '全站瀏覽人數', st.siteViews + ' 次瀏覽']
    ];
    if (!b.infoOnly) {
      cells.splice(1, 0,
        [t.taken + ' / ' + t.capacity, '報名 / 名額', '名額使用 ' + pct(t.taken, t.capacity)],
        [pct(t.taken, st.people), '報名率', '看過的人有多少報名']);
    }

    return '<div class="stat-grid mb">' +
      cells.map(function (c) {
        return '<div class="stat"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span>' +
          (c[2] ? '<span class="stat-note">' + esc(c[2]) + '</span>' : '') + '</div>';
      }).join('') +
    '</div>';
  }

  /* ================= 分頁：攤位設定 ================= */

  function paintInfo(app) {
    var b = state.booth;
    document.getElementById('vBody').innerHTML =
      '<div class="card">' +
        '<div class="card-title"><h2>基本資訊</h2></div>' +
        '<div class="field">' +
          '<label>攤位編號</label>' +
          '<div class="readonly-box">' + esc(b.boothNo || '—') +
            '<span class="muted small">由總召編配，無法自行修改</span></div>' +
        '</div>' +
        '<div class="field"><label for="fName">攤位名稱 <span class="muted small">（必填）</span></label>' +
          '<input type="text" id="fName" maxlength="40" value="' + esc(b.name) + '" placeholder="例：射氣球大挑戰"></div>' +
        '<div class="field"><label for="fDesc">攤位簡介</label>' +
          '<textarea id="fDesc" maxlength="2000" placeholder="介紹一下你們的遊戲玩法、獎品、注意事項…">' + esc(b.description) + '</textarea></div>' +
        '<div class="field-row" style="margin-bottom:0">' +
          '<div class="field" style="margin-bottom:0">' +
            '<label for="fDuration">預計遊玩時數</label>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<input type="number" id="fDuration" min="0" max="600" step="5" value="' +
                (Number(b.duration) || '') + '" placeholder="例：15">' +
              '<span class="muted small" style="white-space:nowrap">分鐘</span>' +
            '</div>' +
          '</div>' +
          /* 自由參觀的攤位不用報名，也就不收費，費用欄位整個不顯示 */
          (b.infoOnly ? '' :
            '<div class="field" style="margin-bottom:0">' +
              '<label for="fPrice">參加費用</label>' +
              '<div style="display:flex;align-items:center;gap:8px">' +
                '<input type="number" id="fPrice" min="0" max="99999" step="5" inputmode="numeric" value="' +
                  (UI.hasPrice(b.price) ? esc(String(b.price)) : '') + '" placeholder="免費請填 0">' +
                '<span class="muted small" style="white-space:nowrap">元</span>' +
              '</div>' +
              '<p class="muted small" style="margin:6px 0 0">不收費就填 <strong>0</strong>，玩家端會顯示「免費」。</p>' +
            '</div>') +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title"><h2>展示照片</h2>' +
          '<span class="small muted" id="photoCount"></span></div>' +
        '<div class="photo-grid mb" id="photoGrid"></div>' +
        '<div class="dropzone" id="dropzone">📷 上傳多張照片</div>' +
        '<input type="file" id="photoInput" accept="image/*" multiple hidden>' +
      '</div>' +

      /* 介紹攤位（由總召設定）不用報名，所以時段與報名開關整個不顯示。
         名稱、簡介、時數、照片都照常可以編輯。 */
      (b.infoOnly
        ? '<div class="card">' +
            '<div class="card-title"><h2>報名設定</h2></div>' +
            '<div class="notice notice-info" style="margin-bottom:0">' +
              '🎪 總召把這個攤位設定為<strong>自由參觀</strong>，不需要報名，' +
              '所以這裡沒有時段與人數上限要填。<br>' +
              '玩家一樣會在首頁與地圖上看到你的攤位、照片與簡介。' +
            '</div>' +
          '</div>'
        : '<div class="card">' +
            '<div class="card-title"><h2>報名時段與人數上限</h2>' +
              '<button class="btn btn-soft btn-sm" id="quickGen">⚡ 快速產生時段</button></div>' +
            '<div id="slotEditor"></div>' +
            '<button class="btn btn-ghost btn-sm mt" id="addSlot">＋ 新增一個時段</button>' +
          '</div>' +

          '<div class="card">' +
            '<div class="card-title"><h2>報名開關</h2></div>' +
            '<label class="switch"><input type="checkbox" id="fOpen"' + (b.closed ? '' : ' checked') + '>' +
              '<span id="openLabel"></span></label>' +
          '</div>') +

      '<div class="btn-row mt"><button class="btn" id="saveBtn">儲存所有變更</button>' +
        '<button class="btn btn-ghost" id="reloadBtn">重新載入</button></div>';

    drawPhotos();
    drawSlots();
    bindInfoEvents(app);
  }

  /* ---------- 照片 ---------- */

  function drawPhotos() {
    var grid = document.getElementById('photoGrid');
    if (!grid) return;
    document.getElementById('photoCount').textContent = state.photos.length + ' 張';

    if (!state.photos.length) {
      grid.innerHTML = '<p class="muted small" style="grid-column:1/-1;margin:0">還沒有照片。</p>';
      return;
    }
    grid.innerHTML = state.photos.map(function (p, i) {
      return '<div class="photo-item">' +
        // 管理用的小方格，載 240px 的縮圖就夠了（以前每格都載 1600px）
        UI.imgTag(p, { alt: '照片 ' + (i + 1), widths: [160, 320], sizes: '120px', lazy: true }) +
        '<button class="x" type="button" data-del="' + i + '" title="移除">✕</button>' +
        '<div class="order">' +
          (i > 0 ? '<button type="button" data-move="' + i + '" data-dir="-1" title="往前">←</button>' : '') +
          (i < state.photos.length - 1 ? '<button type="button" data-move="' + i + '" data-dir="1" title="往後">→</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    UI.$$('img', grid).forEach(function (im) { UI.bindImgFallback(im); });
    UI.$$('[data-del]', grid).forEach(function (btn) {
      btn.onclick = function () { state.photos.splice(+btn.dataset.del, 1); drawPhotos(); };
    });
    UI.$$('[data-move]', grid).forEach(function (btn) {
      btn.onclick = function () {
        var i = +btn.dataset.move, d = +btn.dataset.dir;
        var tmp = state.photos[i]; state.photos[i] = state.photos[i + d]; state.photos[i + d] = tmp;
        drawPhotos();
      };
    });
  }

  function uploadFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return f.type.indexOf('image/') === 0; });
    if (!list.length) return UI.err('請選擇圖片檔');

    var zone = document.getElementById('dropzone');
    var done = 0;
    zone.textContent = '上傳中… 0/' + list.length;

    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        return UI.compressImage(file)
          .then(function (img) {
            return API.vendorUploadPhoto({
              code: state.code, filename: img.filename, mimeType: img.mimeType, data: img.data
            });
          })
          .then(function (res) {
            state.photos.push(res.photo);
            done++;
            zone.textContent = '上傳中… ' + done + '/' + list.length;
            drawPhotos();
          })
          .catch(function (e) { UI.err(file.name + '：' + e.message); });
      });
    });

    chain.then(function () {
      zone.innerHTML = '📷 點這裡選擇照片，或把圖片拖曳進來<br><span class="small">可以一次選多張，玩家會以幻燈片方式看到</span>';
      if (done) UI.ok('已上傳 ' + done + ' 張照片，別忘了按「儲存所有變更」');
    });
  }

  /* ---------- 時段 ---------- */

  function drawSlots() {
    var box = document.getElementById('slotEditor');
    if (!box) return;

    if (!state.slots.length) {
      box.innerHTML = '<p class="muted small">還沒有時段，請新增至少一個。</p>';
      return;
    }
    /* 寬螢幕是一列一個時段（欄位標題在最上面那一行）；
       手機則是一個時段一張小卡，每個欄位自己帶標籤 —— 手機上沒有那行標題，
       光看一個空白框和一個開關根本不知道那是什麼。
       版面怎麼切換都寫在 css 的 .slot-edit 裡，這裡只負責把元素生出來。 */
    box.innerHTML = '<div class="slot-edit slot-edit-head">' +
        '<span>開始時間</span><span></span><span>結束時間</span>' +
        '<span class="center">人數上限</span><span class="center">停止報名</span><span></span>' +
      '</div>' + state.slots.map(function (s, i) {
      var taken = Number(s.taken) || 0;
      return '<div class="slot-edit' + (s.closed ? ' is-closed' : '') + '">' +
        '<input class="cell-start" type="time" data-f="start" data-i="' + i + '" value="' +
          esc(s.start || '') + '" step="300" aria-label="開始時間">' +
        '<span class="dash">–</span>' +
        '<input class="cell-end" type="time" data-f="end" data-i="' + i + '" value="' +
          esc(s.end || '') + '" step="300" aria-label="結束時間">' +
        '<label class="cell-cap"><span class="cl">人數上限</span>' +
          '<input type="number" data-f="capacity" data-i="' + i + '" value="' +
          (Number(s.capacity) || 0) + '" min="' + taken + '" max="999" aria-label="人數上限"></label>' +
        '<label class="cell-open switch switch-danger" title="打開代表這個時段不開放報名">' +
          '<span class="cl">停止報名</span>' +
          '<input type="checkbox" data-f="closed" data-i="' + i + '"' + (s.closed ? ' checked' : '') + '></label>' +
        '<button class="cell-del btn btn-danger-ghost btn-sm" data-delslot="' + i + '" ' +
          'aria-label="刪除這個時段"' +
          (taken > 0 ? ' disabled title="已有人報名，無法刪除"' : '') + '>' +
          '<span class="dl-full">刪除</span><span class="dl-x" aria-hidden="true">✕</span></button>' +
        '<span class="slot-no">時段 ' + (i + 1) + '</span>' +
        (taken > 0 ? '<span class="slot-taken">已報名 ' + taken + ' 人</span>' : '') +
      '</div>';
    }).join('');

    UI.$$('[data-f]', box).forEach(function (el) {
      el.onchange = el.oninput = function () {
        var s = state.slots[+el.dataset.i];
        var f = el.dataset.f;
        if (f === 'closed') {
          s.closed = el.checked;
          var card = el.closest('.slot-edit');
          if (card) card.classList.toggle('is-closed', el.checked);
        }
        else if (f === 'capacity') s.capacity = Math.max(0, parseInt(el.value, 10) || 0);
        else s[f] = el.value;
      };
    });
    UI.$$('[data-delslot]', box).forEach(function (btn) {
      btn.onclick = function () { state.slots.splice(+btn.dataset.delslot, 1); drawSlots(); };
    });
  }

  function quickGenerate() {
    UI.modal(
      '<h3>快速產生時段</h3>' +
      '<p class="muted small">依照開始時間、結束時間與每段長度，自動切出一整排時段。</p>' +
      '<div class="row">' +
        '<div class="field"><label>開始時間</label><input type="time" id="qgStart" value="10:00" step="300"></div>' +
        '<div class="field"><label>結束時間</label><input type="time" id="qgEnd" value="16:00" step="300"></div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="field"><label>每段幾分鐘</label><input type="number" id="qgLen" value="30" min="5" max="240"></div>' +
        '<div class="field"><label>每段人數上限</label><input type="number" id="qgCap" value="8" min="1" max="999"></div>' +
      '</div>' +
      '<label class="switch"><input type="checkbox" id="qgReplace"><span>取代目前的時段（不勾選則附加在後面）</span></label>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-cancel>取消</button>' +
        '<button class="btn" data-ok>產生</button></div>',
      function (root, close) {
        root.querySelector('[data-cancel]').onclick = close;
        root.querySelector('[data-ok]').onclick = function () {
          var toMin = UI.timeToMin;
          var fmt = UI.minToTime;

          var start = toMin(root.querySelector('#qgStart').value);
          var end = toMin(root.querySelector('#qgEnd').value);
          var len = parseInt(root.querySelector('#qgLen').value, 10);
          var cap = parseInt(root.querySelector('#qgCap').value, 10);

          if (start === null || end === null) return UI.err('請選擇開始與結束時間');
          if (end <= start) return UI.err('結束時間要晚於開始時間');
          if (!len || len < 5) return UI.err('每段至少 5 分鐘');
          if ((end - start) / len > 60) return UI.err('一次最多產生 60 個時段');

          var made = [];
          for (var t = start; t + len <= end; t += len) {
            made.push({
              id: '', start: fmt(t), end: fmt(t + len),
              label: fmt(t) + ' - ' + fmt(t + len),
              capacity: cap, closed: false, taken: 0
            });
          }
          if (!made.length) return UI.err('這個區間產生不出任何時段');

          if (root.querySelector('#qgReplace').checked) {
            var hasTaken = state.slots.filter(function (s) { return (Number(s.taken) || 0) > 0; });
            if (hasTaken.length) return UI.err('已經有人報名了，不能整批取代。請手動調整。');
            state.slots = made;
          } else {
            state.slots = state.slots.concat(made);
          }
          close();
          drawSlots();
          UI.ok('已產生 ' + made.length + ' 個時段');
        };
      }
    );
  }

  /* ---------- 事件綁定 ---------- */

  function bindInfoEvents(app) {
    var input = document.getElementById('photoInput');
    var zone = document.getElementById('dropzone');

    zone.onclick = function () { input.click(); };
    input.onchange = function () { uploadFiles(input.files); input.value = ''; };

    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });

    // 介紹攤位沒有時段與報名開關那兩塊，這一段的事件就不用綁（儲存鈕還是要綁）
    var openBox = document.getElementById('fOpen');
    if (openBox) bindSignupEvents(openBox);

    function bindSignupEvents(openBox) {
    // 報名開關的說明文字隨狀態更新
    var openLabel = document.getElementById('openLabel');
    function syncOpenLabel() {
      openLabel.textContent = openBox.checked
        ? '開放報名中 — 玩家可以報名這個攤位'
        : '已停止報名 — 玩家看得到攤位，但無法報名任何時段';
      openLabel.className = openBox.checked ? '' : 'muted';
    }
    openBox.onchange = syncOpenLabel;
    syncOpenLabel();

    document.getElementById('addSlot').onclick = function () {
      // 接續上一個時段的結束時間，少打幾次字
      var last = state.slots[state.slots.length - 1];
      var start = last && last.end ? last.end : '10:00';
      var startMin = UI.timeToMin(start);
      var len = 30;
      if (last && last.start && last.end) {
        var d = UI.timeToMin(last.end) - UI.timeToMin(last.start);
        if (d > 0) len = d;
      }
      state.slots.push({
        id: '', start: start, end: UI.minToTime((startMin === null ? 600 : startMin) + len),
        label: '', capacity: last ? last.capacity : 8, closed: false, taken: 0
      });
      drawSlots();
      var inputs = UI.$$('#slotEditor [data-f="start"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    };

    document.getElementById('quickGen').onclick = quickGenerate;
    }

    document.getElementById('reloadBtn').onclick = function () { render(app); };

    document.getElementById('saveBtn').onclick = function () {
      var btn = this;
      var name = document.getElementById('fName').value.trim();
      if (!name) return UI.err('請填寫攤位名稱');
      var openEl = document.getElementById('fOpen');   // 介紹攤位沒有這個開關
      if (openEl && !state.slots.length) return UI.err('請至少新增一個報名時段');

      var bad = null;
      var slots = state.slots.map(function (s, i) {
        var a = UI.timeToMin(s.start), b2 = UI.timeToMin(s.end);
        if (a === null || b2 === null) { bad = bad || ('第 ' + (i + 1) + ' 個時段還沒選好時間'); return s; }
        if (b2 <= a) { bad = bad || ('第 ' + (i + 1) + ' 個時段的結束時間要晚於開始時間'); return s; }
        return {
          id: s.id, start: s.start, end: s.end,
          label: s.start + ' - ' + s.end,
          capacity: s.capacity, closed: s.closed
        };
      });
      if (bad) return UI.err(bad);

      var priceEl = document.getElementById('fPrice');   // 自由參觀的攤位沒有這一欄
      var priceRaw = priceEl ? priceEl.value.trim() : '';

      function send(price) {
        UI.busy(btn, true, '儲存中…');
        API.vendorSave({
          code: state.code,
          name: name,
          description: document.getElementById('fDesc').value,
          duration: parseInt(document.getElementById('fDuration').value, 10) || 0,
          price: price,
          photos: state.photos,
          slots: slots,
          closed: openEl ? !openEl.checked : false
        })
          .then(function (res) {
            UI.ok('已儲存');
            enter(app, state.code, res.booth, res.stats);
          })
          .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
      }

      if (!priceEl) return send(undefined);   // 自由參觀：不送價格，後端保留原值

      /* 沒填價格就送出：先提醒一次，確認之後當成免費（0）存回去 */
      if (priceRaw === '') {
        UI.confirm({
          title: '還沒填參加費用',
          message: '你沒有填參加費用，玩家看到的會是「免費」喔。\n' +
                   '如果要收費，請按「回去填金額」；不收費的話直接按「就是免費」。',
          confirmText: '就是免費'
        }).then(function (yes) {
          if (!yes) { if (priceEl) { priceEl.focus(); priceEl.select(); } return; }
          if (priceEl) priceEl.value = '0';
          send(0);
        });
        return;
      }

      var priceNum = parseInt(priceRaw, 10);
      if (isNaN(priceNum) || priceNum < 0) return UI.err('參加費用請填 0 或正整數');
      send(priceNum);
    };
  }

  /* ================= 分頁：報名名單 ================= */

  function paintSignups(app) {
    var body = document.getElementById('vBody');
    body.innerHTML = UI.loadingHTML('載入報名名單…');

    API.vendorSignups(state.code)
      .then(function (res) {
        if (res.stats) state.stats = res.stats;   // 順便把瀏覽數更新成最新的
        paint(res);
      })
      .catch(function (e) { body.innerHTML = UI.errorHTML(e.message); });

    function paint(res) {
      var totalCap = res.slots.reduce(function (a, s) { return a + s.capacity; }, 0);
      var st = state.stats;

      body.innerHTML =
        /* 報名人數、名額使用、報名率在頁面最上面那排已經有了，這裡不重複 */
        '<p class="muted small mb" style="margin-top:0">' +
          '共 ' + res.slots.length + ' 個時段，' + res.total + ' / ' + totalCap + ' 人報名' +
          (st ? '，' + st.people + ' 人看過這一攤' : '') + '。</p>' +
        '<div class="btn-row mb">' +
          '<button class="btn btn-ghost btn-sm" id="expCsv">⬇ 匯出 CSV</button>' +
          '<button class="btn btn-ghost btn-sm" id="refreshSignups">↻ 重新整理</button>' +
        '</div>' +
        '<div id="vendorChart" class="mb"></div>' +
        (res.total === 0
          ? '<div class="card">' + UI.emptyHTML('📋', '還沒有人報名', '把攤位分享給玩家吧') + '</div>'
          : res.slots.map(slotBlock).join(''));

      /* 各時段的報名長條圖（跟總召後台看到的是同一種圖） */
      if (res.slots.length) {
        Charts.bar(document.getElementById('vendorChart'), {
          title: '各時段報名人數',
          sub: '橫軸為時段，縱軸為人數。深色是已報名人數，淺色是該時段的名額上限。',
          alt: true,
          data: res.slots.map(function (s) {
            return {
              label: s.label, value: s.people.length, capacity: s.capacity,
              note: s.closed ? '（已停止）' : (s.people.length >= s.capacity ? '（額滿）' : '')
            };
          })
        });
      }

      document.getElementById('refreshSignups').onclick = function () { paintSignups(app); };
      document.getElementById('expCsv').onclick = function () {
        var rows = [['攤位', '時段', '姓名', '電話', '報名時間']];
        res.slots.forEach(function (s) {
          s.people.forEach(function (p) {
            rows.push([state.booth.name, s.label, p.name, p.phone, p.createdAt]);
          });
        });
        UI.downloadCSV((state.booth.name || 'booth') + '_報名名單.csv', rows);
      };

      UI.$$('[data-remove]', body).forEach(function (btn) {
        btn.onclick = function () {
          UI.confirm({
            title: '刪除報名資格？',
            message: btn.dataset.who + '\n刪除後名額會釋出，對方查詢時也會看不到這筆報名。',
            confirmText: '刪除',
            danger: true
          }).then(function (yes) {
            if (!yes) return;
            UI.busy(btn, true, '刪除中');
            API.vendorRemoveSignup({ code: state.code, signupId: btn.dataset.remove })
              .then(function () { UI.ok('已刪除'); paintSignups(app); })
              .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
          });
        };
      });
    }

    function slotBlock(s) {
      var tag = s.closed
        ? '<span class="tag tag-muted">已停止</span>'
        : (s.people.length >= s.capacity ? '<span class="tag tag-danger">額滿</span>'
                                         : '<span class="tag tag-ok">尚餘 ' + (s.capacity - s.people.length) + '</span>');

      return '<div class="card">' +
        '<div class="card-title"><h3>🕘 ' + esc(s.label) +
          ' <span class="muted small">' + s.people.length + ' / ' + s.capacity + ' 人</span></h3>' + tag + '</div>' +
        (s.people.length
          ? '<div class="table-wrap"><table><thead><tr>' +
              '<th>#</th><th>姓名</th><th>電話</th><th>報名時間</th><th></th></tr></thead><tbody>' +
              s.people.map(function (p, i) {
                return '<tr><td class="num">' + (i + 1) + '</td>' +
                  '<td>' + esc(p.name) + '</td>' +
                  '<td class="num"><a href="tel:' + esc(p.phone) + '">' + esc(UI.formatPhone(p.phone)) + '</a></td>' +
                  '<td class="num muted">' + esc(p.createdAt) + '</td>' +
                  '<td><button class="btn btn-danger-ghost btn-sm" data-remove="' + esc(p.signupId) + '" ' +
                    'data-who="' + esc(p.name + '（' + UI.formatPhone(p.phone) + '）· ' + s.label) + '">刪除</button></td></tr>';
              }).join('') +
            '</tbody></table></div>'
          : '<p class="muted small" style="margin:0">這個時段還沒有人報名。</p>') +
      '</div>';
    }
  }

  return { render: render };
})();
