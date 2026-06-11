// ==========================================
// WORKOUT VIEW
// ==========================================
import { getProgramById } from './state.js';
import { logActivityForStreak } from './state.js';
import { getSessionSourceDay, loadSessionIntoDay, resetSessionForDay } from './state.js';
import { CONFIG } from './constants.js';
import { computeDiagnosticForLift, parseTargetFromDescription, computeExercisePRs, findLastPerformance, getExerciseHistoryLog } from './engine.js';
import { triggerRestTimerEngine, moveRestTimerToActiveExercise } from './timers.js';
import { mountExerciseDragAndDropSystems } from './dragdrop.js';
import { showToast } from './state.js'; 
import { buildEmptyWorkoutCard, buildSetRow, buildExerciseCard } from './templates.js';
import { renderRunMap } from './workout-map.js';
import { initExercisePicker, openAddExerciseModal, closeAddExerciseModal, confirmAddExercise, handleExerciseDropdownSelectionChange } from './workout-exercise-picker.js';
import { initSessionModals, openConfirmResetModal, closeConfirmResetModal, executeResetActiveDayMetrics, openFinishSessionModal, closeFinishSessionModal } from './workout-session-modals.js';

let _getState;
let _getSelectedDay;
let _getDays;
let _saveState;
let _switchTab;

export function initWorkout(getStateFn, getSelectedDayFn, getDaysFn, saveStateFn, switchTabFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _getDays = getDaysFn;
  _saveState = saveStateFn;
  _switchTab = switchTabFn;
  initExercisePicker(getStateFn, getSelectedDayFn, saveStateFn, renderWorkout);
  initSessionModals(getStateFn, getSelectedDayFn, saveStateFn, switchTabFn, renderWorkout, updateExercisePRs);
}

