// ==========================================
// HEALTH BASELINES TESTS (tests/healthBaselines.test.js) — `node --test`
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getLastNDays,
  buildDateMap,
  computeBaseline,
  formatBaselineComparison,
  computeSleepConsistency,
  sleepReadinessNote,
  generateHealthCoachNote,
  buildDailySeries,
  dayOverDay,
  lastNDaysSeries,
  lastNWeeksSeries,
  extremes,
  trendDirection,
  buildTrendBrief,
} from '../js/health/healthBaselines.js';

// ── Test helpers ───────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function makeLog(entries) {
  return entries.map(([daysBack, overrides]) => ({
    date: daysAgo(daysBack),
    sleepHours: 7.5,
    restingHeartRate: 55,
    steps: 8000,
    activeCalories: 400,
    weight: 75,
    ...overrides,
  }));
}

// ── getLastNDays ───────────────────────────────────────────────────────────────

test('getLastNDays returns entries within window', () => {
  const log = makeLog([[1, {}], [5, {}], [35, {}]]);
  const result = getLastNDays(log, 30);
  assert.equal(result.length, 2);
});

test('getLastNDays returns sorted ascending', () => {
  const log = makeLog([[3, {}], [1, {}], [2, {}]]);
  const result = getLastNDays(log, 7);
  assert.equal(result.length, 3);
  assert.ok(result[0].date < result[1].date);
  assert.ok(result[1].date < result[2].date);
});

test('getLastNDays handles empty input', () => {
  assert.deepEqual(getLastNDays([], 7), []);
  assert.deepEqual(getLastNDays(null, 7), []);
});

// ── buildDateMap ───────────────────────────────────────────────────────────────

test('buildDateMap builds O(1) lookup', () => {
  const log = makeLog([[1, { steps: 9000 }], [2, { steps: 7000 }]]);
  const map = buildDateMap(log);
  assert.ok(map instanceof Map);
  assert.equal(map.size, 2);
  const entry = map.get(daysAgo(1));
  assert.equal(entry?.steps, 9000);
});

test('buildDateMap handles empty input', () => {
  assert.equal(buildDateMap([]).size, 0);
  assert.equal(buildDateMap(null).size, 0);
});

// ── computeBaseline ────────────────────────────────────────────────────────────

test('computeBaseline returns null when insufficient history', () => {
  const log = makeLog([[1, { sleepHours: 7 }], [2, { sleepHours: 8 }]]);
  const result = computeBaseline(log, 'sleepHours');
  assert.equal(result.baseline, null);
  assert.equal(result.trend, 'insufficient');
  assert.equal(result.pctDiff, null);
});

test('computeBaseline computes mean over reference period', () => {
  // 5 days of 8h sleep + today 6h
  const log = [
    ...makeLog([[2, { sleepHours: 8 }], [3, { sleepHours: 8 }], [4, { sleepHours: 8 }], [5, { sleepHours: 8 }], [6, { sleepHours: 8 }]]),
    { date: new Date().toISOString().slice(0, 10), sleepHours: 6 },
  ];
  const result = computeBaseline(log, 'sleepHours');
  assert.ok(result.baseline !== null);
  assert.equal(result.baseline, 8);
  assert.ok(result.pctDiff !== null);
  assert.ok(result.pctDiff < 0); // 6h < 8h baseline
  assert.equal(result.trend, 'below');
});

test('computeBaseline detects "above" trend', () => {
  const log = [
    ...makeLog([[2, { steps: 6000 }], [3, { steps: 6000 }], [4, { steps: 6000 }], [5, { steps: 6000 }], [6, { steps: 6000 }]]),
    { date: new Date().toISOString().slice(0, 10), steps: 9000 },
  ];
  const result = computeBaseline(log, 'steps');
  assert.equal(result.trend, 'above');
  assert.ok(result.pctDiff > 0);
});

test('computeBaseline returns stable for within-10pct deviation', () => {
  const log = [
    ...makeLog([[2, { restingHeartRate: 55 }], [3, { restingHeartRate: 55 }], [4, { restingHeartRate: 55 }], [5, { restingHeartRate: 55 }], [6, { restingHeartRate: 55 }]]),
    { date: new Date().toISOString().slice(0, 10), restingHeartRate: 57 },
  ];
  const result = computeBaseline(log, 'restingHeartRate');
  assert.equal(result.trend, 'stable');
});

// ── formatBaselineComparison ───────────────────────────────────────────────────

test('formatBaselineComparison returns building-baseline message when insufficient', () => {
  const result = { baseline: null, pctDiff: null, trend: 'insufficient', current: 0 };
  const out = formatBaselineComparison(result, 'steps', true);
  assert.ok(out.includes('Building baseline'));
});

test('formatBaselineComparison formats above with higherIsBetter=true', () => {
  const result = { baseline: 7000, pctDiff: 15, trend: 'above', current: 8050 };
  const out = formatBaselineComparison(result, 'steps', true);
  assert.ok(out.includes('↑'));
  assert.ok(out.includes('above'));
});

