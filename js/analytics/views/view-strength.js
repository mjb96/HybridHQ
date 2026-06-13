// ==========================================
// ANALYTICS VIEW — STRENGTH (view-strength.js)
// ==========================================
import { isCompletedSet } from '../../engine.js';
import { getProgramById } from '../../state.js';
import { allLiftsStats, weeklyTonnageSeries, big3Progression } from '../../metrics/metrics-strength.js';
import { weeklyDistanceSeries } from '../../metrics/metrics-running.js';
import { setText } from '../utils.js';
import { renderVolumeChart, renderBig3ProgressionChart } from '../charts.js';
import { computeBaseline } from '../../health/healthBaselines.js';
import { escapeHtml } from '../../util.js';

function _renderStrengthHealthContext(section, health, healthLog) {
  let panel = section.querySelector('.strength-health-context');

  const rhr = health?.restingHeartRate || 0;
  const sleep = health?.sleepHours || 0;
  if (!sleep && !rhr) { if (panel) panel.remove(); return; }

  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'strength-health-context mb-3';
    section.insertBefore(panel, section.firstChild);
  }

  const rhrBaseline = computeBaseline(healthLog || [], 'restingHeartRate');
  const rhrPct = rhrBaseline.pctDiff;
  const rhrColor = rhr > 0 && rhrPct !== null && rhrPct > 10 ? '#ef4444'
    : rhr > 0 && rhrPct !== null && rhrPct > 5 ? '#f59e0b' : '#10b981';
  const sleepColor = sleep < 6 ? '#ef4444' : sleep < 7 ? '#f59e0b' : '#10b981';

  let note = '';
  if (sleep > 0 && sleep < 6) {
    note = 'Short sleep may blunt strength output and increase injury risk. Focus on technique over max loads today.';
  } else if (rhr > 0 && rhrPct !== null && rhrPct > 10) {
    note = `RHR is ${rhrPct}% above baseline — nervous system may still be recovering. Avoid pushing to true 1RM today.`;
  } else if (sleep >= 8 && (!rhr || (rhrPct !== null && rhrPct <= 5))) {
    note = 'Good recovery signals. Conditions are favourable for a performance session.';
  }

  panel.innerHTML = `
    <div class="grid-2-col gap-2 mb-2">
      ${sleep > 0 ? `<article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb,${sleepColor} 25%,transparent);">
        <div class="text-xs text-muted mb-1">Sleep</div>
        <div class="font-heavy" style="color:${sleepColor};">${sleep}h</div>
        <div class="text-xs mt-1" style="color:${sleepColor};">${sleep >= 8 ? 'Excellent' : sleep >= 7 ? 'Good' : sleep >= 6 ? 'Fair' : 'Poor'}</div>
      </article>` : ''}
      ${rhr > 0 ? `<article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb,${rhrColor} 25%,transparent);">
        <div class="text-xs text-muted mb-1">Resting HR</div>
        <div class="font-heavy" style="color:${rhrColor};">${rhr} bpm</div>
        <div class="text-xs mt-1" style="color:${rhrColor};">${rhrPct !== null ? (rhrPct > 0 ? '+' + rhrPct + '% vs avg' : rhrPct + '% vs avg') : 'Building baseline'}</div>
      </article>` : ''}
    </div>
    ${note ? `<article class="card-dark p-2 mb-2" style="border-left:3px solid var(--color-amber);">
      <div class="text-xs text-muted" style="line-height:1.4;">${escapeHtml(note)}</div>
    </article>` : ''}`;
}

// ---- Strength overview (totals + volume chart + 1RM list) -----------------
export function renderStrengthView(appState, days) {
  const section = document.getElementById('analytics-strength');
  if (section) _renderStrengthHealthContext(section, appState.health, appState.healthLog);

  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek  = activeProgram?.totalWeeks || 12;
  const weekLabels = Array.from({ length: maxWeek }, (_, i) => 'W' + (i + 1));
  const volData  = weeklyTonnageSeries(appState, days, maxWeek);
  const runData  = weeklyDistanceSeries(appState, days, maxWeek);

  const totalVol   = volData.reduce((a, b) => a + b, 0);
  const peakVol    = Math.max(...volData, 0);
  const gymStats   = _computeGymAllTimeStats(appState, days);

  setText('allTimeTotalVol',  Math.round(totalVol).toLocaleString() + ' kg');
  setText('allTimeTotalSets', gymStats.totalSets.toLocaleString());
  setText('analyticsPeakVol', peakVol.toLocaleString() + ' kg peak');

  const gymHrEl   = document.getElementById('allTimeGymHr');
  const gymCalsEl = document.getElementById('allTimeGymCals');
  if (gymHrEl)   gymHrEl.textContent   = gymStats.avgGymHr > 0 ? Math.round(gymStats.avgGymHr) + ' bpm' : '-- bpm';
  if (gymCalsEl) gymCalsEl.textContent = Math.round(gymStats.totalGymCals).toLocaleString();

  renderVolumeChart(document.getElementById('volumeChartContainer'), weekLabels, volData, runData);

  const rmContainer = document.getElementById('allLiftsRmContainer');
  if (rmContainer) _render1RMList(rmContainer, allLiftsStats(appState, days));
}

// ---- Strength PR detail (1RM list + big-3 progression chart) ---------------
export function renderStrengthPrView(appState, days) {
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek    = activeProgram?.totalWeeks || 12;
  const weekLabels = Array.from({ length: maxWeek }, (_, i) => 'W' + (i + 1));

  const prContainer = document.getElementById('allLiftsRmContainer_PR');
  if (prContainer) _render1RMList(prContainer, allLiftsStats(appState, days));

  const big3El = document.getElementById('big3ProgressionContainer');
  if (big3El) renderBig3ProgressionChart(big3El, big3Progression(appState), weekLabels);
}

