/* ============================================================================
 *  wave.js — одно-направлений хвильовий пошук (хвильовий алгоритм Лі)
 *  ---------------------------------------------------------------------------
 *  Хвильовий алгоритм — це модифікація пошуку в ширину для одиничного графа,
 *  заданого матрицею (лабіринтом). Замість списків OPEN/CLOSED і вказівників
 *  на батьків він записує ПОЗНАЧКИ ХВИЛІ просто в матрицю лабіринту.
 *
 *  1. Поширення хвилі (прямий хід):
 *     - стартова клітинка отримує позначку 1;
 *     - ЦИКЛ = ОДНА ХВИЛЯ: для кожної клітинки фронту хвилі з позначкою k
 *       усі сусідні (за оператором переходу) прохідні клітинки з позначкою 0
 *       отримують позначку k + 1 і утворюють новий фронт;
 *     - хвиля поширюється, доки не досягне цілі (успіх) або доки новий фронт
 *       не виявиться порожнім (хвиля «згасла» — шляху немає).
 *
 *  2. Відновлення шляху (зворотний хід):
 *     - від цілі з позначкою L рухаємося до сусідньої клітинки з позначкою
 *       L − 1, потім L − 2, … до стартової клітинки з позначкою 1;
 *     - вказівники на батьків не потрібні: шлях «читається» з матриці.
 *
 *  Позначка цілі мінус 1 — це довжина найкоротшого шляху (кількість
 *  переходів), бо хвиля номер k досягає саме клітинок на відстані k.
 * ========================================================================== */
