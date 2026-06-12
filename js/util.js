// ==========================================
// UTILITIES (util.js)
// ==========================================

// Returns the local calendar date as 'YYYY-MM-DD', using the device's local
// timezone (NOT UTC). Use this for all "today"/date-key logic — never use
// `new Date().toISOString().slice(0, 10)`, which returns the UTC date and
// is wrong for any timezone ahead of UTC (e.g. Sydney) during local morning
// hours.
export function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Escape a value for safe insertion into HTML text or attribute contexts.
// Returns '' for null/undefined. Escape exactly once per value (not idempotent):
// applying twice double-encodes (& -> &amp; -> &amp;amp;).
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
