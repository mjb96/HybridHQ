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
// STABLE EXERCISE ID HELPERS
// ------------------------------------------
// Storage keys in lifts[day] are opaque IDs (lift_xxxxxxxx) after migration.
// These three functions are the single translation layer between display names
// and storage keys. Every module that reads or writes lifts[day] must use them.
// ==========================================
export function getLiftId(state, displayName) {
  const key = String(displayName || '').trim();
  if (!key) return key;
  if (!state.liftIdMap) state.liftIdMap = {};
  if (!state.liftNames) state.liftNames = {};
  if (state.liftIdMap[key]) return state.liftIdMap[key];
  const id = 'lift_' + Math.random().toString(36).slice(2, 10);
  state.liftIdMap[key] = id;
  state.liftNames[id] = key;
  return id;
}

export function getLiftDisplayName(state, idOrName) {
  if (!idOrName) return String(idOrName ?? '');
  return state?.liftNames?.[String(idOrName)] || String(idOrName);
}

export function resolveLiftKey(state, nameOrId) {
  if (!nameOrId) return String(nameOrId ?? '');
  const key = String(nameOrId).trim();
  // If it's a display name that has a registered ID, return the ID.
  // If it's already an ID (or an unregistered name), return as-is.
  return state?.liftIdMap?.[key] || key;
}

