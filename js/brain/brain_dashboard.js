// ==========================================
// HYBRID BRAIN — DASHBOARD RENDERER (brain_dashboard.js)
// ------------------------------------------
// The only DOM-bound Brain module. Surfaces the prioritised InsightReport in a
// single, uncluttered home area:
//   • a concise summary header (category tally),
//   • one full "Today's Focus" card (the highest-priority insight),
//   • optional goal-alignment line,
//   • compact risk/opportunity indicators for the rest.
// Read-only and advisory — no controls mutate state. All athlete-derived text
// is escaped before insertion.
// ==========================================
import { generateInsights, summarizeReport } from './core.js';
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

// Order categories show in the header tally (most actionable first).
const CHIP_ORDER = ['risk', 'opportunity', 'progress', 'recovery', 'goal'];

// Render the Brain area for the current athlete snapshot.
export function renderBrainInsights(appState, days, program) {
  const section = document.getElementById('homeInsights');
  const body = document.getElementById('homeInsightsBody');
  if (!section || !body) return;

  let report;
  try {
    report = generateInsights(appState, {
      days, program,
      currentWeek: appState?.currentWeek,
      maxWeek: program?.totalWeeks,
      topN: 4,
    });
  } catch (err) {
    console.warn('[hybrid-brain] insight generation failed:', err);
    section.style.display = 'none';
    return;
  }

  if (!report.insights.length) {
    if (report.meta.dataWeeks < 1) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    body.innerHTML =
      `<div class="brain-insight-empty text-muted" style="font-size:0.8rem;padding:8px 2px;">` +
      `Keep logging — the Brain needs a few sessions before it can spot trends.</div>`;
    return;
  }

  const { focus, goal, rest, counts } = summarizeReport(report);
  section.style.display = 'block';
  body.innerHTML = [
    renderSummaryHeader(counts),
    goal ? renderGoalLine(goal) : '',
    focus ? renderFocusCard(focus) : '',
    rest.length ? renderMore(rest) : '',
  ].join('');
}

// ---- summary header: tiny category tally -------------------------------
function renderSummaryHeader(counts) {
  const chips = CHIP_ORDER
    .filter(cat => counts[cat] > 0)
    .map(cat => {
      const m = meta(cat);
      return `<span class="brain-chip" style="display:inline-flex;align-items:center;gap:3px;font-size:0.62rem;font-weight:700;padding:2px 7px;border-radius:999px;color:${m.color};background:color-mix(in srgb, ${m.color} 14%, transparent);">${m.icon} ${counts[cat]} ${m.label}</span>`;
    }).join('');
  return `<div class="brain-summary flex gap-2 mb-2" style="flex-wrap:wrap;align-items:center;">${chips}</div>`;
}

// ---- goal-alignment line (slot for richer goal summaries later) --------
function renderGoalLine(g) {
  const m = meta('goal');
  return `<div class="brain-goal-line flex gap-2 align-center p-2 mb-2 card-dark" style="border-left:3px solid ${m.color};font-size:0.74rem;">
    <span>${m.icon}</span>
    <span class="text-inverse font-bold">${escapeHtml(g.observation)}</span>
  </div>`;
}

// ---- Today's Focus: the single highest-priority insight, in full -------
function renderFocusCard(i) {
  const m = meta(i.category);
  return `
    <div class="brain-focus-label text-muted mb-1" style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Today's Focus</div>
    <article class="brain-insight-card card-dark p-3 mb-2" style="border-left:3px solid ${m.color};">
      <div class="flex-between mb-1">
        <span class="font-bold" style="color:${m.color};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">${m.icon} ${m.label}</span>
        <span class="text-muted" style="font-size:0.6rem;">${CONF_LABEL[i.confidence] || ''}</span>
      </div>
      <div class="font-heavy text-inverse mb-1" style="font-size:0.95rem;line-height:1.25;">${escapeHtml(i.observation)}</div>
      <div class="text-muted mb-2" style="font-size:0.72rem;line-height:1.4;">${escapeHtml(i.explanation)}</div>
      <div class="mb-2" style="font-size:0.72rem;line-height:1.4;"><span class="text-muted">Why it matters:</span> ${escapeHtml(i.whyItMatters)}</div>
      <div style="font-size:0.74rem;line-height:1.35;"><span style="color:${m.color};font-weight:700;">Consider:</span> ${escapeHtml(i.suggestedAction)}</div>
      ${i.tradeoffs ? `<div class="mt-1 text-muted" style="font-size:0.7rem;line-height:1.35;"><span style="font-weight:700;">Tradeoff:</span> ${escapeHtml(i.tradeoffs)}</div>` : ''}
    </article>`;
}

// ---- compact indicators: the remaining insights as one-liners ----------
function renderMore(rest) {
  const rows = rest.slice(0, 3).map(i => {
    const m = meta(i.category);
    return `<div class="brain-more-row flex gap-2 align-center" style="font-size:0.72rem;padding:5px 2px;border-top:1px solid var(--overlay-sm, rgba(255,255,255,0.06));">
      <span style="color:${m.color};">${m.icon}</span>
      <span class="text-inverse" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(i.observation)}</span>
    </div>`;
  }).join('');
  return `<div class="brain-more mt-1">
    <div class="text-muted mb-1" style="font-size:0.58rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Also worth a look</div>
    ${rows}
  </div>`;
}
