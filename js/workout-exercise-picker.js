// ==========================================
// WORKOUT EXERCISE PICKER (workout-exercise-picker.js)
// ==========================================
import { EXERCISE_LIBRARY } from './constants.js';
import { showToast, saveNewCustomExerciseToLibrary } from './state.js';
import { getLiftId, getLiftDisplayName } from './engine.js';

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

  let recentExercises = [];
  if (appState && appState.weeks && appState.currentWeek) {
    const currentWk = parseInt(appState.currentWeek, 10);
    if (!isNaN(currentWk)) {
      const recentMap = {};
      const minWk = Math.max(1, currentWk - 3); 
      
      for (let w = currentWk; w >= minWk; w--) {
        const wData = appState.weeks[w.toString()];
        if (!wData || !wData.lifts) continue;
        
        for (const d in wData.lifts) {
          for (const liftId in wData.lifts[d]) {
            const displayName = getLiftDisplayName(appState, liftId);
            if (!recentMap[displayName]) {
              recentMap[displayName] = { name: displayName, count: 0, lastSeenWeek: w };
            }
            recentMap[displayName].count += 1;
            if (w > recentMap[displayName].lastSeenWeek) {
              recentMap[displayName].lastSeenWeek = w;
            }
          }
        }
      }

      const todaysLifts = appState.weeks[currentWk.toString()]?.lifts?.[selectedDay] || {};
      for (const activeLiftId in todaysLifts) {
        delete recentMap[getLiftDisplayName(appState, activeLiftId)];
      }
      
      recentExercises = Object.values(recentMap).sort((a, b) => {
        if (b.lastSeenWeek !== a.lastSeenWeek) {
          return b.lastSeenWeek - a.lastSeenWeek;
        }
        return b.count - a.count;
      }).slice(0, 15);
    }
  }

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
  if (modal) {
    modal.classList.remove('active');
    modal.removeAttribute('data-source-lift');
  }
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

  const modal = document.getElementById('addExerciseModal');
  const isSuperset = modal && modal.hasAttribute('data-source-lift');
  const sourceLift = isSuperset ? modal.getAttribute('data-source-lift') : null;

  // 1. REBUILD DICTIONARY: Force DOM contiguity by injecting immediately after the source lift
  const liftId = getLiftId(appState, liftName);
  const currentLifts = appState.weeks[wk].lifts[selectedDay];
  if (!currentLifts[liftId]) {
    if (isSuperset && sourceLift && currentLifts[sourceLift]) {
      const reorderedLifts = {};
      for (const key in currentLifts) {
        reorderedLifts[key] = currentLifts[key];
        // Inject the new lift immediately after its superset partner
        if (key === sourceLift) {
          reorderedLifts[liftId] = [{ w: '', r: '10', c: false }];
        }
      }
      appState.weeks[wk].lifts[selectedDay] = reorderedLifts;
    } else {
      currentLifts[liftId] = [{ w: '', r: '10', c: false }];
    }
  }

  // 2. COMPANION MAP LOGIC
  if (isSuperset) {
    if (!appState.weeks[wk].supersets) appState.weeks[wk].supersets = {};
    if (!appState.weeks[wk].supersets[selectedDay]) appState.weeks[wk].supersets[selectedDay] = {};

    const supersetsMap = appState.weeks[wk].supersets[selectedDay];
    let groupId = supersetsMap[sourceLift];

    if (!groupId) {
      groupId = 'group_' + Date.now();
      supersetsMap[sourceLift] = groupId;
    }
    supersetsMap[liftId] = groupId;
    modal.removeAttribute('data-source-lift');
  }

  _saveState(true);
  closeAddExerciseModal();
  
  if (typeof _rerender === 'function') {
    _rerender();
  }

  // 3. TARGETED SCROLL: Snap to the specific exercise instead of the bottom of the page
  setTimeout(() => {
    const safeSelectorName = liftName.replace(/"/g, '\\"');
    const targetCard = document.querySelector(`.cockpit-exercise[data-liftname="${safeSelectorName}"]`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}
