// ==========================================
// HYBRID BRAIN — PHASE B COVERAGE TESTS (tests/brain_coverage.test.js)
// New findings for the previously "dark" domains: body weight, fuel, recovery.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeBodyComp, analyzeFuel, analyzeRecovery } from '../js/brain/analysis.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

test('body-weight: a rising log produces an up bodyweight_trend', () => {
  const state = { bodyWeightLog: [
    { date: '2026-05-01', weight: 80 },
    { date: '2026-05-08', weight: 80.6 },
    { date: '2026-05-15', weight: 81.4 },
  ] };
  const [f] = analyzeBodyComp(state);
  assert.ok(f);
  assert.equal(f.domain, 'bodyweight');
  assert.equal(f.direction, 'up');
  assert.equal(f.magnitude, 1.4);
});

test('body-weight: stable weight or <3 entries yields no finding', () => {
  assert.deepEqual(analyzeBodyComp({ bodyWeightLog: [{ date: '2026-05-01', weight: 80 }] }), []);
  assert.deepEqual(analyzeBodyComp({ bodyWeightLog: [
    { date: '2026-05-01', weight: 80 }, { date: '2026-05-08', weight: 80.1 }, { date: '2026-05-15', weight: 80 },
  ] }), []);
});

test('fuel: a rising weekly-calorie series produces an up fuel_trend', () => {
  const wk = (cals) => ({ runs: { sat: { cals: String(cals) } }, gymStats: {} });
  const state = { weeks: { '1': wk(2000), '2': wk(2600), '3': wk(3200) } };
  const [f] = analyzeFuel(state, DAYS, 3);
  assert.ok(f);
  assert.equal(f.domain, 'fuel');
  assert.equal(f.direction, 'up');
});

test('recovery: a low score is a down status; high is up', () => {
  // high RPE everywhere, no rest → low recovery score
  const lowState = { currentWeek: '1', weeks: { '1': {
    gymRpe: { mon: '9', tue: '9', wed: '9', thu: '9', fri: '9', sat: '9', sun: '9' },
    runs: {}, lifts: { mon: { Squat: [{ w: '100', r: '5', c: true }] } },
  } } };
  const [low] = analyzeRecovery(lowState, DAYS);
  assert.ok(low);
  assert.equal(low.domain, 'recovery');
  assert.equal(low.direction, 'down');
  assert.ok(low.severity >= 0.5);

  const highState = { currentWeek: '1', weeks: { '1': { gymRpe: { mon: '3' }, runs: {}, lifts: {} } } };
  const [high] = analyzeRecovery(highState, DAYS);
  assert.ok(high);
  assert.equal(high.direction, 'up');
});

test('recovery: no RPE data → no finding', () => {
  assert.deepEqual(analyzeRecovery({ currentWeek: '1', weeks: { '1': {} } }, DAYS), []);
});
