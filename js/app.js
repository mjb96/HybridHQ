// ==========================================
// CLEANED CORE PROTOCOL ROUTER (app.js)
// ==========================================
import { CONFIG, PROGRAMS, WEEK_PHASE_NAMES, DAY_NAMES_FULL } from './constants.js';
import { buildProgramOverviewHTML, buildWeekMatrixHTML, buildDaysSplitHTML, buildLibraryCardHTML } from './templates.js';
import { openBuilder } from './program_builder.js'; 

import {
  appState, activeTab, selectedDay, DEFAULT_DAYS,
  setActiveTab, setSelectedDay, setAppState,
  getProgramById, createCustomProgram, duplicateCustomProgram, deleteCustomProgram,
  determineDefaultCalendarDay,
  verifyWeekStorageSchema,
  saveStateToLocalStorage,
  pullEngineDataFromStorage,
  triggerTextSummaryExport,
  triggerEngineExport,
  triggerCSVExport,
  triggerEngineImport,
  setImportSuccessCallback,
  showToast,
  checkActiveSession,
  loginToSupabase
} from './state.js';

import { initEngine, shouldSuggestDeload } from './engine.js';
import { initHome, renderHome, closeTileCustomiser, resetTileCustomiser } from './home.js';
import { initAnalytics, renderAnalytics, saveThresholdPace, logBodyWeight } from './analytics.js';
import { initDragDrop, resetTileOrder, exitTileEditMode } from './dragdrop.js';
import {
  initWorkout, renderWorkout,
  updateInputState, commitWorkoutUIState, toggleGymCheckLoggingState,
  applyQuickFillModifier, appendCustomSetRow, removeCustomSetRow,
  toggleAccordionManual, toggleQuickPad,
  openAddExerciseModal, closeAddExerciseModal, confirmAddExercise,
  openConfirmResetModal, closeConfirmResetModal, executeResetActiveDayMetrics,
  openFinishSessionModal, closeFinishSessionModal,
  handleExerciseDropdownSelectionChange 
} from './workout.js';

import { startWorkoutTimer, dismissRestTimer, checkActiveTimerOnLoad } from './timers.js';
import { saveMapToDB } from './db.js';
import { initGarminRunImport, initGarminGymImport } from './garmin.js';

document.addEventListener('app:storage-loaded', () => {
  try {
    hydrateCurrentView();
  } catch (err) {
    console.warn('UI Hydration pending full app initialization.', err);
  }
});

document.addEventListener('app:library-updated', () => {
  try {
    renderProgramLibrary();
  } catch (err) {
    console.warn('Library render failed after builder closed.', err);
  }
});

document.addEventListener('app:navigate', (e) => {
  const target = e.detail?.target;
  if (!target) return;
  if (target === 'custom:today-summary') openTodaySummaryModal();
  else openAnalyticsView(target);
});

window.analyticsContext = 'overview';

export function openAnalyticsView(context) {
  window.analyticsContext = context;
  switchGlobalAppTab('analytics');
}

export function switchGlobalAppTab(targetViewID) {
  if (activeTab === 'workout') {
    try { commitWorkoutUIState(); } catch(e) { console.warn(e); }
  }
  
  document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  setActiveTab(targetViewID);
  
  const targetPanel = document.getElementById('view-' + targetViewID);
  if (targetPanel) targetPanel.classList.add('active');
  
  const navItem = document.querySelector('.nav-item[data-target="' + targetViewID + '"]');
  if (navItem) navItem.classList.add('active');
  
  hydrateCurrentView();
}

export function setCockpitActiveDay(dayKey) {
  if (activeTab === 'workout') {
    try { commitWorkoutUIState(); } catch(e) { console.warn(e); }
  }
  setSelectedDay(dayKey);
  document.querySelectorAll('#cockpitDaySelectorBar .day-pill').forEach(p => {
    p.classList.toggle('active', p.getAttribute('data-day') === dayKey);
  });
  if (activeTab === 'workout') safeRenderExecution(renderWorkout, "Workout View Render");
}

export function launchActiveWorkoutCockpit() {
  switchGlobalAppTab('workout');
  setCockpitActiveDay(selectedDay);
  window.scrollTo(0, 0);
}

