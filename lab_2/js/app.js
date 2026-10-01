/* ============================================================================
 *  app.js — керування інтерфейсом програми
 *  ---------------------------------------------------------------------------
 *  Відповідає за:
 *    - вибір алгоритму пошуку (у глибину / у ширину) та його параметрів;
 *    - покрокову анімацію пошуку (Пуск / Пауза / Крок / Швидкий пошук);
 *    - редагування графа мишею (вершини, ребра, дуги, напрями);
 *    - виведення результатів у окремих вікнах інтерфейсу (результати пошуку,
 *      протокол роботи, порівняння BFS і DFS, серія експериментів);
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
    algo: 'dfs',
    limit: 0,
    open: new Set(),
    closed: new Set(),
    current: null,
    path: [],
    path2: [],        // другий шлях (режим порівняння)
    branch: [],       // поточна гілка пошуку в глибину
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

  var ALGO_HINTS = {
    dfs: 'Пошук у глибину: список OPEN — СТЕК (LIFO), нові вершини кладуться НА ПОЧАТОК. ' +
         'Пошук іде вздовж гілки до кінця і повертається назад. Зупиняється на першому ' +
         'знайденому шляху — він не обов\'язково найкоротший.',
    'dfs-short': 'Пошук у глибину з поверненнями та відсіканням: після знаходження мети ' +
         'пошук триває, вершини отримуються повторно, якщо до них знайдено коротший шлях, ' +
         'а гілки, довші за знайдений шлях, відсікаються. Результат — НАЙКОРОТШИЙ шлях.',
    bfs: 'Пошук у ширину: список OPEN — ЧЕРГА (FIFO), нові вершини кладуться В КІНЕЦЬ. ' +
         'Граф проглядається по ярусах, перший знайдений шлях — найкоротший.'
  };

  /* --------------------------- допоміжне ---------------------------------- */

  function redraw() { renderer.draw(graph, st); }

  function resize() { renderer.fit(); redraw(); }

  function isDfs(algo) { return (algo || st.algo) !== 'bfs'; }

  function updateGraphInfo() {
    var arcs = graph.arcCount();
    $('graphInfo').textContent =
      'порядок n = ' + graph.order() + ' · розмір m = ' + graph.size() +
      (arcs ? ' (з них дуг: ' + arcs + ')' : ' (усі ребра ненапрямлені)');
  }

  function updateAlgoUI() {
    st.algo = $('algoSel').value;
    st.limit = Math.max(0, parseInt($('limitInp').value, 10) || 0);
    $('limitInp').disabled = !isDfs();
    $('limitField').style.opacity = isDfs() ? 1 : 0.45;
    $('algoHint').textContent = ALGO_HINTS[st.algo];
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
    st.current = null; st.path = []; st.path2 = []; st.branch = [];
    st.parent = new Map(); st.depth = new Map(); st.inspect = null;
    $('logBody').innerHTML = '';
    showResults(null);
    redraw();
  }

  function pathText(p) { return p.map(function (v) { return 'V' + v; }).join(' → '); }

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
    var dfs = isDfs(r.algoKey);
    var rows = [
      ['Алгоритм', window.Search.ALGO_NAMES[r.algoKey]],
      ['Список OPEN', dfs ? 'стек (LIFO)' : 'черга (FIFO)'],
      ['Вид графа', $('graphType').selectedOptions[0].textContent.split(' (')[0]],
      ['Порядок / розмір графа', 'n = ' + graph.order() + ', m = ' + graph.size()],
      ['Початкова → цільова', 'V' + r.start + ' → V' + r.goal],
      ['Порядок обходу', window.Research.ORDER_NAMES[r.order]]
    ];
    if (dfs && r.limit) rows.push(['Обмеження глибини', r.limit]);
    rows.push(
      ['Результат', r.found ? 'шлях знайдено' : 'шляху не знайдено'],
      ['Довжина шляху, ребер', r.found ? r.pathLength : '—'],
      ['Кількість циклів алгоритму', r.cycles],
      ['Розкрито вершин', r.expanded],
      ['Згенеровано вершин', r.generated],
      ['Перевірено переходів', r.edgeChecks],
      ['Макс. довжина OPEN', r.maxQueue],
      ['Макс. глибина пошуку', r.maxDepth]
    );
    if (r.algoKey === 'dfs-short') {
      rows.push(
        ['Перший знайдений шлях, ребер', r.firstPath.length ? r.firstPath.length - 1 : '—'],
        ['Покращень шляху', r.improvements],
        ['Найкоротший знайдено на циклі', r.found ? r.bestCycle : '—'],
        ['Повторних отримань вершин', r.reopened],
        ['Відсічено гілок', r.pruned]
      );
    } else if (dfs && r.limit) {
      rows.push(['Не розкрито через обмеження', r.pruned]);
    }
    rows.push(
      ['Час пошуку, мс', r.timeMs.toFixed(4)],
      ['Середній час (' + r.repeats + ' прогонів), мс', r.avgTimeMs.toFixed(5)]
    );
    t.innerHTML = rows.map(function (p) {
      return '<tr><td>' + p[0] + '</td><td>' + p[1] + '</td></tr>';
    }).join('');

    var pl = $('pathLine');
    if (r.found) {
      pl.className = 'pathline';
      pl.innerHTML = '<b>Знайдений шлях:</b><br>' + pathText(r.path);
      if (r.algoKey === 'dfs-short' && r.firstPath.length && r.firstPath.length !== r.path.length) {
        pl.innerHTML += '<br><span style="color:var(--muted)">Перший знайдений (довший) шлях: ' +
          pathText(r.firstPath) + '</span>';
      }
    } else {
      pl.className = 'pathline fail';
      pl.innerHTML = '<b>Шлях не знайдено.</b><br>' + (dfs ? 'Стек' : 'Черга') +
        ' вичерпався після ' + r.cycles + ' циклів; ' +
        (dfs && r.limit ? 'у межах глибини ' + r.limit + ' ' : '') +
        'вершина V' + r.goal + ' недосяжна з V' + r.start + '.';
    }
  }

  function showQueue(queue) {
    var box = $('queueView');
    var dfs = run.result ? isDfs(run.result.algoKey) : isDfs();
    if (!queue || !queue.length) {
      box.innerHTML = '<em>' + (dfs ? 'стек порожній' : 'черга порожня') + '</em>';
      return;
    }
    box.innerHTML = '<em>' + (dfs ? 'стек (OPEN), вершина стека зліва:' : 'черга (OPEN):') + '</em>' +
      queue.map(function (v, i) {
        return '<b class="' + (i === 0 ? 'first' + (dfs ? ' stack' : '') : '') + '">V' + v + '</b>';
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

  function readParams() {
    st.start = parseInt($('startSel').value, 10);
    st.goal = parseInt($('goalSel').value, 10);
    st.order = $('orderSel').value;
    updateAlgoUI();
  }

  function prepareRun() {
    readParams();
    clearSearchState();
    var m = window.Search.measure(st.algo, graph, st.start, st.goal, st.order, st.limit, 300);
    var traced = window.Search.run(st.algo, graph, st.start, st.goal, st.order, true, st.limit);
    traced.avgTimeMs = m.avgTimeMs;
    traced.repeats = m.repeats;
    run.result = traced;
    run.steps = traced.steps;
    run.idx = 0;
    return traced;
  }

  function applyStep(s) {
    var dfs = run.result && isDfs(run.result.algoKey);
    switch (s.kind) {
      case 'start':
        run.queue = s.queue; break;
      case 'dequeue':
        if (st.current !== null) st.closed.add(st.current);
        st.current = s.v; run.queue = s.queue;
        st.inspect = null;
        if (dfs) st.branch = s.branch || [];
        break;
      case 'stale':
        run.queue = s.queue; break;
      case 'prune':
        st.closed.add(s.v); st.current = null; st.branch = []; break;
      case 'expand':
        break;
      case 'inspect':
        st.inspect = { from: s.from, to: s.to }; break;
      case 'enqueue':
        st.closed.delete(s.v);
        st.parent.set(s.v, s.from);
        st.depth.set(s.v, s.depth);
        st.inspect = { from: s.from, to: s.v };
        run.queue = s.queue;
        break;
      case 'goal':
        st.inspect = null;
        if (s.path) st.path = s.path;
        break;
      case 'summary':
      case 'done':
        if (run.result && run.result.found) st.path = run.result.path;
        st.current = null; st.inspect = null; st.branch = [];
        break;
    }
    st.open = new Set(run.queue);
    var cls = s.kind === 'dequeue' ? 'l-cycle'
      : s.kind === 'enqueue' ? 'l-open'
      : s.kind === 'inspect' || s.kind === 'stale' ? 'l-skip'
      : s.kind === 'prune' ? 'l-prune'
      : s.kind === 'goal' ? 'l-goal' : '';
    if (/глухий кут/.test(s.text)) cls = 'l-back';
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
  $('algoSel').onchange = function () { updateAlgoUI(); clearSearchState(); };
  $('limitInp').oninput = function () { updateAlgoUI(); clearSearchState(); };

  /* -------------------- режими редагування графа --------------------------- */

  var HINTS = {
    move:  'Режим «Переміщення»: перетягуйте вершини мишею, щоб змінити вигляд графа.',
    start: 'Клацніть вершину, щоб зробити її ПОЧАТКОВОЮ.',
    goal:  'Клацніть вершину, щоб зробити її ЦІЛЬОВОЮ.',
    addV:  'Клацніть на вільному місці полотна — з’явиться нова вершина (порядок графа зросте).',
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

  /* --------------------- порівняння BFS і DFS ------------------------------ */

  $('btnCompare').onclick = function () {
    readParams();
    clearSearchState();
    var R = {};
    window.Search.ALGOS.forEach(function (a) {
      R[a] = window.Search.measure(a, graph, st.start, st.goal, st.order, a === 'bfs' ? 0 : st.limit, 300);
    });
    var b = R.bfs, d = R.dfs, s = R['dfs-short'];

    var metrics = [
      ['Список OPEN', function () { return ['черга (FIFO)', 'стек (LIFO)', 'стек (LIFO)']; }, false],
      ['Шлях знайдено', function (r) { return r.found ? 'так' : 'ні'; }, false],
      ['Довжина шляху, ребер', function (r) { return r.found ? r.pathLength : '—'; }, true],
      ['Циклів алгоритму', function (r) { return r.cycles; }, true],
      ['Розкрито вершин', function (r) { return r.expanded; }, true],
      ['Згенеровано вершин', function (r) { return r.generated; }, true],
      ['Перевірено переходів', function (r) { return r.edgeChecks; }, true],
      ['Макс. довжина OPEN (пам\'ять)', function (r) { return r.maxQueue; }, true],
      ['Макс. глибина пошуку', function (r) { return r.maxDepth; }, false],
      ['Середній час, мс', function (r) { return r.avgTimeMs.toFixed(5); }, true]
    ];
    var list = [b, d, s];
    var html = '<table class="res"><caption>V' + st.start + ' → V' + st.goal + ', порядок обходу: ' +
      window.Research.ORDER_NAMES[st.order] + ', граф: n = ' + graph.order() + ', m = ' + graph.size() +
      (st.limit ? ', обмеження глибини DFS: ' + st.limit : '') + '</caption>' +
      '<tr><th>Показник</th><th class="algo-bfs">BFS (вшир)</th><th class="algo-dfs">DFS (вглиб)</th>' +
      '<th>DFS найкоротший</th></tr>';
    metrics.forEach(function (mt, idx) {
      var vals = idx === 0 ? mt[1]() : list.map(mt[1]);
      var nums = vals.map(function (v) { return typeof v === 'number' || /^[\d.]+$/.test(v) ? +v : null; });
      var min = Math.min.apply(null, nums.filter(function (x) { return x !== null; }));
      html += '<tr><td class="l">' + mt[0] + '</td>' + vals.map(function (v, i) {
        var cls = (mt[2] && nums[i] !== null && nums.filter(function (x) { return x !== null; }).length > 1 &&
                   nums[i] === min) ? ' class="best"' : '';
        return '<td' + cls + '>' + v + '</td>';
      }).join('') + '</tr>';
    });
    html += '</table>';

    html += '<div class="cmp-paths">' +
      '<div class="p-bfs"><b>BFS:</b> ' + (b.found ? pathText(b.path) : 'шляху немає') + '</div>' +
      '<div class="p-dfs"><b>DFS:</b> ' + (d.found ? pathText(d.path) : 'шляху немає') + '</div>' +
      '<div class="p-short"><b>DFS найкоротший:</b> ' + (s.found ? pathText(s.path) : 'шляху немає') + '</div>' +
      '</div>';

    var notes = [];
    if (b.found && d.found) {
      if (d.pathLength > b.pathLength) {
        notes.push('DFS знайшов шлях <b>довший на ' + (d.pathLength - b.pathLength) +
          '</b> ребер(а): пошук у глибину зупиняється на ПЕРШОМУ знайденому шляху, а не на найкоротшому.');
      } else {
        notes.push('Тут DFS випадково знайшов шлях тієї самої довжини, що й BFS (' + b.pathLength + ').');
      }
      notes.push(d.cycles < b.cycles
        ? 'DFS витратив <b>менше циклів</b> (' + d.cycles + ' проти ' + b.cycles + '): він «пірнув» у гілку, де лежала мета.'
        : 'DFS витратив <b>не менше циклів</b> (' + d.cycles + ' проти ' + b.cycles + '): він спершу пішов не в ту гілку.');
      notes.push('Щоб гарантувати найкоротший шлях, DFS мусить продовжити перебір після знаходження мети: ' +
        'варіант «DFS найкоротший» зробив ' + s.cycles + ' циклів і ' + s.reopened + ' повторних отримань вершин.');
    } else if (!b.found) {
      notes.push('Шляху не існує: обидва алгоритми вичерпали список OPEN.');
    } else if (!d.found && st.limit) {
      notes.push('DFS не знайшов шлях через обмеження глибини ' + st.limit + '.');
    }
    html += '<div class="cmp-note">' + notes.join('<br>') + '</div>';
    $('compareBody').innerHTML = html;
    $('winCompare').style.display = 'block';
    // вікна результатів і протоколу згортаються, щоб не заважати порівнянню
    ['winResults', 'winLog'].forEach(function (id) {
      var w = $(id), b = w.querySelector('[data-collapse]');
      if (!w.classList.contains('collapsed')) { w.classList.add('collapsed'); b.textContent = '+'; }
    });

    // обидва шляхи — на графі
    st.path = b.found ? b.path : [];
    st.path2 = d.found ? d.path : [];
    st.closed = new Set();
    redraw();
    $('pathLine').className = 'pathline';
    $('pathLine').innerHTML = '<b>Порівняння:</b> жовтим — шлях BFS (' + (b.found ? b.pathLength : '—') +
      '), блакитним — шлях DFS (' + (d.found ? d.pathLength : '—') + ').';
  };

  /* --------------------------- дослідження --------------------------------- */

  var lastRows = [];

  function tableOf(caption, rows, cols) {
    var head = '<tr>' + cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr>';
    var body = rows.map(function (r) {
      return '<tr>' + cols.map(function (c) {
        var v = c[1](r);
        var cls = [];
        if (c[2]) cls.push('l');
        if (c[3]) { var k = c[3](r); if (k) cls.push(k); }
        return '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + v + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="res"><caption>' + caption + '</caption>' + head + body + '</table>' +
      '<div style="height:14px"></div>';
  }

  // Позначає довжину шляху DFS, більшу за довжину BFS у тій самій групі рядків.
  function markLengths(rows) {
    for (var i = 0; i + 2 < rows.length; i += 3) {
      var b = rows[i].len;
      rows[i + 1].lenCls = (rows[i + 1].len !== '—' && b !== '—' && rows[i + 1].len > b) ? 'worse' : 'best';
      rows[i].lenCls = 'best';
      rows[i + 2].lenCls = 'best';
      if (b === '—') { rows[i].lenCls = rows[i + 1].lenCls = rows[i + 2].lenCls = ''; }
    }
    return rows;
  }

  $('btnResearch').onclick = function () {
    var s = parseInt($('startSel').value, 10), g = parseInt($('goalSel').value, 10);
    var data = window.Research.fullSeries(s, g);
    var pairs = window.Research.expAllPairs('asc');
    lastRows = [].concat(data.orders, data.mirror, data.modify, data.types, data.arcs, data.limit);

    var C = {
      cond:  ['Умова', function (r) { return r.label; }, true],
      algo:  ['Алгоритм', function (r) { return r.algo; }, true],
      order: ['Порядок обходу', function (r) { return r.order; }, true],
      nm:    ['n / m', function (r) { return r.n + ' / ' + r.m; }],
      path:  ['Знайдений шлях', function (r) { return r.found ? r.path : '<span style="color:#f87171">шляху немає</span>'; }, true],
      len:   ['L', function (r) { return r.len; }, false, function (r) { return r.lenCls; }],
      cyc:   ['Циклів', function (r) { return r.cycles; }],
      exp:   ['Розкрито', function (r) { return r.expanded; }],
      q:     ['max|OPEN|', function (r) { return r.maxQueue; }],
      dep:   ['Глибина', function (r) { return r.maxDepth; }],
      t:     ['Час, мс', function (r) { return r.timeMs.toFixed(4); }]
    };
    var f1 = function (x) { return x.toFixed(1); };
    var P = [
      ['Вид графа', function (r) { return r.label; }, true],
      ['L BFS', function (r) { return f1(r.bfsLen); }],
      ['L DFS', function (r) { return f1(r.dfsLen); }],
      ['DFS знайшов найкоротший, %', function (r) { return f1(r.optimalShare); }],
      ['Макс. перевищення L', function (r) { return r.maxExcess; }],
      ['Сер. циклів BFS = DFS', function (r) { return f1(r.bfsCycles); }],
      ['DFS швидший, % пар', function (r) { return f1(r.dfsFasterShare); }],
      ['BFS швидший, % пар', function (r) { return f1(r.bfsFasterShare); }],
      ['Сер. циклів DFS найкор.', function (r) { return f1(r.shortCycles); }],
      ['max|OPEN| BFS', function (r) { return f1(r.bfsQueue); }],
      ['max|OPEN| DFS', function (r) { return f1(r.dfsQueue); }]
    ];

    $('researchBody').innerHTML =
      tableOf('A. Вплив напряму обходу (V' + s + ' → V' + g + ', звичайний граф)',
        markLengths(data.orders), [C.order, C.algo, C.path, C.len, C.cyc, C.exp, C.q, C.dep, C.t]) +
      tableOf('B. Зміна напрямку пошуку (дзеркальна заміна початкової вершини і мети)',
        markLengths(data.mirror), [C.cond, C.order, C.algo, C.path, C.len, C.cyc, C.exp, C.q]) +
      tableOf('C. Додавання та вилучення вершин і ребер (зміна порядку і розміру графа)',
        markLengths(data.modify), [C.cond, C.nm, C.algo, C.path, C.len, C.cyc, C.exp, C.q]) +
      tableOf('D. Вплив виду графа (порядок обходу — за зростанням номера)',
        markLengths(data.types), [C.cond, C.nm, C.algo, C.path, C.len, C.cyc, C.exp, C.q, C.dep]) +
      tableOf('E. Заміна ребер на дуги і навпаки',
        markLengths(data.arcs), [C.cond, C.algo, C.path, C.len, C.cyc, C.exp, C.q]) +
      tableOf('F. Узагальнене порівняння на всіх парах вершин (порядок обходу — за зростанням)',
        pairs, P) +
      tableOf('G. Пошук у глибину з обмеженням глибини (V' + s + ' → V' + g + ')',
        data.limit, [C.cond, C.path, C.len, C.cyc, C.exp, C.q, C.dep]);

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
  updateAlgoUI();
  showResults(null);
  resize();

  // Параметри в адресному рядку дають змогу точно відтворити конкретний дослід
  // (саме так одержані рисунки для звіту), напр.:
  //   index.html?algo=dfs&type=directed&start=19&goal=32&order=desc&run=fast
  //   index.html?algo=dfs-short&start=19&goal=32&run=fast  — DFS, найкоротший шлях
  //   index.html?algo=dfs&limit=6&run=fast                 — DFS з обмеженням глибини
  //   index.html?compare=1                                 — вікно порівняння BFS і DFS
  //   index.html?del=16-14&start=19&goal=32&run=fast       — вилучити ребро
  //   index.html?delv=16&start=19&goal=32&run=fast         — вилучити вершину
  //   index.html?add=19-32&run=fast                        — додати ребро
  //   index.html?arc=14-16&run=fast                        — додати/замінити дугою
  //   index.html?edge=16-19&run=fast                       — замінити дугу ребром
  //   index.html?steps=40                                  — виконати рівно 40 кроків
  (function applyQuery() {
    var q = new URLSearchParams(location.search);
    if (!Array.from(q.keys()).length) return;

    if (q.get('type')) { $('graphType').value = q.get('type'); $('graphType').onchange(); }
    if (q.get('algo')) { $('algoSel').value = q.get('algo'); }
    if (q.get('limit')) { $('limitInp').value = q.get('limit'); }
    updateAlgoUI();

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
    pairs('edge').forEach(function (p) {
      graph.removeEdge(p[0], p[1]);
      graph.addEdge(p[0], p[1], false);
    });
    fillVertexSelects();
    updateGraphInfo();

    if (q.get('start')) { $('startSel').value = q.get('start'); st.start = +q.get('start'); }
    if (q.get('goal')) { $('goalSel').value = q.get('goal'); st.goal = +q.get('goal'); }
    if (q.get('order')) { $('orderSel').value = q.get('order'); st.order = q.get('order'); }

    if (q.get('research')) { $('btnResearch').onclick(); }
    else if (q.get('compare')) { $('btnCompare').onclick(); }
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
