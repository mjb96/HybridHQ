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
  computeGoalAdherence,
  computeWeeklyCompletionSeries,
  computeWeeklyCaloriesSeries,
  computeRecoveryScore,
  paceSecondsPerKm,
  formatPace,
  epley1RM,
  isCompletedSet,
} from '../engine.js';
import { strengthLoadSeries, enduranceLoadSeries } from './load_models.js';
import { weeklyPaceSeries } from '../metrics/metrics-running.js';
import { weeklyE1rmByLift } from '../metrics/metrics-strength.js';
import { DOMAINS, ENGINES, FINDING_TYPES, THRESHOLDS } from './constants_brain.js';
import { weekRangeLabel } from '../dates.js';

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

// Main compound lifts we track for e1RM trends (excludes isolation work, where
// estimated-1RM is noisy and low-signal).
const TRACKED_LIFT_PATTERNS = [
  /squat/i, /bench press/i, /incline (?:db |dumbbell |barbell )?press|incline bench/i,
  /deadlift/i, /overhead press|standing .*press|\bohp\b|seated .*shoulder press/i,
  /barbell .*row|bent-?over row|pendlay/i, /pull-?up|chin-?up/i, /lat pulldown/i, /leg press/i,
];
const isTrackedLift = (name) => TRACKED_LIFT_PATTERNS.some(re => re.test(name || ''));


// Current-week descriptive rollups — the "what you did this week" base layer
// that works from a SINGLE logged week (trends need 2–3 weeks to appear).
function strengthWeekSummary(state, days, cw) {
  const wk = state?.weeks?.[String(cw)];
  if (!wk?.lifts) return null;
  let sets = 0, vol = 0;
  const sessions = new Set();
  (days || []).forEach(d => {
    const dl = wk.lifts[d] || {};
    let dayHas = false;
    for (const lift in dl) {
      const arr = dl[lift];
      if (!Array.isArray(arr)) continue;
      arr.forEach(s => { if (isCompletedSet(s) && !s.isWarmup) { sets++; vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); dayHas = true; } });
    }
    if (dayHas) sessions.add(d);
  });
  return sets > 0 ? { sessions: sessions.size, sets, vol: Math.round(vol), label: weekRangeLabel(wk.startedAt) } : null;
}

function runningWeekSummary(state, days, cw) {
  const wk = state?.weeks?.[String(cw)];
  if (!wk?.runs) return null;
  let runs = 0, dist = 0, pwTime = 0, pDist = 0, elev = 0;
  (days || []).forEach(d => {
    const r = wk.runs[d];
    if (!r) return;
    const dd = parseFloat(r.dist) || 0;
    if (dd > 0) {
      runs++; dist += dd; elev += parseFloat(r.elev) || 0;
      const p = paceSecondsPerKm(dd, r.time || '');
      if (p > 0) { pwTime += p * dd; pDist += dd; }
    }
  });
  if (runs === 0) return null;
  const avgPace = pDist > 0 ? pwTime / pDist : 0;
  return { runs, dist: Math.round(dist * 10) / 10, avgPaceFmt: avgPace > 0 ? formatPace(avgPace) : '—', elev: Math.round(elev), label: weekRangeLabel(wk.startedAt) };
}

