// ==========================================
// ANALYTICS VIEW — STRENGTH (view-strength.js)
// ------------------------------------------
// Renders the 'strength', 'strength_pr', and 'weekly-volume' analytics
// contexts. Pure DOM writers: all state is resolved by the caller and passed
// as arguments, so these functions have no module-level closures.
// ==========================================
import { computeBig3Progression, isCompletedSet } from '../../engine.js';
import { setText } from '../utils.js';
import { renderVolumeChart, renderBig3ProgressionChart } from '../charts.js';

// ---- Strength overview (totals + volume chart + 1RM list) -----------------
export function renderStrengthView(data, appState, days) {
  setText('allTimeTotalVol', Math.round(data.globalTotalVol).toLocaleString() + ' kg');
  setText('allTimeTotalSets', data.globalTotalSets.toLocaleString());
  setText('analyticsPeakVol', data.absoluteMesoPeakVol.toLocaleString() + ' kg peak');

  const gymHrEl  = document.getElementById('allTimeGymHr');
  const gymCalsEl = document.getElementById('allTimeGymCals');
  if (gymHrEl)  gymHrEl.textContent  = data.globalAvgGymHr > 0 ? Math.round(data.globalAvgGymHr) + ' bpm' : '-- bpm';
  if (gymCalsEl) gymCalsEl.textContent = Math.round(data.globalTotalGymCals).toLocaleString();

  renderVolumeChart(document.getElementById('volumeChartContainer'), data.weekLabels, data.volData, data.runData);

  const rmContainer = document.getElementById('allLiftsRmContainer');
  if (rmContainer) _render1RMList(rmContainer, data.dynamicStats);
}

// ---- Strength PR detail (1RM list + big-3 progression chart) ---------------
export function renderStrengthPrView(data, appState) {
  const prContainer = document.getElementById('allLiftsRmContainer_PR');
  if (prContainer) _render1RMList(prContainer, data.dynamicStats);

  const big3El = document.getElementById('big3ProgressionContainer');
  if (big3El) renderBig3ProgressionChart(big3El, computeBig3Progression(appState), data.weekLabels);
}

// ---- Weekly volume detail (current-week breakdown + volume chart) ----------
export function renderWeeklyVolumeView(data, appState, days) {
  const wk      = appState.currentWeek || '1';
  const weekData = appState.weeks?.[wk];

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
  if (chartEl) renderVolumeChart(chartEl, data.weekLabels || [], data.volData || [], data.runData || []);
}

// ---- Private: 1RM list with PR badges and week-over-week deltas ------------
function _render1RMList(container, dynamicStats) {
  const entries = Object.entries(dynamicStats)
    .filter(([, v]) => v.allTimeMax > 0)
    .sort(([, a], [, b]) => b.allTimeMax - a.allTimeMax);

  if (entries.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Complete sets to populate lift PRs.</p>';
    return;
  }

  const prCount = entries.filter(([, v]) => {
    const cur = v.currentEstimatedMax || 0;
    return cur > 0 && Math.abs(cur - v.allTimeMax) < 0.5;
  }).length;

  const maxAllTime = entries[0][1].allTimeMax;
  const rows = entries.map(([name, statData]) => {
    const pct  = Math.min(100, Math.max(5, Math.round((statData.allTimeMax / maxAllTime) * 100)));
    const cur  = statData.currentEstimatedMax || 0;
    const prev = statData.previousWeekMax || 0;
    const isCurrentWeekPR = cur > 0 && Math.abs(cur - statData.allTimeMax) < 0.5;

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
        <span style="color:#3b82f6;" class="text-base">${Math.round(statData.allTimeMax)} kg</span>
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
