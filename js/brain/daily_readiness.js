// ==========================================
// HYBRID BRAIN — DAILY READINESS (daily_readiness.js)
// ------------------------------------------
// Produces a session-level readiness brief by comparing yesterday's training
// fatigue (lifting patterns + run) against today's programmed session via the
// exercise carryover model. This is where the carryover metadata in
// exercise_metadata.js is used for the first time in the fatigue path.
//
// generateDailyBrief(appState, opts) → DailyBrief
//   { status, headline, directive, patternIssues[], adjustments[],
//     hasData, sessionLogged }
//
// Pure module. Safe under `node --test`.
// ==========================================
import { computeSessionFatigue } from './session_fatigue.js';
import { getExerciseMetadata, MOVEMENT_PATTERNS as PAT } from './exercise_metadata.js';
import { dayLiftEntries, getDayV2 } from '../schema.js';
import { isCompletedSet, parseDurationToMinutes } from '../engine.js';

const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Pattern-to-pattern carryover coefficients: yesterday's pattern fatigue
// bleeds into today's pattern recovery at these fractions.
// Based on shared primary muscle groups and CNS demand.
const PATTERN_CARRYOVER = Object.freeze({
  [PAT.SQUAT]:   { [PAT.HINGE]: 0.4, [PAT.LUNGE]: 0.5 },
  [PAT.HINGE]:   { [PAT.SQUAT]: 0.4, [PAT.LUNGE]: 0.3 },
  [PAT.LUNGE]:   { [PAT.SQUAT]: 0.4, [PAT.HINGE]: 0.3 },
  [PAT.H_PUSH]:  { [PAT.V_PUSH]: 0.3 },
  [PAT.V_PUSH]:  { [PAT.H_PUSH]: 0.3 },
  [PAT.H_PULL]:  { [PAT.V_PULL]: 0.3 },
  [PAT.V_PULL]:  { [PAT.H_PULL]: 0.3 },
});

// Human-readable pattern names for the brief copy.
const PATTERN_NAMES = Object.freeze({
  [PAT.SQUAT]:      'Squat',
  [PAT.HINGE]:      'Hinge / Deadlift',
  [PAT.LUNGE]:      'Lunge / Split Squat',
  [PAT.H_PUSH]:     'Horizontal Push',
  [PAT.V_PUSH]:     'Vertical Push',
  [PAT.H_PULL]:     'Horizontal Pull',
  [PAT.V_PULL]:     'Vertical Pull',
  [PAT.ISOLATION]:  'Accessories',
  [PAT.CORE]:       'Core',
});

// ── Run fatigue: maps distance + RPE to a pattern-level lower-body impact ─────

function runFatigueImpact(run) {
  const dist = parseFloat(run?.dist) || 0;
  const rpe  = parseInt(run?.rpe, 10) || 0;
  const mins = parseDurationToMinutes(run?.time || '');

  if (dist <= 0 && mins <= 0) return {};

  // Classify the run intensity
  const isHard = rpe >= 8 || dist > 18 || mins > 100;
  const isMed  = rpe >= 6 || dist > 10 || mins > 55;

  if (isHard) {
    return { [PAT.SQUAT]: 4, [PAT.HINGE]: 3, [PAT.LUNGE]: 4 };
  }
  if (isMed) {
    return { [PAT.SQUAT]: 2, [PAT.HINGE]: 2, [PAT.LUNGE]: 2 };
  }
  return { [PAT.SQUAT]: 1, [PAT.HINGE]: 1, [PAT.LUNGE]: 1 };
}

// ── Effective pattern fatigue for today ───────────────────────────────────────

function computeEffectivePatternFatigue(prevByPattern, prevRunFatigue) {
  // Merge direct + run-induced pattern fatigue from yesterday
  const direct = { ...prevByPattern };
  for (const [pat, val] of Object.entries(prevRunFatigue)) {
    direct[pat] = (direct[pat] || 0) + val;
  }

  // Apply cross-pattern carryover
  const effective = { ...direct };
  for (const [srcPat, srcSets] of Object.entries(direct)) {
    const xfer = PATTERN_CARRYOVER[srcPat] || {};
    for (const [tgtPat, coeff] of Object.entries(xfer)) {
      effective[tgtPat] = (effective[tgtPat] || 0) + srcSets * coeff;
    }
  }

  return effective;
}

// ── Today's planned patterns from the program ─────────────────────────────────

function plannedPatternsForDay(program, week, dayKey) {
  const dayResult = getDayV2(program, week, dayKey);
  if (!dayResult?.day) return [];
  const entries = dayLiftEntries(dayResult.day);
  return entries.map(e => {
    const m = getExerciseMetadata(e.name || '');
    return { name: e.name, pattern: m.pattern, sets: e.sets || 3 };
  });
}

