// ==========================================
// WORKOUT SESSION MODALS (workout-session-modals.js)
// ==========================================
import { getProgramById, flushCloudSyncNow } from './state.js';
import { showToast } from './toast.js';
import { prescribeSetsForLift } from './engine.js';
import { dismissRestTimer, stopAndResetWorkoutTimer } from './timers.js';
import { deleteMapFromDB } from './db.js';

let _getState, _getSelectedDay, _saveState, _switchTab, _rerender, _recomputePRs;

export function initSessionModals(getStateFn, getSelectedDayFn, saveStateFn, switchTabFn, rerenderFn, recomputePRsFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _saveState = saveStateFn;
  _switchTab = switchTabFn;
  _rerender = rerenderFn;
  _recomputePRs = recomputePRsFn;
}

export function openConfirmResetModal() {
  const modal = document.getElementById('confirmResetModal');
  if (modal) modal.classList.add('active');
}

export function closeConfirmResetModal() {
  const modal = document.getElementById('confirmResetModal');
  if (modal) modal.classList.remove('active');
}

export function executeResetActiveDayMetrics() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  
  appState.weeks[wk].runs[selectedDay] = { dist: '', time: '', rpe: '', avgHR: '', maxHR: '', elev: '', cals: '', hrZones: [], avgCadence: '', descent: '', trainingEffect: '', anaerobicTE: '', splits: [] };
  appState.weeks[wk].notes[selectedDay] = '';
  appState.weeks[wk].gymRpe[selectedDay] = '';
  appState.weeks[wk].bodyWeight[selectedDay] = '';
  appState.weeks[wk].gymStats[selectedDay] = { time: '', avgHR: '', maxHR: '', cals: '', trainingEffect: '', anaerobicTE: '', gymSets: [] };

  // PHASE 1 SUPERSETS: Clear companion map
  if (appState.weeks[wk].supersets) {
    appState.weeks[wk].supersets[selectedDay] = {};
  }

  const dayLifts = appState.weeks[wk].lifts[selectedDay] || {};
  for (const lift in dayLifts) {
    const arr = dayLifts[lift];
    if (Array.isArray(arr)) {
      arr.forEach(s => {
        s.w = '';
        s.c = false;
      });
    }
  }

  deleteMapFromDB(wk, selectedDay);
  
  _saveState(true);
  _recomputePRs();
  closeConfirmResetModal();
  _rerender();
  
  dismissRestTimer();
  stopAndResetWorkoutTimer();
  
  showToast("Day's logs and map cleared.");
}

export function openFinishSessionModal() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;

  let vol = 0, setsDone = 0;
  const dayLifts = appState.weeks[wk]?.lifts?.[selectedDay] || {};
  for (const lift in dayLifts) {
    const arr = dayLifts[lift];
    if (Array.isArray(arr)) {
      arr.forEach(s => {
        if (s && s.c && !s.isWarmup) {
          setsDone++;
          vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
        }
      });
    }
  }

  const runDist  = parseFloat(appState.weeks[wk]?.runs?.[selectedDay]?.dist) || 0;
  const runTime  = appState.weeks[wk]?.runs?.[selectedDay]?.time || '';
  const hasLift  = setsDone > 0;
  const hasRun   = runDist > 0;

  const sumModalEl  = document.getElementById('finishSessionModal');
  const sumVolEl    = document.getElementById('summaryVolume');
  const sumSetsEl   = document.getElementById('summarySets');
  const sumRunEl    = document.getElementById('summaryRunDist');
  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');
  const emptyWarnEl = document.getElementById('summaryEmptyWarning');
  const liftBlockEl = document.getElementById('summaryLiftBlock');
  const runBlockEl  = document.getElementById('summaryRunBlock');

  if (sumVolEl) sumVolEl.textContent = Math.round(vol).toLocaleString() + ' kg';
  if (sumSetsEl) sumSetsEl.textContent = setsDone;
  if (sumRunEl)  sumRunEl.textContent  = runDist > 0 ? runDist.toFixed(2) + ' km' + (runTime ? '  ·  ' + runTime : '') : '--';
  if (sumGymRpeEl) sumGymRpeEl.value = appState.weeks[wk]?.gymRpe?.[selectedDay] || '';
  if (sumRunRpeEl) sumRunRpeEl.value  = appState.weeks[wk]?.runs?.[selectedDay]?.rpe || '';

  if (liftBlockEl) liftBlockEl.style.display = hasLift ? '' : 'none';
  if (runBlockEl)  runBlockEl.style.display  = hasRun  ? '' : 'none';
  if (emptyWarnEl) emptyWarnEl.style.display = (!hasLift && !hasRun) ? '' : 'none';

  if (sumModalEl) sumModalEl.classList.add('active');
}

export function closeFinishSessionModal() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  if (!appState.weeks[wk].gymRpe) appState.weeks[wk].gymRpe = {};

  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');

  if (sumGymRpeEl) appState.weeks[wk].gymRpe[selectedDay] = sumGymRpeEl.value;
  if (sumRunRpeEl && appState.weeks[wk].runs?.[selectedDay]) {
    appState.weeks[wk].runs[selectedDay].rpe = sumRunRpeEl.value;
  }

  const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
  const runRpeEl = document.getElementById('runInputRpeCockpit');
  if (gymRpeEl) gymRpeEl.value = appState.weeks[wk].gymRpe?.[selectedDay] || '';
  if (runRpeEl) runRpeEl.value = appState.weeks[wk].runs?.[selectedDay]?.rpe || '';

  _saveState(true);
  flushCloudSyncNow();

  const sumModalEl = document.getElementById('finishSessionModal');
  if (sumModalEl) sumModalEl.classList.remove('active');

  stopAndResetWorkoutTimer();
  dismissRestTimer();
  _switchTab('home');
}