// ==========================================
// PROGRAM LIBRARY ROUTING
// ==========================================
export function switchProgramMode(mode) {
  const btnActive = document.getElementById('btnProgModeActive');
  const btnLibrary = document.getElementById('btnProgModeLibrary');
  const viewActive = document.getElementById('progModeActiveContainer');
  const viewLibrary = document.getElementById('progModeLibraryContainer');
  const viewBuilder = document.getElementById('builderViewContainer');

  if (viewBuilder) viewBuilder.style.display = 'none';

  if (mode === 'active') {
    btnActive?.classList.add('active');
    btnLibrary?.classList.remove('active');
    viewActive.style.display = 'block';
    viewLibrary.style.display = 'none';
  } else {
    btnLibrary?.classList.add('active');
    btnActive?.classList.remove('active');
    viewLibrary.style.display = 'block';
    viewActive.style.display = 'none';
    renderProgramLibrary();
  }
}

export function renderProgramLibrary() {
  const customGrid = document.getElementById('libraryGridCustom');
  const systemGrid = document.getElementById('libraryGridSystem');
  if (!customGrid || !systemGrid) return;

  const currentActiveId = appState.activeProgramId;

  if (!appState.customPrograms || appState.customPrograms.length === 0) {
    customGrid.innerHTML = '<div class="text-sm text-muted text-center p-3 border-dashed" style="border: 1px dashed var(--overlay-sm); border-radius: 8px;">No custom programs created yet.</div>';
  } else {
    customGrid.innerHTML = appState.customPrograms.map(p => 
      buildLibraryCardHTML(p, p.id, true, p.id === currentActiveId)
    ).join('');
  }

  let systemHTML = '';
  for (const [id, prog] of Object.entries(PROGRAMS)) {
    systemHTML += buildLibraryCardHTML(prog, id, false, id === currentActiveId);
  }
  systemGrid.innerHTML = systemHTML;
}

export function triggerMakeActiveProgram(newProgramId) {
  if (newProgramId === appState.activeProgramId) return;

  const hasLoggedData = appState.weeks && appState.weeks[appState.currentWeek] &&
    Object.values(appState.weeks[appState.currentWeek].lifts || {}).some(day =>
      Object.values(day).some(sets => sets.some(s => s.c))
    );

  if (hasLoggedData) {
    const modal = document.getElementById('programSwitchModal');
    const label = document.getElementById('programSwitchWeekLabel');
    if (modal) modal.setAttribute('data-pending', newProgramId);
    if (label) label.textContent = appState.currentWeek;
    if (modal) modal.classList.add('active');
  } else {
    applyProgramSwitch(newProgramId);
  }
}

export function confirmProgramSwitch() {
  const modal = document.getElementById('programSwitchModal');
  if (!modal) return;
  const newProgramId = modal.getAttribute('data-pending');
  modal.classList.remove('active');
  applyProgramSwitch(newProgramId);
}

export function cancelProgramSwitch() {
  const modal = document.getElementById('programSwitchModal');
  if (modal) modal.classList.remove('active');
}

function applyProgramSwitch(newProgramId) {
  appState.activeProgramId = newProgramId;
  if (appState.weeks && appState.weeks[appState.currentWeek]) {
    delete appState.weeks[appState.currentWeek];
  }
  appState.weekStartedAt = new Date().toISOString();

  saveStateToLocalStorage(true);
  hydrateCurrentView();
  
  if (document.getElementById('progModeLibraryContainer')?.style.display === 'block') {
    renderProgramLibrary(); 
  }
  showToast('Program Template Switched ✓');
}

export function handleMacroWeekSwitch() {
  const weekSelectElement = document.getElementById('globalWeekSelect');
  if (!weekSelectElement) return;
  
  appState.currentWeek = weekSelectElement.value;
  appState.weekStartedAt = new Date().toISOString(); 
  saveStateToLocalStorage(true);
  
  verifyWeekStorageSchema(appState.currentWeek);
  hydrateCurrentView();
  showToast('Switched to Week ' + appState.currentWeek);
}

