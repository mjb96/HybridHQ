// ==========================================
// ANALYTICS VIEW — HEART RATE & RECOVERY (view-health-rhr.js)
// ------------------------------------------
// Garmin-style: today's RHR → vs yesterday → 7-day history → 4-week trend →
// sleep & load relationships, with averages demoted to support.
// ==========================================
import {
  computeBaseline, getLastNDays, buildDailySeries,
  buildTrendBrief, generateHealthCoachNote,
} from '../../health/healthBaselines.js';
import { renderHistoryBars, renderTrendLineWithBaseline } from '../charts.js';
import { escapeHtml, getLocalDateKey } from '../../util.js';
import { computeReadiness, computeWeeklyLoadSeries } from '../../engine.js';
import { getProgramById } from '../../state.js';
import { emptyState, dayOverDayChip, extremesRow, supportingAverages } from './_healthTrend.js';

function rhrStatusColor(bpm, baseline) {
  if (!baseline) {
    if (bpm > 75) return 'var(--color-red)';
    if (bpm > 65) return 'var(--color-amber)';
    return 'var(--color-green)';
  }
  const pct = ((bpm - baseline) / baseline) * 100;
  if (pct > 12) return 'var(--color-red)';
  if (pct > 6)  return 'var(--color-amber)';
  return 'var(--color-green)';
}
function rhrLabel(bpm, baseline) {
  if (!bpm) return 'No data';
  if (!baseline) {
    if (bpm > 75) return 'Elevated';
    if (bpm > 65) return 'Moderate';
    return 'Normal';
  }
  const pct = ((bpm - baseline) / baseline) * 100;
  if (pct > 12) return 'Elevated';
  if (pct > 6)  return 'Above normal';
  if (pct < -6) return 'Below baseline';
  return 'Normal';
}

