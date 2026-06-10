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
  select.innerHTML = '';

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
    customGroup.label = "⭐️ Custom Movements";
    [...appState.customExercises].sort().forEach(exercise => {
      const option = document.createElement('option');
      option.value = exercise;
      option.textContent = exercise;
      customGroup.appendChild(option);
    });
    select.appendChild(customGroup);
  }

  const divider = document.createElement('option');
  divider.disabled = true;
  divider.textContent = "──────────────────";
  select.appendChild(divider);

  const customWildcard = document.createElement('option');
  customWildcard.value = "__WRITE_CUSTOM__";
  customWildcard.textContent = "✍️ Type Custom Exercise Name...";
  select.appendChild(customWildcard);
}

export function handleExerciseDropdownSelectionChange() {
  const select = document.getElementById('newExerciseSelect');
  const textContainer = document.getElementById('customExerciseTextInputContainer');
  if (!select || !textContainer) return;

  if (select.value === "__WRITE_CUSTOM__") {
    textContainer.style.display = 'block';
    const input = document.getElementById('customExerciseTextInput');
    if (input) input.focus();
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

  if (!appState.weeks[wk].lifts[selectedDay][liftName]) {
    appState.weeks[wk].lifts[selectedDay][liftName] = [{ w: '', r: '10', c: false }];
  }

  _saveState(true);
  closeAddExerciseModal();
  _rerender();
  showToast(`Added: ${liftName}`);
}