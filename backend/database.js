const { Pool } = require('pg');

// PostgreSQL connection (Render / Production ready)
// Requires: DATABASE_URL in environment variables
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not defined in environment variables');
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL;

// Always force SSL for cloud databases (Render requires it)
const isLocal = rawUrl.includes('localhost');

const pool = new Pool(
  isLocal
    ? {
        user: 'davidbastida',
        host: 'localhost',
        database: 'filtertrack',
        port: 5432,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 20000,
      }
    : {
        connectionString: rawUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 20000,
        keepAlive: true
      }
);

pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL error:', err.message);
});

async function initSchema() {
  try {
    // Verify connection
    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL schema verified');

    // Log which database the backend is actually connected to
    const dbNameResult = await pool.query('SELECT current_database()');
    console.log('🔥 Backend connected to DB:', dbNameResult.rows[0].current_database);

  } catch (err) {
    console.error('❌ Database connection error:', err);
  }
}

module.exports = {
  db: pool,
  initSchema
};

