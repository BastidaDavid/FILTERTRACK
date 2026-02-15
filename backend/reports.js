// backend/reports.js
const PDFDocument = require("pdfkit");
const { pool } = require("./database");

// Middleware simple: requiere token y toma org_id del req.user
function requireAuth(req, res, next) {
  if (!req.user?.org_id) return res.status(401).json({ error: "No token" });
  next();
}

// GET /reports/executive?start=YYYY-MM-DD&end=YYYY-MM-DD
async function executiveReport(req, res) {
  const orgId = req.user.org_id;
  const { start, end } = req.query;

  // 1) Traer filtros por org
  const filtersSql = `
    SELECT filter_id, area, equipment, location, brand, model,
           install_date, life_months, due_date, status, responsible, record_state
    FROM filters
    WHERE org_id = $1 AND record_state = 'ACTIVE'
    ORDER BY due_date ASC
  `;
  const { rows: filters } = await pool.query(filtersSql, [orgId]);

  // 2) Traer eventos por org (con filtro por fechas opcional)
  let events = [];
  if (start && end) {
    const eventsSql = `
      SELECT e.event_id, e.filter_id, e.event_type, e.event_date, e.reason, e.responsible, e.notes
      FROM events e
      JOIN filters f ON f.filter_id = e.filter_id
      WHERE f.org_id = $1
        AND e.event_date BETWEEN $2 AND $3
      ORDER BY e.event_date DESC, e.event_id DESC
    `;
    ({ rows: events } = await pool.query(eventsSql, [orgId, start, end]));
  } else {
    const eventsSql = `
      SELECT e.event_id, e.filter_id, e.event_type, e.event_date, e.reason, e.responsible, e.notes
      FROM events e
      JOIN filters f ON f.filter_id = e.filter_id
      WHERE f.org_id = $1
      ORDER BY e.event_date DESC, e.event_id DESC
      LIMIT 200
    `;
    ({ rows: events } = await pool.query(eventsSql, [orgId]));
  }

  // 3) Métricas rápidas
  const total = filters.length;
  const vencidos = filters.filter(f => (f.status || "").toUpperCase() === "VENCIDO").length;
  const proximos = filters.filter(f => (f.status || "").toUpperCase() === "PROXIMO").length;
  const activos = filters.filter(f => (f.status || "").toUpperCase() === "ACTIVE").length;

  // 4) Generar PDF
  const doc = new PDFDocument({ margin: 48 });
  const filename = `FilterTrack_Reporte_Ejecutivo_${orgId}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  doc.pipe(res);

  // Título
  doc.fontSize(22).text("FILTERTRACK — REPORTE EJECUTIVO", { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(12).text(`Organización: ${orgId}`, { align: "center" });
  doc.fontSize(10).text(`Generado: ${new Date().toISOString()}`, { align: "center" });
  doc.moveDown(1.2);

  // Resumen
  doc.fontSize(14).text("Resumen", { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(11).text(`Total filtros activos (record_state=ACTIVE): ${total}`);
  doc.text(`Activos: ${activos} | Próximos: ${proximos} | Vencidos: ${vencidos}`);
  doc.text(`Eventos incluidos: ${events.length}${start && end ? ` (rango ${start} → ${end})` : " (últimos 200)"}`);
  doc.moveDown(1);

  // Tabla simple de filtros (top 25)
  doc.fontSize(14).text("FILTROS (Top 25 por vencimiento)", { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(10);

  const top = filters.slice(0, 25);
  for (const f of top) {
    doc.text(
      `${f.filter_id} | ${f.area || "-"} | ${f.equipment || "-"} | vence: ${f.due_date || "-"} | estado: ${f.status || "-"}`
    );
  }

  doc.moveDown(1);

  // Eventos (top 30)
  doc.fontSize(14).text("EVENTOS (Top 30)", { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(10);

  const topE = events.slice(0, 30);
  for (const e of topE) {
    doc.text(`${e.event_date || "-"} | ${e.filter_id} | ${e.event_type} | ${e.responsible || "-"}`);
  }

  doc.end();
}

module.exports = { requireAuth, executiveReport };