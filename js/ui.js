/* =====================================================================
 * ui.js — 共用的小工具與 UI 元件
 * ===================================================================== */

window.UI = (function () {

  /* ---------- 文字 / DOM ---------- */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function loadingHTML(text) {
    return '<div class="loading"><span class="spinner"></span><span>' + esc(text || '載入中…') + '</span></div>';
  }

  function emptyHTML(emoji, title, sub) {
    return '<div class="empty"><span class="emoji">' + esc(emoji) + '</span>' +
      '<div><strong>' + esc(title) + '</strong></div>' +
      (sub ? '<div class="small">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function errorHTML(msg) {
    return '<div class="notice notice-danger">⚠️ ' + esc(msg) + '</div>';
  }

  /* ---------- Toast ---------- */

  function toast(msg, kind) {
    var host = document.getElementById('toastHost');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, kind === 'err' ? 4200 : 2600);
  }

  var ok  = function (m) { toast(m, 'ok'); };
  var err = function (m) { toast(typeof m === 'string' ? m : (m && m.message) || '發生錯誤', 'err'); };

  /* ---------- 裝置判斷 ---------- */

  /** 觸控裝置（手機、平板）：很多互動要用不同做法 */
  var isTouch = (function () {
    try { return window.matchMedia('(hover: none)').matches; }
    catch (e) { return 'ontouchstart' in window; }
  })();

  /* ---------- Modal ---------- */

  /* 開著視窗時把背景鎖住。手機上如果不鎖，手指在視窗上滑會變成在滑背景，
     而且 iOS 關掉視窗後還會停在奇怪的位置。 */
  var lockedTop = 0;
  var lockCount = 0;

  function lockScroll(on) {
    var b = document.body;
    if (on) {
      if (lockCount++ > 0) return;
      lockedTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      b.style.position = 'fixed';
      b.style.top = (-lockedTop) + 'px';
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
    } else {
      if (--lockCount > 0) return;
      lockCount = 0;
      b.style.position = '';
      b.style.top = '';
      b.style.left = '';
      b.style.right = '';
      b.style.width = '';
      window.scrollTo(0, lockedTop);
    }
  }

  function modal(html, onMount) {
    var host = document.getElementById('modalHost');
    host.innerHTML = '<div class="modal">' + html + '</div>';
    host.hidden = false;
    lockScroll(true);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      host.hidden = true;
      host.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      lockScroll(false);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    host.onclick = function (e) { if (e.target === host) close(); };
    document.addEventListener('keydown', onKey);

    if (onMount) onMount(host.firstElementChild, close);
    return close;
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      modal(
        '<h3>' + esc(opts.title) + '</h3>' +
        '<p class="muted">' + nl2br(opts.message || '') + '</p>' +
        '<div class="btn-row">' +
        '<button class="btn btn-ghost" data-no>取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : '') + '" data-yes>' + esc(opts.confirmText || '確定') + '</button>' +
        '</div>',
        function (root, close) {
          root.querySelector('[data-no]').onclick = function () { close(); resolve(false); };
          root.querySelector('[data-yes]').onclick = function () { close(); resolve(true); };
        }
      );
    });
  }

  /* ---------- 照片網址 ----------
   * 攤位照片放在 Google Drive。Drive 可以直接幫我們縮圖，所以不要每次都載入
   * 原尺寸（1600px）——手機上那是最大的拖慢來源。
   * 這裡依照實際顯示大小去要對應寬度的圖，流量常常省掉八成以上。
   */

  function photoFileId(p) {
    if (!p) return '';
    if (p.fileId) return String(p.fileId);
    var s = String(p.url || '') + ' ' + String(p.altUrl || '');
    var m = s.match(/[?&]id=([\w-]{16,})/) || s.match(/\/d\/([\w-]{16,})/);
    return m ? m[1] : '';
  }

  /** 主要來源：Drive 縮圖服務 */
  function photoSrc(p, w) {
    var id = photoFileId(p);
    if (!id) return (p && p.url) || '';
    return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + w;
  }

  /** 備援來源：googleusercontent（主要來源偶爾會擋） */
  function photoAltSrc(p, w) {
    var id = photoFileId(p);
    if (!id) return (p && p.altUrl) || '';
    return 'https://lh3.googleusercontent.com/d/' + id + '=w' + w;
  }

  function srcsetFor(p, widths) {
    return widths.map(function (w) { return photoSrc(p, w) + ' ' + w + 'w'; }).join(', ');
  }

  /**
   * 產生一個會自己挑尺寸、載入失敗會換備援網址的 <img>。
   * opts = { widths, sizes, cls, alt, lazy, defer }
   *   defer: true 代表先不要載，等 hydrateImg() 被呼叫才載（幻燈片第二張以後用）
   */
  function imgTag(p, opts) {
    opts = opts || {};
    var widths = opts.widths || [480, 720];
    var biggest = widths[widths.length - 1];
    var attrs =
      ' alt="' + esc(opts.alt || '') + '"' +
      ' class="' + esc(opts.cls || '') + '"' +
      ' draggable="false" decoding="async"' +
      ' data-fallback="' + esc(photoAltSrc(p, biggest)) + '"' +
      (opts.lazy ? ' loading="lazy"' : '') +
      (opts.ariaHidden ? ' aria-hidden="true"' : '');

    if (opts.defer) {
      return '<img' + attrs +
        ' data-src="' + esc(photoSrc(p, biggest)) + '"' +
        ' data-srcset="' + esc(srcsetFor(p, widths)) + '"' +
        ' sizes="' + esc(opts.sizes || '100vw') + '">';
    }
    return '<img' + attrs +
      ' src="' + esc(photoSrc(p, biggest)) + '"' +
      ' srcset="' + esc(srcsetFor(p, widths)) + '"' +
      ' sizes="' + esc(opts.sizes || '100vw') + '">';
  }

  /** 把延後載入的圖片真的開始載 */
  function hydrateImg(im) {
    if (!im || !im.dataset.src) return;
    im.srcset = im.dataset.srcset || '';
    im.src = im.dataset.src;
    im.removeAttribute('data-src');
    im.removeAttribute('data-srcset');
  }

  /** 主要網址載不到時自動換備援網址，再失敗就交給 onGiveUp */
  function bindImgFallback(im, onGiveUp) {
    im.addEventListener('error', function () {
      var fb = im.dataset.fallback;
      if (fb && im.getAttribute('src') !== fb) {
        im.removeAttribute('srcset');
        im.removeAttribute('sizes');
        im.src = fb;
        im.dataset.fallback = '';
        return;
      }
      if (onGiveUp) onGiveUp(im);
    });
  }

  /* ---------- 幻燈片 ----------
   * 可以用手指左右滑（滑的時候照片會跟著手指走），放開手就吸附到最近的一張；
   * 不去碰它的話就自己輪播。照片本身不可點擊。
   * 攤位照片與首頁的主視覺用同一套。
   */

  var SLIDE_W = [640, 1000];
  var SLIDE_SIZES = '(max-width: 720px) 94vw, 1000px';

  function dotsHTML(n) {
    if (n < 2) return '';
    var out = '';
    for (var i = 0; i < n; i++) {
      out += '<button type="button" class="' + (i === 0 ? 'active' : '') +
             '" data-go="' + i + '" aria-label="第 ' + (i + 1) + ' 張"></button>';
    }
    return '<div class="slide-dots">' + out + '</div>';
  }

  function shell(inner, n, extra) {
    return '<div class="slideshow' + (extra ? ' ' + extra : '') + '" data-slideshow>' +
      '<div class="slide-view"><div class="slide-track">' + inner + '</div></div>' +
      dotsHTML(n) +
    '</div>';
  }

  /** 攤位的展示照片（來源是 Google Drive） */
  function slideshowHTML(photos) {
    if (!photos || !photos.length) {
      return '<div class="slideshow"><div class="slide-view empty">' +
             '<span style="font-size:2.8rem;opacity:.3">🎈</span></div></div>';
    }
    var imgs = photos.map(function (p, i) {
      // 底層那張只是拿來模糊當背景，用 64px 的小圖就夠了（省流量也省 GPU）
      var bg = '<img class="slide-bg" src="' + esc(photoSrc(p, 64)) + '" alt="" aria-hidden="true" ' +
               'draggable="false" decoding="async" data-fallback="">';
      var main = imgTag(p, {
        cls: 'slide-img', alt: '展示照片 ' + (i + 1),
        widths: SLIDE_W, sizes: SLIDE_SIZES, defer: i > 0
      });
      return '<div class="slide">' + bg + main + '</div>';
    }).join('');
    return shell(imgs, photos.length);
  }

  /** 首頁的主視覺。高度會跟著目前這一張的比例走，兩張圖長寬不同也不會被切到 */
  function bannerHTML(srcs, alt) {
    var list = (srcs || []).filter(Boolean);
    if (!list.length) return '';
    var imgs = list.map(function (src, i) {
      return '<div class="slide">' +
        '<img class="slide-bg" src="' + esc(src) + '" alt="" aria-hidden="true" draggable="false">' +
        '<img class="slide-img" src="' + esc(src) + '" draggable="false" decoding="async"' +
          (i === 0 ? '' : ' loading="lazy"') +
          ' alt="' + esc((alt || '主視覺') + ' ' + (i + 1)) + '">' +
      '</div>';
    }).join('');
    return shell(imgs, list.length, 'is-banner');
  }

  var slideTimers = [];

  function stopSlideshows() {
    slideTimers.forEach(clearInterval);
    slideTimers = [];
  }

  function initSlideshows(root) {
    $$('[data-slideshow]', root || document).forEach(function (box) {
      if (box.__init) return;
      box.__init = true;

      var view = $('.slide-view', box);
      var track = $('.slide-track', box);
      var slides = $$('.slide', box);
      var dots = $$('.slide-dots button', box);
      var n = slides.length;
      var idx = 0;

      $$('.slide-img', box).forEach(function (im) { bindImgFallback(im); });

      function hydrate(i) {
        var s = slides[((i % n) + n) % n];
        if (s) hydrateImg(s.querySelector('.slide-img'));
      }

      function apply(animate) {
        track.style.transition = animate ? 'transform .42s cubic-bezier(.4,0,.2,1)' : 'none';
        track.style.transform = 'translate3d(' + (-idx * 100) + '%,0,0)';
        dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
      }

      function goTo(i, animate) {
        idx = ((i % n) + n) % n;
        hydrate(idx); hydrate(idx + 1); hydrate(idx - 1);
        apply(animate !== false);
      }

      apply(false);
      if (n < 2) return;
      hydrate(1);

      dots.forEach(function (d) {
        d.onclick = function () { pause(); goTo(+d.dataset.go); };
      });

      /* ---- 手指滑動 ---- */
      var drag = null;
      var paused = 0;
      function pause() { paused = Date.now(); }

      box.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('.slide-dots')) return;
        drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, dx: 0, lock: '' };
      });

      box.addEventListener('pointermove', function (ev) {
        if (!drag || ev.pointerId !== drag.id) return;
        var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        if (!drag.lock) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          // 一開始就往上下滑的話就讓頁面捲動，不要搶
          drag.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (drag.lock === 'x') { try { box.setPointerCapture(ev.pointerId); } catch (e) {} }
        }
        if (drag.lock !== 'x') return;
        if (ev.cancelable) ev.preventDefault();
        drag.dx = dx;
        hydrate(idx + (dx < 0 ? 1 : -1));
        var w = view.clientWidth || 1;
        var move = dx / w * 100;
        // 到頭或到尾的時候拉動的幅度減半，有「拉不動」的手感
        if ((idx === 0 && dx > 0) || (idx === n - 1 && dx < 0)) move *= 0.35;
        track.style.transition = 'none';
        track.style.transform = 'translate3d(' + (-idx * 100 + move) + '%,0,0)';
      });

      function endDrag(ev) {
        if (!drag || (ev && ev.pointerId !== drag.id)) return;
        var dx = drag.dx, moved = drag.lock === 'x';
        drag = null;
        if (!moved) return;
        pause();
        var w = view.clientWidth || 1;
        if (Math.abs(dx) > Math.min(70, w * 0.18)) goTo(idx + (dx < 0 ? 1 : -1));
        else apply(true);
      }
      box.addEventListener('pointerup', endDrag);
      box.addEventListener('pointercancel', function () { drag = null; apply(true); });

      /* ---- 自動輪播 ---- */
      var ms = (window.APP_CONFIG && window.APP_CONFIG.SLIDESHOW_MS) || 3500;
      slideTimers.push(setInterval(function () {
        if (!document.body.contains(box)) return;
        if (document.hidden || drag) return;            // 分頁在背景、或正在滑 → 暫停
        if (Date.now() - paused < ms * 2) return;       // 剛滑過就先讓他看一下
        goTo(idx + 1);
      }, ms));
    });
  }

  /* ---------- 短期快取 ----------
   * 攤位清單存在分頁快取裡，回上一頁或重新整理時可以「先畫出來再去更新」，
   * 手機上不用每次都對著轉圈圈等後端。
   */

  function cacheGet(key, maxAgeMs) {
    try {
      var raw = sessionStorage.getItem('fjuc_' + key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.t !== 'number') return null;
      if (maxAgeMs && Date.now() - o.t > maxAgeMs) return null;
      return o.v;
    } catch (e) { return null; }
  }

  function cacheSet(key, value) {
    try {
      sessionStorage.setItem('fjuc_' + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) { /* 空間不足或無痕模式：放棄快取就好 */ }
  }

  /* ---------- 本機儲存 ---------- */

  function store(key, value) {
    try {
      if (value === undefined) {
        var raw = localStorage.getItem('fju_' + key);
        return raw ? JSON.parse(raw) : null;
      }
      if (value === null) localStorage.removeItem('fju_' + key);
      else localStorage.setItem('fju_' + key, JSON.stringify(value));
    } catch (e) { /* 無痕模式等情況：忽略 */ }
    return null;
  }

  /* ---------- 成長小圖示 ----------
   * 左上角的圖示會隨著玩家報名的時段數一路長大：
   * 0 個 🌱 → 1 個 🌿 → 2 個 🪻 → 3 個 🌷 → 4 個以上 🌸
   */

  var GROWTH = ['🌱', '🌿', '🪻', '🌷', '🌸'];

  function growthCount() {
    return Math.max(0, parseInt(store('growth'), 10) || 0);
  }

  /** 直接設定為確切的報名數（查詢「我的報名」後用這個校正） */
  function setGrowth(n) {
    var next = Math.max(0, parseInt(n, 10) || 0);
    var changed = next !== growthCount();
    store('growth', next);
    paintGrowth(changed);
  }

  /** 報名 +1、取消 -1 */
  function bumpGrowth(delta) {
    setGrowth(growthCount() + delta);
  }

  function growthEmoji(n) {
    var i = parseInt(n, 10) || 0;
    if (i < 0) i = 0;
    if (i > GROWTH.length - 1) i = GROWTH.length - 1;
    return GROWTH[i];
  }

  /** 把目前的數字畫到左上角圖示與瀏覽器分頁小圖示上 */
  function paintGrowth(animate) {
    var n = growthCount();
    var emo = growthEmoji(n);

    var el = document.querySelector('.brand-mark');
    if (el) {
      if (el.textContent !== emo) {
        el.textContent = emo;
        if (animate) {
          el.classList.remove('pop');
          void el.offsetWidth;          // 重啟動畫
          el.classList.add('pop');
        }
      }
      el.title = n
        ? '你已經報名 ' + n + ' 個時段囉！'
        : '報名第一個時段，看看左上角會發生什麼事';
    }

    var icon = document.querySelector('link[rel="icon"]');
    if (icon) {
      icon.href = 'data:image/svg+xml,' + encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
        "<text y='.9em' font-size='90'>" + emo + "</text></svg>");
    }
    return n;
  }

  /* ---------- 照片壓縮 ---------- */

  function compressImage(file) {
    var maxW = (window.APP_CONFIG && window.APP_CONFIG.PHOTO_MAX_WIDTH) || 1600;
    var quality = (window.APP_CONFIG && window.APP_CONFIG.PHOTO_QUALITY) || 0.82;

    function draw(source, sw, sh) {
      var scale = Math.min(1, maxW / sw);
      var w = Math.max(1, Math.round(sw * scale));
      var h = Math.max(1, Math.round(sh * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(source, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', quality);
      canvas.width = canvas.height = 1;      // 手機記憶體有限，用完馬上放掉
      return { data: dataUrl.split(',')[1], mimeType: 'image/jpeg', filename: file.name };
    }

    /* 手機拍的照片動輒一兩千萬畫素。原本的做法是先把整個檔案轉成 base64 字串
       再塞進 <img>，一張照片在記憶體裡等於同時存在三份，手機很容易就當掉或整頁重整。
       改用 object URL 之後少掉最大的那一份，上傳也明顯變快，
       而且照片的方向（EXIF）瀏覽器會自己處理，跟原本一樣正。 */
    return new Promise(function (resolve, reject) {
      var url = window.URL && URL.createObjectURL ? URL.createObjectURL(file) : null;
      var img = new Image();

      function done(fn) {
        return function () {
          if (url) URL.revokeObjectURL(url);
          fn();
        };
      }

      img.onerror = done(function () { reject(new Error('這個檔案不是有效的圖片')); });
      img.onload = done(function () {
        try { resolve(draw(img, img.naturalWidth || img.width, img.naturalHeight || img.height)); }
        catch (e) { reject(new Error('照片太大了，請先縮小一點再上傳')); }
      });

      if (url) { img.src = url; return; }

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('讀取檔案失敗')); };
      reader.onload = function () { img.src = reader.result; };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- 其他 ---------- */

  function formatPhone(p) {
    var s = String(p || '').replace(/\D/g, '');
    return s.length === 10 ? s.slice(0, 4) + '-' + s.slice(4, 7) + '-' + s.slice(7) : s;
  }

  /* ---------- 時間 / 時數 ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 'HH:MM' → 分鐘數；格式不對回傳 null */
  function timeToMin(v) {
    var m = String(v || '').match(/^(\d{1,2})\s*[:：]\s*(\d{1,2})$/);
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /** 分鐘數 → 'HH:MM' */
  function minToTime(m) {
    m = ((m % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }

  /** 把 '10:00 - 10:30' 之類的字串拆成 {start, end} */
  function splitLabel(label) {
    var m = String(label || '').match(/(\d{1,2}\s*[:：]\s*\d{1,2})\s*[-–~至]\s*(\d{1,2}\s*[:：]\s*\d{1,2})/);
    if (!m) return { start: '', end: '' };
    var a = timeToMin(m[1]), b = timeToMin(m[2]);
    return { start: a === null ? '' : minToTime(a), end: b === null ? '' : minToTime(b) };
  }

  /** 分鐘數 → 「約 1 小時 10 分鐘」 */
  function formatDuration(mins) {
    var n = parseInt(mins, 10);
    if (!n || n <= 0) return '';
    if (n < 60) return '約 ' + n + ' 分鐘';
    var h = Math.floor(n / 60), m = n % 60;
    return '約 ' + h + ' 小時' + (m ? ' ' + m + ' 分鐘' : '');
  }

  /* ---------- 價格 ----------
   * 後端的 price：null = 攤商還沒填、0 = 免費、其他 = 金額。
   * 還沒填的攤位在玩家端不顯示價格（寧可不講，也不要寫錯成免費）。
   */

  /** 有填過價格嗎（0 也算有填） */
  function hasPrice(price) {
    return price !== null && price !== undefined && price !== '';
  }

  /** 價格 → 「免費」／「120 元」；還沒填回空字串 */
  function priceText(price) {
    if (!hasPrice(price)) return '';
    var n = parseInt(price, 10);
    if (isNaN(n) || n <= 0) return '免費';
    return n + ' 元';
  }

  /** 價格標籤。還沒填就不產生標籤 */
  function priceTag(price) {
    if (!hasPrice(price)) return '';
    var n = parseInt(price, 10);
    if (isNaN(n) || n <= 0) return '<span class="tag tag-ok">免費</span>';
    return '<span class="tag tag-amber">💰 ' + n + ' 元</span>';
  }

  function downloadCSV(filename, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c === null || c === undefined ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.disabled = true;
      btn.textContent = label || '處理中…';
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }

  /* ---------- 放大檢視圖片 ---------- */

  function viewImage(src) {
    var box = document.getElementById('imgViewer');
    if (!box) return;
    document.getElementById('imgViewerImg').src = src;
    box.hidden = false;
    lockScroll(true);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      box.hidden = true;
      document.getElementById('imgViewerImg').src = '';
      document.removeEventListener('keydown', onKey);
      lockScroll(false);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    box.onclick = function (e) { if (e.target === box) close(); };
    box.querySelector('.img-viewer-close').onclick = close;
    document.addEventListener('keydown', onKey);
  }

  /* ---------- 攤位編號的「地圖群組」 ----------
   * 同一個攤位切成好幾攤的時候（A1-1、A1-2），在系統裡是各自獨立的攤位，
   * 有各自的代碼和報名名單；但在地圖上它們是同一個位置，而且只寫 A1。
   * 這個函式就是把編號前面那一段取出來當群組名。
   */
  function boothGroup(no) {
    var s = String(no === null || no === undefined ? '' : no).trim();
    var i = s.search(/[-－‐–—_/／]/);
    var g = (i > 0 ? s.slice(0, i) : s).trim();
    return g || s;
  }

  /* ---------- 攤位編號自然排序：1 < 2 < 10，A01 < B01 ---------- */

  function chunkNo(s) {
    return (String(s == null ? '' : s).match(/\d+|\D+/g) || []).map(function (part) {
      return /^\d+$/.test(part)
        ? { num: true, v: parseInt(part, 10) }
        : { num: false, v: part.toUpperCase() };
    });
  }

  function compareBoothNo(a, b) {
    var ax = chunkNo(a), bx = chunkNo(b);
    for (var i = 0; i < Math.max(ax.length, bx.length); i++) {
      var p = ax[i], q = bx[i];
      if (p === undefined) return -1;
      if (q === undefined) return 1;
      if (p.num && q.num) { if (p.v !== q.v) return p.v - q.v; }
      else {
        var ps = String(p.v), qs = String(q.v);
        if (ps !== qs) return ps < qs ? -1 : 1;
      }
    }
    return 0;
  }

  return {
    esc: esc, nl2br: nl2br, $: $, $$: $$,
    loadingHTML: loadingHTML, emptyHTML: emptyHTML, errorHTML: errorHTML,
    toast: toast, ok: ok, err: err,
    modal: modal, confirm: confirmDialog,
    slideshowHTML: slideshowHTML, bannerHTML: bannerHTML,
    initSlideshows: initSlideshows, stopSlideshows: stopSlideshows,
    store: store, compressImage: compressImage, growthEmoji: growthEmoji,
    formatPhone: formatPhone, downloadCSV: downloadCSV, busy: busy,
    viewImage: viewImage, compareBoothNo: compareBoothNo, boothGroup: boothGroup,
    isTouch: isTouch, lockScroll: lockScroll,
    photoSrc: photoSrc, photoAltSrc: photoAltSrc, imgTag: imgTag,
    hydrateImg: hydrateImg, bindImgFallback: bindImgFallback,
    cacheGet: cacheGet, cacheSet: cacheSet,
    timeToMin: timeToMin, minToTime: minToTime, splitLabel: splitLabel,
    formatDuration: formatDuration, pad2: pad2,
    hasPrice: hasPrice, priceText: priceText, priceTag: priceTag,
    setGrowth: setGrowth, bumpGrowth: bumpGrowth, paintGrowth: paintGrowth, growthCount: growthCount
  };
})();
