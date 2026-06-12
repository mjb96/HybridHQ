// ==========================================
// HEALTH INTEGRATION — ANDROID BRIDGE ADAPTER (healthConnect.js)
// ------------------------------------------
// Interfaces with the Android Health Connect API through a native-injected
// JavaScript bridge object: window.HybridHealthBridge.
//
// Bridge contract (Android WebView JavascriptInterface):
//   getAvailabilityStatus()                       → 'AVAILABLE' | 'NOT_INSTALLED'
//   requestPermissions(typesJson: string)         → Promise<string> (JSON)
//   readHealthData(startTime: string, endTime: string) → Promise<string> (JSON)
//
// When the bridge is absent (desktop browser, iOS, plain Chrome) every
// function returns a graceful default — no throws, no crashes.
//
// Pure: no DOM reads, no appState mutations. Safe under `node --test` if
// window is stubbed.
// ==========================================

/** Health Connect record types this app requests read access for. */
export const HEALTH_RECORD_TYPES = Object.freeze([
  'Steps',
  'ActiveCaloriesBurned',
  'SleepSession',
  'HeartRate',
  'RestingHeartRate',
  'Weight',
  'ExerciseSession',
]);

/** @type {Record<string, string>} */
export const HealthConnectAvailability = Object.freeze({
  AVAILABLE:     'AVAILABLE',
  NOT_INSTALLED: 'NOT_INSTALLED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
});

// ── Internal helpers ─────────────────────────────────────────────────────────

function getBridge() {
  return (typeof window !== 'undefined') ? window.HybridHealthBridge : undefined;
}

function safeParse(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect whether Health Connect is reachable via the Android bridge.
 * Returns one of the HealthConnectAvailability constants.
 *
 * @returns {string}
 */
export function checkAvailability() {
  const bridge = getBridge();
  if (!bridge) return HealthConnectAvailability.NOT_SUPPORTED;

  try {
    const raw = bridge.getAvailabilityStatus?.();
    if (raw === 'NOT_INSTALLED') return HealthConnectAvailability.NOT_INSTALLED;
    return HealthConnectAvailability.AVAILABLE;
  } catch {
    return HealthConnectAvailability.NOT_SUPPORTED;
  }
}

/**
 * Request Health Connect read permissions for all required record types.
 * Resolves with granted:false when the bridge is absent or the user denies.
 *
 * @returns {Promise<import('./healthTypes.js').HealthPermissionResult>}
 */
export async function requestPermissions() {
  const bridge = getBridge();
  if (!bridge) {
    return { granted: false, grantedTypes: [], deniedTypes: HEALTH_RECORD_TYPES.slice() };
  }

  try {
    const raw    = await bridge.requestPermissions(JSON.stringify(HEALTH_RECORD_TYPES));
    const result = safeParse(raw);
    if (!result) {
      return { granted: false, grantedTypes: [], deniedTypes: HEALTH_RECORD_TYPES.slice() };
    }
    const granted = Array.isArray(result.granted) ? result.granted : [];
    const denied  = Array.isArray(result.denied)  ? result.denied  :
      HEALTH_RECORD_TYPES.filter(t => !granted.includes(t));

    return { granted: granted.length > 0, grantedTypes: granted, deniedTypes: denied };
  } catch (e) {
    console.warn('[HealthConnect] Permission request failed:', e);
    return { granted: false, grantedTypes: [], deniedTypes: HEALTH_RECORD_TYPES.slice() };
  }
}

/**
 * Read raw health data from the bridge for a given time window.
 * Returns null on failure or when the bridge is absent.
 *
 * @param {string} startTime  ISO 8601
 * @param {string} endTime    ISO 8601
 * @returns {Promise<import('./healthTypes.js').RawHealthPayload|null>}
 */
export async function readRawHealthData(startTime, endTime) {
  const bridge = getBridge();
  if (!bridge) return null;

  try {
    const raw = await bridge.readHealthData(startTime, endTime);
    return safeParse(raw);
  } catch (e) {
    console.warn('[HealthConnect] Read failed:', e);
    return null;
  }
}
