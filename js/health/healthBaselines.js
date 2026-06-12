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

// ── Trend-first analytics (Garmin-style: today / yesterday / 7d / 4wk) ─────────
// These power the "what changed, why, what next" experience. Averages become
// supporting context; direction-of-change and recent history lead.

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Today vs yesterday for one field, with direction of change.
 *
 * @param {Object[]} healthLog
 * @param {string}   field
 * @returns {{ today: number, yesterday: number, delta: number, pctDelta: number|null, direction: 'up'|'down'|'flat', hasToday: boolean, hasYesterday: boolean }}
 */
export function dayOverDay(healthLog, field) {
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const map = buildDateMap(healthLog);
  const t = parseFloat(map.get(today)?.[field]) || 0;
  const y = parseFloat(map.get(yesterday)?.[field]) || 0;
  const delta = t - y;
  const pctDelta = y > 0 ? Math.round((delta / y) * 100) : null;
  const direction = Math.abs(delta) < 1e-9 ? 'flat' : delta > 0 ? 'up' : 'down';
  return { today: t, yesterday: y, delta, pctDelta, direction, hasToday: t > 0, hasYesterday: y > 0 };
}

/**
 * Last N calendar days as day-of-week-labelled bars (Garmin daily history).
 * The most recent entry is the last element and flagged isToday.
 *
 * @param {Object[]} healthLog
 * @param {string}   field
 * @param {number}   n
 * @returns {{ labels: string[], values: number[], dates: string[], todayIndex: number }}
 */
export function lastNDaysSeries(healthLog, field, n = 7) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const map = buildDateMap(healthLog);
  const labels = [], values = [], dates = [];
  let todayIndex = -1;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const ds = d.toISOString().slice(0, 10);
    labels.push(DOW[d.getDay()]);
    values.push(parseFloat(map.get(ds)?.[field]) || 0);
    dates.push(ds);
    if (ds === todayStr) todayIndex = labels.length - 1;
  }
  return { labels, values, dates, todayIndex };
}

/**
 * Last N weeks aggregated (Garmin weekly history). Week buckets are anchored to
 * the current day; the final bucket is the trailing 7 days ("This week").
 *
 * @param {Object[]} healthLog
 * @param {string}   field
 * @param {number}   weeks
 * @param {'avg'|'sum'} agg
 * @returns {{ labels: string[], values: number[] }}
 */
export function lastNWeeksSeries(healthLog, field, weeks = 4, agg = 'avg') {
  const map = buildDateMap(healthLog);
  const now = Date.now();
  const labels = [], values = [];
  for (let w = weeks - 1; w >= 0; w--) {
    let sum = 0, count = 0;
    for (let d = 0; d < 7; d++) {
      const offset = w * 7 + d;
      const ds = new Date(now - offset * 86400000).toISOString().slice(0, 10);
      const v = parseFloat(map.get(ds)?.[field]) || 0;
      if (v > 0) { sum += v; count++; }
    }
    labels.push(w === 0 ? 'This wk' : `${w}w ago`);
    values.push(agg === 'sum' ? Math.round(sum) : (count ? Math.round((sum / count) * 10) / 10 : 0));
  }
  return { labels, values };
}

/**
 * Best (highest) and lowest non-zero day for a field over the last N days.
 *
 * @param {Object[]} healthLog
 * @param {string}   field
 * @param {number}   n
 * @returns {{ best: {date:string,value:number}|null, lowest: {date:string,value:number}|null }}
 */
export function extremes(healthLog, field, n = 30) {
  const entries = getLastNDays(healthLog, n).filter(e => parseFloat(e[field]) > 0);
  if (entries.length === 0) return { best: null, lowest: null };
  let best = entries[0], lowest = entries[0];
  entries.forEach(e => {
    const v = parseFloat(e[field]);
    if (v > parseFloat(best[field]))  best = e;
    if (v < parseFloat(lowest[field])) lowest = e;
  });
  return {
    best:   { date: best.date,   value: parseFloat(best[field]) },
    lowest: { date: lowest.date, value: parseFloat(lowest[field]) },
  };
}

/**
 * Direction of a numeric series via least-squares slope. Magnitude is expressed
 * relative to the series mean so it generalises across fields/units.
 *
 * @param {number[]} values  Non-zero values in chronological order.
 * @returns {{ slope: number, direction: 'rising'|'falling'|'steady', pct: number }}
 */
