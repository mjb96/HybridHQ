// ==========================================
// ANALYTICS VIEW — HYBRID SCORE (view-hybrid-score.js)
// ------------------------------------------
// Renders the 'hybrid-score' analytics context.
// A single composite athlete-status indicator combining readiness, recovery,
// training trends, sleep, and health signals into one auditable score.
// ==========================================
import { computeRecoveryScore, computeReadiness, computeWeeklyLoadSeries } from '../../engine.js';
import { getProgramById } from '../../state.js';
import { computeBaseline, getLastNDays, buildDailySeries } from '../../health/healthBaselines.js';
import { renderTrendLineWithBaseline } from '../charts.js';
import { escapeHtml } from '../../util.js';

// ── Score component weights ────────────────────────────────────────────────────
const WEIGHTS = { recovery: 0.25, readiness: 0.25, sleep: 0.20, rhr: 0.15, activity: 0.15 };

// ── Individual component scorers (0–100) ──────────────────────────────────────

function scoreRecovery(appState, days) {
  const r = computeRecoveryScore(appState, days);
  if (!r.hasData) return { value: null, label: 'No data', color: 'var(--text-muted)', delta: null };
  const color = r.score >= 70 ? '#10b981' : r.score >= 45 ? '#f59e0b' : '#ef4444';
  return { value: r.score, label: r.score >= 70 ? 'Good' : r.score >= 45 ? 'Moderate' : 'Low', color, delta: null };
}

function scoreReadiness(appState, days, maxWeek) {
  try {
    const load = computeWeeklyLoadSeries(appState, days, maxWeek);
    const total = load.lift.map((v, i) => v + (load.run[i] || 0));
    const r = computeReadiness(total, appState.currentWeek);
    if (!r.hasData) return { value: null, label: 'No data', color: 'var(--text-muted)', delta: null };
    // ACWR 0.8–1.3 = optimal. Map to 0-100: 1.0 = 100, 1.5 → 0, 0.5 → 50
    const acwr = r.acwr;
    let val;
    if (acwr >= 0.8 && acwr <= 1.3) val = 100 - Math.abs(acwr - 1.05) * 80;
    else if (acwr > 1.3) val = Math.max(0, 100 - (acwr - 1.3) * 200);
    else val = Math.max(0, 60 - (0.8 - acwr) * 150);
    val = Math.round(Math.min(100, Math.max(0, val)));
    const label = acwr <= 1.3 ? 'Productive' : acwr <= 1.5 ? 'Overreaching' : 'Strained';
    const color = acwr <= 1.3 ? '#10b981' : acwr <= 1.5 ? '#f59e0b' : '#ef4444';
    return { value: val, label, color, delta: acwr.toFixed(2) + ' ACWR' };
  } catch { return { value: null, label: 'No data', color: 'var(--text-muted)', delta: null }; }
}

function scoreSleep(health, healthLog) {
  const hours = health?.sleepHours || 0;
  const baseline = computeBaseline(healthLog, 'sleepHours');
  if (!hours) return { value: null, label: 'No data', color: 'var(--text-muted)', delta: null };
  // Score: 8h = 100, 7h = 80, 6h = 55, <6h = scaled down
  const raw = hours >= 8 ? 100 : hours >= 7 ? 80 : hours >= 6 ? 55 : Math.max(0, hours * 8);
  const value = Math.round(raw);
  const label = value >= 80 ? 'Excellent' : value >= 60 ? 'Good' : value >= 40 ? 'Fair' : 'Poor';
  const color = value >= 80 ? '#10b981' : value >= 60 ? '#22d3ee' : value >= 40 ? '#f59e0b' : '#ef4444';
  const delta = baseline.pctDiff !== null ? (baseline.pctDiff > 0 ? '+' : '') + baseline.pctDiff + '% vs avg' : null;
  return { value, label, color, delta };
}

function scoreRhr(health, healthLog) {
  const rhr = health?.restingHeartRate || 0;
  if (!rhr) return { value: null, label: 'No data', color: 'var(--text-muted)', delta: null };
  const baseline = computeBaseline(healthLog, 'restingHeartRate');
  let value;
  if (baseline.baseline !== null && baseline.pctDiff !== null) {
    // pctDiff > 0 means elevated (bad for RHR). -15% = 100, 0% = 80, +10% = 50, +20% = 20
    value = Math.round(Math.min(100, Math.max(0, 80 - baseline.pctDiff * 3)));
  } else {
    // No baseline yet — use absolute thresholds
    value = rhr < 55 ? 100 : rhr < 65 ? 80 : rhr < 75 ? 55 : 30;
  }
  const label = value >= 80 ? 'Normal' : value >= 55 ? 'Slightly elevated' : 'Elevated';
  const color = value >= 80 ? '#10b981' : value >= 55 ? '#f59e0b' : '#ef4444';
  const delta = baseline.pctDiff !== null ? (baseline.pctDiff > 0 ? '+' : '') + baseline.pctDiff + '% vs avg' : null;
  return { value, label, color, delta };
}

