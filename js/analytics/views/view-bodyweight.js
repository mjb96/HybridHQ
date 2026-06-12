// ==========================================
// ANALYTICS VIEW — BODY WEIGHT (view-bodyweight.js)
// ------------------------------------------
// Renders the 'bodyweight' analytics context.
// ==========================================
import { renderBodyWeightChart } from '../charts.js';
import { getLastNDays } from '../../health/healthBaselines.js';
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

  const hcWeightEntries = getLastNDays(healthLog, 7).filter(e => e.weight > 0);
  if (hcWeightEntries.length === 0) { if (panel) panel.remove(); return; }

  const latest = hcWeightEntries[hcWeightEntries.length - 1];
  const avg7   = hcWeightEntries.reduce((s, e) => s + e.weight, 0) / hcWeightEntries.length;
  const delta  = latest.weight - avg7;
  const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' kg vs 7d avg';
  const deltaColor = Math.abs(delta) < 0.5 ? '#10b981' : Math.abs(delta) < 1.5 ? '#f59e0b' : '#ef4444';

  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'bw-health-context mb-3';
    const chartEl = section.querySelector('#bwChartContainer');
    const parent = chartEl ? chartEl.closest('article') || section : section;
    parent.parentNode?.insertBefore(panel, parent) || section.insertBefore(panel, section.firstChild);
  }

  panel.innerHTML = `
    <div class="grid-2-col gap-2 mb-2">
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid rgba(59,130,246,0.3);">
        <div class="text-xs text-muted mb-1">Latest (HC)</div>
        <div class="font-heavy text-inverse" style="font-size:1.1rem;">${latest.weight.toFixed(1)} kg</div>
        <div class="text-xs text-muted mt-1">${latest.date}</div>
      </article>
      <article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb,${deltaColor} 30%,transparent);">
        <div class="text-xs text-muted mb-1">7-Day Trend</div>
        <div class="font-heavy" style="font-size:1.1rem;color:${deltaColor};">${deltaStr}</div>
        <div class="text-xs text-muted mt-1">from Health Connect</div>
      </article>
    </div>`;
}
