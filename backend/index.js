require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const { db, initSchema } = require('./database');
const { isoToday, addMonths, calcStatus } = require('./utils');

const app = express();
const APP_BUILD = 'filtertrack-v1-local';
console.log(`🧩 Loaded index.js (${APP_BUILD})`);

app.use(cors());
app.use(express.json());

// --- Root (simple ping) ---
app.get('/', (_req, res) => {
  res.type('text/plain').send('Sistema de Filtros funcionandooooo 🚀');
});
app.head('/', (_req, res) => {
  res.status(200).end();
});

initSchema();

// =====================
// AUTH
// =====================

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/auth/register', async (req, res) => {
  const { user_id, password } = req.body;

  if (!user_id || !password)
    return res.status(400).json({ error: 'user_id and password required' });

  const hash = await bcrypt.hash(password, 10);
  const ts = new Date().toISOString();

  db.run(
    'INSERT INTO users (user_id, password_hash, created_at) VALUES (?, ?, ?)',
    [user_id, hash, ts],
    (err) => {
      if (err) return res.status(500).json({ error: 'User already exists' });
      res.json({ message: 'User created' });
    }
  );
});

app.post('/auth/login', (req, res) => {
  const { user_id, password } = req.body;

  db.get(
    'SELECT * FROM users WHERE user_id = ?',
    [user_id],
    async (err, user) => {
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ user_id }, JWT_SECRET, { expiresIn: '8h' });

      res.json({ token });
    }
  );
});

// --- Helpers ---
function nowIso() {
  return new Date().toISOString();
}

function validateCreatePayload(body) {
  const required = [
    'filter_id',
    'area',
    'equipment',
    'location',
    'brand',
    'model',
    'install_date',
    'life_months',
    'responsible'
  ];
  const missing = required.filter((k) => !body[k]);
  return missing;
}

function createFilter(body, res) {
  const missing = validateCreatePayload(body);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  }

  const {
    filter_id,
    area,
    equipment,
    location,
    brand,
    model,
    install_date,
    life_months,
    responsible,
    notes
  } = body;

  const due_date = addMonths(install_date, life_months);
  const status = calcStatus(due_date);
  const ts = nowIso();

  const sql = `
    INSERT INTO filters (
      filter_id, area, equipment, location, brand, model,
      install_date, life_months, due_date, status, responsible, notes,
      record_state, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
  `;

  db.run(
    sql,
    [
      filter_id,
      area,
      equipment,
      location,
      brand,
      model,
      install_date,
      Number(life_months),
      due_date,
      status,
      responsible,
      notes || null,
      ts,
      ts
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      // Add INSTALL event (non-blocking)
      const eSql = `
        INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
        VALUES (?, 'INSTALL', ?, NULL, ?, ?, ?)
      `;
      db.run(eSql, [filter_id, install_date, responsible, notes || null, ts], () => {});

      return res.json({ message: 'Filter created', filter_id, due_date, status });
    }
  );
}

// --- Health ---
app.get('/health', (_req, res) => res.json({ ok: true }));

// =====================================================
// FILTERS (V1) — software-only
// =====================================================

// Create filter
app.post('/filters', authMiddleware, (req, res) => {
  return createFilter(req.body, res);
});

// List filters (optional query: area, status, state)
function listFilters(req, res) {
  const { area, status, state, q } = req.query;
  const clauses = [];
  const params = [];

  if (area) {
    clauses.push('area = ?');
    params.push(area);
  }
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (state) {
    clauses.push('record_state = ?');
    params.push(state);
  } else {
    // Default: only ACTIVE records
    clauses.push("record_state = 'ACTIVE'");
  }
  if (q) {
    clauses.push('(filter_id LIKE ? OR equipment LIKE ? OR location LIKE ? OR brand LIKE ? OR model LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT * FROM filters ${where} ORDER BY due_date ASC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}

app.get('/filters', authMiddleware, (req, res) => {
  return listFilters(req, res);
});

// Get one filter
app.get('/filters/:filter_id', authMiddleware, (req, res) => {
  const { filter_id } = req.params;
  db.get('SELECT * FROM filters WHERE filter_id = ?', [filter_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Filter not found' });
    res.json(row);
  });
});

// Update filter
app.put('/filters/:filter_id', authMiddleware, (req, res) => {
  const { filter_id } = req.params;
  const allowed = [
    'area',
    'equipment',
    'location',
    'brand',
    'model',
    'install_date',
    'life_months',
    'responsible',
    'notes'
  ];

  // Read existing first
  db.get('SELECT * FROM filters WHERE filter_id = ?', [filter_id], (err, current) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!current) return res.status(404).json({ error: 'Filter not found' });

    const updated = { ...current };
    for (const k of allowed) {
      if (req.body[k] !== undefined) updated[k] = req.body[k];
    }

    // Recalculate due_date/status if needed
    const install_date = updated.install_date;
    const life_months = Number(updated.life_months);
    const due_date = addMonths(install_date, life_months);
    const status = calcStatus(due_date);
    const ts = nowIso();

    const sql = `
      UPDATE filters
      SET area=?, equipment=?, location=?, brand=?, model=?,
          install_date=?, life_months=?, due_date=?, status=?,
          responsible=?, notes=?, updated_at=?
      WHERE filter_id=?
    `;

    db.run(
      sql,
      [
        updated.area,
        updated.equipment,
        updated.location,
        updated.brand,
        updated.model,
        install_date,
        life_months,
        due_date,
        status,
        updated.responsible,
        updated.notes || null,
        ts,
        filter_id
      ],
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });

        // Add EDIT event
        const eSql = `
          INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
          VALUES (?, 'EDIT', ?, NULL, ?, ?, ?)
        `;
        db.run(eSql, [filter_id, isoToday(), updated.responsible, 'Edited filter record', ts], () => {});

        res.json({ message: 'Filter updated', filter_id, due_date, status });
      }
    );
  });
});

