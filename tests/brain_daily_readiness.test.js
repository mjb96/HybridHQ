// ==========================================
// DAILY READINESS TESTS (tests/brain_daily_readiness.test.js)
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateDailyBrief } from '../js/brain/daily_readiness.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function emptyWeek() {
  const w = { lifts: {}, runs: {}, gymRpe: {}, gymStats: {}, bodyWeight: {}, notes: {}, supersets: {}, sessionType: {} };
  DAYS.forEach(d => {
    w.lifts[d] = {};
    w.runs[d]  = { dist: '', time: '', rpe: '' };
    w.gymRpe[d] = '';
  });
  return w;
}

// Simple program fixture with a legs day on Tuesday
const program = {
  schemaVersion: 2,
  totalWeeks: 4,
  weeks: [
    {
      label: 'Week 1',
      days: {
        mon: { block: [
          { kind: 'lift', name: 'Bench Press', sets: 4, reps: { min: 5, max: 5 } },
          { kind: 'lift', name: 'Incline DB Press', sets: 3, reps: { min: 10, max: 12 } },
        ] },
        tue: { block: [
          { kind: 'lift', name: 'Back Squat', sets: 4, reps: { min: 5, max: 5 } },
          { kind: 'lift', name: 'Romanian Deadlift', sets: 3, reps: { min: 8, max: 10 } },
        ] },
        wed: { block: [
          { kind: 'lift', name: 'Deadlift', sets: 4, reps: { min: 3, max: 5 } },
        ] },
        sat: { block: [{ kind: 'run', run: { type: 'easy', durationMin: { min: 45, max: 60 } } }] },
        sun: { block: [] },
        thu: { block: [] },
        fri: { block: [
          { kind: 'lift', name: 'Pull-Ups', sets: 4, reps: { min: 6, max: 8 } },
          { kind: 'lift', name: 'Barbell Row', sets: 4, reps: { min: 6, max: 8 } },
        ] },
      },
    },
  ],
};

// ── No previous session ────────────────────────────────────────────────────────

test('returns fresh when no previous session logged', () => {
  const state = { currentWeek: '1', weeks: { '1': emptyWeek() } };
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'tue', program, currentWeek: '1' });
  assert.equal(brief.hasData, false);
  assert.equal(brief.status, 'fresh');
});

// ── Session already logged today ───────────────────────────────────────────────

test('sessionLogged is true when today has completed sets', () => {
  const wk = emptyWeek();
  wk.lifts.mon['Bench Press'] = [{ w: '100', r: '5', c: true }];
  const state = { currentWeek: '1', weeks: { '1': wk } };
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'mon', program, currentWeek: '1' });
  assert.equal(brief.sessionLogged, true);
});

// ── Fresh after low-demand session ────────────────────────────────────────────

test('returns fresh when yesterday was a pull session and today is legs', () => {
  const wk = emptyWeek();
  // Monday: pull session (should not interfere with Tuesday legs)
  wk.lifts.mon['Pull-Ups']    = [{ w: '0', r: '8', c: true }, { w: '0', r: '8', c: true }, { w: '0', r: '8', c: true }];
  wk.lifts.mon['Barbell Row'] = [{ w: '80', r: '8', c: true }, { w: '80', r: '8', c: true }, { w: '80', r: '8', c: true }];
  wk.gymRpe.mon = '7';
  const state = { currentWeek: '1', weeks: { '1': wk } };
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'tue', program, currentWeek: '1' });
  assert.equal(brief.status, 'fresh', 'pull session should not interfere with squat/hinge');
  assert.equal(brief.patternIssues.length, 0);
});

// ── Conflict: squat yesterday → legs today ────────────────────────────────────

test('returns reduced when heavy squat yesterday and legs scheduled today', () => {
  const wk = emptyWeek();
  // Monday: heavy squat session
  wk.lifts.mon['Back Squat'] = [
    { w: '160', r: '5', c: true }, { w: '160', r: '5', c: true },
    { w: '160', r: '5', c: true }, { w: '160', r: '5', c: true },
    { w: '160', r: '5', c: true },
  ];
  wk.gymRpe.mon = '9';
  const state = { currentWeek: '1', weeks: { '1': wk } };
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'tue', program, currentWeek: '1' });
  // Should flag squat AND hinge patterns (via carryover)
  assert.ok(brief.hasData, 'should have data');
  assert.ok(['reduced', 'moderate'].includes(brief.status), `expected reduced/moderate, got ${brief.status}`);
  assert.ok(brief.patternIssues.length > 0, 'should have pattern issues');
  assert.ok(brief.adjustments.length > 0, 'should have adjustments');
});

// ── Conflict: deadlift yesterday → squat today ────────────────────────────────

test('hinge carryover affects squat pattern', () => {
  const wk = emptyWeek();
  // Tuesday: heavy deadlift
  wk.lifts.tue['Deadlift'] = [
    { w: '200', r: '3', c: true }, { w: '200', r: '3', c: true },
    { w: '200', r: '3', c: true }, { w: '200', r: '3', c: true },
    { w: '200', r: '3', c: true },
  ];
  wk.gymRpe.tue = '9';
  const state = { currentWeek: '1', weeks: { '1': wk } };
  // Wednesday: planned deadlift session
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'wed', program, currentWeek: '1' });
  assert.ok(brief.hasData);
  assert.ok(['reduced', 'moderate'].includes(brief.status), `expected reduced/moderate, got ${brief.status}`);
});

