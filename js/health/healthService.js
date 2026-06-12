// ==========================================
// HEALTH INTEGRATION — SERVICE FACADE (healthService.js)
// ------------------------------------------
// Single public interface for the rest of the application.
//
//   import { HealthService } from './health/healthService.js';
//   const snapshot = await HealthService.sync(appState, saveState);
//
// Responsibilities
//   1. Check Health Connect availability
//   2. Request permissions (with graceful partial-grant handling)
//   3. Read raw records for the last 24 hours (configurable)
//   4. Normalise into a HealthSnapshot
//   5. Write snapshot to appState.health
//   6. Persist state
//   7. Return the snapshot
//
// Never throws — all failure modes return an empty snapshot with an `error`
// field that callers may inspect for UI messaging.
// ==========================================
import {
  checkAvailability,
  requestPermissions,
  readRawHealthData,
  HealthConnectAvailability,
} from './healthConnect.js';
import { buildHealthSnapshot } from './healthCalculations.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptySnapshot(extraFields = {}) {
  return {
    steps: 0, activeCalories: 0, sleepHours: 0, sleepScore: null,
    restingHeartRate: null, averageHeartRate: null, weightKg: null,
    workouts: [], syncedAt: new Date().toISOString(),
    ...extraFields,
  };
}

function defaultTimeWindow() {
  const end   = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const HealthService = Object.freeze({

  /**
   * Sync health data from Android Health Connect into appState.
   *
   * @param {Object}   appState  Live appState reference (mutated in place).
   * @param {Function} saveState Callback that persists state; typically
   *                             () => saveStateToLocalStorage(true).
   * @param {Object}   [opts]
   * @param {string}   [opts.startTime]  ISO 8601 window start (default: 24h ago).
   * @param {string}   [opts.endTime]    ISO 8601 window end   (default: now).
   * @returns {Promise<import('./healthTypes.js').HealthSnapshot>}
   */
  async sync(appState, saveState, opts = {}) {
    // 1. Availability check
    const availability = checkAvailability();
    if (availability === HealthConnectAvailability.NOT_SUPPORTED) {
      return emptySnapshot({ error: 'health_connect_not_supported' });
    }
    if (availability === HealthConnectAvailability.NOT_INSTALLED) {
      return emptySnapshot({ error: 'health_connect_not_installed' });
    }

    // 2. Permissions
    const permissions = await requestPermissions();
    if (!permissions.granted) {
      return emptySnapshot({
        error: 'permissions_denied',
        _deniedTypes: permissions.deniedTypes,
      });
    }

    // 3. Read
    const { startTime, endTime } = (opts.startTime && opts.endTime)
      ? { startTime: opts.startTime, endTime: opts.endTime }
      : defaultTimeWindow();

    const raw      = await readRawHealthData(startTime, endTime);
    const snapshot = buildHealthSnapshot(raw);

    // Flag any partially-denied types so the UI can explain gaps.
    if (permissions.deniedTypes?.length > 0) {
      snapshot._partialPermissions = permissions.deniedTypes;
    }

    // 4. Persist to appState
    if (appState) {
      appState.health = snapshot;
      if (typeof saveState === 'function') saveState();
    }

    return snapshot;
  },

  /**
   * Check whether Health Connect is available without requesting permissions.
   * Useful for conditionally showing the sync button in the UI.
   *
   * @returns {'AVAILABLE'|'NOT_INSTALLED'|'NOT_SUPPORTED'}
   */
  availability() {
    return checkAvailability();
  },
});
