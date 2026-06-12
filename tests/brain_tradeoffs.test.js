// ==========================================
// TRADEOFF RESOLUTION TESTS (tests/brain_tradeoffs.test.js)
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTradeoff } from '../js/brain/tradeoffs.js';
import { PHASES, GOAL_TYPES } from '../js/brain/weekly_brief.js';

function mkFinding(type, direction, domain, subject) {
  return { type, direction: direction || null, domain: domain || 'strength', subject: subject || null };
}

function mkAttribution(factors = []) {
  return {
    summary: 'test attribution',
    drivers: factors.map(f => ({ factor: f, direction: 'up', from: 10, to: 20, unit: 'AU' })),
    confidence: 'med',
  };
}

// ── Strength stall + run driver ────────────────────────────────────────────────

test('strength stall + run driver + strength goal → cut running', () => {
  const f = mkFinding('e1rm_trend', 'down', 'strength', 'Back Squat');
  const a = mkAttribution(['running_load']);
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.STRENGTH }, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, a, ctx);
  assert.ok(t !== null, 'should produce a tradeoff');
  assert.ok(/running/i.test(t), 'should mention running');
  assert.ok(/strength/i.test(t), 'should mention strength priority');
});

test('strength plateau + run driver + endurance goal + build phase → keep running, reduce lift freq', () => {
  const f = mkFinding('plateau', 'flat', 'strength', 'Deadlift');
  const a = mkAttribution(['running_distance']);
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.ENDURANCE }, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, a, ctx);
  assert.ok(t !== null);
  assert.ok(/2x\/week|2x per week|frequency/i.test(t), 'should suggest reduced frequency');
});

test('strength stall + run driver + endurance goal + taper → cut lifting to maintenance', () => {
  const f = mkFinding('e1rm_trend', 'down', 'strength', 'Bench Press');
  const a = mkAttribution(['hard_running_min']);
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.ENDURANCE }, phase: PHASES.TAPER };
  const t = resolveTradeoff(f, a, ctx);
  assert.ok(t !== null);
  assert.ok(/maintenance|race|taper/i.test(t));
});

test('strength stall + run driver + hybrid goal → reduce intensity not volume', () => {
  const f = mkFinding('plateau', 'flat', 'strength', 'Squat');
  const a = mkAttribution(['running_load']);
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.HYBRID }, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, a, ctx);
  assert.ok(t !== null);
  assert.ok(/intensity|interval/i.test(t));
});

test('strength stall + run driver + recomp goal → protect strength', () => {
  const f = mkFinding('e1rm_trend', 'down', 'strength', 'Bench Press');
  const a = mkAttribution(['running_load']);
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.RECOMP }, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, a, ctx);
  assert.ok(t !== null);
  assert.ok(/strength|muscle/i.test(t));
});

// ── Interference ───────────────────────────────────────────────────────────────

test('interference + no goal → generic ease directive', () => {
  const f = mkFinding('interference', 'up', 'recovery');
  const ctx = { goalConfig: {}, phase: PHASES.MAINTENANCE, strengthLoad: 500, enduranceLoad: 40 };
  const t = resolveTradeoff(f, null, ctx);
  assert.ok(t !== null);
  assert.ok(/ease|modality|depleted/i.test(t));
});

test('interference + strength goal → cut running', () => {
  const f = mkFinding('interference', 'up', 'recovery');
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.STRENGTH }, phase: PHASES.BUILD, strengthLoad: 500, enduranceLoad: 60 };
  const t = resolveTradeoff(f, null, ctx);
  assert.ok(t !== null);
  assert.ok(/running/i.test(t));
  assert.ok(/easy|sessions|2/i.test(t));
});

test('interference + endurance goal + build → cut lifting, protect runs', () => {
  const f = mkFinding('interference', 'up', 'recovery');
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.ENDURANCE }, phase: PHASES.BUILD, strengthLoad: 400, enduranceLoad: 80 };
  const t = resolveTradeoff(f, null, ctx);
  assert.ok(t !== null);
  assert.ok(/lifting|strength/i.test(t));
  assert.ok(/2 sessions|2x|max/i.test(t));
});