// Archive (soft delete)
app.patch('/filters/:filter_id/archive', authMiddleware, (req, res) => {
  const { filter_id } = req.params;
  const responsible = req.body.responsible || 'SYSTEM';
  const notes = req.body.notes || null;
  const ts = nowIso();

  db.run(
    "UPDATE filters SET record_state='ARCHIVED', updated_at=? WHERE filter_id=?",
    [ts, filter_id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Filter not found' });

      const eSql = `
        INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
        VALUES (?, 'ARCHIVE', ?, NULL, ?, ?, ?)
      `;
      db.run(eSql, [filter_id, isoToday(), responsible, notes, ts], () => {});

      res.json({ message: 'Filter archived', filter_id });
    }
  );
});

// Replace filter: archive old + create new + event trail
app.post('/filters/:filter_id/replace', authMiddleware, (req, res) => {
  const { filter_id } = req.params;
  const {
    new_filter_id,
    install_date,
    life_months,
    responsible,
    reason,
    notes,
    // Optional overrides (if you keep same equipment/location/brand/model, you can omit)
    area,
    equipment,
    location,
    brand,
    model
  } = req.body;

  if (!new_filter_id || !install_date || !life_months || !responsible) {
    return res.status(400).json({ error: 'new_filter_id, install_date, life_months, responsible are required' });
  }

  db.get('SELECT * FROM filters WHERE filter_id = ?', [filter_id], (err, current) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!current) return res.status(404).json({ error: 'Filter not found' });

    const next = {
      filter_id: new_filter_id,
      area: area || current.area,
      equipment: equipment || current.equipment,
      location: location || current.location,
      brand: brand || current.brand,
      model: model || current.model,
      install_date,
      life_months: Number(life_months),
      responsible,
      notes: notes || null
    };

    const due_date = addMonths(next.install_date, next.life_months);
    const status = calcStatus(due_date);
    const ts = nowIso();

    db.serialize(() => {
      // 1) archive current
      db.run("UPDATE filters SET record_state='ARCHIVED', updated_at=? WHERE filter_id=?", [ts, filter_id]);

      // 2) log REPLACE event on old
      db.run(
        `INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
         VALUES (?, 'REPLACE', ?, ?, ?, ?, ?)`,
        [filter_id, install_date, reason || 'Programado', responsible, notes || null, ts]
      );

      // 3) create new filter
      const createSql = `
        INSERT INTO filters (
          filter_id, area, equipment, location, brand, model,
          install_date, life_months, due_date, status, responsible, notes,
          record_state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `;

      db.run(
        createSql,
        [
          next.filter_id,
          next.area,
          next.equipment,
          next.location,
          next.brand,
          next.model,
          next.install_date,
          next.life_months,
          due_date,
          status,
          next.responsible,
          next.notes,
          ts,
          ts
        ],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });

          // 4) log INSTALL event on new
          db.run(
            `INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
             VALUES (?, 'INSTALL', ?, NULL, ?, ?, ?)`,
            [next.filter_id, next.install_date, responsible, next.notes, ts]
          );

          res.json({
            message: 'Filter replaced',
            old_filter_id: filter_id,
            new_filter_id: next.filter_id,
            due_date,
            status
          });
        }
      );
    });
  });
});

// Events for a filter
app.get('/filters/:filter_id/events', authMiddleware, (req, res) => {
  const { filter_id } = req.params;
  db.all(
    'SELECT * FROM events WHERE filter_id = ? ORDER BY event_date DESC, event_id DESC',
    [filter_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Create manual event (SERVICE)
app.post('/filters/:filter_id/events', authMiddleware, (req, res) => {
  const { filter_id } = req.params;
  const {
    event_type = 'SERVICE',
    event_date,
    reason = null,
    responsible,
    notes = null
  } = req.body || {};

  if (!event_date || !responsible) {
    return res.status(400).json({ error: 'event_date and responsible are required' });
  }

  const ts = nowIso();

  const sql = `
    INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [filter_id, event_type, event_date, reason, responsible, notes, ts], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      message: 'Event created',
      event_id: this.lastID,
      filter_id
    });
  });
});

// =====================================================
// ALIASES (backward compatible Spanish endpoints)
// =====================================================
app.post('/filtros', authMiddleware, (req, res) => {
  // Map old payload to new schema (best-effort)
  const body = req.body || {};
  const mapped = {
    filter_id: body.filter_id || body.codigo_barra || body.id || body.codigo || null,
    area: body.area || body.zona || 'AREA',
    equipment: body.equipment || body.equipo || body.maquina || 'EQUIPO',
    location: body.location || body.ubicacion || 'SIN UBICACION',
    brand: body.brand || body.marca || 'SIN MARCA',
    model: body.model || body.modelo || body.nombre || 'SIN MODELO',
    install_date: body.install_date || body.fecha_instalacion || isoToday(),
    life_months: body.life_months || body.vida_util_meses || Math.max(1, Math.round((Number(body.vida_util_dias) || 180) / 30)),
    responsible: body.responsible || body.responsable || 'SYSTEM',
    notes: body.notes || body.notas || null
  };
  return createFilter(mapped, res);
});

app.get('/filtros', authMiddleware, (req, res) => {
  return listFilters(req, res);
});

// --- Server ---
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`🚀 FilterTrack V1 API running on http://localhost:${PORT}`);
});
