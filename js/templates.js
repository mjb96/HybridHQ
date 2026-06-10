// ==========================================
// UPGRADED TEMPLATES — HTML SPATIAL BUILDERS
// ==========================================
import { DAY_NAMES_FULL } from './constants.js';
import { escapeHtml } from './util.js';

export function buildRunPreviewRow(runsText) {
  const firstSegment = runsText.split('•')[0];
  return `<div class="flex-between dashboard-preview-row" style="font-size: 0.8rem; color: var(--accent-cyan-glow); font-weight: 700;">
    <span>🏃 Road Assignment Focus</span>
    <span class="text-xs-muted text-truncate">${escapeHtml(firstSegment)}</span>
  </div>`;
}

export function buildLiftPreviewRow(displayLiftName, setsCount) {
  return `<div class="flex-between dashboard-preview-row" style="font-size: 0.8rem; color: #f1f5f9; font-weight: 700;">
    <span>🏋️ ${escapeHtml(displayLiftName)}</span>
    <span class="text-xs-muted badge-count-pill">${setsCount} Sets</span>
  </div>`;
}

export function buildRestDayPreview() {
  return `<div class="rest-decompression-banner">
    💤 Complete baseline decompression phase active.
  </div>`;
}

export function buildEmptyWorkoutCard() {
  return '<div class="card-dark text-xs-muted empty-state-card">No lifting scheduled today.</div>';
}

export function buildSetRow(sData, sIdx, safeLiftName, historicalSetData = null) {
  const ghostWeight = historicalSetData && historicalSetData.w ? historicalSetData.w : 'kg';
  const ghostReps = historicalSetData && historicalSetData.r ? historicalSetData.r : 'reps';

  const hasHistory = historicalSetData && historicalSetData.w && historicalSetData.r;
  const historyMarkup = hasHistory 
    ? `<div style="flex-basis: 100%; grid-column: 1 / -1; text-align: center; font-size: 0.68rem; color: rgba(255, 255, 255, 0.45); margin-top: 4px; margin-bottom: 2px; font-weight: 500; letter-spacing: 0.02em;">Last: ${historicalSetData.w}kg × ${historicalSetData.r}</div>`
    : '';

  return `<div class="cockpit-set-row ${sData.c ? 'is-complete' : ''}" data-set-index="${sIdx}">
    <div class="set-num-lbl tactile-scale" 
         data-action="quick-log" 
         data-liftname="${safeLiftName}" 
         data-sidx="${sIdx}"
         title="One-Tap Quick Log (Uses Ghost Targets)" 
         style="cursor:pointer; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); text-align: center;">
         S${sIdx + 1}
    </div>
    <div>
      <input type="number" class="input-weight-node" placeholder="${ghostWeight}" value="${sData.w || ''}">
    </div>
    <div>
      <input type="number" class="input-reps-node" placeholder="${ghostReps}" value="${sData.r || ''}">
    </div>
    <div class="gym-check-container">
      <label class="gym-check-wrap">
        <input type="checkbox" class="gym-check" ${sData.c ? 'checked' : ''}>
        <span class="gym-check-icon">✓</span>
      </label>
    </div>
    <div>
      <button class="btn-set-delete tactile-scale"
        data-action="remove-set" 
        data-liftname="${safeLiftName}" 
        data-sidx="${sIdx}">✕</button>
    </div>
    ${historyMarkup}
    <div class="quick-pad-row">
      <button class="btn-pad tactile-scale" data-action="quick-modifier" data-modifier="match" data-sidx="${sIdx}">LAST</button>
      <button class="btn-pad tactile-scale" data-action="quick-modifier" data-modifier="p25" data-sidx="${sIdx}">+2.5kg</button>
      <button class="btn-pad tactile-scale" data-action="quick-modifier" data-modifier="p5" data-sidx="${sIdx}">+5kg</button>
      <button class="btn-pad tactile-scale" data-action="quick-modifier" data-modifier="r1" data-sidx="${sIdx}">+1 Rep</button>
    </div>
  </div>`;
}

