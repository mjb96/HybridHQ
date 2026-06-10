// ==========================================
// CLOUD-CONNECTED STATE MANAGER (state.js)
// ==========================================
import { PROGRAMS } from './constants.js';
import { prescribeSetsForLift } from './engine.js';

const supabaseUrl = 'https://uzxvufzlaipdwuffxqyo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6eHZ1ZnpsYWlwZHd1ZmZ4cXlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDE1MTYsImV4cCI6MjA5NjE3NzUxNn0.G26YRJzt4ndScofQvp4fi-G8MP-Fs2Ovn0e6Y9t4Dxg';

let supabaseClient = null;

try {
  if (window.supabase && supabaseUrl.startsWith('http')) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
  } else {
    console.warn("Supabase global not found. App will run in offline mode.");
  }
} catch (e) {
  console.error("Critical Supabase initialization failure:", e);
}

const STORAGE_KEY = 'hybrid_engine_v2_state';

// Base state configuration
export let appState = { 
  currentWeek: "1", 
  activeProgramId: "hybrid_engine", 
  weekStartedAt: null, 
  weeks: {}, 
  exerciseStats: {},
  customExercises: [],
  customPrograms: [],
  bodyWeightLog: [],
  thresholdPaceSeconds: null,
  deloadApplied: null,
  _deloadDismissedWeek: null,
  streakData: { current: 0, longest: 0, lastActivityDate: null },
  goalData: { milestones: [], completedCount: 0 }
};

export let activeTab = 'home';
export let selectedDay = 'mon';

export const DEFAULT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function setActiveTab(tab) { activeTab = tab; }
export function setSelectedDay(day) { selectedDay = day; }
export function setAppState(newState) { appState = newState; }

export function emitStorageLoadedEvent() {
  document.dispatchEvent(
    new CustomEvent('app:storage-loaded', {
      detail: { 
        week: appState.currentWeek, 
        activeProgramId: appState.activeProgramId 
      }
    })
  );
}

// ==========================================
// UNIVERSAL PROGRAM RESOLVER
// ==========================================
export function getProgramById(id) {
  if (appState.customPrograms) {
    const custom = appState.customPrograms.find(p => p.id === id);
    if (custom) return custom;
  }
  return PROGRAMS[id] || PROGRAMS['hybrid_engine'];
}

// ==========================================
// PROGRAM LIBRARY CRUD LOGIC
// ==========================================
export function createCustomProgram(name, totalWeeks, focus, philosophy) {
  const id = 'prog_' + Date.now();
  const newProg = {
    id,
    name: name || "New Custom Program",
    totalWeeks: parseInt(totalWeeks, 10) || 12,
    dossier: { creator: "You", focus: focus || "Custom Focus", philosophy: philosophy || "A custom built training block." },
    days: {},
    weeklyVolModifiers: {}
  };
  
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(d => {
    newProg.days[d] = { title: "Rest", badge: "Rest", color: "var(--text-muted)", desc: "", runs: "Rest", lifts: [] };
  });
  
  for(let i = 1; i <= newProg.totalWeeks; i++) {
    newProg.weeklyVolModifiers[i.toString()] = { sets: 3, reps: 10, intensityLabel: "Custom Block" };
  }
  
  if (!appState.customPrograms) appState.customPrograms = [];
  appState.customPrograms.push(newProg);
  saveStateToLocalStorage(true);
  return id;
}

export function duplicateCustomProgram(id) {
  const source = getProgramById(id);
  if (!source) return;
  const newProg = JSON.parse(JSON.stringify(source));
  newProg.id = 'prog_' + Date.now();
  newProg.name = newProg.name + " (Copy)";
  if(newProg.dossier) newProg.dossier.creator = "You";
  
  if (!appState.customPrograms) appState.customPrograms = [];
  appState.customPrograms.push(newProg);
  saveStateToLocalStorage(true);
}

