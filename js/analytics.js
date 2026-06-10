// ==========================================
// PERFORMANCE MATRIX — analytics.js
// ==========================================
import { CONFIG, PROGRAMS } from './constants.js';
import { getProgramById, saveStateToLocalStorage } from './state.js';
import {
  computeBig3Progression,
  computeRecoveryScore, computeStreakView,
  computeWeeklyCaloriesSeries, computeWeeklyLoadSeries, computeWeeklyCompletionSeries,
} from './engine.js';
import { getStreamFromDB } from './db.js';

let _getState;
let _getDays;
let _analyticsContext = 'overview';

export function initAnalytics(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays = getDaysFn;
}

// Which analytics view to show on next render. Set by openAnalyticsView()
// before switching tabs (replaces the former analytics-context window global).
export function setAnalyticsContext(context) {
  _analyticsContext = context || 'overview';
}

// ==========================================
// LOCAL STATE MUTATORS (Event Targets)
// ==========================================
export function saveThresholdPace(val) {
  if (!_getState) return;
  const appState = _getState();
  appState.thresholdPaceSeconds = parseInt(val, 10) || 0;
  saveStateToLocalStorage(true);
  renderAnalytics(); 
}

export function logBodyWeight() {
  if (!_getState) return;
  const input = document.getElementById('analyticsBwInput');
  if (!input || !input.value) return;

  const appState = _getState();
  const weight = parseFloat(input.value);
  if (isNaN(weight)) return;

  if (!appState.bodyWeightLog) appState.bodyWeightLog = [];
  
  const today = new Date().toISOString().slice(0, 10);
  const existingIdx = appState.bodyWeightLog.findIndex(l => l.date === today);
  if (existingIdx >= 0) {
    appState.bodyWeightLog[existingIdx].weight = weight;
  } else {
    appState.bodyWeightLog.push({ date: today, weight: weight });
  }

  saveStateToLocalStorage(true);
  input.value = '';
  renderAnalytics();
}

// ==========================================
// HELPERS
// ==========================================
function parsePaceSeconds(distKm, timeStr) {
  if (!distKm || !timeStr || parseFloat(distKm) === 0) return 0;
  const parts = timeStr.split(':').map(Number);
  let totalSecs = 0;
  if (parts.length === 2) totalSecs = parts[0] * 60 + parts[1];
  else if (parts.length === 3) totalSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (totalSecs === 0) return 0;
  return totalSecs / parseFloat(distKm); 
}

function formatPace(secsPerKm) {
  if (!secsPerKm || secsPerKm === 0) return '--';
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60).toString().padStart(2, '0');
  return `${m}:${s}/km`;
}

function rpeColour(rpe) {
  if (rpe === 0) return '#3b82f6'; 
  if (rpe < 6)  return '#10b981'; 
  if (rpe < 8)  return '#f59e0b'; 
  return '#ef4444'; 
}

function paceZoneColour(secsPerKm, thresholdSecs) {
  const easy      = thresholdSecs ? thresholdSecs + 60  : (CONFIG.paceZoneEasy      || 360);
  const tempo     = thresholdSecs ? thresholdSecs + 30  : (CONFIG.paceZoneTempo     || 300);
  const threshold = thresholdSecs                       || (CONFIG.paceZoneThreshold || 270);
  if (secsPerKm === 0) return '#3b82f6';
  if (secsPerKm > easy)      return '#10b981'; 
  if (secsPerKm > tempo)     return '#f59e0b'; 
  if (secsPerKm > threshold) return '#ef4444'; 
  return '#a855f7';                             
}