(function (root) {
  'use strict';

  var OPS = root.OPERATORS;
  var WALL = -1;

  function key(r, c) { return r + ',' + c; }

  // «1 клітинка», «3 клітинки», «5 клітинок»
  function cells(n) {
    var m10 = n % 10, m100 = n % 100;
    var w = m10 === 1 && m100 !== 11 ? 'клітинка'
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'клітинки' : 'клітинок';
    return n + ' ' + w;
  }

  /**
   * @param {Maze}    maze
   * @param {string}  opKey   оператор переходу: 'cross' | 'diag' | 'combo'
   * @param {boolean} trace   записувати покроковий протокол (для анімації)
   * @param {Object}  opts    { noCornerCut: bool }
   */
  function wave(maze, opKey, trace, opts) {
    opts = opts || {};
    var noCut = !!opts.noCornerCut;
    var moves = OPS[opKey].moves;
    var t0 = now();

    // Робоча копія матриці: у неї записуються позначки хвилі.
    var M = maze.cells.map(function (row) { return row.slice(); });
    var S = maze.start, G = maze.goal;

    var steps = [], log = [];
    var stats = {
      operator: opKey,
      waves: 0,          // кількість циклів = кількість хвиль
      expanded: 0,       // розкрито клітинок (переглянуто їхніх сусідів)
      marked: 0,         // позначено клітинок (досягнуто хвилею)
      checks: 0,         // перевірено переходів
      maxFront: 0,       // найбільший фронт хвилі
      found: false,
      path: [],
      pathLength: 0,     // кількість переходів
      geoLength: 0,      // геометрична довжина (діагональ = √2)
      diagSteps: 0,
      fronts: [],        // розміри фронтів хвиль
      message: ''
    };

    function push(kind, obj) { if (trace) { obj = obj || {}; obj.kind = kind; obj.text = ''; steps.push(obj); } }
    function say(text) {
      if (!trace) return;
      log.push(text);
      if (steps.length) {
        var s = steps[steps.length - 1];
        s.text += (s.text ? '\n' : '') + text;
      }
    }
    function cellName(r, c) { return '(' + r + ',' + c + ')'; }

    if (!maze.isFree(S.r, S.c) || !maze.isFree(G.r, G.c)) {
      stats.message = 'Старт або ціль розташовані на непрохідній клітинці.';
      return finish();
    }

    M[S.r][S.c] = 1;
    stats.marked = 1;
    var front = [[S.r, S.c]];
    stats.maxFront = 1;
    stats.fronts.push(1);
    push('init', { r: S.r, c: S.c });
    say('Ініціалізація: стартова клітинка ' + cellName(S.r, S.c) + ' отримує позначку 1, ціль ' +
        cellName(G.r, G.c) + '. Оператор переходу: «' + OPS[opKey].name + '».');

    if (S.r === G.r && S.c === G.c) { stats.found = true; }

    // ---------------- прямий хід: поширення хвилі ----------------
    while (!stats.found && front.length > 0) {
      stats.waves++;
      var k = stats.waves;                    // поточна позначка фронту
      var next = [];
      push('wave', { k: k, front: front.slice() });
      say('Хвиля ' + k + ': фронт (' + cells(front.length) + ' з позначкою ' + k + ')' +
          ' поширюється на сусідні клітинки (позначка ' + (k + 1) + ').');

      for (var i = 0; i < front.length && !stats.found; i++) {
        var r = front[i][0], c = front[i][1];
        stats.expanded++;
        for (var j = 0; j < moves.length; j++) {
          var dr = moves[j][0], dc = moves[j][1];
          var nr = r + dr, nc = c + dc;
          stats.checks++;
          if (!maze.canMove(r, c, dr, dc, noCut)) continue;
          if (M[nr][nc] !== 0) continue;      // вже позначена хвилею
          M[nr][nc] = k + 1;
          stats.marked++;
          next.push([nr, nc]);
          push('mark', { r: nr, c: nc, v: k + 1, from: [r, c] });
          if (nr === G.r && nc === G.c) {
            stats.found = true;
            say('   Хвиля досягла цілі ' + cellName(nr, nc) + ': позначка ' + (k + 1) + '.');
            break;
          }
        }
      }
      if (next.length > stats.maxFront) stats.maxFront = next.length;
      stats.fronts.push(next.length);
      push('waveEnd', { k: k, next: next.slice() });
      if (!stats.found) {
        say('   Новий фронт: ' + cells(next.length) + '.' +
            (next.length ? '' : ' Хвиля згасла — шляху не існує.'));
      }
      front = next;
    }

    // ---------------- зворотний хід: відновлення шляху ----------------
    if (stats.found) {
      var path = [[G.r, G.c]];
      var cr = G.r, cc = G.c;
      say('Зворотний хід: від цілі рухаємося до сусідньої клітинки з позначкою на 1 меншою.');
      while (M[cr][cc] > 1) {
        var v = M[cr][cc], moved = false;
        for (var q = 0; q < moves.length; q++) {
          // попередня клітинка p така, що з неї оператором можна перейти в (cr,cc)
          var pr = cr - moves[q][0], pc = cc - moves[q][1];
          if (maze.inside(pr, pc) && M[pr][pc] === v - 1 &&
              maze.canMove(pr, pc, moves[q][0], moves[q][1], noCut)) {
            cr = pr; cc = pc; moved = true;
            break;
          }
        }
        if (!moved) break;                    // теоретично неможливо
        path.push([cr, cc]);
        push('back', { r: cr, c: cc, v: v - 1 });
        say('   ' + cellName(cr, cc) + ' — позначка ' + (v - 1) + '.');
      }
      path.reverse();
      stats.path = path;
      stats.pathLength = path.length - 1;
      for (var p = 1; p < path.length; p++) {
        var diag = path[p][0] !== path[p - 1][0] && path[p][1] !== path[p - 1][1];
        if (diag) stats.diagSteps++;
        stats.geoLength += diag ? Math.SQRT2 : 1;
      }
      say('Знайдений шлях (' + stats.pathLength + ' переходів): ' +
          path.map(function (x) { return cellName(x[0], x[1]); }).join(' → '));
    } else if (!stats.message) {
      stats.message = 'Хвиля згасла: ціль недосяжна.';
    }
    return finish();

    function finish() {
      stats.timeMs = now() - t0;
      stats.matrix = M;
      stats.steps = steps;
      stats.log = log;
      push('done', { found: stats.found });
      return stats;
    }
  }

  /**
   * Класичний пошук у ширину на тому самому лабіринті — для порівняння з
   * хвильовим алгоритмом: OPEN — черга, цикл = одна вершина, батьки — у Map.
   */
  function bfsGrid(maze, opKey, opts) {
    opts = opts || {};
    var moves = OPS[opKey].moves, noCut = !!opts.noCornerCut;
    var S = maze.start, G = maze.goal;
    var t0 = now();
    var parent = new Map(), queue = [[S.r, S.c]];
    parent.set(key(S.r, S.c), null);
    var st = { cycles: 0, expanded: 0, checks: 0, maxQueue: 1, found: false, pathLength: 0 };
    while (queue.length) {
      st.cycles++;
      var cur = queue.shift();
      if (cur[0] === G.r && cur[1] === G.c) { st.found = true; break; }
      st.expanded++;
      for (var j = 0; j < moves.length; j++) {
        st.checks++;
        var nr = cur[0] + moves[j][0], nc = cur[1] + moves[j][1];
        if (!maze.canMove(cur[0], cur[1], moves[j][0], moves[j][1], noCut)) continue;
        var k = key(nr, nc);
        if (parent.has(k)) continue;
        parent.set(k, cur);
        queue.push([nr, nc]);
      }
      if (queue.length > st.maxQueue) st.maxQueue = queue.length;
    }
    if (st.found) {
      var n = 0, p = parent.get(key(G.r, G.c));
      while (p) { n++; p = parent.get(key(p[0], p[1])); }
      st.pathLength = n;
    }
    st.timeMs = now() - t0;
    return st;
  }

  function measure(maze, opKey, opts, repeats) {
    repeats = repeats || 300;
    var r = wave(maze, opKey, false, opts);
    var t0 = now();
    for (var i = 0; i < repeats; i++) wave(maze, opKey, false, opts);
    r.avgTimeMs = (now() - t0) / repeats;
    r.repeats = repeats;
    return r;
  }

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  root.Wave = { wave: wave, bfsGrid: bfsGrid, measure: measure };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).Wave;
}
