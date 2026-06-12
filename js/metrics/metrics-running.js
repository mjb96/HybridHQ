// ==========================================
// METRICS — RUNNING (metrics-running.js)
// ------------------------------------------
// Multi-week running aggregations consumed by Analytics and Brain.
// All functions are pure: (state, days, maxWeek) → number[] or object.
// No DOM, no browser globals. Safe under `node --test`.
//
// weeklyHrZonesSeries and weeklyCadenceSeries are NEW canonical functions —
// previously only computed inline inside analytics.js collectAnalyticsData().
// ==========================================
import { paceSecondsPerKm } from '../engine.js';

// ==========================================
// WEEKLY DISTANCE SERIES
// Total running distance (km) per week 1..maxWeek.
// ==========================================
export function weeklyDistanceSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let dist = 0;
    if (wkData) dayList.forEach(d => { dist += parseFloat(wkData.runs?.[d]?.dist) || 0; });
    out.push(Math.round(dist * 10) / 10);
  }
  return out;
}

// ==========================================
// WEEKLY PACE SERIES
// Distance-weighted average pace (s/km) per week. 0 means no runs logged.
// Canonical single source — replaces the duplicate in brain/analysis.js.
// ==========================================
export function weeklyPaceSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let totTime = 0, totDist = 0;
    if (wkData) {
      dayList.forEach(d => {
        const r = wkData.runs?.[d];
        if (!r) return;
        const dist = parseFloat(r.dist) || 0;
        const pace = paceSecondsPerKm(dist, r.time || '');
        if (dist > 0 && pace > 0) { totTime += pace * dist; totDist += dist; }
      });
    }
    out.push(totDist > 0 ? totTime / totDist : 0);
  }
  return out;
}

// ==========================================
// WEEKLY HR SERIES
// Average and max heart rate per week (from manual entry or .FIT import).
// ==========================================
export function weeklyHrSeries(state, days, maxWeek) {
  const avgHr = [], maxHr = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let sum = 0, cnt = 0, mx = 0;
    if (wkData) {
      dayList.forEach(d => {
        const a = parseFloat(wkData.runs?.[d]?.avgHR) || 0;
        const m = parseFloat(wkData.runs?.[d]?.maxHR) || 0;
        if (a > 0) { sum += a; cnt++; }
        if (m > mx) mx = m;
      });
    }
    avgHr.push(cnt > 0 ? Math.round(sum / cnt) : 0);
    maxHr.push(Math.round(mx));
  }
  return { avgHr, maxHr };
}

// ==========================================
// WEEKLY HR ZONES SERIES
// 5-zone time distribution (minutes) per week from .FIT import.
// Returns number[][] — one [z1,z2,z3,z4,z5] array per week.
// Previously only existed as inline accumulation in collectAnalyticsData().
// ==========================================
export function weeklyHrZonesSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    const zones = [0, 0, 0, 0, 0];
    if (wkData) {
      dayList.forEach(d => {
        const hrz = wkData.runs?.[d]?.hrZones;
        if (Array.isArray(hrz)) {
          hrz.forEach((z, i) => { if (i < 5) zones[i] += parseFloat(z) || 0; });
        }
      });
    }
    out.push(zones);
  }
  return out;
}

// ==========================================
// WEEKLY CADENCE SERIES
// Distance-weighted average running cadence (spm) per week.
// Previously only existed as inline accumulation in collectAnalyticsData().
// ==========================================
export function weeklyCadenceSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let sum = 0, cnt = 0;
    if (wkData) {
      dayList.forEach(d => {
        const c = parseFloat(wkData.runs?.[d]?.avgCadence) || 0;
        if (c > 0) { sum += c; cnt++; }
      });
    }
    out.push(cnt > 0 ? sum / cnt : 0);
  }
  return out;
}

// ==========================================
// WEEKLY TRAINING EFFECT SERIES
// Average Garmin training effect per week.
// ==========================================
export function weeklyTrainingEffectSeries(state, days, maxWeek) {
  const out = [];
  const dayList = Array.isArray(days) ? days : [];
  for (let w = 1; w <= maxWeek; w++) {
    const wkData = state?.weeks?.[String(w)];
    let sum = 0, cnt = 0;
    if (wkData) {
      dayList.forEach(d => {
        const te = parseFloat(wkData.runs?.[d]?.trainingEffect) || 0;
        if (te > 0) { sum += te; cnt++; }
      });
    }
    out.push(cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : 0);
  }
  return out;
}
