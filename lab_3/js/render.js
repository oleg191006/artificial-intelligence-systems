/* ============================================================================
 *  render.js — малювання лабіринту і хвилі на елементі <canvas>
 *  ---------------------------------------------------------------------------
 *  Кожна клітинка матриці малюється квадратом:
 *    - стіна (-1) — темна, з позначкою «-1»;
 *    - прохідна клітинка (0) — світліша, з позначкою «0»;
 *    - клітинка, досягнута хвилею, — колір від синього (перші хвилі) до
 *      бірюзового (останні) і число — номер позначки хвилі;
 *    - поточний фронт хвилі — рожева рамка;
 *    - знайдений шлях — жовтий; старт — зелений; ціль — червона.
 *  Уздовж країв підписано номери рядків і стовпців.
 * ========================================================================== */
(function (root) {
  'use strict';

  var C = {
    bg: '#0d131d',
    wall: '#0b1019',
    wallLine: '#3a4a63',
    free: '#1d2a3d',
    grid: '#2a3a52',
    text: '#8ea3c2',
    path: '#ffb02e',
    front: '#f472b6',
    start: '#34d399',
    goal: '#f87171',
    label: '#6f86a8'
  };

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 30; this.ox = 0; this.oy = 0; this.dpr = 1;
  }

  Renderer.prototype.fit = function () {
    var rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
    this.w = rect.width; this.h = rect.height;
  };

  // Розміщення сітки: лівіше від центру, щоб праворуч лишалось місце для вікон.
  Renderer.prototype.layout = function (maze, reserve) {
    var availW = this.w - (reserve || 420), availH = this.h - 80;
    if (availW < 300) availW = this.w - 40;
    var s = Math.floor(Math.min(availW / (maze.cols + 1), availH / (maze.rows + 1)));
    this.cell = Math.max(12, Math.min(s, 46));
    this.ox = Math.max(30, Math.floor((availW - this.cell * maze.cols) / 2) + 26);
    this.oy = Math.max(30, Math.floor((availH - this.cell * maze.rows) / 2) + 22);
  };

  Renderer.prototype.cellAt = function (maze, clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var x = clientX - rect.left - this.ox, y = clientY - rect.top - this.oy;
    var c = Math.floor(x / this.cell), r = Math.floor(y / this.cell);
    return maze.inside(r, c) ? { r: r, c: c } : null;
  };

  function waveColor(k, maxK) {
    // k = 1 … maxK  →  від синього до бірюзового
    var t = maxK > 1 ? (k - 1) / (maxK - 1) : 0;
    var a = [30, 90, 168], b = [45, 212, 191];
    var m = a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); });
    return 'rgb(' + m.join(',') + ')';
  }

  /**
   * st: { marks: number[][] | null, front: Set<'r,c'>, path: [[r,c]],
   *       paths: [{cells, color, offset}], showNums: bool }
   */
  Renderer.prototype.draw = function (maze, st) {
    st = st || {};
    this.layout(maze, st.paths ? 580 : 420);   // у режимі порівняння вікно ширше
    var ctx = this.ctx, s = this.cell, ox = this.ox, oy = this.oy;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    var marks = st.marks;
    var maxK = 1;
    if (marks) marks.forEach(function (row) { row.forEach(function (v) { if (v > maxK) maxK = v; }); });
    var onPath = new Set((st.path || []).map(function (p) { return p[0] + ',' + p[1]; }));
    var front = st.front || new Set();
    var fs = Math.max(8, Math.min(14, Math.floor(s * 0.42)));

    // ---- номери рядків і стовпців ----
    ctx.fillStyle = C.label;
    ctx.font = Math.max(9, fs - 2) + 'px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var c0 = 0; c0 < maze.cols; c0++) ctx.fillText(String(c0), ox + c0 * s + s / 2, oy - 11);
    ctx.textAlign = 'right';
    for (var r0 = 0; r0 < maze.rows; r0++) ctx.fillText(String(r0), ox - 6, oy + r0 * s + s / 2);

    // ---- клітинки ----
    for (var r = 0; r < maze.rows; r++) {
      for (var c = 0; c < maze.cols; c++) {
        var x = ox + c * s, y = oy + r * s;
        var wall = maze.cells[r][c] === -1;
        var v = marks ? marks[r][c] : maze.cells[r][c];
        var key = r + ',' + c;
        var isS = r === maze.start.r && c === maze.start.c;
        var isG = r === maze.goal.r && c === maze.goal.c;

        var fill = wall ? C.wall : C.free, txt = C.text;
        if (!wall && v > 0) { fill = waveColor(v, maxK); txt = '#e8f6ff'; }
        if (onPath.has(key)) { fill = C.path; txt = '#1a1203'; }
        if (isS) { fill = C.start; txt = '#062016'; }
        if (isG) { fill = C.goal; txt = '#2a0707'; }

        ctx.fillStyle = fill;
        ctx.fillRect(x, y, s, s);
        if (wall) {               // штрихування стіни
          ctx.strokeStyle = C.wallLine; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + s - 2); ctx.lineTo(x + s - 2, y + 2);
          ctx.stroke();
        }
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);

        if (front.has(key)) {
          ctx.strokeStyle = C.front; ctx.lineWidth = 2.5;
          ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
        }

        if (st.showNums !== false && s >= 16) {
          ctx.fillStyle = txt;
          ctx.font = (v > 0 || isS || isG ? 'bold ' : '') + fs + 'px "Segoe UI", sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          var label = isS && !(v > 0) ? 'S' : isG && !(v > 0) ? 'G' : String(v);
          ctx.fillText(label, x + s / 2, y + s / 2 + 0.5);
        } else if (isS || isG) {
          ctx.fillStyle = txt;
          ctx.font = 'bold ' + fs + 'px "Segoe UI", sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(isS ? 'S' : 'G', x + s / 2, y + s / 2);
        }
      }
    }

    // ---- лінія знайденого шляху ----
    var self = this;
    if (st.path && st.path.length > 1 && !st.paths) {
      self._polyline(st.path, '#7a4b00', 3, 0);
    }
    // ---- кілька шляхів (порівняння операторів) ----
    (st.paths || []).forEach(function (p) { self._polyline(p.cells, p.color, 4, p.offset || 0); });

    ctx.restore();
  };

  Renderer.prototype._polyline = function (cells, color, width, offset) {
    var ctx = this.ctx, s = this.cell, ox = this.ox, oy = this.oy;
    var d = offset * s * 0.14;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    cells.forEach(function (p, i) {
      var x = ox + p[1] * s + s / 2 + d, y = oy + p[0] * s + s / 2 + d;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
    // точки на вузлах шляху
    ctx.fillStyle = color;
    cells.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(ox + p[1] * s + s / 2 + d, oy + p[0] * s + s / 2 + d, width * 0.8, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  root.Renderer = Renderer;
})(window);
