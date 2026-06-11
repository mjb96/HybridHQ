// ==========================================
// PROGRAM BUILDER (program_builder.js) — SCHEMA v2 controller
// Reads + writes the unified weeks[] → days{mon..sun} → block[] tree the
// engine reads natively. Row markup lives in builder-exercise-row.js.
// ==========================================
import { saveStateToLocalStorage, getProgramById } from './state.js';
import { escapeHtml } from './util.js';
import { DAY_NAMES_FULL } from './constants.js';
import {
  DAY_KEYS, allCanonicalExercises, makeLiftEntry, makeRunEntry,
  parseRunString, canonicalizeExercise, migrateCustomProgramToV2,
} from './schema.js';
import { renderLiftRow, renderRunRow, parseRepsInput } from './builder-exercise-row.js';

let activeBuilderId = null;
let expandedWeek = 0;

export function openBuilder(programId) {
  activeBuilderId = programId;
  let program = getProgramById(programId);
  if (!program) return;

  // Safety net: ensure the program is v2 before editing (covers any program
  // that reached the builder without the at-load migration).
  if (program.schemaVersion !== 2) {
    const migrated = migrateCustomProgramToV2(program);
    Object.keys(program).forEach(k => { if (!(k in migrated)) delete program[k]; });
    Object.assign(program, migrated);
    saveStateToLocalStorage(true);
  }

  expandedWeek = 0;

  const container = document.getElementById('builderViewContainer');
  if (container) container.style.display = 'block';
  const libraryContainer = document.getElementById('progModeLibraryContainer');
  if (libraryContainer) libraryContainer.style.display = 'none';

  renderBuilderUI(program);
}

// ==========================================
// RENDER
// ==========================================
function dayLabel(dk) {
  return (DAY_NAMES_FULL[dk] || dk).slice(0, 3);
}

function renderBuilderUI(program) {
  const container = document.getElementById('builderViewContainer');
  if (!container) return;
  if (!Array.isArray(program.weeks)) program.weeks = [];

  const datalist = `<datalist id="builderExerciseList">${
    allCanonicalExercises().map(n => `<option value="${escapeHtml(n)}"></option>`).join('')
  }</datalist>`;

  container.innerHTML = `
    ${datalist}
    <button class="subview-back-btn" data-action="close-builder">\u2190 Back to Library</button>
    <div class="card-dark p-4 mb-4">
      <h2 class="text-xl font-heavy text-inverse">${escapeHtml(program.name)}</h2>
      <p class="text-sm text-muted">${escapeHtml(program.dossier?.focus || 'Custom Program')} \u00b7 ${program.weeks.length} week${program.weeks.length === 1 ? '' : 's'}</p>
    </div>
    <div id="weeksContainer"></div>
    <button class="btn-action-block btn-blue" data-action="add-week">+ Add Week</button>
  `;
  renderWeeks(program);
}

function renderWeeks(program) {
  const container = document.getElementById('weeksContainer');
  if (!container) return;

  container.innerHTML = program.weeks.map((week, w) => {
    const isOpen = w === expandedWeek;
    const trainingDays = DAY_KEYS.filter(dk => (week.days?.[dk]?.block || []).length > 0).length;
    return `
      <div class="card-dark p-3 mb-3 builder-week ${isOpen ? 'open' : ''}" style="border:1px solid var(--overlay-sm);">
        <div class="flex-between builder-week-head" data-action="toggle-week" data-w="${w}">
          <div class="flex gap-2 align-center" style="flex:1; min-width:0;">
            <span class="font-heavy text-lg">${isOpen ? '\u25be' : '\u25b8'} Week ${w + 1}</span>
            <input type="text" value="${escapeHtml(week.label || '')}" class="builder-week-label"
              data-action="update-week-label" data-w="${w}" placeholder="Phase label"
              onclick="event.stopPropagation()">
          </div>
          <div class="flex gap-1 align-center">
            <span class="text-xs-muted">${trainingDays}/7</span>
            <button class="btn-pad builder-mini" data-action="dup-week" data-w="${w}" title="Duplicate week" onclick="event.stopPropagation()">\u29c9</button>
            <button class="btn-pad builder-mini builder-danger" data-action="remove-week" data-w="${w}" title="Remove week" onclick="event.stopPropagation()">\u2715</button>
          </div>
        </div>
        ${isOpen ? `<div class="builder-week-body mt-3">${DAY_KEYS.map(dk => renderDay(week.days?.[dk], w, dk)).join('')}</div>` : ''}
      </div>`;
  }).join('');
}

