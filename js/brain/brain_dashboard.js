// ==========================================
// COACH'S READ — DETAIL RENDERER (brain_dashboard.js)
// ------------------------------------------
// Renders the full coach detail view (every insight as a coach card) shown in
// the analytics 'coach' context. Advisory only — no controls mutate state.
// All athlete text is escaped.
// ==========================================
import { contextVerdict } from './core.js';
import { escapeHtml } from '../util.js';
import { CONF_LABEL, insightMeta as meta } from './insight_cards.js';

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
