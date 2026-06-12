// ==========================================
// FULLY REFACTORED HOME DASHBOARD (home.js)
// ==========================================
import { PROGRAMS, WEEK_PHASE_NAMES, DAY_NAMES_FULL } from './constants.js';
import { getDisplayBlueprint } from './schema.js';
import { getProgramById, saveStateToLocalStorage } from './state.js';
import { buildRunPreviewRow, buildLiftPreviewRow, buildRestDayPreview } from './templates.js';
import { computeDiagnosticForLift, computeEstimated1RMs, shouldSuggestDeload, isCompletedSet, parseDurationToMinutes, computeRecoveryScore, computeReadiness, computeWeeklyLoadSeries } from './engine.js';
import { getMapFromDB } from './db.js';
import { TILE_REGISTRY, DashboardTileType, resolveTileNavigation } from './dashboard.js';
import { loadTileOrder, mountTileDragAndDrop, loadHiddenTiles, saveHiddenTiles, resetTileOrder, resetHiddenTiles, applyFocusOrder, mountFocusDragAndDrop } from './dragdrop.js';
import { CATEGORY_META } from './brain/brain_dashboard.js';
import { generateInsights, contextVerdict } from './brain/core.js';
import { composeBriefing, buildTelemetry } from './brain/briefing.js';
import { energyProfile, activeCaloriesForDay } from './profile.js';
import { escapeHtml } from './util.js';

let _getState;
let _getSelectedDay;
let _getDays;

// Private module-scoped variable to hold the map instance safely
let activeHomeMapInstance = null;

export function initHome(getStateFn, getSelectedDayFn, getDaysFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _getDays = getDaysFn;
}

