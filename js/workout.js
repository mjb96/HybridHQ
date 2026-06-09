// ==========================================
// WORKOUT VIEW
// ==========================================
import { getProgramById } from './state.js';
import { CONFIG, PROGRAMS, EXERCISE_LIBRARY } from './constants.js';
import { computeDiagnosticForLift, parseTargetFromDescription } from './engine.js';
import { triggerRestTimerEngine, moveRestTimerToActiveExercise, dismissRestTimer, stopAndResetWorkoutTimer } from './timers.js';
import { mountExerciseDragAndDropSystems } from './dragdrop.js';
import { showToast, saveNewCustomExerciseToLibrary } from './state.js'; 
import { buildEmptyWorkoutCard, buildSetRow, buildExerciseCard } from './templates.js';
import { getMapFromDB, deleteMapFromDB } from './db.js';

let _getState;
let _getSelectedDay;
let _getDays;
let _saveState;
let _switchTab;

// Private module-scoped map instance
let activeWorkoutMapInstance = null;

export function initWorkout(getStateFn, getSelectedDayFn, getDaysFn, saveStateFn, switchTabFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _getDays = getDaysFn;
  _saveState = saveStateFn;
  _switchTab = switchTabFn;
}

// ==========================================
// RENDER
// ==========================================
export function renderWorkout() {
  if (!_getState || !_getSelectedDay) return;
  
  const appState = _getState();
  const selectedDay = _getSelectedDay();

  const wk = appState.currentWeek || "1";
  
  if (!appState.weeks) appState.weeks = {};
  if (!appState.weeks[wk]) appState.weeks[wk] = { runs: {}, lifts: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {} };
  
  if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
  if (!appState.weeks[wk].lifts) appState.weeks[wk].lifts = {};
  if (!appState.weeks[wk].notes) appState.weeks[wk].notes = {};
  if (!appState.weeks[wk].gymRpe) appState.weeks[wk].gymRpe = {};
  if (!appState.weeks[wk].bodyWeight) appState.weeks[wk].bodyWeight = {};
  if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};

  const weekData = appState.weeks[wk];

  const activeProgram = getProgramById(appState.activeProgramId);
  const homeBlueprint = activeProgram.days?.[selectedDay] || { lifts: [], runs: "Rest" };

  // --- RUN METRICS ---
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

  // HR Zones strip
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

  // --- GYM METRICS ---
  const gymContext = weekData.gymStats[selectedDay] || { time: '', avgHR: '', maxHR: '', cals: '' };
  
  const gTimeEl        = document.getElementById('gymInputTime');
  const gAvgHREl       = document.getElementById('gymInputAvgHR');
  const gMaxHREl       = document.getElementById('gymInputMaxHR');
  const gCalsEl        = document.getElementById('gymInputCals');
  const gTEEl          = document.getElementById('gymInputTE');
  const gAerobicTEEl   = document.getElementById('gymInputAerobicTE');
  const gymStatsRow    = document.getElementById('gymStatsRow');

  if (gTimeEl)      gTimeEl.value      = gymContext.time         || '';
  if (gAvgHREl)     gAvgHREl.value     = gymContext.avgHR        || '';
  if (gMaxHREl)     gMaxHREl.value     = gymContext.maxHR        || '';
  if (gCalsEl)      gCalsEl.value      = gymContext.cals         || '';
  if (gTEEl)        gTEEl.value        = gymContext.trainingEffect || '';
  if (gAerobicTEEl) gAerobicTEEl.value = gymContext.aerobicTE   || '';

  const hasGymStats = gymContext.time || gymContext.avgHR || gymContext.maxHR || gymContext.cals ||
                      gymContext.trainingEffect;
  if (gymStatsRow) gymStatsRow.style.display = hasGymStats ? 'block' : 'none';

  // --- MAP GARMIN DATA TO INPUTS ---
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

  // === RENDER MAP FROM IndexedDB ===
  const runMapContainer = document.getElementById('runMapContainer');
  if (runMapContainer) {
    if (runContext.dist) {
      getMapFromDB(wk, selectedDay).then(coords => {
        if (coords && coords.length > 0) {
          runMapContainer.style.display = 'block';
          setTimeout(() => {
            if (activeWorkoutMapInstance) { activeWorkoutMapInstance.remove(); activeWorkoutMapInstance = null; }
            runMapContainer.innerHTML = '';
            activeWorkoutMapInstance = L.map('runMapContainer');
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(activeWorkoutMapInstance);
            const route = L.polyline(coords, { color: '#f43f5e', weight: 4, opacity: 0.9 }).addTo(activeWorkoutMapInstance);
            activeWorkoutMapInstance.fitBounds(route.getBounds(), { padding: [10, 10] });
            activeWorkoutMapInstance.invalidateSize();
          }, 100);
        } else {
          runMapContainer.style.display = 'none';
        }
      });
    } else {
      runMapContainer.style.display = 'none';
    }
  }

  const notesEl = document.getElementById('sessionNotesInput');
  const gymRpeEl = document.getElementById('sessionGymRpeCockpit');

  if (notesEl) notesEl.value = weekData.notes[selectedDay] || '';
  if (gymRpeEl) gymRpeEl.value = weekData.gymRpe?.[selectedDay] || '';

  // --- REORDER AEROBIC TILE DYNAMICALLY ---
  const runPanel = document.getElementById('cockpitRunPanel');
  const runSpecsEl = document.getElementById('cockpitRunSpecs');
  const exercisesContainer = document.getElementById('cockpitExercisesContainer');

  const blueprintRun = homeBlueprint.runs || '';
  const isRunScheduled = blueprintRun && !blueprintRun.toLowerCase().includes('no structured') && blueprintRun.toLowerCase() !== 'rest';

  if (runSpecsEl) runSpecsEl.textContent = blueprintRun || 'Rest';
  
  if (runPanel) {
    runPanel.classList.toggle('dimmed', !isRunScheduled);
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

  if (!exercisesContainer) return;

  const currentScrollY = window.scrollY;
  const previouslyExpandedLift = document.querySelector('.cockpit-exercise:not(.collapsed)')?.getAttribute('data-liftname');

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

  let isFirstAccordionField = true;

  for (let liftName in loggedLiftsData) {
    const setsArr = loggedLiftsData[liftName];
    if (!Array.isArray(setsArr)) continue;
    
    const isCompleted = setsArr.length > 0 && setsArr.every(s => s && s.c);
    const isCompletedClass = isCompleted ? 'completed' : '';

    let isCollapsedClass = 'collapsed';
    if (previouslyExpandedLift) {
      if (liftName === previouslyExpandedLift) isCollapsedClass = '';
    } else if (isFirstAccordionField && !isCompleted) {
      isCollapsedClass = '';
      isFirstAccordionField = false;
    }

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

    let historicalLineText = 'Baseline Loading Profile Verified';
    if (appState.exerciseStats && appState.exerciseStats[displayLiftName]) {
      historicalLineText = 'Global PR: ' + Math.round(appState.exerciseStats[displayLiftName].allTimeMax || 0) + 'kg (Est. 1RM)';
    }

    let historicalSetData = null;
    const pastWkNum = parseInt(wk, 10) - 1;
    if (pastWkNum >= 1 && appState.weeks) {
      const pastWeekData = appState.weeks[pastWkNum.toString()];
      if (pastWeekData && pastWeekData.lifts?.[selectedDay]?.[liftName]) {
        const finishedHistoricalSets = pastWeekData.lifts[selectedDay][liftName].filter(s => s && s.c && s.w && s.r);
        if (finishedHistoricalSets.length > 0) {
          historicalLineText = 'Last Session: [ ' + finishedHistoricalSets.map(s => s.w + 'kg × ' + s.r).join(', ') + ' ]';
        }
      }
    }

    const safeLiftName = liftName.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const displaySafeName = displayLiftName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const setsMarkup = setsArr.map((sData, sIdx) => {
      let linkedGhostSet = null;
      if (pastWkNum >= 1 && appState.weeks) {
        const historicalList = appState.weeks[pastWkNum.toString()]?.lifts?.[selectedDay]?.[liftName];
        if (historicalList && historicalList[sIdx] && historicalList[sIdx].w && historicalList[sIdx].r) {
          linkedGhostSet = historicalList[sIdx];
        }
      }
      return buildSetRow(sData, sIdx, safeLiftName, linkedGhostSet);
    }).join('');

    try {
      exCard.innerHTML = buildExerciseCard({
        displaySafeName,
        safeLiftName,
        isCompleted,
        diagnostic: computeDiagnosticForLift(wk, selectedDay, liftName),
        blueprintLabel,
        historicalLineText,
        setsMarkup
      });
    } catch(e) {
      exCard.innerHTML = `<div class="card-dark p-3 text-inverse">${displaySafeName} (Render Error)</div>`;
    }

    exercisesContainer.appendChild(exCard);
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
    const pastWkNum = parseInt(wk, 10) - 1;
    if (pastWkNum >= 1 && appState.weeks) {
      const historicalSet = appState.weeks[pastWkNum.toString()]?.lifts?.[selectedDay]?.[liftName]?.[sIdx];
      if (historicalSet && historicalSet.w && historicalSet.r) {
        targetW = historicalSet.w;
        targetR = historicalSet.r;
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
  
  appState.weeks[wk].lifts[selectedDay][liftName][sIdx] = { w: targetW, r: targetR, c: true };

  parentRow.classList.add('is-complete');
  
  try {
    const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
    const setRpe = gymRpeEl && gymRpeEl.value ? parseFloat(gymRpeEl.value) : null;
    triggerRestTimerEngine(liftName, setRpe);
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
    weekData.runs[selectedDay] = { 
        dist: distEl.value, 
        time: timeEl.value, 
        rpe: rpeRunEl.value,
        avgHR: avgHREl ? avgHREl.value : '',
        maxHR: maxHREl ? maxHREl.value : '',
        elev: elevEl ? elevEl.value : '',
        cals: calsEl ? calsEl.value : ''
    };
  }

  if (!weekData.gymStats) weekData.gymStats = {};
  const gTimeEl = document.getElementById('gymInputTime');
  const gAvgHREl = document.getElementById('gymInputAvgHR');
  const gMaxHREl = document.getElementById('gymInputMaxHR');
  const gCalsEl = document.getElementById('gymInputCals');

  if (gTimeEl && gTimeEl.offsetParent !== null) {
    weekData.gymStats[selectedDay] = {
        time: gTimeEl.value,
        avgHR: gAvgHREl ? gAvgHREl.value : '',
        maxHR: gMaxHREl ? gMaxHREl.value : '',
        cals: gCalsEl ? gCalsEl.value : ''
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

  for (let wKey in appState.weeks) {
    const weekObj = appState.weeks[wKey];
    if (!weekObj || !weekObj.lifts) continue;

    for (let dKey in weekObj.lifts) {
      const dayLifts = weekObj.lifts[dKey];
      if (!dayLifts) continue;

      for (let lift in dayLifts) {
        let maxEstimated1RM = 0;
        const setsArr = dayLifts[lift];
        if (!Array.isArray(setsArr)) continue;

        setsArr.forEach(set => {
          if (set && set.c && set.w && set.r) {
            const weight = parseFloat(set.w);
            const reps = parseInt(set.r);
            const e1RM = weight * (1 + (reps / 30));
            if (e1RM > maxEstimated1RM) maxEstimated1RM = e1RM;
          }
        });

        if (maxEstimated1RM > 0) {
          if (!appState.exerciseStats[lift]) {
            appState.exerciseStats[lift] = { allTimeMax: 0, currentEstimatedMax: 0 };
          }
          if (maxEstimated1RM > appState.exerciseStats[lift].allTimeMax) {
            appState.exerciseStats[lift].allTimeMax = maxEstimated1RM;
          }
          if (wKey === appState.currentWeek) {
            if (maxEstimated1RM > (appState.exerciseStats[lift].currentEstimatedMax || 0)) {
              appState.exerciseStats[lift].currentEstimatedMax = maxEstimated1RM;
            }
          }
        }
      }
    }
  }
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
      
      const pastWkNum = parseInt(wk, 10) - 1;
      if (pastWkNum >= 1 && appState.weeks && liftName) {
        const historicalSet = appState.weeks[pastWkNum.toString()]?.lifts?.[selectedDay]?.[liftName]?.[sIdx];
        if (historicalSet && historicalSet.w && historicalSet.r) {
          if (!wInput.value) wInput.value = historicalSet.w;
          if (!rInput.value) rInput.value = historicalSet.r;
        }
      }
      if (!wInput.value) wInput.value = "40";
      if (!rInput.value) rInput.value = "10";
    }

    try {
      const liftName = exCard ? exCard.getAttribute('data-liftname') : null;
      const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
      const setRpe = gymRpeEl && gymRpeEl.value ? parseFloat(gymRpeEl.value) : null;
      triggerRestTimerEngine(liftName, setRpe);
    } catch(e) { console.warn(e); }
  } else {
    if (parentRow) parentRow.classList.remove('is-complete');
  }
  commitWorkoutUIState();
  evaluateAccordionAutoFlowTransitions();
}

export function evaluateAccordionAutoFlowTransitions() {
  const expandedCard = document.querySelector('.cockpit-exercise:not(.collapsed)');
  if (!expandedCard) return;
  const rows = Array.from(expandedCard.querySelectorAll('.cockpit-set-row'));
  const finished = rows.every(r => r.querySelector('.gym-check')?.checked);

  if (finished) {
    expandedCard.classList.add('completed');
    const statusNode = expandedCard.querySelector('.cockpit-ex-status');
    if (statusNode) statusNode.textContent = 'DONE';
    showToast('Exercise Complete! ✓');

    expandedCard.classList.add('collapsed');
    const nextCard = expandedCard.nextElementSibling;
    if (nextCard && nextCard.classList.contains('cockpit-exercise') && !nextCard.classList.contains('completed')) {
      nextCard.classList.remove('collapsed');
      try { nextCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
      try { moveRestTimerToActiveExercise(); } catch(e) {}
    }
  }
}

export function applyQuickFillModifier(btnNode, typeModifier, sIdx) {
  if (!btnNode) return;
  const appState = _getState();
  const selectedDay = _getSelectedDay();

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
      const wkNum = parseInt(appState.currentWeek, 10);
      if (wkNum > 1 && appState.weeks) {
        const prevWeekData = appState.weeks[(wkNum - 1).toString()];
        if (prevWeekData && prevWeekData.lifts?.[selectedDay]?.[liftName]) {
          const matchedSet = prevWeekData.lifts[selectedDay][liftName][sIdx];
          if (matchedSet) {
            baseW = parseFloat(matchedSet.w) || 0;
            baseR = parseInt(matchedSet.r, 10) || 0;
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

export function toggleAccordionManual(elementNode) {
  if (!elementNode) return;
  const wasCollapsed = elementNode.classList.contains('collapsed');
  document.querySelectorAll('.cockpit-exercise').forEach(card => card.classList.add('collapsed'));

  if (wasCollapsed) {
    elementNode.classList.remove('collapsed');
  }
  try { moveRestTimerToActiveExercise(); } catch(e) { console.warn(e); }
}

export function populateExerciseDropdown() {
  const select = document.getElementById('newExerciseSelect');
  if (!select) return;
  
  const appState = _getState ? _getState() : { customExercises: [] };
  select.innerHTML = '';
  
  for (const [category, exercises] of Object.entries(EXERCISE_LIBRARY)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = category;
    const sortedExercises = [...exercises].sort();
    sortedExercises.forEach(exercise => {
      const option = document.createElement('option');
      option.value = exercise;
      option.textContent = exercise;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  }

  if (appState.customExercises && appState.customExercises.length > 0) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = "⭐️ Custom Movements";
    [...appState.customExercises].sort().forEach(exercise => {
      const option = document.createElement('option');
      option.value = exercise;
      option.textContent = exercise;
      customGroup.appendChild(option);
    });
    select.appendChild(customGroup);
  }

  const divider = document.createElement('option');
  divider.disabled = true;
  divider.textContent = "──────────────────";
  select.appendChild(divider);

  const customWildcard = document.createElement('option');
  customWildcard.value = "__WRITE_CUSTOM__";
  customWildcard.textContent = "✍️ Type Custom Exercise Name...";
  select.appendChild(customWildcard);
}

export function handleExerciseDropdownSelectionChange() {
  const select = document.getElementById('newExerciseSelect');
  const textContainer = document.getElementById('customExerciseTextInputContainer');
  if (!select || !textContainer) return;

  if (select.value === "__WRITE_CUSTOM__") {
    textContainer.style.display = 'block';
    const input = document.getElementById('customExerciseTextInput');
    if (input) input.focus();
  } else {
    textContainer.style.display = 'none';
  }
}

export function openAddExerciseModal() {
  populateExerciseDropdown();
  
  const textContainer = document.getElementById('customExerciseTextInputContainer');
  const txtInput = document.getElementById('customExerciseTextInput');
  if (textContainer) textContainer.style.display = 'none';
  if (txtInput) txtInput.value = '';

  const modal = document.getElementById('addExerciseModal');
  if (modal) modal.classList.add('active');
}

export function closeAddExerciseModal() {
  const modal = document.getElementById('addExerciseModal');
  if (modal) modal.classList.remove('active');
}

export function confirmAddExercise() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const select = document.getElementById('newExerciseSelect');
  if (!select) return;

  let liftName = select.value;
  
  if (liftName === "__WRITE_CUSTOM__") {
    const rawInput = document.getElementById('customExerciseTextInput');
    liftName = rawInput ? rawInput.value.trim() : '';
    
    if (!liftName) {
      showToast('Please type an exercise name.', true);
      return;
    }
    
    saveNewCustomExerciseToLibrary(liftName);
  }

  if (!liftName) return;

  const wk = appState.currentWeek;
  if (!appState.weeks[wk].lifts[selectedDay]) {
    appState.weeks[wk].lifts[selectedDay] = {};
  }

  if (!appState.weeks[wk].lifts[selectedDay][liftName]) {
    appState.weeks[wk].lifts[selectedDay][liftName] = [{ w: '', r: '10', c: false }];
  }

  _saveState(true);
  closeAddExerciseModal();
  renderWorkout();
  showToast(`Added: ${liftName}`);
}

export function openConfirmResetModal() {
  const modal = document.getElementById('confirmResetModal');
  if (modal) modal.classList.add('active');
}

export function closeConfirmResetModal() {
  const modal = document.getElementById('confirmResetModal');
  if (modal) modal.classList.remove('active');
}

export function executeResetActiveDayMetrics() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  
  if (!appState.weeks[wk].runs) appState.weeks[wk].runs = {};
  if (!appState.weeks[wk].lifts) appState.weeks[wk].lifts = {};
  if (!appState.weeks[wk].notes) appState.weeks[wk].notes = {};
  if (!appState.weeks[wk].gymStats) appState.weeks[wk].gymStats = {};
  
  appState.weeks[wk].runs[selectedDay] = { dist: '', time: '', rpe: '', avgHR: '', maxHR: '', elev: '', cals: '' };
  appState.weeks[wk].gymStats[selectedDay] = { time: '', avgHR: '', maxHR: '', cals: '' };
  appState.weeks[wk].lifts[selectedDay] = {};
  appState.weeks[wk].notes[selectedDay] = '';

  const activeProgram = PROGRAMS[appState.activeProgramId] || PROGRAMS["hybrid_engine"];
  const blueprint = activeProgram.days?.[selectedDay];

  if (blueprint && blueprint.lifts) {
    blueprint.lifts.forEach(liftName => {
      try {
        const parsedTarget = parseTargetFromDescription(blueprint.desc, liftName);
        let setsCount = parsedTarget.sets || 3;

        appState.weeks[wk].lifts[selectedDay][liftName] = [];
        for (let i = 0; i < setsCount; i++) {
          appState.weeks[wk].lifts[selectedDay][liftName].push({ w: '', r: (parsedTarget.reps || 10).toString(), c: false });
        }
      } catch(e) { console.warn(e); }
    });
  }
  try {
    stopAndResetWorkoutTimer();
    dismissRestTimer();
  } catch(e) { console.warn(e); }
  
  _saveState(true);
  
  deleteMapFromDB(wk, selectedDay).then(() => {
    renderWorkout();
  }).catch(() => renderWorkout());
  
  closeConfirmResetModal();
  showToast('Day Logs Cleared');
}

export function openFinishSessionModal() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  let vol = 0, setsDone = 0;
  const liftsData = appState.weeks[wk]?.lifts?.[selectedDay] || {};
  
  for (let lift in liftsData) {
    if (Array.isArray(liftsData[lift])) {
      liftsData[lift].forEach(s => {
        if (s && s.c) { vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); setsDone++; }
      });
    }
  }
  
  const sumVolEl = document.getElementById('summaryVolume');
  const sumSetsEl = document.getElementById('summarySets');
  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');
  const sumModalEl = document.getElementById('summaryModal');

  if (sumVolEl) sumVolEl.textContent = vol + ' kg';
  if (sumSetsEl) sumSetsEl.textContent = setsDone;
  if (sumGymRpeEl) sumGymRpeEl.value = appState.weeks[wk].gymRpe?.[selectedDay] || '';
  if (sumRunRpeEl) sumRunRpeEl.value = appState.weeks[wk].runs?.[selectedDay]?.rpe || '';
  if (sumModalEl) sumModalEl.classList.add('active');
}

export function closeFinishSessionModal() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const wk = appState.currentWeek;
  if (!appState.weeks[wk].gymRpe) appState.weeks[wk].gymRpe = {};

  const sumGymRpeEl = document.getElementById('summaryGymRPE');
  const sumRunRpeEl = document.getElementById('summaryRunRPE');
  
  if (sumGymRpeEl) appState.weeks[wk].gymRpe[selectedDay] = sumGymRpeEl.value;
  if (sumRunRpeEl && appState.weeks[wk].runs[selectedDay]) {
    appState.weeks[wk].runs[selectedDay].rpe = sumRunRpeEl.value;
  }
  
  const gymRpeEl = document.getElementById('sessionGymRpeCockpit');
  const runRpeEl = document.getElementById('runInputRpeCockpit');
  if (gymRpeEl) gymRpeEl.value = appState.weeks[wk].gymRpe[selectedDay] || '';
  if (runRpeEl) runRpeEl.value = appState.weeks[wk].runs[selectedDay]?.rpe || '';

  try { updateExercisePRs(); } catch(e) { console.warn(e); }
  _saveState(true);
  
  const sumModalEl = document.getElementById('summaryModal');
  if (sumModalEl) sumModalEl.classList.remove('active');
  
  try {
    stopAndResetWorkoutTimer();
    dismissRestTimer();
  } catch(e) { console.warn(e); }
  
  if (_switchTab) _switchTab('home');
}

// ==========================================
// EVENT DELEGATION ROUTER
// ==========================================
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  
  // Context extractors
  const exCard = target.closest('.cockpit-exercise');
  const row = target.closest('.cockpit-set-row');
  const liftName = exCard ? exCard.getAttribute('data-liftname') : target.getAttribute('data-liftname');
  const sIdx = parseInt(target.getAttribute('data-sidx'), 10);

  if (action === 'quick-log') executeOneTapQuickLog(target, liftName, sIdx);
  else if (action === 'quick-modifier') applyQuickFillModifier(target, target.getAttribute('data-modifier'), sIdx);
  else if (action === 'toggle-pad') toggleQuickPad(row);
  else if (action === 'append-set') appendCustomSetRow(target, liftName);
  else if (action === 'remove-set') removeCustomSetRow(liftName, sIdx);
  else if (action === 'toggle-accordion') toggleAccordionManual(exCard);
  else if (action === 'open-add-exercise') openAddExerciseModal();
  else if (action === 'close-add-exercise') closeAddExerciseModal();
  else if (action === 'confirm-add-exercise') confirmAddExercise();
  else if (action === 'open-reset-modal') openConfirmResetModal();
  else if (action === 'close-reset-modal') closeConfirmResetModal();
  else if (action === 'execute-reset') executeResetActiveDayMetrics();
  else if (action === 'open-finish-modal') openFinishSessionModal();
  else if (action === 'close-finish-modal') closeFinishSessionModal();
});

document.addEventListener('change', (e) => {
  const target = e.target;
  if (target.classList.contains('input-weight-node') || target.classList.contains('input-reps-node')) {
    updateInputState(target);
  } else if (target.classList.contains('gym-check')) {
    toggleGymCheckLoggingState(target);
  } else if (target.id === 'newExerciseSelect') {
    handleExerciseDropdownSelectionChange();
  }
});

document.addEventListener('focusout', (e) => {
  const target = e.target;
  if (target.matches('.input-weight-node, .input-reps-node, #sessionNotesInput, #sessionGymRpeCockpit, #runInputDist, #runInputTime, #runInputRpeCockpit')) {
    commitWorkoutUIState();
  }
});
