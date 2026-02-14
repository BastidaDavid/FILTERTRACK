function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(isoDate, months) {
  const d = new Date(isoDate + 'T00:00:00');
  const day = d.getDate();
  d.setMonth(d.getMonth() + Number(months || 0));
  // Handle month overflow (e.g., Jan 31 + 1 month)
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function diffDays(fromIso, toIso) {
  const a = new Date(fromIso + 'T00:00:00');
  const b = new Date(toIso + 'T00:00:00');
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function calcStatus(dueDate, today = isoToday()) {
  const daysLeft = diffDays(today, dueDate);
  if (daysLeft <= 0) return 'EXPIRED';
  if (daysLeft <= 30) return 'DUE_SOON';
  return 'ACTIVE';
}

module.exports = { isoToday, addMonths, diffDays, calcStatus };
