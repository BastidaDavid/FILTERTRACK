const { Pool } = require('pg');

// PostgreSQL connection (Render / Production ready)
// Requires: DATABASE_URL in environment variables
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not defined in environment variables');
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL error:', err.message);
});

async function initSchema() {
  try {
    // Test connection explicitly
    await pool.query('SELECT 1');
    // Organizations table (Multi-tenant SaaS)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        org_id TEXT PRIMARY KEY,
        org_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Users table (Auth system)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Filters table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS filters (
        filter_id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
        area TEXT,
        equipment TEXT,
        location TEXT,
        brand TEXT,
        model TEXT,
        install_date DATE,
        life_months INTEGER,
        due_date DATE,
        status TEXT,
        responsible TEXT,
        notes TEXT,
        record_state TEXT DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Events table (audit trail)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        event_id SERIAL PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
        filter_id TEXT NOT NULL REFERENCES filters(filter_id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        event_date DATE NOT NULL,
        reason TEXT,
        responsible TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Indexes for multi-tenant performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_filters_org ON filters(org_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_filter ON events(filter_id);`);

    console.log('✅ PostgreSQL schema ready');
  } catch (err) {
    console.error('❌ Schema init error FULL:', err);
  }
}

module.exports = {
  db: pool,
  initSchema
};