export function hydrateCurrentView() {
  verifyWeekStorageSchema(appState.currentWeek);
  
  if (activeTab === 'home') safeRenderExecution(renderHome, "Home Dashboard Render");
  else if (activeTab === 'workout') safeRenderExecution(renderWorkout, "Workout Cockpit Render");
  else if (activeTab === 'analytics') safeRenderExecution(renderAnalytics, "Performance Matrix Render");
  else if (activeTab === 'program') {
    const wkSelect = document.getElementById('globalWeekSelect');
    if (wkSelect) wkSelect.value = appState.currentWeek;
    switchBrowserSectionTab('overview');
  }
}

function safeRenderExecution(renderFn, viewLabel) {
  try { renderFn(); } catch (err) { console.warn(`[Insulation Shield] Prevented load crash on ${viewLabel}:`, err); }
}

export function switchBrowserSectionTab(tabName) {
  const overviewContainer = document.getElementById('programBrowserDetails');
  const daysContainer = document.getElementById('programBrowserDaysDeck');
  const tabOverview = document.getElementById('btnBrowserTabOverview');
  const tabWeeks = document.getElementById('btnBrowserTabWeeks');
  const tabTiers = document.getElementById('btnBrowserTabTiers');

  if (tabOverview) tabOverview.classList.remove('active');
  if (tabWeeks) tabWeeks.classList.remove('active');
  if (tabTiers) tabTiers.classList.remove('active');

  const prog = getProgramById(appState.activeProgramId);
  const currentWk = appState.currentWeek || "1";

  if (tabName === 'overview' && overviewContainer && daysContainer) {
    if (tabOverview) tabOverview.classList.add('active');
    overviewContainer.innerHTML = buildProgramOverviewHTML(prog, currentWk);
    daysContainer.innerHTML = '';
  } else if (tabName === 'weeks' && overviewContainer && daysContainer) {
    if (tabWeeks) tabWeeks.classList.add('active');
    overviewContainer.innerHTML = buildWeekMatrixHTML(prog, currentWk);
    daysContainer.innerHTML = '';
  } else if (tabName === 'tiers' && overviewContainer && daysContainer) {
    if (tabTiers) tabTiers.classList.add('active');
    overviewContainer.innerHTML = '';
    daysContainer.innerHTML = buildDaysSplitHTML(prog);
  }
}

export function triggerEditActiveProgram(progId) {
  const isSystem = !!PROGRAMS[progId];
  
  if (isSystem) {
    if (confirm("System blueprints are read-only. Duplicate this to a Custom Program so you can edit it?")) {
      const newId = 'prog_' + Date.now();
      const source = JSON.parse(JSON.stringify(PROGRAMS[progId]));
      source.id = newId;
      source.name = source.name + " (Custom)";
      if (source.dossier) source.dossier.creator = "You";
      
      if (!appState.customPrograms) appState.customPrograms = [];
      appState.customPrograms.push(source);
      
      appState.activeProgramId = newId;
      
      if (appState.weeks && appState.weeks[appState.currentWeek]) {
        delete appState.weeks[appState.currentWeek];
      }
      
      saveStateToLocalStorage(true);
      hydrateCurrentView();
      
      switchProgramMode('library');
      openBuilder(newId);
    }
  } else {
    if (appState.weeks && appState.weeks[appState.currentWeek]) {
      if (confirm("Reset current week's log to apply your new template edits immediately? (Press Cancel to apply only to future weeks)")) {
         delete appState.weeks[appState.currentWeek];
         saveStateToLocalStorage(true);
         hydrateCurrentView();
      }
    }
    
    switchProgramMode('library');
    openBuilder(progId);
  }
}

export function confirmWeekAdvance() {
  const modal = document.getElementById('weekAdvanceModal');
  if (!modal) return;
  const nextWeekString = modal.getAttribute('data-pending-week');
  modal.classList.remove('active');
  if (nextWeekString) {
    appState.currentWeek = nextWeekString;
    appState.weekStartedAt = new Date().toISOString(); 
    verifyWeekStorageSchema(appState.currentWeek);
    saveStateToLocalStorage(true);
    hydrateCurrentView();
    const weekSelectElement = document.getElementById('globalWeekSelect');
    if (weekSelectElement) weekSelectElement.value = nextWeekString;
    showToast(`Advanced to Week ${nextWeekString}!`);
  }
}

