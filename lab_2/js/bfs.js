/* ============================================================================
 *  bfs.js — сліпий (неінформований) пошук у ширину: Breadth-First Search
 *  ---------------------------------------------------------------------------
 *  Алгоритм (класична схема з методичних рекомендацій):
 *
 *    1. Помістити початкову вершину у ЧЕРГУ (список OPEN, дисципліна FIFO).
 *    2. Якщо черга порожня — пошук завершено невдачею.
 *    3. Взяти ПЕРШУ вершину з черги (це і є один "цикл" алгоритму).
 *    4. Якщо вона цільова — успіх: відновити шлях за вказівниками на батька.
 *    5. Інакше РОЗКРИТИ вершину: перебрати всі суміжні з нею вершини
 *       у заданому порядку обходу; кожну ще не відвідану занести
 *       В КІНЕЦЬ черги і запам'ятати, з якої вершини її отримано.
 *    6. Перенести розкриту вершину у список CLOSED і перейти до п. 2.
 *
 *  Оскільки нові вершини завжди дописуються в кінець черги, граф
 *  проглядається "по ярусах": спочатку всі вершини на відстані 1 від
 *  початкової, потім на відстані 2 і т. д. Тому знайдений шлях завжди
 *  МІНІМАЛЬНИЙ за кількістю ребер (для незваженого графа).
 *
 *  Функція повертає не лише шлях, а й повний протокол роботи (кроки),
 *  який використовується для покрокової анімації в інтерфейсі.
 * ========================================================================== */
(function (root) {
  'use strict';

  /**
   * @param {Graph}  graph   граф
   * @param {number} start   початкова вершина
   * @param {number} goal    цільова вершина
   * @param {string} order   порядок обходу суміжних вершин ('asc'|'desc'|'cw'|'ccw'|'insert')
   * @param {boolean} trace  чи записувати покроковий протокол (для анімації)
   */
  function bfs(graph, start, goal, order, trace) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    var steps = [];
    var log = [];
    var parent = new Map();          // вершина -> з якої вершини її відкрито
    var depth = new Map();           // вершина -> номер ярусу (довжина шляху в ребрах)
    var visited = new Set();         // вершини, вже занесені в чергу (щоб не дублювати)
    var closed = [];                 // список розкритих вершин у порядку розкриття

    var stats = {
      cycles: 0,        // кількість циклів (ітерацій) основного циклу алгоритму
      expanded: 0,      // кількість РОЗКРИТИХ вершин
      generated: 0,     // кількість згенерованих (занесених у чергу) вершин
      edgeChecks: 0,    // кількість перевірених переходів по ребрах/дугах
      maxQueue: 0,      // максимальна довжина черги
      found: false,
      path: [],
      pathLength: 0,
      timeMs: 0,        // час одного прогону
      avgTimeMs: 0,     // середній час (заповнює measure())
      repeats: 1,
      message: ''
    };

    function push(kind, obj) {
      if (!trace) return;
      obj = obj || {};
      obj.kind = kind;
      obj.text = '';
      steps.push(obj);
    }
    // Текст протоколу прив'язується до останнього зафіксованого кроку —
    // завдяки цьому вікно протоколу заповнюється синхронно з анімацією.
    function say(text) {
      if (!trace) return;
      log.push(text);
      if (steps.length) {
        steps[steps.length - 1].text += (steps[steps.length - 1].text ? '\n' : '') + text;
      }
    }

    if (!graph.vertices.has(start) || !graph.vertices.has(goal)) {
      stats.timeMs = 0;
      stats.message = 'Початкова або цільова вершина відсутня у графі.';
      return finish();
    }

    var queue = [start];             // ЧЕРГА (OPEN)
    visited.add(start);
    parent.set(start, null);
    depth.set(start, 0);
    stats.generated = 1;
    stats.maxQueue = 1;
    push('start', { v: start, queue: queue.slice() });
    say('Ініціалізація: черга = [' + start + '], початкова вершина V' + start +
        ', мета V' + goal + '.');

    while (queue.length > 0) {
      stats.cycles++;
      var v = queue.shift();                       // беремо ПЕРШУ вершину (FIFO)
      push('dequeue', { v: v, queue: queue.slice(), cycle: stats.cycles, depth: depth.get(v) });
      say('Цикл ' + stats.cycles + ': з черги взято V' + v +
          ' (ярус ' + depth.get(v) + '). Черга: [' + queue.join(', ') + '].');

      if (v === goal) {                            // перевірка на мету
        stats.found = true;
        push('goal', { v: v });
        say('V' + v + ' — цільова вершина. Пошук завершено успішно.');
        break;
      }

      // ---- розкриття вершини --------------------------------------------
      stats.expanded++;
      closed.push(v);
      var nb = graph.neighbors(v, order);
      push('expand', { v: v, neighbors: nb.slice() });
      say('   Розкриваємо V' + v + '. Суміжні вершини у заданому порядку: [' +
          nb.join(', ') + '].');

      for (var i = 0; i < nb.length; i++) {
        var w = nb[i];
        stats.edgeChecks++;
        if (visited.has(w)) {                      // вже була в черзі або розкрита
          push('inspect', { from: v, to: w, status: 'seen' });
          say('      V' + w + ' — вже відвідана, пропускаємо.');
          continue;
        }
        visited.add(w);
        parent.set(w, v);
        depth.set(w, depth.get(v) + 1);
        queue.push(w);                             // додаємо В КІНЕЦЬ черги
        stats.generated++;
        if (queue.length > stats.maxQueue) stats.maxQueue = queue.length;
        push('enqueue', { v: w, from: v, queue: queue.slice(), depth: depth.get(w) });
        say('      V' + w + ' — нова, додано в кінець черги (ярус ' + depth.get(w) + ').');
      }
    }

    push('summary', {});
    if (!stats.found) {
      say('Черга порожня, а мету не досягнуто: шляху V' + start + ' → V' + goal +
          ' у цьому графі не існує.');
    }

    // ---- відновлення шляху за вказівниками на батька ----------------------
    if (stats.found) {
      var path = [], cur = goal;
      while (cur !== null && cur !== undefined) { path.push(cur); cur = parent.get(cur); }
      path.reverse();
      stats.path = path;
      stats.pathLength = path.length - 1;
      say('Знайдений шлях: ' + path.map(function (p) { return 'V' + p; }).join(' → ') +
          ' (довжина ' + stats.pathLength + ' ребер).');
    }

    return finish();

    function finish() {
      var t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      stats.timeMs = t1 - t0;
      stats.start = start;
      stats.goal = goal;
      stats.order = order;
      stats.closed = closed;
      stats.visitedCount = visited.size;
      stats.steps = steps;
      stats.log = log;
      stats.parent = parent;
      stats.depth = depth;
      push('done', { found: stats.found, path: stats.path });
      return stats;
    }
  }

  /**
   * Вимірювання часу пошуку. Один прогін триває мікросекунди, тому для
   * стабільного результату алгоритм проганяється repeats разів і береться
   * середнє (крім того, окремо повертається час першого "чистого" прогону).
   */
  function measure(graph, start, goal, order, repeats) {
    repeats = repeats || 1000;
    var single = bfs(graph, start, goal, order, false);
    var now = (typeof performance !== 'undefined' ? performance.now.bind(performance) : Date.now);
    var t0 = now();
    for (var i = 0; i < repeats; i++) bfs(graph, start, goal, order, false);
    var t1 = now();
    single.avgTimeMs = (t1 - t0) / repeats;
    single.repeats = repeats;
    return single;
  }

  root.BFS = { bfs: bfs, measure: measure };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).BFS;
}
