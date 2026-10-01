/* ============================================================================
 *  research.js — серії експериментів (пп. 2–3 завдання)
 *  ---------------------------------------------------------------------------
 *  Один і той самий код використовується:
 *    - у браузері (кнопки «Серія експериментів» і «Порівняти BFS і DFS»);
 *    - у Node.js (скрипт tools/run-experiments.js готує числа для звіту).
 *
 *  Кожен дослід виконується ОДНОЧАСНО для трьох алгоритмів на тому самому
 *  графі й за тих самих умов (п. 3 завдання):
 *    BFS — пошук у ширину, DFS — пошук у глибину (перший знайдений шлях),
 *    DFS найкоротший — пошук у глибину з поверненнями та відсіканням.
 *
 *    A. вплив напряму (порядку) обходу суміжних вершин;
 *    B. зміна напрямку пошуку (дзеркальна заміна початкової вершини і мети);
 *    C. додавання та вилучення вершин і ребер (зміна порядку і розміру графа);
 *    D. вид графа: дерево того ж порядку, звичайний, мішаний, оргграф, розширений;
 *    E. заміна ребер на дуги і навпаки;
 *    F. узагальнене порівняння BFS і DFS на всіх парах вершин;
 *    G. пошук у глибину з обмеженням глибини.
 * ========================================================================== */
