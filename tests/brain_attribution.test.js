// ==========================================
// HYBRID BRAIN — ATTRIBUTION / INTERFERENCE TESTS
// Verifies Phase-2 causal enrichment + interference detection.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attributeFindings, detectInterference,
  highIntensityRunSeries, activeDaySeries, lowerBodyVolumeSeries,
} from '../js/brain/attribution.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// ---- driver series --------------------------------------------------------
test('highIntensityRunSeries counts only RPE>=7 (or anaerobicTE) minutes', () => {
  const state = { weeks: {
    '1': { runs: { sat: { time: '25:00', rpe: '6' } } },          // easy → 0
    '2': { runs: { sat: { time: '40:00', rpe: '7' } } },          // hard → 40
    '3': { runs: { sat: { time: '30:00', rpe: '5', anaerobicTE: '3.2' } } }, // aTE → 30
  } };
  assert.deepEqual(highIntensityRunSeries(state, DAYS, 3), [0, 40, 30]);
});

test('activeDaySeries counts days with a completed set or a run', () => {
  const state = { weeks: { '1': {
    lifts: { mon: { 'Back Squat': [{ w: '100', r: '5', c: true }] },
             tue: { 'Bench Press': [{ w: '80', r: '5', c: false }] } }, // not completed
    runs: { sat: { dist: '5' } },
  } } };
  assert.deepEqual(activeDaySeries(state, DAYS, 1), [2]); // mon (lift) + sat (run)
});

test('lowerBodyVolumeSeries sums Legs-category tonnage only', () => {
  const state = { weeks: { '1': { lifts: { mon: {
    'Back Squat':  [{ w: '100', r: '5', c: true }], // legs → 500
    'Bench Press': [{ w: '80',  r: '5', c: true }], // push → ignored
  } } } } };
  assert.deepEqual(lowerBodyVolumeSeries(state, DAYS, 1), [500]);
});

// ---- attribution ----------------------------------------------------------
function risingRunState() {
  const mk = (dist, time, rpe) => ({ runs: { sat: { dist: String(dist), time, rpe: String(rpe) } },
    gymRpe: { mon: '7' }, gymStats: { mon: { time: '50' } },
    lifts: { mon: { 'Back Squat': [{ w: '130', r: '5', c: true }] } } });
  return { currentWeek: '3', weeks: { '1': mk(5, '25:00', 6), '2': mk(8, '40:00', 7), '3': mk(12, '60:00', 8) } };
}

test('a squat decline is attributed to rising lower-body recovery demand', () => {
  const finding = {
    id: 'strength.e1rm_trend:Squat', type: 'e1rm_trend', subject: 'Squat',
    direction: 'down', domain: 'strength', dataPoints: 3, window: { fromWeek: 1, toWeek: 3 },
  };
  const [out] = attributeFindings([finding], risingRunState(), { days: DAYS, maxWeek: 3 });
  assert.ok(out.attribution, 'expected an attribution block');
  assert.match(out.attribution.summary, /lower-body recovery demand/);
  assert.ok(out.attribution.drivers.some(d => d.factor === 'running_load' && d.direction === 'up'));
  assert.ok(out.attribution.evidence.length > 0);
  assert.equal(out.attribution.confidence, 'low'); // 3 points → correlational, capped
});

test('a rising running load is attributed to more hard/threshold running', () => {
  const finding = {
    id: 'running.load_trend:run', type: 'load_trend', subject: 'run',
    direction: 'up', domain: 'aerobic', dataPoints: 3, window: { fromWeek: 1, toWeek: 3 },
  };
  const [out] = attributeFindings([finding], risingRunState(), { days: DAYS, maxWeek: 3 });
  assert.ok(out.attribution);
  assert.match(out.attribution.summary, /higher-intensity|threshold/);
  assert.ok(out.attribution.drivers.some(d => d.factor === 'hard_running_min'));
});

test('improving consistency is attributed to reduced weekly frequency', () => {
  // frequency falls 5 → 4 → 3 active days while completion improves
  const day = (n) => {
    const lifts = {};
    DAYS.slice(0, n).forEach(d => { lifts[d] = { 'Bench Press': [{ w: '80', r: '5', c: true }] }; });
    return { lifts };
  };
  const state = { currentWeek: '3', weeks: { '1': day(5), '2': day(4), '3': day(3) } };
  const finding = {
    id: 'adherence.consistency:trend', type: 'consistency', subject: 'trend',
    direction: 'up', domain: 'adherence', dataPoints: 3, window: { fromWeek: 1, toWeek: 3 },
  };
  const [out] = attributeFindings([finding], state, { days: DAYS, maxWeek: 3 });
  assert.ok(out.attribution);
  assert.match(out.attribution.summary, /reducing weekly training frequency/);
});

test('findings without a concurrent driver are left unattributed', () => {
  const flatState = { currentWeek: '2', weeks: {
    '1': { runs: { sat: { dist: '5', time: '25:00', rpe: '6' } } },
    '2': { runs: { sat: { dist: '5', time: '25:00', rpe: '6' } } },
  } };
  const finding = { id: 'x', type: 'e1rm_trend', subject: 'Squat', direction: 'down',
    dataPoints: 2, window: { fromWeek: 1, toWeek: 2 } };
  const [out] = attributeFindings([finding], flatState, { days: DAYS, maxWeek: 2 });
  assert.equal(out.attribution, undefined);
});

// ---- interference ---------------------------------------------------------
test('interference fires when strength AND endurance jointly elevate recovery cost', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { gymRpe: { mon: '5' }, gymStats: { mon: { time: '30' } }, runs: { sat: { time: '20:00', rpe: '5' } } },
    '2': { gymRpe: { mon: '9' }, gymStats: { mon: { time: '60' } }, runs: { sat: { time: '50:00', rpe: '8' } } },
  } };
  const f = detectInterference(state, { days: DAYS, currentWeek: '2', maxWeek: 2 });
  assert.ok(f, 'expected an interference finding');
  assert.equal(f.type, 'interference');
  assert.equal(f.domain, 'recovery');
  assert.equal(f.evidence.find(e => e.metric === 'strength_cost').value, 540); // 9*60
  assert.equal(f.evidence.find(e => e.metric === 'endurance_cost').value, 400); // 8*50
  assert.ok(f.severity >= 0.5);
});

test('interference does not fire from strength stress alone', () => {
  const state = { currentWeek: '2', weeks: {
    '1': { gymRpe: { mon: '5' }, gymStats: { mon: { time: '30' } } },
    '2': { gymRpe: { mon: '9' }, gymStats: { mon: { time: '90' } } }, // big strength, no running
  } };
  assert.equal(detectInterference(state, { days: DAYS, currentWeek: '2', maxWeek: 2 }), null);
});
