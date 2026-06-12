// ==========================================
// METRICS-STRENGTH TESTS
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  weeklyTonnageSeries,
  weeklyE1rmByLift,
  allLiftsStats,
  big3Progression,
  big3Maxes,
} from '../js/metrics/metrics-strength.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function fixture() {
  return {
    currentWeek: '2',
    weeks: {
      '1': {
        lifts: {
          mon: {
            'Back Squat': [
              { w: '100', r: '5', c: true },             // 500 kg
              { w: '100', r: '5', c: true },             // 500 kg
              { w: '60',  r: '5', c: true, isWarmup: true }, // excluded
              { w: '100', r: '5', c: false },            // incomplete, excluded
            ],
            'Bench Press': [
              { w: '80', r: '5', c: true },              // 400 kg
            ],
          },
        },
      },
      '2': {
        lifts: {
          mon: {
            'Back Squat': [
              { w: '105', r: '5', c: true },             // 525 kg
              { w: '105', r: '5', c: true },             // 525 kg
            ],
            'Deadlift': [
              { w: '140', r: '3', c: true },             // 420 kg
            ],
          },
        },
      },
    },
  };
}

// ---- weeklyTonnageSeries ------------------------------------------------
test('weeklyTonnageSeries sums completed working-set tonnage', () => {
  const result = weeklyTonnageSeries(fixture(), DAYS, 2);
  // wk1: 500+500+400=1400; wk2: 525+525+420=1470
  assert.deepEqual(result, [1400, 1470]);
});

test('weeklyTonnageSeries excludes warmups and incomplete sets', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': {
        lifts: {
          mon: {
            'Bench Press': [
              { w: '100', r: '5', c: true, isWarmup: true },  // warmup excluded
              { w: '100', r: '5', c: false },                  // incomplete excluded
              { w: '100', r: '5', c: true },                   // 500 counted
            ],
          },
        },
      },
    },
  };
  assert.deepEqual(weeklyTonnageSeries(state, DAYS, 1), [500]);
});

test('weeklyTonnageSeries returns zeros for weeks with no data', () => {
  assert.deepEqual(weeklyTonnageSeries(fixture(), DAYS, 4), [1400, 1470, 0, 0]);
});

test('weeklyTonnageSeries handles empty state', () => {
  assert.deepEqual(weeklyTonnageSeries({ weeks: {} }, DAYS, 2), [0, 0]);
});

// ---- weeklyE1rmByLift --------------------------------------------------
test('weeklyE1rmByLift returns best e1RM per lift per week', () => {
  const result = weeklyE1rmByLift(fixture(), DAYS, 2);
  // Back Squat wk1: best of 100×5 = 100*(1+5/30) ≈ 116.67
  const expected = 100 * (1 + 5 / 30);
  assert.ok(Math.abs(result['Back Squat'][0] - expected) < 0.01);
  // Back Squat wk2: 105×5 ≈ 122.5
  assert.ok(result['Back Squat'][1] > result['Back Squat'][0]);
});

test('weeklyE1rmByLift excludes warmups from e1RM', () => {
  // Use a warmup that would produce a HIGHER e1RM than the working set if included.
  // warmup: 120kg × 10 reps → e1RM = 120*(1+10/30) ≈ 160
  // working: 100kg × 3 reps → e1RM = 100*(1+3/30) ≈ 110
  const state = {
    currentWeek: '1',
    weeks: {
      '1': {
        lifts: {
          mon: {
            'Back Squat': [
              { w: '120', r: '10', c: true, isWarmup: true }, // high-e1RM warmup — must be excluded
              { w: '100', r: '3',  c: true },                  // working set
            ],
          },
        },
      },
    },
  };
  const result = weeklyE1rmByLift(state, DAYS, 1);
  const expectedWorking = 100 * (1 + 3 / 30);
  const warmupE1rm      = 120 * (1 + 10 / 30);
  assert.ok(result['Back Squat'][0] < warmupE1rm, 'warmup should not inflate e1RM');
  assert.ok(Math.abs(result['Back Squat'][0] - expectedWorking) < 0.01);
});

// ---- allLiftsStats -----------------------------------------------------
test('allLiftsStats returns all-time and current-week maxes', () => {
  const result = allLiftsStats(fixture(), DAYS);
  assert.ok('Back Squat' in result);
  assert.ok('Bench Press' in result);
  assert.ok('Deadlift' in result);
  // Squat all-time max: wk2 105×5 is higher than wk1 100×5
  assert.ok(result['Back Squat'].allTimeMax > result['Back Squat'].prevWeekMax);
  // currentWeekMax is wk2 (currentWeek = '2')
  assert.ok(result['Back Squat'].currentWeekMax > 0);
  // prevWeekMax is wk1
  assert.ok(result['Back Squat'].prevWeekMax > 0);
});

test('allLiftsStats excludes warmups from all-time max', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': {
        lifts: {
          mon: {
            'Bench Press': [
              { w: '200', r: '10', c: true, isWarmup: true }, // absurdly high warmup
              { w: '80', r: '5', c: true },                   // real working set
            ],
          },
        },
      },
    },
  };
  const result = allLiftsStats(state, DAYS);
  const warmupE1rm = 200 * (1 + 10 / 30);
  assert.ok(result['Bench Press'].allTimeMax < warmupE1rm);
});

// ---- big3Progression ---------------------------------------------------
test('big3Progression tracks squat, bench, deadlift by week', () => {
  const result = big3Progression(fixture());
  assert.ok(result.squat.allTime > 0);
  assert.ok(result.bench.allTime > 0);
  assert.ok(result.deadlift.allTime > 0);
  // squat byWeek[2] should be higher than byWeek[1] (105 > 100)
  assert.ok(result.squat.byWeek['2'] > result.squat.byWeek['1']);
});

test('big3Progression excludes warmups', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': {
        lifts: {
          mon: {
            'Back Squat': [
              { w: '200', r: '20', c: true, isWarmup: true }, // warmup with enormous e1RM
              { w: '100', r: '5',  c: true },
            ],
          },
        },
      },
    },
  };
  const result = big3Progression(state);
  const workingE1rm = 100 * (1 + 5 / 30);
  const warmupE1rm  = 200 * (1 + 20 / 30);
  assert.ok(result.squat.allTime < warmupE1rm);
  assert.ok(Math.abs(result.squat.allTime - workingE1rm) < 0.01);
});

test('big3Progression handles empty state', () => {
  const result = big3Progression({ weeks: {} });
  assert.equal(result.squat.allTime, 0);
  assert.equal(result.bench.allTime, 0);
  assert.equal(result.deadlift.allTime, 0);
});

// ---- big3Maxes ---------------------------------------------------------
test('big3Maxes returns flat all-time maxes', () => {
  const result = big3Maxes(fixture());
  const prog = big3Progression(fixture());
  assert.equal(result.squat,    prog.squat.allTime);
  assert.equal(result.bench,    prog.bench.allTime);
  assert.equal(result.deadlift, prog.deadlift.allTime);
});
