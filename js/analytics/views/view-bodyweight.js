// ==========================================
// ANALYTICS VIEW — BODY WEIGHT (view-bodyweight.js)
// ------------------------------------------
// Renders the 'bodyweight' analytics context.
// ==========================================
import { renderBodyWeightChart } from '../charts.js';
import { getLastNDays, trendDirection, lastNWeeksSeries } from '../../health/healthBaselines.js';
import { escapeHtml } from '../../util.js';

export function renderBodyweightView(appState) {
  // Merge Health Connect weight readings into the manual log for chart display.
  // HC weight entries (from healthLog) fill in days the athlete forgot to log.
  const manualLog   = appState.bodyWeightLog || [];
  const healthLog   = appState.healthLog || [];
  const manualDates = new Set(manualLog.map(e => e.date));

  const hcWeightEntries = healthLog
    .filter(e => e.weight > 0 && !manualDates.has(e.date))
    .map(e => ({ date: e.date, weight: e.weight, source: 'hc' }));

  const mergedLog = [...manualLog, ...hcWeightEntries]
    .sort((a, b) => a.date.localeCompare(b.date));

  renderBodyWeightChart(document.getElementById('bwChartContainer'), mergedLog);

  _renderBodyweightHealthContext(appState, healthLog);
}

function _renderBodyweightHealthContext(appState, healthLog) {
  const section = document.getElementById('analytics-bodyweight');
  if (!section) return;

  let panel = section.querySelector('.bw-health-context');

  const last30 = getLastNDays(healthLog, 30).filter(e => e.weight > 0);
  if (last30.length === 0) { if (panel) panel.remove(); return; }

  const latest = last30[last30.length - 1];

  // 7-day direction-of-change
  const last7 = getLastNDays(healthLog, 7).filter(e => e.weight > 0);
  const dir7  = trendDirection(last7.map(e => e.weight));
  // 30-day direction-of-change (and weekly aggregation for absolute kg/wk)
  const dir30 = trendDirection(last30.map(e => e.weight));
  const weekly = lastNWeeksSeries(healthLog, 'weight', 4, 'avg').values.filter(v => v > 0);
  const kgPerWeek = weekly.length >= 2 ? (weekly[weekly.length - 1] - weekly[0]) / (weekly.length - 1) : 0;

  const dirWord = d => d.direction === 'rising' ? 'Rising' : d.direction === 'falling' ? 'Falling' : 'Stable';
  const dirColor = d => d.direction === 'steady' ? '#10b981' : '#f59e0b';
  const dirArrow = d => d.direction === 'rising' ? '↑' : d.direction === 'falling' ? '↓' : '→';

  // Brain note: direction + rate + interpretation
  let note;
  if (Math.abs(kgPerWeek) < 0.15) {
    note = `Weight is holding steady around ${latest.weight.toFixed(1)} kg over the last 4 weeks — body mass is stable.`;
  } else {
    const rate = Math.abs(kgPerWeek).toFixed(1);
    const goingUp = kgPerWeek > 0;
    note = `Trending ${goingUp ? 'up' : 'down'} ~${rate} kg/week over the last month (now ${latest.weight.toFixed(1)} kg). `
      + (goingUp
          ? 'If this is a build phase, ensure the gain is gradual; rapid rises favour fat over muscle.'
          : 'On a cut this is healthy progress; keep protein high and monitor strength to preserve muscle.');
  }

  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'bw-health-context mb-3';
    const chartEl = section.querySelector('#bwChartContainer');
    const parent = chartEl ? chartEl.closest('article') || section : section;
    parent.parentNode?.insertBefore(panel, parent) || section.insertBefore(panel, section.firstChild);
  }

  panel.innerHTML = `
    <div class="grid-3-col gap-2 mb-2">
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(59,130,246,0.3);">
        <div class="text-xs text-muted mb-1">Current</div>
        <div class="font-heavy text-inverse" style="font-size:1.1rem;">${latest.weight.toFixed(1)} kg</div>
        <div class="text-xs text-muted mt-1">${latest.date}</div>
      </article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb,${dirColor(dir7)} 30%,transparent);">
        <div class="text-xs text-muted mb-1">7-Day Trend</div>
        <div class="font-heavy" style="font-size:1.05rem;color:${dirColor(dir7)};">${dirArrow(dir7)} ${dirWord(dir7)}</div>
        <div class="text-xs text-muted mt-1">${dir7.pct ? Math.abs(dir7.pct) + '%' : 'flat'}</div>
      </article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb,${dirColor(dir30)} 30%,transparent);">
        <div class="text-xs text-muted mb-1">30-Day Trend</div>
        <div class="font-heavy" style="font-size:1.05rem;color:${dirColor(dir30)};">${dirArrow(dir30)} ${dirWord(dir30)}</div>
        <div class="text-xs text-muted mt-1">${kgPerWeek ? (kgPerWeek >= 0 ? '+' : '') + kgPerWeek.toFixed(1) + ' kg/wk' : 'stable'}</div>
      </article>
    </div>
    <article class="card-dark p-3 mb-3" style="border-left:3px solid var(--color-green);">
      <div class="text-xs font-bold text-muted mb-1" style="text-transform:uppercase;letter-spacing:0.06em;">Coach's Read</div>
      <div class="text-sm text-inverse" style="line-height:1.5;">${escapeHtml(note)}</div>
    </article>`;
}
