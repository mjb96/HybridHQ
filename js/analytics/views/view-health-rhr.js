// ==========================================
// ANALYTICS VIEW — HEART RATE & RECOVERY (view-health-rhr.js)
// ------------------------------------------
// Renders the 'health-rhr' analytics context.
// ==========================================
import {
  computeBaseline, formatBaselineComparison, getLastNDays,
  buildDailySeries, generateHealthCoachNote,
} from '../../health/healthBaselines.js';
import { renderTrendLineWithBaseline } from '../charts.js';
import { escapeHtml } from '../../util.js';
import { computeReadiness, computeWeeklyLoadSeries } from '../../engine.js';
import { getProgramById } from '../../state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statCard(label, value, sub = '', color = 'var(--color-pink)') {
  return `
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid color-mix(in srgb, ${color} 25%, transparent);">
      <div class="text-xs text-muted mb-1">${escapeHtml(label)}</div>
      <div class="font-heavy text-inverse" style="font-size:1.1rem;color:${color};">${escapeHtml(value)}</div>
      ${sub ? `<div class="text-xs text-muted mt-1">${escapeHtml(sub)}</div>` : ''}
    </article>`;
}

function rhrStatusColor(bpm, baseline) {
  if (!baseline) {
    if (bpm > 75) return 'var(--color-red)';
    if (bpm > 65) return 'var(--color-amber)';
    return 'var(--color-green)';
  }
  const pct = ((bpm - baseline) / baseline) * 100;
  if (pct > 12) return 'var(--color-red)';
  if (pct > 6)  return 'var(--color-amber)';
  return 'var(--color-green)';
}

