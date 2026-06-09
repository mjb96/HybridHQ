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

function renderBuilderUI(program) {
  const container = document.getElementById('builderViewContainer');
  if (!container) return;
  
  container.innerHTML = `
    <button class="subview-back-btn" onclick="window.closeBuilder()">← Back to Library</button>
    <div class="card-dark p-4 mb-4">
      <h2 class="text-xl font-heavy text-inverse">${program.name}</h2>
      <p class="text-sm text-muted">${program.dossier?.focus || 'Custom Program'}</p>
    </div>
    <div id="weeksContainer"></div>
    <button class="btn-action-block btn-blue" onclick="window.addWeekToProgram()">+ Add Week</button>
  `;
  renderWeeks(program);
}

function renderWeeks(program) {
  const container = document.getElementById('weeksContainer');
  if (!program.weeks) program.weeks = []; // Scaffold if empty
  
  container.innerHTML = program.weeks.map((week, wIdx) => `
    <div class="card-dark p-4 mb-4" style="border: 1px solid var(--overlay-sm);">
      <div class="flex-between mb-3">
        <h3 class="font-heavy text-lg">Week ${wIdx + 1}</h3>
        <button class="btn-pad" style="color: var(--accent-red); border-color: rgba(239,68,68,0.2);" onclick="window.removeWeek(${wIdx})">✕ Remove Week</button>
      </div>
      <div id="daysContainer_${wIdx}">
        ${(week.days || []).map((day, dIdx) => renderDay(day, wIdx, dIdx)).join('')}
      </div>
      <button class="btn-pad mt-2 w-full" onclick="window.addDayToWeek(${wIdx})">+ Add Day to Week ${wIdx + 1}</button>
    </div>
  `).join('');
}

function renderDay(day, wIdx, dIdx) {
  if (!day.exercises) day.exercises = []; // Scaffold if empty
  
  return `
    <div class="p-3 mb-3" style="border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2); border-radius: 8px;">
      <div class="flex-between mb-3">
        <input type="text" class="text-sm font-bold" value="${day.dayName || 'Day'}" onchange="window.updateDayName(${wIdx}, ${dIdx}, this.value)" style="background: transparent; border: none; color: var(--accent-blue); outline: none; border-bottom: 1px dashed var(--accent-blue); border-radius: 0; padding: 2px;">
        <button class="btn-pad" style="padding: 4px 8px; font-size: 0.7rem;" onclick="window.removeDay(${wIdx}, ${dIdx})">✕</button>
      </div>

      <div class="mb-3">
        <input type="text" value="${day.runs || 'Rest'}" onchange="window.updateDayField(${wIdx}, ${dIdx}, 'runs', this.value)" placeholder="Run Target (e.g. 5km Easy)" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--overlay-sm); color: var(--accent-cyan); padding: 6px; border-radius: 4px; font-size: 0.8rem;">
      </div>
      
      <div class="flex-col gap-2 mb-3">
        ${day.exercises.map((ex, eIdx) => `
          <div class="flex gap-2 align-center">
            <div class="flex-col" style="justify-content: center; gap: 4px;">
              <button class="btn-pad tactile-scale" style="padding: 2px 6px; font-size: 0.6rem; min-width: 0;" onclick="window.moveExerciseUp(${wIdx}, ${dIdx}, ${eIdx})" ${eIdx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
              <button class="btn-pad tactile-scale" style="padding: 2px 6px; font-size: 0.6rem; min-width: 0;" onclick="window.moveExerciseDown(${wIdx}, ${dIdx}, ${eIdx})" ${eIdx === day.exercises.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
            </div>
            <input type="text" value="${ex.name || ''}" onchange="window.updateEx(${wIdx}, ${dIdx}, ${eIdx}, 'name', this.value)" placeholder="Exercise Name" style="flex: 2;">
            <input type="number" value="${ex.targetSets || 3}" onchange="window.updateEx(${wIdx}, ${dIdx}, ${eIdx}, 'targetSets', this.value)" title="Sets" style="flex: 1; text-align: center;">
            <span class="text-muted text-xs">x</span>
            <input type="number" value="${ex.targetReps || 10}" onchange="window.updateEx(${wIdx}, ${dIdx}, ${eIdx}, 'targetReps', this.value)" title="Reps" style="flex: 1; text-align: center;">
            <button class="btn-pad" style="padding: 4px; color: var(--accent-red);" onclick="window.removeExercise(${wIdx}, ${dIdx}, ${eIdx})">✕</button>
          </div>
        `).join('')}
      </div>
      
      <button class="btn-pad" style="font-size: 0.75rem;" onclick="window.addExercise(${wIdx}, ${dIdx})">+ Add Exercise</button>
    </div>
  `;
}

// ==========================================
// WINDOW BINDINGS FOR BUILDER UI
// ==========================================

window.moveExerciseUp = (w, d, e) => {
  if (e === 0) return;
  const prog = getProgramById(activeBuilderId);
  const arr = prog.weeks[w].days[d].exercises;
  [arr[e-1], arr[e]] = [arr[e], arr[e-1]]; // Swap items
  saveStateToLocalStorage(true);
  renderBuilderUI(prog); // Force redraw to show new order
};

window.moveExerciseDown = (w, d, e) => {
  const prog = getProgramById(activeBuilderId);
  const arr = prog.weeks[w].days[d].exercises;
  if (e === arr.length - 1) return;
  [arr[e], arr[e+1]] = [arr[e+1], arr[e]]; // Swap items
  saveStateToLocalStorage(true);
  renderBuilderUI(prog); // Force redraw to show new order
};

window.updateEx = (w, d, e, field, val) => {
  const prog = getProgramById(activeBuilderId);
  if (field === 'targetSets' || field === 'targetReps') val = parseInt(val, 10) || 0;
  prog.weeks[w].days[d].exercises[e][field] = val;
  saveStateToLocalStorage(true);
};

window.updateDayName = (w, d, val) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[w].days[d].dayName = val;
  saveStateToLocalStorage(true);
};

window.updateDayField = (w, d, field, val) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[w].days[d][field] = val;
  saveStateToLocalStorage(true);
};

window.addWeekToProgram = () => {
  const prog = getProgramById(activeBuilderId);
  if (!prog.weeks) prog.weeks = [];
  prog.weeks.push({ days: [{ dayName: "Day 1", runs: "Rest", exercises: [] }] });
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

window.removeWeek = (wIdx) => {
  if (!confirm("Remove this entire week?")) return;
  const prog = getProgramById(activeBuilderId);
  prog.weeks.splice(wIdx, 1);
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

window.addDayToWeek = (wIdx) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[wIdx].days.push({ dayName: `Day ${prog.weeks[wIdx].days.length + 1}`, runs: "Rest", exercises: [] });
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

window.removeDay = (wIdx, dIdx) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[wIdx].days.splice(dIdx, 1);
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

window.addExercise = (wIdx, dIdx) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[wIdx].days[dIdx].exercises.push({ name: "", targetSets: 3, targetReps: 10 });
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

window.removeExercise = (wIdx, dIdx, eIdx) => {
  const prog = getProgramById(activeBuilderId);
  prog.weeks[wIdx].days[dIdx].exercises.splice(eIdx, 1);
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
};

window.closeBuilder = () => {
  document.getElementById('builderViewContainer').style.display = 'none';
  document.getElementById('progModeLibraryContainer').style.display = 'block';
  document.dispatchEvent(new CustomEvent('app:library-updated'));
};
