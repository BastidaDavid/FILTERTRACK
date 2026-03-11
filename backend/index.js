require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const FOUNDER_SECRET = process.env.FOUNDER_SECRET;

if (JWT_SECRET === 'dev-secret-change-in-production') {
  console.warn('⚠️  WARNING: Using default JWT secret. Set JWT_SECRET in production!');
}

const { db, initSchema } = require('./database');
const PDFDocument = require('pdfkit');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const ExcelJS = require('exceljs');
// External reports module
const { executiveReport, requireAuth: reportsAuth } = require('./reports');
const { isoToday, addMonths, calcStatus } = require('./utils');

const app = express();
// =====================
// I18N (Backend Language Support)
// =====================
const translations = {
  es: {
    MACHINE_CREATED: 'Máquina creada',
    MACHINE_NOT_FOUND: 'Máquina no encontrada',
    FILTER_CREATED: 'Filtro creado',
    PSI_RECORDED: 'Lectura PSI registrada'
  },
  en: {
    MACHINE_CREATED: 'Machine created',
    MACHINE_NOT_FOUND: 'Machine not found',
    FILTER_CREATED: 'Filter created',
    PSI_RECORDED: 'PSI reading recorded'
  }
};

function t(req, key) {
  return translations[req.lang]?.[key] || key;
}

// Detect language from frontend
app.use((req, _res, next) => {
  const langHeader = req.headers['accept-language'] || '';

  if (langHeader.toLowerCase().startsWith('en')) {
    req.lang = 'en';
  } else if (langHeader.toLowerCase().startsWith('es')) {
    req.lang = 'es';
  } else {
    req.lang = 'es'; // default
  }

  next();
});

const APP_BUILD = 'filtracore-v1-local';
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



// =====================
// AUTH
// =====================

function authMiddleware(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;

  // Standard Authorization header
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Fallback for downloads (PDF/Excel) where headers sometimes are not sent
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Session expired or missing token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token' });
  }
}

