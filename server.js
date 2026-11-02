'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const COOKIE = 'gb_session';
const GOALS = ['Weight Loss', 'Muscle Building', 'Strength Training', 'General Fitness', 'Endurance'];
const GENDERS = ['', 'male', 'female', 'other'];
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '600kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Block cross-site state-changing requests
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        return res.status(403).json({ error: 'Cross-origin request blocked.' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid origin.' });
    }
  }
  next();
});

/* ---------- helpers ---------- */
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, min, max) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const validDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00Z')) ? v : null);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (date, n) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayIndex = (date) => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday = 0
const bad = (res, error, errors = {}, status = 400) => res.status(status).json({ error, errors });

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function createSession(res, userId, remember) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = remember ? 30 * 864e5 : 864e5;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + ttl);
  let cookie = `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/`;
  if (remember) cookie += `; Max-Age=${ttl / 1000}`;
  if (process.env.NODE_ENV === 'production') cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function auth(req, res, next) {
  const token = parseCookies(req)[COOKIE];
  if (token) {
    const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha(token));
    if (row && row.expires_at > Date.now()) {
      req.uid = row.user_id;
      req.tokenHash = sha(token);
      return next();
    }
  }
  res.status(401).json({ error: 'Please log in to continue.' });
}

function latestWeight(uid) {
  const r = db.prepare('SELECT weight_kg FROM weight_logs WHERE user_id = ? ORDER BY date DESC LIMIT 1').get(uid);
  return r ? r.weight_kg : null;
}

function publicUser(uid) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!u) return null;
  return {
    id: u.id, name: u.name, email: u.email, age: u.age, gender: u.gender,
    height_cm: u.height_cm, goal: u.goal, target_weight: u.target_weight,
    calorie_goal: u.calorie_goal, water_goal_ml: u.water_goal_ml, avatar: u.avatar,
    weight_kg: latestWeight(uid),
  };
}

// Rough starting estimate (Mifflin-St Jeor, light activity). Users can override it.
function estimateCalories({ age, gender, height_cm, weight_kg, goal }) {
  if (!age || !height_cm || !weight_kg) return 2200;
  const s = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + s;
  let kcal = bmr * 1.4;
  if (goal === 'Weight Loss') kcal -= 400;
  if (goal === 'Muscle Building') kcal += 300;
  if (goal === 'Endurance') kcal += 100;
  return Math.max(1200, Math.min(5000, Math.round(kcal / 50) * 50));
}

function upsertWeight(uid, date, kg) {
  db.prepare(`INSERT INTO weight_logs (user_id, date, weight_kg) VALUES (?, ?, ?)
              ON CONFLICT(user_id, date) DO UPDATE SET weight_kg = excluded.weight_kg`).run(uid, date, kg);
}

function seedWorkouts(uid) {
  const plan = [
    ['Chest & Triceps', [['Bench Press', 4, 10, 0], ['Incline Dumbbell Press', 3, 10, 0], ['Chest Fly', 3, 12, 0], ['Tricep Pushdown', 3, 12, 0]]],
    ['Back & Biceps', [['Lat Pulldown', 4, 10, 0], ['Seated Cable Row', 3, 10, 0], ['Dumbbell Curl', 3, 12, 0], ['Hammer Curl', 3, 12, 0]]],
    ['Rest / Active Recovery', [['Walking', 0, 0, 30], ['Stretching', 0, 0, 15], ['Light Cardio', 0, 0, 15]]],
    ['Legs', [['Squats', 4, 8, 0], ['Leg Press', 3, 12, 0], ['Lunges', 3, 10, 0], ['Calf Raises', 4, 15, 0]]],
    ['Shoulders & Abs', [['Shoulder Press', 4, 10, 0], ['Lateral Raises', 3, 15, 0], ['Plank', 3, 0, 1], ['Crunches', 3, 20, 0]]],
    ['Full Body', [['Push-ups', 3, 15, 0], ['Dumbbell Rows', 3, 12, 0], ['Squats', 3, 12, 0], ['Cardio', 0, 0, 20]]],
    ['Rest Day', []],
  ];
  const day = db.prepare('INSERT INTO workout_days (user_id, day, title) VALUES (?, ?, ?)');
  const ex = db.prepare('INSERT INTO exercises (user_id, day, name, sets, reps, duration_min, position) VALUES (?, ?, ?, ?, ?, ?, ?)');
  plan.forEach(([title, list], d) => {
    day.run(uid, d, title);
    list.forEach(([name, sets, reps, dur], i) => ex.run(uid, d, name, sets, reps, dur, i));
  });
}

