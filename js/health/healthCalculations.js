// ==========================================
// HEALTH INTEGRATION — CALCULATIONS (healthCalculations.js)
// ------------------------------------------
// Pure aggregation and normalisation functions.
// Converts raw Android Health Connect payloads into the canonical
// HealthSnapshot consumed by the rest of the application.
//
// Pure module. Safe under `node --test`.
// ==========================================

// ── Sleep ────────────────────────────────────────────────────────────────────

/**
 * Aggregate raw sleep sessions into total hours and optional score.
 *
 * @param {import('./healthTypes.js').RawSleepSession[]} sessions
 * @returns {{ hours: number, score: number|null }}
 */
export function normalizeSleep(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { hours: 0, score: null };
  }

  const totalMs = sessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  const hours   = Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;

  const scores  = sessions.map(s => s.score).filter(s => typeof s === 'number' && s > 0);
  const score   = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  return { hours, score };
}

/**
 * Derive a simple sleep quality score (0–100) from duration alone when a
 * device score is unavailable. Thresholds from sleep hygiene research.
 *
 * @param {number} hours
 * @returns {number}
 */
export function sleepDurationScore(hours) {
  if (hours <= 0)  return 0;
  if (hours >= 8)  return 100;
  if (hours >= 7)  return 80;
  if (hours >= 6)  return 60;
  if (hours >= 5)  return 35;
  return 15;
}

// ── Heart Rate ───────────────────────────────────────────────────────────────

/**
 * Average a set of heart-rate samples into a single integer bpm.
 * Returns null when the sample array is empty or invalid.
 *
 * @param {import('./healthTypes.js').RawHRSample[]} samples
 * @returns {number|null}
 */
export function averageHR(samples) {
  const valid = (samples || []).filter(s => s?.bpm > 0).map(s => s.bpm);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

// ── Workouts ─────────────────────────────────────────────────────────────────

/**
 * Map an exercise type constant from Health Connect to a human-readable label.
 * Covers the most common types; falls back to a title-cased version.
 *
 * @param {string} exerciseType
 * @returns {string}
 */
export function exerciseTypeLabel(exerciseType) {
  const MAP = {
    EXERCISE_TYPE_RUNNING:           'Running',
    EXERCISE_TYPE_WALKING:           'Walking',
    EXERCISE_TYPE_CYCLING:           'Cycling',
    EXERCISE_TYPE_STRENGTH_TRAINING: 'Strength Training',
    EXERCISE_TYPE_SWIMMING_POOL:     'Swimming',
    EXERCISE_TYPE_YOGA:              'Yoga',
    EXERCISE_TYPE_HIKING:            'Hiking',
    EXERCISE_TYPE_ROWING_MACHINE:    'Rowing',
    EXERCISE_TYPE_ELLIPTICAL:        'Elliptical',
    EXERCISE_TYPE_BIKING_STATIONARY: 'Stationary Bike',
    EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING: 'HIIT',
  };
  if (MAP[exerciseType]) return MAP[exerciseType];
  return (exerciseType || 'Unknown')
    .replace(/^EXERCISE_TYPE_/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Normalise a raw exercise session into a WorkoutSummary.
 *
 * @param {import('./healthTypes.js').RawExerciseSession} raw
 * @returns {import('./healthTypes.js').WorkoutSummary}
 */
export function normalizeWorkout(raw) {
  return {
    type:            exerciseTypeLabel(raw.exerciseType || raw.type || ''),
    durationMinutes: Math.round((raw.durationMs || 0) / 60000),
    calories:        Math.round(raw.totalCalories || raw.calories || 0),
    avgHeartRate:    (raw.avgHeartRate > 0) ? Math.round(raw.avgHeartRate) : null,
    distanceKm:      (raw.totalDistance > 0)
      ? Math.round((raw.totalDistance / 1000) * 100) / 100
      : null,
    startTime:       raw.startTime || new Date().toISOString(),
  };
}

// ── Snapshot assembly ────────────────────────────────────────────────────────

/**
 * Build a canonical HealthSnapshot from a raw bridge payload.
 * All fields are safe defaults when input is absent/partial.
 *
 * @param {import('./healthTypes.js').RawHealthPayload|null} raw
 * @returns {import('./healthTypes.js').HealthSnapshot}
 */
export function buildHealthSnapshot(raw) {
  if (!raw) {
    return {
      steps: 0, activeCalories: 0, sleepHours: 0, sleepScore: null,
      restingHeartRate: null, averageHeartRate: null, hrvMs: null, weightKg: null,
      workouts: [], syncedAt: new Date().toISOString(),
    };
  }

  const sleep    = normalizeSleep(raw.sleepSessions || []);
  const hrAvg    = raw.heartRateSamples
    ? averageHR(raw.heartRateSamples)
    : (raw.averageHeartRate > 0 ? Math.round(raw.averageHeartRate) : null);
  const workouts = (raw.exerciseSessions || []).map(normalizeWorkout);

  const sleepScore = sleep.score !== null
    ? sleep.score
    : (sleep.hours > 0 ? sleepDurationScore(sleep.hours) : null);

  return {
    steps:            Math.round(raw.steps || 0),
    activeCalories:   Math.round(raw.activeCalories || 0),
    sleepHours:       sleep.hours,
    sleepScore,
    restingHeartRate: (raw.restingHeartRate > 0) ? Math.round(raw.restingHeartRate) : null,
    averageHeartRate: hrAvg,
    hrvMs:            (raw.hrvRmssd > 0) ? Math.round(raw.hrvRmssd) : null,
    weightKg:         (raw.weightKg > 0) ? Math.round(raw.weightKg * 10) / 10 : null,
    workouts,
    syncedAt:         new Date().toISOString(),
  };
}
