/* =====================================================================
 * admin.js — 總召後台：發放攤商代碼、總覽所有攤位與報名資料
 * ===================================================================== */

window.AdminView = (function () {

  var esc = UI.esc;
  var state = { code: null, data: null, tab: 'booths', keyword: '' };

  function sess(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem('fju_' + key);
      if (value === null) sessionStorage.removeItem('fju_' + key);
      else sessionStorage.setItem('fju_' + key, value);
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /* ================= 進入點 ================= */

  function render(app) {
    var saved = sess('adminCode');
    if (saved) {
      state.code = saved;
      load(app);
    } else {
      renderLogin(app);
    }
  }

  function renderLogin(app) {
    app.innerHTML =
      '<div class="card auth-card">' +
        '<h1 style="margin-bottom:6px">總召後台</h1>' +
        '<p class="muted small">輸入總召密碼即可管理所有攤位與報名資料。</p>' +
        '<div class="field"><label for="aCode">總召密碼</label>' +
          '<input type="password" id="aCode" autocomplete="current-password"></div>' +
        '<button class="btn btn-block" id="aLogin">登入</button>' +
      '</div>';

    var input = document.getElementById('aCode');
    input.focus();

    function go() {
      var code = input.value;
      if (!code) return UI.err('請輸入密碼');
      var btn = document.getElementById('aLogin');
      UI.busy(btn, true, '驗證中…');
      API.adminLogin(code)
        .then(function () { sess('adminCode', code); state.code = code; load(app); })
        .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
    }
    document.getElementById('aLogin').onclick = go;
    input.onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  function load(app) {
    app.innerHTML = UI.loadingHTML('載入後台資料…');
    API.adminOverview(state.code)
      .then(function (res) { state.data = res; paint(app); })
      .catch(function (e) {
        if (/密碼/.test(e.message)) {
          sess('adminCode', null);
          state.code = null;
          renderLogin(app);
          UI.err(e.message);
          return;
        }
        app.innerHTML = '<div class="card auth-card">' + UI.errorHTML(e.message) +
          '<button class="btn btn-ghost" id="retryBtn">再試一次</button></div>';
        document.getElementById('retryBtn').onclick = function () { load(app); };
      });
  }

  /* ================= 主畫面 ================= */

  function paint(app) {
    var d = state.data;
    app.innerHTML =
      '<div class="page-head"><h1>總召後台</h1></div>' +

      '<div class="stat-grid mb">' +
        '<div class="stat"><b>' + d.stats.boothCount + '</b><span>攤位代碼</span></div>' +
        '<div class="stat"><b>' + d.stats.configuredCount + '</b><span>已設定上線</span></div>' +
        '<div class="stat"><b>' + d.stats.signupCount + '</b><span>有效報名</span></div>' +
        '<div class="stat"><b>' + d.stats.cancelledCount + '</b><span>已取消</span></div>' +
      '</div>' +

      '<div class="nav mb" style="margin-left:0">' +
        '<a href="javascript:void 0" data-tab="booths" class="' + (state.tab === 'booths' ? 'active' : '') + '">攤位管理</a>' +
        '<a href="javascript:void 0" data-tab="map" class="' + (state.tab === 'map' ? 'active' : '') + '">地圖定位</a>' +
        '<a href="javascript:void 0" data-tab="signups" class="' + (state.tab === 'signups' ? 'active' : '') + '">全部報名資料</a>' +
        '<a href="javascript:void 0" data-tab="refresh">↻ 重新整理</a>' +
      '</div>' +
      '<div id="aBody"></div>';

    App.setLogout(function () {
      sess('adminCode', null);
      state.code = null;
      App.setLogout(null);
      renderLogin(app);
    }, '登出');

    UI.$$('[data-tab]', app).forEach(function (a) {
      a.onclick = function () {
        var t = a.dataset.tab;
        if (t === 'refresh') return load(app);
        state.tab = t;
        paint(app);
      };
    });

    if (state.tab === 'booths') paintBooths(app);
    else if (state.tab === 'map') paintMap(app);
    else paintSignups(app);
  }

  /* ================= 地圖定位 ================= */

  function paintMap(app) {
    var body = document.getElementById('aBody');
    var mapSrc = (window.APP_CONFIG && window.APP_CONFIG.MAP) || 'assets/map.png';
    // 只有填好資料的攤位才需要定位
    var booths = state.data.booths.filter(function (b) { return b.configured; });
    var selected = null;

    body.innerHTML =
      '<div class="card">' +
        '<div class="card-title"><h2>攤位在地圖上的位置</h2>' +
          '<span class="small muted" id="placeCount"></span></div>' +
        '<p class="muted small" style="margin-top:-6px">' +
          '先點右邊的攤位，再點地圖上的位置就定位好了；已經放上去的標記可以直接拖曳微調。<br>' +
          '<strong>攤位很密的地方先用 ＋ 放大再點</strong>，會準很多；放大後可以直接拖曳地圖移動。' +
          '選好攤位之後也可以用鍵盤方向鍵微調（按住 Shift 移動得更快）。<br>' +
          '編號用「-」分段的攤位（A1-1、A1-2）在地圖上算同一攤，一起定位、標記上只寫 A1。</p>' +
        (booths.length
          ? '<div class="map-editor">' +
              '<div>' +
              '<div class="map-stage is-editor" id="editStage">' +
                '<div class="map-pan">' +
                  '<img src="' + esc(mapSrc) + '" alt="攤位地圖" id="editMap">' +
                  '<div class="pin-layer" id="editPins"></div>' +
                '</div>' +
                MapView.controlsHTML(false, 'only-full') +
              '</div>' +
              '<div class="map-cap-bar">' + MapView.controlsHTML(false, 'map-ctrl-bar') + '</div>' +
              '</div>' +
              '<div>' +
                '<input type="text" id="placeFilter" placeholder="搜尋攤位編號或名稱" style="margin-bottom:8px">' +
                '<div class="place-list" id="placeList"></div>' +
                '<button class="btn btn-ghost btn-sm mt" id="clearPos" disabled>清除選取攤位的位置</button>' +
              '</div>' +
            '</div>'
          : UI.emptyHTML('🎪', '還沒有可以定位的攤位', '攤商把攤位資料填好之後就會出現在這裡')) +
      '</div>';

    if (!booths.length) return;

    var stage = document.getElementById('editStage');
    var pinLayer = document.getElementById('editPins');
    var list = document.getElementById('placeList');
    var clearBtn = document.getElementById('clearPos');

    /* 定位地圖也可以縮放拖曳 —— A 區那一排攤位在原尺寸下只有幾個像素寬，
       不放大根本點不準。預設視角一樣會對準已經定位好的那些標記。 */
    var view = MapView.attach(stage, { onPinPointerDown: true });
    MapView.bindControls(stage, view);
    MapView.bindControls(stage.parentNode, view);
    function sizeEditPins() {
      var w = stage.clientWidth || 0;
      if (!w) return;
      stage.style.setProperty('--pin-scale', Math.max(0.55, Math.min(1, w / 760)).toFixed(3));
    }
    sizeEditPins();
    var lastEditK = 0;
    view.on('change', function (vs) {
      if (Math.abs(vs.k - lastEditK) < 0.001) return;
      lastEditK = vs.k;
      sizeEditPins();
    });
    // 點地圖空白處 → 把目前選取的攤位放到那裡
    view.on('tap', function (e) {
      if (!selected) return;
      var c = view.toPercent(e.ev.clientX, e.ev.clientY);
      save(byKey(selected), c.x, c.y);
    });

    document.getElementById('editMap').onerror = function () {
      body.innerHTML = '<div class="card">' +
        UI.errorHTML('找不到地圖圖檔，請先把地圖放到 assets/map.png 再回來定位。') + '</div>';
    };

    function placed(b) { return typeof b.mapX === 'number' && typeof b.mapY === 'number'; }

    /* 以「地圖群組」為單位來定位：A1-1 與 A1-2 共用一個標記、一起存。 */
    function buildGroups() {
      var order = [], map = {};
      booths.forEach(function (b) {
        var key = UI.boothGroup(b.boothNo);
        if (!map[key]) { map[key] = { key: key, booths: [] }; order.push(key); }
        map[key].booths.push(b);
      });
      return order.map(function (k) {
        var g = map[k];
        var anchor = g.booths.filter(placed)[0];
        g.mapX = anchor ? anchor.mapX : null;
        g.mapY = anchor ? anchor.mapY : null;
        g.label = g.booths.length > 1
          ? g.booths[0].name + '　等 ' + g.booths.length + ' 攤'
          : g.booths[0].name;
        return g;
      });
    }

    var groups = buildGroups();
    var didFit = false;
    var filterBox = document.getElementById('placeFilter');
    if (filterBox) filterBox.oninput = function () { draw(); };
    function byKey(k) {
      return groups.filter(function (g) { return g.key === k; })[0];
    }

    function draw() {
      groups = buildGroups();
      var done = groups.filter(function (g) { return g.mapX !== null; }).length;
      document.getElementById('placeCount').textContent = '已定位 ' + done + ' / ' + groups.length;

      pinLayer.innerHTML = groups.filter(function (g) { return g.mapX !== null; }).map(function (g) {
        return '<div class="pin' + (g.key === selected ? ' is-active' : '') + '" ' +
          'data-pin="' + esc(g.key) + '" style="left:' + g.mapX + '%;top:' + g.mapY + '%">' +
          '<span class="pin-in">' +
            '<span class="pin-dot">' + esc(g.key) + '</span>' +
            '<span class="pin-name">' + esc(g.label) + '</span>' +
          '</span>' +
        '</div>';
      }).join('');

      // 攤位一多，用關鍵字篩一下比較好找
      var kw = (filterBox && filterBox.value || '').trim().toUpperCase();
      var shown = kw
        ? groups.filter(function (g) { return (g.key + ' ' + g.label).toUpperCase().indexOf(kw) > -1; })
        : groups;

      list.innerHTML = shown.map(function (g) {
        var ok = g.mapX !== null;
        return '<button type="button" class="place-row' + (g.key === selected ? ' is-selected' : '') +
          '" data-row="' + esc(g.key) + '">' +
          '<span class="pno">' + esc(g.key) + '</span>' +
          '<span class="pname">' + esc(g.label) + '</span>' +
          '<span class="pstate ' + (ok ? 'done' : 'todo') + '">' + (ok ? '已定位' : '未定位') + '</span>' +
        '</button>';
      }).join('') || '<p class="muted small" style="padding:6px 2px">找不到符合的攤位</p>';

      var pts = groups.filter(function (g) { return g.mapX !== null; })
        .map(function (g) { return { x: g.mapX, y: g.mapY }; });
      view.setBounds(pts);
      // 只在第一次對準，之後不要把總召自己放大的畫面彈掉
      if (!didFit && pts.length) { didFit = true; view.reset(); }

      stage.classList.toggle('placing', !!selected);
      clearBtn.disabled = !selected || !byKey(selected) || byKey(selected).mapX === null;

      UI.$$('[data-row]', list).forEach(function (row) {
        row.onclick = function () {
          selected = selected === row.dataset.row ? null : row.dataset.row;
          draw();
        };
      });
      bindDrag();
    }

    /** 整個群組的攤位一起寫入同一個座標 */
    function save(group, x, y) {
      if (!group) return;
      var prev = group.booths.map(function (b) { return { b: b, x: b.mapX, y: b.mapY }; });
      group.booths.forEach(function (b) { b.mapX = x; b.mapY = y; });
      draw();

      Promise.all(group.booths.map(function (b) {
        return API.adminSetBoothPos({ adminCode: state.code, boothId: b.boothId, mapX: x, mapY: y });
      }))
        .then(function () {
          UI.ok(x === null ? '已清除 ' + group.key + ' 的位置' : group.key + ' 的位置已更新');
        })
        .catch(function (e) {
          prev.forEach(function (p) { p.b.mapX = p.x; p.b.mapY = p.y; });   // 存不進去就還原
          draw();
          UI.err(e.message);
        });
    }

    function coords(ev) { return view.toPercent(ev.clientX, ev.clientY); }

    // 拖曳既有的標記微調位置
    function bindDrag() {
      UI.$$('.pin', pinLayer).forEach(function (pin) {
        pin.onpointerdown = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();                 // 不要變成拖曳地圖
          var group = byKey(pin.dataset.pin);
          if (!group) return;
          selected = group.key;
          pin.classList.add('dragging');
          pin.setPointerCapture(ev.pointerId);
          var moved = false;

          pin.onpointermove = function (e2) {
            moved = true;
            var c = coords(e2);
            pin.style.left = c.x + '%';
            pin.style.top = c.y + '%';
          };
          pin.onpointerup = function (e2) {
            pin.onpointermove = null;
            pin.onpointerup = null;
            pin.classList.remove('dragging');
            var c = coords(e2);
            if (moved) save(group, c.x, c.y);
            else draw();
          };
        };
      });
    }

    /* 鍵盤微調：選好攤位之後用方向鍵一格一格推，比用滑鼠點準得多 */
    function onKey(ev) {
      if (!selected || !document.body.contains(stage)) return;
      var map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      var d = map[ev.key];
      if (!d) return;
      var g = byKey(selected);
      if (!g || g.mapX === null) return;
      ev.preventDefault();
      var step = (ev.shiftKey ? 1 : 0.2);
      save(g, Math.max(0, Math.min(100, Math.round((g.mapX + d[0] * step) * 10) / 10)),
              Math.max(0, Math.min(100, Math.round((g.mapY + d[1] * step) * 10) / 10)));
    }
    document.addEventListener('keydown', onKey);

    clearBtn.onclick = function () {
      if (selected) save(byKey(selected), null, null);
    };

    draw();
  }

  /* ================= 攤位管理 ================= */

  function paintBooths(app) {
    var d = state.data;
    var body = document.getElementById('aBody');

    body.innerHTML =
      '<div class="card">' +
        '<div class="card-title"><h2>新增攤位</h2></div>' +
        '<div class="row">' +
          '<input type="text" id="newBoothNo" maxlength="20" placeholder="攤位編號（必填，例如 1 或 A01）">' +
          '<button class="btn" id="newBooth" style="flex:0 0 auto">產生代碼</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title"><h2>所有攤位（' + d.booths.length + '）</h2>' +
          '<div class="btn-row">' +
            '<button class="btn btn-ghost btn-sm" id="recountBtn">🛠 重新計算名額</button>' +
            '<button class="btn btn-ghost btn-sm" id="expBooths">⬇ 匯出攤位清單</button>' +
          '</div></div>' +
        (d.booths.length
          ? '<div class="table-wrap"><table><thead><tr>' +
              '<th>編號</th><th>代碼</th><th>攤位名稱</th><th>類型</th><th>狀態</th>' +
              '<th>報名 / 名額</th><th>時段</th><th>名單</th><th>操作</th>' +
            '</tr></thead><tbody>' + d.booths.map(boothRow).join('') + '</tbody></table></div>'
          : UI.emptyHTML('🎪', '還沒有任何攤位', '先在上面填攤位編號產生一組代碼給攤商')) +
      '</div>';

    function createBooth() {
      var btn = document.getElementById('newBooth');
      var input = document.getElementById('newBoothNo');
      var boothNo = input.value.trim();
      if (!boothNo) { input.focus(); return UI.err('請先填寫攤位編號'); }

      UI.busy(btn, true, '產生中…');
      API.adminCreateBooth({ adminCode: state.code, boothNo: boothNo })
        .then(function (res) {
          UI.busy(btn, false);
          input.value = '';
          showCode(res.code, '攤位：' + res.boothNo + ' 的代碼');
          load(app);
        })
        .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
    }

    document.getElementById('newBooth').onclick = createBooth;
    document.getElementById('newBoothNo').onkeydown = function (e) {
      if (e.key === 'Enter') createBooth();
    };

    document.getElementById('recountBtn').onclick = function () {
      var btn = this;
      UI.busy(btn, true, '計算中…');
      API.adminRecount(state.code)
        .then(function (res) { UI.busy(btn, false); UI.ok(res.message); load(app); })
        .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
    };

    document.getElementById('expBooths').onclick = function () {
      var rows = [['攤位編號', '代碼', '攤位名稱', '類型', '狀態', '已報名', '總名額', '時段數', '建立時間']];
      d.booths.forEach(function (b) {
        rows.push([b.boothNo, b.code, b.name, b.infoOnly ? '只做介紹' : '需要報名',
                   b.infoOnly ? '自由參觀' : (b.closed ? '停止報名' : (b.configured ? '開放中' : '未設定')),
                   b.infoOnly ? '' : b.taken, b.infoOnly ? '' : b.capacity,
                   b.infoOnly ? '' : b.slots.length, b.createdAt]);
      });
      UI.downloadCSV('攤位清單.csv', rows);
    };

    UI.$$('[data-editno]', body).forEach(function (btn) {
      btn.onclick = function () { editBoothNo(app, btn.dataset.editno, btn.dataset.cur); };
    });

    UI.$$('[data-copy]', body).forEach(function (btn) {
      btn.onclick = function () { copy(btn.dataset.copy); };
    });

    UI.$$('[data-reset]', body).forEach(function (btn) {
      btn.onclick = function () {
        UI.confirm({
          title: '重新產生代碼？',
          message: '舊代碼會立刻失效，記得把新代碼傳給攤商。',
          confirmText: '重新產生', danger: true
        }).then(function (yes) {
          if (!yes) return;
          API.adminResetCode({ adminCode: state.code, boothId: btn.dataset.reset })
            .then(function (res) { showCode(res.code, '新代碼'); load(app); })
            .catch(UI.err);
        });
      };
    });

    UI.$$('[data-del]', body).forEach(function (btn) {
      btn.onclick = function () {
        UI.confirm({
          title: '刪除攤位？',
          message: '「' + btn.dataset.name + '」及其所有報名紀錄都會被取消，這個動作無法復原。',
          confirmText: '刪除攤位', danger: true
        }).then(function (yes) {
          if (!yes) return;
          API.adminDeleteBooth({ adminCode: state.code, boothId: btn.dataset.del })
            .then(function (res) { UI.ok(res.message); load(app); })
            .catch(UI.err);
        });
      };
    });

    UI.$$('[data-mode]', body).forEach(function (box) {
      box.onchange = function () {
        var infoOnly = !box.checked;          // 開關關起來 = 只做介紹
        box.disabled = true;
        API.adminSetBoothMode({ adminCode: state.code, boothId: box.dataset.mode, infoOnly: infoOnly })
          .then(function (res) { UI.ok(res.message); load(app); })
          .catch(function (e) {
            box.checked = !box.checked;       // 存不進去就還原
            box.disabled = false;
            UI.err(e.message);
          });
      };
    });

    UI.$$('[data-slots]', body).forEach(function (btn) {
      btn.onclick = function () {
        var b = d.booths.filter(function (x) { return x.boothId === btn.dataset.slots; })[0];
        UI.modal(
          '<h3>' + esc((b.boothNo ? b.boothNo + ' 號　' : '') + (b.name || b.code)) + ' 的時段</h3>' +
          (b.slots.length
            ? '<div class="table-wrap"><table><thead><tr><th>時段</th><th>報名</th><th>狀態</th></tr></thead><tbody>' +
              b.slots.map(function (s) {
                return '<tr><td>' + esc(s.label) + '</td>' +
                  '<td class="num">' + s.taken + ' / ' + s.capacity + '</td>' +
                  '<td>' + (s.closed ? '已停止' : (s.remaining <= 0 ? '額滿' : '開放中')) + '</td></tr>';
              }).join('') + '</tbody></table></div>'
            : '<p class="muted">尚未設定時段。</p>') +
          '<div class="btn-row"><button class="btn btn-ghost" data-close>關閉</button></div>',
          function (root, close) { root.querySelector('[data-close]').onclick = close; }
        );
      };
    });
  }

  function boothRow(b) {
    var status = b.infoOnly ? '<span class="tag tag-brand">自由參觀</span>'
      : !b.configured ? '<span class="tag tag-muted">未設定</span>'
      : b.closed ? '<span class="tag tag-danger">停止報名</span>'
      : '<span class="tag tag-ok">開放中</span>';

    // 需要報名 ↔ 只做介紹，由總召切換
    var mode = '<label class="switch" title="關掉代表這個攤位只做介紹，不開放報名">' +
      '<input type="checkbox" data-mode="' + esc(b.boothId) + '"' + (b.infoOnly ? '' : ' checked') + '>' +
      '<span class="small">' + (b.infoOnly ? '只做介紹' : '需要報名') + '</span></label>';

    return '<tr>' +
      '<td><span class="booth-no">' + esc(b.boothNo || '—') + '</span> ' +
        '<button class="btn btn-ghost btn-sm" data-editno="' + esc(b.boothId) + '" ' +
          'data-cur="' + esc(b.boothNo || '') + '" title="修改攤位編號">✎</button></td>' +
      '<td><span class="code-chip">' + esc(b.code) + '</span> ' +
        '<button class="btn btn-ghost btn-sm" data-copy="' + esc(b.code) + '" title="複製">⧉</button></td>' +
      '<td>' + (b.configured
        ? '<a href="#/booth/' + esc(b.boothId) + '">' + esc(b.name) + '</a>'
        : '<span class="muted">—</span>') + '</td>' +
      '<td>' + mode + '</td>' +
      '<td>' + status + '</td>' +
      '<td class="num">' + (b.infoOnly ? '<span class="muted">—</span>' : b.taken + ' / ' + b.capacity) + '</td>' +
      '<td class="num">' + (b.infoOnly ? '<span class="muted">—</span>'
        : '<button class="btn btn-ghost btn-sm" data-slots="' + esc(b.boothId) + '">' + b.slots.length + ' 個</button>') + '</td>' +
      '<td>' + (b.fileUrl
        ? '<a class="btn btn-ghost btn-sm" href="' + esc(b.fileUrl) + '" target="_blank" rel="noopener">試算表</a>'
        : '<span class="tag tag-warn">缺檔案</span>') + '</td>' +
      '<td>' +
        '<button class="btn btn-ghost btn-sm" data-reset="' + esc(b.boothId) + '">換代碼</button> ' +
        '<button class="btn btn-danger-ghost btn-sm" data-del="' + esc(b.boothId) + '" data-name="' +
          esc((b.boothNo ? b.boothNo + ' 號 ' : '') + (b.name || b.code)) + '">刪除</button>' +
      '</td>' +
    '</tr>';
  }

  /** 總召可以隨時改攤位編號（攤商自己不行） */
  function editBoothNo(app, boothId, current) {
    UI.modal(
      '<h3>修改攤位編號</h3>' +
      '<p class="muted small">改完之後，攤位列表的排序與報名紀錄上的編號都會跟著更新。</p>' +
      '<div class="field"><label for="enNo">攤位編號</label>' +
        '<input type="text" id="enNo" maxlength="20" value="' + esc(current) + '"></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-cancel>取消</button>' +
        '<button class="btn" data-ok>儲存</button></div>',
      function (root, close) {
        var input = root.querySelector('#enNo');
        input.focus();
        input.select();
        root.querySelector('[data-cancel]').onclick = close;

        function save() {
          var v = input.value.trim();
          if (!v) return UI.err('攤位編號不能空白');
          var btn = root.querySelector('[data-ok]');
          UI.busy(btn, true, '儲存中…');
          API.adminSetBoothNo({ adminCode: state.code, boothId: boothId, boothNo: v })
            .then(function (res) { close(); UI.ok(res.message); load(app); })
            .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
        }
        root.querySelector('[data-ok]').onclick = save;
        input.onkeydown = function (e) { if (e.key === 'Enter') save(); };
      }
    );
  }

  function showCode(code, title) {
    UI.modal(
      '<h3>' + esc(title) + '</h3>' +
      '<p class="muted small">把這組代碼交給攤商，他就能用它登入「攤商」頁面編輯攤位。</p>' +
      '<div class="center" style="margin:18px 0">' +
        '<span class="code-chip" style="font-size:1.5rem;padding:10px 18px;letter-spacing:.12em">' + esc(code) + '</span>' +
      '</div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-copy2>複製代碼</button>' +
        '<button class="btn" data-close>好</button></div>',
      function (root, close) {
        root.querySelector('[data-close]').onclick = close;
        root.querySelector('[data-copy2]').onclick = function () { copy(code); };
      }
    );
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { UI.ok('已複製 ' + text); },
        function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); UI.ok('已複製 ' + text); }
    catch (e) { UI.toast(text); }
    ta.remove();
  }

  /* ================= 全部報名資料 ================= */

  function paintSignups(app) {
    var d = state.data;
    var body = document.getElementById('aBody');
    var live = d.booths.filter(function (b) { return b.configured && !b.infoOnly; });

    body.innerHTML =
      '<div class="btn-row mb">' +
        '<button class="btn btn-ghost btn-sm" id="expAll">⬇ 匯出 CSV</button>' +
        '<button class="btn btn-ghost btn-sm" id="toggleTable">切換表格檢視</button>' +
      '</div>' +
      '<div id="charts"></div>' +
      '<div id="rawTable" hidden></div>';

    var charts = document.getElementById('charts');

    /* 總覽：各攤位報名人數 */
    Charts.bar(charts, {
      title: '各攤位報名人數',
      sub: '橫軸為攤位，縱軸為人數。深色是已報名人數，淺色是該攤位的總名額。',
      data: live.map(function (b) {
        return {
          label: b.boothNo || b.name, value: b.taken, capacity: b.capacity,
          note: b.name + (b.closed ? '（已停止報名）' : '')
        };
      })
    });

    /* 各攤位：每個時段的報名人數 */
    live.forEach(function (b) {
      if (!b.slots.length) return;
      Charts.bar(charts, {
        title: (b.boothNo ? b.boothNo + ' 號　' : '') + b.name + '　各時段報名人數',
        sub: '橫軸為時段，縱軸為人數。深色是已報名人數，淺色是該時段的名額上限。',
        alt: true,
        data: b.slots.map(function (s) {
          return {
            label: s.label, value: s.taken, capacity: s.capacity,
            note: s.closed ? '（已停止）' : (s.remaining <= 0 ? '（額滿）' : '')
          };
        })
      });
    });

    if (!live.length) {
      charts.innerHTML = '<div class="card">' +
        UI.emptyHTML('📊', '還沒有攤位資料', '等攤商填好攤位後這裡就會出現統計圖') + '</div>';
    }

    /* 表格檢視（無障礙備援 + 逐筆查詢） */
    var tableBox = document.getElementById('rawTable');

    function rows() {
      var k = state.keyword.toLowerCase();
      return !k ? d.signups : d.signups.filter(function (s) {
        return (s.boothNo + ' ' + s.boothName + ' ' + s.name + ' ' + s.phone + ' ' + s.slotLabel)
          .toLowerCase().indexOf(k) > -1;
      });
    }

    function drawTable() {
      tableBox.innerHTML =
        '<div class="card">' +
          '<div class="card-title"><h2>全部報名資料（' + d.signups.length + '）</h2></div>' +
          '<div class="searchbar"><span class="ico">🔍</span>' +
            '<input type="text" id="sSearch" placeholder="搜尋攤位、姓名或電話" value="' + esc(state.keyword) + '"></div>' +
          '<div id="sTable"></div>' +
        '</div>';

      var list = rows();
      document.getElementById('sTable').innerHTML = list.length
        ? '<div class="table-wrap"><table><thead><tr>' +
            '<th>#</th><th>編號</th><th>攤位</th><th>時段</th><th>姓名</th><th>電話</th><th>報名時間</th>' +
          '</tr></thead><tbody>' + list.map(function (s, i) {
            return '<tr><td class="num">' + (i + 1) + '</td>' +
              '<td><span class="booth-no">' + esc(s.boothNo || '—') + '</span></td>' +
              '<td>' + esc(s.boothName) + '</td>' +
              '<td class="num">' + esc(s.slotLabel) + '</td>' +
              '<td>' + esc(s.name) + '</td>' +
              '<td class="num"><a href="tel:' + esc(s.phone) + '">' + esc(UI.formatPhone(s.phone)) + '</a></td>' +
              '<td class="num muted">' + esc(s.createdAt) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : UI.emptyHTML('🔍', '沒有符合的報名資料', '');

      var box = document.getElementById('sSearch');
      box.addEventListener('input', function () {
        state.keyword = this.value.trim();
        var pos = this.selectionStart;
        drawTable();
        var again = document.getElementById('sSearch');
        again.focus();
        again.setSelectionRange(pos, pos);
      });
    }

    document.getElementById('toggleTable').onclick = function () {
      var showTable = tableBox.hidden;
      tableBox.hidden = !showTable;
      charts.hidden = showTable;
      this.textContent = showTable ? '切換圖表檢視' : '切換表格檢視';
      if (showTable && !tableBox.innerHTML) drawTable();
    };

    document.getElementById('expAll').onclick = function () {
      var out = [['攤位編號', '攤位', '時段', '姓名', '電話', '報名時間']];
      rows().forEach(function (s) { out.push([s.boothNo, s.boothName, s.slotLabel, s.name, s.phone, s.createdAt]); });
      UI.downloadCSV('全部報名資料.csv', out);
    };
  }

  return { render: render };
})();