export function openExerciseHistoryModal(liftName) {
  const modal = document.getElementById('exerciseHistoryModal');
  const titleEl = document.getElementById('historyModalTitle');
  const bestVolEl = document.getElementById('historyBestVolume');
  const bestE1RMEl = document.getElementById('historyBestE1RM');
  const logContainer = document.getElementById('historyModalLog');

  if (!modal || !logContainer) {
    console.error("Exercise History Modal HTML missing from index.html! Ensure <div id='exerciseHistoryModal'> exists.");
    showToast("Error: Modal structure missing. Check index.html.", true);
    return;
  }

  const appState = _getState();
  const historyData = getExerciseHistoryLog(appState, liftName);

  titleEl.textContent = liftName;
  bestVolEl.textContent = historyData.bestVolume > 0 ? `${historyData.bestVolume} kg` : '--';
  bestE1RMEl.textContent = historyData.bestE1RM > 0 ? `${Math.round(historyData.bestE1RM)} kg` : '--';

  if (historyData.sessions.length === 0) {
    logContainer.innerHTML = '<div class="text-sm text-muted text-center mt-4">No completed history found.</div>';
  } else {
    logContainer.innerHTML = historyData.sessions.map(sess => {
      const setsStr = sess.sets.map(s => `${s.w}×${s.r}`).join(', ');
      return `
        <div class="card-dark p-3" style="border: 1px solid var(--overlay-sm);">
          <div class="flex-between mb-2">
            <span class="text-sm font-heavy text-inverse">Week ${sess.week}</span>
            <span class="text-xs text-muted uppercase">${sess.day}</span>
          </div>
          <div class="text-sm text-muted mb-2">${setsStr}</div>
          <div class="flex-between" style="border-top: 1px dashed var(--overlay-sm); padding-top: 6px; margin-top: 4px;">
            <span class="text-xs text-muted">Vol: <strong class="text-main">${sess.volume} kg</strong></span>
            <span class="text-xs text-muted">e1RM: <strong class="text-accent-blue">${Math.round(sess.e1rm)} kg</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  modal.classList.add('active');
}

export function closeExerciseHistoryModal() {
  const modal = document.getElementById('exerciseHistoryModal');
  if (modal) modal.classList.remove('active');
}

export function renderWorkout() {
  if (!_getState || !_getSelectedDay) return;
  
  const appState = _getState();
  const selectedDay = _getSelectedDay();

  const wk = appState.currentWeek || "1";
  
  if (!appState.weeks) appState.weeks = {};
  if (!appState.weeks[wk]) appState.weeks[wk] = { runs: {}, lifts: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, supersets: {} };
  
  if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
  if (!appState.weeks[wk].lifts) appState.weeks[wk].lifts = {};
  if (!appState.weeks[wk].notes) appState.weeks[wk].notes = {};
  if (!appState.weeks[wk].gymRpe) appState.weeks[wk].gymRpe = {};
  if (!appState.weeks[wk].bodyWeight) appState.weeks[wk].bodyWeight = {};
  if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};
  if (!appState.weeks[wk].supersets) appState.weeks[wk].supersets = {};

  const weekData = appState.weeks[wk];

  const activeProgram = getProgramById(appState.activeProgramId);
  const sessionSourceDay = getSessionSourceDay(wk, selectedDay);
  const isMovedSession = sessionSourceDay !== selectedDay;
  const homeBlueprint = activeProgram.days?.[sessionSourceDay] || { lifts: [], runs: "Rest" };

  const runContext = weekData.runs[selectedDay] || { dist: '', time: '', rpe: '', avgHR: '', maxHR: '', elev: '', cals: '' };
  
  const distEl       = document.getElementById('runInputDist');
  const timeEl       = document.getElementById('runInputTime');
  const rpeCockpitEl = document.getElementById('runInputRpeCockpit');
  const avgHREl      = document.getElementById('runInputAvgHR');
  const maxHREl      = document.getElementById('runInputMaxHR');
  const elevEl       = document.getElementById('runInputElev');
  const calsEl       = document.getElementById('runInputCals');
  const runExtraStatsRow = document.getElementById('runExtraStats');

  if (distEl)       distEl.value       = runContext.dist        || '';
  if (timeEl)       timeEl.value       = runContext.time        || '';
  if (rpeCockpitEl) rpeCockpitEl.value = runContext.rpe         || '';
  if (avgHREl)      avgHREl.value      = runContext.avgHR       || '';
  if (maxHREl)      maxHREl.value      = runContext.maxHR       || '';
  if (elevEl)       elevEl.value       = runContext.elev        || '';
  if (calsEl)       calsEl.value       = runContext.cals        || '';

  const hasRunExtra = runContext.avgHR || runContext.maxHR || runContext.elev || runContext.cals ||
                      runContext.avgCadence || runContext.descent || runContext.trainingEffect;
  if (runExtraStatsRow) runExtraStatsRow.style.display = hasRunExtra ? 'block' : 'none';

  const hrZonesContainer = document.getElementById('runHrZonesContainer');
  const hrZonesBar       = document.getElementById('runHrZonesBar');
  const hrZonesLabels    = document.getElementById('runHrZonesLabels');
  if (hrZonesContainer && hrZonesBar && hrZonesLabels) {
    const zones = runContext.hrZones;
    if (zones && Array.isArray(zones) && zones.some(z => z > 0)) {
      hrZonesContainer.style.display = 'block';
      const zoneColors  = ['#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
      const zoneLabels  = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
      const total       = zones.reduce((s, z) => s + z, 0) || 1;
      hrZonesBar.innerHTML = zones.map((z, i) => {
        const pct = Math.round((z / total) * 100);
        return pct > 0
          ? `<div style="width:${pct}%;background:${zoneColors[i]};height:100%;transition:width 0.4s;"></div>`
          : '';
      }).join('');
      hrZonesLabels.innerHTML = zones.map((z, i) => {
        const m = Math.floor(z / 60);
        const s = Math.round(z % 60).toString().padStart(2, '0');
        return `<span style="color:${zoneColors[i]};">${zoneLabels[i]} ${m}:${s}</span>`;
      }).join('');
    } else {
      hrZonesContainer.style.display = 'none';
    }
  }

  const gymContext = weekData.gymStats[selectedDay] || { time: '', avgHR: '', maxHR: '', cals: '' };
  
  const gTimeEl        = document.getElementById('gymInputTime');
  const gAvgHREl       = document.getElementById('gymInputAvgHR');
  const gMaxHREl       = document.getElementById('gymInputMaxHR');
  const gCalsEl        = document.getElementById('gymInputCals');
  const gTEEl          = document.getElementById('gymInputTE');
  const gAnaerobicTEEl = document.getElementById('gymInputAnaerobicTE');
  const gymStatsRow    = document.getElementById('gymStatsRow');

  if (gTimeEl)      gTimeEl.value      = gymContext.time         || '';
  if (gAvgHREl)     gAvgHREl.value     = gymContext.avgHR        || '';
  if (gMaxHREl)     gMaxHREl.value     = gymContext.maxHR        || '';
  if (gCalsEl)      gCalsEl.value      = gymContext.cals         || '';
  if (gTEEl)        gTEEl.value        = gymContext.trainingEffect || '';
  if (gAnaerobicTEEl) gAnaerobicTEEl.value = (gymContext.anaerobicTE ?? gymContext.aerobicTE) || '';

  const hasGymStats = gymContext.time || gymContext.avgHR || gymContext.maxHR || gymContext.cals ||
                      gymContext.trainingEffect;
  if (gymStatsRow) gymStatsRow.style.display = hasGymStats ? 'block' : 'none';

  const rStats = appState.weeks[appState.currentWeek].runs?.[selectedDay] || {};

  const cadenceEl = document.getElementById('runInputCadence');
  if (cadenceEl) cadenceEl.value = rStats.avgCadence || '--';

  const descentEl = document.getElementById('runInputDescent');
  if (descentEl) descentEl.value = rStats.descent || '--';

  const teEl = document.getElementById('runInputTE');
  if (teEl) teEl.value = rStats.trainingEffect || '--';

  const splitsContainer = document.getElementById('runSplitsContainer');
  const splitsTable = document.getElementById('runSplitsTable');
  if (splitsContainer && splitsTable) {
      if (rStats.splits && rStats.splits.length > 0) {
          let html = '<div style="font-size: 0.75rem; color: #fff;">';
          rStats.splits.forEach(s => {
              const min = Math.floor(s.time / 60);
              const sec = Math.floor(s.time % 60).toString().padStart(2, '0');
              html += `<div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                          <span>Lap ${s.lap}</span>
                          <span>${s.dist.toFixed(2)} km</span>
                          <span>${min}:${sec}</span>
                          <span style="color:var(--accent-pink);">❤️ ${s.avgHR || '--'}</span>
                       </div>`;
          });
          html += '</div>';
          splitsTable.innerHTML = html;
          splitsContainer.style.display = 'block';
      } else {
          splitsContainer.style.display = 'none';
      }
  }

  const gStats = appState.weeks[appState.currentWeek].gymStats?.[selectedDay] || {};
  const gymSetsContainer = document.getElementById('gymSetsBreakdown');
  const gymSetsTable = document.getElementById('gymSetsTable');
  if (gymSetsContainer && gymSetsTable) {
      if (gStats.gymSets && gStats.gymSets.length > 0) {
          let html = '<div style="font-size: 0.75rem; color: #fff;">';
          gStats.gymSets.forEach(s => {
              html += `<div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                          <span>Set ${s.set}</span>
                          <span>${s.reps} reps</span>
                          <span>${s.weight} kg</span>
                          <span style="color:var(--accent-blue);">${s.category || ''}</span>
                       </div>`;
          });
          html += '</div>';
          gymSetsTable.innerHTML = html;
          gymSetsContainer.style.display = 'block';
          
          if (gymStatsRow) gymStatsRow.style.display = 'block';
      } else {
          gymSetsContainer.style.display = 'none';
      }
  }

  renderRunMap(wk, selectedDay, runContext.dist);

  const notesEl = document.getElementById('sessionNotesInput');
  const gymRpeEl = document.getElementById('sessionGymRpeCockpit');

  if (notesEl) notesEl.value = weekData.notes[selectedDay] || '';
  if (gymRpeEl) gymRpeEl.value = weekData.gymRpe?.[selectedDay] || '';

  const runPanel = document.getElementById('cockpitRunPanel');
  const runSpecsEl = document.getElementById('cockpitRunSpecs');
  const exercisesContainer = document.getElementById('cockpitExercisesContainer');

  const blueprintRun = homeBlueprint.runs || '';
  const isRunScheduled = blueprintRun && !blueprintRun.toLowerCase().includes('no structured') && blueprintRun.toLowerCase() !== 'rest';

  if (runSpecsEl) runSpecsEl.textContent = blueprintRun || 'Rest';
  
  if (runPanel) {
    runPanel.classList.remove('dimmed');
  }

  if (runPanel && exercisesContainer) {
    if (!isRunScheduled) {
      exercisesContainer.after(runPanel);
    } else {
      exercisesContainer.before(runPanel);
    }
  }

  const daySelectorBar = document.getElementById('cockpitDaySelectorBar');
  if (daySelectorBar) {
    const pills = daySelectorBar.querySelectorAll('.day-pill');
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    pills.forEach((pill, idx) => {
      const dayKey = days[idx];
      const dayData = activeProgram.days?.[dayKey];
      const badge = dayData?.badge || dayKey.charAt(0).toUpperCase() + dayKey.slice(1);
      const shortDay = dayKey.charAt(0).toUpperCase() + dayKey.slice(1, 3);
      pill.textContent = `${shortDay} (${badge})`;
    });
  }

  const sessionSelect = document.getElementById('cockpitSessionSelect');
  if (sessionSelect) {
    sessionSelect.innerHTML = _getDays().map(dk => {
      const dd = activeProgram.days?.[dk];
      const label = (dd?.badge || dd?.title || dk).toString();
      const short = dk.charAt(0).toUpperCase() + dk.slice(1, 3);
      const sel = dk === sessionSourceDay ? ' selected' : '';
      return `<option value="${dk}"${sel}>${short} · ${label}</option>`;
    }).join('');
  }
  const movedBadge = document.getElementById('cockpitSessionMoved');
  if (movedBadge) {
    if (isMovedSession) {
      const srcLabel = activeProgram.days?.[sessionSourceDay]?.badge || activeProgram.days?.[sessionSourceDay]?.title || sessionSourceDay;
      movedBadge.textContent = `↪ Running "${srcLabel}" here (moved from its usual day)`;
      movedBadge.style.display = '';
    } else {
      movedBadge.style.display = 'none';
    }
  }

  if (!exercisesContainer) return;

  const currentScrollY = window.scrollY;

  // PHASE 3 SUPERSETS: Group-aware accordion state mapping
  const previouslyExpandedCard = document.querySelector('.cockpit-exercise:not(.collapsed)');
  let previouslyExpandedLift = previouslyExpandedCard ? previouslyExpandedCard.getAttribute('data-liftname') : null;
  
  const supersetMap = weekData.supersets?.[selectedDay] || {};
  let forceExpandGroupId = previouslyExpandedLift ? (supersetMap[previouslyExpandedLift] || null) : null;

  const timerBar = document.getElementById('cockpitTimerBar');
  const viewWorkoutEl = document.getElementById('view-workout');
  if (timerBar && viewWorkoutEl && timerBar.parentNode !== viewWorkoutEl) {
    viewWorkoutEl.appendChild(timerBar);
  }

  exercisesContainer.innerHTML = '';

  const loggedLiftsData = weekData.lifts[selectedDay] || {};

  if (Object.keys(loggedLiftsData).length === 0 && selectedDay !== 'sun') {
    exercisesContainer.innerHTML = buildEmptyWorkoutCard();
  }

  const groupCounts = {};
  for (const lift in supersetMap) {
    if (loggedLiftsData[lift]) {
      const gid = supersetMap[lift];
      groupCounts[gid] = (groupCounts[gid] || 0) + 1;
    } else {
      delete supersetMap[lift];
    }
  }
  for (const lift in supersetMap) {
    if (groupCounts[supersetMap[lift]] < 2) {
      delete supersetMap[lift]; 
    }
  }

  let isFirstAccordionField = true;
  let currentSupersetContainer = null;
  let currentGroupId = null;

  for (let liftName in loggedLiftsData) {
    const setsArr = loggedLiftsData[liftName];
    if (!Array.isArray(setsArr)) continue;
    
    const workingSetsArr = setsArr.filter(s => !s.isWarmup);
    const isCompleted = workingSetsArr.length > 0 && workingSetsArr.every(s => s && s.c);
    const isCompletedClass = isCompleted ? 'completed' : '';

    const groupId = supersetMap[liftName];

    // PHASE 3 SUPERSETS: Multi-card expansion evaluation
    let expandThis = false;
    if (previouslyExpandedLift) {
      if (liftName === previouslyExpandedLift || (groupId && groupId === forceExpandGroupId)) {
        expandThis = true;
      }
    } else if (isFirstAccordionField && !isCompleted) {
      expandThis = true;
      isFirstAccordionField = false;
      if (groupId) forceExpandGroupId = groupId; // Snap remainder of group open
    }

    let isCollapsedClass = expandThis ? '' : 'collapsed';

    const exCard = document.createElement('div');
    exCard.className = 'cockpit-exercise ' + isCollapsedClass + ' ' + isCompletedClass;
    exCard.setAttribute('data-liftname', liftName);
    exCard.setAttribute('draggable', 'true');

    let displayLiftName = liftName;
    if (!isNaN(liftName) && homeBlueprint.lifts && homeBlueprint.lifts[parseInt(liftName, 10)]) {
      displayLiftName = homeBlueprint.lifts[parseInt(liftName, 10)];
    }

    let blueprintLabel = `Target: Working Sets`;
    try {
      const diagnostic = computeDiagnosticForLift(wk, selectedDay, liftName);
      const parsedTarget = parseTargetFromDescription(homeBlueprint.desc, displayLiftName);
      blueprintLabel = `Target: ${parsedTarget.sets} × ${parsedTarget.reps}`;
      
      if (diagnostic.isStalled) {
        blueprintLabel = '⚠️ DE-LOAD: Slashed Sets (-20%)';
      } else if (diagnostic.suggestedWeight !== '') {
        blueprintLabel = `💡 Suggested: ${diagnostic.suggestedWeight}kg × ${parsedTarget.reps}`;
      }
    } catch(e) { console.warn(e); }

    const lastPerf = findLastPerformance(appState, liftName, {
      excludeWeek: wk, excludeDay: selectedDay, days: _getDays()
    });

    let historicalLineText = 'No history yet — log your first session.';
    if (appState.exerciseStats && appState.exerciseStats[displayLiftName]) {
      historicalLineText = 'Global PR: ' + Math.round(appState.exerciseStats[displayLiftName].allTimeMax || 0) + 'kg (Est. 1RM)';
    }
    
    if (lastPerf && lastPerf.workingSets && lastPerf.workingSets.length > 0) {
      historicalLineText = 'Last time: [ ' + lastPerf.workingSets.map(s => s.w + 'kg × ' + s.r).join(', ') + ' ]'
        + (lastPerf.e1rm ? ` · e1RM ${lastPerf.e1rm}kg` : '');
    }

    const safeLiftName = liftName.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const displaySafeName = displayLiftName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let warmupIndex = 0;
    let workingIndex = 0;

    const setsMarkup = setsArr.map((sData, sIdx) => {
      let linkedGhostSet = null;
      let displayIndex = 0;
      
      if (sData.isWarmup) {
        linkedGhostSet = (lastPerf && lastPerf.warmupSets && lastPerf.warmupSets[warmupIndex]) ? lastPerf.warmupSets[warmupIndex] : null;
        displayIndex = warmupIndex;
        warmupIndex++;
      } else {
        linkedGhostSet = (lastPerf && lastPerf.workingSets && lastPerf.workingSets[workingIndex]) ? lastPerf.workingSets[workingIndex] : null;
        displayIndex = workingIndex;
        workingIndex++;
      }
      
      return buildSetRow(sData, sIdx, safeLiftName, linkedGhostSet, displayIndex);
    }).join('');

    const isGrouped = !!groupId;

    try {
      exCard.innerHTML = buildExerciseCard({
        displaySafeName,
        safeLiftName,
        isCompleted,
        diagnostic: computeDiagnosticForLift(wk, selectedDay, liftName),
        blueprintLabel,
        historicalLineText,
        setsMarkup,
        isGrouped
      });
    } catch(e) {
      exCard.innerHTML = `<div class="card-dark p-3 text-inverse">${displaySafeName} (Render Error)</div>`;
    }

    if (groupId) {
      if (groupId !== currentGroupId) {
        currentSupersetContainer = document.createElement('div');
        currentSupersetContainer.className = 'superset-container';
        currentSupersetContainer.dataset.groupId = groupId;
        
        currentSupersetContainer.style.borderLeft = '4px solid var(--accent-purple)';
        currentSupersetContainer.style.paddingLeft = '10px';
        currentSupersetContainer.style.marginBottom = '20px';
        currentSupersetContainer.style.background = 'rgba(168, 85, 247, 0.05)';
        currentSupersetContainer.style.borderRadius = '4px';
        currentSupersetContainer.style.paddingTop = '10px';
        currentSupersetContainer.style.paddingBottom = '2px';
        
        exercisesContainer.appendChild(currentSupersetContainer);
        currentGroupId = groupId;
      }
      exCard.style.marginBottom = '8px'; 
      currentSupersetContainer.appendChild(exCard);
    } else {
      currentGroupId = null;
      currentSupersetContainer = null;
      exCard.style.marginBottom = ''; 
      exercisesContainer.appendChild(exCard);
    }
  }

  try {
    window.scrollTo(0, currentScrollY);
    moveRestTimerToActiveExercise();
    mountExerciseDragAndDropSystems();
  } catch(e) { console.warn(e); }
}

export function executeOneTapQuickLog(labelNode, liftName, sIdx) {
  if (!labelNode) return;
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  
  const parentRow = labelNode.closest('.cockpit-set-row');
  if (!parentRow) return;

  const wInput = parentRow.querySelector('.input-weight-node');
  const rInput = parentRow.querySelector('.input-reps-node');
  const checkbox = parentRow.querySelector('.gym-check');

  let targetW = wInput.value;
  let targetR = rInput.value;

  if (!targetW || !targetR) {
    const lastPerf = findLastPerformance(appState, liftName, { excludeWeek: wk, excludeDay: selectedDay, days: _getDays() });
    if (lastPerf) {
      const sets = appState.weeks[wk].lifts[selectedDay][liftName];
      if (sets && sets[sIdx]) {
        const targetSet = sets[sIdx];
        const streamIdx = targetSet.isWarmup ? 
            sets.slice(0, sIdx).filter(s => s.isWarmup).length : 
            sets.slice(0, sIdx).filter(s => !s.isWarmup).length;
            
        const sourceArr = targetSet.isWarmup ? lastPerf.warmupSets : lastPerf.workingSets;
        
        if (sourceArr && sourceArr[streamIdx]) {
          if (!targetW && sourceArr[streamIdx].w) targetW = sourceArr[streamIdx].w;
          if (!targetR && sourceArr[streamIdx].r) targetR = sourceArr[streamIdx].r;
        }
      }
    }
  }

  if (!targetW) targetW = "40";
  if (!targetR) targetR = "10";

  wInput.value = targetW;
  rInput.value = targetR;
  if (checkbox) checkbox.checked = true;

  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) appState.weeks[wk].lifts[selectedDay][liftName] = [];
  
  appState.weeks[wk].lifts[selectedDay][liftName][sIdx].w = targetW;
  appState.weeks[wk].lifts[selectedDay][liftName][sIdx].r = targetR;
  appState.weeks[wk].lifts[selectedDay][liftName][sIdx].c = true;

  parentRow.classList.add('is-complete');

  try { logActivityForStreak(); } catch (e) { console.warn(e); }
  
  try {
    const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
    const setRpe = gymRpeEl && gymRpeEl.value ? parseFloat(gymRpeEl.value) : null;
    
    let shouldTrigger = true;
    const ssMap = appState.weeks[wk].supersets?.[selectedDay];
    if (ssMap && ssMap[liftName]) {
      const gId = ssMap[liftName];
      const allLifts = Object.keys(appState.weeks[wk].lifts[selectedDay] || {});
      const gLifts = allLifts.filter(l => ssMap[l] === gId);
      if (gLifts.length > 0 && gLifts[gLifts.length - 1] !== liftName) {
        shouldTrigger = false;
      }
    }
    
    if (shouldTrigger) {
      triggerRestTimerEngine(liftName, setRpe);
    } else {
      showToast('Superset Transition ⚡');
    }
  } catch(e) { console.warn(e); }

  _saveState(true);
  evaluateAccordionAutoFlowTransitions();
}

export function updateInputState(inputNode) {
  if (!inputNode) return;
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  const exCard = inputNode.closest('.cockpit-exercise');
  if (!exCard) return;
  
  const liftName = exCard.getAttribute('data-liftname');
  const row = inputNode.closest('.cockpit-set-row');
  if (!row) return;
  
  const sIdx = Array.from(exCard.querySelectorAll('.cockpit-set-row')).indexOf(row);
  
  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) appState.weeks[wk].lifts[selectedDay][liftName] = [];
  if (!appState.weeks[wk].lifts[selectedDay][liftName][sIdx]) {
    appState.weeks[wk].lifts[selectedDay][liftName][sIdx] = { w: '', r: '', c: false };
  }

  if (inputNode.classList.contains('input-weight-node')) {
    appState.weeks[wk].lifts[selectedDay][liftName][sIdx].w = inputNode.value;
  } else {
    appState.weeks[wk].lifts[selectedDay][liftName][sIdx].r = inputNode.value;
  }
  _saveState(true);
}

export function commitWorkoutUIState() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  const weekData = appState.weeks[wk];

  const distEl = document.getElementById('runInputDist');
  const timeEl = document.getElementById('runInputTime');
  const rpeRunEl = document.getElementById('runInputRpeCockpit');
  const avgHREl = document.getElementById('runInputAvgHR');
  const maxHREl = document.getElementById('runInputMaxHR');
  const elevEl = document.getElementById('runInputElev');
  const calsEl = document.getElementById('runInputCals');

  if (distEl && distEl.offsetParent !== null) {
    const existingRun = weekData.runs[selectedDay] || {};
    weekData.runs[selectedDay] = {
        ...existingRun,
        dist: distEl.value,
        time: timeEl.value,
        rpe: rpeRunEl.value,
        avgHR: avgHREl ? avgHREl.value : (existingRun.avgHR || ''),
        maxHR: maxHREl ? maxHREl.value : (existingRun.maxHR || ''),
        elev: elevEl ? elevEl.value : (existingRun.elev || ''),
        cals: calsEl ? calsEl.value : (existingRun.cals || '')
    };
    if ((parseFloat(distEl.value) || 0) > 0) {
      try { logActivityForStreak(); } catch (e) { console.warn(e); }
    }
  }

  if (!weekData.gymStats) weekData.gymStats = {};
  const gTimeEl = document.getElementById('gymInputTime');
  const gAvgHREl = document.getElementById('gymInputAvgHR');
  const gMaxHREl = document.getElementById('gymInputMaxHR');
  const gCalsEl = document.getElementById('gymInputCals');

  if (gTimeEl && gTimeEl.offsetParent !== null) {
    const existingGym = weekData.gymStats[selectedDay] || {};
    weekData.gymStats[selectedDay] = {
        ...existingGym,
        time: gTimeEl.value,
        avgHR: gAvgHREl ? gAvgHREl.value : (existingGym.avgHR || ''),
        maxHR: gMaxHREl ? gMaxHREl.value : (existingGym.maxHR || ''),
        cals: gCalsEl ? gCalsEl.value : (existingGym.cals || '')
    };
  }

  const notesEl = document.getElementById('sessionNotesInput');
  const rpeGymEl = document.getElementById('sessionGymRpeCockpit');

  if (notesEl && notesEl.offsetParent !== null) weekData.notes[selectedDay] = notesEl.value;
  
  if (rpeGymEl && rpeGymEl.offsetParent !== null) {
    if (!weekData.gymRpe) weekData.gymRpe = {};
    weekData.gymRpe[selectedDay] = rpeGymEl.value;
  }

  const targetCardContainer = document.getElementById('cockpitExercisesContainer');
  if (targetCardContainer) {
    targetCardContainer.querySelectorAll('.cockpit-exercise').forEach(exCard => {
      const liftName = exCard.getAttribute('data-liftname');
      exCard.querySelectorAll('.cockpit-set-row').forEach((row, idx) => {
        if (appState.weeks[wk].lifts[selectedDay]?.[liftName]?.[idx]) {
          const wIn = row.querySelector('.input-weight-node');
          const rIn = row.querySelector('.input-reps-node');
          const cIn = row.querySelector('.gym-check');
          
          if (wIn) appState.weeks[wk].lifts[selectedDay][liftName][idx].w = wIn.value;
          if (rIn) appState.weeks[wk].lifts[selectedDay][liftName][idx].r = rIn.value;
          if (cIn) appState.weeks[wk].lifts[selectedDay][liftName][idx].c = cIn.checked;
        }
      });
    });
  }
  try { updateExercisePRs(); } catch(e) { console.warn(e); }
  _saveState(true);
}

export function updateExercisePRs() {
  const appState = _getState();
  if (!appState.exerciseStats) appState.exerciseStats = {};
  computeExercisePRs(appState, appState.exerciseStats);
}

export function toggleGymCheckLoggingState(checkboxNode) {
  if (!checkboxNode) return;
  const parentRow = checkboxNode.closest('.cockpit-set-row');
  const exCard = checkboxNode.closest('.cockpit-exercise');
  
  if (checkboxNode.checked) {
    if (parentRow) parentRow.classList.add('is-complete');
    
    const wInput = parentRow ? parentRow.querySelector('.input-weight-node') : null;
    const rInput = parentRow ? parentRow.querySelector('.input-reps-node') : null;
    
    if (wInput && rInput && (!wInput.value || !rInput.value)) {
      const appState = _getState();
      const selectedDay = _getSelectedDay();
      const wk = appState.currentWeek;
      const liftName = exCard ? exCard.getAttribute('data-liftname') : null;
      const sIdx = Array.from(exCard.querySelectorAll('.cockpit-set-row')).indexOf(parentRow);
      
      if (liftName) {
        const lastPerf = findLastPerformance(appState, liftName, { excludeWeek: wk, excludeDay: selectedDay, days: _getDays() });
        if (lastPerf) {
          const sets = appState.weeks[wk].lifts[selectedDay][liftName];
          if (sets && sets[sIdx]) {
            const targetSet = sets[sIdx];
            const streamIdx = targetSet.isWarmup ? 
                sets.slice(0, sIdx).filter(s => s.isWarmup).length : 
                sets.slice(0, sIdx).filter(s => !s.isWarmup).length;
            const sourceArr = targetSet.isWarmup ? lastPerf.warmupSets : lastPerf.workingSets;
            
            if (sourceArr && sourceArr[streamIdx]) {
              if (!wInput.value && sourceArr[streamIdx].w) wInput.value = sourceArr[streamIdx].w;
              if (!rInput.value && sourceArr[streamIdx].r) rInput.value = sourceArr[streamIdx].r;
            }
          }
        }
      }

      if (!wInput.value) wInput.value = "40";
      if (!rInput.value) rInput.value = "10";
    }

    try {
      const appState = _getState();
      const wk = appState.currentWeek;
      const selectedDay = _getSelectedDay();
      const liftNameAttr = exCard ? exCard.getAttribute('data-liftname') : null;
      const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
      const setRpe = gymRpeEl && gymRpeEl.value ? parseFloat(gymRpeEl.value) : null;
      
      let shouldTrigger = true;
      if (liftNameAttr) {
        const ssMap = appState.weeks[wk].supersets?.[selectedDay];
        if (ssMap && ssMap[liftNameAttr]) {
          const gId = ssMap[liftNameAttr];
          const allLifts = Object.keys(appState.weeks[wk].lifts[selectedDay] || {});
          const gLifts = allLifts.filter(l => ssMap[l] === gId);
          if (gLifts.length > 0 && gLifts[gLifts.length - 1] !== liftNameAttr) {
            shouldTrigger = false;
          }
        }
      }
      
      if (shouldTrigger) {
        triggerRestTimerEngine(liftNameAttr, setRpe);
      } else {
        showToast('Superset Transition ⚡');
      }
    } catch(e) { console.warn(e); }
  } else {
    if (parentRow) parentRow.classList.remove('is-complete');
  }
  commitWorkoutUIState();
  evaluateAccordionAutoFlowTransitions();
}

// PHASE 3 SUPERSETS: Group-aware auto-flow transitions
export function evaluateAccordionAutoFlowTransitions() {
  const expandedCards = document.querySelectorAll('.cockpit-exercise:not(.collapsed)');
  if (expandedCards.length === 0) return;

  let allFinished = true;
  let newlyFinishedCount = 0;
  let lastCard = null;

  expandedCards.forEach(card => {
    const rows = Array.from(card.querySelectorAll('.cockpit-set-row:not(.is-warmup)'));
    if (rows.length === 0) {
      allFinished = false; 
      return;
    }
    const finished = rows.every(r => r.querySelector('.gym-check')?.checked);
    if (finished) {
      if (!card.classList.contains('completed')) {
        card.classList.add('completed');
        const statusNode = card.querySelector('.cockpit-ex-status');
        if (statusNode) statusNode.textContent = 'DONE';
        newlyFinishedCount++;
      }
      lastCard = card;
    } else {
      allFinished = false;
    }
  });

  if (newlyFinishedCount > 0) showToast('Exercise Complete! ✓');

  // Only collapse and advance if ALL currently opened exercises (i.e. the whole superset) are completely checked off
  if (allFinished && lastCard) {
    expandedCards.forEach(c => c.classList.add('collapsed'));
    
    // Jump the container if necessary to find the next valid exercise target
    let nextTarget = lastCard.nextElementSibling;
    if (!nextTarget && lastCard.parentElement.classList.contains('superset-container')) {
      nextTarget = lastCard.parentElement.nextElementSibling;
    }

    while (nextTarget) {
      if (nextTarget.classList.contains('cockpit-exercise') && !nextTarget.classList.contains('completed')) {
        nextTarget.classList.remove('collapsed');
        try { nextTarget.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
        try { moveRestTimerToActiveExercise(); } catch(e) {}
        break;
      } else if (nextTarget.classList.contains('superset-container')) {
        const incomplete = nextTarget.querySelector('.cockpit-exercise:not(.completed)');
        if (incomplete) {
          nextTarget.querySelectorAll('.cockpit-exercise').forEach(c => c.classList.remove('collapsed'));
          try { nextTarget.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
          try { moveRestTimerToActiveExercise(); } catch(e) {}
          break;
        }
      }
      nextTarget = nextTarget.nextElementSibling;
    }
  }
}

export function applyQuickFillModifier(btnNode, typeModifier, sIdx) {
  if (!btnNode) return;
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;

  const row = btnNode.closest('.cockpit-set-row');
  if (!row) return;
  
  const wInput = row.querySelector('.input-weight-node');
  const rInput = row.querySelector('.input-reps-node');
  if (!wInput || !rInput) return;
  
  let baseW = parseFloat(wInput.value) || 0;
  let baseR = parseInt(rInput.value, 10) || 0;

  if (typeModifier === 'match') {
    const exCard = btnNode.closest('.cockpit-exercise');
    if (exCard) {
      const liftName = exCard.getAttribute('data-liftname');
      const lastPerf = findLastPerformance(appState, liftName, { excludeWeek: wk, excludeDay: selectedDay, days: _getDays() });
      
      if (lastPerf) {
        const sets = appState.weeks[wk].lifts[selectedDay][liftName];
        if (sets && sets[sIdx]) {
          const targetSet = sets[sIdx];
          const streamIdx = targetSet.isWarmup ? 
              sets.slice(0, sIdx).filter(s => s.isWarmup).length : 
              sets.slice(0, sIdx).filter(s => !s.isWarmup).length;
          const sourceArr = targetSet.isWarmup ? lastPerf.warmupSets : lastPerf.workingSets;
          
          if (sourceArr && sourceArr[streamIdx]) {
            baseW = parseFloat(sourceArr[streamIdx].w) || baseW;
            baseR = parseInt(sourceArr[streamIdx].r, 10) || baseR;
          } else {
            showToast("No previous data found for this set.");
          }
        }
      }
    }
  } else if (typeModifier === 'p25') baseW += (CONFIG.weightIncrement || 2.5);
  else if (typeModifier === 'p5') baseW += (CONFIG.weightIncrement || 2.5) * 2;
  else if (typeModifier === 'r1') baseR += (CONFIG.repsIncrement || 1);

  wInput.value = baseW > 0 ? baseW : '';
  rInput.value = baseR > 0 ? baseR : '';
  updateInputState(wInput);
  updateInputState(rInput);
}

export function toggleQuickPad(rowEl) {
  if (!rowEl) return;
  rowEl.classList.toggle('pad-visible');
}

export function handleSessionChange(selectEl) {
  if (!selectEl) return;
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const sourceDay = selectEl.value;
  if (sourceDay === getSessionSourceDay(appState.currentWeek, selectedDay)) return;

  const ok = loadSessionIntoDay(selectedDay, sourceDay);
  if (!ok) {
    showToast('This day already has logged work — reset it first.');
    renderWorkout(); 
    return;
  }
  showToast('Session loaded for today');
  renderWorkout();
}

export function repeatLastForExercise(liftName) {
  if (!liftName) return;
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  const last = findLastPerformance(appState, liftName, {
    excludeWeek: wk, excludeDay: selectedDay, days: _getDays()
  });
  if (!last || (!last.workingSets.length && !last.warmupSets.length)) { 
    showToast('No previous performance for this lift'); 
    return; 
  }

  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  
  const newSets = [];
  if (last.warmupSets) last.warmupSets.forEach(s => newSets.push({ w: String(s.w), r: String(s.r), c: false, isWarmup: true }));
  if (last.workingSets) last.workingSets.forEach(s => newSets.push({ w: String(s.w), r: String(s.r), c: false }));
  
  appState.weeks[wk].lifts[selectedDay][liftName] = newSets;
  _saveState(true);
  renderWorkout();
  showToast('Filled from last time');
}

export function appendCustomSetRow(btnNode, liftName) {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  
  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][liftName]) {
    appState.weeks[wk].lifts[selectedDay][liftName] = [];
  }
  appState.weeks[wk].lifts[selectedDay][liftName].push({ w: '', r: '', c: false });
  _saveState(true);
  renderWorkout();
}

export function appendWarmupSet(liftName) {
  try {
    const appState = _getState();
    const selectedDay = _getSelectedDay();
    const wk = appState.currentWeek;
    
    if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
    if (!appState.weeks[wk].lifts[selectedDay][liftName]) {
      appState.weeks[wk].lifts[selectedDay][liftName] = [];
    }
    
    const sets = appState.weeks[wk].lifts[selectedDay][liftName];
    
    let insertIndex = 0;
    for (let i = 0; i < sets.length; i++) {
      if (sets[i].isWarmup) insertIndex = i + 1;
      else break; 
    }
    
    sets.splice(insertIndex, 0, { w: '', r: '', c: false, isWarmup: true });
    _saveState(true);
    renderWorkout();
  } catch (err) {
    console.error("Warmup injection failed:", err);
    showToast("Failed to add warmup. See console.", true);
  }
}

export function removeCustomSetRow(liftName, setIndex) {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  if (appState.weeks[wk].lifts?.[selectedDay]?.[liftName]) {
    appState.weeks[wk].lifts[selectedDay][liftName].splice(setIndex, 1);
    if (appState.weeks[wk].lifts[selectedDay][liftName].length === 0) {
      delete appState.weeks[wk].lifts[selectedDay][liftName];
    }
    _saveState(true);
    renderWorkout();
    showToast('Set Removed');
  }
}

// PHASE 3 SUPERSETS: Group-aware accordion toggling
export function toggleAccordionManual(elementNode) {
  if (!elementNode) return;
  const wasCollapsed = elementNode.classList.contains('collapsed');
  document.querySelectorAll('.cockpit-exercise').forEach(card => card.classList.add('collapsed'));

  if (wasCollapsed) {
    const parent = elementNode.parentElement;
    if (parent && parent.classList.contains('superset-container')) {
      parent.querySelectorAll('.cockpit-exercise').forEach(c => c.classList.remove('collapsed'));
    } else {
      elementNode.classList.remove('collapsed');
    }
  }
  try { moveRestTimerToActiveExercise(); } catch(e) { console.warn(e); }
}

export function unlinkSuperset(liftName) {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  if (appState.weeks[wk].supersets && appState.weeks[wk].supersets[selectedDay]) {
    delete appState.weeks[wk].supersets[selectedDay][liftName];
    _saveState(true);
    renderWorkout();
    showToast('Exercise unlinked.');
  }
}

// ==========================================
// EVENT DELEGATION ROUTER
// ==========================================

// Intercept the drag-drop system's decoupled render request
document.addEventListener('workout:force-rerender', () => {
  renderWorkout();
});

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  
  const exCard = target.closest('.cockpit-exercise');
  const row = target.closest('.cockpit-set-row');
  const liftName = exCard ? exCard.getAttribute('data-liftname') : target.getAttribute('data-liftname');
  const sIdx = parseInt(target.getAttribute('data-sidx'), 10);

  if (action === 'quick-log') executeOneTapQuickLog(target, liftName, sIdx);
  else if (action === 'quick-modifier') applyQuickFillModifier(target, target.getAttribute('data-modifier'), sIdx);
  else if (action === 'toggle-pad') toggleQuickPad(row);
  else if (action === 'append-set') appendCustomSetRow(target, liftName);
  else if (action === 'append-warmup-set') appendWarmupSet(liftName); 
  else if (action === 'remove-set') removeCustomSetRow(liftName, sIdx);
  else if (action === 'toggle-accordion') toggleAccordionManual(exCard);
  else if (action === 'open-exercise-history') {
    e.preventDefault();
    openExerciseHistoryModal(liftName);
  }
  else if (action === 'close-exercise-history') closeExerciseHistoryModal();
  
  else if (action === 'open-add-superset') {
    const modal = document.getElementById('addExerciseModal');
    if (modal) modal.setAttribute('data-source-lift', liftName);
    openAddExerciseModal();
  }
  else if (action === 'unlink-superset') unlinkSuperset(liftName);
  else if (action === 'open-add-exercise') {
    const modal = document.getElementById('addExerciseModal');
    if (modal) modal.removeAttribute('data-source-lift'); 
    openAddExerciseModal();
  }

  else if (action === 'close-add-exercise') closeAddExerciseModal();
  else if (action === 'confirm-add-exercise') confirmAddExercise();
  else if (action === 'open-reset-modal') openConfirmResetModal();
  else if (action === 'close-reset-modal') closeConfirmResetModal();
  else if (action === 'execute-reset') executeResetActiveDayMetrics();
  else if (action === 'open-finish-modal') openFinishSessionModal();
  else if (action === 'close-finish-modal') closeFinishSessionModal();
  else if (action === 'repeat-last') repeatLastForExercise(liftName);
});

document.addEventListener('change', (e) => {
  const target = e.target;
  if (target.classList.contains('input-weight-node') || target.classList.contains('input-reps-node')) {
    updateInputState(target);
  } else if (target.classList.contains('gym-check')) {
    toggleGymCheckLoggingState(target);
  } else if (target.id === 'newExerciseSelect') {
    handleExerciseDropdownSelectionChange();
  } else if (target.id === 'cockpitSessionSelect') {
    handleSessionChange(target);
  }
});

document.addEventListener('focusout', (e) => {
  const target = e.target;
  if (target.matches('.input-weight-node, .input-reps-node, #sessionNotesInput, #sessionGymRpeCockpit, #runInputDist, #runInputTime, #runInputRpeCockpit')) {
    commitWorkoutUIState();
  }
});
