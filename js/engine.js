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

// Most recent completed performance of a given exercise ANYWHERE in the log
// (scanning weeks high->low, then days latest-first), optionally excluding the
// current slot. This is the Hevy-style "last time you did this exercise"
// reference — independent of day-of-week, so it stays correct when a session is
// performed on a different day. Returns { sets:[{w,r}], week, day, e1rm } | null.
export function findLastPerformance(state, liftName, opts = {}) {
  if (!state || !state.weeks || !liftName) return null;
  const { excludeWeek, excludeDay } = opts;
  const dayList = Array.isArray(opts.days) && opts.days.length
    ? opts.days
    : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const weekNums = Object.keys(state.weeks).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
  for (const w of weekNums) {
    const wkData = state.weeks[String(w)];
    if (!wkData || !wkData.lifts) continue;
    for (let i = dayList.length - 1; i >= 0; i--) {
      const d = dayList[i];
      if (excludeWeek != null && String(w) === String(excludeWeek) && d === excludeDay) continue;
      const arr = wkData.lifts[d]?.[liftName];
      if (!Array.isArray(arr)) continue;
      const completed = arr.filter(s => isCompletedSet(s) && parseFloat(s.w) > 0 && parseInt(s.r, 10) > 0);
      if (completed.length > 0) {
        let e1rm = 0;
        completed.forEach(s => { const e = epley1RM(s.w, s.r); if (e > e1rm) e1rm = e; });
        return { sets: completed.map(s => ({ w: s.w, r: s.r })), week: w, day: d, e1rm: Math.round(e1rm) };
      }
    }
  }
  return null;
}

// ==========================================
// TILE METRICS (PURE, TESTED)
// Real-data computations behind the Home tiles + their drill-down trends.
// All pure: state/program/days passed explicitly.
// ==========================================

function clamp01to100(v) { return Math.max(0, Math.min(100, v)); }

// True when a (week,day) has any completed activity (a completed set or a
// logged run distance). Used for rest-day / active-day counting.
function dayHasActivity(weekData, day) {
  if (!weekData) return false;
  const rDist = parseFloat(weekData.runs?.[day]?.dist) || 0;
  if (rDist > 0) return true;
  const dayLifts = weekData.lifts?.[day] || {};
  for (const lift in dayLifts) {
    if (Array.isArray(dayLifts[lift]) && dayLifts[lift].some(isCompletedSet)) return true;
  }
  return false;
}

// Live streak view from the real streakData store ({current, longest,
// lastActivityDate}). The stored `current` only stays "live" if the last
// activity was today or yesterday; otherwise the current streak is broken (0)
// while the all-time longest is retained. Pure — `now` is injectable.
export function computeStreakView(streakData, now = new Date()) {
  const sd = streakData || {};
  const longest = sd.longest || 0;
  if (!sd.lastActivityDate) {
    return { current: 0, longest, hasData: false, broken: false, lastActivityDate: null };
  }
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const last = new Date(sd.lastActivityDate); last.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - last) / 86400000);
  const live = diffDays <= 1;
  return {
    current: live ? (sd.current || 0) : 0,
    longest,
    hasData: true,
    broken: !live,
    lastActivityDate: sd.lastActivityDate,
  };
}

// Recovery score from real signals only (no fabricated sleep data):
//   fatigueScore = inverse of this week's average RPE (higher RPE -> lower)
//   restScore    = rest days this week (3+ rest days -> full)
//   score        = 0.7*fatigue + 0.3*rest, clamped 0..100
// Returns hasData:false when no RPE has been logged this week.
export function computeRecoveryScore(state, days) {
  const wk = state?.currentWeek || '1';
  const weekData = state?.weeks?.[wk];
  const dayList = Array.isArray(days) ? days : [];
  const empty = {
    score: 0, hasData: false, avgRpe: 0,
    fatigueScore: 0, restScore: 0, restDays: dayList.length, activeDays: 0,
    recommendation: 'Log sessions to generate recovery insights.',
  };
  if (!weekData) return empty;

  let totalRpe = 0, rpeCount = 0, activeDays = 0;
  dayList.forEach(d => {
    const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
    const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
    if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
    if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    if (dayHasActivity(weekData, d)) activeDays++;
  });

  if (rpeCount === 0) return empty;

  const avgRpe = totalRpe / rpeCount;
  const fatigueScore = clamp01to100(((10 - avgRpe) / 9) * 100);
  const restDays = Math.max(0, dayList.length - activeDays);
  const restScore = clamp01to100((restDays / 3) * 100);
  const score = Math.round(clamp01to100(fatigueScore * 0.7 + restScore * 0.3));

  let recommendation;
  if (score >= 80)      recommendation = 'Well recovered. You can push intensity today.';
  else if (score >= 60) recommendation = 'Moderately recovered. Stick to planned volume.';
  else if (score >= 40) recommendation = 'Fatigue accumulating. Prioritise rest and sleep.';
  else                  recommendation = 'High fatigue load. Consider a deload or rest day.';

  return {
    score, hasData: true, avgRpe,
    fatigueScore: Math.round(fatigueScore),
    restScore: Math.round(restScore),
    restDays, activeDays, recommendation,
  };
}

