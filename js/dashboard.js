// ==========================================
// DASHBOARD TILE REGISTRY (dashboard.js)
// Now augmented by the Hybrid Brain intelligence layer.
// ==========================================

import { computeBig3Maxes, computeBig3Progression, computeStreakView, computeRecoveryScore,
         computeReadiness, computeWeeklyLoadSeries, computeGoalAdherence } from './engine.js';

export const DashboardTileType = Object.freeze({
  METRIC:    'metric',   
  RING:      'ring',      
  SPLIT_3:   'split_3',  
  RATIO_BAR: 'ratio_bar', 
  PROGRESS:  'progress',  
});

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(timeStr) || 0;
}

export const TILE_REGISTRY = [

  // ---- TODAY --------------------------------------------------
  {
    id:        'today',
    type:      DashboardTileType.METRIC,
    icon:      '📅',
    label:     'Today',
    accentVar: '--color-blue',
    navTarget: 'custom:today-summary',
    order:     0,
    renderData(appState, defaultDays, activeProgram, selectedDay, brainPayload) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { hero: 'Rest', sub: 'No session planned.', state: 'empty' };

        const prog = activeProgram;
        const bp   = prog?.days?.[selectedDay] || {};

        const todayLifts = weekData.lifts?.[selectedDay] || {};
        const todayRun   = weekData.runs?.[selectedDay]  || {};
        let completedSets = 0;
        for (const lift in todayLifts) {
          if (Array.isArray(todayLifts[lift])) {
            completedSets += todayLifts[lift].filter(s => s && !s.isWarmup && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)).length;
          }
        }
        const runDist = parseFloat(todayRun.dist) || 0;
        const isLogged = completedSets > 0 || runDist > 0;

        if (isLogged) {
          return {
            hero:     '✓ Done',
            sub:      `${completedSets} sets${runDist > 0 ? ' · ' + runDist + ' km' : ''}`,
            tag:      'Completed',
            tagColor: 'var(--color-green)',
            state:    'loaded',
          };
        }

        return {
          hero:     bp.title || 'Rest Day',
          sub:      (bp.desc || 'No session planned.').substring(0, 40),
          tag:      bp.badge || 'Rest',
          tagColor: bp.color || 'var(--color-blue)',
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- READINESS ----------------------------------------------
  {
    id:        'readiness',
    type:      DashboardTileType.RING,
    icon:      '❤️',
    label:     'Readiness',
    accentVar: '--color-green',
    navTarget: 'recovery',
    order:     1,
    renderData(appState, defaultDays, activeProgram, selectedDay, brainPayload) {
      try {
        if (brainPayload && brainPayload.readiness) {
          let ringColor = 'var(--color-green)';
          if (brainPayload.readiness.score <= 40) ringColor = 'var(--color-red)';
          else if (brainPayload.readiness.score < 75) ringColor = 'var(--color-amber)';
          
          return { 
            hero: `${brainPayload.readiness.score}`, 
            sub: `${brainPayload.readiness.label} Readiness`, 
            ringPct: brainPayload.readiness.score, 
            ringColor, 
            state: 'loaded' 
          };
        }
        return { hero: '--', sub: 'Log sessions for insights', ringPct: 0, ringColor: 'var(--color-blue)', state: 'empty' };
      } catch {
        return { hero: '--', sub: 'Unavailable', ringPct: 0, ringColor: 'var(--color-blue)', state: 'error' };
      }
    },
  },

  // ---- CONSISTENCY -------------------------------------------
  {
    id:        'consistency',
    type:      DashboardTileType.PROGRESS,
    icon:      '🎯',
    label:     'Consistency',
    accentVar: '--color-blue',
    navTarget: 'progress',
    order:     2,
    renderData(appState, defaultDays, activeProgram, selectedDay, brainPayload) {
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
                if (!s.isWarmup) {
                  total++;
                  if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) done++;
                }
              });
            }
          }
        });

        // Brain context overlay
        let subText = 'Weekly tasks ticked';
        let tagColor = 'var(--text-muted)';
        if (brainPayload?.primaryFocus?.theme === 'Consistency Focus') {
          subText = 'Current Primary Focus';
          tagColor = 'var(--color-blue)';
        }

        return { done, total, sub: subText, tagColor, state: done > 0 ? 'loaded' : 'empty' };
      } catch {
        return { done: 0, total: 0, sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- BODY WEIGHT -------------------------------------------
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
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- TOP LIFTS (1RM) ---------------------------------------
  {
    id:        'top-lifts',
    type:      DashboardTileType.SPLIT_3,
    icon:      '💪',
    label:     'Top Lifts (1RM)',
    accentVar: '--color-blue',
    navTarget: 'strength_pr',
    order:     4,
    renderData(appState, defaultDays, activeProgram, selectedDay, brainPayload) {
      try {
        const p = computeBig3Progression(appState);
        const fmt = (cat) => {
          const { current, allTime } = p[cat];
          if (current > 0) return current >= allTime ? `${Math.round(current)} kg ★` : `${Math.round(current)} kg`;
          if (allTime > 0) return `${Math.round(allTime)} (PR)`;
          return '-- kg';
        };
        const anyData = p.squat.allTime > 0 || p.bench.allTime > 0 || p.deadlift.allTime > 0;
        
        // Brain augmentation
        let contextTag = null;
        let contextColor = 'var(--color-blue)';
        if (brainPayload) {
          const opp = brainPayload.opportunities.find(o => o.domain === 'STRENGTH');
          if (opp) {
            contextTag = opp.text;
            contextColor = 'var(--color-green)';
          }
        }

        return {
          rows: [
            { label: 'SQ', value: fmt('squat') },
            { label: 'BP', value: fmt('bench') },
            { label: 'DL', value: fmt('deadlift') },
          ],
          tag: contextTag,
          tagColor: contextColor,
          state: anyData ? 'loaded' : 'empty',
        };
      } catch {
        return { rows: [{ label: 'SQ', value: '--' }, { label: 'BP', value: '--' }, { label: 'DL', value: '--' }], state: 'error' };
      }
    },
  },

  // ---- ACTIVE FUEL -------------------------------------------
  {
    id:        'active-fuel',
    type:      DashboardTileType.METRIC,
    icon:      '🔥',
    label:     'Active Fuel',
    accentVar: '--color-amber',
    navTarget: 'active-fuel',
    order:     5,
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        let cals = 0;
        if (weekData) {
          defaultDays.forEach(d => {
            cals += parseInt(weekData.runs?.[d]?.cals, 10) || 0;
            cals += parseInt(weekData.gymStats?.[d]?.cals, 10) || 0;
          });
        }
        return { hero: cals.toLocaleString(), sub: 'kcal burned this week', state: cals > 0 ? 'loaded' : 'empty' };
      } catch {
        return { hero: '0', sub: 'kcal burned this week', state: 'error' };
      }
    },
  },

  // ---- AVG PACE ----------------------------------------------
  {
    id:        'avg-pace',
    type:      DashboardTileType.METRIC,
    icon:      '⏱️',
    label:     'Avg Pace',
    accentVar: '--color-pink',
    navTarget: 'running',
    order:     6,
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        let totalDist = 0, totalMins = 0;
        if (weekData) {
          defaultDays.forEach(d => {
            const r = weekData.runs?.[d];
            if (!r) return;
            const dist = parseFloat(r.dist) || 0;
            const mins = parseTimeToMinutes(r.time);
            if (dist > 0 && mins > 0) { totalDist += dist; totalMins += mins; }
          });
        }
        if (totalDist > 0 && totalMins > 0) {
          const paceMin = totalMins / totalDist;
          const pm = Math.floor(paceMin);
          const ps = Math.round((paceMin - pm) * 60).toString().padStart(2, '0');
          return { hero: `${pm}:${ps}`, sub: 'min/km this week', state: 'loaded' };
        }
        return { hero: '--:--', sub: 'min/km this week', state: 'empty' };
      } catch {
        return { hero: '--:--', sub: 'min/km this week', state: 'error' };
      }
    },
  },

  // ---- STRESS BALANCE ----------------------------------------
  {
    id:        'stress-balance',
    type:      DashboardTileType.RATIO_BAR,
    icon:      '⚖️',
    label:     'Stress Balance',
    accentVar: '--color-amber',
    navTarget: 'stress-balance',
    order:     7,
    renderData(appState, defaultDays, activeProgram, selectedDay, brainPayload) {
      try {
        if (brainPayload && brainPayload.fatigue) {
          // Brain-augmented stress balance relies on precise fatigue models
          const liftF = Math.max(brainPayload.fatigue.push, brainPayload.fatigue.pull, brainPayload.fatigue.legs);
          const runF = brainPayload.fatigue.aerobic;
          
          if (liftF === 0 && runF === 0) return { label: 'No data', advice: 'Log workouts to see your bias', liftPct: 50, runPct: 50, state: 'empty' };
          
          const total = liftF + runF;
          const liftPct = Math.round((liftF / total) * 100);
          const runPct = 100 - liftPct;
          
          let advice = '🏆 Balanced Load';
          if (liftPct >= 70) advice = '⚠️ Heavy lifting bias.';
          else if (runPct >= 70) advice = '⚠️ High running stress.';
          
          return { label: `${liftPct}% / ${runPct}%`, advice, liftPct, runPct, state: 'loaded' };
        }
        
        return { label: '0% / 0%', advice: 'No data', liftPct: 50, runPct: 50, state: 'empty' };
      } catch {
        return { label: '0% / 0%', advice: 'Unavailable', liftPct: 50, runPct: 50, state: 'error' };
      }
    },
  },

  // ---- FATIGUE SCORE (formerly Recovery Score) ----------------
  {
    id:        'recovery-score',
    type:      DashboardTileType.METRIC,
    icon:      '🛌',
    label:     'Systemic Fatigue',
    accentVar: '--color-green',
    navTarget: 'recovery-score',
    order:     8,
    renderData(appState, defaultDays, activeProgram, selectedDay, brainPayload) {
      try {
        if (brainPayload && brainPayload.fatigue) {
          const sys = brainPayload.fatigue.systemic;
          let tagColor = 'var(--color-green)';
          let tagText = 'Recovered';
          
          if (sys >= 75) { tagColor = 'var(--color-red)'; tagText = 'High Fatigue'; }
          else if (sys >= 50) { tagColor = 'var(--color-amber)'; tagText = 'Accumulating'; }
          
          return {
            hero:  `${sys}%`,
            sub:   `Systemic load metrics`,
            tag:   tagText,
            tagColor,
            state: 'loaded',
          };
        }
        return { hero: '--', sub: 'Log sessions for insights', tag: 'N/A', tagColor: 'var(--text-secondary)', state: 'empty' };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- WEEKLY VOLUME -----------------------------------
  {
    id:        'weekly-volume',
    type:      DashboardTileType.METRIC,
    icon:      '📦',
    label:     'Weekly Volume',
    accentVar: '--color-blue',
    navTarget: 'weekly-volume',
    order:     9,
    renderData(appState, defaultDays, activeProgram, selectedDay, brainPayload) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { hero: '0 kg', sub: '0 sets · 0 reps', state: 'empty' };

        let totalVol = 0, totalSets = 0, totalReps = 0;
        defaultDays.forEach(d => {
          const dayLifts = weekData.lifts?.[d] || {};
          for (const lift in dayLifts) {
            if (Array.isArray(dayLifts[lift])) {
              dayLifts[lift].forEach(s => {
                if (s && !s.isWarmup && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) {
                  const w = parseFloat(s.w) || 0;
                  const r = parseInt(s.r, 10) || 0;
                  totalVol  += w * r;
                  totalSets += 1;
                  totalReps += r;
                }
              });
            }
          }
        });

        const heroStr = totalVol >= 1000
          ? `${(totalVol / 1000).toFixed(1)}t`
          : `${Math.round(totalVol)} kg`;
          
        let subStr = `${totalSets} sets · ${totalReps} reps`;
        if (brainPayload && brainPayload.fatigue) {
          const maxLocal = Math.max(brainPayload.fatigue.push, brainPayload.fatigue.pull, brainPayload.fatigue.legs);
          if (maxLocal >= 80) subStr = '⚠️ Warning: Localized volume very high';
        }

        return {
          hero:  heroStr,
          sub:   subStr,
          state: totalVol > 0 ? 'loaded' : 'empty',
        };
      } catch {
        return { hero: '0 kg', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- TRAINING STREAK ---------------------------------
  {
    id:        'streak',
    type:      DashboardTileType.METRIC,
    icon:      '🔥',
    label:     'Training Streak',
    accentVar: '--color-amber',
    navTarget: 'streak',
    order:     10,
    renderData(appState) {
      try {
        const sv = computeStreakView(appState.streakData);
        if (!sv.hasData) {
          return { hero: '0d', sub: 'Longest: 0 days', tag: 'Start today', tagColor: 'var(--color-blue)', state: 'empty' };
        }
        return {
          hero:  `${sv.current}d`,
          sub:   `Longest: ${sv.longest} day${sv.longest !== 1 ? 's' : ''}`,
          tag:   sv.current > 0 ? `🔥 ${sv.current}` : (sv.broken ? 'Streak reset' : 'Start today'),
          tagColor: sv.current >= 7 ? 'var(--color-amber)' : 'var(--color-blue)',
          state: 'loaded',
        };
      } catch {
        return { hero: '0d', sub: 'Longest: 0 days', state: 'error' };
      }
    },
  },

  // ---- GOAL PROGRESS -----------------------------------
  {
    id:        'goal-progress',
    type:      DashboardTileType.METRIC,
    icon:      '🏁',
    label:     'Goal Progress',
    accentVar: '--color-blue',
    navTarget: 'goal-progress',
    order:     11,
    renderData(appState, defaultDays, activeProgram) {
      try {
        const wk    = parseInt(appState.currentWeek, 10) || 1;
        const total = activeProgram?.totalWeeks || 12;
        const a = computeGoalAdherence(appState, activeProgram, defaultDays, wk);
        return {
          hero:  `${a.pct}%`,
          sub:   `Wk ${wk}/${total} · ${a.done}/${a.total} done`,
          tag:   `${a.pct}% adherence`,
          tagColor: a.pct >= 80 ? 'var(--color-green)' : a.pct >= 50 ? 'var(--color-amber)' : 'var(--color-red)',
          state: a.total > 0 ? 'loaded' : 'empty',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },
];

export function resolveTileNavigation(navTarget) {
  if (!navTarget) return null;
  return () => document.dispatchEvent(
    new CustomEvent('app:navigate', { detail: { target: navTarget } })
  );
}
