// ==========================================
// ENGINE: DIAGNOSTICS, 1RM, PARSER
// ==========================================
import { CONFIG } from './constants.js';
import { devWarn } from './debug.js';

let _getState;
let _getDays;

export function initEngine(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays = getDaysFn;
}

// ==========================================
// TEXT DESCRIPTION PARSER ENGINE
// ==========================================
export function parseTargetFromDescription(descString, liftName) {
  let result = { sets: 3, reps: 10 };
  if (!descString || !liftName) return result;

  try {
    const escapedLift = liftName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // UPDATED REGEX: Catches normal 'x', capital 'X', and the formal multiplication sign '×'
    const regex = new RegExp(escapedLift + '\\s*\\((\\d+)\\s*[xX×]\\s*([^\\)]+)\\)', 'i');
    const match = descString.match(regex);

    if (match) {
      result.sets = parseInt(match[1], 10) || 3;
      
      // Normalize en-dashes (–) to standard hyphens (-) before splitting
      let repValue = match[2].trim().toLowerCase().replace(/–/g, '-');

      if (repValue.includes('-')) {
        // If it's a range like "8-10", grab the higher number
        result.reps = parseInt(repValue.split('-')[1], 10) || 10;
      } else if (repValue === 'max') {
        result.reps = 10; // Fallback visual target for 'max' reps
      } else {
        result.reps = parseInt(repValue, 10) || 10;
      }
    }
  } catch (e) {
    console.error("Failed to parse exercise specs:", e);
  }
  return result;
}

// ==========================================
// DIAGNOSTIC ENGINE
// ==========================================
export function computeDiagnosticForLift(currentWeekString, dayKey, liftName) {
  let result = { suggestedWeight: '', suggestedReps: '', isStalled: false, isFatigueOverload: false, message: '' };
  
  if (!_getState || !_getDays) {
    devWarn('computeDiagnosticForLift called before initEngine() — returning empty diagnostic.');
    return result;
  }
  
  const appState = _getState();
  const DEFAULT_DAYS = _getDays();
  const cWk = parseInt(currentWeekString, 10);
  if (isNaN(cWk) || cWk <= 1 || !appState.weeks) return result;

  const history = [];
  for (let w = cWk - 1; w >= 1; w--) {
    const wData = appState.weeks[w.toString()];
    if (wData && wData.lifts && wData.lifts[dayKey]?.[liftName]) {
      const finishedSets = wData.lifts[dayKey][liftName].filter(s => s && s.c && s.w && s.r);
      if (finishedSets.length > 0) {
        let bestE1rm = 0, bestWeight = 0, bestReps = 0;
        finishedSets.forEach(s => {
          const w_ = parseFloat(s.w) || 0;
          const r_ = parseInt(s.r, 10) || 0;
          const e = w_ * (1 + r_ / 30);
          if (e > bestE1rm) { bestE1rm = e; bestWeight = w_; bestReps = r_; }
        });
        history.push({ weekNum: w, weight: bestWeight, reps: bestReps, e1rm: bestE1rm });
      }
    }
  }

  if (history.length === 0) return result;

  const lastSession = history[0];
  result.suggestedWeight = lastSession.weight || '';
  result.suggestedReps = lastSession.reps || '';

  if (history.length >= 3) {
    if (history[0].e1rm <= history[1].e1rm && history[1].e1rm <= history[2].e1rm) {
      result.isStalled = true;
      result.message = 'You stalled on ' + liftName + '. Reducing sets by 20% for this session to allow recovery.';
      return result;
    }
  }

  let totalRpeSum = 0, rpeCount = 0;
  const pastWkData = appState.weeks[(cWk - 1).toString()];
  
  if (pastWkData) {
    DEFAULT_DAYS.forEach(d => {
      const runRpe = parseInt(pastWkData.runs?.[d]?.rpe, 10) || 0;
      if (runRpe > 0) { totalRpeSum += runRpe; rpeCount++; }
      
      const gymRpe = parseInt(pastWkData.gymRpe?.[d], 10) || 0;
      if (gymRpe > 0) { totalRpeSum += gymRpe; rpeCount++; }
    });
  }
  
  const pastWeekAvgRpe = rpeCount > 0 ? totalRpeSum / rpeCount : 0;
  if (pastWeekAvgRpe >= (CONFIG.fatigueRpeThreshold || 8.5)) {
    result.isFatigueOverload = true;
    result.message = 'High fatigue detected from last week (Avg RPE ' + pastWeekAvgRpe.toFixed(1) + '). We recommend dropping workout volume by 10% today.';
    return result;
  }

  return result;
}