function formatMinutesToHoursMins(totalMins) {
  if (!totalMins || totalMins <= 0) return '0m';
  const h = Math.floor(totalMins / 60);
  const m = Math.floor(totalMins % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ==========================================
// TILE RENDERERS
// Each function returns the inner HTML for a .glance-card
// ==========================================

function renderTileLoading() {
  return `
    <div class="tile-skeleton-line" style="width:60%;height:12px;border-radius:4px;background:rgba(255,255,255,0.07);margin-bottom:8px;"></div>
    <div class="tile-skeleton-line" style="width:40%;height:22px;border-radius:4px;background:rgba(255,255,255,0.07);margin-bottom:6px;"></div>
    <div class="tile-skeleton-line" style="width:80%;height:10px;border-radius:4px;background:rgba(255,255,255,0.05);"></div>
  `;
}

function renderTileError(label) {
  return `
    <div class="card-icon-title text-muted"><span>⚠️</span> ${label}</div>
    <div class="font-heavy" style="font-size:1.1rem;color:var(--color-red);">Error</div>
    <div class="text-muted" style="font-size:0.6rem;">Could not load data</div>
  `;
}

function renderMetricTile(config, data) {
  const accentColor = `var(${config.accentVar})`;
  const tagHTML = data.tag
    ? `<div class="tile-tag font-bold mb-1" style="font-size:0.75rem;color:${data.tagColor || accentColor};">${data.tag}</div>`
    : '';
  const heroColor = data.state === 'empty' ? 'var(--text-secondary)' : 'var(--text-primary)';
  return `
    <div class="card-icon-title" style="color:${accentColor};"><span>${config.icon}</span> ${config.label}</div>
    <div>
      ${tagHTML}
      <div class="font-heavy tile-hero" style="font-size:1.3rem;line-height:1.1;color:${heroColor};">${data.hero || '--'}</div>
      <div class="text-muted tile-sub" style="font-size:0.6rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.sub || ''}</div>
    </div>
  `;
}

function renderRingTile(config, data) {
  const ringColor = data.ringColor || 'var(--color-blue)';
  const pct = data.ringPct || 0;
  const grad = `conic-gradient(${ringColor} ${pct}%, rgba(255,255,255,0.1) 0)`;
  return `
    <div class="card-icon-title" style="color:var(${config.accentVar});"><span>${config.icon}</span> ${config.label}</div>
    <div class="readiness-ring-container">
      <div class="readiness-ring green" style="background:${grad};">
        <div class="readiness-ring-inner">
          <span class="font-heavy text-inverse" style="font-size:0.75rem;">${data.hero || '--'}</span>
        </div>
      </div>
    </div>
    <div class="text-muted text-center" style="font-size:0.6rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.sub || ''}</div>
  `;
}

function renderSplit3Tile(config, data) {
  const accentColor = `var(${config.accentVar})`;
  const rows = (data.rows || []).map(r => `
    <div class="flex-between mb-1" style="font-size:0.75rem;">
      <span class="text-muted">${r.label}</span>
      <strong class="text-inverse">${r.value}</strong>
    </div>
  `).join('');
  return `
    <div class="card-icon-title" style="color:${accentColor};"><span>${config.icon}</span> ${config.label}</div>
    <div>${rows}</div>
  `;
}

function renderRatioBarTile(config, data) {
  return `
    <div class="card-icon-title" style="color:var(${config.accentVar});"><span>${config.icon}</span> ${config.label}</div>
    <div>
      <div class="font-heavy text-inverse mb-1" style="font-size:0.95rem;">${data.label || '0% / 0%'}</div>
      <div class="ratio-bar-track mb-1" style="height:5px;border-radius:3px;">
        <div class="ratio-fill-blue" id="tileRatioLiftBar" style="width:${data.liftPct || 50}%;background:#3b82f6;"></div>
        <div class="ratio-fill-pink" id="tileRatioRunBar" style="width:${data.runPct || 50}%;background:#ec4899;"></div>
      </div>
      <div class="text-muted" style="font-size:0.6rem;">${data.advice || 'Lift / Run bias'}</div>
    </div>
  `;
}

function renderProgressTile(config, data) {
  const accentColor = `var(${config.accentVar})`;
  return `
    <div class="card-icon-title" style="color:${accentColor};"><span>${config.icon}</span> ${config.label}</div>
    <div>
      <div class="font-heavy text-inverse mb-1" style="font-size:1.3rem;line-height:1.1;">
        ${data.done || 0} <span class="text-muted" style="font-size:0.9rem;">/ ${data.total || 0}</span>
      </div>
      <div class="text-muted" style="font-size:0.6rem;">${data.sub || ''}</div>
    </div>
  `;
}

function renderTileContent(config, data) {
  if (data.state === 'error') return renderTileError(config.label);
  switch (config.type) {
    case DashboardTileType.RING:      return renderRingTile(config, data);
    case DashboardTileType.SPLIT_3:   return renderSplit3Tile(config, data);
    case DashboardTileType.RATIO_BAR: return renderRatioBarTile(config, data);
    case DashboardTileType.PROGRESS:  return renderProgressTile(config, data);
    default:                          return renderMetricTile(config, data);
  }
}

// ==========================================
// GLANCE GRID RENDERER
// Builds / updates the .glance-grid dynamically from TILE_REGISTRY
// ==========================================
function renderGlanceGrid(appState, defaultDays, activeProgram, selectedDay) {
  const grid = document.getElementById('glanceGrid');
  if (!grid) return;

  const header = grid.previousElementSibling;
  if (header && !header.querySelector('.tile-customise-btn')) {
    const btn = document.createElement('button');
    btn.className = 'tile-customise-btn';
    btn.textContent = 'Edit';
    btn.setAttribute('aria-label', 'Customise dashboard tiles');
    btn.setAttribute('data-action', 'open-tile-customiser');
    header.appendChild(btn);
  }

  const savedOrder  = loadTileOrder();
  const hiddenTiles = loadHiddenTiles();

  const sorted = [...TILE_REGISTRY].sort((a, b) => {
    if (savedOrder) {
      const ai = savedOrder.indexOf(a.id);
      const bi = savedOrder.indexOf(b.id);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    }
    return a.order - b.order;
  });

  sorted.forEach(config => {
    const tileId = `glance-tile-${config.id}`;
    let article = document.getElementById(tileId);

    if (hiddenTiles.has(config.id)) {
      if (article) article.remove();
      return;
    }

    if (!article) {
      article = document.createElement('article');
      article.id        = tileId;
      article.className = 'card-dark glance-card tile-interactive';
      article.setAttribute('role', 'button');
      article.setAttribute('tabindex', '0');
      article.setAttribute('aria-label', `${config.label} — tap for details`);
      grid.appendChild(article);

      const nav = resolveTileNavigation(config.navTarget);
      if (nav) {
        article.style.cursor = 'pointer';
        article.addEventListener('click', nav);
        article.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') nav(); });
      }
    }

    let data;
    try {
      data = config.renderData(appState, defaultDays, activeProgram, selectedDay);
    } catch (e) {
      data = { state: 'error' };
    }

    article.innerHTML = renderTileContent(config, data);
  });

  sorted.forEach(config => {
    if (hiddenTiles.has(config.id)) return;
    const el = document.getElementById(`glance-tile-${config.id}`);
    if (el) grid.appendChild(el);
  });

  mountTileDragAndDrop();
}

// ==========================================
// TILE CUSTOMISER
// ==========================================
function openTileCustomiser() {
  const sheet = document.getElementById('tileCustomiserSheet');
  const list  = document.getElementById('tileCustomiserList');
  if (!sheet || !list) return;

  const hidden     = loadHiddenTiles();
  const savedOrder = loadTileOrder();
  const sorted = [...TILE_REGISTRY].sort((a, b) => {
    if (savedOrder) {
      const ai = savedOrder.indexOf(a.id);
      const bi = savedOrder.indexOf(b.id);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    }
    return a.order - b.order;
  });

  list.innerHTML = sorted.map(config => `
    <div class="tile-picker-item${hidden.has(config.id) ? ' tile-picker-hidden' : ''}" data-tile-id="${config.id}">
      <span class="tile-picker-icon">${config.icon}</span>
      <span class="tile-picker-label">${config.label}</span>
      <input type="checkbox" class="tile-picker-check" data-tile-id="${config.id}" ${hidden.has(config.id) ? '' : 'checked'}>
      <span class="tile-picker-toggle"></span>
    </div>
  `).join('');

  list.querySelectorAll('.tile-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      const cb = item.querySelector('.tile-picker-check');
      cb.checked = !cb.checked;
      item.classList.toggle('tile-picker-hidden', !cb.checked);
    });
  });

  sheet.classList.add('active');
  document.getElementById('tileCustomiserBackdrop')?.classList.add('active');
}

