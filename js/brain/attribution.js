// ==========================================
// HYBRID BRAIN — ATTRIBUTION & INTERFERENCE (attribution.js)
// ------------------------------------------
// Phase 2: explain WHY a finding may be happening. This is correlational, not
// causal proof — attribution language stays hedged ("coincides with", "appears
// driven by") and attribution confidence is capped at "med" by design.
//
// Two responsibilities:
//   1. attributeFindings() — enrich existing Findings with an `.attribution`
//      block: a plain-language summary + evidence-backed concurrent drivers.
//   2. detectInterference() — ONE new Finding: elevated recovery demand that is
//      jointly driven by strength AND endurance stress.
//
// Pure module. Reuses engine / load_models / schema calcs only. Safe under
// `node --test`.
// ==========================================
import { parseDurationToMinutes, isCompletedSet, computeReadiness } from '../engine.js';
import { recoveryCostSeries, recoveryCostBreakdown, enduranceLoadSeries } from './load_models.js';
import { exerciseCategory } from '../schema.js';
import { makeFinding } from './analysis.js';
import { DOMAINS, ENGINES, FINDING_TYPES } from './constants_brain.js';

const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ------------------------------------------------------------------
// DRIVER SERIES — concurrent factors used to explain a finding.
// ------------------------------------------------------------------

// Minutes of harder running per week (RPE ≥ 7 or anaerobic TE ≥ 3) — a proxy
// for threshold/interval volume, which logged runs don't tag explicitly.
export function highIntensityRunSeries(state, days, maxWeek) {
  const out = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wk = state?.weeks?.[String(w)];
    let mins = 0;
    if (wk) (days || []).forEach(d => {
      const r = wk.runs?.[d]; if (!r) return;
      const rpe = parseInt(r.rpe, 10) || 0;
      const aTE = parseFloat(r.anaerobicTE) || 0;
      const m = parseDurationToMinutes(r.time);
      if ((rpe >= 7 || aTE >= 3) && m > 0) mins += m;
    });
    out.push(Math.round(mins));
  }
  return out;
}

// Weekly training frequency: count of days with any completed working set or a
// logged run.
export function activeDaySeries(state, days, maxWeek) {
  const out = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wk = state?.weeks?.[String(w)];
    let n = 0;
    if (wk) (days || []).forEach(d => {
      let active = (parseFloat(wk.runs?.[d]?.dist) || 0) > 0;
      if (!active) {
        const lifts = wk.lifts?.[d] || {};
        for (const l in lifts) {
          const arr = lifts[l];
          if (Array.isArray(arr) && arr.some(s => isCompletedSet(s) && !s.isWarmup)) { active = true; break; }
        }
      }
      if (active) n++;
    });
    out.push(n);
  }
  return out;
}

// Lower-body strength volume (Legs-category tonnage) per week.
export function lowerBodyVolumeSeries(state, days, maxWeek) {
  const out = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wk = state?.weeks?.[String(w)];
    let vol = 0;
    if (wk) (days || []).forEach(d => {
      const lifts = wk.lifts?.[d] || {};
      for (const l in lifts) {
        if (exerciseCategory(l) !== 'Legs') continue;
        const arr = lifts[l];
        if (!Array.isArray(arr)) continue;
        arr.forEach(s => { if (isCompletedSet(s) && !s.isWarmup) vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); });
      }
    });
    out.push(Math.round(vol));
  }
  return out;
}

// Direction + magnitude of a series between two 1-indexed weeks.
function changeOverWindow(series, fromWeek, toWeek) {
  const a = series[fromWeek - 1] ?? 0;
  const b = series[toWeek - 1] ?? 0;
  const abs = b - a;
  const pct = a > 0 ? abs / a : (b > 0 ? 1 : 0);
  let direction = 'flat';
  if (pct >= 0.05) direction = 'up';
  else if (pct <= -0.05) direction = 'down';
  return { from: a, to: b, abs, pct, direction };
}

function driver(factor, change, unit) {
  return { factor, direction: change.direction, from: change.from, to: change.to, unit };
}

// Correlation ≠ causation → attribution confidence is capped at 'med'.
function mkAttribution(summary, drivers, points) {
  return {
    summary,
    drivers,
    confidence: points >= 5 ? 'med' : 'low',
    evidence: drivers.map(dr => ({ metric: dr.factor, value: `${dr.from}→${dr.to} ${dr.unit}` })),
  };
}

// ------------------------------------------------------------------
// ATTRIBUTION RULES — per finding type.
// ------------------------------------------------------------------
function attributeStrengthStall(f, d, over) {
  const rc = over(d.recoveryCost);
  const en = over(d.endurance);
  const leg = over(d.legVolume);
  const isLower = /squat|deadlift/i.test(f.subject || '');
  const drivers = [];
  if (rc.direction === 'up') drivers.push(driver('recovery_cost', rc, 'AU'));
  if (en.direction === 'up') drivers.push(driver('running_load', en, 'km'));
  if (isLower && leg.direction === 'up') drivers.push(driver('leg_volume', leg, 'kg'));
  if (drivers.length === 0) return null;

  let summary;
  if (isLower && (en.direction === 'up' || leg.direction === 'up')) {
    summary = 'coincides with increased lower-body recovery demand (running and/or leg volume rose over the same period)';
  } else if (rc.direction === 'up') {
    summary = 'coincides with rising overall recovery demand over the same period';
  } else {
    summary = 'coincides with increased training stress over the same period';
  }
  return mkAttribution(summary, drivers, f.dataPoints);
}

