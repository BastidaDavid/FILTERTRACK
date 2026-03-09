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

function calcStatus(dueDate, installDate, lifeMonths) {
  const todayIso = isoToday();
  const remainingDays = diffDays(todayIso, dueDate);

  // 🔴 Expired
  if (remainingDays <= 0) return 'EXPIRED';

  // 🟠 Critical (1–30 days remaining)
  if (remainingDays <= 30) return 'CRITICAL';

  // 🟡 Due soon (31–90 days remaining)
  if (remainingDays <= 90) return 'DUE_SOON';

  // 🟢 Active (> 90 days remaining)
  return 'ACTIVE';
}

module.exports = { isoToday, addMonths, diffDays, calcStatus };
