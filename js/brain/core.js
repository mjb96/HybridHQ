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
import { buildInsights, selectTop } from './insights.js';

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

  const ctx = { days, program, currentWeek, maxWeek };
  const findings = runAnalysis(appState, ctx);
  const allInsights = buildInsights(findings, ctx);
  const insights = selectTop(allInsights, topN);

  const dataWeeks = Object.keys(appState.weeks).filter(k => !Number.isNaN(Number(k))).length;

  return {
    generatedAt: now,
    insights,
    findings,
    meta: {
      dataWeeks,
      hasEnoughData: insights.length > 0,
      totalInsights: allInsights.length,
      currentWeek,
    },
  };
}

// Convenience: counts of surfaced insights by category (for tile badges etc).
export function insightCounts(report) {
  const out = {};
  (report?.insights || []).forEach(i => { out[i.category] = (out[i.category] || 0) + 1; });
  return out;
}
