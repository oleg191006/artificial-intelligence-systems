/* ============================================================================
 *  dfs.js — сліпий (неінформований) пошук у глибину: Depth-First Search
 *  ---------------------------------------------------------------------------
 *  Алгоритм побудовано за тією самою схемою, що й пошук у ширину (bfs.js),
 *  з ОДНІЄЮ принциповою відмінністю — дисципліною списку OPEN:
 *
 *      пошук у ширину  — OPEN є ЧЕРГОЮ (FIFO): нові вершини додаються В КІНЕЦЬ;
 *      пошук у глибину — OPEN є СТЕКОМ (LIFO): нові вершини додаються НА ПОЧАТОК.
 *
 *  Через це алгоритм завжди продовжує розкривати найглибшу з отриманих
 *  вершин: іде вздовж однієї гілки "вглиб", доки вона не закінчиться, і лише
 *  тоді повертається назад (backtracking) до найближчої нерозкритої вершини.
 *
 *  Реалізовано два режими:
 *
 *  1) mode = 'first' — класичний пошук у глибину. Зупиняється на ПЕРШОМУ
 *     знайденому шляху. Цей шлях, як правило, НЕ найкоротший.
 *
 *       1. Помістити початкову вершину в OPEN.
 *       2. Якщо OPEN порожній — невдача.
 *       3. Взяти ПЕРШУ вершину з OPEN (вершину стека) — один "цикл".
 *       4. Якщо вона цільова — успіх, відновити шлях за вказівниками.
 *       5. Розкрити вершину: суміжні вершини, яких ще немає в OPEN і CLOSED,
 *          помістити НА ПОЧАТОК OPEN (у заданому порядку обходу, тож першою
 *          буде розкрита перша з них) і запам'ятати батька.
 *       6. Перенести вершину в CLOSED, перейти до п. 2.
 *
 *  2) mode = 'shortest' — пошук у глибину з поверненнями та відсіканням
 *     (метод гілок і меж). Знаходить НАЙКОРОТШИЙ шлях, як того вимагає
 *     завдання. Відмінності від режиму 'first':
 *       - після знаходження мети пошук НЕ зупиняється, а запам'ятовує шлях
 *         (рекорд) і продовжує перебір, шукаючи коротший;
 *       - вершина отримується повторно, якщо до неї знайдено КОРОТШИЙ шлях,
 *         ніж попередній (тоді змінюється її батько і глибина);
 *       - гілка відсікається, якщо вона вже не може дати шлях, коротший за
 *         рекорд (глибина + 1 >= довжина рекорду);
 *       - пошук закінчується, коли OPEN порожній: останній рекорд і є
 *         найкоротшим шляхом.
 *
 *  Додатково можна задати ОБМЕЖЕННЯ ГЛИБИНИ (limit > 0): вершини на глибині
 *  limit не розкриваються — це "пошук у глибину з обмеженням глибини".
 * ========================================================================== */
