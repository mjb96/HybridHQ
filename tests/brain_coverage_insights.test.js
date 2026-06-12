// ==========================================
// HYBRID BRAIN — PHASE B INSIGHT TESTS (tests/brain_coverage_insights.test.js)
// The new findings become coach insights and route to the right analytics
// contexts. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateInsights, insightsForContext } from '../js/brain/core.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NOW = '2026-06-11T00:00:00.000Z';

function fixture() {
  const wk = (cals, rpe) => ({
    gymRpe: { mon: String(rpe) },
    gymStats: { mon: { time: '60', cals: String(cals) } },
    runs: { sat: { dist: '6', time: '30:00', rpe: String(rpe), cals: '300' } },
    lifts: { mon: { 'Bench Press': [{ w: '100', r: '5', c: true }] } },
  });
  return {
    currentWeek: '3',
    weeks: { '1': wk(1500, 8), '2': wk(2100, 8), '3': wk(2800, 9) },
    bodyWeightLog: [
      { date: '2026-05-01', weight: 80 },
      { date: '2026-05-08', weight: 80.7 },
      { date: '2026-05-15', weight: 81.5 },
    ],
  };
}
const program = { totalWeeks: 3, days: { mon: { runs: 'Rest', lifts: ['Bench Press'] }, sat: { runs: 'Easy run', lifts: [] } } };
const opts = { days: DAYS, currentWeek: '3', maxWeek: 3, program, topN: 12, now: NOW };

test('body-weight insight surfaces and routes to the bodyweight view', () => {
  const r = generateInsights(fixture(), opts);
  const out = insightsForContext(r, 'bodyweight');
  assert.ok(out.length >= 1);
  assert.match(out[0].observation, /Body weight/i);
});

test('fuel insight surfaces and routes to the active-fuel view', () => {
  const r = generateInsights(fixture(), opts);
  const out = insightsForContext(r, 'active-fuel');
  assert.ok(out.some(i => /calorie burn/i.test(i.observation)));
});

test('recovery-status insight surfaces and routes to recovery views', () => {
  const r = generateInsights(fixture(), opts);
  const out = insightsForContext(r, 'recovery-score');
  assert.ok(out.some(i => /Recovery (is|looks)/i.test(i.observation)));
});

test('the new insights are fully-formed coach cards', () => {
  const r = generateInsights(fixture(), opts);
  const bw = insightsForContext(r, 'bodyweight')[0];
  for (const k of ['observation', 'explanation', 'whyItMatters', 'suggestedAction', 'category', 'confidence']) {
    assert.ok(bw[k], `bodyweight insight missing ${k}`);
  }
});
