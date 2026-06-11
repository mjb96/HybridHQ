// ==========================================
// HYBRID BRAIN — STRENGTH BREADTH + HIGHLIGHT TESTS
// Broadened beyond the big-3, plus the concrete weekly highlight / PR.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeStrength } from '../js/brain/analysis.js';
import { generateInsights, insightsForContext } from '../js/brain/core.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// OHP rising over 3 weeks — a non-big-3 compound that must now be tracked.
function ohpState() {
  const mk = (w) => ({ lifts: { mon: { 'Standing Barbell OHP': [
    { w: String(w), r: '5', c: true }, { w: String(w), r: '5', c: true },
  ] } } });
  return { currentWeek: '3', weeks: { '1': mk(50), '2': mk(55), '3': mk(60) } };
}

test('strength engine now tracks main compounds beyond the big-3 (OHP)', () => {
  const fs = analyzeStrength(ohpState(), DAYS, 3, '3');
  const ohp = fs.find(f => f.type === 'e1rm_trend' && f.subject === 'Standing Barbell OHP');
  assert.ok(ohp, 'expected an OHP e1RM trend');
  assert.equal(ohp.direction, 'up');
});

test('isolation work is NOT trended (no Lateral Raise e1RM finding)', () => {
  const mk = (w) => ({ lifts: { mon: { 'Lateral Raise': [
    { w: String(w), r: '12', c: true }, { w: String(w), r: '12', c: true },
  ] } } });
  const state = { currentWeek: '3', weeks: { '1': mk(10), '2': mk(12), '3': mk(14) } };
  const fs = analyzeStrength(state, DAYS, 3, '3');
  assert.equal(fs.some(f => f.type === 'e1rm_trend'), false);
});

test('a single logged week still yields a concrete strength highlight', () => {
  const state = { currentWeek: '1', weeks: { '1': { lifts: { mon: {
    'Back Squat': [{ w: '140', r: '5', c: true }],
    'Bench Press': [{ w: '100', r: '5', c: true }],
  } } } } };
  const fs = analyzeStrength(state, DAYS, 1, '1');
  const hi = fs.find(f => f.type === 'strength_highlight');
  assert.ok(hi, 'expected a weekly highlight even from one week');
  assert.equal(hi.subject, 'Back Squat');          // highest e1RM this week
  assert.equal(hi.evidence.find(e => e.metric === 'is_pr').value, 1); // also an all-time best
});

test('the highlight becomes a concrete coach insight on the home/strength view', () => {
  const state = { currentWeek: '1', weeks: { '1': { lifts: { mon: {
    'Back Squat': [{ w: '140', r: '5', c: true }],
  } } } } };
  const r = generateInsights(state, { days: DAYS, currentWeek: '1', maxWeek: 1, topN: 12 });
  const out = insightsForContext(r, 'strength');
  const hi = out.find(i => i.id === 'insight.strength.strength_highlight:Back Squat');
  assert.ok(hi);
  assert.equal(hi.category, 'progress');
  assert.match(hi.observation, /Back Squat/);
  assert.match(hi.observation, /\bkg\b/);
});
