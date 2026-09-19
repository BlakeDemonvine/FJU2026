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

  /* ---------- 幻燈片 ---------- */

  function slideshowHTML(photos) {
    if (!photos || !photos.length) {
      return '<div class="slideshow"><div class="slideshow-track" style="display:grid;place-items:center">' +
             '<span style="font-size:2.8rem;opacity:.3">🎈</span></div></div>';
    }
    var imgs = photos.map(function (p, i) {
      return '<img src="' + esc(p.url) + '" alt="展示照片 ' + (i + 1) + '"' +
             (i === 0 ? ' class="active"' : '') +
             ' loading="lazy" data-alt-url="' + esc(p.altUrl || '') + '">';
    }).join('');
    var dots = photos.length > 1
      ? '<div class="slide-dots">' + photos.map(function (_, i) {
          return '<i' + (i === 0 ? ' class="active"' : '') + ' data-i="' + i + '"></i>';
        }).join('') + '</div>'
      : '';
    var arrows = photos.length > 1
      ? '<button class="slide-btn slide-prev" type="button" aria-label="上一張">‹</button>' +
        '<button class="slide-btn slide-next" type="button" aria-label="下一張">›</button>'
      : '';
    return '<div class="slideshow" data-slideshow><div class="slideshow-track">' + imgs + '</div>' + arrows + dots + '</div>';
  }

  function initSlideshows(root) {
    $$('[data-slideshow]', root || document).forEach(function (box) {
      if (box.__init) return;
      box.__init = true;

      var imgs = $$('img', box);
      var dots = $$('.slide-dots i', box);
      var idx = 0;
      var timer = null;

      function show(i) {
        idx = (i + imgs.length) % imgs.length;
        imgs.forEach(function (im, k) { im.classList.toggle('active', k === idx); });
        dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
      }
      function auto() {
        if (imgs.length < 2) return;
        clearInterval(timer);
        timer = setInterval(function () { show(idx + 1); }, 4500);
      }

      var prev = $('.slide-prev', box), next = $('.slide-next', box);
      if (prev) prev.onclick = function () { show(idx - 1); auto(); };
      if (next) next.onclick = function () { show(idx + 1); auto(); };
      dots.forEach(function (d) { d.onclick = function () { show(+d.dataset.i); auto(); }; });

      imgs.forEach(function (im) {
        im.onclick = function () { lightbox(im.src); };
        im.onerror = function () {
          var alt = im.dataset.altUrl;
          if (alt && im.src !== alt) { im.src = alt; im.dataset.altUrl = ''; }
        };
      });

      box.addEventListener('mouseenter', function () { clearInterval(timer); });
      box.addEventListener('mouseleave', auto);

      // 手機滑動
      var startX = null;
      box.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', function (e) {
        if (startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
        startX = null; auto();
      });

      auto();
    });
  }

  function lightbox(src) {
    var box = document.getElementById('lightbox');
    document.getElementById('lightboxImg').src = src;
    box.hidden = false;
    var close = function () { box.hidden = true; document.getElementById('lightboxImg').src = ''; };
    box.onclick = function (e) { if (e.target === box) close(); };
    box.querySelector('.lightbox-close').onclick = close;
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
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
    slideshowHTML: slideshowHTML, initSlideshows: initSlideshows, lightbox: lightbox,
    store: store, compressImage: compressImage,
    formatPhone: formatPhone, downloadCSV: downloadCSV, busy: busy, initTheme: initTheme
  };
})();