// ==========================================
// SET/REP PRESCRIPTION
// Owns the per-lift prescription decision: inline-spec vs weekly modifier,
// taper override, and stall/fatigue set reduction. Returns the sets array.
// ==========================================
export function prescribeSetsForLift(wk, dayKey, liftName, desc, weekModifier) {
  const parsedTarget = parseTargetFromDescription(desc, liftName);
  const usesInlineSpec = desc && desc.includes('x');
  let setsCount  = usesInlineSpec ? parsedTarget.sets : (weekModifier.sets || 4);
  let repsTarget = usesInlineSpec ? parsedTarget.reps : (weekModifier.reps || 5);

  if (weekModifier.intensityLabel.toLowerCase().includes("taper") || weekModifier.reps === 1) {
    repsTarget = weekModifier.reps;
  }

  const diagnostic = computeDiagnosticForLift(wk, dayKey, liftName);
  if (diagnostic.isStalled || diagnostic.isFatigueOverload) {
    setsCount = Math.max(1, Math.round(setsCount * CONFIG.stallSetReductionModifier));
  }

  const sets = [];
  for (let i = 0; i < setsCount; i++) {
    sets.push({
      w: diagnostic.suggestedWeight !== '' ? diagnostic.suggestedWeight.toString() : '',
      r: repsTarget.toString(),
      c: false
    });
  }
  return sets;
}

// ==========================================
// ESTIMATED 1RM CALCULATOR
// ==========================================
export function computeEstimated1RMs() {
  const result = { currentSq: 0, currentBp: 0, currentDl: 0, globalMaxSq: 0, globalMaxBp: 0, globalMaxDl: 0 };
  
  if (!_getState) {
    devWarn('computeEstimated1RMs called before initEngine() — returning zeroed 1RMs.');
    return result;
  }
  
  const appState = _getState();
  
  if (!appState || !appState.weeks) return result;
  
  const wk = appState.currentWeek || "1";
  
  for (let wKey in appState.weeks) {
    const weekObj = appState.weeks[wKey];
    if (!weekObj || !weekObj.lifts) continue;
    
    for (let dKey in weekObj.lifts) {
      const dayLifts = weekObj.lifts[dKey];
      if (!dayLifts) continue;
      
      for (let lKey in dayLifts) {
        const setsArr = dayLifts[lKey];
        if (!Array.isArray(setsArr)) continue;
        
        setsArr.forEach(s => {
          if (s && s.c) {
            const weight = parseFloat(s.w) || 0;
            const reps = parseInt(s.r, 10) || 0;
            const e1rm = weight * (1 + reps / 30);
            
            if (wKey === wk) {
              if (lKey === 'Back Squat' && e1rm > result.currentSq) result.currentSq = e1rm;
              if (lKey === 'Bench Press' && e1rm > result.currentBp) result.currentBp = e1rm;
              if (lKey === 'Deadlift' && e1rm > result.currentDl) result.currentDl = e1rm;
            }
            if (lKey === 'Back Squat' && e1rm > result.globalMaxSq) result.globalMaxSq = e1rm;
            if (lKey === 'Bench Press' && e1rm > result.globalMaxBp) result.globalMaxBp = e1rm;
            if (lKey === 'Deadlift' && e1rm > result.globalMaxDl) result.globalMaxDl = e1rm;
          }
        });
      }
    }
  }
  return result;
}

