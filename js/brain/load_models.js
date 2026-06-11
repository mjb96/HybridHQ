// ==========================================
// HYBRID BRAIN — LOAD MODELS (load_models.js)
// ------------------------------------------
// Three separate concepts (never one universal number):
//   • Strength Load   — what the athlete did (lifting), tonnage-based.
//   • Endurance Load  — what the athlete did (running), distance-based.
//   • Recovery Cost   — what it COSTS to recover; the cross-modal currency the
//                       Brain reasons from (sRPE = RPE · minutes, gym + run).
//
// Pure module: no DOM, no browser globals. Reuses engine.js primitives only —
// it adds no new aggregation logic of its own. Safe under `node --test`.
// ==========================================
import {
  computeWeeklyLoadSeries,
  weeklyStrengthVolumeSeries,
  computeReadiness,
} from '../engine.js';

// Strength Load per week (descriptive): tonnage of completed working sets.
export function strengthLoadSeries(state, days, maxWeek) {
  return weeklyStrengthVolumeSeries(state, days, maxWeek);
}

// Endurance Load per week (descriptive): running distance (km). Pace / HR /
// zone weighting is a Phase-2 enrichment; distance is the MVP proxy.
export function enduranceLoadSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wk = state?.weeks?.[String(w)];
    let dist = 0;
    if (wk) dayList.forEach(d => { dist += parseFloat(wk.runs?.[d]?.dist) || 0; });
    out.push(Math.round(dist * 10) / 10);
  }
  return out;
}

// Recovery Cost per week (cross-modal): session RPE · minutes for gym + run.
// This is the Brain's PRIMARY metric for readiness / fatigue / interference.
export function recoveryCostSeries(state, days, maxWeek) {
  const { lift, run } = computeWeeklyLoadSeries(state, days, maxWeek);
  return lift.map((v, i) => v + (run[i] || 0));
}

// Recovery Cost split by modality — strength vs endurance contribution.
// Feeds future interference analysis ("lower-body demand elevated due to
// threshold running combined with heavy squat volume").
export function recoveryCostBreakdown(state, days, maxWeek) {
  const { lift, run } = computeWeeklyLoadSeries(state, days, maxWeek);
  return {
    strength: lift,
    endurance: run,
    total: lift.map((v, i) => v + (run[i] || 0)),
  };
}

// Acute (current week) vs chronic (trailing average) Recovery Cost → ACWR-based
// balance, via the existing readiness model. { score, acwr, acute, chronic, hasData }.
export function recoveryCostBalance(state, days, currentWeek, maxWeek) {
  const series = recoveryCostSeries(state, days, maxWeek);
  return computeReadiness(series, currentWeek);
}

// Convenience: the full load picture in one call.
export function loadProfile(state, days, currentWeek, maxWeek) {
  return {
    strength: strengthLoadSeries(state, days, maxWeek),
    endurance: enduranceLoadSeries(state, days, maxWeek),
    recoveryCost: recoveryCostSeries(state, days, maxWeek),
    breakdown: recoveryCostBreakdown(state, days, maxWeek),
    balance: recoveryCostBalance(state, days, currentWeek, maxWeek),
  };
}
