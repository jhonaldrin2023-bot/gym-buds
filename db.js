'use strict';
// Simple file-based SQLite database. The file is created automatically at data/gymbuds.db
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, 'gymbuds.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  age           INTEGER,
  gender        TEXT DEFAULT '',
  height_cm     REAL,
  goal          TEXT NOT NULL DEFAULT 'General Fitness',
  target_weight REAL,
  calorie_goal  INTEGER NOT NULL DEFAULT 2200,
  water_goal_ml INTEGER NOT NULL DEFAULT 2500,
  avatar        TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS weight_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date      TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS foods (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  meal     TEXT NOT NULL,
  name     TEXT NOT NULL,
  serving  TEXT DEFAULT '',
  calories REAL NOT NULL DEFAULT 0,
  protein  REAL NOT NULL DEFAULT 0,
  carbs    REAL NOT NULL DEFAULT 0,
  fat      REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_foods_user_date ON foods(user_id, date);

CREATE TABLE IF NOT EXISTS water_logs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  ml      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS workout_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     INTEGER NOT NULL,            -- 0 = Monday ... 6 = Sunday
  title   TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS exercises (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          INTEGER NOT NULL,
  name         TEXT NOT NULL,
  sets         INTEGER NOT NULL DEFAULT 0,
  reps         INTEGER NOT NULL DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_exercises_user_day ON exercises(user_id, day);

CREATE TABLE IF NOT EXISTS exercise_logs (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  PRIMARY KEY (exercise_id, date)
);

CREATE TABLE IF NOT EXISTS supplements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  dosage       TEXT DEFAULT '',
  time         TEXT DEFAULT '',        -- HH:MM
  instructions TEXT DEFAULT '',
  notes        TEXT DEFAULT '',
  reminder     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supplement_logs (
  supplement_id INTEGER NOT NULL REFERENCES supplements(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  PRIMARY KEY (supplement_id, date)
);
`);

module.exports = db;
