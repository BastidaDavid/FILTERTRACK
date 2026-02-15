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
  area VARCHAR(100) NOT NULL,
  equipment VARCHAR(100) NOT NULL,
  location VARCHAR(100) NOT NULL,
  brand_id INTEGER REFERENCES machine_brands(id),
  model_id INTEGER REFERENCES machine_models(id),
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
CREATE INDEX IF NOT EXISTS idx_filters_area ON filters(area);
CREATE INDEX IF NOT EXISTS idx_filters_status ON filters(status);
CREATE INDEX IF NOT EXISTS idx_filters_state ON filters(record_state);
CREATE INDEX IF NOT EXISTS idx_events_filter ON events(filter_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