app.post('/auth/register', async (req, res) => {
  try {
    const body = req.body || {};
    const { user_id, password, company_name, plan, machine_limit } = body;

    if (!user_id || !password || !company_name) {
      return res.status(400).json({
        error: 'user_id, password and company_name required'
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const ts = new Date().toISOString();

    await db.query('BEGIN');

    // 1️⃣ Create organization automatically
    const orgId = company_name.toUpperCase().replace(/\s+/g, '_');

    const orgResult = await db.query(
      `INSERT INTO organizations (org_id, org_name, created_at)
       VALUES ($1, $2, $3)
       RETURNING org_id`,
      [
        orgId,
        company_name,
        ts
      ]
    );

    const org_id = orgResult.rows[0].org_id;

    // 2️⃣ Create user linked to that organization
    await db.query(
      `INSERT INTO users (user_id, password_hash, org_id, created_at)
       VALUES ($1, $2, $3, $4)`,
      [user_id, hash, org_id, ts]
    );

    await db.query('COMMIT');

    res.json({
      message: 'Organization and user created successfully',
      org_id
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('🔥 REGISTER ERROR FULL:', err);

    if (err.code === '23505') {
      return res.status(400).json({ error: 'User or company already exists' });
    }

    return res.status(500).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const body = req.body || {};
    const { user_id, password } = body;

    if (!user_id || !password) {
      return res.status(400).json({ error: 'user_id and password required' });
    }

    const result = await db.query(
      `SELECT 
          u.user_id,
          u.password_hash,
          u.org_id,
          c.org_name
        FROM users u
        LEFT JOIN organizations c ON u.org_id = c.org_id
        WHERE u.user_id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        user_id: user.user_id,
        org_id: user.org_id
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      organization: {
        org_id: user.org_id,
        org_name: user.org_name
      }
    });

  } catch (err) {
    console.error('🔥 LOGIN ERROR FULL:', err);
    return res.status(500).json({ error: err.message });
  }
});


// --- Helpers ---
function nowIso() {
  return new Date().toISOString();
}

function validateCreatePayload(body) {
  const required = [
    'machine_id',
    'install_date',
    'life_months',
    'responsible'
  ];
  const missing = required.filter((k) => !body[k]);
  return missing;
}

async function createFilter(body, res) {
  const org_id = body._org_id;
  if (!org_id) {
    return res.status(400).json({ error: 'Missing org_id context' });
  }

  const missing = validateCreatePayload(body);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
  }

  const {
    machine_id,
    model_filter_id,
    install_date,
    life_months,
    life_days,
    responsible,
    notes
  } = body;

  // ==============================
  // AUTO-GENERATE FILTER ID (Enterprise Mode)
  // ==============================
  const countResult = await db.query(
    `SELECT COUNT(*) FROM filters WHERE org_id = $1`,
    [org_id]
  );

  const nextNumber = Number(countResult.rows[0].count) + 1;
  const padded = String(nextNumber).padStart(4, '0');
  const filter_id = `FT-${machine_id}-${padded}`;

  // Validate machine exists
  const machineCheck = await db.query(
    `SELECT machine_id FROM machines WHERE machine_id = $1 AND org_id = $2`,
    [body.machine_id, org_id]
  );

  if (machineCheck.rows.length === 0) {
    return res.status(400).json({ error: 'Machine not found for this organization' });
  }

  // =========================================
  // Intelligent duplicate handling (SaaS mode)
  // =========================================
  const existing = await db.query(
    `SELECT record_state
     FROM filters
     WHERE org_id = $1 AND filter_id = $2`,
    [org_id, filter_id]
  );

  if (existing.rows.length > 0) {
    const currentState = existing.rows[0].record_state;

    if (currentState === 'ARCHIVED') {
      await db.query(
        `UPDATE filters
         SET record_state = 'ACTIVE',
             updated_at = $1
         WHERE org_id = $2 AND filter_id = $3`,
        [nowIso(), org_id, filter_id]
      );

      return res.json({
        message: 'Filter reactivated',
        filter_id
      });
    }

    if (currentState === 'ACTIVE') {
      return res.status(400).json({
        error: 'Filter already exists and is active'
      });
    }
  }

  const monthsNum = Number(life_months) || 0;
  const daysNum = Number(life_days) || 0;

  const base = new Date(install_date);

  // Add months first
  if (monthsNum > 0) {
    base.setMonth(base.getMonth() + Math.floor(monthsNum));
  }

  // Add days
  if (daysNum > 0) {
    base.setDate(base.getDate() + daysNum);
  }

  const due_date = base.toISOString().split('T')[0];

  const status = calcStatus(due_date, install_date, monthsNum || (daysNum / 30));
  const ts = nowIso();

  try {
    await db.query(
      `INSERT INTO filters (
        org_id, filter_id, machine_id,
        model_filter_id,
        install_date, life_months, due_date, status, responsible, notes,
        record_state, created_at, updated_at
      ) VALUES (
        $1,$2,$3,
        $4,
        $5,$6,$7,$8,$9,$10,
        'ACTIVE',$11,$12
      )`,
      [
        org_id,
        filter_id,
        machine_id,
        model_filter_id || null,
        install_date,
        Number(life_months),
        due_date,
        status,
        responsible,
        notes || null,
        ts,
        ts
      ]
    );

    await db.query(
      `INSERT INTO events
       (org_id, filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,$2,'INSTALL',$3,NULL,$4,$5,$6)`,
      [org_id, filter_id, install_date, responsible, notes || null, ts]
    );

    return res.json({ message: 'Filter created', filter_id, due_date, status });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// --- Health ---

app.get('/health', (_req, res) => res.json({ ok: true }));

// =====================
// EXECUTIVE REPORT (PDF)
// =====================

// =====================
// EXECUTIVE REPORT (EXCEL)
// =====================
app.get('/reports/executive.xlsx', authMiddleware, async (req, res) => {
  try {
    const orgId = req.user.org_id;

    const result = await db.query(
      `SELECT f.filter_id,
              m.area,
              m.location,
              b.name AS brand,
              mm.model_name AS model,
              f.due_date,
              f.status
       FROM filters f
       LEFT JOIN machines m ON f.machine_id = m.id::text AND f.org_id = m.org_id
       LEFT JOIN machine_brands b ON m.brand_id = b.id
       LEFT JOIN machine_models mm ON m.model_id = mm.id
       WHERE f.org_id = $1
         AND f.record_state = 'ACTIVE'
       ORDER BY f.due_date ASC`,
      [orgId]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte Ejecutivo');

    sheet.columns = [
      { header: 'Filter ID', key: 'filter_id', width: 20 },
      { header: 'Área', key: 'area', width: 15 },
      { header: 'Ubicación', key: 'location', width: 20 },
      { header: 'Marca', key: 'brand', width: 15 },
      { header: 'Modelo', key: 'model', width: 15 },
      { header: 'Vence', key: 'due_date', width: 15 },
      { header: 'Estado', key: 'status', width: 15 }
    ];

    result.rows.forEach(row => sheet.addRow(row));

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=FiltraCore_${orgId}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Excel report error:', err);
    res.status(500).json({ error: 'Excel report generation failed' });
  }
});

// =====================================================
// FILTERS (V1) — software-only
// =====================================================

// Create filter
app.post('/filters', authMiddleware, (req, res) => {
  const body = { ...req.body, _org_id: req.user.org_id };
  return createFilter(body, res);
});

// List filters (PostgreSQL version)
async function listFilters(req, res) {
  try {
    const { area, status, state, q } = req.query;
    const clauses = [];
    const values = [];
    let idx = 1;

    // Always isolate by organization
    clauses.push(`f.org_id = $${idx++}`);
    values.push(req.user.org_id);

    if (area) {
      clauses.push(`f.area = $${idx++}`);
      values.push(area);
    }

    if (status) {
      clauses.push(`f.status = $${idx++}`);
      values.push(status);
    }

    const includeArchived = req.query.includeArchived === 'true';

    if (state) {
      clauses.push(`f.record_state = $${idx++}`);
      values.push(state);
    } else if (!includeArchived) {
      clauses.push(`f.record_state = 'ACTIVE'`);
    }

    if (q) {
      clauses.push(`(
        f.filter_id ILIKE $${idx} OR
        f.location ILIKE $${idx}
      )`);
      values.push(`%${q}%`);
      idx++;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `
      SELECT DISTINCT ON (f.id)
        f.id,
        f.filter_id,
        f.water_used_gallons,
        mf.water_capacity_gallons,
        m.area,
        m.serial_number AS serial_number,
        m.location,
        b.name AS brand,
        mm.model_name AS model,
        mf.filter_name AS filter_name,
        f.install_date,
        f.due_date,
        f.status,
        f.record_state,
        f.responsible,
        f.notes,
        f.machine_id
      FROM filters f
      LEFT JOIN machines m
        ON f.machine_id = m.id::text
        AND f.org_id = m.org_id
      LEFT JOIN machine_brands b
        ON m.brand_id = b.id
      LEFT JOIN machine_models mm
        ON m.model_id = mm.id
      LEFT JOIN model_filters mf
        ON mf.id = f.model_filter_id
      ${where}
      ORDER BY f.id, f.due_date ASC
    `;

    const result = await db.query(sql, values);
    res.json(result.rows);

  } catch (err) {
    console.error("Error loading filters:", err);
    res.status(500).json({ error: "Error loading filters" });
  }
}

app.get('/filters', authMiddleware, async (req, res) => {
  return listFilters(req, res);
});

// Get one filter (PostgreSQL version)
app.get('/filters/:filter_id', authMiddleware, async (req, res) => {
  const { filter_id } = req.params;

  try {
    const result = await db.query(
      `
      SELECT 
        f.*,
        m.serial_number,
        m.machine_id
      FROM filters f
      LEFT JOIN machines m
        ON f.machine_id = m.id::text
        AND f.org_id = m.org_id
      WHERE f.filter_id = $1
        AND f.org_id = $2
      `,
      [filter_id, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Filter not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Update filter (PostgreSQL version)
app.put('/filters/:filter_id', authMiddleware, async (req, res) => {
  const { filter_id } = req.params;
  const allowed = [
    'install_date',
    'life_months',
    'responsible',
    'notes'
  ];

  try {
    const currentResult = await db.query(
      'SELECT * FROM filters WHERE filter_id = $1 AND org_id = $2',
      [filter_id, req.user.org_id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Filter not found' });
    }

    const current = currentResult.rows[0];
    const updated = { ...current };

    for (const k of allowed) {
      if (req.body[k] !== undefined) updated[k] = req.body[k];
    }

    const install_date = updated.install_date;
    const life_months = Number(updated.life_months) || 0;
    const life_days = Number(req.body.life_days) || 0;

    const base = new Date(install_date);

    // Add months first
    if (life_months > 0) {
      base.setMonth(base.getMonth() + Math.floor(life_months));
    }

    // Add days
    if (life_days > 0) {
      base.setDate(base.getDate() + life_days);
    }

    const due_date = base.toISOString().split('T')[0];

    const status = calcStatus(due_date, install_date, life_months || (life_days / 30));
    const ts = nowIso();

    await db.query(
      `UPDATE filters
       SET install_date=$1, life_months=$2, due_date=$3, status=$4,
           responsible=$5, notes=$6, updated_at=$7
       WHERE filter_id=$8 AND org_id=$9`,
      [
        install_date,
        life_months,
        due_date,
        status,
        updated.responsible,
        updated.notes || null,
        ts,
        filter_id,
        req.user.org_id
      ]
    );

    await db.query(
      `INSERT INTO events (org_id, filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,$2,'EDIT',$3,NULL,$4,$5,$6)`,
      [req.user.org_id, filter_id, isoToday(), updated.responsible, 'Edited filter record', ts]
    );

    res.json({ message: 'Filter updated', filter_id, due_date, status });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Archive (PostgreSQL version)
app.patch('/filters/:filter_id/archive', authMiddleware, async (req, res) => {
  const { filter_id } = req.params;
  const responsible = req.body.responsible || 'SYSTEM';
  const notes = req.body.notes || null;
  const ts = nowIso();

  try {
    // 1. Load current filter state before archiving
    const filterResult = await db.query(
      `SELECT install_date,
              life_months,
              psi_current,
              water_used_gallons
       FROM filters
       WHERE filter_id = $1
         AND org_id = $2`,
      [filter_id, req.user.org_id]
    );

    if (filterResult.rows.length === 0) {
      return res.status(404).json({ error: 'Filter not found' });
    }

    const filter = filterResult.rows[0];

    // 2. Calculate life remaining percentage
    const installDate = new Date(filter.install_date);
    const today = new Date();
    const totalDays = Number(filter.life_months) * 30;
    const usedDays = Math.floor((today - installDate) / (1000 * 60 * 60 * 24));
    let lifeRemainingPercent = 0;

    if (totalDays > 0) {
      lifeRemainingPercent = Math.max(
        0,
        ((totalDays - usedDays) / totalDays) * 100
      );
    }

    // 3. Archive filter
    const updateResult = await db.query(
      `UPDATE filters
       SET record_state='ARCHIVED', updated_at=$1
       WHERE filter_id=$2 AND org_id=$3`,
      [ts, filter_id, req.user.org_id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Filter not found' });
    }

    // 4. Insert enterprise audit event
    await db.query(
      `INSERT INTO events (
          org_id,
          filter_id,
          event_type,
          event_date,
          reason,
          responsible,
          notes,
          created_at,
          psi_value,
          water_used_at_event,
          life_remaining_percent,
          source
       ) VALUES (
          $1,$2,'ARCHIVE',$3,NULL,$4,$5,$6,$7,$8,$9,$10
       )`,
      [
        req.user.org_id,
        filter_id,
        ts,
        responsible,
        notes,
        ts,
        filter.psi_current || null,
        filter.water_used_gallons || 0,
        lifeRemainingPercent,
        'SYSTEM'
      ]
    );

    res.json({
      message: 'Filter archived (audited)',
      filter_id,
      life_remaining_percent: lifeRemainingPercent
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Replace filter (PostgreSQL version)
app.post('/filters/:filter_id/replace', authMiddleware, async (req, res) => {
  const { filter_id } = req.params;
  const {
    new_filter_id,
    install_date,
    life_months,
    responsible,
    reason,
    notes
  } = req.body;

  if (!new_filter_id || !install_date || !life_months || !responsible) {
    return res.status(400).json({ error: 'new_filter_id, install_date, life_months, responsible are required' });
  }

  try {
    const currentResult = await db.query(
      'SELECT * FROM filters WHERE filter_id=$1 AND org_id=$2',
      [filter_id, req.user.org_id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Filter not found' });
    }

    const current = currentResult.rows[0];

    const next = {
      filter_id: new_filter_id,

      install_date,
      life_months: Number(life_months),
      responsible,
      notes: notes || null
    };

    const due_date = addMonths(next.install_date, next.life_months);
    const status = calcStatus(due_date, next.install_date, next.life_months);
    const ts = nowIso();

    await db.query('BEGIN');

    await db.query(
      `UPDATE filters
       SET record_state='ARCHIVED', updated_at=$1
       WHERE filter_id=$2 AND org_id=$3`,
      [ts, filter_id, req.user.org_id]
    );

    await db.query(
      `INSERT INTO events (org_id, filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,$2,'REPLACE',$3,$4,$5,$6,$7)`,
      [req.user.org_id, filter_id, install_date, reason || 'Programado', responsible, notes || null, ts]
    );

    await db.query(
      `INSERT INTO filters (
        org_id, filter_id, machine_id,
        install_date, life_months, due_date, status, responsible, notes,
        record_state, created_at, updated_at
      ) VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,$8,$9,
        'ACTIVE',$10,$11
      )`,
      [
        req.user.org_id,
        next.filter_id,
        current.machine_id,
        next.install_date,
        next.life_months,
        due_date,
        status,
        next.responsible,
        next.notes,
        ts,
        ts
      ]
    );

    await db.query(
      `INSERT INTO events (org_id, filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,$2,'INSTALL',$3,NULL,$4,$5,$6)`,
      [req.user.org_id, next.filter_id, next.install_date, responsible, next.notes, ts]
    );

    await db.query('COMMIT');

    res.json({
      message: 'Filter replaced',
      old_filter_id: filter_id,
      new_filter_id: next.filter_id,
      due_date,
      status
    });

  } catch (err) {
    await db.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  }
});

// Events for a filter (PostgreSQL version)
app.get('/filters/:filter_id/events', authMiddleware, async (req, res) => {
  const { filter_id } = req.params;

  try {
    const result = await db.query(
      `SELECT *
       FROM events
       WHERE filter_id = $1
       ORDER BY event_date DESC`,
      [filter_id]
    );

    res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Create manual event (SERVICE) (PostgreSQL version)
app.post('/filters/:filter_id/events', authMiddleware, async (req, res) => {
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

  try {
    const result = await db.query(
      `INSERT INTO events
       (org_id, filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING event_id`,
      [req.user.org_id, filter_id, event_type, event_date, reason, responsible, notes, ts]
    );

    res.json({
      message: 'Event created',
      event_id: result.rows[0].event_id,
      filter_id
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==============================
// MACHINES (V1) — Professional structure
// ==============================

// ==============================
// MACHINE BRANDS
// ==============================

app.get('/machine-brands', authMiddleware, async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT id AS brand_id, name AS brand_name, category
       FROM machine_brands
       ORDER BY name ASC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Machine brands error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// CREATE MACHINE BRAND
// ==============================
app.post('/machine-brands', authMiddleware, async (req, res) => {
  try {
    const { brand_name, category } = req.body;

    if (!brand_name) {
      return res.status(400).json({ error: 'brand_name required' });
    }

    const result = await db.query(
      `INSERT INTO machine_brands (name, category)
       VALUES ($1, $2)
       RETURNING id AS brand_id, name AS brand_name, category`,
      [brand_name, category || 'OTHER']
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('Create brand error:', err);

    if (err.code === '23505') {
      return res.status(400).json({ error: 'Brand already exists' });
    }

    res.status(500).json({ error: err.message });
  }
});

// ==============================
// MACHINE MODELS (by brand)
// ==============================

app.get('/machine-models', authMiddleware, async (req, res) => {
  const { brand_id } = req.query;

  if (!brand_id) {
    return res.status(400).json({ error: 'brand_id query param required' });
  }

  try {
    const result = await db.query(
      `SELECT id, model_name, filter_type
       FROM machine_models
       WHERE brand_id = $1
       ORDER BY model_name ASC`,
      [brand_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Machine models error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// CREATE MACHINE MODEL
// ==============================
app.post('/machine-models', authMiddleware, async (req, res) => {
  try {
    const { brand_id, model_name, filter_type } = req.body;

    if (!brand_id || !model_name) {
      return res.status(400).json({ error: 'brand_id and model_name required' });
    }

    const result = await db.query(
      `INSERT INTO machine_models (brand_id, model_name, filter_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [brand_id, model_name, filter_type || null]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error('Create model error:', err);

    if (err.code === '23505') {
      return res.status(400).json({ error: 'Model already exists' });
    }

    res.status(500).json({ error: err.message });
  }
});

// Create machine
app.post('/machines', authMiddleware, async (req, res) => {
  console.log("📦 BODY RECEIVED:", req.body);
  const {
    machine_id,
    area,
    location,
    brand_id,
    model_id,
    serial_number,
    building,
    floor,
    zone
  } = req.body;

  if (!machine_id) {
    return res.status(400).json({ error: 'machine_id is required' });
  }

  try {
    // --- Suggested filter_type logic ---
    let suggested_filter_type = null;
    if (model_id) {
      const modelResult = await db.query(
        `SELECT filter_type FROM machine_models WHERE id = $1`,
        [model_id]
      );
      if (modelResult.rows.length > 0) {
        suggested_filter_type = modelResult.rows[0].filter_type;
      }
    }

    const ts = nowIso();

    await db.query(
      `INSERT INTO machines
       (machine_id, org_id, area, location, brand_id, model_id, serial_number,
        building, floor, zone,
        record_state, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
               $8,$9,$10,
               'ACTIVE',$11,$12)`,
      [
        machine_id,
        req.user.org_id,
        area || null,
        location || null,
        brand_id || null,
        model_id || null,
        serial_number || null,
        building || null,
        floor || null,
        zone || null,
        ts,
        ts
      ]
    );

    res.json({
      message: t(req, 'MACHINE_CREATED'),
      machine_id,
      suggested_filter_type
    });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Machine already exists' });
    }
    console.error('Create machine error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List machines (by organization)
app.get('/machines', authMiddleware, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';

    const sql = includeArchived
      ? `SELECT m.machine_id,
                m.area,
                m.location,
                m.serial_number,
                m.record_state,
                b.name AS brand_name,
                b.category,
                mm.model_name,
                mm.filter_type,
                m.created_at
         FROM machines m
         LEFT JOIN machine_brands b ON m.brand_id = b.id
         LEFT JOIN machine_models mm ON m.model_id = mm.id
         WHERE m.org_id = $1
         ORDER BY 
            CASE 
              WHEN b.category = 'OTHER' THEN 0
              ELSE 1
            END,
            b.category ASC,
            m.created_at DESC`
      : `SELECT m.machine_id,
                m.area,
                m.location,
                m.serial_number,
                m.record_state,
                b.name AS brand_name,
                b.category,
                mm.model_name,
                mm.filter_type,
                m.created_at
         FROM machines m
         LEFT JOIN machine_brands b ON m.brand_id = b.id
         LEFT JOIN machine_models mm ON m.model_id = mm.id
         WHERE m.org_id = $1
           AND m.record_state = 'ACTIVE'
         ORDER BY 
            CASE 
              WHEN b.category = 'OTHER' THEN 0
              ELSE 1
            END,
            b.category ASC,
            m.created_at DESC`;

    const result = await db.query(sql, [req.user.org_id]);

    res.json(result.rows);
    
  } catch (err) {
    console.error('List machines error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// Helper functions for pressure and water status
// ==============================
function calculatePressureStatus(current, initial) {
  if (current === null || current === undefined) return 'UNKNOWN';
  if (!initial || initial <= 0) return 'UNKNOWN';

  const percent = current / initial;

  if (percent <= 0.3) return 'CRITICAL';
  if (percent <= 0.6) return 'DUE_SOON';
  return 'ACTIVE';
}

function calculateWaterStatus(used, capacity) {
  if (!capacity || capacity <= 0) return 'UNKNOWN';

  const percentRemaining = (capacity - used) / capacity;

  if (percentRemaining <= 0.2) return 'CRITICAL';
  if (percentRemaining <= 0.4) return 'DUE_SOON';
  return 'ACTIVE';
}

// Get single machine (Professional upgraded version)
app.get('/machines/:machine_id', authMiddleware, async (req, res) => {
  const { machine_id } = req.params;

  try {
    const result = await db.query(
      `SELECT m.machine_id,
              m.area,
              m.location,
              m.serial_number,
              m.building,
              m.floor,
              m.zone,
              m.record_state,
              m.brand_id,
              m.model_id,
              m.psi_initial,
              m.psi_current,
              b.name AS brand_name,
              b.category,
              mm.model_name,
              mm.filter_type,
              m.created_at,
              m.updated_at
       FROM machines m
       LEFT JOIN machine_brands b ON m.brand_id = b.id
       LEFT JOIN machine_models mm ON m.model_id = mm.id
       WHERE m.machine_id = $1
         AND m.org_id = $2`,
      [machine_id, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    const machine = result.rows[0];

    // Get active filter water capacity
    const filterResult = await db.query(
      `SELECT water_used_gallons, mf.water_capacity_gallons
       FROM filters f
       LEFT JOIN model_filters mf ON mf.id = f.model_filter_id
       WHERE f.machine_id = $1
         AND f.org_id = $2
         AND f.record_state = 'ACTIVE'
       ORDER BY f.due_date ASC
       LIMIT 1`,
      [machine_id, req.user.org_id]
    );

    let water_used = 0;
    let water_capacity = 0;

    if (filterResult.rows.length > 0) {
      water_used = filterResult.rows[0].water_used_gallons || 0;
      water_capacity = filterResult.rows[0].water_capacity_gallons || 0;
    }

    const pressure_status = calculatePressureStatus(
      machine.psi_current,
      machine.psi_initial
    );

    const water_status = calculateWaterStatus(
      water_used,
      water_capacity
    );

    res.json({
      ...machine,
      water_used,
      water_capacity,
      pressure_status,
      water_status
    });

  } catch (err) {
    console.error('Get machine error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// MACHINE HISTORY (Panel lateral)
// ==============================
app.get('/machines/:machine_id/history', authMiddleware, async (req, res) => {
  const { machine_id } = req.params;

  try {
    const result = await db.query(
      `SELECT e.event_type,
              e.event_date,
              e.reason,
              e.responsible,
              e.notes,
              e.filter_id
       FROM events e
       JOIN filters f ON e.filter_id = f.filter_id
       WHERE f.machine_id = $1
         AND f.org_id = $2
       ORDER BY e.event_date DESC`,
      [machine_id, req.user.org_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('Machine history error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// ADD PSI READING (Machine Level)
// ==============================
app.post('/machines/:machine_id/psi', authMiddleware, async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { psi_value, event_date, responsible, notes } = req.body;
    console.log('🧠 PSI UPDATE DEBUG');
    console.log('Machine param:', machine_id);
    console.log('User org:', req.user.org_id);
    console.log('PSI value:', psi_value);

    if (psi_value === undefined || psi_value === null || !responsible) {
      return res.status(400).json({ error: 'psi_value and responsible are required' });
    }

    const numericPSI = Number(psi_value);
    if (!Number.isFinite(numericPSI)) {
      return res.status(400).json({ error: 'psi_value must be numeric' });
    }

    const ts = new Date().toISOString();

    // Ensure machine exists and belongs to org
    const machineCheck = await db.query(
      `SELECT machine_id
       FROM machines
       WHERE machine_id = $1
         AND org_id = $2`,
      [machine_id, req.user.org_id]
    );

    if (machineCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found for this organization' });
    }

    await db.query('BEGIN');

    await db.query(
      `INSERT INTO events
       (org_id, machine_id, event_type, event_date, psi_value, responsible, notes, created_at)
       VALUES ($1,$2,'PSI_CHECK',$3,$4,$5,$6,$7)`,
      [
        req.user.org_id,
        machine_id,
        event_date || ts,
        numericPSI,
        responsible,
        notes || null,
        ts
      ]
    );

    const updateResult = await db.query(
      `UPDATE machines
       SET psi_current = $1,
           updated_at = $2
       WHERE machine_id = $3
         AND org_id = $4`,
      [
        numericPSI,
        ts,
        machine_id,
        req.user.org_id
      ]
    );
    console.log('Rows affected:', updateResult.rowCount);

    if (updateResult.rowCount === 0) {
      await db.query('ROLLBACK');
      return res.status(500).json({ error: 'PSI update failed (machine not updated)' });
    }

    await db.query('COMMIT');

    res.json({
      message: t(req, 'PSI_RECORDED'),
      machine_id,
      psi_value: numericPSI
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('PSI insert error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// GET PSI HISTORY (Machine Level)
// ==============================
app.get('/machines/:machine_id/psi-history', authMiddleware, async (req, res) => {
  try {
    const { machine_id } = req.params;

    const result = await db.query(
      `SELECT event_date, psi_value, responsible, notes
       FROM events
       WHERE machine_id = $1
         AND org_id = $2
         AND event_type = 'PSI_CHECK'
       ORDER BY event_date DESC`,
      [machine_id, req.user.org_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('PSI history error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// GET WATER STATUS (Machine Level)
// ==============================
app.get('/machines/:machine_id/water', authMiddleware, async (req, res) => {
  try {
    const { machine_id } = req.params;

    // Ensure machine exists and belongs to org
    const machineCheck = await db.query(
      `SELECT machine_id
       FROM machines
       WHERE machine_id = $1
         AND org_id = $2`,
      [machine_id, req.user.org_id]
    );

    if (machineCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    // Get active filter for this machine
    const filterResult = await db.query(
      `SELECT water_used_gallons
       FROM filters
       WHERE machine_id = $1
         AND org_id = $2
         AND record_state = 'ACTIVE'
       ORDER BY due_date ASC
       LIMIT 1`,
      [machine_id, req.user.org_id]
    );

    if (filterResult.rows.length === 0) {
      return res.json({ water_used_gallons: 0 });
    }

    res.json({
      water_used_gallons: filterResult.rows[0].water_used_gallons || 0
    });

  } catch (err) {
    console.error('Get water status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// WATER USAGE UPDATE (Machine Level)
// ==============================
app.post('/machines/:machine_id/water', authMiddleware, async (req, res) => {
  try {
    const { machine_id } = req.params;
    const { gallons, responsible } = req.body;

    if (!gallons || gallons <= 0) {
      return res.status(400).json({ error: 'Invalid gallons value' });
    }

    const ts = new Date().toISOString();

    // Ensure machine exists and belongs to org
    const machineCheck = await db.query(
      `SELECT machine_id
       FROM machines
       WHERE machine_id = $1
         AND org_id = $2`,
      [machine_id, req.user.org_id]
    );

    if (machineCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    // Find active filter for this machine
    const filterResult = await db.query(
      `SELECT id, filter_id, water_used_gallons
       FROM filters
       WHERE machine_id = $1
         AND org_id = $2
         AND record_state = 'ACTIVE'
       ORDER BY due_date ASC
       LIMIT 1`,
      [machine_id, req.user.org_id]
    );

    if (filterResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active filter found' });
    }

    const filter = filterResult.rows[0];
    const newWaterValue =
      Number(filter.water_used_gallons || 0) + Number(gallons);

    await db.query('BEGIN');

    // Update water usage
    await db.query(
      `UPDATE filters
       SET water_used_gallons = $1,
           updated_at = $2
       WHERE id = $3`,
      [newWaterValue, ts, filter.id]
    );

    // Log event
    await db.query(
      `INSERT INTO events
       (org_id, filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,$2,'WATER_USAGE',$3,$4,$5,$6,$7)`,
      [
        req.user.org_id,
        filter.filter_id,
        ts,
        'Manual water update',
        responsible || 'SYSTEM',
        `Added ${gallons} gallons`,
        ts
      ]
    );

    await db.query('COMMIT');

    res.json({
      message: 'Water usage updated',
      machine_id,
      new_water_used: newWaterValue
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Water update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List filters for a specific machine
app.get('/machines/:machine_id/filters', authMiddleware, async (req, res) => {
  const { machine_id } = req.params;

  try {
    const result = await db.query(
      `SELECT DISTINCT ON (f.filter_id)
          f.filter_id,
          f.water_used_gallons,
          mf.water_capacity_gallons,
          m.area,
          m.serial_number AS serial_number,
          m.location,
          b.name AS brand,
          mm.model_name AS model,
          mf.filter_name AS filter_name,
          f.install_date,
          f.due_date,
          f.status,
          f.record_state,
          f.responsible,
          f.notes,
          f.machine_id
       FROM filters f
       LEFT JOIN machines m
         ON f.machine_id = m.id::text
         AND f.org_id = m.org_id
       LEFT JOIN machine_brands b
         ON m.brand_id = b.id
       LEFT JOIN machine_models mm
         ON m.model_id = mm.id
       LEFT JOIN model_filters mf
         ON mf.id = f.model_filter_id
       WHERE f.machine_id = $1
         AND f.org_id = $2
         AND f.record_state = 'ACTIVE'
       ORDER BY f.filter_id, f.due_date ASC`,
      [machine_id, req.user.org_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('Machine filters error:', err);
    res.status(500).json({ error: err.message });
  }
});
// ==============================
// UPDATE MACHINE (Enterprise)
// ==============================
app.put('/machines/:machine_id', authMiddleware, async (req, res) => {
  try {
    const { machine_id } = req.params;
    const {
      area,
      location,
      brand_id,
      model_id,
      serial_number,
      building,
      floor,
      zone
    } = req.body;
    const ts = nowIso();

    const result = await db.query(
      `UPDATE machines
       SET area = COALESCE($1, area),
           location = COALESCE($2, location),
           brand_id = COALESCE($3, brand_id),
           model_id = COALESCE($4, model_id),
           serial_number = COALESCE($5, serial_number),
           building = COALESCE($6, building),
           floor = COALESCE($7, floor),
           zone = COALESCE($8, zone),
           updated_at = $9
       WHERE machine_id = $10
         AND org_id = $11
       RETURNING *`,
      [
        area || null,
        location || null,
        brand_id || null,
        model_id || null,
        serial_number || null,
        building || null,
        floor || null,
        zone || null,
        ts,
        machine_id,
        req.user.org_id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    res.json({
      message: 'Machine updated successfully',
      machine: result.rows[0]
    });

  } catch (err) {
    console.error('Update machine error:', err);
    res.status(500).json({ error: err.message });
  }
});
// ==============================
// DELETE MACHINE (Enterprise)
// ==============================
app.delete('/machines/:machine_id', authMiddleware, async (req, res) => {
  try {
    const { machine_id } = req.params;
    if (machine_id === 'GENERAL') {
      return res.status(403).json({ error: 'GENERAL machine cannot be archived' });
    }
    const ts = nowIso();

    const result = await db.query(
      `UPDATE machines
       SET record_state = 'ARCHIVED',
           updated_at = $1
       WHERE machine_id = $2
         AND org_id = $3
       RETURNING *`,
      [ts, machine_id, req.user.org_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    res.json({ message: 'Machine archived successfully', machine_id });

  } catch (err) {
    console.error('Delete machine error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Founder-only permanent delete
app.delete('/machines/:machine_id/force', authMiddleware, async (req, res) => {
  try {
    const { machine_id } = req.params;
    if (machine_id === 'GENERAL') {
      return res.status(403).json({ error: 'GENERAL machine cannot be permanently deleted' });
    }
    const { founderKey } = req.body;

    if (!FOUNDER_SECRET || founderKey !== FOUNDER_SECRET) {
      return res.status(403).json({ error: 'Unauthorized - Founder only' });
    }

    const result = await db.query(
      `DELETE FROM machines
       WHERE machine_id = $1
         AND org_id = $2
       RETURNING *`,
      [machine_id, req.user.org_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    res.json({ message: 'Machine permanently deleted (Founder)', machine_id });

  } catch (err) {
    console.error('Force delete machine error:', err);
    res.status(500).json({ error: err.message });
  }
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


// ==============================
// GET FILTER SUGERIDO POR MODELO
// ==============================
app.get('/machine-models/:id/filter', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT filter_type
       FROM machine_models
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    res.json({
      filter_type: result.rows[0].filter_type
    });

  } catch (err) {
    console.error('Filter type fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// GET MODEL BY ID (clean route)
// ==============================
app.get('/machine-models/model/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT id, model_name, filter_type
       FROM machine_models
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Model fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// GET FILTERS BY MODEL (multi-filter support)
// ==============================
app.get('/machine-models/:id/filters', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT 
          id,
          filter_name,
          life_months,
          notes,
          water_capacity_gallons,
          micron_rating,
          chlorine_capacity_gallons,
          max_flow_rate_gpm,
          recommended_psi_min,
          recommended_psi_max
       FROM model_filters
       WHERE model_id = $1
       ORDER BY filter_name ASC`,
      [id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('Model filters error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// CREATE FILTER FOR MODEL (Recommended Config)
// ==============================
app.post('/machine-models/:id/filters', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { filter_name, life_months, notes } = req.body;

  if (!filter_name || !life_months) {
    return res.status(400).json({ error: 'filter_name and life_months required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO model_filters (model_id, filter_name, life_months, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, filter_name, Number(life_months), notes || null]
    );

    res.json({
      message: 'Recommended filter created',
      filter: result.rows[0]
    });

  } catch (err) {
    console.error('Create model filter error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// SEED MACHINE BRANDS (TEMPORAL)
// ==============================
app.post('/seed/brands', async (req, res) => {
  try {
    const brands = [
      ['Scotsman', 'ICE'],
      ['Hoshizaki', 'ICE'],
      ['Manitowoc', 'ICE'],
      ['Follett', 'ICE'],
      ['Ice-O-Matic', 'ICE'],
      ['Kold-Draft', 'ICE'],
      ['Cornelius', 'ICE'],
      ['Brema', 'ICE'],
      ['ITV Ice Makers', 'ICE'],
      ['Electrolux', 'ICE'],
      ['Whirlpool Commercial', 'ICE'],
      ['GE Commercial', 'ICE'],
      ['Summit Commercial', 'ICE'],
      ['Maxx Ice', 'ICE'],
      ['Lancer', 'SODA'],
      ['Multiplex', 'SODA'],
      ['Bunn', 'COFFEE'],
      ['Curtis', 'COFFEE'],
      ['Franke', 'COFFEE'],
      ['Taylor', 'SOFT_SERVE'],
      ['Stoelting', 'SOFT_SERVE'],
      ['True Manufacturing', 'REFRIGERATION'],
      ['Turbo Air', 'REFRIGERATION'],
      ['Hobart', 'DISHWASHER'],
      ['Jackson', 'DISHWASHER']
    ];

    for (const [name, category] of brands) {
      await db.query(
        `INSERT INTO machine_brands (name, category)
         VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [name, category]
      );
    }

    res.json({ message: 'Machine brands seeded successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Seed failed' });
  }
});




// ==============================
// SYSTEM ACTIVITY (Founder View)
// ==============================
app.get('/system/activity', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.event_type,
              e.event_date,
              e.filter_id,
              e.responsible,
              e.notes
       FROM events e
       JOIN filters f ON e.filter_id = f.filter_id
       WHERE f.org_id = $1
       ORDER BY e.event_date DESC
       LIMIT 50`,
      [req.user.org_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('System activity error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================== 
// EXECUTIVE REPORT (Modular Reports System)
// ==============================
app.get('/reports/executive', authMiddleware, reportsAuth, executiveReport);

process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION:', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
});

// ==============================
// ENSURE GENERAL MACHINE EXISTS
// ==============================
async function ensureGeneralMachine() {
  try {
    const result = await db.query(
      `SELECT machine_id
       FROM machines
       WHERE machine_id = 'GENERAL'`
    );

    if (result.rows.length === 0) {
      const ts = new Date().toISOString();

      await db.query(
        `INSERT INTO machines
         (machine_id, org_id, area, location, record_state, created_at, updated_at)
         VALUES ('GENERAL', 'SYSTEM', 'General', 'System', 'ACTIVE', $1, $1)`,
        [ts]
      );

      console.log('🟢 GENERAL machine auto-created');
    } else {
      console.log('✅ GENERAL machine exists');
    }

  } catch (err) {
    console.error('Error ensuring GENERAL machine:', err);
  }
}

// --- Server (Start AFTER schema is ready) ---
const PORT = Number(process.env.PORT || 3000);


(async () => {
  try {
    await initSchema();

    // ==============================
    // AUTO DB SAFETY FIX (Render free plan compatibility)
    // Ensures new columns exist even if migrations were missed
    // ==============================
    try {
      await db.query(`
        ALTER TABLE filters
        ADD COLUMN IF NOT EXISTS machine_id TEXT
      `);
      console.log("✅ DB schema check: machine_id column verified");
      await db.query(`
        ALTER TABLE filters
        ADD COLUMN IF NOT EXISTS org_id TEXT
      `);
      console.log("✅ DB schema check: org_id column verified");
      await db.query(`
        ALTER TABLE machines
        ADD COLUMN IF NOT EXISTS org_id TEXT
      `);
      console.log("✅ DB schema check: machines.org_id column verified");
      await db.query(`
        ALTER TABLE machines
        ADD COLUMN IF NOT EXISTS serial_number TEXT
      `);
      console.log("✅ DB schema check: machines.serial_number column verified");
      await db.query(`
        ALTER TABLE filters
        ADD COLUMN IF NOT EXISTS model_filter_id INTEGER
      `);
      console.log("✅ DB schema check: model_filter_id column verified");
      await db.query(`
        ALTER TABLE filters
        ADD COLUMN IF NOT EXISTS water_used_gallons INTEGER DEFAULT 0
      `);
      console.log("✅ DB schema check: water_used_gallons column verified");
      await db.query(`
        ALTER TABLE model_filters
        ADD COLUMN IF NOT EXISTS water_capacity_gallons INTEGER
      `);
      console.log("✅ DB schema check: model_filters.water_capacity_gallons verified");
    } catch (schemaErr) {
      console.error("⚠️ Schema verification warning:", schemaErr.message);
    }

    await ensureGeneralMachine();

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 FilterTrack V1 API running on:`);
      console.log(`   ➜ Local:   http://localhost:${PORT}`);
      console.log(`   ➜ Network: http://192.168.0.210:${PORT}`);
    });

    server.on('close', () => {
      console.log('❌ SERVER CLOSED');
    });

    server.on('error', (err) => {
      console.log('🔥 SERVER ERROR:', err);
    });

  } catch (err) {
    console.error('🔥 INIT FAILED:', err);
    process.exit(1);
  }
})();
