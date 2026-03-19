const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

// Use persistent disk path on Render, otherwise use local path
const DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;
if (process.env.RENDER && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, 'productions.db');

console.log(`[Database] Using database path: ${DB_PATH}`);

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    createSchema();
    seedFromCsv();
  }
  return db;
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS productions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      genre TEXT,
      synopsis TEXT,
      release_year TEXT,
      publication_date TEXT,
      studio TEXT,
      personnel TEXT,
      background TEXT,
      source_title TEXT,
      source_url TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Migration: Add background column if it doesn't exist (for existing databases)
  const columns = db.prepare("PRAGMA table_info(productions)").all();
  const hasBackground = columns.some(col => col.name === 'background');
  
  if (!hasBackground) {
    console.log('[Database] Adding background column to existing table');
    db.exec('ALTER TABLE productions ADD COLUMN background TEXT');
  }
}

function seedFromCsv() {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM productions').get().cnt;
  if (count > 0) return; // Already seeded

  const csvPath = path.join(__dirname, 'uk_ireland_productions.csv');
  if (!fs.existsSync(csvPath)) return;

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const insert = db.prepare(`
    INSERT INTO productions (title, type, genre, synopsis, release_year, publication_date, studio, personnel, source_title, source_url)
    VALUES (@Title, @Type, @Genre, @Synopsis, @ReleaseYear, @PublicationDate, @Studio, @Personnel, @SourceTitle, @SourceURL)
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run({
        Title: row['Title'],
        Type: row['Type'],
        Genre: row['Genre'],
        Synopsis: row['Synopsis'],
        ReleaseYear: row['Release Year'],
        PublicationDate: row['Publication Date'],
        Studio: row['Studio'],
        Personnel: row['Personnel'],
        SourceTitle: row['Source Title'],
        SourceURL: row['Source URL'],
      });
    }
  });

  insertMany(records);
  console.log(`Seeded ${records.length} productions from CSV`);
}

function getAllProductions({ status, sort, order }) {
  let sql = 'SELECT * FROM productions';
  const params = [];

  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }

  const allowedSorts = ['publication_date', 'genre', 'title', 'created_at'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'publication_date';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortCol} ${sortOrder}`;

  return db.prepare(sql).all(...params);
}

function updateStatus(id, status) {
  const allowed = ['new', 'greenlight', 'not_interested', 'archived'];
  if (!allowed.includes(status)) throw new Error('Invalid status');
  return db.prepare('UPDATE productions SET status = ? WHERE id = ?').run(status, id);
}

function insertProduction(prod) {
  // Check for duplicate by title
  const existing = db.prepare('SELECT id FROM productions WHERE title = ?').get(prod.title);
  if (existing) return null;

  return db.prepare(`
    INSERT INTO productions (title, type, genre, synopsis, release_year, publication_date, studio, personnel, background, source_title, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    prod.title, prod.type, prod.genre, prod.synopsis,
    prod.release_year, prod.publication_date, prod.studio,
    prod.personnel, prod.background || null, prod.source_title, prod.source_url
  );
}

module.exports = { getDb, getAllProductions, updateStatus, insertProduction };
