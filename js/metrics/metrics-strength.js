// ==========================================
// METRICS — STRENGTH (metrics-strength.js)
// ------------------------------------------
// Multi-week strength aggregations consumed by Analytics, Brain, and Home.
// All functions are pure: (state, days?, maxWeek?) → data structures.
// No DOM, no browser globals. Safe under `node --test`.
//
// Engine.js retains the calculation primitives (epley1RM, isCompletedSet,
// classifyBig3Lift, prescribeSetsForLift). This module owns the aggregations
// that iterate over the full training history.
// ==========================================
import {
  epley1RM,
  isCompletedSet,
  classifyBig3Lift,
  getLiftDisplayName,
} from '../engine.js';
import { getExerciseMetadata } from '../brain/exercise_metadata.js';

// ==========================================
// WEEKLY TONNAGE SERIES
// Sum of weight × reps over completed working sets per week.
// Warmup sets are excluded. Returns one value per week 1..maxWeek.
// ==========================================
export function weeklyTonnageSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let vol = 0;
    if (wkData) {
      dayList.forEach(d => {
        const dayLifts = wkData.lifts?.[d] || {};
        for (const lift in dayLifts) {
          const arr = dayLifts[lift];
          if (!Array.isArray(arr)) continue;
          arr.forEach(s => {
            if (isCompletedSet(s) && !s.isWarmup) {
              vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
            }
          });
        }
      });
    }
    out.push(Math.round(vol));
  }
  return out;
}

// ==========================================
// PER-LIFT e1RM SERIES
// Best estimated 1RM per lift per week, keyed by lift name.
// Returns { [liftName]: number[] } where index 0 = week 1.
// Zero means no data logged that week for that lift.
// ==========================================
export function weeklyE1rmByLift(state, days, maxWeek) {
  const dayList = Array.isArray(days) ? days : [];
  const out = {};

  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    if (!wkData) continue;
    dayList.forEach(d => {
      const dayLifts = wkData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        const liftName = getLiftDisplayName(state, lift);
        if (!out[liftName]) out[liftName] = new Array(maxWeek).fill(0);
        const arr = dayLifts[lift];
        if (!Array.isArray(arr)) continue;
        arr.forEach(s => {
          if (!isCompletedSet(s) || s.isWarmup) return;
          const e = epley1RM(s.w, s.r);
          if (e > out[liftName][w - 1]) out[liftName][w - 1] = e;
        });
      }
    });
  }
  return out;
}

// ==========================================
// ALL-LIFTS STATS
// Per-lift summary: all-time max, current-week max, previous-week max.
// Replaces the inline dynamicStats computation from analytics.js.
// ==========================================
export function allLiftsStats(state, days) {
  const dayList = Array.isArray(days) ? days : [];
  const out = {};
  if (!state?.weeks) return out;

  const currentWeek = state.currentWeek || '1';
  const prevWeek = String(Math.max(1, parseInt(currentWeek, 10) - 1));

  for (const wKey in state.weeks) {
    const wkData = state.weeks[wKey];
    if (!wkData?.lifts) continue;
    dayList.forEach(d => {
      const dayLifts = wkData.lifts[d] || {};
      for (const lift in dayLifts) {
        const liftName = getLiftDisplayName(state, lift);
        const arr = dayLifts[lift];
        if (!Array.isArray(arr)) continue;
        if (!out[liftName]) out[liftName] = { allTimeMax: 0, currentWeekMax: 0, prevWeekMax: 0 };
        arr.forEach(s => {
          if (!isCompletedSet(s) || s.isWarmup) return;
          const e = epley1RM(s.w, s.r);
          if (e <= 0) return;
          if (e > out[liftName].allTimeMax) out[liftName].allTimeMax = e;
          if (wKey === currentWeek && e > out[liftName].currentWeekMax) out[liftName].currentWeekMax = e;
          if (wKey === prevWeek    && e > out[liftName].prevWeekMax)    out[liftName].prevWeekMax = e;
        });
      }
    });
  }
  return out;
}

// ==========================================
// BIG 3 PROGRESSION
// Best estimated 1RM for squat / bench / deadlift per week, plus
// all-time and current-week peaks. Moved from engine.js.
// ==========================================
export function big3Progression(state) {
  const cats = ['squat', 'bench', 'deadlift'];
  const out = {};
  cats.forEach(c => { out[c] = { current: 0, allTime: 0, byWeek: {} }; });
  if (!state?.weeks) return out;

  const currentWeek = state.currentWeek;

  for (const wKey in state.weeks) {
    const wkData = state.weeks[wKey];
    if (!wkData?.lifts) continue;
    for (const dKey in wkData.lifts) {
      const dayLifts = wkData.lifts[dKey];
      if (!dayLifts) continue;
      for (const lift in dayLifts) {
        const cat = classifyBig3Lift(getLiftDisplayName(state, lift));
        if (!cat) continue;
        const arr = dayLifts[lift];
        if (!Array.isArray(arr)) continue;
        arr.forEach(s => {
          if (!isCompletedSet(s) || s.isWarmup) return;
          const e = epley1RM(s.w, s.r);
          if (e <= 0) return;
          if (e > (out[cat].byWeek[wKey] || 0)) out[cat].byWeek[wKey] = e;
          if (e > out[cat].allTime) out[cat].allTime = e;
          if (wKey === currentWeek && e > out[cat].current) out[cat].current = e;
        });
      }
    }
  }
  return out;
}

// ==========================================
// WEEKLY VOLUME BY MUSCLE
// Per-muscle set-credit accumulation across weeks:
//   primary muscle → 1.0 set credit per completed working set
//   secondary muscle → 0.5 set credit per completed working set
// Returns { [muscle]: number[] } with one entry per week 1..maxWeek.
// Unknown exercises (no metadata primary/secondary) contribute nothing —
// they fall through gracefully without error.
// ==========================================
export function weeklyVolumeByMuscle(state, days, maxWeek) {
  const dayList = Array.isArray(days) ? days : [];
  const out = {};

  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    if (!wkData) continue;
    dayList.forEach(d => {
      const dayLifts = wkData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        const arr = dayLifts[lift];
        if (!Array.isArray(arr)) continue;
        const sets = arr.filter(s => isCompletedSet(s) && !s.isWarmup).length;
        if (sets === 0) continue;

        const displayName = getLiftDisplayName(state, lift);
        const meta = getExerciseMetadata(displayName);
        for (const m of (meta.primary || [])) {
          if (!out[m]) out[m] = new Array(maxWeek).fill(0);
          out[m][w - 1] += sets;
        }
        for (const m of (meta.secondary || [])) {
          if (!out[m]) out[m] = new Array(maxWeek).fill(0);
          out[m][w - 1] += sets * 0.5;
        }
      }
    });
  }
  return out;
}

// Convenience: flat { squat, bench, deadlift } all-time maxes.
export function big3Maxes(state) {
  const prog = big3Progression(state);
  return {
    squat:    prog.squat.allTime,
    bench:    prog.bench.allTime,
    deadlift: prog.deadlift.allTime,
  };
}