/* ---------- auth ---------- */
const attempts = new Map(); // simple in-memory login throttle
function throttled(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, list);
  return list.length >= 10;
}

app.post('/api/auth/register', (req, res) => {
  const b = req.body || {};
  const errors = {};
  const name = str(b.name, 80);
  const email = str(b.email, 120).toLowerCase();
  const age = num(b.age, 10, 100);
  const height = num(b.height_cm, 100, 250);
  const weight = num(b.weight_kg, 25, 400);
  const gender = str(b.gender, 10).toLowerCase();
  const goal = str(b.goal, 40);

  if (name.length < 2) errors.name = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (typeof b.password !== 'string' || b.password.length < 8) errors.password = 'Use at least 8 characters.';
  if (b.password !== b.confirm) errors.confirm = 'Passwords do not match.';
  if (age === null) errors.age = 'Enter an age between 10 and 100.';
  if (!GENDERS.includes(gender)) errors.gender = 'Choose a valid option.';
  if (height === null) errors.height_cm = 'Enter your height in cm (100–250).';
  if (weight === null) errors.weight_kg = 'Enter your weight in kg (25–400).';
  if (!GOALS.includes(goal)) errors.goal = 'Choose a fitness goal.';
  if (Object.keys(errors).length) return bad(res, 'Please fix the highlighted fields.', errors);

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return bad(res, 'Please fix the highlighted fields.', { email: 'An account with this email already exists.' }, 409);
  }

  const hash = bcrypt.hashSync(b.password, 12);
  const date = validDate(b.date) || todayStr();
  const create = db.transaction(() => {
    const info = db.prepare(`INSERT INTO users (name, email, password_hash, age, gender, height_cm, goal, calorie_goal)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(name, email, hash, age, gender, height, goal, estimateCalories({ age, gender, height_cm: height, weight_kg: weight, goal }));
    upsertWeight(info.lastInsertRowid, date, weight);
    seedWorkouts(info.lastInsertRowid);
    return info.lastInsertRowid;
  });
  const uid = create();
  createSession(res, uid, true);
  res.status(201).json({ user: publicUser(uid) });
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

app.post('/api/auth/login', (req, res) => {
  const b = req.body || {};
  const email = str(b.email, 120).toLowerCase();
  const key = `${req.ip}|${email}`;
  if (throttled(key)) return bad(res, 'Too many attempts. Try again in a few minutes.', {}, 429);

  const u = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  const ok = bcrypt.compareSync(typeof b.password === 'string' ? b.password : '', u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) {
    attempts.get(key).push(Date.now());
    return bad(res, 'Incorrect email or password.', {}, 401);
  }
  attempts.delete(key);
  createSession(res, u.id, !!b.remember);
  res.json({ user: publicUser(u.id) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
  clearCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.uid) }));

// No email server in a local project: the reset link is printed in the terminal.
app.post('/api/auth/forgot', (req, res) => {
  const email = str((req.body || {}).email, 120).toLowerCase();
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM reset_tokens WHERE user_id = ?').run(u.id);
    db.prepare('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), u.id, Date.now() + 60 * 60 * 1000);
    console.log(`\n[GYM BUDS] Password reset link for ${email}:\nhttp://localhost:${PORT}/auth.html?mode=reset&token=${token}\n`);
  }
  res.json({ ok: true });
});

app.post('/api/auth/reset', (req, res) => {
  const b = req.body || {};
  if (typeof b.password !== 'string' || b.password.length < 8) return bad(res, 'Use at least 8 characters.', { password: 'Use at least 8 characters.' });
  if (b.password !== b.confirm) return bad(res, 'Passwords do not match.', { confirm: 'Passwords do not match.' });
  const row = db.prepare('SELECT user_id, expires_at FROM reset_tokens WHERE token_hash = ?').get(sha(str(b.token, 100)));
  if (!row || row.expires_at < Date.now()) return bad(res, 'This reset link is invalid or has expired. Request a new one.');
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(b.password, 12), row.user_id);
    db.prepare('DELETE FROM reset_tokens WHERE user_id = ?').run(row.user_id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  })();
  res.json({ ok: true });
});

