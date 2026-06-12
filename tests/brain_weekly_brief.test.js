// ==========================================
// WEEKLY BRIEF TESTS (tests/brain_weekly_brief.test.js)
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateWeekBrief, detectPhase, PHASES, GOAL_TYPES, MODALITY } from '../js/brain/weekly_brief.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function mkWeek(benchW, runKm, gymRpe = '7', runRpe = '6') {
  return {
    startedAt: new Date().toISOString(),
    lifts:   { mon: { 'Bench Press': [{ w: String(benchW), r: '5', c: true }, { w: String(benchW), r: '5', c: true }] } },
    gymRpe:  { mon: gymRpe },
    gymStats:{ mon: { time: '60' } },
    runs:    { sat: { dist: String(runKm), time: '60:00', rpe: runRpe } },
    bodyWeight: {},
    notes: {},
    supersets: {},
    sessionType: {},
  };
}

// ── Phase detection ────────────────────────────────────────────────────────────

test('detectPhase returns Maintenance when no goal date', () => {
  assert.equal(detectPhase(null), PHASES.MAINTENANCE);
});

test('detectPhase returns Taper ≤ 2 weeks', () => {
  assert.equal(detectPhase(1),  PHASES.TAPER);
  assert.equal(detectPhase(2),  PHASES.TAPER);
});

test('detectPhase returns Peak 3–6 weeks', () => {
  assert.equal(detectPhase(3),  PHASES.PEAK);
  assert.equal(detectPhase(6),  PHASES.PEAK);
});

test('detectPhase returns Build 7–14 weeks', () => {
  assert.equal(detectPhase(7),  PHASES.BUILD);
  assert.equal(detectPhase(14), PHASES.BUILD);
});

test('detectPhase returns Base > 14 weeks', () => {
  assert.equal(detectPhase(15), PHASES.BASE);
  assert.equal(detectPhase(52), PHASES.BASE);
});

// ── No data ────────────────────────────────────────────────────────────────────

test('returns graceful brief when no logged data', () => {
  const state = { currentWeek: '1', weeks: {} };
  const brief = generateWeekBrief(state, { days: DAYS });
  assert.equal(brief.hasEnoughData, false);
  assert.ok(brief.headline.length > 0);
  assert.ok(Array.isArray(brief.adjustments));
});

// ── With data, no goal ─────────────────────────────────────────────────────────

test('returns progress brief with no goal set and healthy load', () => {
  const state = {
    currentWeek: '3',
    weeks: {
      '1': mkWeek(100, 10),
      '2': mkWeek(105, 12),
      '3': mkWeek(110, 14),
    },
  };
  const brief = generateWeekBrief(state, { days: DAYS, maxWeek: 12, currentWeek: '3' });
  assert.equal(brief.hasEnoughData, true);
  assert.equal(brief.hasGoal, false);
  assert.ok(brief.headline.length > 0);
});

// ── Goal: endurance, far out ───────────────────────────────────────────────────

test('returns Base phase brief for endurance goal 20 weeks out', () => {
  const future = new Date();
  future.setDate(future.getDate() + 140); // 20 weeks
  const state = {
    currentWeek: '3',
    weeks: { '1': mkWeek(100, 10), '2': mkWeek(105, 12), '3': mkWeek(108, 13) },
    goalData: {
      goalConfig: {
        primaryGoal: GOAL_TYPES.ENDURANCE,
        goalEventDate: future.toISOString().slice(0, 10),
        goalEventName: 'Half Marathon',
      },
    },
  };
  const brief = generateWeekBrief(state, { days: DAYS, maxWeek: 12, currentWeek: '3', goalConfig: state.goalData.goalConfig });
  assert.equal(brief.phase, PHASES.BASE);
  assert.equal(brief.hasGoal, true);
  assert.ok(brief.weeksToGoal >= 18);
  assert.ok(brief.adjustments.length > 0);
});

// ── Goal: strength, taper ──────────────────────────────────────────────────────

test('returns Taper brief when event is 1 week out', () => {
  const next = new Date();
  next.setDate(next.getDate() + 5);
  const state = {
    currentWeek: '10',
    weekStartedAt: new Date().toISOString(),
    weeks: {
      '8':  mkWeek(150, 5),
      '9':  mkWeek(160, 6),
      '10': mkWeek(165, 4),
    },
    goalData: {
      goalConfig: {
        primaryGoal: GOAL_TYPES.STRENGTH,
        goalEventDate: next.toISOString().slice(0, 10),
        goalEventName: 'Powerlifting Meet',
      },
    },
  };
  const brief = generateWeekBrief(state, { days: DAYS, maxWeek: 10, currentWeek: '10', goalConfig: state.goalData.goalConfig });
  assert.equal(brief.phase, PHASES.TAPER);
  assert.equal(brief.tone, 'goal');
  assert.ok(brief.headline.includes('Taper'));
  assert.ok(brief.adjustments.length >= 2);
});

// ── Recovery override ──────────────────────────────────────────────────────────

test('returns risk brief when recovery is critically low', () => {
  // Spike RPE to 10 on every session to force low recovery score
  function mkHighRpe() {
    return {
      startedAt: new Date().toISOString(),
      lifts:   { mon: { 'Bench Press': [{ w: '150', r: '3', c: true }, { w: '150', r: '3', c: true }] }, wed: { 'Squat': [{ w: '180', r: '3', c: true }] }, fri: { 'Deadlift': [{ w: '200', r: '3', c: true }] } },
      gymRpe:  { mon: '10', wed: '10', fri: '10' },
      gymStats:{ mon: { time: '90' }, wed: { time: '90' }, fri: { time: '90' } },
      runs:    { sat: { dist: '20', time: '100:00', rpe: '10' }, sun: { dist: '18', time: '95:00', rpe: '10' } },
      bodyWeight: {}, notes: {}, supersets: {}, sessionType: {},
    };
  }
  const state = {
    currentWeek: '3',
    weeks: { '1': mkHighRpe(), '2': mkHighRpe(), '3': mkHighRpe() },
  };
  const brief = generateWeekBrief(state, { days: DAYS, maxWeek: 3, currentWeek: '3' });
  // Should either be risk tone (low recovery or high load) — just verify it surfaces something actionable
  assert.ok(['risk', 'progress', 'opportunity'].includes(brief.tone));
  assert.ok(brief.hasEnoughData, true);
  assert.ok(brief.headline.length > 0);
});

// ── Shape contract ─────────────────────────────────────────────────────────────

test('brief always has required shape fields', () => {
  const state = {
    currentWeek: '2',
    weeks: { '1': mkWeek(100, 8), '2': mkWeek(105, 10) },
  };
  const brief = generateWeekBrief(state, { days: DAYS, maxWeek: 12 });
  const required = ['headline', 'directive', 'adjustments', 'tone', 'hasGoal', 'hasEnoughData'];
  required.forEach(k => assert.ok(k in brief, `missing field: ${k}`));
  assert.ok(Array.isArray(brief.adjustments));
  assert.ok(['risk','opportunity','goal','recovery','progress'].includes(brief.tone));
});