// ==========================================
// TEXT DESCRIPTION PARSER ENGINE
// ==========================================
export function parseTargetFromDescription(descString, liftName) {
  let result = { sets: 3, reps: 10 };
  if (!descString || !liftName) return result;

  try {
    const escapedLift = liftName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    const regex = new RegExp(escapedLift + '\\s*\\((\\d+)\\s*[xX×]\\s*([^\\)]+)\\)', 'i');
    const match = descString.match(regex);

    if (match) {
      result.sets = parseInt(match[1], 10) || 3;
      
      let repValue = match[2].trim().toLowerCase().replace(/–/g, '-');

      if (repValue.includes('-')) {
        result.reps = parseInt(repValue.split('-')[1], 10) || 10;
      } else if (repValue === 'max') {
        result.reps = 10; 
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

  const storageKey = resolveLiftKey(appState, liftName);
  const history = [];
  for (let w = cWk - 1; w >= 1; w--) {
    const wData = appState.weeks[w.toString()];
    if (wData && wData.lifts && wData.lifts[dayKey]?.[storageKey]) {
      // INCREMENT WARMUP: Exclude warmups from diagnostics and suggestions
      const finishedSets = wData.lifts[dayKey][storageKey].filter(s => s && s.c && s.w && s.r && !s.isWarmup);
      if (finishedSets.length > 0) {
        let bestE1rm = 0, bestWeight = 0, bestReps = 0;
        finishedSets.forEach(s => {
          const w_ = parseFloat(s.w) || 0;
          const r_ = parseInt(s.r, 10) || 0;
          const e = epley1RM(w_, r_);
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
    // Prefer per-set RPE logged on this lift's last session; fall back to
    // session-level RPE across all days when per-set data is absent.
    const prevSets = (pastWkData.lifts?.[dayKey]?.[storageKey] || [])
      .filter(s => s && !s.isWarmup && isCompletedSet(s));
    const perSetRpes = prevSets
      .map(s => parseFloat(s.rpe))
      .filter(v => !isNaN(v) && v > 0);

    if (perSetRpes.length > 0) {
      perSetRpes.forEach(v => { totalRpeSum += v; rpeCount++; });
    } else {
      DEFAULT_DAYS.forEach(d => {
        const runRpe = parseInt(pastWkData.runs?.[d]?.rpe, 10) || 0;
        if (runRpe > 0) { totalRpeSum += runRpe; rpeCount++; }
        const gymRpe = parseInt(pastWkData.gymRpe?.[d], 10) || 0;
        if (gymRpe > 0) { totalRpeSum += gymRpe; rpeCount++; }
      });
    }
  }
  
  const pastWeekAvgRpe = rpeCount > 0 ? totalRpeSum / rpeCount : 0;
  if (pastWeekAvgRpe >= (CONFIG.fatigueRpeThreshold || 8.5)) {
    result.isFatigueOverload = true;
    result.message = 'High fatigue detected from last week (Avg RPE ' + pastWeekAvgRpe.toFixed(1) + '). We recommend dropping workout volume by 10% today.';
    return result;
  }

  return result;
}

// SCHEMA v2: native structured prescription. Reads a v2 lift entry
//   { name, sets, reps:{min,max}|null, rpe, pct1rm, restSec, ... }
// directly — no free-text `desc` regex on the hot path (that now lives only
// in the schema.js migration importer). `weekContext` carries the week label
// (taper detection) and an optional fallback reps value.
export function prescribeSetsForLift(wk, dayKey, liftEntry, weekContext = {}) {
  const entry = liftEntry || {};
  const liftName = entry.name || '';

  let setsCount = Math.max(1, parseInt(entry.sets, 10) || 4);

  // Rep target = top of the authored range (mirrors the legacy regex, which
  // took the second number of "8–10"). Fixed scheme → that value.
  let repsTarget;
  if (entry.reps && (entry.reps.max != null || entry.reps.min != null)) {
    repsTarget = entry.reps.max ?? entry.reps.min;
  } else if (weekContext.reps != null) {
    repsTarget = weekContext.reps;
  } else {
    repsTarget = 10;
  }

  // Taper weeks: if the entry carries no explicit scheme, honour the week's
  // low rep fallback (preserves the old taper behaviour).
  const label = (weekContext.label || '').toLowerCase();
  if (label.includes('taper') && !entry.reps && weekContext.reps != null) {
    repsTarget = weekContext.reps;
  }

  const diagnostic = computeDiagnosticForLift(wk, dayKey, liftName);
  if (diagnostic.isStalled || diagnostic.isFatigueOverload) {
    setsCount = Math.max(1, Math.round(setsCount * CONFIG.stallSetReductionModifier));
  }

  const sets = [];
  for (let i = 0; i < setsCount; i++) {
    sets.push({
      w: diagnostic.suggestedWeight !== '' ? diagnostic.suggestedWeight.toString() : '',
      r: repsTarget != null ? repsTarget.toString() : '',
      c: false
    });
  }
  return sets;
}

// ==========================================
// RUN PACE DERIVATION  (threshold → zone paces)
// Single source of truth for pace constants (schema.js re-exports these to
// keep the import graph acyclic). Offsets mirror analytics.paceZoneColour so
// builder-derived paces and analytics colouring agree.
// ==========================================
export const GOAL_5K_PACE_SEC = 239; // sub-20:00 5K ≈ 3:59/km (20:00 flat = 240/km)
export const PACE_OFFSETS = { easy: 60, tempo: 30, threshold: 0, interval: -10 };

export function derivePaceTargets(thresholdSec, offsets = PACE_OFFSETS) {
  const t = parseInt(thresholdSec, 10) || 0;
  if (t <= 0) {
    return { easy: null, tempo: null, threshold: null, interval: null, goal: GOAL_5K_PACE_SEC, hasThreshold: false };
  }
  return {
    easy: t + offsets.easy,
    tempo: t + offsets.tempo,
    threshold: t + offsets.threshold,
    interval: t + offsets.interval,
    goal: GOAL_5K_PACE_SEC,
    hasThreshold: true,
  };
}

// Attach computed target paces (s/km) to a RunWorkout and its interval reps,
// based on the run's paceBasis and the athlete's saved threshold pace.
export function derivePaceForRun(run, thresholdSec) {
  if (!run) return run;
  const z = derivePaceTargets(thresholdSec);
  const byBasis = {
    easy: z.easy, tempo: z.tempo, threshold: z.threshold,
    interval: z.interval, goal: z.goal, custom: null,
  };
  const pace = byBasis[run.paceBasis] ?? null;
  const out = { ...run, paceTargetSec: pace };
  if (Array.isArray(run.reps) && run.reps.length) {
    out.reps = run.reps.map(rp => ({ ...rp, paceTarget: rp.paceTarget ?? pace }));
  }
  return out;
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
        
        const lName = getLiftDisplayName(appState, lKey);
        setsArr.forEach(s => {
          // INCREMENT WARMUP: Exclude warmups from global max
          if (s && s.c && !s.isWarmup) {
            const weight = parseFloat(s.w) || 0;
            const reps = parseInt(s.r, 10) || 0;
            const e1rm = epley1RM(weight, reps);

            if (wKey === wk) {
              if (lName === 'Back Squat' && e1rm > result.currentSq) result.currentSq = e1rm;
              if (lName === 'Bench Press' && e1rm > result.currentBp) result.currentBp = e1rm;
              if (lName === 'Deadlift' && e1rm > result.currentDl) result.currentDl = e1rm;
            }
            if (lName === 'Back Squat' && e1rm > result.globalMaxSq) result.globalMaxSq = e1rm;
            if (lName === 'Bench Press' && e1rm > result.globalMaxBp) result.globalMaxBp = e1rm;
            if (lName === 'Deadlift' && e1rm > result.globalMaxDl) result.globalMaxDl = e1rm;
          }
        });
      }
    }
  }
  return result;
}

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
          // INCREMENT WARMUP: Exclude warmups from PRs
          if (set && set.c && set.w && set.r && !set.isWarmup) {
            const weight = parseFloat(set.w);
            const reps = parseInt(set.r);
            const e1RM = epley1RM(weight, reps);
            if (e1RM > maxEstimated1RM) maxEstimated1RM = e1RM;
          }
        });

        if (maxEstimated1RM > 0) {
          const liftKey = getLiftDisplayName(state, lift);
          if (!stats[liftKey]) {
            stats[liftKey] = { allTimeMax: 0, currentEstimatedMax: 0 };
          }
          if (maxEstimated1RM > stats[liftKey].allTimeMax) {
            stats[liftKey].allTimeMax = maxEstimated1RM;
          }
          if (wKey === state.currentWeek) {
            if (maxEstimated1RM > (stats[liftKey].currentEstimatedMax || 0)) {
              stats[liftKey].currentEstimatedMax = maxEstimated1RM;
            }
          }
        }
      }
    }
  }
  return stats;
}

