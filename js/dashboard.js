// ==========================================
// DASHBOARD TILE REGISTRY (dashboard.js)
// ==========================================
// Architecture: add a new tile by adding one entry to TILE_REGISTRY.
// Each entry is a DashboardTileConfig object — no other files need touching
// for basic tiles that navigate to an existing analytics context.
//
// DashboardTileConfig shape:
// {
//   id:          string          — unique key, matches HTML element id prefix
//   type:        DashboardTileType
//   icon:        string          — emoji icon
//   label:       string          — uppercase micro-label
//   accentVar:   string          — CSS var name for the icon/accent colour
//   navTarget:   string | null   — analytics context string, or 'custom' for special handlers
//   order:       number          — render order (lower = first)
//   renderData:  (appState, defaultDays) => DashboardTileData
// }
//
// DashboardTileData shape:
// {
//   hero:        string          — large primary value
//   sub?:        string          — optional secondary line
//   tag?:        string          — optional small tag/badge (coloured)
//   tagColor?:   string          — CSS colour string for the tag
//   extraHTML?:  string          — raw HTML injected below hero (for progress bars, etc.)
//   state:       'loaded'|'empty'|'error'
// }

import { computeBig3Maxes, computeBig3Progression, computeStreakView, computeRecoveryScore,
         computeReadiness, computeWeeklyLoadSeries, computeGoalAdherence,
         isCompletedSet, parseDurationToMinutes } from './engine.js';

// ==========================================
// TILE TYPE ENUM
// ==========================================
export const DashboardTileType = Object.freeze({
  METRIC:    'metric',    // Simple hero number + subtitle
  RING:      'ring',      // Progress ring (readiness)
  SPLIT_3:   'split_3',  // 3-row mini-table (top lifts)
  RATIO_BAR: 'ratio_bar', // Dual fill bar (stress balance)
  PROGRESS:  'progress',  // Count / total (consistency)
});

// ==========================================
// HELPER — parse run time string → total minutes
// ==========================================
// Run-time parsing now uses engine.parseDurationToMinutes (single source).

