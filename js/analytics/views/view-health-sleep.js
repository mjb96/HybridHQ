// ==========================================
// ANALYTICS VIEW — HEALTH SLEEP (view-health-sleep.js)
// ------------------------------------------
// Garmin-style: last night → vs previous night → 7-night history →
// 4-week trend → stages → readiness, with averages demoted to support.
// ==========================================
import {
  computeBaseline, getLastNDays, buildDailySeries,
  computeSleepConsistency, sleepReadinessNote,
  buildTrendBrief, generateHealthCoachNote,
} from '../../health/healthBaselines.js';
import { renderHistoryBars, renderTrendLineWithBaseline, renderSleepStagesChart } from '../charts.js';
import { escapeHtml, getLocalDateKey } from '../../util.js';
import { emptyState, dayOverDayChip, extremesRow, supportingAverages } from './_healthTrend.js';

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

export function renderHealthSleepView(appState) {
  const container = document.getElementById('healthSleepContent');
  if (!container) return;

  const health    = appState.health;
  const healthLog = appState.healthLog || [];

  if (!health && healthLog.length === 0) {
    container.innerHTML = emptyState('No Sleep Data',
      'Sync Health Connect to see sleep duration, quality, and nightly trends.');
    return;
  }

  const sleepHours = health?.sleepHours || 0;
  const sleepScore = health?.sleepScore ?? null;
  const quality    = sleepQualityLabel(sleepHours, sleepScore);
  const qualColor  = sleepQualityColor(sleepHours);

  const brief = buildTrendBrief(healthLog, 'sleepHours', {
    label: 'sleep', unit: 'h', higherIsBetter: true, weeklyAgg: 'avg',
  });
  // Fold tonight's live snapshot into the 7-night strip.
  if (sleepHours > 0 && brief.daily.todayIndex >= 0) {
    brief.daily.values[brief.daily.todayIndex] = sleepHours;
  }

  const sleepBaseline = computeBaseline(healthLog, 'sleepHours');
  const consistency   = computeSleepConsistency(healthLog, 7);
  const readinessNote = sleepReadinessNote(healthLog, 14);

  const last7  = getLastNDays(healthLog, 7).filter(e => e.sleepHours > 0);
  const last30 = getLastNDays(healthLog, 30).filter(e => e.sleepHours > 0);
  const avg7   = last7.length  ? (last7.reduce((s, e) => s + e.sleepHours, 0) / last7.length).toFixed(1) : '--';
  const avg30  = last30.length ? (last30.reduce((s, e) => s + e.sleepHours, 0) / last30.length).toFixed(1) : '--';

  // Stages: today's entry
  const today = getLocalDateKey();
  const todayLog = (healthLog || []).find(e => e.date === today);
  const deepH  = todayLog?.sleepDeepHours  ?? null;
  const remH   = todayLog?.sleepRemHours   ?? null;
  const lightH = todayLog?.sleepLightHours ?? null;
  const awakeH = todayLog?.sleepAwakeHours ?? null;
  const hasStages = deepH !== null;

  const { labels: chartLabels, values: chartValues } = buildDailySeries(healthLog, 'sleepHours', 30);
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
  const avg7num = avg7 !== '--' ? parseFloat(avg7) : 0;

  container.innerHTML = `
    <!-- Last night -->
    <div class="grid-2-col gap-3 mb-3" style="align-items:center;">
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid color-mix(in srgb, ${qualColor} 30%, transparent);">
        <div class="text-xs text-muted mb-1">Last Night</div>
        <div class="font-heavy" style="font-size:2rem;line-height:1;color:${qualColor};">${sleepHours > 0 ? sleepHours + 'h' : '--'}</div>
        <div class="font-bold mt-1" style="font-size:0.75rem;color:${qualColor};">${sleepHours > 0 ? quality : 'No data'}</div>
        ${dayOverDayChip(brief.dod, { unit: 'h', higherIsBetter: true })}
      </article>
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid rgba(59,130,246,0.2);">
        <div class="text-xs text-muted mb-1">Sleep Score</div>
        <div class="font-heavy text-inverse" style="font-size:2rem;line-height:1;">${sleepScore !== null ? sleepScore : '--'}</div>
        <div class="text-muted mt-1" style="font-size:0.7rem;">${sleepScore !== null ? '/ 100' : 'not available'}</div>
      </article>
    </div>

    <!-- Last 7 nights -->
    <h2 class="section-header">Last 7 Nights</h2>
    <article class="card-dark p-3 mb-2"><div id="sleep7Container"></div></article>
    ${extremesRow(brief, { unit: 'h' })}

    <!-- Last 4 weeks -->
    <h2 class="section-header">Last 4 Weeks</h2>
    <article class="card-dark p-3 mb-4"><div id="sleep4wContainer"></div></article>

    <!-- Stages (last night) -->
    ${hasStages ? `
    <h2 class="section-header">Sleep Stages — Last Night</h2>
    <div class="grid-4-col gap-2 mb-4" style="grid-template-columns:repeat(4,1fr);">
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(59,130,246,0.3);"><div class="text-xs text-muted mb-1">Deep</div><div class="font-heavy" style="color:#3b82f6;">${deepH !== null ? deepH + 'h' : '--'}</div></article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(168,85,247,0.3);"><div class="text-xs text-muted mb-1">REM</div><div class="font-heavy" style="color:#a855f7;">${remH !== null ? remH + 'h' : '--'}</div></article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(34,211,238,0.3);"><div class="text-xs text-muted mb-1">Light</div><div class="font-heavy" style="color:#22d3ee;">${lightH !== null ? lightH + 'h' : '--'}</div></article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(107,114,128,0.3);"><div class="text-xs text-muted mb-1">Awake</div><div class="font-heavy" style="color:#9ca3af;">${awakeH !== null ? awakeH + 'h' : '--'}</div></article>
    </div>` : ''}

    ${stagesChartData.length > 0 ? `
    <h2 class="section-header">Sleep Stages — Last 14 Nights</h2>
    <article class="card-dark p-3 mb-4">
      <div class="flex gap-3 mb-2 font-bold" style="font-size:0.6rem;">
        <span style="color:#3b82f6;">● Deep</span><span style="color:#a855f7;">● REM</span>
        <span style="color:#22d3ee;">● Light</span><span style="color:#9ca3af;">● Awake</span>
      </div>
      <div id="sleepStagesChartContainer"></div>
    </article>` : ''}

    <!-- 30-day trend (supporting) -->
    <h2 class="section-header">30-Night Trend</h2>
    <article class="card-dark p-3 mb-2"><div id="sleepDurationChartContainer"></div></article>
    ${supportingAverages([
      { label: 'Previous night', value: brief.dod.yesterday > 0 ? brief.dod.yesterday + 'h' : '--' },
      { label: '7-night avg', value: avg7 !== '--' ? avg7 + 'h' : '--' },
      { label: '30-night avg', value: avg30 !== '--' ? avg30 + 'h' : '--' },
      { label: 'Consistency (7d)', value: consistency.stdDev !== null ? `${consistency.label} (±${consistency.stdDev}h)` : '--' },
    ])}

    <!-- Readiness relationship -->
    ${readinessNote.observation ? `
    <h2 class="section-header">Sleep & Readiness</h2>
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-amber);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(readinessNote.observation)}</div>
    </article>` : ''}

    <!-- Coach's read -->
    <h2 class="section-header">Coach's Read</h2>
    ${brief.note ? `<article class="card-dark p-3 mb-2" style="border-left:3px solid #22d3ee;">
      <div class="text-xs font-bold text-muted mb-1" style="text-transform:uppercase;letter-spacing:0.06em;">What changed</div>
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(brief.note)}</div>
    </article>` : ''}
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-blue);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(coachNote)}</div>
    </article>
  `;

  renderHistoryBars(document.getElementById('sleep7Container'),
    brief.daily.labels, brief.daily.values,
    { color: '#3b82f6', highlightIndex: brief.daily.todayIndex,
      valueFmt: v => v.toFixed(1), refLine: avg7num > 0 ? { value: avg7num, label: '7d avg' } : null });

  renderHistoryBars(document.getElementById('sleep4wContainer'),
    brief.weekly.labels, brief.weekly.values,
    { color: '#3b82f6', valueFmt: v => v.toFixed(1) + 'h' });

  const durEl = document.getElementById('sleepDurationChartContainer');
  if (durEl && chartLabels.length > 0) {
    renderTrendLineWithBaseline(durEl, chartLabels, chartValues, sleepBaseline.baseline || 0, {
      color: '#3b82f6', yFmt: v => v.toFixed(1) + 'h', emptyMsg: 'Sync daily to track your sleep trend.',
    });
  }
  const stagesEl = document.getElementById('sleepStagesChartContainer');
  if (stagesEl) renderSleepStagesChart(stagesEl, stagesChartData);
}