export function closeTileCustomiser(apply) {
  const sheet = document.getElementById('tileCustomiserSheet');
  if (!sheet) return;

  if (apply) {
    const hidden = new Set();
    sheet.querySelectorAll('.tile-picker-check').forEach(cb => {
      if (!cb.checked) hidden.add(cb.dataset.tileId);
    });
    saveHiddenTiles(hidden);
    sheet.classList.remove('active');
    document.getElementById('tileCustomiserBackdrop')?.classList.remove('active');
    
    const appState      = _getState();
    const DEFAULT_DAYS  = _getDays();
    const activeProgram = getProgramById(appState.activeProgramId);
    renderGlanceGrid(appState, DEFAULT_DAYS, activeProgram, _getSelectedDay());
  } else {
    sheet.classList.remove('active');
    document.getElementById('tileCustomiserBackdrop')?.classList.remove('active');
  }
}

export function resetTileCustomiser() {
  resetTileOrder();
  resetHiddenTiles();
  document.getElementById('tileCustomiserSheet')?.classList.remove('active');
  document.getElementById('tileCustomiserBackdrop')?.classList.remove('active');
  const appState      = _getState();
  const DEFAULT_DAYS  = _getDays();
  const activeProgram = getProgramById(appState.activeProgramId);
  renderGlanceGrid(appState, DEFAULT_DAYS, activeProgram, _getSelectedDay());
}