function rhrLabel(bpm, baseline) {
  if (!bpm) return 'No data';
  if (!baseline) {
    if (bpm > 75) return 'Elevated';
    if (bpm > 65) return 'Moderate';
    return 'Normal';
  }
  const pct = ((bpm - baseline) / baseline) * 100;
  if (pct > 12) return 'Elevated';
  if (pct > 6)  return 'Above normal';
  if (pct < -6) return 'Below baseline';
  return 'Normal';
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderHealthRhrView(appState, days) {
  const container = document.getElementById('healthRhrContent');
  if (!container) return;

  const health    = appState.health;
  const healthLog = appState.healthLog || [];

  if (!health && healthLog.length === 0) {
    container.innerHTML = `
      <div class="card-dark p-4 text-center">
        <div class="font-heavy text-inverse mb-2" style="font-size:1.1rem;">No Heart Rate Data</div>
        <div class="text-muted text-sm">Sync Health Connect to see your resting heart rate, trends, and recovery signals.</div>
        <button class="btn-action-block btn-blue mt-3" style="max-width:200px;margin:12px auto 0;" data-action="sync-health">Sync Now</button>
      </div>`;
    return;
  }

  // ── Compute values ─────────────────────────────────────────────────────────
  const rhr    = health?.restingHeartRate || null;
  const avgHR  = health?.averageHeartRate || null;

  const rhrBaseline  = computeBaseline(healthLog, 'restingHeartRate');
  const rhrBaseText  = formatBaselineComparison(rhrBaseline, 'bpm', false); // lower is better

  const last7  = getLastNDays(healthLog, 7).filter(e => e.restingHeartRate > 0);
  const last30 = getLastNDays(healthLog, 30).filter(e => e.restingHeartRate > 0);

  const avg7rhr  = last7.length  ? Math.round(last7.reduce((s, e) => s + e.restingHeartRate, 0) / last7.length) : null;
  const avg30rhr = last30.length ? Math.round(last30.reduce((s, e) => s + e.restingHeartRate, 0) / last30.length) : null;

  // Training load context (ACWR)
  let acwr = null;
  try {
    const program = getProgramById(appState.activeProgramId);
    const maxWeek = program?.totalWeeks || 12;
    const loadSeries = computeWeeklyLoadSeries(appState, days || [], maxWeek);
    const totalByWeek = loadSeries.lift.map((v, i) => v + (loadSeries.run[i] || 0));
    const readiness = computeReadiness(totalByWeek, appState.currentWeek);
    if (readiness.hasData) acwr = readiness.acwr;
  } catch {
    /* non-fatal */
  }

  // Sleep correlation from log
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const todayLog = healthLog.find(e => e.date === today);
  const yesterdayLog = healthLog.find(e => e.date === yesterday);

  let sleepNote = '';
  if (yesterdayLog?.sleepHours > 0 && rhr > 0 && rhrBaseline.baseline) {
    const sleepShort = yesterdayLog.sleepHours < 7;
    const rhrElevated = (rhrBaseline.pctDiff || 0) > 8;
    if (sleepShort && rhrElevated) {
      sleepNote = `Last night's sleep was ${yesterdayLog.sleepHours}h and your RHR is ${rhrBaseline.pctDiff}% above baseline — short sleep commonly elevates morning heart rate.`;
    } else if (!sleepShort && !rhrElevated) {
      sleepNote = `Good sleep last night (${yesterdayLog.sleepHours}h) and a calm RHR — nervous system recovery is in good shape.`;
    }
  }

  // Trend charts
  const { labels: rhrLabels, values: rhrValues } = buildDailySeries(healthLog, 'restingHeartRate', 30);
  const { labels: hrLabels, values: hrValues }   = buildDailySeries(healthLog, 'averageHeartRate', 30);

  const statusColor = rhrStatusColor(rhr, rhrBaseline.baseline);
  const statusLabel = rhrLabel(rhr, rhrBaseline.baseline);

  const coachNote = generateHealthCoachNote(health, healthLog);

  // ── Render ────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <!-- Hero -->
    <div class="grid-2-col gap-3 mb-4">
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid color-mix(in srgb, ${statusColor} 30%, transparent);">
        <div class="text-xs text-muted mb-1">Resting HR</div>
        <div class="font-heavy" style="font-size:2rem;line-height:1;color:${statusColor};">${rhr ?? '--'}</div>
        <div class="font-bold mt-1" style="font-size:0.75rem;color:${statusColor};">${statusLabel}</div>
        ${rhr ? `<div class="text-muted mt-1" style="font-size:0.65rem;">bpm</div>` : ''}
      </article>
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid rgba(236,72,153,0.2);">
        <div class="text-xs text-muted mb-1">Avg HR (24h)</div>
        <div class="font-heavy text-inverse" style="font-size:2rem;line-height:1;">${avgHR ?? '--'}</div>
        ${avgHR ? `<div class="text-muted mt-1" style="font-size:0.65rem;">bpm</div>` : ''}
      </article>
    </div>

    <!-- Averages -->
    <div class="grid-3-col gap-2 mb-4">
      ${statCard('7-Day RHR Avg', avg7rhr ? avg7rhr + ' bpm' : '--', '', 'var(--color-pink)')}
      ${statCard('30-Day RHR Avg', avg30rhr ? avg30rhr + ' bpm' : '--', '', 'var(--color-pink)')}
      ${statCard('ACWR', acwr ? acwr.toFixed(2) : '--', acwr ? (acwr <= 1.3 ? 'Productive' : acwr <= 1.5 ? 'Overreaching' : 'Strained') : 'Log sessions', acwr && acwr <= 1.3 ? 'var(--color-green)' : 'var(--color-amber)')}
    </div>

    <!-- Baseline badge -->
    <div class="card-dark p-3 mb-4" style="border-left:3px solid ${rhrBaseline.trend === 'above' ? 'var(--color-red)' : rhrBaseline.trend === 'below' ? 'var(--color-green)' : 'var(--text-secondary)'};">
      <span class="font-bold" style="font-size:0.7rem;color:${rhrBaseline.trend === 'above' ? 'var(--color-red)' : rhrBaseline.trend === 'below' ? 'var(--color-green)' : 'var(--text-secondary)'};">${escapeHtml(rhrBaseText)}</span>
    </div>

    <!-- RHR trend chart -->
    <h2 class="section-header">Resting HR — 30-Day Trend</h2>
    <article class="card-dark p-3 mb-4">
      <div id="rhrTrendChartContainer"></div>
    </article>

    <!-- Average HR trend -->
    ${hrValues.some(v => v > 0) ? `
    <h2 class="section-header">Average HR — 30-Day Trend</h2>
    <article class="card-dark p-3 mb-4">
      <div id="avgHrTrendChartContainer"></div>
    </article>` : ''}

    <!-- Sleep correlation -->
    ${sleepNote ? `
    <h2 class="section-header">Sleep Correlation</h2>
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-amber);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(sleepNote)}</div>
    </article>` : ''}

    <!-- Training load context -->
    ${acwr !== null ? `
    <h2 class="section-header">Training Load Context</h2>
    <article class="card-dark p-3 mb-4">
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">Acute:Chronic Load Ratio</span>
        <span class="font-heavy text-inverse">${acwr.toFixed(2)}</span>
      </div>
      <div class="text-sm text-muted" style="line-height:1.5;">
        ${acwr > 1.5 ? 'High training load may be contributing to elevated resting HR. Consider a recovery day before the next hard session.'
          : acwr > 1.3 ? 'Training load is elevated. RHR elevation in this context is expected — monitor for a downward trend over the next 48h.'
          : 'Training load is in the productive zone. If RHR remains elevated, prioritise sleep and nutrition.'}
      </div>
    </article>` : ''}

    <!-- Coach note -->
    <h2 class="section-header">Coach's Read</h2>
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-pink);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(coachNote)}</div>
    </article>
  `;

  const rhrEl = document.getElementById('rhrTrendChartContainer');
  if (rhrEl && rhrLabels.length > 0) {
    renderTrendLineWithBaseline(rhrEl, rhrLabels, rhrValues, rhrBaseline.baseline || 0, {
      color: '#ec4899',
      yFmt: v => Math.round(v) + ' bpm',
      emptyMsg: 'Sync Health Connect daily to track RHR trend.',
    });
  }

  const avgHrEl = document.getElementById('avgHrTrendChartContainer');
  if (avgHrEl && hrValues.some(v => v > 0)) {
    renderTrendLineWithBaseline(avgHrEl, hrLabels, hrValues, null, {
      color: '#ef4444',
      yFmt: v => Math.round(v) + ' bpm',
    });
  }
}
