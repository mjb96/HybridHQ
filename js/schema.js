// ==========================================
// UNIFIED PROGRAM SCHEMA v2 (schema.js)
// ------------------------------------------
// One authored tree the builder writes and the engine reads natively.
// The free-text `desc` / `runs` parsers live HERE ONLY, as one-time
// importers (migrate-on-read). Nothing on the execution hot path regex-
// parses free text once a program is in v2 form.
//
// Pure module: no DOM, no browser globals. Safe to import under node --test.
// ==========================================
import { EXERCISE_LIBRARY, PROGRAMS } from './constants.js';
import { parseTargetFromDescription, GOAL_5K_PACE_SEC, PACE_OFFSETS } from './engine.js';

export const SCHEMA_VERSION = 2;

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Pace constants are owned by engine.js (single source of truth, keeps the
// import graph acyclic). Re-exported here for builder/UI convenience.
export { GOAL_5K_PACE_SEC, PACE_OFFSETS };

// ==========================================
// CANONICAL EXERCISE LIBRARY
// Flat lookup so migrated + authored names key on the SAME strings the
// PR / e1RM / history engine already uses (it keys on the lift name).
// ==========================================
const _canonicalByLower = (() => {
  const map = new Map();
  for (const cat of Object.keys(EXERCISE_LIBRARY)) {
    for (const name of EXERCISE_LIBRARY[cat]) {
      map.set(name.toLowerCase().trim(), name);
    }
  }
  return map;
})();

export function isCanonicalExercise(name) {
  if (!name) return false;
  return _canonicalByLower.has(String(name).toLowerCase().trim());
}

// Return the library's canonical casing for a name, or the trimmed input
// unchanged (free-type is allowed; the UI nudges toward canonical later).
export function canonicalizeExercise(name) {
  if (!name) return '';
  const hit = _canonicalByLower.get(String(name).toLowerCase().trim());
  return hit || String(name).trim();
}

export function exerciseCategory(name) {
  const canon = canonicalizeExercise(name);
  for (const cat of Object.keys(EXERCISE_LIBRARY)) {
    if (EXERCISE_LIBRARY[cat].includes(canon)) return cat;
  }
  return null;
}

// ==========================================
// REP SCHEME HELPERS
// reps is { min, max } in v2 (min === max for a fixed target), or null.
// ==========================================
export function makeReps(min, max) {
  const lo = parseInt(min, 10);
  const hi = parseInt(max, 10);
  if (Number.isNaN(lo) && Number.isNaN(hi)) return null;
  if (Number.isNaN(hi)) return { min: lo, max: lo };
  if (Number.isNaN(lo)) return { min: hi, max: hi };
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}

// The single rep number to seed a working set with: top of a range (matches
// the legacy regex behaviour, which used the second number of "8–10").
export function repsTargetValue(reps, fallback = 10) {
  if (!reps) return fallback;
  return reps.max ?? reps.min ?? fallback;
}

export function formatReps(reps) {
  if (!reps) return '';
  return reps.min === reps.max ? String(reps.min) : `${reps.min}\u2013${reps.max}`;
}

// ==========================================
// RUN-STRING IMPORTER
// Best-effort typing of legacy free-text `runs`. The original string is
// ALWAYS retained in `notes` so migration is information-lossless even when
// the type/structure can't be fully recovered.
// ==========================================
const _RUN_REST = /\brest\b|no running|no structured|full recovery|recovery block/i;
const _RUN_INTERVAL = /interval|\bx\s?\d{3,4}\s?m|\d+\s?[x\u00d7]\s?\d{3,4}/i;
const _RUN_TEMPO = /tempo/i;
const _RUN_THRESHOLD = /threshold|comfortably hard/i;
const _RUN_LONG = /long run|long\b/i;
const _RUN_RACE = /parkrun|race/i;
const _RUN_EASY = /easy|zone\s?2|conversational|aerobic/i;

// Pull "6x800m (90s rest)" style reps out of a string, if present.
function parseIntervalReps(str) {
  const reps = [];
  const re = /(\d+)\s?[x\u00d7]\s?(\d{2,4})\s?(m|km|min|mins|minute|minutes)?/gi;
  let m;
  while ((m = re.exec(str)) !== null) {
    const count = parseInt(m[1], 10) || 0;
    const val = parseInt(m[2], 10) || 0;
    const unit = (m[3] || 'm').toLowerCase();
    if (count <= 0 || val <= 0) continue;
    const entry = { count, distM: null, durationSec: null, recoverySec: null, paceTarget: null };
    if (unit.startsWith('min') || unit.startsWith('minute')) entry.durationSec = val * 60;
    else if (unit === 'km') entry.distM = val * 1000;
    else entry.distM = val;
    // recovery e.g. "(90s rest)" or "(2m rest)" trailing this rep group
    const tail = str.slice(re.lastIndex, re.lastIndex + 24);
    const rec = tail.match(/(\d+)\s?(s|sec|m|min)\b/i);
    if (rec) {
      const rv = parseInt(rec[1], 10) || 0;
      entry.recoverySec = /m|min/i.test(rec[2]) ? rv * 60 : rv;
    }
    reps.push(entry);
  }
  return reps;
}

// Pull a duration like "30–40 min" / "45-60m" → { min, max } minutes.
function parseDurationMinutes(str) {
  const m = str.match(/(\d{1,3})\s?(?:[\u2013-]\s?(\d{1,3}))?\s?(?:m|min|mins|minute|minutes)\b/i);
  if (!m) return null;
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  if (Number.isNaN(lo)) return null;
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}

export function parseRunString(raw) {
  const str = (raw == null ? '' : String(raw)).trim();
  const notes = str; // always preserved
  const base = {
    type: 'rest', distanceKm: null, durationMin: null,
    reps: [], rounds: null, paceBasis: 'threshold', notes,
  };

  if (!str) return { ...base, type: 'rest', paceBasis: 'custom' };

  const dur = parseDurationMinutes(str);

  // Active run types are checked BEFORE the rest keyword, because interval
  // recoveries legitimately contain the word "rest" (e.g. "6x800m (90s rest)")
  // and must not be misread as a rest day.
  if (_RUN_INTERVAL.test(str)) {
    const reps = parseIntervalReps(str);
    return { ...base, type: 'intervals', reps, paceBasis: 'interval' };
  }
  if (_RUN_TEMPO.test(str))     return { ...base, type: 'tempo', durationMin: dur, paceBasis: 'tempo' };
  if (_RUN_THRESHOLD.test(str)) return { ...base, type: 'threshold', durationMin: dur, paceBasis: 'threshold' };
  if (_RUN_RACE.test(str))      return { ...base, type: 'race', paceBasis: 'goal' };
  if (_RUN_LONG.test(str))      return { ...base, type: 'long', durationMin: dur, paceBasis: 'easy' };
  if (_RUN_EASY.test(str))      return { ...base, type: 'easy', durationMin: dur, paceBasis: 'easy' };

  // No active markers: an explicit rest/recovery day, or unknown text.
  if (_RUN_REST.test(str)) return { ...base, type: 'rest', paceBasis: 'custom' };

  // Unknown but non-empty: keep as easy + retain text (lossless).
  return { ...base, type: 'easy', durationMin: dur, paceBasis: 'easy' };
}

// ==========================================
// LIFT-STRING IMPORTER (per lift, via the existing regex parser)
// ==========================================
function liftEntryFromBlueprint(name, desc, weekModifier) {
  const canon = canonicalizeExercise(name);
  const parsed = parseTargetFromDescription(desc, name); // { sets, reps }
  const usedInline = !!(desc && new RegExp(name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\s*\\(', 'i').test(desc));
  const sets = usedInline ? parsed.sets : (weekModifier?.sets ?? parsed.sets ?? 3);
  const repsVal = usedInline ? parsed.reps : (weekModifier?.reps ?? parsed.reps ?? 10);
  return {
    kind: 'lift',
    name: canon,
    sets: Math.max(1, parseInt(sets, 10) || 3),
    reps: makeReps(repsVal, repsVal),
    rpe: null,
    pct1rm: null,
    restSec: null,
    group: null,
    notes: '',
  };
}

// ==========================================
// PROGRAM MIGRATION  (v1 days{} + weeklyVolModifiers  →  v2 weeks[])
// Pure + idempotent. A program already at SCHEMA_VERSION is returned as-is.
// ==========================================
export function migrateProgramToV2(prog) {
  if (!prog) return prog;
  if (prog.schemaVersion === SCHEMA_VERSION && Array.isArray(prog.weeks) && prog.weeks[0]?.days) {
    return prog;
  }

  const totalWeeks = parseInt(prog.totalWeeks, 10) || 12;
  const srcDays = prog.days || {};
  const mods = prog.weeklyVolModifiers || {};

  const weeks = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const mod = mods[String(w)] || { sets: 4, reps: 5, intensityLabel: 'Working Sets' };
    const days = {};
    for (const dk of DAY_KEYS) {
      const bp = srcDays[dk] || { title: 'Rest', badge: 'Rest', color: 'var(--text-muted)', desc: '', runs: 'Rest', lifts: [] };
      const block = [];
      (bp.lifts || []).forEach(name => block.push(liftEntryFromBlueprint(name, bp.desc, mod)));
      const run = parseRunString(bp.runs);
      if (run.type !== 'rest') block.push({ kind: 'run', run });
      days[dk] = {
        title: bp.title || 'Rest',
        badge: bp.badge || 'Rest',
        color: bp.color || 'var(--text-muted)',
        notes: bp.desc || '',
        block,
      };
    }
    weeks.push({ label: mod.intensityLabel || `Week ${w}`, days });
  }

  return {
    id: prog.id,
    name: prog.name,
    totalWeeks,
    dossier: prog.dossier,
    color: prog.color || null,
    schemaVersion: SCHEMA_VERSION,
    weeks,
  };
}

// ==========================================
// MIGRATE-ON-READ (non-destructive, memoised)
// Resolves a v2 view without mutating the stored object. Custom programs are
// guaranteed to be v2 after first load (write-through in state.js), so this
// path is only hit for built-in PROGRAMS constants that have never been stored.
// ==========================================
const _v2Cache = new WeakMap();

function isV2Program(prog) {
  return !!(prog && prog.schemaVersion === SCHEMA_VERSION
    && Array.isArray(prog.weeks) && prog.weeks[0]?.days
    && !Array.isArray(prog.weeks[0].days));
}

export function resolveProgramV2(prog) {
  if (!prog) return prog;
  if (isV2Program(prog)) return prog;
  if (_v2Cache.has(prog)) return _v2Cache.get(prog);
  const v2 = migrateProgramToV2(prog);
  _v2Cache.set(prog, v2);
  return v2;
}

// The day blueprint (presentation + block) for a given week + day key.
// Clamps the week to the available range so weeks beyond totalWeeks reuse
// the last authored week (matches how weeklyVolModifiers used to be looked up
// loosely, never throwing).
export function getDayV2(prog, week, dayKey) {
  const v2 = resolveProgramV2(prog);
  if (!v2 || !Array.isArray(v2.weeks) || v2.weeks.length === 0) return null;
  const idx = Math.min(Math.max(0, (parseInt(week, 10) || 1) - 1), v2.weeks.length - 1);
  const wk = v2.weeks[idx];
  if (!wk || !wk.days) return null;
  return { week: wk, label: wk.label, day: wk.days[dayKey] || null };
}

// ==========================================
// DERIVED-ON-READ COMPAT SHIMS
// Downstream consumers (cockpit, analytics, library day-split) still ask for
// `lifts[]` (names) and a `runs` display string. Derive them from block so
// those paths keep working until Phase 5 migrates them to read block directly.
// ==========================================
export function dayLiftNames(dayV2) {
  if (!dayV2 || !Array.isArray(dayV2.block)) return [];
  return dayV2.block.filter(e => e.kind === 'lift').map(e => e.name);
}

export function dayLiftEntries(dayV2) {
  if (!dayV2 || !Array.isArray(dayV2.block)) return [];
  return dayV2.block.filter(e => e.kind === 'lift');
}

export function dayRunWorkout(dayV2) {
  if (!dayV2 || !Array.isArray(dayV2.block)) return null;
  const r = dayV2.block.find(e => e.kind === 'run');
  return r ? r.run : null;
}

// Predicate factory: (week, dayKey) => bool — is a non-rest run scheduled?
// Bridges the schema layer to engine.js's adherence/completion calculators,
// which must stay schema-agnostic (no schema.js import → no import cycle).
export function isRunScheduledResolver(prog) {
  return (week, dayKey) => {
    const run = dayRunWorkout(getDayV2(prog, week, dayKey)?.day);
    return !!run && run.type !== 'rest';
  };
}

// Render a structured RunWorkout to a human display string (for legacy-shaped
// display consumers that expect a `runs` string).
export function formatRunDisplay(run) {
  if (!run || run.type === 'rest') return 'Rest';
  const label = run.type.charAt(0).toUpperCase() + run.type.slice(1);
  if (Array.isArray(run.reps) && run.reps.length) {
    const parts = run.reps.map(r => {
      const amt = r.distM ? `${r.distM}m` : (r.durationSec ? `${Math.round(r.durationSec / 60)}min` : '');
      const rec = r.recoverySec ? ` (${r.recoverySec}s rec)` : '';
      return `${r.count}\u00d7${amt}${rec}`;
    });
    return `${label}: ${parts.join(', ')}`;
  }
  if (run.durationMin) {
    const d = run.durationMin.min === run.durationMin.max
      ? `${run.durationMin.min} min`
      : `${run.durationMin.min}\u2013${run.durationMin.max} min`;
    return `${label}: ${d}`;
  }
  return run.notes ? `${label}: ${run.notes}` : label;
}

// Return a LEGACY-SHAPED day blueprint ({title,badge,color,desc,runs,lifts})
// for any program + week + day, so display consumers (cockpit, dashboard,
// library day-split) work uniformly. Seeded programs pass through their
// curated days{} unchanged; v2 programs derive the shape from the v2 day.
// The synthesised `desc` ("Name (SxR)") round-trips through the engine's
// existing parseTargetFromDescription, so target-label code needs no change.
export function getDisplayBlueprint(prog, week, dayKey) {
  if (prog && prog.schemaVersion !== SCHEMA_VERSION && prog.days && prog.days[dayKey]) {
    return prog.days[dayKey];
  }
  const v2 = getDayV2(prog, week, dayKey);
  const day = v2?.day;
  if (!day) return { title: 'Rest', badge: 'Rest', color: 'var(--text-muted)', desc: '', runs: 'Rest', lifts: [] };
  const lifts = dayLiftEntries(day);
  const run = dayRunWorkout(day);
  const hasContent = lifts.length > 0 || (run && run.type !== 'rest');
  const desc = lifts.map(e => `${e.name} (${e.sets}x${repsTargetValue(e.reps)})`).join(', ');
  return {
    title: day.title || (hasContent ? 'Training Day' : 'Rest'),
    badge: (day.title && day.title.trim()) || (hasContent ? 'Train' : 'Rest'),
    color: day.color || 'var(--text-muted)',
    desc,
    runs: formatRunDisplay(run),
    lifts: lifts.map(e => e.name),
  };
}

// Pull the v2 day blueprint for ALL seeded + custom programs once. Useful for
// migration round-trip tests and for any one-shot tooling.
export function migrateAllSeededPrograms() {
  const out = {};
  for (const id of Object.keys(PROGRAMS)) {
    out[id] = migrateProgramToV2({ id, ...PROGRAMS[id] });
  }
  return out;
}

// ==========================================
// V2 CONSTRUCTORS (builder writer + new custom programs)
// ==========================================
export function makeLiftEntry(partial = {}) {
  return {
    kind: 'lift',
    name: canonicalizeExercise(partial.name || ''),
    sets: Math.max(1, parseInt(partial.sets, 10) || 3),
    reps: partial.reps ?? makeReps(partial.repMin ?? 10, partial.repMax ?? partial.repMin ?? 10),
    rpe: partial.rpe ?? null,
    pct1rm: partial.pct1rm ?? null,
    restSec: partial.restSec ?? null,
    group: partial.group ?? null,
    notes: partial.notes ?? '',
  };
}

export function makeRunEntry(run) {
  return { kind: 'run', run: run || parseRunString('') };
}

export function emptyDayV2(title = '') {
  return { title, badge: 'Rest', color: 'var(--text-muted)', notes: '', block: [] };
}

export function emptyWeekV2(label = '') {
  const days = {};
  for (const dk of DAY_KEYS) days[dk] = emptyDayV2();
  return { label, days };
}

export function createEmptyV2Program({ id, name, totalWeeks, dossier, color } = {}) {
  const tw = parseInt(totalWeeks, 10) || 12;
  const weeks = [];
  for (let w = 1; w <= tw; w++) weeks.push(emptyWeekV2(`Week ${w}`));
  return {
    id, name: name || 'New Custom Program', totalWeeks: tw,
    dossier: dossier || { creator: 'You', focus: 'Custom Focus', philosophy: 'A custom built training block.' },
    color: color || null,
    schemaVersion: SCHEMA_VERSION,
    weeks,
  };
}

// Flat, de-duplicated, sorted canonical exercise list — feeds the builder's
// autocomplete datalist.
export function allCanonicalExercises() {
  const set = new Set();
  for (const cat of Object.keys(EXERCISE_LIBRARY)) {
    for (const name of EXERCISE_LIBRARY[cat]) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ==========================================
// LEGACY POSITIONAL BUILDER  →  v2
// The pre-v2 builder wrote weeks[] = [{ days: [{ dayName, runs,
// exercises:[{name,targetSets,targetReps}] }] }]. Positional days map to
// mon..sun by index (the old builder had no day-of-week concept). Content is
// preserved; only the slot assignment is inferred.
// ==========================================
function migrateLegacyPositionalToV2(prog) {
  const totalWeeks = parseInt(prog.totalWeeks, 10) || (Array.isArray(prog.weeks) ? prog.weeks.length : 12) || 12;
  const srcWeeks = Array.isArray(prog.weeks) ? prog.weeks : [];
  const weeks = [];
  for (let w = 0; w < totalWeeks; w++) {
    const src = srcWeeks[w] || srcWeeks[srcWeeks.length - 1] || { days: [] };
    const days = {};
    for (const dk of DAY_KEYS) days[dk] = emptyDayV2();
    (src.days || []).forEach((d, i) => {
      if (i >= DAY_KEYS.length) return; // beyond 7 positional days is dropped-to-cap (rare)
      const dk = DAY_KEYS[i];
      const block = [];
      (d.exercises || []).forEach(ex => {
        if (!ex || !(ex.name || '').trim()) return;
        block.push(makeLiftEntry({ name: ex.name, sets: ex.targetSets, repMin: ex.targetReps, repMax: ex.targetReps }));
      });
      const run = parseRunString(d.runs);
      if (run.type !== 'rest') block.push(makeRunEntry(run));
      days[dk] = { title: d.dayName || '', badge: 'Rest', color: 'var(--text-muted)', notes: '', block };
    });
    weeks.push({ label: `Week ${w + 1}`, days });
  }
  return {
    id: prog.id, name: prog.name, totalWeeks,
    dossier: prog.dossier, color: prog.color || null,
    schemaVersion: SCHEMA_VERSION, weeks,
  };
}

// Smart, lossless migration of a stored CUSTOM program to v2. Picks the source
// of truth: structured `days{}` if it carries lifts (it's what executed),
// otherwise the orphaned positional `weeks[]` (the user's authored intent),
// otherwise an empty skeleton. Idempotent.
export function migrateCustomProgramToV2(prog) {
  if (!prog) return prog;
  if (isV2Program(prog)) return prog;

  const daysHaveLifts = prog.days && Object.values(prog.days).some(d => (d?.lifts || []).length > 0);
  if (daysHaveLifts) return migrateProgramToV2(prog);

  const positionalHasContent = Array.isArray(prog.weeks) && prog.weeks.some(w =>
    (w?.days || []).some(d => (d?.exercises || []).length > 0 || (d?.runs && d.runs !== 'Rest')));
  if (positionalHasContent) return migrateLegacyPositionalToV2(prog);

  return migrateProgramToV2(prog); // empty days{} → sized-but-empty v2 skeleton
}