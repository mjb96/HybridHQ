// ==========================================
// ENGINE PRIMITIVE TESTS (tests/engine.test.js)
// Foundation suite for the centralised metric primitives:
//   epley1RM, isCompletedSet, parseDurationToMinutes,
//   paceSecondsPerKm, formatPace
// These are the single-source calculations consumed by analytics, home,
// dashboard, workout and state — so future Hybrid Brain logic can rely on
// them instead of re-deriving its own. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  epley1RM,
  isCompletedSet,
  parseDurationToMinutes,
  paceSecondsPerKm,
  formatPace,
  initEngine,
  computeDiagnosticForLift,
  getLiftId,
  getLiftDisplayName,
  resolveLiftKey,
  findLastPerformance,
} from '../js/engine.js';

// ---- epley1RM (D1) --------------------------------------------------------
test('epley1RM computes the Epley estimate w*(1+r/30)', () => {
  assert.equal(epley1RM(100, 5), 100 * (1 + 5 / 30));
  assert.ok(Math.abs(epley1RM(60, 1) - 62) < 1e-9); // single rep ≈ load + 1/30
  assert.equal(epley1RM(100, 0), 0);            // zero reps → 0
  assert.equal(epley1RM(0, 5), 0);              // zero load → 0
});

test('epley1RM coerces string inputs and guards garbage', () => {
  assert.equal(epley1RM('100', '5'), 100 * (1 + 5 / 30));
  assert.equal(epley1RM('abc', '5'), 0);
  assert.equal(epley1RM(-50, 5), 0);            // negative load → 0
});

// ---- isCompletedSet (D2) --------------------------------------------------
test('isCompletedSet accepts every legacy "truthy completed" encoding', () => {
  for (const c of [true, 'true', 'on', 1]) {
    assert.equal(isCompletedSet({ c }), true, `c=${JSON.stringify(c)}`);
  }
});

test('isCompletedSet rejects incomplete / malformed sets', () => {
  for (const v of [{ c: false }, { c: 0 }, { c: 'off' }, {}, null, undefined]) {
    assert.equal(isCompletedSet(v), false, `value=${JSON.stringify(v)}`);
  }
});

// ---- parseDurationToMinutes (D3) -----------------------------------------
test('parseDurationToMinutes handles h:mm:ss, mm:ss, bare minutes', () => {
  assert.equal(parseDurationToMinutes('1:30:00'), 90);
  assert.equal(parseDurationToMinutes('30:00'), 30);
  assert.equal(parseDurationToMinutes('45'), 45);
  assert.equal(parseDurationToMinutes('0:30'), 0.5);
});

test('parseDurationToMinutes returns 0 for empty / malformed input', () => {
  assert.equal(parseDurationToMinutes(''), 0);
  assert.equal(parseDurationToMinutes(null), 0);
  assert.equal(parseDurationToMinutes(undefined), 0);
  assert.equal(parseDurationToMinutes('x:y'), 0);
});

// ---- paceSecondsPerKm (D6) -----------------------------------------------
test('paceSecondsPerKm = total seconds / distance(km)', () => {
  assert.equal(paceSecondsPerKm(5, '25:00'), 300);     // 1500s / 5km
  assert.equal(paceSecondsPerKm(10, '50:00'), 300);
  assert.equal(paceSecondsPerKm(2, '1:00:00'), 1800);  // h:mm:ss form
});

test('paceSecondsPerKm returns 0 when distance or time is missing', () => {
  assert.equal(paceSecondsPerKm(0, '25:00'), 0);
  assert.equal(paceSecondsPerKm(5, ''), 0);
  assert.equal(paceSecondsPerKm('', '25:00'), 0);
});

// ---- formatPace (D6) ------------------------------------------------------
test('formatPace renders m:ss/km with zero-padded seconds', () => {
  assert.equal(formatPace(300), '5:00/km');
  assert.equal(formatPace(305), '5:05/km');
  assert.equal(formatPace(0), '--');
  assert.equal(formatPace(null), '--');
});

// ---- round-trip ------------------------------------------------------------
test('pace round-trips: format(paceSecondsPerKm(dist,time)) is stable', () => {
  assert.equal(formatPace(paceSecondsPerKm(5, '25:00')), '5:00/km');
});

// ---- computeDiagnosticForLift — per-set RPE (D7) --------------------------
// Helpers: one week of history so history.length===1 (stall check skipped),
// RPE path reached.
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const makeDiagState = (week1Sets, week1GymRpe = null) => ({
  currentWeek: '2',
  weeks: {
    '1': {
      lifts: { mon: { Squat: week1Sets } },
      gymRpe: week1GymRpe != null ? { mon: String(week1GymRpe) } : {},
      runs: {},
      gymStats: {},
      notes: {},
    },
    '2': { lifts: { mon: { Squat: [] } }, gymRpe: {}, runs: {}, gymStats: {}, notes: {} },
  },
  streakData: {},
});

