// ==========================================
// ANALYTICS VIEW — RUNNING (view-running.js)
// ------------------------------------------
// Renders the 'running' analytics context including per-run stream charts
// (loaded asynchronously from IndexedDB).
// ==========================================
import { computeWeeklyHrSeries, computeWeeklyTrainingEffectSeries, formatPace } from '../../engine.js';
import { getStreamFromDB } from '../../db.js';
import { setText, paceZoneColour } from '../utils.js';
import { renderHrZonesChart, renderCadenceChart, renderWeeklyLinesChart, renderStreamCharts } from '../charts.js';

export function renderRunningView(data, appState, days) {
  setText('allTimeRunDist', data.globalTotalDist.toFixed(1) + ' km');
  setText('allTimeRunElev', Math.round(data.globalTotalElev) + ' m');
  setText('allTimeRunCals', Math.round(data.globalTotalCals).toLocaleString());

  const thresholdInput = document.getElementById('analyticsThresholdPaceInput');
  if (thresholdInput && data.thresholdSecs && !thresholdInput.value) {
    thresholdInput.value = data.thresholdSecs;
  }

  const paceContainer = document.getElementById('paceTrendContainer');
  if (paceContainer) {
    const paceRows = data.weekLabels.map((lbl, i) => {
      if (data.paceData[i] <= 0) return '';
      const colour = paceZoneColour(data.paceData[i], data.thresholdSecs);
      return `<div class="flex-between py-2 border-b-glass text-base">
          <span class="text-inverse font-bold">${lbl}</span>
          <span class="font-heavy" style="color:${colour};font-variant-numeric:tabular-nums;">${formatPace(data.paceData[i])}</span>
         </div>`;
    }).filter(Boolean);

    paceContainer.innerHTML = paceRows.length
      ? paceRows.join('')
      : '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Log runs with time to see pace trends.</p>';
  }

  renderHrZonesChart(document.getElementById('hrZonesChartContainer'), data.weekLabels, data.hrZonesData);
  renderCadenceChart(document.getElementById('cadenceChartContainer'), data.weekLabels, data.cadenceData);

  const maxWeek = data.weekLabels.length;
  const hr = computeWeeklyHrSeries(appState, days, maxWeek);
  renderWeeklyLinesChart(document.getElementById('runHrTrendContainer'), data.weekLabels, [
    { values: hr.avgHr, color: '#22d3ee', label: 'Avg HR' },
    { values: hr.maxHr, color: '#ef4444', label: 'Max HR' },
  ], { yFmt: v => `${Math.round(v)}`, emptyMsg: 'Log runs with HR (or import .FIT) to see HR trends.' });

  const te = computeWeeklyTrainingEffectSeries(appState, days, maxWeek);
  renderWeeklyLinesChart(document.getElementById('runTeTrendContainer'), data.weekLabels, [
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
