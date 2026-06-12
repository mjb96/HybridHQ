// ==========================================
// ANALYTICS VIEW — RUNNING (view-running.js)
// ------------------------------------------
// Renders the 'running' analytics context including per-run stream charts
// (loaded asynchronously from IndexedDB).
// ==========================================
import { computeWeeklyCaloriesSeries, formatPace } from '../../engine.js';
import { getLastNDays } from '../../health/healthBaselines.js';
import { escapeHtml } from '../../util.js';
import {
  weeklyDistanceSeries, weeklyElevationSeries, weeklyPaceSeries,
  weeklyHrSeries, weeklyHrZonesSeries, weeklyCadenceSeries, weeklyTrainingEffectSeries,
} from '../../metrics/metrics-running.js';
import { getProgramById } from '../../state.js';
import { getStreamFromDB } from '../../db.js';
import { setText, paceZoneColour } from '../utils.js';
import { renderHrZonesChart, renderCadenceChart, renderWeeklyLinesChart, renderStreamCharts } from '../charts.js';

export function renderRunningView(appState, days) {
  _renderRunningHealthContext(appState);

  const activeProgram  = getProgramById(appState.activeProgramId);
  const maxWeek        = activeProgram?.totalWeeks || 12;
  const weekLabels     = Array.from({ length: maxWeek }, (_, i) => 'W' + (i + 1));
  const distData       = weeklyDistanceSeries(appState, days, maxWeek);
  const elevData       = weeklyElevationSeries(appState, days, maxWeek);
  const calsSeries     = computeWeeklyCaloriesSeries(appState, days, maxWeek);
  const paceData       = weeklyPaceSeries(appState, days, maxWeek);
  const hrZonesData    = weeklyHrZonesSeries(appState, days, maxWeek);
  const cadenceData    = weeklyCadenceSeries(appState, days, maxWeek);
  const thresholdSecs  = appState.thresholdPaceSeconds || null;

  const globalTotalDist = distData.reduce((a, b) => a + b, 0);
  const globalTotalElev = elevData.reduce((a, b) => a + b, 0);
  const globalTotalCals = calsSeries.reduce((a, b) => a + b, 0);

  setText('allTimeRunDist', globalTotalDist.toFixed(1) + ' km');
  setText('allTimeRunElev', Math.round(globalTotalElev) + ' m');
  setText('allTimeRunCals', Math.round(globalTotalCals).toLocaleString());

  const thresholdInput = document.getElementById('analyticsThresholdPaceInput');
  if (thresholdInput && thresholdSecs && !thresholdInput.value) {
    thresholdInput.value = thresholdSecs;
  }

  const paceContainer = document.getElementById('paceTrendContainer');
  if (paceContainer) {
    const paceRows = weekLabels.map((lbl, i) => {
      if (paceData[i] <= 0) return '';
      const colour = paceZoneColour(paceData[i], thresholdSecs);
      return `<div class="flex-between py-2 border-b-glass text-base">
          <span class="text-inverse font-bold">${lbl}</span>
          <span class="font-heavy" style="color:${colour};font-variant-numeric:tabular-nums;">${formatPace(paceData[i])}</span>
         </div>`;
    }).filter(Boolean);

    paceContainer.innerHTML = paceRows.length
      ? paceRows.join('')
      : '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Log runs with time to see pace trends.</p>';
  }

  renderHrZonesChart(document.getElementById('hrZonesChartContainer'), weekLabels, hrZonesData);
  renderCadenceChart(document.getElementById('cadenceChartContainer'), weekLabels, cadenceData);

  const hr = weeklyHrSeries(appState, days, maxWeek);
  renderWeeklyLinesChart(document.getElementById('runHrTrendContainer'), weekLabels, [
    { values: hr.avgHr, color: '#22d3ee', label: 'Avg HR' },
    { values: hr.maxHr, color: '#ef4444', label: 'Max HR' },
  ], { yFmt: v => `${Math.round(v)}`, emptyMsg: 'Log runs with HR (or import .FIT) to see HR trends.' });

  const te = weeklyTrainingEffectSeries(appState, days, maxWeek);
  renderWeeklyLinesChart(document.getElementById('runTeTrendContainer'), weekLabels, [
    { values: te, color: '#a78bfa', label: 'Training Effect' },
  ], { yFmt: v => v.toFixed(1), emptyMsg: 'Import .FIT runs to see training-effect trends.' });

  _renderLatestRunSplits(appState, days);
  _loadAndRenderLatestRunStream(appState, days);
}

