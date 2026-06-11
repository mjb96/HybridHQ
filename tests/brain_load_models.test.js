// ==========================================
// HYBRID BRAIN — LOAD MODEL TESTS (tests/brain_load_models.test.js)
// Verifies the three-concept load model: Strength Load (tonnage), Endurance
// Load (distance), Recovery Cost (cross-modal sRPE), and acute/chronic balance.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  strengthLoadSeries,
  enduranceLoadSeries,
  recoveryCostSeries,
  recoveryCostBreakdown,
  recoveryCostBalance,
  loadProfile,
} from '../js/brain/load_models.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function fixture() {
  return {
    currentWeek: '2',
    weeks: {
      '1': {
        lifts: { mon: { 'Back Squat': [
          { w: '100', r: '5', c: true },                 // 500 (working, done)
          { w: '100', r: '5', c: true },                 // 500
          { w: '60',  r: '5', c: true, isWarmup: true },  // warmup → excluded
          { w: '100', r: '5', c: false },                // incomplete → excluded
        ] } },
        gymRpe:   { mon: '8' },
        gymStats: { mon: { time: '60' } },               // 60 min
        runs:     { sat: { dist: '5', time: '25:00', rpe: '6' } },
      },
      '2': {
        lifts: { mon: { 'Back Squat': [
          { w: '105', r: '5', c: true },                 // 525
          { w: '105', r: '5', c: true },                 // 525
        ] } },
        gymRpe:   { mon: '9' },
        gymStats: { mon: { time: '50' } },               // 50 min
        runs:     { sat: { dist: '8', time: '40:00', rpe: '7' } },
      },
    },
  };
}

test('strengthLoadSeries sums completed working-set tonnage, excludes warmups/incomplete', () => {
  assert.deepEqual(strengthLoadSeries(fixture(), DAYS, 2), [1000, 1050]);
});

test('enduranceLoadSeries sums weekly running distance', () => {
  assert.deepEqual(enduranceLoadSeries(fixture(), DAYS, 2), [5, 8]);
});

test('recoveryCostSeries = sRPE (RPE*min) for gym + run, per week', () => {
  // wk1: gym 8*60=480 + run 6*25=150 = 630 ; wk2: 9*50=450 + 7*40=280 = 730
  assert.deepEqual(recoveryCostSeries(fixture(), DAYS, 2), [630, 730]);
});

test('recoveryCostBreakdown separates strength vs endurance contribution', () => {
  const b = recoveryCostBreakdown(fixture(), DAYS, 2);
  assert.deepEqual(b.strength, [480, 450]);
  assert.deepEqual(b.endurance, [150, 280]);
  assert.deepEqual(b.total, [630, 730]);
});

test('recoveryCostBalance yields ACWR on the recovery-cost series', () => {
  const r = recoveryCostBalance(fixture(), DAYS, '2', 2);
  assert.equal(r.hasData, true);
  assert.equal(r.acute, 730);
  assert.equal(r.chronic, 680);   // (630 + 730) / 2
  assert.equal(r.acwr, 1.07);     // 730 / 680
});

test('loadProfile bundles all three concepts + balance', () => {
  const p = loadProfile(fixture(), DAYS, '2', 2);
  assert.deepEqual(p.strength, [1000, 1050]);
  assert.deepEqual(p.endurance, [5, 8]);
  assert.deepEqual(p.recoveryCost, [630, 730]);
  assert.equal(p.balance.hasData, true);
});

test('empty state degrades gracefully to zeroed series', () => {
  const empty = { currentWeek: '1', weeks: {} };
  assert.deepEqual(strengthLoadSeries(empty, DAYS, 2), [0, 0]);
  assert.deepEqual(enduranceLoadSeries(empty, DAYS, 2), [0, 0]);
  assert.deepEqual(recoveryCostSeries(empty, DAYS, 2), [0, 0]);
  assert.equal(recoveryCostBalance(empty, DAYS, '1', 2).hasData, false);
});