export function epley1RM(weight, reps) {
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps, 10) || 0;
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

export function isCompletedSet(s) {
  return !!(s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1));
}

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

export function elevationGain(altitude) {
  let gain = 0;
  for (let i = 1; i < (altitude?.length || 0); i++) {
    const d = (parseFloat(altitude[i]) || 0) - (parseFloat(altitude[i - 1]) || 0);
    if (d > 0) gain += d;
  }
  return gain;
}

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

// INCREMENT WARMUP: Dual-Stream Indexing Extraction
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
      const arr = wkData.lifts[d]?.[resolveLiftKey(state, liftName)];
      if (!Array.isArray(arr)) continue;

      const workingSets = arr.filter(s => !s.isWarmup);
      const warmupSets = arr.filter(s => s.isWarmup);
      const completedWorking = workingSets.filter(s => isCompletedSet(s) && parseFloat(s.w) > 0 && parseInt(s.r, 10) > 0);

      // Require at least 1 completed working set to be considered a valid historical "Performance"
      if (completedWorking.length > 0) {
        let e1rm = 0;
        completedWorking.forEach(s => { const e = epley1RM(s.w, s.r); if (e > e1rm) e1rm = e; });
        return { 
          sets: workingSets.map(s => ({ w: s.w, r: s.r })), 
          warmupSets: warmupSets.map(s => ({ w: s.w, r: s.r })), 
          workingSets: workingSets.map(s => ({ w: s.w, r: s.r })), 
          week: w, day: d, e1rm: Math.round(e1rm) 
        };
      }
    }
  }
  return null;
}

function clamp01to100(v) { return Math.max(0, Math.min(100, v)); }

function dayHasActivity(weekData, day) {
  if (!weekData) return false;
  const rDist = parseFloat(weekData.runs?.[day]?.dist) || 0;
  if (rDist > 0) return true;
  const dayLifts = weekData.lifts?.[day] || {};
  for (const lift in dayLifts) {
    // INCREMENT WARMUP: Ensure a day with ONLY a warmup isn't counted as an active training day
    if (Array.isArray(dayLifts[lift]) && dayLifts[lift].some(s => isCompletedSet(s) && !s.isWarmup)) return true;
  }
  return false;
}

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

