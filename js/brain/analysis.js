// ==========================================
// HYBRID BRAIN — ANALYSIS ENGINES (analysis.js)
// ------------------------------------------
// Layer 2: turn data into objective FINDINGS (not athlete-facing). Three MVP
// engines — strength progression, running progression, adherence — each reuses
// engine.js / load_models.js calculations and adds no duplicate aggregation.
//
// A Finding is a machine-derived fact with evidence + a sample size; the
// insight layer (next step) interprets it into coach-facing language.
// Pure module: safe under `node --test`.
// ==========================================
import {
  computeBig3Progression,
  computeGoalAdherence,
  computeWeeklyCompletionSeries,
  paceSecondsPerKm,
} from '../engine.js';
import { strengthLoadSeries, enduranceLoadSeries } from './load_models.js';
import { DOMAINS, ENGINES, FINDING_TYPES, THRESHOLDS } from './constants_brain.js';

const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const round1 = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------
// Finding factory + a small trend helper over a weekly numeric series
// (index 0 = week 1). Zero entries are treated as "not logged" gaps.
// ------------------------------------------------------------------
export function makeFinding(p) {
  return {
    id:        `${p.engine}.${p.type}${p.subject ? ':' + p.subject : ''}`,
    engine:    p.engine,
    domain:    p.domain,
    type:      p.type,
    subject:   p.subject ?? null,
    direction: p.direction ?? null,
    magnitude: p.magnitude ?? null,
    unit:      p.unit ?? null,
    window:    p.window ?? null,
    evidence:  p.evidence ?? [],
    dataPoints: p.dataPoints ?? 0,
    severity:  clamp01(p.severity ?? 0),
  };
}

function trend(series, flat = THRESHOLDS.TREND_FLAT_PCT) {
  const pts = [];
  (series || []).forEach((v, i) => { if (v > 0) pts.push({ i, v }); });
  if (pts.length < 2) {
    return { points: pts.length, direction: null, pct: 0, first: null, last: null };
  }
  const first = pts[0].v, last = pts[pts.length - 1].v;
  const pct = first > 0 ? (last - first) / first : 0;
  let direction = 'flat';
  if (pct >= flat) direction = 'up';
  else if (pct <= -flat) direction = 'down';
  return {
    points: pts.length, direction, pct, first, last,
    fromWeek: pts[0].i + 1, toWeek: pts[pts.length - 1].i + 1,
  };
}

function weeklyPaceSeries(state, days, maxWeek) {
  const out = [];
  for (let w = 1; w <= maxWeek; w++) {
    const wk = state?.weeks?.[String(w)];
    let totTime = 0, totDist = 0;
    if (wk) (days || []).forEach(d => {
      const r = wk.runs?.[d]; if (!r) return;
      const dist = parseFloat(r.dist) || 0;
      const pace = paceSecondsPerKm(dist, r.time || '');
      if (dist > 0 && pace > 0) { totTime += pace * dist; totDist += dist; }
    });
    out.push(totDist > 0 ? totTime / totDist : 0);
  }
  return out;
}

// ------------------------------------------------------------------
// STRENGTH ENGINE — e1RM trend / plateau per big-3 lift + volume trend
// ------------------------------------------------------------------
export function analyzeStrength(state, days, maxWeek) {
  const findings = [];
  const prog = computeBig3Progression(state);
  const lifts = [['squat', 'Squat'], ['bench', 'Bench Press'], ['deadlift', 'Deadlift']];

  lifts.forEach(([key, label]) => {
    const series = [];
    for (let w = 1; w <= maxWeek; w++) series.push(prog[key]?.byWeek?.[String(w)] || 0);
    const t = trend(series);
    if (t.points < THRESHOLDS.MIN_POINTS_TREND) return;

    const evidence = [
      { metric: 'e1rm_first', value: round1(t.first) },
      { metric: 'e1rm_last',  value: round1(t.last) },
    ];
    const window = { fromWeek: t.fromWeek, toWeek: t.toWeek };

    if (t.direction === 'flat') {
      findings.push(makeFinding({
        engine: ENGINES.STRENGTH, domain: DOMAINS.STRENGTH, type: FINDING_TYPES.PLATEAU,
        subject: label, direction: 'flat', magnitude: round1(t.pct * 100), unit: '%',
        window, evidence, dataPoints: t.points, severity: 0.5,
      }));
    } else {
      findings.push(makeFinding({
        engine: ENGINES.STRENGTH, domain: DOMAINS.STRENGTH, type: FINDING_TYPES.E1RM_TREND,
        subject: label, direction: t.direction, magnitude: round1(t.pct * 100), unit: '%',
        window, evidence, dataPoints: t.points, severity: clamp01(Math.abs(t.pct) / 0.15),
      }));
    }
  });

  const vt = trend(strengthLoadSeries(state, days, maxWeek));
  if (vt.points >= THRESHOLDS.MIN_POINTS_LOW && vt.direction && vt.direction !== 'flat') {
    findings.push(makeFinding({
      engine: ENGINES.STRENGTH, domain: DOMAINS.STRENGTH, type: FINDING_TYPES.VOLUME_TREND,
      subject: 'global', direction: vt.direction, magnitude: round1(vt.pct * 100), unit: '%',
      window: { fromWeek: vt.fromWeek, toWeek: vt.toWeek },
      evidence: [{ metric: 'vol_first', value: vt.first }, { metric: 'vol_last', value: vt.last }],
      dataPoints: vt.points, severity: clamp01(Math.abs(vt.pct) / 0.3),
    }));
  }
  return findings;
}

