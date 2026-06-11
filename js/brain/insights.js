// ==========================================
// HYBRID BRAIN — INSIGHTS (insights.js)
// ------------------------------------------
// Layer 3+4: convert objective Findings into athlete-facing Insights, score
// confidence, and prioritise. Insights read like a coach interpreting evidence:
// every one carries Observation / Explanation / Why It Matters / Suggested
// Action / Confidence (tradeoffs reserved for a later phase — kept as null).
//
// Pure module: no DOM. Safe under `node --test`.
// ==========================================
import {
  INSIGHT_CATEGORIES as CAT,
  CONFIDENCE, CONFIDENCE_POINTS, PRIORITY_WEIGHTS,
} from './constants_brain.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ev = (f, metric) => (f.evidence.find(e => e.metric === metric) || {}).value;
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

// Goal-relevance weighting per category (placeholder until goal intelligence
// personalises this). Risks and goal items matter most for what to do next.
const RELEVANCE = { risk: 1.0, goal: 0.9, recovery: 0.8, opportunity: 0.7, progress: 0.6 };

// ------------------------------------------------------------------
// CONFIDENCE — from the sample size backing a finding.
// ------------------------------------------------------------------
export function confidenceFor(points) {
  if (points >= CONFIDENCE_POINTS.HIGH) return { score: 0.9,  level: CONFIDENCE.HIGH };
  if (points >= CONFIDENCE_POINTS.MED)  return { score: 0.65, level: CONFIDENCE.MED };
  if (points >= 2)                      return { score: 0.4,  level: CONFIDENCE.LOW };
  return { score: 0.2, level: CONFIDENCE.LOW };
}

