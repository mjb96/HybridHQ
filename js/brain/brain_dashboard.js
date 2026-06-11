// ==========================================
// COACH'S READ — HOME TILE + DETAIL RENDERER (brain_dashboard.js)
// ------------------------------------------
// Renders two read-only surfaces from the InsightReport:
//   • a compact "Coach's Read" tile in the home In-Focus carousel (overall
//     verdict + top read + category tally), clickable through to…
//   • the full detail view (every insight as a coach card) shown in the
//     analytics 'coach' context.
// Advisory only — no controls mutate state. All athlete text is escaped.
// ==========================================
import { generateInsights, summarizeReport, contextVerdict } from './core.js';
import { escapeHtml } from '../util.js';

export const CATEGORY_META = {
  progress:    { icon: '📈', label: 'Progress',    color: 'var(--accent-green, #10b981)' },
  recovery:    { icon: '🛌', label: 'Recovery',    color: 'var(--accent-blue, #3b82f6)' },
  risk:        { icon: '⚠️', label: 'Risk',        color: 'var(--accent-red, #ef4444)' },
  opportunity: { icon: '💡', label: 'Opportunity', color: 'var(--accent-amber, #f59e0b)' },
  goal:        { icon: '🎯', label: 'Goal',        color: 'var(--accent-blue, #3b82f6)' },
};
const meta = (cat) => CATEGORY_META[cat] || CATEGORY_META.progress;
const CONF_LABEL = { high: 'High confidence', med: 'Moderate confidence', low: 'Low confidence' };
const CHIP_ORDER = ['risk', 'opportunity', 'progress', 'recovery', 'goal'];

function buildReport(appState, days, program) {
  return generateInsights(appState, {
    days, program,
    currentWeek: appState?.currentWeek,
    maxWeek: program?.totalWeeks,
    topN: 20, // tile/detail want the full prioritised set
  });
}

// ---- In-Focus carousel tile -------------------------------------------
export function renderBrainInsights(appState, days, program) {
  const tile = document.getElementById('coachReadTile');
  const body = document.getElementById('coachReadTileBody');
  if (!tile || !body) return;

  let report;
  try { report = buildReport(appState, days, program); }
  catch (e) { console.warn('[coach] insight generation failed:', e); tile.style.display = 'none'; return; }

  const insights = report.allInsights || report.insights;
  if (!insights.length) {
    if (report.meta.dataWeeks < 1) { tile.style.display = 'none'; return; }
    tile.style.display = '';
    body.innerHTML = `<div class="text-muted" style="font-size:0.72rem;line-height:1.3;">Keep logging — your read appears after a few sessions.</div>`;
    return;
  }

  tile.style.display = '';
  const { focus, counts } = summarizeReport(report);
  // Surface a second line from a DIFFERENT domain (so e.g. strength focus still
  // shows a running read), falling back to the next insight.
  const secondary = insights.find(i => i !== focus && i.domain !== focus?.domain) || insights[1] || null;
  body.innerHTML = renderTileBody(focus, secondary, contextVerdict(insights), counts, insights.length);
}

function renderTileBody(focus, secondary, verdict, counts, total) {
  const vm = verdict ? meta(verdict.tone) : meta('progress');
  const chips = CHIP_ORDER.filter(c => counts[c] > 0).map(c => {
    const m = meta(c);
    return `<span style="display:inline-flex;align-items:center;gap:2px;font-size:0.58rem;font-weight:700;color:${m.color};">${m.icon}${counts[c]}</span>`;
  }).join(' ');
  const sm = secondary ? meta(secondary.category) : null;
  return `
    ${verdict ? `<div class="font-heavy mb-1" style="font-size:1.15rem;line-height:1.1;color:${vm.color};">${verdict.label}</div>` : ''}
    <div class="text-inverse mb-1" style="font-size:0.8rem;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(focus ? focus.observation : '')}</div>
    ${secondary ? `<div class="text-muted mb-2 flex gap-1 align-center" style="font-size:0.66rem;line-height:1.25;"><span style="color:${sm.color};">${sm.icon}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(secondary.observation)}</span></div>` : '<div class="mb-2"></div>'}
    <div class="flex-between align-center">
      <div class="flex gap-2" style="flex-wrap:wrap;">${chips}</div>
      <span class="text-muted" style="font-size:0.6rem;white-space:nowrap;">${total} insight${total !== 1 ? 's' : ''} →</span>
    </div>`;
}

// ---- Full detail view (analytics 'coach' context) ---------------------
export function renderCoachDetail(report) {
  const el = document.getElementById('coachDetailBody');
  if (!el) return;
  const insights = report?.allInsights || report?.insights || [];
  if (!insights.length) {
    el.innerHTML = `<p class="text-muted" style="font-size:0.85rem;">Log a few sessions and your coach's read will appear here.</p>`;
    return;
  }
  const verdict = contextVerdict(insights);
  const vm = verdict ? meta(verdict.tone) : meta('progress');
  const header = verdict
    ? `<div class="card-dark p-3 mb-3" style="border-left:3px solid ${vm.color};">
         <span class="text-muted" style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;">Overall read</span>
         <div class="font-heavy" style="font-size:1.15rem;color:${vm.color};">${verdict.label}</div>
       </div>`
    : '';
  el.innerHTML = header + insights.map(renderInsightCard).join('');
}

function renderInsightCard(i) {
  const m = meta(i.category);
  return `
    <article class="card-dark p-3 mb-2" style="border-left:3px solid ${m.color};">
      <div class="flex-between mb-1">
        <span class="font-bold" style="color:${m.color};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">${m.icon} ${m.label}</span>
        <span class="text-muted" style="font-size:0.6rem;">${CONF_LABEL[i.confidence] || ''}</span>
      </div>
      <div class="font-heavy text-inverse mb-1" style="font-size:0.92rem;line-height:1.25;">${escapeHtml(i.observation)}</div>
      <div class="text-muted mb-2" style="font-size:0.72rem;line-height:1.4;">${escapeHtml(i.explanation)}</div>
      <div class="mb-2" style="font-size:0.72rem;line-height:1.4;"><span class="text-muted">Why it matters:</span> ${escapeHtml(i.whyItMatters)}</div>
      <div style="font-size:0.74rem;line-height:1.35;"><span style="color:${m.color};font-weight:700;">Consider:</span> ${escapeHtml(i.suggestedAction)}</div>
      ${i.tradeoffs ? `<div class="mt-1 text-muted" style="font-size:0.7rem;line-height:1.35;"><span style="font-weight:700;">Tradeoff:</span> ${escapeHtml(i.tradeoffs)}</div>` : ''}
    </article>`;
}
