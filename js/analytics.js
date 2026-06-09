// ==========================================
// PERFORMANCE MATRIX — analytics.js
// ==========================================
import { CONFIG, PROGRAMS } from './constants.js';
import { getProgramById } from './state.js'; // <-- NEW IMPORT

let _getState;
let _getDays;

export function initAnalytics(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays = getDaysFn;
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
  if (rpe === 0) return '#3b82f6'; // Blue
  if (rpe < 6)  return '#10b981'; // Green
  if (rpe < 8)  return '#f59e0b'; // Amber
  return '#ef4444'; // Red
}

function paceZoneColour(secsPerKm, thresholdSecs) {
  const easy      = thresholdSecs ? thresholdSecs + 60  : (CONFIG.paceZoneEasy      || 360);
  const tempo     = thresholdSecs ? thresholdSecs + 30  : (CONFIG.paceZoneTempo     || 300);
  const threshold = thresholdSecs                       || (CONFIG.paceZoneThreshold || 270);
  if (secsPerKm === 0) return '#3b82f6';
  if (secsPerKm > easy)      return '#10b981'; // Easy — green
  if (secsPerKm > tempo)     return '#f59e0b'; // Tempo — amber
  if (secsPerKm > threshold) return '#ef4444'; // Threshold — red
  return '#a855f7';                             // Race/interval — purple
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

// ==========================================
// CENTRALIZED DATA COLLECTION (PHASE 6)
// ==========================================
function collectAnalyticsData() {
  const appState = _getState();
  const DEFAULT_DAYS = _getDays();
  const activeProgram = getProgramById(appState.activeProgramId); // <-- UPDATED RESOLVER
  const maxWeek = activeProgram?.totalWeeks || 12;

  const data = {
    dynamicStats: {},
    weekLabels: [],
    volData: [],
    runData: [],
    rpeData: [],
    paceData: [],
    globalTotalDist: 0,
    globalTotalElev: 0,
    globalTotalCals: 0,
    globalTotalSets: 0,
    globalTotalVol: 0,
    absoluteMesoPeakVol: 0,
    thresholdSecs: appState.thresholdPaceSeconds || null,
    bodyWeightLog: appState.bodyWeightLog || []
  };

  // 1. Scan Lifts for 1RM
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

  // 2. Timeline Aggregation
  for (let w = 1; w <= maxWeek; w++) {
    const wKey = w.toString();
    data.weekLabels.push('W' + w);
    const wkData = appState.weeks?.[wKey];

    if (!wkData) {
      data.volData.push(0); data.runData.push(0); data.rpeData.push(0); data.paceData.push(0);
      continue;
    }

    let weekVol = 0, weekDist = 0, weekElev = 0, weekCals = 0;
    let weekRpeSum = 0, weekRpeCount = 0;
    let weekRunTime = 0, weekRunDist = 0;

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

      const gymRpe = parseFloat(wkData.gymRpe?.[d]) || 0;
      if (gymRpe > 0) { weekRpeSum += gymRpe; weekRpeCount++; }

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
  }

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
  renderVolumeChart(document.getElementById('volumeChartContainer'), data.weekLabels, data.volData, data.runData);
  
  const rmContainer = document.getElementById('allLiftsRmContainer');
  if (rmContainer) render1RMList(rmContainer, data.dynamicStats);
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
}

function renderRecoveryAnalytics(data) {
  const appState    = _getState();
  const defaultDays = _getDays();
  const wk          = appState.currentWeek || '1';
  const weekData    = appState.weeks?.[wk];

  // Compute this-week avg RPE
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

  // Inject summary cards once, update on re-render
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

  // Inject interpretation card once
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
  const context = window.analyticsContext || 'overview';

  // Hide all sections first
  document.querySelectorAll('.analytics-section').forEach(sec => sec.classList.remove('active'));

  // Route to the correct context view
  switch(context) {
    case 'strength':
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data);
      break;
    case 'strength_pr':
      document.getElementById('analytics-strength_pr').classList.add('active');
      const prContainer = document.getElementById('allLiftsRmContainer_PR');
      if (prContainer) render1RMList(prContainer, data.dynamicStats);
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
    case 'goal-progress':
      // Goal progress reuses the consistency log + injects goal detail
      document.getElementById('analytics-progress').classList.add('active');
      renderProgressAnalytics(data);
      renderGoalProgressDetail(data);
      break;
    default:
      // Fallback: strength overview
      document.getElementById('analytics-strength').classList.add('active');
      renderStrengthAnalytics(data);
  }
}

export function updateCompoundAnalyticsBarItem(valNodeId, barNodeId, currentVal, maxVal) {
  // Legacy function kept for safety
}

