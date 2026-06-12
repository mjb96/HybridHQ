// ==========================================
// ANALYTICS VIEW — HEALTH SLEEP (view-health-sleep.js)
// ------------------------------------------
// Renders the 'health-sleep' analytics context.
// ==========================================
import {
  computeBaseline, formatBaselineComparison, getLastNDays,
  buildDailySeries, computeSleepConsistency, sleepReadinessNote,
  generateHealthCoachNote,
} from '../../health/healthBaselines.js';
import { renderTrendLineWithBaseline, renderSleepStagesChart } from '../charts.js';
import { escapeHtml } from '../../util.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statCard(label, value, sub = '', color = 'var(--color-blue)') {
  return `
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid color-mix(in srgb, ${color} 25%, transparent);">
      <div class="text-xs text-muted mb-1">${escapeHtml(label)}</div>
      <div class="font-heavy text-inverse" style="font-size:1.1rem;color:${color};">${escapeHtml(value)}</div>
      ${sub ? `<div class="text-xs text-muted mt-1">${escapeHtml(sub)}</div>` : ''}
    </article>`;
}

function sleepQualityColor(hours) {
  if (hours >= 8)  return 'var(--color-green)';
  if (hours >= 7)  return '#22d3ee';
  if (hours >= 6)  return 'var(--color-amber)';
  return 'var(--color-red)';
}

