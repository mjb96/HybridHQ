// ==========================================
// ANALYTICS VIEW — RECOVERY (view-recovery.js)
// ------------------------------------------
// Renders the 'recovery', 'recovery-score', and 'stress-balance' contexts.
// ==========================================
import { computeRecoveryScore, computeWeeklyLoadSeries, computeReadiness } from '../../engine.js';
import { weeklyRpeSeries } from '../../metrics/metrics-load.js';
import { getProgramById } from '../../state.js';
import { setText } from '../utils.js';
import { renderRpeChart, renderStackedLoadChart } from '../charts.js';
import { computeBaseline } from '../../health/healthBaselines.js';
import { escapeHtml } from '../../util.js';

// Inject (or refresh) the Health Connect signal panel above the RPE summary.
function renderHealthSignalsPanel(section, health, healthLog) {
  let panel = section.querySelector('.recovery-health-signals');

  if (!health || (health.sleepHours <= 0 && !health.restingHeartRate)) {
    if (panel) panel.remove();
    return;
  }

  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'recovery-health-signals mb-3';
    section.insertBefore(panel, section.firstChild);
  }

  const rhrBaseline = computeBaseline(healthLog || [], 'restingHeartRate');
  const rhr   = health.restingHeartRate;
  const rhrPct = rhrBaseline.pctDiff;
  const rhrColor = rhr > 0 && rhrPct !== null && rhrPct > 10 ? '#ef4444'
    : rhr > 0 && rhrPct !== null && rhrPct > 5 ? '#f59e0b' : '#10b981';

  const sleepH = health.sleepHours;
  const sleepColor = sleepH < 6 ? '#ef4444' : sleepH < 7 ? '#f59e0b' : '#10b981';

  let contextNote = '';
  if (sleepH > 0 && sleepH < 6 && rhr > 0 && rhrPct !== null && rhrPct > 8) {
    contextNote = `Short sleep and elevated RHR both detected — recovery is compromised. Avoid high-intensity work today.`;
  } else if (sleepH > 0 && sleepH < 7) {
    contextNote = `${sleepH}h sleep may carry residual fatigue into today's session.`;
  } else if (rhr > 0 && rhrPct !== null && rhrPct > 10) {
    contextNote = `RHR is ${rhrPct}% above your baseline — a systemic stress signal. Adjust session intensity.`;
  }

  panel.innerHTML = `
    <div class="grid-2-col gap-2 mb-2">
      ${sleepH > 0 ? `
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb, ${sleepColor} 30%, transparent);">
        <div class="text-xs text-muted mb-1">Sleep Last Night</div>
        <div class="font-heavy" style="color:${sleepColor};">${sleepH}h</div>
        <div class="text-xs mt-1" style="color:${sleepColor};">${sleepH >= 8 ? 'Excellent' : sleepH >= 7 ? 'Good' : sleepH >= 6 ? 'Fair' : 'Poor'}</div>
      </article>` : ''}
      ${rhr > 0 ? `
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb, ${rhrColor} 30%, transparent);" data-action="open-analytics" data-context="health-rhr" style="cursor:pointer;">
        <div class="text-xs text-muted mb-1">Resting HR</div>
        <div class="font-heavy" style="color:${rhrColor};">${rhr} bpm</div>
        <div class="text-xs mt-1" style="color:${rhrColor};">${rhrPct !== null ? (rhrPct > 0 ? '+' + rhrPct + '% vs avg' : rhrPct + '% vs avg') : 'Building baseline'}</div>
      </article>` : ''}
    </div>
    ${contextNote ? `<article class="card-dark p-3 mb-2" style="border-left:3px solid var(--color-amber);">
      <div class="text-sm text-muted" style="line-height:1.4;">${escapeHtml(contextNote)}</div>
    </article>` : ''}`;
}

