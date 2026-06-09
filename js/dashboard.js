// ==========================================
// DASHBOARD TILE REGISTRY (dashboard.js)
// ==========================================

// ==========================================
// TILE TYPE ENUM
// ==========================================
export const DashboardTileType = Object.freeze({
  METRIC:    'metric',
  RING:      'ring',
  SPLIT_3:   'split_3',
  RATIO_BAR: 'ratio_bar',
  PROGRESS:  'progress',
});

// ==========================================
// HELPER
// ==========================================
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(timeStr) || 0;
}

// ==========================================
// TILE REGISTRY
// ==========================================
export const TILE_REGISTRY = [
  {
    id:        'today',
    type:      DashboardTileType.METRIC,
    icon:      '📅',
    label:     'Today',
    accentVar: '--color-blue',
    navTarget: 'custom:today-summary',
    order:     0,
    renderData(appState, defaultDays, activeProgram, selectedDay) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { hero: 'Rest', sub: 'No session planned.', state: 'empty' };
        const bp = activeProgram?.days?.[selectedDay] || {};
        const todayLifts = weekData.lifts?.[selectedDay] || {};
        const todayRun   = weekData.runs?.[selectedDay]  || {};
        let completedSets = 0;
        for (const lift in todayLifts) {
          if (Array.isArray(todayLifts[lift])) {
            completedSets += todayLifts[lift].filter(s => s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)).length;
          }
        }
        const runDist = parseFloat(todayRun.dist) || 0;
        const isLogged = completedSets > 0 || runDist > 0;
        if (isLogged) {
          return { hero: '✓ Done', sub: `${completedSets} sets${runDist > 0 ? ' · ' + runDist + ' km' : ''}`, tag: 'Completed', tagColor: 'var(--color-green)', state: 'loaded' };
        }
        return { hero: bp.title || 'Rest Day', sub: (bp.desc || 'No session planned.').substring(0, 40), tag: bp.badge || 'Rest', tagColor: bp.color || 'var(--color-blue)', state: 'loaded' };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },
  {
    id:        'readiness',
    type:      DashboardTileType.RING,
    icon:      '❤️',
    label:     'Readiness',
    accentVar: '--color-green',
    navTarget: 'recovery',
    order:     1,
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { hero: 'Adpt', sub: 'Log workouts for score.', ringPct: 0, ringColor: 'var(--color-blue)', state: 'empty' };
        let totalRpe = 0, rpeCount = 0;
        defaultDays.forEach(d => {
          const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
          const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
          if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
          if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
        });
        if (rpeCount === 0) return { hero: 'Adpt', sub: 'Log workouts for score.', ringPct: 0, ringColor: 'var(--color-blue)', state: 'empty' };
        const avg = totalRpe / rpeCount;
        if (avg < 6)   return { hero: 'High', sub: 'Well rested. Push intensity.', ringPct: 100, ringColor: 'var(--color-green)',  state: 'loaded' };
        if (avg < 8)   return { hero: 'Fair', sub: 'Fatigue building. Sleep well.', ringPct: 65,  ringColor: 'var(--color-amber)',  state: 'loaded' };
        return             { hero: 'Warn', sub: 'High fatigue. Drop volume.',    ringPct: 30,  ringColor: 'var(--color-red)',    state: 'loaded' };
      } catch { return { hero: '--', sub: 'Unavailable', ringPct: 0, ringColor: 'var(--color-blue)', state: 'error' }; }
    },
  },
  {
    id:        'consistency',
    type:      DashboardTileType.PROGRESS,
    icon:      '🎯',
    label:     'Consistency',
    accentVar: '--color-blue',
    navTarget: 'progress',
    order:     2,
    renderData(appState, defaultDays, activeProgram) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { done: 0, total: 0, sub: 'Weekly tasks ticked', state: 'empty' };
        let total = 0, done = 0;
        defaultDays.forEach(dKey => {
          const bp = activeProgram?.days?.[dKey];
          const isRunScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
          if (isRunScheduled) total++;
          const rDist = parseFloat(weekData.runs?.[dKey]?.dist) || 0;
          if (isRunScheduled && rDist > 0) done++;
          const dayLifts = weekData.lifts?.[dKey] || {};
          for (const lift in dayLifts) {
            if (Array.isArray(dayLifts[lift])) {
              dayLifts[lift].forEach(s => {
                total++;
                if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) done++;
              });
            }
          }
        });
        return { done, total, sub: 'Weekly tasks ticked', state: done > 0 ? 'loaded' : 'empty' };
      } catch { return { done: 0, total: 0, sub: 'Unavailable', state: 'error' }; }
    },
  },
  {
    id:        'bodyweight',
    type:      DashboardTileType.METRIC,
    icon:      '⚖️',
    label:     'Body Weight',
    accentVar: '--color-green',
    navTarget: 'bodyweight',
    order:     3,
    renderData(appState) {
      try {
        const bwLog = appState.bodyWeightLog || [];
        if (bwLog.length === 0) return { hero: '-- kg', sub: 'vs 7 days ago', tag: '-- 7d', tagColor: 'var(--text-secondary)', state: 'empty' };
        const sorted = [...bwLog].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = sorted[0];
        const targetDate = new Date(latest.date);
        targetDate.setDate(targetDate.getDate() - 7);
        let old = sorted.find(e => new Date(e.date) <= targetDate);
        if (!old && sorted.length > 1) old = sorted[sorted.length - 1];
        let tag = '-- 7d', tagColor = 'var(--text-secondary)';
        if (old && old.date !== latest.date) {
          const diff = latest.weight - old.weight;
          const sign = diff > 0 ? '+' : '';
          tag      = `${sign}${diff.toFixed(1)} kg 7d`;
          tagColor = diff > 0 ? 'var(--color-red)' : 'var(--color-green)';
        }
        return { hero: `${latest.weight.toFixed(1)} kg`, sub: 'vs 7 days ago', tag, tagColor, state: 'loaded' };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },
  {
    id:        'top-lifts',
    type:      DashboardTileType.SPLIT_3,
    icon:      '💪',
    label:     'Top Lifts (1RM)',
    accentVar: '--color-blue',
    navTarget: 'strength_pr',
    order:     4,
    renderData(appState) {
      try {
        let sq = 0, bp = 0, dl = 0;
        const sqNames = ['back squat', 'squat', 'front squat'];
        const bpNames = ['bench press', 'incline bench press', 'incline barbell press'];
        const dlNames = ['deadlift', 'romanian deadlift', 'deficit deadlift'];
        const check = (name, weight, reps) => {
          const e1rm = weight * (1 + reps / 30);
          const n = name.toLowerCase();
          if (sqNames.some(k => n.includes(k))) { if (e1rm > sq) sq = e1rm; }
          else if (bpNames.some(k => n.includes(k))) { if (e1rm > bp) bp = e1rm; }
          else if (dlNames.some(k => n.includes(k))) { if (e1rm > dl) dl = e1rm; }
        };
        for (const wk in appState.weeks || {}) {
          const lifts = appState.weeks[wk]?.lifts || {};
          for (const day in lifts) {
            for (const lift in lifts[day]) {
              if (Array.isArray(lifts[day][lift])) {
                lifts[day][lift].forEach(s => {
                  if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) {
                    const w = parseFloat(s.w) || 0;
                    const r = parseInt(s.r, 10) || 0;
                    if (w > 0 && r > 0) check(lift, w, r);
                  }
                });
              }
            }
          }
        }
        const fmt = v => v > 0 ? `${Math.round(v)} kg` : '-- kg';
        return { rows: [{ label: 'SQ', value: fmt(sq) }, { label: 'BP', value: fmt(bp) }, { label: 'DL', value: fmt(dl) }], state: (sq > 0 || bp > 0 || dl > 0) ? 'loaded' : 'empty' };
      } catch { return { rows: [{ label: 'SQ', value: '--' }, { label: 'BP', value: '--' }, { label: 'DL', value: '--' }], state: 'error' }; }
    },
  },
  {
    id:        'recovery-score',
    type:      DashboardTileType.METRIC,
    icon:      '🛌',
    label:     'Recovery Score',
    accentVar: '--color-green',
    navTarget: 'recovery-score',
    order:     8,
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { hero: '--', sub: 'No data yet', tag: 'N/A', tagColor: 'var(--text-secondary)', state: 'empty' };
        let totalRpe = 0, rpeCount = 0;
        defaultDays.forEach(d => {
          const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
          const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
          if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
          if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
        });
        if (rpeCount === 0) return { hero: '--', sub: 'Log sessions for score', tag: 'N/A', tagColor: 'var(--text-secondary)', state: 'empty' };
        const avgRpe = totalRpe / rpeCount;
        const score = Math.round(Math.max(0, Math.min(100, ((10 - avgRpe) / 9) * 100)));
        let tag = `${score}%`, tagColor = 'var(--color-green)';
        if (score < 40) tagColor = 'var(--color-red)';
        else if (score < 70) tagColor = 'var(--color-amber)';
        return { hero: `${score}%`, sub: `Avg RPE: ${avgRpe.toFixed(1)}`, tag, tagColor, state: 'loaded' };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },
];

export function resolveTileNavigation(navTarget) {
  if (!navTarget) return null;
  // Use window as a bridge to avoid circular dependencies
  return () => {
    if (navTarget === 'custom:today-summary') window.openTodaySummaryModal?.();
    else window.openAnalyticsView?.(navTarget);
  };
}