function attributeRunningLoad(f, d, over, spike = false) {
  const hard = over(d.hardRun);
  const dist = over(d.endurance);
  if (hard.direction === 'up' && hard.to > 0) {
    const summary = spike
      ? 'this week’s jump was concentrated in harder, higher-intensity running'
      : 'appears driven largely by an increase in harder, higher-intensity (threshold/interval) running';
    return mkAttribution(summary, [driver('hard_running_min', hard, 'min')], f.dataPoints);
  }
  const summary = spike
    ? 'this week’s jump came mostly from additional easy-volume running'
    : 'appears driven mostly by additional easy-volume running';
  return mkAttribution(summary, [driver('running_distance', dist, 'km')], f.dataPoints);
}

function attributeConsistency(f, d, over) {
  const freq = over(d.activeDays);
  if (f.direction === 'up' && freq.direction === 'down') {
    return mkAttribution('improved after reducing weekly training frequency', [driver('weekly_frequency', freq, 'days')], f.dataPoints);
  }
  if (f.direction === 'up' && freq.direction === 'up') {
    return mkAttribution('improved alongside higher weekly training frequency', [driver('weekly_frequency', freq, 'days')], f.dataPoints);
  }
  if (f.direction === 'down' && freq.direction === 'up') {
    return mkAttribution('slipped as weekly training frequency rose', [driver('weekly_frequency', freq, 'days')], f.dataPoints);
  }
  return null;
}

function buildDrivers(state, days, maxWeek) {
  return {
    recoveryCost: recoveryCostSeries(state, days, maxWeek),
    endurance: enduranceLoadSeries(state, days, maxWeek),
    hardRun: highIntensityRunSeries(state, days, maxWeek),
    activeDays: activeDaySeries(state, days, maxWeek),
    legVolume: lowerBodyVolumeSeries(state, days, maxWeek),
  };
}

function attributeFinding(f, d) {
  const w = f.window;
  if (!w || w.fromWeek == null || w.toWeek == null) return null;
  const over = (series) => changeOverWindow(series, w.fromWeek, w.toWeek);

  if ((f.type === FINDING_TYPES.E1RM_TREND && f.direction === 'down') || f.type === FINDING_TYPES.PLATEAU) {
    return attributeStrengthStall(f, d, over);
  }
  if (f.type === FINDING_TYPES.LOAD_TREND && f.direction === 'up') {
    return attributeRunningLoad(f, d, over, false);
  }
  if (f.type === FINDING_TYPES.LOAD_SPIKE) {
    return attributeRunningLoad(f, d, over, true);
  }
  if (f.type === FINDING_TYPES.CONSISTENCY && f.subject === 'trend') {
    return attributeConsistency(f, d, over);
  }
  return null;
}

// Enrich findings with `.attribution` where a concurrent driver explains them.
export function attributeFindings(findings, state, ctx = {}) {
  const days = ctx.days || DEFAULT_DAYS;
  const maxWeek = ctx.maxWeek || 12;
  const drivers = buildDrivers(state, days, maxWeek);
  return (findings || []).map(f => {
    const a = attributeFinding(f, drivers);
    return a ? { ...f, attribution: a } : f;
  });
}

// ------------------------------------------------------------------
// INTERFERENCE — elevated recovery demand jointly driven by strength + endurance.
// ------------------------------------------------------------------
export function detectInterference(state, ctx = {}) {
  const days = ctx.days || DEFAULT_DAYS;
  const maxWeek = ctx.maxWeek || 12;
  const currentWeek = ctx.currentWeek || state?.currentWeek || '1';
  const cw = parseInt(currentWeek, 10) || 1;
  const idx = cw - 1;

  const breakdown = recoveryCostBreakdown(state, days, maxWeek);
  const series = recoveryCostSeries(state, days, maxWeek);
  const strengthCost = breakdown.strength[idx] || 0;
  const enduranceCost = breakdown.endurance[idx] || 0;
  const total = strengthCost + enduranceCost;
  if (total <= 0) return null;

  const readiness = computeReadiness(series, currentWeek);
  if (!readiness.hasData) return null;

  const strengthShare = strengthCost / total;
  const enduranceShare = enduranceCost / total;
  const combined = strengthShare >= 0.3 && enduranceShare >= 0.3;
  const elevated = readiness.acwr >= 1.3 || (readiness.chronic > 0 && total > readiness.chronic * 1.3);
  if (!combined || !elevated) return null;

  const severity = Math.max(0.5, clamp01((readiness.acwr - 1.0) / 0.6));
  return makeFinding({
    engine: ENGINES.RECOVERY, domain: DOMAINS.RECOVERY, type: FINDING_TYPES.INTERFERENCE,
    subject: 'combined', direction: 'up', magnitude: Math.round(readiness.acwr * 100) / 100, unit: 'ACWR',
    window: { toWeek: cw },
    evidence: [
      { metric: 'strength_cost',  value: Math.round(strengthCost) },
      { metric: 'endurance_cost', value: Math.round(enduranceCost) },
      { metric: 'acwr',           value: Math.round(readiness.acwr * 100) / 100 },
    ],
    dataPoints: series.filter(v => v > 0).length,
    severity,
  });
}