// ==========================================
// HIGH-CONTRAST CHART RENDERERS
// ==========================================
function renderVolumeChart(container, weekLabels, volData, runData) {
  if (!container || weekLabels.length < 1) {
    if(container) container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log workouts to see volume trends.</p>';
    return;
  }

  const W = 400, H = 180, PAD_L = 50, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;

  const maxVol = Math.max(...volData, 1);
  const maxRun = Math.max(...runData, 1);
  const n = weekLabels.length;
  const barW = Math.max(8, Math.floor(chartW / n) - 6);

  let bars = '';
  let runPoints = '';
  let runPath = '';

  weekLabels.forEach((label, i) => {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const barH = (volData[i] / maxVol) * chartH;
    const y = PAD_T + chartH - barH;
    
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${barH.toFixed(1)}" fill="#3b82f6" opacity="0.85" rx="3"/>`;

    const rx = PAD_L + (i / n) * chartW + chartW / n / 2;
    const ry = PAD_T + chartH - (runData[i] / maxRun) * chartH;
    runPoints += `${rx.toFixed(1)},${ry.toFixed(1)} `;
  });

  if (n >= 2) {
    runPath = `<polyline fill="none" stroke="#ec4899" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${runPoints.trim()}"/>`;
    weekLabels.forEach((label, i) => {
      const rx = PAD_L + (i / n) * chartW + chartW / n / 2;
      const ry = PAD_T + chartH - (runData[i] / maxRun) * chartH;
      runPath += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="4.5" fill="#ec4899"/>`;
    });
  }

  let yAxis = '';
  for (let t = 0; t <= 2; t++) {
    const val = Math.round((maxVol / 2) * t);
    const vy = PAD_T + chartH - (t / 2) * chartH;
    const labelTxt = val > 999 ? (val/1000).toFixed(1)+'k' : val;
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${labelTxt}</text>`;
    yAxis += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>`;
  }

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = PAD_L + (i / n) * chartW + chartW / n / 2;
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${runPath}${xAxis}</svg>`;
}

function renderRpeChart(container, weekLabels, rpeData) {
  if (!container) return;
  if (weekLabels.length === 0 || rpeData.every(r => r === 0)) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log RPE on workouts to see fatigue trends.</p>';
    return;
  }

  const W = 400, H = 150, PAD_L = 40, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;

  const band = (yPct, h, colour) => {
    const y = PAD_T + chartH * (1 - yPct - h);
    return `<rect x="${PAD_L}" y="${y.toFixed(1)}" width="${chartW}" height="${(chartH * h).toFixed(1)}" fill="${colour}" opacity="0.15"/>`;
  };
  const bands = band(0, 6/10, '#10b981') + band(0.6, 2/10, '#f59e0b') + band(0.8, 2/10, '#ef4444');

  let points = '';
  let dots = '';
  weekLabels.forEach((label, i) => {
    const rx = PAD_L + (i / n) * chartW + chartW / n / 2;
    const ry = rpeData[i] > 0 ? PAD_T + chartH - (rpeData[i] / 10) * chartH : PAD_T + chartH;
    if (rpeData[i] > 0) {
      points += `${rx.toFixed(1)},${ry.toFixed(1)} `;
      dots += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="5" fill="${rpeColour(rpeData[i])}" stroke="#111827" stroke-width="2"/>`;
    }
  });

  const line = points.trim().split(' ').length >= 2
    ? `<polyline fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2.5" stroke-dasharray="4,4" stroke-linejoin="round" points="${points.trim()}"/>`
    : '';

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = PAD_L + (i / n) * chartW + chartW / n / 2;
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  const yLabels = [[6, '#f59e0b'], [8, '#ef4444']].map(([v, c]) => {
    const vy = PAD_T + chartH - (v / 10) * chartH;
    return `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="12" font-weight="bold" fill="${c}">${v}</text>
      <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="${c}" stroke-width="1.5" opacity="0.4"/>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${bands}${yLabels}${line}${dots}${xAxis}</svg>`;
}

function renderBodyWeightChart(container, bwLog) {
  if (!container) return;
  const validEntries = (bwLog || []).filter(e => e && e.date && e.weight > 0);
  if (validEntries.length < 2) {
    container.innerHTML = validEntries.length === 1
      ? `<p style="color:rgba(255,255,255,0.8);font-size:0.85rem;padding:8px 0;">One entry logged (${validEntries[0].weight} kg). Log more to see a trend.</p>`
      : '<p style="color:rgba(255,255,255,0.6);font-size:0.75rem;">Log body weight to see trend.</p>';
    return;
  }

  const sorted = [...validEntries].sort((a, b) => a.date.localeCompare(b.date));
  const weights = sorted.map(e => e.weight);
  const labels  = sorted.map(e => {
    const d = new Date(e.date + 'T00:00:00');
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });

  const W = 400, H = 150, PAD_L = 45, PAD_B = 30, PAD_T = 15, PAD_R = 10;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weights.length;
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const rangeW = Math.max(maxW - minW, 2); 

  const toX = i => PAD_L + (i / (n - 1)) * chartW;
  const toY = w => PAD_T + chartH - ((w - (minW - 1)) / (rangeW + 2)) * chartH;

  let points = weights.map((w, i) => `${toX(i).toFixed(1)},${toY(w).toFixed(1)}`).join(' ');
  const polyline = `<polyline fill="none" stroke="#a855f7" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${points}"/>`;

  const fillPath = `M ${toX(0).toFixed(1)},${(PAD_T + chartH).toFixed(1)} ` +
    weights.map((w, i) => `L ${toX(i).toFixed(1)},${toY(w).toFixed(1)}`).join(' ') +
    ` L ${toX(n-1).toFixed(1)},${(PAD_T + chartH).toFixed(1)} Z`;
  const fill = `<path d="${fillPath}" fill="#a855f7" opacity="0.12"/>`;

  let dots = '';
  weights.forEach((w, i) => {
    dots += `<circle cx="${toX(i).toFixed(1)}" cy="${toY(w).toFixed(1)}" r="4" fill="#a855f7" stroke="#111827" stroke-width="2"/>`;
  });

  const specialIdx = new Set([0, n-1, weights.indexOf(minW), weights.indexOf(maxW)]);
  let valueLabels = '';
  specialIdx.forEach(i => {
    const x = toX(i);
    const y = toY(weights[i]);
    const above = y > PAD_T + 20;
    valueLabels += `<text x="${x.toFixed(1)}" y="${(above ? y - 8 : y + 18).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="rgba(255,255,255,0.9)">${weights[i].toFixed(1)}</text>`;
  });

  let xAxis = '';
  const step = n <= 8 ? 1 : Math.ceil(n / 6);
  for (let i = 0; i < n; i += step) {
    xAxis += `<text x="${toX(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.7)">${labels[i]}</text>`;
  }

  [[minW, 'min'], [maxW, 'max']].forEach(([w, tag]) => {
    const vy = toY(w);
    valueLabels += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${fill}${polyline}${dots}${valueLabels}${xAxis}</svg>`;
}

// NEW: Garmin HR Zones Stacked Bar Chart
function renderHrZonesChart(container, weekLabels, zonesData) {
  if (!container) return;
  const hasData = zonesData.some(week => week.some(z => z > 0));
  if (!hasData || weekLabels.length === 0) {
     container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Import .FIT data to view HR zones.</p>';
     return;
  }

  const W = 400, H = 160, PAD_L = 40, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;
  const barW = Math.max(12, Math.floor(chartW / n) - 8);

  const colors = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
  let bars = '';

  weekLabels.forEach((label, i) => {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const weekZones = zonesData[i];
    const totalTime = weekZones.reduce((a,b)=>a+b, 0) || 1; 

    let currentY = PAD_T + chartH;

    weekZones.forEach((zTime, zIdx) => {
       if(zTime <= 0) return;
       const h = (zTime / totalTime) * chartH;
       currentY -= h;
       bars += `<rect x="${x.toFixed(1)}" y="${currentY.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="${colors[zIdx]}" opacity="0.9"/>`;
    });
  });

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = PAD_L + (i / n) * chartW + chartW / n / 2;
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  let yAxis = '';
  [0, 50, 100].forEach(pct => {
     const vy = PAD_T + chartH - (pct/100)*chartH;
     yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.6)">${pct}%</text>
               <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${xAxis}</svg>`;
}

// NEW: Garmin Cadence Line Chart
function renderCadenceChart(container, weekLabels, cadenceData) {
  if (!container) return;
  const valid = cadenceData.filter(c => c > 0);
  if (valid.length === 0 || weekLabels.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Import .FIT data to view cadence trends.</p>';
    return;
  }

  const W = 400, H = 150, PAD_L = 40, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;

  const minC = Math.max(120, Math.min(...valid) - 5);
  const maxC = Math.max(...valid) + 5;
  const rangeC = Math.max(maxC - minC, 10);

  const toX = i => PAD_L + (i / n) * chartW + chartW / n / 2;
  const toY = c => PAD_T + chartH - ((c - minC) / rangeC) * chartH;

  let points = '';
  let dots = '';
  weekLabels.forEach((label, i) => {
    const c = cadenceData[i];
    if (c > 0) {
      const x = toX(i), y = toY(c);
      points += `${x.toFixed(1)},${y.toFixed(1)} `;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#f59e0b" stroke="#111827" stroke-width="2"/>
               <text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#f59e0b">${Math.round(c)}</text>`;
    }
  });

  const line = points.trim().split(' ').length >= 2
    ? `<polyline fill="none" stroke="#f59e0b" stroke-width="3" stroke-linejoin="round" points="${points.trim()}"/>` : '';

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = toX(i);
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  let yAxis = '';
  [minC, Math.round((minC+maxC)/2), maxC].forEach(val => {
     const vy = toY(val);
     yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.6)">${val}</text>
               <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${line}${dots}${xAxis}</svg>`;
}

// Multi-line estimated-1RM progression for the big-3 lifts (squat / bench /
// deadlift), one polyline each. Fed by engine.computeBig3Progression(). Weeks
// with no data for a lift are gaps in that lift's line (segments connect only
// consecutive logged weeks).
function renderBig3ProgressionChart(container, progression, weekLabels) {
  if (!container) return;
  const n = weekLabels.length;

  const series = [
    { key: 'squat',    label: 'Squat',    color: '#3b82f6' },
    { key: 'bench',    label: 'Bench',    color: '#f59e0b' },
    { key: 'deadlift', label: 'Deadlift', color: '#ef4444' },
  ];

  // Collect every plotted e1RM to size the Y axis; bail if nothing logged.
  const allVals = [];
  series.forEach(s => {
    for (let i = 0; i < n; i++) {
      const v = progression?.[s.key]?.byWeek?.[String(i + 1)] || 0;
      if (v > 0) allVals.push(v);
    }
  });

  if (allVals.length === 0 || n === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Complete big-3 sets to see 1RM progression.</p>';
    return;
  }

  const W = 400, H = 180, PAD_L = 44, PAD_B = 30, PAD_T = 15, PAD_R = 15;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;

  const minV = Math.max(0, Math.min(...allVals) - 10);
  const maxV = Math.max(...allVals) + 10;
  const rangeV = Math.max(maxV - minV, 10);

  const toX = i => PAD_L + (i / n) * chartW + chartW / n / 2;
  const toY = v => PAD_T + chartH - ((v - minV) / rangeV) * chartH;

  let yAxis = '';
  [minV, (minV + maxV) / 2, maxV].forEach(val => {
    const vy = toY(val);
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.6)">${Math.round(val)}</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  let lines = '';
  series.forEach(s => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = progression?.[s.key]?.byWeek?.[String(i + 1)] || 0;
      if (v > 0) pts.push({ x: toX(i), y: toY(v) });
    }
    if (pts.length >= 2) {
      const poly = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      lines += `<polyline fill="none" stroke="${s.color}" stroke-width="3" stroke-linejoin="round" points="${poly}"/>`;
    }
    pts.forEach(p => {
      lines += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${s.color}" stroke="#111827" stroke-width="2"/>`;
    });
  });

  let xAxis = '';
  weekLabels.forEach((label, i) => {
    const lx = toX(i);
    xAxis += `<text x="${lx.toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="11" font-weight="600" fill="rgba(255,255,255,0.85)">${label}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${lines}${xAxis}</svg>`;
}
function collectAnalyticsData() {
  const appState = _getState();
  const DEFAULT_DAYS = _getDays();
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;

  const data = {
    dynamicStats: {},
    weekLabels: [],
    volData: [],
    runData: [],
    rpeData: [],
    paceData: [],
    
    cadenceData: [],
    teData: [],
    gymHrData: [],
    gymCalsData: [],
    hrZonesData: [], 
    
    globalTotalDist: 0,
    globalTotalElev: 0,
    globalTotalCals: 0,
    globalTotalSets: 0,
    globalTotalVol: 0,
    absoluteMesoPeakVol: 0,
    
    globalTotalGymCals: 0,
    globalAvgGymHr: 0,

    thresholdSecs: appState.thresholdPaceSeconds || null,
    bodyWeightLog: appState.bodyWeightLog || []
  };

  if (appState.weeks) {
    Object.keys(appState.weeks).forEach(wKey => {
      const wkData = appState.weeks[wKey];
      if (!wkData || !wkData.lifts) return;

      DEFAULT_DAYS.forEach(d => {
        const dayLifts = wkData.lifts[d];
        if (!dayLifts) return;

        for (const lift in dayLifts) {
          if (!Array.isArray(dayLifts[lift])) continue;
          
          if (!data.dynamicStats[lift]) {
            data.dynamicStats[lift] = { allTimeMax: 0, currentEstimatedMax: 0, previousWeekMax: 0 };
          }

          const prevWeek = (parseInt(appState.currentWeek, 10) - 1).toString();

          dayLifts[lift].forEach(s => {
            const isCompleted = s.c === true || s.c === "true" || s.c === "on" || s.c === 1;
            const weight = parseFloat(s.w) || 0;
            const reps = parseInt(s.r, 10) || 0;
            
            if (isCompleted && weight > 0 && reps > 0) {
              const e1rm = weight * (1 + reps / 30);
              if (e1rm > data.dynamicStats[lift].allTimeMax) {
                 data.dynamicStats[lift].allTimeMax = e1rm;
              }
              if (wKey === appState.currentWeek && e1rm > data.dynamicStats[lift].currentEstimatedMax) {
                 data.dynamicStats[lift].currentEstimatedMax = e1rm;
              }
              if (wKey === prevWeek && e1rm > data.dynamicStats[lift].previousWeekMax) {
                 data.dynamicStats[lift].previousWeekMax = e1rm;
              }
            }
          });
        }
      });
    });
  }

  for (let w = 1; w <= maxWeek; w++) {
    const wKey = w.toString();
    data.weekLabels.push('W' + w);
    const wkData = appState.weeks?.[wKey];

    if (!wkData) {
      data.volData.push(0); data.runData.push(0); data.rpeData.push(0); data.paceData.push(0);
      data.cadenceData.push(0); data.teData.push(0); data.gymHrData.push(0); data.gymCalsData.push(0); data.hrZonesData.push([0,0,0,0,0]);
      continue;
    }

    let weekVol = 0, weekDist = 0, weekElev = 0, weekCals = 0;
    let weekRpeSum = 0, weekRpeCount = 0;
    let weekRunTime = 0, weekRunDist = 0;
    
    let weekCadenceSum = 0, weekCadenceCount = 0;
    let weekTeSum = 0, weekTeCount = 0;
    let weekGymHrSum = 0, weekGymHrCount = 0;
    let weekGymCals = 0;
    let weekHrZones = [0, 0, 0, 0, 0];

    DEFAULT_DAYS.forEach(d => {
      const run = wkData.runs?.[d] || {};
      const dist = parseFloat(run.dist) || 0;
      const elev = parseFloat(run.elev) || 0;
      const cals = parseFloat(run.cals) || 0;
      weekDist += dist; weekElev += elev; weekCals += cals;

      const paceS = parsePaceSeconds(dist, run.time || '');
      if (paceS > 0 && dist > 0) { weekRunTime += paceS * dist; weekRunDist += dist; }

      const runRpe = parseFloat(run.rpe) || 0;
      if (runRpe > 0) { weekRpeSum += runRpe; weekRpeCount++; }

      if (run.avgCadence) { weekCadenceSum += parseFloat(run.avgCadence); weekCadenceCount++; }
      if (run.trainingEffect) { weekTeSum += parseFloat(run.trainingEffect); weekTeCount++; }
      if (run.hrZones && Array.isArray(run.hrZones)) {
        run.hrZones.forEach((z, i) => { if(i < 5) weekHrZones[i] += (parseFloat(z) || 0); });
      }

      const gymRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
      if (gymRpe > 0) { weekRpeSum += gymRpe; weekRpeCount++; }
      
      const gym = wkData.gymStats?.[d] || {};
      if (gym.avgHR) { weekGymHrSum += parseFloat(gym.avgHR); weekGymHrCount++; }
      if (gym.cals) { weekGymCals += parseFloat(gym.cals); weekCals += parseFloat(gym.cals); }

      const dayLifts = wkData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          const isCompleted = s.c === true || s.c === "true" || s.c === "on" || s.c === 1;
          if (isCompleted) {
            weekVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
            data.globalTotalSets++;
          }
        });
      }
    });

    data.globalTotalDist += weekDist;
    data.globalTotalElev += weekElev;
    data.globalTotalCals += weekCals;
    data.globalTotalVol  += weekVol;
    if (weekVol > data.absoluteMesoPeakVol) data.absoluteMesoPeakVol = weekVol;

    data.volData.push(weekVol);
    data.runData.push(weekDist);
    data.rpeData.push(weekRpeCount > 0 ? weekRpeSum / weekRpeCount : 0);
    data.paceData.push(weekRunDist > 0 ? weekRunTime / weekRunDist : 0);
    
    data.cadenceData.push(weekCadenceCount > 0 ? weekCadenceSum / weekCadenceCount : 0);
    data.teData.push(weekTeCount > 0 ? weekTeSum / weekTeCount : 0);
    data.gymHrData.push(weekGymHrCount > 0 ? weekGymHrSum / weekGymHrCount : 0);
    data.gymCalsData.push(weekGymCals);
    data.hrZonesData.push(weekHrZones);
  }

  // Calculate Global Gym Metrics
  data.globalTotalGymCals = data.gymCalsData.reduce((a,b)=>a+b, 0);
  const validGymHr = data.gymHrData.filter(h=>h>0);
  data.globalAvgGymHr = validGymHr.length ? validGymHr.reduce((a,b)=>a+b, 0) / validGymHr.length : 0;

  return data;
}