/* ---------- profile ---------- */
app.get('/api/profile', auth, (req, res) => {
  const user = publicUser(req.uid);
  const weights = db.prepare('SELECT date, weight_kg FROM weight_logs WHERE user_id = ? ORDER BY date DESC LIMIT 60').all(req.uid).reverse();
  res.json({ user, weights, suggested_calories: estimateCalories({ ...user, weight_kg: user.weight_kg }) });
});

app.put('/api/profile', auth, (req, res) => {
  const b = req.body || {};
  const errors = {};
  const name = str(b.name, 80);
  const age = num(b.age, 10, 100);
  const height = num(b.height_cm, 100, 250);
  const target = b.target_weight === '' || b.target_weight == null ? null : num(b.target_weight, 25, 400);
  const weight = b.weight_kg === '' || b.weight_kg == null ? null : num(b.weight_kg, 25, 400);
  const kcal = num(b.calorie_goal, 800, 8000);
  const water = num(b.water_goal_ml, 500, 10000);
  const gender = str(b.gender, 10).toLowerCase();
  const goal = str(b.goal, 40);
  let avatar = typeof b.avatar === 'string' ? b.avatar : '';

  if (name.length < 2) errors.name = 'Enter your full name.';
  if (age === null) errors.age = 'Enter an age between 10 and 100.';
  if (height === null) errors.height_cm = 'Enter a height between 100 and 250 cm.';
  if (b.target_weight !== '' && b.target_weight != null && target === null) errors.target_weight = 'Enter a weight between 25 and 400 kg.';
  if (b.weight_kg !== '' && b.weight_kg != null && weight === null) errors.weight_kg = 'Enter a weight between 25 and 400 kg.';
  if (kcal === null) errors.calorie_goal = 'Enter a daily goal between 800 and 8000 kcal.';
  if (water === null) errors.water_goal_ml = 'Enter a goal between 500 and 10000 ml.';
  if (!GENDERS.includes(gender)) errors.gender = 'Choose a valid option.';
  if (!GOALS.includes(goal)) errors.goal = 'Choose a fitness goal.';
  if (avatar && (!avatar.startsWith('data:image/') || avatar.length > 300000)) errors.avatar = 'Profile picture is invalid or too large.';
  if (Object.keys(errors).length) return bad(res, 'Please fix the highlighted fields.', errors);

  db.transaction(() => {
    db.prepare(`UPDATE users SET name=?, age=?, gender=?, height_cm=?, goal=?, target_weight=?, calorie_goal=?, water_goal_ml=?, avatar=? WHERE id=?`)
      .run(name, age, gender, height, goal, target, Math.round(kcal), Math.round(water), avatar, req.uid);
    if (weight !== null) upsertWeight(req.uid, validDate(b.date) || todayStr(), weight);
  })();
  res.json({ user: publicUser(req.uid) });
});