(function (root) {
  'use strict';

  /**
   * @param {Graph}   graph
   * @param {number}  start
   * @param {number}  goal
   * @param {string}  order   порядок обходу суміжних вершин
   * @param {boolean} trace   записувати покроковий протокол (для анімації)
   * @param {Object}  opts    { mode: 'first' | 'shortest', limit: число (0 — без обмеження) }
   */
  function dfs(graph, start, goal, order, trace, opts) {
    opts = opts || {};
    var mode = opts.mode === 'shortest' ? 'shortest' : 'first';
    var limit = opts.limit > 0 ? opts.limit : 0;
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    var steps = [];
    var log = [];
    var parent = new Map();          // вершина -> з якої вершини її отримано
    var depth = new Map();           // вершина -> глибина (довжина шляху в ребрах)
    var closed = [];                 // розкриті вершини у порядку розкриття
    var closedSet = new Set();

    var stats = {
      algo: 'dfs',
      mode: mode,
      limit: limit,
      cycles: 0,        // кількість циклів (узято вершин зі стека)
      expanded: 0,      // кількість розкритих вершин
      generated: 0,     // кількість занесених у стек вершин
      edgeChecks: 0,    // кількість перевірених переходів
      maxQueue: 0,      // максимальна довжина OPEN (стека)
      maxDepth: 0,      // максимальна глибина, на яку опускався пошук
      reopened: 0,      // повторні отримання вершини коротшим шляхом (режим 'shortest')
      pruned: 0,        // вершини, не розкриті через відсікання / обмеження глибини
      stale: 0,         // застарілі записи в стеку (вершину вже отримано коротшим шляхом)
      improvements: 0,  // скільки разів знайдено шлях, коротший за попередній
      firstPath: [],    // перший знайдений шлях
      firstCycle: 0,    // на якому циклі його знайдено
      bestCycle: 0,     // на якому циклі знайдено остаточний (найкоротший) шлях
      found: false,
      path: [],
      pathLength: 0,
      timeMs: 0,
      avgTimeMs: 0,
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
    function say(text) {
      if (!trace) return;
      log.push(text);
      if (steps.length) {
        steps[steps.length - 1].text += (steps[steps.length - 1].text ? '\n' : '') + text;
      }
    }
    function ids(stack) { return stack.map(function (e) { return e.v; }); }
    function chain(v) {
      var p = [], cur = v;
      while (cur !== null && cur !== undefined) { p.push(cur); cur = parent.get(cur); }
      return p.reverse();
    }

    if (!graph.vertices.has(start) || !graph.vertices.has(goal)) {
      stats.message = 'Початкова або цільова вершина відсутня у графі.';
      return finish();
    }

    // OPEN — СТЕК. Елемент 0 — вершина стека (саме її буде взято першою).
    var stack = [{ v: start, d: 0 }];
    var best = Infinity;              // довжина найкращого знайденого шляху
    parent.set(start, null);
    depth.set(start, 0);
    stats.generated = 1;
    stats.maxQueue = 1;
    push('start', { v: start, queue: ids(stack) });
    say('Ініціалізація: стек = [' + start + '], початкова вершина V' + start +
        ', мета V' + goal + (mode === 'shortest' ? ', режим: пошук найкоротшого шляху' : '') +
        (limit ? ', обмеження глибини ' + limit : '') + '.');

    while (stack.length > 0) {
      stats.cycles++;
      var top = stack.shift();                      // беремо ВЕРШИНУ стека (LIFO)
      var v = top.v, d = top.d;

      // Застарілий запис: вершину вже отримано коротшим шляхом (лише 'shortest').
      if (d > depth.get(v)) {
        stats.stale++;
        push('stale', { v: v, queue: ids(stack), cycle: stats.cycles });
        say('Цикл ' + stats.cycles + ': зі стека взято V' + v + ' (глибина ' + d +
            ') — застарілий запис, до V' + v + ' вже знайдено коротший шлях. Пропускаємо.');
        continue;
      }

      push('dequeue', { v: v, queue: ids(stack), cycle: stats.cycles, depth: d, branch: chain(v) });
      say('Цикл ' + stats.cycles + ': зі стека взято V' + v + ' (глибина ' + d +
          '). Стек: [' + ids(stack).join(', ') + '].');

      if (v === goal) {                             // перевірка на мету
        var p = chain(v);
        if (!stats.firstPath.length) { stats.firstPath = p.slice(); stats.firstCycle = stats.cycles; }
        if (mode === 'first') {
          stats.found = true;
          stats.path = p;
          stats.bestCycle = stats.cycles;
          push('goal', { v: v, path: p, final: true });
          say('V' + v + ' — цільова вершина. Пошук завершено (перший знайдений шлях).');
          break;
        }
        if (d < best) {
          best = d;
          stats.found = true;
          stats.path = p;
          stats.improvements++;
          stats.bestCycle = stats.cycles;
          push('goal', { v: v, path: p, final: false });
          say('V' + v + ' — цільова вершина! Знайдено шлях довжиною ' + d +
              (stats.improvements > 1 ? ' — коротший за попередній' : '') +
              '. Запам\'ятовуємо його і шукаємо далі коротший.');
        }
        continue;                                   // мету не розкриваємо
      }

      // ---- відсікання та обмеження глибини --------------------------------
      if (mode === 'shortest' && d + 1 >= best) {
        stats.pruned++;
        push('prune', { v: v, reason: 'bound' });
        say('   Відсікання: будь-який шлях через V' + v + ' матиме довжину ≥ ' + (d + 1) +
            ', а вже знайдено шлях довжиною ' + best + '. Повертаємось назад.');
        continue;
      }
      if (limit && d >= limit) {
        stats.pruned++;
        push('prune', { v: v, reason: 'limit' });
        say('   V' + v + ' лежить на граничній глибині ' + limit + ' — не розкриваємо, повертаємось назад.');
        continue;
      }

      // ---- розкриття вершини ----------------------------------------------
      stats.expanded++;
      if (d > stats.maxDepth) stats.maxDepth = d;
      if (!closedSet.has(v)) { closedSet.add(v); closed.push(v); }
      var nb = graph.neighbors(v, order);
      push('expand', { v: v, neighbors: nb.slice() });
      say('   Розкриваємо V' + v + '. Суміжні вершини у заданому порядку: [' + nb.join(', ') + '].');

      var fresh = [];
      for (var i = 0; i < nb.length; i++) {
        var w = nb[i], nd = d + 1;
        stats.edgeChecks++;
        if (mode === 'shortest' && nd >= best) {    // не може дати коротший шлях
          push('inspect', { from: v, to: w, status: 'bound' });
          say('      V' + w + ' — глибина ' + nd + ' ≥ рекорду ' + best + ', відсікаємо.');
          continue;
        }
        var known = depth.has(w);
        var skip = mode === 'first' ? known : (known && depth.get(w) <= nd);
        if (skip) {
          push('inspect', { from: v, to: w, status: 'seen' });
          say('      V' + w + ' — вже ' + (closedSet.has(w) ? 'розкрита' : 'є в стеку') +
              (mode === 'shortest' ? ' (глибина ' + depth.get(w) + ' ≤ ' + nd + ')' : '') +
              ', пропускаємо.');
          continue;
        }
        var reopen = known;
        if (reopen) stats.reopened++;
        parent.set(w, v);
        depth.set(w, nd);
        fresh.push({ v: w, d: nd });
        stats.generated++;
        push('enqueue', { v: w, from: v, depth: nd, reopen: reopen,
                          queue: ids(fresh).concat(ids(stack)) });
        say('      V' + w + (reopen ? ' — знайдено коротший шлях (глибина ' + nd + '), отримуємо повторно'
                                    : ' — нова (глибина ' + nd + ')') + '.');
      }
      // Нові вершини — НА ПОЧАТОК OPEN, у порядку обходу: першою з них
      // буде розкрита перша суміжна вершина.
      stack = fresh.concat(stack);
      if (stack.length > stats.maxQueue) stats.maxQueue = stack.length;
      if (fresh.length) {
        say('   На початок стека поміщено: [' + ids(fresh).join(', ') + ']. Стек: [' +
            ids(stack).join(', ') + '].');
      } else {
        say('   Нових вершин немає — глухий кут, повертаємось назад (backtracking).');
      }
    }

    push('summary', {});
    if (!stats.found) {
      say(limit
        ? 'Стек порожній: шляху V' + start + ' → V' + goal + ' у межах глибини ' + limit + ' не знайдено.'
        : 'Стек порожній, а мету не досягнуто: шляху V' + start + ' → V' + goal + ' у цьому графі не існує.');
    } else if (mode === 'shortest') {
      say('Стек порожній — перебір завершено. Найкоротший шлях знайдено на циклі ' +
          stats.bestCycle + ', покращень рекорду: ' + stats.improvements + '.');
    }
    if (stats.found) {
      stats.pathLength = stats.path.length - 1;
      say('Знайдений шлях: ' + stats.path.map(function (x) { return 'V' + x; }).join(' → ') +
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
      stats.visitedCount = depth.size;
      stats.steps = steps;
      stats.log = log;
      stats.parent = parent;
      stats.depth = depth;
      push('done', { found: stats.found, path: stats.path });
      return stats;
    }
  }

  function measure(graph, start, goal, order, opts, repeats) {
    repeats = repeats || 1000;
    var single = dfs(graph, start, goal, order, false, opts);
    var now = (typeof performance !== 'undefined' ? performance.now.bind(performance) : Date.now);
    var t0 = now();
    for (var i = 0; i < repeats; i++) dfs(graph, start, goal, order, false, opts);
    single.avgTimeMs = (now() - t0) / repeats;
    single.repeats = repeats;
    return single;
  }

  root.DFS = { dfs: dfs, measure: measure };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).DFS;
}
