/* ============================================================================
 *  search.js — єдина точка запуску алгоритмів пошуку
 *  ---------------------------------------------------------------------------
 *  Програма підтримує три алгоритми, які запускаються однаково:
 *    bfs        — пошук у ширину (OPEN — черга, FIFO);
 *    dfs        — пошук у глибину, перший знайдений шлях (OPEN — стек, LIFO);
 *    dfs-short  — пошук у глибину з поверненнями та відсіканням,
 *                 який знаходить НАЙКОРОТШИЙ шлях.
 *  Для пошуку в глибину можна задати обмеження глибини (limit > 0).
 * ========================================================================== */
(function (root) {
  'use strict';

  var ALGOS = ['bfs', 'dfs', 'dfs-short'];
  var ALGO_NAMES = {
    bfs: 'BFS (вшир)',
    dfs: 'DFS (вглиб)',
    'dfs-short': 'DFS найкоротший'
  };
  var ALGO_FULL = {
    bfs: 'Пошук у ширину (BFS)',
    dfs: 'Пошук у глибину (DFS) — перший знайдений шлях',
    'dfs-short': 'Пошук у глибину (DFS) — найкоротший шлях'
  };

  // Для BFS глибина пошуку — найбільший ярус серед розкритих вершин.
  function bfsExtras(r) {
    r.algo = 'bfs';
    r.maxDepth = 0;
    (r.closed || []).forEach(function (v) {
      var d = r.depth.get(v);
      if (d > r.maxDepth) r.maxDepth = d;
    });
    r.reopened = 0; r.pruned = 0; r.stale = 0;
    r.firstPath = r.path; r.firstCycle = r.cycles; r.bestCycle = r.cycles;
    return r;
  }

  function run(algo, graph, start, goal, order, trace, limit) {
    var r;
    if (algo === 'bfs') {
      r = bfsExtras(root.BFS.bfs(graph, start, goal, order, trace));
    } else {
      r = root.DFS.dfs(graph, start, goal, order, trace,
        { mode: algo === 'dfs-short' ? 'shortest' : 'first', limit: limit || 0 });
    }
    r.algoKey = algo;
    return r;
  }

  function measure(algo, graph, start, goal, order, limit, repeats) {
    var r;
    if (algo === 'bfs') {
      r = bfsExtras(root.BFS.measure(graph, start, goal, order, repeats));
    } else {
      r = root.DFS.measure(graph, start, goal, order,
        { mode: algo === 'dfs-short' ? 'shortest' : 'first', limit: limit || 0 }, repeats);
    }
    r.algoKey = algo;
    return r;
  }

  root.Search = { ALGOS: ALGOS, ALGO_NAMES: ALGO_NAMES, ALGO_FULL: ALGO_FULL, run: run, measure: measure };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).Search;
}
