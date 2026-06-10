// ==========================================
// WORKOUT SESSION MODALS (workout-session-modals.js)
// Owns the reset-day and finish-session modals. Extracted verbatim from
// workout.js; the only changes are dependencies that pointed back into
// workout.js, now injected: renderWorkout() -> _rerender(),
// updateExercisePRs() -> _recomputePRs(), and _switchTab.
// ==========================================\
import { getProgramById, showToast } from './state.js';
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
  
  let vol = 0;
  let setsDone = 0;

  const dayLifts = appState.weeks[wk].lifts[selectedDay] || {};
  for (const lift in dayLifts) {
    const arr = dayLifts[lift];
    if (Array.isArray(arr)) {
      arr.forEach(s => {
        // INCREMENT WARMUP: Exclude warmups from volume and completion totals
        if (s && s.c && !s.isWarmup) {
          setsDone++;
          vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
        }
      });
    }
  }

  const sumModalEl = document.getElementById('finishSessionModal');
  const sumVolEl = document.getElementById('summaryVolume');
  const sumSetsEl = document.getElementById('summarySets');
  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');

  if (sumVolEl) sumVolEl.textContent = vol + ' kg';
  if (sumSetsEl) sumSetsEl.textContent = setsDone;
  if (sumGymRpeEl) sumGymRpeEl.value = appState.weeks[wk].gymRpe?.[selectedDay] || '';
  if (sumRunRpeEl) sumRunRpeEl.value = appState.weeks[wk].runs?.[selectedDay]?.rpe || '';
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
  if (sumRunRpeEl && appState.weeks[wk].runs[selectedDay]) {
    appState.weeks[wk].runs[selectedDay].rpe = sumRunRpeEl.value;
  }

  const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
  const runRpeEl = document.getElementById('runInputRpeCockpit');
  if (gymRpeEl) gymRpeEl.value = appState.weeks[wk].gymRpe[selectedDay] || '';
  if (runRpeEl) runRpeEl.value = appState.weeks[wk].runs[selectedDay].rpe || '';

  _saveState(true);
  
  const sumModalEl = document.getElementById('finishSessionModal');
  if (sumModalEl) sumModalEl.classList.remove('active');

  stopAndResetWorkoutTimer();
  dismissRestTimer();
  _switchTab('home');
}