export function deleteCustomProgram(id) {
  if (appState.activeProgramId === id) {
    return { success: false, message: "Cannot delete the currently active program." };
  }
  if (!appState.customPrograms) return { success: false, message: "No custom programs found." };
  
  appState.customPrograms = appState.customPrograms.filter(p => p.id !== id);
  saveStateToLocalStorage(true);
  return { success: true };
}

// ==========================================
// AUTHENTICATION
// ==========================================
export async function loginToSupabase() {
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPassword').value;
  
  if (!supabaseClient) {
      showToast("Offline mode — cannot sign in.", true);
      return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email: email, password: pass });

  if (error) {
    showToast("Login failed: " + error.message.substring(0, 50), true);
  } else {
    const authOverlay = document.getElementById('authOverlay');
    if(authOverlay) authOverlay.style.display = 'none';
    showToast('Securely Logged In ✓');
    await pullEngineDataFromStorage(); 
    window.location.reload();
  }
}
window.loginToSupabase = loginToSupabase; 

export async function checkActiveSession() {
  if (!supabaseClient) return; 
  try {
    const sessionPromise = supabaseClient.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
    const response = await Promise.race([sessionPromise, timeoutPromise]);
    
    if (response && response.data && response.data.session && !response.error) {
      const authOverlay = document.getElementById('authOverlay');
      if (authOverlay) authOverlay.style.display = 'none';
    }
  } catch (err) {
    console.warn("Session check failed or timed out. Defaulting to manual login.");
  }
}

// ==========================================
// INIT & SCHEMA
// ==========================================
export function determineDefaultCalendarDay() {
  const idx = new Date().getDay();
  const crossMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  selectedDay = crossMap[idx];
}

export function verifyWeekStorageSchema(wk) {
  if (!appState.weeks) appState.weeks = {};
  
  if (!appState.weeks[wk]) {
    appState.weeks[wk] = { runs: {}, lifts: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {} };
    DEFAULT_DAYS.forEach(d => {
      appState.weeks[wk].runs[d] = { dist: '', time: '', rpe: '' };
      appState.weeks[wk].notes[d] = '';
      appState.weeks[wk].gymRpe[d] = '';
      appState.weeks[wk].bodyWeight[d] = '';
      appState.weeks[wk].gymStats[d] = { time: '', avgHR: '', maxHR: '', cals: '' };
      appState.weeks[wk].lifts[d] = {};
    });

    const activeProgram = getProgramById(appState.activeProgramId);

    DEFAULT_DAYS.forEach(d => {
      const dayBlueprint = activeProgram.days[d];
      if (dayBlueprint && dayBlueprint.lifts && dayBlueprint.lifts.length > 0) {
        const weekModifier = activeProgram.weeklyVolModifiers?.[wk] || { sets: 4, reps: 5, intensityLabel: "Working Sets" };

        dayBlueprint.lifts.forEach(liftName => {
          appState.weeks[wk].lifts[d][liftName] =
            prescribeSetsForLift(wk, d, liftName, dayBlueprint.desc, weekModifier);
        });
      }
    });
  }
}

// ==========================================
// CLOUD PERSISTENCE
// ==========================================
export async function saveStateToLocalStorage(suppressToast = false) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error('Failed to save state locally:', e);
  }

  if (supabaseClient) {
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (!sessionData?.session) {
        if (!suppressToast) showToast('Session Saved Locally ✓');
        return;
      }
      const { error } = await supabaseClient
        .from('user_data')
        .upsert({ user_id: sessionData.session.user.id, state_data: appState }, { onConflict: 'user_id' });

      if (error) throw error;
      if (!suppressToast) showToast('Session Saved to Cloud ✓');
    } catch (err) {
      console.error('Supabase Save Error:', err);
      if (!suppressToast) showToast('DB Reject: ' + (err.message || 'Unknown error').substring(0, 40), true);
    }
  } else {
     if (!suppressToast) showToast('Session Saved Locally ✓');
  }
}

