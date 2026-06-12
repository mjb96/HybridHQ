// ==========================================
// ANALYTICS VIEW — HEALTH STEPS (view-health-steps.js)
// ------------------------------------------
// Renders the 'health-steps' analytics context.
// Turns the simple steps tile into a full activity coaching screen.
// ==========================================
import { computeBaseline, formatBaselineComparison, getLastNDays, buildDailySeries, generateHealthCoachNote } from '../../health/healthBaselines.js';
import { renderWeeklyBarChart, renderTrendLineWithBaseline } from '../charts.js';
import { escapeHtml } from '../../util.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr) {
  const valid = arr.filter(v => v > 0);
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
}

function statCard(label, value, sub = '', color = 'var(--color-green)') {
  return `
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid color-mix(in srgb, ${color} 25%, transparent);">
      <div class="text-xs text-muted mb-1">${escapeHtml(label)}</div>
      <div class="font-heavy text-inverse" style="font-size:1.1rem;color:${color};">${escapeHtml(value)}</div>
      ${sub ? `<div class="text-xs text-muted mt-1">${escapeHtml(sub)}</div>` : ''}
    </article>`;
}

function baselineBadge(text, trend) {
  const color = trend === 'above'  ? 'var(--color-green)'
              : trend === 'below'  ? 'var(--color-amber)'
              : 'var(--text-secondary)';
  return `<div class="card-dark p-3 mb-4" style="border-left:3px solid ${color};">
    <span class="font-bold" style="color:${color};font-size:0.7rem;">${escapeHtml(text)}</span>
  </div>`;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderHealthStepsView(appState) {
  const container = document.getElementById('healthStepsContent');
  if (!container) return;

  const health    = appState.health;
  const healthLog = appState.healthLog || [];

  if (!health && healthLog.length === 0) {
    container.innerHTML = `
      <div class="card-dark p-4 text-center">
        <div class="font-heavy text-inverse mb-2" style="font-size:1.1rem;">No Activity Data</div>
        <div class="text-muted text-sm">Sync Health Connect to see your step count, daily distance, and activity trends.</div>
        <button class="btn-action-block btn-blue mt-3" style="max-width:200px;margin:12px auto 0;" data-action="sync-health">Sync Now</button>
      </div>`;
    return;
  }

  // ── Compute values ─────────────────────────────────────────────────────────
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateMap   = new Map((healthLog || []).map(e => [e.date, e]));

  const todaySteps = health?.steps || dateMap.get(today)?.steps || 0;
  const yestSteps  = dateMap.get(yesterday)?.steps || 0;

  const last7  = getLastNDays(healthLog, 7).filter(e => e.steps > 0);
  const last30 = getLastNDays(healthLog, 30).filter(e => e.steps > 0);
  const avg7   = avg(last7.map(e => e.steps));
  const avg30  = avg(last30.map(e => e.steps));

  const baseline = computeBaseline(healthLog, 'steps');
  const baselineText = formatBaselineComparison(baseline, 'steps', true);

  // Trend chart: last 30 days
  const { labels: chartLabels, values: chartValues } = buildDailySeries(healthLog, 'steps', 30);

  // Secondary: calories, floors
  const todayCals   = health?.activeCalories || dateMap.get(today)?.activeCalories || 0;
  const avgCals30   = avg(last30.map(e => e.activeCalories || 0));

  // Coach note
  const coachNote = generateHealthCoachNote(health, healthLog);

  // Progress ring pct toward 10k goal
  const goalPct = Math.min(100, Math.round((todaySteps / 10000) * 100));

  // ── Render ────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <!-- Today hero + goal ring -->
    <div class="grid-2-col gap-3 mb-4" style="align-items:center;">
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid rgba(16,185,129,0.3);">
        <div class="text-xs text-muted mb-1">Today</div>
        <div class="font-heavy text-inverse" style="font-size:2rem;line-height:1;">${todaySteps.toLocaleString()}</div>
        <div class="text-muted mt-1" style="font-size:0.7rem;">steps</div>
      </article>
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid rgba(16,185,129,0.15);">
        <div class="text-xs text-muted mb-2">Goal Progress</div>
        <div style="position:relative;width:64px;height:64px;margin:0 auto;">
          <svg viewBox="0 0 64 64" style="width:64px;height:64px;transform:rotate(-90deg);">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
            <circle cx="32" cy="32" r="26" fill="none" stroke="#10b981" stroke-width="6"
              stroke-dasharray="${(2 * Math.PI * 26 * goalPct / 100).toFixed(1)} ${(2 * Math.PI * 26).toFixed(1)}"
              stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <span class="font-heavy text-inverse" style="font-size:0.75rem;">${goalPct}%</span>
          </div>
        </div>
        <div class="text-muted mt-2" style="font-size:0.65rem;">of 10,000</div>
      </article>
    </div>

    <!-- Averages row -->
    <div class="grid-3-col gap-2 mb-4">
      ${statCard('Yesterday', yestSteps > 0 ? yestSteps.toLocaleString() : '--', 'steps', 'var(--color-blue)')}
      ${statCard('7-Day Avg', avg7 > 0 ? avg7.toLocaleString() : '--', 'steps', 'var(--color-blue)')}
      ${statCard('30-Day Avg', avg30 > 0 ? avg30.toLocaleString() : '--', 'steps', 'var(--color-blue)')}
    </div>

    <!-- Baseline comparison -->
    ${baselineBadge(baselineText, baseline.trend)}

    <!-- Trend chart -->
    <h2 class="section-header">Daily Steps — Last 30 Days</h2>
    <article class="card-dark p-3 mb-4">
      <div id="healthStepsChartContainer"></div>
    </article>

    <!-- Secondary metrics -->
    <div class="grid-2-col gap-2 mb-4">
      ${statCard('Active Calories Today', todayCals > 0 ? todayCals.toLocaleString() + ' kcal' : '--', '30d avg: ' + (avgCals30 > 0 ? avgCals30.toLocaleString() + ' kcal' : '--'), 'var(--color-amber)')}
      ${statCard('Synced Days (30d)', last30.length + ' days', last30.length >= 20 ? 'Good baseline' : 'Keep syncing daily', 'var(--color-pink)')}
    </div>

    <!-- Coach note -->
    <h2 class="section-header">Coach's Read</h2>
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-green);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(coachNote)}</div>
    </article>
  `;

  // Render chart (must happen after innerHTML is written)
  const chartEl = document.getElementById('healthStepsChartContainer');
  if (chartEl && chartLabels.length > 0) {
    renderTrendLineWithBaseline(chartEl, chartLabels, chartValues, baseline.baseline || 0, {
      color: '#10b981',
      emptyMsg: 'Sync Health Connect daily to see your step trend.',
      yFmt: v => Math.round(v).toLocaleString(),
    });
  }
}