// ---- Recovery overview (RPE summary cards + RPE trend + ACWR) --------------
export function renderRecoveryView(appState, days) {
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek    = activeProgram?.totalWeeks || 12;
  const weekLabels = Array.from({ length: maxWeek }, (_, i) => 'W' + (i + 1));
  const rpeData    = weeklyRpeSeries(appState, days, maxWeek);

  const wk      = appState.currentWeek || '1';
  const weekData = appState.weeks?.[wk];

  let totalRpe = 0, rpeCount = 0;
  if (weekData) {
    days.forEach(d => {
      const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
      const gRpe = parseInt(weekData.gymRpe?.[d], 10)   || 0;
      if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
      if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    });
  }

  const avgRpe = rpeCount > 0 ? (totalRpe / rpeCount) : 0;
  let statusLabel = '--', statusColor = 'var(--text-muted)', interpretation = 'Log workouts to see recovery status.';
  if (rpeCount > 0) {
    if (avgRpe < 6) {
      statusLabel    = 'Fresh';
      statusColor    = '#10b981';
      interpretation = 'Low fatigue this week. Good time to push intensity.';
    } else if (avgRpe < 8) {
      statusLabel    = 'Accumulating';
      statusColor    = '#f59e0b';
      interpretation = 'Moderate fatigue. Stick to planned volume and prioritise sleep.';
    } else {
      statusLabel    = 'High Load';
      statusColor    = '#ef4444';
      interpretation = 'High fatigue this week. Consider reducing volume or taking a rest day.';
    }
  }

  const section = document.getElementById('analytics-recovery');
  if (!section) return;

  renderHealthSignalsPanel(section, appState.health, appState.healthLog);

  let summaryEl = section.querySelector('.recovery-summary-cards');
  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.className = 'recovery-summary-cards grid-2-col gap-2 mb-3';
    const chartArticle = section.querySelector('article');
    if (chartArticle) section.insertBefore(summaryEl, chartArticle);
    else section.appendChild(summaryEl);
  }
  summaryEl.innerHTML = `
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(16,185,129,0.3);">
      <div class="text-xs text-muted mb-1">Avg RPE This Week</div>
      <div class="text-lg font-heavy" style="color:${statusColor};">${rpeCount > 0 ? avgRpe.toFixed(1) : '--'}</div>
      <div class="text-xs font-bold mt-1" style="color:${statusColor};">${statusLabel}</div>
    </article>
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(59,130,246,0.3);">
      <div class="text-xs text-muted mb-1">Sessions Logged</div>
      <div class="text-lg font-heavy text-inverse">${rpeCount}</div>
      <div class="text-xs text-muted mt-1">this week</div>
    </article>
  `;

  let interpEl = section.querySelector('.recovery-interpretation');
  if (!interpEl) {
    interpEl = document.createElement('article');
    interpEl.className = 'recovery-interpretation card-dark p-3 mb-3';
    const chartArticle = section.querySelector('article:not(.recovery-summary-cards article)');
    if (chartArticle) section.insertBefore(interpEl, chartArticle);
    else section.appendChild(interpEl);
  }
  interpEl.innerHTML = `<div class="text-sm text-muted" style="line-height:1.5;">${interpretation}</div>`;

  renderRpeChart(document.getElementById('rpeTrendContainer'), weekLabels, rpeData);

  const load = computeWeeklyLoadSeries(appState, days, maxWeek);
  const totalByWeek = load.lift.map((v, i) => v + (load.run[i] || 0));
  const readiness = computeReadiness(totalByWeek, appState.currentWeek);

  setText('recoveryAcwr',    readiness.hasData ? readiness.acwr.toFixed(2) : '--');
  setText('recoveryAcute',   readiness.hasData ? readiness.acute.toLocaleString() + ' AU' : '--');
  setText('recoveryChronic', readiness.hasData ? readiness.chronic.toLocaleString() + ' AU' : '--');

  renderStackedLoadChart(document.getElementById('loadTrendContainer'), load.lift, load.run);
}

// ---- Recovery score detail (score breakdown + RPE trend) -------------------
export function renderRecoveryScoreView(appState, days) {
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek    = activeProgram?.totalWeeks || 12;
  const weekLabels = Array.from({ length: maxWeek }, (_, i) => 'W' + (i + 1));
  const rpeData    = weeklyRpeSeries(appState, days, maxWeek);

  const r = computeRecoveryScore(appState, days);

  const heroEl  = document.getElementById('recoveryScoreHero');
  const rpeEl   = document.getElementById('recoveryAvgRpe');
  const fatEl   = document.getElementById('recoveryFatigueScore');
  const restEl  = document.getElementById('recoveryRestScore');
  const restDEl = document.getElementById('recoveryRestDays');
  const recEl   = document.getElementById('recoveryRecommendation');

  if (heroEl)  heroEl.textContent  = r.hasData ? `${r.score}%` : '--';
  if (rpeEl)   rpeEl.textContent   = r.hasData ? r.avgRpe.toFixed(1) : '--';
  if (fatEl)   fatEl.textContent   = r.hasData ? `${r.fatigueScore}%` : '--';
  if (restEl)  restEl.textContent  = r.hasData ? `${r.restScore}%` : '--';
  if (restDEl) restDEl.textContent = r.hasData ? `${r.restDays} / ${days.length}` : '--';
  if (recEl)   recEl.textContent   = r.recommendation;

  const trendEl = document.getElementById('rpeTrendContainerDetail');
  if (trendEl) renderRpeChart(trendEl, weekLabels, rpeData);
}

// ---- Stress balance detail (lift vs run load share + stacked chart) --------
export function renderStressBalanceView(appState, days) {
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;
  const { lift, run } = computeWeeklyLoadSeries(appState, days, maxWeek);

  const liftTotal = lift.reduce((a, b) => a + b, 0);
  const runTotal  = run.reduce((a, b) => a + b, 0);
  const grand     = liftTotal + runTotal;
  const liftPct   = grand > 0 ? Math.round((liftTotal / grand) * 100) : 0;

  setText('stressLiftShare', `${liftPct}%`);
  setText('stressRunShare',  `${grand > 0 ? 100 - liftPct : 0}%`);

  const chartEl = document.getElementById('stressChartContainer');
  if (chartEl) renderStackedLoadChart(chartEl, lift, run);
}