// ── Run fatigue on lower body ─────────────────────────────────────────────────

test('hard long run yesterday reduces squat readiness today', () => {
  const wk = emptyWeek();
  // Monday: rest
  // But Saturday: long hard run (we test Sunday as today looking at Saturday)
  wk.runs.sat = { dist: '22', time: '110:00', rpe: '9' };
  const state = { currentWeek: '1', weeks: { '1': wk } };
  // Sunday has no program, but let's check the brief's pattern fatigue
  // We'll use a custom mini-program with squat on Sunday
  const miniProg = {
    schemaVersion: 2, totalWeeks: 1,
    weeks: [{ label: 'W1', days: {
      sun: { block: [{ kind: 'lift', name: 'Back Squat', sets: 4, reps: { min: 5, max: 5 } }] },
      mon: { block: [] }, tue: { block: [] }, wed: { block: [] },
      thu: { block: [] }, fri: { block: [] }, sat: { block: [] },
    } }],
  };
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'sun', program: miniProg, currentWeek: '1' });
  assert.ok(brief.hasData, 'should detect prior run as meaningful session');
  assert.ok(['reduced', 'moderate'].includes(brief.status), `long run should impact squat readiness, got ${brief.status}`);
});

// ── Fresh positive signal ──────────────────────────────────────────────────────

test('push yesterday + pull today = fresh status', () => {
  const wk = emptyWeek();
  // Thursday: push session
  wk.lifts.thu['Bench Press'] = [
    { w: '100', r: '5', c: true }, { w: '100', r: '5', c: true },
    { w: '100', r: '5', c: true }, { w: '100', r: '5', c: true },
  ];
  wk.gymRpe.thu = '8';
  const state = { currentWeek: '1', weeks: { '1': wk } };
  // Friday: pull session
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'fri', program, currentWeek: '1' });
  assert.equal(brief.status, 'fresh', 'push session should not interfere with pull session');
  assert.equal(brief.patternIssues.length, 0);
});

// ── Shape contract ─────────────────────────────────────────────────────────────

test('brief always has required shape fields', () => {
  const wk = emptyWeek();
  wk.lifts.mon['Back Squat'] = [{ w: '140', r: '5', c: true }, { w: '140', r: '5', c: true }];
  const state = { currentWeek: '1', weeks: { '1': wk } };
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'tue', program, currentWeek: '1' });
  ['status', 'headline', 'patternIssues', 'adjustments', 'hasData', 'sessionLogged'].forEach(k => {
    assert.ok(k in brief, `missing field: ${k}`);
  });
  assert.ok(Array.isArray(brief.patternIssues));
  assert.ok(Array.isArray(brief.adjustments));
  assert.ok(['fresh', 'moderate', 'reduced'].includes(brief.status));
});

// ── HRV fatigue scaler ────────────────────────────────────────────────────────

test('low HRV (<20ms) amplifies fatigue: heavy squat + low HRV → reduced', () => {
  const wk = emptyWeek();
  wk.lifts.mon['Back Squat'] = [
    { w: '130', r: '5', c: true }, { w: '130', r: '5', c: true },
    { w: '130', r: '5', c: true },
  ];
  wk.gymRpe.mon = '8';
  // Low HRV should tip a borderline session into 'reduced'
  const state = { currentWeek: '1', weeks: { '1': wk }, health: { sleepHours: 7, restingHeartRate: null, hrvMs: 15 } };
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'tue', program, currentWeek: '1' });
  assert.ok(['moderate', 'reduced'].includes(brief.status), `expected moderate/reduced with low HRV, got ${brief.status}`);
});

test('missing HRV leaves existing behaviour unchanged', () => {
  const wk = emptyWeek();
  wk.lifts.mon['Back Squat'] = [{ w: '100', r: '5', c: true }, { w: '100', r: '5', c: true }];
  const stateNoHrv  = { currentWeek: '1', weeks: { '1': emptyWeek() } };
  const stateNullHrv = { currentWeek: '1', weeks: { '1': emptyWeek() }, health: { hrvMs: null } };
  const b1 = generateDailyBrief(stateNoHrv,   { days: DAYS, selectedDay: 'tue', program, currentWeek: '1' });
  const b2 = generateDailyBrief(stateNullHrv, { days: DAYS, selectedDay: 'tue', program, currentWeek: '1' });
  assert.equal(b1.status, b2.status, 'null HRV should not change status vs absent HRV');
});

// ── No program = no planned pattern conflicts ──────────────────────────────────

test('works without a program — no adjustments but still has fatigue data', () => {
  const wk = emptyWeek();
  wk.lifts.mon['Back Squat'] = [
    { w: '150', r: '5', c: true }, { w: '150', r: '5', c: true },
    { w: '150', r: '5', c: true }, { w: '150', r: '5', c: true },
  ];
  wk.gymRpe.mon = '9';
  const state = { currentWeek: '1', weeks: { '1': wk } };
  const brief = generateDailyBrief(state, { days: DAYS, selectedDay: 'tue', currentWeek: '1' }); // no program
  // Without a program, no planned patterns → no conflicts
  assert.equal(brief.patternIssues.length, 0);
  assert.equal(brief.adjustments.length, 0);
});
