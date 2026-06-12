// ==========================================
// HEALTH INTEGRATION TESTS (tests/health.test.js) — `node --test`
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeSleep,
  sleepDurationScore,
  averageHR,
  normalizeWorkout,
  buildHealthSnapshot,
} from '../js/health/healthCalculations.js';
import { checkAvailability, HealthConnectAvailability } from '../js/health/healthConnect.js';

// ── healthCalculations ────────────────────────────────────────────────────────

test('normalizeSleep totals duration across sessions', () => {
  const sessions = [
    { durationMs: 2 * 60 * 60 * 1000, score: null },
    { durationMs: 6 * 60 * 60 * 1000, score: 82 },
  ];
  const result = normalizeSleep(sessions);
  assert.equal(result.hours, 8);
  assert.equal(result.score, 82);
});

test('normalizeSleep returns zeros for empty input', () => {
  const result = normalizeSleep([]);
  assert.equal(result.hours, 0);
  assert.equal(result.score, null);
});

test('normalizeSleep averages multiple scores', () => {
  const sessions = [
    { durationMs: 3 * 60 * 60 * 1000, score: 70 },
    { durationMs: 4 * 60 * 60 * 1000, score: 90 },
  ];
  const result = normalizeSleep(sessions);
  assert.equal(result.score, 80);
});

test('sleepDurationScore maps duration to quality bands', () => {
  assert.equal(sleepDurationScore(0),  0);
  assert.equal(sleepDurationScore(4),  15);
  assert.equal(sleepDurationScore(5.5), 35);
  assert.equal(sleepDurationScore(6.5), 60);
  assert.equal(sleepDurationScore(7.5), 80);
  assert.equal(sleepDurationScore(8.5), 100);
});

test('averageHR returns null for empty sample array', () => {
  assert.equal(averageHR([]), null);
  assert.equal(averageHR(null), null);
});

test('averageHR ignores zero-bpm samples', () => {
  const samples = [{ bpm: 0 }, { bpm: 60 }, { bpm: 80 }];
  assert.equal(averageHR(samples), 70);
});

test('normalizeWorkout converts raw session to summary', () => {
  const raw = {
    exerciseType:  'EXERCISE_TYPE_RUNNING',
    durationMs:    30 * 60 * 1000,
    totalCalories: 350,
    avgHeartRate:  155,
    totalDistance: 5000,
    startTime:     '2025-01-10T07:00:00Z',
  };
  const ws = normalizeWorkout(raw);
  assert.equal(ws.type, 'Running');
  assert.equal(ws.durationMinutes, 30);
  assert.equal(ws.calories, 350);
  assert.equal(ws.avgHeartRate, 155);
  assert.equal(ws.distanceKm, 5);
  assert.equal(ws.startTime, '2025-01-10T07:00:00Z');
});

test('normalizeWorkout handles missing fields gracefully', () => {
  const ws = normalizeWorkout({ exerciseType: 'EXERCISE_TYPE_YOGA' });
  assert.equal(ws.type, 'Yoga');
  assert.equal(ws.durationMinutes, 0);
  assert.equal(ws.calories, 0);
  assert.equal(ws.avgHeartRate, null);
  assert.equal(ws.distanceKm, null);
});

test('buildHealthSnapshot returns safe defaults for null input', () => {
  const snap = buildHealthSnapshot(null);
  assert.equal(snap.steps, 0);
  assert.equal(snap.activeCalories, 0);
  assert.equal(snap.sleepHours, 0);
  assert.equal(snap.sleepScore, null);
  assert.equal(snap.restingHeartRate, null);
  assert.equal(snap.averageHeartRate, null);
  assert.equal(snap.weightKg, null);
  assert.deepEqual(snap.workouts, []);
  assert.ok(snap.syncedAt);
});

test('buildHealthSnapshot wires all fields from a full payload', () => {
  const raw = {
    steps:           8500,
    activeCalories:  420,
    sleepSessions:   [{ durationMs: 7.5 * 60 * 60 * 1000, score: 78 }],
    heartRateSamples:[{ bpm: 130 }, { bpm: 150 }],
    restingHeartRate: 55,
    weightKg:        82.3,
    exerciseSessions:[{
      exerciseType:  'EXERCISE_TYPE_STRENGTH_TRAINING',
      durationMs:    45 * 60 * 1000,
      totalCalories: 280,
      avgHeartRate:  130,
      totalDistance: 0,
      startTime:     '2025-01-10T18:00:00Z',
    }],
  };
  const snap = buildHealthSnapshot(raw);
  assert.equal(snap.steps, 8500);
  assert.equal(snap.activeCalories, 420);
  assert.equal(snap.sleepHours, 7.5);
  assert.equal(snap.sleepScore, 78);
  assert.equal(snap.restingHeartRate, 55);
  assert.equal(snap.averageHeartRate, 140);
  assert.equal(snap.weightKg, 82.3);
  assert.equal(snap.workouts.length, 1);
  assert.equal(snap.workouts[0].type, 'Strength Training');
});