/* ---------- dashboard ---------- */
app.get('/api/dashboard', auth, (req, res) => {
  const uid = req.uid;
  const date = validDate(req.query.date) || todayStr();
  const start = addDays(date, -6);
  const user = publicUser(uid);

  const calRows = db.prepare('SELECT date, SUM(calories) c FROM foods WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date').all(uid, start, date);
  const calMap = Object.fromEntries(calRows.map((r) => [r.date, Math.round(r.c)]));
  const planRows = db.prepare('SELECT day, COUNT(*) n FROM exercises WHERE user_id = ? GROUP BY day').all(uid);
  const planMap = Object.fromEntries(planRows.map((r) => [r.day, r.n]));
  const doneRows = db.prepare('SELECT date, COUNT(*) n FROM exercise_logs WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date').all(uid, start, date);
  const doneMap = Object.fromEntries(doneRows.map((r) => [r.date, r.n]));

  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    week.push({ date: d, calories: calMap[d] || 0, done: doneMap[d] || 0, total: planMap[dayIndex(d)] || 0 });
  }
  const today = week[6];
  const water = db.prepare('SELECT ml FROM water_logs WHERE user_id = ? AND date = ?').get(uid, date);
  const supTotal = db.prepare('SELECT COUNT(*) n FROM supplements WHERE user_id = ?').get(uid).n;
  const supTaken = db.prepare('SELECT COUNT(*) n FROM supplement_logs WHERE user_id = ? AND date = ?').get(uid, date).n;
  const weightSeries = db.prepare('SELECT date, weight_kg kg FROM weight_logs WHERE user_id = ? ORDER BY date DESC LIMIT 60').all(uid).reverse();

  res.json({
    date,
    name: user.name,
    calories: { consumed: today.calories, goal: user.calorie_goal },
    water: { ml: water ? water.ml : 0, goal: user.water_goal_ml },
    workouts: { done: today.done, total: today.total },
    supplements: { taken: supTaken, total: supTotal },
    weight: { current: user.weight_kg, target: user.target_weight },
    setup: {
      meal: !!db.prepare('SELECT 1 x FROM foods WHERE user_id = ? LIMIT 1').get(uid),
      workout: !!db.prepare('SELECT 1 x FROM exercise_logs WHERE user_id = ? LIMIT 1').get(uid),
      supplement: supTotal > 0,
      target: user.target_weight != null,
    },
    week,
    weightSeries,
  });
});

/* ---------- foods / calories ---------- */
function foodBody(b) {
  const errors = {};
  const name = str(b.name, 100);
  const meal = str(b.meal, 20);
  const calories = num(b.calories, 0, 10000);
  const protein = b.protein === '' || b.protein == null ? 0 : num(b.protein, 0, 1000);
  const carbs = b.carbs === '' || b.carbs == null ? 0 : num(b.carbs, 0, 2000);
  const fat = b.fat === '' || b.fat == null ? 0 : num(b.fat, 0, 1000);
  if (!name) errors.name = 'Enter a food name.';
  if (!MEALS.includes(meal)) errors.meal = 'Choose a meal.';
  if (calories === null) errors.calories = 'Enter calories (0–10000).';
  if (protein === null) errors.protein = 'Enter 0–1000 g.';
  if (carbs === null) errors.carbs = 'Enter 0–2000 g.';
  if (fat === null) errors.fat = 'Enter 0–1000 g.';
  return { errors, v: { name, meal, serving: str(b.serving, 60), calories, protein, carbs, fat } };
}