test('interference + endurance goal + taper → one session only', () => {
  const f = mkFinding('interference', 'up', 'recovery');
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.ENDURANCE }, phase: PHASES.TAPER, strengthLoad: 300, enduranceLoad: 50 };
  const t = resolveTradeoff(f, null, ctx);
  assert.ok(t !== null);
  assert.ok(/taper|one|full.body/i.test(t));
});

// ── Load spike ─────────────────────────────────────────────────────────────────

test('running load spike + strength goal → hold weights this week', () => {
  const f = mkFinding('load_spike', 'up', 'aerobic', 'run');
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.STRENGTH }, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, null, ctx);
  assert.ok(t !== null);
  assert.ok(/squat|deadlift|lower|weights/i.test(t));
});

test('running load spike + no goal → hold weights', () => {
  const f = mkFinding('load_spike', 'up', 'aerobic', 'run');
  const ctx = { goalConfig: {}, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, null, ctx);
  assert.ok(t !== null);
});

// ── Strength volume falling + endurance goal ───────────────────────────────────

test('strength volume down + endurance goal → minimum dose reminder', () => {
  const f = mkFinding('volume_trend', 'down', 'strength', 'global');
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.ENDURANCE }, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, null, ctx);
  assert.ok(t !== null);
  assert.ok(/2 strength|minimum|dose/i.test(t));
});

// ── No-match returns null ──────────────────────────────────────────────────────

test('unrelated finding + no attribution returns null', () => {
  const f = mkFinding('bodyweight_trend', 'up', 'bodyweight');
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.STRENGTH }, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, null, ctx);
  assert.equal(t, null);
});

test('strength stall without run driver returns null', () => {
  const f = mkFinding('e1rm_trend', 'down', 'strength', 'Bench Press');
  const a = mkAttribution(['recovery_cost']); // no run driver
  const ctx = { goalConfig: { primaryGoal: GOAL_TYPES.STRENGTH }, phase: PHASES.BUILD };
  const t = resolveTradeoff(f, a, ctx);
  assert.equal(t, null);
});

// ── End-to-end: tradeoffs flow through the insight pipeline ───────────────────

test('tradeoffs appear in generated insights when goal is set and interference fires', async () => {
  const { generateInsights } = await import('../js/brain/core.js');
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  function mkHighLoadWeek(benchW, runKm) {
    return {
      startedAt: new Date().toISOString(),
      lifts: {
        mon: { 'Back Squat':  [{ w: '160', r: '3', c: true }, { w: '160', r: '3', c: true }, { w: '160', r: '3', c: true }, { w: '160', r: '3', c: true }] },
        wed: { 'Deadlift':    [{ w: '200', r: '3', c: true }, { w: '200', r: '3', c: true }, { w: '200', r: '3', c: true }] },
        fri: { 'Bench Press': [{ w: String(benchW), r: '5', c: true }, { w: String(benchW), r: '5', c: true }] },
      },
      gymRpe:  { mon: '9', wed: '9', fri: '8' },
      gymStats:{ mon: { time: '75' }, wed: { time: '70' }, fri: { time: '60' } },
      runs:    { sat: { dist: String(runKm), time: '60:00', rpe: '8' }, sun: { dist: String(runKm * 0.6), time: '36:00', rpe: '6' } },
      bodyWeight: {}, notes: {}, supersets: {}, sessionType: {},
    };
  }

  const state = {
    currentWeek: '3',
    weeks: { '1': mkHighLoadWeek(100, 15), '2': mkHighLoadWeek(105, 20), '3': mkHighLoadWeek(108, 25) },
    goalData: { goalConfig: { primaryGoal: GOAL_TYPES.ENDURANCE } },
  };

  const report = generateInsights(state, { days: DAYS, currentWeek: '3', maxWeek: 12 });
  assert.ok(report.allInsights.length > 0, 'should produce insights');

  // Check that at least one insight has a non-null tradeoffs field
  const withTradeoffs = report.allInsights.filter(i => i.tradeoffs != null);
  assert.ok(withTradeoffs.length > 0, 'at least one insight should have a goal-aware tradeoff');

  // If interference fired, its tradeoff should be goal-specific (mention running priority)
  const interference = report.allInsights.find(i => i.findings?.some(id => id.includes('interference')));
  if (interference && interference.tradeoffs) {
    assert.ok(/running|key run|lift|strength/i.test(interference.tradeoffs), 'interference tradeoff should be goal-specific');
  }
});