// ---- Private: lap splits of the most recent run that has them -------------
function _renderLatestRunSplits(appState, days) {
  const el = document.getElementById('analyticsRunSplitsContainer');
  if (!el) return;
  const weekKeys = Object.keys(appState.weeks || {}).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
  let splits = null;
  for (const wk of weekKeys) {
    const runs = appState.weeks[String(wk)]?.runs;
    if (!runs) continue;
    for (let i = days.length - 1; i >= 0; i--) {
      const s = runs[days[i]]?.splits;
      if (Array.isArray(s) && s.length > 0) { splits = s; break; }
    }
    if (splits) break;
  }
  if (!splits) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.75rem;">Import a .FIT run to see lap splits.</p>';
    return;
  }
  const rows = splits.map((sp, i) => {
    const dist = sp.distance != null ? `${(parseFloat(sp.distance)).toFixed(2)} km` : '--';
    const tSec = parseFloat(sp.time || sp.duration || 0);
    const pace = (parseFloat(sp.distance) > 0 && tSec > 0)
      ? (() => { const p = tSec / parseFloat(sp.distance); const m = Math.floor(p / 60), s = Math.round(p % 60).toString().padStart(2, '0'); return `${m}:${s}/km`; })()
      : '--';
    const hr = sp.avgHR != null ? `${Math.round(parseFloat(sp.avgHR))} bpm` : (sp.heart_rate != null ? `${Math.round(parseFloat(sp.heart_rate))} bpm` : '--');
    return `<div class="flex-between py-1 border-b-glass" style="font-size:0.75rem;">
      <span class="text-muted">Lap ${i + 1}</span>
      <span class="text-inverse">${dist}</span>
      <span class="font-bold text-inverse" style="font-variant-numeric:tabular-nums;">${pace}</span>
      <span class="text-muted">${hr}</span>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="flex-between py-1" style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">
      <span>Lap</span><span>Dist</span><span>Pace</span><span>HR</span></div>${rows}`;
}

// ---- Private: find most recent run with streams; load + render async ------
function _loadAndRenderLatestRunStream(appState, days) {
  const weekKeys = Object.keys(appState.weeks || {}).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
  for (const wkNum of weekKeys) {
    const wkData = appState.weeks[String(wkNum)];
    if (!wkData?.runs) continue;
    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i];
      if (wkData.runs[day]?.hasStreams) {
        getStreamFromDB(wkNum, day, 'run')
          .then(stream => renderStreamCharts(stream))
          .catch(() => renderStreamCharts(null));
        return;
      }
    }
  }
  renderStreamCharts(null);
}

// ---- Health Connect activity context (non-run steps + avg HR from HC) ------
function _renderRunningHealthContext(appState) {
  const section = document.getElementById('analytics-running');
  if (!section) return;

  let panel = section.querySelector('.running-health-context');

  const health    = appState.health;
  const healthLog = appState.healthLog || [];
  const steps     = health?.steps || 0;
  const last7     = getLastNDays(healthLog, 7).filter(e => e.steps > 0);
  const avg7steps = last7.length ? Math.round(last7.reduce((s, e) => s + e.steps, 0) / last7.length) : 0;

  if (!steps && !avg7steps) { if (panel) panel.remove(); return; }

  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'running-health-context mb-3';
    section.insertBefore(panel, section.firstChild);
  }

  const stepColor = steps >= 10000 ? '#10b981' : steps >= 6000 ? '#f59e0b' : '#ef4444';
  const avgColor  = avg7steps >= 8000 ? '#10b981' : avg7steps >= 5000 ? '#f59e0b' : '#ef4444';

  let note = '';
  if (avg7steps > 0 && steps > 0) {
    const ratio = steps / avg7steps;
    if (ratio < 0.5) note = 'Today\'s step count is well below your weekly average — low-activity days can complement hard running sessions.';
    else if (steps >= 12000) note = 'High step count alongside running adds meaningful aerobic volume. Factor this into total daily load.';
  }

  panel.innerHTML = `
    <div class="grid-2-col gap-2 mb-2">
      ${steps > 0 ? `<article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb,${stepColor} 25%,transparent);">
        <div class="text-xs text-muted mb-1">Steps Today</div>
        <div class="font-heavy" style="color:${stepColor};">${steps.toLocaleString()}</div>
        <div class="text-xs text-muted mt-1">via Health Connect</div>
      </article>` : ''}
      ${avg7steps > 0 ? `<article class="card-dark p-3 flex-col flex-center" style="border:1px solid color-mix(in srgb,${avgColor} 25%,transparent);">
        <div class="text-xs text-muted mb-1">7-Day Step Avg</div>
        <div class="font-heavy" style="color:${avgColor};">${avg7steps.toLocaleString()}</div>
        <div class="text-xs text-muted mt-1">steps/day</div>
      </article>` : ''}
    </div>
    ${note ? `<article class="card-dark p-2 mb-2" style="border-left:3px solid var(--color-blue);">
      <div class="text-xs text-muted" style="line-height:1.4;">${escapeHtml(note)}</div>
    </article>` : ''}`;
}
