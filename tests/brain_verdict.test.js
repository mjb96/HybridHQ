// ==========================================
// HYBRID BRAIN — CONTEXT VERDICT TESTS (tests/brain_verdict.test.js)
// One-word per-view read, prioritised by actionability. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextVerdict } from '../js/brain/core.js';

const I = (category) => ({ category });

test('any risk in the set → Watch', () => {
  assert.deepEqual(contextVerdict([I('progress'), I('risk')]), { label: 'Watch', tone: 'risk' });
});

test('opportunity outranks progress when no risk', () => {
  assert.deepEqual(contextVerdict([I('progress'), I('opportunity')]), { label: 'Opportunity', tone: 'opportunity' });
});

test('progress only → On track', () => {
  assert.deepEqual(contextVerdict([I('progress')]), { label: 'On track', tone: 'progress' });
});

test('recovery only → Recovering; goal only → Goal', () => {
  assert.equal(contextVerdict([I('recovery')]).label, 'Recovering');
  assert.equal(contextVerdict([I('goal')]).label, 'Goal');
});

test('empty / nullish → null', () => {
  assert.equal(contextVerdict([]), null);
  assert.equal(contextVerdict(null), null);
});