export function cancelWeekAdvance() {
  const modal = document.getElementById('weekAdvanceModal');
  if (!modal) return;
  modal.classList.remove('active');
  const today = new Date();
  const fallbackDate = new Date();
  fallbackDate.setDate(today.getDate() - 4); 
  appState.weekStartedAt = fallbackDate.toISOString();
  saveStateToLocalStorage(true);
}

export function openCreateProgramModal() { document.getElementById('createProgramModal').classList.add('active'); }
export function closeCreateProgramModal() { document.getElementById('createProgramModal').classList.remove('active'); }

export function executeCreateProgram() {
  const name = document.getElementById('cpInputName').value;
  const focus = document.getElementById('cpInputFocus').value;
  const wks = document.getElementById('cpInputWeeks').value;
  createCustomProgram(name, wks, focus, "");
  closeCreateProgramModal();
  renderProgramLibrary();
  showToast('Custom Program Created!');
  document.getElementById('cpInputName').value = '';
  document.getElementById('cpInputFocus').value = '';
  document.getElementById('cpInputWeeks').value = '12';
}

export function executeDeleteProgram(id) {
  if(confirm("Are you sure you want to delete this custom program?")) {
    const result = deleteCustomProgram(id);
    if (result.success) {
      renderProgramLibrary();
      showToast('Program deleted.');
    } else {
      showToast(result.message, true);
    }
  }
}

export function executeDuplicateProgram(id) {
  duplicateCustomProgram(id);
  renderProgramLibrary();
}