// ------------------------------------------------------------------
// RUNNING ENGINE — pace trend, endurance-load trend, load spike
// ------------------------------------------------------------------
export function analyzeRunning(state, days, maxWeek) {
  const findings = [];

  const pace = weeklyPaceSeries(state, days, maxWeek);
  const pt = trend(pace);
  if (pt.points >= THRESHOLDS.MIN_POINTS_TREND && pt.direction && pt.direction !== 'flat') {
    const deltaSec = round1(pt.last - pt.first); // negative = faster
    findings.push(makeFinding({
      engine: ENGINES.RUNNING, domain: DOMAINS.AEROBIC, type: FINDING_TYPES.PACE_TREND,
      subject: 'run', direction: pt.direction, magnitude: deltaSec, unit: 'sec/km',
      window: { fromWeek: pt.fromWeek, toWeek: pt.toWeek },
      evidence: [{ metric: 'pace_first', value: round1(pt.first) }, { metric: 'pace_last', value: round1(pt.last) }],
      dataPoints: pt.points, severity: clamp01(Math.abs(deltaSec) / 15),
    }));
  }

  const dist = enduranceLoadSeries(state, days, maxWeek);
  const dt = trend(dist);
  if (dt.points >= THRESHOLDS.MIN_POINTS_LOW && dt.direction && dt.direction !== 'flat') {
    findings.push(makeFinding({
      engine: ENGINES.RUNNING, domain: DOMAINS.AEROBIC, type: FINDING_TYPES.LOAD_TREND,
      subject: 'run', direction: dt.direction, magnitude: round1(dt.pct * 100), unit: '%',
      window: { fromWeek: dt.fromWeek, toWeek: dt.toWeek },
      evidence: [{ metric: 'dist_first', value: dt.first }, { metric: 'dist_last', value: dt.last }],
      dataPoints: dt.points, severity: clamp01(Math.abs(dt.pct) / 0.4),
    }));
  }

  const dpts = [];
  dist.forEach((v, i) => { if (v > 0) dpts.push({ i, v }); });
  if (dpts.length >= 2) {
    const prev = dpts[dpts.length - 2].v, last = dpts[dpts.length - 1].v;
    const jump = prev > 0 ? (last - prev) / prev : 0;
    if (jump >= THRESHOLDS.LOAD_SPIKE_JUMP) {
      findings.push(makeFinding({
        engine: ENGINES.RUNNING, domain: DOMAINS.AEROBIC, type: FINDING_TYPES.LOAD_SPIKE,
        subject: 'run', direction: 'up', magnitude: round1(jump * 100), unit: '%',
        window: { fromWeek: dpts[dpts.length - 2].i + 1, toWeek: dpts[dpts.length - 1].i + 1 },
        evidence: [{ metric: 'dist_prev', value: prev }, { metric: 'dist_last', value: last }],
        dataPoints: dpts.length, severity: clamp01(jump),
      }));
    }
  }
  return findings;
}

// ------------------------------------------------------------------
// ADHERENCE ENGINE — overall completion + completion trend
// ------------------------------------------------------------------
export function analyzeAdherence(state, program, days, currentWeek, maxWeek) {
  const findings = [];

  const a = computeGoalAdherence(state, program, days, currentWeek);
  if (a.total > 0) {
    findings.push(makeFinding({
      engine: ENGINES.ADHERENCE, domain: DOMAINS.ADHERENCE, type: FINDING_TYPES.CONSISTENCY,
      subject: 'global', direction: null, magnitude: a.pct, unit: '%',
      window: { toWeek: a.elapsedWeeks },
      evidence: [{ metric: 'done', value: a.done }, { metric: 'total', value: a.total }],
      dataPoints: a.elapsedWeeks, severity: clamp01((100 - a.pct) / 100),
    }));
  }

  const ct = trend(computeWeeklyCompletionSeries(state, program, days, maxWeek));
  if (ct.points >= THRESHOLDS.MIN_POINTS_LOW && ct.direction && ct.direction !== 'flat') {
    findings.push(makeFinding({
      engine: ENGINES.ADHERENCE, domain: DOMAINS.ADHERENCE, type: FINDING_TYPES.CONSISTENCY,
      subject: 'trend', direction: ct.direction, magnitude: round1(ct.pct * 100), unit: '%',
      window: { fromWeek: ct.fromWeek, toWeek: ct.toWeek },
      evidence: [{ metric: 'completion_first', value: ct.first }, { metric: 'completion_last', value: ct.last }],
      dataPoints: ct.points, severity: clamp01(Math.abs(ct.pct) / 0.5),
    }));
  }
  return findings;
}

// ------------------------------------------------------------------
// ORCHESTRATION — run every engine, return the combined Finding list.
// ------------------------------------------------------------------
export function runAnalysis(state, ctx = {}) {
  const days = ctx.days || DEFAULT_DAYS;
  const maxWeek = ctx.maxWeek || 12;
  const currentWeek = ctx.currentWeek || state?.currentWeek || '1';
  const program = ctx.program || null;
  return [
    ...analyzeStrength(state, days, maxWeek),
    ...analyzeRunning(state, days, maxWeek),
    ...analyzeAdherence(state, program, days, currentWeek, maxWeek),
  ];
}
