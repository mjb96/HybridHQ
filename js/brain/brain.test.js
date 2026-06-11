// ==========================================
// HYBRID BRAIN TEST SUITE (brain.test.js)
// Pure Node.js testing. Run with `node --test`
// ==========================================
import assert from 'node:assert';
import { test } from 'node:test';
import { evaluateState } from './core.js';
import { calculateSystemicFatigue } from './fatigue_models.js';

const MOCK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function createMockState(acwrType) {
  const state = {
    currentWeek: "5",
    weeks: {}
  };

  for (let i = 1; i <= 5; i++) {
    state.weeks[String(i)] = {
      gymRpe: {},
      gymStats: {},
      runs: {},
      lifts: {}
    };
    
    MOCK_DAYS.forEach(d => {
      let rpe = 5;
      if (acwrType === 'DANGER' && i === 5) rpe = 10; // Massive acute spike
      
      state.weeks[String(i)].gymRpe[d] = String(rpe);
      state.weeks[String(i)].gymStats[d] = { time: "60" };
    });
  }
  return state;
}

test('Systemic Fatigue Model Calculates ACWR correctly', () => {
  const state = createMockState('NORMAL');
  const fatigue = calculateSystemicFatigue(state.weeks, "5", MOCK_DAYS);
  
  // Normal state: Acute load equals chronic load
  assert.strictEqual(fatigue.acwr, 1.0);
  assert.strictEqual(fatigue.score, 0);
});

test('Systemic Fatigue Model flags Danger ACWR', () => {
  const state = createMockState('DANGER');
  const fatigue = calculateSystemicFatigue(state.weeks, "5", MOCK_DAYS);
  
  // Danger state: Acute load is double chronic load
  assert.strictEqual(fatigue.acwr, 2.0);
  assert.strictEqual(fatigue.score, 100);
});

test('Core Engine Pipeline - Prioritizes Global Deload', () => {
  const state = createMockState('DANGER'); // Forces ACWR 2.0
  
  // Force a local momentum pattern by faking a lift PR
  state.weeks["1"].lifts["mon"] = { "Back Squat": [{w: "100", r: "5", c: true, isWarmup: false}] };
  state.weeks["5"].lifts["mon"] = { "Back Squat": [{w: "120", r: "5", c: true, isWarmup: false}] };

  const result = evaluateState(state, MOCK_DAYS);

  // 1. Did it observe ACWR?
  const acwrObs = result.observations.find(o => o.metric === 'ACWR');
  assert.ok(acwrObs);
  assert.strictEqual(acwrObs.value, 2.0);

  // 2. Did it detect Systemic Overreaching?
  const overreachPattern = result.patterns.find(p => p.type === 'SYSTEMIC_OVERREACHING');
  assert.ok(overreachPattern);
  assert.strictEqual(overreachPattern.severity, 5);

  // 3. Did it detect Momentum?
  const momentumPattern = result.patterns.find(p => p.type === 'MOMENTUM_STRENGTH');
  assert.ok(momentumPattern);

  // 4. Decision Engine MUST drop the momentum maintenance and prioritize GLOBAL deload
  assert.strictEqual(result.actions.length, 1);
  assert.strictEqual(result.actions[0].target, 'GLOBAL');
  assert.strictEqual(result.actions[0].action, 'REDUCE_VOLUME');
});
