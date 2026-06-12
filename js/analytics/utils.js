// ==========================================
// ANALYTICS — DISPLAY UTILITIES (analytics/utils.js)
// ------------------------------------------
// Pure helpers: numeric value → CSS color, DOM text setter, signal smoother.
// No state access, no chart rendering.
// ==========================================
import { CONFIG } from '../constants.js';

// RPE → color string. Used by RPE chart dots and recovery status cards.
export function rpeColour(rpe) {
  if (rpe === 0) return '#3b82f6';
  if (rpe < 6)  return '#10b981';
  if (rpe < 8)  return '#f59e0b';
  return '#ef4444';
}

// Pace (s/km) → color string based on pace zones relative to threshold.
export function paceZoneColour(secsPerKm, thresholdSecs) {
  const easy      = thresholdSecs ? thresholdSecs + 60  : (CONFIG.paceZoneEasy      || 360);
  const tempo     = thresholdSecs ? thresholdSecs + 30  : (CONFIG.paceZoneTempo     || 300);
  const threshold = thresholdSecs                       || (CONFIG.paceZoneThreshold || 270);
  if (secsPerKm === 0) return '#3b82f6';
  if (secsPerKm > easy)      return '#10b981';
  if (secsPerKm > tempo)     return '#f59e0b';
  if (secsPerKm > threshold) return '#ef4444';
  return '#a855f7';
}

// Convenience: set textContent on a DOM element by id. No-ops if missing.
export const setText = (id, val) => {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
};

// Moving-average smoother for time-series signal noise (e.g. per-sample pace).
export function smooth(values, win = 5) {
  const n = values.length, out = new Array(n);
  const h = Math.floor(win / 2);
  for (let i = 0; i < n; i++) {
    let sum = 0, c = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j++) { sum += values[j]; c++; }
    out[i] = c ? sum / c : values[i];
  }
  return out;
}
