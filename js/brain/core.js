// ==========================================
// HYBRID BRAIN — CORE ORCHESTRATOR (core.js)
// ------------------------------------------
// The single entry point: Data → Findings → Insights → Report.
// Pure and READ-ONLY — it never mutates appState, programs or storage. The
// program (and week bounds) are injected by the caller so this module stays
// DOM-free and testable; it must not import the DOM-bound state layer.
//
//   import { generateInsights } from './brain/core.js';
//   const report = generateInsights(appState, { days, program, currentWeek });
//
// Safe under `node --test`.
// ==========================================
import { runAnalysis } from './analysis.js';
import { attributeFindings, detectInterference } from './attribution.js';
import { buildInsights, selectTop } from './insights.js';
import { strengthLoadSeries, enduranceLoadSeries, recoveryCostBalance } from './load_models.js';
import { detectPhase } from './weekly_brief.js';

const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function emptyReport(currentWeek, now) {
  return {
    generatedAt: now,
    insights: [],
    findings: [],
    meta: { dataWeeks: 0, hasEnoughData: false, totalInsights: 0, currentWeek },
  };
}

// Generate the prioritised InsightReport for an athlete snapshot.
// opts: { days, program, currentWeek, maxWeek, topN, now }
export function generateInsights(appState, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const currentWeek = opts.currentWeek || appState?.currentWeek || '1';

  if (!appState || !appState.weeks || Object.keys(appState.weeks).length === 0) {
    return emptyReport(currentWeek, now);
  }

  const days = opts.days || DEFAULT_DAYS;
  const program = opts.program || null;
  const maxWeek = opts.maxWeek || program?.totalWeeks || 12;
  const topN = opts.topN ?? 5;

  // Goal context — used by tradeoff resolution to produce goal-specific directives.
  const goalConfig = appState?.goalData?.goalConfig || {};
  const strengthSeries  = strengthLoadSeries(appState, days, maxWeek);
  const enduranceSeries = enduranceLoadSeries(appState, days, maxWeek);
  const cwIdx   = (parseInt(currentWeek, 10) || 1) - 1;
  const balance = recoveryCostBalance(appState, days, currentWeek, maxWeek);

  let weeksToGoal = null;
  if (goalConfig.goalEventDate) {
    const weekData  = appState?.weeks?.[String(currentWeek)];
    const weekStart = weekData?.startedAt || appState?.weekStartedAt;
    if (weekStart) {
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      weeksToGoal = Math.ceil((new Date(goalConfig.goalEventDate) - new Date(weekStart)) / msPerWeek);
    }
  }

  const ctx = {
    days, program, currentWeek, maxWeek,
    goalConfig,
    phase:          detectPhase(weeksToGoal),
    strengthLoad:   strengthSeries[cwIdx]  || 0,
    enduranceLoad:  enduranceSeries[cwIdx] || 0,
    acwr:           balance.hasData ? balance.acwr : null,
  };

  // Findings → causal enrichment. Interference is an extra finding; then every
  // finding is passed through attribution to attach evidence-backed "why".
  const rawFindings = runAnalysis(appState, ctx);
  const interference = detectInterference(appState, ctx);
  const findings = attributeFindings(
    interference ? [...rawFindings, interference] : rawFindings,
    appState, ctx,
  );

  const allInsights = buildInsights(findings, ctx);
  const insights = selectTop(allInsights, topN);

  const dataWeeks = Object.keys(appState.weeks).filter(k => !Number.isNaN(Number(k))).length;

  return {
    generatedAt: now,
    insights,
    allInsights,
    findings,
    meta: {
      dataWeeks,
      hasEnoughData: insights.length > 0,
      totalInsights: allInsights.length,
      currentWeek,
    },
  };
}

// Map an analytics context (router / tile target) to the insight domains
// relevant to it, so each detail view can surface its own coaching.
export const CONTEXT_DOMAINS = Object.freeze({
  strength:        ['strength'],
  strength_pr:     ['strength'],
  'weekly-volume': ['strength'],
  running:         ['aerobic', 'fuel'],
  'active-fuel':   ['fuel', 'aerobic'],
  recovery:        ['recovery'],
  'recovery-score':['recovery'],
  progress:        ['adherence', 'strength', 'aerobic'],
  'goal-progress': ['adherence'],
  streak:          ['adherence'],
  bodyweight:      ['bodyweight'],
  'health-steps':  ['adherence', 'fuel'],
  'health-sleep':  ['recovery'],
  'health-rhr':    ['recovery'],
});

// Prioritised insights relevant to a given analytics context (full list, not
// just the home top-N). Empty when nothing in those domains has fired.
export function insightsForContext(report, context) {
  const domains = CONTEXT_DOMAINS[context] || [];
  const all = report?.allInsights || report?.insights || [];
  return all.filter(i => domains.includes(i.domain));
}

// One-word "read" for a set of insights, most-actionable first. Drives the
// verdict chip on each analytics view's Brain banner.
export function contextVerdict(insights) {
  if (!insights || !insights.length) return null;
  const cats = new Set(insights.map(i => i.category));
  if (cats.has('risk'))        return { label: 'Watch',       tone: 'risk' };
  if (cats.has('opportunity')) return { label: 'Opportunity', tone: 'opportunity' };
  if (cats.has('progress'))    return { label: 'On track',    tone: 'progress' };
  if (cats.has('recovery'))    return { label: 'Recovering',  tone: 'recovery' };
  if (cats.has('goal'))        return { label: 'Goal',        tone: 'goal' };
  return null;
}

// Convenience: counts of surfaced insights by category (for tile badges etc).
export function insightCounts(report) {
  const out = {};
  (report?.insights || []).forEach(i => { out[i.category] = (out[i.category] || 0) + 1; });
  return out;
}

// Presentation summary for the home Brain area: the single highest-priority
// "Today's Focus", a separate goal-alignment slot (a goal insight that isn't
// already the focus), the remaining items as compact indicators, and category
// counts for the header. Pure — the renderer stays thin.
export function summarizeReport(report) {
  const insights = report?.insights || [];
  const focus = insights[0] || null;
  const goal = insights.find((i, idx) => idx > 0 && i.category === 'goal') || null;
  const rest = insights.filter(i => i !== focus && i !== goal);
  return { focus, goal, rest, counts: insightCounts(report), total: insights.length };
}