// ------------------------------------------------------------------
// STRENGTH ENGINE — e1RM trend / plateau per main compound, volume trend,
// and a concrete weekly highlight (standout lift / new estimated-1RM best).
// ------------------------------------------------------------------
export function analyzeStrength(state, days, maxWeek, currentWeek) {
  const findings = [];
  const e1rmAll = weeklyE1rmByLift(state, days, maxWeek);

  Object.keys(e1rmAll).filter(isTrackedLift).forEach(lift => {
    const t = trend(e1rmAll[lift]);
    if (t.points < THRESHOLDS.MIN_POINTS_TREND) return;

    const evidence = [
      { metric: 'e1rm_first', value: round1(t.first) },
      { metric: 'e1rm_last',  value: round1(t.last) },
    ];
    const window = { fromWeek: t.fromWeek, toWeek: t.toWeek };

    if (t.direction === 'flat') {
      findings.push(makeFinding({
        engine: ENGINES.STRENGTH, domain: DOMAINS.STRENGTH, type: FINDING_TYPES.PLATEAU,
        subject: lift, direction: 'flat', magnitude: round1(t.pct * 100), unit: '%',
        window, evidence, dataPoints: t.points, severity: 0.5,
      }));
    } else {
      findings.push(makeFinding({
        engine: ENGINES.STRENGTH, domain: DOMAINS.STRENGTH, type: FINDING_TYPES.E1RM_TREND,
        subject: lift, direction: t.direction, magnitude: round1(t.pct * 100), unit: '%',
        window, evidence, dataPoints: t.points, severity: clamp01(Math.abs(t.pct) / 0.15),
      }));
    }
  });

  // Weekly highlight — the standout lift this week, flagged as a PR when it
  // matches the all-time estimated-1RM best. Gives the coach something concrete
  // to say even from a single logged week.
  const cw = parseInt(currentWeek ?? state?.currentWeek, 10) || 1;
  let bestLift = null, bestE = 0;
  for (const lift in e1rmAll) {
    const e = e1rmAll[lift][cw - 1] || 0;
    if (e > bestE) { bestE = e; bestLift = lift; }
  }
  if (bestLift && bestE > 0) {
    const allTime = Math.max(...e1rmAll[bestLift]);
    const isPR = bestE >= allTime - 0.5;
    findings.push(makeFinding({
      engine: ENGINES.STRENGTH, domain: DOMAINS.STRENGTH, type: FINDING_TYPES.STRENGTH_HIGHLIGHT,
      subject: bestLift, direction: isPR ? 'up' : 'flat', magnitude: Math.round(bestE), unit: 'kg',
      window: { toWeek: cw },
      evidence: [{ metric: 'e1rm', value: Math.round(bestE) }, { metric: 'is_pr', value: isPR ? 1 : 0 }],
      dataPoints: 1, severity: isPR ? 0.5 : 0.2,
    }));
  }

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

  // Single-week strength rollup (always available with logged sets).
  const sSum = strengthWeekSummary(state, days, cw);
  if (sSum) {
    findings.push(makeFinding({
      engine: ENGINES.STRENGTH, domain: DOMAINS.STRENGTH, type: FINDING_TYPES.STRENGTH_SUMMARY,
      subject: 'week', direction: null, magnitude: sSum.vol, unit: 'kg', window: { toWeek: cw },
      evidence: [{ metric: 'sessions', value: sSum.sessions }, { metric: 'sets', value: sSum.sets }, { metric: 'volume', value: sSum.vol }, { metric: 'week_label', value: sSum.label }],
      dataPoints: sSum.sessions, severity: 0.15,
    }));
  }

  return findings;
}

