// ==========================================
// ANALYTICS VIEW — RECOVERY (view-recovery.js)
// ------------------------------------------
// Renders the 'recovery-score' context (primary hero + load-trend context).
// ==========================================
import { computeRecoveryScore, computeWeeklyLoadSeries, computeReadiness } from '../../engine.js';
import { weeklyRpeSeries } from '../../metrics/metrics-load.js';
import { getProgramById } from '../../state.js';
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

// ---- Recovery score detail (score breakdown + RPE trend + drivers + load context) ----------
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

  _renderRecoveryDrivers(appState, days, r);
  _renderLoadContext(appState, days, activeProgram, maxWeek);
}

function _renderLoadContext(appState, days, activeProgram, maxWeek) {
  const section = document.getElementById('analytics-recovery-score');
  if (!section) return;

  let panel = section.querySelector('.recovery-load-context');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'recovery-load-context';
    section.appendChild(panel);
  }

  const load = computeWeeklyLoadSeries(appState, days, maxWeek);
  const totalByWeek = load.lift.map((v, i) => v + (load.run[i] || 0));
  const readiness = computeReadiness(totalByWeek, appState.currentWeek);

  if (!readiness.hasData) { panel.innerHTML = ''; return; }

  const acwr = readiness.acwr;
  const acwrColor = acwr > 1.3 ? '#ef4444' : acwr < 0.8 ? '#f59e0b' : '#10b981';
  const acwrLabel = acwr > 1.3 ? 'Overreaching' : acwr < 0.8 ? 'Underloading' : 'In range';
  const pctVsAvg = Math.round((acwr - 1) * 100);
  const contextNote = `Load is ${pctVsAvg >= 0 ? '+' : ''}${pctVsAvg}% vs your 4-week average (ACWR ${acwr.toFixed(2)}). Sweet spot: 0.8–1.3.`;

  panel.innerHTML = `
    <h2 class="section-header mt-2">Load Trend</h2>
    <article class="card-dark p-3 mb-4">
      <div class="grid-3-col gap-2 mb-3">
        <div class="flex-col flex-center">
          <div class="text-xs text-muted mb-1">ACWR</div>
          <div class="text-lg font-heavy" style="color:${acwrColor};">${acwr.toFixed(2)}</div>
          <div class="text-xs font-bold mt-1" style="color:${acwrColor};">${acwrLabel}</div>
        </div>
        <div class="flex-col flex-center">
          <div class="text-xs text-muted mb-1">This week</div>
          <div class="text-lg font-heavy text-inverse">${readiness.acute.toLocaleString()} AU</div>
        </div>
        <div class="flex-col flex-center">
          <div class="text-xs text-muted mb-1">4-week avg</div>
          <div class="text-lg font-heavy text-inverse">${readiness.chronic.toLocaleString()} AU</div>
        </div>
      </div>
      <div class="flex gap-3 mb-2 font-bold" style="font-size:0.65rem;">
        <span style="color:#3b82f6;">● Lifting</span>
        <span style="color:#ec4899;">● Running</span>
      </div>
      <div class="recovery-load-chart"></div>
      <div class="text-muted mt-2" style="font-size:0.62rem;">${escapeHtml(contextNote)}</div>
    </article>`;

  renderStackedLoadChart(panel.querySelector('.recovery-load-chart'), load.lift, load.run);
}

function _driverRow(label, impact, note, positive) {
  const color = positive ? '#10b981' : '#ef4444';
  const arrow = positive ? '▲' : '▼';
  return `<div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
    <div>
      <div class="text-sm font-bold text-inverse">${escapeHtml(label)}</div>
      <div class="text-xs text-muted">${escapeHtml(note)}</div>
    </div>
    <div class="font-heavy" style="color:${color};font-size:0.9rem;white-space:nowrap;margin-left:12px;">${arrow} ${escapeHtml(impact)}</div>
  </div>`;
}