export function trendDirection(values) {
  const v = (values || []).filter(x => x > 0);
  if (v.length < 2) return { slope: 0, direction: 'steady', pct: 0 };
  const n = v.length;
  const meanX = (n - 1) / 2;
  const meanY = v.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  v.forEach((y, x) => { num += (x - meanX) * (y - meanY); den += (x - meanX) ** 2; });
  const slope = den ? num / den : 0;
  const totalChange = slope * (n - 1);
  const pct = meanY ? Math.round((totalChange / meanY) * 100) : 0;
  const direction = pct > 5 ? 'rising' : pct < -5 ? 'falling' : 'steady';
  return { slope, direction, pct };
}

/**
 * One-call trend brief for a Health Connect metric. Bundles today/yesterday,
 * the 7-day daily history, the 4-week history, extremes, weekly direction, and
 * a Garmin-style "what changed / what next" coaching note so views stay thin.
 *
 * @param {Object[]} healthLog
 * @param {string}   field
 * @param {Object}   cfg
 * @param {string}   [cfg.label]           Human label, e.g. 'steps'
 * @param {string}   [cfg.unit]            Unit suffix for the note
 * @param {boolean}  [cfg.higherIsBetter]  Directional language (RHR = false)
 * @param {'avg'|'sum'} [cfg.weeklyAgg]    How to roll up weeks
 * @param {number}   [cfg.goal]            Optional daily goal
 * @returns {Object}
 */
export function buildTrendBrief(healthLog, field, cfg = {}) {
  const { label = 'this metric', unit = '', higherIsBetter = true, weeklyAgg = 'avg', goal = null } = cfg;
  const dod    = dayOverDay(healthLog, field);
  const daily  = lastNDaysSeries(healthLog, field, 7);
  const weekly = lastNWeeksSeries(healthLog, field, 4, weeklyAgg);
  const ext    = extremes(healthLog, field, 30);
  const weeklyDir = trendDirection(weekly.values);

  const fmt = v => {
    if (unit === 'h')   return `${(Math.round(v * 10) / 10).toFixed(1)}h`;
    if (unit === 'bpm') return `${Math.round(v)} bpm`;
    if (unit === 'kg')  return `${(Math.round(v * 10) / 10).toFixed(1)} kg`;
    return `${Math.round(v).toLocaleString()}${unit ? ' ' + unit : ''}`;
  };

  // What changed (day over day)
  const parts = [];
  if (dod.hasToday && dod.hasYesterday) {
    if (dod.direction === 'flat') {
      parts.push(`${label[0].toUpperCase() + label.slice(1)} is level with yesterday (${fmt(dod.today)}).`);
    } else {
      const word = dod.direction === 'up' ? 'up' : 'down';
      const good = higherIsBetter ? dod.direction === 'up' : dod.direction === 'down';
      const mag  = dod.pctDelta !== null ? ` ${Math.abs(dod.pctDelta)}%` : '';
      parts.push(`${label[0].toUpperCase() + label.slice(1)} is ${word}${mag} on yesterday (${fmt(dod.today)} vs ${fmt(dod.yesterday)})${good ? ' — moving the right way.' : '.'}`);
    }
  } else if (dod.hasToday) {
    parts.push(`Today: ${fmt(dod.today)}. No reading yet for yesterday to compare.`);
  }

  // 4-week direction (why / context)
  if (weeklyDir.direction !== 'steady' && Math.abs(weeklyDir.pct) >= 5) {
    const rising = weeklyDir.direction === 'rising';
    const good = higherIsBetter ? rising : !rising;
    parts.push(`Over the last 4 weeks the trend is ${rising ? 'rising' : 'falling'} (${Math.abs(weeklyDir.pct)}%)${good ? ', a positive trajectory.' : ' — worth watching.'}`);
  } else if (weekly.values.filter(v => v > 0).length >= 3) {
    parts.push('Your 4-week trend is holding steady.');
  }

  // What next (goal-aware where provided)
  if (goal && dod.hasToday) {
    if (dod.today >= goal) parts.push(`You've cleared your ${fmt(goal)} target today.`);
    else parts.push(`${fmt(goal - dod.today)} to go to hit your ${fmt(goal)} target.`);
  }

  return {
    dod, daily, weekly, weeklyDir,
    best: ext.best, lowest: ext.lowest,
    note: parts.join(' '),
    fmt,
  };
}
