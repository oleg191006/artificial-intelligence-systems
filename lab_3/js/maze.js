/* ============================================================================
 *  maze.js — модель лабіринту (одиничного графа) та оператори переходу
 *  ---------------------------------------------------------------------------
 *  Лабіринт — це матриця rows × cols, кожна клітинка якої є вершиною графа:
 *      -1  — непрохідна клітинка (стіна);
 *       0  — прохідна клітинка.
 *  Ребро між двома прохідними клітинками існує, якщо одну можна отримати з
 *  іншої ОПЕРАТОРОМ ПЕРЕХОДУ. Усі ребра мають однакову вагу 1 — тому граф
 *  називається ОДИНИЧНИМ, а довжина шляху дорівнює кількості переходів.
 *
 *  Оператори переходу:
 *      cross — «вверх-вниз-вправо-вліво» (4 сусіди);
 *      diag  — «перехід по діагоналях» (4 діагональні сусіди);
 *      combo — комбінація обох (8 сусідів).
 * ========================================================================== */
(function (root) {
  'use strict';

  var WALL = -1, FREE = 0;

  // Порядок перебору напрямків — за годинниковою стрілкою, починаючи «вгору».
  var OPERATORS = {
    cross: {
      name: 'вверх-вниз-вправо-вліво',
      short: '4 напрями',
      moves: [[-1, 0], [0, 1], [1, 0], [0, -1]]
    },
    diag: {
      name: 'перехід по діагоналях',
      short: 'діагоналі',
      moves: [[-1, 1], [1, 1], [1, -1], [-1, -1]]
    },
    combo: {
      name: 'комбінований (4 напрями + діагоналі)',
      short: '8 напрямів',
      moves: [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]]
    }
  };

  var MOVE_NAMES = {
    '-1,0': '↑', '1,0': '↓', '0,1': '→', '0,-1': '←',
    '-1,1': '↗', '1,1': '↘', '1,-1': '↙', '-1,-1': '↖'
  };

  function Maze(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.cells = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) row.push(FREE);
      this.cells.push(row);
    }
    this.start = { r: 0, c: 0 };
    this.goal = { r: rows - 1, c: cols - 1 };
  }

  /** Лабіринт з рядків: '#' — стіна, '.' — прохід, 'S' — старт, 'G' — ціль. */
  Maze.fromStrings = function (lines) {
    var m = new Maze(lines.length, lines[0].length);
    lines.forEach(function (line, r) {
      line.split('').forEach(function (ch, c) {
        m.cells[r][c] = ch === '#' ? WALL : FREE;
        if (ch === 'S') m.start = { r: r, c: c };
        if (ch === 'G') m.goal = { r: r, c: c };
      });
    });
    return m;
  };

  Maze.prototype.inside = function (r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  };
  Maze.prototype.isFree = function (r, c) {
    return this.inside(r, c) && this.cells[r][c] !== WALL;
  };
  Maze.prototype.set = function (r, c, v) {
    if (this.inside(r, c)) this.cells[r][c] = v;
  };

  /**
   * Чи дозволено перехід (r,c) → (r+dr, c+dc).
   * noCornerCut: заборонити діагональний перехід «між двома стінами», тобто
   * коли обидві клітинки, що прилягають до діагоналі, — стіни.
   */
  Maze.prototype.canMove = function (r, c, dr, dc, noCornerCut) {
    if (!this.isFree(r + dr, c + dc)) return false;
    if (noCornerCut && dr !== 0 && dc !== 0 &&
        !this.isFree(r + dr, c) && !this.isFree(r, c + dc)) return false;
    return true;
  };

  /** Зміна розмірності: вміст зберігається, нові клітинки — прохідні. */
  Maze.prototype.resize = function (rows, cols) {
    var cells = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        row.push(r < this.rows && c < this.cols ? this.cells[r][c] : FREE);
      }
      cells.push(row);
    }
    this.rows = rows; this.cols = cols; this.cells = cells;
    var clamp = function (p) {
      return { r: Math.min(p.r, rows - 1), c: Math.min(p.c, cols - 1) };
    };
    this.start = clamp(this.start);
    this.goal = clamp(this.goal);
    this.set(this.start.r, this.start.c, FREE);
    this.set(this.goal.r, this.goal.c, FREE);
  };

  Maze.prototype.clearWalls = function () {
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) this.cells[r][c] = FREE;
  };

  /**
   * Заповнення стінами з заданою часткою (0…1). Використовується генератор
   * псевдовипадкових чисел із ФІКСОВАНИМ зерном (seed), тому той самий seed
   * завжди дає той самий лабіринт — досліди відтворювані.
   */
  Maze.prototype.fillRandom = function (density, seed) {
    var rnd = mulberry32(seed >>> 0);
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        this.cells[r][c] = rnd() < density ? WALL : FREE;
      }
    }
    this.set(this.start.r, this.start.c, FREE);
    this.set(this.goal.r, this.goal.c, FREE);
  };

  Maze.prototype.wallCount = function () {
    var n = 0;
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) if (this.cells[r][c] === WALL) n++;
    return n;
  };
  Maze.prototype.freeCount = function () { return this.rows * this.cols - this.wallCount(); };

  Maze.prototype.clone = function () {
    var m = new Maze(this.rows, this.cols);
    m.cells = this.cells.map(function (row) { return row.slice(); });
    m.start = { r: this.start.r, c: this.start.c };
    m.goal = { r: this.goal.r, c: this.goal.c };
    return m;
  };

  Maze.prototype.toJSON = function () {
    return { rows: this.rows, cols: this.cols, cells: this.cells, start: this.start, goal: this.goal };
  };
  Maze.fromJSON = function (o) {
    var m = new Maze(o.rows, o.cols);
    m.cells = o.cells.map(function (row) { return row.map(function (v) { return v === WALL ? WALL : FREE; }); });
    m.start = o.start; m.goal = o.goal;
    return m;
  };

  /** Матриця лабіринту у вигляді тексту (-1 / 0). */
  Maze.prototype.toText = function (values) {
    var src = values || this.cells;
    return src.map(function (row) {
      return row.map(function (v) { return String(v).padStart(3, ' '); }).join(' ');
    }).join('\n');
  };

  // Невеликий генератор псевдовипадкових чисел із зерном (Mulberry32).
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  Maze.WALL = WALL;
  Maze.FREE = FREE;
  root.Maze = Maze;
  root.OPERATORS = OPERATORS;
  root.MOVE_NAMES = MOVE_NAMES;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  var _r = (typeof window !== 'undefined' ? window : globalThis);
  module.exports = { Maze: _r.Maze, OPERATORS: _r.OPERATORS, MOVE_NAMES: _r.MOVE_NAMES };
}
