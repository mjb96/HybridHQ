// ==========================================
// PERFORMANCE MATRIX — analytics.js
// ==========================================
import { CONFIG, PROGRAMS } from './constants.js';
import { getProgramById, saveStateToLocalStorage } from './state.js';
import {
  computeBig3Progression,
  computeRecoveryScore, computeStreakView,
  computeWeeklyCaloriesSeries, computeWeeklyLoadSeries, computeWeeklyCompletionSeries,
  computeReadiness, computeGoalAdherence, computeDynamicMilestones,
  computeWeeklyHrSeries, computeWeeklyTrainingEffectSeries,
  epley1RM, isCompletedSet, paceSecondsPerKm, formatPace,
} from './engine.js';
import { getStreamFromDB } from './db.js';
import { generateInsights } from './brain/core.js';
import { renderContextBanner } from './brain/analytics_brain.js';
import { renderCoachDetail } from './brain/brain_dashboard.js';
import { rpeColour, paceZoneColour, setText } from './analytics/utils.js';
import {
  renderVolumeChart, renderRpeChart, renderBodyWeightChart,
  renderHrZonesChart, renderCadenceChart, renderBig3ProgressionChart,
  renderWeeklyBarChart, renderWeeklyLinesChart, renderXYChart,
  renderStackedLoadChart, renderCompletionVsTargetChart, renderStreamCharts,
} from './analytics/charts.js';

let _getState;
let _getDays;
let _analyticsContext = 'overview';

export function initAnalytics(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays = getDaysFn;
}

// Which analytics view to show on next render. Set by openAnalyticsView()
// before switching tabs (replaces the former analytics-context window global).
export function setAnalyticsContext(context) {
  _analyticsContext = context || 'overview';
}

// ==========================================
// LOCAL STATE MUTATORS (Event Targets)
// ==========================================
export function saveThresholdPace(val) {
  if (!_getState) return;
  const appState = _getState();
  appState.thresholdPaceSeconds = parseInt(val, 10) || 0;
  saveStateToLocalStorage(true);
  renderAnalytics(); 
}

export function logBodyWeight() {
  if (!_getState) return;
  const input = document.getElementById('analyticsBwInput');
  if (!input || !input.value) return;

  const appState = _getState();
  const weight = parseFloat(input.value);
  if (isNaN(weight)) return;

  if (!appState.bodyWeightLog) appState.bodyWeightLog = [];
  
  const today = new Date().toISOString().slice(0, 10);
  const existingIdx = appState.bodyWeightLog.findIndex(l => l.date === today);
  if (existingIdx >= 0) {
    appState.bodyWeightLog[existingIdx].weight = weight;
  } else {
    appState.bodyWeightLog.push({ date: today, weight: weight });
  }

  saveStateToLocalStorage(true);
  input.value = '';
  renderAnalytics();
}

