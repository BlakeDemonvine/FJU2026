/* =====================================================================
 * mapview.js — 可縮放、可拖曳的地圖
 *
 * 園遊會的地圖很大（1500px 寬），A1~A18 那一排攤位的方框在手機上
 * 縮到整張寬度時只剩七、八個像素：總召點不準，玩家也看不清楚。
 * 這個元件做三件事：
 *   ① 預設就把視角對準「所有標記的涵蓋範圍」，空白校區不佔版面
 *   ② 兩指縮放、拖曳移動，桌機可以用滾輪與 +／− 按鈕
 *   ③ 全螢幕模式
 *
 * 座標系統：標記用百分比定位在 .map-pan 上，而 .map-pan 的大小
 * 就是圖片的原始尺寸，所以不管怎麼縮放，標記永遠貼在正確的位置。
 * 標記本身會反向縮放，看起來大小固定。
 * ===================================================================== */

window.MapView = (function () {

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /**
   * stage 裡面要長這樣：
   *   <div class="map-stage">
   *     <div class="map-pan"><img><div class="pin-layer"></div></div>
   *   </div>
   */
  function attach(stage, opts) {
    opts = opts || {};
    var pan = stage.querySelector('.map-pan');
    var img = stage.querySelector('img');

    var st = {
      k: 1, tx: 0, ty: 0,         // 螢幕座標 = 圖片座標 * k + t
      kMin: 1, kMax: 4, kDef: 1,
      natW: 0, natH: 0,
      ready: false
    };

    var listeners = { change: [], tap: [] };
    function emit(name, arg) {
      listeners[name].forEach(function (fn) { fn(arg); });
    }

    /* ---------- 基本量測 ---------- */

    function size() {
      return { w: stage.clientWidth || 1, h: stage.clientHeight || 1 };
    }

    function measure() {
      st.natW = img.naturalWidth || 0;
      st.natH = img.naturalHeight || 0;
      if (!st.natW || !st.natH) return false;
      pan.style.width = st.natW + 'px';
      pan.style.height = st.natH + 'px';
      var s = size();
      st.kMin = Math.min(s.w / st.natW, s.h / st.natH);   // 整張圖剛好看得到
      // 最多放大到一個圖片像素佔 2.5 個畫面像素
      st.kMax = Math.max(st.kMin * 8, 2.5);
      st.ready = true;
      return true;
    }

    /* ---------- 把視角對準一組點（標記的涵蓋範圍） ---------- */

    var bounds = null;   // { x1, y1, x2, y2 } 百分比

    function setBounds(points) {
      if (!points || points.length === 0) { bounds = null; return; }
      var x1 = 100, y1 = 100, x2 = 0, y2 = 0;
      points.forEach(function (p) {
        x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x);
        y1 = Math.min(y1, p.y); y2 = Math.max(y2, p.y);
      });
      bounds = { x1: x1, y1: y1, x2: x2, y2: y2 };
    }

    /** 預設視角的長寬比，給 CSS 決定 stage 要多高 */
    function viewRatio() {
      if (!st.natW) return 1.6;
      if (!bounds) return st.natW / st.natH;
      var w = Math.max(8, bounds.x2 - bounds.x1) / 100 * st.natW;
      var h = Math.max(8, bounds.y2 - bounds.y1) / 100 * st.natH;
      // 加一點邊距，再限制成不要太細長
      return clamp((w + st.natW * 0.1) / (h + st.natH * 0.14), 1.05, 2.1);
    }

    /** 算出預設的 k / t（對準標記範圍），沒有標記就顯示整張 */
    function defaultView() {
      var s = size();
      if (!bounds) {
        return { k: st.kMin, tx: (s.w - st.natW * st.kMin) / 2, ty: (s.h - st.natH * st.kMin) / 2 };
      }
      var padX = st.natW * 0.05, padY = st.natH * 0.07;
      var x1 = bounds.x1 / 100 * st.natW - padX;
      var x2 = bounds.x2 / 100 * st.natW + padX;
      var y1 = bounds.y1 / 100 * st.natH - padY;
      var y2 = bounds.y2 / 100 * st.natH + padY;
      var bw = Math.max(1, x2 - x1), bh = Math.max(1, y2 - y1);
      // 一律「把所有標記完整放進畫面」—— 一打開就能看到全部攤位，要細節再自己放大
      var k = clamp(Math.min(s.w / bw, s.h / bh), st.kMin, st.kMax);
      var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      return { k: k, tx: s.w / 2 - cx * k, ty: s.h / 2 - cy * k };
    }

    /* ---------- 套用 ---------- */

    function clampT() {
      var s = size();
      var w = st.natW * st.k, h = st.natH * st.k;
      st.tx = w <= s.w ? (s.w - w) / 2 : clamp(st.tx, s.w - w, 0);
      st.ty = h <= s.h ? (s.h - h) / 2 : clamp(st.ty, s.h - h, 0);
    }

    function apply() {
      clampT();
      pan.style.transform = 'translate(' + st.tx + 'px,' + st.ty + 'px) scale(' + st.k + ')';
      // 標記反向縮放，螢幕上看起來大小固定
      stage.style.setProperty('--pz', (1 / st.k).toFixed(5));

      /* 還在預設視角時，單指要留給頁面捲動（不然手機上滑到地圖就卡住）；
         使用者自己放大之後才接管單指拖曳。 */
      var zoomed = st.k > st.kDef * 1.02;
      stage.classList.toggle('is-zoomed', zoomed);
      stage.dataset.zoom = st.k.toFixed(2);
      emit('change', st);
    }

    function reset() {
      if (!st.ready && !measure()) return;
      var v = defaultView();
      st.kDef = v.k;
      st.k = v.k; st.tx = v.tx; st.ty = v.ty;
      stage.style.setProperty('--map-ar', viewRatio().toFixed(4));
      apply();
    }

    /* ---------- 縮放 ---------- */

    /** 以 stage 內的某一點為中心縮放 */
    function zoomAt(factor, cx, cy) {
      if (!st.ready) return;
      var k2 = clamp(st.k * factor, Math.min(st.kMin, st.kDef), st.kMax);
      if (k2 === st.k) return;
      // 讓 (cx,cy) 這個點在縮放前後對應到同一個圖片位置
      st.tx = cx - (cx - st.tx) * (k2 / st.k);
      st.ty = cy - (cy - st.ty) * (k2 / st.k);
      st.k = k2;
      apply();
    }

    function zoomBy(factor) {
      var s = size();
      zoomAt(factor, s.w / 2, s.h / 2);
    }

    /** 把圖片上的某個百分比位置移到畫面中央（滑到某一攤時用） */
    function focusOn(xPct, yPct, minK) {
      if (!st.ready) return;
      var s = size();
      if (minK && st.k < minK) st.k = clamp(minK, st.kMin, st.kMax);
      st.tx = s.w / 2 - (xPct / 100 * st.natW) * st.k;
      st.ty = s.h / 2 - (yPct / 100 * st.natH) * st.k;
      apply();
    }

    /** 螢幕座標 → 圖片上的百分比（總召點地圖定位時用） */
    function toPercent(clientX, clientY) {
      var r = stage.getBoundingClientRect();
      var x = (clientX - r.left - st.tx) / st.k / st.natW * 100;
      var y = (clientY - r.top - st.ty) / st.k / st.natH * 100;
      return {
        x: clamp(Math.round(x * 10) / 10, 0, 100),
        y: clamp(Math.round(y * 10) / 10, 0, 100)
      };
    }

    /* ---------- 手勢 ---------- */

    var drag = null;
    var pinch = null;

    function localPoint(ev) {
      var r = stage.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }

    stage.addEventListener('pointerdown', function (ev) {
      if (pinch) return;
      if (ev.target.closest('.map-ctrl')) return;
      if (ev.target.closest('.pin')) return;   // 標記自己處理（連結、拖曳）

      /* 還在預設視角、而且是手指的時候不要接管拖曳 —— 單指要留給頁面捲動。
         但還是要記錄下來，不然「點一下」這個動作會收不到（總召定位要用）。 */
      var noPan = ev.pointerType === 'touch' && !stage.classList.contains('is-zoomed');
      drag = {
        id: ev.pointerId,
        sx: ev.clientX, sy: ev.clientY,
        tx: st.tx, ty: st.ty,
        moved: false, noPan: noPan
      };
      if (!noPan) { try { stage.setPointerCapture(ev.pointerId); } catch (e) {} }
    });

    stage.addEventListener('pointermove', function (ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      var dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      drag.moved = true;            // 動過了就不算「點一下」
      if (drag.noPan) return;
      stage.classList.add('is-dragging');
      st.tx = drag.tx + dx; st.ty = drag.ty + dy;
      apply();
    });

    function endDrag(ev) {
      if (!drag || (ev && ev.pointerId !== drag.id)) return;
      var moved = drag.moved;
      drag = null;
      stage.classList.remove('is-dragging');
      if (!moved && ev && !ev.target.closest('.pin') && !ev.target.closest('.map-ctrl')) {
        emit('tap', { ev: ev, pt: localPoint(ev) });
      }
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', function () { drag = null; stage.classList.remove('is-dragging'); });

    /* 兩指縮放 */
    function touchDist(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function touchMid(t) {
      var r = stage.getBoundingClientRect();
      return {
        x: (t[0].clientX + t[1].clientX) / 2 - r.left,
        y: (t[0].clientY + t[1].clientY) / 2 - r.top
      };
    }

    stage.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 2) return;
      drag = null;
      var t = [ev.touches[0], ev.touches[1]];
      pinch = { d: touchDist(t), mid: touchMid(t) };
    }, { passive: true });

    stage.addEventListener('touchmove', function (ev) {
      if (!pinch || ev.touches.length !== 2) return;
      if (ev.cancelable) ev.preventDefault();
      var t = [ev.touches[0], ev.touches[1]];
      var d = touchDist(t);
      if (pinch.d > 0) {
        var mid = touchMid(t);
        // 一邊縮放一邊跟著手指移動
        st.tx += mid.x - pinch.mid.x;
        st.ty += mid.y - pinch.mid.y;
        zoomAt(d / pinch.d, mid.x, mid.y);
        pinch.mid = mid;
      }
      pinch.d = d;
    }, { passive: false });

    function endPinch(ev) {
      if (pinch && ev.touches.length < 2) pinch = null;
    }
    stage.addEventListener('touchend', endPinch);
    stage.addEventListener('touchcancel', endPinch);

    /* 滾輪：已經放大之後才接管，不然桌機上滑過地圖會卡住頁面捲動 */
    stage.addEventListener('wheel', function (ev) {
      if (!st.ready) return;
      if (!ev.ctrlKey && !stage.classList.contains('is-zoomed')) return;
      ev.preventDefault();
      var p = localPoint(ev);
      zoomAt(ev.deltaY < 0 ? 1.18 : 1 / 1.18, p.x, p.y);
    }, { passive: false });

    /* 連點兩下放大 / 還原 */
    stage.addEventListener('dblclick', function (ev) {
      if (ev.target.closest('.map-ctrl') || ev.target.closest('.pin')) return;
      ev.preventDefault();
      var p = localPoint(ev);
      if (st.k > st.kDef * 1.5) reset();
      else zoomAt(2, p.x, p.y);
    });

    /* ---------- 全螢幕 ---------- */

    var full = null;
    function toggleFull(on) {
      if (on === undefined) on = !full;
      if (on && !full) {
        full = {
          parent: stage.parentNode,
          next: stage.nextSibling,
          box: document.createElement('div')
        };
        full.box.className = 'map-full';
        document.body.appendChild(full.box);
        full.box.appendChild(stage);
        stage.classList.add('is-full');
        if (UI && UI.lockScroll) UI.lockScroll(true);
        requestAnimationFrame(function () { reset(); showRotateHint(); });
      } else if (!on && full) {
        stage.classList.remove('is-full');
        full.parent.insertBefore(stage, full.next);
        full.box.remove();
        if (UI && UI.lockScroll) UI.lockScroll(false);
        full = null;
        requestAnimationFrame(function () { reset(); });
      }
      emit('change', st);
    }

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && full) toggleFull(false);
    });

    /* 直式手機看寬扁的地圖，上下一定會空一片 —— 轉成橫的就大很多，提醒一下。
       碰到畫面或四秒後自己消失。 */
    function showRotateHint() {
      if (!full) return;
      var s = size();
      if (s.h / s.w < 1.3) return;
      if (full.box.querySelector('.map-rotate')) return;
      var tip = document.createElement('div');
      tip.className = 'map-rotate';
      tip.textContent = '把手機轉橫的，地圖會更大';
      full.box.appendChild(tip);
      var kill = function () {
        tip.classList.add('is-gone');
        setTimeout(function () { tip.remove(); }, 400);
        stage.removeEventListener('pointerdown', kill);
      };
      stage.addEventListener('pointerdown', kill);
      setTimeout(kill, 4000);
    }

    /* ---------- 啟動 ---------- */

    if (img.complete && img.naturalWidth) { measure(); reset(); }
    img.addEventListener('load', function () { measure(); reset(); });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        if (!st.ready) return;
        /* 使用者還沒自己縮放過的話，容器變大變小（進全螢幕、轉向）就重新對準；
           已經自己縮放過就只重新夾一次位置，不要把他的視角搶走。 */
        var untouched = Math.abs(st.k - st.kDef) < 0.002;
        if (untouched) { reset(); return; }
        st.kDef = defaultView().k;
        apply();
      });
      ro.observe(stage);
    }

    return {
      state: st,
      reset: reset,
      measure: measure,
      setBounds: function (pts) { setBounds(pts); },
      zoomBy: zoomBy,
      zoomAt: zoomAt,
      focusOn: focusOn,
      toPercent: toPercent,
      toggleFull: toggleFull,
      isFull: function () { return !!full; },
      on: function (name, fn) { if (listeners[name]) listeners[name].push(fn); },
      isZoomed: function () { return stage.classList.contains('is-zoomed'); }
    };
  }

  /** 產生地圖的控制按鈕 */
  function controlsHTML(withFull, extraClass, withClose) {
    return '<div class="map-ctrl' + (extraClass ? ' ' + extraClass : '') + '">' +
      (withClose ? '<button type="button" class="map-close" data-map="close" ' +
                   'aria-label="關閉全螢幕" title="關閉">✕</button>' : '') +
      (withFull ? '<button type="button" data-map="full" aria-label="全螢幕地圖" title="全螢幕">⤢</button>' : '') +
      '<button type="button" data-map="in" aria-label="放大" title="放大">＋</button>' +
      '<button type="button" data-map="out" aria-label="縮小" title="縮小">−</button>' +
      '<button type="button" data-map="reset" aria-label="回到預設視角" title="回到預設視角">⟲</button>' +
    '</div>';
  }

  /** 把控制按鈕接上 */
  /** 用事件委派，所以同一組按鈕可以散在不同地方（地圖上、地圖下方那一列） */
  function bindControls(root, view) {
    if (!root) return;
    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-map]');
      if (!btn || !root.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();   // 地圖上那組不要再冒泡到外層那組
      var a = btn.dataset.map;
      if (a === 'in') view.zoomBy(1.6);
      else if (a === 'out') view.zoomBy(1 / 1.6);
      else if (a === 'reset') view.reset();
      else if (a === 'full') view.toggleFull();
      else if (a === 'close') view.toggleFull(false);
    });
  }

  return { attach: attach, controlsHTML: controlsHTML, bindControls: bindControls };
})();
