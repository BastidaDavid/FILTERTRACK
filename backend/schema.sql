-- ==========================================
-- FilterTrack V2 - PostgreSQL Schema
-- ==========================================

-- ==============================
-- MACHINE BRANDS
-- ==============================
CREATE TABLE IF NOT EXISTS machine_brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(50) NOT NULL
);

-- ==============================
-- MACHINE MODELS
-- ==============================
CREATE TABLE IF NOT EXISTS machine_models (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER REFERENCES machine_brands(id) ON DELETE CASCADE,
  model_name VARCHAR(100) NOT NULL,
  filter_type VARCHAR(100)
);

-- ==============================
-- MODEL FILTERS (Recommended)
-- ==============================
CREATE TABLE IF NOT EXISTS model_filters (
  id SERIAL PRIMARY KEY,
  model_id INTEGER REFERENCES machine_models(id) ON DELETE CASCADE,
  filter_name VARCHAR(100) NOT NULL,
  life_months INTEGER NOT NULL,
  notes TEXT
);

-- ==============================
-- FILTERS (Installed Units)
-- ==============================
CREATE TABLE IF NOT EXISTS filters (
  id SERIAL PRIMARY KEY,
  filter_id VARCHAR(100) UNIQUE NOT NULL,
  machine_id VARCHAR(100) NOT NULL,
  org_id VARCHAR(100) NOT NULL,
  install_date DATE NOT NULL,
  life_months INTEGER NOT NULL DEFAULT 6,
  due_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL,
  responsible VARCHAR(100) NOT NULL,
  notes TEXT,
  record_state VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================
-- EVENTS (History Log)
-- ==============================
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  filter_id VARCHAR(100) REFERENCES filters(filter_id) ON DELETE CASCADE,
  org_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_date DATE NOT NULL,
  reason VARCHAR(100),
  responsible VARCHAR(100) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================
-- INDEXES
-- ==============================
CREATE INDEX IF NOT EXISTS idx_filters_status ON filters(status);
CREATE INDEX IF NOT EXISTS idx_filters_state ON filters(record_state);
CREATE INDEX IF NOT EXISTS idx_events_filter ON events(filter_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);

CREATE INDEX IF NOT EXISTS idx_filters_org_state
ON filters(org_id, record_state);

-- ==============================
-- USERS (Authentication)
-- ==============================
CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(100) PRIMARY KEY,
  org_id VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================
-- MACHINES
-- ==============================
CREATE TABLE IF NOT EXISTS machines (
  machine_id VARCHAR(100) NOT NULL,
  org_id VARCHAR(100) NOT NULL,
  area VARCHAR(100),
  location VARCHAR(100),
  brand_id INTEGER REFERENCES machine_brands(id),
  model_id INTEGER REFERENCES machine_models(id),
  serial_number VARCHAR(100),
  record_state VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (machine_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_machines_org ON machines(org_id);
CREATE INDEX IF NOT EXISTS idx_machines_brand ON machines(brand_id);

CREATE INDEX IF NOT EXISTS idx_machines_model ON machines(model_id);

-- ==============================
-- AUTO UPDATE TIMESTAMP TRIGGER
-- ==============================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_filters_updated_at
BEFORE UPDATE ON filters
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_machines_updated_at
BEFORE UPDATE ON machines
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
