// ==========================================
// TIME-AXIS TESTS (tests/dates.test.js) — `node --test`
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slotDate, slotDateISO, estimateWeekStart, daysBetween, weekRangeLabel } from '../js/dates.js';

// Monday 2026-06-08 as the week start.
const MON = '2026-06-08T00:00:00.000Z';

test('slotDateISO offsets each weekday from the Monday start', () => {
  assert.equal(slotDateISO(MON, 'mon'), '2026-06-08');
  assert.equal(slotDateISO(MON, 'tue'), '2026-06-09');
  assert.equal(slotDateISO(MON, 'sun'), '2026-06-14');
});

test('slotDate returns null for missing/invalid input', () => {
  assert.equal(slotDate(null, 'mon'), null);
  assert.equal(slotDate('not-a-date', 'mon'), null);
});

test('estimateWeekStart walks back/forward 7-day weeks', () => {
  // current week is 5 starting MON; week 3 started two weeks earlier.
  const wk3 = estimateWeekStart(MON, 5, 3);
  assert.equal(new Date(wk3).getUTCDate(), 25); // 2026-05-25
  // a future week
  const wk6 = estimateWeekStart(MON, 5, 6);
  assert.equal(new Date(wk6).getUTCDate(), 15); // 2026-06-15
});

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-06-08', '2026-06-15'), 7);
  assert.equal(daysBetween('2026-06-15', '2026-06-08'), -7);
  assert.equal(daysBetween('x', '2026-06-08'), null);
});

test('weekRangeLabel renders a readable range', () => {
  assert.equal(weekRangeLabel(MON), 'Jun 8–14');
  assert.equal(weekRangeLabel('2026-05-25T00:00:00.000Z'), 'May 25–31');
});