// ==========================================
// PER-EXERCISE PR (ESTIMATED 1RM) AGGREGATION
// Scans all logged sets and raises per-exercise PRs. Mutates and returns
// `stats` in place; only ever RAISES maxes (sticky by design — a PR is not
// lost if the set that produced it is later deleted). Verbatim from the
// former workout.updateExercisePRs(); state and stats are now parameters.
// ==========================================
export function computeExercisePRs(state, stats = {}) {
  for (let wKey in state.weeks) {
    const weekObj = state.weeks[wKey];
    if (!weekObj || !weekObj.lifts) continue;

    for (let dKey in weekObj.lifts) {
      const dayLifts = weekObj.lifts[dKey];
      if (!dayLifts) continue;

      for (let lift in dayLifts) {
        let maxEstimated1RM = 0;
        const setsArr = dayLifts[lift];
        if (!Array.isArray(setsArr)) continue;

        setsArr.forEach(set => {
          if (set && set.c && set.w && set.r) {
            const weight = parseFloat(set.w);
            const reps = parseInt(set.r);
            const e1RM = weight * (1 + (reps / 30));
            if (e1RM > maxEstimated1RM) maxEstimated1RM = e1RM;
          }
        });

        if (maxEstimated1RM > 0) {
          if (!stats[lift]) {
            stats[lift] = { allTimeMax: 0, currentEstimatedMax: 0 };
          }
          if (maxEstimated1RM > stats[lift].allTimeMax) {
            stats[lift].allTimeMax = maxEstimated1RM;
          }
          if (wKey === state.currentWeek) {
            if (maxEstimated1RM > (stats[lift].currentEstimatedMax || 0)) {
              stats[lift].currentEstimatedMax = maxEstimated1RM;
            }
          }
        }
      }
    }
  }
  return stats;
}

// ==========================================
// BIG-3 ESTIMATED 1RM (SHARED, PURE)
// Single source of truth for the big-3 lift maxes. Replaces the inline
// duplicate that lived in the Top Lifts dashboard tile. All functions are
// pure (state passed explicitly) so they unit-test without init order.
// ==========================================

// Epley estimated 1RM. Returns 0 for non-positive weight/reps.
export function epley1RM(weight, reps) {
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps, 10) || 0;
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

// True when a logged set is marked complete (tolerates legacy truthy forms).
function isCompletedSet(s) {
  return !!(s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1));
}

// Classify a lift name into 'squat' | 'bench' | 'deadlift' | null (fuzzy,
// case-insensitive substring match). Mirrors the former tile keyword lists
// and order (squat → bench → deadlift); the keyword sets do not overlap.
export function classifyBig3Lift(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  const squat = ['back squat', 'squat', 'front squat'];
  const bench = ['bench press', 'incline bench press', 'incline barbell press'];
  const dead  = ['deadlift', 'romanian deadlift', 'deficit deadlift'];
  if (squat.some(k => n.includes(k))) return 'squat';
  if (bench.some(k => n.includes(k))) return 'bench';
  if (dead.some(k => n.includes(k)))  return 'deadlift';
  return null;
}