function scoreActivity(health, healthLog) {
  const steps = health?.steps || 0;
  const baseline = computeBaseline(healthLog, 'steps');
  if (!steps && !baseline.baseline) return { value: null, label: 'No data', color: 'var(--text-muted)', delta: null };
  const ref = steps || 0;
  // 10k steps = 100, 7.5k = 80, 5k = 55, <5k scales down
  const raw = ref >= 10000 ? 100 : ref >= 7500 ? 80 : ref >= 5000 ? 55 : Math.max(0, ref / 100);
  const value = Math.round(raw);
  const label = value >= 80 ? 'Active' : value >= 55 ? 'Moderate' : 'Low';
  const color = value >= 80 ? '#10b981' : value >= 55 ? '#f59e0b' : '#ef4444';
  const delta = baseline.pctDiff !== null ? (baseline.pctDiff > 0 ? '+' : '') + baseline.pctDiff + '% vs avg' : null;
  return { value, label, color, delta };
}

// ── Composite computation ────────────────────────────────────────────────────

export function computeHybridScore(appState, days) {
  const program  = getProgramById(appState.activeProgramId);
  const maxWeek  = program?.totalWeeks || 12;
  const health   = appState.health;
  const healthLog = appState.healthLog || [];

  const components = {
    recovery:  scoreRecovery(appState, days),
    readiness: scoreReadiness(appState, days, maxWeek),
    sleep:     scoreSleep(health, healthLog),
    rhr:       scoreRhr(health, healthLog),
    activity:  scoreActivity(health, healthLog),
  };

  // Only score components with data; rebalance weights
  const active = Object.entries(components).filter(([, c]) => c.value !== null);
  if (active.length === 0) return { score: null, components, hasData: false };

  const totalWeight = active.reduce((s, [k]) => s + WEIGHTS[k], 0);
  const weighted = active.reduce((s, [k, c]) => s + c.value * WEIGHTS[k], 0);
  const score = Math.round(weighted / totalWeight);

  return { score, components, hasData: true };
}

// ── History series (one score per healthLog day in past 30 days) ─────────────

