// ==========================================
// ENERGY + METADATA + SESSION-FATIGUE TESTS (tests/brain_intelligence.test.js)
// `node --test`
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mifflinStJeorBMR, totalCaloriesBurned, energyProfile, isProfileComplete } from '../js/profile.js';
import { getExerciseMetadata } from '../js/brain/exercise_metadata.js';
import { computeSessionFatigue } from '../js/brain/session_fatigue.js';

// ---- Energy intelligence --------------------------------------------------
test('Mifflin–St Jeor BMR (male vs female)', () => {
  const base = { weightKg: 80, heightCm: 180, age: 30 };
  assert.equal(mifflinStJeorBMR({ ...base, sex: 'male' }),   1780); // 800+1125-150+5
  assert.equal(mifflinStJeorBMR({ ...base, sex: 'female' }), 1614); // 800+1125-150-161
  assert.equal(mifflinStJeorBMR({ ...base }),                1780); // defaults to male const
});

test('incomplete profile → BMR 0; isProfileComplete guards', () => {
  assert.equal(mifflinStJeorBMR({ weightKg: 80, heightCm: 180 }), 0);
  assert.equal(isProfileComplete({ age: 30, heightCm: 180, weightKg: 80 }), true);
  assert.equal(isProfileComplete({ age: 30, heightCm: 0, weightKg: 80 }), false);
});

test('total + energyProfile = base + active', () => {
  assert.equal(totalCaloriesBurned(1780, 850), 2630);
  const e = energyProfile({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' }, 850);
  assert.deepEqual(e, { bmr: 1780, active: 850, total: 2630, hasProfile: true });
});

// ---- Exercise metadata ----------------------------------------------------
test('curated metadata resolves; carryover + costs present', () => {
  const dl = getExerciseMetadata('Deadlift');
  assert.equal(dl.pattern, 'hinge');
  assert.equal(dl.fatigueCost, 5);
  assert.equal(dl.carryover.deadlift, 1.0);

  const inc = getExerciseMetadata('Incline DB Press');
  assert.equal(inc.pattern, 'horizontal_push');
  assert.ok(inc.primary.includes('upper_chest'));
});

test('unknown name falls back to a category default', () => {
  const m = getExerciseMetadata('Cable Crunches'); // Accessories category
  assert.equal(m.pattern, 'core');
  assert.ok(m.fatigueCost >= 1 && m.fatigueCost <= 5);
});

// ---- Session fatigue ------------------------------------------------------
test('heavy lower day scores far higher than an accessory day', () => {
  const heavy = {
    'Back Squat': [{ w: '140', r: '5', c: true }, { w: '140', r: '5', c: true }, { w: '140', r: '5', c: true }],
    'Deadlift':   [{ w: '180', r: '3', c: true }],
  };
  const light = {
    'Lateral Raise': [{ w: '12', r: '15', c: true }, { w: '12', r: '15', c: true }],
    'Bicep Curl':    [{ w: '20', r: '12', c: true }],
  };
  const h = computeSessionFatigue(heavy);
  const l = computeSessionFatigue(light);
  assert.ok(h.fatigueScore > l.fatigueScore);
  assert.equal(h.workingSets, 4);
  assert.ok(h.byPattern.squat >= 3 && h.byPattern.hinge >= 1);
  assert.equal(l.band, 'low');
});

test('total calories burned scales systemic fatigue up', () => {
  const day = { 'Back Squat': [{ w: '140', r: '5', c: true }, { w: '140', r: '5', c: true }] };
  const baseline = computeSessionFatigue(day, { totalCaloriesBurned: 2000 });
  const big = computeSessionFatigue(day, { totalCaloriesBurned: 3800 });
  assert.equal(baseline.calorieFactor, 1);
  assert.ok(big.fatigueScore > baseline.fatigueScore);
});

test('warmups and incomplete sets do not count', () => {
  const day = { 'Bench Press': [
    { w: '60', r: '5', c: true, isWarmup: true },
    { w: '100', r: '5', c: false },
    { w: '100', r: '5', c: true },
  ] };
  assert.equal(computeSessionFatigue(day).workingSets, 1);
});
