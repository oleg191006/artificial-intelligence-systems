/* ============================================================================
 *  tools/run-experiments.js — консольний прогін усіх дослідів (Node.js)
 *  ---------------------------------------------------------------------------
 *  Запуск:  node tools/run-experiments.js
 *
 *  Використовує ті самі модулі, що й браузерна програма, і виводить у консоль
 *  таблиці результатів, а також зберігає їх у docs/experiments.json —
 *  саме ці числа наведені у звіті.
 * ========================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');

require(path.join(root, 'js', 'graph-data.js'));
const { Graph } = require(path.join(root, 'js', 'graph.js'));
require(path.join(root, 'js', 'bfs.js'));
require(path.join(root, 'js', 'dfs.js'));
const Search = require(path.join(root, 'js', 'search.js'));
const Research = require(path.join(root, 'js', 'research.js'));

const START = 19, GOAL = 32;     // основна пара вершин

/* ------------------------- друк таблиці в консоль ------------------------- */

function table(title, rows, cols) {
  console.log('\n' + title);
  const head = cols.map(c => c[0]);
  const body = rows.map(r => cols.map(c => String(c[1](r))));
  const w = head.map((h, i) => Math.max(h.length, ...body.map(b => b[i].length)));
  const line = cells => cells.map((c, i) => c.padEnd(w[i], ' ')).join(' | ');
  console.log(line(head));
  console.log(w.map(n => '-'.repeat(n)).join('-+-'));
  body.forEach(b => console.log(line(b)));
}

const f1 = x => x.toFixed(1);
const C = {
  cond:  ['Умова', r => r.label],
  algo:  ['Алгоритм', r => r.algo],
  order: ['Порядок обходу', r => r.order],
  nm:    ['n / m', r => `${r.n} / ${r.m}`],
  path:  ['Знайдений шлях', r => (r.found ? r.path : 'ШЛЯХУ НЕМАЄ')],
  len:   ['L', r => r.len],
  cyc:   ['Циклів', r => r.cycles],
  exp:   ['Розкрито', r => r.expanded],
  gen:   ['Згенер.', r => r.generated],
  ec:    ['Перевірок', r => r.edgeChecks],
  q:     ['max|OPEN|', r => r.maxQueue],
  dep:   ['Глибина', r => r.maxDepth],
  reo:   ['Повторно', r => r.reopened],
  t:     ['Час, мс', r => r.timeMs.toFixed(4)]
};

/* ------------------------------ досліди ---------------------------------- */

const g0 = new Graph().loadPreset('undirected');
console.log('Граф: порядок n = %d, розмір m = %d, гілок — 5.', g0.order(), g0.size());
console.log('Пошук: V%d → V%d', START, GOAL);

const data = Research.fullSeries(START, GOAL);
const mirrorDir = Research.expMirror(START, GOAL, 'directed', ['asc']);
const mirrorAsym = Research.expMirror(7, 29, 'directed', ['asc']);
const pairs = Research.expAllPairs('asc');
const pairsCw = Research.expAllPairs('cw');

table(`A. Вплив напряму обходу (V${START} → V${GOAL}, звичайний граф)`,
  data.orders, [C.order, C.algo, C.path, C.len, C.cyc, C.exp, C.gen, C.q, C.dep, C.reo, C.t]);
table('B. Дзеркальна заміна початкової вершини і мети (звичайний граф)',
  data.mirror, [C.cond, C.order, C.algo, C.path, C.len, C.cyc, C.exp, C.q, C.dep]);
table('B2. Дзеркальна заміна в оргграфі',
  mirrorDir.concat(mirrorAsym), [C.cond, C.algo, C.path, C.len, C.cyc, C.exp, C.q]);
table('C. Додавання та вилучення вершин і ребер',
  data.modify, [C.cond, C.nm, C.algo, C.path, C.len, C.cyc, C.exp, C.q, C.dep]);
table('D. Вплив виду графа (порядок обходу — за зростанням)',
  data.types, [C.cond, C.nm, C.algo, C.path, C.len, C.cyc, C.exp, C.gen, C.q, C.dep, C.reo]);
table('E. Заміна ребер на дуги і навпаки',
  data.arcs, [C.cond, C.algo, C.path, C.len, C.cyc, C.exp, C.q]);

const P = [
  ['Вид графа', r => r.label],
  ['Пар зі шляхом', r => r.found],
  ['L BFS', r => f1(r.bfsLen)],
  ['L DFS', r => f1(r.dfsLen)],
  ['DFS опт., %', r => f1(r.optimalShare)],
  ['Макс. перевищ.', r => r.maxExcess],
  ['Цикли BFS=DFS', r => f1(r.bfsCycles)],
  ['DFS швидший, %', r => f1(r.dfsFasterShare)],
  ['BFS швидший, %', r => f1(r.bfsFasterShare)],
  ['Цикли DFS*', r => f1(r.shortCycles)],
  ['OPEN BFS', r => f1(r.bfsQueue)],
  ['OPEN DFS', r => f1(r.dfsQueue)]
];
table('F. Усі пари вершин, порядок обходу за зростанням', pairs, P);
table('F2. Усі пари вершин, порядок обходу за годинниковою стрілкою', pairsCw, P);

table('G. DFS з обмеженням глибини', data.limit, [C.cond, C.path, C.len, C.cyc, C.exp, C.q, C.dep]);

/* ----- H. Повний обхід графа (мета недосяжна) — найгірший випадок -------- */

const rowsH = [];
[['tree', 'дерево'], ['undirected', 'звичайний граф'], ['extended', 'розширений граф']]
  .forEach(([kind, name]) => {
    const g = new Graph().loadPreset(kind);
    const iso = g.addVertex(1100, 745);   // ізольована вершина — мета недосяжна
    Search.ALGOS.forEach(a => {
      const r = Search.measure(a, g, START, iso, 'asc', 0, 100);
      rowsH.push({
        label: name, algo: Search.ALGO_NAMES[a], n: g.order(), m: g.size(),
        cycles: r.cycles, expanded: r.expanded, generated: r.generated,
        edgeChecks: r.edgeChecks, maxQueue: r.maxQueue, maxDepth: r.maxDepth,
        reopened: r.reopened, timeMs: r.avgTimeMs
      });
    });
  });
table('H. Повний обхід графа (мета недосяжна)', rowsH,
  [C.cond, C.nm, C.algo, C.cyc, C.exp, C.gen, C.ec, C.q, C.dep, C.reo, C.t]);

/* ----------------------------- збереження -------------------------------- */

const out = {
  generatedAt: new Date().toISOString(),
  graph: { order: g0.order(), size: g0.size(), branches: 5 },
  main: { start: START, goal: GOAL },
  orders: data.orders,
  mirror: data.mirror,
  mirrorDirected: mirrorDir,
  mirrorDirectedAsym: mirrorAsym,
  modify: data.modify,
  types: data.types,
  arcs: data.arcs,
  allPairs: pairs,
  allPairsCw: pairsCw,
  limit: data.limit,
  exhaustive: rowsH
};
const outFile = path.join(root, 'docs', 'experiments.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
console.log('\nРезультати збережено у docs/experiments.json');