// ------------------------------------------------------------------
// TEMPLATES — Finding → coach-facing copy + category.
// Returns null for a finding we don't narrate (e.g. flat trends).
// ------------------------------------------------------------------
function template(f) {
  const mag = f.magnitude;
  const abs = Math.abs(mag ?? 0);
  const subj = f.subject && f.subject !== 'global' && f.subject !== 'run' ? f.subject : null;

  switch (`${f.type}:${f.direction}`) {
    case 'e1rm_trend:up':
      return {
        category: CAT.PROGRESS,
        observation: `${subj} estimated 1RM is trending up (${signed(mag)}%).`,
        explanation: `Best estimated 1RM rose from ${ev(f, 'e1rm_first')} to ${ev(f, 'e1rm_last')} kg across logged sessions.`,
        whyItMatters: `A rising e1RM is the clearest sign strength is genuinely improving, not just fluctuating.`,
        suggestedAction: `Keep the current approach for this lift while it's working.`,
      };
    case 'e1rm_trend:down':
      return {
        category: CAT.RISK,
        observation: `${subj} estimated 1RM is trending down (${mag}%).`,
        explanation: `Best estimated 1RM fell from ${ev(f, 'e1rm_first')} to ${ev(f, 'e1rm_last')} kg.`,
        whyItMatters: `A sustained drop can signal accumulated fatigue, under-recovery, or reduced emphasis on this lift.`,
        suggestedAction: `Check recovery and recent volume here; consider a lighter session or a small deload.`,
      };
    case 'plateau:flat':
      return {
        category: CAT.OPPORTUNITY,
        observation: `${subj} progress appears to be plateauing.`,
        explanation: `Estimated 1RM has stayed within ~${abs}% across ${f.dataPoints} logged weeks.`,
        whyItMatters: `Plateaus are normal, but usually mean the current stimulus has stopped driving adaptation.`,
        suggestedAction: `Consider changing one variable — add a set, shift the rep range, or vary the exercise.`,
      };
    case 'volume_trend:up':
      return {
        category: CAT.PROGRESS,
        observation: `Strength training volume is increasing (${signed(mag)}%).`,
        explanation: `Weekly tonnage rose from ${ev(f, 'vol_first')} to ${ev(f, 'vol_last')} kg.`,
        whyItMatters: `Progressive volume is a primary driver of hypertrophy and work capacity.`,
        suggestedAction: `Make sure recovery keeps pace with the added volume.`,
      };
    case 'volume_trend:down':
      return {
        category: CAT.RISK,
        observation: `Strength training volume is decreasing (${mag}%).`,
        explanation: `Weekly tonnage fell from ${ev(f, 'vol_first')} to ${ev(f, 'vol_last')} kg.`,
        whyItMatters: `If unintentional, declining volume can stall strength and size gains.`,
        suggestedAction: `If this isn't a planned deload, look at what's reducing your training volume.`,
      };
    case 'pace_trend:down':
      return {
        category: CAT.PROGRESS,
        observation: `Running pace is improving (${abs} sec/km faster).`,
        explanation: `Average pace improved from ${ev(f, 'pace_first')} to ${ev(f, 'pace_last')} s/km.`,
        whyItMatters: `Faster average pace at similar effort indicates improving aerobic fitness.`,
        suggestedAction: `Maintain your easy/threshold balance — it's producing results.`,
      };
    case 'pace_trend:up':
      return {
        category: CAT.RECOVERY,
        observation: `Average running pace has slowed (${signed(mag)} sec/km).`,
        explanation: `Average pace moved from ${ev(f, 'pace_first')} to ${ev(f, 'pace_last')} s/km.`,
        whyItMatters: `Slower average pace can reflect added easy-volume running or accumulating fatigue.`,
        suggestedAction: `If effort feels high, prioritise recovery; if you've added easy miles, this is expected.`,
      };
    case 'load_trend:up':
      return {
        category: CAT.PROGRESS,
        observation: `Running load is increasing (${signed(mag)}%).`,
        explanation: `Weekly running distance rose from ${ev(f, 'dist_first')} to ${ev(f, 'dist_last')} km.`,
        whyItMatters: `Gradually building running volume develops your aerobic base.`,
        suggestedAction: `Keep the increases gradual to protect against overuse.`,
      };
    case 'load_trend:down':
      return {
        category: CAT.RECOVERY,
        observation: `Running load is decreasing (${mag}%).`,
        explanation: `Weekly running distance fell from ${ev(f, 'dist_first')} to ${ev(f, 'dist_last')} km.`,
        whyItMatters: `Reduced running can be recovery or a drop in aerobic stimulus.`,
        suggestedAction: `If unplanned, add an easy run back in to hold your aerobic base.`,
      };
    case 'load_spike:up':
      return {
        category: CAT.RISK,
        observation: `Running load increased significantly this week (${signed(mag)}%).`,
        explanation: `Weekly distance jumped from ${ev(f, 'dist_prev')} to ${ev(f, 'dist_last')} km.`,
        whyItMatters: `Sharp single-week jumps in running load are a known overuse-injury pattern.`,
        suggestedAction: `Hold or slightly reduce next week so your body can absorb the jump.`,
      };
    case 'interference:up':
      return {
        category: CAT.RISK,
        observation: `Recovery demand is elevated — driven by both strength and endurance stress.`,
        explanation: `This week pairs heavy lifting load (${ev(f, 'strength_cost')} AU) with high running load (${ev(f, 'endurance_cost')} AU); acute:chronic load sits at ${ev(f, 'acwr')}.`,
        whyItMatters: `Pushing strength and endurance hard at once raises systemic fatigue faster than either alone — where interference and overuse risk concentrate.`,
        suggestedAction: `Ease one side for a few days: keep the priority quality session and make the other easy or short.`,
        tradeoffs: `Holding both high can stall progress in both; easing endurance protects strength recovery, and vice-versa.`,
      };
    case 'bodyweight_trend:up':
      return {
        category: CAT.PROGRESS,
        observation: `Body weight is trending up (${signed(mag)} kg).`,
        explanation: `From ${ev(f, 'bw_first')} to ${ev(f, 'bw_last')} kg across your recent logs.`,
        whyItMatters: `Weight direction tells you whether you're gaining, maintaining or losing — key context for strength and running changes.`,
        suggestedAction: `Check the trend matches your current goal (gain / maintain / cut).`,
      };
    case 'bodyweight_trend:down':
      return {
        category: CAT.PROGRESS,
        observation: `Body weight is trending down (${mag} kg).`,
        explanation: `From ${ev(f, 'bw_first')} to ${ev(f, 'bw_last')} kg across your recent logs.`,
        whyItMatters: `Weight direction tells you whether you're gaining, maintaining or losing — key context for strength and running changes.`,
        suggestedAction: `Check the trend matches your current goal (gain / maintain / cut).`,
      };
    case 'fuel_trend:up':
      return {
        category: CAT.PROGRESS,
        observation: `Active calorie burn is increasing (${signed(mag)}%).`,
        explanation: `Weekly active calories rose from ${ev(f, 'cals_first')} to ${ev(f, 'cals_last')} kcal.`,
        whyItMatters: `Higher energy expenditure raises your fuelling needs to sustain training and recovery.`,
        suggestedAction: `If weight or performance is dropping, make sure intake keeps up.`,
      };
    case 'fuel_trend:down':
      return {
        category: CAT.RECOVERY,
        observation: `Active calorie burn is decreasing (${mag}%).`,
        explanation: `Weekly active calories fell from ${ev(f, 'cals_first')} to ${ev(f, 'cals_last')} kcal.`,
        whyItMatters: `Lower output often just means a lighter training week — fine if intentional.`,
        suggestedAction: `If unplanned, check whether training volume has quietly dropped.`,
      };
    default:
      break;
  }

  // Adherence (consistency) — split by subject (overall snapshot vs trend).
  if (f.type === 'consistency' && f.subject === 'global') {
    const pct = mag;
    const action = pct >= 85 ? `Excellent adherence — keep it up.`
      : pct >= 50 ? `Solid. Aim to close the gaps on missed sessions.`
      : `Adherence is low; a simpler, more repeatable plan may help.`;
    return {
      category: CAT.GOAL,
      observation: `Training consistency is ${pct}% so far.`,
      explanation: `You've completed ${ev(f, 'done')} of ${ev(f, 'total')} scheduled items.`,
      whyItMatters: `Consistency is the strongest long-term predictor of progress.`,
      suggestedAction: action,
    };
  }
  if (f.type === 'consistency' && f.subject === 'trend') {
    const up = f.direction === 'up';
    return {
      category: up ? CAT.PROGRESS : CAT.RISK,
      observation: up ? `Training consistency is improving (${signed(mag)}%).`
                      : `Training consistency is slipping (${mag}%).`,
      explanation: `Weekly completion moved from ${ev(f, 'completion_first')}% to ${ev(f, 'completion_last')}%.`,
      whyItMatters: `Direction of adherence usually precedes changes in results.`,
      suggestedAction: up ? `Keep the momentum — protect the habit.`
                          : `Identify what's getting in the way before it compounds.`,
    };
  }

  if (f.type === 'strength_highlight') {
    const isPR = (f.evidence.find(e => e.metric === 'is_pr') || {}).value === 1;
    const e = ev(f, 'e1rm');
    return isPR ? {
      category: CAT.PROGRESS,
      observation: `New estimated-1RM best on ${f.subject} — about ${e} kg. 🎉`,
      explanation: `Your best working set this week edged past your previous estimated 1RM for ${f.subject}.`,
      whyItMatters: `A fresh estimated-1RM is concrete proof the training is working.`,
      suggestedAction: `Bank it — keep progression steady rather than chasing another max right away.`,
    } : {
      category: CAT.PROGRESS,
      observation: `${f.subject} was your standout lift this week — est. 1RM about ${e} kg.`,
      explanation: `It posted the highest estimated 1RM among your logged lifts this week.`,
      whyItMatters: `Knowing your strongest movement helps you anchor the rest of the session around it.`,
      suggestedAction: `Make sure it gets your freshest effort in the session.`,
    };
  }

  if (f.type === 'strength_summary') {
    const sessions = ev(f, 'sessions');
    return {
      category: CAT.PROGRESS,
      observation: `This week: ${sessions} lifting session${sessions !== 1 ? 's' : ''} · ${ev(f, 'sets')} sets · ${Math.round(ev(f, 'volume')).toLocaleString()} kg lifted.`,
      explanation: `Your completed working sets logged so far this week.`,
      whyItMatters: `This is your current strength workload — the base the week-over-week trends build on.`,
      suggestedAction: `Keep logging; e1RM and volume trends unlock once you have a couple of weeks.`,
    };
  }

  if (f.type === 'running_summary') {
    const runs = ev(f, 'runs');
    const elev = ev(f, 'elev');
    return {
      category: CAT.PROGRESS,
      observation: `This week: ${runs} run${runs !== 1 ? 's' : ''} · ${ev(f, 'dist')} km · avg pace ${ev(f, 'avg_pace')}.`,
      explanation: `Your logged runs so far this week${elev > 0 ? `, +${elev} m elevation` : ''}.`,
      whyItMatters: `This is your current running load — pace and load trends build on it.`,
      suggestedAction: `Log a few more runs to unlock pace and load trends.`,
    };
  }

  if (f.type === 'recovery_status') {
    const score = mag;
    const detail = `Fatigue score ${ev(f, 'fatigue')}, rest score ${ev(f, 'rest')}, avg RPE ${ev(f, 'avg_rpe')} this week.`;
    if (score < 40) {
      return {
        category: CAT.RISK,
        observation: `Recovery is running low (${score}%).`,
        explanation: detail,
        whyItMatters: `Training hard from a low-recovery base raises injury risk and blunts adaptation.`,
        suggestedAction: `Prioritise sleep and an easier day or two before the next hard session.`,
      };
    }
    if (score >= 75) {
      return {
        category: CAT.PROGRESS,
        observation: `Recovery looks strong (${score}%).`,
        explanation: detail,
        whyItMatters: `A well-recovered week is when you can absorb a harder push.`,
        suggestedAction: `Good window to add intensity if your plan calls for it.`,
      };
    }
    return {
      category: CAT.RECOVERY,
      observation: `Recovery is moderate (${score}%).`,
      explanation: detail,
      whyItMatters: `You're holding a sustainable load — neither fried nor fully fresh.`,
      suggestedAction: `Stick to planned volume and keep an eye on sleep.`,
    };
  }
  return null;
}