export function parseDurationToMinutes(timeStr) {
  if (timeStr == null || timeStr === '') return 0;
  const parts = String(timeStr).trim().split(':').map(p => Number(p));
  if (parts.some(n => Number.isNaN(n))) return 0;
  let sec = 0;
  if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
  else if (parts.length === 1) return parts[0]; 
  else return 0;
  return sec / 60;
}

// ==========================================
// PACE PARSING / FORMATTING (canonical)
// Average pace in seconds/km from distance (km) + an "mm:ss"/"h:mm:ss" time
// string, plus a display formatter. Single source consumed by analytics (and
// available to any tile) so pace math/formatting is defined in exactly one place.
// ==========================================
export function paceSecondsPerKm(distKm, timeStr) {
  const dist = parseFloat(distKm) || 0;
  if (!dist || !timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  let totalSecs = 0;
  if (parts.length === 2) totalSecs = parts[0] * 60 + parts[1];
  else if (parts.length === 3) totalSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (totalSecs === 0) return 0;
  return totalSecs / dist;
}

export function formatPace(secsPerKm) {
  if (!secsPerKm || secsPerKm === 0) return '--';
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60).toString().padStart(2, '0');
  return `${m}:${s}/km`;
}

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


export function computeReadiness(loadByWeek, currentWeek, chronicWeeks = 4) {
  const cw = parseInt(currentWeek, 10) || 1;
  const acute = loadByWeek[cw - 1] || 0;
  // Chronic baseline = PRIOR weeks only (exclude the current/acute week). With
  // the acute week included, a single logged week gives acute===chronic → ACWR
  // 1.0 → a meaningless "100". Require at least one prior week of load.
  const start = Math.max(0, cw - 1 - chronicWeeks);
  const chronicWindow = loadByWeek.slice(start, cw - 1);
  const nonZero = chronicWindow.filter(v => v > 0);
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
        // INCREMENT WARMUP: Exclude from adherence
        if (Array.isArray(dayLifts[l])) dayLifts[l].forEach(s => { if (!s.isWarmup) { total++; if (isCompletedSet(s)) done++; } });
      }
    });
  }
  return { pct: total > 0 ? Math.round((done / total) * 100) : 0, total, done, elapsedWeeks: cw };
}

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
            dayLifts[l].forEach(s => { 
              // INCREMENT WARMUP: Exclude warmups from program completion %
              if (!s.isWarmup) {
                total++; 
                if (isCompletedSet(s)) done++; 
              }
            });
          }
        }
      });
    }
    out.push(total > 0 ? Math.round((done / total) * 100) : 0);
  }
  return out;
}

export function shouldSuggestDeload() {
  return { suggest: false, reason: '' };
}

export function getExerciseHistoryLog(state, liftName) {
  if (!state || !state.weeks) return { sessions: [], bestE1RM: 0, bestVolume: 0 };
  
  let sessions = [];
  let bestE1RM = 0;
  let bestVolume = 0;

  const weekNums = Object.keys(state.weeks).map(Number).filter(n => !isNaN(n)).sort((a,b) => b - a);
  
  for(let wk of weekNums) {
    const wData = state.weeks[String(wk)];
    if(!wData || !wData.lifts) continue;
    
    for(let d in wData.lifts) {
      const sets = wData.lifts[d][resolveLiftKey(state, liftName)];
      if(!sets || !Array.isArray(sets)) continue;
      
      // INCREMENT WARMUP: History Modal only displays working volume/sets
      const completedSets = sets.filter(s => isCompletedSet(s) && !s.isWarmup);
      if(completedSets.length === 0) continue;

      let vol = 0;
      let sessionMaxE1RM = 0;
      
      completedSets.forEach(s => {
        const w = parseFloat(s.w) || 0;
        const r = parseInt(s.r, 10) || 0;
        vol += (w * r);
        const e1rm = epley1RM(w, r);
        if (e1rm > sessionMaxE1RM) sessionMaxE1RM = e1rm;
      });

      if (sessionMaxE1RM > bestE1RM) bestE1RM = sessionMaxE1RM;
      if (vol > bestVolume) bestVolume = vol;

      sessions.push({
        week: wk,
        day: d,
        sets: completedSets,
        volume: vol,
        e1rm: sessionMaxE1RM
      });
    }
  }

  return { sessions, bestE1RM, bestVolume };
}