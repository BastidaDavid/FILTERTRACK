PRAGMA foreign_keys = ON;

-- FilterTrack V1 (software-only) — No sensor fields

CREATE TABLE IF NOT EXISTS filters (
  filter_id TEXT PRIMARY KEY,            -- e.g., FT-AREA-TIPO-001
  area TEXT NOT NULL,
  equipment TEXT NOT NULL,
  location TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  install_date TEXT NOT NULL,            -- YYYY-MM-DD
  life_months INTEGER NOT NULL DEFAULT 6,
  due_date TEXT NOT NULL,                -- YYYY-MM-DD (calculated)
  status TEXT NOT NULL,                  -- ACTIVE | DUE_SOON | EXPIRED
  responsible TEXT NOT NULL,
  notes TEXT,
  record_state TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | ARCHIVED
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  filter_id TEXT NOT NULL,
  event_type TEXT NOT NULL,              -- INSTALL | REPLACE | EDIT | ARCHIVE
  event_date TEXT NOT NULL,              -- YYYY-MM-DD
  reason TEXT,                           -- Programado | Emergencia | Calidad | Flujo bajo | Daño | Otro
  responsible TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (filter_id) REFERENCES filters(filter_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_filters_area ON filters(area);
CREATE INDEX IF NOT EXISTS idx_filters_status ON filters(status);
CREATE INDEX IF NOT EXISTS idx_filters_state ON filters(record_state);
CREATE INDEX IF NOT EXISTS idx_events_filter ON events(filter_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
