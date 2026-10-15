/* ============================================================================
 *  app.js — керування інтерфейсом програми
 *  ---------------------------------------------------------------------------
 *    - вибір і редагування лабіринту (розмір, стіни, старт, ціль);
 *    - вибір оператора переходу;
 *    - анімація поширення хвилі із заданою затримкою (по хвилях або по
 *      клітинках), покроковий режим, миттєвий пошук;
 *    - вікна: результати, протокол, матриця, порівняння операторів, досліди.
 * ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var Maze = window.Maze, Wave = window.Wave, OPS = window.OPERATORS;
  var PRESETS = window.MazeData.PRESETS;

  var maze = Maze.fromStrings(PRESETS.main15.lines);
  var renderer = new window.Renderer($('canvas'));

  var st = { marks: null, front: new Set(), path: [], paths: null, showNums: true };
  var run = { result: null, steps: [], idx: 0, timer: null, playing: false };
  var mode = 'wall', painting = false;

  /* --------------------------- допоміжне ---------------------------------- */

  function op() { return document.querySelector('input[name="op"]:checked').value; }
  function opts() { return { noCornerCut: $('noCutChk').checked }; }
  function cellName(p) { return '(' + p[0] + ',' + p[1] + ')'; }

  function redraw() {
    renderer.draw(maze, st);
    if ($('winMatrix').style.display === 'block') showMatrix();
  }
  function resize() { renderer.fit(); redraw(); }

  function updateInfo() {
    var w = maze.wallCount(), n = maze.rows * maze.cols;
    $('mazeInfo').textContent = 'матриця ' + maze.rows + '×' + maze.cols +
      ' · прохідних (0): ' + (n - w) + ' · непрохідних (-1): ' + w +
      ' (' + Math.round(w / n * 100) + ' %)';
    $('rowsInp').value = maze.rows;
    $('colsInp').value = maze.cols;
  }

  function showMatrix() {
    $('matrixBody').textContent = maze.toText(st.marks || maze.cells);
  }

  function clearSearch() {
    stopTimer();
    run.result = null; run.steps = []; run.idx = 0;
    st.marks = null; st.front = new Set(); st.path = []; st.paths = null;
    $('logBody').innerHTML = '';
    showResults(null);
    redraw();
  }

  function appendLog(text, cls) {
    if (!text) return;
    var box = $('logBody');
    var prev = box.querySelector('.l-now');
    if (prev) prev.classList.remove('l-now');
    var span = document.createElement('span');
    span.className = 'l-now ' + (cls || '');
    span.textContent = text + '\n';
    box.appendChild(span);
    box.parentElement.scrollTop = box.parentElement.scrollHeight;
  }

  /* -------------------------- вікно результатів ---------------------------- */

  function showResults(r) {
    var t = $('resTable');
    if (!r) {
      t.innerHTML = '<tr><td colspan="2" style="color:var(--muted)">Пошук ще не виконувався.</td></tr>';
      $('pathLine').className = 'pathline';
      $('pathLine').textContent = 'Натисніть «Пуск» або «Миттєво».';
      return;
    }
    var w = maze.wallCount(), n = maze.rows * maze.cols;
    var rows = [
      ['Оператор переходу', OPS[r.operator].name],
      ['Розмір матриці', maze.rows + ' × ' + maze.cols],
      ['Прохідних / непрохідних', (n - w) + ' / ' + w + ' (' + Math.round(w / n * 100) + ' % стін)'],
      ['Старт → ціль', cellName([maze.start.r, maze.start.c]) + ' → ' + cellName([maze.goal.r, maze.goal.c])],
      ['Результат', r.found ? 'шлях знайдено' : 'шляху не існує'],
      ['Довжина шляху (переходів)', r.found ? r.pathLength : '—'],
      ['Вершин у шляху', r.found ? r.path.length : '—'],
      ['Геометрична довжина', r.found ? r.geoLength.toFixed(2) : '—'],
      ['з них діагональних переходів', r.found ? r.diagSteps : '—'],
      ['Кількість циклів (хвиль)', r.waves],
      ['Розкрито вершин (клітинок)', r.expanded],
      ['Позначено хвилею клітинок', r.marked],
      ['Перевірено переходів', r.checks],
      ['Найбільший фронт хвилі', r.maxFront],
      ['Час пошуку, мс', r.timeMs.toFixed(4)],
      ['Середній час (' + r.repeats + ' прогонів), мс', r.avgTimeMs.toFixed(5)]
    ];
    t.innerHTML = rows.map(function (p) { return '<tr><td>' + p[0] + '</td><td>' + p[1] + '</td></tr>'; }).join('');
    var pl = $('pathLine');
    if (r.found) {
      pl.className = 'pathline';
      pl.innerHTML = '<b>Вершини знайденого шляху (рядок, стовпець):</b><br>' +
        r.path.map(cellName).join(' → ');
    } else {
      pl.className = 'pathline fail';
      pl.innerHTML = '<b>Шлях не знайдено.</b><br>Хвиля згасла після ' + r.waves +
        ' циклів: ціль недосяжна з цим оператором переходу.';
    }
  }

  /* ---------------------------- анімація ----------------------------------- */

  function prepareRun() {
    clearSearch();
    var m = Wave.measure(maze, op(), opts(), 200);
    var r = Wave.wave(maze, op(), true, opts());
    r.avgTimeMs = m.avgTimeMs; r.repeats = m.repeats;
    run.result = r; run.steps = r.steps; run.idx = 0;
    return r;
  }

  function applyStep(s) {
    switch (s.kind) {
      case 'init':
        st.marks = maze.cells.map(function (row) { return row.slice(); });
        st.marks[s.r][s.c] = 1;
        st.front = new Set([s.r + ',' + s.c]);
        appendLog(s.text, 'l-wave');
        break;
      case 'wave':
        st.front = new Set(s.front.map(function (p) { return p[0] + ',' + p[1]; }));
        appendLog(s.text, 'l-wave');
        break;
      case 'mark':
        st.marks[s.r][s.c] = s.v;
        st.front.add(s.r + ',' + s.c);
        if (s.text) appendLog(s.text, 'l-goal');
        break;
      case 'waveEnd':
        st.front = new Set(s.next.map(function (p) { return p[0] + ',' + p[1]; }));
        appendLog(s.text, s.next.length ? '' : 'l-fail');
        break;
      case 'back':
        if (!st.path.length) st.path = [[maze.goal.r, maze.goal.c]];
        st.path.push([s.r, s.c]);
        st.front = new Set();
        appendLog(s.text, 'l-back');
        break;
      case 'done':
        st.front = new Set();
        if (run.result.found) st.path = run.result.path;
        break;
    }
  }

  // Один «тік» анімації: одна хвиля або одна клітинка (залежно від режиму).
  function tick() {
    if (run.idx >= run.steps.length) { finishRun(); return false; }
    var byWave = $('granSel').value === 'wave';
    do {
      var s = run.steps[run.idx++];
      applyStep(s);
      if (!byWave) { if (s.kind === 'mark' || s.kind === 'back' || s.kind === 'init') break; }
      else if (s.kind === 'waveEnd' || s.kind === 'back' || s.kind === 'init') break;
    } while (run.idx < run.steps.length);
    redraw();
    if (run.idx >= run.steps.length) { finishRun(); return false; }
    return true;
  }

  function finishRun() {
    stopTimer();
    showResults(run.result);
    redraw();
  }

  function startTimer() {
    stopTimer();
    run.playing = true;
    $('btnPause').textContent = '⏸ Пауза';
    (function loop() {
      if (!run.playing) return;
      if (!tick()) return;
      run.timer = setTimeout(loop, +$('delay').value);
    })();
  }

  function stopTimer() {
    if (run.timer) clearTimeout(run.timer);
    run.timer = null; run.playing = false;
    $('btnPause').textContent = '▶ Продовжити';
  }

  /* --------------------------- обробники ----------------------------------- */

  $('btnRun').onclick = function () { prepareRun(); startTimer(); };
  $('btnPause').onclick = function () {
    if (run.playing) stopTimer();
    else if (run.steps.length && run.idx < run.steps.length) startTimer();
  };
  $('btnStep').onclick = function () {
    stopTimer();
    if (!run.steps.length || run.idx >= run.steps.length) prepareRun();
    tick();
  };
  $('btnFast').onclick = function () {
    prepareRun();
    while (run.idx < run.steps.length) applyStep(run.steps[run.idx++]);
    finishRun();
  };
  $('btnReset').onclick = clearSearch;
  $('delay').oninput = function () { $('delayVal').textContent = this.value; };
  $('numChk').onchange = function () { st.showNums = this.checked; redraw(); };
  Array.prototype.forEach.call(document.querySelectorAll('input[name="op"]'), function (x) {
    x.onchange = clearSearch;
  });
  $('noCutChk').onchange = clearSearch;

  /* ------------------------------ лабіринт --------------------------------- */

  $('presetSel').innerHTML = Object.keys(PRESETS).map(function (k) {
    return '<option value="' + k + '">' + PRESETS[k].name + '</option>';
  }).join('');
  $('presetSel').onchange = function () {
    maze = Maze.fromStrings(PRESETS[this.value].lines);
    updateInfo(); clearSearch();
  };

  function clampSize(v) { return Math.max(5, Math.min(30, parseInt(v, 10) || 15)); }
  $('btnResize').onclick = function () {
    maze.resize(clampSize($('rowsInp').value), clampSize($('colsInp').value));
    updateInfo(); clearSearch();
  };
  $('btnClear').onclick = function () { maze.clearWalls(); updateInfo(); clearSearch(); };
  $('btnFill').onclick = function () {
    var d = Math.max(0, Math.min(70, +$('densInp').value || 0)) / 100;
    maze.fillRandom(d, +$('seedInp').value || 1);
    updateInfo(); clearSearch();
  };
  $('btnMatrix').onclick = function () {
    var w = $('winMatrix');
    w.style.display = w.style.display === 'block' ? 'none' : 'block';
    showMatrix();
  };

  /* ------------------------- редагування мишею ----------------------------- */

  var HINTS = {
    wall: 'Ведіть мишею по клітинках, щоб ставити стіни (-1).',
    free: 'Ведіть мишею по клітинках, щоб прибирати стіни (0).',
    start: 'Клацніть прохідну клітинку — вона стане СТАРТОМ.',
    goal: 'Клацніть прохідну клітинку — вона стане ЦІЛЛЮ.'
  };
  Array.prototype.forEach.call(document.querySelectorAll('.modes button'), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll('.modes button'), function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      mode = b.dataset.mode;
      $('modeHint').textContent = HINTS[mode];
    };
  });

  function editCell(cell) {
    if (!cell) return;
    var isEnd = (cell.r === maze.start.r && cell.c === maze.start.c) ||
                (cell.r === maze.goal.r && cell.c === maze.goal.c);
    if (mode === 'wall' && !isEnd) maze.set(cell.r, cell.c, Maze.WALL);
    else if (mode === 'free') maze.set(cell.r, cell.c, Maze.FREE);
    else if (mode === 'start' || mode === 'goal') {
      maze.set(cell.r, cell.c, Maze.FREE);
      maze[mode] = { r: cell.r, c: cell.c };
    }
  }

  var canvas = $('canvas');
  canvas.addEventListener('mousedown', function (ev) {
    var cell = renderer.cellAt(maze, ev.clientX, ev.clientY);
    if (!cell) return;
    if (st.marks || st.paths) clearSearch();
    painting = mode === 'wall' || mode === 'free';
    editCell(cell);
    updateInfo(); redraw();
  });
  canvas.addEventListener('mousemove', function (ev) {
    if (!painting) return;
    editCell(renderer.cellAt(maze, ev.clientX, ev.clientY));
    updateInfo(); redraw();
  });
  window.addEventListener('mouseup', function () { painting = false; });

  /* ---------------------- збереження / завантаження ------------------------ */

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  $('btnExport').onclick = function () {
    download('maze.json', JSON.stringify(maze.toJSON()), 'application/json');
  };
  $('btnImport').onclick = function () { $('fileInput').click(); };
  $('fileInput').onchange = function (ev) {
    var f = ev.target.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try { maze = Maze.fromJSON(JSON.parse(fr.result)); updateInfo(); clearSearch(); }
      catch (e) { alert('Не вдалося прочитати файл: ' + e.message); }
    };
    fr.readAsText(f);
    ev.target.value = '';
  };
  $('btnPng').onclick = function () {
    var a = document.createElement('a');
    a.href = canvas.toDataURL('image/png'); a.download = 'maze.png'; a.click();
  };

  /* ---------------------- порівняння операторів ---------------------------- */

  var PATH_COLORS = { cross: '#ffb02e', diag: '#f472b6', combo: '#22d3ee' };

  $('btnCompare').onclick = function () {
    clearSearch();
    var R = {};
    window.Research.OP_KEYS.forEach(function (k) { R[k] = Wave.measure(maze, k, opts(), 200); });
    var list = window.Research.OP_KEYS.map(function (k) { return R[k]; });
    var metrics = [
      ['Шлях знайдено', function (r) { return r.found ? 'так' : 'ні'; }, false],
      ['Довжина шляху (переходів)', function (r) { return r.found ? r.pathLength : '—'; }, true],
      ['Геометрична довжина', function (r) { return r.found ? r.geoLength.toFixed(2) : '—'; }, true],
      ['Кількість циклів (хвиль)', function (r) { return r.waves; }, false],
      ['Розкрито вершин', function (r) { return r.expanded; }, true],
      ['Позначено клітинок', function (r) { return r.marked; }, false],
      ['Перевірено переходів', function (r) { return r.checks; }, true],
      ['Найбільший фронт хвилі', function (r) { return r.maxFront; }, false],
      ['Середній час, мс', function (r) { return r.avgTimeMs.toFixed(5); }, true]
    ];
    var html = '<table class="res"><caption>Лабіринт ' + maze.rows + '×' + maze.cols + ', ' +
      cellName([maze.start.r, maze.start.c]) + ' → ' + cellName([maze.goal.r, maze.goal.c]) +
      (opts().noCornerCut ? ', діагональний прохід між стінами заборонено' : '') + '</caption><tr><th>Показник</th>' +
      window.Research.OP_KEYS.map(function (k) {
        return '<th><span class="swatch" style="background:' + PATH_COLORS[k] + '"></span>' + OPS[k].short + '</th>';
      }).join('') + '</tr>';
    metrics.forEach(function (mt) {
      var vals = list.map(mt[1]);
      var nums = list.map(function (r, i) { return r.found && /^[\d.]+$/.test(vals[i]) ? +vals[i] : null; });
      var valid = nums.filter(function (x) { return x !== null; });
      var min = Math.min.apply(null, valid);
      html += '<tr><td class="l">' + mt[0] + '</td>' + vals.map(function (v, i) {
        var cls = !list[i].found && i >= 0 && mt[0] === 'Шлях знайдено' ? ' class="fail"'
          : (mt[2] && nums[i] !== null && valid.length > 1 && nums[i] === min ? ' class="best"' : '');
        return '<td' + cls + '>' + v + '</td>';
      }).join('') + '</tr>';
    });
    html += '</table>';

    var notes = [];
    var c4 = R.cross, d = R.diag, c8 = R.combo;
    if (c8.found && c4.found) {
      notes.push('Комбінований оператор дає найкоротший шлях: <b>' + c8.pathLength + '</b> переходів проти <b>' +
        c4.pathLength + '</b> для 4 напрямів, бо може «зрізати» кути по діагоналі.');
    }
    if (!d.found) {
      var par = (maze.start.r + maze.start.c) % 2 !== (maze.goal.r + maze.goal.c) % 2;
      notes.push('Діагональний оператор шляху <b>не знайшов</b>' + (par
        ? ': старт і ціль мають різну «парність» (сума рядка і стовпця), а діагональний перехід її не змінює.'
        : ': діагональні ходи не можуть обійти стіни в цьому лабіринті.'));
    } else {
      notes.push('Діагональний оператор охопив лише <b>' + d.marked + '</b> клітинок (тільки клітинки однієї «парності»).');
    }
    notes.push('Кількість циклів (хвиль) завжди дорівнює довжині знайденого шляху: хвиля номер k досягає клітинок на відстані k.');
    html += '<div class="cmp-note">' + notes.join('<br>') + '</div>';
    $('compareBody').innerHTML = html;
    $('winCompare').style.display = 'block';
    ['winResults', 'winLog'].forEach(function (id) {
      var w = $(id), b = w.querySelector('[data-collapse]');
      if (!w.classList.contains('collapsed')) { w.classList.add('collapsed'); b.textContent = '+'; }
    });

    st.paths = [];
    [['cross', -1], ['diag', 0], ['combo', 1]].forEach(function (p) {
      if (R[p[0]].found) st.paths.push({ cells: R[p[0]].path, color: PATH_COLORS[p[0]], offset: p[1] });
    });
    redraw();
  };

  /* --------------------------- дослідження --------------------------------- */

  var lastRows = [];
  function tableOf(caption, rows, cols) {
    var head = '<tr>' + cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (r) {
      return '<tr>' + cols.map(function (c) {
        var v = c[1](r);
        var cls = c[2] ? 'l' : '';
        if (v === '—' || v === 'ні') cls += ' fail';
        return '<td class="' + cls + '">' + v + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="res"><caption>' + caption + '</caption>' + head + body + '</table><div style="height:14px"></div>';
  }

  $('btnResearch').onclick = function () {
    var d = window.Research.fullSeries(maze);
    lastRows = [].concat(d.operators, d.mazes, d.size, d.goals);
    var f1 = function (x) { return x === null || x === undefined ? '—' : (+x).toFixed(1); };
    var C = {
      label: ['Умова', function (r) { return r.label; }, true],
      op: ['Оператор', function (r) { return r.op; }, true],
      size: ['Розмір', function (r) { return r.size; }],
      walls: ['Стін', function (r) { return r.walls; }],
      len: ['L', function (r) { return r.len; }],
      geo: ['Геом.', function (r) { return r.geo ? r.geo.toFixed(2) : '—'; }],
      waves: ['Хвиль', function (r) { return r.waves; }],
      exp: ['Розкрито', function (r) { return r.expanded; }],
      marked: ['Позначено', function (r) { return r.marked; }],
      chk: ['Перевірок', function (r) { return r.checks; }],
      front: ['Макс. фронт', function (r) { return r.maxFront; }],
      cov: ['Охоплено, %', function (r) { return r.coverage.toFixed(0); }],
      t: ['Час, мс', function (r) { return r.timeMs.toFixed(4); }],
      parity: ['Парність', function (r) { return r.parity; }]
    };
    var D = [
      ['Стін, %', function (r) { return r.density; }],
      ['Оператор', function (r) { return r.op; }, true],
      ['Успіх, %', function (r) { return f1(r.success); }],
      ['Сер. L', function (r) { return f1(r.len); }],
      ['Сер. хвиль', function (r) { return f1(r.waves); }],
      ['Сер. розкрито', function (r) { return f1(r.expanded); }],
      ['Охоплено, %', function (r) { return f1(r.coverage); }]
    ];
    var F = [
      ['Оператор', function (r) { return r.op; }, true],
      ['L хвиля', function (r) { return r.waveLen; }],
      ['L BFS', function (r) { return r.bfsLen; }],
      ['Циклів: хвиля', function (r) { return r.waveCycles; }],
      ['Циклів: BFS', function (r) { return r.bfsCycles; }],
      ['Розкрито: хвиля', function (r) { return r.waveExpanded; }],
      ['Розкрито: BFS', function (r) { return r.bfsExpanded; }],
      ['Макс. фронт / черга', function (r) { return r.maxFront + ' / ' + r.maxQueue; }]
    ];
    $('researchBody').innerHTML =
      tableOf('A. Оператори переходу на поточному лабіринті ' + maze.rows + '×' + maze.cols,
        d.operators, [C.op, C.len, C.geo, C.waves, C.exp, C.marked, C.chk, C.front, C.t]) +
      tableOf('B. Оператори переходу на лабіринтах різного виду', d.mazes,
        [C.label, C.op, C.walls, C.len, C.geo, C.waves, C.exp, C.marked]) +
      tableOf('C. Вплив розміру лабіринту', d.size, [C.label, C.op, C.len, C.waves, C.exp, C.marked, C.cov, C.t]) +
      tableOf('D. Вплив частки непрохідних клітинок (поле 20×20, по 30 лабіринтів на кожну частку)', d.density, D) +
      tableOf('E. Різні цілі на основному лабіринті', d.goals, [C.label, C.parity, C.op, C.len, C.waves, C.exp]) +
      tableOf('F. Хвильовий пошук і класичний пошук у ширину', d.bfs, F);
    $('winResearch').style.display = 'block';
  };
  $('btnCsv').onclick = function () {
    if (lastRows.length) download('research.csv', '﻿' + window.Research.toCSV(lastRows), 'text/csv');
  };

  /* ------------------------ плаваючі вікна --------------------------------- */

  Array.prototype.forEach.call(document.querySelectorAll('.window'), function (w) {
    var title = w.querySelector('.title'), drag = null;
    title.addEventListener('mousedown', function (ev) {
      if (ev.target.tagName === 'BUTTON') return;
      var r = w.getBoundingClientRect(), host = w.parentElement.getBoundingClientRect();
      w.style.transform = 'none';
      w.style.left = (r.left - host.left) + 'px'; w.style.top = (r.top - host.top) + 'px';
      w.style.right = 'auto'; w.style.bottom = 'auto';
      drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, host: host };
      ev.preventDefault();
    });
    window.addEventListener('mousemove', function (ev) {
      if (!drag) return;
      w.style.left = (ev.clientX - drag.dx - drag.host.left) + 'px';
      w.style.top = (ev.clientY - drag.dy - drag.host.top) + 'px';
    });
    window.addEventListener('mouseup', function () { drag = null; });
    var c = w.querySelector('[data-collapse]');
    if (c) c.onclick = function () {
      w.classList.toggle('collapsed');
      c.textContent = w.classList.contains('collapsed') ? '+' : '—';
    };
    var x = w.querySelector('[data-close]');
    if (x) x.onclick = function () { w.style.display = 'none'; };
  });

  /* ----------------------------- запуск ------------------------------------ */

  window.addEventListener('resize', resize);
  updateInfo();
  showResults(null);
  resize();

  // Параметри адресного рядка (для відтворення рисунків звіту), напр.:
  //   index.html?preset=main15&op=combo&run=fast
  //   index.html?op=diag&goal=14-13&run=fast        — інша ціль
  //   index.html?size=20x20&fill=30-1005&run=fast   — поле 20×20, 30 % стін, seed 1005
  //   index.html?steps=12&gran=wave                 — зупинитись на 12-му кроці
  //   index.html?compare=1 · ?research=1 · ?matrix=1 · ?nocut=1
  (function applyQuery() {
    var q = new URLSearchParams(location.search);
    if (!Array.from(q.keys()).length) return;
    if (q.get('preset')) { $('presetSel').value = q.get('preset'); $('presetSel').onchange(); }
    if (q.get('size')) {
      var sz = q.get('size').split('x').map(Number);
      maze = new Maze(sz[0], sz[1]);
    }
    if (q.get('fill')) {
      var f = q.get('fill').split('-').map(Number);
      maze.fillRandom(f[0] / 100, f[1]);
    }
    var pt = function (name) {
      if (!q.get(name)) return;
      var p = q.get(name).split('-').map(Number);
      maze.set(p[0], p[1], Maze.FREE);
      maze[name] = { r: p[0], c: p[1] };
    };
    pt('start'); pt('goal');
    if (q.get('op')) document.querySelector('input[name="op"][value="' + q.get('op') + '"]').checked = true;
    if (q.get('nocut')) $('noCutChk').checked = true;
    if (q.get('gran')) $('granSel').value = q.get('gran');
    if (q.get('nums') === '0') { $('numChk').checked = false; st.showNums = false; }
    updateInfo(); clearSearch();

    if (q.get('research')) $('btnResearch').onclick();
    else if (q.get('compare')) $('btnCompare').onclick();
    else if (q.get('steps')) {
      prepareRun();
      for (var i = 0; i < +q.get('steps'); i++) if (!tick()) break;
      redraw();
    }
    else if (q.get('run') === 'fast') $('btnFast').onclick();
    else if (q.get('run')) $('btnRun').onclick();
    if (q.get('matrix')) $('btnMatrix').onclick();
  })();
})();
