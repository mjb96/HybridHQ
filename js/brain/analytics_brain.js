// ==========================================
// HYBRID BRAIN — ANALYTICS CONTEXT BANNER (analytics_brain.js)
// ------------------------------------------
// Surfaces the Brain inside each analytics detail view: a compact "Brain read"
// banner injected at the top of the active section with the single most
// relevant insight for that context's domain(s). Read-only, escaped, removed
// when there's nothing to say. The report is computed once by the caller.
// ==========================================
import { insightsForContext } from './core.js';
import { CATEGORY_META } from './brain_dashboard.js';
import { escapeHtml } from '../util.js';

const CONTEXT_SECTION = {
  strength:        'analytics-strength',
  strength_pr:     'analytics-strength_pr',
  running:         'analytics-running',
  recovery:        'analytics-recovery',
  'recovery-score':'analytics-recovery-score',
  bodyweight:      'analytics-bodyweight',
  progress:        'analytics-progress',
  'weekly-volume': 'analytics-weekly-volume',
  streak:          'analytics-streak',
  'active-fuel':   'analytics-active-fuel',
  'stress-balance':'analytics-stress-balance',
  'goal-progress': 'analytics-progress',
};

const meta = (cat) => CATEGORY_META[cat] || CATEGORY_META.progress;

// Inject (or refresh / remove) the Brain banner for an analytics context.
export function renderContextBanner(context, report) {
  const c = (context === 'overview' || !CONTEXT_SECTION[context]) ? 'strength' : context;
  const section = document.getElementById(CONTEXT_SECTION[c]);
  if (!section) return;

  let banner = section.querySelector(':scope > .brain-context-banner');
  const insights = insightsForContext(report, c);

  if (!insights.length) { if (banner) banner.remove(); return; }
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'brain-context-banner';
    section.insertBefore(banner, section.firstChild);
  }
  banner.innerHTML = renderBannerInner(insights[0]);
}

function renderBannerInner(i) {
  const m = meta(i.category);
  return `
    <div class="card-dark p-3 mb-3" style="border-left:3px solid ${m.color};">
      <div class="flex-between mb-1">
        <span class="font-bold" style="color:${m.color};font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;">🧠 Brain read · ${m.label}</span>
        <span class="text-muted" style="font-size:0.58rem;">${i.confidence ? i.confidence + ' confidence' : ''}</span>
      </div>
      <div class="font-heavy text-inverse mb-1" style="font-size:0.86rem;line-height:1.25;">${escapeHtml(i.observation)}</div>
      <div class="text-muted" style="font-size:0.7rem;line-height:1.4;">${escapeHtml(i.explanation)}</div>
      <div class="mt-1" style="font-size:0.72rem;line-height:1.35;"><span style="color:${m.color};font-weight:700;">Consider:</span> ${escapeHtml(i.suggestedAction)}</div>
      ${i.tradeoffs ? `<div class="mt-1 text-muted" style="font-size:0.68rem;line-height:1.35;"><span style="font-weight:700;">Tradeoff:</span> ${escapeHtml(i.tradeoffs)}</div>` : ''}
    </div>`;
}
