// ==========================================
// HYBRID BRAIN — CORE / REPORT TESTS (tests/brain_core.test.js)
// Golden-payload checks for the end-to-end Data → Findings → Insights pipeline.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateInsights, insightCounts } from '../js/brain/core.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NOW = '2026-06-11T00:00:00.000Z';

function fixture() {
  const mk = (benchW, dist, time) => ({
    lifts: { mon: { 'Bench Press': [
      { w: String(benchW), r: '5', c: true },
      { w: String(benchW), r: '5', c: true },
    ] } },
    gymRpe: { mon: '8' }, gymStats: { mon: { time: '60' } },
    runs: { sat: { dist: String(dist), time, rpe: '6' } },
  });
  return {
    currentWeek: '3',
    weeks: { '1': mk(100, 5, '25:00'), '2': mk(105, 8, '39:20'), '3': mk(110, 12, '58:00') },
  };
}

const program = {
  totalWeeks: 3,
  days: {
    mon: { runs: 'Rest', lifts: ['Bench Press'] },
    sat: { runs: 'Easy run', lifts: [] },
    sun: { runs: 'Rest', lifts: [] },
  },
};
const opts = { days: DAYS, currentWeek: '3', maxWeek: 3, program, now: NOW };

test('generateInsights returns a populated, prioritised report', () => {
  const r = generateInsights(fixture(), opts);
  assert.equal(r.generatedAt, NOW);
  assert.ok(r.findings.length >= 4);
  assert.ok(r.insights.length > 0);
  assert.equal(r.meta.hasEnoughData, true);
  assert.equal(r.meta.dataWeeks, 3);
  // priority-sorted
  for (let k = 1; k < r.insights.length; k++) {
    assert.ok(r.insights[k - 1].priority >= r.insights[k].priority);
  }
  // every surfaced insight is a fully-formed coach card
  for (const i of r.insights) {
    for (const key of ['observation', 'explanation', 'whyItMatters', 'suggestedAction', 'confidence', 'category']) {
      assert.ok(i[key], `insight missing ${key}`);
    }
  }
});

test('topN caps the number of surfaced insights', () => {
  const r = generateInsights(fixture(), { ...opts, topN: 2 });
  assert.equal(r.insights.length, 2);
  assert.ok(r.meta.totalInsights >= 2);
});

test('deterministic: same input → same insight ids in the same order', () => {
  const a = generateInsights(fixture(), opts).insights.map(i => i.id);
  const b = generateInsights(fixture(), opts).insights.map(i => i.id);
  assert.deepEqual(a, b);
});

test('the strength-progress insight is present and is a progress card', () => {
  const r = generateInsights(fixture(), opts);
  const bench = r.insights.find(i => i.id === 'insight.strength.e1rm_trend:Bench Press');
  assert.ok(bench, 'expected the bench e1RM insight to surface');
  assert.equal(bench.category, 'progress');
});

test('empty / cold-start state → no insights, hasEnoughData false', () => {
  const r = generateInsights({ currentWeek: '1', weeks: {} }, opts);
  assert.deepEqual(r.insights, []);
  assert.equal(r.meta.hasEnoughData, false);
  assert.equal(r.findings.length, 0);
});

test('insightCounts tallies surfaced insights by category', () => {
  const r = generateInsights(fixture(), opts);
  const counts = insightCounts(r);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, r.insights.length);
});