// Per-week + aggregate best estimated 1RM for the big-3, fuzzy-matched.
// Pure: takes state explicitly. Shape:
// { squat: { current, allTime, byWeek: { '1': e1rm, ... } }, bench: {...}, deadlift: {...} }
//   current  — best e1RM in state.currentWeek
//   allTime  — best e1RM across every logged week
//   byWeek   — best e1RM keyed by week string (for progression charts)
export function computeBig3Progression(state) {
  const cats = ['squat', 'bench', 'deadlift'];
  const out = {};
  cats.forEach(c => { out[c] = { current: 0, allTime: 0, byWeek: {} }; });
  if (!state || !state.weeks) return out;

  const currentWeek = state.currentWeek;

  for (const wKey in state.weeks) {
    const weekObj = state.weeks[wKey];
    if (!weekObj || !weekObj.lifts) continue;

    for (const dKey in weekObj.lifts) {
      const dayLifts = weekObj.lifts[dKey];
      if (!dayLifts) continue;

      for (const lift in dayLifts) {
        const cat = classifyBig3Lift(lift);
        if (!cat) continue;
        const setsArr = dayLifts[lift];
        if (!Array.isArray(setsArr)) continue;

        setsArr.forEach(s => {
          if (!isCompletedSet(s)) return;
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

// Thin wrapper for the Top Lifts glance tile: best all-time e1RM per big-3.
// Mirrors the previous inline tile behaviour (max across all weeks).
export function computeBig3Maxes(state) {
  const prog = computeBig3Progression(state);
  return {
    squat:    prog.squat.allTime,
    bench:    prog.bench.allTime,
    deadlift: prog.deadlift.allTime,
  };
}

// ==========================================
// .FIT PER-RECORD STREAM HELPERS (PURE)
// Operate on column-oriented stream objects: parallel numeric arrays keyed by
// metric (t, distKm, hr, altitude, cadence, power, paceSecPerKm, ...). They
// are unit-agnostic — transforming whatever numeric arrays they're handed.
// Storage lives in db.js (IndexedDB); these are the testable transforms the
// analytics charts will consume. None of this touches the synced state blob.
// ==========================================

// Uniformly downsample every parallel array in a stream to at most maxPoints
// samples, preserving index alignment across metrics and always keeping the
// final sample. Scalars (type/version/lengthUnit/...) pass through untouched.
export function downsampleStream(stream, maxPoints = 500) {
  if (!stream || typeof stream !== 'object') return stream;
  const arrays = Object.keys(stream).filter(k => Array.isArray(stream[k]));
  const n = arrays.reduce((m, k) => Math.max(m, stream[k].length), 0);
  if (n <= maxPoints || maxPoints < 2) {
    return { ...stream, n };
  }
  const step = Math.ceil(n / maxPoints);
  const idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);

  const out = {};
  for (const k of Object.keys(stream)) {
    out[k] = Array.isArray(stream[k]) ? idx.map(i => stream[k][i]) : stream[k];
  }
  out.n = idx.length;
  return out;
}

// Per-sample pace (seconds per km) from cumulative distance (km) and elapsed
// time (s). pace[i] uses the delta from sample i-1 -> i; pace[0] mirrors
// pace[1]. Non-advancing samples (pauses) yield 0.
export function derivePaceSeries(distKm, elapsedSec) {
  const n = Math.min(distKm?.length || 0, elapsedSec?.length || 0);
  const out = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dDist = (parseFloat(distKm[i]) || 0) - (parseFloat(distKm[i - 1]) || 0);
    const dTime = (parseFloat(elapsedSec[i]) || 0) - (parseFloat(elapsedSec[i - 1]) || 0);
    out[i] = dDist > 0 && dTime > 0 ? dTime / dDist : 0;
  }
  if (n > 1) out[0] = out[1];
  return out;
}

// Total positive elevation change across an altitude series (unit in = unit out).
export function elevationGain(altitude) {
  let gain = 0;
  for (let i = 1; i < (altitude?.length || 0); i++) {
    const d = (parseFloat(altitude[i]) || 0) - (parseFloat(altitude[i - 1]) || 0);
    if (d > 0) gain += d;
  }
  return gain;
}

// Seconds spent in each HR zone. zoneFloors is an ascending array of lower bpm
// bounds, one per zone (e.g. [0,114,133,152,171] for Z1..Z5); a sample falls
// in the highest zone whose floor it meets. secPerSample is the seconds
// attributed to each sample (a scalar, or a per-sample array). Zero/blank HR
// samples are skipped.
export function computeTimeInHrZones(hr, secPerSample, zoneFloors) {
  const floors = Array.isArray(zoneFloors) ? zoneFloors : [];
  const zones = new Array(floors.length).fill(0);
  const n = hr?.length || 0;
  const dt = i => Array.isArray(secPerSample)
    ? (parseFloat(secPerSample[i]) || 0)
    : (parseFloat(secPerSample) || 0);
  for (let i = 0; i < n; i++) {
    const bpm = parseFloat(hr[i]) || 0;
    if (bpm <= 0) continue;
    let z = -1;
    for (let f = 0; f < floors.length; f++) if (bpm >= floors[f]) z = f;
    if (z >= 0) zones[z] += dt(i);
  }
  return zones;
}

// ==========================================
// DELOAD SUGGESTION MATCH STUB
// ==========================================
export function shouldSuggestDeload() {
  return { suggest: false, reason: '' };
}