// ==========================================
// PERFORMANCE MATRIX — analytics.js
// ------------------------------------------
// Thin orchestrator: owns module init, state mutators, and the renderAnalytics()
// router. All per-context rendering is delegated to the domain view modules
// in js/analytics/views/. All data aggregation lives in js/metrics/.
// ==========================================
import { getProgramById, saveStateToLocalStorage } from './state.js';
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
// MASTER ROUTER
// ==========================================
export function renderAnalytics() {
  if (!_getState || !_getDays) return;

  const appState = _getState();
  const days     = _getDays();
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
      renderStrengthView(appState, days);
      break;
    case 'strength_pr':
      document.getElementById('analytics-strength_pr').classList.add('active');
      renderStrengthPrView(appState, days);
      break;
    case 'running':
      document.getElementById('analytics-running').classList.add('active');
      renderRunningView(appState, days);
      break;
    case 'recovery':
      document.getElementById('analytics-recovery').classList.add('active');
      renderRecoveryView(appState, days);
      break;
    case 'recovery-score':
      document.getElementById('analytics-recovery-score').classList.add('active');
      renderRecoveryScoreView(appState, days);
      break;
    case 'bodyweight':
      document.getElementById('analytics-bodyweight').classList.add('active');
      renderBodyweightView(appState);
      break;
    case 'progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressView(appState, days);
      break;
    case 'weekly-volume':
      document.getElementById('analytics-weekly-volume').classList.add('active');
      renderWeeklyVolumeView(appState, days);
      break;
    case 'streak':
      document.getElementById('analytics-streak').classList.add('active');
      renderStreakView(appState);
      break;
    case 'active-fuel':
      document.getElementById('analytics-active-fuel').classList.add('active');
      renderActiveFuelView(appState, days);
      break;
    case 'stress-balance':
      document.getElementById('analytics-stress-balance').classList.add('active');
      renderStressBalanceView(appState, days);
      break;
    case 'goal-progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressView(appState, days);
      renderGoalProgressView(appState, days);
      break;
    case 'coach':
      document.getElementById('analytics-coach').classList.add('active');
      if (brainReport) renderCoachDetail(brainReport);
      break;
    default:
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthView(appState, days);
  }

  if (brainReport) {
    try { renderContextBanner(context, brainReport); }
    catch (e) { console.warn('[hybrid-brain] context banner skipped:', e); }
  }
}
