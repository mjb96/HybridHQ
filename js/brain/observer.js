// ==========================================
// OBSERVATION ENGINE (observer.js)
// Layer 1: Detects raw facts and mathematical trends.
// ==========================================
import { DOMAINS } from './constants_brain.js';

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
        const workingSets = setsArr.filter(s => 
          s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1) && !s.isWarmup
        );
        
        workingSets.forEach(s => {
          const e1rm = calculateEpley1RM(s.w, s.r);
          if (e1rm > bestE1rm) bestE1rm = e1rm;
        });
      }
    });

    if (bestE1rm > 0) history.push({ week: w, e1rm: bestE1rm });
  }
  
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

export function observeFatigueState(flatFatigueProfile) {
  const ts = new Date().toISOString();
  const observations = [];

  observations.push({ id: `OBS_SYS_FATIGUE_${Date.now()}`, domain: DOMAINS.SYSTEMIC, metric: 'SCORE', value: flatFatigueProfile.systemic, timestamp: ts });
  observations.push({ id: `OBS_AERO_FATIGUE_${Date.now()}`, domain: DOMAINS.AEROBIC, metric: 'SCORE', value: flatFatigueProfile.aerobic, timestamp: ts });
  observations.push({ id: `OBS_LOC_PUSH_${Date.now()}`, domain: DOMAINS.LOCAL_PUSH, metric: 'SCORE', value: flatFatigueProfile.push, timestamp: ts });
  observations.push({ id: `OBS_LOC_PULL_${Date.now()}`, domain: DOMAINS.LOCAL_PULL, metric: 'SCORE', value: flatFatigueProfile.pull, timestamp: ts });
  observations.push({ id: `OBS_LOC_LEGS_${Date.now()}`, domain: DOMAINS.LOCAL_LEGS, metric: 'SCORE', value: flatFatigueProfile.legs, timestamp: ts });

  return observations;
}

export function generateAllObservations(appState, defaultDays, flatFatigueProfile) {
  const cw = appState.currentWeek;
  if (!appState.weeks || !appState.weeks[cw]) return [];

  const strengthObs = observeStrengthTrends(appState.weeks, cw, defaultDays);
  const fatigueObs = observeFatigueState(flatFatigueProfile);

  return [...strengthObs, ...fatigueObs];
}
