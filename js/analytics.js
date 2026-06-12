// ==========================================
// PERFORMANCE MATRIX — analytics.js
// ------------------------------------------
// Thin orchestrator: owns module init, state mutators, the collectAnalyticsData
// grab-bag, and the renderAnalytics() router. All per-context rendering is
// delegated to the domain view modules in js/analytics/views/.
// ==========================================
import { getProgramById, saveStateToLocalStorage } from './state.js';
import {
  epley1RM, isCompletedSet, paceSecondsPerKm,
} from './engine.js';
import { generateInsights } from './brain/core.js';
import { renderContextBanner } from './brain/analytics_brain.js';
import { renderCoachDetail } from './brain/brain_dashboard.js';
import { renderStrengthView, renderStrengthPrView, renderWeeklyVolumeView } from './analytics/views/view-strength.js';
import { renderRunningView } from './analytics/views/view-running.js';
import { renderRecoveryView, renderRecoveryScoreView, renderStressBalanceView } from './analytics/views/view-recovery.js';
import { renderBodyweightView } from './analytics/views/view-bodyweight.js';
import { renderProgressView, renderStreakView, renderGoalProgressView, renderActiveFuelView } from './analytics/views/view-progress.js';

let _getState;
let _getDays;
let _analyticsContext = 'overview';

export function initAnalytics(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays  = getDaysFn;
}

export function setAnalyticsContext(context) {
  _analyticsContext = context || 'overview';
}

// ==========================================
// LOCAL STATE MUTATORS
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
  const weight   = parseFloat(input.value);
  if (isNaN(weight)) return;

  if (!appState.bodyWeightLog) appState.bodyWeightLog = [];

  const today       = new Date().toISOString().slice(0, 10);
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

