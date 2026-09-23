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
        '<a href="javascript:void 0" data-tab="signups" class="' + (state.tab === 'signups' ? 'active' : '') + '">全部報名資料</a>' +
        '<a href="javascript:void 0" data-tab="refresh">↻ 重新整理</a>' +
        '<a href="javascript:void 0" data-tab="logout">登出</a>' +
      '</div>' +
      '<div id="aBody"></div>';

    UI.$$('[data-tab]', app).forEach(function (a) {
      a.onclick = function () {
        var t = a.dataset.tab;
        if (t === 'refresh') return load(app);
        if (t === 'logout') { sess('adminCode', null); state.code = null; return renderLogin(app); }
        state.tab = t;
        paint(app);
      };
    });

    if (state.tab === 'booths') paintBooths(app);
    else paintSignups(app);
  }

  /* ================= 攤位管理 ================= */

  function paintBooths(app) {
    var d = state.data;
    var body = document.getElementById('aBody');

    body.innerHTML =
      '<div class="card">' +
        '<div class="card-title"><h2>新增攤商代碼</h2></div>' +
        '<div class="row">' +
          '<input type="text" id="newNote" maxlength="60" placeholder="備註">' +
          '<button class="btn" id="newBooth" style="flex:0 0 auto">產生代碼</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-title"><h2>所有攤位（' + d.booths.length + '）</h2>' +
          '<button class="btn btn-ghost btn-sm" id="expBooths">⬇ 匯出攤位清單</button></div>' +
        (d.booths.length
          ? '<div class="table-wrap"><table><thead><tr>' +
              '<th>代碼</th><th>攤位名稱</th><th>備註</th><th>狀態</th>' +
              '<th>報名 / 名額</th><th>時段</th><th>操作</th>' +
            '</tr></thead><tbody>' + d.booths.map(boothRow).join('') + '</tbody></table></div>'
          : UI.emptyHTML('🎪', '還沒有任何攤位', '先在上面產生一組代碼給攤商')) +
      '</div>';

    document.getElementById('newBooth').onclick = function () {
      var btn = this;
      UI.busy(btn, true, '產生中…');
      API.adminCreateBooth({ adminCode: state.code, note: document.getElementById('newNote').value.trim() })
        .then(function (res) {
          UI.busy(btn, false);
          showCode(res.code, '新的攤商代碼');
          load(app);
        })
        .catch(function (e) { UI.busy(btn, false); UI.err(e.message); });
    };

    document.getElementById('expBooths').onclick = function () {
      var rows = [['代碼', '攤位名稱', '備註', '狀態', '已報名', '總名額', '時段數', '建立時間']];
      d.booths.forEach(function (b) {
        rows.push([b.code, b.name, b.note, b.closed ? '停止報名' : (b.configured ? '開放中' : '未設定'),
                   b.taken, b.capacity, b.slots.length, b.createdAt]);
      });
      UI.downloadCSV('攤位清單.csv', rows);
    };

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

    UI.$$('[data-slots]', body).forEach(function (btn) {
      btn.onclick = function () {
        var b = d.booths.filter(function (x) { return x.boothId === btn.dataset.slots; })[0];
        UI.modal(
          '<h3>' + esc(b.name || b.code) + ' 的時段</h3>' +
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
    var status = !b.configured ? '<span class="tag tag-muted">未設定</span>'
      : b.closed ? '<span class="tag tag-danger">停止報名</span>'
      : '<span class="tag tag-ok">開放中</span>';

    return '<tr>' +
      '<td><span class="code-chip">' + esc(b.code) + '</span> ' +
        '<button class="btn btn-ghost btn-sm" data-copy="' + esc(b.code) + '" title="複製">⧉</button></td>' +
      '<td>' + (b.configured
        ? '<a href="#/booth/' + esc(b.boothId) + '">' + esc(b.name) + '</a>'
        : '<span class="muted">—</span>') + '</td>' +
      '<td class="muted">' + esc(b.note || '') + '</td>' +
      '<td>' + status + '</td>' +
      '<td class="num">' + b.taken + ' / ' + b.capacity + '</td>' +
      '<td class="num"><button class="btn btn-ghost btn-sm" data-slots="' + esc(b.boothId) + '">' + b.slots.length + ' 個</button></td>' +
      '<td>' +
        '<button class="btn btn-ghost btn-sm" data-reset="' + esc(b.boothId) + '">換代碼</button> ' +
        '<button class="btn btn-danger-ghost btn-sm" data-del="' + esc(b.boothId) + '" data-name="' + esc(b.name || b.code) + '">刪除</button>' +
      '</td>' +
    '</tr>';
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
    var live = d.booths.filter(function (b) { return b.configured; });

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
          label: b.name, value: b.taken, capacity: b.capacity,
          note: b.closed ? '（已停止報名）' : ''
        };
      })
    });

    /* 各攤位：每個時段的報名人數 */
    live.forEach(function (b) {
      if (!b.slots.length) return;
      Charts.bar(charts, {
        title: b.name + '　各時段報名人數',
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
        return (s.boothName + ' ' + s.name + ' ' + s.phone + ' ' + s.slotLabel).toLowerCase().indexOf(k) > -1;
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
            '<th>#</th><th>攤位</th><th>時段</th><th>姓名</th><th>電話</th><th>報名時間</th>' +
          '</tr></thead><tbody>' + list.map(function (s, i) {
            return '<tr><td class="num">' + (i + 1) + '</td>' +
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
      var out = [['攤位', '時段', '姓名', '電話', '報名時間']];
      rows().forEach(function (s) { out.push([s.boothName, s.slotLabel, s.name, s.phone, s.createdAt]); });
      UI.downloadCSV('全部報名資料.csv', out);
    };
  }

  return { render: render };
})();
