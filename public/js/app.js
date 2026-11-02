/* GYM BUDS — dashboard app */
(function () {
  'use strict';
  const { api, esc, todayStr, addDays, dayIndex, mondayOf, fmtDate, fmtNum, avatarHtml, initials, toast } = GB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  const VIEWS = ['overview', 'calories', 'workouts', 'supplements', 'profile'];
  const TITLES = { overview: 'Overview', calories: 'Calories', workouts: 'Workouts', supplements: 'Supplements', profile: 'Profile' };
  const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

  const ICON = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  const S = {
    user: null,
    view: null,
    calDate: todayStr(),
    weekStart: mondayOf(todayStr()),
    wkDay: dayIndex(todayStr()),
    week: null,
    foodItems: [],
    recent: null,
    supplements: [],
    cacheDate: null,
    notified: new Set(),
    avatarDraft: '',
    profile: null,
  };

  /* ---------- generic helpers ---------- */
  function handleErr(err) {
    if (err.status === 401) { location.replace('auth.html'); return; }
    toast(err.message || 'Something went wrong.', 'error');
  }

  function progressRow(label, text, pct, over) {
    const w = Math.max(0, Math.min(100, pct));
    return `<div class="progress-row"><div class="top"><span>${esc(label)}</span><span>${esc(text)}</span></div>
      <div class="bar${over ? ' over' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(w)}" aria-label="${esc(label)}"><i style="width:${w}%"></i></div></div>`;
  }

  const fld = (label, name, attrs = '', val = '') =>
    `<div class="field"><label for="m-${name}">${label}</label><input class="input" id="m-${name}" name="${name}" value="${esc(val ?? '')}" ${attrs}></div>`;

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const modal = $('#modal');
  const modalForm = $('#modal-form');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.close(); });

  function openForm({ title, body, submit = 'Save', onSubmit, onOpen }) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = body;
    $('#modal-submit').textContent = submit;
    const errBox = $('#modal-error');
    errBox.hidden = true;
    modalForm.onsubmit = async (e) => {
      e.preventDefault();
      errBox.hidden = true;
      if (!modalForm.reportValidity()) return;
      const btn = $('#modal-submit');
      btn.disabled = true;
      try {
        await onSubmit(Object.fromEntries(new FormData(modalForm)));
        modal.close();
      } catch (ex) {
        if (ex.status === 401) return handleErr(ex);
        errBox.textContent = ex.message;
        errBox.hidden = false;
      } finally {
        btn.disabled = false;
      }
    };
    modal.showModal();
    if (onOpen) onOpen();
    const first = $('#modal-body input:not([type=hidden]), #modal-body select');
    if (first) first.focus();
  }

  function confirmAction(message, okLabel = 'Delete') {
    return new Promise((resolve) => {
      const d = $('#confirm');
      $('#confirm-msg').textContent = message;
      $('#confirm-ok').textContent = okLabel;
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });
  }

  function reload() { return loaders[S.view] ? loaders[S.view]().catch(handleErr) : null; }

  /* ---------- routing ---------- */
  function show(view) {
    S.view = view;
    VIEWS.forEach((v) => { $('#view-' + v).hidden = v !== view; });
    $$('[data-view]').forEach((a) => {
      const on = a.dataset.view === view;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = `${TITLES[view]} — GYM BUDS`;
    window.scrollTo(0, 0);
    loaders[view]().catch(handleErr);
  }
  function route() {
    const v = location.hash.slice(1);
    show(VIEWS.includes(v) ? v : 'overview');
  }
  function go(view) {
    if (location.hash === '#' + view) route(); else location.hash = view;
  }

  function renderUserChip() {
    $('#side-user').innerHTML = `${avatarHtml(S.user)}<div><strong>${esc(S.user.name)}</strong><span class="muted">${esc(S.user.goal)}</span></div>`;
    $('#top-avatar').innerHTML = avatarHtml(S.user);
  }

  /* =========================================================
     OVERVIEW
     ========================================================= */
  const MESSAGES = [
    'Small, consistent steps beat occasional big efforts.',
    'Show up today. Future you will notice.',
    'Progress is built one session at a time.',
    'Rest is part of training. Recover well.',
    'You don\'t need perfect, you need consistent.',
    'Fuel the work you\'re about to do.',
    'Another day to be a little stronger than yesterday.',
  ];

  function countUp(el, to) {
    if (!to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now(), dur = 700;
    (function tick(now) {
      const t = Math.min((now - start) / dur, 1);
      el.textContent = fmtNum(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }

  function renderSetup(setup) {
    const box = $('#ov-setup');
    const items = [
      ['meal', 'Log your first meal', 'calories'],
      ['workout', 'Tick off an exercise', 'workouts'],
      ['supplement', 'Add a supplement (optional)', 'supplements'],
      ['target', 'Set a target weight', 'profile'],
    ];
    const done = items.filter(([k]) => setup[k]).length;
    if (setup.meal && setup.workout && setup.target) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<div class="setup-head"><h2>Getting started</h2><span class="muted small">${done} of ${items.length} done</span></div>
      <ul class="setup-list">${items.map(([k, label, view]) => `<li class="${setup[k] ? 'done' : ''}"><span class="dot">${ICON.check}</span><span class="t">${esc(label)}</span>${setup[k] ? '' : `<a href="#${view}">Go</a>`}</li>`).join('')}</ul>`;
  }

  async function loadOverview() {
    const d = await api('/dashboard?date=' + todayStr());
    $('#ov-date').textContent = fmtDate(d.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    $('#ov-hello').textContent = `${greet}, ${d.name.split(' ')[0]}.`;

    const rem = d.calories.goal - d.calories.consumed;
    const wl = (d.water.ml / 1000).toFixed(2).replace(/0$/, '');
    $('#ov-stats').innerHTML = `
      <div class="stat"><div class="label">Calories consumed</div><div class="value"><span data-count="${d.calories.consumed}">${fmtNum(d.calories.consumed)}</span><small>kcal</small></div></div>
      <div class="stat"><div class="label">Daily calorie goal</div><div class="value"><span data-count="${d.calories.goal}">${fmtNum(d.calories.goal)}</span><small>kcal</small></div></div>
      <div class="stat"><div class="label">${rem >= 0 ? 'Calories remaining' : 'Over your goal by'}</div><div class="value"><span data-count="${Math.abs(rem)}">${fmtNum(Math.abs(rem))}</span><small>kcal</small></div></div>
      <div class="stat"><div class="label">Water intake</div><div class="value">${wl}<small>of ${(d.water.goal / 1000).toFixed(1)} L</small></div>
        <div class="foot"><button class="btn btn-sm" type="button" data-water="250">+ 250 ml</button><button class="btn btn-sm" type="button" data-water="-250" aria-label="Remove 250 ml">− 250 ml</button></div></div>
      <div class="stat"><div class="label">Completed workouts</div><div class="value">${d.workouts.total ? `${d.workouts.done}<small>of ${d.workouts.total} today</small>` : '<span style="font-size:1.2rem">Rest day</span>'}</div></div>
      <div class="stat"><div class="label">Current weight</div><div class="value">${d.weight.current != null ? r1(d.weight.current) : '—'}<small>kg${d.weight.target ? ` · target ${r1(d.weight.target)}` : ''}</small></div></div>`;
    S.water = d.water;
    $$('#ov-stats .stat').forEach((el, i) => el.style.setProperty('--i', i));
    $$('#ov-stats [data-count]').forEach((el) => countUp(el, Number(el.dataset.count)));
    renderSetup(d.setup);

    Charts.bars($('#ch-calories'), d.week.map((w) => ({ label: DAYS[dayIndex(w.date)], value: w.calories, active: w.date === d.date })), { goal: d.calories.goal, label: 'Calories over the last 7 days' });
    Charts.line($('#ch-weight'), d.weightSeries.map((p) => ({ label: fmtDate(p.date, { month: 'short', day: 'numeric' }), value: p.kg })), { target: d.weight.target, unit: ' kg', label: 'Weight over time' });
    Charts.bars($('#ch-workouts'), d.week.map((w) => ({ label: DAYS[dayIndex(w.date)], value: w.total ? Math.round((w.done / w.total) * 100) : 0, active: w.date === d.date })), { max: 100, format: (v) => v + '%', label: 'Workout completion over the last 7 days' });

    $('#ov-progress').innerHTML = [
      progressRow('Calories', `${fmtNum(d.calories.consumed)} / ${fmtNum(d.calories.goal)} kcal`, (d.calories.consumed / d.calories.goal) * 100, d.calories.consumed > d.calories.goal),
      progressRow('Water', `${(d.water.ml / 1000).toFixed(1)} / ${(d.water.goal / 1000).toFixed(1)} L`, (d.water.ml / d.water.goal) * 100),
      progressRow('Workout', d.workouts.total ? `${d.workouts.done} / ${d.workouts.total} exercises` : 'Rest day', d.workouts.total ? (d.workouts.done / d.workouts.total) * 100 : 0),
      progressRow('Supplements', d.supplements.total ? `${d.supplements.taken} / ${d.supplements.total} taken` : 'None added', d.supplements.total ? (d.supplements.taken / d.supplements.total) * 100 : 0),
    ].join('');

    const logged = d.week.filter((w) => w.calories > 0).length;
    const doneWeek = d.week.reduce((n, w) => n + w.done, 0);
    const msg = MESSAGES[new Date().getDate() % MESSAGES.length];
    $('#ov-motivation').innerHTML = `<h2>Today's motivation</h2><blockquote>${esc(msg)}</blockquote>
      <p class="muted">You've logged food on ${logged} of the last 7 days and completed ${doneWeek} exercise${doneWeek === 1 ? '' : 's'} in that time.${d.calories.consumed === 0 ? ' Log your first meal to start today.' : ''}</p>`;
  }

  $('#ov-stats').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-water]');
    if (!b) return;
    const ml = Math.max(0, (S.water ? S.water.ml : 0) + Number(b.dataset.water));
    try {
      await api('/water', { method: 'PUT', body: { date: todayStr(), ml } });
      await loadOverview();
    } catch (err) { handleErr(err); }
  });

  $$('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    const q = b.dataset.quick;
    if (q === 'calories') { S.calDate = todayStr(); go('calories'); openFoodDialog({ meal: guessMeal() }); }
    else if (q === 'workout') { S.weekStart = mondayOf(todayStr()); S.wkDay = dayIndex(todayStr()); go('workouts'); openExerciseDialog(S.wkDay); }
    else if (q === 'plan') go('workouts');
    else if (q === 'supplements') go('supplements');
  }));

  function guessMeal() {
    const h = new Date().getHours();
    return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snacks';
  }

  /* =========================================================
     CALORIES
     ========================================================= */
  async function loadCalories() {
    const date = S.calDate;
    const today = todayStr();
    $('#cal-date').value = date;
    $('#cal-date').max = today;
    $('#cal-next').disabled = date >= today;

    const [day, hist] = await Promise.all([api('/foods?date=' + date), api(`/foods/history?days=30&end=${date}`)]);
    if (date !== S.calDate) return; // user navigated again while loading
    const goal = S.user.calorie_goal;
    const t = day.totals;
    S.foodItems = day.items;

    Charts.ring($('#cal-ring'), t.calories, goal);
    const rem = goal - t.calories;
    $('#cal-goal').textContent = fmtNum(goal) + ' kcal';
    $('#cal-eaten').textContent = fmtNum(t.calories) + ' kcal';
    $('#cal-rem-label').textContent = rem >= 0 ? 'Remaining' : 'Over by';
    $('#cal-rem').textContent = fmtNum(Math.abs(rem)) + ' kcal';

    const tp = (goal * 0.25) / 4, tc = (goal * 0.5) / 4, tf = (goal * 0.25) / 9;
    $('#cal-macros').innerHTML = [
      progressRow('Protein', `${r1(t.protein)} / ${Math.round(tp)} g`, (t.protein / tp) * 100),
      progressRow('Carbs', `${r1(t.carbs)} / ${Math.round(tc)} g`, (t.carbs / tc) * 100),
      progressRow('Fat', `${r1(t.fat)} / ${Math.round(tf)} g`, (t.fat / tf) * 100),
    ].join('');

    $('#cal-meals').innerHTML = MEALS.map((meal) => {
      const items = day.items.filter((i) => i.meal === meal);
      const sum = items.reduce((n, i) => n + i.calories, 0);
      const rows = items.map((i) => `
        <div class="entry">
          <div><div class="name">${esc(i.name)}</div>
            <div class="meta">${i.serving ? esc(i.serving) + ' · ' : ''}P ${r1(i.protein)} · C ${r1(i.carbs)} · F ${r1(i.fat)} g</div></div>
          <div class="kcal-col">${fmtNum(i.calories)}</div>
          <div class="entry-actions">
            <button class="icon-btn" type="button" data-edit-food="${i.id}" aria-label="Edit ${esc(i.name)}">${ICON.edit}</button>
            <button class="icon-btn del" type="button" data-del-food="${i.id}" aria-label="Delete ${esc(i.name)}">${ICON.del}</button>
          </div>
        </div>`).join('');
      return `<section class="meal"><div class="meal-head"><h3>${meal}<span class="kcal">${fmtNum(sum)} kcal</span></h3>
        <button class="btn btn-sm" type="button" data-add-meal="${meal}">Add food</button></div>
        ${rows || '<p class="empty">Nothing logged yet.</p>'}</section>`;
    }).join('');

    const byDate = Object.fromEntries(hist.items.map((h) => [h.date, h]));
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(date, -i);
      week.push({ label: DAYS[dayIndex(d)], value: byDate[d] ? byDate[d].calories : 0, active: d === date });
    }
    Charts.bars($('#cal-week'), week, { goal, label: 'Calories over the 7 days ending on the selected date' });

    $('#cal-history').innerHTML = hist.items.length
      ? hist.items.map((h) => `<button class="history-row" type="button" data-jump="${h.date}">
          <div><div class="h-date">${esc(fmtDate(h.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</div>
          <div class="h-sub">P ${fmtNum(h.protein)} · C ${fmtNum(h.carbs)} · F ${fmtNum(h.fat)} g</div></div>
          <div class="h-val">${fmtNum(h.calories)} kcal</div></button>`).join('')
      : '<p class="empty">No records in the last 30 days.</p>';
  }

  function setCalDate(d) {
    const today = todayStr();
    S.calDate = d > today ? today : d;
    loadCalories().catch(handleErr);
  }
  $('#cal-prev').addEventListener('click', () => setCalDate(addDays(S.calDate, -1)));
  $('#cal-next').addEventListener('click', () => setCalDate(addDays(S.calDate, 1)));
  $('#cal-today').addEventListener('click', () => setCalDate(todayStr()));
  $('#cal-date').addEventListener('change', (e) => { if (e.target.value) setCalDate(e.target.value); });
  $('#cal-history').addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]');
    if (b) { setCalDate(b.dataset.jump); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  $('#cal-meals').addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add-meal]');
    const edit = e.target.closest('[data-edit-food]');
    const del = e.target.closest('[data-del-food]');
    if (add) return openFoodDialog({ meal: add.dataset.addMeal });
    if (edit) return openFoodDialog({ item: S.foodItems.find((i) => i.id === Number(edit.dataset.editFood)) });
    if (del) {
      const item = S.foodItems.find((i) => i.id === Number(del.dataset.delFood));
      if (!item || !(await confirmAction(`Delete "${item.name}" from ${item.meal}? This can't be undone.`))) return;
      try { await api('/foods/' + item.id, { method: 'DELETE' }); toast('Entry deleted.'); S.recent = null; await loadCalories(); } catch (err) { handleErr(err); }
    }
  });

  async function openFoodDialog({ meal = 'Breakfast', item = null } = {}) {
    if (!S.recent) {
      try { S.recent = (await api('/foods/recent')).items; } catch { S.recent = []; }
    }
    const isEdit = !!item;
    const mealSel = item ? item.meal : meal;
    const body = `
      ${isEdit ? '' : `<div class="field"><label for="m-search">Search foods</label>
        <input class="input" id="m-search" type="search" placeholder="Try chicken, banana, oats…" autocomplete="off"></div><div class="suggest" id="m-suggest"></div>`}
      <div class="field"><label for="m-meal">Meal</label><select class="input" id="m-meal" name="meal">
        ${MEALS.map((m) => `<option${m === mealSel ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
      ${fld('Food name', 'name', 'required maxlength="100"', item && item.name)}
      ${fld('Serving size', 'serving', 'maxlength="60" placeholder="e.g. 1 cup or 100 g"', item && item.serving)}
      ${fld('Calories (kcal)', 'calories', 'type="number" inputmode="decimal" min="0" max="10000" step="any" required', item && item.calories)}
      <div class="row row-3">
        ${fld('Protein (g)', 'protein', 'type="number" inputmode="decimal" min="0" max="1000" step="any"', item ? item.protein : '')}
        ${fld('Carbs (g)', 'carbs', 'type="number" inputmode="decimal" min="0" max="2000" step="any"', item ? item.carbs : '')}
        ${fld('Fat (g)', 'fat', 'type="number" inputmode="decimal" min="0" max="1000" step="any"', item ? item.fat : '')}
      </div>`;
    openForm({
      title: isEdit ? 'Edit food' : 'Add food',
      body,
      submit: isEdit ? 'Save changes' : 'Add food',
      onOpen: () => {
        const search = $('#m-search');
        if (!search) return;
        const seen = new Set();
        const pool = [...S.recent, ...window.FOODS].filter((f) => { const k = f.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
        const box = $('#m-suggest');
        let matches = [];
        search.addEventListener('input', () => {
          const q = search.value.trim().toLowerCase();
          if (!q) { box.innerHTML = ''; return; }
          matches = pool.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
          box.innerHTML = matches.length
            ? matches.map((f, i) => `<button type="button" data-i="${i}"><b>${esc(f.name)}</b><span>${esc(f.serving || '')} · ${Math.round(f.calories)} kcal</span></button>`).join('')
            : '<p class="empty">No match. Enter the details below.</p>';
        });
        box.addEventListener('click', (e) => {
          const b = e.target.closest('[data-i]');
          if (!b) return;
          const f = matches[Number(b.dataset.i)];
          modalForm.elements.name.value = f.name;
          modalForm.elements.serving.value = f.serving || '';
          modalForm.elements.calories.value = f.calories;
          modalForm.elements.protein.value = f.protein;
          modalForm.elements.carbs.value = f.carbs;
          modalForm.elements.fat.value = f.fat;
          box.innerHTML = '';
          search.value = '';
          modalForm.elements.calories.focus();
        });
        search.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
      },
      onSubmit: async (d) => {
        const payload = { meal: d.meal, name: d.name, serving: d.serving, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat };
        if (isEdit) await api('/foods/' + item.id, { method: 'PUT', body: payload });
        else await api('/foods', { method: 'POST', body: { ...payload, date: S.calDate } });
        S.recent = null;
        toast(isEdit ? 'Food updated.' : 'Food added.');
        await reload();
      },
    });
  }

  /* =========================================================
     WORKOUTS
     ========================================================= */
  async function loadWorkouts() {
    S.week = await api('/workouts?week=' + S.weekStart);
    renderWorkouts();
  }

  function exMeta(e) {
    const parts = [];
    if (e.sets && e.reps) parts.push(`${e.sets} sets × ${e.reps} reps`);
    else if (e.sets) parts.push(`${e.sets} sets`);
    else if (e.reps) parts.push(`${e.reps} reps`);
    if (e.duration_min) parts.push(`${e.duration_min} min`);
    return parts.join(' · ') || 'No details';
  }

  function renderWorkouts() {
    const w = S.week;
    const today = todayStr();
    const fm = { month: 'short', day: 'numeric' };
    $('#wk-label').textContent = `${fmtDate(w.days[0].date, fm)} – ${fmtDate(w.days[6].date, fm)}`;
    $('#wk-next').disabled = false;

    $('#wk-tabs').innerHTML = w.days.map((d) => {
      const done = d.exercises.filter((e) => e.done).length;
      const total = d.exercises.length;
      const cls = ['day-tab', d.day === S.wkDay ? 'active' : '', total && done === total ? 'complete' : '', d.date === today ? 'today' : ''].join(' ');
      return `<button type="button" class="${cls}" role="tab" aria-selected="${d.day === S.wkDay}" data-day="${d.day}">
        <b>${DAYS[d.day]}</b><span class="d">${esc(fmtDate(d.date, fm))}</span><span class="c">${total ? `${done}/${total}` : 'Rest'}</span></button>`;
    }).join('');

    const day = w.days[S.wkDay];
    const done = day.exercises.filter((e) => e.done).length;
    const total = day.exercises.length;
    const future = day.date > today;
    const list = day.exercises.map((e) => `
      <div class="ex${e.done ? ' done' : ''}">
        <label class="tick"><input type="checkbox" data-ex="${e.id}" ${e.done ? 'checked' : ''} ${future ? 'disabled title="You can tick this off on the day"' : ''} aria-label="Mark ${esc(e.name)} as completed"><span>${ICON.check}</span></label>
        <div><div class="name">${esc(e.name)}</div><div class="meta">${esc(exMeta(e))}</div></div>
        <div class="entry-actions">
          <button class="icon-btn" type="button" data-edit-ex="${e.id}" aria-label="Edit ${esc(e.name)}">${ICON.edit}</button>
          <button class="icon-btn del" type="button" data-del-ex="${e.id}" aria-label="Delete ${esc(e.name)}">${ICON.del}</button>
        </div>
      </div>`).join('');

    $('#wk-panel').innerHTML = `
      <div class="day-head">
        <div><p class="muted">${DAYS_FULL[day.day]}, ${esc(fmtDate(day.date, fm))}</p>
          <h2>${esc(day.title || 'Untitled day')}</h2>
          <p class="muted">${total ? `${done} of ${total} completed` : 'No exercises planned'}</p></div>
        <div class="actions">
          <button class="btn btn-sm" type="button" data-rename>Rename day</button>
          <button class="btn btn-primary btn-sm" type="button" data-add-ex>Add exercise</button>
        </div>
      </div>
      ${total ? `<div class="bar" style="margin-bottom:8px" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((done / total) * 100)}" aria-label="Day completion"><i style="width:${(done / total) * 100}%"></i></div>${list}`
        : `<div class="empty-block"><strong>Nothing planned</strong>This is a rest day. Add light activity such as walking or stretching if you like.<br><button class="btn btn-sm" type="button" data-add-ex>Add exercise</button></div>`}`;
  }

  $('#wk-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (b) { S.wkDay = Number(b.dataset.day); renderWorkouts(); }
  });
  $('#wk-prev').addEventListener('click', () => { S.weekStart = addDays(S.weekStart, -7); loadWorkouts().catch(handleErr); });
  $('#wk-next').addEventListener('click', () => { S.weekStart = addDays(S.weekStart, 7); loadWorkouts().catch(handleErr); });
  $('#wk-today').addEventListener('click', () => { S.weekStart = mondayOf(todayStr()); S.wkDay = dayIndex(todayStr()); loadWorkouts().catch(handleErr); });

  $('#wk-panel').addEventListener('click', async (e) => {
    const day = S.week.days[S.wkDay];
    if (e.target.closest('[data-add-ex]')) return openExerciseDialog(S.wkDay);
    if (e.target.closest('[data-rename]')) return openRenameDialog(day);
    const edit = e.target.closest('[data-edit-ex]');
    if (edit) return openExerciseDialog(S.wkDay, day.exercises.find((x) => x.id === Number(edit.dataset.editEx)));
    const del = e.target.closest('[data-del-ex]');
    if (del) {
      const ex = day.exercises.find((x) => x.id === Number(del.dataset.delEx));
      if (!ex || !(await confirmAction(`Delete "${ex.name}" from ${DAYS_FULL[S.wkDay]}'s plan? Its completion history is removed too.`))) return;
      try { await api('/workouts/exercises/' + ex.id, { method: 'DELETE' }); toast('Exercise deleted.'); await loadWorkouts(); } catch (err) { handleErr(err); }
    }
  });

  $('#wk-panel').addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-ex]');
    if (!cb) return;
    const day = S.week.days[S.wkDay];
    const ex = day.exercises.find((x) => x.id === Number(cb.dataset.ex));
    try {
      await api('/workouts/complete', { method: 'POST', body: { exercise_id: ex.id, date: day.date, done: cb.checked } });
      ex.done = cb.checked;
      if (cb.checked && day.exercises.every((x) => x.done)) toast(`${day.title || 'Workout'} complete. Nice work.`);
    } catch (err) { handleErr(err); }
    renderWorkouts();
  });

  function openExerciseDialog(dayIdx, ex = null) {
    openForm({
      title: ex ? 'Edit exercise' : `Add exercise to ${DAYS_FULL[dayIdx]}`,
      body: `${fld('Exercise name', 'name', 'required maxlength="80"', ex && ex.name)}
        <div class="row row-3">
          ${fld('Sets', 'sets', 'type="number" inputmode="numeric" min="0" max="50"', ex ? ex.sets || '' : 3)}
          ${fld('Reps', 'reps', 'type="number" inputmode="numeric" min="0" max="500"', ex ? ex.reps || '' : 10)}
          ${fld('Minutes', 'duration_min', 'type="number" inputmode="numeric" min="0" max="600"', ex ? ex.duration_min || '' : '')}
        </div>
        <p class="muted small">Leave sets, reps or minutes empty if they don't apply.</p>`,
      submit: ex ? 'Save changes' : 'Add exercise',
      onSubmit: async (d) => {
        const payload = { name: d.name, sets: d.sets, reps: d.reps, duration_min: d.duration_min };
        if (ex) await api('/workouts/exercises/' + ex.id, { method: 'PUT', body: payload });
        else await api('/workouts/exercises', { method: 'POST', body: { ...payload, day: dayIdx } });
        toast(ex ? 'Exercise updated.' : 'Exercise added.');
        S.wkDay = dayIdx;
        await reload();
      },
    });
  }

  function openRenameDialog(day) {
    openForm({
      title: `Rename ${DAYS_FULL[day.day]}`,
      body: fld('Day name', 'title', 'required maxlength="60" placeholder="e.g. Legs or Active recovery"', day.title),
      onSubmit: async (d) => {
        await api('/workouts/days/' + day.day, { method: 'PUT', body: { title: d.title } });
        toast('Day renamed.');
        await reload();
      },
    });
  }

  /* =========================================================
     SUPPLEMENTS
     ========================================================= */
  async function loadSupplements() {
    const date = todayStr();
    const [list, hist] = await Promise.all([api('/supplements?date=' + date), api(`/supplements/history?days=14&end=${date}`)]);
    S.supplements = list.items;
    S.cacheDate = date;

    const total = list.items.length;
    const taken = list.items.filter((s) => s.taken);
    const pending = list.items.filter((s) => !s.taken);
    $('#sup-progress').innerHTML = total ? progressRow("Today's supplements", `${taken.length} of ${total} taken`, (taken.length / total) * 100) : '';

    const row = (s) => `
      <div class="sup">
        <label class="tick"><input type="checkbox" data-taken="${s.id}" ${s.taken ? 'checked' : ''} aria-label="Mark ${esc(s.name)} as taken"><span>${ICON.check}</span></label>
        <div><div class="name">${esc(s.name)}${s.dosage ? ` <span class="muted">· ${esc(s.dosage)}</span>` : ''}</div>
          <div class="meta">${[s.time ? fmtTime(s.time) : '', s.instructions, s.notes].filter(Boolean).map(esc).join(' · ')}${s.reminder ? ' <span class="bell">Reminder on</span>' : ''}</div></div>
        <div class="entry-actions">
          <button class="icon-btn" type="button" data-edit-sup="${s.id}" aria-label="Edit ${esc(s.name)}">${ICON.edit}</button>
          <button class="icon-btn del" type="button" data-del-sup="${s.id}" aria-label="Delete ${esc(s.name)}">${ICON.del}</button>
        </div>
      </div>`;

    $('#sup-pending').innerHTML = !total
      ? `<div class="empty-block"><strong>No supplements yet</strong>Add the supplements you already use, with your own dosage and schedule.</div>`
      : pending.length ? pending.map(row).join('') : '<p class="empty">All done for today.</p>';
    $('#sup-done').innerHTML = taken.length ? taken.map(row).join('') : '<p class="empty">Nothing taken yet today.</p>';

    const groups = {};
    hist.items.forEach((h) => { (groups[h.date] = groups[h.date] || []).push(h); });
    const dates = Object.keys(groups).sort().reverse();
    $('#sup-history').innerHTML = dates.length
      ? dates.map((d) => `<div class="history-group"><div class="h-date">${esc(fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' }))} <span class="muted">· ${groups[d].length} taken</span></div>
          <ul>${groups[d].map((g) => `<li>${esc(g.name)}${g.dosage ? ' · ' + esc(g.dosage) : ''}</li>`).join('')}</ul></div>`).join('')
      : '<p class="empty">No supplements logged in the last 14 days.</p>';
    updateNotifyButton();
  }

  $('#view-supplements').addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-taken]');
    if (!cb) return;
    try {
      await api(`/supplements/${cb.dataset.taken}/taken`, { method: 'POST', body: { date: todayStr(), taken: cb.checked } });
      await loadSupplements();
    } catch (err) { handleErr(err); await loadSupplements().catch(() => {}); }
  });

  $('#view-supplements').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit-sup]');
    const del = e.target.closest('[data-del-sup]');
    if (edit) return openSupplementDialog(S.supplements.find((s) => s.id === Number(edit.dataset.editSup)));
    if (del) {
      const s = S.supplements.find((x) => x.id === Number(del.dataset.delSup));
      if (!s || !(await confirmAction(`Delete "${s.name}"? Its history is removed too.`))) return;
      try { await api('/supplements/' + s.id, { method: 'DELETE' }); toast('Supplement deleted.'); await loadSupplements(); } catch (err) { handleErr(err); }
    }
  });
  $('#sup-add').addEventListener('click', () => openSupplementDialog());

  function openSupplementDialog(s = null) {
    openForm({
      title: s ? 'Edit supplement' : 'Add supplement',
      body: `${fld('Supplement name', 'name', 'required maxlength="80"', s && s.name)}
        <div class="row">
          ${fld('Dosage', 'dosage', 'maxlength="60" placeholder="As on the product label"', s && s.dosage)}
          ${fld('Time', 'time', 'type="time"', s && s.time)}
        </div>
        ${fld('Instructions', 'instructions', 'maxlength="300" placeholder="e.g. take with food"', s && s.instructions)}
        <div class="field"><label for="m-notes">Notes <span class="opt">(optional)</span></label><textarea class="input" id="m-notes" name="notes" maxlength="300">${esc(s ? s.notes : '')}</textarea></div>
        <label class="check" style="margin-bottom:14px"><input type="checkbox" name="reminder" ${s && s.reminder ? 'checked' : ''}> Remind me at this time</label>
        <p class="muted small">Enter your own routine. Follow the product instructions and consult a qualified healthcare professional when needed.</p>`,
      submit: s ? 'Save changes' : 'Add supplement',
      onSubmit: async (d) => {
        const payload = { name: d.name, dosage: d.dosage, time: d.time, instructions: d.instructions, notes: d.notes, reminder: !!d.reminder };
        if (s) await api('/supplements/' + s.id, { method: 'PUT', body: payload });
        else await api('/supplements', { method: 'POST', body: payload });
        toast(s ? 'Supplement updated.' : 'Supplement added.');
        await reload();
      },
    });
  }

  /* reminders (work while this tab is open) */
  function updateNotifyButton() {
    const b = $('#sup-notify');
    if (!('Notification' in window)) { b.hidden = true; return; }
    if (Notification.permission === 'granted') { b.textContent = 'Browser reminders on'; b.disabled = true; }
    else if (Notification.permission === 'denied') { b.textContent = 'Reminders blocked in browser'; b.disabled = true; }
    else { b.textContent = 'Enable reminders'; b.disabled = false; }
  }
  $('#sup-notify').addEventListener('click', async () => {
    await Notification.requestPermission();
    updateNotifyButton();
    if (Notification.permission === 'granted') toast('Reminders enabled while GYM BUDS is open in a tab.');
  });

  async function refreshSupplementCache() {
    try {
      const date = todayStr();
      S.supplements = (await api('/supplements?date=' + date)).items;
      S.cacheDate = date;
    } catch { /* ignore */ }
  }
  function checkReminders() {
    if (S.cacheDate !== todayStr()) { refreshSupplementCache(); return; }
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    S.supplements.forEach((s) => {
      if (!s.reminder || s.taken || s.time !== hhmm) return;
      const key = `${s.id}-${S.cacheDate}-${hhmm}`;
      if (S.notified.has(key)) return;
      S.notified.add(key);
      const text = `Time for ${s.name}${s.dosage ? ' (' + s.dosage + ')' : ''}.`;
      toast(text);
      if ('Notification' in window && Notification.permission === 'granted') new Notification('GYM BUDS', { body: text });
    });
  }

  /* =========================================================
     PROFILE
     ========================================================= */
  const pf = $('#profile-form');

  function showAvatar() {
    const el = $('#pf-avatar');
    el.innerHTML = S.avatarDraft ? `<img src="${esc(S.avatarDraft)}" alt="Profile picture">` : esc(initials(S.user.name));
  }

  async function loadProfile() {
    const p = await api('/profile');
    S.profile = p;
    S.user = p.user;
    renderUserChip();
    const u = p.user;
    pf.elements.name.value = u.name;
    pf.elements.age.value = u.age ?? '';
    pf.elements.gender.value = u.gender || '';
    pf.elements.height_cm.value = u.height_cm ?? '';
    pf.elements.weight_kg.value = u.weight_kg ?? '';
    pf.elements.target_weight.value = u.target_weight ?? '';
    pf.elements.goal.value = u.goal;
    pf.elements.calorie_goal.value = u.calorie_goal;
    pf.elements.water_goal_ml.value = u.water_goal_ml;
    S.avatarDraft = u.avatar || '';
    showAvatar();
    clearErrors();

    $('#pf-suggest-text').textContent = `A reasonable starting point for your details and goal is about ${fmtNum(p.suggested_calories)} kcal per day. Your current target is ${fmtNum(u.calorie_goal)} kcal.`;

    Charts.line($('#pf-chart'), p.weights.map((w) => ({ label: fmtDate(w.date, { month: 'short', day: 'numeric' }), value: w.weight_kg })), { target: u.target_weight, unit: ' kg', label: 'Weight over time' });

    const first = p.weights[0], last = p.weights[p.weights.length - 1];
    if (first && last && u.target_weight) {
      const total = u.target_weight - first.weight_kg;
      const pct = total === 0 ? 100 : ((last.weight_kg - first.weight_kg) / total) * 100;
      const left = Math.abs(u.target_weight - last.weight_kg);
      $('#pf-goal-progress').innerHTML = `<div class="goal-progress">${progressRow('Progress to target', `${r1(last.weight_kg)} → ${r1(u.target_weight)} kg`, pct)}
        <p class="muted small" style="margin-top:8px">${left < 0.05 ? 'You are at your target weight.' : `${r1(left)} kg to go.`}</p></div>`;
    } else {
      $('#pf-goal-progress').innerHTML = '<p class="muted small" style="margin-top:12px">Set a target weight to track your progress.</p>';
    }
  }

  function clearErrors() {
    $$('[data-error-for]', pf).forEach((s) => { s.textContent = ''; });
    $$('.input', pf).forEach((i) => i.removeAttribute('aria-invalid'));
    const fe = $('[data-form-error]', pf); fe.hidden = true;
  }

  $('#pf-use-suggest').addEventListener('click', () => {
    if (!S.profile) return;
    pf.elements.calorie_goal.value = S.profile.suggested_calories;
    toast('Estimate added. Save changes to apply it.');
  });

  $('#pf-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Choose an image file.', 'error');
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 192, c = document.createElement('canvas');
      c.width = c.height = size;
      const side = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      S.avatarDraft = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      showAvatar();
      toast('Photo ready. Save changes to apply it.');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be read.', 'error'); };
    img.src = url;
  });
  $('#pf-remove').addEventListener('click', () => { S.avatarDraft = ''; showAvatar(); });

  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const f = Object.fromEntries(new FormData(pf));
    const body = {
      name: f.name, age: f.age, gender: f.gender, height_cm: f.height_cm, goal: f.goal,
      target_weight: f.target_weight, calorie_goal: f.calorie_goal, water_goal_ml: f.water_goal_ml,
      avatar: S.avatarDraft, date: todayStr(),
    };
    const cur = S.user.weight_kg;
    if (f.weight_kg !== '' && Number(f.weight_kg) !== cur) body.weight_kg = f.weight_kg;
    const btn = $('button[type=submit]', pf);
    btn.disabled = true;
    try {
      const res = await api('/profile', { method: 'PUT', body });
      S.user = res.user;
      renderUserChip();
      toast('Profile saved.');
      await loadProfile();
    } catch (err) {
      if (err.status === 401) return handleErr(err);
      let first = null;
      Object.entries(err.errors || {}).forEach(([name, msg]) => {
        const span = $(`[data-error-for="${name}"]`, pf);
        const input = pf.elements[name];
        if (span) span.textContent = msg;
        if (input && input.setAttribute) { input.setAttribute('aria-invalid', 'true'); first = first || input; }
      });
      if (first) first.focus();
      else { const fe = $('[data-form-error]', pf); fe.textContent = err.message; fe.hidden = false; }
      toast(err.message, 'error');
    } finally { btn.disabled = false; }
  });

  /* ---------- boot ---------- */
  const loaders = {
    overview: loadOverview,
    calories: loadCalories,
    workouts: loadWorkouts,
    supplements: loadSupplements,
    profile: loadProfile,
  };

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* still leave */ }
    location.href = 'auth.html';
  }
  $('#logout').addEventListener('click', logout);
  $('#logout-mobile').addEventListener('click', logout);

  (async function init() {
    try {
      S.user = (await api('/auth/me')).user;
    } catch {
      location.replace('auth.html');
      return;
    }
    renderUserChip();
    $('#bottom-nav').innerHTML = $('.side-nav').innerHTML;
    $('#boot').hidden = true;
    $('#shell').hidden = false;
    window.addEventListener('hashchange', route);
    route();
    refreshSupplementCache();
    setInterval(checkReminders, 30000);
  })();
})();