export async function pullEngineDataFromStorage() {
  let localData = null;
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (rawData) {
      localData = JSON.parse(rawData);
    }
  } catch (e) {
    console.error('Failed to parse local storage:', e);
  }

  const baseDefaults = { 
    currentWeek: '1', activeProgramId: 'hybrid_engine', weekStartedAt: null, 
    weeks: {}, exerciseStats: {}, customExercises: [], customPrograms: [], bodyWeightLog: [], 
    thresholdPaceSeconds: null, deloadApplied: null, _deloadDismissedWeek: null,
    streakData: { current: 0, longest: 0, lastActivityDate: null },
    goalData: { milestones: [], completedCount: 0 }
  };

  if (localData) {
    appState = { ...baseDefaults, ...localData };
  }

  if (supabaseClient) {
    try {
      const fetchCloud = async () => {
        const { data: userData, error: authError } = await supabaseClient.auth.getUser();
        if (!authError && userData?.user) {
            const { data, error } = await supabaseClient
              .from('user_data')
              .select('state_data')
              .eq('user_id', userData.user.id)
              .single();

            if (!error && data?.state_data) return data.state_data;
        }
        return null;
      };

      const cloudData = await Promise.race([
        fetchCloud(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Supabase timeout")), 4000))
      ]);

      if (cloudData) {
        appState = { ...baseDefaults, ...cloudData };
      }
    } catch (cloudErr) {
      console.warn('Cloud sync timeout/failure, relying on local backup.');
    }
  }

  // Schema Patching
  if (!appState.activeProgramId) appState.activeProgramId = "hybrid_engine";
  if (!appState.exerciseStats) appState.exerciseStats = {};
  if (!appState.weeks) appState.weeks = {};
  if (!appState.customExercises) appState.customExercises = [];
  if (!appState.customPrograms) appState.customPrograms = [];
  if (!appState.bodyWeightLog) appState.bodyWeightLog = [];
  if (appState.thresholdPaceSeconds === undefined) appState.thresholdPaceSeconds = null;
  if (appState.deloadApplied === undefined) appState.deloadApplied = null;
  if (!appState.streakData) appState.streakData = { current: 0, longest: 0, lastActivityDate: null };
  if (!appState.goalData) appState.goalData = { milestones: [], completedCount: 0 };

  const weeksToDelete = [];
  for (const wk in appState.weeks) {
    const wkData = appState.weeks[wk];
    if (!wkData || !wkData.lifts) continue;
    const hasLegacySchema = DEFAULT_DAYS.some(d => Array.isArray(wkData.lifts[d]));
    if (hasLegacySchema) weeksToDelete.push(wk);
  }
  weeksToDelete.forEach(wk => { delete appState.weeks[wk]; });

  verifyWeekStorageSchema(appState.currentWeek);

  try {
    emitStorageLoadedEvent();
  } catch (err) {
    console.warn('Storage loaded event dispatch failed.', err);
  }
}

// ==========================================
// DATA EXPORT / IMPORT
// ==========================================
function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) showToast('Summary copied to clipboard!');
    else showToast('Copy failed.', true);
  } catch (err) {
    showToast('Clipboard access denied.', true);
  }
  document.body.removeChild(textArea);
}