function _neutralRow(label, note) {
  return `<div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
    <div>
      <div class="text-sm font-bold text-inverse">${escapeHtml(label)}</div>
      <div class="text-xs text-muted">${escapeHtml(note)}</div>
    </div>
    <div class="font-heavy text-muted" style="font-size:0.9rem;margin-left:12px;">— neutral</div>
  </div>`;
}

function _renderRecoveryDrivers(appState, days, r) {
  const section = document.getElementById('analytics-recovery-score');
  if (!section) return;

  let panel = section.querySelector('.recovery-drivers-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'recovery-drivers-panel';
    section.appendChild(panel);
  }

  const health    = appState.health;
  const healthLog = appState.healthLog || [];
  const rhrBaseline = computeBaseline(healthLog, 'restingHeartRate');
  const rows = [];

  // Training stress driver
  if (r.hasData) {
    const rpeGood = r.avgRpe < 7;
    rows.push(rpeGood
      ? _driverRow('Training Stress', '+' + r.fatigueScore + ' pts', `Avg RPE ${r.avgRpe.toFixed(1)} — manageable workload`, true)
      : _driverRow('Training Stress', '-' + (100 - r.fatigueScore) + ' pts', `Avg RPE ${r.avgRpe.toFixed(1)} — high accumulated fatigue`, false));
  }

  // Rest days driver
  if (r.hasData) {
    const restGood = r.restDays >= 2;
    rows.push(restGood
      ? _driverRow('Rest Days', '+' + r.restScore + ' pts', `${r.restDays} rest days this week`, true)
      : _driverRow('Rest Days', '-' + (100 - r.restScore) + ' pts', `${r.restDays} rest days — less than 2 recommended`, false));
  }

  // Sleep driver (from Health Connect)
  if (health?.sleepHours > 0) {
    const sh = health.sleepHours;
    const good = sh >= 7;
    rows.push(good
      ? _driverRow('Sleep Quality', sh >= 8 ? 'Strong +' : 'Positive', `${sh}h last night — within recovery window`, true)
      : _driverRow('Sleep Quality', sh < 6 ? 'High risk' : 'Negative', `${sh}h last night — below recovery threshold`, false));
  } else {
    rows.push(_neutralRow('Sleep Quality', 'Sync Health Connect to include sleep in drivers'));
  }

  // RHR driver (from Health Connect)
  if (health?.restingHeartRate > 0 && rhrBaseline.baseline !== null && rhrBaseline.pctDiff !== null) {
    const pct = rhrBaseline.pctDiff;
    rows.push(pct > 8
      ? _driverRow('Resting HR', `−${Math.min(20, Math.round(pct / 2))} pts`, `${health.restingHeartRate} bpm — ${pct}% above baseline`, false)
      : _driverRow('Resting HR', 'Neutral +', `${health.restingHeartRate} bpm — near baseline`, true));
  } else if (health?.restingHeartRate > 0) {
    rows.push(_neutralRow('Resting HR', 'Building baseline — need 3+ days of data'));
  } else {
    rows.push(_neutralRow('Resting HR', 'Sync Health Connect to include RHR in drivers'));
  }

  // Activity driver
  if (health?.steps > 0) {
    const steps = health.steps;
    const active = steps >= 5000 && steps <= 12000;
    rows.push(active
      ? _driverRow('Daily Activity', 'Positive', `${steps.toLocaleString()} steps — active recovery range`, true)
      : steps > 12000
      ? _driverRow('Daily Activity', 'Slight −', `${steps.toLocaleString()} steps — high non-training load`, false)
      : _neutralRow('Daily Activity', `${steps.toLocaleString()} steps — light day`));
  }

  if (!rows.length) {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = `
    <h2 class="section-header mt-2">Recovery Score Drivers</h2>
    <article class="card-dark p-3 mb-4">
      <div class="text-xs text-muted mb-3">Each driver shows its contribution to your recovery score. Address negatives first.</div>
      ${rows.join('')}
    </article>`;
}

