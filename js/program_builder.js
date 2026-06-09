// ==========================================
// PROGRAM BUILDER LOGIC (program_builder.js)
// ==========================================
import { appState, saveStateToLocalStorage, getProgramById } from './state.js';

let activeBuilderId = null;

export function openBuilder(programId) {
  activeBuilderId = programId;
  const program = getProgramById(programId);
  if (!program) return;
  
  const container = document.getElementById('builderViewContainer');
  if(container) container.style.display = 'block';
  
  const libraryContainer = document.getElementById('progModeLibraryContainer');
  if(libraryContainer) libraryContainer.style.display = 'none';
  
  renderBuilderUI(program);
}

// ==========================================
// UI GENERATORS (Pure DOM String Builders)
// ==========================================

function renderBuilderUI(program) {
  const container = document.getElementById('builderViewContainer');
  if (!container) return;
  
  container.innerHTML = `
    <button class="subview-back-btn" data-action="close-builder">← Back to Library</button>
    <div class="card-dark p-4 mb-4">
      <h2 class="text-xl font-heavy text-inverse">${program.name}</h2>
      <p class="text-sm text-muted">${program.dossier?.focus || 'Custom Program'}</p>
    </div>
    <div id="weeksContainer"></div>
    <button class="btn-action-block btn-blue" data-action="add-week">+ Add Week</button>
  `;
  renderWeeks(program);
}

function renderWeeks(program) {
  const container = document.getElementById('weeksContainer');
  if (!program.weeks) program.weeks = []; 
  
  container.innerHTML = program.weeks.map((week, wIdx) => `
    <div class="card-dark p-4 mb-4" style="border: 1px solid var(--overlay-sm);">
      <div class="flex-between mb-3">
        <h3 class="font-heavy text-lg">Week ${wIdx + 1}</h3>
        <button class="btn-pad" style="color: var(--accent-red); border-color: rgba(239,68,68,0.2);" data-action="remove-week" data-w="${wIdx}">✕ Remove Week</button>
      </div>
      <div id="daysContainer_${wIdx}">
        ${(week.days || []).map((day, dIdx) => renderDay(day, wIdx, dIdx)).join('')}
      </div>
      <button class="btn-pad mt-2 w-full" data-action="add-day" data-w="${wIdx}">+ Add Day to Week ${wIdx + 1}</button>
    </div>
  `).join('');
}

function renderDay(day, wIdx, dIdx) {
  if (!day.exercises) day.exercises = []; 
  
  return `
    <div class="p-3 mb-3" style="border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2); border-radius: 8px;">
      <div class="flex-between mb-3">
        <input type="text" class="text-sm font-bold" value="${day.dayName || 'Day'}" data-action="update-day-name" data-w="${wIdx}" data-d="${dIdx}" style="background: transparent; border: none; color: var(--accent-blue); outline: none; border-bottom: 1px dashed var(--accent-blue); border-radius: 0; padding: 2px;">
        <button class="btn-pad" style="padding: 4px 8px; font-size: 0.7rem;" data-action="remove-day" data-w="${wIdx}" data-d="${dIdx}">✕</button>
      </div>

      <div class="mb-3">
        <input type="text" value="${day.runs || 'Rest'}" data-action="update-day-field" data-field="runs" data-w="${wIdx}" data-d="${dIdx}" placeholder="Run Target (e.g. 5km Easy)" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--overlay-sm); color: var(--accent-cyan); padding: 6px; border-radius: 4px; font-size: 0.8rem;">
      </div>
      
      <div class="flex-col gap-2 mb-3">
        ${day.exercises.map((ex, eIdx) => `
          <div class="flex gap-2 align-center">
            <div class="flex-col" style="justify-content: center; gap: 4px;">
              <button class="btn-pad tactile-scale" style="padding: 2px 6px; font-size: 0.6rem; min-width: 0;" data-action="move-ex-up" data-w="${wIdx}" data-d="${dIdx}" data-e="${eIdx}" ${eIdx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
              <button class="btn-pad tactile-scale" style="padding: 2px 6px; font-size: 0.6rem; min-width: 0;" data-action="move-ex-down" data-w="${wIdx}" data-d="${dIdx}" data-e="${eIdx}" ${eIdx === day.exercises.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
            </div>
            <input type="text" value="${ex.name || ''}" data-action="update-ex" data-field="name" data-w="${wIdx}" data-d="${dIdx}" data-e="${eIdx}" placeholder="Exercise Name" style="flex: 2;">
            <input type="number" value="${ex.targetSets || 3}" data-action="update-ex" data-field="targetSets" data-w="${wIdx}" data-d="${dIdx}" data-e="${eIdx}" title="Sets" style="flex: 1; text-align: center;">
            <span class="text-muted text-xs">x</span>
            <input type="number" value="${ex.targetReps || 10}" data-action="update-ex" data-field="targetReps" data-w="${wIdx}" data-d="${dIdx}" data-e="${eIdx}" title="Reps" style="flex: 1; text-align: center;">
            <button class="btn-pad" style="padding: 4px; color: var(--accent-red);" data-action="remove-ex" data-w="${wIdx}" data-d="${dIdx}" data-e="${eIdx}">✕</button>
          </div>
        `).join('')}
      </div>
      
      <button class="btn-pad" style="font-size: 0.75rem;" data-action="add-ex" data-w="${wIdx}" data-d="${dIdx}">+ Add Exercise</button>
    </div>
  `;
}

// ==========================================
// PRIVATE ACTION CONTROLLERS
// ==========================================

const moveExerciseUp = (w, d, e) => {
  if (e === 0) return;
  const prog = getProgramById(activeBuilderId);
  const arr = prog.weeks[w].days[d].exercises;
  [arr[e-1], arr[e]] = [arr[e], arr[e-1]]; 
  saveStateToLocalStorage(true);
  renderBuilderUI(prog); 
};

const moveExerciseDown = (w, d, e) => {
  const prog = getProgramById(activeBuilderId);
  const arr = prog.weeks[w].days[d].exercises;
  if (e === arr.length - 1) return;
  [arr[e], arr[e+1]] = [arr[e+1], arr[e]]; 
  saveStateToLocalStorage(true);
  renderBuilderUI(prog); 
};

const updateEx = (w, d, e, field, val) => {
  const prog = getProgramById(activeBuilderId);
  if (field === 'targetSets' || field === 'targetReps') val = parseInt(val, 10) || 0;
  prog.weeks[w].days[d].exercises[e][field] = val;
  saveStateToLocalStorage(true);
};

const updateDayName = (w, d, val) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[w].days[d].dayName = val;
  saveStateToLocalStorage(true);
};

const updateDayField = (w, d, field, val) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[w].days[d][field] = val;
  saveStateToLocalStorage(true);
};