export function renderHome() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const DEFAULT_DAYS = _getDays(); 

  const wk = appState?.currentWeek || "1";
  const weekData = appState?.weeks?.[wk] || {};

  const indicatorEl = document.getElementById('homeWeekBlockIndicator');
  const labelEl = document.getElementById('homeBlockTypeLabel');
  if (indicatorEl) indicatorEl.textContent = 'Week ' + wk;
  if (labelEl) labelEl.textContent = WEEK_PHASE_NAMES[wk] || 'Active Phase';

  const activeProgram = getProgramById(appState.activeProgramId);
  const homeBlueprint = getDisplayBlueprint(activeProgram, wk, selectedDay);

  const hBadge = document.getElementById('homeFocusBadge');
  const dAccent = document.getElementById('homeDayAccentBar');
  if (hBadge) {
    hBadge.textContent = homeBlueprint.badge || 'Rest';
    hBadge.style.color = homeBlueprint.color || '#6b7280';
  }
  if (dAccent) dAccent.style.background = homeBlueprint.color || '#6b7280';

  const dayLabel = document.getElementById('homeCalendarDayLabel');
  const focusTitle = document.getElementById('homeFocusTitle');
  const focusDesc = document.getElementById('homeFocusDesc');

  if (dayLabel) dayLabel.textContent = DAY_NAMES_FULL[selectedDay] || '';
  if (focusTitle) focusTitle.textContent = homeBlueprint.title || 'Rest Day';
  if (focusDesc) focusDesc.textContent = homeBlueprint.desc || '';

  const engineAlertCard = document.getElementById('homeEngineAlertCard');
  const engineAlertDesc = document.getElementById('homeEngineAlertDesc');
  const globalStallAlertsFound = [];

  DEFAULT_DAYS.forEach(dKey => {
    const dayLifts = weekData.lifts?.[dKey] || {};
    for (let liftName in dayLifts) {
      try {
        const diag = computeDiagnosticForLift(wk, dKey, liftName);
        if (diag && (diag.isStalled || diag.isFatigueOverload)) {
          globalStallAlertsFound.push(diag.message);
        }
      } catch (e) {
        console.warn("Defensive shield caught diagnostic breakdown:", e);
      }
    }
  });

  if (globalStallAlertsFound.length > 0) {
    if (engineAlertCard) engineAlertCard.style.display = 'block';
    if (engineAlertDesc) engineAlertDesc.textContent = globalStallAlertsFound[0];
  } else {
    if (engineAlertCard) engineAlertCard.style.display = 'none';
  }

  const previewContainer = document.getElementById('homeDrillPreviewContainer');
  const todayLifts = weekData.lifts?.[selectedDay] || {};
  const todayRun = weekData.runs?.[selectedDay] || {};

  let todayVol = 0;
  let todaySets = 0;

  for (let lift in todayLifts) {
    if (Array.isArray(todayLifts[lift])) {
      todayLifts[lift].forEach(s => {
        if (s) {
          const isCompleted = isCompletedSet(s);
          if (isCompleted) {
            todaySets++;
            todayVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
          }
        }
      });
    }
  }

  const todayRunDist = parseFloat(todayRun.dist) || 0;
  const isSessionStarted = todaySets > 0 || todayRunDist > 0;

  if (previewContainer) {
    previewContainer.innerHTML = '';

    if (isSessionStarted) {
      if (hBadge) hBadge.textContent = "✓ Completed";
      if (hBadge) hBadge.style.color = "var(--accent-green)";
      if (dAccent) dAccent.style.background = "var(--accent-green)";
      if (focusTitle) focusTitle.textContent = "Session Logged";
      if (focusDesc) focusDesc.textContent = "Great work. Tap below to edit or add notes.";

      let summaryHTML = `
        <div class="grid-2-col gap-2 mb-1">
          <div class="card-dark p-2 text-center" style="border: 1px solid rgba(255,255,255,0.1);">
            <div class="text-xs text-muted">Sets</div>
            <div class="text-lg font-heavy text-main">${todaySets}</div>
          </div>
          <div class="card-dark p-2 text-center" style="border: 1px solid rgba(255,255,255,0.1);">
            <div class="text-xs text-muted">Volume</div>
            <div class="text-lg font-heavy text-main">${todayVol} kg</div>
          </div>
        </div>
      `;

      const todayGym = weekData.gymStats?.[selectedDay] || {};
      const hasGymStats = todayGym.time || todayGym.avgHR || todayGym.maxHR || todayGym.cals;

      if (hasGymStats) {
        summaryHTML += `
          <div class="card-dark p-2 mb-1" style="border: 1px solid rgba(255,255,255,0.12);">
            <div class="flex-between">
              <span class="text-xs font-bold text-main" style="text-transform:uppercase;letter-spacing:0.06em;">Gym Session</span>
              <span class="text-xs text-muted">${todayGym.time || ''}</span>
            </div>
            <div class="flex gap-3 text-xs text-muted" style="margin-top:3px;">
              ${todayGym.avgHR ? `<span>❤️ ${Math.round(todayGym.avgHR)} avg</span>` : ''}
              ${todayGym.maxHR ? `<span>📈 ${Math.round(todayGym.maxHR)} max</span>` : ''}
              ${todayGym.cals  ? `<span>🔥 ${Math.round(todayGym.cals)} kcal</span>` : ''}
            </div>
          </div>
        `;
      }

      if (todayRunDist > 0) {
        summaryHTML += `
          <div class="card-dark p-2 mb-1" style="border: 1px solid var(--accent-pink);">
            <div class="flex-between">
              <span class="text-xs text-accent-pink font-bold">Run Logged</span>
              <span class="text-xs text-main">${todayRun.time || '--:--'}</span>
            </div>
            <div class="text-lg font-heavy text-inverse" style="margin-top:2px;">${todayRunDist} km</div>
            <div class="flex gap-2 text-xs text-muted" style="margin-top:2px;">
              ${todayRun.avgHR ? `<span>❤️ ${Math.round(todayRun.avgHR)} bpm</span>` : ''}
              ${todayRun.elev  ? `<span>⛰️ ${Math.round(todayRun.elev)}m</span>`     : ''}
              ${todayRun.cals  ? `<span>🔥 ${Math.round(todayRun.cals)}</span>`      : ''}
            </div>
            <div id="homeMiniMapContainer" style="height: 100px; width: 100%; border-radius: 6px; display: none; z-index: 1; margin-top: 6px;"></div>
          </div>
        `;
      }

      previewContainer.innerHTML = summaryHTML;

      if (todayRunDist > 0) {
        getMapFromDB(wk, selectedDay).then(coords => {
          if (coords && coords.length > 0) {
            const mapEl = document.getElementById('homeMiniMapContainer');
            if (mapEl) {
              mapEl.style.display = 'block';
              setTimeout(() => {
                if (activeHomeMapInstance) activeHomeMapInstance.remove();
                activeHomeMapInstance = L.map('homeMiniMapContainer', {
                  zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false
                });
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(activeHomeMapInstance);
                const route = L.polyline(coords, { color: '#f43f5e', weight: 4, opacity: 1.0 }).addTo(activeHomeMapInstance);
                activeHomeMapInstance.fitBounds(route.getBounds(), { padding: [5, 5] });
              }, 50);
            }
          }
        }).catch(err => console.warn("No map found in DB"));
      }

    } else {
      if (selectedDay !== 'sun' && homeBlueprint.runs) {
        previewContainer.innerHTML += buildRunPreviewRow(homeBlueprint.runs);
      }
      for (let liftName in todayLifts) {
        const expectedSets = Array.isArray(todayLifts[liftName]) ? todayLifts[liftName].length : 4;
        let displayLiftName = liftName;
        if (!isNaN(liftName) && homeBlueprint.lifts && homeBlueprint.lifts[parseInt(liftName, 10)]) {
          displayLiftName = homeBlueprint.lifts[parseInt(liftName, 10)];
        }
        previewContainer.innerHTML += buildLiftPreviewRow(displayLiftName, expectedSets);
      }
      if (selectedDay === 'sun' || (Object.keys(todayLifts).length === 0 && selectedDay === 'sat')) {
        previewContainer.innerHTML = buildRestDayPreview();
      }
    }
  }

  let currentWeekGymTimeSum = 0; 
  let currentWeekRunDistSum = 0;

  const dailyGymTimes = []; 
  const dailyDists = [];

  DEFAULT_DAYS.forEach(dKey => {
    const rData = weekData.runs?.[dKey];
    let dailyRunDist = 0;
    if (rData) {
      dailyRunDist = parseFloat(rData.dist) || 0;
      currentWeekRunDistSum += dailyRunDist;
    }
    dailyDists.push(dailyRunDist);

    let dailyCompletedSets = 0;
    if (weekData.lifts?.[dKey]) {
      for (let lift in weekData.lifts[dKey]) {
        if (Array.isArray(weekData.lifts[dKey][lift])) {
          weekData.lifts[dKey][lift].forEach(s => {
            if (s) {
              const isCompleted = isCompletedSet(s);
              if (isCompleted) dailyCompletedSets++;
            }
          });
        }
      }
    }

    const gStats = weekData.gymStats?.[dKey];
    let dailyGymTime = 0;
    if (gStats && gStats.time) dailyGymTime = parseDurationToMinutes(gStats.time);
    if (dailyGymTime === 0 && dailyCompletedSets > 0) dailyGymTime = dailyCompletedSets * 3;
    currentWeekGymTimeSum += dailyGymTime;
    dailyGymTimes.push(dailyGymTime);
  });

  const strengthHero = document.getElementById('focusStrengthHero');
  const runHero = document.getElementById('focusRunHero');
  const strengthChartContainer = document.getElementById('strengthBarChart');
  const runChartContainer = document.getElementById('runBarChart');
  
  if (strengthHero) strengthHero.textContent = formatMinutesToHoursMins(currentWeekGymTimeSum);
  if (runHero) runHero.textContent = currentWeekRunDistSum.toFixed(1) + ' km';

  if (strengthChartContainer && runChartContainer) {
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    
    const safeGymTimes = dailyGymTimes.map(t => isNaN(t) ? 0 : t);
    const safeDists = dailyDists.map(d => isNaN(d) ? 0 : d);
    
    const maxGymTime = Math.max(...safeGymTimes, 1);
    const maxDist = Math.max(...safeDists, 1);
    
    const BAR_AREA_PX = 47;
    const MIN_PX = 4;

    let strengthHTML = '';
    let runHTML = '';

    DEFAULT_DAYS.forEach((_, idx) => {
      const gTime = safeGymTimes[idx];
      const hasGym = gTime > 0;
      const timeH = hasGym ? Math.max(Math.round((gTime / maxGymTime) * BAR_AREA_PX), MIN_PX) : MIN_PX;
      const timeOpacity = hasGym ? '1' : '0.15';

      const rDist = safeDists[idx];
      const hasDist = rDist > 0;
      const distH = hasDist ? Math.max(Math.round((rDist / maxDist) * BAR_AREA_PX), MIN_PX) : MIN_PX;
      const distOpacity = hasDist ? '1' : '0.15';

      strengthHTML += `
        <div class="bar-column">
          <div class="bar-fill-wrap">
            <div class="bar-fill" style="height: ${timeH}px; min-height: ${timeH}px; flex-shrink: 0; width: 14px; background-color: #3b82f6; opacity: ${timeOpacity};"></div>
          </div>
          <div class="bar-label">${dayLabels[idx]}</div>
        </div>
      `;

      runHTML += `
        <div class="bar-column">
          <div class="bar-fill-wrap">
            <div class="bar-fill" style="height: ${distH}px; min-height: ${distH}px; flex-shrink: 0; width: 14px; background-color: #ec4899; opacity: ${distOpacity};"></div>
          </div>
          <div class="bar-label">${dayLabels[idx]}</div>
        </div>
      `;
    });

    strengthChartContainer.innerHTML = strengthHTML;
    runChartContainer.innerHTML = runHTML;
  }

  // TIER 1 + TIER 2 — telemetry strip + Coach's Briefing hero.
  try { renderIntel(appState, DEFAULT_DAYS, activeProgram, selectedDay); }
  catch (e) { console.warn('[intel] render skipped:', e); }

  // TIER 3 — Hybrid Focus carousel: apply saved order + enable reordering.
  try { applyFocusOrder(); mountFocusDragAndDrop(); }
  catch (e) { console.warn('[hybrid-focus] reorder skipped:', e); }

  const progressPercentage = (() => {
    let total = 0, done = 0;
    DEFAULT_DAYS.forEach(dKey => {
      const bp = getDisplayBlueprint(activeProgram, wk, dKey);
      const isRunScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
      if (isRunScheduled) total++;
      const rDist = parseFloat(weekData.runs?.[dKey]?.dist) || 0;
      if (isRunScheduled && rDist > 0) done++;
      const dayLifts = weekData.lifts?.[dKey] || {};
      for (const lift in dayLifts) {
        if (Array.isArray(dayLifts[lift])) {
          dayLifts[lift].forEach(s => {
            total++;
            if (isCompletedSet(s)) done++;
          });
        }
      }
    });
    return total > 0 ? Math.round((done / total) * 100) : 0;
  })();

  const progressPctEl = document.getElementById('homeWeeklyProgressPct');
  const progressBarEl = document.getElementById('homeWeeklyProgressBar');
  if (progressPctEl) progressPctEl.textContent = progressPercentage + '% WEEK DONE';
  if (progressBarEl) progressBarEl.style.width = progressPercentage + '%';

  const nextRunTitle = document.getElementById('homeNextRunTitle');
  const nextRunDesc = document.getElementById('homeNextRunDesc');
  if (nextRunTitle && nextRunDesc) {
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const todayIdx = dayKeys.indexOf(selectedDay);
    let foundNextRun = false;
    for (let offset = 1; offset <= 7; offset++) {
      const checkDay = dayKeys[(todayIdx + offset) % 7];
      const checkBlueprint = getDisplayBlueprint(activeProgram, wk, checkDay);
      if (checkBlueprint && checkBlueprint.runs &&
          checkBlueprint.runs.toLowerCase() !== 'rest' &&
          !checkBlueprint.runs.toLowerCase().includes('no running') &&
          !checkBlueprint.runs.toLowerCase().includes('no structured')) {
        nextRunTitle.textContent = checkBlueprint.title || 'Run Day';
        nextRunDesc.textContent = checkBlueprint.runs;
        foundNextRun = true;
        break;
      }
    }
    if (!foundNextRun) {
      nextRunTitle.textContent = 'No Run Scheduled';
      nextRunDesc.textContent = 'No aerobic sessions in the current program.';
    }
  }

  const compareCard = document.getElementById('homeWeekCompareCard');
  const compareGrid = document.getElementById('homeWeekCompareGrid');
  const prevWkNum = parseInt(wk, 10) - 1;
  if (compareCard && compareGrid && prevWkNum >= 1) {
    const prevWkData = appState.weeks[prevWkNum.toString()];
    if (prevWkData) {
      let prevVol = 0, prevDist = 0;
      let currentWeekVolSum = 0;
      DEFAULT_DAYS.forEach(d => {
        const pRun = prevWkData.runs?.[d] || {};
        prevDist += parseFloat(pRun.dist) || 0;
        const pLifts = prevWkData.lifts?.[d] || {};
        for (const l in pLifts) {
          if (Array.isArray(pLifts[l])) {
            pLifts[l].forEach(s => { 
              if (s) {
                const isCompleted = isCompletedSet(s);
                if (isCompleted) prevVol += (parseFloat(s.w)||0)*(parseInt(s.r,10)||0); 
              }
            });
          }
        }
        const cLifts = weekData.lifts?.[d] || {};
        for (const l in cLifts) {
          if (Array.isArray(cLifts[l])) {
            cLifts[l].forEach(s => { 
              if (s) {
                const isCompleted = isCompletedSet(s);
                if (isCompleted) currentWeekVolSum += (parseFloat(s.w)||0)*(parseInt(s.r,10)||0); 
              }
            });
          }
        }
      });

      const makeMetric = (label, current, prev, unit, higherIsBetter = true) => {
        if (prev === 0) return '';
        const diff = current - prev;
        const pct = Math.round((diff / prev) * 100);
        const isPositive = higherIsBetter ? diff >= 0 : diff <= 0;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        const colour = diff === 0 ? 'var(--text-muted)' : isPositive ? '#10b981' : '#ef4444';
        return `<div class="card-dark p-2 text-center" style="border:1px solid rgba(255,255,255,0.08);">
          <div class="text-xs text-muted mb-1">${label}</div>
          <div class="text-sm font-heavy text-inverse">${typeof current === 'number' ? (unit === 'km' ? current.toFixed(1) : Math.round(current).toLocaleString()) : current}${unit ? ' '+unit : ''}</div>
          <div class="text-xs font-bold" style="color:${colour};">${arrow} ${Math.abs(pct)}%</div>
        </div>`;
      };

      const volHTML  = makeMetric('Volume', currentWeekVolSum, prevVol, 'kg');
      const distHTML = makeMetric('Running', currentWeekRunDistSum, prevDist, 'km');
      const combined = [volHTML, distHTML].filter(Boolean).join('');
      if (combined) {
        compareGrid.innerHTML = combined;
        compareCard.style.display = 'block';
      } else {
        compareCard.style.display = 'none';
      }
    } else {
      compareCard.style.display = 'none';
    }
  } else if (compareCard) {
    compareCard.style.display = 'none';
  }

  const deloadCard = document.getElementById('homeDeloadSuggestionCard');
  const deloadReason = document.getElementById('homeDeloadReason');
  if (deloadCard) {
    const alreadyDismissed = appState._deloadDismissedWeek === appState.currentWeek;
    const alreadyApplied   = appState.deloadApplied === appState.currentWeek;
    if (!alreadyDismissed && !alreadyApplied) {
      try {
        const deloadSignal = shouldSuggestDeload();
        if (deloadSignal.suggest) {
          if (deloadReason) deloadReason.textContent = deloadSignal.reason;
          deloadCard.style.display = 'block';
        } else {
          deloadCard.style.display = 'none';
        }
      } catch(e) {
        deloadCard.style.display = 'none';
      }
    } else {
      deloadCard.style.display = 'none';
    }
  }
}

