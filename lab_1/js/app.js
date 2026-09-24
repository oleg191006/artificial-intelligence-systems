/* ============================================================================
 *  app.js — керування інтерфейсом програми
 *  ---------------------------------------------------------------------------
 *  Відповідає за:
 *    - зв'язок елементів керування з моделлю графа і алгоритмом BFS;
 *    - покрокову анімацію пошуку (Пуск / Пауза / Крок / Швидкий пошук);
 *    - редагування графа мишею (вершини, ребра, дуги, напрями);
 *    - виведення результатів у окремих вікнах інтерфейсу
 *      (результати пошуку, протокол роботи, серія експериментів);
 *    - збереження/завантаження графа (JSON) та рисунка (PNG).
 * ========================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------ стан ------------------------------------ */

  var graph = new window.Graph().loadPreset('undirected');
  var renderer = new window.Renderer($('canvas'));

  var st = {
    start: 19,
    goal: 32,
    order: 'asc',
    open: new Set(),
    closed: new Set(),
    current: null,
    path: [],
    parent: new Map(),
    depth: new Map(),
    inspect: null,
    selected: null,
    showDepth: true
  };

  var run = {
    result: null,      // результат останнього пошуку
    steps: [],
    idx: 0,
    timer: null,
    playing: false,
    queue: []
  };

  var mode = 'move';
  var pendingVertex = null;   // перша вибрана вершина при побудові ребра
  var dragging = null;

  /* --------------------------- допоміжне ---------------------------------- */

  function redraw() { renderer.draw(graph, st); }

  function resize() { renderer.fit(); redraw(); }

  function updateGraphInfo() {
    var arcs = graph.arcCount();
    $('graphInfo').textContent =
      'порядок n = ' + graph.order() + ' · розмір m = ' + graph.size() +
      (arcs ? ' (з них дуг: ' + arcs + ')' : ' (усі ребра ненапрямлені)');
  }

  function fillVertexSelects() {
    var ids = graph.vertexIds();
    [['startSel', 'start'], ['goalSel', 'goal']].forEach(function (pair) {
      var sel = $(pair[0]), key = pair[1];
      if (ids.indexOf(st[key]) < 0) st[key] = ids[0];
      sel.innerHTML = ids.map(function (id) {
        return '<option value="' + id + '"' + (id === st[key] ? ' selected' : '') + '>V' + id + '</option>';
      }).join('');
    });
  }

  function clearSearchState() {
    stopTimer();
    run.result = null; run.steps = []; run.idx = 0; run.queue = [];
    st.open = new Set(); st.closed = new Set();
    st.current = null; st.path = []; st.parent = new Map();
    st.depth = new Map(); st.inspect = null;
    $('logBody').innerHTML = '';
    showResults(null);
    redraw();
  }

  /* -------------------------- вікно результатів ---------------------------- */

  function showResults(r) {
    var t = $('resTable');
    if (!r) {
      t.innerHTML = '<tr><td colspan="2" style="color:var(--muted)">Пошук ще не виконувався.</td></tr>';
      $('pathLine').className = 'pathline';
      $('pathLine').textContent = 'Натисніть «Пуск» або «Швидкий пошук».';
      $('queueView').innerHTML = '';
      return;
    }
    var rows = [
      ['Вид графа', $('graphType').selectedOptions[0].textContent.split(' (')[0]],
      ['Порядок / розмір графа', 'n = ' + graph.order() + ', m = ' + graph.size()],
      ['Початкова → цільова', 'V' + r.start + ' → V' + r.goal],
      ['Порядок обходу', window.Research.ORDER_NAMES[r.order]],
      ['Результат', r.found ? 'шлях знайдено' : 'шляху не існує'],
      ['Довжина шляху, ребер', r.found ? r.pathLength : '—'],
      ['Кількість циклів алгоритму', r.cycles],
      ['Розкрито вершин (CLOSED)', r.expanded],
      ['Згенеровано вершин', r.generated],
      ['Перевірено переходів', r.edgeChecks],
      ['Макс. довжина черги', r.maxQueue],
      ['Час пошуку, мс', r.timeMs.toFixed(4)],
      ['Середній час (' + r.repeats + ' прогонів), мс', r.avgTimeMs.toFixed(5)]
    ];
    t.innerHTML = rows.map(function (p) {
      return '<tr><td>' + p[0] + '</td><td>' + p[1] + '</td></tr>';
    }).join('');

    var pl = $('pathLine');
    if (r.found) {
      pl.className = 'pathline';
      pl.innerHTML = '<b>Знайдений шлях:</b><br>' +
        r.path.map(function (v) { return 'V' + v; }).join(' → ');
    } else {
      pl.className = 'pathline fail';
      pl.innerHTML = '<b>Шлях не знайдено.</b><br>Черга вичерпалась після ' +
        r.cycles + ' циклів; вершина V' + r.goal + ' недосяжна з V' + r.start + '.';
    }
  }

  function showQueue(queue) {
    var box = $('queueView');
    if (!queue || !queue.length) { box.innerHTML = '<em>черга порожня</em>'; return; }
    box.innerHTML = '<em>черга (OPEN):</em>' + queue.map(function (v, i) {
      return '<b class="' + (i === 0 ? 'first' : '') + '">V' + v + '</b>';
    }).join('');
  }

  function appendLog(text, kind) {
    if (!text) return;
    var box = $('logBody');
    var prev = box.querySelector('.l-now');
    if (prev) prev.classList.remove('l-now');
    var div = document.createElement('span');
    div.className = 'l-now ' + (kind || '');
    div.textContent = text + '\n';
    box.appendChild(div);
    box.parentElement.scrollTop = box.parentElement.scrollHeight;
  }

  /* ---------------------------- анімація ----------------------------------- */

  function prepareRun() {
    st.start = parseInt($('startSel').value, 10);
    st.goal = parseInt($('goalSel').value, 10);
    st.order = $('orderSel').value;
    clearSearchState();
    var r = window.BFS.measure(graph, st.start, st.goal, st.order, 300);
    var traced = window.BFS.bfs(graph, st.start, st.goal, st.order, true);
    traced.avgTimeMs = r.avgTimeMs;
    traced.repeats = r.repeats;
    run.result = traced;
    run.steps = traced.steps;
    run.idx = 0;
    return traced;
  }

  function applyStep(s) {
    switch (s.kind) {
      case 'start':
        st.open.add(s.v); run.queue = s.queue; break;
      case 'dequeue':
        if (st.current !== null) st.closed.add(st.current);
        st.current = s.v; st.open.delete(s.v); run.queue = s.queue;
        st.inspect = null;
        break;
      case 'expand':
        break;
      case 'inspect':
        st.inspect = { from: s.from, to: s.to }; break;
      case 'enqueue':
        st.open.add(s.v);
        st.parent.set(s.v, s.from);
        st.depth.set(s.v, s.depth);
        st.inspect = { from: s.from, to: s.v };
        run.queue = s.queue;
        break;
      case 'goal':
        st.inspect = null; break;
      case 'summary':
      case 'done':
        if (run.result && run.result.found) st.path = run.result.path;
        st.current = null; st.inspect = null;
        break;
    }
    var cls = s.kind === 'dequeue' ? 'l-cycle'
      : s.kind === 'enqueue' ? 'l-open'
      : s.kind === 'inspect' ? 'l-skip'
      : s.kind === 'goal' ? 'l-goal' : '';
    appendLog(s.text, cls);
    showQueue(run.queue);
  }

  function stepOnce() {
    if (!run.steps.length) prepareRun();
    if (run.idx >= run.steps.length) { stopTimer(); showResults(run.result); return false; }
    applyStep(run.steps[run.idx++]);
    if (run.idx >= run.steps.length) { stopTimer(); showResults(run.result); }
    redraw();
    return run.idx < run.steps.length;
  }

  function startTimer() {
    stopTimer();
    run.playing = true;
    $('btnPause').textContent = '⏸ Пауза';
    var fps = parseInt($('speed').value, 10);
    run.timer = setInterval(function () {
      if (!stepOnce()) stopTimer();
    }, 1000 / fps);
  }

  function stopTimer() {
    if (run.timer) clearInterval(run.timer);
    run.timer = null;
    run.playing = false;
    var b = $('btnPause');
    if (b) b.textContent = '▶ Продовжити';
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
    stepOnce();
  };

  $('btnFast').onclick = function () {
    var r = prepareRun();
    // одразу програємо всі кроки без анімації
    while (run.idx < run.steps.length) applyStep(run.steps[run.idx++]);
    st.closed = new Set(r.closed);
    st.open = new Set();
    showResults(r);
    redraw();
  };

  $('btnReset').onclick = clearSearchState;

  $('btnSwap').onclick = function () {
    var s = $('startSel').value, g = $('goalSel').value;
    $('startSel').value = g; $('goalSel').value = s;
    st.start = parseInt(g, 10); st.goal = parseInt(s, 10);
    clearSearchState();
  };

  $('speed').oninput = function () {
    $('speedVal').textContent = this.value;
    if (run.playing) startTimer();
  };

  $('graphType').onchange = function () {
    graph.loadPreset(this.value);
    fillVertexSelects();
    updateGraphInfo();
    clearSearchState();
  };

  $('btnReload').onclick = function () {
    graph.loadPreset($('graphType').value);
    fillVertexSelects();
    updateGraphInfo();
    clearSearchState();
  };

  $('startSel').onchange = function () { st.start = parseInt(this.value, 10); clearSearchState(); };
  $('goalSel').onchange = function () { st.goal = parseInt(this.value, 10); clearSearchState(); };
  $('orderSel').onchange = function () { st.order = this.value; clearSearchState(); };

  /* -------------------- режими редагування графа --------------------------- */

  var HINTS = {
    move:  'Режим «Переміщення»: перетягуйте вершини мишею, щоб змінити вигляд графа.',
    start: 'Клацніть вершину, щоб зробити її ПОЧАТКОВОЮ.',
    goal:  'Клацніть вершину, щоб зробити її ЦІЛЬОВОЮ.',
    addV:  'Клацніть на вільному місці полотна — з’явиться нова вершина (розмірність графа зросте).',
    delV:  'Клацніть вершину, щоб вилучити її разом з усіма інцидентними ребрами.',
    addE:  'Клацніть дві вершини послідовно — між ними з’явиться НЕНАПРЯМЛЕНЕ ребро.',
    addA:  'Клацніть дві вершини послідовно — з’явиться ДУГА від першої до другої.',
    delE:  'Клацніть дві вершини — ребро (дуга) між ними буде вилучене.',
    flipE: 'Клацніть дві вершини — ребро ⇄ дуга A→B ⇄ дуга B→A.'
  };

  Array.prototype.forEach.call(document.querySelectorAll('.modes button'), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll('.modes button'),
        function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      mode = b.dataset.mode;
      pendingVertex = null;
      st.selected = null;
      $('modeHint').textContent = HINTS[mode];
      redraw();
    };
  });

  function onVertexPick(id) {
    switch (mode) {
      case 'start':
        st.start = id; $('startSel').value = id; clearSearchState(); break;
      case 'goal':
        st.goal = id; $('goalSel').value = id; clearSearchState(); break;
      case 'delV':
        graph.removeVertex(id);
        fillVertexSelects(); updateGraphInfo(); clearSearchState(); break;
      case 'addE': case 'addA': case 'delE': case 'flipE':
        if (pendingVertex === null) { pendingVertex = id; st.selected = id; redraw(); }
        else {
          var a = pendingVertex, b = id;
          if (a !== b) {
            if (mode === 'addE') graph.addEdge(a, b, false);
            else if (mode === 'addA') graph.addEdge(a, b, true);
            else if (mode === 'delE') graph.removeEdge(a, b);
            else graph.cycleEdgeKind(a, b);
          }
          pendingVertex = null; st.selected = null;
          updateGraphInfo(); clearSearchState();
        }
        break;
      default:
        st.selected = (st.selected === id ? null : id);
        redraw();
    }
  }

  var canvas = $('canvas');

  canvas.addEventListener('mousedown', function (ev) {
    var p = renderer.toLogical(ev.clientX, ev.clientY);
    var id = renderer.hitTest(graph, p.x, p.y);
    if (id !== null && mode === 'move') { dragging = id; return; }
    if (id !== null) { onVertexPick(id); return; }
    if (mode === 'addV') {
      var nid = graph.addVertex(p.x, p.y);
      if (nid) { fillVertexSelects(); updateGraphInfo(); clearSearchState(); }
    } else {
      pendingVertex = null; st.selected = null; redraw();
    }
  });

  canvas.addEventListener('mousemove', function (ev) {
    if (dragging === null) return;
    var p = renderer.toLogical(ev.clientX, ev.clientY);
    graph.moveVertex(dragging, p.x, p.y);
    redraw();
  });

  window.addEventListener('mouseup', function () { dragging = null; });

  /* ---------------------- збереження / завантаження ------------------------ */

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $('btnExport').onclick = function () {
    download('graph.json', JSON.stringify(graph.toJSON(), null, 2), 'application/json');
  };

  $('btnImport').onclick = function () { $('fileInput').click(); };

  $('fileInput').onchange = function (ev) {
    var f = ev.target.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var g = window.Graph.fromJSON(JSON.parse(fr.result));
        graph.vertices = g.vertices; graph.edges = g.edges; graph._adj = null;
        fillVertexSelects(); updateGraphInfo(); clearSearchState();
      } catch (e) { alert('Не вдалося прочитати файл: ' + e.message); }
    };
    fr.readAsText(f);
    ev.target.value = '';
  };

  $('btnPng').onclick = function () {
    var a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'graph.png';
    a.click();
  };

  /* --------------------------- дослідження --------------------------------- */

  var lastRows = [];

  function tableOf(caption, rows, cols) {
    var head = '<tr>' + cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (r) {
      return '<tr>' + cols.map(function (c) {
        var v = c[1](r);
        return '<td' + (c[2] ? ' class="l"' : '') + '>' + v + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="res"><caption>' + caption + '</caption>' + head + body + '</table>';
  }

  $('btnResearch').onclick = function () {
    var s = parseInt($('startSel').value, 10), g = parseInt($('goalSel').value, 10);
    var data = window.Research.fullSeries(s, g);
    lastRows = [].concat(data.orders, data.mirror, data.types, data.modify);

    var C = {
      cond:  ['Умова', function (r) { return r.label; }, true],
      order: ['Порядок обходу', function (r) { return r.order; }, true],
      pair:  ['Пошук', function (r) { return 'V' + r.start + '→V' + r.goal; }],
      nm:    ['n / m', function (r) { return r.n + ' / ' + r.m; }],
      path:  ['Знайдений шлях', function (r) { return r.found ? r.path : '<span style="color:#f87171">шляху немає</span>'; }, true],
      len:   ['L', function (r) { return r.len; }],
      cyc:   ['Циклів', function (r) { return r.cycles; }],
      exp:   ['Розкрито', function (r) { return r.expanded; }],
      gen:   ['Згенеровано', function (r) { return r.generated; }],
      q:     ['max|OPEN|', function (r) { return r.maxQueue; }],
      t:     ['Час, мс', function (r) { return r.timeMs.toFixed(4); }]
    };

    $('researchBody').innerHTML =
      tableOf('A. Вплив порядку обходу суміжних вершин (V' + s + ' → V' + g + ', звичайний граф)',
        data.orders, [C.order, C.path, C.len, C.cyc, C.exp, C.gen, C.q, C.t]) +
      '<div style="height:14px"></div>' +
      tableOf('B. Зміна напрямку пошуку (дзеркальна заміна початкової вершини і мети)',
        data.mirror, [C.cond, C.order, C.path, C.len, C.cyc, C.exp, C.q, C.t]) +
      '<div style="height:14px"></div>' +
      tableOf('C. Вилучення та додавання вершин, ребер і дуг вирішального графа',
        data.modify, [C.cond, C.nm, C.path, C.len, C.cyc, C.exp, C.t]) +
      '<div style="height:14px"></div>' +
      tableOf('D. Вплив виду графа (порядок обходу — за зростанням номера)',
        data.types, [C.cond, C.nm, C.path, C.len, C.cyc, C.exp, C.gen, C.q, C.t]);

    $('winResearch').style.display = 'block';
  };

  $('btnCsv').onclick = function () {
    if (lastRows.length) download('research.csv', '﻿' + window.Research.toCSV(lastRows), 'text/csv');
  };

  /* ------------------------ плаваючі вікна --------------------------------- */

  Array.prototype.forEach.call(document.querySelectorAll('.window'), function (w) {
    var title = w.querySelector('.title');
    var drag = null;
    title.addEventListener('mousedown', function (ev) {
      if (ev.target.tagName === 'BUTTON') return;
      var r = w.getBoundingClientRect();
      var host = w.parentElement.getBoundingClientRect();
      w.style.transform = 'none';
      w.style.left = (r.left - host.left) + 'px';
      w.style.top = (r.top - host.top) + 'px';
      w.style.right = 'auto';
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

  fillVertexSelects();
  updateGraphInfo();
  showResults(null);
  resize();

  // Параметри в адресному рядку дають змогу точно відтворити конкретний дослід
  // (саме так одержані рисунки для звіту), напр.:
  //   index.html?type=directed&start=19&goal=32&order=desc&run=fast
  //   index.html?del=16-14&start=19&goal=32&run=fast      — вилучити ребро
  //   index.html?delv=16&start=19&goal=32&run=fast        — вилучити вершину
  //   index.html?add=19-32&run=fast                       — додати ребро
  //   index.html?arc=14-16&run=fast                       — додати/замінити дугою
  //   index.html?steps=40                                 — виконати рівно 40 кроків
  (function applyQuery() {
    var q = new URLSearchParams(location.search);
    if (!Array.from(q.keys()).length) return;

    if (q.get('type')) { $('graphType').value = q.get('type'); $('graphType').onchange(); }

    var pairs = function (name) {
      return (q.get(name) || '').split(',').filter(Boolean).map(function (s) {
        var p = s.split('-').map(Number);
        return [p[0], p[1]];
      });
    };
    pairs('del').forEach(function (p) { graph.removeEdge(p[0], p[1]); });
    (q.get('delv') || '').split(',').filter(Boolean).forEach(function (v) {
      graph.removeVertex(+v);
    });
    pairs('add').forEach(function (p) { graph.addEdge(p[0], p[1], false); });
    pairs('arc').forEach(function (p) {
      graph.removeEdge(p[0], p[1]);
      graph.addEdge(p[0], p[1], true);
    });
    fillVertexSelects();
    updateGraphInfo();

    if (q.get('start')) { $('startSel').value = q.get('start'); st.start = +q.get('start'); }
    if (q.get('goal')) { $('goalSel').value = q.get('goal'); st.goal = +q.get('goal'); }
    if (q.get('order')) { $('orderSel').value = q.get('order'); st.order = q.get('order'); }

    if (q.get('research')) { $('btnResearch').onclick(); }
    else if (q.get('steps')) {
      prepareRun();
      var n = Math.min(+q.get('steps'), run.steps.length);
      for (var i = 0; i < n; i++) applyStep(run.steps[run.idx++]);
      redraw();
    }
    else if (q.get('run') === 'fast') { $('btnFast').onclick(); }
    else if (q.get('run')) { $('btnRun').onclick(); }
  })();
})();
