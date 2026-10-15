/* ============================================================================
 *  research.js — серії експериментів
 *  ---------------------------------------------------------------------------
 *  Один і той самий код працює в браузері (вікно «Серія експериментів») і в
 *  Node.js (скрипт tools/run-experiments.js готує числа для звіту).
 *
 *    A. оператори переходу на одному лабіринті (однакові старт і ціль);
 *    B. оператори на лабіринтах різного виду;
 *    C. вплив розміру лабіринту (10×10, 15×15, 20×20);
 *    D. вплив співвідношення прохідних і непрохідних клітинок;
 *    E. різні цілі (у т. ч. «парність» клітинок для діагонального оператора);
 *    F. хвильовий пошук і класичний пошук у ширину.
 * ========================================================================== */
(function (root) {
  'use strict';

  var Maze = root.Maze, Wave = root.Wave, OPS = root.OPERATORS;
  var PRESETS = root.MazeData.PRESETS;
  var OP_KEYS = ['cross', 'diag', 'combo'];
  var OP_NAMES = { cross: '4 напрями (✚)', diag: 'діагоналі (✖)', combo: '8 напрямів (✳)' };

  function preset(key) { return Maze.fromStrings(PRESETS[key].lines); }

  function row(label, maze, op, opts, repeats) {
    var r = Wave.measure(maze, op, opts, repeats || 100);
    var free = maze.freeCount();
    return {
      label: label,
      op: OP_NAMES[op] + (opts && opts.noCornerCut ? ', без «зрізання кутів»' : ''),
      opKey: op,
      size: maze.rows + '×' + maze.cols,
      walls: maze.wallCount(),
      free: free,
      wallShare: maze.wallCount() / (maze.rows * maze.cols) * 100,
      found: r.found,
      len: r.found ? r.pathLength : '—',
      geo: r.found ? r.geoLength : null,
      diagSteps: r.diagSteps,
      waves: r.waves,
      expanded: r.expanded,
      marked: r.marked,
      checks: r.checks,
      maxFront: r.maxFront,
      coverage: r.marked / free * 100,
      timeMs: r.avgTimeMs,
      path: r.path
    };
  }

  /** A. Оператори переходу на одному лабіринті. */
  function expOperators(maze) {
    var out = OP_KEYS.map(function (op) { return row('', maze, op); });
    out.push(row('', maze, 'diag', { noCornerCut: true }));
    out.push(row('', maze, 'combo', { noCornerCut: true }));
    return out;
  }

  /** B. Оператори на лабіринтах різного виду. */
  function expMazes() {
    var out = [];
    ['main15', 'corridor15', 'diag15', 'empty15'].forEach(function (k) {
      var m = preset(k);
      OP_KEYS.forEach(function (op) { out.push(row(PRESETS[k].name, m, op)); });
      if (k === 'diag15') out.push(row(PRESETS[k].name, m, 'diag', { noCornerCut: true }));
    });
    return out;
  }

  /** C. Вплив розміру лабіринту. */
  function expSize() {
    var out = [];
    [['small10', 'лабіринт 10×10'], ['main15', 'лабіринт 15×15'], ['big20', 'лабіринт 20×20']]
      .forEach(function (p) {
        var m = preset(p[0]);
        OP_KEYS.forEach(function (op) { out.push(row(p[1], m, op)); });
      });
    [10, 15, 20].forEach(function (n) {
      var m = new Maze(n, n);
      OP_KEYS.forEach(function (op) { out.push(row('порожнє поле ' + n + '×' + n, m, op)); });
    });
    return out;
  }

  /**
   * D. Співвідношення прохідних і непрохідних клітинок: поле n×n, частка стін
   *    0…50 %, для кожної частки — seeds лабіринтів із фіксованими зернами.
   */
  function expDensity(n, densities, seeds) {
    n = n || 20;
    densities = densities || [0, 10, 20, 30, 40, 50];
    seeds = seeds || 30;
    var out = [];
    densities.forEach(function (d) {
      OP_KEYS.forEach(function (op) {
        var acc = { found: 0, len: 0, waves: 0, expanded: 0, marked: 0, free: 0, checks: 0, time: 0 };
        for (var s = 1; s <= seeds; s++) {
          var m = new Maze(n, n);
          m.fillRandom(d / 100, 1000 + s);
          var r = Wave.measure(m, op, null, 20);
          acc.free += m.freeCount();
          acc.waves += r.waves; acc.expanded += r.expanded; acc.marked += r.marked;
          acc.checks += r.checks; acc.time += r.avgTimeMs;
          if (r.found) { acc.found++; acc.len += r.pathLength; }
        }
        out.push({
          density: d, op: OP_NAMES[op], opKey: op, seeds: seeds,
          success: acc.found / seeds * 100,
          len: acc.found ? acc.len / acc.found : null,
          waves: acc.waves / seeds,
          expanded: acc.expanded / seeds,
          marked: acc.marked / seeds,
          coverage: acc.marked / acc.free * 100,
          checks: acc.checks / seeds,
          timeMs: acc.time / seeds
        });
      });
    });
    return out;
  }

  /** E. Різні цілі на одному лабіринті. */
  function expGoals(maze, goals) {
    var out = [];
    goals.forEach(function (g) {
      var m = maze.clone();
      m.goal = { r: g[0], c: g[1] };
      m.set(g[0], g[1], 0);
      var parity = (m.start.r + m.start.c) % 2 === (g[0] + g[1]) % 2 ? 'однакова' : 'різна';
      OP_KEYS.forEach(function (op) {
        var r = row('(' + m.start.r + ',' + m.start.c + ') → (' + g[0] + ',' + g[1] + ')', m, op);
        r.parity = parity;
        out.push(r);
      });
    });
    return out;
  }

  /** F. Хвильовий пошук і класичний пошук у ширину. */
  function expBfs(maze) {
    return OP_KEYS.map(function (op) {
      var w = Wave.wave(maze, op, false);
      var b = Wave.bfsGrid(maze, op);
      return {
        op: OP_NAMES[op], opKey: op,
        waveLen: w.found ? w.pathLength : '—', bfsLen: b.found ? b.pathLength : '—',
        waveCycles: w.waves, bfsCycles: b.cycles,
        waveExpanded: w.expanded, bfsExpanded: b.expanded,
        maxFront: w.maxFront, maxQueue: b.maxQueue
      };
    });
  }

  function fullSeries(maze) {
    var main = preset('main15');
    return {
      operators: expOperators(maze || main),
      mazes: expMazes(),
      size: expSize(),
      density: expDensity(20, [0, 10, 20, 30, 40, 50], 30),
      goals: expGoals(main, [[14, 14], [7, 7], [0, 6], [14, 13], [11, 0]]),
      bfs: expBfs(maze || main)
    };
  }

  function toCSV(rows) {
    var head = ['Умова', 'Оператор', 'Розмір', 'Стін', 'Шлях знайдено', 'Довжина (переходів)',
                'Геометрична довжина', 'Хвиль (циклів)', 'Розкрито', 'Позначено', 'Перевірок', 'Макс. фронт', 'Час, мс'];
    var lines = [head.join(';')];
    rows.forEach(function (r) {
      lines.push([r.label, r.op, r.size, r.walls, r.found ? 'так' : 'ні', r.len,
                  r.geo ? r.geo.toFixed(2).replace('.', ',') : '—', r.waves, r.expanded, r.marked,
                  r.checks, r.maxFront, r.timeMs.toFixed(4).replace('.', ',')].join(';'));
    });
    return lines.join('\n');
  }

  root.Research = {
    OP_KEYS: OP_KEYS, OP_NAMES: OP_NAMES, preset: preset, row: row,
    expOperators: expOperators, expMazes: expMazes, expSize: expSize,
    expDensity: expDensity, expGoals: expGoals, expBfs: expBfs,
    fullSeries: fullSeries, toCSV: toCSV
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).Research;
}