test('buildHealthSnapshot derives sleep score from duration when device score absent', () => {
  const raw = {
    steps: 0, activeCalories: 0,
    sleepSessions: [{ durationMs: 6.5 * 60 * 60 * 1000, score: null }],
    heartRateSamples: [], restingHeartRate: null, weightKg: null,
    exerciseSessions: [],
  };
  const snap = buildHealthSnapshot(raw);
  assert.equal(snap.sleepHours, 6.5);
  assert.equal(snap.sleepScore, sleepDurationScore(6.5));
});

// ── healthConnect — no bridge present ────────────────────────────────────────

test('checkAvailability returns NOT_SUPPORTED when no bridge is present', () => {
  // In Node.js there is no window.HybridHealthBridge, so we always get NOT_SUPPORTED.
  const status = checkAvailability();
  assert.equal(status, HealthConnectAvailability.NOT_SUPPORTED);
});

// ── briefing integration — health telemetry items ────────────────────────────

import { buildTelemetry, composeBriefing } from '../js/brain/briefing.js';

test('buildTelemetry adds steps, sleep, RHR when health data is present', () => {
  const t = buildTelemetry({
    energy: { hasProfile: false },
    health: { steps: 7500, sleepHours: 7, restingHeartRate: 58 },
  });
  const keys = t.map(x => x.key);
  assert.ok(keys.includes('steps'));
  assert.ok(keys.includes('sleep'));
  assert.ok(keys.includes('rhr'));
  assert.equal(t.find(x => x.key === 'steps').value, '7,500');
  assert.equal(t.find(x => x.key === 'sleep').value, '7h');
  assert.equal(t.find(x => x.key === 'rhr').value, '58');
});

test('buildTelemetry omits health items when health data is absent', () => {
  const t = buildTelemetry({ energy: { hasProfile: false } });
  const keys = t.map(x => x.key);
  assert.ok(!keys.includes('steps'));
  assert.ok(!keys.includes('sleep'));
  assert.ok(!keys.includes('rhr'));
});

test('composeBriefing warns about short sleep', () => {
  const text = composeBriefing({
    dataWeeks: 3,
    health: { sleepHours: 4.5, restingHeartRate: 60 },
  });
  assert.match(text, /short last night/);
  assert.match(text, /protect intensity/);
});

test('composeBriefing encourages on 8+ hours sleep', () => {
  const text = composeBriefing({
    dataWeeks: 3,
    health: { sleepHours: 8.5 },
  });
  assert.match(text, /Good sleep/);
  assert.match(text, /performance ceiling/);
});

test('composeBriefing notes elevated RHR', () => {
  const text = composeBriefing({
    dataWeeks: 2,
    health: { sleepHours: 7, restingHeartRate: 72 },
  });
  assert.match(text, /Resting HR is elevated/);
  assert.match(text, /72 bpm/);
});

// ── daily_readiness integration — sleep and RHR modifiers ────────────────────

import { generateDailyBrief } from '../js/brain/daily_readiness.js';
import { PROGRAMS } from '../js/constants.js';

function makeWeekWithLifts(sets) {
  const lifts = { 'Squat': sets };
  return { lifts: { mon: lifts, tue: {} }, runs: {}, gymRpe: {}, supersets: {}, bodyWeight: {}, gymStats: {} };
}

test('generateDailyBrief adds sleep adjustment when sleep < 6h', () => {
  const heavySets = Array(5).fill({ w: 100, r: 5, c: true });
  const appState = {
    currentWeek: '1',
    weeks: { '1': makeWeekWithLifts(heavySets) },
    health: { sleepHours: 4.5, restingHeartRate: null },
  };
  const program = PROGRAMS['hybrid_engine'];
  const brief = generateDailyBrief(appState, {
    selectedDay: 'tue', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    program, currentWeek: '1',
  });
  const hasHealthAdj = brief.adjustments.some(a => /short last night|4\.5h/.test(a));
  assert.ok(hasHealthAdj, 'Should include a sleep-related adjustment');
});

test('generateDailyBrief returns healthSignals with synced data', () => {
  const heavySets = Array(4).fill({ w: 80, r: 6, c: true });
  const appState = {
    currentWeek: '1',
    weeks: { '1': makeWeekWithLifts(heavySets) },
    health: { sleepHours: 8, restingHeartRate: 55 },
  };
  const program = PROGRAMS['hybrid_engine'];
  const brief = generateDailyBrief(appState, {
    selectedDay: 'tue', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    program, currentWeek: '1',
  });
  assert.ok(brief.healthSignals, 'Should expose healthSignals field');
  assert.equal(brief.healthSignals.sleepHours, 8);
  assert.equal(brief.healthSignals.restingHeartRate, 55);
});