function collectAnalyticsData() {
  const appState = _getState();
  const DEFAULT_DAYS = _getDays();
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;

  const data = {
    dynamicStats: {},
    weekLabels: [],
    volData: [],
    runData: [],
    rpeData: [],
    paceData: [],
    
    cadenceData: [],
    teData: [],
    gymHrData: [],
    gymCalsData: [],
    hrZonesData: [], 
    
    globalTotalDist: 0,
    globalTotalElev: 0,
    globalTotalCals: 0,
    globalTotalSets: 0,
    globalTotalVol: 0,
    absoluteMesoPeakVol: 0,
    
    globalTotalGymCals: 0,
    globalAvgGymHr: 0,

    thresholdSecs: appState.thresholdPaceSeconds || null,
    bodyWeightLog: appState.bodyWeightLog || []
  };

  if (appState.weeks) {
    Object.keys(appState.weeks).forEach(wKey => {
      const wkData = appState.weeks[wKey];
      if (!wkData || !wkData.lifts) return;

      DEFAULT_DAYS.forEach(d => {
        const dayLifts = wkData.lifts[d];
        if (!dayLifts) return;

        for (const lift in dayLifts) {
          if (!Array.isArray(dayLifts[lift])) continue;
          
          if (!data.dynamicStats[lift]) {
            data.dynamicStats[lift] = { allTimeMax: 0, currentEstimatedMax: 0, previousWeekMax: 0 };
          }

          const prevWeek = (parseInt(appState.currentWeek, 10) - 1).toString();

          dayLifts[lift].forEach(s => {
            const isCompleted = isCompletedSet(s);
            const weight = parseFloat(s.w) || 0;
            const reps = parseInt(s.r, 10) || 0;

            if (isCompleted && weight > 0 && reps > 0) {
              const e1rm = epley1RM(weight, reps);
              if (e1rm > data.dynamicStats[lift].allTimeMax) {
                 data.dynamicStats[lift].allTimeMax = e1rm;
              }
              if (wKey === appState.currentWeek && e1rm > data.dynamicStats[lift].currentEstimatedMax) {
                 data.dynamicStats[lift].currentEstimatedMax = e1rm;
              }
              if (wKey === prevWeek && e1rm > data.dynamicStats[lift].previousWeekMax) {
                 data.dynamicStats[lift].previousWeekMax = e1rm;
              }
            }
          });
        }
      });
    });
  }

  for (let w = 1; w <= maxWeek; w++) {
    const wKey = w.toString();
    data.weekLabels.push('W' + w);
    const wkData = appState.weeks?.[wKey];

    if (!wkData) {
      data.volData.push(0); data.runData.push(0); data.rpeData.push(0); data.paceData.push(0);
      data.cadenceData.push(0); data.teData.push(0); data.gymHrData.push(0); data.gymCalsData.push(0); data.hrZonesData.push([0,0,0,0,0]);
      continue;
    }

    let weekVol = 0, weekDist = 0, weekElev = 0, weekCals = 0;
    let weekRpeSum = 0, weekRpeCount = 0;
    let weekRunTime = 0, weekRunDist = 0;
    
    let weekCadenceSum = 0, weekCadenceCount = 0;
    let weekTeSum = 0, weekTeCount = 0;
    let weekGymHrSum = 0, weekGymHrCount = 0;
    let weekGymCals = 0;
    let weekHrZones = [0, 0, 0, 0, 0];

    DEFAULT_DAYS.forEach(d => {
      const run = wkData.runs?.[d] || {};
      const dist = parseFloat(run.dist) || 0;
      const elev = parseFloat(run.elev) || 0;
      const cals = parseFloat(run.cals) || 0;
      weekDist += dist; weekElev += elev; weekCals += cals;

      const paceS = paceSecondsPerKm(dist, run.time || '');
      if (paceS > 0 && dist > 0) { weekRunTime += paceS * dist; weekRunDist += dist; }

      const runRpe = parseFloat(run.rpe) || 0;
      if (runRpe > 0) { weekRpeSum += runRpe; weekRpeCount++; }

      if (run.avgCadence) { weekCadenceSum += parseFloat(run.avgCadence); weekCadenceCount++; }
      if (run.trainingEffect) { weekTeSum += parseFloat(run.trainingEffect); weekTeCount++; }
      if (run.hrZones && Array.isArray(run.hrZones)) {
        run.hrZones.forEach((z, i) => { if(i < 5) weekHrZones[i] += (parseFloat(z) || 0); });
      }

      const gymRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
      if (gymRpe > 0) { weekRpeSum += gymRpe; weekRpeCount++; }
      
      const gym = wkData.gymStats?.[d] || {};
      if (gym.avgHR) { weekGymHrSum += parseFloat(gym.avgHR); weekGymHrCount++; }
      if (gym.cals) { weekGymCals += parseFloat(gym.cals); weekCals += parseFloat(gym.cals); }

      const dayLifts = wkData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          const isCompleted = isCompletedSet(s);
          if (isCompleted) {
            weekVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
            data.globalTotalSets++;
          }
        });
      }
    });

    data.globalTotalDist += weekDist;
    data.globalTotalElev += weekElev;
    data.globalTotalCals += weekCals;
    data.globalTotalVol  += weekVol;
    if (weekVol > data.absoluteMesoPeakVol) data.absoluteMesoPeakVol = weekVol;

    data.volData.push(weekVol);
    data.runData.push(weekDist);
    data.rpeData.push(weekRpeCount > 0 ? weekRpeSum / weekRpeCount : 0);
    data.paceData.push(weekRunDist > 0 ? weekRunTime / weekRunDist : 0);
    
    data.cadenceData.push(weekCadenceCount > 0 ? weekCadenceSum / weekCadenceCount : 0);
    data.teData.push(weekTeCount > 0 ? weekTeSum / weekTeCount : 0);
    data.gymHrData.push(weekGymHrCount > 0 ? weekGymHrSum / weekGymHrCount : 0);
    data.gymCalsData.push(weekGymCals);
    data.hrZonesData.push(weekHrZones);
  }

  // Calculate Global Gym Metrics
  data.globalTotalGymCals = data.gymCalsData.reduce((a,b)=>a+b, 0);
  const validGymHr = data.gymHrData.filter(h=>h>0);
  data.globalAvgGymHr = validGymHr.length ? validGymHr.reduce((a,b)=>a+b, 0) / validGymHr.length : 0;

  return data;
}

