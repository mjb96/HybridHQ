// ==========================================
// BRAIN BRIEFING + TELEMETRY (briefing.js)
// ------------------------------------------
// Synthesises the day's intelligence into (a) a dense hero paragraph that leads
// with conclusions, and (b) compact telemetry complications for the strip.
// Pure: takes already-computed inputs, returns strings/data. `node --test`.
// ==========================================

// ctx: { dataWeeks, recovery:{score,hasData}, readiness:{score,acwr,hasData},
//        energy:{bmr,active,total,hasProfile}, focusObservation,
//        health:{sleepHours,sleepScore,restingHeartRate} }
export function composeBriefing(ctx = {}) {
  const { dataWeeks, recovery, readiness, energy, focusObservation, health } = ctx;

  if (!dataWeeks || dataWeeks < 1) {
    return 'Log a few sessions and your daily briefing appears here — readiness, recovery and where your training is trending.';
  }

  const parts = [];

  if (recovery?.hasData) {
    const s = recovery.score;
    const tail = s >= 75 ? ' — a good window to push intensity'
              : s < 50  ? ' — protect rest and sleep today'
              : ' — hold planned volume';
    const word = s >= 75 ? 'You look well recovered'
              : s >= 50 ? 'Recovery is moderate'
              : 'Recovery is running low';
    parts.push(`Recovery is at ${s}%. ${word}${tail}.`);
  }

  if (readiness?.hasData) {
    const acwr = typeof readiness.acwr === 'number' ? readiness.acwr.toFixed(2) : readiness.acwr;
    const load = readiness.acwr <= 1.3 ? 'current training load is sustainable'
              : readiness.acwr <= 1.5 ? 'training load is climbing — watch it'
              : 'training load is high — ease one side';
    parts.push(`Acute:chronic load is ${acwr}; ${load}.`);
  }

  if (focusObservation) parts.push(focusObservation);

  if (energy?.hasProfile) {
    parts.push(`Energy out today ≈ ${energy.total.toLocaleString()} kcal (base ${energy.bmr.toLocaleString()} + active ${energy.active.toLocaleString()}).`);
  }

  if (health?.sleepHours > 0) {
    if (health.sleepHours < 6) {
      parts.push(`Sleep was short last night (${health.sleepHours}h) — protect intensity today.`);
    } else if (health.sleepHours >= 8) {
      parts.push(`Good sleep last night (${health.sleepHours}h) — performance ceiling is high.`);
    }
  }

  if (health?.restingHeartRate > 0 && health.restingHeartRate > 65) {
    parts.push(`Resting HR is elevated at ${health.restingHeartRate} bpm — factor this into today's effort targets.`);
  }

  return parts.length ? parts.join(' ') : 'Keep logging — more sessions sharpen the read.';
}

// COROS-style training status from the acute:chronic load ratio. Returns a
// status word + tone + the acute/chronic load figures for the hero.
export function trainingStatus(readiness) {
  if (!readiness || !readiness.hasData) {
    return { status: 'Building', tone: 'progress', hasData: false };
  }
  const acwr = readiness.acwr;
  let status, tone;
  if (acwr < 0.8)       { status = 'Detraining';   tone = 'recovery'; }
  else if (acwr <= 1.0) { status = 'Maintaining';  tone = 'progress'; }
  else if (acwr <= 1.3) { status = 'Productive';   tone = 'progress'; }
  else if (acwr <= 1.5) { status = 'Overreaching'; tone = 'opportunity'; }
  else                  { status = 'Strained';     tone = 'risk'; }
  return { status, tone, hasData: true, acwr, acute: readiness.acute, chronic: readiness.chronic };
}

// Compact metric complications for the Tier-1 strip. Each: { key, label, value, nav }.
// ctx may now include health: { steps, sleepHours, restingHeartRate, activeCalories }
export function buildTelemetry(ctx = {}) {
  const { recovery, readiness, energy, health } = ctx;
  const out = [];

  if (readiness?.hasData) out.push({ key: 'readiness', label: 'Readiness', value: `${readiness.score}`, nav: 'recovery' });
  if (recovery?.hasData)  out.push({ key: 'recovery',  label: 'Recovery',  value: `${recovery.score}%`, nav: 'recovery-score' });

  if (energy?.hasProfile) {
    out.push({ key: 'base',   label: 'Base',   value: `${energy.bmr.toLocaleString()}`,   unit: 'kcal', nav: null });
    out.push({ key: 'active', label: 'Active', value: `${energy.active.toLocaleString()}`, unit: 'kcal', nav: 'active-fuel' });
    out.push({ key: 'burned', label: 'Burned', value: `${energy.total.toLocaleString()}`,  unit: 'kcal', nav: 'active-fuel' });
  } else {
    out.push({ key: 'profile', label: 'Energy', value: 'Set up', nav: 'profile' });
  }

  if (health?.steps > 0) {
    out.push({ key: 'steps', label: 'Steps', value: health.steps.toLocaleString(), nav: null });
  }
  if (health?.sleepHours > 0) {
    out.push({ key: 'sleep', label: 'Sleep', value: `${health.sleepHours}h`, nav: null });
  }
  if (health?.restingHeartRate > 0) {
    out.push({ key: 'rhr', label: 'RHR', value: `${health.restingHeartRate}`, unit: 'bpm', nav: null });
  }

  return out;
}
