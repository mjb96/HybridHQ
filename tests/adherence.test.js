// ==========================================
// ADHERENCE / SCHEDULE-RESOLVER TESTS (tests/adherence.test.js)
// Covers the v2 run-scheduling fix: computeGoalAdherence /
// computeWeeklyCompletionSeries are schema-agnostic and take an injected
// isRunScheduledFn resolver (built by schema.isRunScheduledResolver) so that
// v2-shaped programs (weeks[] → days{} → block[]) count scheduled runs, which
// the old `program.days[d]` lookup silently missed. Also covers the
// computeStreakView future-date clamp. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeGoalAdherence,
  computeWeeklyCompletionSeries,
  computeStreakView,
} from '../js/engine.js';
import {
  createEmptyV2Program,
  makeRunEntry,
  isRunScheduledResolver,
} from '../js/schema.js';

// Minimal state: week "1", a 5 km run logged on Monday, nothing else.
function stateWithMondayRun() {
  return {
    currentWeek: '1',
    weeks: {
      '1': {
        runs: { mon: { dist: '5', time: '25:00', rpe: '6' } },
        lifts: {},
      },
    },
  };
}

// ---- v1 legacy path still works (no resolver passed) ----------------------
test('computeGoalAdherence: legacy days{} program counts scheduled runs', () => {
  const program = { days: { mon: { runs: 'Easy 5k' } } };
  const a = computeGoalAdherence(stateWithMondayRun(), program, ['mon'], 1);
  assert.equal(a.total, 1);
  assert.equal(a.done, 1);
  assert.equal(a.pct, 100);
});

// ---- v2 program: legacy lookup misses, resolver fixes it ------------------
test('computeGoalAdherence: v2 program without resolver misses the run (regression guard)', () => {
  const prog = createEmptyV2Program({ id: 'p', name: 'P', totalWeeks: 1 });
  prog.weeks[0].days.mon.block.push(makeRunEntry({ type: 'easy' }));
  const a = computeGoalAdherence(stateWithMondayRun(), prog, ['mon'], 1);
  // No days{} on a v2 program → legacy path sees nothing scheduled.
  assert.equal(a.total, 0);
});

test('computeGoalAdherence: v2 program with resolver counts the scheduled run', () => {
  const prog = createEmptyV2Program({ id: 'p', name: 'P', totalWeeks: 1 });
  prog.weeks[0].days.mon.block.push(makeRunEntry({ type: 'easy' }));
  const a = computeGoalAdherence(stateWithMondayRun(), prog, ['mon'], 1, isRunScheduledResolver(prog));
  assert.equal(a.total, 1);
  assert.equal(a.done, 1);
  assert.equal(a.pct, 100);
});

test('computeWeeklyCompletionSeries: v2 resolver yields per-week completion', () => {
  const prog = createEmptyV2Program({ id: 'p', name: 'P', totalWeeks: 1 });
  prog.weeks[0].days.mon.block.push(makeRunEntry({ type: 'easy' }));
  const series = computeWeeklyCompletionSeries(stateWithMondayRun(), prog, ['mon'], 1, isRunScheduledResolver(prog));
  assert.deepEqual(series, [100]);
});

// ---- resolver predicate ---------------------------------------------------
test('isRunScheduledResolver: true for non-rest run day, false otherwise', () => {
  const prog = createEmptyV2Program({ id: 'p', name: 'P', totalWeeks: 1 });
  prog.weeks[0].days.mon.block.push(makeRunEntry({ type: 'easy' }));
  prog.weeks[0].days.tue.block.push(makeRunEntry({ type: 'rest' }));
  const res = isRunScheduledResolver(prog);
  assert.equal(res(1, 'mon'), true);
  assert.equal(res(1, 'tue'), false); // rest is not a scheduled run
  assert.equal(res(1, 'wed'), false); // no run block
});

// ---- computeStreakView future-date clamp ----------------------------------
test('computeStreakView: future lastActivityDate is treated as broken, not live', () => {
  const now = new Date('2026-06-14T12:00:00');
  const shift = (days) => { const x = new Date(now); x.setDate(x.getDate() + days); return x.toISOString(); };
  const sd = { current: 5, longest: 9, lastActivityDate: shift(1) }; // tomorrow

  const v = computeStreakView(sd, now);
  assert.equal(v.broken, true);
  assert.equal(v.current, 0);
  assert.equal(v.longest, 9);
});

test('computeStreakView: today and yesterday keep the streak live, 2 days breaks it', () => {
  const now = new Date('2026-06-14T12:00:00');
  const shift = (days) => { const x = new Date(now); x.setDate(x.getDate() + days); return x.toISOString(); };

  assert.equal(computeStreakView({ current: 5, longest: 9, lastActivityDate: shift(0) }, now).current, 5);
  assert.equal(computeStreakView({ current: 5, longest: 9, lastActivityDate: shift(-1) }, now).current, 5);
  assert.equal(computeStreakView({ current: 5, longest: 9, lastActivityDate: shift(-2) }, now).broken, true);
});