// ==========================================
// SUB-RENDERERS
// ==========================================
function renderStrengthAnalytics(data) {
  setText('allTimeTotalVol', Math.round(data.globalTotalVol).toLocaleString() + ' kg');
  setText('allTimeTotalSets', data.globalTotalSets.toLocaleString());
  setText('analyticsPeakVol', data.absoluteMesoPeakVol.toLocaleString() + ' kg peak');
  
  // Inject the new Gym Metrics
  const gymHrEl = document.getElementById('allTimeGymHr');
  const gymCalsEl = document.getElementById('allTimeGymCals');
  if (gymHrEl) gymHrEl.textContent = data.globalAvgGymHr > 0 ? Math.round(data.globalAvgGymHr) + ' bpm' : '-- bpm';
  if (gymCalsEl) gymCalsEl.textContent = Math.round(data.globalTotalGymCals).toLocaleString();

  renderVolumeChart(document.getElementById('volumeChartContainer'), data.weekLabels, data.volData, data.runData);
  
  const rmContainer = document.getElementById('allLiftsRmContainer');
  if (rmContainer) render1RMList(rmContainer, data.dynamicStats);
}

// Find the most recent (highest week, then latest weekday) run flagged
// hasStreams, then load + render its streams from IndexedDB. Async, mirrors
// the home mini-map pattern: fire-and-forget after the synchronous render.
function loadAndRenderLatestRunStream() {
  const appState = _getState();
  const DEFAULT_DAYS = _getDays();
  const weekKeys = Object.keys(appState.weeks || {}).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
  for (const wkNum of weekKeys) {
    const wkData = appState.weeks[String(wkNum)];
    if (!wkData?.runs) continue;
    for (let i = DEFAULT_DAYS.length - 1; i >= 0; i--) {
      const day = DEFAULT_DAYS[i];
      if (wkData.runs[day]?.hasStreams) {
        getStreamFromDB(wkNum, day, 'run')
          .then(stream => renderStreamCharts(stream))
          .catch(() => renderStreamCharts(null));
        return;
      }
    }
  }
  renderStreamCharts(null); // nothing with streams yet
}

