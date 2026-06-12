// ==========================================
// SCHEMA MIGRATION TESTS (tests/schema_migration.test.js)
// Covers v1 → v2 write-through migration for custom programs:
//   - migrateProgramToV2: shape correctness, idempotency
//   - migrateCustomProgramToV2: smart days{} vs orphan-weeks path
//   - resolveProgramV2: memoisation / WeakMap cache
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCHEMA_VERSION,
  migrateProgramToV2,
  migrateCustomProgramToV2,
  resolveProgramV2,
  getDayV2,
} from '../js/schema.js';

// ---- v1 fixture -----------------------------------------------------------

const V1_PROGRAM = {
  id: 'test_v1',
  name: 'Test V1 Program',
  totalWeeks: 4,
  days: {
    mon: { title: 'Push', badge: 'Push', color: '#f00', desc: 'Heavy compound work', runs: 'Rest', lifts: ['Bench Press'] },
    tue: { title: 'Run', badge: 'Run', color: '#0f0', desc: '', runs: 'Easy 30 min', lifts: [] },
    wed: { title: 'Rest', badge: 'Rest', color: '#888', desc: '', runs: 'Rest', lifts: [] },
    thu: { title: 'Pull', badge: 'Pull', color: '#00f', desc: 'Posterior chain focus', runs: 'Rest', lifts: ['Deadlift'] },
    fri: { title: 'Run', badge: 'Run', color: '#0f0', desc: '', runs: 'Tempo 40 min', lifts: [] },
    sat: { title: 'Long', badge: 'Long', color: '#0aa', desc: '', runs: 'Long run 60 min', lifts: [] },
    sun: { title: 'Rest', badge: 'Rest', color: '#888', desc: '', runs: 'Rest', lifts: [] },
  },
  weeklyVolModifiers: {
    '1': { sets: 3, reps: 8, intensityLabel: 'Accumulation' },
    '2': { sets: 4, reps: 6, intensityLabel: 'Intensification' },
  },
};

// ---- migrateProgramToV2 ---------------------------------------------------

test('migrateProgramToV2: produces schemaVersion 2 with weeks array', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  assert.equal(v2.schemaVersion, SCHEMA_VERSION);
  assert.ok(Array.isArray(v2.weeks), 'weeks should be an array');
  assert.equal(v2.weeks.length, 4); // totalWeeks
});

test('migrateProgramToV2: each week has days object with all 7 day keys', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (const week of v2.weeks) {
    assert.ok(week.days, 'week should have days');
    for (const dk of DAY_KEYS) {
      assert.ok(dk in week.days, `week should have day key: ${dk}`);
    }
  }
});

test('migrateProgramToV2: lift entries are block[] with kind=lift', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  const monday = v2.weeks[0].days.mon;
  assert.ok(Array.isArray(monday.block), 'day should have block array');
  const lifts = monday.block.filter(e => e.kind === 'lift');
  assert.ok(lifts.length > 0, 'should have at least one lift block entry');
  assert.equal(lifts[0].name, 'Bench Press');
  assert.ok(typeof lifts[0].sets === 'number');
  assert.ok(lifts[0].reps !== null, 'reps should be set');
});

test('migrateProgramToV2: run entries are block[] with kind=run', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  const tuesday = v2.weeks[0].days.tue;
  const runs = tuesday.block.filter(e => e.kind === 'run');
  assert.ok(runs.length > 0, 'tuesday should have a run block entry');
  assert.equal(runs[0].run.type, 'easy');
});

test('migrateProgramToV2: rest day has empty block', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  const sunday = v2.weeks[0].days.sun;
  assert.equal(sunday.block.length, 0, 'rest day should have empty block');
});

test('migrateProgramToV2: weeklyVolModifiers are applied per-week', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  // Week 1: sets=3, Week 2: sets=4
  const w1lifts = v2.weeks[0].days.mon.block.filter(e => e.kind === 'lift');
  const w2lifts = v2.weeks[1].days.mon.block.filter(e => e.kind === 'lift');
  assert.equal(w1lifts[0].sets, 3);
  assert.equal(w2lifts[0].sets, 4);
});

