// ==========================================
// HYBRID BRAIN — CONTEXT SELECTOR TESTS (tests/brain_context.test.js)
// Verifies the report exposes the full insight list and that
// insightsForContext() filters to the domains relevant to each analytics view.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateInsights, insightsForContext, CONTEXT_DOMAINS } from '../js/brain/core.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NOW = '2026-06-11T00:00:00.000Z';

function fixture() {
  const mk = (benchW, dist, time) => ({
    lifts: { mon: { 'Bench Press': [
      { w: String(benchW), r: '5', c: true }, { w: String(benchW), r: '5', c: true },
    ] } },
    gymRpe: { mon: '8' }, gymStats: { mon: { time: '60' } },
    runs: { sat: { dist: String(dist), time, rpe: '6' } },
  });
  return { currentWeek: '3', weeks: { '1': mk(100, 5, '25:00'), '2': mk(105, 8, '39:20'), '3': mk(110, 12, '58:00') } };
}
const program = { totalWeeks: 3, days: {
  mon: { runs: 'Rest', lifts: ['Bench Press'] }, sat: { runs: 'Easy run', lifts: [] }, sun: { runs: 'Rest', lifts: [] },
} };
const opts = { days: DAYS, currentWeek: '3', maxWeek: 3, program, topN: 4, now: NOW };

test('report exposes the full prioritised list via allInsights', () => {
  const r = generateInsights(fixture(), opts);
  assert.ok(Array.isArray(r.allInsights));
  assert.ok(r.allInsights.length >= r.insights.length);
  assert.equal(r.allInsights.length, r.meta.totalInsights);
});

test('insightsForContext filters to the domains of a strength view', () => {
  const r = generateInsights(fixture(), opts);
  const out = insightsForContext(r, 'strength');
  assert.ok(out.length > 0);
  assert.ok(out.every(i => i.domain === 'strength'));
});

test('a running view surfaces aerobic-domain insights', () => {
  const r = generateInsights(fixture(), opts);
  const out = insightsForContext(r, 'running');
  assert.ok(out.length > 0);
  assert.ok(out.every(i => CONTEXT_DOMAINS.running.includes(i.domain)));
});

test('a dark domain (body weight) returns nothing until Phase B adds findings', () => {
  const r = generateInsights(fixture(), opts);
  assert.deepEqual(insightsForContext(r, 'bodyweight'), []);
});

test('an unknown context returns no insights', () => {
  const r = generateInsights(fixture(), opts);
  assert.deepEqual(insightsForContext(r, 'not-a-context'), []);
});