function buildScoreHistory(appState, days) {
  const healthLog = appState.healthLog || [];
  const last30    = getLastNDays(healthLog, 30);
  if (last30.length < 3) return null;

  const labels = last30.map(e => {
    const d = new Date(e.date + 'T00:00:00');
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });
  const values = last30.map(e => {
    // Approximate score for historical day using that day's snapshot data
    const health = { sleepHours: e.sleepHours || 0, restingHeartRate: e.restingHeartRate || 0, steps: e.steps || 0 };
    const sleepC  = scoreSleep(health, healthLog);
    const rhrC    = scoreRhr(health, healthLog);
    const actC    = scoreActivity(health, healthLog);
    const active = [sleepC, rhrC, actC].filter(c => c.value !== null);
    if (!active.length) return 0;
    const wKeys  = ['sleep', 'rhr', 'activity'];
    const tw     = active.reduce((s, _, i) => s + WEIGHTS[wKeys[i]], 0);
    return Math.round(active.reduce((s, c, i) => s + c.value * WEIGHTS[wKeys[i]], 0) / tw);
  });
  return { labels, values };
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderHybridScoreView(appState, days) {
  const container = document.getElementById('hybridScoreContent');
  if (!container) return;

  const { score, components, hasData } = computeHybridScore(appState, days);
  const history = buildScoreHistory(appState, days);

  const scoreColor = !hasData ? 'var(--text-muted)'
    : score >= 80 ? '#10b981'
    : score >= 60 ? '#22d3ee'
    : score >= 40 ? '#f59e0b'
    : '#ef4444';

  const scoreLabel = !hasData ? 'No Data'
    : score >= 80 ? 'Optimal'
    : score >= 60 ? 'Good'
    : score >= 40 ? 'Building'
    : score >= 20 ? 'Fatigued'
    : 'At Risk';

  const interpretation = !hasData
    ? 'Log workouts and sync Health Connect to generate your Hybrid Score.'
    : score >= 80
    ? 'All systems green. Body and training load are aligned — high-performance conditions.'
    : score >= 60
    ? 'Solid state. Training is productive; monitor fatigue markers over the next 48h.'
    : score >= 40
    ? 'Mixed signals. Some areas need attention — check the drivers below.'
    : 'Recovery deficit detected. Reduce intensity and prioritise sleep before your next hard session.';

  const componentDefs = [
    { key: 'recovery',  label: 'Recovery',       icon: '♻️', weight: '25%' },
    { key: 'readiness', label: 'Training Load',   icon: '📈', weight: '25%' },
    { key: 'sleep',     label: 'Sleep Quality',   icon: '🌙', weight: '20%' },
    { key: 'rhr',       label: 'Resting HR',      icon: '💗', weight: '15%' },
    { key: 'activity',  label: 'Daily Activity',  icon: '👟', weight: '15%' },
  ];

  container.innerHTML = `
    <!-- Hero score -->
    <div class="flex-col flex-center mb-5">
      <div style="position:relative;width:120px;height:120px;margin:0 auto 12px;">
        <svg viewBox="0 0 120 120" style="width:120px;height:120px;transform:rotate(-90deg);">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10"/>
          ${hasData ? `<circle cx="60" cy="60" r="50" fill="none" stroke="${scoreColor}" stroke-width="10"
            stroke-dasharray="${(2 * Math.PI * 50 * score / 100).toFixed(1)} ${(2 * Math.PI * 50).toFixed(1)}"
            stroke-linecap="round"/>` : ''}
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <span class="font-heavy" style="font-size:1.9rem;line-height:1;color:${scoreColor};">${hasData ? score : '--'}</span>
          <span style="font-size:0.6rem;color:${scoreColor};font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">${scoreLabel}</span>
        </div>
      </div>
      <p class="text-sm text-muted" style="text-align:center;max-width:280px;line-height:1.5;">${escapeHtml(interpretation)}</p>
    </div>

    <!-- Component drivers -->
    <h2 class="section-header">Score Drivers</h2>
    <div class="flex-col gap-2 mb-4">
      ${componentDefs.map(({ key, label, icon, weight }) => {
        const c = components[key];
        const hasVal = c.value !== null;
        const barW = hasVal ? c.value : 0;
        return `
        <article class="card-dark p-3" style="border:1px solid ${hasVal ? `color-mix(in srgb, ${c.color} 20%, transparent)` : 'rgba(255,255,255,0.06)'};">
          <div class="flex-between mb-2">
            <div class="flex gap-2" style="align-items:center;">
              <span style="font-size:0.9rem;">${icon}</span>
              <span class="font-bold text-sm text-inverse">${label}</span>
              <span class="text-xs text-muted" style="margin-left:2px;">${weight}</span>
            </div>
            <div style="text-align:right;">
              <span class="font-heavy" style="font-size:1rem;color:${hasVal ? c.color : 'var(--text-muted)'};">${hasVal ? c.value : '--'}</span>
              ${c.delta ? `<div style="font-size:0.6rem;color:var(--text-muted);">${escapeHtml(c.delta)}</div>` : ''}
            </div>
          </div>
          <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.06);">
            <div style="height:100%;width:${barW}%;background:${hasVal ? c.color : 'rgba(255,255,255,0.12)'};border-radius:2px;transition:width 0.4s;"></div>
          </div>
          <div class="text-xs text-muted mt-1" style="text-align:right;">${hasVal ? escapeHtml(c.label) : 'Not available'}</div>
        </article>`;
      }).join('')}
    </div>

    <!-- Historical trend -->
    ${history ? `
    <h2 class="section-header">30-Day Health Score Trend</h2>
    <article class="card-dark p-3 mb-4">
      <div class="text-xs text-muted mb-2">Health component only (sleep, RHR, activity) — training data not included in history chart.</div>
      <div id="hybridScoreHistoryChart"></div>
    </article>` : ''}

    <!-- Methodology note -->
    <article class="card-dark p-3 mb-4" style="border-left:3px solid rgba(255,255,255,0.12);">
      <div class="text-xs text-muted" style="line-height:1.5;">
        Hybrid Score combines <strong class="text-inverse">training load (50%)</strong> and <strong class="text-inverse">health signals (50%)</strong>. It reflects current athlete status — not fitness level. A score of 70+ means conditions are right to train hard.
      </div>
    </article>
  `;

  if (history) {
    const el = document.getElementById('hybridScoreHistoryChart');
    if (el) {
      renderTrendLineWithBaseline(el, history.labels, history.values, null, {
        color: '#a78bfa',
        yFmt: v => Math.round(v),
        emptyMsg: 'Sync Health Connect daily to build your score trend.',
      });
    }
  }
}
