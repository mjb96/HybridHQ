// ==========================================
// HYBRID BRAIN CORE (core.js)
// Orchestrates the 5-layer pipeline and outputs the Intelligence payload.
// ==========================================
import { getUnifiedFatigueProfile } from './fatigue_models.js';
import { generateAllObservations } from './observer.js';
import { detectPatterns } from './patterns.js';
import { generateAnalystItems } from './analyst.js';
import { prioritizeAndFocus } from './insight_prioritizer.js';

export function evaluateState(appState, defaultDays) {
  // Graceful fallback for empty states
  const emptyPayload = {
    readiness: { label: 'Unknown', score: 0 },
    fatigue: { systemic: 0, aerobic: 0, push: 0, pull: 0, legs: 0 },
    primaryFocus: null,
    observations: [],
    insights: [],
    risks: [],
    opportunities: [],
    recommendations: []
  };

  if (!appState || !appState.weeks || !appState.currentWeek) {
    return emptyPayload;
  }

  // 1. Fatigue (Flattened Profile)
  const fatigue = getUnifiedFatigueProfile(appState.weeks, appState.currentWeek, defaultDays);

  // 2. Readiness Calculation
  // Readiness is the inverse of systemic load, pulled down by massive local or aerobic fatigue.
  const highestFatigueSpike = Math.max(fatigue.systemic, fatigue.aerobic, fatigue.legs, fatigue.push, fatigue.pull);
  const readinessScore = Math.max(0, 100 - highestFatigueSpike);
  
  let readinessLabel = 'Moderate';
  if (readinessScore >= 75) readinessLabel = 'High';
  else if (readinessScore <= 40) readinessLabel = 'Low';

  // 3. Observation
  const observations = generateAllObservations(appState, defaultDays, fatigue);

  // 4. Pattern Detection
  const patterns = detectPatterns(observations);

  // 5. Analyst Item Generation
  const rawItems = generateAnalystItems(patterns);

  // 6. Prioritization & Focus Theme Extraction
  const prioritizationResult = prioritizeAndFocus(rawItems, fatigue);

  return {
    readiness: { label: readinessLabel, score: readinessScore },
    fatigue: fatigue,
    primaryFocus: prioritizationResult.primaryFocus,
    observations: observations,
    insights: prioritizationResult.insights,
    risks: prioritizationResult.risks,
    opportunities: prioritizationResult.opportunities,
    recommendations: prioritizationResult.recommendations
  };
}
