// ==========================================
// ANALYTICS VIEW — PROGRESS (view-progress.js)
// ------------------------------------------
// Renders the 'progress', 'goal-progress', 'streak', and 'active-fuel'
// analytics contexts.
// ==========================================
import {
  computeStreakView, computeGoalAdherence, computeDynamicMilestones,
  computeWeeklyCaloriesSeries, computeWeeklyCompletionSeries, formatPace,
} from '../../engine.js';
import { getProgramById } from '../../state.js';
import { setText, rpeColour, paceZoneColour } from '../utils.js';
import { renderWeeklyBarChart, renderCompletionVsTargetChart } from '../charts.js';

// ---- Progress timeline table (per-week vol / dist / pace / RPE) ------------
export function renderProgressView(data, appState) {
  const tbody = document.getElementById('analyticsTimelineTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const currentWeekStr = appState.currentWeek;
  data.weekLabels.forEach((lbl, i) => {
    const wKey      = (i + 1).toString();
    const isActive  = wKey === currentWeekStr;
    const avgPace   = data.paceData[i] > 0 ? formatPace(data.paceData[i]) : '--';
    const avgRpe    = data.rpeData[i]  > 0 ? data.rpeData[i].toFixed(1) : '--';
    const rpeStyle  = data.rpeData[i] > 0 ? `color:${rpeColour(data.rpeData[i])};font-weight:700;` : '';
    const paceColor = data.paceData[i] > 0 ? paceZoneColour(data.paceData[i], data.thresholdSecs) : '#ffffff';

    const tr = document.createElement('tr');
    if (isActive) tr.style.background = 'rgba(59,130,246,0.1)';
    tr.innerHTML =
      `<td class="py-2"><strong style="${isActive ? 'color:#3b82f6;' : 'color:#fff;'}">${lbl}</strong></td>` +
      `<td class="py-2" style="color:#fff;">${data.volData[i] > 0 ? data.volData[i].toLocaleString() + ' kg' : '--'}</td>` +
      `<td class="py-2" style="color:#fff;">${data.runData[i] > 0 ? data.runData[i].toFixed(1) + ' km' : '--'}</td>` +
      `<td class="py-2" style="color:${paceColor};font-variant-numeric:tabular-nums;">${avgPace}</td>` +
      `<td class="py-2" style="${rpeStyle}">${avgRpe}</td>`;
    tbody.appendChild(tr);
  });
}

// ---- Streak detail (current + longest + motivational copy) -----------------
export function renderStreakView(data, appState) {
  const sv = computeStreakView(appState.streakData);

  const currentEl = document.getElementById('streakCurrent');
  const longestEl = document.getElementById('streakLongest');
  const detailEl  = document.getElementById('streakDetailContainer');

  if (currentEl) currentEl.textContent = `${sv.current} day${sv.current !== 1 ? 's' : ''}`;
  if (longestEl) longestEl.textContent = `${sv.longest} day${sv.longest !== 1 ? 's' : ''}`;
  if (!detailEl) return;

  if (!sv.hasData) {
    detailEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.75rem;">Complete a workout or log a run to start your streak. Each calendar day with logged activity keeps it alive.</p>';
    return;
  }

  const msg = sv.broken
    ? 'Your streak lapsed — log today to start a fresh one.'
    : sv.current >= 7
    ? `🔥 ${sv.current}-day streak! Momentum is everything.`
    : sv.current >= 3
    ? `💪 ${sv.current} days in a row. Keep it going!`
    : `${sv.current} day streak. Every day counts.`;

  const lastNice = sv.lastActivityDate
    ? new Date(sv.lastActivityDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '--';

  detailEl.innerHTML = `
    <div class="card-dark p-3 mb-3" style="border:1px solid rgba(245,158,11,0.3);background:rgba(245,158,11,0.06);">
      <div class="font-heavy text-inverse" style="font-size:1rem;">${msg}</div>
    </div>
    <div class="flex-between mb-2" style="font-size:0.8rem;">
      <span class="text-muted">Current streak</span>
      <span class="font-heavy text-inverse">${sv.current} day${sv.current !== 1 ? 's' : ''}</span>
    </div>
    <div class="flex-between mb-2" style="font-size:0.8rem;">
      <span class="text-muted">Personal best streak</span>
      <span class="font-heavy text-inverse">${sv.longest} day${sv.longest !== 1 ? 's' : ''}</span>
    </div>
    <div class="flex-between" style="font-size:0.8rem;">
      <span class="text-muted">Last active day</span>
      <span class="font-heavy text-inverse">${lastNice}</span>
    </div>
  `;
}

// ---- Goal progress detail (adherence bar + completion vs target chart) -----
export function renderGoalProgressView(data, appState, days) {
  const activeProgram = getProgramById(appState.activeProgramId);
  const wk    = parseInt(appState.currentWeek, 10) || 1;
  const total = activeProgram.totalWeeks || 12;
  const calendarPct = Math.round((wk / total) * 100);

  const goalEl = document.getElementById('analytics-goal-detail');
  if (!goalEl) return;

  const adherence    = computeGoalAdherence(appState, activeProgram, days, wk);
  const remaining    = Math.max(0, total - wk);
  const milestones   = computeDynamicMilestones(total);
  const nextMilestone = milestones.find(m => m.week >= wk) || milestones[milestones.length - 1];

  goalEl.innerHTML = `
    <h2 class="section-header mt-4">Program Goal Progress</h2>
    <article class="card-dark p-4 mb-4">
      <div class="flex-between mb-2">
        <span class="text-sm text-muted">Adherence (work done so far)</span>
        <span class="font-heavy text-inverse" style="font-size:1.1rem;">${adherence.pct}%</span>
      </div>
      <div style="height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;margin-bottom:6px;">
        <div style="height:100%;width:${adherence.pct}%;background:linear-gradient(90deg,var(--color-green,#10b981),var(--color-blue));border-radius:4px;transition:width 0.5s var(--ease-out);"></div>
      </div>
      <div class="text-muted mb-3" style="font-size:0.65rem;">${adherence.done} of ${adherence.total} scheduled items completed through week ${wk}.</div>
      <div class="flex-between mb-2" style="font-size:0.8rem;">
        <span class="text-muted">Calendar position</span>
        <span class="font-heavy text-inverse">Wk ${wk} / ${total} (${calendarPct}%)</span>
      </div>
      <div class="flex-between mb-2" style="font-size:0.8rem;">
        <span class="text-muted">Weeks remaining</span>
        <span class="font-heavy text-inverse">${remaining}</span>
      </div>
      <div class="flex-between" style="font-size:0.8rem;">
        <span class="text-muted">Next milestone</span>
        <span class="font-heavy text-accent-blue">Wk ${nextMilestone.week} — ${nextMilestone.label}</span>
      </div>
    </article>
    <h2 class="section-header mt-2">Weekly Completion vs Target</h2>
    <article class="card-dark p-3 mb-4">
      <div class="flex gap-3 mb-2 font-bold" style="font-size:0.65rem;">
        <span style="color:#3b82f6;">● Actual completion</span>
        <span style="color:rgba(255,255,255,0.5);">● 100% target</span>
      </div>
      <div id="goalCompletionChartContainer"></div>
    </article>
  `;

  const chartEl = document.getElementById('goalCompletionChartContainer');
  if (chartEl) {
    const series = computeWeeklyCompletionSeries(appState, activeProgram, days, total);
    renderCompletionVsTargetChart(chartEl, series, wk);
  }
}

// ---- Active fuel detail (weekly calories bar chart) -----------------------
export function renderActiveFuelView(data, appState, days) {
  const activeProgram = getProgramById(appState.activeProgramId);
  const maxWeek = activeProgram?.totalWeeks || 12;
  const series  = computeWeeklyCaloriesSeries(appState, days, maxWeek);

  const total  = series.reduce((a, b) => a + b, 0);
  const active = series.filter(v => v > 0);
  const avg    = active.length ? Math.round(total / active.length) : 0;
  const wk     = parseInt(appState.currentWeek, 10) || 1;

  setText('fuelTotalCals',    total.toLocaleString());
  setText('fuelAvgCals',      avg.toLocaleString());
  setText('fuelThisWeekCals', (series[wk - 1] || 0).toLocaleString());

  const chartEl = document.getElementById('fuelChartContainer');
  if (chartEl) {
    renderWeeklyBarChart(chartEl, series.map((_, i) => `W${i + 1}`), series, {
      color: '#f59e0b',
      yFmt: v => Math.round(v).toLocaleString(),
      emptyMsg: 'Log sessions with calories (or import .FIT) to see your fuel trend.',
    });
  }
}