app.get('/api/foods', auth, (req, res) => {
  const date = validDate(req.query.date) || todayStr();
  const items = db.prepare('SELECT * FROM foods WHERE user_id = ? AND date = ? ORDER BY id').all(req.uid, date);
  const totals = items.reduce((t, f) => ({ calories: t.calories + f.calories, protein: t.protein + f.protein, carbs: t.carbs + f.carbs, fat: t.fat + f.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  res.json({ date, items, totals });
});

app.get('/api/foods/recent', auth, (req, res) => {
  const rows = db.prepare(`SELECT name, serving, calories, protein, carbs, fat FROM foods
                           WHERE user_id = ? AND id IN (SELECT MAX(id) FROM foods WHERE user_id = ? GROUP BY LOWER(name))
                           ORDER BY id DESC LIMIT 60`).all(req.uid, req.uid);
  res.json({ items: rows });
});

app.get('/api/foods/history', auth, (req, res) => {
  const end = validDate(req.query.end) || todayStr();
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const rows = db.prepare(`SELECT date, ROUND(SUM(calories)) calories, ROUND(SUM(protein)) protein, ROUND(SUM(carbs)) carbs, ROUND(SUM(fat)) fat
                           FROM foods WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date DESC`).all(req.uid, addDays(end, -(days - 1)), end);
  res.json({ items: rows });
});

app.post('/api/foods', auth, (req, res) => {
  const date = validDate(req.body && req.body.date);
  const { errors, v } = foodBody(req.body || {});
  if (!date) errors.date = 'Invalid date.';
  if (Object.keys(errors).length) return bad(res, Object.values(errors)[0], errors);
  const info = db.prepare('INSERT INTO foods (user_id, date, meal, name, serving, calories, protein, carbs, fat) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.uid, date, v.meal, v.name, v.serving, v.calories, v.protein, v.carbs, v.fat);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put('/api/foods/:id', auth, (req, res) => {
  const { errors, v } = foodBody(req.body || {});
  if (Object.keys(errors).length) return bad(res, Object.values(errors)[0], errors);
  const info = db.prepare('UPDATE foods SET meal=?, name=?, serving=?, calories=?, protein=?, carbs=?, fat=? WHERE id=? AND user_id=?')
    .run(v.meal, v.name, v.serving, v.calories, v.protein, v.carbs, v.fat, req.params.id, req.uid);
  if (!info.changes) return bad(res, 'Entry not found.', {}, 404);
  res.json({ ok: true });
});

app.delete('/api/foods/:id', auth, (req, res) => {
  const info = db.prepare('DELETE FROM foods WHERE id = ? AND user_id = ?').run(req.params.id, req.uid);
  if (!info.changes) return bad(res, 'Entry not found.', {}, 404);
  res.json({ ok: true });
});

/* ---------- water ---------- */
app.get('/api/water', auth, (req, res) => {
  const date = validDate(req.query.date) || todayStr();
  const r = db.prepare('SELECT ml FROM water_logs WHERE user_id = ? AND date = ?').get(req.uid, date);
  res.json({ date, ml: r ? r.ml : 0 });
});

app.put('/api/water', auth, (req, res) => {
  const date = validDate(req.body && req.body.date);
  const ml = num(req.body && req.body.ml, 0, 20000);
  if (!date || ml === null) return bad(res, 'Enter a valid amount of water.');
  db.prepare(`INSERT INTO water_logs (user_id, date, ml) VALUES (?, ?, ?)
              ON CONFLICT(user_id, date) DO UPDATE SET ml = excluded.ml`).run(req.uid, date, Math.round(ml));
  res.json({ date, ml: Math.round(ml) });
});

/* ---------- workouts ---------- */
app.get('/api/workouts', auth, (req, res) => {
  const uid = req.uid;
  const start = validDate(req.query.week) || addDays(todayStr(), -dayIndex(todayStr()));
  const end = addDays(start, 6);
  const titles = Object.fromEntries(db.prepare('SELECT day, title FROM workout_days WHERE user_id = ?').all(uid).map((r) => [r.day, r.title]));
  const exercises = db.prepare('SELECT id, day, name, sets, reps, duration_min FROM exercises WHERE user_id = ? ORDER BY day, position, id').all(uid);
  const logs = new Set(db.prepare('SELECT exercise_id, date FROM exercise_logs WHERE user_id = ? AND date BETWEEN ? AND ?').all(uid, start, end).map((r) => `${r.exercise_id}|${r.date}`));
  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(start, d);
    days.push({
      day: d, date, title: titles[d] || '',
      exercises: exercises.filter((e) => e.day === d).map((e) => ({ ...e, done: logs.has(`${e.id}|${date}`) })),
    });
  }
  res.json({ weekStart: start, days });
});

function exerciseBody(b) {
  const errors = {};
  const name = str(b.name, 80);
  const sets = b.sets === '' || b.sets == null ? 0 : num(b.sets, 0, 50);
  const reps = b.reps === '' || b.reps == null ? 0 : num(b.reps, 0, 500);
  const dur = b.duration_min === '' || b.duration_min == null ? 0 : num(b.duration_min, 0, 600);
  if (!name) errors.name = 'Enter an exercise name.';
  if (sets === null) errors.sets = 'Sets must be 0–50.';
  if (reps === null) errors.reps = 'Reps must be 0–500.';
  if (dur === null) errors.duration_min = 'Duration must be 0–600 minutes.';
  return { errors, v: { name, sets: Math.round(sets), reps: Math.round(reps), dur: Math.round(dur) } };
}

app.post('/api/workouts/exercises', auth, (req, res) => {
  const day = parseInt(req.body && req.body.day, 10);
  const { errors, v } = exerciseBody(req.body || {});
  if (!(day >= 0 && day <= 6)) errors.day = 'Invalid day.';
  if (Object.keys(errors).length) return bad(res, Object.values(errors)[0], errors);
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 p FROM exercises WHERE user_id = ? AND day = ?').get(req.uid, day).p;
  const info = db.prepare('INSERT INTO exercises (user_id, day, name, sets, reps, duration_min, position) VALUES (?,?,?,?,?,?,?)').run(req.uid, day, v.name, v.sets, v.reps, v.dur, pos);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put('/api/workouts/exercises/:id', auth, (req, res) => {
  const { errors, v } = exerciseBody(req.body || {});
  if (Object.keys(errors).length) return bad(res, Object.values(errors)[0], errors);
  const info = db.prepare('UPDATE exercises SET name=?, sets=?, reps=?, duration_min=? WHERE id=? AND user_id=?').run(v.name, v.sets, v.reps, v.dur, req.params.id, req.uid);
  if (!info.changes) return bad(res, 'Exercise not found.', {}, 404);
  res.json({ ok: true });
});

app.delete('/api/workouts/exercises/:id', auth, (req, res) => {
  const info = db.prepare('DELETE FROM exercises WHERE id = ? AND user_id = ?').run(req.params.id, req.uid);
  if (!info.changes) return bad(res, 'Exercise not found.', {}, 404);
  res.json({ ok: true });
});

app.put('/api/workouts/days/:day', auth, (req, res) => {
  const day = parseInt(req.params.day, 10);
  const title = str(req.body && req.body.title, 60);
  if (!(day >= 0 && day <= 6)) return bad(res, 'Invalid day.');
  if (!title) return bad(res, 'Enter a name for this day.', { title: 'Enter a name for this day.' });
  db.prepare(`INSERT INTO workout_days (user_id, day, title) VALUES (?, ?, ?)
              ON CONFLICT(user_id, day) DO UPDATE SET title = excluded.title`).run(req.uid, day, title);
  res.json({ ok: true });
});

app.post('/api/workouts/complete', auth, (req, res) => {
  const b = req.body || {};
  const date = validDate(b.date);
  const own = db.prepare('SELECT id FROM exercises WHERE id = ? AND user_id = ?').get(b.exercise_id, req.uid);
  if (!date || !own) return bad(res, 'Exercise not found.', {}, 404);
  if (b.done) db.prepare('INSERT OR IGNORE INTO exercise_logs (exercise_id, user_id, date) VALUES (?, ?, ?)').run(own.id, req.uid, date);
  else db.prepare('DELETE FROM exercise_logs WHERE exercise_id = ? AND date = ? AND user_id = ?').run(own.id, date, req.uid);
  res.json({ ok: true });
});

/* ---------- supplements ---------- */
function supplementBody(b) {
  const errors = {};
  const name = str(b.name, 80);
  const time = str(b.time, 5);
  if (!name) errors.name = 'Enter a supplement name.';
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = 'Use a valid time.';
  if (b.reminder && !time) errors.time = 'Set a time to enable a reminder.';
  return { errors, v: { name, dosage: str(b.dosage, 60), time, instructions: str(b.instructions, 300), notes: str(b.notes, 300), reminder: b.reminder ? 1 : 0 } };
}

app.get('/api/supplements', auth, (req, res) => {
  const date = validDate(req.query.date) || todayStr();
  const taken = new Set(db.prepare('SELECT supplement_id FROM supplement_logs WHERE user_id = ? AND date = ?').all(req.uid, date).map((r) => r.supplement_id));
  const items = db.prepare(`SELECT * FROM supplements WHERE user_id = ? ORDER BY CASE WHEN time = '' THEN 1 ELSE 0 END, time, id`).all(req.uid)
    .map((s) => ({ ...s, taken: taken.has(s.id) }));
  res.json({ date, items });
});

app.get('/api/supplements/history', auth, (req, res) => {
  const end = validDate(req.query.end) || todayStr();
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
  const rows = db.prepare(`SELECT l.date, s.name, s.dosage FROM supplement_logs l JOIN supplements s ON s.id = l.supplement_id
                           WHERE l.user_id = ? AND l.date BETWEEN ? AND ? ORDER BY l.date DESC, s.name`).all(req.uid, addDays(end, -(days - 1)), end);
  res.json({ items: rows });
});

app.post('/api/supplements', auth, (req, res) => {
  const { errors, v } = supplementBody(req.body || {});
  if (Object.keys(errors).length) return bad(res, Object.values(errors)[0], errors);
  const info = db.prepare('INSERT INTO supplements (user_id, name, dosage, time, instructions, notes, reminder) VALUES (?,?,?,?,?,?,?)')
    .run(req.uid, v.name, v.dosage, v.time, v.instructions, v.notes, v.reminder);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put('/api/supplements/:id', auth, (req, res) => {
  const { errors, v } = supplementBody(req.body || {});
  if (Object.keys(errors).length) return bad(res, Object.values(errors)[0], errors);
  const info = db.prepare('UPDATE supplements SET name=?, dosage=?, time=?, instructions=?, notes=?, reminder=? WHERE id=? AND user_id=?')
    .run(v.name, v.dosage, v.time, v.instructions, v.notes, v.reminder, req.params.id, req.uid);
  if (!info.changes) return bad(res, 'Supplement not found.', {}, 404);
  res.json({ ok: true });
});

app.delete('/api/supplements/:id', auth, (req, res) => {
  const info = db.prepare('DELETE FROM supplements WHERE id = ? AND user_id = ?').run(req.params.id, req.uid);
  if (!info.changes) return bad(res, 'Supplement not found.', {}, 404);
  res.json({ ok: true });
});

app.post('/api/supplements/:id/taken', auth, (req, res) => {
  const date = validDate(req.body && req.body.date);
  const own = db.prepare('SELECT id FROM supplements WHERE id = ? AND user_id = ?').get(req.params.id, req.uid);
  if (!date || !own) return bad(res, 'Supplement not found.', {}, 404);
  if (req.body.taken) db.prepare('INSERT OR IGNORE INTO supplement_logs (supplement_id, user_id, date) VALUES (?, ?, ?)').run(own.id, req.uid, date);
  else db.prepare('DELETE FROM supplement_logs WHERE supplement_id = ? AND date = ? AND user_id = ?').run(own.id, date, req.uid);
  res.json({ ok: true });
});

/* ---------- static files ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.status === 413 ? 'That upload is too large.' : 'Something went wrong on the server.' });
});

// Clean up expired sessions on start and hourly
const cleanup = () => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?').run(Date.now());
};
cleanup();
setInterval(cleanup, 60 * 60 * 1000).unref();

app.listen(PORT, () => console.log(`GYM BUDS is running at http://localhost:${PORT}`));
