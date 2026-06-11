// ==========================================
// HYBRID BRAIN — ANALYTICS CONTEXT BANNER (analytics_brain.js)
// ------------------------------------------
// Surfaces the Brain inside each analytics detail view: a compact "Brain read"
// banner injected at the top of the active section with the single most
// relevant insight for that context's domain(s). Read-only, escaped, removed
// when there's nothing to say. The report is computed once by the caller.
// ==========================================
import { insightsForContext, contextVerdict } from './core.js';
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
  banner.innerHTML = renderBannerInner(insights.slice(0, 2), contextVerdict(insights));
}

// Primary insight in full + a one-word verdict chip + (optionally) a single
// cross-domain secondary line, so each view reads like an assessment.
function renderBannerInner(list, verdict) {
  const primary = list[0];
  const secondary = list[1];
  const pm = meta(primary.category);
  const vm = verdict ? meta(verdict.tone) : pm;
  return `
    <div class="card-dark p-3 mb-3" style="border-left:3px solid ${pm.color};">
      <div class="flex-between mb-1">
        <span class="font-bold" style="color:${pm.color};font-size:0.62rem;text-transform:uppercase;letter-spacing:0.06em;">Coach's Read</span>
        ${verdict ? `<span class="font-bold" style="font-size:0.58rem;padding:1px 8px;border-radius:999px;color:${vm.color};background:color-mix(in srgb, ${vm.color} 16%, transparent);">${verdict.label}</span>` : ''}
      </div>
      <div class="font-heavy text-inverse mb-1" style="font-size:0.86rem;line-height:1.25;">${escapeHtml(primary.observation)}</div>
      <div class="text-muted" style="font-size:0.7rem;line-height:1.4;">${escapeHtml(primary.explanation)}</div>
      <div class="mt-1" style="font-size:0.72rem;line-height:1.35;"><span style="color:${pm.color};font-weight:700;">Consider:</span> ${escapeHtml(primary.suggestedAction)}</div>
      ${primary.tradeoffs ? `<div class="mt-1 text-muted" style="font-size:0.68rem;line-height:1.35;"><span style="font-weight:700;">Tradeoff:</span> ${escapeHtml(primary.tradeoffs)}</div>` : ''}
      ${secondary ? `<div class="mt-2 flex gap-2 align-center" style="font-size:0.7rem;border-top:1px solid var(--overlay-sm, rgba(255,255,255,0.06));padding-top:6px;"><span style="color:${meta(secondary.category).color};">${meta(secondary.category).icon}</span><span class="text-inverse" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(secondary.observation)}</span></div>` : ''}
    </div>`;
}