test('computeDiagnosticForLift: per-set rpe >= threshold flags fatigue overload', () => {
  const sets = [
    { w: '80', r: '5', c: true, rpe: '9' },
    { w: '80', r: '5', c: true, rpe: '9.5' },
  ];
  initEngine(() => makeDiagState(sets), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
  assert.equal(r.isFatigueOverload, true);
});

test('computeDiagnosticForLift: per-set rpe < threshold does not flag fatigue overload', () => {
  const sets = [
    { w: '80', r: '5', c: true, rpe: '7' },
    { w: '80', r: '5', c: true, rpe: '7.5' },
  ];
  initEngine(() => makeDiagState(sets), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
  assert.equal(r.isFatigueOverload, false);
});

test('computeDiagnosticForLift: falls back to session-level rpe when no per-set rpe', () => {
  const sets = [{ w: '80', r: '5', c: true }, { w: '80', r: '5', c: true }];
  initEngine(() => makeDiagState(sets, 9), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
  assert.equal(r.isFatigueOverload, true);
});

test('computeDiagnosticForLift: no rpe data at all does not flag fatigue overload', () => {
  const sets = [{ w: '80', r: '5', c: true }];
  initEngine(() => makeDiagState(sets, null), () => DAYS);
  const r = computeDiagnosticForLift('2', 'mon', 'Squat');
  assert.equal(r.isFatigueOverload, false);
});

// ---- getLiftId / getLiftDisplayName / resolveLiftKey (D8) --------------------
test('getLiftId creates a stable ID and populates both maps', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  const id = getLiftId(state, 'Squat');
  assert.ok(id.startsWith('lift_'));
  assert.equal(state.liftIdMap['Squat'], id);
  assert.equal(state.liftNames[id], 'Squat');
});

test('getLiftId returns the same ID on repeated calls', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  const id1 = getLiftId(state, 'Bench Press');
  const id2 = getLiftId(state, 'Bench Press');
  assert.equal(id1, id2);
});

test('getLiftId returns empty string for empty / nullish input', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  assert.equal(getLiftId(state, ''), '');
  assert.equal(getLiftId(state, null), '');
});

test('getLiftDisplayName resolves ID back to display name', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  const id = getLiftId(state, 'Deadlift');
  assert.equal(getLiftDisplayName(state, id), 'Deadlift');
});

test('getLiftDisplayName falls back to raw value for unregistered IDs', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  assert.equal(getLiftDisplayName(state, 'Squat'), 'Squat');
  assert.equal(getLiftDisplayName(state, 'lift_unknown'), 'lift_unknown');
});

test('resolveLiftKey maps display name to ID after registration', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  const id = getLiftId(state, 'Overhead Press');
  assert.equal(resolveLiftKey(state, 'Overhead Press'), id);
});

test('resolveLiftKey falls back to the raw string for unregistered names', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  assert.equal(resolveLiftKey(state, 'Unknown'), 'Unknown');
});

// ---- findLastPerformance with ID-keyed storage (D9) -------------------------
test('findLastPerformance works on ID-keyed state (post-migration)', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  const id = getLiftId(state, 'Squat');
  state.currentWeek = '2';
  state.weeks = {
    '1': { lifts: { mon: { [id]: [{ w: '100', r: '5', c: true }] } } },
    '2': { lifts: { mon: { [id]: [] } } },
  };
  const result = findLastPerformance(state, 'Squat', { excludeWeek: '2', days: DAYS });
  assert.ok(result, 'should find last performance');
  assert.equal(result.workingSets[0].w, '100');
});

test('findLastPerformance rename safety: history survives display-name change', () => {
  const state = { liftIdMap: {}, liftNames: {} };
  const id = getLiftId(state, 'Back Squat');
  state.currentWeek = '2';
  state.weeks = {
    '1': { lifts: { mon: { [id]: [{ w: '120', r: '3', c: true }] } } },
    '2': { lifts: { mon: { [id]: [] } } },
  };
  // Simulate rename: 'Back Squat' → 'Low Bar Squat'
  state.liftIdMap['Low Bar Squat'] = id;
  state.liftNames[id] = 'Low Bar Squat';

  const result = findLastPerformance(state, 'Low Bar Squat', { excludeWeek: '2', days: DAYS });
  assert.ok(result, 'history must be found under the new name');
  assert.equal(result.workingSets[0].w, '120');
});
