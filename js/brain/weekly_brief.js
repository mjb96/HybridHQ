// ==========================================
// HYBRID BRAIN — WEEKLY BRIEF (weekly_brief.js)
// ------------------------------------------
// Synthesises goal context, training phase, and current load state into a
// forward-looking directive for the athlete's current week.
//
// Inputs (pure — no DOM, no state mutations):
//   appState       — standard appState object
//   opts.days      — day keys to aggregate over
//   opts.program   — active program (for totalWeeks / maxWeek)
//   opts.goalConfig — { primaryGoal, goalEventDate, goalEventName }
//                    Falls back to appState.goalData.goalConfig when omitted.
//
// Returns a WeekBrief:
//   { phase, weeksToGoal, priorityModality, headline, directive,
//     adjustments[], rationale, tone, hasGoal, hasEnoughData,
//     acwr, recoveryScore, interferencePresent }
//
// Pure module. Safe under `node --test`.
// ==========================================
import { recoveryCostBalance, enduranceLoadSeries, strengthLoadSeries } from './load_models.js';
import { analyzeRecovery } from './analysis.js';
import { detectInterference } from './attribution.js';

const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const GOAL_TYPES = Object.freeze({
  STRENGTH:  'strength',
  ENDURANCE: 'endurance',
  HYBRID:    'hybrid',
  RECOMP:    'recomp',
});

export const GOAL_LABELS = Object.freeze({
  strength:  'Strength Peak',
  endurance: 'Endurance / Race',
  hybrid:    'Hybrid Performance',
  recomp:    'Body Recomposition',
});

export const PHASES = Object.freeze({
  BASE:        'Base',
  BUILD:       'Build',
  PEAK:        'Peak',
  TAPER:       'Taper',
  MAINTENANCE: 'Maintenance',
});

export const PHASE_TONES = Object.freeze({
  Base:        'progress',
  Build:       'opportunity',
  Peak:        'goal',
  Taper:       'goal',
  Maintenance: 'progress',
});

