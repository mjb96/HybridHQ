// ==========================================
// ANALYTICS VIEW — ADAPTATION (view-adaptation.js)
// ------------------------------------------
// Renders the 'adaptation' analytics context.
// Analyses cross-domain relationships: sleep ↔ performance, RHR ↔ training
// output, consistency ↔ readiness. Athlete-specific trends, not generic advice.
// ==========================================
import { computeRecoveryScore, computeWeeklyLoadSeries } from '../../engine.js';
import { getProgramById } from '../../state.js';
import { getLastNDays, computeBaseline } from '../../health/healthBaselines.js';
import { escapeHtml } from '../../util.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctColor(pct, higherIsBetter = true) {
  if (pct === null) return 'var(--text-muted)';
  const isPositive = higherIsBetter ? pct > 0 : pct < 0;
  const magnitude = Math.abs(pct);
  if (isPositive)  return magnitude > 10 ? '#10b981' : '#22d3ee';
  return magnitude > 10 ? '#ef4444' : '#f59e0b';
}

function signStr(val) {
  if (val === null || val === undefined) return '--';
  return (val > 0 ? '+' : '') + val;
}

// Return {avgRpe, sessions} for given days, or null if insufficient
function weekRpeStats(weeks, wk, days) {
  const weekData = weeks?.[wk];
  if (!weekData) return null;
  let total = 0, count = 0;
  days.forEach(d => {
    const r = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
    const g = parseInt(weekData.gymRpe?.[d], 10) || 0;
    if (r > 0) { total += r; count++; }
    if (g > 0) { total += g; count++; }
  });
  return count > 0 ? { avgRpe: total / count, sessions: count } : null;
}

// ── Pattern analysis ─────────────────────────────────────────────────────────

// Correlate sleep quality with RPE on the following day.
// Returns { pairs, correlation, observation }.
function analyzeSleepRpeCorrelation(appState, days, healthLog) {
  const pairs = [];
  const dateMap = new Map((healthLog || []).map(e => [e.date, e]));
  const wk = appState.currentWeek;
  const weekData = appState.weeks?.[wk];
  if (!weekData) return { pairs, correlation: null, observation: '' };

  // Build date→RPE map for this week
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const prevDate = new Date(Date.now() - (i + 1) * 86400000).toISOString().slice(0, 10);
    const prevEntry = dateMap.get(prevDate);
    if (!prevEntry || !prevEntry.sleepHours) continue;

    // Find RPE for this day across all day keys
    let dayRpe = 0;
    days.forEach(dayKey => {
      const wkEntry = weekData.runs?.[dayKey]?.rpe || weekData.gymRpe?.[dayKey];
      // Rough date matching via week position — log date alignment is approximate
    });
    // Use healthLog RPE if present (from HealthService exercises)
    const thisEntry = dateMap.get(dateStr);
    if (thisEntry?.avgRpe) {
      pairs.push({ date: dateStr, sleepH: prevEntry.sleepHours, rpe: thisEntry.avgRpe });
    }
  }

  // Fallback: compare last 14 days sleep vs this week's overall RPE
  const last14sleep = getLastNDays(healthLog, 14).filter(e => e.sleepHours > 0);
  const thisWeekRpe = weekRpeStats(appState.weeks, wk, days);
  const prevWeek    = String(Math.max(1, parseInt(wk, 10) - 1));
  const prevWeekRpe = weekRpeStats(appState.weeks, prevWeek, days);

  if (!last14sleep.length) return { pairs, correlation: null, observation: '' };

  const avgSleep7  = last14sleep.slice(-7).reduce((s, e) => s + e.sleepHours, 0) / Math.min(7, last14sleep.length);
  const avgSleep14 = last14sleep.reduce((s, e) => s + e.sleepHours, 0) / last14sleep.length;

  let observation = '';
  if (thisWeekRpe && prevWeekRpe) {
    const rpeImproved = thisWeekRpe.avgRpe < prevWeekRpe.avgRpe;
    const sleepImproved = avgSleep7 >= avgSleep14;
    if (rpeImproved && sleepImproved) {
      observation = `Better sleep over the past 7 days (${avgSleep7.toFixed(1)}h avg) coincides with lower perceived exertion this week (RPE ${thisWeekRpe.avgRpe.toFixed(1)} vs ${prevWeekRpe.avgRpe.toFixed(1)} last week). Sleep quality appears to be contributing to performance.`;
    } else if (!rpeImproved && !sleepImproved) {
      observation = `Reduced sleep over the past 7 days (${avgSleep7.toFixed(1)}h avg vs ${avgSleep14.toFixed(1)}h prior) aligns with higher perceived exertion this week. Improving nightly sleep duration may reduce training stress.`;
    } else if (rpeImproved && !sleepImproved) {
      observation = `RPE is lower this week despite reduced sleep. Training may have adapted, or this week's sessions were less demanding.`;
    } else {
      observation = `RPE is elevated this week despite adequate sleep. Consider whether training volume or intensity has increased.`;
    }
  } else if (thisWeekRpe) {
    observation = `Current week RPE average: ${thisWeekRpe.avgRpe.toFixed(1)}. Log more weeks to see correlations with sleep quality.`;
  }

  return { pairs, correlation: null, observation };
}