function sleepQualityLabel(hours, score) {
  if (score !== null && score !== undefined) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Fair';
    return 'Poor';
  }
  if (hours >= 8)  return 'Excellent';
  if (hours >= 7)  return 'Good';
  if (hours >= 6)  return 'Fair';
  return 'Poor';
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderHealthSleepView(appState) {
  const container = document.getElementById('healthSleepContent');
  if (!container) return;

  const health    = appState.health;
  const healthLog = appState.healthLog || [];

  if (!health && healthLog.length === 0) {
    container.innerHTML = `
      <div class="card-dark p-4 text-center">
        <div class="font-heavy text-inverse mb-2" style="font-size:1.1rem;">No Sleep Data</div>
        <div class="text-muted text-sm">Sync Health Connect to see sleep duration, quality, and nightly trends.</div>
        <button class="btn-action-block btn-blue mt-3" style="max-width:200px;margin:12px auto 0;" data-action="sync-health">Sync Now</button>
      </div>`;
    return;
  }

  // ── Compute values ─────────────────────────────────────────────────────────
  const sleepHours = health?.sleepHours || 0;
  const sleepScore = health?.sleepScore ?? null;
  const quality    = sleepQualityLabel(sleepHours, sleepScore);
  const qualColor  = sleepQualityColor(sleepHours);

  const sleepBaseline   = computeBaseline(healthLog, 'sleepHours');
  const baselineText    = formatBaselineComparison(sleepBaseline, 'h', true);
  const consistency     = computeSleepConsistency(healthLog, 7);
  const readinessNote   = sleepReadinessNote(healthLog, 14);

  const last7  = getLastNDays(healthLog, 7).filter(e => e.sleepHours > 0);
  const last30 = getLastNDays(healthLog, 30).filter(e => e.sleepHours > 0);

  const avg7   = last7.length  ? (last7.reduce((s, e) => s + e.sleepHours, 0) / last7.length).toFixed(1) : '--';
  const avg30  = last30.length ? (last30.reduce((s, e) => s + e.sleepHours, 0) / last30.length).toFixed(1) : '--';

  // Sleep stages: today's entry from log
  const today = new Date().toISOString().slice(0, 10);
  const todayLog = (healthLog || []).find(e => e.date === today);
  const deepH  = todayLog?.sleepDeepHours  ?? null;
  const remH   = todayLog?.sleepRemHours   ?? null;
  const lightH = todayLog?.sleepLightHours ?? null;
  const awakeH = todayLog?.sleepAwakeHours ?? null;
  const hasStages = deepH !== null;

  // Weekly trend
  const { labels: chartLabels, values: chartValues } = buildDailySeries(healthLog, 'sleepHours', 30);

  // Stages chart data
  const stagesChartData = getLastNDays(healthLog, 14)
    .filter(e => e.sleepDeepHours !== null)
    .map(e => ({
      label: (() => { const d = new Date(e.date + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; })(),
      deep:  e.sleepDeepHours  || 0,
      rem:   e.sleepRemHours   || 0,
      light: e.sleepLightHours || 0,
      awake: e.sleepAwakeHours || 0,
    }));

  const coachNote = generateHealthCoachNote(health, healthLog);

  // ── Render ────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <!-- Hero -->
    <div class="grid-2-col gap-3 mb-4" style="align-items:center;">
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid color-mix(in srgb, ${qualColor} 30%, transparent);">
        <div class="text-xs text-muted mb-1">Last Night</div>
        <div class="font-heavy" style="font-size:2rem;line-height:1;color:${qualColor};">${sleepHours > 0 ? sleepHours + 'h' : '--'}</div>
        <div class="font-bold mt-1" style="font-size:0.75rem;color:${qualColor};">${sleepHours > 0 ? quality : 'No data'}</div>
      </article>
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid rgba(59,130,246,0.2);">
        <div class="text-xs text-muted mb-1">Sleep Score</div>
        <div class="font-heavy text-inverse" style="font-size:2rem;line-height:1;">${sleepScore !== null ? sleepScore : '--'}</div>
        <div class="text-muted mt-1" style="font-size:0.7rem;">${sleepScore !== null ? '/ 100' : 'not available'}</div>
      </article>
    </div>

    <!-- Averages -->
    <div class="grid-3-col gap-2 mb-4">
      ${statCard('7-Day Avg', avg7 !== '--' ? avg7 + 'h' : '--', 'per night', 'var(--color-blue)')}
      ${statCard('30-Day Avg', avg30 !== '--' ? avg30 + 'h' : '--', 'per night', 'var(--color-blue)')}
      ${statCard('Consistency', consistency.stdDev !== null ? consistency.label : '--', consistency.stdDev !== null ? '±' + consistency.stdDev + 'h (7d)' : 'need 3+ nights', consistency.label === 'Consistent' ? 'var(--color-green)' : consistency.label === 'Variable' ? 'var(--color-red)' : 'var(--color-amber)')}
    </div>

    <!-- Baseline -->
    <div class="card-dark p-3 mb-4" style="border-left:3px solid ${sleepBaseline.trend === 'above' ? 'var(--color-green)' : sleepBaseline.trend === 'below' ? 'var(--color-amber)' : 'var(--text-secondary)'};">
      <span class="font-bold" style="color:${sleepBaseline.trend === 'above' ? 'var(--color-green)' : sleepBaseline.trend === 'below' ? 'var(--color-amber)' : 'var(--text-secondary)'};font-size:0.7rem;">${escapeHtml(baselineText)}</span>
    </div>

    <!-- Sleep stages (today) -->
    ${hasStages ? `
    <h2 class="section-header">Sleep Stages — Last Night</h2>
    <div class="grid-4-col gap-2 mb-4" style="grid-template-columns:repeat(4,1fr);">
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(59,130,246,0.3);">
        <div class="text-xs text-muted mb-1">Deep</div>
        <div class="font-heavy" style="color:#3b82f6;">${deepH !== null ? deepH + 'h' : '--'}</div>
      </article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(168,85,247,0.3);">
        <div class="text-xs text-muted mb-1">REM</div>
        <div class="font-heavy" style="color:#a855f7;">${remH !== null ? remH + 'h' : '--'}</div>
      </article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(34,211,238,0.3);">
        <div class="text-xs text-muted mb-1">Light</div>
        <div class="font-heavy" style="color:#22d3ee;">${lightH !== null ? lightH + 'h' : '--'}</div>
      </article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(107,114,128,0.3);">
        <div class="text-xs text-muted mb-1">Awake</div>
        <div class="font-heavy" style="color:#9ca3af;">${awakeH !== null ? awakeH + 'h' : '--'}</div>
      </article>
    </div>` : ''}

    <!-- Sleep stages trend chart -->
    ${stagesChartData.length > 0 ? `
    <h2 class="section-header">Sleep Stages — Last 14 Nights</h2>
    <article class="card-dark p-3 mb-4">
      <div class="flex gap-3 mb-2 font-bold" style="font-size:0.6rem;">
        <span style="color:#3b82f6;">● Deep</span>
        <span style="color:#a855f7;">● REM</span>
        <span style="color:#22d3ee;">● Light</span>
        <span style="color:#9ca3af;">● Awake</span>
      </div>
      <div id="sleepStagesChartContainer"></div>
    </article>` : ''}

    <!-- Nightly duration trend -->
    <h2 class="section-header">Sleep Duration — Last 30 Days</h2>
    <article class="card-dark p-3 mb-4">
      <div id="sleepDurationChartContainer"></div>
    </article>

    <!-- Sleep-readiness relationship -->
    ${readinessNote.observation ? `
    <h2 class="section-header">Sleep & Readiness</h2>
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-amber);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(readinessNote.observation)}</div>
    </article>` : ''}

    <!-- Coach note -->
    <h2 class="section-header">Coach's Read</h2>
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-blue);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(coachNote)}</div>
    </article>
  `;

  // Render charts after innerHTML is set
  const durEl = document.getElementById('sleepDurationChartContainer');
  if (durEl && chartLabels.length > 0) {
    renderTrendLineWithBaseline(durEl, chartLabels, chartValues, sleepBaseline.baseline || 0, {
      color: '#3b82f6',
      yFmt: v => v.toFixed(1) + 'h',
      emptyMsg: 'Sync daily to track your sleep trend.',
    });
  }

  const stagesEl = document.getElementById('sleepStagesChartContainer');
  if (stagesEl) {
    renderSleepStagesChart(stagesEl, stagesChartData);
  }
}