// ==========================================
// SUB-RENDERERS (PHASE 5)
// ==========================================
const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

function renderStrengthAnalytics(data) {
  setText('allTimeTotalVol', Math.round(data.globalTotalVol).toLocaleString() + ' kg');
  setText('allTimeTotalSets', data.globalTotalSets.toLocaleString());
  setText('analyticsPeakVol', data.absoluteMesoPeakVol.toLocaleString() + ' kg peak');
  
  // Inject the new Gym Metrics
  const gymHrEl = document.getElementById('allTimeGymHr');
  const gymCalsEl = document.getElementById('allTimeGymCals');
  if (gymHrEl) gymHrEl.textContent = data.globalAvgGymHr > 0 ? Math.round(data.globalAvgGymHr) + ' bpm' : '-- bpm';
  if (gymCalsEl) gymCalsEl.textContent = Math.round(data.globalTotalGymCals).toLocaleString();

  renderVolumeChart(document.getElementById('volumeChartContainer'), data.weekLabels, data.volData, data.runData);
  
  const rmContainer = document.getElementById('allLiftsRmContainer');
  if (rmContainer) render1RMList(rmContainer, data.dynamicStats);
}

// ==========================================
// PER-RUN STREAM CHARTS (Step 5) — fed from IndexedDB stream objects.
// Generic XY renderer; thin wrappers build points from a stream's arrays.
// ==========================================
function renderXYChart(container, points, opts = {}) {
  if (!container) return;
  const pts = (points || []).filter(p => p && isFinite(p.x) && isFinite(p.y));
  if (pts.length < 2) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;padding:10px 0;">${opts.emptyMsg || 'No data in this run.'}</p>`;
    return;
  }
  const color = opts.color || '#22d3ee';
  const W = 400, H = 160, PAD_L = 46, PAD_B = 26, PAD_T = 12, PAD_R = 12;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_B - PAD_T;

  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  const padY = (maxY - minY) * 0.08 || 1;
  minY -= padY; maxY += padY;
  const rangeX = (maxX - minX) || 1, rangeY = (maxY - minY) || 1;

  const toX = x => PAD_L + ((x - minX) / rangeX) * chartW;
  const toY = y => PAD_T + chartH - ((y - minY) / rangeY) * chartH;

  const poly = pts.map(p => `${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(' ');

  let area = '';
  if (opts.area) {
    area = `<polygon fill="${color}" fill-opacity="0.15" stroke="none"
      points="${toX(minX).toFixed(1)},${(PAD_T + chartH).toFixed(1)} ${poly} ${toX(maxX).toFixed(1)},${(PAD_T + chartH).toFixed(1)}"/>`;
  }

  const fmtY = opts.yFmt || (v => Math.round(v));
  let yAxis = '';
  [minY, (minY + maxY) / 2, maxY].forEach(v => {
    const vy = toY(v);
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.6)">${fmtY(v)}</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  const fmtX = opts.xFmt || (v => v.toFixed(1));
  let xAxis = '';
  [minX, (minX + maxX) / 2, maxX].forEach(v => {
    xAxis += `<text x="${toX(v).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.75)">${fmtX(v)}</text>`;
  });
  if (opts.xLabel) {
    xAxis += `<text x="${(PAD_L + chartW / 2).toFixed(1)}" y="${H - 16}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.4)">${opts.xLabel}</text>`;
  }

  const line = `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${poly}"/>`;
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${area}${line}${xAxis}</svg>`;
}

// Smooth a pace series with a small moving average so per-sample noise (GPS
// jitter) doesn't dominate the chart.
function smooth(values, win = 5) {
  const n = values.length, out = new Array(n);
  const h = Math.floor(win / 2);
  for (let i = 0; i < n; i++) {
    let sum = 0, c = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j++) { sum += values[j]; c++; }
    out[i] = c ? sum / c : values[i];
  }
  return out;
}

function renderStreamCharts(stream) {
  const paceEl = document.getElementById('runPaceDistContainer');
  const hrEl   = document.getElementById('runHrCurveContainer');
  const elevEl = document.getElementById('runElevProfileContainer');
  const wrap   = document.getElementById('runStreamSection');

  if (!stream || !stream.n) {
    if (wrap) wrap.style.display = 'none';
    return;
  }
  if (wrap) wrap.style.display = 'block';

  const dist = stream.distKm || [];
  const hasDist = dist.length > 0;
  const xOf = i => hasDist ? dist[i] : ((stream.t?.[i] || 0) / 60); // km or minutes
  const xLabel = hasDist ? 'Distance (km)' : 'Time (min)';

  // Pace over distance (min/km), smoothed; drop paused (0) samples.
  if (paceEl) {
    const pace = smooth(stream.paceSecPerKm || []);
    const pts = [];
    pace.forEach((p, i) => { if (p > 0) pts.push({ x: xOf(i), y: p }); });
    renderXYChart(paceEl, pts, {
      color: '#ec4899', xLabel,
      yFmt: secs => { const m = Math.floor(secs / 60), s = Math.round(secs % 60).toString().padStart(2, '0'); return `${m}:${s}`; },
      xFmt: v => v.toFixed(1),
      emptyMsg: 'No pace stream in this run.',
    });
  }

  // HR curve.
  if (hrEl) {
    const hr = stream.hr || [];
    const pts = [];
    hr.forEach((h, i) => { if (h > 0) pts.push({ x: xOf(i), y: h }); });
    renderXYChart(hrEl, pts, { color: '#ef4444', xLabel, emptyMsg: 'No HR stream in this run.' });
  }

  // Elevation profile (area).
  if (elevEl) {
    const alt = stream.altitude || [];
    const pts = [];
    alt.forEach((a, i) => { if (isFinite(a)) pts.push({ x: xOf(i), y: a }); });
    renderXYChart(elevEl, pts, { color: '#10b981', area: true, xLabel, emptyMsg: 'No elevation stream in this run.' });
  }
}

// Find the most recent (highest week, then latest weekday) run flagged
// hasStreams, then load + render its streams from IndexedDB. Async, mirrors
// the home mini-map pattern: fire-and-forget after the synchronous render.
function loadAndRenderLatestRunStream() {
  const appState = _getState();
  const DEFAULT_DAYS = _getDays();
  const weekKeys = Object.keys(appState.weeks || {}).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
  for (const wkNum of weekKeys) {
    const wkData = appState.weeks[String(wkNum)];
    if (!wkData?.runs) continue;
    for (let i = DEFAULT_DAYS.length - 1; i >= 0; i--) {
      const day = DEFAULT_DAYS[i];
      if (wkData.runs[day]?.hasStreams) {
        getStreamFromDB(wkNum, day, 'run')
          .then(stream => renderStreamCharts(stream))
          .catch(() => renderStreamCharts(null));
        return;
      }
    }
  }
  renderStreamCharts(null); // nothing with streams yet
}

function renderRunningAnalytics(data) {
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

  // Inject the new Garmin Charts
  renderHrZonesChart(document.getElementById('hrZonesChartContainer'), data.weekLabels, data.hrZonesData);
  renderCadenceChart(document.getElementById('cadenceChartContainer'), data.weekLabels, data.cadenceData);

  // Per-run streams (async — renders when IndexedDB resolves).
  loadAndRenderLatestRunStream();
}

function renderRecoveryAnalytics(data) {
  const appState    = _getState();
  const defaultDays = _getDays();
  const wk          = appState.currentWeek || '1';
  const weekData    = appState.weeks?.[wk];

  let totalRpe = 0, rpeCount = 0;
  if (weekData) {
    defaultDays.forEach(d => {
      const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
      const gRpe = parseInt(weekData.gymRpe?.[d], 10)   || 0;
      if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
      if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    });
  }

  const avgRpe = rpeCount > 0 ? (totalRpe / rpeCount) : 0;
  let statusLabel = '--', statusColor = 'var(--text-muted)', interpretation = 'Log workouts to see recovery status.';
  if (rpeCount > 0) {
    if (avgRpe < 6) {
      statusLabel     = 'Fresh';
      statusColor     = '#10b981';
      interpretation  = 'Low fatigue this week. Good time to push intensity.';
    } else if (avgRpe < 8) {
      statusLabel     = 'Accumulating';
      statusColor     = '#f59e0b';
      interpretation  = 'Moderate fatigue. Stick to planned volume and prioritise sleep.';
    } else {
      statusLabel     = 'High Load';
      statusColor     = '#ef4444';
      interpretation  = 'High fatigue this week. Consider reducing volume or taking a rest day.';
    }
  }

  const section = document.getElementById('analytics-recovery');
  if (!section) return;

  let summaryEl = section.querySelector('.recovery-summary-cards');
  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.className = 'recovery-summary-cards grid-2-col gap-2 mb-3';
    const chartArticle = section.querySelector('article');
    if (chartArticle) section.insertBefore(summaryEl, chartArticle);
    else section.appendChild(summaryEl);
  }
  summaryEl.innerHTML = `
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(16,185,129,0.3);">
      <div class="text-xs text-muted mb-1">Avg RPE This Week</div>
      <div class="text-lg font-heavy" style="color:${statusColor};">${rpeCount > 0 ? avgRpe.toFixed(1) : '--'}</div>
      <div class="text-xs font-bold mt-1" style="color:${statusColor};">${statusLabel}</div>
    </article>
    <article class="card-dark flex-col flex-center p-3" style="border:1px solid rgba(59,130,246,0.3);">
      <div class="text-xs text-muted mb-1">Sessions Logged</div>
      <div class="text-lg font-heavy text-inverse">${rpeCount}</div>
      <div class="text-xs text-muted mt-1">this week</div>
    </article>
  `;

  let interpEl = section.querySelector('.recovery-interpretation');
  if (!interpEl) {
    interpEl = document.createElement('article');
    interpEl.className = 'recovery-interpretation card-dark p-3 mb-3';
    const chartArticle = section.querySelector('article:not(.recovery-summary-cards article)');
    if (chartArticle) section.insertBefore(interpEl, chartArticle);
    else section.appendChild(interpEl);
  }
  interpEl.innerHTML = `<div class="text-sm text-muted" style="line-height:1.5;">${interpretation}</div>`;

  renderRpeChart(document.getElementById('rpeTrendContainer'), data.weekLabels, data.rpeData);
}

function renderBodyWeightAnalytics(data) {
  const bwContainer = document.getElementById('bwChartContainer');
  renderBodyWeightChart(bwContainer, data.bodyWeightLog);
}

function renderProgressAnalytics(data) {
  const tbody = document.getElementById('analyticsTimelineTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    const currentWeekStr = _getState().currentWeek;
    data.weekLabels.forEach((lbl, i) => {
      const wKey = (i + 1).toString();
      const isActive = wKey === currentWeekStr;
      const avgPace = data.paceData[i] > 0 ? formatPace(data.paceData[i]) : '--';
      const avgRpe  = data.rpeData[i]  > 0 ? data.rpeData[i].toFixed(1) : '--';
      const rpeStyle = data.rpeData[i] > 0 ? `color:${rpeColour(data.rpeData[i])};font-weight:700;` : '';
      const paceColour = data.paceData[i] > 0 ? paceZoneColour(data.paceData[i], data.thresholdSecs) : '#ffffff';
      
      const tr = document.createElement('tr');
      if (isActive) tr.style.background = 'rgba(59,130,246,0.1)'; 
      
      tr.innerHTML =
        `<td class="py-2"><strong style="${isActive ? 'color:#3b82f6;' : 'color:#fff;'}">${lbl}</strong></td>` +
        `<td class="py-2" style="color:#fff;">${data.volData[i] > 0 ? data.volData[i].toLocaleString() + ' kg' : '--'}</td>` +
        `<td class="py-2" style="color:#fff;">${data.runData[i] > 0 ? data.runData[i].toFixed(1) + ' km' : '--'}</td>` +
        `<td class="py-2" style="color:${paceColour};font-variant-numeric:tabular-nums;">${avgPace}</td>` +
        `<td class="py-2" style="${rpeStyle}">${avgRpe}</td>`;
      tbody.appendChild(tr);
    });
  }
}

function render1RMList(container, dynamicStats) {
  const entries = Object.entries(dynamicStats)
    .filter(([, v]) => v.allTimeMax > 0)
    .sort(([, a], [, b]) => b.allTimeMax - a.allTimeMax);

  if (entries.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Complete sets to populate lift PRs.</p>';
    return;
  }

  const prCount = entries.filter(([, v]) => {
    const cur = v.currentEstimatedMax || 0;
    return cur > 0 && Math.abs(cur - v.allTimeMax) < 0.5;
  }).length;

  const maxAllTime = entries[0][1].allTimeMax;
  const rows = entries.map(([name, statData]) => {
    const pct   = Math.min(100, Math.max(5, Math.round((statData.allTimeMax / maxAllTime) * 100)));
    const cur   = statData.currentEstimatedMax || 0;
    const prev  = statData.previousWeekMax || 0;
    const isCurrentWeekPR = cur > 0 && Math.abs(cur - statData.allTimeMax) < 0.5;

    const badge = isCurrentWeekPR
      ? `<span style="font-size:0.7rem;background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981;border-radius:4px;padding:2px 6px;margin-left:6px;">PR</span>`
      : '';

    let deltaHtml = '';
    if (cur > 0 && prev > 0) {
      const delta = cur - prev;
      const sign  = delta >= 0 ? '+' : '';
      const col   = delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : 'var(--text-muted)';
      deltaHtml   = `<span style="font-size:0.72rem;color:${col};margin-left:6px;">${sign}${Math.round(delta)} kg vs last wk</span>`;
    } else if (cur > 0) {
      deltaHtml = `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">This week: ~${Math.round(cur)} kg</span>`;
    }

    return `<div class="mb-4">
      <div class="flex-between font-bold mb-1">
        <span class="text-inverse text-sm">${name}${badge}</span>
        <span style="color:#3b82f6;" class="text-base">${Math.round(statData.allTimeMax)} kg</span>
      </div>
      ${deltaHtml ? `<div class="mb-2">${deltaHtml}</div>` : ''}
      <div class="trend-track-bg" style="height:10px;border-radius:5px;">
        <div class="trend-track-fill" style="width:${pct}%;background:#3b82f6;border-radius:5px;"></div>
      </div>
    </div>`;
  }).join('');

  const summaryBar = prCount > 0
    ? `<div class="flex-between mb-4 p-3 card-dark" style="border:1px solid rgba(16,185,129,0.3);">
        <span class="text-sm text-muted">PRs set this week</span>
        <span class="font-heavy" style="color:#10b981;">${prCount} lift${prCount !== 1 ? 's' : ''} 🏆</span>
       </div>`
    : '';

  container.innerHTML = summaryBar + rows;
}