test('formatBaselineComparison formats above with higherIsBetter=false (RHR)', () => {
  const result = { baseline: 55, pctDiff: 15, trend: 'above', current: 63 };
  const out = formatBaselineComparison(result, 'bpm', false);
  assert.ok(out.includes('elevated'));
});

test('formatBaselineComparison formats stable', () => {
  const result = { baseline: 55, pctDiff: 3, trend: 'stable', current: 57 };
  const out = formatBaselineComparison(result, 'bpm', false);
  assert.ok(out.includes('On par'));
});

// ── computeSleepConsistency ────────────────────────────────────────────────────

test('computeSleepConsistency returns "Not enough data" for fewer than 3 nights', () => {
  const log = makeLog([[1, { sleepHours: 7 }], [2, { sleepHours: 8 }]]);
  const result = computeSleepConsistency(log, 7);
  assert.equal(result.stdDev, null);
  assert.equal(result.label, 'Not enough data');
});

test('computeSleepConsistency labels consistent sleep', () => {
  const log = makeLog([
    [1, { sleepHours: 7.5 }], [2, { sleepHours: 7.6 }], [3, { sleepHours: 7.4 }],
    [4, { sleepHours: 7.5 }], [5, { sleepHours: 7.5 }],
  ]);
  const result = computeSleepConsistency(log, 7);
  assert.equal(result.label, 'Consistent');
  assert.ok(result.stdDev < 0.75);
});

test('computeSleepConsistency labels variable sleep', () => {
  const log = makeLog([
    [1, { sleepHours: 5 }], [2, { sleepHours: 9 }], [3, { sleepHours: 6 }],
    [4, { sleepHours: 10 }], [5, { sleepHours: 4.5 }],
  ]);
  const result = computeSleepConsistency(log, 7);
  assert.equal(result.label, 'Variable');
  assert.ok(result.stdDev >= 1.5);
});

// ── sleepReadinessNote ─────────────────────────────────────────────────────────

test('sleepReadinessNote returns empty observation for empty log', () => {
  const result = sleepReadinessNote([], 14);
  assert.equal(result.observation, '');
  assert.equal(result.shortNights, 0);
});

test('sleepReadinessNote flags majority short nights', () => {
  const log = makeLog([
    [1, { sleepHours: 5.5 }], [2, { sleepHours: 6 }], [3, { sleepHours: 5 }],
    [4, { sleepHours: 6.5 }], [5, { sleepHours: 5 }], [6, { sleepHours: 6 }],
  ]);
  const result = sleepReadinessNote(log, 14);
  assert.ok(result.shortNights >= 3);
  assert.ok(result.observation.includes('sleep debt') || result.observation.includes('under 7h'));
});

test('sleepReadinessNote praises good sleep', () => {
  const log = makeLog([
    [1, { sleepHours: 8 }], [2, { sleepHours: 7.5 }], [3, { sleepHours: 8 }],
    [4, { sleepHours: 7 }], [5, { sleepHours: 8 }], [6, { sleepHours: 8 }],
  ]);
  const result = sleepReadinessNote(log, 14);
  assert.equal(result.shortNights, 0);
  assert.ok(result.observation.includes('good') || result.observation.includes('7h or more'));
});

// ── generateHealthCoachNote ────────────────────────────────────────────────────

test('generateHealthCoachNote returns sync prompt when health is null', () => {
  const note = generateHealthCoachNote(null, []);
  assert.ok(note.includes('Sync Health Connect'));
});

test('generateHealthCoachNote returns all-green note for good health', () => {
  const health = { sleepHours: 8.5, restingHeartRate: 52, steps: 9000 };
  const note = generateHealthCoachNote(health, []);
  assert.ok(note.length > 0);
});

test('generateHealthCoachNote flags poor sleep', () => {
  const health = { sleepHours: 5, restingHeartRate: 0, steps: 0 };
  const note = generateHealthCoachNote(health, []);
  assert.ok(note.includes('5h') || note.includes('recovery threshold') || note.includes('intensity'));
});

test('generateHealthCoachNote flags significantly below average sleep', () => {
  const log = [
    ...makeLog([[2, { sleepHours: 8 }], [3, { sleepHours: 8 }], [4, { sleepHours: 8 }], [5, { sleepHours: 8 }], [6, { sleepHours: 8 }]]),
    { date: new Date().toISOString().slice(0, 10), sleepHours: 5 },
  ];
  const health = { sleepHours: 5, restingHeartRate: 0, steps: 0 };
  const note = generateHealthCoachNote(health, log);
  assert.ok(note.includes('5h') || note.includes('below your') || note.includes('intensity'));
});

// ── buildDailySeries ───────────────────────────────────────────────────────────