function renderRunningAnalytics(data) {
  setText('allTimeRunDist', data.globalTotalDist.toFixed(1) + ' km');
  setText('allTimeRunElev', Math.round(data.globalTotalElev) + ' m');
  setText('allTimeRunCals', Math.round(data.globalTotalCals).toLocaleString());

  const thresholdInput = document.getElementById('analyticsThresholdPaceInput');
  if (thresholdInput && data.thresholdSecs && !thresholdInput.value) {
    thresholdInput.value = data.thresholdSecs;
  }

  const paceContainer = document.getElementById('paceTrendContainer');
  if (paceContainer) {
    const paceRows = data.weekLabels.map((lbl, i) => {
      if (data.paceData[i] <= 0) return '';
      const colour = paceZoneColour(data.paceData[i], data.thresholdSecs);
      return `<div class="flex-between py-2 border-b-glass text-base">
          <span class="text-inverse font-bold">${lbl}</span>
          <span class="font-heavy" style="color:${colour};font-variant-numeric:tabular-nums;">${formatPace(data.paceData[i])}</span>
         </div>`;
    }).filter(Boolean);

    paceContainer.innerHTML = paceRows.length
      ? paceRows.join('')
      : '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Log runs with time to see pace trends.</p>';
  }

  // Inject the new Garmin Charts
  renderHrZonesChart(document.getElementById('hrZonesChartContainer'), data.weekLabels, data.hrZonesData);
  renderCadenceChart(document.getElementById('cadenceChartContainer'), data.weekLabels, data.cadenceData);

  // Weekly HR trend (avg + max) and training-effect trend — fill from manual
  // entry and .fit alike, so the view isn't barren without stream data.
  const appState = _getState();
  const days = _getDays();
  const maxWeek = data.weekLabels.length;
  const hr = computeWeeklyHrSeries(appState, days, maxWeek);
  renderWeeklyLinesChart(document.getElementById('runHrTrendContainer'), data.weekLabels, [
    { values: hr.avgHr, color: '#22d3ee', label: 'Avg HR' },
    { values: hr.maxHr, color: '#ef4444', label: 'Max HR' },
  ], { yFmt: v => `${Math.round(v)}`, emptyMsg: 'Log runs with HR (or import .FIT) to see HR trends.' });

  const te = computeWeeklyTrainingEffectSeries(appState, days, maxWeek);
  renderWeeklyLinesChart(document.getElementById('runTeTrendContainer'), data.weekLabels, [
    { values: te, color: '#a78bfa', label: 'Training Effect' },
  ], { yFmt: v => v.toFixed(1), emptyMsg: 'Import .FIT runs to see training-effect trends.' });

  renderLatestRunSplits();

  // Per-run streams (async — renders when IndexedDB resolves).
  loadAndRenderLatestRunStream();
}