export function buildExerciseCard({ displaySafeName, safeLiftName, isCompleted, diagnostic, blueprintLabel, historicalLineText, setsMarkup }) {
  const stalledBadge = diagnostic.isStalled ? `<span class="badge-stall-indicator">STALLED</span>` : '';
  const targetStyle = diagnostic.isStalled ? 'color: var(--accent-red); font-weight: 800;' : '';

  return `<div class="cockpit-header">
    <div class="drag-handle-grip">☰</div>
    <div class="cockpit-header-clickzone" data-action="toggle-accordion">
      <div class="header-text-block">
        <div class="title-badge-row" style="display:flex; align-items:center;">
          <span class="cockpit-ex-name">${displaySafeName}</span>
          ${stalledBadge}
        </div>
        <div class="cockpit-ex-target" style="${targetStyle}">${blueprintLabel}</div>
      </div>
      <div class="cockpit-ex-status">${isCompleted ? 'DONE' : 'LOG'}</div>
    </div>
  </div>
  <div class="cockpit-body">
    <div class="local-timer-placeholder"></div>
    <span class="cockpit-history-line">⚡ ${historicalLineText}</span>
    <div class="set-rows-list">${setsMarkup}</div>
    <div class="flex gap-2">
      <button class="btn-pad-append tactile-scale" data-action="repeat-last" data-liftname="${safeLiftName}" style="flex:1;">⟲ Repeat Last</button>
      <button class="btn-pad-append tactile-scale" data-action="append-set" data-liftname="${safeLiftName}" style="flex:1;">+ Add Set</button>
    </div>
  </div>`;
}

export function buildProgramOverviewHTML(prog, currentWeek) {
  if (!prog) return '';
  const dossier = prog.dossier || { creator: 'Unknown System', focus: 'General Training', philosophy: 'No specific philosophy provided.' };
  
  return `
    <article class="card-dark p-4 mb-5 program-overview-card" style="border: 1px solid rgba(59, 130, 246, 0.3); background: linear-gradient(180deg, var(--bg-card) 0%, #0a1122 100%);">
      <div class="flex-between mb-3">
        <span class="badge-primary" style="background: rgba(34, 211, 238, 0.1); color: var(--accent-cyan); border: 1px solid var(--accent-cyan);">
          ✍️ By: ${escapeHtml(dossier.creator)}
        </span>
        <span class="text-xs-bold text-accent-blue tracking-wide uppercase">${escapeHtml(dossier.focus)}</span>
      </div>
      
      <h3 class="text-2xl font-heavy text-inverse mb-2" style="letter-spacing: -0.5px;">
        ${escapeHtml(prog.name)}
      </h3>
      
      <div class="mt-3 pt-3" style="border-top: 1px dashed var(--overlay-sm);">
        <p class="text-sm text-muted leading-relaxed mb-4">
          ${escapeHtml(dossier.philosophy)}
        </p>
        <div class="flex-between text-sm py-2 border-b-glass">
          <span class="text-muted">Total Timeline</span>
          <strong class="text-main">${prog.totalWeeks} Weeks</strong>
        </div>
        <div class="flex-between text-sm py-2">
          <span class="text-muted">Active Block Stage</span>
          <strong class="text-accent-blue">Week ${currentWeek}</strong>
        </div>

        <div class="mt-4 pt-3" style="border-top: 1px dashed var(--overlay-sm);">
          <button class="btn-action-block btn-ghost" style="border: 1px solid var(--accent-blue); color: var(--accent-blue);" data-action="edit-program" data-program-id="${prog.id}">
            ✏️ Edit Current Plan
          </button>
          <p class="text-xs text-muted text-center mt-2">Changes apply immediately to your active workout schema.</p>
        </div>
      </div>
    </article>
  `;
}

export function buildWeekMatrixHTML(prog, currentWeek) {
  if (!prog || !prog.weeklyVolModifiers) return '<div class="card-dark p-4 text-center text-muted">No week matrix available.</div>';
  let rows = '';
  for (let wk in prog.weeklyVolModifiers) {
    const mod = prog.weeklyVolModifiers[wk];
    const isCurrent = wk === currentWeek;
    rows += `<div class="flex-between p-3 mb-2 rounded week-matrix-row ${isCurrent ? 'matrix-row-active' : ''}">
      <span class="text-sm font-bold ${isCurrent ? 'text-accent-blue' : 'text-muted'}">Week ${wk}</span>
      <span class="text-xs font-heavy text-inverse">${mod.sets} × ${mod.reps} <span class="text-muted font-medium">— ${escapeHtml(mod.intensityLabel)}</span></span>
    </div>`;
  }
  return `<div class="card-dark p-4">${rows}</div>`;
}

