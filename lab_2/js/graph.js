/* ============================================================================
 *  graph.js — модель графа
 *  ---------------------------------------------------------------------------
 *  Клас Graph зберігає вершини (з координатами) та ребра/дуги і вміє:
 *    - додавати/вилучати вершини (зміна РОЗМІРНОСТІ графа);
 *    - додавати/вилучати ребра і дуги (зміна ПОРЯДКУ зв'язків);
 *    - перемикати вид графа: звичайний / орієнтований / дерево / мішаний;
 *    - видавати список суміжних вершин у ЗАДАНОМУ ПОРЯДКУ ОБХОДУ.
 *
 *  Ребро зберігається як { a, b, directed }. Якщо directed = false, ребро
 *  двонапрямлене (a <-> b); якщо true — це однонапрямлена дуга a -> b.
 * ========================================================================== */
(function (root) {
  'use strict';

  var Data = root.GraphData;

  // Порядки обходу суміжних вершин при розкритті вершини.
  var ORDERS = {
    asc:    'За зростанням номера',
    desc:   'За спаданням номера',
    cw:     'За годинниковою стрілкою',
    ccw:    'Проти годинникової стрілки',
    insert: 'У порядку задання ребер'
  };

  function Graph() {
    this.vertices = new Map();   // id -> {id, x, y}
    this.edges = [];             // [{a, b, directed}]
    this._adj = null;            // кеш списків суміжності
  }

  /* ---------------------------- вершини ----------------------------------- */

  Graph.prototype.addVertex = function (x, y, id) {
    if (id === undefined) {
      id = 1;
      while (this.vertices.has(id)) id++;      // найменший вільний номер
    }
    if (this.vertices.has(id)) return null;
    this.vertices.set(id, { id: id, x: Math.round(x), y: Math.round(y) });
    this._adj = null;
    return id;
  };

  Graph.prototype.removeVertex = function (id) {
    if (!this.vertices.has(id)) return false;
    this.vertices.delete(id);
    this.edges = this.edges.filter(function (e) { return e.a !== id && e.b !== id; });
    this._adj = null;
    return true;
  };

  Graph.prototype.moveVertex = function (id, x, y) {
    var v = this.vertices.get(id);
    if (!v) return;
    v.x = Math.round(x); v.y = Math.round(y);
    this._adj = null;
  };

  Graph.prototype.vertexList = function () {
    return Array.from(this.vertices.values()).sort(function (p, q) { return p.id - q.id; });
  };

  Graph.prototype.vertexIds = function () {
    return this.vertexList().map(function (v) { return v.id; });
  };

  /* ----------------------------- ребра ------------------------------------ */

  // Шукає будь-яке ребро/дугу, що з'єднує a і b (незалежно від напряму).
  Graph.prototype.findEdge = function (a, b) {
    for (var i = 0; i < this.edges.length; i++) {
      var e = this.edges[i];
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
    }
    return null;
  };

  Graph.prototype.addEdge = function (a, b, directed) {
    if (a === b) return false;                       // петлі не дозволені
    if (!this.vertices.has(a) || !this.vertices.has(b)) return false;
    if (this.findEdge(a, b)) return false;           // кратні ребра не дозволені
    this.edges.push({ a: a, b: b, directed: !!directed });
    this._adj = null;
    return true;
  };

  Graph.prototype.removeEdge = function (a, b) {
    var e = this.findEdge(a, b);
    if (!e) return false;
    this.edges.splice(this.edges.indexOf(e), 1);
    this._adj = null;
    return true;
  };

  // Перемикання виду зв'язку: ребро -> дуга a->b -> дуга b->a -> знову ребро.
  Graph.prototype.cycleEdgeKind = function (a, b) {
    var e = this.findEdge(a, b);
    if (!e) return null;
    if (!e.directed) {
      e.directed = true;
      if (e.a !== a) { var t0 = e.a; e.a = e.b; e.b = t0; }
    } else if (e.a === a && e.b === b) {
      var t = e.a; e.a = e.b; e.b = t;
    } else {
      e.directed = false;
    }
    this._adj = null;
    return e;
  };

  /* --------------------------- суміжність --------------------------------- */

  Graph.prototype._buildAdj = function () {
    var adj = new Map();
    var self = this;
    this.vertices.forEach(function (v) { adj.set(v.id, []); });
    this.edges.forEach(function (e, idx) {
      if (!self.vertices.has(e.a) || !self.vertices.has(e.b)) return;
      adj.get(e.a).push({ to: e.b, order: idx });
      if (!e.directed) adj.get(e.b).push({ to: e.a, order: idx });
    });
    this._adj = adj;
    return adj;
  };

  // Кут напрямку від вершини from до вершини to, відлічений від напряму "вгору"
  // за годинниковою стрілкою (екранні координати: вісь y спрямована вниз).
  Graph.prototype._angle = function (from, to) {
    var p = this.vertices.get(from), q = this.vertices.get(to);
    var ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;   // 0 = напрям "вгору"
    while (ang < 0) ang += 2 * Math.PI;
    while (ang >= 2 * Math.PI) ang -= 2 * Math.PI;
    return ang;
  };

  /**
   * Список суміжних вершин у заданому порядку обходу.
   * Саме тут реалізовано "напрям обходу вершин графу при пошуку".
   */
  Graph.prototype.neighbors = function (id, order) {
    if (!this._adj) this._buildAdj();
    var list = (this._adj.get(id) || []).slice();
    var self = this;
    switch (order) {
      case 'desc':
        list.sort(function (p, q) { return q.to - p.to; }); break;
      case 'cw':
        list.sort(function (p, q) { return self._angle(id, p.to) - self._angle(id, q.to); }); break;
      case 'ccw':
        list.sort(function (p, q) { return self._angle(id, q.to) - self._angle(id, p.to); }); break;
      case 'insert':
        list.sort(function (p, q) { return p.order - q.order; }); break;
      case 'asc':
      default:
        list.sort(function (p, q) { return p.to - q.to; }); break;
    }
    return list.map(function (n) { return n.to; });
  };

  /* ------------------------- види графа ------------------------------------ */

  Graph.prototype.loadPreset = function (kind) {
    this.vertices = new Map();
    this.edges = [];
    this._adj = null;
    var self = this;
    Data.VERTICES.forEach(function (v) { self.vertices.set(v.id, { id: v.id, x: v.x, y: v.y }); });

    var list;
    switch (kind) {
      case 'tree':                                   // дерево: лише каркас
        list = Data.TREE_EDGES.map(function (e) { return { a: e[0], b: e[1], directed: false }; });
        break;
      case 'directed':                               // оргграф: усі ребра -> дуги
        list = Data.DIGRAPH_ARCS.map(function (e) { return { a: e[0], b: e[1], directed: true }; });
        break;
      case 'tree-directed':                          // орієнтоване дерево
        list = Data.TREE_EDGES.map(function (e) { return { a: e[0], b: e[1], directed: true }; });
        break;
      case 'mixed':                                  // частина ребер замінена дугами
        list = Data.ALL_EDGES.map(function (e) {
          var key = e[0] + '-' + e[1];
          return { a: e[0], b: e[1], directed: Data.MIXED_DIRECTED.indexOf(key) >= 0 };
        });
        break;
      case 'extended':                               // той самий порядок, більший розмір
        list = Data.ALL_EDGES.concat(Data.EXTRA_EDGES)
          .map(function (e) { return { a: e[0], b: e[1], directed: false }; });
        break;
      case 'undirected':
      default:                                       // звичайний граф
        list = Data.ALL_EDGES.map(function (e) { return { a: e[0], b: e[1], directed: false }; });
        break;
    }
    this.edges = list;
    return this;
  };

  /* --------------------------- сервісне ------------------------------------ */

  Graph.prototype.order = function () { return this.vertices.size; };          // порядок
  Graph.prototype.size = function () { return this.edges.length; };            // розмір
  Graph.prototype.arcCount = function () {
    return this.edges.filter(function (e) { return e.directed; }).length;
  };
  Graph.prototype.degree = function (id) {
    if (!this._adj) this._buildAdj();
    return (this._adj.get(id) || []).length;
  };

  Graph.prototype.clone = function () {
    var g = new Graph();
    this.vertices.forEach(function (v) { g.vertices.set(v.id, { id: v.id, x: v.x, y: v.y }); });
    g.edges = this.edges.map(function (e) { return { a: e.a, b: e.b, directed: e.directed }; });
    return g;
  };

  Graph.prototype.toJSON = function () {
    return { vertices: this.vertexList(), edges: this.edges };
  };

  Graph.fromJSON = function (obj) {
    var g = new Graph();
    (obj.vertices || []).forEach(function (v) { g.vertices.set(v.id, { id: v.id, x: v.x, y: v.y }); });
    g.edges = (obj.edges || []).map(function (e) { return { a: e.a, b: e.b, directed: !!e.directed }; });
    return g;
  };

  root.Graph = Graph;
  root.TRAVERSAL_ORDERS = ORDERS;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  var _root = (typeof window !== 'undefined' ? window : globalThis);
  module.exports = { Graph: _root.Graph, ORDERS: _root.TRAVERSAL_ORDERS };
}
