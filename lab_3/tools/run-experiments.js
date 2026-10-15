/* ============================================================================
 *  tools/run-experiments.js — консольний прогін усіх дослідів (Node.js)
 *  Запуск:  node tools/run-experiments.js
 *  Результати друкуються в консоль і зберігаються у docs/experiments.json.
 * ========================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');

require(path.join(root, 'js', 'maze.js'));
require(path.join(root, 'js', 'maze-data.js'));
const Wave = require(path.join(root, 'js', 'wave.js'));
const Research = require(path.join(root, 'js', 'research.js'));

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

const f1 = x => (x === null || x === undefined ? '—' : (+x).toFixed(1));
const C = {
  label: ['Умова', r => r.label],
  op: ['Оператор', r => r.op],
  walls: ['Стін', r => r.walls],
  len: ['L', r => r.len],
  geo: ['Геом.', r => (r.geo ? r.geo.toFixed(2) : '—')],
  diag: ['Діаг.', r => (r.found ? r.diagSteps : '—')],
  waves: ['Хвиль', r => r.waves],
  exp: ['Розкрито', r => r.expanded],
  marked: ['Позначено', r => r.marked],
  chk: ['Перевірок', r => r.checks],
  front: ['Фронт', r => r.maxFront],
  cov: ['Охоплено,%', r => r.coverage.toFixed(0)],
  t: ['Час, мс', r => r.timeMs.toFixed(4)],
  parity: ['Парність', r => r.parity]
};

const main = Research.preset('main15');
console.log('Основний лабіринт: %d×%d, стін %d, прохідних %d, старт (%d,%d), ціль (%d,%d)',
  main.rows, main.cols, main.wallCount(), main.freeCount(),
  main.start.r, main.start.c, main.goal.r, main.goal.c);

const d = Research.fullSeries(main);
table('A. Оператори переходу на основному лабіринті', d.operators,
  [C.op, C.len, C.geo, C.diag, C.waves, C.exp, C.marked, C.chk, C.front, C.t]);
table('B. Оператори на лабіринтах різного виду', d.mazes,
  [C.label, C.op, C.walls, C.len, C.geo, C.waves, C.exp, C.marked, C.cov]);
table('C. Вплив розміру лабіринту', d.size,
  [C.label, C.op, C.walls, C.len, C.waves, C.exp, C.marked, C.cov, C.t]);
table('D. Вплив частки стін (поле 20×20, 30 лабіринтів на кожну частку)', d.density, [
  ['Стін,%', r => r.density], ['Оператор', r => r.op], ['Успіх,%', r => f1(r.success)],
  ['Сер. L', r => f1(r.len)], ['Сер. хвиль', r => f1(r.waves)], ['Сер. розкрито', r => f1(r.expanded)],
  ['Охоплено,%', r => f1(r.coverage)], ['Час, мс', r => r.timeMs.toFixed(4)]]);
table('E. Різні цілі на основному лабіринті', d.goals,
  [C.label, C.parity, C.op, C.len, C.waves, C.exp, C.marked]);
table('F. Хвильовий пошук і класичний пошук у ширину', d.bfs, [
  ['Оператор', r => r.op], ['L хвиля', r => r.waveLen], ['L BFS', r => r.bfsLen],
  ['Циклів хвиля', r => r.waveCycles], ['Циклів BFS', r => r.bfsCycles],
  ['Розкрито хвиля', r => r.waveExpanded], ['Розкрито BFS', r => r.bfsExpanded],
  ['Фронт / черга', r => r.maxFront + ' / ' + r.maxQueue]]);

// Розміри фронтів хвиль для основного лабіринту (для графіка у звіті)
const fronts = {};
Research.OP_KEYS.forEach(op => { fronts[op] = Wave.wave(main, op, false).fronts; });
console.log('\nРозміри фронтів хвиль (основний лабіринт):');
Object.keys(fronts).forEach(k => console.log('  ' + k + ': ' + fronts[k].join(' ')));

const strip = rows => rows.map(r => Object.assign({}, r, { path: undefined }));
const out = {
  generatedAt: new Date().toISOString(),
  main: { rows: main.rows, cols: main.cols, walls: main.wallCount(), start: main.start, goal: main.goal },
  operators: d.operators, mazes: strip(d.mazes), size: strip(d.size), density: d.density,
  goals: strip(d.goals), bfs: d.bfs, fronts: fronts
};
const outFile = path.join(root, 'docs', 'experiments.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
console.log('\nРезультати збережено у docs/experiments.json');