// ==========================================
// MASTER ROUTER (PHASE 7)
// ==========================================
export function renderAnalytics() {
  if (!_getState || !_getDays) return;

  const data = collectAnalyticsData();
  const context = _analyticsContext || 'overview';

  document.querySelectorAll('.analytics-section').forEach(sec => sec.classList.remove('active'));

  switch(context) {
    case 'strength':
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data);
      break;
    case 'strength_pr':
      document.getElementById('analytics-strength_pr').classList.add('active');
      const prContainer = document.getElementById('allLiftsRmContainer_PR');
      if (prContainer) render1RMList(prContainer, data.dynamicStats);
      const big3El = document.getElementById('big3ProgressionContainer');
      if (big3El) renderBig3ProgressionChart(big3El, computeBig3Progression(_getState()), data.weekLabels);
      break;
    case 'running':
      document.getElementById('analytics-running').classList.add('active');
      renderRunningAnalytics(data);
      break;
    case 'recovery':
      document.getElementById('analytics-recovery').classList.add('active');
      renderRecoveryAnalytics(data);
      break;
    case 'recovery-score':
      document.getElementById('analytics-recovery-score').classList.add('active');
      renderRecoveryScoreDetail(data);
      break;
    case 'bodyweight':
      document.getElementById('analytics-bodyweight').classList.add('active');
      renderBodyWeightAnalytics(data);
      break;
    case 'progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressAnalytics(data);
      break;
    case 'weekly-volume':
      document.getElementById('analytics-weekly-volume').classList.add('active');
      renderWeeklyVolumeDetail(data);
      break;
    case 'streak':
      document.getElementById('analytics-streak').classList.add('active');
      renderStreakDetail(data);
      break;
    case 'active-fuel':
      document.getElementById('analytics-active-fuel').classList.add('active');
      renderActiveFuelDetail(data);
      break;
    case 'stress-balance':
      document.getElementById('analytics-stress-balance').classList.add('active');
      renderStressBalanceDetail(data);
      break;
    case 'goal-progress':
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressAnalytics(data);
      renderGoalProgressDetail(data);
      break;
    default:
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data);
  }
}