test('migrateProgramToV2: applies week labels from intensityLabel', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  assert.equal(v2.weeks[0].label, 'Accumulation');
  assert.equal(v2.weeks[1].label, 'Intensification');
});

test('migrateProgramToV2: preserves id and name', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  assert.equal(v2.id, 'test_v1');
  assert.equal(v2.name, 'Test V1 Program');
  assert.equal(v2.totalWeeks, 4);
});

// ---- idempotency ----------------------------------------------------------

test('migrateProgramToV2: is idempotent — migrating twice returns same shape', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  const v2again = migrateProgramToV2(v2);
  assert.equal(v2again.schemaVersion, SCHEMA_VERSION);
  assert.equal(v2again.weeks.length, v2.weeks.length);
  // Identity check: a v2 input is returned as-is (same reference)
  assert.equal(v2again, v2);
});

test('migrateProgramToV2: returns null/undefined unchanged', () => {
  assert.equal(migrateProgramToV2(null), null);
  assert.equal(migrateProgramToV2(undefined), undefined);
});

// ---- migrateCustomProgramToV2 --------------------------------------------

test('migrateCustomProgramToV2: migrates v1 days{} shape the same as migrateProgramToV2', () => {
  const v2a = migrateProgramToV2(V1_PROGRAM);
  const v2b = migrateCustomProgramToV2(V1_PROGRAM);
  assert.equal(v2b.schemaVersion, SCHEMA_VERSION);
  assert.equal(v2b.weeks.length, v2a.weeks.length);
});

test('migrateCustomProgramToV2: passes through already-v2 programs', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  const result = migrateCustomProgramToV2(v2);
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(result, v2); // same reference — no unnecessary work
});

// ---- resolveProgramV2 (WeakMap memo) -------------------------------------

test('resolveProgramV2: returns a v2 program for v1 input', () => {
  const resolved = resolveProgramV2(V1_PROGRAM);
  assert.equal(resolved.schemaVersion, SCHEMA_VERSION);
  assert.ok(Array.isArray(resolved.weeks));
});

test('resolveProgramV2: memoises — same input object returns same output reference', () => {
  const first = resolveProgramV2(V1_PROGRAM);
  const second = resolveProgramV2(V1_PROGRAM);
  assert.equal(first, second, 'should return the same cached object');
});

test('resolveProgramV2: v2 input returned as-is (no re-migration)', () => {
  const v2 = migrateProgramToV2(V1_PROGRAM);
  const resolved = resolveProgramV2(v2);
  assert.equal(resolved, v2, 'v2 programs should be returned by identity');
});

test('resolveProgramV2: handles null/undefined gracefully', () => {
  assert.equal(resolveProgramV2(null), null);
  assert.equal(resolveProgramV2(undefined), undefined);
});

// ---- getDayV2 integration ------------------------------------------------

test('getDayV2: returns correct day structure from v1 program', () => {
  const day = getDayV2(V1_PROGRAM, 1, 'mon');
  assert.ok(day, 'should return a day object');
  assert.ok(day.day, 'should have a day property');
  assert.ok(Array.isArray(day.day.block));
});

test('getDayV2: clamps week index — beyond totalWeeks reuses last week', () => {
  const dayW4 = getDayV2(V1_PROGRAM, 4, 'mon');
  const dayW99 = getDayV2(V1_PROGRAM, 99, 'mon');
  // Both should return the same block shape (last week)
  assert.equal(JSON.stringify(dayW99.day.block), JSON.stringify(dayW4.day.block));
});

test('getDayV2: returns null for unknown day key', () => {
  const day = getDayV2(V1_PROGRAM, 1, 'xyz');
  assert.equal(day.day, null);
});
