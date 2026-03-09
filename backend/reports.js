// backend/reports.js
const PDFDocument = require("pdfkit");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const { db } = require("./database");

function detectLang(req) {
  const lang = req.headers['accept-language'];
  return lang === 'en' ? 'en' : 'es';
}

const pdfTranslations = {
  es: {
    title: "FILTRACORE — REPORTE EJECUTIVO",
    subtitle: "Un Producto de Bastida Systems",
    organization: "Organización",
    generated: "Generado",
    summary: "Resumen",
    totalActive: "Total filtros activos",
    statusLine: "Activos",
    soon: "Próximos",
    expired: "Vencidos",
    eventsIncluded: "Eventos incluidos",
    last200: "(últimos 200)",
    filtersSection: "FILTROS",
    due: "vence",
    status: "estado",
    eventsSection: "EVENTOS"
  },
  en: {
    title: "FILTRACORE — EXECUTIVE REPORT",
    subtitle: "A Bastida Systems Product",
    organization: "Organization",
    generated: "Generated",
    summary: "Summary",
    totalActive: "Total active filters",
    statusLine: "Active",
    soon: "Expiring Soon",
    expired: "Expired",
    eventsIncluded: "Events included",
    last200: "(last 200)",
    filtersSection: "FILTERS",
    due: "due",
    status: "status",
    eventsSection: "EVENTS"
  }
};

function requireAuth(req, res, next) {
  if (!req.user?.org_id) return res.status(401).json({ error: "No token" });
  next();
}

async function executiveReport(req, res) {
  const orgId = req.user.org_id;
  const { start, end } = req.query;

  const lang = detectLang(req);
  const t = pdfTranslations[lang];

  const filtersSql = `
    SELECT f.filter_id,f.machine_id,m.area,m.location,
    b.name AS brand,mm.model_name AS model,
    f.install_date,f.life_months,f.due_date,f.status,f.responsible
    FROM filters f
    LEFT JOIN machines m ON m.machine_id = f.machine_id
    LEFT JOIN machine_brands b ON b.id = m.brand_id
    LEFT JOIN machine_models mm ON mm.id = m.model_id
    WHERE f.org_id = $1 AND f.record_state='ACTIVE'
    ORDER BY f.due_date ASC
  `;

  const { rows: filters } = await db.query(filtersSql, [orgId]);

  const eventsSql = `
    SELECT e.id,e.filter_id,e.event_type,e.event_date,e.responsible
    FROM events e
    JOIN filters f ON f.filter_id = e.filter_id
    WHERE f.org_id=$1
    ORDER BY e.event_date DESC
    LIMIT 200
  `;

  const { rows: events } = await db.query(eventsSql, [orgId]);

  let activos = 0;
  let proximos = 0;
  let vencidos = 0;

  for (const f of filters) {
    const status = (f.status || "").toUpperCase();

    if (status === "EXPIRED") vencidos++;
    else if (status === "CRITICAL" || status === "DUE_SOON") proximos++;
    else activos++;
  }

  const chartCanvas = new ChartJSNodeCanvas({ width: 500, height: 350, backgroundColour: "white" });

  const pieChart = await chartCanvas.renderToBuffer({
    type: "pie",
    data: {
      labels: ["Active", "Soon", "Expired"],
      datasets: [{
        data: [activos, proximos, vencidos],
        backgroundColor: ["#22c55e", "#facc15", "#ef4444"]
      }]
    }
  });

  const areaCounts = {};
  filters.forEach(f => {
    const k = f.area || "Unknown";
    areaCounts[k] = (areaCounts[k] || 0) + 1;
  });

  const areaChart = await chartCanvas.renderToBuffer({
    type: "bar",
    data: {
      labels: Object.keys(areaCounts),
      datasets: [{ data: Object.values(areaCounts), backgroundColor: "#06b6d4" }]
    }
  });

  const machineCounts = {};
  filters.forEach(f => {
    const k = f.machine_id || "Unknown";
    machineCounts[k] = (machineCounts[k] || 0) + 1;
  });

  const machineChart = await chartCanvas.renderToBuffer({
    type: "bar",
    data: {
      labels: Object.keys(machineCounts),
      datasets: [{ data: Object.values(machineCounts), backgroundColor: "#3b82f6" }]
    }
  });

  const eventCounts = {};
  events.forEach(e => {
    const k = e.event_type || "Unknown";
    eventCounts[k] = (eventCounts[k] || 0) + 1;
  });

  const eventsChart = await chartCanvas.renderToBuffer({
    type: "bar",
    data: {
      labels: Object.keys(eventCounts),
      datasets: [{ data: Object.values(eventCounts), backgroundColor: "#8b5cf6" }]
    }
  });

  const doc = new PDFDocument({ margin: 50 });
  const filename = `FiltraCore_Report_${orgId}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  doc.pipe(res);

  doc.fontSize(22).text(t.title, { align: "center" });
  doc.moveDown();

  doc.fontSize(12).text(`${t.organization}: ${orgId}`, { align: "center" });
  doc.text(`${t.generated}: ${new Date().toISOString()}`, { align: "center" });

  doc.moveDown();

  doc.font("Helvetica-Bold").fontSize(14).text(t.summary);
  doc.font("Helvetica");
  doc.text(`${t.statusLine}: ${activos}`);
  doc.text(`${t.soon}: ${proximos}`);
  doc.text(`${t.expired}: ${vencidos}`);

  doc.moveDown(2);

  // charts on first page under the summary
  doc.image(pieChart, 60, 220, { fit: [230, 170] });       // circular (first)
  doc.image(machineChart, 320, 220, { fit: [230, 170] });  // machines (blue)

  doc.image(eventsChart, 60, 410, { fit: [230, 170] });    // purple events
  doc.image(areaChart, 320, 410, { fit: [230, 170] });     // area

  const pageBottom = doc.page.height - 80;
  doc.fontSize(16).text("Maintenance Analytics Dashboard", 0, pageBottom, { align: "center" });

  // next page for filters list
  doc.addPage();

  doc.font("Helvetica-Bold").fontSize(14).text(t.filtersSection);
  doc.font("Helvetica");

  filters.slice(0, 100).forEach(f => {
    doc.text(`${f.filter_id} | ${f.machine_id} | ${f.status}`);
  });

  doc.addPage();

  doc.font("Helvetica-Bold").fontSize(14).text(t.eventsSection);
  doc.font("Helvetica");

  events.slice(0, 30).forEach(e => {
    doc.text(`${e.event_date} | ${e.filter_id} | ${e.event_type}`);
  });

  doc.end();
}

module.exports = { requireAuth, executiveReport };