// ---- Weekly volume detail (current-week breakdown + volume chart) ----------
export function renderWeeklyVolumeView(appState, days) {
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek    = activeProgram?.totalWeeks || 12;
  const weekLabels = Array.from({ length: maxWeek }, (_, i) => 'W' + (i + 1));
  const volData    = weeklyTonnageSeries(appState, days, maxWeek);
  const runData    = weeklyDistanceSeries(appState, days, maxWeek);

  const wk       = appState.currentWeek || '1';
  const weekData  = appState.weeks?.[wk];
  let totalSets = 0, totalReps = 0, totalVol = 0;
  if (weekData) {
    days.forEach(d => {
      const dayLifts = weekData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (Array.isArray(dayLifts[lift])) {
          dayLifts[lift].forEach(s => {
            if (isCompletedSet(s)) {
              const w = parseFloat(s.w) || 0;
              const r = parseInt(s.r, 10) || 0;
              totalVol  += w * r;
              totalSets += 1;
              totalReps += r;
            }
          });
        }
      }
    });
  }

  const setsEl    = document.getElementById('weekVolTotalSets');
  const repsEl    = document.getElementById('weekVolTotalReps');
  const tonnageEl = document.getElementById('weekVolTonnage');
  if (setsEl)    setsEl.textContent    = totalSets.toLocaleString();
  if (repsEl)    repsEl.textContent    = totalReps.toLocaleString();
  if (tonnageEl) tonnageEl.textContent = totalVol >= 1000
    ? `${(totalVol / 1000).toFixed(2)}t`
    : `${Math.round(totalVol).toLocaleString()} kg`;

  const chartEl = document.getElementById('weekVolChartContainer');
  if (chartEl) renderVolumeChart(chartEl, weekLabels, volData, runData);
}

// ---- Private: gym all-time totals (sets, avg HR, cals) --------------------
function _computeGymAllTimeStats(appState, days) {
  let totalSets = 0, gymHrSum = 0, gymHrCount = 0, gymCals = 0;
  Object.values(appState.weeks || {}).forEach(wkData => {
    if (!wkData) return;
    days.forEach(d => {
      const gym = wkData.gymStats?.[d] || {};
      if (gym.avgHR) { gymHrSum += parseFloat(gym.avgHR); gymHrCount++; }
      if (gym.cals)  gymCals += parseFloat(gym.cals);
      const dayLifts = wkData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (Array.isArray(dayLifts[lift])) {
          dayLifts[lift].forEach(s => { if (isCompletedSet(s)) totalSets++; });
        }
      }
    });
  });
  return { totalSets, avgGymHr: gymHrCount ? gymHrSum / gymHrCount : 0, totalGymCals: gymCals };
}

// ---- Private: 1RM list with PR badges and week-over-week deltas ------------
function _render1RMList(container, liftStats) {
  const entries = Object.entries(liftStats)
    .filter(([, v]) => v.allTimeMax > 0)
    .sort(([, a], [, b]) => b.allTimeMax - a.allTimeMax);

  if (entries.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Complete sets to populate lift PRs.</p>';
    return;
  }

  const prCount = entries.filter(([, v]) => {
    const cur = v.currentWeekMax || 0;
    return cur > 0 && Math.abs(cur - v.allTimeMax) < 0.5;
  }).length;

  const maxAllTime = entries[0][1].allTimeMax;
  const rows = entries.map(([name, s]) => {
    const pct  = Math.min(100, Math.max(5, Math.round((s.allTimeMax / maxAllTime) * 100)));
    const cur  = s.currentWeekMax || 0;
    const prev = s.prevWeekMax || 0;
    const isCurrentWeekPR = cur > 0 && Math.abs(cur - s.allTimeMax) < 0.5;

    const badge = isCurrentWeekPR
      ? `<span style="font-size:0.7rem;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981;border-radius:4px;padding:2px 6px;margin-left:6px;">PR</span>`
      : '';

    let deltaHtml = '';
    if (cur > 0 && prev > 0) {
      const delta = cur - prev;
      const sign  = delta >= 0 ? '+' : '';
      const col   = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : 'var(--text-muted)';
      deltaHtml = `<span style="font-size:0.72rem;color:${col};margin-left:6px;">${sign}${Math.round(delta)} kg vs last wk</span>`;
    } else if (cur > 0) {
      deltaHtml = `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">This week: ~${Math.round(cur)} kg</span>`;
    }

    return `<div class="mb-4">
      <div class="flex-between font-bold mb-1">
        <span class="text-inverse text-sm">${name}${badge}</span>
        <span style="color:#3b82f6;" class="text-base">${Math.round(s.allTimeMax)} kg</span>
      </div>
      ${deltaHtml ? `<div class="mb-2">${deltaHtml}</div>` : ''}
      <div class="trend-track-bg" style="height:10px;border-radius:5px;">
        <div class="trend-track-fill" style="width:${pct}%;background:#3b82f6;border-radius:5px;"></div>
      </div>
    </div>`;
  }).join('');

  const summaryBar = prCount > 0
    ? `<div class="flex-between mb-4 p-3 card-dark" style="border:1px solid rgba(16,185,129,0.3);">
        <span class="text-sm text-muted">PRs set this week</span>
        <span class="font-heavy" style="color:#10b981;">${prCount} lift${prCount !== 1 ? 's' : ''} 🏆</span>
       </div>`
    : '';

  container.innerHTML = summaryBar + rows;
}
