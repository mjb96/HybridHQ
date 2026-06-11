// ==========================================
// BUILDER RUN EDITOR (builder-run-editor.js)
// Structured, typed run/interval authoring. Replaces the free-text run input.
// Pace targets are derived from the athlete's saved threshold pace via the
// engine, so the user picks intent (type + structure) and sees the paces fall
// out — including the sub-20 5K goal pace as context.
// ==========================================
import { escapeHtml } from './util.js';
import { derivePaceForRun, derivePaceTargets, GOAL_5K_PACE_SEC } from './engine.js';

const RUN_TYPES = [
  ['easy', 'Easy'], ['recovery', 'Recovery'], ['long', 'Long'],
  ['tempo', 'Tempo'], ['threshold', 'Threshold'], ['intervals', 'Intervals'],
  ['fartlek', 'Fartlek'], ['race', 'Race / Parkrun'], ['rest', 'Rest'],
];

const CONTINUOUS = new Set(['easy', 'recovery', 'long', 'tempo', 'threshold']);
const STRUCTURED = new Set(['intervals', 'fartlek']);

export function basisForType(type) {
  switch (type) {
    case 'easy': case 'recovery': case 'long': return 'easy';
    case 'tempo': return 'tempo';
    case 'threshold': return 'threshold';
    case 'intervals': case 'fartlek': return 'interval';
    case 'race': return 'goal';
    default: return 'custom';
  }
}

export function formatPaceSec(sec) {
  if (sec == null || !isFinite(sec) || sec <= 0) return '\u2014';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}/km`;
}

function repRow(rep, w, dk, e, i) {
  const isDist = rep.distM != null || rep.durationSec == null;
  const amount = isDist ? (rep.distM ?? '') : (rep.durationSec ?? '');
  return `
    <div class="run-rep" data-w="${w}" data-dk="${dk}" data-e="${e}" data-i="${i}">
      <input type="number" min="1" value="${rep.count ?? 1}" class="run-num" title="Reps"
        data-action="rep-count" data-w="${w}" data-dk="${dk}" data-e="${e}" data-i="${i}">
      <span class="builder-x">\u00d7</span>
      <input type="number" min="1" value="${amount}" class="run-amt" title="Distance / duration"
        data-action="rep-amount" data-w="${w}" data-dk="${dk}" data-e="${e}" data-i="${i}">
      <select class="run-unit" data-action="rep-unit" data-w="${w}" data-dk="${dk}" data-e="${e}" data-i="${i}">
        <option value="m" ${isDist ? 'selected' : ''}>m</option>
        <option value="s" ${!isDist ? 'selected' : ''}>sec</option>
      </select>
      <input type="number" min="0" value="${rep.recoverySec ?? ''}" class="run-rec" placeholder="rec(s)" title="Recovery (sec)"
        data-action="rep-rec" data-w="${w}" data-dk="${dk}" data-e="${e}" data-i="${i}">
      <button class="btn-pad builder-mini builder-danger" data-action="rep-remove" data-w="${w}" data-dk="${dk}" data-e="${e}" data-i="${i}" title="Remove rep">\u2715</button>
    </div>`;
}

export function renderRunEditor(entry, w, dk, e, thresholdSec) {
  const run = entry.run || { type: 'rest', reps: [], paceBasis: 'custom' };
  const type = run.type || 'rest';
  const derived = derivePaceForRun(run, thresholdSec);
  const zones = derivePaceTargets(thresholdSec);

  const typeSelect = `
    <select class="run-type-select" data-action="run-type" data-w="${w}" data-dk="${dk}" data-e="${e}">
      ${RUN_TYPES.map(([v, l]) => `<option value="${v}" ${v === type ? 'selected' : ''}>${l}</option>`).join('')}
    </select>`;

  let body = '';
  if (CONTINUOUS.has(type)) {
    body = `
      <div class="run-line">
        <input type="number" min="1" value="${run.durationMin?.max ?? run.durationMin?.min ?? ''}" class="run-amt" placeholder="min"
          data-action="run-duration" data-w="${w}" data-dk="${dk}" data-e="${e}">
        <span class="run-unit-lbl">min</span>
        <span class="run-pace-hint">Target ${formatPaceSec(derived.paceTargetSec)}</span>
      </div>`;
  } else if (STRUCTURED.has(type)) {
    const reps = Array.isArray(run.reps) ? run.reps : [];
    body = `
      <div class="run-reps">
        ${reps.map((rep, i) => repRow(rep, w, dk, e, i)).join('') || '<span class="text-xs-muted">No reps yet.</span>'}
      </div>
      <div class="run-rep-foot">
        <button class="btn-pad builder-add" data-action="rep-add" data-w="${w}" data-dk="${dk}" data-e="${e}">+ Interval</button>
        <span class="run-pace-hint">@ ${formatPaceSec(zones.interval)}</span>
      </div>`;
  } else if (type === 'race') {
    body = `<div class="run-line"><span class="run-pace-hint">Goal pace ${formatPaceSec(GOAL_5K_PACE_SEC)} (sub-20 5K)</span></div>`;
  }

  const goalCtx = zones.hasThreshold
    ? `<span class="run-goal-ctx" title="From your saved threshold pace">easy ${formatPaceSec(zones.easy)} \u00b7 tempo ${formatPaceSec(zones.tempo)} \u00b7 thr ${formatPaceSec(zones.threshold)} \u00b7 int ${formatPaceSec(zones.interval)}</span>`
    : `<span class="run-goal-ctx run-goal-warn">Set a threshold pace (Analytics) to auto-derive target paces.</span>`;

  return `
    <div class="builder-run-row builder-run-editor" data-w="${w}" data-dk="${dk}" data-e="${e}">
      <div class="run-head">
        \ud83c\udfc3 ${typeSelect}
        <button class="btn-pad builder-mini builder-danger" data-action="remove-run" data-w="${w}" data-dk="${dk}" data-e="${e}" title="Remove run">\u2715</button>
      </div>
      ${body ? `<div class="run-body">${body}</div>` : ''}
      <input type="text" value="${escapeHtml(run.notes || '')}" class="run-notes" placeholder="Notes (optional)"
        data-action="run-notes" data-w="${w}" data-dk="${dk}" data-e="${e}">
      <div class="run-zones">${goalCtx}</div>
    </div>`;
}