// ==========================================
// TIER 1/2 — TELEMETRY STRIP + COACH'S BRIEFING
// ==========================================
function metaColor(tone) {
  const m = CATEGORY_META[tone] || CATEGORY_META.progress;
  return m ? m.color : 'var(--accent-blue,#3b82f6)';
}

function renderIntel(appState, days, program, selectedDay) {
  const wk = appState.currentWeek || '1';
  const maxWeek = program?.totalWeeks || 12;

  let report = { insights: [], allInsights: [], meta: { dataWeeks: 0 } };
  try { report = generateInsights(appState, { days, program, currentWeek: wk, maxWeek, topN: 20 }); } catch {}

  let recovery = { hasData: false };
  try { recovery = computeRecoveryScore(appState, days); } catch {}

  let readiness = { hasData: false };
  try {
    const load = computeWeeklyLoadSeries(appState, days, maxWeek);
    const totalByWeek = load.lift.map((v, i) => v + (load.run[i] || 0));
    readiness = computeReadiness(totalByWeek, wk);
  } catch {}

  const active = activeCaloriesForDay(appState, wk, selectedDay);
  const energy = energyProfile(appState.athleteProfile, active);
  const all = report.allInsights || report.insights || [];
  const ctx = {
    dataWeeks: report.meta?.dataWeeks || 0,
    recovery, readiness, energy,
    focusObservation: all[0]?.observation,
  };

  renderTelemetryStrip(buildTelemetry(ctx));
  renderBriefing(composeBriefing(ctx), contextVerdict(all));
}