export function buildDaysSplitHTML(prog) {
  if (!prog || !prog.days) return '';
  let html = '';
  for (const [dayKey, day] of Object.entries(prog.days)) {
    const liftsHTML = (day.lifts && day.lifts.length > 0)
      ? `<div class="text-sm-label mt-2 mb-2">LIFTING DISCIPLINE TIERS</div>` +
        day.lifts.map(l => `<div class="text-sm text-inverse day-split-lift-item">🔹 ${escapeHtml(l)}</div>`).join('')
      : '';
    const runsHTML = (day.runs && day.runs !== "Rest")
      ? `<div class="text-sm-label mt-3 mb-2" style="color: var(--accent-cyan-glow)">AEROBIC COMPONENT TARGET</div><div class="text-xs-muted day-split-run-item">🏃 ${escapeHtml(day.runs)}</div>`
      : '';
    html += `<div class="card-dark p-4 flex-col">
      <div class="flex-between mb-2">
        <span class="badge-primary" style="background:${day.color || 'var(--accent-blue)'}">${escapeHtml(day.badge || 'Rest')}</span>
        <span class="text-xs-muted font-heavy text-uppercase tracking-wider">${DAY_NAMES_FULL[dayKey] || dayKey}</span>
      </div>
      <div class="text-lg font-heavy text-inverse mb-1">${escapeHtml(day.title || 'Rest')}</div>
      <div class="text-xs-muted mb-3 leading-snug">${escapeHtml(day.desc || '')}</div>
      <div class="split-drill-deck">${liftsHTML}${runsHTML}</div>
    </div>`;
  }
  return html;
}

export function buildLibraryCardHTML(prog, id, isCustom, isActive) {
  const activeBadge = isActive ? `<span class="badge-primary" style="background:var(--color-green); color:#fff; border:none;">ACTIVE</span>` : '';
  const typeBadge = isCustom 
    ? `<span class="badge-primary" style="background:rgba(245, 158, 11, 0.1); color:var(--accent-amber); border:1px solid var(--accent-amber);">CUSTOM</span>`
    : `<span class="badge-primary" style="background:rgba(34, 211, 238, 0.1); color:var(--accent-cyan); border:1px solid var(--accent-cyan);">SYSTEM</span>`;

  let actionsHTML = `<button class="btn-pad tactile-scale" style="flex:1; border-color: ${isActive ? 'var(--color-green)' : ''}; color: ${isActive ? 'var(--color-green)' : ''};" data-action="make-active-program" data-program-id="${id}">${isActive ? 'Current Plan' : 'Make Active'}</button>`;
  
  if (isCustom) {
    actionsHTML += `
      <button class="btn-pad tactile-scale" style="flex:1;" data-action="open-builder" data-program-id="${id}">Edit</button>
      <button class="btn-pad tactile-scale" style="width:40px; background:rgba(239, 68, 68, 0.1); color:var(--accent-red); border-color:rgba(239,68,68,0.2);" data-action="delete-program" data-program-id="${id}">🗑️</button>
    `;
  }
  actionsHTML += `<button class="btn-pad tactile-scale" style="width:40px;" data-action="duplicate-program" data-program-id="${id}" title="Duplicate">📑</button>`;

  return `
    <article class="card-dark p-3" style="${isActive ? 'border-color: var(--color-green); box-shadow: 0 0 16px rgba(16, 185, 129, 0.15);' : ''}">
      <div class="flex-between mb-2">
        <div class="flex gap-2">${activeBadge}${typeBadge}</div>
        <span class="text-xs-bold text-muted">${prog.totalWeeks} Weeks</span>
      </div>
      <h3 class="text-lg font-heavy text-inverse mb-1">${escapeHtml(prog.name)}</h3>
      <p class="text-xs text-muted mb-3" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
        ${escapeHtml(prog.dossier?.philosophy || 'No description provided.')}
      </p>
      <div class="flex gap-2 mt-2 pt-3" style="border-top: 1px dashed var(--overlay-sm);">
        ${actionsHTML}
      </div>
    </article>
  `;
}
