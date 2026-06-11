// ==========================================
// OBSERVATION ENGINE (observer.js)
// Layer 1: Detects raw facts and mathematical trends.
// Math utilities duplicated locally to strictly enforce an acyclic dependency graph.
// ==========================================
import { DOMAINS } from './constants_brain.js';
import { getUnifiedFatigueProfile } from './fatigue_models.js';

function calculateEpley1RM(weight, reps) {
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps, 10) || 0;
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

function extractLiftHistory(weeksState, currentWeek, liftName, defaultDays) {
  const cw = parseInt(currentWeek, 10) || 1;
  const history = [];

  for (let w = cw; w >= Math.max(1, cw - 4); w--) {
    const wData = weeksState[String(w)];
    if (!wData || !wData.lifts) continue;

    let bestE1rm = 0;
    
    defaultDays.forEach(dKey => {
      const setsArr = wData.lifts[dKey]?.[liftName];
      if (Array.isArray(setsArr)) {
        // Native codebase completion definition
        const workingSets = setsArr.filter(s => 
          s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1) && !s.isWarmup
        );
        
        workingSets.forEach(s => {
          const e1rm = calculateEpley1RM(s.w, s.r);
          if (e1rm > bestE1rm) bestE1rm = e1rm;
        });
      }
    });

    if (bestE1rm > 0) {
      history.push({ week: w, e1rm: bestE1rm });
    }
  }
  
  // Sort oldest to newest
  return history.sort((a, b) => a.week - b.week);
}

export function observeStrengthTrends(weeksState, currentWeek, defaultDays) {
  const observations = [];
  const trackedLifts = ['Back Squat', 'Bench Press', 'Deadlift', 'Standing OHP', 'Standing Barbell OHP'];
  const ts = new Date().toISOString();

  trackedLifts.forEach(lift => {
    const history = extractLiftHistory(weeksState, currentWeek, lift, defaultDays);
    if (history.length >= 3) {
      const oldest = history[0].e1rm;
      const newest = history[history.length - 1].e1rm;
      const variance = (newest - oldest) / oldest;

      observations.push({
        id: `OBS_STR_${lift.replace(/\s+/g, '_').toUpperCase()}_TREND_${Date.now()}`,
        domain: DOMAINS.STRENGTH,
        metric: 'E1RM_VARIANCE',
        lift: lift,
        value: variance,
        historyLength: history.length,
        timestamp: ts
      });
    }
  });

  return observations;
}

export function observeFatigueState(weeksState, currentWeek, defaultDays) {
  const profile = getUnifiedFatigueProfile(weeksState, currentWeek, defaultDays);
  const ts = new Date().toISOString();
  const observations = [];

  observations.push({
    id: `OBS_SYS_ACWR_${Date.now()}`,
    domain: DOMAINS.SYSTEMIC,
    metric: 'ACWR',
    value: profile.systemic.acwr,
    timestamp: ts
  });

  observations.push({
    id: `OBS_AERO_LOAD_${Date.now()}`,
    domain: DOMAINS.AEROBIC,
    metric: 'HIGH_INTENSITY_MINS',
    value: profile.aerobic.highIntensityMins,
    timestamp: ts
  });

  ['pushScore', 'pullScore', 'legsScore'].forEach(cat => {
    observations.push({
      id: `OBS_LOC_${cat.toUpperCase()}_${Date.now()}`,
      domain: cat === 'pushScore' ? DOMAINS.LOCAL_PUSH : (cat === 'pullScore' ? DOMAINS.LOCAL_PULL : DOMAINS.LOCAL_LEGS),
      metric: 'VOLUME_SCORE',
      value: profile.local[cat],
      timestamp: ts
    });
  });

  return observations;
}

export function generateAllObservations(appState, defaultDays) {
  const cw = appState.currentWeek;
  if (!appState.weeks || !appState.weeks[cw]) return [];

  const strengthObs = observeStrengthTrends(appState.weeks, cw, defaultDays);
  const fatigueObs = observeFatigueState(appState.weeks, cw, defaultDays);

  return [...strengthObs, ...fatigueObs];
}
