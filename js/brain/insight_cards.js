// ==========================================
// BRAIN INSIGHT PRESENTATION (insight_cards.js)
// ------------------------------------------
// Single source for coach-insight presentation primitives: per-category icon /
// label / colour, confidence labels, and the category→meta lookup. Owned here
// (rather than in brain_dashboard.js) so the full coach detail
// (brain_dashboard.js), the analytics context banner (analytics_brain.js) and
// the home telemetry all read one definition instead of redefining `meta` /
// CATEGORY_META per file. Layout markup stays in each renderer — only the
// shared metadata lives here.
// ==========================================
export const CATEGORY_META = {
  progress:    { icon: '📈', label: 'Progress',    color: 'var(--accent-green, #10b981)' },
  recovery:    { icon: '🛌', label: 'Recovery',    color: 'var(--accent-blue, #3b82f6)' },
  risk:        { icon: '⚠️', label: 'Risk',        color: 'var(--accent-red, #ef4444)' },
  opportunity: { icon: '💡', label: 'Opportunity', color: 'var(--accent-amber, #f59e0b)' },
  goal:        { icon: '🎯', label: 'Goal',        color: 'var(--accent-blue, #3b82f6)' },
};

export const CONF_LABEL = { high: 'High confidence', med: 'Moderate confidence', low: 'Low confidence' };

export const insightMeta = (cat) => CATEGORY_META[cat] || CATEGORY_META.progress;
