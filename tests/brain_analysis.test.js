// ==========================================
// HYBRID BRAIN — ANALYSIS ENGINE TESTS (tests/brain_analysis.test.js)
// Verifies the three MVP engines emit the expected objective Findings.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAnalysis, analyzeStrength, analyzeRunning, analyzeAdherence } from '../js/brain/analysis.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// 3 weeks: bench e1RM rising (~+10%), running distance rising 5→8→12 (spike at
// week 3), pace improving 300→295→290 s/km, partial adherence.
function fixture() {
  const mk = (benchW, dist, time, rpe) => ({
    lifts: { mon: { 'Bench Press': [
      { w: String(benchW), r: '5', c: true },
      { w: String(benchW), r: '5', c: true },
    ] } },
    gymRpe:   { mon: '8' },
    gymStats: { mon: { time: '60' } },
    runs:     { sat: { dist: String(dist), time, rpe: String(rpe) } },
  });
  return {
    currentWeek: '3',
    weeks: {
      '1': mk(100, 5,  '25:00', 6),  // pace 300
      '2': mk(105, 8,  '39:20', 6),  // pace 295
      '3': mk(110, 12, '58:00', 7),  // pace 290
    },
  };
}

const program = {
  totalWeeks: 3,
  days: {
    mon: { runs: 'Rest',     lifts: ['Bench Press'] },
    sat: { runs: 'Easy run', lifts: [] },
    sun: { runs: 'Rest',     lifts: [] },
  },
};

const ctx = { days: DAYS, currentWeek: '3', maxWeek: 3, program };
const byId = (fs, pred) => fs.find(pred);

test('strength engine detects a rising Bench e1RM trend', () => {
  const fs = analyzeStrength(fixture(), DAYS, 3);
  const f = byId(fs, x => x.type === 'e1rm_trend' && x.subject === 'Bench Press');
  assert.ok(f, 'expected a Bench Press e1rm_trend finding');
  assert.equal(f.direction, 'up');
  assert.ok(f.magnitude > 0, 'magnitude should be a positive %');
  assert.equal(f.dataPoints, 3);
  assert.equal(f.domain, 'strength');
});

test('strength engine reports a rising volume trend', () => {
  const fs = analyzeStrength(fixture(), DAYS, 3);
  const f = byId(fs, x => x.type === 'volume_trend' && x.subject === 'global');
  assert.ok(f);
  assert.equal(f.direction, 'up');
});

test('running engine detects improving pace + rising load + a spike', () => {
  const fs = analyzeRunning(fixture(), DAYS, 3);
  const pace = byId(fs, x => x.type === 'pace_trend');
  assert.ok(pace, 'expected pace_trend');
  assert.equal(pace.direction, 'down');          // seconds/km falling = faster
  assert.ok(pace.magnitude < 0);

  const load = byId(fs, x => x.type === 'load_trend');
  assert.ok(load);
  assert.equal(load.direction, 'up');

  const spike = byId(fs, x => x.type === 'load_spike');
  assert.ok(spike, 'week 3 (12km vs 8km = +50%) should trigger a spike');
  assert.equal(spike.domain, 'aerobic');
});

test('adherence engine produces an overall consistency finding', () => {
  const fs = analyzeAdherence(fixture(), program, DAYS, '3', 3);
  const f = byId(fs, x => x.type === 'consistency' && x.subject === 'global');
  assert.ok(f);
  assert.ok(f.magnitude >= 0 && f.magnitude <= 100);
  assert.ok(f.evidence.some(e => e.metric === 'total' && e.value > 0));
});

test('runAnalysis aggregates findings from all engines with stable ids', () => {
  const fs = runAnalysis(fixture(), ctx);
  assert.ok(fs.length >= 4);
  const ids = fs.map(f => f.id);
  assert.equal(new Set(ids).size, ids.length, 'finding ids must be unique');
  assert.ok(ids.includes('strength.e1rm_trend:Bench Press'));
  assert.ok(ids.includes('running.load_spike:run'));
});

test('empty / cold-start state yields no findings', () => {
  const empty = { currentWeek: '1', weeks: {} };
  assert.deepEqual(runAnalysis(empty, { days: DAYS, currentWeek: '1', maxWeek: 3, program }), []);
});

test('a single logged week is below the trend threshold (no trend findings)', () => {
  const one = { currentWeek: '1', weeks: { '1': {
    lifts: { mon: { 'Bench Press': [{ w: '100', r: '5', c: true }] } },
    gymRpe: { mon: '8' }, gymStats: { mon: { time: '60' } },
    runs: { sat: { dist: '5', time: '25:00', rpe: '6' } },
  } } };
  const fs = runAnalysis(one, { days: DAYS, currentWeek: '1', maxWeek: 3, program });
  assert.equal(fs.some(f => f.type === 'e1rm_trend'), false);
  assert.equal(fs.some(f => f.type === 'pace_trend'), false);
});
