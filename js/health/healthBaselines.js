// ==========================================
// HEALTH INTEGRATION — BASELINES & COACHING (healthBaselines.js)
// ------------------------------------------
// Pure analytics layer over the healthLog time-series.
// Derives athlete-specific baselines so every metric can be shown in context
// ("14% below your normal") rather than as an isolated number.
//
// All functions are pure (no DOM, no state mutations). Safe under `node --test`.
// ==========================================

// ── Log utilities ─────────────────────────────────────────────────────────────

/**
 * Return the last N calendar days of health log entries, sorted ascending.
 *
 * @param {Object[]} healthLog
 * @param {number}   n
 * @returns {Object[]}
 */
export function getLastNDays(healthLog, n = 30) {
  if (!Array.isArray(healthLog)) return [];
  const cutoff = new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return [...healthLog]
    .filter(e => e?.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Build a { date → entry } lookup for O(1) access.
 * @param {Object[]} healthLog
 * @returns {Map<string, Object>}
 */
export function buildDateMap(healthLog) {
  const m = new Map();
  (healthLog || []).forEach(e => { if (e?.date) m.set(e.date, e); });
  return m;
}

// ── Baseline computation ───────────────────────────────────────────────────────

/**
 * Compute an athlete-specific baseline (rolling mean) for one numeric field.
 *
 * @param {Object[]} healthLog
 * @param {string}   field
 * @param {number}   referenceDays   How many days of history to use (default 30).
 * @returns {{ baseline: number|null, current: number, pctDiff: number|null, trend: string }}
 */
export function computeBaseline(healthLog, field, referenceDays = 30) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...(healthLog || [])].sort((a, b) => a.date.localeCompare(b.date));

  const todayEntry = sorted.find(e => e.date === today) || sorted[sorted.length - 1];
  const current = parseFloat(todayEntry?.[field]) || 0;

  const cutoff = new Date(Date.now() - referenceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const historical = sorted.filter(e => e.date >= cutoff && e.date < today && parseFloat(e[field]) > 0);

  if (historical.length < 3) return { baseline: null, current, pctDiff: null, trend: 'insufficient' };

  const baseline = historical.reduce((s, e) => s + parseFloat(e[field]), 0) / historical.length;
  const rounded  = Math.round(baseline * 10) / 10;
  const pctDiff  = baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : null;

  const trend = pctDiff === null  ? 'stable'
    : pctDiff >  10  ? 'above'
    : pctDiff < -10  ? 'below'
    : 'stable';

  return { baseline: rounded, current, pctDiff, trend };
}

/**
 * Format a baseline result as a concise comparison string.
 *
 * @param {Object}  result         From computeBaseline()
 * @param {string}  unit           e.g. 'steps', 'h', 'bpm', 'kcal'
 * @param {boolean} higherIsBetter Controls directional language (e.g. RHR higher is bad)
 * @returns {string}
 */
export function formatBaselineComparison(result, unit = '', higherIsBetter = true) {
  if (!result || result.baseline === null || result.trend === 'insufficient') {
    return 'Building baseline — sync daily to establish your personal norms';
  }

  const { baseline, pctDiff, trend } = result;
  const absStr = Math.abs(pctDiff) + '%';
  const fmt = v => {
    if (unit === 'h')   return `${parseFloat(v).toFixed(1)}h`;
    if (unit === 'bpm') return `${Math.round(v)} bpm`;
    return `${Math.round(v).toLocaleString()}${unit ? ' ' + unit : ''}`;
  };

  if (trend === 'above') {
    return higherIsBetter
      ? `↑ ${absStr} above your 30-day average (${fmt(baseline)})`
      : `↑ ${absStr} above your normal — elevated (${fmt(baseline)} avg)`;
  }
  if (trend === 'below') {
    return higherIsBetter
      ? `↓ ${absStr} below your normal (${fmt(baseline)})`
      : `↓ ${absStr} below baseline — well within range (${fmt(baseline)} avg)`;
  }
  return `On par with your 30-day average (${fmt(baseline)})`;
}

// ── Sleep-specific ─────────────────────────────────────────────────────────────

/**
 * Sleep consistency = standard deviation of nightly sleep hours over the last N days.
 * Lower = more consistent. <0.75 = consistent; <1.5 = moderate; >= 1.5 = variable.
 *
 * @param {Object[]} healthLog
 * @param {number}   n
 * @returns {{ stdDev: number|null, label: string, nights: number }}
 */
export function computeSleepConsistency(healthLog, n = 7) {
  const entries = getLastNDays(healthLog, n).filter(e => e.sleepHours > 0);
  if (entries.length < 3) return { stdDev: null, label: 'Not enough data', nights: entries.length };

  const hours = entries.map(e => e.sleepHours);
  const mean  = hours.reduce((a, b) => a + b, 0) / hours.length;
  const variance = hours.reduce((s, h) => s + Math.pow(h - mean, 2), 0) / hours.length;
  const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;

  const label = stdDev < 0.75 ? 'Consistent'
    : stdDev < 1.5 ? 'Moderate'
    : 'Variable';

  return { stdDev, label, nights: entries.length };
}

/**
 * Correlate sleep quality with readiness/performance. Scans the last N days and
 * returns a correlation summary the view can display.
 *
 * @param {Object[]} healthLog
 * @param {number}   n
 * @returns {{ shortNights: number, totalNights: number, observation: string }}
 */
export function sleepReadinessNote(healthLog, n = 14) {
  const entries = getLastNDays(healthLog, n).filter(e => e.sleepHours > 0);
  const shortNights = entries.filter(e => e.sleepHours < 7).length;
  const total = entries.length;

  if (total === 0) return { shortNights: 0, totalNights: 0, observation: '' };

  const ratio = shortNights / total;
  let observation = '';
  if (ratio >= 0.5) {
    observation = `${shortNights} of the last ${total} nights were under 7h. Sleep debt accumulates — prioritise recovery tonight.`;
  } else if (ratio >= 0.25) {
    observation = `${shortNights} of the last ${total} nights were under 7h. Inconsistent sleep moderately affects performance.`;
  } else if (total >= 5) {
    observation = `Sleep quality is good — ${total - shortNights} of ${total} recent nights hit 7h or more.`;
  }

  return { shortNights, totalNights: total, observation };
}

// ── Coaching note generator ────────────────────────────────────────────────────

/**
 * Generate a plain-language coaching note from the current health snapshot
 * and historical log. Used as the "Brain note" in health detail views.
 *
 * @param {import('./healthTypes.js').HealthSnapshot|null} health
 * @param {Object[]} healthLog
 * @returns {string}
 */
export function generateHealthCoachNote(health, healthLog) {
  if (!health) return 'Sync Health Connect to unlock coaching notes.';

  const notes = [];

  const sleepBaseline = computeBaseline(healthLog, 'sleepHours');
  const stepsBaseline = computeBaseline(healthLog, 'steps');
  const rhrBaseline   = computeBaseline(healthLog, 'restingHeartRate');

  // Sleep
  if (health.sleepHours > 0 && sleepBaseline.pctDiff !== null) {
    if (sleepBaseline.pctDiff < -20) {
      notes.push(`Sleep last night was ${health.sleepHours}h — significantly below your ${sleepBaseline.baseline}h average. Your output today may be 15–20% lower than normal; reduce intensity accordingly.`);
    } else if (sleepBaseline.pctDiff > 15) {
      notes.push(`Excellent sleep last night (${health.sleepHours}h vs your ${sleepBaseline.baseline}h average). Today is a good window to push hard.`);
    }
  } else if (health.sleepHours < 6) {
    notes.push(`Sleep last night was ${health.sleepHours}h — below the recovery threshold. Protect intensity in today's session.`);
  }

  // RHR
  if (health.restingHeartRate > 0) {
    if (rhrBaseline.pctDiff !== null && rhrBaseline.pctDiff > 10) {
      notes.push(`Resting HR is ${health.restingHeartRate} bpm — ${rhrBaseline.pctDiff}% above your baseline. This is a systemic stress signal; keep effort in Zone 2 today.`);
    } else if (!rhrBaseline.baseline && health.restingHeartRate > 72) {
      notes.push(`Resting HR of ${health.restingHeartRate} bpm is on the higher side. Until a personal baseline is established, treat this as a moderate recovery flag.`);
    }
  }

  // Steps
  if (health.steps > 0 && stepsBaseline.pctDiff !== null && stepsBaseline.pctDiff < -30) {
    notes.push(`Activity is ${Math.abs(stepsBaseline.pctDiff)}% below your normal. Consider whether reduced movement is intentional recovery or unplanned inactivity.`);
  }

  if (notes.length === 0) {
    if (health.sleepHours >= 8 && (!health.restingHeartRate || health.restingHeartRate < 65)) {
      return 'All health signals look green. Good sleep and a calm nervous system — conditions are right to absorb training.';
    }
    return 'Health signals look stable. Keep syncing daily to build your personal baseline.';
  }

  return notes.join(' ');
}

// ── Data series helpers ────────────────────────────────────────────────────────

/**
 * Build parallel [labels, values] arrays from healthLog for a given field.
 * Useful for feeding existing chart functions.
 *
 * @param {Object[]} healthLog
 * @param {string}   field
 * @param {number}   n        Number of days
 * @returns {{ labels: string[], values: number[] }}
 */
export function buildDailySeries(healthLog, field, n = 30) {
  const entries = getLastNDays(healthLog, n);
  const labels  = entries.map(e => {
    const d = new Date(e.date + 'T00:00:00');
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });
  const values = entries.map(e => parseFloat(e[field]) || 0);
  return { labels, values };
}
