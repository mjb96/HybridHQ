// ==========================================
// HYBRID BRAIN — TRADEOFF RESOLUTION (tradeoffs.js)
// ------------------------------------------
// Produces specific, goal-aware tradeoff directives from a Finding +
// Attribution pair. This is the layer that converts "watch out" into
// "cut THIS, keep THAT — here is why."
//
// Called from insights.js toInsight() after attribution is attached.
// Goal-aware output always overrides the generic template default.
//
// Pure module. Safe under `node --test`.
// ==========================================
import { PHASES, GOAL_TYPES } from './weekly_brief.js';

// ctx: { goalConfig, phase, strengthLoad, enduranceLoad, acwr }
export function resolveTradeoff(finding, attribution, ctx = {}) {
  const { goalConfig = {}, phase, strengthLoad = 0, enduranceLoad = 0 } = ctx;
  const { primaryGoal } = goalConfig;

  const drivers = attribution?.drivers || [];
  const hasRunDriver = drivers.some(d =>
    ['running_load', 'hard_running_min', 'running_distance'].includes(d.factor));

  const type = finding?.type;
  const dir  = finding?.direction;
  const dom  = finding?.domain;
  const subj = finding?.subject;

  // ── Strength stall / plateau + running is the concurrent driver ────────────
  const isStrengthStall = (type === 'e1rm_trend' && dir === 'down') || type === 'plateau';
  if (isStrengthStall && hasRunDriver) {
    if (!primaryGoal || primaryGoal === GOAL_TYPES.STRENGTH) {
      return `Strength is the priority — reduce running load by 15–20% for 1–2 weeks to give ${subj || 'this lift'} recovery room. Running fitness rebuilds faster than strength.`;
    }
    if (primaryGoal === GOAL_TYPES.ENDURANCE) {
      if (phase === PHASES.PEAK || phase === PHASES.TAPER) {
        return `Near your goal event, strength stalls are acceptable. Cut lifting to maintenance frequency (1–2 sessions/week) — don't chase strength progress this close to your race.`;
      }
      return `Expected tension: endurance goal means running takes priority. Keep running; reduce ${subj || 'this lift'} to 2x/week — the minimum dose for strength retention during an endurance build.`;
    }
    if (primaryGoal === GOAL_TYPES.HYBRID) {
      return `Reduce running intensity rather than volume: drop interval sessions, keep easy miles. This cuts recovery cost without losing aerobic base — better than reducing either modality outright.`;
    }
    if (primaryGoal === GOAL_TYPES.RECOMP) {
      return `For recomposition, protect strength over running — muscle retention demands a strength stimulus. Reduce running to 2–3 sessions/week while this lift is stalling.`;
    }
  }

  // ── Interference: both modalities high ────────────────────────────────────
  if (type === 'interference') {
    if (!primaryGoal) {
      return `Ease the modality that feels most depleted. Holding both high extends fatigue accumulation; a 3–5 day reduction in one returns load to a productive range.`;
    }
    if (primaryGoal === GOAL_TYPES.STRENGTH) {
      return `Protect lifting quality: cut running to 2 easy sessions this week (drop intervals and the long run). Strength adaptation requires fresh muscles — running is the variable to adjust.`;
    }
    if (primaryGoal === GOAL_TYPES.ENDURANCE) {
      if (phase === PHASES.PEAK || phase === PHASES.TAPER) {
        return `Running is the priority now. Reduce lifting to one full-body session — don't introduce new strength stimuli ${phase === PHASES.TAPER ? 'during the taper' : 'this close to your event'}.`;
      }
      return `Protect your key runs: cut lifting to 2 sessions max this week, no strength PRs. Running fitness is your goal — strength is maintenance only.`;
    }
    if (primaryGoal === GOAL_TYPES.HYBRID) {
      const stronger = strengthLoad >= enduranceLoad ? 'strength' : 'running';
      const weaker   = stronger === 'strength' ? 'running' : 'strength';
      return `${stronger.charAt(0).toUpperCase() + stronger.slice(1)} load is higher this week. Ease ${stronger} by 20% to restore balance, or hold ${weaker} and let one modality recover — don't push both hard simultaneously.`;
    }
    if (primaryGoal === GOAL_TYPES.RECOMP) {
      return `For recomposition, protect lifting over running. Reduce running to 2 easy sessions; maintain all strength sessions. Muscle retention requires the strength stimulus.`;
    }
  }

  // ── Running load spike + strength-priority goal ───────────────────────────
  if (type === 'load_spike' && dom === 'aerobic') {
    if (!primaryGoal || primaryGoal === GOAL_TYPES.STRENGTH) {
      return `This running spike will suppress lower-body strength recovery for 3–5 days. Hold squat and deadlift at current weights — don't chase new set maxes until load normalises.`;
    }
    if (primaryGoal === GOAL_TYPES.RECOMP) {
      return `The running spike is fine for endurance but will suppress lower-body lifting performance this week. Keep squats in but reduce working sets by 1–2.`;
    }
  }

  // ── Rising running trend + strength goal ──────────────────────────────────
  if (type === 'load_trend' && dir === 'up' && dom === 'aerobic') {
    if (primaryGoal === GOAL_TYPES.STRENGTH) {
      return `Rising running load will increasingly compress strength recovery windows. Ensure 36–48h between heavy lower-body sessions and your longest runs — or move leg day earlier in the week.`;
    }
    if (primaryGoal === GOAL_TYPES.HYBRID) {
      return `Rising running load is fine if strength is holding. If you start seeing lifts stall, it's the running accumulation — ease intervals before cutting run volume.`;
    }
  }

  // ── Strength volume falling + endurance goal ──────────────────────────────
  if (type === 'volume_trend' && dir === 'down') {
    if (primaryGoal === GOAL_TYPES.ENDURANCE) {
      return `Minimum effective dose: 2 strength sessions per week is enough to maintain muscle while running volume rises. Below that, expect muscle mass and joint resilience to regress over 4–6 weeks.`;
    }
  }

  return null;
}
