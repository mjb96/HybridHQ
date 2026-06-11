// ==========================================
// BUILDER PROGRESSION TEMPLATING (builder-progression.js)
// Pure logic: author Week 1, generate later weeks by a rule. No DOM.
// Testable via node --test. The builder calls buildProgressionWeeks() and
// replaces program.weeks with the result.
// ==========================================
import { DAY_KEYS } from './schema.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const clampRpe = (n) => Math.min(10, Math.max(1, Math.round(n * 2) / 2)); // nearest 0.5

// Default rule — every field optional / "off".
export const DEFAULT_PROGRESSION_RULE = {
  setsAddEvery: 0,        // +1 set every N weeks (0 = off)
  rpeRampPerWeek: 0,      // + per week to a lift's RPE target (if set)
  pct1rmRampPerWeek: 0,   // + per week to a lift's %1RM target (if set)
  runProgressPerWeek: 0,  // fractional bump to interval rep distance/duration (e.g. 0.10 = +10%/wk)
  deloadLastWeek: false,  // final week becomes a deload (reduced volume + effort)
};

function applyLiftProgression(entry, step, rule, isDeload) {
  const e = clone(entry);
  if (isDeload) {
    e.sets = Math.max(1, Math.round((entry.sets || 1) * 0.6));
    if (e.rpe != null) e.rpe = clampRpe(e.rpe - 2);
    return e;
  }
  if (rule.setsAddEvery > 0) {
    e.sets = (entry.sets || 1) + Math.floor(step / rule.setsAddEvery);
  }
  if (rule.rpeRampPerWeek && e.rpe != null) {
    e.rpe = clampRpe(e.rpe + rule.rpeRampPerWeek * step);
  }
  if (rule.pct1rmRampPerWeek && e.pct1rm != null) {
    e.pct1rm = Math.round((e.pct1rm + rule.pct1rmRampPerWeek * step) * 10) / 10;
  }
  return e;
}

function applyRunProgression(run, step, rule, isDeload) {
  const r = clone(run);
  const factor = isDeload ? 0.5 : (1 + (rule.runProgressPerWeek || 0) * step);
  if (factor === 1) return r;
  if (Array.isArray(r.reps) && r.reps.length) {
    r.reps = r.reps.map(rep => {
      const out = { ...rep };
      if (rep.distM) out.distM = Math.round((rep.distM * factor) / 50) * 50;       // nearest 50m
      else if (rep.durationSec) out.durationSec = Math.round((rep.durationSec * factor) / 15) * 15; // nearest 15s
      return out;
    });
  } else if (r.durationMin) {
    r.durationMin = {
      min: Math.max(1, Math.round(r.durationMin.min * factor)),
      max: Math.max(1, Math.round(r.durationMin.max * factor)),
    };
  }
  return r;
}

function progressDay(baseDay, step, rule, isDeload) {
  const d = clone(baseDay);
  d.block = (baseDay.block || []).map(en => {
    if (en.kind === 'run') return { kind: 'run', run: applyRunProgression(en.run, step, rule, isDeload) };
    return applyLiftProgression(en, step, rule, isDeload);
  });
  return d;
}

// Build `numWeeks` weeks from a single authored base week.
// Week 1 is a clean copy of the base; weeks 2..N apply the rule cumulatively
// (step = weekIndex - 1). If deloadLastWeek, the final week is a deload.
export function buildProgressionWeeks(baseWeek, rule = DEFAULT_PROGRESSION_RULE, numWeeks = 1) {
  const n = Math.max(1, parseInt(numWeeks, 10) || 1);
  const weeks = [];
  for (let w = 0; w < n; w++) {
    const isDeload = rule.deloadLastWeek && w === n - 1 && n > 1;
    const days = {};
    for (const dk of DAY_KEYS) {
      const baseDay = baseWeek.days?.[dk] || { title: '', block: [] };
      days[dk] = (w === 0) ? clone(baseDay) : progressDay(baseDay, w, rule, isDeload);
    }
    let label = baseWeek.label || `Week ${w + 1}`;
    if (w > 0) label = isDeload ? `Week ${w + 1} (Deload)` : `Week ${w + 1}`;
    weeks.push({ label, days });
  }
  return weeks;
}
