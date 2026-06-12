// ==========================================
// ANALYTICS — CHART RENDERERS (analytics/charts.js)
// ------------------------------------------
// Pure SVG chart library for HybridHQ analytics views.
//
// CONTRACT: every function accepts an explicit container element as its first
// argument and writes innerHTML. No getElementById, no state access.
// Callers own the DOM lookup; these functions own the rendering.
//
// This strict separation means:
//   • charts are testable in isolation (pass a mock element)
//   • the DOM ID-swap hack in the old analytics.js is eliminated — callers
//     simply pass the correct container reference directly
//   • adding a chart never requires changing module-level state
// ==========================================
import { rpeColour, smooth } from './utils.js';

// ---- SHARED SVG CONSTANTS -------------------------------------------
// Standard padding used by all fixed-size charts (400×H viewport).
const W = 400;
const PAD_L = 44, PAD_B = 30, PAD_T = 15, PAD_R = 15;

// ==========================================
// VOLUME CHART
// Strength tonnage bars (blue) + running distance overlay line (pink).
// ==========================================
export function renderVolumeChart(container, weekLabels, volData, runData) {
  if (!container || weekLabels.length < 1) {
    if (container) container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log workouts to see volume trends.</p>';
    return;
  }

  const H = 180;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const maxVol = Math.max(...volData, 1);
  const maxRun = Math.max(...runData, 1);
  const n = weekLabels.length;
  const barW = Math.max(8, Math.floor(chartW / n) - 6);

  let bars = '', runPoints = '', runPath = '';

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
    const labelTxt = val > 999 ? (val / 1000).toFixed(1) + 'k' : val;
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

// ==========================================
// RPE CHART
// Weekly average RPE line with fatigue zone bands.
// ==========================================
export function renderRpeChart(container, weekLabels, rpeData) {
  if (!container) return;
  if (weekLabels.length === 0 || rpeData.every(r => r === 0)) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Log RPE on workouts to see fatigue trends.</p>';
    return;
  }

  const H = 150;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;

  const band = (yPct, h, colour) => {
    const y = PAD_T + chartH * (1 - yPct - h);
    return `<rect x="${PAD_L}" y="${y.toFixed(1)}" width="${chartW}" height="${(chartH * h).toFixed(1)}" fill="${colour}" opacity="0.15"/>`;
  };
  const bands = band(0, 6 / 10, '#10b981') + band(0.6, 2 / 10, '#f59e0b') + band(0.8, 2 / 10, '#ef4444');

  let points = '', dots = '';
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

// ==========================================
// BODY WEIGHT CHART
// Area + line chart of bodyweight log entries.
// ==========================================
export function renderBodyWeightChart(container, bwLog) {
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

  const H = 150;
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
    ` L ${toX(n - 1).toFixed(1)},${(PAD_T + chartH).toFixed(1)} Z`;
  const fill = `<path d="${fillPath}" fill="#a855f7" opacity="0.12"/>`;

  let dots = '';
  weights.forEach((w, i) => {
    dots += `<circle cx="${toX(i).toFixed(1)}" cy="${toY(w).toFixed(1)}" r="4" fill="#a855f7" stroke="#111827" stroke-width="2"/>`;
  });

  const specialIdx = new Set([0, n - 1, weights.indexOf(minW), weights.indexOf(maxW)]);
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

  [[minW, 'min'], [maxW, 'max']].forEach(([w]) => {
    const vy = toY(w);
    valueLabels += `<line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${fill}${polyline}${dots}${valueLabels}${xAxis}</svg>`;
}

// ==========================================
// HR ZONES CHART
// Stacked bar chart of 5-zone time distribution per week.
// ==========================================
export function renderHrZonesChart(container, weekLabels, zonesData) {
  if (!container) return;
  const hasData = zonesData.some(week => week.some(z => z > 0));
  if (!hasData || weekLabels.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Import .FIT data to view HR zones.</p>';
    return;
  }

  const H = 160;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;
  const barW = Math.max(12, Math.floor(chartW / n) - 8);
  const colors = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];

  let bars = '';
  weekLabels.forEach((label, i) => {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const weekZones = zonesData[i];
    const totalTime = weekZones.reduce((a, b) => a + b, 0) || 1;
    let currentY = PAD_T + chartH;
    weekZones.forEach((zTime, zIdx) => {
      if (zTime <= 0) return;
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
    const vy = PAD_T + chartH - (pct / 100) * chartH;
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.6)">${pct}%</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${xAxis}</svg>`;
}

// ==========================================
// CADENCE CHART
// Weekly average running cadence line chart.
// ==========================================
export function renderCadenceChart(container, weekLabels, cadenceData) {
  if (!container) return;
  const valid = cadenceData.filter(c => c > 0);
  if (valid.length === 0 || weekLabels.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Import .FIT data to view cadence trends.</p>';
    return;
  }

  const H = 150;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;
  const n = weekLabels.length;
  const minC = Math.max(120, Math.min(...valid) - 5);
  const maxC = Math.max(...valid) + 5;
  const rangeC = Math.max(maxC - minC, 10);

  const toX = i => PAD_L + (i / n) * chartW + chartW / n / 2;
  const toY = c => PAD_T + chartH - ((c - minC) / rangeC) * chartH;

  let points = '', dots = '';
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
    xAxis += `<text x="${toX(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="rgba(255,255,255,0.9)">${label}</text>`;
  });

  let yAxis = '';
  [minC, Math.round((minC + maxC) / 2), maxC].forEach(val => {
    const vy = toY(val);
    yAxis += `<text x="${PAD_L - 8}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="rgba(255,255,255,0.6)">${val}</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${line}${dots}${xAxis}</svg>`;
}

// ==========================================
// BIG 3 PROGRESSION CHART
// Multi-line e1RM progression for squat / bench / deadlift.
// ==========================================
export function renderBig3ProgressionChart(container, progression, weekLabels) {
  if (!container) return;
  const n = weekLabels.length;

  const series = [
    { key: 'squat',    label: 'Squat',    color: '#3b82f6' },
    { key: 'bench',    label: 'Bench',    color: '#f59e0b' },
    { key: 'deadlift', label: 'Deadlift', color: '#ef4444' },
  ];

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

  const H = 180;
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
    xAxis += `<text x="${toX(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="11" font-weight="600" fill="rgba(255,255,255,0.85)">${label}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${lines}${xAxis}</svg>`;
}

// ==========================================
// WEEKLY BAR CHART (generic single-series)
// ==========================================
export function renderWeeklyBarChart(container, weekLabels, values, opts = {}) {
  if (!container) return;
  const n = weekLabels.length;
  const hasData = (values || []).some(v => v > 0);
  if (!hasData || n === 0) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">${opts.emptyMsg || 'No data yet.'}</p>`;
    return;
  }
  const color = opts.color || '#f59e0b';
  const H = 170;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_B - PAD_T;
  const maxV = Math.max(...values, 1);
  const barW = Math.max(6, Math.floor(chartW / n) - 5);
  const toY = v => PAD_T + chartH - (v / maxV) * chartH;
  const fmtY = opts.yFmt || (v => Math.round(v).toLocaleString());

  let bars = '', xAxis = '';
  values.forEach((v, i) => {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const y = toY(v);
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${(PAD_T + chartH - y).toFixed(1)}" rx="2" fill="${color}" fill-opacity="${v > 0 ? 0.95 : 0.2}"/>`;
    if (i % 2 === 0 || n <= 8) {
      xAxis += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.7)">${weekLabels[i]}</text>`;
    }
  });
  let yAxis = '';
  [0, maxV / 2, maxV].forEach(v => {
    const vy = toY(v);
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.6)">${fmtY(v)}</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${xAxis}</svg>`;
}

// ==========================================
// WEEKLY LINES CHART (generic multi-series)
// ==========================================
export function renderWeeklyLinesChart(container, weekLabels, seriesList, opts = {}) {
  if (!container) return;
  const n = weekLabels.length;
  const all = [];
  seriesList.forEach(s => (s.values || []).forEach(v => { if (v > 0) all.push(v); }));
  if (all.length === 0 || n === 0) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">${opts.emptyMsg || 'No data yet.'}</p>`;
    return;
  }
  const H = 170;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_B - PAD_T;
  let minV = Math.min(...all), maxV = Math.max(...all);
  const pad = (maxV - minV) * 0.1 || Math.max(1, maxV * 0.1);
  minV = Math.max(0, minV - pad); maxV += pad;
  const rangeV = (maxV - minV) || 1;
  const toX = i => PAD_L + (i / n) * chartW + chartW / n / 2;
  const toY = v => PAD_T + chartH - ((v - minV) / rangeV) * chartH;
  const fmtY = opts.yFmt || (v => Math.round(v));

  let yAxis = '';
  [minV, (minV + maxV) / 2, maxV].forEach(v => {
    const vy = toY(v);
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.6)">${fmtY(v)}</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });
  let lines = '';
  seriesList.forEach(s => {
    const pts = [];
    (s.values || []).forEach((v, i) => { if (v > 0) pts.push({ x: toX(i), y: toY(v) }); });
    if (pts.length >= 2) {
      lines += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`;
    }
    pts.forEach(p => { lines += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${s.color}" stroke="#111827" stroke-width="1.5"/>`; });
  });
  let xAxis = '';
  weekLabels.forEach((lbl, i) => {
    if (i % 2 === 0 || n <= 8) xAxis += `<text x="${toX(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.7)">${lbl}</text>`;
  });
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${lines}${xAxis}</svg>`;
}

// ==========================================
// XY CHART (generic continuous time-series)
// Used for per-run streams: pace over distance, HR curve, elevation profile.
// ==========================================
export function renderXYChart(container, points, opts = {}) {
  if (!container) return;
  const pts = (points || []).filter(p => p && isFinite(p.x) && isFinite(p.y));
  if (pts.length < 2) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;padding:10px 0;">${opts.emptyMsg || 'No data in this run.'}</p>`;
    return;
  }
  const color = opts.color || '#22d3ee';
  const H = 160;
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

// ==========================================
// STACKED LOAD CHART
// Weekly lift load (blue) stacked below run load (pink).
// ==========================================
export function renderStackedLoadChart(container, lift, run) {
  if (!container) return;
  const n = Math.max(lift.length, run.length);
  const totals = [];
  for (let i = 0; i < n; i++) totals.push((lift[i] || 0) + (run[i] || 0));
  const maxTotal = Math.max(...totals, 1);
  if (totals.every(t => t === 0)) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;">Log lifts and runs to see your weekly load balance.</p>';
    return;
  }

  const H = 170;
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

// ==========================================
// COMPLETION VS TARGET CHART
// Weekly completion % bars with 100% target reference line.
// pastWeeks are full opacity; future weeks are faded.
// ==========================================
export function renderCompletionVsTargetChart(container, series, curWeek) {
  if (!container) return;
  const n = series.length;
  if (n === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.85rem;">No program data.</p>';
    return;
  }

  const H = 170;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_B - PAD_T;
  const barW = Math.max(6, Math.floor(chartW / n) - 5);
  const toY = pct => PAD_T + chartH - (pct / 100) * chartH;

  let bars = '', xAxis = '';
  series.forEach((pct, i) => {
    const x = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    const y = toY(pct);
    const due = (i + 1) <= curWeek;
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

// ==========================================
// SLEEP STAGES CHART
// Stacked bar showing deep / REM / light / awake hours per night.
// Accepts an array of stage objects: [{ label, deep, rem, light, awake }]
// ==========================================
export function renderSleepStagesChart(container, stagesData) {
  if (!container) return;
  const valid = (stagesData || []).filter(s => (s.deep + s.rem + s.light + s.awake) > 0);
  if (valid.length === 0) {
    container.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">Sleep stage data unavailable — requires a sleep-tracking device.</p>';
    return;
  }

  const H = 170;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_B - PAD_T;
  const n = valid.length;
  const barW = Math.max(12, Math.floor(chartW / n) - 6);
  const maxTotal = Math.max(...valid.map(s => s.deep + s.rem + s.light + s.awake), 8);

  const COLORS = { deep: '#3b82f6', rem: '#a855f7', light: '#22d3ee', awake: '#6b7280' };
  const KEYS   = ['awake', 'light', 'rem', 'deep'];

  let bars = '', xAxis = '';
  valid.forEach((s, i) => {
    const x  = PAD_L + (i / n) * chartW + (chartW / n - barW) / 2;
    let curY = PAD_T + chartH;
    KEYS.forEach(k => {
      const val = s[k] || 0;
      if (val <= 0) return;
      const h = (val / maxTotal) * chartH;
      curY -= h;
      bars += `<rect x="${x.toFixed(1)}" y="${curY.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" fill="${COLORS[k]}" opacity="0.9" rx="1"/>`;
    });
    if (i % 2 === 0 || n <= 8) {
      xAxis += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.7)">${s.label}</text>`;
    }
  });

  let yAxis = '';
  [0, Math.round(maxTotal / 2), maxTotal].forEach(v => {
    const vy = PAD_T + chartH - (v / maxTotal) * chartH;
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.6)">${v}h</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${bars}${xAxis}</svg>`;
}

// ==========================================
// TREND LINE WITH BASELINE BAND
// Single line chart with a dashed reference line for the athlete's baseline.
// ==========================================
export function renderTrendLineWithBaseline(container, labels, values, baselineValue, opts = {}) {
  if (!container) return;
  const n = labels.length;
  const hasData = values.some(v => v > 0);
  if (!hasData || n === 0) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;padding:12px 0;">${opts.emptyMsg || 'No data yet.'}</p>`;
    return;
  }

  const H = 170;
  const chartW = W - PAD_L - PAD_R, chartH = H - PAD_B - PAD_T;
  const allVals = values.filter(v => v > 0);
  const base = baselineValue || 0;
  let minV = Math.min(...allVals, base > 0 ? base : Infinity);
  let maxV = Math.max(...allVals, base || 0);
  const pad = (maxV - minV) * 0.15 || 1;
  minV = Math.max(0, minV - pad);
  maxV += pad;
  const rangeV = (maxV - minV) || 1;

  const color = opts.color || '#22d3ee';
  const toX   = i => PAD_L + (i / n) * chartW + chartW / n / 2;
  const toY   = v => PAD_T + chartH - ((v - minV) / rangeV) * chartH;
  const fmtY  = opts.yFmt || (v => Math.round(v).toLocaleString());

  let yAxis = '';
  [minV, (minV + maxV) / 2, maxV].forEach(v => {
    const vy = toY(v);
    yAxis += `<text x="${PAD_L - 6}" y="${(vy + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.6)">${fmtY(v)}</text>
              <line x1="${PAD_L}" y1="${vy.toFixed(1)}" x2="${W - PAD_R}" y2="${vy.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });

  let pts = [], dots = '';
  values.forEach((v, i) => {
    if (v > 0) {
      const x = toX(i), y = toY(v);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}" stroke="#111827" stroke-width="1.5"/>`;
    }
  });

  const line = pts.length >= 2
    ? `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${pts.join(' ')}"/>`
    : '';

  let baseline = '';
  if (base > 0) {
    const by = toY(base);
    baseline = `<line x1="${PAD_L}" y1="${by.toFixed(1)}" x2="${W - PAD_R}" y2="${by.toFixed(1)}" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-dasharray="5 4"/>
                <text x="${(W - PAD_R - 2).toFixed(1)}" y="${(by - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.4)">avg</text>`;
  }

  let xAxis = '';
  labels.forEach((lbl, i) => {
    if (i % 3 === 0 || n <= 8) xAxis += `<text x="${toX(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.7)">${lbl}</text>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">${yAxis}${baseline}${line}${dots}${xAxis}</svg>`;
}

// ==========================================
// STREAM CHARTS
// Per-run pace / HR / elevation from IndexedDB FIT stream data.
// ==========================================
export function renderStreamCharts(stream) {
  const paceEl = document.getElementById('runPaceDistContainer');
  const hrEl   = document.getElementById('runHrCurveContainer');
  const elevEl = document.getElementById('runElevProfileContainer');
  const wrap   = document.getElementById('runStreamSection');

  if (!stream || !stream.n) {
    if (wrap) wrap.style.display = 'none';
    return;
  }
  if (wrap) wrap.style.display = 'block';

  const dist   = stream.distKm || [];
  const hasDist = dist.length > 0;
  const xOf    = i => hasDist ? dist[i] : ((stream.t?.[i] || 0) / 60);
  const xLabel  = hasDist ? 'Distance (km)' : 'Time (min)';

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

  if (hrEl) {
    const hr = stream.hr || [];
    const pts = [];
    hr.forEach((h, i) => { if (h > 0) pts.push({ x: xOf(i), y: h }); });
    renderXYChart(hrEl, pts, { color: '#ef4444', xLabel, emptyMsg: 'No HR stream in this run.' });
  }

  if (elevEl) {
    const alt = stream.altitude || [];
    const pts = [];
    alt.forEach((a, i) => { if (isFinite(a)) pts.push({ x: xOf(i), y: a }); });
    renderXYChart(elevEl, pts, { color: '#10b981', area: true, xLabel, emptyMsg: 'No elevation stream in this run.' });
  }
}
