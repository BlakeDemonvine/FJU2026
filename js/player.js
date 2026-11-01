/* =====================================================================
 * player.js — 玩家端：攤位列表、攤位詳情與報名、我的報名
 * ===================================================================== */

window.PlayerView = (function () {

  var esc = UI.esc;

  /* 頂列的高度（字體載入後、轉向後都可能變），量出來寫進 CSS，
     首頁那一塊才算得出「剛好一個畫面」要多高。 */
  function measureChrome() {
    var bar = document.querySelector('.topbar');
    var h = bar ? Math.round(bar.getBoundingClientRect().height) : 52;
    document.documentElement.style.setProperty('--topbar-h', h + 'px');
  }

  if (!window.__chromeBound) {
    window.__chromeBound = true;
    window.addEventListener('resize', measureChrome);
    window.addEventListener('orientationchange', function () { setTimeout(measureChrome, 200); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureChrome);
  }

  /* ================= 首頁：所有攤位 ================= */

  function renderHome(app) {
    var mapSrc = (window.APP_CONFIG && window.APP_CONFIG.MAP) || 'assets/map.png';

    /* .home-fit 是「地圖在上、攤位在下」的那一整塊。
       手機上它剛好等於一個畫面的高度，往下滑會自動停在這裡（見 style.css 的 scroll-snap）。 */
    app.innerHTML =
      '<section class="home-fit" id="homeFit">' +
        '<figure class="map-card" id="mapCard">' +
          '<div class="map-stage" id="mapStage">' +
            '<img src="' + esc(mapSrc) + '" alt="園遊會攤位地圖" id="mapImg" ' +
              'decoding="async" fetchpriority="high">' +
            '<div class="pin-layer" id="pinLayer"></div>' +
          '</div>' +
          '<figcaption class="map-cap">🗺️ 園遊會攤位地圖　' +
            '<span class="muted" id="mapHint">點攤位標記可以直接前往</span></figcaption>' +
        '</figure>' +
        '<div id="boothList">' + UI.loadingHTML('正在載入攤位…') + '</div>' +
        '<div class="rail-island" id="railIsland" hidden></div>' +
      '</section>';

    var mapImg = document.getElementById('mapImg');
    var mapStage = document.getElementById('mapStage');
    var homeFit = document.getElementById('homeFit');

    measureChrome();

    // 還沒放 map.png 的話就不要留一個破圖，也不用硬撐成一個畫面高
    mapImg.onerror = function () {
      document.getElementById('mapCard').hidden = true;
      homeFit.classList.add('no-map');
    };

    /* 地圖載好之後把真實比例寫進 CSS，版面就不會因為圖片晚到而跳動；
       手機上也能用 svh 限制高度而不影響標記位置。 */
    function applyMapRatio() {
      if (!mapImg.naturalWidth || !mapImg.naturalHeight) return;
      mapStage.style.setProperty('--map-ar', (mapImg.naturalWidth / mapImg.naturalHeight).toFixed(4));
      sizePins();
    }
    if (mapImg.complete) applyMapRatio();
    mapImg.addEventListener('load', applyMapRatio);

    /* 標記大小跟著地圖一起縮放。固定 26px 的標記在手機上等於放大了兩三倍，
       距離近的兩攤就會疊在一起（A1 蓋住 A5 就是這樣來的）。 */
    function sizePins() {
      var w = mapStage.clientWidth || 0;
      if (!w) return;
      var scale = Math.max(0.52, Math.min(1, w / 760));
      mapStage.style.setProperty('--pin-scale', scale.toFixed(3));
      if (renderHome.__spread) renderHome.__spread();
    }
    sizePins();
    if (window.ResizeObserver) {
      new ResizeObserver(sizePins).observe(mapStage);
    } else {
      window.addEventListener('resize', sizePins);
    }

    /** 把有定位的攤位畫到地圖上 */
    function paintPins(list) {
      var layer = document.getElementById('pinLayer');
      var placed = list.filter(function (b) {
        return typeof b.mapX === 'number' && typeof b.mapY === 'number';
      });

      mapImg.style.cursor = 'zoom-in';
      mapImg.onclick = function () { UI.viewImage(mapImg.src); };

      if (!placed.length) {
        layer.innerHTML = '';
        document.getElementById('mapHint').textContent = '點一下可以放大';
        return;
      }

      // 手機上標題列放不下長句子，會折成兩行吃掉版面
      document.getElementById('mapHint').textContent =
        window.matchMedia('(max-width: 520px)').matches
          ? '點標記前往攤位' : '點標記前往攤位，點空白處放大地圖';
      renderHome.__spread = spreadPins;
      layer.innerHTML = placed.map(function (b) {
        return '<a class="pin' + (b.allClosed ? ' is-closed' : '') + '" ' +
          'href="#/booth/' + esc(b.boothId) + '" ' +
          'data-pin="' + esc(b.boothId) + '" ' +
          'style="left:' + b.mapX + '%;top:' + b.mapY + '%" ' +
          'title="' + esc(b.boothNo + ' ' + b.name) + '">' +
          '<span class="pin-dot">' + esc(b.boothNo) + '</span>' +
          '<span class="pin-name">' + esc(b.name) + '</span>' +
        '</a>';
      }).join('');

      spreadPins();
    }

    /* 位置很接近的攤位（例如 A1 跟 A5 只差幾公尺），在手機的小地圖上
       會整個疊在一起。這裡把擠在一起的標記互相推開一點點，
       每個標記最多只偏離真實位置一個標記的距離，還是看得出大概在哪裡。 */
    function spreadPins() {
      var pins = UI.$$('#pinLayer .pin');
      if (pins.length < 2) return;

      var w = mapStage.clientWidth, h = mapStage.clientHeight;
      if (!w || !h) return;

      var P = pins.map(function (el) {
        var dot = el.querySelector('.pin-dot');
        el.style.removeProperty('--nx');
        el.style.removeProperty('--ny');
        return {
          el: el,
          x: parseFloat(el.style.left) / 100 * w,
          y: parseFloat(el.style.top) / 100 * h,
          r: Math.max(dot.offsetWidth, dot.offsetHeight) / 2 || 10,
          ox: 0, oy: 0
        };
      });

      for (var pass = 0; pass < 40; pass++) {
        var moved = false;
        for (var i = 0; i < P.length; i++) {
          for (var j = i + 1; j < P.length; j++) {
            var a = P[i], b = P[j];
            var dx = (b.x + b.ox) - (a.x + a.ox);
            var dy = (b.y + b.oy) - (a.y + a.oy);
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d < 0.01) { dx = (i % 2 ? 1 : -1); dy = 0.3; d = 1; }  // 完全重疊時給個方向
            var want = a.r + b.r + 3;
            if (d >= want) continue;
            var push = (want - d) / 2 * 0.6;
            var ux = dx / d, uy = dy / d;
            a.ox -= ux * push; a.oy -= uy * push;
            b.ox += ux * push; b.oy += uy * push;
            moved = true;
          }
        }
        if (!moved) break;
      }

      P.forEach(function (p) {
        var m = Math.sqrt(p.ox * p.ox + p.oy * p.oy);
        var max = p.r * 1.8;
        if (m > max) { p.ox *= max / m; p.oy *= max / m; }
        p.el.style.setProperty('--nx', p.ox.toFixed(1) + 'px');
        p.el.style.setProperty('--ny', p.oy.toFixed(1) + 'px');
      });
    }

    /** highlight 某個攤位的標記（滑到那張卡、或滑鼠移過卡片時） */
    function focusPin(boothId) {
      UI.$$('#pinLayer .pin').forEach(function (p) {
        p.classList.toggle('is-active', p.dataset.pin === boothId);
      });
    }

    var all = [];
    var lastSignature = null;

    function paint() {
      var box = document.getElementById('boothList');
      var island = document.getElementById('railIsland');

      if (!all.length) {
        island.hidden = true;
        lastSignature = null;
        homeFit.classList.add('is-empty');   // 沒有攤位就不要硬撐一個畫面高
        box.innerHTML = UI.emptyHTML('🎪', '目前還沒有攤位開放報名', '攤商正在準備中，等等再來看看吧');
        return;
      }
      homeFit.classList.remove('is-empty');

      // 依攤位編號排序（1 < 2 < 10，A01 < B01，混用也不會亂）
      var list = all.slice().sort(function (a, b) {
        return UI.compareBoothNo(a.boothNo, b.boothNo);
      });

      /* 背景自動更新時，如果資料其實沒變就什麼都不要動。
         不然手機上每兩分鐘整列攤位會重畫一次，正在看的位置被彈回第一攤，
         圖片也會重新解碼閃一下。 */
      var sig = JSON.stringify(list.map(function (b) {
        return [b.boothId, b.boothNo, b.name, b.description, b.duration,
                b.totalRemaining, b.slotCount, b.allClosed, b.mapX, b.mapY,
                (b.photos && b.photos[0] && (b.photos[0].fileId || b.photos[0].url)) || ''];
      }));
      if (sig === lastSignature && document.getElementById('boothRail')) {
        paintPins(list);
        return;
      }

      // 更新前先記住左右滑到哪裡，畫完再滑回去
      var oldRail = document.getElementById('boothRail');
      var keepScroll = oldRail ? oldRail.scrollLeft : 0;

      lastSignature = sig;
      box.innerHTML = '<div class="booth-grid" id="boothRail">' + list.map(boothCard).join('') + '</div>';

      UI.$$('.booth-thumb img', box).forEach(function (im) {
        UI.bindImgFallback(im, function (el) {
          el.parentNode.replaceChild(
            Object.assign(document.createElement('span'), {
              className: 'placeholder', textContent: '🎪'
            }), el);
        });
      });

      paintPins(list);

      // 寬螢幕：滑鼠移到攤位卡上，地圖對應的標記會亮起來
      if (!UI.isTouch) {
        UI.$$('.booth-card', box).forEach(function (card, i) {
          card.addEventListener('mouseenter', function () { focusPin(list[i].boothId); });
          card.addEventListener('mouseleave', function () { focusPin(null); });
        });
      }

      var rail = document.getElementById('boothRail');
      if (rail && keepScroll) rail.scrollLeft = keepScroll;
      initRail(rail, island, list);
    }

    /** 窄螢幕時攤位是左右滑的，底部浮動島顯示現在看到第幾個 */
    function initRail(rail, island, list) {
      if (!rail) return;

      function isRail() {
        return window.matchMedia('(max-width: 720px)').matches;
      }

      function update() {
        if (!document.body.contains(rail)) return;   // 已經換頁了就不用再算
        if (!isRail() || !list.length) { island.hidden = true; return; }
        var cards = UI.$$('.booth-card', rail);
        if (!cards.length) { island.hidden = true; return; }

        // 離捲動視窗中心最近的那張卡就是目前這張
        var mid = rail.scrollLeft + rail.clientWidth / 2;
        var best = 0, bestGap = Infinity;
        cards.forEach(function (c, i) {
          var gap = Math.abs((c.offsetLeft + c.offsetWidth / 2) - mid);
          if (gap < bestGap) { bestGap = gap; best = i; }
        });

        var cur = list[best];
        island.hidden = false;
        island.innerHTML =
          '<span class="rail-no">攤位</span>' +
          '<span>' + (best + 1) + ' / ' + list.length + '</span>';

        // 滑到哪一攤，地圖上就亮哪一攤
        focusPin(cur.boothId);
      }

      rail.addEventListener('scroll', function () {
        if (rail.__tick) return;
        rail.__tick = requestAnimationFrame(function () {
          rail.__tick = null;
          update();
        });
      }, { passive: true });

      /* 浮動島現在就排在攤位卡的正下方（不再是蓋在畫面上的固定元素），
         所以永遠不會擋到卡片上的字，也不用再跟頁尾閃避。 */

      /* 視窗層級的監聽只掛一次。以前每次重畫攤位列都會再掛一組，
         手機捲動時同一件事被算好幾遍，越用越卡。 */
      if (!renderHome.__winBound) {
        renderHome.__winBound = true;
        window.addEventListener('resize', function () {
          if (renderHome.__update) renderHome.__update();
        });
      }
      renderHome.__update = update;

      update();
    }

    function boothCard(b) {
      var photo = (b.photos && b.photos[0]) || null;
      // 卡片上的縮圖只需要幾百像素，跟詳情頁的大圖用不同尺寸
      var thumb = photo
        ? UI.imgTag(photo, {
            alt: b.name, lazy: true,
            widths: [400, 720],
            sizes: '(max-width: 720px) 86vw, 320px'
          })
        : '<span class="placeholder">🎪</span>';
      var photoCount = (b.photoCount !== undefined && b.photoCount !== null)
        ? b.photoCount : (b.photos || []).length;
      var badge = photoCount > 1 ? '<span class="count-badge">📷 ' + photoCount + '</span>' : '';

      var status = b.allClosed
        ? '<span class="tag tag-danger">已截止報名</span>'
        : '<span class="tag tag-ok">尚餘 ' + b.totalRemaining + ' 個名額</span>';

      var dur = UI.formatDuration(b.duration);

      return '<a class="booth-card' + (b.allClosed ? ' is-closed' : '') + '" href="#/booth/' + esc(b.boothId) + '">' +
        '<div class="booth-thumb">' + thumb + badge + '</div>' +
        '<div class="booth-body">' +
          (b.boothNo ? '<span class="booth-no">攤位：' + esc(b.boothNo) + '</span>' : '') +
          '<h3><span>' + esc(b.name) + '</span></h3>' +
          '<p class="booth-desc">' + esc(b.description || '這個攤位還沒有填寫簡介') + '</p>' +
          '<div class="booth-foot">' + status +
            '<span class="tag tag-muted">' + b.slotCount + ' 個時段</span>' +
            (dur ? '<span class="tag tag-amber">⏱ ' + esc(dur) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</a>';
    }

    function load(background) {
      return API.listBooths().then(function (res) {
        all = res.booths || [];
        UI.cacheSet('booths', all);
        paint();
      }).catch(function (e) {
        if (background) return;          // 已經有畫面了就不要把它換成錯誤訊息
        document.getElementById('railIsland').hidden = true;
        document.getElementById('boothList').innerHTML = UI.errorHTML(e.message);
      });
    }

    /* 先用上一次的資料把畫面畫出來，再到後端拿最新的。
       手機上回上一頁、或重新整理，攤位會「立刻」出現，不用對著轉圈圈等。 */
    var cached = UI.cacheGet('booths', 10 * 60 * 1000);
    var hadCache = false;
    if (cached && cached.length) {
      all = cached;
      paint();
      hadCache = true;
    }
    load(hadCache);

    if (window.APP_CONFIG.AUTO_REFRESH_MS > 0) {
      App.setRefresh(load, window.APP_CONFIG.AUTO_REFRESH_MS);
    }
  }

  /* ================= 攤位詳情 ================= */

  function renderBooth(app, boothId) {
    var painted = false;
    app.innerHTML = UI.loadingHTML('載入攤位資訊…');

    function load(background) {
      return API.getBooth(boothId).then(function (res) {
        UI.cacheSet('booth_' + boothId, res.booth);
        paint(res.booth);
      }).catch(function (e) {
        if (background) return;
        app.innerHTML = '<a class="back" href="#/">← 回到攤位列表</a>' + UI.errorHTML(e.message);
      });
    }

    /* 先畫快取裡的版本（名額可能稍舊，所以馬上去後端更新一次）。
       手機上從攤位列表點進來，照片與簡介會立刻出現。 */
    var cachedBooth = UI.cacheGet('booth_' + boothId, 5 * 60 * 1000);
    if (cachedBooth) { paint(cachedBooth); painted = true; }

    function paint(b) {
      UI.stopSlideshows();
      var closedNotice = b.allClosed
        ? '<div class="notice notice-warn">這個攤位目前所有時段都已經停止報名了。</div>' : '';

      var dur = UI.formatDuration(b.duration);

      app.innerHTML =
        '<div class="page-head">' +
          '<a class="back" href="#/">← 回到攤位列表</a>' +
          (b.boothNo ? '<div><span class="booth-no">攤位：' + esc(b.boothNo) + '</span></div>' : '') +
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
      painted = true;

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

    load(painted);
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
        // 手機上不要自動叫出鍵盤，不然一打開視窗畫面就被鍵盤吃掉一半
        if (!UI.isTouch) nameEl.focus();

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
              '<div style="font-weight:700">' +
                (s.boothNo ? '<span class="booth-no" style="margin:0 6px 0 0">' + esc(s.boothNo) + '</span>' : '') +
                esc(s.boothName) + '</div>' +
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