// ------------------------------------------------------------------
// MAP — Finding → Insight (scored).
// ------------------------------------------------------------------
export function toInsight(finding, ctx = {}) {
  const t = template(finding);
  if (!t) return null;
  const conf = confidenceFor(finding.dataPoints);
  const relevance = RELEVANCE[t.category] ?? 0.6;
  const recency = recencyFor(finding.window, ctx.currentWeek);
  const W = PRIORITY_WEIGHTS;
  const priority =
    finding.severity * W.severity +
    conf.score       * W.confidence +
    relevance        * W.goalRelevance +
    recency          * W.recency;

  // Phase 2: fold causal attribution into the copy + derive a tradeoff.
  const attribution = finding.attribution || null;
  let explanation = t.explanation;
  let tradeoffs = t.tradeoffs ?? null;
  if (attribution) {
    explanation += ` ${capitalize(attribution.summary)}.`;
    if (!tradeoffs) tradeoffs = tradeoffFor(finding, attribution);
  }

  return {
    id: `insight.${finding.id}`,
    category: t.category,
    domain: finding.domain,
    surfaces: ['dashboard'],
    observation: t.observation,
    explanation,
    whyItMatters: t.whyItMatters,
    suggestedAction: t.suggestedAction,
    tradeoffs,
    attribution,
    evidence: finding.evidence || [],
    confidence: conf.level,
    confidenceScore: conf.score,
    priority: Math.round(priority * 1000) / 1000,
    findings: [finding.id],
  };
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Derive a tradeoff line when a strength stall/plateau is attributed to endurance.
function tradeoffFor(finding, attribution) {
  const runDriver = (attribution.drivers || []).some(d =>
    d.factor === 'running_load' || d.factor === 'hard_running_min' || d.factor === 'running_distance');
  const isStall = (finding.type === 'e1rm_trend' && finding.direction === 'down') || finding.type === 'plateau';
  if (isStall && runDriver) {
    return `More running volume can build endurance but may slow strength recovery on this lift — balance the two deliberately.`;
  }
  return null;
}

function recencyFor(window, currentWeek) {
  const cw = parseInt(currentWeek, 10) || 1;
  const to = window?.toWeek;
  if (!to) return 0.5;
  return clamp01(1 - Math.max(0, cw - to) / 4);
}

// ------------------------------------------------------------------
// BUILD + PRIORITISE — Findings[] → prioritised Insight[].
// ------------------------------------------------------------------
export function buildInsights(findings, ctx = {}) {
  return (findings || [])
    .map(f => toInsight(f, ctx))
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);
}

// Top-N selection for a surface (default 5), already priority-sorted.
export function selectTop(insights, n = 5) {
  return (insights || []).slice(0, n);
}
