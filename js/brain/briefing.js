// ==========================================
// BRAIN BRIEFING + TELEMETRY (briefing.js)
// ------------------------------------------
// Synthesises the day's intelligence into (a) a dense hero paragraph that leads
// with conclusions, and (b) compact telemetry complications for the strip.
// Pure: takes already-computed inputs, returns strings/data. `node --test`.
// ==========================================

// ctx: { dataWeeks, recovery:{score,hasData}, readiness:{score,acwr,hasData},
//        energy:{bmr,active,total,hasProfile}, focusObservation }
export function composeBriefing(ctx = {}) {
  const { dataWeeks, recovery, readiness, energy, focusObservation } = ctx;

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

  return parts.length ? parts.join(' ') : 'Keep logging — more sessions sharpen the read.';
}

// Compact metric complications for the Tier-1 strip. Each: { key, label, value, nav }.
export function buildTelemetry(ctx = {}) {
  const { recovery, readiness, energy } = ctx;
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
  return out;
}
