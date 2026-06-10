// ==========================================
// WORKOUT SESSION MODALS (workout-session-modals.js)
// Owns the reset-day and finish-session modals. Extracted verbatim from
// workout.js; the only changes are dependencies that pointed back into
// workout.js, now injected: renderWorkout() -> _rerender(),
// updateExercisePRs() -> _recomputePRs(), and _switchTab.
// ==========================================
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

  if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
  if (!appState.weeks[wk].lifts) appState.weeks[wk].lifts = {};
  if (!appState.weeks[wk].notes) appState.weeks[wk].notes = {};
  if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};

  appState.weeks[wk].runs[selectedDay] = { dist: '', time: '', rpe: '', avgHR: '', maxHR: '', elev: '', cals: '' };
  appState.weeks[wk].gymStats[selectedDay] = { time: '', avgHR: '', maxHR: '', cals: '' };
  appState.weeks[wk].lifts[selectedDay] = {};
  appState.weeks[wk].notes[selectedDay] = '';

  const activeProgram = getProgramById(appState.activeProgramId);
  const blueprint = activeProgram.days?.[selectedDay];

  if (blueprint && blueprint.lifts) {
    blueprint.lifts.forEach(liftName => {
      try {
        const weekModifier = activeProgram.weeklyVolModifiers?.[wk] || { sets: 4, reps: 5, intensityLabel: "Working Sets" };
        appState.weeks[wk].lifts[selectedDay][liftName] =
          prescribeSetsForLift(wk, selectedDay, liftName, blueprint.desc, weekModifier);
      } catch(e) { console.warn(e); }
    });
  }
  try {
    stopAndResetWorkoutTimer();
    dismissRestTimer();
  } catch(e) { console.warn(e); }

  _saveState(true);

  deleteMapFromDB(wk, selectedDay).then(() => {
    _rerender();
  }).catch(() => _rerender());

  closeConfirmResetModal();
  showToast('Day Logs Cleared');
}

export function openFinishSessionModal() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  let vol = 0, setsDone = 0;
  const liftsData = appState.weeks[wk]?.lifts?.[selectedDay] || {};

  for (let lift in liftsData) {
    if (Array.isArray(liftsData[lift])) {
      liftsData[lift].forEach(s => {
        if (s && s.c) { vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); setsDone++; }
      });
    }
  }

  const sumVolEl = document.getElementById('summaryVolume');
  const sumSetsEl = document.getElementById('summarySets');
  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');
  const sumModalEl = document.getElementById('summaryModal');

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
  if (runRpeEl) runRpeEl.value = appState.weeks[wk].runs[selectedDay]?.rpe || '';

  try { _recomputePRs(); } catch(e) { console.warn(e); }
  _saveState(true);

  const sumModalEl = document.getElementById('summaryModal');
  if (sumModalEl) sumModalEl.classList.remove('active');

  try {
    stopAndResetWorkoutTimer();
    dismissRestTimer();
  } catch(e) { console.warn(e); }

  if (_switchTab) _switchTab('home');
}