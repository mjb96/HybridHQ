// ==========================================
// FATIGUE MODELS (fatigue_models.js)
// Pure, stateless functions to calculate 3D fatigue.
// Evaluated against current schema.js and state.js structures.
// ==========================================
import { DOMAINS } from './constants_brain.js';
import { exerciseCategory } from '../schema.js';

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
  // Aligned strictly with EXERCISE_LIBRARY categories in constants.js
  const localSets = { Push: 0, Pull: 0, Legs: 0, Accessories: 0, Uncategorized: 0 };
  
  // Look back at the current week and previous week to build a rolling 7-day volume profile
  const weeksToScan = [String(cw - 1), String(cw)].filter(w => weeksState[w]);

  weeksToScan.forEach(wKey => {
    const wData = weeksState[wKey];
    if (!wData || !wData.lifts) return;
    
    defaultDays.forEach(dKey => {
      const dayLifts = wData.lifts[dKey];
      if (!dayLifts) return;

      for (const liftName in dayLifts) {
        const cat = exerciseCategory(liftName) || 'Uncategorized';
        const setsArr = dayLifts[liftName];
        if (Array.isArray(setsArr)) {
          // Native codebase completion definition
          const completedWorkingSets = setsArr.filter(s => 
            s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1) && !s.isWarmup
          ).length;
          
          if (localSets[cat] !== undefined) {
            localSets[cat] += completedWorkingSets;
          } else {
            localSets.Uncategorized += completedWorkingSets;
          }
        }
      }
    });
  });

  // Calculate scores (0 = fresh, 100 = completely fatigued)
  // Baseline threshold: 20 working sets per week per muscle group is high volume.
  const clamp = (val) => Math.max(0, Math.min(100, val));
  
  return {
    pushScore: clamp((localSets.Push / 20) * 100),
    pullScore: clamp((localSets.Pull / 20) * 100),
    legsScore: clamp((localSets.Legs / 20) * 100),
    rawSets: localSets
  };
}

export function calculateSystemicFatigue(weeksState, currentWeekString, defaultDays) {
  const cw = parseInt(currentWeekString, 10) || 1;
  let acuteLoad = 0;
  let chronicLoad = 0;
  let chronicWeeksCount = 0;

  for (let w = 1; w <= cw; w++) {
    const wData = weeksState[String(w)];
    if (!wData) continue;

    let weekLoad = 0;
    defaultDays.forEach(dKey => {
      // Gym Load = RPE * Duration(min)
      const gRpe = parseInt(wData.gymRpe?.[dKey], 10) || 0;
      const gMin = parseDurationMin(wData.gymStats?.[dKey]?.time);
      if (gRpe > 0 && gMin > 0) weekLoad += (gRpe * gMin);

      // Run Load = RPE * Duration(min)
      const rRpe = parseInt(wData.runs?.[dKey]?.rpe, 10) || 0;
      const rMin = parseDurationMin(wData.runs?.[dKey]?.time);
      if (rRpe > 0 && rMin > 0) weekLoad += (rRpe * rMin);
    });

    if (w === cw) {
      acuteLoad = weekLoad;
    } else if (w >= cw - 4) {
      chronicLoad += weekLoad;
      chronicWeeksCount++;
    }
  }

  const avgChronic = chronicWeeksCount > 0 ? chronicLoad / chronicWeeksCount : acuteLoad;
  const acwr = avgChronic > 0 ? acuteLoad / avgChronic : 0.99;

  const clamp = (val) => Math.max(0, Math.min(100, val));
  let score = 0;
  if (acwr > 1.5) score = 100;
  else if (acwr > 1.0) score = ((acwr - 1.0) / 0.5) * 100;
  else score = 0;

  return {
    score: clamp(score),
    acwr: Number(acwr.toFixed(2)),
    acuteLoad: Math.round(acuteLoad),
    chronicLoad: Math.round(avgChronic)
  };
}

export function calculateAerobicFatigue(weeksState, currentWeekString, defaultDays) {
  const cw = parseInt(currentWeekString, 10) || 1;
  const wData = weeksState[String(cw)];
  
  if (!wData) return { score: 0, highIntensityMins: 0, totalDist: 0, totalAnaerobicTE: 0 };

  let highIntensityMins = 0;
  let totalDist = 0;
  let totalAnaerobicTE = 0;

  defaultDays.forEach(dKey => {
    const run = wData.runs?.[dKey];
    if (!run) return;
    
    const rpe = parseInt(run.rpe, 10) || 0;
    const dist = parseFloat(run.dist) || 0;
    const mins = parseDurationMin(run.time);
    const aTE = parseFloat(run.anaerobicTE) || 0;

    totalDist += dist;
    totalAnaerobicTE += aTE;
    
    // Fatigue spikes off Anaerobic Training Effect (Garmin FIT extraction) OR manual RPE >= 7
    if (rpe >= 7 || aTE >= 3.0) {
      highIntensityMins += mins;
    }
  });

  const clamp = (val) => Math.max(0, Math.min(100, val));
  
  // High threshold minutes (> 45m acute) spikes aerobic fatigue
  const intensityScore = (highIntensityMins / 45) * 100;
  
  return {
    score: clamp(intensityScore),
    highIntensityMins: Math.round(highIntensityMins),
    totalDist: Number(totalDist.toFixed(2)),
    totalAnaerobicTE: Number(totalAnaerobicTE.toFixed(1))
  };
}

export function getUnifiedFatigueProfile(weeksState, currentWeekString, defaultDays) {
  return {
    local: calculateLocalFatigue(weeksState, currentWeekString, defaultDays),
    systemic: calculateSystemicFatigue(weeksState, currentWeekString, defaultDays),
    aerobic: calculateAerobicFatigue(weeksState, currentWeekString, defaultDays)
  };
}