// Correlate RHR elevation with weekly load.
function analyzeRhrLoadRelationship(appState, days, healthLog, maxWeek) {
  const rhrBaseline = computeBaseline(healthLog, 'restingHeartRate');
  const loadSeries  = computeWeeklyLoadSeries(appState, days, maxWeek);
  const wk = parseInt(appState.currentWeek, 10) || 1;

  const currentLoad = (loadSeries.lift[wk - 1] || 0) + (loadSeries.run[wk - 1] || 0);
  const prevLoad    = wk > 1 ? ((loadSeries.lift[wk - 2] || 0) + (loadSeries.run[wk - 2] || 0)) : null;
  const loadJump    = prevLoad > 0 ? Math.round(((currentLoad - prevLoad) / prevLoad) * 100) : null;

  let observation = '';
  const rhr = appState.health?.restingHeartRate;
  if (rhr && rhrBaseline.baseline && rhrBaseline.pctDiff !== null) {
    if (rhrBaseline.pctDiff > 8 && loadJump !== null && loadJump > 20) {
      observation = `RHR is ${rhrBaseline.pctDiff}% above your baseline and training load jumped ${loadJump}% this week. Elevated morning HR after a load spike is a normal stress response — it typically resolves within 48–72h of adequate recovery.`;
    } else if (rhrBaseline.pctDiff > 8 && (loadJump === null || loadJump <= 5)) {
      observation = `RHR is elevated (${rhrBaseline.pctDiff}% above baseline) without a proportional load increase. This may indicate non-training stressors (illness, poor sleep, life stress) — prioritise recovery tonight.`;
    } else if (rhrBaseline.pctDiff <= 5) {
      observation = `RHR is tracking near baseline. Training load stress is being managed well by your nervous system.`;
    }
  } else if (!rhr) {
    observation = 'Sync Health Connect to see how your resting HR responds to training load changes.';
  }

  return { rhrBaseline, loadJump, observation };
}

// Recovery score comparison: this week vs last week.
function analyzeRecoveryTrend(appState, days) {
  const wk = appState.currentWeek;
  const prev = String(Math.max(1, parseInt(wk, 10) - 1));
  const current = computeRecoveryScore(appState, days);

  // Approximate prev week recovery using same function on a mutated state slice
  let prevScore = null;
  try {
    const fakePrev = { ...appState, currentWeek: prev };
    const p = computeRecoveryScore(fakePrev, days);
    if (p.hasData) prevScore = p.score;
  } catch { /* non-fatal */ }

  return {
    current: current.hasData ? current.score : null,
    previous: prevScore,
    delta: (current.hasData && prevScore !== null) ? current.score - prevScore : null,
  };
}