export function triggerTextSummaryExport() {
  const wk = appState.currentWeek;
  const weekData = appState.weeks[wk];
  
  if (!weekData) {
    showToast("No data to summarize.", true);
    return;
  }

  let totalVolume = 0;
  let activeDays = 0;
  let totalRpeSum = 0;
  let rpeCount = 0;

  DEFAULT_DAYS.forEach(d => {
    let dayHasActivity = false;

    if (weekData.lifts[d]) {
      for (let lift in weekData.lifts[d]) {
        weekData.lifts[d][lift].forEach(set => {
          if (set.c) {
            dayHasActivity = true;
            const weight = parseFloat(set.w) || 0;
            const reps = parseInt(set.r, 10) || 0;
            totalVolume += (weight * reps);
          }
        });
      }
    }

    const run = weekData.runs[d];
    if (run && (run.dist || run.time)) {
      dayHasActivity = true;
      if (run.rpe) {
        totalRpeSum += parseFloat(run.rpe);
        rpeCount++;
      }
    }

    if (weekData.gymRpe?.[d]) {
      totalRpeSum += parseFloat(weekData.gymRpe[d]);
      rpeCount++;
    }

    if (dayHasActivity) activeDays++;
  });

  const avgRpe = rpeCount > 0 ? (totalRpeSum / rpeCount).toFixed(1) : "N/A";
  const summaryText = `Week ${wk} Summary:\nVolume: ${totalVolume.toLocaleString()} kg\nSessions: ${activeDays}/7 completed\nAvg RPE: ${avgRpe}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(summaryText).then(() => {
      showToast('Summary copied to clipboard!');
    }).catch(err => {
      fallbackCopyTextToClipboard(summaryText);
    });
  } else {
    fallbackCopyTextToClipboard(summaryText);
  }
}

export function triggerEngineExport() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appState));
  const anchorNode = document.createElement('a');
  anchorNode.setAttribute('href', dataStr);
  anchorNode.setAttribute('download', 'hybrid_v2_meso_snapshot_wk' + appState.currentWeek + '.json');
  document.body.appendChild(anchorNode);
  anchorNode.click();
  anchorNode.remove();
}

export function triggerCSVExport() {
  let csv = 'Week,Day,Exercise,Set,Weight,Reps,Completed,RunDist,RunTime,RunRPE,AvgHR,MaxHR,ElevGain,Calories,BodyWeight,GymRPE,Notes\n';
  const loggedWeeks = Object.keys(appState.weeks).map(Number).sort((a, b) => a - b);
  loggedWeeks.forEach(w => {
    if (!appState.weeks[w]) return;
    DEFAULT_DAYS.forEach(d => {
      const dayNotes = (appState.weeks[w].notes?.[d] || '').replace(/,/g, ' ').replace(/\n/g, ' ');
      const run = appState.weeks[w].runs?.[d] || {};
      const bw = appState.weeks[w].bodyWeight?.[d] || '';
      const gymRpe = appState.weeks[w].gymRpe?.[d] || '';

      const runDist = run.dist || '';
      const runTime = run.time || '';
      const runRpe = run.rpe || '';
      const runAvgHR = run.avgHR || '';
      const runMaxHR = run.maxHR || '';
      const runElev = run.elev || '';
      const runCals = run.cals || '';

      const lifts = appState.weeks[w].lifts?.[d] || {};
      const liftKeys = Object.keys(lifts);

      if (liftKeys.length === 0) {
        if (runDist || runTime) {
          csv += `${w},${d},,,,,,${runDist},${runTime},${runRpe},${runAvgHR},${runMaxHR},${runElev},${runCals},${bw},${gymRpe},${dayNotes}\n`;
        }
      } else {
        liftKeys.forEach((lift, liftIdx) => {
          lifts[lift].forEach((s, idx) => {
            const isFirstRow = liftIdx === 0 && idx === 0;
            const runCols = isFirstRow
              ? `${runDist},${runTime},${runRpe},${runAvgHR},${runMaxHR},${runElev},${runCals}`
              : ',,,,,,,';
            csv += `${w},${d},${lift},${idx + 1},${s.w},${s.r},${s.c},${runCols},${bw},${gymRpe},${dayNotes}\n`;
          });
        });
      }
    });
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hybrid_data_export.csv';
  a.click();
}

let _onImportSuccess = null;
export function setImportSuccessCallback(fn) { _onImportSuccess = fn; }

export function triggerEngineImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsedData = JSON.parse(e.target.result);
      if (parsedData.currentWeek && parsedData.weeks && Object.keys(parsedData.weeks).length > 0) {
        appState = { activeProgramId: 'hybrid_engine', weekStartedAt: null, exerciseStats: {}, customExercises: [], customPrograms: [], ...parsedData };
        if (!appState.customExercises) appState.customExercises = [];
        if (!appState.customPrograms) appState.customPrograms = [];
        saveStateToLocalStorage(true);
        if (_onImportSuccess) _onImportSuccess();
        showToast('Data snapshot mounted successfully.');
      } else {
        showToast('File structure failed validation.', true);
      }
    } catch(err) {
      showToast('Error parsing storage file.', true);
    }
  };
  reader.readAsText(file);
}

export function showToast(msg, isError = false) {
  const toast = document.getElementById('sysToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = isError ? 'var(--accent-red)' : 'var(--accent-green)';
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 2500);
}

export function saveNewCustomExerciseToLibrary(exerciseName) {
  const cleanedName = exerciseName.trim();
  if (!cleanedName) return;
  if (!appState.customExercises) appState.customExercises = [];
  if (!appState.customExercises.includes(cleanedName)) {
    appState.customExercises.push(cleanedName);
    saveStateToLocalStorage(true); 
  }
}

export function logActivityForStreak() {
  const today = new Date().toISOString().slice(0, 10);
  if (!appState.streakData) appState.streakData = { current: 0, longest: 0, lastActivityDate: null };
  const lastDate = appState.streakData.lastActivityDate;
  
  if (lastDate === today) return; 

  if (lastDate) {
    const last = new Date(lastDate);
    const current = new Date(today);
    last.setHours(0, 0, 0, 0);
    current.setHours(0, 0, 0, 0);
    
    const diffTime = current - last;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) appState.streakData.current += 1;
    else if (diffDays > 1) appState.streakData.current = 1;
  } else {
    appState.streakData.current = 1;
  }

  if (appState.streakData.current > appState.streakData.longest) {
    appState.streakData.longest = appState.streakData.current;
  }

  appState.streakData.lastActivityDate = today;
  saveStateToLocalStorage(true);
}

export function addGoalMilestone(title) {
  if (!appState.goalData) appState.goalData = { milestones: [], completedCount: 0 };
  appState.goalData.milestones.push({ 
    id: Date.now().toString(), title: title, completed: false, dateAdded: new Date().toISOString()
  });
  saveStateToLocalStorage(true);
}

export function toggleMilestoneCompletion(id) {
  if (!appState.goalData) return;
  const milestone = appState.goalData.milestones.find(m => m.id === id);
  if (milestone) {
    milestone.completed = !milestone.completed;
    appState.goalData.completedCount = appState.goalData.milestones.filter(m => m.completed).length;
    saveStateToLocalStorage(true);
  }
}

// FIXED: Converted to async to permit sequential runtime execution of dynamic timers/modals imports
export async function executeResetActiveDayMetrics() {
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

  const activeProgram = getProgramById(appState.activeProgramId);
  const blueprint = activeProgram.days?.[selectedDay];

  if (blueprint && blueprint.lifts) {
    blueprint.lifts.forEach(liftName => {
      try {
        const weekModifier = activeProgram.weeklyVolModifiers?.[wk] || { sets: 4, reps: 5, intensityLabel: "Working Sets" };
        appState.weeks[wk].lifts[selectedDay][liftName] =
          prescribeSetsForLift(wk, selectedDay, liftName, blueprint.desc, weekModifier);
      } catch(e) { console.warn(e); }
    });
  }
  try {
    const { stopAndResetWorkoutTimer, dismissRestTimer } = await import('./timers.js');
    stopAndResetWorkoutTimer();
    dismissRestTimer();
  } catch(e) { console.warn(e); }
  
  saveStateToLocalStorage(true);
  
  deleteMapFromDB(wk, selectedDay).then(() => {
    document.dispatchEvent(new CustomEvent('app:storage-loaded', { detail: { week: appState.currentWeek, activeProgramId: appState.activeProgramId } }));
  }).catch(() => document.dispatchEvent(new CustomEvent('app:storage-loaded', { detail: { week: appState.currentWeek, activeProgramId: appState.activeProgramId } })));
  
  try {
    const { closeConfirmResetModal } = await import('./workout.js');
    closeConfirmResetModal();
  } catch(e) { console.warn(e); }
  
  showToast('Day Logs Cleared');
}