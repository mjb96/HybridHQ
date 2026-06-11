// ==========================================
// TIMERS: REST TIMER + SESSION DURATION
// ==========================================

// Session duration timer
let workoutStartTime = null;
let workoutTimerInt = null;

// Rest timer
let restTimerStart = null;
let restTimerInt = null;
let currentTargetRestSec = 90;

export function getWorkoutStartTime() { return workoutStartTime; }

// ==========================================
// SMART REST TIMER CATEGORIES (INCREMENT 9)
// ==========================================
function getRecommendedRestSeconds(liftName) {
  if (!liftName) return 90; // Default accessory
  const name = liftName.toLowerCase();
  
  // Heavy Compounds: ATP-CP + CNS Recovery Focus
  if (
    name.includes('squat') || 
    name.includes('deadlift') || 
    name.includes('bench press') || 
    name.includes('overhead press') ||
    name.includes('barbell row') ||
    name.includes('pull-up')
  ) {
    return 180; // 3 mins
  }
  
  // Olympic/Explosive Lifts: Power maintenance
  if (
    name.includes('clean') || 
    name.includes('jerk') || 
    name.includes('snatch') ||
    name.includes('power')
  ) {
    return 120; // 2 mins
  }
  
  // Default hypertrophy / accessories
  return 90; // 1.5 mins
}

// ==========================================
// REST TIMER
// ==========================================
export function moveRestTimerToActiveExercise() {
  const timerBar = document.getElementById('cockpitTimerBar');
  if (!timerBar || !timerBar.classList.contains('active')) return;

  const openCard = document.querySelector('.cockpit-exercise:not(.collapsed) .local-timer-placeholder');
  if (openCard) {
    openCard.appendChild(timerBar);
    timerBar.style.position = "relative";
    timerBar.style.margin = "0 0 12px 0";
    timerBar.style.width = "100%";
    timerBar.style.bottom = "auto";
    timerBar.style.left = "auto";
  } else {
    document.getElementById('view-workout').appendChild(timerBar);
    timerBar.style.position = "fixed";
    timerBar.style.bottom = "85px";
    timerBar.style.width = "calc(100% - 32px)";
    timerBar.style.margin = "0";
    timerBar.style.left = "16px";
  }
}

export function triggerRestTimerEngine(liftName = null, setRpe = null) {
  restTimerStart = Date.now();
  currentTargetRestSec = getRecommendedRestSeconds(liftName);
  
  // Smart Coaching Tweak: Auto-extend rest for extreme effort sets
  if (setRpe && parseFloat(setRpe) >= 9.0) {
    currentTargetRestSec += 30; 
  }

  const timerBar = document.getElementById('cockpitTimerBar');
  const clockDisplay = document.getElementById('cockpitTimerClock');

  if (timerBar) {
    timerBar.classList.add('active');
    // Strip any completion styles from previous rests
    timerBar.style.background = '';
    timerBar.style.borderColor = '';
    if (clockDisplay) clockDisplay.style.color = '';
  }

  moveRestTimerToActiveExercise();

  clearInterval(restTimerInt);
  restTimerInt = setInterval(() => {
    const elapsed = Math.floor((Date.now() - restTimerStart) / 1000);
    const remaining = currentTargetRestSec - elapsed;
    
    if (clockDisplay) {
      if (remaining > 0) {
        const m = Math.floor(remaining / 60);
        const s = (remaining % 60).toString().padStart(2, '0');
        clockDisplay.textContent = `Rest: ${m}:${s}`;
      } else {
        // Shift into overtime mode
        const overtime = Math.abs(remaining);
        const m = Math.floor(overtime / 60);
        const s = (overtime % 60).toString().padStart(2, '0');
        clockDisplay.textContent = `READY (+${m}:${s})`;
        
        // Instantly trigger completion visuals on exact zero
        if (timerBar && remaining === 0) {
          timerBar.style.background = 'rgba(16, 185, 129, 0.15)'; 
          timerBar.style.borderColor = 'var(--accent-green, #10b981)';
          clockDisplay.style.color = 'var(--accent-green, #10b981)';
          
          if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
        }
      }
    }
  }, 1000);
}

export function dismissRestTimer() {
  clearInterval(restTimerInt);
  restTimerInt = null;
  restTimerStart = null;
  
  const timerBar = document.getElementById('cockpitTimerBar');
  const clockDisplay = document.getElementById('cockpitTimerClock');

  if (timerBar) {
    timerBar.classList.remove('active');
    timerBar.style.background = '';
    timerBar.style.borderColor = '';
  }
  
  if (clockDisplay) {
    clockDisplay.textContent = '0:00';
    clockDisplay.style.color = '';
  }

  if (timerBar) {
    document.getElementById('view-workout').appendChild(timerBar);
    timerBar.style.position = "fixed";
    timerBar.style.bottom = "85px";
    timerBar.style.width = "calc(100% - 32px)";
    timerBar.style.margin = "0";
    timerBar.style.left = "16px";
  }
}

// ==========================================
// SESSION DURATION TIMER
// ==========================================
export function startWorkoutTimer() {
  if (!workoutStartTime) {
    workoutStartTime = Date.now();
    localStorage.setItem('hybrid_workoutStartTime', workoutStartTime.toString());
    resumeTimerDisplay();
  }
}

export function resumeTimerDisplay() {
  const startBtn = document.getElementById('startWorkoutBtn');
  const durationBar = document.getElementById('workoutDurationBar');
  const durationClock = document.getElementById('workoutDurationClock');

  if (startBtn) startBtn.style.display = 'none';
  if (durationBar) durationBar.classList.add('active');

  clearInterval(workoutTimerInt);
  workoutTimerInt = setInterval(() => {
    const diff = Math.floor((Date.now() - workoutStartTime) / 1000);
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    if (durationClock) {
      durationClock.textContent = h === '00' ? m + ':' + s : h + ':' + m + ':' + s;
    }
  }, 1000);
}

export function stopAndResetWorkoutTimer() {
  clearInterval(workoutTimerInt);
  workoutTimerInt = null;
  workoutStartTime = null;
  localStorage.removeItem('hybrid_workoutStartTime');

  const startBtn = document.getElementById('startWorkoutBtn');
  const durationBar = document.getElementById('workoutDurationBar');
  const durationClock = document.getElementById('workoutDurationClock');

  if (startBtn) startBtn.style.display = 'block';
  if (durationBar) durationBar.classList.remove('active');
  if (durationClock) durationClock.textContent = '00:00';
}

export function checkActiveTimerOnLoad() {
  const storedTime = localStorage.getItem('hybrid_workoutStartTime');
  if (storedTime) {
    workoutStartTime = parseInt(storedTime, 10);
    resumeTimerDisplay();
  }
}
