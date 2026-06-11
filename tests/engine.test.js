// ==========================================
// ENGINE PRIMITIVE TESTS (tests/engine.test.js)
// Foundation suite for the centralised metric primitives:
//   epley1RM, isCompletedSet, parseDurationToMinutes,
//   paceSecondsPerKm, formatPace
// These are the single-source calculations consumed by analytics, home,
// dashboard, workout and state — so future Hybrid Brain logic can rely on
// them instead of re-deriving its own. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  epley1RM,
  isCompletedSet,
  parseDurationToMinutes,
  paceSecondsPerKm,
  formatPace,
} from '../js/engine.js';

// ---- epley1RM (D1) --------------------------------------------------------
test('epley1RM computes the Epley estimate w*(1+r/30)', () => {
  assert.equal(epley1RM(100, 5), 100 * (1 + 5 / 30));
  assert.ok(Math.abs(epley1RM(60, 1) - 62) < 1e-9); // single rep ≈ load + 1/30
  assert.equal(epley1RM(100, 0), 0);            // zero reps → 0
  assert.equal(epley1RM(0, 5), 0);              // zero load → 0
});

test('epley1RM coerces string inputs and guards garbage', () => {
  assert.equal(epley1RM('100', '5'), 100 * (1 + 5 / 30));
  assert.equal(epley1RM('abc', '5'), 0);
  assert.equal(epley1RM(-50, 5), 0);            // negative load → 0
});

// ---- isCompletedSet (D2) --------------------------------------------------
test('isCompletedSet accepts every legacy "truthy completed" encoding', () => {
  for (const c of [true, 'true', 'on', 1]) {
    assert.equal(isCompletedSet({ c }), true, `c=${JSON.stringify(c)}`);
  }
});

test('isCompletedSet rejects incomplete / malformed sets', () => {
  for (const v of [{ c: false }, { c: 0 }, { c: 'off' }, {}, null, undefined]) {
    assert.equal(isCompletedSet(v), false, `value=${JSON.stringify(v)}`);
  }
});

// ---- parseDurationToMinutes (D3) -----------------------------------------
test('parseDurationToMinutes handles h:mm:ss, mm:ss, bare minutes', () => {
  assert.equal(parseDurationToMinutes('1:30:00'), 90);
  assert.equal(parseDurationToMinutes('30:00'), 30);
  assert.equal(parseDurationToMinutes('45'), 45);
  assert.equal(parseDurationToMinutes('0:30'), 0.5);
});

test('parseDurationToMinutes returns 0 for empty / malformed input', () => {
  assert.equal(parseDurationToMinutes(''), 0);
  assert.equal(parseDurationToMinutes(null), 0);
  assert.equal(parseDurationToMinutes(undefined), 0);
  assert.equal(parseDurationToMinutes('x:y'), 0);
});

// ---- paceSecondsPerKm (D6) -----------------------------------------------
test('paceSecondsPerKm = total seconds / distance(km)', () => {
  assert.equal(paceSecondsPerKm(5, '25:00'), 300);     // 1500s / 5km
  assert.equal(paceSecondsPerKm(10, '50:00'), 300);
  assert.equal(paceSecondsPerKm(2, '1:00:00'), 1800);  // h:mm:ss form
});

test('paceSecondsPerKm returns 0 when distance or time is missing', () => {
  assert.equal(paceSecondsPerKm(0, '25:00'), 0);
  assert.equal(paceSecondsPerKm(5, ''), 0);
  assert.equal(paceSecondsPerKm('', '25:00'), 0);
});

// ---- formatPace (D6) ------------------------------------------------------
test('formatPace renders m:ss/km with zero-padded seconds', () => {
  assert.equal(formatPace(300), '5:00/km');
  assert.equal(formatPace(305), '5:05/km');
  assert.equal(formatPace(0), '--');
  assert.equal(formatPace(null), '--');
});

// ---- round-trip ------------------------------------------------------------
test('pace round-trips: format(paceSecondsPerKm(dist,time)) is stable', () => {
  assert.equal(formatPace(paceSecondsPerKm(5, '25:00')), '5:00/km');
});
