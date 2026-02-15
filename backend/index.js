require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

if (JWT_SECRET === 'dev-secret-change-in-production') {
  console.warn('⚠️  WARNING: Using default JWT secret. Set JWT_SECRET in production!');
}

const { db, initSchema } = require('./database');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
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
  const { user_id, password, org_id } = req.body;

  if (!user_id || !password || !org_id) {
    return res.status(400).json({ error: 'user_id, password and org_id required' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const ts = new Date().toISOString();

    await db.query(
      'INSERT INTO users (user_id, org_id, password_hash, created_at) VALUES ($1, $2, $3, $4)',
      [user_id, org_id, hash, ts]
    );

    res.json({ message: 'User created' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'User already exists' });
    }
    return res.status(500).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { user_id, password } = req.body;

  if (!user_id || !password) {
    return res.status(400).json({ error: 'user_id and password required' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM users WHERE user_id = $1',
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
      { user_id: user.user_id, org_id: user.org_id },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --- Helpers ---
function nowIso() {
  return new Date().toISOString();
}

function validateCreatePayload(body) {
  const required = [
    'filter_id',
    'machine_id',
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
    filter_id,
    machine_id,
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

  // Validate machine exists
  const machineCheck = await db.query(
    `SELECT machine_id FROM machines WHERE machine_id = $1 AND org_id = $2`,
    [body.machine_id, org_id]
  );

  if (machineCheck.rows.length === 0) {
    return res.status(400).json({ error: 'Machine not found for this organization' });
  }

  const due_date = addMonths(install_date, life_months);
  const status = calcStatus(due_date);
  const ts = nowIso();

  try {
    await db.query(
      `INSERT INTO filters (
        org_id, filter_id, machine_id, area, equipment, location, brand, model,
        install_date, life_months, due_date, status, responsible, notes,
        record_state, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,
        'ACTIVE',$15,$16
      )`,
      [
        org_id,
        filter_id,
        machine_id,
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
      ]
    );

    await db.query(
      `INSERT INTO events
       (filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,'INSTALL',$2,NULL,$3,$4,$5)`,
      [filter_id, install_date, responsible, notes || null, ts]
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
app.get('/reports/executive', authMiddleware, async (req, res) => {
  try {
    const orgId = req.user.org_id;
    const { start, end } = req.query;

    // Load filters for this organization
    const filtersResult = await db.query(
      `SELECT filter_id, area, equipment, location, brand, model,
              install_date, life_months, due_date, status, responsible
       FROM filters
       WHERE org_id = $1 AND record_state = 'ACTIVE'
       ORDER BY due_date ASC`,
      [orgId]
    );

    const filters = filtersResult.rows;

    // Load events (optional date filter)
    let events = [];
    if (start && end) {
      const eventsResult = await db.query(
        `SELECT e.*
         FROM events e
         JOIN filters f ON f.filter_id = e.filter_id
         WHERE f.org_id = $1
           AND e.event_date BETWEEN $2 AND $3
         ORDER BY e.event_date DESC`,
        [orgId, start, end]
      );
      events = eventsResult.rows;
    } else {
      const eventsResult = await db.query(
        `SELECT e.*
         FROM events e
         JOIN filters f ON f.filter_id = e.filter_id
         WHERE f.org_id = $1
         ORDER BY e.event_date DESC
         LIMIT 200`,
        [orgId]
      );
      events = eventsResult.rows;
    }

    // Metrics
    const total = filters.length;
    const vencidos = filters.filter(f => (f.status || '').toUpperCase() === 'VENCIDO').length;
    const proximos = filters.filter(f => (f.status || '').toUpperCase() === 'PROXIMO').length;
    const activos = filters.filter(f => (f.status || '').toUpperCase() === 'ACTIVE').length;

    // Generate PDF
    const doc = new PDFDocument({ margin: 48 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="FilterTrack_Reporte_Ejecutivo_${orgId}.pdf"`
    );

    doc.pipe(res);

    // Header
    doc.fontSize(22).text('FILTERTRACK — REPORTE EJECUTIVO', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(12).text(`Organización: ${orgId}`, { align: 'center' });
    doc.fontSize(10).text(`Generado: ${new Date().toISOString()}`, { align: 'center' });
    doc.moveDown(1.2);

    // Summary
    doc.fontSize(14).text('Resumen', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11).text(`Total filtros activos: ${total}`);
    doc.text(`Activos: ${activos} | Próximos: ${proximos} | Vencidos: ${vencidos}`);
    doc.text(`Eventos incluidos: ${events.length}`);
    doc.moveDown(1);

    // Filters (top 25)
    doc.fontSize(14).text('Filtros (Top 25 por vencimiento)', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10);

    filters.slice(0, 25).forEach(f => {
      doc.text(
        `${f.filter_id} | ${f.area || '-'} | ${f.equipment || '-'} | vence: ${f.due_date || '-'} | estado: ${f.status || '-'}`
      );
    });

    doc.moveDown(1);

    // Events (top 30)
    doc.fontSize(14).text('Eventos (Top 30)', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10);

    events.slice(0, 30).forEach(e => {
      doc.text(
        `${e.event_date || '-'} | ${e.filter_id} | ${e.event_type} | ${e.responsible || '-'}`
      );
    });

    doc.end();

  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// =====================
// EXECUTIVE REPORT (EXCEL)
// =====================
app.get('/reports/executive.xlsx', authMiddleware, async (req, res) => {
  try {
    const orgId = req.user.org_id;

    const result = await db.query(
      `SELECT filter_id, area, equipment, location,
              brand, model, due_date, status
       FROM filters
       WHERE org_id = $1 AND record_state = 'ACTIVE'
       ORDER BY due_date ASC`,
      [orgId]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte Ejecutivo');

    sheet.columns = [
      { header: 'Filter ID', key: 'filter_id', width: 20 },
      { header: 'Área', key: 'area', width: 15 },
      { header: 'Equipo', key: 'equipment', width: 20 },
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
      `attachment; filename=FilterTrack_${orgId}.xlsx`
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
    clauses.push(`org_id = $${idx++}`);
    values.push(req.user.org_id);

    if (area) {
      clauses.push(`area = $${idx++}`);
      values.push(area);
    }

    if (status) {
      clauses.push(`status = $${idx++}`);
      values.push(status);
    }

    if (state) {
      clauses.push(`record_state = $${idx++}`);
      values.push(state);
    } else {
      clauses.push(`record_state = 'ACTIVE'`);
    }

    if (q) {
      clauses.push(`(
        filter_id ILIKE $${idx} OR
        equipment ILIKE $${idx} OR
        location ILIKE $${idx} OR
        brand ILIKE $${idx} OR
        model ILIKE $${idx}
      )`);
      values.push(`%${q}%`);
      idx++;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `
      SELECT *
      FROM filters
      ${where}
      ORDER BY due_date ASC
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
      'SELECT * FROM filters WHERE filter_id = $1 AND org_id = $2',
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
    const life_months = Number(updated.life_months);
    const due_date = addMonths(install_date, life_months);
    const status = calcStatus(due_date);
    const ts = nowIso();

    await db.query(
      `UPDATE filters
       SET area=$1, equipment=$2, location=$3, brand=$4, model=$5,
           install_date=$6, life_months=$7, due_date=$8, status=$9,
           responsible=$10, notes=$11, updated_at=$12
       WHERE filter_id=$13 AND org_id=$14`,
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
        filter_id,
        req.user.org_id
      ]
    );

    await db.query(
      `INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,'EDIT',$2,NULL,$3,$4,$5)`,
      [filter_id, isoToday(), updated.responsible, 'Edited filter record', ts]
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
    const result = await db.query(
      `UPDATE filters
       SET record_state='ARCHIVED', updated_at=$1
       WHERE filter_id=$2 AND org_id=$3`,
      [ts, filter_id, req.user.org_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Filter not found' });
    }

    await db.query(
      `INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,'ARCHIVE',$2,NULL,$3,$4,$5)`,
      [filter_id, isoToday(), responsible, notes, ts]
    );

    res.json({ message: 'Filter archived', filter_id });

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
    notes,
    area,
    equipment,
    location,
    brand,
    model
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

    await db.query('BEGIN');

    await db.query(
      `UPDATE filters
       SET record_state='ARCHIVED', updated_at=$1
       WHERE filter_id=$2 AND org_id=$3`,
      [ts, filter_id, req.user.org_id]
    );

    await db.query(
      `INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,'REPLACE',$2,$3,$4,$5,$6)`,
      [filter_id, install_date, reason || 'Programado', responsible, notes || null, ts]
    );

    await db.query(
      `INSERT INTO filters (
        org_id, filter_id, area, equipment, location, brand, model,
        install_date, life_months, due_date, status, responsible, notes,
        record_state, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,
        'ACTIVE',$14,$15
      )`,
      [
        req.user.org_id,
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
      ]
    );

    await db.query(
      `INSERT INTO events (filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,'INSTALL',$2,NULL,$3,$4,$5)`,
      [next.filter_id, next.install_date, responsible, next.notes, ts]
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
       (filter_id, event_type, event_date, reason, responsible, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING event_id`,
      [filter_id, event_type, event_date, reason, responsible, notes, ts]
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
      `SELECT id, name, category
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

// Create machine
app.post('/machines', authMiddleware, async (req, res) => {
  const { machine_id, area, location, brand_id, model_id, serial_number } = req.body;

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
       (machine_id, org_id, area, location, brand_id, model_id, serial_number, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        machine_id,
        req.user.org_id,
        area || null,
        location || null,
        brand_id || null,
        model_id || null,
        serial_number || null,
        ts
      ]
    );

    res.json({
      message: 'Machine created',
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
    const result = await db.query(
      `SELECT m.machine_id,
             m.area,
             m.location,
             m.serial_number,
             b.name AS brand_name,
             mm.model_name,
             mm.filter_type,
             m.created_at
       FROM machines m
       LEFT JOIN machine_brands b ON m.brand_id = b.id
       LEFT JOIN machine_models mm ON m.model_id = mm.id
       WHERE m.org_id = $1
       ORDER BY m.created_at DESC`,
      [req.user.org_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('List machines error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single machine
app.get('/machines/:machine_id', authMiddleware, async (req, res) => {
  const { machine_id } = req.params;

  try {
    const result = await db.query(
      `SELECT *
       FROM machines
       WHERE machine_id = $1 AND org_id = $2`,
      [machine_id, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error('Get machine error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List filters for a specific machine
app.get('/machines/:machine_id/filters', authMiddleware, async (req, res) => {
  const { machine_id } = req.params;

  try {
    const result = await db.query(
      `SELECT *
       FROM filters
       WHERE machine_id = $1
         AND org_id = $2
         AND record_state = 'ACTIVE'
       ORDER BY due_date ASC`,
      [machine_id, req.user.org_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error('Machine filters error:', err);
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
// MACHINE MODELS (by brand_id param)
// ==============================

app.get('/machine-models/:brand_id', authMiddleware, async (req, res) => {
  const { brand_id } = req.params;

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
    console.error('Machine models by param error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Server ---
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`🚀 FilterTrack V1 API running on http://localhost:${PORT}`);
});
