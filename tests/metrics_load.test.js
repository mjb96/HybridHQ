// ==========================================
// METRICS-LOAD TESTS
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  weeklyLoadSeries,
  weeklyRpeSeries,
  readinessMetrics,
  recoveryMetrics,
  streakView,
} from '../js/metrics/metrics-load.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function fixture() {
  return {
    currentWeek: '2',
    weeks: {
      '1': {
        lifts: { mon: { 'Back Squat': [{ w: '100', r: '5', c: true }] } },
        gymRpe:   { mon: '7' },
        gymStats: { mon: { time: '60' } },      // 60 min
        runs:     { sat: { dist: '8', time: '40:00', rpe: '6' } },
      },
      '2': {
        lifts: { mon: { 'Back Squat': [{ w: '105', r: '5', c: true }] } },
        gymRpe:   { mon: '8' },
        gymStats: { mon: { time: '55' } },      // 55 min
        runs:     { sat: { dist: '10', time: '50:00', rpe: '7' } },
      },
    },
  };
}

// ---- weeklyLoadSeries --------------------------------------------------
test('weeklyLoadSeries returns {lift, run} sRPE per week', () => {
  const result = weeklyLoadSeries(fixture(), DAYS, 2);
  // wk1: gym 7*60=420 + run 6*40=240; wk2: gym 8*55=440 + run 7*50=350
  assert.deepEqual(result.lift, [420, 440]);
  assert.deepEqual(result.run,  [240, 350]);
});

test('weeklyLoadSeries handles empty state', () => {
  const result = weeklyLoadSeries({ weeks: {} }, DAYS, 2);
  assert.deepEqual(result.lift, [0, 0]);
  assert.deepEqual(result.run,  [0, 0]);
});

// ---- weeklyRpeSeries ---------------------------------------------------
test('weeklyRpeSeries combines gym and run RPE into a single weekly average', () => {
  const result = weeklyRpeSeries(fixture(), DAYS, 2);
  // wk1: gym RPE=7, run RPE=6 → avg = 6.5
  assert.equal(result[0], 6.5);
  // wk2: gym RPE=8, run RPE=7 → avg = 7.5
  assert.equal(result[1], 7.5);
});

test('weeklyRpeSeries returns 0 for weeks with no RPE data', () => {
  const result = weeklyRpeSeries({ weeks: {} }, DAYS, 2);
  assert.deepEqual(result, [0, 0]);
});

test('weeklyRpeSeries handles gym-only weeks', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { gymRpe: { mon: '8' }, gymStats: { mon: { time: '45' } } } },
  };
  const result = weeklyRpeSeries(state, DAYS, 1);
  assert.equal(result[0], 8);
});

test('weeklyRpeSeries handles run-only weeks', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { runs: { tue: { dist: '5', time: '25:00', rpe: '6' } } } },
  };
  const result = weeklyRpeSeries(state, DAYS, 1);
  assert.equal(result[0], 6);
});

// ---- readinessMetrics --------------------------------------------------
test('readinessMetrics computes ACWR from combined load', () => {
  const result = readinessMetrics(fixture(), DAYS, '2', 2);
  assert.equal(result.hasData, true);
  assert.ok(result.acwr > 0);
  // acute (wk2) = 440+350 = 790; chronic (wk1) = 420+240 = 660
  assert.equal(result.acute, 790);
  assert.equal(result.chronic, 660);
  assert.ok(result.acwr > 1, 'wk2 load is higher than wk1 → ACWR > 1');
});

test('readinessMetrics returns hasData:false with insufficient history', () => {
  const oneWeek = { currentWeek: '1', weeks: { '1': fixture().weeks['1'] } };
  const result = readinessMetrics(oneWeek, DAYS, '1', 1);
  assert.equal(result.hasData, false);
});

test('readinessMetrics handles empty state', () => {
  const result = readinessMetrics({ weeks: {} }, DAYS, '1', 2);
  assert.equal(result.hasData, false);
});

// ---- recoveryMetrics ---------------------------------------------------
test('recoveryMetrics returns a score and recommendation for the current week', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': {
        gymRpe: { mon: '6', wed: '6' },
        runs: { sat: { dist: '5', time: '25:00', rpe: '5' } },
      },
    },
  };
  const result = recoveryMetrics(state, DAYS);
  assert.equal(result.hasData, true);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(typeof result.recommendation === 'string' && result.recommendation.length > 0);
});

test('recoveryMetrics returns hasData:false when no RPE logged', () => {
  const state = { currentWeek: '1', weeks: { '1': {} } };
  const result = recoveryMetrics(state, DAYS);
  assert.equal(result.hasData, false);
});

// ---- streakView --------------------------------------------------------
test('streakView returns current and longest streak', () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const streakData = {
    current: 5,
    longest: 12,
    lastActivityDate: yesterday.toISOString().slice(0, 10),
  };
  const result = streakView(streakData);
  assert.equal(result.current, 5);
  assert.equal(result.longest, 12);
  assert.equal(result.broken, false);
  assert.equal(result.hasData, true);
});

test('streakView detects a broken streak', () => {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const streakData = {
    current: 5,
    longest: 10,
    lastActivityDate: threeDaysAgo.toISOString().slice(0, 10),
  };
  const result = streakView(streakData);
  assert.equal(result.current, 0);
  assert.equal(result.broken, true);
});

test('streakView handles empty streak data', () => {
  const result = streakView({});
  assert.equal(result.hasData, false);
  assert.equal(result.current, 0);
});
