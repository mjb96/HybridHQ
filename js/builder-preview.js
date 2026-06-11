// ==========================================
// BUILDER LIVE PREVIEW (builder-preview.js)
// Shows what the engine will ACTUALLY prescribe for a day — calling the real
// prescribeSetsForLift path — so authoring closes the loop with execution
// instead of guessing. Read-only.
// ==========================================
import { escapeHtml } from './util.js';
import { prescribeSetsForLift, derivePaceForRun } from './engine.js';
import { dayLiftEntries, dayRunWorkout } from './schema.js';
import { formatPaceSec } from './builder-run-editor.js';

// w is 0-based (builder week index); engine weeks are 1-based string keys.
export function renderDayPreview(dayV2, w, dk, weekLabel, thresholdSec) {
  if (!dayV2) return '';
  const wk = String(w + 1);
  const entries = dayLiftEntries(dayV2);
  const run = dayRunWorkout(dayV2);
  if (entries.length === 0 && !run) return '';

  const liftLines = entries.map(en => {
    let sets;
    try { sets = prescribeSetsForLift(wk, dk, en, { label: weekLabel }); }
    catch { sets = []; }
    const reps = sets[0]?.r ?? '';
    const wgt = sets[0]?.w ? ` @ ${sets[0].w}kg` : '';
    return `<div class="prev-line"><span class="prev-name">${escapeHtml(en.name || '(unnamed)')}</span><span class="prev-rx">${sets.length} \u00d7 ${escapeHtml(String(reps))}${escapeHtml(wgt)}</span></div>`;
  }).join('');

  let runLine = '';
  if (run && run.type !== 'rest') {
    const d = derivePaceForRun(run, thresholdSec);
    let detail = '';
    if (Array.isArray(d.reps) && d.reps.length) {
      detail = d.reps.map(r => {
        const amt = r.distM ? `${r.distM}m` : (r.durationSec ? `${Math.round(r.durationSec / 60)}min` : '');
        const pace = r.paceTarget ? ` @ ${formatPaceSec(r.paceTarget)}` : '';
        return `${r.count}\u00d7${amt}${pace}`;
      }).join(', ');
    } else {
      const dur = run.durationMin ? `${run.durationMin.max ?? run.durationMin.min} min` : '';
      const pace = d.paceTargetSec ? ` @ ${formatPaceSec(d.paceTargetSec)}` : '';
      detail = `${dur}${pace}`.trim() || run.type;
    }
    runLine = `<div class="prev-line"><span class="prev-name">\ud83c\udfc3 ${escapeHtml(run.type)}</span><span class="prev-rx">${escapeHtml(detail)}</span></div>`;
  }

  return `
    <div class="builder-preview">
      <div class="builder-preview-head">Engine will prescribe</div>
      ${liftLines}${runLine}
    </div>`;
}
