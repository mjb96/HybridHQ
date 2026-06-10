// ==========================================
// WORKOUT EXERCISE PICKER (workout-exercise-picker.js)
// Owns the add-exercise dropdown + modal. Extracted verbatim from workout.js;
// the only change is renderWorkout() -> injected _rerender() to avoid a
// reverse import back into workout.js.
// ==========================================
import { EXERCISE_LIBRARY } from './constants.js';
import { showToast, saveNewCustomExerciseToLibrary } from './state.js';

let _getState, _getSelectedDay, _saveState, _rerender;

export function initExercisePicker(getStateFn, getSelectedDayFn, saveStateFn, rerenderFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _saveState = saveStateFn;
  _rerender = rerenderFn;
}

export function populateExerciseDropdown() {
  const select = document.getElementById('newExerciseSelect');
  if (!select) return;

  const appState = _getState ? _getState() : { customExercises: [] };
  const selectedDay = _getSelectedDay ? _getSelectedDay() : 'mon';
  select.innerHTML = '';

  // ---------------------------------------------------------
  // INCREMENT 10: DYNAMIC RECENT EXERCISES
  // ---------------------------------------------------------
  let recentExercises = [];
  if (appState && appState.weeks && appState.currentWeek) {
    const currentWk = parseInt(appState.currentWeek, 10);
    if (!isNaN(currentWk)) {
      const recentMap = {};
      const minWk = Math.max(1, currentWk - 3); // 4-week lookback
      
      // 1. Build Frequency & Recency Map
      for (let w = currentWk; w >= minWk; w--) {
        const wData = appState.weeks[w.toString()];
        if (!wData || !wData.lifts) continue;
        
        for (const d in wData.lifts) {
          for (const liftName in wData.lifts[d]) {
            if (!recentMap[liftName]) {
              recentMap[liftName] = { name: liftName, count: 0, lastSeenWeek: w };
            }
            recentMap[liftName].count += 1;
            if (w > recentMap[liftName].lastSeenWeek) {
              recentMap[liftName].lastSeenWeek = w;
            }
          }
        }
      }
      
      // 2. Exclude Lifts Already Active in Today's Session
      const todaysLifts = appState.weeks[currentWk.toString()]?.lifts?.[selectedDay] || {};
      for (const activeLift in todaysLifts) {
        delete recentMap[activeLift];
      }
      
      // 3. Sort: Recency First, Frequency Second, then Slice Top 15
      recentExercises = Object.values(recentMap).sort((a, b) => {
        if (b.lastSeenWeek !== a.lastSeenWeek) {
          return b.lastSeenWeek - a.lastSeenWeek;
        }
        return b.count - a.count;
      }).slice(0, 15);
    }
  }

  // 4. Inject Recent Optgroup
  if (recentExercises.length > 0) {
    const recentGroup = document.createElement('optgroup');
    recentGroup.label = "Recent Exercises";
    recentExercises.forEach(ex => {
      const option = document.createElement('option');
      option.value = ex.name;
      option.textContent = ex.name;
      recentGroup.appendChild(option);
    });
    select.appendChild(recentGroup);
  }
  // ---------------------------------------------------------

  // Standard Static Library Rendering
  for (const [category, exercises] of Object.entries(EXERCISE_LIBRARY)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = category;
    const sortedExercises = [...exercises].sort();
    sortedExercises.forEach(exercise => {
      const option = document.createElement('option');
      option.value = exercise;
      option.textContent = exercise;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  }

  // Custom User Exercises Rendering
  if (appState.customExercises && appState.customExercises.length > 0) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = "Custom";
    const sortedCustom = [...appState.customExercises].sort();
    sortedCustom.forEach(exercise => {
      const option = document.createElement('option');
      option.value = exercise;
      option.textContent = exercise;
      customGroup.appendChild(option);
    });
    select.appendChild(customGroup);
  }

  // Custom Entry Trigger
  const writeOpt = document.createElement('option');
  writeOpt.value = "__WRITE_CUSTOM__";
  writeOpt.textContent = "+ Write Custom...";
  select.appendChild(writeOpt);
}

export function handleExerciseDropdownSelectionChange() {
  const select = document.getElementById('newExerciseSelect');
  const textContainer = document.getElementById('customExerciseTextInputContainer');
  if (!select || !textContainer) return;
  
  if (select.value === "__WRITE_CUSTOM__") {
    textContainer.style.display = 'block';
    const txtInput = document.getElementById('customExerciseTextInput');
    if (txtInput) txtInput.focus();
  } else {
    textContainer.style.display = 'none';
  }
}

export function openAddExerciseModal() {
  populateExerciseDropdown();

  const textContainer = document.getElementById('customExerciseTextInputContainer');
  const txtInput = document.getElementById('customExerciseTextInput');
  if (textContainer) textContainer.style.display = 'none';
  if (txtInput) txtInput.value = '';

  const modal = document.getElementById('addExerciseModal');
  if (modal) modal.classList.add('active');
}

export function closeAddExerciseModal() {
  const modal = document.getElementById('addExerciseModal');
  if (modal) modal.classList.remove('active');
}

export function confirmAddExercise() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const select = document.getElementById('newExerciseSelect');
  if (!select) return;

  let liftName = select.value;

  if (liftName === "__WRITE_CUSTOM__") {
    const rawInput = document.getElementById('customExerciseTextInput');
    liftName = rawInput ? rawInput.value.trim() : '';

    if (!liftName) {
      showToast('Please type an exercise name.', true);
      return;
    }

    saveNewCustomExerciseToLibrary(liftName);
  }

  if (!liftName) return;

  const wk = appState.currentWeek;
  if (!appState.weeks[wk].lifts[selectedDay]) {
    appState.weeks[wk].lifts[selectedDay] = {};
  }

  // Native dictionary constraint naturally prevents duplicates
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) {
    appState.weeks[wk].lifts[selectedDay][liftName] = [{ w: '', r: '10', c: false }];
  }

  _saveState(true);
  closeAddExerciseModal();
  
  if (typeof _rerender === 'function') {
    _rerender();
  }

  // Smooth scroll to the newly appended exercise
  setTimeout(() => {
    const cards = document.querySelectorAll('.cockpit-exercise');
    if (cards.length > 0) {
      cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}