function renderTelemetryStrip(items) {
  const el = document.getElementById('telemetryStrip');
  if (!el) return;
  el.innerHTML = (items || []).map(it => {
    const action = it.nav === 'profile'
      ? 'data-action="open-profile"'
      : it.nav ? `data-action="open-analytics" data-context="${it.nav}"` : '';
    const cursor = it.nav ? 'cursor:pointer;' : '';
    return `<div class="card-dark" ${action} style="flex:0 0 auto;min-width:84px;padding:8px 12px;border-radius:10px;${cursor}">
      <div class="text-muted" style="font-size:0.55rem;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(it.label)}</div>
      <div class="font-heavy text-inverse" style="font-size:0.95rem;line-height:1.1;white-space:nowrap;">${escapeHtml(it.value)}${it.unit ? ` <span class="text-muted" style="font-size:0.6rem;">${escapeHtml(it.unit)}</span>` : ''}</div>
    </div>`;
  }).join('');
}

function renderBriefing(text, verdict) {
  const el = document.getElementById('brainBriefing');
  const body = document.getElementById('brainBriefingBody');
  const vEl = document.getElementById('brainBriefingVerdict');
  if (!el || !body) return;
  el.style.display = 'block';
  body.textContent = text;
  if (vEl) {
    if (verdict) { vEl.textContent = verdict.label; vEl.style.color = metaColor(verdict.tone); }
    else { vEl.textContent = ''; }
  }
}