// Strength performance context: compare tonnage with sleep quality.
function analyzeStrengthSleepContext(appState, days, healthLog, maxWeek) {
  const load = computeWeeklyLoadSeries(appState, days, maxWeek);
  const wk = parseInt(appState.currentWeek, 10) || 1;
  const thisWeekLift = load.lift[wk - 1] || 0;
  const prevWeekLift = wk > 1 ? (load.lift[wk - 2] || 0) : null;

  const last7sleep = getLastNDays(healthLog, 7).filter(e => e.sleepHours > 0);
  const avgSleep   = last7sleep.length ? last7sleep.reduce((s, e) => s + e.sleepHours, 0) / last7sleep.length : null;

  let observation = '';
  if (thisWeekLift > 0 && prevWeekLift !== null && avgSleep !== null) {
    const liftDelta = prevWeekLift > 0 ? Math.round(((thisWeekLift - prevWeekLift) / prevWeekLift) * 100) : null;
    if (avgSleep >= 7.5 && liftDelta !== null && liftDelta > 5) {
      observation = `Lifting volume is up ${liftDelta}% this week with solid sleep (${avgSleep.toFixed(1)}h avg). Good sleep quality is supporting progressive overload — maintain this pattern.`;
    } else if (avgSleep < 6.5 && liftDelta !== null && liftDelta < 0) {
      observation = `Lifting volume is down ${Math.abs(liftDelta)}% with below-average sleep (${avgSleep.toFixed(1)}h avg). Short sleep reduces force production — prioritise 7–8h to recover output.`;
    } else if (thisWeekLift > 0) {
      observation = avgSleep !== null
        ? `Current sleep average (${avgSleep.toFixed(1)}h) is within normal range. Track over 3+ weeks to see if sleep quality correlates with strength progression.`
        : 'Log more weeks and sync Health Connect to see sleep–strength correlations.';
    }
  } else if (!last7sleep.length) {
    observation = 'Sync Health Connect sleep data to analyse its impact on strength output.';
  }

  return { thisWeekLift, prevWeekLift, avgSleep, observation };
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderAdaptationView(appState, days) {
  const container = document.getElementById('adaptationContent');
  if (!container) return;

  const program   = getProgramById(appState.activeProgramId);
  const maxWeek   = program?.totalWeeks || 12;
  const healthLog = appState.healthLog || [];
  const hasHealth = healthLog.length > 0;

  const sleepRpe     = analyzeSleepRpeCorrelation(appState, days, healthLog);
  const rhrLoad      = analyzeRhrLoadRelationship(appState, days, healthLog, maxWeek);
  const recoveryTrend = analyzeRecoveryTrend(appState, days);
  const strengthSleep = analyzeStrengthSleepContext(appState, days, healthLog, maxWeek);

  const rhrPct = rhrLoad.rhrBaseline.pctDiff;
  const rhrColor = rhrPct === null ? 'var(--text-muted)' : rhrPct > 10 ? '#ef4444' : rhrPct > 5 ? '#f59e0b' : '#10b981';
  const recDeltaColor = recoveryTrend.delta === null ? 'var(--text-muted)' : recoveryTrend.delta >= 0 ? '#10b981' : '#ef4444';

  container.innerHTML = `
    <!-- Recovery week-over-week trend -->
    <h2 class="section-header">Recovery Trajectory</h2>
    <div class="grid-2-col gap-2 mb-4">
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(16,185,129,0.3);">
        <div class="text-xs text-muted mb-1">This Week</div>
        <div class="font-heavy" style="font-size:1.4rem;color:${recoveryTrend.current !== null ? (recoveryTrend.current >= 60 ? '#10b981' : recoveryTrend.current >= 35 ? '#f59e0b' : '#ef4444') : 'var(--text-muted)'};">${recoveryTrend.current !== null ? recoveryTrend.current + '%' : '--'}</div>
        <div class="text-xs text-muted mt-1">recovery score</div>
      </article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(255,255,255,0.08);">
        <div class="text-xs text-muted mb-1">vs Last Week</div>
        <div class="font-heavy" style="font-size:1.4rem;color:${recDeltaColor};">${recoveryTrend.delta !== null ? signStr(recoveryTrend.delta) + ' pts' : '--'}</div>
        <div class="text-xs text-muted mt-1">${recoveryTrend.previous !== null ? 'was ' + recoveryTrend.previous + '%' : 'no prior data'}</div>
      </article>
    </div>

    <!-- Sleep → RPE correlation -->
    <h2 class="section-header">Sleep &amp; Perceived Exertion</h2>
    ${sleepRpe.observation ? `
    <article class="card-dark p-3 mb-4" style="border-left:3px solid #22d3ee;">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(sleepRpe.observation)}</div>
    </article>` : `
    <article class="card-dark p-3 mb-4">
      <div class="text-sm text-muted">Log workouts and sync Health Connect sleep data to see how sleep quality affects perceived exertion.</div>
    </article>`}

    <!-- RHR → Load relationship -->
    <h2 class="section-header">Heart Rate &amp; Training Load</h2>
    <div class="flex-between mb-2">
      ${rhrLoad.rhrBaseline.baseline !== null ? `
      <article class="card-dark p-3 flex-col flex-center" style="flex:1;margin-right:8px;border:1px solid color-mix(in srgb,${rhrColor} 25%,transparent);">
        <div class="text-xs text-muted mb-1">RHR vs Baseline</div>
        <div class="font-heavy" style="color:${rhrColor};">${rhrPct !== null ? signStr(rhrPct) + '%' : '--'}</div>
      </article>` : ''}
      ${rhrLoad.loadJump !== null ? `
      <article class="card-dark p-3 flex-col flex-center" style="flex:1;border:1px solid rgba(59,130,246,0.25);">
        <div class="text-xs text-muted mb-1">Load Change</div>
        <div class="font-heavy" style="color:${rhrLoad.loadJump > 20 ? '#f59e0b' : '#10b981'};">${signStr(rhrLoad.loadJump)}%</div>
      </article>` : ''}
    </div>
    ${rhrLoad.observation ? `
    <article class="card-dark p-3 mb-4" style="border-left:3px solid #ec4899;">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(rhrLoad.observation)}</div>
    </article>` : `<div class="mb-4"></div>`}

    <!-- Sleep → Strength output -->
    <h2 class="section-header">Sleep &amp; Strength Output</h2>
    ${strengthSleep.observation ? `
    <article class="card-dark p-3 mb-4" style="border-left:3px solid #3b82f6;">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(strengthSleep.observation)}</div>
    </article>` : `
    <article class="card-dark p-3 mb-4">
      <div class="text-sm text-muted">Log strength sessions and sync sleep data to see correlations.</div>
    </article>`}

    <!-- Long-term patterns note -->
    <article class="card-dark p-3 mb-4" style="border-left:3px solid rgba(255,255,255,0.12);">
      <div class="text-xs text-muted" style="line-height:1.5;">
        Adaptation insights improve as your data history grows. Correlations require 3+ weeks of logged sessions and daily Health Connect syncs to become reliable.
      </div>
    </article>
  `;
}
