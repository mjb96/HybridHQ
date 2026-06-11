// ==========================================
// HYBRID BRAIN — DASHBOARD RENDERER (brain_dashboard.js)
// ------------------------------------------
// The only DOM-bound Brain module. Renders the prioritised InsightReport into
// the home "Hybrid Brain" section as read-only coach cards. It advises; it has
// no controls that mutate programs or state. All athlete-derived text is
// escaped before insertion.
// ==========================================
import { generateInsights } from './core.js';
import { escapeHtml } from '../util.js';

const CATEGORY_META = {
  progress:    { icon: '📈', label: 'Progress',    color: 'var(--accent-green, #10b981)' },
  recovery:    { icon: '🛌', label: 'Recovery',    color: 'var(--accent-blue, #3b82f6)' },
  risk:        { icon: '⚠️', label: 'Risk',        color: 'var(--accent-red, #ef4444)' },
  opportunity: { icon: '💡', label: 'Opportunity', color: 'var(--accent-amber, #f59e0b)' },
  goal:        { icon: '🎯', label: 'Goal',        color: 'var(--accent-blue, #3b82f6)' },
};

const CONF_LABEL = { high: 'High confidence', med: 'Moderate confidence', low: 'Low confidence' };

// Render the Brain insights for the current athlete snapshot.
// appState + days + the resolved active program are injected by renderHome.
export function renderBrainInsights(appState, days, program) {
  const section = document.getElementById('homeInsights');
  const body = document.getElementById('homeInsightsBody');
  if (!section || !body) return;

  let report;
  try {
    report = generateInsights(appState, {
      days,
      program,
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
    // Brand-new account: hide entirely. Once there's data but no trend yet,
    // show a gentle "keep logging" nudge rather than an empty box.
    if (report.meta.dataWeeks < 1) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    body.innerHTML =
      `<div class="brain-insight-empty text-muted" style="font-size:0.8rem;padding:8px 2px;">` +
      `Keep logging — the Brain needs a few sessions before it can spot trends.</div>`;
    return;
  }

  section.style.display = 'block';
  body.innerHTML = report.insights.map(renderCard).join('');
}

function renderCard(i) {
  const m = CATEGORY_META[i.category] || CATEGORY_META.progress;
  return `
    <article class="brain-insight-card card-dark p-3 mb-2" style="border-left:3px solid ${m.color};">
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