// Render the lap splits of the most recent run that has them (splits are stored
// on the synced run object by the .fit import).
function renderLatestRunSplits() {
  const el = document.getElementById('analyticsRunSplitsContainer');
  if (!el) return;
  const appState = _getState();
  const days = _getDays();
  const weekKeys = Object.keys(appState.weeks || {}).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
  let splits = null;
  for (const wk of weekKeys) {
    const runs = appState.weeks[String(wk)]?.runs;
    if (!runs) continue;
    for (let i = days.length - 1; i >= 0; i--) {
      const s = runs[days[i]]?.splits;
      if (Array.isArray(s) && s.length > 0) { splits = s; break; }
    }
    if (splits) break;
  }
  if (!splits) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.75rem;">Import a .FIT run to see lap splits.</p>';
    return;
  }
  const rows = splits.map((sp, i) => {
    const dist = sp.distance != null ? `${(parseFloat(sp.distance)).toFixed(2)} km` : '--';
    const tSec = parseFloat(sp.time || sp.duration || 0);
    const pace = (parseFloat(sp.distance) > 0 && tSec > 0)
      ? (() => { const p = tSec / parseFloat(sp.distance); const m = Math.floor(p / 60), s = Math.round(p % 60).toString().padStart(2, '0'); return `${m}:${s}/km`; })()
      : '--';
    const hr = sp.avgHR != null ? `${Math.round(parseFloat(sp.avgHR))} bpm` : (sp.heart_rate != null ? `${Math.round(parseFloat(sp.heart_rate))} bpm` : '--');
    return `<div class="flex-between py-1 border-b-glass" style="font-size:0.75rem;">
      <span class="text-muted">Lap ${i + 1}</span>
      <span class="text-inverse">${dist}</span>
      <span class="font-bold text-inverse" style="font-variant-numeric:tabular-nums;">${pace}</span>
      <span class="text-muted">${hr}</span>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="flex-between py-1" style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">
      <span>Lap</span><span>Dist</span><span>Pace</span><span>HR</span></div>${rows}`;
}

function renderRecoveryAnalytics(data) {
  const appState    = _getState();
  const defaultDays = _getDays();
  const wk          = appState.currentWeek || '1';
  const weekData    = appState.weeks?.[wk];

  let totalRpe = 0, rpeCount = 0;
  if (weekData) {
    defaultDays.forEach(d => {
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
      statusLabel     = 'Fresh';
      statusColor     = '#10b981';
      interpretation  = 'Low fatigue this week. Good time to push intensity.';
    } else if (avgRpe < 8) {
      statusLabel     = 'Accumulating';
      statusColor     = '#f59e0b';
      interpretation  = 'Moderate fatigue. Stick to planned volume and prioritise sleep.';
    } else {
      statusLabel     = 'High Load';
      statusColor     = '#ef4444';
      interpretation  = 'High fatigue this week. Consider reducing volume or taking a rest day.';
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

  // Load / readiness (ACWR) — the signal behind the Readiness tile.
  // (appState and defaultDays are already declared at the top of this function.)
  const maxWeek = data.weekLabels.length;
  const load = computeWeeklyLoadSeries(appState, defaultDays, maxWeek);
  const totalByWeek = load.lift.map((v, i) => v + (load.run[i] || 0));
  const readiness = computeReadiness(totalByWeek, appState.currentWeek);

  setText('recoveryAcwr', readiness.hasData ? readiness.acwr.toFixed(2) : '--');
  setText('recoveryAcute', readiness.hasData ? readiness.acute.toLocaleString() + ' AU' : '--');
  setText('recoveryChronic', readiness.hasData ? readiness.chronic.toLocaleString() + ' AU' : '--');

  renderStackedLoadChart(document.getElementById('loadTrendContainer'), load.lift, load.run);
}

function renderBodyWeightAnalytics(data) {
  const bwContainer = document.getElementById('bwChartContainer');
  renderBodyWeightChart(bwContainer, data.bodyWeightLog);
}

function renderProgressAnalytics(data) {
  const tbody = document.getElementById('analyticsTimelineTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    const currentWeekStr = _getState().currentWeek;
    data.weekLabels.forEach((lbl, i) => {
      const wKey = (i + 1).toString();
      const isActive = wKey === currentWeekStr;
      const avgPace = data.paceData[i] > 0 ? formatPace(data.paceData[i]) : '--';
      const avgRpe  = data.rpeData[i]  > 0 ? data.rpeData[i].toFixed(1) : '--';
      const rpeStyle = data.rpeData[i] > 0 ? `color:${rpeColour(data.rpeData[i])};font-weight:700;` : '';
      const paceColour = data.paceData[i] > 0 ? paceZoneColour(data.paceData[i], data.thresholdSecs) : '#ffffff';
      
      const tr = document.createElement('tr');
      if (isActive) tr.style.background = 'rgba(59,130,246,0.1)'; 
      
      tr.innerHTML =
        `<td class="py-2"><strong style="${isActive ? 'color:#3b82f6;' : 'color:#fff;'}">${lbl}</strong></td>` +
        `<td class="py-2" style="color:#fff;">${data.volData[i] > 0 ? data.volData[i].toLocaleString() + ' kg' : '--'}</td>` +
        `<td class="py-2" style="color:#fff;">${data.runData[i] > 0 ? data.runData[i].toFixed(1) + ' km' : '--'}</td>` +
        `<td class="py-2" style="color:${paceColour};font-variant-numeric:tabular-nums;">${avgPace}</td>` +
        `<td class="py-2" style="${rpeStyle}">${avgRpe}</td>`;
      tbody.appendChild(tr);
    });
  }
}

function render1RMList(container, dynamicStats) {
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
    const pct   = Math.min(100, Math.max(5, Math.round((statData.allTimeMax / maxAllTime) * 100)));
    const cur   = statData.currentEstimatedMax || 0;
    const prev  = statData.previousWeekMax || 0;
    const isCurrentWeekPR = cur > 0 && Math.abs(cur - statData.allTimeMax) < 0.5;

    const badge = isCurrentWeekPR
      ? `<span style="font-size:0.7rem;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981;border-radius:4px;padding:2px 6px;margin-left:6px;">PR</span>`
      : '';

    let deltaHtml = '';
    if (cur > 0 && prev > 0) {
      const delta = cur - prev;
      const sign  = delta >= 0 ? '+' : '';
      const col   = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : 'var(--text-muted)';
      deltaHtml   = `<span style="font-size:0.72rem;color:${col};margin-left:6px;">${sign}${Math.round(delta)} kg vs last wk</span>`;
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

// ==========================================
// MASTER ROUTER (PHASE 7)
// ==========================================
export function renderAnalytics() {
  if (!_getState || !_getDays) return;

  const data = collectAnalyticsData();
  const context = _analyticsContext || 'overview';

  // Compute the Brain report once per render; the per-section banner reuses it.
  let _brainReport = null;
  try {
    const appState = _getState();
    const program = getProgramById(appState.activeProgramId);
    _brainReport = generateInsights(appState, {
      days: _getDays(), program,
      currentWeek: appState.currentWeek, maxWeek: program?.totalWeeks,
    });
  } catch (e) { _brainReport = null; }

  document.querySelectorAll('.analytics-section').forEach(sec => sec.classList.remove('active'));

  switch(context) {
    case 'strength':
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data);
      break;
    case 'strength_pr':
      document.getElementById('analytics-strength_pr').classList.add('active');
      const prContainer = document.getElementById('allLiftsRmContainer_PR');
      if (prContainer) render1RMList(prContainer, data.dynamicStats);
      const big3El = document.getElementById('big3ProgressionContainer');
      if (big3El) renderBig3ProgressionChart(big3El, computeBig3Progression(_getState()), data.weekLabels);
      break;
    case 'running':
      document.getElementById('analytics-running').classList.add('active');
      renderRunningAnalytics(data);
      break;
    case 'recovery':
      document.getElementById('analytics-recovery').classList.add('active');
      renderRecoveryAnalytics(data);
      break;
    case 'recovery-score':
      document.getElementById('analytics-recovery-score').classList.add('active');
      renderRecoveryScoreDetail(data);
      break;
    case 'bodyweight':
      document.getElementById('analytics-bodyweight').classList.add('active');
      renderBodyWeightAnalytics(data);
      break;
    case 'progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressAnalytics(data);
      break;
    case 'weekly-volume':
      document.getElementById('analytics-weekly-volume').classList.add('active');
      renderWeeklyVolumeDetail(data);
      break;
    case 'streak':
      document.getElementById('analytics-streak').classList.add('active');
      renderStreakDetail(data);
      break;
    case 'active-fuel':
      document.getElementById('analytics-active-fuel').classList.add('active');
      renderActiveFuelDetail(data);
      break;
    case 'stress-balance':
      document.getElementById('analytics-stress-balance').classList.add('active');
      renderStressBalanceDetail(data);
      break;
    case 'goal-progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressAnalytics(data);
      renderGoalProgressDetail(data);
      break;
    case 'coach':
      document.getElementById('analytics-coach').classList.add('active');
      if (_brainReport) renderCoachDetail(_brainReport);
      break;
    default:
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data);
  }

  if (_brainReport) {
    try { renderContextBanner(context, _brainReport); }
    catch (e) { console.warn('[hybrid-brain] context banner skipped:', e); }
  }
}

function renderRecoveryScoreDetail(data) {
  const appState = _getState();
  const defaultDays = _getDays();
  const r = computeRecoveryScore(appState, defaultDays);

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
  if (restDEl) restDEl.textContent = r.hasData ? `${r.restDays} / ${defaultDays.length}` : '--';
  if (recEl)   recEl.textContent   = r.recommendation;

  const trendEl = document.getElementById('rpeTrendContainerDetail');
  if (trendEl) renderRpeChart(trendEl, data.weekLabels, data.rpeData);
}

function renderWeeklyVolumeDetail(data) {
  const appState = _getState();
  const defaultDays = _getDays();
  const wk = appState.currentWeek || '1';
  const weekData = appState.weeks?.[wk];

  let totalSets = 0, totalReps = 0, totalVol = 0;
  if (weekData) {
    defaultDays.forEach(d => {
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
  if (chartEl) {
    renderVolumeChart(
      chartEl,
      data.weekLabels || [],
      data.volData || [],
      data.runData || []
    );
  }
}

function renderStreakDetail(data) {
  const appState = _getState();
  const sv = computeStreakView(appState.streakData);

  const currentEl = document.getElementById('streakCurrent');
  const longestEl = document.getElementById('streakLongest');
  const detailEl  = document.getElementById('streakDetailContainer');

  if (currentEl) currentEl.textContent = `${sv.current} day${sv.current !== 1 ? 's' : ''}`;
  if (longestEl) longestEl.textContent = `${sv.longest} day${sv.longest !== 1 ? 's' : ''}`;

  if (!detailEl) return;

  if (!sv.hasData) {
    detailEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.75rem;">Complete a workout or log a run to start your streak. Each calendar day with logged activity keeps it alive.</p>';
    return;
  }

  const msg = sv.broken
    ? 'Your streak lapsed — log today to start a fresh one.'
    : sv.current >= 7
    ? `🔥 ${sv.current}-day streak! Momentum is everything.`
    : sv.current >= 3
    ? `💪 ${sv.current} days in a row. Keep it going!`
    : `${sv.current} day streak. Every day counts.`;

  const lastNice = sv.lastActivityDate
    ? new Date(sv.lastActivityDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '--';

  detailEl.innerHTML = `
    <div class="card-dark p-3 mb-3" style="border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">
      <div class="font-heavy text-inverse" style="font-size:1rem;">${msg}</div>
    </div>
    <div class="flex-between mb-2" style="font-size:0.8rem;">
      <span class="text-muted">Current streak</span>
      <span class="font-heavy text-inverse">${sv.current} day${sv.current !== 1 ? 's' : ''}</span>
    </div>
    <div class="flex-between mb-2" style="font-size:0.8rem;">
      <span class="text-muted">Personal best streak</span>
      <span class="font-heavy text-inverse">${sv.longest} day${sv.longest !== 1 ? 's' : ''}</span>
    </div>
    <div class="flex-between" style="font-size:0.8rem;">
      <span class="text-muted">Last active day</span>
      <span class="font-heavy text-inverse">${lastNice}</span>
    </div>
  `;
}

function renderGoalProgressDetail(data) {
  const appState = _getState();
  const activeProgram = getProgramById(appState.activeProgramId);

  const wk    = parseInt(appState.currentWeek, 10) || 1;
  const total = activeProgram.totalWeeks || 12;
  const calendarPct = Math.round((wk / total) * 100);

  const goalEl = document.getElementById('analytics-goal-detail');
  if (!goalEl) return;

  // Real adherence: of everything scheduled through this week, how much is done.
  const adherence = computeGoalAdherence(appState, activeProgram, _getDays(), wk);
  const remaining = Math.max(0, total - wk);

  const milestones = computeDynamicMilestones(total);
  const nextMilestone = milestones.find(m => m.week >= wk) || milestones[milestones.length - 1];

  goalEl.innerHTML = `
    <h2 class="section-header mt-4">Program Goal Progress</h2>
    <article class="card-dark p-4 mb-4">
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">Adherence (work done so far)</span>
        <span class="font-heavy text-inverse" style="font-size:1.1rem;">${adherence.pct}%</span>
      </div>
      <div style="height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;margin-bottom:6px;">
        <div style="height:100%;width:${adherence.pct}%;background:linear-gradient(90deg,var(--color-green,#10b981),var(--color-blue));border-radius:4px;transition:width 0.5s var(--ease-out);"></div>
      </div>
      <div class="text-muted mb-3" style="font-size:0.65rem;">${adherence.done} of ${adherence.total} scheduled items completed through week ${wk}.</div>

      <div class="flex-between mb-2" style="font-size:0.8rem;">
        <span class="text-muted">Calendar position</span>
        <span class="font-heavy text-inverse">Wk ${wk} / ${total} (${calendarPct}%)</span>
      </div>
      <div class="flex-between mb-2" style="font-size:0.8rem;">
        <span class="text-muted">Weeks remaining</span>
        <span class="font-heavy text-inverse">${remaining}</span>
      </div>
      <div class="flex-between" style="font-size:0.8rem;">
        <span class="text-muted">Next milestone</span>
        <span class="font-heavy text-accent-blue">Wk ${nextMilestone.week} — ${nextMilestone.label}</span>
      </div>
    </article>
    <h2 class="section-header mt-2">Weekly Completion vs Target</h2>
    <article class="card-dark p-3 mb-4">
      <div class="flex gap-3 mb-2 font-bold" style="font-size:0.65rem;">
        <span style="color:#3b82f6;">● Actual completion</span>
        <span style="color:rgba(255,255,255,0.5);">● 100% target</span>
      </div>
      <div id="goalCompletionChartContainer"></div>
    </article>
  `;

  const chartEl = document.getElementById('goalCompletionChartContainer');
  if (chartEl) {
    const series = computeWeeklyCompletionSeries(appState, activeProgram, _getDays(), total);
    renderCompletionVsTargetChart(chartEl, series, wk);
  }
}

// ---- ACTIVE FUEL detail: weekly calories trend ----------------------------
function renderActiveFuelDetail(data) {
  const appState = _getState();
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;
  const series = computeWeeklyCaloriesSeries(appState, _getDays(), maxWeek);

  const total = series.reduce((a, b) => a + b, 0);
  const active = series.filter(v => v > 0);
  const avg = active.length ? Math.round(total / active.length) : 0;

  setText('fuelTotalCals', total.toLocaleString());
  setText('fuelAvgCals', avg.toLocaleString());
  const wk = parseInt(appState.currentWeek, 10) || 1;
  setText('fuelThisWeekCals', (series[wk - 1] || 0).toLocaleString());

  const chartEl = document.getElementById('fuelChartContainer');
  if (chartEl) {
    const labels = series.map((_, i) => `W${i + 1}`);
    renderWeeklyBarChart(chartEl, labels, series, {
      color: '#f59e0b',
      yFmt: v => Math.round(v).toLocaleString(),
      emptyMsg: 'Log sessions with calories (or import .FIT) to see your fuel trend.',
    });
  }
}

// ---- STRESS BALANCE detail: weekly lift-vs-run load -----------------------
function renderStressBalanceDetail(data) {
  const appState = _getState();
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;
  const { lift, run } = computeWeeklyLoadSeries(appState, _getDays(), maxWeek);

  const liftTotal = lift.reduce((a, b) => a + b, 0);
  const runTotal = run.reduce((a, b) => a + b, 0);
  const grand = liftTotal + runTotal;
  const liftPct = grand > 0 ? Math.round((liftTotal / grand) * 100) : 0;

  setText('stressLiftShare', `${liftPct}%`);
  setText('stressRunShare', `${grand > 0 ? 100 - liftPct : 0}%`);

  const chartEl = document.getElementById('stressChartContainer');
  if (chartEl) renderStackedLoadChart(chartEl, lift, run);
}

