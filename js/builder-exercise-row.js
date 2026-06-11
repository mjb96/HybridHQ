// ==========================================
// BUILDER EXERCISE/RUN ROW RENDERING (builder-exercise-row.js)
// Pure DOM-string builders for a single v2 block entry. program_builder.js
// stays the controller; this module owns row markup + small parse helpers.
// ==========================================
import { escapeHtml } from './util.js';
import { isCanonicalExercise, formatReps, makeReps } from './schema.js';

const RUN_TYPE_LABEL = {
  easy: 'Easy', recovery: 'Recovery', long: 'Long', tempo: 'Tempo',
  threshold: 'Threshold', intervals: 'Intervals', fartlek: 'Fartlek',
  race: 'Race / Parkrun', rest: 'Rest',
};

const RUN_TYPE_COLOR = {
  easy: 'var(--accent-green, #10b981)', long: 'var(--accent-green, #10b981)',
  recovery: 'var(--accent-green, #10b981)', tempo: 'var(--accent-amber, #f59e0b)',
  threshold: 'var(--accent-red, #ef4444)', intervals: 'var(--accent-purple, #a855f7)',
  fartlek: 'var(--accent-purple, #a855f7)', race: 'var(--accent-cyan, #22d3ee)',
  rest: 'var(--text-muted)',
};

// "8" → {8,8}; "8-10" / "8–10" → {8,10}; "" → null
export function parseRepsInput(str) {
  const s = (str == null ? '' : String(str)).trim().replace(/\u2013/g, '-');
  if (!s) return null;
  const parts = s.split('-').map(p => parseInt(p, 10)).filter(n => !Number.isNaN(n));
  if (parts.length === 0) return null;
  if (parts.length === 1) return makeReps(parts[0], parts[0]);
  return makeReps(parts[0], parts[1]);
}

function canonicalBadge(name) {
  const n = (name || '').trim();
  if (!n) return '';
  if (isCanonicalExercise(n)) {
    return `<span class="builder-canon-ok" title="Matches exercise library — PRs &amp; history will line up">\u2713</span>`;
  }
  return `<span class="builder-canon-custom" title="Custom name — won't auto-match PR/history">\uff0b custom</span>`;
}

export function renderLiftRow(entry, w, dk, e, groupCtx = {}) {
  const nameMissing = !(entry.name || '').trim();
  const repsStr = formatReps(entry.reps);
  const { hasPrevLift = false, linkedToPrev = false, inGroup = false } = groupCtx;
  const ssBtn = hasPrevLift
    ? `<button class="btn-pad builder-mini builder-ss-btn${linkedToPrev ? ' active' : ''}" data-action="toggle-group" data-w="${w}" data-dk="${dk}" data-e="${e}" title="${linkedToPrev ? 'Unlink from superset above' : 'Superset with exercise above'}">\u26a1</button>`
    : '';
  return `
    <div class="builder-row${inGroup ? ' builder-row-grouped' : ''}" data-w="${w}" data-dk="${dk}" data-e="${e}">
      <div class="builder-reorder">
        <button class="btn-pad tactile-scale builder-mini" data-action="ex-up" data-w="${w}" data-dk="${dk}" data-e="${e}" title="Move up">\u25b2</button>
        <button class="btn-pad tactile-scale builder-mini" data-action="ex-down" data-w="${w}" data-dk="${dk}" data-e="${e}" title="Move down">\u25bc</button>
      </div>
      <div class="builder-row-main">
        <div class="builder-name-wrap">
          <input type="text" list="builderExerciseList" value="${escapeHtml(entry.name || '')}"
            class="builder-name-input${nameMissing ? ' builder-invalid' : ''}"
            data-action="update-entry" data-field="name" data-w="${w}" data-dk="${dk}" data-e="${e}"
            placeholder="Exercise name" autocomplete="off">
          <div class="builder-name-meta">
            ${nameMissing ? '<span class="builder-err">Name required</span>' : canonicalBadge(entry.name)}
          </div>
        </div>
        <div class="builder-scheme">
          <input type="number" min="1" value="${parseInt(entry.sets, 10) || 1}"
            data-action="update-entry" data-field="sets" data-w="${w}" data-dk="${dk}" data-e="${e}"
            title="Sets" class="builder-num">
          <span class="builder-x">\u00d7</span>
          <input type="text" value="${escapeHtml(repsStr)}"
            data-action="update-entry" data-field="reps" data-w="${w}" data-dk="${dk}" data-e="${e}"
            title="Reps (e.g. 5 or 8-10)" placeholder="reps" class="builder-reps">
          <input type="number" min="1" max="10" step="0.5" value="${entry.rpe ?? ''}"
            data-action="update-entry" data-field="rpe" data-w="${w}" data-dk="${dk}" data-e="${e}"
            title="Target RPE (optional)" placeholder="RPE" class="builder-rpe">
        </div>
      </div>
      <div class="builder-row-actions">
        ${ssBtn}
        <button class="btn-pad builder-mini" data-action="dup-ex" data-w="${w}" data-dk="${dk}" data-e="${e}" title="Duplicate">\u29c9</button>
        <button class="btn-pad builder-mini builder-danger" data-action="remove-ex" data-w="${w}" data-dk="${dk}" data-e="${e}" title="Remove">\u2715</button>
      </div>
    </div>`;
}

export function renderRunRow(entry, w, dk, e) {
  const run = entry.run || { type: 'rest', notes: '' };
  const type = run.type || 'rest';
  const label = RUN_TYPE_LABEL[type] || type;
  const color = RUN_TYPE_COLOR[type] || 'var(--text-muted)';
  let detail = '';
  if (type === 'intervals' && Array.isArray(run.reps) && run.reps.length) {
    detail = run.reps.map(r => {
      const amt = r.distM ? `${r.distM}m` : (r.durationSec ? `${Math.round(r.durationSec / 60)}min` : '');
      const rec = r.recoverySec ? ` / ${r.recoverySec}s rec` : '';
      return `${r.count}\u00d7${amt}${rec}`;
    }).join(', ');
  } else if (run.durationMin) {
    detail = run.durationMin.min === run.durationMin.max
      ? `${run.durationMin.min} min`
      : `${run.durationMin.min}\u2013${run.durationMin.max} min`;
  }
  return `
    <div class="builder-run-row" data-w="${w}" data-dk="${dk}" data-e="${e}">
      <span class="builder-run-chip" style="background:${color}">\ud83c\udfc3 ${escapeHtml(label)}</span>
      <input type="text" value="${escapeHtml(run.notes || '')}"
        data-action="update-run" data-w="${w}" data-dk="${dk}" data-e="${e}"
        placeholder="Run target (e.g. 6x800m @ threshold, 90s rec)" class="builder-run-input">
      ${detail ? `<span class="builder-run-detail">${escapeHtml(detail)}</span>` : ''}
      <button class="btn-pad builder-mini builder-danger" data-action="remove-run" data-w="${w}" data-dk="${dk}" data-e="${e}" title="Remove run">\u2715</button>
    </div>`;
}