/* ============================================================================
 *  render.js — візуалізація графа та процесу пошуку на елементі <canvas>
 *  ---------------------------------------------------------------------------
 *  Малюються:
 *    - ребра (лінії) та дуги (лінії зі стрілкою на кінці);
 *    - вершини (кола з номером), колір яких відповідає стану у пошуку:
 *        idle    — ще не досягнута;
 *        open    — занесена в чергу (список OPEN);
 *        closed  — розкрита (список CLOSED);
 *        current — саме зараз розкривається;
 *        path    — входить у знайдений шлях;
 *      окремими кольорами позначені початкова і цільова вершини;
 *    - "дерево пошуку" (вказівники на батьківські вершини) — пунктиром;
 *    - знайдений шлях — товстою лінією.
 *
 *  Логічна система координат полотна — 1160 x 770; вона автоматично
 *  масштабується під фактичний розмір вікна (метод fit()).
 * ========================================================================== */
(function (root) {
  'use strict';

  var W = 1160, H = 770, R = 17;      // логічні розміри та радіус вершини

  var COLORS = {
    bg:       '#0d131d',
    grid:     '#141d2b',
    edge:     '#3c4d68',
    edgeDim:  '#2a3446',
    tree:     '#3f6ea5',
    path:     '#ffb02e',
    idle:     '#1d2838',
    idleLine: '#43587a',
    open:     '#4da3ff',
    closed:   '#8593a8',
    current:  '#7c5cff',
    start:    '#34d399',
    goal:     '#f87171',
    text:     '#e6edf7',
    textDark: '#08111d',
    inspect:  '#ffe08a'
  };

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
  }

  // Підганяє розмір полотна під контейнер зі збереженням пропорцій.
  Renderer.prototype.fit = function () {
    var rect = this.canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    var s = Math.min(rect.width / W, rect.height / H);
    this.scale = s * dpr;
    this.offX = (rect.width - W * s) / 2 * dpr;
    this.offY = (rect.height - H * s) / 2 * dpr;
  };

  // Перетворення екранних координат миші у логічні координати графа.
  Renderer.prototype.toLogical = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var x = (clientX - rect.left) * dpr;
    var y = (clientY - rect.top) * dpr;
    return { x: (x - this.offX) / this.scale, y: (y - this.offY) / this.scale };
  };

  Renderer.prototype.hitTest = function (graph, lx, ly) {
    var found = null;
    graph.vertices.forEach(function (v) {
      var dx = v.x - lx, dy = v.y - ly;
      if (dx * dx + dy * dy <= (R + 5) * (R + 5)) found = v.id;
    });
    return found;
  };

  /**
   * @param {Graph}  graph
   * @param {Object} st  стан візуалізації:
   *   { start, goal, open:Set, closed:Set, current, path:[], parent:Map,
   *     inspect:{from,to}, selected, depth:Map, showDepth:bool }
   */
  Renderer.prototype.draw = function (graph, st) {
    st = st || {};
    var ctx = this.ctx;
    var open = st.open || new Set();
    var closed = st.closed || new Set();
    var pathSet = new Set(st.path || []);
    var pathEdges = new Set();
    for (var i = 0; i + 1 < (st.path || []).length; i++) {
      pathEdges.add(st.path[i] + '|' + st.path[i + 1]);
      pathEdges.add(st.path[i + 1] + '|' + st.path[i]);
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);

    // ---- ребра та дуги -------------------------------------------------
    var self = this;
    graph.edges.forEach(function (e) {
      var p = graph.vertices.get(e.a), q = graph.vertices.get(e.b);
      if (!p || !q) return;
      var onPath = pathEdges.has(e.a + '|' + e.b);
      var isTree = st.parent && (st.parent.get(e.b) === e.a || st.parent.get(e.a) === e.b);
      var inspected = st.inspect &&
        ((st.inspect.from === e.a && st.inspect.to === e.b) ||
         (st.inspect.from === e.b && st.inspect.to === e.a));

      ctx.strokeStyle = onPath ? COLORS.path
        : inspected ? COLORS.inspect
        : isTree ? COLORS.tree
        : COLORS.edge;
      ctx.lineWidth = onPath ? 5 : inspected ? 3.5 : isTree ? 2.4 : 1.6;
      if (isTree && !onPath && !inspected) ctx.setLineDash([7, 5]);

      self._line(ctx, p, q, e.directed);
      ctx.setLineDash([]);
    });

    // ---- вершини --------------------------------------------------------
    graph.vertices.forEach(function (v) {
      var fill = COLORS.idle, stroke = COLORS.idleLine, textCol = COLORS.text, lw = 2;

      if (closed.has(v.id)) { fill = COLORS.closed; stroke = '#9fb0c7'; textCol = COLORS.textDark; }
      if (open.has(v.id))   { fill = COLORS.open;   stroke = '#8cc6ff'; textCol = COLORS.textDark; }
      if (pathSet.has(v.id)) { fill = COLORS.path;  stroke = '#ffd489'; textCol = COLORS.textDark; }
      if (v.id === st.current) { fill = COLORS.current; stroke = '#b9a7ff'; textCol = '#fff'; lw = 3.5; }
      if (v.id === st.start) { fill = COLORS.start; stroke = '#8df0cd'; textCol = COLORS.textDark; lw = 3; }
      if (v.id === st.goal)  { fill = COLORS.goal;  stroke = '#ffb3b3'; textCol = COLORS.textDark; lw = 3; }
      if (v.id === st.selected) { stroke = '#ffffff'; lw = 3; }

      ctx.beginPath();
      ctx.arc(v.x, v.y, R, 0, 2 * Math.PI);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = stroke;
      ctx.stroke();

      ctx.fillStyle = textCol;
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v.id), v.x, v.y + 0.5);

      // номер ярусу пошуку (глибина) — маленькою цифрою збоку
      if (st.showDepth && st.depth && st.depth.has(v.id)) {
        ctx.fillStyle = '#cfe0f5';
        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.fillText('[' + st.depth.get(v.id) + ']', v.x + R + 12, v.y - R + 4);
      }
    });

    ctx.restore();
  };

  // Лінія між двома вершинами; для дуги домальовується стрілка.
  Renderer.prototype._line = function (ctx, p, q, directed) {
    var dx = q.x - p.x, dy = q.y - p.y;
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    var x1 = p.x + ux * R, y1 = p.y + uy * R;
    var x2 = q.x - ux * R, y2 = q.y - uy * R;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (directed) {
      var a = 10, w = 5.5;
      var bx = x2 - ux * a, by = y2 - uy * a;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(bx - uy * w, by + ux * w);
      ctx.lineTo(bx + uy * w, by - ux * w);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  };

  Renderer.W = W;
  Renderer.H = H;
  Renderer.R = R;
  root.Renderer = Renderer;
})(window);
