// ==========================================
// BRAIN — SESSION FATIGUE INFERENCE (session_fatigue.js)
// ------------------------------------------
// Maps a logged session's completed working sets against the exercise metadata
// to estimate fatigue / CNS load and a per-muscle distribution, then factors in
// total calories burned for an overall systemic-stress read. Read-only/advisory.
//
// Pure module. Safe under `node --test`.
// ==========================================
import { getExerciseMetadata } from './exercise_metadata.js';
import { isCompletedSet } from '../engine.js';

// Energy scaling: total calories burned nudges systemic stress around a ~2000
// kcal/day baseline, clamped to a sensible band so it informs without dominating.
function calorieFactor(totalCaloriesBurned) {
  const cal = parseFloat(totalCaloriesBurned) || 0;
  if (cal <= 0) return 1;
  return Math.max(0.85, Math.min(1.5, 1 + (cal - 2000) / 4000));
}

// dayLifts: appState.weeks[wk].lifts[day] (lift name → set[]).
// opts: { totalCaloriesBurned }
export function computeSessionFatigue(dayLifts, opts = {}) {
  let rawFatigue = 0, cnsLoad = 0, stimulus = 0, workingSets = 0;
  const byPattern = {};
  const byMuscle = {};

  for (const lift in (dayLifts || {})) {
    const arr = dayLifts[lift];
    if (!Array.isArray(arr)) continue;
    const done = arr.filter(s => isCompletedSet(s) && !s.isWarmup).length;
    if (!done) continue;

    const m = getExerciseMetadata(lift);
    rawFatigue += m.fatigueCost * done;
    cnsLoad    += m.cnsDemand * done;
    stimulus   += m.hypertrophyStimulus * done;
    workingSets += done;

    byPattern[m.pattern] = (byPattern[m.pattern] || 0) + done;
    (m.primary || []).forEach(mu => { byMuscle[mu] = (byMuscle[mu] || 0) + done; });
    (m.secondary || []).forEach(mu => { byMuscle[mu] = (byMuscle[mu] || 0) + done * 0.5; });
  }

  const cf = calorieFactor(opts.totalCaloriesBurned);
  const fatigueScore = Math.round(rawFatigue * cf);

  // Coarse systemic band for downstream copy.
  let band = 'low';
  if (fatigueScore >= 60) band = 'very_high';
  else if (fatigueScore >= 40) band = 'high';
  else if (fatigueScore >= 20) band = 'moderate';

  return {
    fatigueScore,          // systemic, calorie-adjusted
    rawFatigue,            // metadata-only
    cnsLoad,
    stimulus,
    workingSets,
    band,
    calorieFactor: Math.round(cf * 100) / 100,
    byPattern,
    byMuscle,
  };
}