// ── Conflict detection ────────────────────────────────────────────────────────

// Fatigue thresholds (effective set-equivalents, cross-pattern weighted)
const THRESHOLD_HIGH = 5.5;  // ≥ this: significant recovery needed
const THRESHOLD_MOD  = 2.5;  // ≥ this: moderate impact

function patternFatigueBand(effectiveSets) {
  if (effectiveSets >= THRESHOLD_HIGH) return 'high';
  if (effectiveSets >= THRESHOLD_MOD)  return 'moderate';
  return 'low';
}

function findConflicts(effectiveFatigue, planned) {
  const conflicts = [];
  const seen = new Set();

  for (const { name, pattern, sets } of planned) {
    if (!pattern || seen.has(pattern)) continue;
    seen.add(pattern);

    const eff   = effectiveFatigue[pattern] || 0;
    const band  = patternFatigueBand(eff);
    if (band === 'low') continue;

    const label = PATTERN_NAMES[pattern] || pattern;
    if (band === 'high') {
      conflicts.push({
        pattern, band, label,
        adjustment: `Reduce ${label} working sets by 30–40%${sets > 2 ? ` (from ${sets} → ${Math.max(1, sets - 2)})` : ''}, or swap to a lower-demand alternative`,
      });
    } else {
      conflicts.push({
        pattern, band, label,
        adjustment: `Reduce ${label} working sets by 1–2 — recovery is moderate from yesterday`,
      });
    }
  }
  return conflicts;
}

// ── Session logged check ──────────────────────────────────────────────────────

function sessionIsLogged(weekData, day) {
  const run  = parseFloat(weekData?.runs?.[day]?.dist) || 0;
  const lifts = weekData?.lifts?.[day] || {};
  for (const l in lifts) {
    if (Array.isArray(lifts[l]) && lifts[l].some(s => isCompletedSet(s))) return true;
  }
  return run > 0;
}

// ── Health Connect signal modifiers ───────────────────────────────────────────

// Sleep deprivation degrades both neuromuscular output and movement quality.
// Short sleep amplifies effective pattern fatigue so the conflict threshold is
// reached sooner; 8+ h sleep slightly attenuates the impact.
function sleepFatigueScale(healthData) {
  const hours = healthData?.sleepHours || 0;
  if (hours <= 0) return 1.0;
  if (hours < 5)  return 1.35;
  if (hours < 6)  return 1.20;
  if (hours < 7)  return 1.10;
  if (hours >= 8) return 0.92;
  return 1.0;
}

// Elevated resting HR is a sympathetic nervous system proxy for systemic
// stress. >10 bpm above a notional 55 bpm baseline raises the fatigue scale.
function rhrFatigueScale(healthData) {
  const rhr = healthData?.restingHeartRate || 0;
  if (rhr <= 0)  return 1.0;
  if (rhr > 75)  return 1.20;
  if (rhr > 68)  return 1.10;
  if (rhr > 62)  return 1.05;
  return 1.0;
}

