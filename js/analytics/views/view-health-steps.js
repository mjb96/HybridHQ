// ==========================================
// ANALYTICS VIEW — HEALTH STEPS (view-health-steps.js)
// ------------------------------------------
// Renders the 'health-steps' analytics context.
// Garmin-style: today → vs yesterday → last 7 days → last 4 weeks → trend,
// with averages as supporting context and a trend-aware coaching read.
// ==========================================
import {
  computeBaseline, getLastNDays, buildDailySeries,
  buildTrendBrief, generateHealthCoachNote,
} from '../../health/healthBaselines.js';
import { renderHistoryBars, renderTrendLineWithBaseline } from '../charts.js';
import { escapeHtml, getLocalDateKey } from '../../util.js';
import {
  emptyState, dayOverDayChip, extremesRow, supportingAverages,
} from './_healthTrend.js';

function avg(arr) {
  const valid = arr.filter(v => v > 0);
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
}

export function renderHealthStepsView(appState) {
  const container = document.getElementById('healthStepsContent');
  if (!container) return;

  const health    = appState.health;
  const healthLog = appState.healthLog || [];

  if (!health && healthLog.length === 0) {
    container.innerHTML = emptyState('No Activity Data',
      'Sync Health Connect to see your step count, daily distance, and activity trends.');
    return;
  }

  const GOAL = 10000;
  const brief = buildTrendBrief(healthLog, 'steps', {
    label: 'steps', unit: 'steps', higherIsBetter: true, weeklyAgg: 'avg', goal: GOAL,
  });

  // Today can come from the live snapshot even before it lands in the log.
  const today = getLocalDateKey();
  const todaySteps = health?.steps || brief.dod.today || 0;
  if (todaySteps > 0 && brief.daily.todayIndex >= 0) {
    brief.daily.values[brief.daily.todayIndex] = todaySteps;
  }

  const last7  = getLastNDays(healthLog, 7).filter(e => e.steps > 0);
  const last30 = getLastNDays(healthLog, 30).filter(e => e.steps > 0);
  const avg7   = avg(last7.map(e => e.steps));
  const avg30  = avg(last30.map(e => e.steps));
  const baseline = computeBaseline(healthLog, 'steps');

  const todayCals = health?.activeCalories || 0;
  const goalPct   = Math.min(100, Math.round((todaySteps / GOAL) * 100));
  const coachNote = generateHealthCoachNote(health, healthLog);

  const { labels: chartLabels, values: chartValues } = buildDailySeries(healthLog, 'steps', 30);

  container.innerHTML = `
    <!-- Today + goal -->
    <div class="grid-2-col gap-3 mb-3" style="align-items:center;">
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid rgba(16,185,129,0.3);">
        <div class="text-xs text-muted mb-1">Today</div>
        <div class="font-heavy text-inverse" style="font-size:2rem;line-height:1;">${todaySteps.toLocaleString()}</div>
        <div class="text-muted mt-1" style="font-size:0.7rem;">steps</div>
        ${dayOverDayChip(brief.dod, { unit: 'steps', higherIsBetter: true })}
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
        <div class="text-muted mt-2" style="font-size:0.65rem;">of ${GOAL.toLocaleString()}</div>
      </article>
    </div>

    <!-- Last 7 days -->
    <h2 class="section-header">Last 7 Days</h2>
    <article class="card-dark p-3 mb-2"><div id="steps7Container"></div></article>
    ${extremesRow(brief, { unit: 'steps' })}

    <!-- Last 4 weeks -->
    <h2 class="section-header">Last 4 Weeks</h2>
    <article class="card-dark p-3 mb-4"><div id="steps4wContainer"></div></article>

    <!-- 30-day trend (supporting) -->
    <h2 class="section-header">30-Day Trend</h2>
    <article class="card-dark p-3 mb-2"><div id="healthStepsChartContainer"></div></article>
    ${supportingAverages([
      { label: 'Yesterday', value: brief.dod.yesterday > 0 ? brief.dod.yesterday.toLocaleString() : '--' },
      { label: '7-day avg', value: avg7 > 0 ? avg7.toLocaleString() : '--' },
      { label: '30-day avg', value: avg30 > 0 ? avg30.toLocaleString() : '--' },
    ])}

    <!-- Secondary -->
    <div class="grid-2-col gap-2 mb-4 mt-2">
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(245,158,11,0.25);">
        <div class="text-xs text-muted mb-1">Active Calories Today</div>
        <div class="font-heavy" style="font-size:1.1rem;color:var(--color-amber);">${todayCals > 0 ? todayCals.toLocaleString() + ' kcal' : '--'}</div>
      </article>
      <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(236,72,153,0.25);">
        <div class="text-xs text-muted mb-1">Synced Days (30d)</div>
        <div class="font-heavy" style="font-size:1.1rem;color:var(--color-pink);">${last30.length} days</div>
        <div class="text-xs text-muted mt-1">${last30.length >= 20 ? 'Good baseline' : 'Keep syncing daily'}</div>
      </article>
    </div>

    <!-- Coach's read -->
    <h2 class="section-header">Coach's Read</h2>
    ${brief.note ? `<article class="card-dark p-3 mb-2" style="border-left:3px solid var(--color-green);">
      <div class="text-xs font-bold text-muted mb-1" style="text-transform:uppercase;letter-spacing:0.06em;">What changed</div>
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(brief.note)}</div>
    </article>` : ''}
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-blue);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(coachNote)}</div>
    </article>
  `;

  renderHistoryBars(document.getElementById('steps7Container'),
    brief.daily.labels, brief.daily.values,
    { color: '#10b981', highlightIndex: brief.daily.todayIndex, refLine: avg7 > 0 ? { value: avg7, label: '7d avg' } : null });

  renderHistoryBars(document.getElementById('steps4wContainer'),
    brief.weekly.labels, brief.weekly.values,
    { color: '#10b981', valueFmt: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) });

  const chartEl = document.getElementById('healthStepsChartContainer');
  if (chartEl && chartLabels.length > 0) {
    renderTrendLineWithBaseline(chartEl, chartLabels, chartValues, baseline.baseline || 0, {
      color: '#10b981',
      emptyMsg: 'Sync Health Connect daily to see your step trend.',
      yFmt: v => Math.round(v).toLocaleString(),
    });
  }
}
