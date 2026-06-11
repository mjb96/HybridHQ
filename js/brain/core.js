// ==========================================
// HYBRID BRAIN CORE (core.js)
// Orchestrates the 5-layer pipeline.
// ==========================================
import { generateAllObservations } from './observer.js';
import { detectPatterns } from './patterns.js';
import { generateRecommendations } from './advisor.js';
import { resolveDecisions } from './decision_matrix.js';

export function evaluateState(appState, defaultDays) {
  if (!appState || !appState.weeks || !appState.currentWeek) {
    return {
      observations: [],
      patterns: [],
      recommendations: [],
      actions: [],
      status: 'AWAITING_DATA'
    };
  }

  // Layer 1: Observation
  const observations = generateAllObservations(appState, defaultDays);

  // Layer 2: Pattern Detection
  const patterns = detectPatterns(observations);

  // Layer 3: Recommendation
  const recommendations = generateRecommendations(patterns);

  // Layer 4: Decision
  const actions = resolveDecisions(recommendations);

  return {
    observations,
    patterns,
    recommendations,
    actions,
    status: 'SUCCESS'
  };
}
