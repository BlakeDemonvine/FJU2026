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

  /* ---------- Modal ---------- */

  function modal(html, onMount) {
    var host = document.getElementById('modalHost');
    host.innerHTML = '<div class="modal">' + html + '</div>';
    host.hidden = false;

    function close() {
      host.hidden = true;
      host.innerHTML = '';
      document.removeEventListener('keydown', onKey);
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

  /* ---------- 幻燈片：純自動輪播，照片不可點擊 ---------- */

  function slideshowHTML(photos) {
    if (!photos || !photos.length) {
      return '<div class="slideshow"><div class="slideshow-track" style="display:grid;place-items:center">' +
             '<span style="font-size:2.8rem;opacity:.3">🎈</span></div></div>';
    }
    var imgs = photos.map(function (p, i) {
      var src = esc(p.url), alt = esc(p.altUrl || '');
      return '<div class="slide' + (i === 0 ? ' active' : '') + '">' +
        '<img class="slide-bg" src="' + src + '" alt="" aria-hidden="true" draggable="false" data-alt-url="' + alt + '">' +
        '<img class="slide-img" src="' + src + '" alt="展示照片 ' + (i + 1) + '" draggable="false" data-alt-url="' + alt + '">' +
      '</div>';
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

      $$('img', box).forEach(function (im) {
        im.onerror = function () {
          var alt = im.dataset.altUrl;
          if (alt && im.src !== alt) { im.src = alt; im.dataset.altUrl = ''; }
        };
      });

      if (slides.length < 2) return;

      var ms = (window.APP_CONFIG && window.APP_CONFIG.SLIDESHOW_MS) || 3500;
      slideTimers.push(setInterval(function () {
        if (!document.body.contains(box)) return;
        idx = (idx + 1) % slides.length;
        slides.forEach(function (s, k) { s.classList.toggle('active', k === idx); });
        dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
      }, ms));
    });
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

    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('讀取檔案失敗')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('這個檔案不是有效的圖片')); };
        img.onload = function () {
          var scale = Math.min(1, maxW / img.width);
          var w = Math.round(img.width * scale);
          var h = Math.round(img.height * scale);
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg', filename: file.name });
        };
        img.src = reader.result;
      };
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

  /* ---------- 主題 ---------- */

  function initTheme() {
    var saved = store('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    var btn = document.getElementById('themeBtn');
    if (!btn) return;
    btn.onclick = function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var isDark = cur ? cur === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      store('theme', next);
    };
  }

  return {
    esc: esc, nl2br: nl2br, $: $, $$: $$,
    loadingHTML: loadingHTML, emptyHTML: emptyHTML, errorHTML: errorHTML,
    toast: toast, ok: ok, err: err,
    modal: modal, confirm: confirmDialog,
    slideshowHTML: slideshowHTML, initSlideshows: initSlideshows, stopSlideshows: stopSlideshows,
    store: store, compressImage: compressImage, growthEmoji: growthEmoji,
    formatPhone: formatPhone, downloadCSV: downloadCSV, busy: busy, initTheme: initTheme,
    timeToMin: timeToMin, minToTime: minToTime, splitLabel: splitLabel,
    formatDuration: formatDuration, pad2: pad2,
    setGrowth: setGrowth, bumpGrowth: bumpGrowth, paintGrowth: paintGrowth, growthCount: growthCount
  };
})();