// ==========================================
// TILE REGISTRY
// To add a tile: push a new config object into this array.
// ==========================================
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
    renderData(appState, defaultDays, activeProgram, selectedDay) {
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
            completedSets += todayLifts[lift].filter(s => isCompletedSet(s)).length;
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
    renderData(appState, defaultDays, activeProgram) {
      try {
        const maxWeek = activeProgram?.totalWeeks || 12;
        const load = computeWeeklyLoadSeries(appState, defaultDays, maxWeek);
        const totalByWeek = load.lift.map((v, i) => v + (load.run[i] || 0));
        const r = computeReadiness(totalByWeek, appState.currentWeek);
        if (!r.hasData) {
          return { hero: '--', sub: 'Log RPE + duration', ringPct: 0, ringColor: 'var(--color-blue)', state: 'empty' };
        }
        let ringColor = 'var(--color-green)';
        if (r.score < 50) ringColor = 'var(--color-red)';
        else if (r.score < 75) ringColor = 'var(--color-amber)';
        return { hero: `${r.score}`, sub: `ACWR ${r.acwr.toFixed(2)}`, ringPct: r.score, ringColor, state: 'loaded' };
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
                if (isCompletedSet(s)) done++;
              });
            }
          }
        });

        return { done, total, sub: 'Weekly tasks ticked', state: done > 0 ? 'loaded' : 'empty' };
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
    renderData(appState) {
      try {
        const p = computeBig3Progression(appState);
        // Show current-block best; mark ★ when it's also the all-time PR. If the
        // lift hasn't been trained this block, fall back to the all-time PR.
        const fmt = (cat) => {
          const { current, allTime } = p[cat];
          if (current > 0) return current >= allTime ? `${Math.round(current)} kg ★` : `${Math.round(current)} kg`;
          if (allTime > 0) return `${Math.round(allTime)} (PR)`;
          return '-- kg';
        };
        const anyData = p.squat.allTime > 0 || p.bench.allTime > 0 || p.deadlift.allTime > 0;
        return {
          rows: [
            { label: 'SQ', value: fmt('squat') },
            { label: 'BP', value: fmt('bench') },
            { label: 'DL', value: fmt('deadlift') },
          ],
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
            const mins = parseDurationToMinutes(r.time);
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
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        let gymTSS = 0, runTSS = 0;
        if (weekData) {
          defaultDays.forEach(d => {
            let completedSets = 0;
            const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
            const dayLifts = weekData.lifts?.[d] || {};
            for (const lift in dayLifts) {
              if (Array.isArray(dayLifts[lift])) {
                completedSets += dayLifts[lift].filter(s => isCompletedSet(s)).length;
              }
            }
            gymTSS += completedSets * (gRpe > 0 ? gRpe : 6);

            const rDist = parseFloat(weekData.runs?.[d]?.dist) || 0;
            const rRpe  = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
            runTSS += rDist * (rRpe > 0 ? rRpe : 6) * 3;
          });
        }

        if (gymTSS === 0 && runTSS === 0) {
          return { label: 'No data logged', advice: 'Log workouts to see your bias.', liftPct: 50, runPct: 50, state: 'empty' };
        }
        const total = gymTSS + runTSS;
        const liftPct = Math.round((gymTSS / total) * 100);
        const runPct  = 100 - liftPct;
        let advice = '🏆 Perfect balance.';
        if (liftPct >= 70) advice = '⚠️ Heavy lifting bias.';
        else if (runPct >= 70) advice = '⚠️ High running stress.';
        return { label: `${liftPct}% / ${runPct}%`, advice, liftPct, runPct, state: 'loaded' };
      } catch {
        return { label: '0% / 0%', advice: 'Unavailable', liftPct: 50, runPct: 50, state: 'error' };
      }
    },
  },

  // ---- RECOVERY SCORE (NEW) ----------------------------------
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
        const r = computeRecoveryScore(appState, defaultDays);
        if (!r.hasData) {
          return { hero: '--', sub: 'Log sessions for score', tag: 'N/A', tagColor: 'var(--text-secondary)', state: 'empty' };
        }
        let tagColor = 'var(--color-green)';
        if (r.score < 40) tagColor = 'var(--color-red)';
        else if (r.score < 70) tagColor = 'var(--color-amber)';
        return {
          hero:  `${r.score}%`,
          sub:   `Fatigue ${r.fatigueScore} · Rest ${r.restScore}`,
          tag:   `${r.score}%`,
          tagColor,
          state: 'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- WEEKLY VOLUME (NEW) -----------------------------------
  {
    id:        'weekly-volume',
    type:      DashboardTileType.METRIC,
    icon:      '📦',
    label:     'Weekly Volume',
    accentVar: '--color-blue',
    navTarget: 'weekly-volume',
    order:     9,
    renderData(appState, defaultDays) {
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
                if (isCompletedSet(s)) {
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

        return {
          hero:  heroStr,
          sub:   `${totalSets} sets · ${totalReps} reps`,
          state: totalVol > 0 ? 'loaded' : 'empty',
        };
      } catch {
        return { hero: '0 kg', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- TRAINING STREAK (NEW) ---------------------------------
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

  // ---- STEPS (Health Connect) --------------------------------
  {
    id:        'hc-steps',
    type:      DashboardTileType.METRIC,
    icon:      '👟',
    label:     'Steps',
    accentVar: '--color-green',
    navTarget: null,
    order:     12,
    renderData(appState) {
      try {
        const h = appState.health;
        if (!h || h.steps === 0) {
          return { hero: '--', sub: 'Sync Health Connect', tag: 'No data', tagColor: 'var(--text-secondary)', state: 'empty' };
        }
        const goalSteps = 10000;
        const pct = Math.min(100, Math.round((h.steps / goalSteps) * 100));
        return {
          hero:     h.steps.toLocaleString(),
          sub:      `${pct}% of 10,000 goal`,
          tag:      `${pct}%`,
          tagColor: pct >= 100 ? 'var(--color-green)' : pct >= 60 ? 'var(--color-amber)' : 'var(--color-red)',
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- SLEEP (Health Connect) ---------------------------------
  {
    id:        'hc-sleep',
    type:      DashboardTileType.METRIC,
    icon:      '🌙',
    label:     'Sleep',
    accentVar: '--color-blue',
    navTarget: null,
    order:     13,
    renderData(appState) {
      try {
        const h = appState.health;
        if (!h || h.sleepHours === 0) {
          return { hero: '--h', sub: 'Sync Health Connect', tag: 'No data', tagColor: 'var(--text-secondary)', state: 'empty' };
        }
        let tag = 'Good', tagColor = 'var(--color-green)';
        if (h.sleepHours < 6)       { tag = 'Low';        tagColor = 'var(--color-red)'; }
        else if (h.sleepHours < 7)  { tag = 'Moderate';   tagColor = 'var(--color-amber)'; }
        else if (h.sleepHours >= 9) { tag = 'Excellent';  tagColor = 'var(--color-green)'; }
        const sub = h.sleepScore != null ? `Score ${h.sleepScore}/100` : 'last night';
        return { hero: `${h.sleepHours}h`, sub, tag, tagColor, state: 'loaded' };
      } catch {
        return { hero: '--h', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- RESTING HEART RATE (Health Connect) --------------------
  {
    id:        'hc-rhr',
    type:      DashboardTileType.METRIC,
    icon:      '💗',
    label:     'Resting HR',
    accentVar: '--color-pink',
    navTarget: 'recovery',
    order:     14,
    renderData(appState) {
      try {
        const h = appState.health;
        if (!h || (!h.restingHeartRate && !h.averageHeartRate)) {
          return { hero: '--', sub: 'bpm — sync Health Connect', tag: 'No data', tagColor: 'var(--text-secondary)', state: 'empty' };
        }
        const bpm = h.restingHeartRate || h.averageHeartRate;
        let tag = 'Normal', tagColor = 'var(--color-green)';
        if (bpm > 80)      { tag = 'Elevated'; tagColor = 'var(--color-red)'; }
        else if (bpm > 68) { tag = 'Moderate'; tagColor = 'var(--color-amber)'; }
        const sub = h.restingHeartRate ? 'resting bpm' : 'avg bpm';
        return { hero: `${bpm}`, sub, tag, tagColor, state: 'loaded' };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- GOAL PROGRESS (NEW) -----------------------------------
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
        // Hero = real adherence (work actually done vs scheduled, through now),
        // not raw calendar position. Calendar week is shown as context.
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

// ==========================================
// NAVIGATION RESOLVER
// Emits an 'app:navigate' event carrying the raw navTarget.
// app.js owns the routing (sentinel 'custom:today-summary' → modal,
// any other target → analytics context). No reverse import on app.js.
// ==========================================
export function resolveTileNavigation(navTarget) {
  if (!navTarget) return null;
  return () => document.dispatchEvent(
    new CustomEvent('app:navigate', { detail: { target: navTarget } })
  );
}