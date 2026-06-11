// ==========================================
// HYBRID BRAIN — INSIGHT TESTS (tests/brain_insights.test.js)
// Verifies Finding → Insight mapping, categories, confidence and prioritisation.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toInsight, buildInsights, selectTop, confidenceFor } from '../js/brain/insights.js';

const ctx = { currentWeek: '3' };

const fE1rmUp = {
  id: 'strength.e1rm_trend:Bench Press', engine: 'strength', domain: 'strength',
  type: 'e1rm_trend', subject: 'Bench Press', direction: 'up', magnitude: 10, unit: '%',
  window: { fromWeek: 1, toWeek: 3 },
  evidence: [{ metric: 'e1rm_first', value: 116.7 }, { metric: 'e1rm_last', value: 128.3 }],
  dataPoints: 3, severity: 0.66,
};
const fSpike = {
  id: 'running.load_spike:run', engine: 'running', domain: 'aerobic',
  type: 'load_spike', subject: 'run', direction: 'up', magnitude: 50, unit: '%',
  window: { fromWeek: 2, toWeek: 3 },
  evidence: [{ metric: 'dist_prev', value: 8 }, { metric: 'dist_last', value: 12 }],
  dataPoints: 3, severity: 0.5,
};
const fPaceDown = {
  id: 'running.pace_trend:run', engine: 'running', domain: 'aerobic',
  type: 'pace_trend', subject: 'run', direction: 'down', magnitude: -10, unit: 'sec/km',
  window: { fromWeek: 1, toWeek: 3 },
  evidence: [{ metric: 'pace_first', value: 300 }, { metric: 'pace_last', value: 290 }],
  dataPoints: 3, severity: 0.66,
};
const fAdherence = {
  id: 'adherence.consistency:global', engine: 'adherence', domain: 'adherence',
  type: 'consistency', subject: 'global', direction: null, magnitude: 72, unit: '%',
  window: { toWeek: 3 },
  evidence: [{ metric: 'done', value: 18 }, { metric: 'total', value: 25 }],
  dataPoints: 3, severity: 0.28,
};

test('confidenceFor buckets by sample size', () => {
  assert.equal(confidenceFor(5).level, 'high');
  assert.equal(confidenceFor(3).level, 'med');
  assert.equal(confidenceFor(2).level, 'low');
  assert.equal(confidenceFor(1).level, 'low');
});

test('e1RM-up maps to a Progress insight with all five coach fields', () => {
  const i = toInsight(fE1rmUp, ctx);
  assert.equal(i.category, 'progress');
  assert.equal(i.confidence, 'med');
  for (const k of ['observation', 'explanation', 'whyItMatters', 'suggestedAction']) {
    assert.ok(i[k] && i[k].length > 0, `${k} should be populated`);
  }
  assert.ok(i.observation.includes('Bench Press'));
  assert.equal(i.tradeoffs, null);            // reserved for later phase
  assert.deepEqual(i.findings, ['strength.e1rm_trend:Bench Press']);
});

test('load spike maps to a Risk insight', () => {
  assert.equal(toInsight(fSpike, ctx).category, 'risk');
});

test('improving pace (seconds falling) maps to Progress', () => {
  const i = toInsight(fPaceDown, ctx);
  assert.equal(i.category, 'progress');
  assert.ok(i.observation.toLowerCase().includes('improving'));
});

test('overall adherence maps to a Goal insight echoing done/total', () => {
  const i = toInsight(fAdherence, ctx);
  assert.equal(i.category, 'goal');
  assert.ok(i.explanation.includes('18') && i.explanation.includes('25'));
});

test('buildInsights prioritises risk above lower-severity progress', () => {
  const list = buildInsights([fAdherence, fE1rmUp, fSpike, fPaceDown], ctx);
  assert.equal(list.length, 4);
  // sorted descending by priority
  for (let k = 1; k < list.length; k++) {
    assert.ok(list[k - 1].priority >= list[k].priority);
  }
  // the risk (load spike, relevance 1.0) should outrank the goal snapshot
  const spikeRank = list.findIndex(i => i.id === 'insight.running.load_spike:run');
  const goalRank  = list.findIndex(i => i.id === 'insight.adherence.consistency:global');
  assert.ok(spikeRank < goalRank);
});

test('selectTop limits to N and unknown findings produce no insight', () => {
  const list = buildInsights([fE1rmUp, fSpike, fPaceDown, fAdherence], ctx);
  assert.equal(selectTop(list, 2).length, 2);

  const flat = { ...fE1rmUp, id: 'x.y', type: 'e1rm_trend', direction: 'flat' };
  assert.equal(toInsight(flat, ctx), null); // flat e1rm has no template → skipped
  assert.deepEqual(buildInsights([], ctx), []);
});