// Per-week total calories (run + gym) for weeks 1..maxWeek.
export function computeWeeklyCaloriesSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let cals = 0;
    if (wkData) {
      dayList.forEach(d => {
        cals += parseInt(wkData.runs?.[d]?.cals, 10) || 0;
        cals += parseInt(wkData.gymStats?.[d]?.cals, 10) || 0;
      });
    }
    out.push(cals);
  }
  return out;
}

// Parse "MM:SS", "H:MM:SS", or "M:SS" into minutes (float). 0 if unparseable.
// A bare number is treated as minutes.
export function parseDurationToMinutes(timeStr) {
  if (timeStr == null || timeStr === '') return 0;
  const parts = String(timeStr).trim().split(':').map(p => Number(p));
  if (parts.some(n => Number.isNaN(n))) return 0;
  let sec = 0;
  if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
  else if (parts.length === 1) return parts[0]; // bare number = minutes
  else return 0;
  return sec / 60;
}

// Per-week training load split into lift vs run, weeks 1..maxWeek, using
// session-RPE (Foster's sRPE = RPE x duration_min) in arbitrary units (AU).
// Lifts and runs share the same unit so they're directly comparable. A session
// contributes 0 if it lacks RPE or duration -- no fabricated constants.
export function computeWeeklyLoadSeries(state, days, maxWeek) {
  const lift = [], run = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let gymLoad = 0, runLoad = 0;
    if (wkData) {
      dayList.forEach(d => {
        const gRpe = parseInt(wkData.gymRpe?.[d], 10) || 0;
        const gMin = parseDurationToMinutes(wkData.gymStats?.[d]?.time);
        if (gRpe > 0 && gMin > 0) gymLoad += gRpe * gMin;

        const rRpe = parseInt(wkData.runs?.[d]?.rpe, 10) || 0;
        const rMin = parseDurationToMinutes(wkData.runs?.[d]?.time);
        if (rRpe > 0 && rMin > 0) runLoad += rRpe * rMin;
      });
    }
    lift.push(Math.round(gymLoad));
    run.push(Math.round(runLoad));
  }
  return { lift, run };
}

// Acute:Chronic Workload Ratio readiness. acute = current-week load; chronic =
// mean weekly load over the trailing chronicWeeks (default 4, current week
// included), counting only weeks that had load. ACWR's recognised sweet spot is
// ~0.8-1.3; spiking above it raises injury risk (lower readiness), very low
// ratios indicate detraining. Maps ACWR -> 0..100 readiness.
export function computeReadiness(loadByWeek, currentWeek, chronicWeeks = 4) {
  const cw = parseInt(currentWeek, 10) || 1;
  const acute = loadByWeek[cw - 1] || 0;
  const start = Math.max(0, cw - chronicWeeks);
  const windowWeeks = loadByWeek.slice(start, cw);
  const nonZero = windowWeeks.filter(v => v > 0);
  if (acute <= 0 || nonZero.length === 0) {
    return { score: 0, acwr: 0, acute, chronic: 0, hasData: false };
  }
  const chronic = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  const acwr = chronic > 0 ? acute / chronic : 0;
  let score;
  if (acwr <= 1.0) score = 60 + acwr * 40;
  else if (acwr <= 1.3) score = 100;
  else score = 100 - (acwr - 1.3) * 80;
  return {
    score: Math.round(clamp01to100(score)),
    acwr: Math.round(acwr * 100) / 100,
    acute, chronic: Math.round(chronic), hasData: true,
  };
}

