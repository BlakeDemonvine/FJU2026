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

  /* 捲動定位的保險。
     CSS 的 scroll-snap 在各家手機瀏覽器上支援程度不一（Safari 尤其挑），
     所以這裡再加一層：手指放開、捲動停下來之後，如果位置停在半路，
     就用 JS 輕輕滑到最近的定位點。瀏覽器自己已經對好的話這段什麼都不會做。 */
  function initSnapAssist() {
    if (window.__snapBound) return;
    window.__snapBound = true;

    var touching = false;
    var timer = null;

    function onHome() {
      return document.documentElement.classList.contains('snap-home') &&
             window.matchMedia('(max-width: 720px)').matches;
    }

    /** 可以停的位置：主視覺頂端、「地圖＋攤位」那一塊的頂端、頁面最底 */
    function stops() {
      var fit = document.getElementById('homeFit');
      if (!fit || !document.body.contains(fit)) return null;
      var barH = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 52;
      var hero = document.getElementById('hero');
      var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      var list = [];
      if (hero && !hero.hidden) list.push(Math.max(0, hero.offsetTop - barH));
      list.push(Math.min(max, Math.max(0, fit.offsetTop - barH)));
      list.push(max);
      return list;
    }

    function settle() {
      if (touching || !onHome()) return;
      if (document.body.style.position === 'fixed') return;   // 正開著彈出視窗
      var list = stops();
      if (!list || list.length < 2) return;

      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      var best = list[0];
      list.forEach(function (t) { if (Math.abs(t - y) < Math.abs(best - y)) best = t; });
      if (Math.abs(best - y) < 3) return;      // 瀏覽器自己已經對好了

      try { window.scrollTo({ top: best, behavior: 'smooth' }); }
      catch (e) { window.scrollTo(0, best); }
    }

    function bump() {
      clearTimeout(timer);
      timer = setTimeout(settle, 220);
    }

    window.addEventListener('touchstart', function () { touching = true; }, { passive: true });
    window.addEventListener('touchend', function () { touching = false; bump(); }, { passive: true });
    window.addEventListener('touchcancel', function () { touching = false; bump(); }, { passive: true });
    window.addEventListener('scroll', bump, { passive: true });
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

    API.track('home');          // 記一次「有人看了這個網站」

    /* .home-fit 是「地圖在上、攤位在下」的那一整塊。
       手機上它剛好等於一個畫面的高度，往下滑會自動停在這裡（見 style.css 的 scroll-snap）。 */
    app.innerHTML =
      '<section class="home-fit" id="homeFit">' +
        '<figure class="map-card" id="mapCard">' +
          '<div class="map-stage" id="mapStage">' +
            '<div class="map-pan">' +
              '<img src="' + esc(mapSrc) + '" alt="園遊會攤位地圖" id="mapImg" ' +
                'decoding="async" fetchpriority="high">' +
              '<div class="pin-layer" id="pinLayer"></div>' +
            '</div>' +
            MapView.controlsHTML(false, 'only-full', true) +
          '</div>' +
          '<figcaption class="map-cap">' +
            '<span class="map-cap-title">🗺️ 園遊會攤位地圖</span>' +
            '<span class="muted" id="mapHint">點攤位標記可以直接前往</span>' +
            MapView.controlsHTML(true, 'map-ctrl-bar') + '</figcaption>' +
        '</figure>' +
        '<div id="boothList">' + UI.loadingHTML('正在載入攤位…') + '</div>' +
        '<div class="rail-island" id="railIsland" hidden></div>' +
      '</section>';

    var mapImg = document.getElementById('mapImg');
    var mapStage = document.getElementById('mapStage');
    var homeFit = document.getElementById('homeFit');

    measureChrome();
    initSnapAssist();

    // 還沒放 map.png 的話就不要留一個破圖，也不用硬撐成一個畫面高
    mapImg.onerror = function () {
      document.getElementById('mapCard').hidden = true;
      homeFit.classList.add('no-map');
    };

    /* 地圖改成可以縮放、拖曳。預設視角會自動對準所有標記的涵蓋範圍，
       所以一打開就是攤位那一區，空白校區不會佔掉版面。 */
    var mapView = MapView.attach(mapStage, {});
    MapView.bindControls(mapStage, mapView);                            // 全螢幕時浮在地圖上那一組
    MapView.bindControls(document.getElementById('mapCard'), mapView);  // 平常在地圖下方那一列
    /* 只有倍率變了才需要重算標記撥開的位移（純平移時相對距離不變），
       不然每一個縮放的影格都要量三十幾個標記，手機會卡。 */
    var lastK = 0;
    mapView.on('change', function (s) {
      if (Math.abs(s.k - lastK) < 0.001) return;
      lastK = s.k;
      sizePins();
    });
    mapView.on('tap', function () { mapView.toggleFull(true); });   // 點空白處 → 全螢幕

    /* 標記大小跟著地圖框一起縮放。固定 26px 的標記在手機上等於放大了兩三倍，
       距離近的兩攤就會疊在一起（A1 蓋住 A5 就是這樣來的）。 */
    function sizePins() {
      var w = mapStage.clientWidth || 0;
      if (!w) return;
      var scale = Math.max(0.52, Math.min(1, w / 760));
      mapStage.style.setProperty('--pin-scale', scale.toFixed(3));
      if (renderHome.__layout) renderHome.__layout();
    }
    sizePins();

    /** 把有定位的攤位畫到地圖上。
     *  同一個位置可能有好幾攤（A1-1、A1-2），地圖上只畫一個標記、只寫 A1。 */
    function paintPins(list) {
      var layer = document.getElementById('pinLayer');
      var placed = groupForMap(list);

      if (renderHome.__mapView !== mapView) renderHome.__mapView = mapView;
      /* 預設視角對準所有標記的涵蓋範圍。
         只有範圍真的變了才重設視角，不然每兩分鐘的背景更新會把使用者
         放大／拖曳好的畫面彈回去。 */
      var pts = placed.map(function (g) { return { x: g.mapX, y: g.mapY }; });
      var sigB = JSON.stringify(pts);
      mapView.setBounds(pts);
      if (sigB !== paintPins.__bounds) { paintPins.__bounds = sigB; mapView.reset(); }

      if (!placed.length) {
        layer.innerHTML = '';
        document.getElementById('mapHint').textContent = '按 ⤢ 可以放大看';
        return;
      }

      // 手機上標題列放不下長句子，會折成兩行吃掉版面
      document.getElementById('mapHint').textContent =
        window.matchMedia('(max-width: 520px)').matches
          ? '點標記前往攤位' : '點標記前往攤位，兩指可縮放，⤢ 展開全螢幕';
      renderHome.__layout = layoutPins;
      layer.innerHTML = placed.map(function (g) {
        return '<a class="pin' + (g.allClosed ? ' is-closed' : '') + '" ' +
          'href="' + esc(g.href) + '" ' +
          'data-pin="' + esc(g.key) + '" ' +
          'style="left:' + g.mapX + '%;top:' + g.mapY + '%" ' +
          'title="' + esc(g.key + ' ' + g.label) + '">' +
          '<span class="pin-in">' +
            '<span class="pin-dot">' + esc(g.key) + '</span>' +
            '<span class="pin-name">' + esc(g.label) + '</span>' +
          '</span>' +
        '</a>';
      }).join('');

      layoutPins();
    }

    /**
     * 把攤位依「地圖群組」合併：B3-1 與 B3-2 算同一攤，標記上只寫 B3。
     *
     * 分組是看「編號」，不是看「有沒有定位」——
     * 只要 B3-2 存在，B3 就算兩攤，就算總召只幫 B3-1 定過位也一樣。
     * （之前是先把沒定位的攤位整個跳過，所以 B3 只數到一攤，
     *   點下去就直接進 B3-1 的單攤頁了。）
     * 標記的位置取這一組裡第一個有定位的攤位。
     */
    function groupForMap(list) {
      var order = [], map = {};

      list.forEach(function (b) {
        var key = UI.boothGroup(b.boothNo);
        if (!map[key]) {
          map[key] = {
            key: key, boothId: b.boothId,
            mapX: null, mapY: null,
            names: [], allClosed: true
          };
          order.push(key);
        }
        var g = map[key];
        g.names.push(b.name);
        if (!b.allClosed) g.allClosed = false;
        // 這一組的位置：用第一個定好位的
        if (g.mapX === null && typeof b.mapX === 'number' && typeof b.mapY === 'number') {
          g.mapX = b.mapX; g.mapY = b.mapY;
        }
      });

      return order.map(function (k) { return map[k]; })
        .filter(function (g) { return g.mapX !== null; })   // 整組都沒定位就不畫標記
        .map(function (g) {
          g.label = g.names.length > 1
            ? g.names[0] + '　等 ' + g.names.length + ' 攤'
            : g.names[0];
          // 這個位置不只一攤的話，點下去是「一次看完」的頁面
          g.href = g.names.length > 1
            ? '#/area/' + encodeURIComponent(g.key)
            : '#/booth/' + g.boothId;
          return g;
        });
    }

    /* 位置很接近的攤位（例如 A1 跟 A5 只差幾公尺），在手機的小地圖上
       會整個疊在一起。這裡把擠在一起的標記互相推開一點點，
       每個標記最多只偏離真實位置一個標記的距離，還是看得出大概在哪裡。 */
    /**
     * 標記永遠放在正確的位置，絕對不移動。
     *
     * （舊版會把太擠的標記互相「撥開」，桌機上地圖大、標記遠，撥不到所以看起來準；
     *  手機上地圖小、標記擠，每個都被推開十幾個像素 —— 這就是「手機上點位都會歪」
     *  的原因。現在改成位置不動，改用縮小標記來解決重疊。）
     *
     * 擠在一起的標記會縮成一個小圓點（不顯示編號），放大地圖或點到它時才展開成
     * 完整的編號標記。這樣位置永遠是真的，看起來也不會糊成一坨。
     */
    function layoutPins() {
      var pins = UI.$$('#pinLayer .pin');
      if (!pins.length) return;
      if (pins.length < 2) { pins[0].classList.remove('is-tight'); return; }

      // 先全部還原成完整樣式再量，才知道「如果都展開會不會撞在一起」
      pins.forEach(function (el) { el.classList.remove('is-tight'); });

      var P = pins.map(function (el) {
        var r = el.querySelector('.pin-dot').getBoundingClientRect();
        return { el: el, x: r.left + r.width / 2, y: r.top + r.height / 2,
                 r: Math.max(r.width, r.height) / 2 || 10 };
      });

      P.forEach(function (a, i) {
        var nearest = Infinity;
        P.forEach(function (b, j) {
          if (i === j) return;
          var dx = b.x - a.x, dy = b.y - a.y;
          var d = Math.sqrt(dx * dx + dy * dy) - b.r;
          if (d < nearest) nearest = d;
        });
        a.el.classList.toggle('is-tight', nearest < a.r * 1.05);
      });
    }

    /** highlight 某個攤位的標記（滑到那張卡、或滑鼠移過卡片時）。
     *  標記是用群組畫的，所以要比對群組名 —— 滑到 A1-2 也會亮 A1。 */
    function focusPin(boothNo) {
      var key = boothNo ? UI.boothGroup(boothNo) : null;
      UI.$$('#pinLayer .pin').forEach(function (p) {
        p.classList.toggle('is-active', !!key && p.dataset.pin === key);
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
                b.totalRemaining, b.slotCount, b.allClosed, b.mapX, b.mapY, b.price,
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
          card.addEventListener('mouseenter', function () { focusPin(list[i].boothNo); });
          card.addEventListener('mouseleave', function () { focusPin(null); });
        });
      }

      var rail = document.getElementById('boothRail');
      if (rail && keepScroll) rail.scrollLeft = keepScroll;
      initRail(rail, island, list);
      markClipped();
    }

    /** 簡介被截斷的那幾張卡才加淡出效果，剛好放得下的就不要加 */
    function markClipped() {
      UI.$$('.booth-desc').forEach(function (el) {
        el.classList.toggle('is-clipped', el.scrollHeight > el.clientHeight + 2);
      });
    }
    renderHome.__markClipped = markClipped;

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

        // 滑到哪一攤，地圖上就亮哪一攤；地圖有放大的話順便跟著移過去
        focusPin(cur.boothNo);
        if (mapView.isZoomed() && typeof cur.mapX === 'number') {
          mapView.focusOn(cur.mapX, cur.mapY);
        }
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
          if (renderHome.__markClipped) renderHome.__markClipped();
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

      var dur = UI.formatDuration(b.duration);

      /* 介紹攤位不用報名，所以不顯示名額也不顯示費用，改標示「自由參觀」。
         需要報名的攤位右邊那個標籤顯示費用（攤商還沒填的話就不顯示）。 */
      var tags = b.infoOnly
        ? '<span class="tag tag-brand">🎪 自由參觀</span>'
        : (b.allClosed
            ? '<span class="tag tag-danger">已截止報名</span>'
            : '<span class="tag tag-ok">尚餘 ' + b.totalRemaining + ' 個名額</span>') +
          UI.priceTag(b.price);

      return '<a class="booth-card' + (!b.infoOnly && b.allClosed ? ' is-closed' : '') +
             '" href="#/booth/' + esc(b.boothId) + '">' +
        '<div class="booth-thumb">' + thumb + badge + '</div>' +
        '<div class="booth-body">' +
          (b.boothNo ? '<span class="booth-no">攤位：' + esc(b.boothNo) + '</span>' : '') +
          '<h3><span>' + esc(b.name) + '</span></h3>' +
          '<p class="booth-desc">' + esc(b.description || '這個攤位還沒有填寫簡介') + '</p>' +
          '<div class="booth-foot">' + tags +
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

  /** 一個攤位的完整內容：照片、簡介、報名時段。單攤頁與同位置多攤頁共用 */
  function boothSection(b, opts) {
    opts = opts || {};
    var dur = UI.formatDuration(b.duration);
    var closedNotice = b.allClosed
      ? '<div class="notice notice-warn">這個攤位目前所有時段都已經停止報名了。</div>' : '';

    return '<section class="booth-sec">' +
      (opts.heading
        ? '<div class="booth-sec-head">' +
            (b.boothNo ? '<span class="booth-no">攤位：' + esc(b.boothNo) + '</span>' : '') +
            '<h2 class="booth-sec-name">' + esc(b.name) + '</h2>' +
            subLine(b, dur) +
          '</div>'
        : '') +
      UI.slideshowHTML(b.photos) +
      (b.description
        ? '<div class="card mt"><h2>攤位簡介</h2><p style="margin:0">' + UI.nl2br(b.description) + '</p></div>'
        : '') +
      /* 介紹攤位不用報名，整個報名區塊就不要出現 */
      (b.infoOnly
        ? '<div class="notice notice-info mt" style="margin-bottom:0">' +
            '🎪 這個攤位不用報名，活動當天直接來參觀就可以了。</div>'
        : '<div class="card mt">' +
            '<div class="card-title"><h2>選擇報名時段</h2>' +
              '<a class="small muted" href="#/mine">查詢／取消我的報名 →</a></div>' +
            closedNotice +
            '<div class="slot-list">' + ((b.slots || []).length
              ? b.slots.map(function (sl) { return slotRow(sl, b.boothId); }).join('')
              : '<p class="muted">攤商還沒有設定時段。</p>') +
            '</div>' +
          '</div>') +
    '</section>';
  }

  /** 攤位標題下方那一行：時數與費用。自由參觀的攤位不用報名，也就不講費用 */
  function subLine(b, dur) {
    var showPrice = !b.infoOnly && UI.hasPrice(b.price);
    if (!dur && !showPrice) return '';
    return '<p class="sub">' +
      (dur ? '⏱ 預計遊玩時數 ' + esc(dur) : '') +
      (dur && showPrice ? '　‧　' : '') +
      (showPrice ? '💰 費用 ' + esc(UI.priceText(b.price)) : '') +
    '</p>';
  }

  function slotRow(s, boothId) {
    var pct = s.capacity ? Math.min(100, Math.round(s.taken / s.capacity * 100)) : 100;
    var cls = s.closed ? 'stopped' : (s.remaining <= 0 ? 'full' : '');

    var right;
    if (s.closed) right = '<span class="tag tag-muted">已停止報名</span>';
    else if (s.remaining <= 0) right = '<span class="tag tag-danger">名額已滿</span>';
    else right = '<button class="btn" data-signup="' + esc(s.id) + '" ' +
                 'data-booth="' + esc(boothId) + '">我要報名</button>';

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

  /** 把「我要報名」按鈕接上（可能同時有好幾個攤位） */
  function bindSignups(root, list, reload) {
    UI.$$('[data-signup]', root).forEach(function (btn) {
      btn.onclick = function () {
        var b = list.filter(function (x) { return String(x.boothId) === btn.dataset.booth; })[0];
        if (!b) return;
        var slot = (b.slots || []).filter(function (sl) { return String(sl.id) === btn.dataset.signup; })[0];
        if (slot) openSignupModal(b, slot, reload);
      };
    });
  }

  /** 從首頁快取裡找出「同一個位置」的其他攤位（A1-1 的鄰居是 A1-2…） */
  function siblingsOf(boothNo, boothId) {
    var all = UI.cacheGet('booths', 30 * 60 * 1000) || [];
    var key = UI.boothGroup(boothNo);
    return all.filter(function (b) {
      return UI.boothGroup(b.boothNo) === key && String(b.boothId) !== String(boothId);
    });
  }

  function renderBooth(app, boothId) {
    var painted = false;
    API.track('booth', boothId);   // 記一次「有人看了這一攤」
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
      var dur = UI.formatDuration(b.duration);
      var sibs = siblingsOf(b.boothNo, b.boothId);

      app.innerHTML =
        '<div class="page-head">' +
          '<a class="back" href="#/">← 回到攤位列表</a>' +
          (b.boothNo ? '<div><span class="booth-no">攤位：' + esc(b.boothNo) + '</span></div>' : '') +
          '<h1>' + esc(b.name) + '</h1>' +
          subLine(b, dur) +
        '</div>' +
        /* 同一個位置還有別攤的話，給一個一次看完的入口 */
        (sibs.length
          ? '<a class="notice notice-info same-spot" href="#/area/' +
              encodeURIComponent(UI.boothGroup(b.boothNo)) + '">' +
              '📍 同一個位置還有 ' + sibs.length + ' 攤（' +
              sibs.map(function (x) { return esc(x.boothNo); }).join('、') + '）' +
              '<span class="go">一起看 →</span></a>'
          : '') +
        boothSection(b, { heading: false });

      UI.initSlideshows(app);
      painted = true;
      bindSignups(app, [b], load);

      /* 直接貼網址進來、沒有首頁清單的快取時，背景補抓一次，
         才不會漏掉「同一個位置還有別攤」的提示 */
      if (!sibs.length && !UI.cacheGet('booths', 30 * 60 * 1000) && !paint.__fetched) {
        paint.__fetched = true;
        API.listBooths().then(function (res) {
          UI.cacheSet('booths', res.booths || []);
          if (location.hash.indexOf('#/booth/' + boothId) === 0) paint(b);
        }).catch(function () {});
      }
    }

    load(painted);
  }

  /* ========== 同一個位置的所有攤位（地圖上的 A1 = A1-1 + A1-2…） ========== */

  function renderArea(app, key) {
    var backLink = '<a class="back" href="#/">← 回到攤位列表</a>';
    app.innerHTML = UI.loadingHTML('載入攤位資訊…');

    var detail = [];     // 每個攤位的完整資料
    var painted = false;

    /** 從首頁清單挑出這個位置的攤位，依編號排序 */
    function pick(list) {
      return (list || [])
        .filter(function (b) { return UI.boothGroup(b.boothNo) === key; })
        .sort(function (a, b) { return UI.compareBoothNo(a.boothNo, b.boothNo); });
    }

    function paint() {
      if (!detail.length) return;
      UI.stopSlideshows();

      app.innerHTML =
        '<div class="page-head">' +
          backLink +
          '<h1>攤位 ' + esc(key) + '</h1>' +
          '<p class="sub">這個位置有 ' + detail.length + ' 攤，往下滑可以一次看完，各自報名。</p>' +
        '</div>' +
        detail.map(function (b) { return boothSection(b, { heading: true }); }).join('');

      UI.initSlideshows(app);
      painted = true;
      bindSignups(app, detail, function () { loadDetail(pick(listCache), true); });
    }

    var listCache = UI.cacheGet('booths', 30 * 60 * 1000) || [];

    /** 幾個攤位的資料同時發出去，不是一個一個等 */
    function loadDetail(rows, background) {
      if (!rows.length) {
        app.innerHTML = backLink + UI.errorHTML('找不到「' + key + '」這個位置的攤位');
        return Promise.resolve();
      }
      if (rows.length === 1) {       // 只有一攤就直接用原本的單攤頁
        location.replace('#/booth/' + rows[0].boothId);
        return Promise.resolve();
      }
      return Promise.all(rows.map(function (b) {
        return API.getBooth(b.boothId).then(function (res) {
          UI.cacheSet('booth_' + b.boothId, res.booth);
          return res.booth;
        });
      })).then(function (list) {
        detail = list;
        list.forEach(function (b) { API.track('booth', b.boothId); });
        paint();
      }).catch(function (e) {
        if (background) return;
        app.innerHTML = backLink + UI.errorHTML(e.message);
      });
    }

    // 快取裡都有的話先畫出來，再去後端更新名額
    var rows = pick(listCache);
    if (rows.length > 1) {
      var cached = rows.map(function (b) { return UI.cacheGet('booth_' + b.boothId, 5 * 60 * 1000); });
      if (cached.every(Boolean)) { detail = cached; paint(); }
    }

    if (listCache.length) {
      loadDetail(rows, painted);
    } else {
      // 沒有首頁快取（直接貼網址進來）就先抓清單
      API.listBooths().then(function (res) {
        listCache = res.booths || [];
        UI.cacheSet('booths', listCache);
        loadDetail(pick(listCache), painted);
      }).catch(function (e) {
        app.innerHTML = backLink + UI.errorHTML(e.message);
      });
    }
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

  return { renderHome: renderHome, renderBooth: renderBooth, renderArea: renderArea, renderMine: renderMine };
})();