function renderRecoveryScoreDetail(data) {
  const appState = _getState();
  const defaultDays = _getDays();
  const r = computeRecoveryScore(appState, defaultDays);

  const heroEl  = document.getElementById('recoveryScoreHero');
  const rpeEl   = document.getElementById('recoveryAvgRpe');
  const fatEl   = document.getElementById('recoveryFatigueScore');
  const restEl  = document.getElementById('recoveryRestScore');
  const restDEl = document.getElementById('recoveryRestDays');
  const recEl   = document.getElementById('recoveryRecommendation');

  if (heroEl)  heroEl.textContent  = r.hasData ? `${r.score}%` : '--';
  if (rpeEl)   rpeEl.textContent   = r.hasData ? r.avgRpe.toFixed(1) : '--';
  if (fatEl)   fatEl.textContent   = r.hasData ? `${r.fatigueScore}%` : '--';
  if (restEl)  restEl.textContent  = r.hasData ? `${r.restScore}%` : '--';
  if (restDEl) restDEl.textContent = r.hasData ? `${r.restDays} / ${defaultDays.length}` : '--';
  if (recEl)   recEl.textContent   = r.recommendation;

  const trendEl = document.getElementById('rpeTrendContainerDetail');
  if (trendEl) renderRpeTrendChart(trendEl, data);
}

