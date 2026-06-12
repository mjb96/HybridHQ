// ==========================================
// HEALTH INTEGRATION — TYPE DEFINITIONS (healthTypes.js)
// ------------------------------------------
// JSDoc type catalogue for the health integration layer.
// No runtime logic — shapes only.
// ==========================================

/**
 * @typedef {'AVAILABLE'|'NOT_INSTALLED'|'NOT_SUPPORTED'} HealthConnectAvailabilityStatus
 */

/**
 * @typedef {Object} HealthPermissionResult
 * @property {boolean}  granted       At least one permission was granted.
 * @property {string[]} grantedTypes  Record types the user approved.
 * @property {string[]} deniedTypes   Record types that were denied / revoked.
 */

/**
 * Raw sleep session as returned by the Android bridge.
 * @typedef {Object} RawSleepSession
 * @property {number}      durationMs  Session length in milliseconds.
 * @property {number|null} score       Device sleep score 0–100, or null.
 * @property {string}      startTime   ISO 8601.
 */

/**
 * Raw heart-rate sample from Health Connect.
 * @typedef {Object} RawHRSample
 * @property {number} bpm
 * @property {string} time ISO 8601
 */

/**
 * Raw exercise session as returned by the Android bridge.
 * @typedef {Object} RawExerciseSession
 * @property {string}      exerciseType     Health Connect exercise type constant.
 * @property {number}      durationMs
 * @property {number}      totalCalories
 * @property {number|null} avgHeartRate
 * @property {number|null} totalDistance    Metres.
 * @property {string}      startTime        ISO 8601.
 */

/**
 * Raw payload returned by the Android bridge for a given time window.
 * @typedef {Object} RawHealthPayload
 * @property {number}               steps
 * @property {number}               activeCalories
 * @property {RawSleepSession[]}    sleepSessions
 * @property {RawHRSample[]}        heartRateSamples
 * @property {number|null}          restingHeartRate  bpm
 * @property {number|null}          weightKg
 * @property {RawExerciseSession[]} exerciseSessions
 */

/**
 * Normalised workout summary consumed by the rest of the application.
 * @typedef {Object} WorkoutSummary
 * @property {string}      type             Human-readable exercise type.
 * @property {number}      durationMinutes
 * @property {number}      calories
 * @property {number|null} avgHeartRate     bpm or null.
 * @property {number|null} distanceKm       null for non-distance activities.
 * @property {string}      startTime        ISO 8601.
 */

/**
 * The canonical health snapshot written into appState.health and returned
 * by HealthService.sync().
 *
 * All numeric fields default to 0 / null rather than undefined so callers
 * can safely use truthy-checks without null-coalescing guards.
 *
 * @typedef {Object} HealthSnapshot
 * @property {number}          steps
 * @property {number}          activeCalories
 * @property {number}          sleepHours          0 when unknown.
 * @property {number|null}     sleepScore          0–100, null when unavailable.
 * @property {number|null}     restingHeartRate    bpm, null when unavailable.
 * @property {number|null}     averageHeartRate    bpm, null when unavailable.
 * @property {number|null}     weightKg            null when unavailable.
 * @property {WorkoutSummary[]} workouts
 * @property {string}          syncedAt            ISO 8601 timestamp.
 * @property {string[]}        [_partialPermissions] Record types that were denied.
 * @property {string}          [error]             Set when sync fails gracefully.
 */
