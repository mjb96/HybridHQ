// ==========================================
// HYBRID BRAIN — SUMMARY TESTS (tests/brain_summary.test.js)
// Verifies summarizeReport() splits a report into the home-area shape:
// focus / goal slot / compact rest / category counts. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeReport } from '../js/brain/core.js';

const ins = (id, category) => ({ id, category, observation: id });

test('focus is the first insight; goal slot is a later goal insight', () => {
  const report = { insights: [ins('a', 'risk'), ins('b', 'progress'), ins('c', 'goal'), ins('d', 'opportunity')] };
  const s = summarizeReport(report);
  assert.equal(s.focus.id, 'a');
  assert.equal(s.goal.id, 'c');
  assert.deepEqual(s.rest.map(i => i.id), ['b', 'd']);   // focus + goal removed
  assert.deepEqual(s.counts, { risk: 1, progress: 1, goal: 1, opportunity: 1 });
  assert.equal(s.total, 4);
});

test('when the focus IS the goal insight, the goal slot stays empty (no dupe)', () => {
  const report = { insights: [ins('g', 'goal'), ins('p', 'progress')] };
  const s = summarizeReport(report);
  assert.equal(s.focus.id, 'g');
  assert.equal(s.goal, null);
  assert.deepEqual(s.rest.map(i => i.id), ['p']);
});

test('empty report → null focus/goal, empty rest', () => {
  const s = summarizeReport({ insights: [] });
  assert.equal(s.focus, null);
  assert.equal(s.goal, null);
  assert.deepEqual(s.rest, []);
  assert.equal(s.total, 0);
});

test('a single insight is the focus with nothing in rest', () => {
  const s = summarizeReport({ insights: [ins('only', 'risk')] });
  assert.equal(s.focus.id, 'only');
  assert.deepEqual(s.rest, []);
});
