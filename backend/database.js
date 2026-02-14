const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// FilterTrack V1 (software-only) — SQLite storage
// Configure in .env: DB_PATH=./filtertrack.db
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'filtertrack.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error connecting DB:', err.message);
  } else {
    console.log('✅ SQLite DB connected:', DB_PATH);
  }
});

function initSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema, (err) => {
    if (err) {
      console.error('❌ Schema init error:', err.message);
    } else {
      console.log('✅ Schema ready');
    }
  });

  // Ensure users table exists (Auth system)
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    (err) => {
      if (err) {
        console.error('❌ Users table error:', err.message);
      } else {
        console.log('✅ Users table ready');
      }
    }
  );
}

module.exports = { db, initSchema };
