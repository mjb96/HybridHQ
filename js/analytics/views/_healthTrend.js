// ==========================================
// SHARED — HEALTH TREND VIEW HELPERS (_healthTrend.js)
// ------------------------------------------
// Small presentational helpers shared by the Health Connect detail views so
// every metric leads with the same Garmin-style grammar: today, direction of
// change vs yesterday, recent extremes, and demoted supporting averages.
// Pure string builders (no DOM, no state).
// ==========================================
import { escapeHtml } from '../../util.js';

/** Friendly date like "Mon 9 Jun" from a YYYY-MM-DD string. */
function niceDate(ds) {
  if (!ds) return '';
  const d = new Date(ds + 'T00:00:00');
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${dow} ${d.getDate()} ${mon}`;
}

function fmtVal(v, unit) {
  if (unit === 'h')   return `${(Math.round(v * 10) / 10).toFixed(1)}h`;
  if (unit === 'bpm') return `${Math.round(v)} bpm`;
  if (unit === 'kg')  return `${(Math.round(v * 10) / 10).toFixed(1)} kg`;
  return `${Math.round(v).toLocaleString()}${unit && unit !== 'steps' ? ' ' + unit : ''}`;
}

/** Standard "no data — sync" empty state used by every health detail view. */
export function emptyState(title, body) {
  return `
    <div class="card-dark p-4 text-center">
      <div class="font-heavy text-inverse mb-2" style="font-size:1.1rem;">${escapeHtml(title)}</div>
      <div class="text-muted text-sm">${escapeHtml(body)}</div>
      <button class="btn-action-block btn-blue mt-3" style="max-width:200px;margin:12px auto 0;" data-action="sync-health">Sync Now</button>
    </div>`;
}

/**
 * Direction-of-change chip comparing today to yesterday.
 * @param {Object} dod  Result of dayOverDay()
 * @param {{unit?:string, higherIsBetter?:boolean}} opts
 */
export function dayOverDayChip(dod, opts = {}) {
  const { unit = '', higherIsBetter = true } = opts;
  if (!dod || !dod.hasToday || !dod.hasYesterday) {
    return `<div class="mt-2 text-xs text-muted">No reading yesterday to compare</div>`;
  }
  if (dod.direction === 'flat') {
    return `<div class="mt-2 text-xs" style="color:var(--text-secondary);">→ level with yesterday</div>`;
  }
  const up   = dod.direction === 'up';
  const good = higherIsBetter ? up : !up;
  const color = good ? 'var(--color-green)' : 'var(--color-amber)';
  const arrow = up ? '↑' : '↓';
  const mag   = dod.pctDelta !== null ? `${Math.abs(dod.pctDelta)}%` : fmtVal(Math.abs(dod.delta), unit);
  return `<div class="mt-2 font-bold" style="font-size:0.72rem;color:${color};">${arrow} ${mag} vs yesterday</div>`;
}

/**
 * Best / lowest day over the last 30 days as a compact two-card row.
 * @param {Object} brief  Result of buildTrendBrief()
 * @param {{unit?:string}} opts
 */
export function extremesRow(brief, opts = {}) {
  const { unit = '' } = opts;
  if (!brief.best || !brief.lowest) return '';
  return `
    <div class="grid-2-col gap-2 mb-4">
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(16,185,129,0.25);">
        <div class="text-xs text-muted mb-1">Best (30d)</div>
        <div class="font-heavy text-inverse" style="font-size:1rem;">${fmtVal(brief.best.value, unit)}</div>
        <div class="text-xs text-muted mt-1">${niceDate(brief.best.date)}</div>
      </article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(148,163,184,0.25);">
        <div class="text-xs text-muted mb-1">Lowest (30d)</div>
        <div class="font-heavy text-inverse" style="font-size:1rem;">${fmtVal(brief.lowest.value, unit)}</div>
        <div class="text-xs text-muted mt-1">${niceDate(brief.lowest.date)}</div>
      </article>
    </div>`;
}

/**
 * Demoted supporting-averages row. These used to lead each view; now they sit
 * quietly beneath the trend visuals.
 * @param {{label:string,value:string}[]} items
 */
export function supportingAverages(items) {
  const cells = items.map(it => `
    <div class="flex-between" style="padding:4px 0;">
      <span class="text-xs text-muted">${escapeHtml(it.label)}</span>
      <span class="text-sm font-bold text-inverse">${escapeHtml(it.value)}</span>
    </div>`).join('');
  return `<article class="card-dark p-3 mb-2" style="opacity:0.9;">
    <div class="text-xs font-bold text-muted mb-1" style="text-transform:uppercase;letter-spacing:0.06em;">Supporting averages</div>
    ${cells}
  </article>`;
}