// Goal adherence: cumulative completion % across ELAPSED weeks (1..currentWeek)
// -- of everything scheduled so far, how much is actually done.
export function computeGoalAdherence(state, program, days, currentWeek) {
  const cw = parseInt(currentWeek, 10) || 1;
  const dayList = Array.isArray(days) ? days : [];
  let total = 0, done = 0;
  for (let w = 1; w <= cw; w++) {
    const wkData = state?.weeks?.[String(w)];
    if (!wkData) continue;
    dayList.forEach(d => {
      const bp = program?.days?.[d];
      const runsStr = (bp?.runs || '').toLowerCase();
      const isRunScheduled = runsStr && !runsStr.includes('no structured') && runsStr !== 'rest';
      if (isRunScheduled) { total++; if ((parseFloat(wkData.runs?.[d]?.dist) || 0) > 0) done++; }
      const dayLifts = wkData.lifts?.[d] || {};
      for (const l in dayLifts) {
        if (Array.isArray(dayLifts[l])) dayLifts[l].forEach(s => { total++; if (isCompletedSet(s)) done++; });
      }
    });
  }
  return { pct: total > 0 ? Math.round((done / total) * 100) : 0, total, done, elapsedWeeks: cw };
}

// Program milestones derived from its length (replaces hardcoded weeks 6/12).
export function computeDynamicMilestones(totalWeeks) {
  const t = parseInt(totalWeeks, 10) || 12;
  const mk = (frac, label) => ({ week: Math.max(1, Math.round(t * frac)), label });
  return [
    mk(0.25, 'Foundation phase'),
    mk(0.5,  'Midpoint check-in'),
    mk(0.75, 'Peak build'),
    mk(1.0,  'Program completion'),
  ];
}

// Weekly avg/max HR from run sessions, weeks 1..maxWeek.
export function computeWeeklyHrSeries(state, days, maxWeek) {
  const avgHr = [], maxHr = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let sum = 0, cnt = 0, mx = 0;
    if (wkData) dayList.forEach(d => {
      const a = parseFloat(wkData.runs?.[d]?.avgHR) || 0;
      const m = parseFloat(wkData.runs?.[d]?.maxHR) || 0;
      if (a > 0) { sum += a; cnt++; }
      if (m > mx) mx = m;
    });
    avgHr.push(cnt > 0 ? Math.round(sum / cnt) : 0);
    maxHr.push(Math.round(mx));
  }
  return { avgHr, maxHr };
}

// Weekly average aerobic training effect from run sessions, weeks 1..maxWeek.
export function computeWeeklyTrainingEffectSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let sum = 0, cnt = 0;
    if (wkData) dayList.forEach(d => {
      const te = parseFloat(wkData.runs?.[d]?.trainingEffect) || 0;
      if (te > 0) { sum += te; cnt++; }
    });
    out.push(cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : 0);
  }
  return out;
}

// Per-week completion percentage (0..100) for weeks 1..maxWeek, using the same
// scheduled-run + logged-set accounting as the Home progress bar. `program` is
// the active program object (passed in to keep this pure).
export function computeWeeklyCompletionSeries(state, program, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let total = 0, done = 0;
    if (wkData) {
      dayList.forEach(d => {
        const bp = program?.days?.[d];
        const runsStr = (bp?.runs || '').toLowerCase();
        const isRunScheduled = runsStr && !runsStr.includes('no structured') && runsStr !== 'rest';
        if (isRunScheduled) { total++; if ((parseFloat(wkData.runs?.[d]?.dist) || 0) > 0) done++; }

        const dayLifts = wkData.lifts?.[d] || {};
        for (const l in dayLifts) {
          if (Array.isArray(dayLifts[l])) {
            dayLifts[l].forEach(s => { total++; if (isCompletedSet(s)) done++; });
          }
        }
      });
    }
    out.push(total > 0 ? Math.round((done / total) * 100) : 0);
  }
  return out;
}

// ==========================================
// DELOAD SUGGESTION MATCH STUB
// ==========================================
export function shouldSuggestDeload() {
  return { suggest: false, reason: '' };
}