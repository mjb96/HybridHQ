// ==========================================
// METRICS-RUNNING TESTS
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  weeklyDistanceSeries,
  weeklyElevationSeries,
  weeklyPaceSeries,
  weeklyHrSeries,
  weeklyHrZonesSeries,
  weeklyCadenceSeries,
  weeklyTrainingEffectSeries,
} from '../js/metrics/metrics-running.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function fixture() {
  return {
    currentWeek: '2',
    weeks: {
      '1': {
        runs: {
          wed: { dist: '5',  time: '25:00', rpe: '6', avgHR: '155', maxHR: '172',
                 avgCadence: '170', trainingEffect: '3.2',
                 hrZones: [5, 10, 8, 2, 0] },
          sat: { dist: '10', time: '55:00', rpe: '7', avgHR: '162', maxHR: '180',
                 avgCadence: '175', trainingEffect: '3.8',
                 hrZones: [3, 8, 12, 5, 2] },
        },
      },
      '2': {
        runs: {
          wed: { dist: '6', time: '28:00', rpe: '6.5', avgHR: '158', maxHR: '175',
                 avgCadence: '172', trainingEffect: '3.5',
                 hrZones: [4, 9, 10, 3, 1] },
        },
      },
    },
  };
}

// ---- weeklyDistanceSeries ----------------------------------------------
test('weeklyDistanceSeries sums all runs per week', () => {
  const result = weeklyDistanceSeries(fixture(), DAYS, 2);
  assert.equal(result[0], 15);  // 5 + 10
  assert.equal(result[1], 6);   // 6
});

test('weeklyDistanceSeries returns 0 for empty weeks', () => {
  const result = weeklyDistanceSeries(fixture(), DAYS, 3);
  assert.equal(result[2], 0);
});

test('weeklyDistanceSeries handles empty state', () => {
  assert.deepEqual(weeklyDistanceSeries({ weeks: {} }, DAYS, 2), [0, 0]);
});

// ---- weeklyElevationSeries ---------------------------------------------
test('weeklyElevationSeries sums ascent per week', () => {
  const state = {
    weeks: {
      '1': { runs: { wed: { dist: '5', elev: '120' }, sat: { dist: '10', elev: '250' } } },
      '2': { runs: { wed: { dist: '6', elev: '90'  } } },
    },
  };
  const result = weeklyElevationSeries(state, DAYS, 2);
  assert.equal(result[0], 370); // 120 + 250
  assert.equal(result[1], 90);
});

test('weeklyElevationSeries returns 0 for weeks with no elevation data', () => {
  assert.deepEqual(weeklyElevationSeries({ weeks: {} }, DAYS, 2), [0, 0]);
});

// ---- weeklyPaceSeries --------------------------------------------------
test('weeklyPaceSeries returns distance-weighted average pace', () => {
  const result = weeklyPaceSeries(fixture(), DAYS, 2);
  // wk1: 5km@25min + 10km@55min
  //   pace1 = 25*60/5 = 300 s/km; pace2 = 55*60/10 = 330 s/km
  //   weighted: (300*5 + 330*10) / 15 = (1500+3300)/15 = 4800/15 = 320
  assert.equal(Math.round(result[0]), 320);
  // wk2: 6km@28min = 28*60/6 = 280 s/km
  assert.equal(Math.round(result[1]), 280);
});

test('weeklyPaceSeries returns 0 when no runs logged', () => {
  const result = weeklyPaceSeries(fixture(), DAYS, 3);
  assert.equal(result[2], 0);
});

// ---- weeklyHrSeries ----------------------------------------------------
test('weeklyHrSeries returns average and max HR per week', () => {
  const result = weeklyHrSeries(fixture(), DAYS, 2);
  // wk1 avgHR: (155+162)/2 = 158 (rounded); maxHR: max(172,180) = 180
  assert.equal(result.avgHr[0], Math.round((155 + 162) / 2));
  assert.equal(result.maxHr[0], 180);
  // wk2 avgHR: 158; maxHR: 175
  assert.equal(result.avgHr[1], 158);
  assert.equal(result.maxHr[1], 175);
});

test('weeklyHrSeries returns 0 for weeks with no HR data', () => {
  const result = weeklyHrSeries({ weeks: {} }, DAYS, 2);
  assert.deepEqual(result.avgHr, [0, 0]);
  assert.deepEqual(result.maxHr, [0, 0]);
});

// ---- weeklyHrZonesSeries -----------------------------------------------
test('weeklyHrZonesSeries accumulates zone times across runs', () => {
  const result = weeklyHrZonesSeries(fixture(), DAYS, 2);
  // wk1: zones from wed + sat
  assert.deepEqual(result[0], [8, 18, 20, 7, 2]);  // [5+3, 10+8, 8+12, 2+5, 0+2]
  // wk2: just wed
  assert.deepEqual(result[1], [4, 9, 10, 3, 1]);
});

test('weeklyHrZonesSeries returns [0,0,0,0,0] for weeks with no zone data', () => {
  const result = weeklyHrZonesSeries(fixture(), DAYS, 3);
  assert.deepEqual(result[2], [0, 0, 0, 0, 0]);
});

test('weeklyHrZonesSeries handles missing hrZones gracefully', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { runs: { mon: { dist: '5', time: '25:00' } } } },
  };
  const result = weeklyHrZonesSeries(state, DAYS, 1);
  assert.deepEqual(result[0], [0, 0, 0, 0, 0]);
});

// ---- weeklyCadenceSeries -----------------------------------------------
test('weeklyCadenceSeries averages cadence across runs in a week', () => {
  const result = weeklyCadenceSeries(fixture(), DAYS, 2);
  // wk1: (170+175)/2 = 172.5
  assert.ok(Math.abs(result[0] - 172.5) < 0.01);
  // wk2: 172
  assert.equal(result[1], 172);
});

test('weeklyCadenceSeries returns 0 when no cadence data', () => {
  const result = weeklyCadenceSeries({ weeks: {} }, DAYS, 2);
  assert.deepEqual(result, [0, 0]);
});

// ---- weeklyTrainingEffectSeries ----------------------------------------
test('weeklyTrainingEffectSeries averages TE across runs', () => {
  const result = weeklyTrainingEffectSeries(fixture(), DAYS, 2);
  // wk1: (3.2+3.8)/2 = 3.5
  assert.equal(result[0], 3.5);
  // wk2: 3.5
  assert.equal(result[1], 3.5);
});

test('weeklyTrainingEffectSeries returns 0 for weeks with no TE data', () => {
  const result = weeklyTrainingEffectSeries({ weeks: {} }, DAYS, 2);
  assert.deepEqual(result, [0, 0]);
});
