// ==========================================
// UTILITIES (util.js)
// ==========================================

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