function renderWeeklyVolumeDetail(data) {
  const appState = _getState();
  const defaultDays = _getDays();
  const wk = appState.currentWeek || '1';
  const weekData = appState.weeks?.[wk];

  let totalSets = 0, totalReps = 0, totalVol = 0;
  if (weekData) {
    defaultDays.forEach(d => {
      const dayLifts = weekData.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (Array.isArray(dayLifts[lift])) {
          dayLifts[lift].forEach(s => {
            if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) {
              const w = parseFloat(s.w) || 0;
              const r = parseInt(s.r, 10) || 0;
              totalVol  += w * r;
              totalSets += 1;
              totalReps += r;
            }
          });
        }
      }
    });
  }

  const setsEl    = document.getElementById('weekVolTotalSets');
  const repsEl    = document.getElementById('weekVolTotalReps');
  const tonnageEl = document.getElementById('weekVolTonnage');

  if (setsEl)    setsEl.textContent    = totalSets.toLocaleString();
  if (repsEl)    repsEl.textContent    = totalReps.toLocaleString();
  if (tonnageEl) tonnageEl.textContent = totalVol >= 1000
    ? `${(totalVol / 1000).toFixed(2)}t`
    : `${Math.round(totalVol).toLocaleString()} kg`;

  const chartEl = document.getElementById('weekVolChartContainer');
  if (chartEl) {
    renderVolumeChart(
      chartEl,
      data.weekLabels || [],
      data.volData || [],
      data.runData || []
    );
  }
}

