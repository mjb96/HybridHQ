// ==========================================
// METRICS — LOAD & RECOVERY (metrics-load.js)
// ------------------------------------------
// Cross-modal load, RPE, readiness and recovery aggregations consumed by
// Analytics, Brain, and Home. All functions are pure: no DOM, no globals.
// Safe under `node --test`.
//
// weeklyRpeSeries is a NEW canonical function — previously the combined
// gym+run RPE series was computed in two separate places inside analytics.js
// with slightly different logic, creating silent divergence.
// ==========================================
import {
  parseDurationToMinutes,
  computeWeeklyLoadSeries,
  computeReadiness,
  computeRecoveryScore,
  computeStreakView,
} from '../engine.js';

// ==========================================
// WEEKLY LOAD SERIES (sRPE)
// Session RPE × duration (minutes) for gym and run separately, per week.
// Delegates to engine.js which owns the primitive; re-exported here so
// callers use one import path for all load-layer metrics.
// ==========================================
export function weeklyLoadSeries(state, days, maxWeek) {
  return computeWeeklyLoadSeries(state, days, maxWeek);
}

// ==========================================
// WEEKLY RPE SERIES
// Combined gym + run average RPE per week.
// Canonical single source — previously computed independently inside
// collectAnalyticsData() AND inside renderRecoveryAnalytics(), producing
// two slightly different numbers for the same concept.
// ==========================================
export function weeklyRpeSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let sum = 0, cnt = 0;
    if (wkData) {
      dayList.forEach(d => {
        const runRpe = parseFloat(wkData.runs?.[d]?.rpe) || 0;
        const gymRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
        if (runRpe > 0) { sum += runRpe; cnt++; }
        if (gymRpe > 0) { sum += gymRpe; cnt++; }
      });
    }
    out.push(cnt > 0 ? sum / cnt : 0);
  }
  return out;
}

// ==========================================
// READINESS METRICS
// ACWR-based readiness from the combined (gym+run) load series.
// Returns { score, acwr, acute, chronic, hasData }.
// ==========================================
export function readinessMetrics(state, days, currentWeek, maxWeek) {
  const { lift, run } = weeklyLoadSeries(state, days, maxWeek);
  const totalByWeek = lift.map((v, i) => v + (run[i] || 0));
  return computeReadiness(totalByWeek, currentWeek);
}

// ==========================================
// RECOVERY METRICS
// RPE + rest-day based recovery score for the current week.
// Returns { score, hasData, avgRpe, fatigueScore, restScore, restDays,
//           activeDays, recommendation }.
// ==========================================
export function recoveryMetrics(state, days) {
  return computeRecoveryScore(state, days);
}

// ==========================================
// STREAK VIEW
// Current + longest streak from streakData. Re-exported here for callers
// that want all athlete-state metrics from one import.
// ==========================================
export function streakView(streakData) {
  return computeStreakView(streakData);
}