// HRV-RMSSD is a parasympathetic recovery proxy. Low HRV signals incomplete
// autonomic recovery; high HRV signals readiness. Missing data → no effect.
function hrvFatigueScale(healthData) {
  const hrv = healthData?.hrvMs || 0;
  if (hrv <= 0)  return 1.0;  // no data — leave existing scales unchanged
  if (hrv < 20)  return 1.15; // very suppressed: amplify fatigue
  if (hrv < 35)  return 1.07; // below-normal range
  if (hrv > 60)  return 0.95; // elevated: attenuate fatigue
  return 1.0;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateDailyBrief(appState, opts = {}) {
  const days        = opts.days        || DEFAULT_DAYS;
  const selectedDay = opts.selectedDay || 'mon';
  const program     = opts.program     || null;
  const currentWeek = opts.currentWeek || appState?.currentWeek || '1';

  const weekData    = appState?.weeks?.[String(currentWeek)] || {};
  const logged      = sessionIsLogged(weekData, selectedDay);

  // Find yesterday's day key
  const dayIdx   = days.indexOf(selectedDay);
  const prevIdx  = (dayIdx - 1 + days.length) % days.length;
  const prevDay  = days[prevIdx];

  const prevLifts = weekData?.lifts?.[prevDay] || {};
  const prevRun   = weekData?.runs?.[prevDay];
  const prevRpe   = parseInt(weekData?.gymRpe?.[prevDay], 10) || 0;

  const prevHadLifts = Object.values(prevLifts).some(arr =>
    Array.isArray(arr) && arr.some(s => isCompletedSet(s)));
  const prevHadRun   = (parseFloat(prevRun?.dist) || 0) > 0;
  const prevHadSession = prevHadLifts || prevHadRun;

  if (!prevHadSession) {
    return {
      status: 'fresh', headline: 'Rest day yesterday — you\'re fresh.',
      directive: null, patternIssues: [], adjustments: [],
      hasData: false, sessionLogged: logged,
    };
  }

  // Compute yesterday's fatigue
  const prevFatigue   = computeSessionFatigue(prevLifts);
  const runImpact     = runFatigueImpact(prevRun);

  // RPE modifier: high session RPE amplifies pattern fatigue
  const rpeScale = prevRpe >= 9 ? 1.3 : prevRpe >= 7 ? 1.1 : 1.0;

  // Health Connect modifiers: short sleep and elevated RHR raise the effective
  // fatigue so the conflict threshold is reached at lower raw volumes.
  const healthData  = appState?.health;
  const healthScale = sleepFatigueScale(healthData) * rhrFatigueScale(healthData) * hrvFatigueScale(healthData);
  const combinedScale = rpeScale * healthScale;

  const scaledByPattern = Object.fromEntries(
    Object.entries(prevFatigue.byPattern).map(([k, v]) => [k, v * combinedScale])
  );

  const effectiveFatigue = computeEffectivePatternFatigue(scaledByPattern, runImpact);

  // Today's planned work
  const planned  = program ? plannedPatternsForDay(program, currentWeek, selectedDay) : [];
  const conflicts = findConflicts(effectiveFatigue, planned);

  // Overall status
  const worstBand = conflicts.some(c => c.band === 'high')   ? 'high'
                  : conflicts.some(c => c.band === 'moderate') ? 'moderate'
                  : 'low';

  const status = worstBand === 'high' ? 'reduced' : worstBand === 'moderate' ? 'moderate' : 'fresh';

  // Build copy
  const prevDayLabel = selectedDay === 'mon' ? 'Sunday' : prevDay.charAt(0).toUpperCase() + prevDay.slice(1);
  let headline, directive;
  const adjustments = conflicts.map(c => c.adjustment);

  if (status === 'fresh') {
    const sessionDesc = planned.length > 0
      ? `Today's ${planned.map(p => PATTERN_NAMES[p.pattern]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(' + ')} session`
      : "Today's session";
    headline  = `${sessionDesc} is well-timed.`;
    directive = `${prevDayLabel}'s load has dissipated — movement quality and output should be at normal levels.`;
  } else if (status === 'moderate') {
    const affectedLabels = conflicts.map(c => c.label).join(' and ');
    headline  = `${affectedLabels} recovery is moderate from ${prevDayLabel}.`;
    directive = `Yesterday's session left residual fatigue in these patterns. Reduce volume slightly — don't grind through heavy sets at full load.`;
  } else {
    const highConflicts = conflicts.filter(c => c.band === 'high');
    const labels = highConflicts.map(c => c.label).join(' and ');
    headline  = `${labels} recovery is still elevated from ${prevDayLabel}.`;
    directive = `Yesterday's session was demanding. Full recovery for these patterns takes 36–48h. Either modify today's session or consider swapping to a lower-overlap movement.`;
  }

  // Fresh patterns — reassure athlete these are unaffected
  const affectedPatterns = new Set(conflicts.map(c => c.pattern));
  const freshPlanned = planned
    .filter(p => !affectedPatterns.has(p.pattern) && p.pattern !== PAT.ISOLATION)
    .map(p => PATTERN_NAMES[p.pattern])
    .filter((v, i, a) => a.indexOf(v) === i);
  if (freshPlanned.length > 0 && conflicts.length > 0) {
    adjustments.push(`${freshPlanned.join(' and ')} unaffected — proceed at full intensity`);
  }

  // Append health-driven adjustment notes when the modifiers fired.
  const sleepHours = healthData?.sleepHours || 0;
  const rhr        = healthData?.restingHeartRate || 0;
  if (sleepHours > 0 && sleepHours < 6) {
    adjustments.push(`Sleep was short last night (${sleepHours}h) — reduce overall volume and skip top-end intensity`);
  }
  if (rhr > 75) {
    adjustments.push(`Resting HR is elevated (${rhr} bpm) — keep effort below threshold today`);
  }

  return {
    status,
    headline,
    directive,
    patternIssues: conflicts,
    adjustments,
    hasData: true,
    sessionLogged: logged,
    prevDayLabel,
    prevFatigueBand: prevFatigue.band,
    healthSignals: {
      sleepHours: sleepHours || null,
      restingHeartRate: rhr || null,
    },
  };
}