// ------------------------------------------------------------------
// RUNNING ENGINE — single-week rollup, pace trend, endurance-load trend, spike
// ------------------------------------------------------------------
export function analyzeRunning(state, days, maxWeek, currentWeek) {
  const findings = [];

  // Single-week running rollup (always available with a logged run) — the base
  // that makes running show up before multi-week trends exist.
  const cw = parseInt(currentWeek ?? state?.currentWeek, 10) || 1;
  const rSum = runningWeekSummary(state, days, cw);
  if (rSum) {
    findings.push(makeFinding({
      engine: ENGINES.RUNNING, domain: DOMAINS.AEROBIC, type: FINDING_TYPES.RUNNING_SUMMARY,
      subject: 'week', direction: null, magnitude: rSum.dist, unit: 'km', window: { toWeek: cw },
      evidence: [
        { metric: 'runs', value: rSum.runs }, { metric: 'dist', value: rSum.dist },
        { metric: 'avg_pace', value: rSum.avgPaceFmt }, { metric: 'elev', value: rSum.elev },
        { metric: 'week_label', value: rSum.label },
      ],
      dataPoints: rSum.runs, severity: 0.15,
    }));
  }

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
// BODY-COMP ENGINE — body-weight direction (goal-neutral).
// ------------------------------------------------------------------
export function analyzeBodyComp(state) {
  const log = (state?.bodyWeightLog || []).filter(e => e && e.date && e.weight > 0);
  if (log.length < 3) return [];
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].weight, last = sorted[sorted.length - 1].weight;
  const pct = first > 0 ? (last - first) / first : 0;
  let direction = 'flat';
  if (pct >= 0.01) direction = 'up';
  else if (pct <= -0.01) direction = 'down';
  if (direction === 'flat') return [];
  return [makeFinding({
    engine: ENGINES.BODYCOMP, domain: DOMAINS.BODYWEIGHT, type: FINDING_TYPES.BODYWEIGHT_TREND,
    subject: 'bodyweight', direction, magnitude: round1(last - first), unit: 'kg',
    window: { fromDate: sorted[0].date, toDate: sorted[sorted.length - 1].date },
    evidence: [{ metric: 'bw_first', value: first }, { metric: 'bw_last', value: last }],
    dataPoints: sorted.length, severity: clamp01(Math.abs(pct) / 0.05),
  })];
}

// ------------------------------------------------------------------
// FUEL ENGINE — weekly active-calorie trend.
// ------------------------------------------------------------------
export function analyzeFuel(state, days, maxWeek) {
  const t = trend(computeWeeklyCaloriesSeries(state, days, maxWeek));
  if (t.points < THRESHOLDS.MIN_POINTS_LOW || !t.direction || t.direction === 'flat') return [];
  return [makeFinding({
    engine: ENGINES.FUEL, domain: DOMAINS.FUEL, type: FINDING_TYPES.FUEL_TREND,
    subject: 'global', direction: t.direction, magnitude: round1(t.pct * 100), unit: '%',
    window: { fromWeek: t.fromWeek, toWeek: t.toWeek },
    evidence: [{ metric: 'cals_first', value: t.first }, { metric: 'cals_last', value: t.last }],
    dataPoints: t.points, severity: clamp01(Math.abs(t.pct) / 0.4),
  })];
}

// ------------------------------------------------------------------
// RECOVERY ENGINE — current recovery-status snapshot (RPE + rest blend).
// ------------------------------------------------------------------
export function analyzeRecovery(state, days) {
  const r = computeRecoveryScore(state, days);
  if (!r.hasData) return [];
  let direction = 'flat', severity = 0.3;
  if (r.score < 40) { direction = 'down'; severity = 0.8; }
  else if (r.score >= 75) { direction = 'up'; severity = 0.3; }
  return [makeFinding({
    engine: ENGINES.RECOVERY, domain: DOMAINS.RECOVERY, type: FINDING_TYPES.RECOVERY_STATUS,
    subject: 'global', direction, magnitude: r.score, unit: '%',
    window: { toWeek: parseInt(state?.currentWeek, 10) || 1 },
    evidence: [
      { metric: 'fatigue', value: r.fatigueScore },
      { metric: 'rest',    value: r.restScore },
      { metric: 'avg_rpe', value: Math.round(r.avgRpe * 10) / 10 },
    ],
    dataPoints: r.activeDays || 1, severity,
  })];
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
    ...analyzeStrength(state, days, maxWeek, currentWeek),
    ...analyzeRunning(state, days, maxWeek, currentWeek),
    ...analyzeAdherence(state, program, days, currentWeek, maxWeek),
    ...analyzeBodyComp(state),
    ...analyzeFuel(state, days, maxWeek),
    ...analyzeRecovery(state, days),
  ];
}
