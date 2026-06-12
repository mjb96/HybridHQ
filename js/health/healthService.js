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
import { getLocalDateKey } from '../util.js';
import { buildHealthSnapshot } from './healthCalculations.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Append or update today's health data in appState.healthLog.
 * Each entry is keyed by date (YYYY-MM-DD). If an entry for today already
 * exists it is overwritten with the latest sync data.
 *
 * Sleep stages (deep/REM/light/awake hours) are extracted from raw bridge
 * payload when available — these live only in the log, not in the snapshot.
 *
 * @param {Object} appState
 * @param {import('./healthTypes.js').HealthSnapshot} snapshot
 * @param {import('./healthTypes.js').RawHealthPayload|null} raw
 */
function appendToHealthLog(appState, snapshot, raw) {
  if (!appState) return;
  if (!Array.isArray(appState.healthLog)) appState.healthLog = [];

  const today = getLocalDateKey();

  // Extract sleep stages from raw bridge payload when available.
  // Health Connect SleepStage constants: AWAKE=0, SLEEPING=1, OUT_OF_BED=2,
  // LIGHT=3, DEEP=4, REM=5.
  let sleepDeepHours = null, sleepRemHours = null, sleepLightHours = null, sleepAwakeHours = null;
  if (raw?.sleepSessions?.length > 0) {
    let deep = 0, rem = 0, light = 0, awake = 0;
    raw.sleepSessions.forEach(session => {
      (session.stages || []).forEach(stage => {
        const hrs = (stage.durationMs || 0) / (1000 * 60 * 60);
        if (stage.stage === 4 || stage.stage === 'DEEP')  deep  += hrs;
        else if (stage.stage === 5 || stage.stage === 'REM')   rem   += hrs;
        else if (stage.stage === 3 || stage.stage === 'LIGHT') light += hrs;
        else if (stage.stage === 0 || stage.stage === 'AWAKE') awake += hrs;
      });
    });
    if (deep + rem + light + awake > 0) {
      sleepDeepHours  = Math.round(deep  * 10) / 10;
      sleepRemHours   = Math.round(rem   * 10) / 10;
      sleepLightHours = Math.round(light * 10) / 10;
      sleepAwakeHours = Math.round(awake * 10) / 10;
    }
  }

  const entry = {
    date:             today,
    steps:            snapshot.steps,
    activeCalories:   snapshot.activeCalories,
    sleepHours:       snapshot.sleepHours,
    sleepScore:       snapshot.sleepScore,
    sleepDeepHours,
    sleepRemHours,
    sleepLightHours,
    sleepAwakeHours,
    restingHeartRate: snapshot.restingHeartRate,
    averageHeartRate: snapshot.averageHeartRate,
    weightKg:         snapshot.weightKg,
  };

  const idx = appState.healthLog.findIndex(e => e.date === today);
  if (idx >= 0) {
    appState.healthLog[idx] = entry;
  } else {
    appState.healthLog.push(entry);
  }

  // Cap log at 365 entries to prevent unbounded state growth.
  if (appState.healthLog.length > 365) {
    appState.healthLog.sort((a, b) => a.date.localeCompare(b.date));
    appState.healthLog = appState.healthLog.slice(-365);
  }
}

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
      appendToHealthLog(appState, snapshot, raw);
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
