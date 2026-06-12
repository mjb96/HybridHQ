// ==========================================
// HYBRID BRAIN — SINGLE-WEEK SNAPSHOT TESTS
// The descriptive base layer: real data shows from ONE logged week, including
// running. Mirrors a new user with a couple of runs + a few lifts. `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeStrength, analyzeRunning } from '../js/brain/analysis.js';
import { generateInsights, insightsForContext } from '../js/brain/core.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// One week: 3 strength sessions + 2 runs (the user's actual situation).
function oneWeek() {
  return {
    currentWeek: '1',
    weeks: { '1': {
      lifts: {
        mon: { 'Back Squat': [{ w: '140', r: '5', c: true }, { w: '140', r: '5', c: true }] },
        wed: { 'Bench Press': [{ w: '100', r: '5', c: true }, { w: '100', r: '5', c: true }] },
        fri: { 'Deadlift':   [{ w: '180', r: '3', c: true }] },
      },
      runs: {
        tue: { dist: '5',  time: '27:30', rpe: '6' },
        sat: { dist: '8',  time: '46:00', rpe: '5' },
      },
    } },
  };
}

test('strength snapshot fires from a single week (sessions/sets/volume)', () => {
  const fs = analyzeStrength(oneWeek(), DAYS, 1, '1');
  const s = fs.find(f => f.type === 'strength_summary');
  assert.ok(s, 'expected a strength_summary');
  assert.equal(s.evidence.find(e => e.metric === 'sessions').value, 3);
  assert.equal(s.evidence.find(e => e.metric === 'sets').value, 5);
  assert.ok(s.evidence.find(e => e.metric === 'volume').value > 0);
});

test('running snapshot fires from a single week (runs/dist/avg pace)', () => {
  const fs = analyzeRunning(oneWeek(), DAYS, 1, '1');
  const r = fs.find(f => f.type === 'running_summary');
  assert.ok(r, 'expected a running_summary — running must show from one week');
  assert.equal(r.evidence.find(e => e.metric === 'runs').value, 2);
  assert.equal(r.evidence.find(e => e.metric === 'dist').value, 13);
  assert.match(r.evidence.find(e => e.metric === 'avg_pace').value, /\d+:\d\d\/km/);
});

test('end-to-end: a one-week user gets real strength AND running reads', () => {
  const r = generateInsights(oneWeek(), { days: DAYS, currentWeek: '1', maxWeek: 1, topN: 12 });
  assert.ok(r.insights.length > 0, 'tile should not be empty for a one-week user');

  const strength = insightsForContext(r, 'strength');
  assert.ok(strength.some(i => /this week/i.test(i.observation)), 'strength view shows a this-week read');

  const running = insightsForContext(r, 'running');
  assert.ok(running.some(i => /run/i.test(i.observation)), 'running view now has a read');
  assert.ok(running.some(i => /\/km/.test(i.observation)), 'running read includes pace');
});

test('no current-week activity → no snapshot (stays quiet)', () => {
  const empty = { currentWeek: '1', weeks: { '1': { lifts: {}, runs: {} } } };
  assert.equal(analyzeStrength(empty, DAYS, 1, '1').some(f => f.type === 'strength_summary'), false);
  assert.equal(analyzeRunning(empty, DAYS, 1, '1').some(f => f.type === 'running_summary'), false);
});