(function (root) {
  'use strict';

  var Graph = root.Graph;
  var Search = root.Search;
  var ALGOS = Search.ALGOS;

  var ORDER_KEYS = ['asc', 'desc', 'cw', 'ccw', 'insert'];
  var ORDER_NAMES = {
    asc: 'за зростанням', desc: 'за спаданням',
    cw: 'за год. стрілкою', ccw: 'проти год. стрілки',
    insert: 'порядок задання'
  };
  var TYPE_NAMES = {
    undirected: 'звичайний граф',
    directed: 'оргграф',
    tree: 'дерево',
    'tree-directed': 'орієнт. дерево',
    mixed: 'мішаний граф',
    extended: 'розширений граф'
  };

  function row(label, graph, start, goal, order, algo, limit, repeats) {
    var r = Search.measure(algo, graph, start, goal, order, limit, repeats || 200);
    return {
      label: label,
      algo: Search.ALGO_NAMES[algo],
      algoKey: algo,
      order: ORDER_NAMES[order] || order,
      orderKey: order,
      start: start,
      goal: goal,
      n: graph.order(),
      m: graph.size(),
      found: r.found,
      path: r.found ? r.path.join(' → ') : '—',
      len: r.found ? r.pathLength : '—',
      cycles: r.cycles,
      expanded: r.expanded,
      generated: r.generated,
      edgeChecks: r.edgeChecks,
      maxQueue: r.maxQueue,
      maxDepth: r.maxDepth,
      reopened: r.reopened || 0,
      pruned: r.pruned || 0,
      timeMs: r.avgTimeMs
    };
  }

  // Той самий дослід для всіх трьох алгоритмів.
  function rows3(label, graph, start, goal, order, limit) {
    return ALGOS.map(function (a) { return row(label, graph, start, goal, order, a, limit); });
  }

  /** A. Вплив напряму обходу суміжних вершин. */
  function expOrders(start, goal, type) {
    var g = new Graph().loadPreset(type || 'undirected');
    var out = [];
    ORDER_KEYS.forEach(function (o) { out = out.concat(rows3(ORDER_NAMES[o], g, start, goal, o)); });
    return out;
  }

  /** B. Дзеркальна заміна початкової вершини і мети. */
  function expMirror(start, goal, type, orders) {
    var g = new Graph().loadPreset(type || 'undirected');
    var out = [];
    (orders || ['asc', 'cw']).forEach(function (o) {
      out = out.concat(rows3('V' + start + ' → V' + goal, g, start, goal, o));
      out = out.concat(rows3('V' + goal + ' → V' + start + ' (дзеркально)', g, goal, start, o));
    });
    return out;
  }

  /**
   * C. Зміна порядку та розміру графа: вилучення і додавання вершин та ребер.
   *    Змінюються елементи найкоротшого шляху (його знаходить BFS).
   */
  function expModify(start, goal, order) {
    order = order || 'asc';
    var out = [];
    var base = new Graph().loadPreset('undirected');
    var p = root.BFS.bfs(base, start, goal, order, false).path;
    out = out.concat(rows3('Вихідний граф', base, start, goal, order));
    if (p.length < 3) return out;

    var g1 = base.clone();
    g1.removeEdge(p[1], p[2]);
    out = out.concat(rows3('Вилучено ребро V' + p[1] + '–V' + p[2], g1, start, goal, order));

    var g2 = base.clone();
    g2.removeVertex(p[1]);
    out = out.concat(rows3('Вилучено вершину V' + p[1], g2, start, goal, order));

    var g4 = base.clone();
    g4.addEdge(start, goal, false);
    out = out.concat(rows3('Додано ребро V' + start + '–V' + goal, g4, start, goal, order));

    var g5 = base.clone();
    var nv = g5.addVertex(600, 740);
    g5.addEdge(start, nv, false);
    g5.addEdge(nv, goal, false);
    out = out.concat(rows3('Додано вершину V' + nv + ' з ребрами до V' + start + ' і V' + goal,
                           g5, start, goal, order));
    return out;
  }

  /** D. Вплив виду графа при однакових початковій та цільовій вершинах. */
  function expTypes(start, goal, order) {
    var out = [];
    ['tree', 'undirected', 'mixed', 'directed', 'extended'].forEach(function (t) {
      var g = new Graph().loadPreset(t);
      rows3(TYPE_NAMES[t], g, start, goal, order || 'asc').forEach(function (r) {
        r.type = t; out.push(r);
      });
    });
    return out;
  }

  /** E. Заміна ребер на дуги і навпаки. */
  function expArcs(start, goal, order) {
    order = order || 'asc';
    var out = [];
    var base = new Graph().loadPreset('undirected');
    var p = root.BFS.bfs(base, start, goal, order, false).path;
    out = out.concat(rows3('Звичайний граф (усі ребра)', base, start, goal, order));

    if (p.length >= 3) {
      var g1 = base.clone();
      g1.removeEdge(p[1], p[2]); g1.addEdge(p[1], p[2], true);
      out = out.concat(rows3('Ребро V' + p[1] + '–V' + p[2] + ' → дуга V' + p[1] + '→V' + p[2] + ' (за рухом)',
                             g1, start, goal, order));
      var g2 = base.clone();
      g2.removeEdge(p[1], p[2]); g2.addEdge(p[2], p[1], true);
      out = out.concat(rows3('Ребро V' + p[1] + '–V' + p[2] + ' → дуга V' + p[2] + '→V' + p[1] + ' (проти руху)',
                             g2, start, goal, order));
    }

    var d = new Graph().loadPreset('directed');
    out = out.concat(rows3('Оргграф (усі дуги)', d, start, goal, order));

    // Дуги, що ведуть від кореня до V19, стають ребрами — з V19 з'являється
    // прямий вихід до хаба V1.
    var d2 = d.clone();
    [[1, 14], [14, 16], [16, 19]].forEach(function (e) { d2.removeEdge(e[0], e[1]); d2.addEdge(e[0], e[1], false); });
    out = out.concat(rows3('Оргграф: дуги 1→14, 14→16, 16→19 → ребра', d2, start, goal, order));

    var d3 = d.clone();
    d3.edges.forEach(function (e) { e.directed = false; });
    d3._adj = null;
    out = out.concat(rows3('Оргграф: усі дуги → ребра', d3, start, goal, order));
    return out;
  }

  /**
   * F. Узагальнене порівняння на ВСІХ упорядкованих парах вершин (32·31 = 992
   *    пари) для кожного виду графа: середня довжина шляху, частка випадків,
   *    коли DFS знайшов найкоротший шлях, середня трудомісткість і пам'ять.
   */
  function expAllPairs(order) {
    order = order || 'asc';
    return ['tree', 'undirected', 'mixed', 'directed', 'extended'].map(function (t) {
      var g = new Graph().loadPreset(t);
      var ids = g.vertexIds();
      var acc = { pairs: 0, found: 0, optimal: 0, excess: 0, maxExcess: 0,
                  bL: 0, dL: 0, sL: 0, bC: 0, dC: 0, sC: 0, bQ: 0, dQ: 0, sQ: 0,
                  dfsFaster: 0, bfsFaster: 0 };
      ids.forEach(function (a) {
        ids.forEach(function (b) {
          if (a === b) return;
          acc.pairs++;
          var rb = Search.run('bfs', g, a, b, order, false);
          var rd = Search.run('dfs', g, a, b, order, false);
          var rs = Search.run('dfs-short', g, a, b, order, false);
          acc.bC += rb.cycles; acc.dC += rd.cycles; acc.sC += rs.cycles;
          acc.bQ += rb.maxQueue; acc.dQ += rd.maxQueue; acc.sQ += rs.maxQueue;
          if (rd.cycles < rb.cycles) acc.dfsFaster++;
          else if (rb.cycles < rd.cycles) acc.bfsFaster++;
          if (!rb.found) return;
          acc.found++;
          acc.bL += rb.pathLength; acc.dL += rd.pathLength; acc.sL += rs.pathLength;
          var ex = rd.pathLength - rb.pathLength;
          if (ex === 0) acc.optimal++;
          acc.excess += ex;
          if (ex > acc.maxExcess) acc.maxExcess = ex;
        });
      });
      var f = acc.found || 1, n = acc.pairs;
      return {
        label: TYPE_NAMES[t], type: t, n: g.order(), m: g.size(),
        pairs: n, found: acc.found,
        bfsLen: acc.bL / f, dfsLen: acc.dL / f, shortLen: acc.sL / f,
        optimalShare: acc.optimal / f * 100, maxExcess: acc.maxExcess,
        // Середня кількість циклів BFS і DFS по всіх парах ЗБІГАЄТЬСЯ: обидва
        // алгоритми беруть кожну досяжну вершину з OPEN рівно один раз, лише в
        // різному порядку, тож сума по всіх цілях однакова. Тому порівнюється
        // частка пар, у яких швидшим виявився той чи інший алгоритм.
        bfsCycles: acc.bC / n, dfsCycles: acc.dC / n, shortCycles: acc.sC / n,
        dfsFasterShare: acc.dfsFaster / n * 100, bfsFasterShare: acc.bfsFaster / n * 100,
        bfsQueue: acc.bQ / n, dfsQueue: acc.dQ / n, shortQueue: acc.sQ / n
      };
    });
  }

  /** G. Пошук у глибину з обмеженням глибини. */
  function expLimit(start, goal, order) {
    order = order || 'asc';
    var g = new Graph().loadPreset('undirected');
    var out = [];
    [3, 5, 6, 7, 8, 10, 0].forEach(function (L) {
      var r = row(L ? 'обмеження глибини ' + L : 'без обмеження', g, start, goal, order, 'dfs', L);
      r.limit = L;
      out.push(r);
    });
    return out;
  }

  /** Повна серія — використовується у вікні «Серія експериментів» і у звіті. */
  function fullSeries(start, goal) {
    return {
      start: start,
      goal: goal,
      orders: expOrders(start, goal, 'undirected'),
      mirror: expMirror(start, goal, 'undirected'),
      modify: expModify(start, goal, 'asc'),
      types: expTypes(start, goal, 'asc'),
      arcs: expArcs(start, goal, 'asc'),
      limit: expLimit(start, goal, 'asc')
    };
  }

  function toCSV(rows) {
    var head = ['Умова', 'Алгоритм', 'Порядок обходу', 'Старт', 'Мета', 'n', 'm', 'Шлях',
                'Довжина', 'Циклів', 'Розкрито', 'Згенеровано', 'max|OPEN|', 'Макс. глибина', 'Час, мс'];
    var lines = [head.join(';')];
    rows.forEach(function (r) {
      lines.push([r.label, r.algo, r.order, 'V' + r.start, 'V' + r.goal, r.n, r.m,
                  r.found ? r.path : 'шляху немає', r.len, r.cycles, r.expanded,
                  r.generated, r.maxQueue, r.maxDepth,
                  r.timeMs.toFixed(4).replace('.', ',')].join(';'));
    });
    return lines.join('\n');
  }

  root.Research = {
    ORDER_KEYS: ORDER_KEYS,
    ORDER_NAMES: ORDER_NAMES,
    TYPE_NAMES: TYPE_NAMES,
    row: row,
    rows3: rows3,
    expOrders: expOrders,
    expMirror: expMirror,
    expModify: expModify,
    expTypes: expTypes,
    expArcs: expArcs,
    expAllPairs: expAllPairs,
    expLimit: expLimit,
    fullSeries: fullSeries,
    toCSV: toCSV
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).Research;
}