function renderStreakDetail(data) {
  const appState = _getState();
  const sv = computeStreakView(appState.streakData);

  const currentEl = document.getElementById('streakCurrent');
  const longestEl = document.getElementById('streakLongest');
  const detailEl  = document.getElementById('streakDetailContainer');

  if (currentEl) currentEl.textContent = `${sv.current} day${sv.current !== 1 ? 's' : ''}`;
  if (longestEl) longestEl.textContent = `${sv.longest} day${sv.longest !== 1 ? 's' : ''}`;

  if (!detailEl) return;

  if (!sv.hasData) {
    detailEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.75rem;">Complete a workout or log a run to start your streak. Each calendar day with logged activity keeps it alive.</p>';
    return;
  }

  const msg = sv.broken
    ? 'Your streak lapsed — log today to start a fresh one.'
    : sv.current >= 7
    ? `🔥 ${sv.current}-day streak! Momentum is everything.`
    : sv.current >= 3
    ? `💪 ${sv.current} days in a row. Keep it going!`
    : `${sv.current} day streak. Every day counts.`;

  const lastNice = sv.lastActivityDate
    ? new Date(sv.lastActivityDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '--';

  detailEl.innerHTML = `
    <div class="card-dark p-3 mb-3" style="border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">
      <div class="font-heavy text-inverse" style="font-size:1rem;">${msg}</div>
    </div>
    <div class="flex-between mb-2" style="font-size:0.8rem;">
      <span class="text-muted">Current streak</span>
      <span class="font-heavy text-inverse">${sv.current} day${sv.current !== 1 ? 's' : ''}</span>
    </div>
    <div class="flex-between mb-2" style="font-size:0.8rem;">
      <span class="text-muted">Personal best streak</span>
      <span class="font-heavy text-inverse">${sv.longest} day${sv.longest !== 1 ? 's' : ''}</span>
    </div>
    <div class="flex-between" style="font-size:0.8rem;">
      <span class="text-muted">Last active day</span>
      <span class="font-heavy text-inverse">${lastNice}</span>
    </div>
  `;
}

function renderRpeTrendChart(container, data) {
  if (!container) return;
  const existingContainer = document.getElementById('rpeTrendContainer');
  const savedContent = existingContainer ? existingContainer.innerHTML : '';

  if (existingContainer) existingContainer.id = '_rpeTrendContainer_swap';
  container.id = 'rpeTrendContainer';
  try {
    renderRecoveryAnalytics(data);
  } finally {
    container.id = 'rpeTrendContainerDetail';
    if (existingContainer) {
      existingContainer.id = 'rpeTrendContainer';
      existingContainer.innerHTML = savedContent;
    }
  }
}

function renderGoalProgressDetail(data) {
  const appState = _getState();
  const activeProgram = getProgramById(appState.activeProgramId);

  const wk    = parseInt(appState.currentWeek, 10) || 1;
  const total = activeProgram.totalWeeks || 12; 
  const pct   = Math.round((wk / total) * 100);

  const goalEl = document.getElementById('analytics-goal-detail');
  if (!goalEl) return;

  const remaining = total - wk;
  const milestones = [
    { week: 4,  label: '1-month check-in' },
    { week: 8,  label: 'Mid-program peak' },
    { week: 12, label: 'Program completion' },
  ];
  const nextMilestone = milestones.find(m => m.week >= wk) || milestones[milestones.length - 1];

  goalEl.innerHTML = `
    <h2 class="section-header mt-4">Program Goal Progress</h2>
    <article class="card-dark p-4 mb-4">
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">Mesocycle progress</span>
        <span class="font-heavy text-inverse">Wk ${wk} / ${total}</span>
      </div>
      <div style="height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;margin-bottom:12px;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--color-blue),var(--color-indigo,#6366f1));border-radius:4px;transition:width 0.5s var(--ease-out);"></div>
      </div>
      <div class="flex-between mb-2" style="font-size:0.8rem;">
        <span class="text-muted">Completion</span>
        <span class="font-heavy text-inverse">${pct}%</span>
      </div>
      <div class="flex-between mb-2" style="font-size:0.8rem;">
        <span class="text-muted">Weeks remaining</span>
        <span class="font-heavy text-inverse">${remaining}</span>
      </div>
      <div class="flex-between" style="font-size:0.8rem;">
        <span class="text-muted">Next milestone</span>
        <span class="font-heavy text-accent-blue">Wk ${nextMilestone.week} — ${nextMilestone.label}</span>
      </div>
    </article>
    <h2 class="section-header mt-2">Weekly Completion vs Target</h2>
    <article class="card-dark p-3 mb-4">
      <div class="flex gap-3 mb-2 font-bold" style="font-size:0.65rem;">
        <span style="color:#3b82f6;">● Actual completion</span>
        <span style="color:rgba(255,255,255,0.5);">● Linear target</span>
      </div>
      <div id="goalCompletionChartContainer"></div>
    </article>
  `;

  const chartEl = document.getElementById('goalCompletionChartContainer');
  if (chartEl) {
    const series = computeWeeklyCompletionSeries(appState, activeProgram, _getDays(), total);
    renderCompletionVsTargetChart(chartEl, series);
  }
}

// Weekly completion % (bars) with a 100%-target reference line. Weeks past the
// current week are shown faded (not yet due).
function renderCompletionVsTargetChart(container, series) {
  if (!container) return;
  const n = series.length;
  if (n === 0) { container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;">No program data.</p>'; return; }

  const appState = _getState();
  const curWk = parseInt(appState.currentWeek, 10) || 1;

  const W = 400, H = 170, PAD_L = 36, PAD_B = 26, PAD_T = 12, PAD_R = 12;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_B - PAD_T;
  const barW = Math.max(6, Math.floor(chartW / n) - 5);
  const toY = pct => PAD_T + chartH - (pct / 100) * chartH;

  let bars = '', xAxis = '';
  series.forEach((pct, i) => {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const y = toY(pct);
    const due = (i + 1) <= curWk;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${(PAD_T + chartH - y).toFixed(1)}"
      rx="2" fill="#3b82f6" fill-opacity="${due ? 0.95 : 0.3}"/>`;
    if (i % 2 === 0 || n <= 8) {
      xAxis += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.7)">W${i + 1}</text>`;
    }
  });

  const targetY = toY(100);
  const target = `<line x1="${PAD_L}" y1="${targetY.toFixed(1)}" x2="${W - PAD_R}" y2="${targetY.toFixed(1)}" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-dasharray="4 3"/>`;

  let yAxis = '';
  [0, 50, 100].forEach(v => {
    const vy = toY(v);
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.6)">${v}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${target}${xAxis}</svg>`;
}

// ---- ACTIVE FUEL detail: weekly calories trend ----------------------------
function renderActiveFuelDetail(data) {
  const appState = _getState();
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;
  const series = computeWeeklyCaloriesSeries(appState, _getDays(), maxWeek);

  const total = series.reduce((a, b) => a + b, 0);
  const active = series.filter(v => v > 0);
  const avg = active.length ? Math.round(total / active.length) : 0;

  setText('fuelTotalCals', total.toLocaleString());
  setText('fuelAvgCals', avg.toLocaleString());
  const wk = parseInt(appState.currentWeek, 10) || 1;
  setText('fuelThisWeekCals', (series[wk - 1] || 0).toLocaleString());

  const chartEl = document.getElementById('fuelChartContainer');
  if (chartEl) {
    const pts = series.map((v, i) => ({ x: i + 1, y: v }));
    renderXYChart(chartEl, pts.filter(p => p.y > 0).length >= 2 ? pts : [], {
      color: '#f59e0b', area: true, xLabel: 'Week',
      xFmt: v => `W${Math.round(v)}`, yFmt: v => Math.round(v).toLocaleString(),
      emptyMsg: 'Log sessions with calories (or import .FIT) to see your fuel trend.',
    });
  }
}

// ---- STRESS BALANCE detail: weekly lift-vs-run load -----------------------
function renderStressBalanceDetail(data) {
  const appState = _getState();
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;
  const { lift, run } = computeWeeklyLoadSeries(appState, _getDays(), maxWeek);

  const liftTotal = lift.reduce((a, b) => a + b, 0);
  const runTotal = run.reduce((a, b) => a + b, 0);
  const grand = liftTotal + runTotal;
  const liftPct = grand > 0 ? Math.round((liftTotal / grand) * 100) : 0;

  setText('stressLiftShare', `${liftPct}%`);
  setText('stressRunShare', `${grand > 0 ? 100 - liftPct : 0}%`);

  const chartEl = document.getElementById('stressChartContainer');
  if (chartEl) renderStackedLoadChart(chartEl, lift, run);
}

// Stacked weekly load: lift (blue) on the bottom, run (pink) on top.
function renderStackedLoadChart(container, lift, run) {
  if (!container) return;
  const n = Math.max(lift.length, run.length);
  const totals = [];
  for (let i = 0; i < n; i++) totals.push((lift[i] || 0) + (run[i] || 0));
  const maxTotal = Math.max(...totals, 1);
  if (totals.every(t => t === 0)) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;">Log lifts and runs to see your weekly load balance.</p>';
    return;
  }

  const W = 400, H = 170, PAD_L = 40, PAD_B = 26, PAD_T = 12, PAD_R = 12;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_B - PAD_T;
  const barW = Math.max(6, Math.floor(chartW / n) - 5);
  const scale = v => (v / maxTotal) * chartH;

  let bars = '', xAxis = '';
  for (let i = 0; i < n; i++) {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const lh = scale(lift[i] || 0);
    const rh = scale(run[i] || 0);
    const liftY = PAD_T + chartH - lh;
    const runY = liftY - rh;
    bars += `<rect x="${x.toFixed(1)}" y="${liftY.toFixed(1)}" width="${barW}" height="${lh.toFixed(1)}" fill="#3b82f6"/>`;
    bars += `<rect x="${x.toFixed(1)}" y="${runY.toFixed(1)}" width="${barW}" height="${rh.toFixed(1)}" fill="#ec4899"/>`;
    if (i % 2 === 0 || n <= 8) {
      xAxis += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.7)">W${i + 1}</text>`;
    }
  }

  let yAxis = '';
  [0, Math.round(maxTotal / 2), maxTotal].forEach(v => {
    const vy = PAD_T + chartH - scale(v);
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.6)">${v}</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${xAxis}</svg>`;
}