function renderDay(day, w, dk) {
  const d = day || { title: '', block: [] };
  const block = Array.isArray(d.block) ? d.block : [];
  const hasRun = block.some(en => en.kind === 'run');

  const rowsHTML = block.map((en, e) =>
    en.kind === 'run' ? renderRunRow(en, w, dk, e) : renderLiftRow(en, w, dk, e)
  ).join('');

  const copyOptions = DAY_KEYS.filter(t => t !== dk)
    .map(t => `<option value="${t}">${dayLabel(t)}</option>`).join('');

  return `
    <div class="builder-day" data-w="${w}" data-dk="${dk}">
      <div class="flex-between builder-day-head">
        <div class="flex gap-2 align-center" style="flex:1; min-width:0;">
          <span class="builder-day-tag">${dayLabel(dk)}</span>
          <input type="text" value="${escapeHtml(d.title || '')}" class="builder-day-title"
            data-action="update-day-title" data-w="${w}" data-dk="${dk}" placeholder="Session title (optional)">
        </div>
        <select class="builder-copy-select" data-action="copy-day-to" data-w="${w}" data-dk="${dk}" title="Copy this day to...">
          <option value="">Copy \u2192</option>${copyOptions}
        </select>
      </div>
      <div class="builder-day-block">${rowsHTML || '<p class="text-xs-muted builder-empty">Rest day \u2014 add an exercise or run.</p>'}</div>
      <div class="flex gap-2 mt-2">
        <button class="btn-pad builder-add" data-action="add-ex" data-w="${w}" data-dk="${dk}">+ Exercise</button>
        ${hasRun ? '' : `<button class="btn-pad builder-add" data-action="add-run" data-w="${w}" data-dk="${dk}">+ Run</button>`}
      </div>
    </div>`;
}

// ==========================================
// MUTATION HELPERS
// ==========================================
function prog() { return getProgramById(activeBuilderId); }
function block(w, dk) {
  const p = prog();
  const day = p?.weeks?.[w]?.days?.[dk];
  if (day && !Array.isArray(day.block)) day.block = [];
  return day ? day.block : null;
}
function commit(rerender = true) {
  saveStateToLocalStorage(true);
  if (rerender) renderBuilderUI(prog());
}

// ==========================================
// ACTION CONTROLLERS
// ==========================================
const addExercise = (w, dk) => { const b = block(w, dk); if (b) { b.push(makeLiftEntry({})); commit(); } };
const addRun = (w, dk) => { const b = block(w, dk); if (b && !b.some(e => e.kind === 'run')) { b.push(makeRunEntry()); commit(); } };
const removeEntry = (w, dk, e) => { const b = block(w, dk); if (b) { b.splice(e, 1); commit(); } };
const dupExercise = (w, dk, e) => {
  const b = block(w, dk);
  if (b && b[e]) { b.splice(e + 1, 0, JSON.parse(JSON.stringify(b[e]))); commit(); }
};
const moveEntry = (w, dk, e, dir) => {
  const b = block(w, dk);
  if (!b) return;
  const t = e + dir;
  if (t < 0 || t >= b.length) return;
  [b[e], b[t]] = [b[t], b[e]];
  commit();
};

const updateEntry = (w, dk, e, field, val) => {
  const b = block(w, dk);
  if (!b || !b[e]) return;
  const en = b[e];
  if (field === 'name') en.name = canonicalizeExercise(val);
  else if (field === 'sets') en.sets = Math.max(1, parseInt(val, 10) || 1);
  else if (field === 'reps') en.reps = parseRepsInput(val);
  else if (field === 'rpe') { const n = parseFloat(val); en.rpe = Number.isNaN(n) ? null : n; }
  commit();
};

const updateRun = (w, dk, e, val) => {
  const b = block(w, dk);
  if (!b || !b[e] || b[e].kind !== 'run') return;
  b[e].run = parseRunString(val);
  commit();
};

