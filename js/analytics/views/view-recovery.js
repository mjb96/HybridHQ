// ==========================================
// ANALYTICS VIEW — RECOVERY (view-recovery.js)
// ------------------------------------------
// Renders the 'recovery', 'recovery-score', and 'stress-balance' contexts.
// ==========================================
import { computeRecoveryScore, computeWeeklyLoadSeries, computeReadiness } from '../../engine.js';
import { getProgramById } from '../../state.js';
import { setText } from '../utils.js';
import { renderRpeChart, renderStackedLoadChart } from '../charts.js';

// ---- Recovery overview (RPE summary cards + RPE trend + ACWR) --------------
export function renderRecoveryView(data, appState, days) {
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

  renderRpeChart(document.getElementById('rpeTrendContainer'), data.weekLabels, data.rpeData);

  const maxWeek = data.weekLabels.length;
  const load = computeWeeklyLoadSeries(appState, days, maxWeek);
  const totalByWeek = load.lift.map((v, i) => v + (load.run[i] || 0));
  const readiness = computeReadiness(totalByWeek, appState.currentWeek);

  setText('recoveryAcwr',    readiness.hasData ? readiness.acwr.toFixed(2) : '--');
  setText('recoveryAcute',   readiness.hasData ? readiness.acute.toLocaleString() + ' AU' : '--');
  setText('recoveryChronic', readiness.hasData ? readiness.chronic.toLocaleString() + ' AU' : '--');

  renderStackedLoadChart(document.getElementById('loadTrendContainer'), load.lift, load.run);
}

// ---- Recovery score detail (score breakdown + RPE trend) -------------------
export function renderRecoveryScoreView(data, appState, days) {
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
  if (trendEl) renderRpeChart(trendEl, data.weekLabels, data.rpeData);
}

// ---- Stress balance detail (lift vs run load share + stacked chart) --------
export function renderStressBalanceView(data, appState, days) {
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