export const MODALITY = Object.freeze({
  STRENGTH:  'strength',
  ENDURANCE: 'endurance',
  BOTH:      'both',
  RECOVERY:  'recovery',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function weeksUntilDate(eventDateStr, weekStartedAt) {
  if (!eventDateStr) return null;
  const event = new Date(eventDateStr);
  if (isNaN(event.getTime())) return null;
  const ref = weekStartedAt ? new Date(weekStartedAt) : new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.ceil((event - ref) / msPerWeek);
}

export function detectPhase(weeksToGoal) {
  if (weeksToGoal === null || weeksToGoal === undefined) return PHASES.MAINTENANCE;
  if (weeksToGoal <= 0)  return PHASES.MAINTENANCE;
  if (weeksToGoal <= 2)  return PHASES.TAPER;
  if (weeksToGoal <= 6)  return PHASES.PEAK;
  if (weeksToGoal <= 14) return PHASES.BUILD;
  return PHASES.BASE;
}

function goalModalityPriority(primaryGoal, phase) {
  if (phase === PHASES.TAPER || phase === PHASES.PEAK) {
    if (primaryGoal === GOAL_TYPES.STRENGTH)  return MODALITY.STRENGTH;
    if (primaryGoal === GOAL_TYPES.ENDURANCE) return MODALITY.ENDURANCE;
    return MODALITY.BOTH;
  }
  switch (primaryGoal) {
    case GOAL_TYPES.STRENGTH:  return MODALITY.STRENGTH;
    case GOAL_TYPES.ENDURANCE: return MODALITY.ENDURANCE;
    case GOAL_TYPES.RECOMP:    return MODALITY.STRENGTH;
    default:                   return MODALITY.BOTH;
  }
}

function seriesValueAt(series, weekNum) {
  const idx = (parseInt(weekNum, 10) || 1) - 1;
  return (series && series[idx]) || 0;
}

function acwrStatus(acwr) {
  if (!acwr)       return 'unknown';
  if (acwr < 0.8)  return 'detraining';
  if (acwr <= 1.0) return 'maintaining';
  if (acwr <= 1.3) return 'productive';
  if (acwr <= 1.5) return 'overreaching';
  return 'strained';
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateWeekBrief(appState, opts = {}) {
  const days         = opts.days    || DEFAULT_DAYS;
  const program      = opts.program || null;
  const maxWeek      = opts.maxWeek || program?.totalWeeks || 12;
  const currentWeek  = opts.currentWeek || appState?.currentWeek || '1';
  const goalConfig   = opts.goalConfig  || appState?.goalData?.goalConfig || {};

  const { primaryGoal = null, goalEventDate = null, goalEventName = null } = goalConfig;
  const hasGoal = !!primaryGoal;

  const balance         = recoveryCostBalance(appState, days, currentWeek, maxWeek);
  const recoveryFindings = analyzeRecovery(appState, days);
  const recoveryScore   = recoveryFindings.length > 0 ? recoveryFindings[0].magnitude : null;

  // Health Connect signals: use sleep quality and resting HR to strengthen or
  // dampen the recovery assessment when device data is available.
  const healthData   = appState?.health;
  const sleepHours   = healthData?.sleepHours   || 0;
  const rhr          = healthData?.restingHeartRate || 0;
  const healthNotes  = [];
  if (sleepHours > 0 && sleepHours < 6) healthNotes.push(`Short sleep (${sleepHours}h)`);
  if (rhr > 0 && rhr > 70)             healthNotes.push(`Elevated RHR (${rhr} bpm)`);

  const hasEnoughData   = balance.hasData || recoveryScore !== null;

  if (!hasEnoughData) {
    return {
      phase: null, weeksToGoal: null, priorityModality: MODALITY.BOTH,
      headline: 'Log sessions to unlock your weekly brief.',
      directive: 'Your personalised week-ahead directive appears after a few logged sessions.',
      adjustments: [], rationale: null, tone: 'progress',
      hasGoal, hasEnoughData: false,
    };
  }

  const weekData     = appState?.weeks?.[String(currentWeek)];
  const weekStart    = weekData?.startedAt || appState?.weekStartedAt;
  const weeksToGoal  = goalEventDate ? weeksUntilDate(goalEventDate, weekStart) : null;
  const phase        = detectPhase(weeksToGoal);
  const priority     = goalModalityPriority(primaryGoal, phase);

  const interference = detectInterference(appState, { days, maxWeek, currentWeek });

  const acwr    = balance.hasData ? balance.acwr : null;
  const status  = acwrStatus(acwr);

  const strengthSeries  = strengthLoadSeries(appState, days, maxWeek);
  const enduranceSeries = enduranceLoadSeries(appState, days, maxWeek);
  const cwStrength   = seriesValueAt(strengthSeries,  currentWeek);
  const cwEndurance  = seriesValueAt(enduranceSeries, currentWeek);

  const acwrLabel = acwr ? `ACWR ${acwr.toFixed(2)}` : '';
  const adjustments = [];
  let headline, directive, rationale, tone;

  // ── Override: low recovery (training data or Health Connect signals) ────────
  const healthDrivenLowRecovery = healthNotes.length >= 2 && (recoveryScore === null || recoveryScore < 60);
  if ((recoveryScore !== null && recoveryScore < 40) || healthDrivenLowRecovery) {
    tone      = 'risk';
    headline  = 'Recovery is low — protect this week.';
    const scoreStr = recoveryScore !== null ? `Recovery score is ${recoveryScore}%.` : '';
    const healthStr = healthNotes.length > 0 ? ` Health signals: ${healthNotes.join(', ')}.` : '';
    directive = `${scoreStr}${healthStr} Back off intensity in both modalities and prioritise sleep and easy movement.`.trim();
    rationale = 'Training hard from a depleted base suppresses adaptation and raises injury risk.';
    adjustments.push('Replace one hard session with easy walking or complete rest');
    adjustments.push('Hold all volume increases until recovery rises above 50%');
    if (sleepHours > 0 && sleepHours < 6) adjustments.push('Aim for 8+ hours of sleep tonight before reassessing');
    return { phase, weeksToGoal, priorityModality: MODALITY.RECOVERY, headline, directive, adjustments, rationale, tone, hasGoal, hasEnoughData: true, acwr, recoveryScore, interferencePresent: !!interference, healthNotes };
  }

  // ── Taper ──────────────────────────────────────────────────────────────────
  if (phase === PHASES.TAPER) {
    const evtLabel = goalEventName || 'your goal event';
    const wText    = weeksToGoal === 1 ? 'next week' : `${weeksToGoal} weeks away`;
    tone      = 'goal';
    headline  = `Taper phase — ${evtLabel} is ${wText}.`;
    directive = 'Reduce total volume 30–40% while holding session intensity. Your fitness is built — protect it now.';
    rationale = 'Fatigue dissipates faster than fitness. Cutting volume in the final two weeks means arriving fresh without losing sharpness.';
    adjustments.push('Cut run volume ~35% but keep one quality session at race pace');
    adjustments.push('Reduce lifting volume to ~60% of your peak week; hold working weights');
    adjustments.push('Prioritise sleep, hydration, and carbohydrate intake');
  }

  // ── Peak ───────────────────────────────────────────────────────────────────
  else if (phase === PHASES.PEAK) {
    const evtLabel = goalEventName || 'your event';
    const wText    = `${weeksToGoal} week${weeksToGoal !== 1 ? 's' : ''} out`;
    tone      = 'goal';
    headline  = `Peak phase — ${wText} to ${evtLabel}.`;
    directive = 'Maintain quality over quantity. Cut junk volume; hold key sessions at competition intensity.';
    rationale = 'Peak phase is not the time for volume PRs. Specificity and freshness matter more than accumulated load.';
    if (priority === MODALITY.ENDURANCE) {
      adjustments.push('Prioritise your long run and one quality session — cut or shorten any extras');
      adjustments.push('Reduce strength to 2 sessions max; avoid heavy lower-body work within 48h of your hardest run');
    } else if (priority === MODALITY.STRENGTH) {
      adjustments.push('Keep competition lifts at working weight — no new max attempts this week');
      adjustments.push('Reduce running to maintenance only (2 easy sessions)');
    } else {
      adjustments.push('Each session must have a clear purpose — no junk volume');
      adjustments.push('Separate hardest strength and running sessions by at least 24h');
    }
    if (interference) {
      adjustments.push('Interference detected: ensure 24h between hard strength and hard run sessions');
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  else if (phase === PHASES.BUILD) {
    if (status === 'strained' || status === 'overreaching') {
      tone      = 'risk';
      headline  = `Build phase — load is elevated${acwrLabel ? ` (${acwrLabel})` : ''}.`;
      directive = 'Ease back for 3–5 days before resuming the ramp. Your body needs to absorb before it can adapt.';
      rationale = 'Sustained ACWR above 1.3 in a build phase suppresses adaptation and raises overuse injury risk.';
      if (priority === MODALITY.STRENGTH || priority === MODALITY.BOTH) {
        adjustments.push(`Reduce strength volume ~20% this week (target ≈ ${Math.round(cwStrength * 0.8).toLocaleString()} kg)`);
      }
      if (priority === MODALITY.ENDURANCE || priority === MODALITY.BOTH) {
        adjustments.push(`Reduce run distance ~20% this week (target ≈ ${Math.round(cwEndurance * 0.8 * 10) / 10} km)`);
      }
      if (interference) adjustments.push('Interference present: keep hard sessions in each modality separated by 24h');
    } else if (status === 'detraining' || status === 'maintaining') {
      tone      = 'opportunity';
      headline  = `Build phase — load has room to grow${acwrLabel ? ` (${acwrLabel})` : ''}.`;
      const goalSuffix = goalEventName ? ` for ${goalEventName}` : '';
      directive = `You are in the build window${goalSuffix}. Safe to add 5–10% load to your priority modality this week.`;
      rationale = 'An ACWR below 1.0 in a build phase means the training stimulus is not yet sufficient for the adaptation you need.';
      if (priority === MODALITY.STRENGTH) {
        adjustments.push('Add one working set to your main compound lifts, or increase load by 2.5–5 kg');
        adjustments.push('Hold running at current volume');
      } else if (priority === MODALITY.ENDURANCE) {
        const target = Math.round(cwEndurance * 1.1 * 10) / 10;
        adjustments.push(`Add ~10% to your weekly running distance (target ≈ ${target || 'increase gradually'} km)`);
        adjustments.push('Hold strength at current volume');
      } else {
        adjustments.push('Add 5–10% to whichever modality felt freshest last session');
      }
    } else {
      tone      = 'progress';
      const goalSuffix = goalEventName ? ` toward ${goalEventName}` : '';
      headline  = `Build phase — load is on track${goalSuffix}.`;
      directive = 'Training load is in the productive zone. Absorb this week before the next ramp.';
      rationale = 'ACWR in the 1.0–1.3 range balances adaptation stimulus and recovery.';
      adjustments.push('Maintain current volume — absorb before the next load increase');
      if (interference) adjustments.push('Interference present: keep hard strength and run sessions 24h apart');
    }
  }

  // ── Base ───────────────────────────────────────────────────────────────────
  else if (phase === PHASES.BASE) {
    if (status === 'strained' || status === 'overreaching') {
      tone      = 'risk';
      headline  = `Base phase — overreaching already${acwrLabel ? ` (${acwrLabel})` : ''}.`;
      directive = 'Base phase should not produce high ACWR. Reduce volume and restore aerobic base at low intensity.';
      rationale = 'Base phase builds capacity at low cost. High ACWR this early compromises the foundation for the rest of the block.';
      adjustments.push('Cut to 3–4 sessions this week — prioritise low-intensity work');
      adjustments.push('No hard intervals or max-effort lifting until ACWR drops below 1.2');
    } else {
      tone      = 'progress';
      const goalSuffix = goalEventName && weeksToGoal ? ` — ${weeksToGoal} weeks to ${goalEventName}` : '';
      headline  = `Base phase${goalSuffix}.`;
      directive = 'Build aerobic and movement base at low-to-moderate intensity. Volume over intensity here.';
      rationale = 'Base phase develops the capacity for harder work later. Consistent low-intensity volume creates the aerobic foundation.';
      if (priority === MODALITY.ENDURANCE) {
        adjustments.push('70–80% of runs at Zone 1–2 easy effort');
        adjustments.push('Lift 2–3x/week at moderate intensity — technique over load');
      } else if (priority === MODALITY.STRENGTH) {
        adjustments.push('3–4 lifting sessions at moderate intensity; establish movement patterns');
        adjustments.push('2–3 easy runs per week to build aerobic base without interference');
      } else {
        adjustments.push('Equal split between modalities; no hard efforts yet');
        adjustments.push('Build to 4–5 consistent sessions/week before adding intensity');
      }
    }
  }

  // ── Maintenance (no goal) ──────────────────────────────────────────────────
  else {
    if (status === 'strained' || status === 'overreaching') {
      tone      = 'risk';
      headline  = `Load is elevated — ease back this week${acwrLabel ? ` (${acwrLabel})` : ''}.`;
      directive = 'No goal event requires you to push through high load right now. Ease one modality and protect recovery.';
      rationale = 'Sustained high ACWR without a peaking goal accumulates fatigue without productive return.';
      if (interference && cwEndurance >= cwStrength) {
        adjustments.push(`Reduce running ~20% this week (target ≈ ${Math.round(cwEndurance * 0.8 * 10) / 10} km)`);
        adjustments.push('Hold strength at current volume');
      } else if (interference) {
        adjustments.push(`Reduce strength volume ~20% this week (target ≈ ${Math.round(cwStrength * 0.8).toLocaleString()} kg)`);
        adjustments.push('Hold running at current distance');
      } else {
        adjustments.push('Reduce either run distance or lifting volume by 15–20% this week');
      }
    } else if (!hasGoal) {
      tone      = 'progress';
      headline  = 'Set a goal to unlock a personalised weekly brief.';
      directive = acwr
        ? `Training load is ${status === 'productive' ? 'healthy' : status} (ACWR ${acwr.toFixed(2)}). Set a goal to get a tailored week-ahead directive.`
        : 'Log sessions and set a training goal to get a personalised weekly directive.';
      rationale = null;
      adjustments.push('Tap "Set Goal" to tell the Brain what you\'re training for');
    } else {
      tone      = 'progress';
      headline  = 'Maintaining — no goal event on the horizon.';
      directive = 'Load is in a sustainable range. Good time to focus on movement quality and long-term habits.';
      rationale = null;
      adjustments.push('Aim for 3–5 consistent sessions per week across both modalities');
    }
  }

  return {
    phase,
    weeksToGoal,
    priorityModality: priority,
    headline,
    directive,
    adjustments,
    rationale,
    tone,
    hasGoal,
    hasEnoughData: true,
    acwr,
    recoveryScore,
    interferencePresent: !!interference,
    healthNotes,
  };
}