test('buildDailySeries returns parallel labels and values', () => {
  const log = makeLog([[1, { steps: 9000 }], [2, { steps: 7000 }], [3, { steps: 8000 }]]);
  const { labels, values } = buildDailySeries(log, 'steps', 7);
  assert.equal(labels.length, values.length);
  assert.equal(labels.length, 3);
  assert.ok(values.every(v => typeof v === 'number'));
});

test('buildDailySeries formats labels as D/M', () => {
  const log = makeLog([[1, {}]]);
  const { labels } = buildDailySeries(log, 'steps', 7);
  assert.ok(/^\d{1,2}\/\d{1,2}$/.test(labels[0]));
});

test('buildDailySeries returns zeros for missing field values', () => {
  const log = [{ date: daysAgo(1), steps: null }];
  const { values } = buildDailySeries(log, 'steps', 7);
  assert.equal(values[0], 0);
});

test('buildDailySeries handles empty log', () => {
  const { labels, values } = buildDailySeries([], 'steps', 7);
  assert.deepEqual(labels, []);
  assert.deepEqual(values, []);
});

// ── Trend-first helpers (Garmin-style) ──────────────────────────────────────────

test('dayOverDay reports upward direction and delta', () => {
  const log = [
    { date: daysAgo(1), steps: 6000 },
    { date: daysAgo(0), steps: 9000 },
  ];
  const d = dayOverDay(log, 'steps');
  assert.equal(d.today, 9000);
  assert.equal(d.yesterday, 6000);
  assert.equal(d.delta, 3000);
  assert.equal(d.pctDelta, 50);
  assert.equal(d.direction, 'up');
});

test('dayOverDay flags flat when equal', () => {
  const log = [{ date: daysAgo(1), steps: 8000 }, { date: daysAgo(0), steps: 8000 }];
  assert.equal(dayOverDay(log, 'steps').direction, 'flat');
});

test('dayOverDay handles missing yesterday', () => {
  const log = [{ date: daysAgo(0), steps: 8000 }];
  const d = dayOverDay(log, 'steps');
  assert.equal(d.hasYesterday, false);
  assert.equal(d.pctDelta, null);
});

test('lastNDaysSeries returns n entries with todayIndex at the end', () => {
  const log = makeLog([[0, { steps: 5000 }], [1, { steps: 4000 }]]);
  const s = lastNDaysSeries(log, 'steps', 7);
  assert.equal(s.labels.length, 7);
  assert.equal(s.values.length, 7);
  assert.equal(s.todayIndex, 6);
  assert.equal(s.values[6], 5000);
});

test('lastNWeeksSeries sums and averages by bucket', () => {
  const log = makeLog([[0, { steps: 10000 }], [1, { steps: 8000 }]]);
  const sum = lastNWeeksSeries(log, 'steps', 4, 'sum');
  assert.equal(sum.values.length, 4);
  assert.equal(sum.values[3], 18000); // both days fall in the trailing week
  const avg = lastNWeeksSeries(log, 'steps', 4, 'avg');
  assert.equal(avg.values[3], 9000);
});

test('extremes finds best and lowest non-zero day', () => {
  const log = [
    { date: daysAgo(3), steps: 3000 },
    { date: daysAgo(2), steps: 12000 },
    { date: daysAgo(1), steps: 0 },
  ];
  const e = extremes(log, 'steps', 30);
  assert.equal(e.best.value, 12000);
  assert.equal(e.lowest.value, 3000);
});

test('extremes returns nulls for empty data', () => {
  const e = extremes([], 'steps', 30);
  assert.equal(e.best, null);
  assert.equal(e.lowest, null);
});

test('trendDirection detects rising and falling', () => {
  assert.equal(trendDirection([1, 2, 3, 4, 5]).direction, 'rising');
  assert.equal(trendDirection([5, 4, 3, 2, 1]).direction, 'falling');
  assert.equal(trendDirection([3, 3, 3]).direction, 'steady');
});

test('trendDirection is steady with insufficient data', () => {
  assert.equal(trendDirection([5]).direction, 'steady');
  assert.equal(trendDirection([]).direction, 'steady');
});

test('buildTrendBrief bundles dod, daily, weekly, extremes and a note', () => {
  const log = makeLog([[0, { steps: 11000 }], [1, { steps: 7000 }], [8, { steps: 6000 }]]);
  const brief = buildTrendBrief(log, 'steps', { label: 'steps', unit: 'steps', higherIsBetter: true, goal: 10000 });
  assert.equal(brief.daily.values.length, 7);
  assert.equal(brief.weekly.values.length, 4);
  assert.ok(brief.best && brief.lowest);
  assert.ok(typeof brief.note === 'string' && brief.note.length > 0);
  assert.ok(typeof brief.fmt === 'function');
});

test('buildTrendBrief note mentions goal cleared when above target', () => {
  const log = makeLog([[0, { steps: 12000 }], [1, { steps: 11000 }]]);
  const brief = buildTrendBrief(log, 'steps', { label: 'steps', unit: 'steps', goal: 10000 });
  assert.match(brief.note, /target/i);
});
