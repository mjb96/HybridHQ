// ==========================================
// HYBRID BRAIN — PHASE 2 END-TO-END (tests/brain_phase2_pipeline.test.js)
// Confirms attribution + interference flow through core into the insights:
// explanations gain a causal clause, tradeoffs populate, and an interference
// insight surfaces. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateInsights } from '../js/brain/core.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NOW = '2026-06-11T00:00:00.000Z';

// Squat e1RM declines while running load + gym load both climb → squat stall
// attributed to lower-body demand, plus a combined-stress interference signal.
function fixture() {
  const mk = (sqW, dist, time, runRpe, gymRpe, gymMin) => ({
    lifts: { mon: { 'Back Squat': [
      { w: String(sqW), r: '5', c: true },
      { w: String(sqW), r: '5', c: true },
    ] } },
    gymRpe: { mon: String(gymRpe) },
    gymStats: { mon: { time: String(gymMin) } },
    runs: { sat: { dist: String(dist), time, rpe: String(runRpe) } },
  });
  return {
    currentWeek: '3',
    weeks: {
      '1': mk(140, 5,  '25:00', 6, 6, 50),
      '2': mk(135, 8,  '40:00', 7, 7, 55),
      '3': mk(130, 12, '58:00', 8, 9, 60),
    },
  };
}

const program = {
  totalWeeks: 3,
  days: { mon: { runs: 'Rest', lifts: ['Back Squat'] }, sat: { runs: 'Easy run', lifts: [] }, sun: { runs: 'Rest', lifts: [] } },
};
const opts = { days: DAYS, currentWeek: '3', maxWeek: 3, program, topN: 8, now: NOW };

test('squat decline insight gains an evidence-backed causal clause + tradeoff', () => {
  const r = generateInsights(fixture(), opts);
  const sq = r.insights.find(i => i.id === 'insight.strength.e1rm_trend:Back Squat')
          || r.insights.find(i => i.id === 'insight.strength.plateau:Back Squat');
  assert.ok(sq, 'expected a squat strength insight');
  assert.ok(sq.attribution, 'should carry an attribution block');
  assert.match(sq.explanation, /lower-body recovery demand|recovery demand|running/i);
  assert.ok(sq.tradeoffs, 'a strength stall attributed to running should expose a tradeoff');
  assert.match(sq.tradeoffs, /running/i);
});

test('an interference insight surfaces with tradeoffs', () => {
  const r = generateInsights(fixture(), opts);
  const intf = r.insights.find(i => i.id === 'insight.recovery.interference:combined');
  assert.ok(intf, 'expected an interference insight');
  assert.equal(intf.category, 'risk');
  assert.match(intf.observation, /both strength and endurance|combined/i);
  assert.ok(intf.tradeoffs);
  assert.ok(intf.evidence.some(e => e.metric === 'acwr'));
});

test('running load insight is attributed to higher-intensity running', () => {
  const r = generateInsights(fixture(), opts);
  const load = r.insights.find(i => i.id === 'insight.running.load_trend:run');
  assert.ok(load);
  assert.ok(load.attribution);
  assert.match(load.explanation, /higher-intensity|threshold|easy-volume/i);
});

test('insights expose attribution + evidence fields (or null when none)', () => {
  const r = generateInsights(fixture(), opts);
  for (const i of r.insights) {
    assert.ok('attribution' in i, 'attribution field present');
    assert.ok(Array.isArray(i.evidence), 'evidence is an array');
    assert.ok('tradeoffs' in i);
  }
  // a pure-progress pace insight has no causal driver here → attribution null
  const pace = r.insights.find(i => i.id === 'insight.running.pace_trend:run');
  if (pace) assert.equal(pace.attribution, null);
});

test('still deterministic end-to-end with attribution enabled', () => {
  const a = generateInsights(fixture(), opts).insights.map(i => `${i.id}|${i.explanation}`);
  const b = generateInsights(fixture(), opts).insights.map(i => `${i.id}|${i.explanation}`);
  assert.deepEqual(a, b);
});