// ==========================================
// RECOVERY SCORE DETAIL (new tile target)
// ==========================================
function renderRecoveryScoreDetail(data) {
  const appState = _getState();
  const defaultDays = _getDays();
  const wk = appState.currentWeek || '1';
  const weekData = appState.weeks?.[wk];

  let totalRpe = 0, rpeCount = 0;
  if (weekData) {
    defaultDays.forEach(d => {
      const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
      const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
      if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
      if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    });
  }

  const avgRpe = rpeCount > 0 ? totalRpe / rpeCount : 0;
  const score = rpeCount > 0 ? Math.round(Math.max(0, Math.min(100, ((10 - avgRpe) / 9) * 100))) : 0;
  const sleepContrib    = Math.round(score * 0.4);
  const fatigueContrib  = Math.round(score * 0.6);

  let recommendation = 'Log workouts to generate recovery insights.';
  if (rpeCount > 0) {
    if (score >= 80)      recommendation = 'Well recovered. You can push intensity today.';
    else if (score >= 60) recommendation = 'Moderately recovered. Stick to planned volume.';
    else if (score >= 40) recommendation = 'Fatigue accumulating. Prioritise sleep tonight.';
    else                  recommendation = 'High fatigue load. Consider a deload or rest day.';
  }

  const heroEl   = document.getElementById('recoveryScoreHero');
  const rpeEl    = document.getElementById('recoveryAvgRpe');
  const sleepEl  = document.getElementById('recoverySleepContrib');
  const fatEl    = document.getElementById('recoveryFatigueContrib');
  const recEl    = document.getElementById('recoveryRecommendation');

  if (heroEl)  heroEl.textContent  = rpeCount > 0 ? `${score}%` : '--';
  if (rpeEl)   rpeEl.textContent   = rpeCount > 0 ? avgRpe.toFixed(1) : '--';
  if (sleepEl) sleepEl.textContent = rpeCount > 0 ? `~${sleepContrib}%` : '--';
  if (fatEl)   fatEl.textContent   = rpeCount > 0 ? `~${fatigueContrib}%` : '--';
  if (recEl)   recEl.textContent   = recommendation;

  // Re-use the existing RPE trend chart in the detail container
  const trendEl = document.getElementById('rpeTrendContainerDetail');
  if (trendEl) renderRpeTrendChart(trendEl, data);
}

// ==========================================
// WEEKLY VOLUME DETAIL (new tile target)
// ==========================================
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

  // Render the volume chart in the detail section
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

// ==========================================
// STREAK DETAIL (new tile target)
// ==========================================
function renderStreakDetail(data) {
  const appState = _getState();
  const defaultDays = _getDays();

  // Rebuild active dates set (same logic as dashboard.js tile)
  const activeDates = new Set();
  for (const wk in appState.weeks || {}) {
    const wkData = appState.weeks[wk];
    defaultDays.forEach((d, dayIdx) => {
      const rDist = parseFloat(wkData?.runs?.[d]?.dist) || 0;
      let completedSets = 0;
      const dayLifts = wkData?.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (Array.isArray(dayLifts[lift])) {
          completedSets += dayLifts[lift].filter(s => s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)).length;
        }
      }
      if (rDist > 0 || completedSets > 0) {
        const weekNum = parseInt(wk, 10) || 1;
        const base = appState.weekStartedAt ? new Date(appState.weekStartedAt) : new Date();
        const approx = new Date(base);
        approx.setDate(base.getDate() - ((parseInt(appState.currentWeek, 10) - weekNum) * 7) + dayIdx);
        activeDates.add(approx.toISOString().slice(0, 10));
      }
    });
  }

  const today = new Date();
  let streak = 0;
  for (let i = 0; i <= 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (activeDates.has(ds)) { if (i === streak) streak++; }
    else { if (i === streak) break; }
  }

  let longest = 0, tempStreak = 0, prev = null;
  [...activeDates].sort().forEach(ds => {
    if (prev) {
      const diff = (new Date(ds) - new Date(prev)) / 86400000;
      tempStreak = diff === 1 ? tempStreak + 1 : 1;
    } else {
      tempStreak = 1;
    }
    if (tempStreak > longest) longest = tempStreak;
    prev = ds;
  });

  const currentEl  = document.getElementById('streakCurrent');
  const longestEl  = document.getElementById('streakLongest');
  const detailEl   = document.getElementById('streakDetailContainer');

  if (currentEl) currentEl.textContent = `${streak} day${streak !== 1 ? 's' : ''}`;
  if (longestEl) longestEl.textContent = `${longest} day${longest !== 1 ? 's' : ''}`;

  if (detailEl) {
    if (activeDates.size === 0) {
      detailEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.75rem;">Complete workouts to build your streak.</p>';
    } else {
      const streakMsg = streak >= 7
        ? `🔥 ${streak}-day streak! Momentum is everything.`
        : streak >= 3
        ? `💪 ${streak} days in a row. Keep it going!`
        : streak === 0
        ? `Start today to begin a new streak.`
        : `${streak} day streak. Every day counts.`;

      detailEl.innerHTML = `
        <div class="card-dark p-3 mb-3" style="border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">
          <div class="font-heavy text-inverse" style="font-size:1rem;">${streakMsg}</div>
        </div>
        <div class="flex-between mb-2" style="font-size:0.8rem;">
          <span class="text-muted">Total active days logged</span>
          <span class="font-heavy text-inverse">${activeDates.size}</span>
        </div>
        <div class="flex-between" style="font-size:0.8rem;">
          <span class="text-muted">Personal best streak</span>
          <span class="font-heavy text-inverse">${longest} days</span>
        </div>
      `;
    }
  }
}

// Helper: re-use RPE trend rendering for recovery detail view
function renderRpeTrendChart(container, data) {
  if (!container) return;
  // Delegate to existing RPE renderer by temporarily swapping containers
  const existingContainer = document.getElementById('rpeTrendContainer');
  const savedContent = existingContainer ? existingContainer.innerHTML : '';

  // Call the existing recovery analytics render but target our new container
  // We do this by temporarily re-pointing the DOM id
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

// ==========================================
// GOAL PROGRESS DETAIL (injected into progress view)
// ==========================================
function renderGoalProgressDetail(data) {
  const appState = _getState();
  const activeProgram = getProgramById(appState.activeProgramId); // <-- UPDATED RESOLVER

  const wk    = parseInt(appState.currentWeek, 10) || 1;
  const total = activeProgram.totalWeeks || 12; // <-- UPDATED PROPERTY
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
  `;
}