// ==========================================
// DATA COLLECTION
// ==========================================
function collectAnalyticsData() {
  const appState     = _getState();
  const DEFAULT_DAYS = _getDays();
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;

  const data = {
    dynamicStats: {},
    weekLabels: [],
    volData: [], runData: [], rpeData: [], paceData: [],
    cadenceData: [], teData: [], gymHrData: [], gymCalsData: [], hrZonesData: [],
    globalTotalDist: 0, globalTotalElev: 0, globalTotalCals: 0,
    globalTotalSets: 0, globalTotalVol: 0, absoluteMesoPeakVol: 0,
    globalTotalGymCals: 0, globalAvgGymHr: 0,
    thresholdSecs: appState.thresholdPaceSeconds || null,
    bodyWeightLog: appState.bodyWeightLog || [],
  };

  if (appState.weeks) {
    Object.keys(appState.weeks).forEach(wKey => {
      const wkData = appState.weeks[wKey];
      if (!wkData?.lifts) return;
      const prevWeek = (parseInt(appState.currentWeek, 10) - 1).toString();
      DEFAULT_DAYS.forEach(d => {
        const dayLifts = wkData.lifts[d];
        if (!dayLifts) return;
        for (const lift in dayLifts) {
          if (!Array.isArray(dayLifts[lift])) continue;
          if (!data.dynamicStats[lift]) {
            data.dynamicStats[lift] = { allTimeMax: 0, currentEstimatedMax: 0, previousWeekMax: 0 };
          }
          dayLifts[lift].forEach(s => {
            if (!isCompletedSet(s) || s.isWarmup) return;
            const weight = parseFloat(s.w) || 0;
            const reps   = parseInt(s.r, 10) || 0;
            if (weight <= 0 || reps <= 0) return;
            const e1rm = epley1RM(weight, reps);
            if (e1rm > data.dynamicStats[lift].allTimeMax)           data.dynamicStats[lift].allTimeMax           = e1rm;
            if (wKey === appState.currentWeek && e1rm > data.dynamicStats[lift].currentEstimatedMax) data.dynamicStats[lift].currentEstimatedMax = e1rm;
            if (wKey === prevWeek             && e1rm > data.dynamicStats[lift].previousWeekMax)     data.dynamicStats[lift].previousWeekMax     = e1rm;
          });
        }
      });
    });
  }

  for (let w = 1; w <= maxWeek; w++) {
    const wKey   = w.toString();
    const wkData = appState.weeks?.[wKey];
    data.weekLabels.push('W' + w);

    if (!wkData) {
      data.volData.push(0); data.runData.push(0); data.rpeData.push(0); data.paceData.push(0);
      data.cadenceData.push(0); data.teData.push(0); data.gymHrData.push(0); data.gymCalsData.push(0);
      data.hrZonesData.push([0, 0, 0, 0, 0]);
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
      const run  = wkData.runs?.[d] || {};
      const dist = parseFloat(run.dist) || 0;
      const elev = parseFloat(run.elev) || 0;
      const cals = parseFloat(run.cals) || 0;
      weekDist += dist; weekElev += elev; weekCals += cals;

      const paceS = paceSecondsPerKm(dist, run.time || '');
      if (paceS > 0 && dist > 0) { weekRunTime += paceS * dist; weekRunDist += dist; }

      const runRpe = parseFloat(run.rpe) || 0;
      if (runRpe > 0) { weekRpeSum += runRpe; weekRpeCount++; }

      if (run.avgCadence)    { weekCadenceSum += parseFloat(run.avgCadence);    weekCadenceCount++; }
      if (run.trainingEffect){ weekTeSum      += parseFloat(run.trainingEffect); weekTeCount++;      }
      if (run.hrZones && Array.isArray(run.hrZones)) {
        run.hrZones.forEach((z, i) => { if (i < 5) weekHrZones[i] += (parseFloat(z) || 0); });
      }

      const gymRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
      if (gymRpe > 0) { weekRpeSum += gymRpe; weekRpeCount++; }

      const gym = wkData.gymStats?.[d] || {};
      if (gym.avgHR) { weekGymHrSum += parseFloat(gym.avgHR); weekGymHrCount++; }
      if (gym.cals)  { weekGymCals  += parseFloat(gym.cals);  weekCals += parseFloat(gym.cals); }

      const dayLifts = wkData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          if (isCompletedSet(s)) {
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

  data.globalTotalGymCals = data.gymCalsData.reduce((a, b) => a + b, 0);
  const validGymHr        = data.gymHrData.filter(h => h > 0);
  data.globalAvgGymHr     = validGymHr.length ? validGymHr.reduce((a, b) => a + b, 0) / validGymHr.length : 0;

  return data;
}

// ==========================================
// MASTER ROUTER
// ==========================================
export function renderAnalytics() {
  if (!_getState || !_getDays) return;

  const appState = _getState();
  const days     = _getDays();
  const data     = collectAnalyticsData();
  const context  = _analyticsContext || 'overview';

  let brainReport = null;
  try {
    const program = getProgramById(appState.activeProgramId);
    brainReport = generateInsights(appState, {
      days, program, currentWeek: appState.currentWeek, maxWeek: program?.totalWeeks,
    });
  } catch (e) { brainReport = null; }

  document.querySelectorAll('.analytics-section').forEach(sec => sec.classList.remove('active'));

  switch (context) {
    case 'strength':
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthView(data, appState, days);
      break;
    case 'strength_pr':
      document.getElementById('analytics-strength_pr').classList.add('active');
      renderStrengthPrView(data, appState);
      break;
    case 'running':
      document.getElementById('analytics-running').classList.add('active');
      renderRunningView(data, appState, days);
      break;
    case 'recovery':
      document.getElementById('analytics-recovery').classList.add('active');
      renderRecoveryView(data, appState, days);
      break;
    case 'recovery-score':
      document.getElementById('analytics-recovery-score').classList.add('active');
      renderRecoveryScoreView(data, appState, days);
      break;
    case 'bodyweight':
      document.getElementById('analytics-bodyweight').classList.add('active');
      renderBodyweightView(data);
      break;
    case 'progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressView(data, appState);
      break;
    case 'weekly-volume':
      document.getElementById('analytics-weekly-volume').classList.add('active');
      renderWeeklyVolumeView(data, appState, days);
      break;
    case 'streak':
      document.getElementById('analytics-streak').classList.add('active');
      renderStreakView(data, appState);
      break;
    case 'active-fuel':
      document.getElementById('analytics-active-fuel').classList.add('active');
      renderActiveFuelView(data, appState, days);
      break;
    case 'stress-balance':
      document.getElementById('analytics-stress-balance').classList.add('active');
      renderStressBalanceView(data, appState, days);
      break;
    case 'goal-progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressView(data, appState);
      renderGoalProgressView(data, appState, days);
      break;
    case 'coach':
      document.getElementById('analytics-coach').classList.add('active');
      if (brainReport) renderCoachDetail(brainReport);
      break;
    default:
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthView(data, appState, days);
  }

  if (brainReport) {
    try { renderContextBanner(context, brainReport); }
    catch (e) { console.warn('[hybrid-brain] context banner skipped:', e); }
  }
}
