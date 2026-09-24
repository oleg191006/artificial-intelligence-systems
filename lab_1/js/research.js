/* ============================================================================
 *  research.js — серії експериментів (п. 2 завдання)
 *  ---------------------------------------------------------------------------
 *  Один і той самий код використовується:
 *    - у браузері (кнопка «Серія експериментів» будує таблицю у вікні);
 *    - у Node.js (скрипт tools/run-experiments.js готує числа для звіту).
 *
 *  Досліджуються:
 *    A. різні напрямки обходу суміжних вершин при розкритті вершини;
 *    B. зміна напрямку пошуку (дзеркальна заміна початкової вершини і мети);
 *    C. вилучення/додавання вершин, ребер і дуг вирішального графа;
 *    D. вид графа: дерево / звичайний / орієнтований / мішаний, однакові та
 *       різні порядок і розмір.
 * ========================================================================== */
(function (root) {
  'use strict';

  var Graph = root.Graph;
  var BFS = root.BFS;

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

  function row(label, graph, start, goal, order, repeats) {
    var r = BFS.measure(graph, start, goal, order, repeats || 300);
    return {
      label: label,
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
      timeMs: r.avgTimeMs
    };
  }

  /** A. Вплив порядку обходу суміжних вершин. */
  function expOrders(start, goal, type) {
    var g = new Graph().loadPreset(type || 'undirected');
    return ORDER_KEYS.map(function (o) {
      return row('Порядок обходу', g, start, goal, o);
    });
  }

  /** B. Дзеркальна заміна початкової вершини і мети. */
  function expMirror(start, goal, type) {
    var g = new Graph().loadPreset(type || 'undirected');
    var out = [];
    ORDER_KEYS.forEach(function (o) {
      out.push(row('V' + start + ' → V' + goal, g, start, goal, o));
      out.push(row('V' + goal + ' → V' + start + ' (дзеркально)', g, goal, start, o));
    });
    return out;
  }

  /** D. Вплив виду графа при однакових початковій та цільовій вершинах. */
  function expTypes(start, goal, order) {
    return ['tree', 'undirected', 'mixed', 'directed', 'extended'].map(function (t) {
      var g = new Graph().loadPreset(t);
      var r = row(TYPE_NAMES[t], g, start, goal, order || 'asc');
      r.type = t;
      return r;
    });
  }

  /**
   * C. Модифікації вирішального графа: вилучення ребра/вершини, що входять
   *    у знайдений шлях, заміна ребра дугою, додавання "короткого" ребра.
   */
  function expModify(start, goal, order) {
    order = order || 'asc';
    var out = [];
    var base = new Graph().loadPreset('undirected');
    var r0 = BFS.bfs(base, start, goal, order, false);
    out.push(row('Вихідний граф', base, start, goal, order));

    var p = r0.path;
    if (p.length >= 3) {
      // 1) вилучення ребра, що входить у знайдений шлях
      var g1 = base.clone();
      g1.removeEdge(p[1], p[2]);
      var m1 = row('Вилучено ребро V' + p[1] + '–V' + p[2] + ' (входить у шлях)',
                   g1, start, goal, order);
      out.push(m1);

      // 2) вилучення проміжної вершини знайденого шляху
      var g2 = base.clone();
      g2.removeVertex(p[1]);
      out.push(row('Вилучено вершину V' + p[1] + ' (входить у шлях)',
                   g2, start, goal, order));

      // 3) заміна ребра шляху однонапрямленою дугою "проти" руху пошуку
      var g3 = base.clone();
      g3.removeEdge(p[1], p[2]);
      g3.addEdge(p[2], p[1], true);
      out.push(row('Ребро V' + p[1] + '–V' + p[2] + ' замінено дугою V' + p[2] + '→V' + p[1],
                   g3, start, goal, order));

      // 4) додавання ребра-"перемички" безпосередньо між кінцями шляху
      var g4 = base.clone();
      g4.addEdge(start, goal, false);
      out.push(row('Додано ребро V' + start + '–V' + goal, g4, start, goal, order));

      // 5) додавання нової вершини-містка
      var g5 = base.clone();
      var nv = g5.addVertex(600, 740);
      g5.addEdge(start, nv, false);
      g5.addEdge(nv, goal, false);
      out.push(row('Додано вершину V' + nv + ' і два ребра до неї', g5, start, goal, order));
    }
    return out;
  }

  /** Повна серія (усі чотири блоки) — використовується у звіті. */
  function fullSeries(start, goal) {
    return {
      start: start,
      goal: goal,
      orders: expOrders(start, goal, 'undirected'),
      mirror: expMirror(start, goal, 'undirected'),
      types: expTypes(start, goal, 'asc'),
      modify: expModify(start, goal, 'asc')
    };
  }

  function toCSV(rows) {
    var head = ['Умова', 'Порядок обходу', 'Старт', 'Мета', 'n', 'm', 'Шлях',
                'Довжина', 'Циклів', 'Розкрито', 'Згенеровано', 'max|OPEN|', 'Час, мс'];
    var lines = [head.join(';')];
    rows.forEach(function (r) {
      lines.push([r.label, r.order, 'V' + r.start, 'V' + r.goal, r.n, r.m,
                  r.found ? r.path : 'шляху немає', r.len, r.cycles, r.expanded,
                  r.generated, r.maxQueue,
                  r.timeMs.toFixed(4).replace('.', ',')].join(';'));
    });
    return lines.join('\n');
  }

  root.Research = {
    ORDER_KEYS: ORDER_KEYS,
    ORDER_NAMES: ORDER_NAMES,
    TYPE_NAMES: TYPE_NAMES,
    expOrders: expOrders,
    expMirror: expMirror,
    expTypes: expTypes,
    expModify: expModify,
    fullSeries: fullSeries,
    toCSV: toCSV
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).Research;
}
