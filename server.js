const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'results.db');
const staticDir = path.join(__dirname, 'dist', 'quiz-app', 'browser');

fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      full_name TEXT,
      position TEXT,
      department TEXT,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      percent INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  addColumnIfMissing('results', 'full_name', 'TEXT');
  addColumnIfMissing('results', 'position', 'TEXT');
  addColumnIfMissing('results', 'department', 'TEXT');
  db.run(`
    UPDATE results
    SET full_name = trim(last_name || ' ' || first_name || ' ' || coalesce(middle_name, ''))
    WHERE full_name IS NULL OR full_name = ''
  `);
});

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4200');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

app.post('/api/results', (req, res) => {
  const fullName = cleanText(req.body.fullName);
  const position = cleanText(req.body.position);
  const department = cleanText(req.body.department);
  const score = Number(req.body.score);
  const totalQuestions = Number(req.body.totalQuestions);
  const percent = Number(req.body.percent);

  if (!fullName || !position || !department) {
    res.status(400).json({ error: 'ФИО, должность и отделение обязательны' });
    return;
  }

  if (!Number.isInteger(score) || !Number.isInteger(totalQuestions) || !Number.isInteger(percent)) {
    res.status(400).json({ error: 'Некорректный результат теста' });
    return;
  }

  db.run(
    `
      INSERT INTO results (
        full_name,
        position,
        department,
        last_name,
        first_name,
        middle_name,
        score,
        total_questions,
        percent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [fullName, position, department, fullName, '', '', score, totalQuestions, percent],
    function onInsert(error) {
      if (error) {
        res.status(500).json({ error: 'Не удалось сохранить результат' });
        return;
      }

      res.status(201).json({ id: this.lastID });
    }
  );
});

app.get('/api/results', (req, res) => {
  db.all(
    `
      SELECT
        id,
        coalesce(nullif(full_name, ''), trim(last_name || ' ' || first_name || ' ' || coalesce(middle_name, ''))) AS fullName,
        coalesce(position, '') AS position,
        coalesce(department, '') AS department,
        score,
        total_questions AS totalQuestions,
        percent,
        created_at AS createdAt
      FROM results
      ORDER BY created_at DESC, id DESC
    `,
    (error, rows) => {
      if (error) {
        res.status(500).json({ error: 'Не удалось получить результаты' });
        return;
      }

      res.json(rows);
    }
  );
});

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`API server: http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${dbPath}`);
});

function cleanText(value) {
  return String(value ?? '').trim();
}

function addColumnIfMissing(table, column, type) {
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (error) => {
    if (error && !String(error.message).includes('duplicate column name')) {
      console.error(error);
    }
  });
}