const addWeekToProgram = () => {
  const prog = getProgramById(activeBuilderId);
  if (!prog.weeks) prog.weeks = [];
  prog.weeks.push({ days: [{ dayName: "Day 1", runs: "Rest", exercises: [] }] });
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

const removeWeek = (wIdx) => {
  if (!confirm("Remove this entire week?")) return;
  const prog = getProgramById(activeBuilderId);
  prog.weeks.splice(wIdx, 1);
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

const addDayToWeek = (wIdx) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[wIdx].days.push({ dayName: `Day ${prog.weeks[wIdx].days.length + 1}`, runs: "Rest", exercises: [] });
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

const removeDay = (wIdx, dIdx) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[wIdx].days.splice(dIdx, 1);
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

const addExercise = (wIdx, dIdx) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[wIdx].days[dIdx].exercises.push({ name: "", targetSets: 3, targetReps: 10 });
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

const removeExercise = (wIdx, dIdx, eIdx) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[wIdx].days[dIdx].exercises.splice(eIdx, 1);
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

const closeBuilder = () => {
  document.getElementById('builderViewContainer').style.display = 'none';
  document.getElementById('progModeLibraryContainer').style.display = 'block';
  document.dispatchEvent(new CustomEvent('app:library-updated'));
};

// ==========================================
// EVENT DELEGATION ROUTER
// ==========================================

document.addEventListener('click', (e) => {
  const target = e.target.closest('#builderViewContainer [data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  const w = parseInt(target.getAttribute('data-w'), 10);
  const d = parseInt(target.getAttribute('data-d'), 10);
  const ex = parseInt(target.getAttribute('data-e'), 10);

  if (action === 'close-builder') closeBuilder();
  else if (action === 'add-week') addWeekToProgram();
  else if (action === 'remove-week') removeWeek(w);
  else if (action === 'add-day') addDayToWeek(w);
  else if (action === 'remove-day') removeDay(w, d);
  else if (action === 'add-ex') addExercise(w, d);
  else if (action === 'remove-ex') removeExercise(w, d, ex);
  else if (action === 'move-ex-up') moveExerciseUp(w, d, ex);
  else if (action === 'move-ex-down') moveExerciseDown(w, d, ex);
});

document.addEventListener('change', (e) => {
  const target = e.target.closest('#builderViewContainer [data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  const w = parseInt(target.getAttribute('data-w'), 10);
  const d = parseInt(target.getAttribute('data-d'), 10);
  const ex = parseInt(target.getAttribute('data-e'), 10);
  const field = target.getAttribute('data-field');
  const val = target.value;

  if (action === 'update-day-name') updateDayName(w, d, val);
  else if (action === 'update-day-field') updateDayField(w, d, field, val);
  else if (action === 'update-ex') updateEx(w, d, ex, field, val);
});
