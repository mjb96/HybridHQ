// ==========================================
// FATIGUE MODELS (fatigue_models.js)
// Pure, stateless functions to calculate 3D fatigue.
// ==========================================
import { EXERCISE_LIBRARY } from '../constants.js';

// Local helper to replace the missing schema.js export
function getExerciseCategory(liftName) {
  if (!liftName) return 'Uncategorized';
  const searchName = liftName.toLowerCase().trim();
  
  for (const cat in EXERCISE_LIBRARY) {
    if (EXERCISE_LIBRARY[cat].some(ex => ex.toLowerCase().trim() === searchName)) {
      return cat;
    }
  }
  return 'Uncategorized';
}

function parseDurationMin(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return (parts[0] * 60) + parts[1] + (parts[2] / 60);
  if (parts.length === 2) return parts[0] + (parts[1] / 60);
  return parts[0] || 0;
}

export function calculateLocalFatigue(weeksState, currentWeekString, defaultDays) {
  const cw = parseInt(currentWeekString, 10) || 1;
  const localSets = { Push: 0, Pull: 0, Legs: 0, Accessories: 0, Uncategorized: 0 };
  
  const weeksToScan = [String(cw - 1), String(cw)].filter(w => weeksState[w]);

  weeksToScan.forEach(wKey => {
    const wData = weeksState[wKey];
    if (!wData || !wData.lifts) return;
    
    defaultDays.forEach(dKey => {
      const dayLifts = wData.lifts[dKey];
      if (!dayLifts) return;

      for (const liftName in dayLifts) {
        const cat = getExerciseCategory(liftName);
        const setsArr = dayLifts[liftName];
        
        if (Array.isArray(setsArr)) {
          const completedWorkingSets = setsArr.filter(s => 
            s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1) && !s.isWarmup
          ).length;
          
          if (localSets[cat] !== undefined) localSets[cat] += completedWorkingSets;
          else localSets.Uncategorized += completedWorkingSets;
        }
      }
    });
  });

  const clamp = (val) => Math.round(Math.max(0, Math.min(100, val)));
  
  return {
    pushScore: clamp((localSets.Push / 20) * 100),
    pullScore: clamp((localSets.Pull / 20) * 100),
    legsScore: clamp((localSets.Legs / 20) * 100)
  };
}

export function calculateSystemicFatigue(weeksState, currentWeekString, defaultDays) {
  const cw = parseInt(currentWeekString, 10) || 1;
  let acuteLoad = 0, chronicLoad = 0, chronicWeeksCount = 0;

  for (let w = 1; w <= cw; w++) {
    const wData = weeksState[String(w)];
    if (!wData) continue;

    let weekLoad = 0;
    defaultDays.forEach(dKey => {
      const gRpe = parseInt(wData.gymRpe?.[dKey], 10) || 0;
      const gMin = parseDurationMin(wData.gymStats?.[dKey]?.time);
      if (gRpe > 0 && gMin > 0) weekLoad += (gRpe * gMin);

      const rRpe = parseInt(wData.runs?.[dKey]?.rpe, 10) || 0;
      const rMin = parseDurationMin(wData.runs?.[dKey]?.time);
      if (rRpe > 0 && rMin > 0) weekLoad += (rRpe * rMin);
    });

    if (w === cw) acuteLoad = weekLoad;
    else if (w >= cw - 4) {
      chronicLoad += weekLoad;
      chronicWeeksCount++;
    }
  }

  const avgChronic = chronicWeeksCount > 0 ? chronicLoad / chronicWeeksCount : acuteLoad;
  const acwr = avgChronic > 0 ? acuteLoad / avgChronic : 0.99;

  let score = 0;
  if (acwr > 1.5) score = 100;
  else if (acwr > 1.0) score = ((acwr - 1.0) / 0.5) * 100;

  return { score: Math.round(Math.max(0, Math.min(100, score))) };
}

export function calculateAerobicFatigue(weeksState, currentWeekString, defaultDays) {
  const cw = parseInt(currentWeekString, 10) || 1;
  const wData = weeksState[String(cw)];
  
  if (!wData) return { score: 0 };

  let highIntensityMins = 0;
  defaultDays.forEach(dKey => {
    const run = wData.runs?.[dKey];
    if (!run) return;
    
    const rpe = parseInt(run.rpe, 10) || 0;
    const mins = parseDurationMin(run.time);
    const aTE = parseFloat(run.anaerobicTE) || 0;

    if (rpe >= 7 || aTE >= 3.0) highIntensityMins += mins;
  });

  const intensityScore = (highIntensityMins / 45) * 100;
  return { score: Math.round(Math.max(0, Math.min(100, intensityScore))) };
}

export function getUnifiedFatigueProfile(weeksState, currentWeekString, defaultDays) {
  const local = calculateLocalFatigue(weeksState, currentWeekString, defaultDays);
  const systemic = calculateSystemicFatigue(weeksState, currentWeekString, defaultDays);
  const aerobic = calculateAerobicFatigue(weeksState, currentWeekString, defaultDays);

  return {
    systemic: systemic.score,
    aerobic: aerobic.score,
    push: local.pushScore,
    pull: local.pullScore,
    legs: local.legsScore
  };
}