// ==========================================
// MODALS & SUMMARY LOGIC
// ==========================================
export function openTodaySummaryModal() {
  const modal = document.getElementById('todaySummaryModal');
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const dayNames = {sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'};
  const todayKey = selectedDay || days[new Date().getDay()];

  document.getElementById('todaySummaryDayLabel').textContent = dayNames[todayKey] || '';

  let volume = 0, sets = 0, gymRpe = null, runDist = null, runTime = null, runPace = null, runRpe = null, notes = '';

  const wk = appState.currentWeek || '1';
  const weekData = appState.weeks?.[wk];
  
  if (weekData) {
    const dayLifts = weekData.lifts?.[todayKey] || {};
    for (const lift in dayLifts) {
      if (Array.isArray(dayLifts[lift])) {
        dayLifts[lift].forEach(s => {
          if (s && s.c) {
            sets++;
            volume += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
          }
        });
      }
    }

    const runData = weekData.runs?.[todayKey] || {};
    runDist = parseFloat(runData.dist) || null;
    runTime = runData.time || null;
    runRpe  = runData.rpe  || null;

    gymRpe = weekData.gymRpe?.[todayKey] || null;
    notes = weekData.notes?.[todayKey] || '';
  }

  if (runDist && runTime) {
    const p = runTime.toString().split(':');
    const tm = p.length === 2 ? parseInt(p[0]) + parseInt(p[1]) / 60 : parseFloat(p[0]);
    if (tm > 0 && runDist > 0) {
      const pt = tm / runDist;
      const pm = Math.floor(pt);
      const ps = Math.round((pt - pm) * 60).toString().padStart(2, '0');
      runPace = pm + ':' + ps;
    }
  }

  const hasLift  = volume > 0 || sets > 0;
  const hasRun   = runDist > 0 || runTime;
  const hasNotes = notes && notes.trim().length > 0;
  const isEmpty  = !hasLift && !hasRun && !hasNotes;

  document.getElementById('todaySummaryLiftBlock').style.display = hasLift ? '' : 'none';
  document.getElementById('todaySummaryVolume').textContent  = Math.round(volume).toLocaleString() + ' kg';
  document.getElementById('todaySummarySets').textContent    = sets;
  document.getElementById('todaySummaryGymRpe').textContent  = gymRpe || '--';

  document.getElementById('todaySummaryRunBlock').style.display = hasRun ? '' : 'none';
  document.getElementById('todaySummaryRunDist').textContent  = runDist ? runDist + ' km' : '-- km';
  document.getElementById('todaySummaryRunTime').textContent  = runTime || '--:--';
  document.getElementById('todaySummaryRunPace').textContent  = runPace ? runPace + ' /km' : '-- /km';
  document.getElementById('todaySummaryRunRpe').textContent   = runRpe || '--';

  document.getElementById('todaySummaryNotesBlock').style.display = hasNotes ? '' : 'none';
  document.getElementById('todaySummaryNotes').textContent = notes;

  document.getElementById('todaySummaryEmpty').style.display = isEmpty ? '' : 'none';

  if (modal) modal.style.display = 'flex';
}

export function closeTodaySummaryModal() {
  const modal = document.getElementById('todaySummaryModal');
  if (modal) modal.style.display = 'none';
}

// ==========================================
// GLOBAL EVENT DELEGATION ROUTER
// ==========================================
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  const progId = target.getAttribute('data-program-id');

  // Tab & Navigation
  if (action === 'switch-tab') switchGlobalAppTab(target.getAttribute('data-target'));
  else if (action === 'open-analytics') openAnalyticsView(target.getAttribute('data-context'));
  else if (action === 'set-day') setCockpitActiveDay(target.getAttribute('data-day'));
  else if (action === 'switch-browser-tab') switchBrowserSectionTab(target.getAttribute('data-tab'));
  
  // Timers
  else if (action === 'start-timer') startWorkoutTimer();
  else if (action === 'dismiss-rest') dismissRestTimer();

  // Programs & Library
  else if (action === 'switch-program-mode') switchProgramMode(target.getAttribute('data-mode'));
  else if (action === 'open-create-program') openCreateProgramModal();
  else if (action === 'close-create-program') closeCreateProgramModal();
  else if (action === 'execute-create-program') executeCreateProgram();
  else if (action === 'cancel-program-switch') cancelProgramSwitch();
  else if (action === 'confirm-program-switch') confirmProgramSwitch();
  else if (action === 'cancel-week-advance') cancelWeekAdvance();
  else if (action === 'confirm-week-advance') confirmWeekAdvance();
  else if (action === 'edit-program') triggerEditActiveProgram(progId);
  else if (action === 'make-active-program') triggerMakeActiveProgram(progId);
  else if (action === 'open-builder') openBuilder(progId);
  else if (action === 'delete-program') executeDeleteProgram(progId);
  else if (action === 'duplicate-program') executeDuplicateProgram(progId);
  
  // Export & Data
  else if (action === 'export-text') triggerTextSummaryExport();
  else if (action === 'export-json') triggerEngineExport();
  else if (action === 'export-csv') triggerCSVExport();
  
  // Auth
  else if (action === 'login-supabase') loginToSupabase();
  else if (action === 'close-auth') document.getElementById('authOverlay').style.display = 'none';
  
  // Summary Modals
  else if (action === 'open-today-summary') openTodaySummaryModal();
  else if (action === 'close-today-summary') closeTodaySummaryModal();
  else if (action === 'close-today-summary-nav') { 
    closeTodaySummaryModal(); 
    switchGlobalAppTab('workout'); 
  }
  
  // Analytics
  else if (action === 'log-body-weight') logBodyWeight();
});

document.addEventListener('change', (e) => {
  const target = e.target;
  
  // ID-based handlers (No data-action required)
  if (target.id === 'analyticsThresholdPaceInput') {
    saveThresholdPace(target.value);
    return;
  }

  // Data-action based handlers
  const actionTarget = target.closest('[data-action]');
  if (!actionTarget) return;
  const action = actionTarget.getAttribute('data-action');

  if (action === 'macro-week-switch') handleMacroWeekSwitch();
  else if (action === 'import-json') triggerEngineImport(e);
});

// ==========================================
// BOOTSTRAP AND INITIALIZATION
// ==========================================
const getState = () => appState;
const getSelectedDay = () => selectedDay;
const getDays = () => DEFAULT_DAYS;
const saveState = (suppress) => saveStateToLocalStorage(suppress);

initEngine(getState, getDays);
initHome(getState, getSelectedDay, getDays);
initAnalytics(getState, getDays);
initDragDrop(getState, getSelectedDay, saveState);
initWorkout(getState, getSelectedDay, getDays, saveState, switchGlobalAppTab);

// === DEVICE IMPORT WIRING ===