export function renderHealthRhrView(appState, days) {
  const container = document.getElementById('healthRhrContent');
  if (!container) return;

  const health    = appState.health;
  const healthLog = appState.healthLog || [];

  if (!health && healthLog.length === 0) {
    container.innerHTML = emptyState('No Heart Rate Data',
      'Sync Health Connect to see your resting heart rate, trends, and recovery signals.');
    return;
  }

  const rhr   = health?.restingHeartRate || null;
  const avgHR = health?.averageHeartRate || null;

  const rhrBaseline = computeBaseline(healthLog, 'restingHeartRate');
  // Lower RHR is better, so flip directional language.
  const brief = buildTrendBrief(healthLog, 'restingHeartRate', {
    label: 'resting HR', unit: 'bpm', higherIsBetter: false, weeklyAgg: 'avg',
  });
  if (rhr > 0 && brief.daily.todayIndex >= 0) {
    brief.daily.values[brief.daily.todayIndex] = rhr;
  }

  const last7  = getLastNDays(healthLog, 7).filter(e => e.restingHeartRate > 0);
  const last30 = getLastNDays(healthLog, 30).filter(e => e.restingHeartRate > 0);
  const avg7rhr  = last7.length  ? Math.round(last7.reduce((s, e) => s + e.restingHeartRate, 0) / last7.length) : null;
  const avg30rhr = last30.length ? Math.round(last30.reduce((s, e) => s + e.restingHeartRate, 0) / last30.length) : null;

  // ACWR (training load context)
  let acwr = null;
  try {
    const program = getProgramById(appState.activeProgramId);
    const maxWeek = program?.totalWeeks || 12;
    const loadSeries = computeWeeklyLoadSeries(appState, days || [], maxWeek);
    const totalByWeek = loadSeries.lift.map((v, i) => v + (loadSeries.run[i] || 0));
    const readiness = computeReadiness(totalByWeek, appState.currentWeek);
    if (readiness.hasData) acwr = readiness.acwr;
  } catch { /* non-fatal */ }

  // Sleep correlation
  const yesterday = getLocalDateKey(new Date(Date.now() - 86400000));
  const yesterdayLog = healthLog.find(e => e.date === yesterday);
  let sleepNote = '';
  if (yesterdayLog?.sleepHours > 0 && rhr > 0 && rhrBaseline.baseline) {
    const sleepShort = yesterdayLog.sleepHours < 7;
    const rhrElevated = (rhrBaseline.pctDiff || 0) > 8;
    if (sleepShort && rhrElevated) {
      sleepNote = `Last night's sleep was ${yesterdayLog.sleepHours}h and your RHR is ${rhrBaseline.pctDiff}% above baseline — short sleep commonly elevates morning heart rate.`;
    } else if (!sleepShort && !rhrElevated) {
      sleepNote = `Good sleep last night (${yesterdayLog.sleepHours}h) and a calm RHR — nervous system recovery is in good shape.`;
    }
  }

  const { labels: hrLabels, values: hrValues } = buildDailySeries(healthLog, 'averageHeartRate', 30);
  const { labels: rhrLabels30, values: rhrValues30 } = buildDailySeries(healthLog, 'restingHeartRate', 30);

  const statusColor = rhrStatusColor(rhr, rhrBaseline.baseline);
  const statusLabel = rhrLabel(rhr, rhrBaseline.baseline);
  const coachNote = generateHealthCoachNote(health, healthLog);

  container.innerHTML = `
    <!-- Today -->
    <div class="grid-2-col gap-3 mb-3">
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid color-mix(in srgb, ${statusColor} 30%, transparent);">
        <div class="text-xs text-muted mb-1">Resting HR</div>
        <div class="font-heavy" style="font-size:2rem;line-height:1;color:${statusColor};">${rhr ?? '--'}</div>
        <div class="font-bold mt-1" style="font-size:0.75rem;color:${statusColor};">${statusLabel}</div>
        ${dayOverDayChip(brief.dod, { unit: 'bpm', higherIsBetter: false })}
      </article>
      <article class="card-dark p-4 flex-col flex-center" style="border:1px solid rgba(236,72,153,0.2);">
        <div class="text-xs text-muted mb-1">Avg HR (24h)</div>
        <div class="font-heavy text-inverse" style="font-size:2rem;line-height:1;">${avgHR ?? '--'}</div>
        ${avgHR ? `<div class="text-muted mt-1" style="font-size:0.65rem;">bpm</div>` : ''}
      </article>
    </div>

    <!-- Last 7 days -->
    <h2 class="section-header">Last 7 Days</h2>
    <article class="card-dark p-3 mb-2"><div id="rhr7Container"></div></article>
    ${extremesRow(brief, { unit: 'bpm' })}

    <!-- Last 4 weeks -->
    <h2 class="section-header">Last 4 Weeks</h2>
    <article class="card-dark p-3 mb-4"><div id="rhr4wContainer"></div></article>

    <!-- 30-day trend (supporting) -->
    <h2 class="section-header">30-Day Trend</h2>
    <article class="card-dark p-3 mb-2"><div id="rhrTrendChartContainer"></div></article>
    ${supportingAverages([
      { label: 'Yesterday', value: brief.dod.yesterday > 0 ? brief.dod.yesterday + ' bpm' : '--' },
      { label: '7-day avg', value: avg7rhr ? avg7rhr + ' bpm' : '--' },
      { label: '30-day avg', value: avg30rhr ? avg30rhr + ' bpm' : '--' },
      { label: 'Training load (ACWR)', value: acwr ? acwr.toFixed(2) + (acwr <= 1.3 ? ' · productive' : acwr <= 1.5 ? ' · overreaching' : ' · strained') : '--' },
    ])}

    ${hrValues.some(v => v > 0) ? `
    <h2 class="section-header">Average HR — 30-Day Trend</h2>
    <article class="card-dark p-3 mb-4"><div id="avgHrTrendChartContainer"></div></article>` : ''}

    ${sleepNote ? `
    <h2 class="section-header">Sleep Correlation</h2>
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-amber);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(sleepNote)}</div>
    </article>` : ''}

    ${acwr !== null ? `
    <h2 class="section-header">Training Load Context</h2>
    <article class="card-dark p-3 mb-4">
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">Acute:Chronic Load Ratio</span>
        <span class="font-heavy text-inverse">${acwr.toFixed(2)}</span>
      </div>
      <div class="text-sm text-muted" style="line-height:1.5;">
        ${acwr > 1.5 ? 'High training load may be contributing to elevated resting HR. Consider a recovery day before the next hard session.'
          : acwr > 1.3 ? 'Training load is elevated. RHR elevation in this context is expected — monitor for a downward trend over the next 48h.'
          : 'Training load is in the productive zone. If RHR remains elevated, prioritise sleep and nutrition.'}
      </div>
    </article>` : ''}

    <!-- Coach's read -->
    <h2 class="section-header">Coach's Read</h2>
    ${brief.note ? `<article class="card-dark p-3 mb-2" style="border-left:3px solid var(--color-pink);">
      <div class="text-xs font-bold text-muted mb-1" style="text-transform:uppercase;letter-spacing:0.06em;">What changed</div>
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(brief.note)}</div>
    </article>` : ''}
    <article class="card-dark p-3 mb-4" style="border-left:3px solid var(--color-blue);">
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(coachNote)}</div>
    </article>
  `;

  renderHistoryBars(document.getElementById('rhr7Container'),
    brief.daily.labels, brief.daily.values,
    { color: '#ec4899', highlightIndex: brief.daily.todayIndex,
      valueFmt: v => Math.round(v), refLine: avg7rhr ? { value: avg7rhr, label: '7d avg' } : null });

  renderHistoryBars(document.getElementById('rhr4wContainer'),
    brief.weekly.labels, brief.weekly.values,
    { color: '#ec4899', valueFmt: v => Math.round(v) });

  const rhrEl = document.getElementById('rhrTrendChartContainer');
  if (rhrEl && rhrLabels30.length > 0) {
    renderTrendLineWithBaseline(rhrEl, rhrLabels30, rhrValues30, rhrBaseline.baseline || 0, {
      color: '#ec4899', yFmt: v => Math.round(v) + ' bpm', emptyMsg: 'Sync Health Connect daily to track RHR trend.',
    });
  }
  const avgHrEl = document.getElementById('avgHrTrendChartContainer');
  if (avgHrEl && hrValues.some(v => v > 0)) {
    renderTrendLineWithBaseline(avgHrEl, hrLabels, hrValues, null, {
      color: '#ef4444', yFmt: v => Math.round(v) + ' bpm',
    });
  }
}