// ==========================================
// ATHLETE PROFILE CAPTURE
// ==========================================
function openProfileModal() {
  const p = _getState().athleteProfile || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  set('profileAge', p.age);
  set('profileHeight', p.heightCm);
  set('profileWeight', p.weightKg);
  const sex = document.getElementById('profileSex'); if (sex && p.sex) sex.value = p.sex;
  document.getElementById('profileModal')?.classList.add('active');
}
function closeProfileModal() { document.getElementById('profileModal')?.classList.remove('active'); }
function saveAthleteProfile() {
  const appState = _getState();
  const num = (id) => parseFloat(document.getElementById(id)?.value);
  appState.athleteProfile = {
    age: parseInt(document.getElementById('profileAge')?.value, 10) || null,
    sex: document.getElementById('profileSex')?.value || null,
    heightCm: num('profileHeight') || null,
    weightKg: num('profileWeight') || null,
  };
  saveStateToLocalStorage(true);
  closeProfileModal();
  try { renderHome(); } catch {}
}

// ==========================================
// EVENT DELEGATION ROUTER
// ==========================================
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');

  if (action === 'open-tile-customiser') {
    openTileCustomiser();
  } else if (action === 'close-tile-customiser') {
    const apply = target.getAttribute('data-apply') === 'true';
    closeTileCustomiser(apply);
  } else if (action === 'reset-tile-customiser') {
    resetTileCustomiser();
  } else if (action === 'open-profile') {
    openProfileModal();
  } else if (action === 'close-profile') {
    closeProfileModal();
  } else if (action === 'save-profile') {
    saveAthleteProfile();
  }
});