const updateDayTitle = (w, dk, val) => {
  const day = prog()?.weeks?.[w]?.days?.[dk];
  if (day) { day.title = val; commit(false); }
};

const updateWeekLabel = (w, val) => {
  const week = prog()?.weeks?.[w];
  if (week) { week.label = val; commit(false); }
};

const copyDayTo = (w, dk, targetDk) => {
  if (!targetDk) return;
  const p = prog();
  const src = p?.weeks?.[w]?.days?.[dk];
  const tgt = p?.weeks?.[w]?.days?.[targetDk];
  if (!src || !tgt) return;
  if ((tgt.block || []).length > 0 && !confirm(`Overwrite ${dayLabel(targetDk)} with ${dayLabel(dk)}?`)) {
    renderBuilderUI(p);
    return;
  }
  tgt.block = JSON.parse(JSON.stringify(src.block || []));
  tgt.title = src.title || tgt.title;
  commit();
};

const addWeek = () => {
  const p = prog();
  if (!Array.isArray(p.weeks)) p.weeks = [];
  const days = {};
  DAY_KEYS.forEach(dk => { days[dk] = { title: '', badge: 'Rest', color: 'var(--text-muted)', notes: '', block: [] }; });
  p.weeks.push({ label: `Week ${p.weeks.length + 1}`, days });
  p.totalWeeks = p.weeks.length;
  expandedWeek = p.weeks.length - 1;
  commit();
};

const dupWeek = (w) => {
  const p = prog();
  const clone = JSON.parse(JSON.stringify(p.weeks[w]));
  clone.label = (clone.label || `Week ${w + 1}`) + ' (copy)';
  p.weeks.splice(w + 1, 0, clone);
  p.totalWeeks = p.weeks.length;
  expandedWeek = w + 1;
  commit();
};

const removeWeek = (w) => {
  const p = prog();
  if (p.weeks.length <= 1) { alert('A program needs at least one week.'); return; }
  if (!confirm('Remove this entire week?')) return;
  p.weeks.splice(w, 1);
  p.totalWeeks = p.weeks.length;
  if (expandedWeek >= p.weeks.length) expandedWeek = p.weeks.length - 1;
  commit();
};

const toggleWeek = (w) => {
  expandedWeek = (expandedWeek === w) ? -1 : w;
  renderWeeks(prog());
};

const closeBuilder = () => {
  document.getElementById('builderViewContainer').style.display = 'none';
  document.getElementById('progModeLibraryContainer').style.display = 'block';
  document.dispatchEvent(new CustomEvent('app:library-updated'));
};

// ==========================================
// EVENT DELEGATION
// ==========================================
function attrs(t) {
  return {
    w: parseInt(t.getAttribute('data-w'), 10),
    dk: t.getAttribute('data-dk'),
    e: parseInt(t.getAttribute('data-e'), 10),
    field: t.getAttribute('data-field'),
  };
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('#builderViewContainer [data-action]');
  if (!t) return;
  const action = t.getAttribute('data-action');
  const { w, dk, e } = attrs(t);

  switch (action) {
    case 'close-builder': closeBuilder(); break;
    case 'add-week': addWeek(); break;
    case 'dup-week': dupWeek(w); break;
    case 'remove-week': removeWeek(w); break;
    case 'toggle-week': toggleWeek(w); break;
    case 'add-ex': addExercise(w, dk); break;
    case 'add-run': addRun(w, dk); break;
    case 'remove-ex':
    case 'remove-run': removeEntry(w, dk, e); break;
    case 'dup-ex': dupExercise(w, dk, e); break;
    case 'ex-up': moveEntry(w, dk, e, -1); break;
    case 'ex-down': moveEntry(w, dk, e, +1); break;
    default: break;
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target.closest('#builderViewContainer [data-action]');
  if (!t) return;
  const action = t.getAttribute('data-action');
  const { w, dk, e, field } = attrs(t);
  const val = t.value;

  switch (action) {
    case 'update-entry': updateEntry(w, dk, e, field, val); break;
    case 'update-run': updateRun(w, dk, e, val); break;
    case 'update-day-title': updateDayTitle(w, dk, val); break;
    case 'update-week-label': updateWeekLabel(w, val); break;
    case 'copy-day-to': copyDayTo(w, dk, val); break;
    default: break;
  }
});