initGarminRunImport((distance, timeStr, coordinates, stats) => {
  const wk = appState.currentWeek;
  const sd = selectedDay;
  if (appState.weeks[wk]) {
    if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
    appState.weeks[wk].runs[sd] = {
      dist:           distance,
      time:           timeStr,
      rpe:            appState.weeks[wk].runs[sd]?.rpe || '',
      avgHR:          stats?.avgHR        != null ? Math.round(stats.avgHR)       : '',
      maxHR:          stats?.maxHR        != null ? Math.round(stats.maxHR)       : '',
      elev:           stats?.elevation    != null ? Math.round(stats.elevation)   : '',
      descent:        stats?.descent      != null ? Math.round(stats.descent)     : '',
      cals:           stats?.calories     != null ? Math.round(stats.calories)    : '',
      avgCadence:     stats?.avgCadence   != null ? Math.round(stats.avgCadence)  : '',
      trainingEffect: stats?.trainingEffect != null ? stats.trainingEffect        : '',
      aerobicTE:      stats?.aerobicTE    != null ? stats.aerobicTE               : '',
      hrZones:        stats?.hrZones      || null,
      splits:         stats?.splits       || null,
    };
  }
  if (coordinates && coordinates.length > 0) {
    saveMapToDB(wk, sd, coordinates).then(() => {
      saveStateToLocalStorage(true); hydrateCurrentView();
    });
  } else {
    saveStateToLocalStorage(true); hydrateCurrentView();
  }
});

initGarminGymImport((timeStr, stats) => {
  const wk = appState.currentWeek;
  const sd = selectedDay;
  if (appState.weeks[wk]) {
    if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};
    if (!appState.weeks[wk].gymStats[sd]) appState.weeks[wk].gymStats[sd] = {};
    const g = appState.weeks[wk].gymStats[sd];
    g.time        = timeStr;
    g.avgHR       = stats?.avgHR       != null ? Math.round(stats.avgHR)      : '';
    g.maxHR       = stats?.maxHR       != null ? Math.round(stats.maxHR)      : '';
    g.cals        = stats?.calories    != null ? Math.round(stats.calories)   : '';
    g.trainingEffect = stats?.trainingEffect != null ? stats.trainingEffect   : '';
    g.aerobicTE   = stats?.aerobicTE   != null ? stats.aerobicTE              : '';
    g.gymSets     = stats?.gymSets     || null;
  }
  saveStateToLocalStorage(true);
  hydrateCurrentView();
});

setImportSuccessCallback(() => hydrateCurrentView());

function checkForAutomaticWeekAdvance() {
  if (!appState.weekStartedAt) {
    appState.weekStartedAt = new Date().toISOString();
    saveStateToLocalStorage(true);
    return;
  }
  const startDate = new Date(appState.weekStartedAt);
  const today = new Date();
  if (today <= startDate) return;

  const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
  if (diffDays >= 7) {
    const currentWeekNumeric = parseInt(appState.currentWeek, 10);
    const activeProgram = getProgramById(appState.activeProgramId);
    const maxWeek = activeProgram.totalWeeks || 12;

    if (currentWeekNumeric >= maxWeek) {
      appState.weekStartedAt = new Date().toISOString();
      saveStateToLocalStorage(true);
      return;
    }

    const nextWeekString = (currentWeekNumeric + 1).toString();
    const modal = document.getElementById('weekAdvanceModal');
    const msgEl = document.getElementById('weekAdvanceMessage');
    
    if (modal && msgEl) {
      msgEl.textContent = `It's been ${diffDays} days since you started Week ${appState.currentWeek}. Start Week ${nextWeekString}?`;
      modal.setAttribute('data-pending-week', nextWeekString);
      modal.classList.add('active');
    }
  }
}

async function bootstrapApp() {
  try {
    determineDefaultCalendarDay();
    await checkActiveSession();
    await pullEngineDataFromStorage();

    const currentTab = activeTab || 'home';
    const currentDay = selectedDay || 'mon';

    verifyWeekStorageSchema(appState.currentWeek);
    setCockpitActiveDay(currentDay);
    switchGlobalAppTab(currentTab);
    checkActiveTimerOnLoad();
    checkForAutomaticWeekAdvance();

  } catch (fatalLifecycleError) {
    console.error("Critical layout generation block runtime defense:", fatalLifecycleError);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}