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

  /* ---------- 幻燈片 ---------- */

  /* 幻燈片：純自動輪播，照片不可點擊。
     第一張立刻載入，其餘等快輪到了才載，手機開攤位頁不會一次拉十張圖。 */
  var SLIDE_W = [640, 1000];
  var SLIDE_SIZES = '(max-width: 720px) 94vw, 1000px';

  function slideshowHTML(photos) {
    if (!photos || !photos.length) {
      return '<div class="slideshow"><div class="slideshow-track" style="display:grid;place-items:center">' +
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
      return '<div class="slide' + (i === 0 ? ' active' : '') + '">' + bg + main + '</div>';
    }).join('');
    var dots = photos.length > 1
      ? '<div class="slide-dots" aria-hidden="true">' + photos.map(function (_, i) {
          return '<i' + (i === 0 ? ' class="active"' : '') + '></i>';
        }).join('') + '</div>'
      : '';
    return '<div class="slideshow" data-slideshow><div class="slideshow-track">' + imgs + '</div>' + dots + '</div>';
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

      var slides = $$('.slide', box);
      var dots = $$('.slide-dots i', box);
      var idx = 0;

      $$('.slide-img', box).forEach(function (im) { bindImgFallback(im); });

      if (slides.length < 2) return;

      function preload(i) {
        var s = slides[(i + slides.length) % slides.length];
        if (s) hydrateImg(s.querySelector('.slide-img'));
      }
      preload(1);   // 先把下一張準備好，換頁時才不會空白

      var ms = (window.APP_CONFIG && window.APP_CONFIG.SLIDESHOW_MS) || 3500;
      slideTimers.push(setInterval(function () {
        if (!document.body.contains(box)) return;
        if (document.hidden) return;          // 分頁在背景就暫停，省電省流量
        idx = (idx + 1) % slides.length;
        slides.forEach(function (s, k) { s.classList.toggle('active', k === idx); });
        dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
        preload(idx + 1);
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
    slideshowHTML: slideshowHTML, initSlideshows: initSlideshows, stopSlideshows: stopSlideshows,
    store: store, compressImage: compressImage, growthEmoji: growthEmoji,
    formatPhone: formatPhone, downloadCSV: downloadCSV, busy: busy,
    viewImage: viewImage, compareBoothNo: compareBoothNo,
    isTouch: isTouch, lockScroll: lockScroll,
    photoSrc: photoSrc, photoAltSrc: photoAltSrc, imgTag: imgTag,
    hydrateImg: hydrateImg, bindImgFallback: bindImgFallback,
    cacheGet: cacheGet, cacheSet: cacheSet,
    timeToMin: timeToMin, minToTime: minToTime, splitLabel: splitLabel,
    formatDuration: formatDuration, pad2: pad2,
    setGrowth: setGrowth, bumpGrowth: bumpGrowth, paintGrowth: paintGrowth, growthCount: growthCount
  };
})();
