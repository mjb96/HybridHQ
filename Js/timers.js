// ==========================================
// TIMERS: REST TIMER + SESSION DURATION
// ==========================================

// Session duration timer
let workoutStartTime = null;
let workoutTimerInt = null;

// Rest timer
let restTimerStart = null;
let restTimerInt = null;

export function getWorkoutStartTime() { return workoutStartTime; }

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

export function triggerRestTimerEngine() {
  restTimerStart = Date.now();
  const timerBar = document.getElementById('cockpitTimerBar');
  const clockDisplay = document.getElementById('cockpitTimerClock');

  if (timerBar) timerBar.classList.add('active');

  moveRestTimerToActiveExercise();

  clearInterval(restTimerInt);
  restTimerInt = setInterval(() => {
    const elapsed = Math.floor((Date.now() - restTimerStart) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = (elapsed % 60).toString().padStart(2, '0');
    if (clockDisplay) clockDisplay.textContent = m + ':' + s;
  }, 1000);
}

export function dismissRestTimer() {
  clearInterval(restTimerInt);
  restTimerInt = null;
  restTimerStart = null;
  const timerBar = document.getElementById('cockpitTimerBar');
  const clockDisplay = document.getElementById('cockpitTimerClock');

  if (timerBar) timerBar.classList.remove('active');
  if (clockDisplay) clockDisplay.textContent = '0:00';

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
