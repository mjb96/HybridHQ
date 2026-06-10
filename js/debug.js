// ==========================================
// DEV-MODE LOUD FAILURE (debug.js)
// Surfaces silent-failure paths (swallowed catches, optional-chaining
// no-ops, pre-init calls) during development. Zero effect in production.
//
// Enable in the browser console:   localStorage.setItem('hybrid_debug', '1')
// Disable:                         localStorage.removeItem('hybrid_debug')
// (reload after toggling)
// ==========================================

export const DEBUG = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('hybrid_debug') === '1';
  } catch {
    return false;
  }
})();

// Loud, non-throwing notice for a path that would otherwise fail silently.
export function devWarn(context, detail) {
  if (DEBUG) console.error(`[hybrid:dev] ${context}`, detail !== undefined ? detail : '');
}

// Hard failure in dev for an invariant that must hold; no-op in production.
export function devAssert(condition, message) {
  if (DEBUG && !condition) {
    console.error(`[hybrid:dev] ASSERT FAILED: ${message}`);
    throw new Error(`[hybrid:dev] ${message}`);
  }
}