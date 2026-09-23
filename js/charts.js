/* =====================================================================
 * charts.js — 純 SVG 長條圖（無外部套件）
 * 單一數列、直接標值、虛線代表名額上限、滑鼠移上顯示詳細資訊。
 * ===================================================================== */

window.Charts = (function () {

  var esc = UI.esc;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  /** 取好看的刻度間距 */
  function niceStep(max) {
    if (max <= 5) return 1;
    var raw = max / 4;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  /**
   * 畫一張直條圖。
   * opts = { title, sub, data:[{label, value, capacity, note}], alt:Boolean }
   */
  function bar(host, opts) {
    var data = opts.data || [];

    var card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML =
      '<div class="chart-head">' +
        '<h3>' + esc(opts.title) + '</h3>' +
        (opts.sub ? '<p class="chart-sub">' + esc(opts.sub) + '</p>' : '') +
      '</div>' +
      '<div class="chart"></div>' +
      '<div class="chart-legend">' +
        '<span><i style="background:var(--chart-bar' + (opts.alt ? '-2' : '') + ')"></i>已報名人數</span>' +
        '<span><i style="background:var(--bg-sunken);border:1px solid var(--border)"></i>尚未額滿的名額</span>' +
      '</div>';

    var box = card.querySelector('.chart');
    host.appendChild(card);

    if (!data.length) {
      box.innerHTML = '<p class="muted small" style="margin:8px 0">沒有資料。</p>';
      return card;
    }

    draw();
    // 視窗尺寸改變時重畫
    var ro = window.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null;
    if (ro) ro.observe(box);

    function draw() {
      var avail = Math.max(280, box.clientWidth || 640);

      var padL = 36, padR = 16, padT = 22, padB = 64;
      var bandMin = 56, bandMax = 150;
      var band = Math.min(bandMax, Math.max(bandMin, (avail - padL - padR) / data.length));
      var barW = Math.min(54, band * 0.55);

      var W = Math.max(avail, padL + padR + band * data.length);
      // 類別少的時候把長條置中，避免全部擠在左邊
      var offset = Math.max(0, (W - padL - padR - band * data.length) / 2);
      var plotH = 190;
      var H = plotH + padT + padB;

      var maxVal = 0;
      data.forEach(function (d) {
        maxVal = Math.max(maxVal, Number(d.value) || 0, Number(d.capacity) || 0);
      });
      if (maxVal <= 0) maxVal = 1;
      var step = niceStep(maxVal);
      var top = Math.ceil(maxVal / step) * step;
      var y = function (v) { return padT + plotH - (v / top) * plotH; };

      box.innerHTML = '';
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.appendChild(el('title', {})).textContent = opts.title;

      /* 格線與 y 軸刻度 */
      for (var v = 0; v <= top + 0.001; v += step) {
        var yy = y(v);
        svg.appendChild(el('line', {
          x1: padL, x2: W - padR, y1: yy, y2: yy,
          class: v === 0 ? 'axis-line' : 'grid-line'
        }));
        var t = el('text', { x: padL - 8, y: yy + 4, class: 'axis-text', 'text-anchor': 'end' });
        t.textContent = String(Math.round(v));
        svg.appendChild(t);
      }

      /* 長條 */
      /** 底部貼齊基線、上緣圓角的長條路徑 */
      function barPath(x, w, topY) {
        var base = padT + plotH;
        var h = base - topY;
        if (h <= 0) return '';
        var r = Math.min(4, w / 2, h);
        return 'M' + x + ' ' + base +
               ' V' + (topY + r) +
               ' Q' + x + ' ' + topY + ' ' + (x + r) + ' ' + topY +
               ' H' + (x + w - r) +
               ' Q' + (x + w) + ' ' + topY + ' ' + (x + w) + ' ' + (topY + r) +
               ' V' + base + ' Z';
      }

      data.forEach(function (d, i) {
        var val = Number(d.value) || 0;
        var cap = Number(d.capacity) || 0;
        var cx = padL + offset + band * i + band / 2;
        var bx = cx - barW / 2;

        var g = el('g', {});

        /* 名額整體（淺色底槽），讓「1 / 30」這種比例也一眼看得出來 */
        if (cap > 0) {
          g.appendChild(el('path', { d: barPath(bx, barW, y(cap)), class: 'track' }));
        }

        /* 已報名人數 */
        if (val > 0) {
          var topY = Math.min(y(val), padT + plotH - 3);
          g.appendChild(el('path', { d: barPath(bx, barW, topY), class: 'bar' + (opts.alt ? ' alt' : '') }));
        }

        /* 直接標值（標在底槽上方，數字不會被壓住） */
        var labelY = Math.min(y(Math.max(val, cap)) - 7, padT + plotH - 4);
        var lbl = el('text', { x: cx, y: labelY, class: 'value-text', 'text-anchor': 'middle' });
        lbl.textContent = cap > 0 ? (val + ' / ' + cap) : String(val);
        g.appendChild(lbl);

        /* x 軸分類文字 */
        var name = String(d.label || '');
        var lines = name.indexOf(' - ') > -1 ? name.split(' - ') : wrap(name, 7, 2);
        lines.forEach(function (ln, k) {
          var tx = el('text', {
            x: cx, y: padT + plotH + 20 + k * 14, class: 'cat-text', 'text-anchor': 'middle'
          });
          tx.textContent = k === 0 && lines.length > 1 ? ln + ' –' : ln;
          g.appendChild(tx);
        });

        /* 滑鼠感應區（比長條大，好點） */
        var hit = el('rect', {
          x: padL + offset + band * i, y: padT, width: band, height: plotH + padB - 20, class: 'bar-hit'
        });
        hit.addEventListener('mouseenter', function () {
          showTip(cx, y(Math.max(val, cap)), (d.label || '') + '：' + val + ' 人' +
            (cap ? ' / ' + cap + ' 名額' : '') + (d.note ? '　' + d.note : ''));
        });
        hit.addEventListener('mouseleave', hideTip);
        g.appendChild(hit);

        svg.appendChild(g);
      });

      box.appendChild(svg);

      var tip = document.createElement('div');
      tip.className = 'chart-tip';
      box.appendChild(tip);

      function showTip(x, yy, text) {
        tip.textContent = text;
        tip.style.left = x + 'px';
        tip.style.top = Math.max(16, yy) + 'px';
        tip.classList.add('on');
      }
      function hideTip() { tip.classList.remove('on'); }
    }

    return card;
  }

  /** 把長字串折成最多 maxLines 行，超過的用 … */
  function wrap(text, perLine, maxLines) {
    var out = [];
    for (var i = 0; i < text.length && out.length < maxLines; i += perLine) {
      out.push(text.substr(i, perLine));
    }
    if (out.length === maxLines && text.length > perLine * maxLines) {
      out[maxLines - 1] = out[maxLines - 1].slice(0, perLine - 1) + '…';
    }
    return out.length ? out : [''];
  }

  /** 對應的表格檢視（無障礙備援） */
  function table(host, opts) {
    var wrapEl = document.createElement('div');
    wrapEl.className = 'table-wrap mt';
    wrapEl.innerHTML = '<table><caption class="small muted" style="text-align:left;padding:8px 13px">' +
      esc(opts.title) + '</caption><thead><tr><th>' + esc(opts.categoryHead || '項目') +
      '</th><th>報名人數</th><th>名額上限</th></tr></thead><tbody>' +
      (opts.data || []).map(function (d) {
        return '<tr><td>' + esc(d.label) + '</td><td class="num">' + (d.value || 0) +
          '</td><td class="num">' + (d.capacity || 0) + '</td></tr>';
      }).join('') + '</tbody></table>';
    host.appendChild(wrapEl);
    return wrapEl;
  }

  return { bar: bar, table: table };
})();
