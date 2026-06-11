// ==========================================
// RECOMMENDATION ENGINE (advisor.js)
// Layer 3: Maps Patterns to Coaching Interventions.
// ==========================================
import { PATTERNS, ACTIONS } from './constants_brain.js';

export function generateRecommendations(patterns) {
  const recommendations = [];

  patterns.forEach(pattern => {
    switch (pattern.type) {
      
      case PATTERNS.SYSTEMIC_OVERREACHING:
        recommendations.push({
          id: `REC_SYS_DELOAD_${Date.now()}`,
          actionType: ACTIONS.REDUCE_VOLUME,
          target: 'GLOBAL',
          magnitude: pattern.severity === 5 ? 0.50 : 0.20, // 50% or 20% global reduction
          reasoningCode: 'CRITICAL_ACWR',
          confidenceScore: 0.95,
          impactScore: pattern.severity === 5 ? 100 : 80,
          sourcePattern: pattern.id
        });
        break;

      case PATTERNS.STAGNATION_STRENGTH:
        // Check if there is concurrent high systemic or local fatigue. 
        // We handle the conflict resolution in the Decision matrix, 
        // but here we generate the specific local recommendation.
        recommendations.push({
          id: `REC_STR_DELOAD_${pattern.lift.replace(/\s+/g, '_')}_${Date.now()}`,
          actionType: ACTIONS.REDUCE_VOLUME,
          target: pattern.lift,
          magnitude: 0.20, // 20% volume drop to clear local fatigue
          reasoningCode: 'LIFT_STAGNATION',
          confidenceScore: 0.85,
          impactScore: 40,
          sourcePattern: pattern.id
        });
        break;

      case PATTERNS.LOCAL_FATIGUE_LEGS:
        recommendations.push({
          id: `REC_LOC_DELOAD_LEGS_${Date.now()}`,
          actionType: ACTIONS.REDUCE_VOLUME,
          target: 'CATEGORY_LEGS',
          magnitude: pattern.severity === 4 ? 0.30 : 0.15,
          reasoningCode: 'LOCAL_LEGS_OVERLOAD',
          confidenceScore: 0.90,
          impactScore: 60,
          sourcePattern: pattern.id
        });
        break;

      case PATTERNS.AEROBIC_FATIGUE:
        recommendations.push({
          id: `REC_AERO_EASY_${Date.now()}`,
          actionType: ACTIONS.CONVERT_TO_EASY_RUN,
          target: 'NEXT_INTERVAL_RUN',
          magnitude: null,
          reasoningCode: 'AEROBIC_INTENSITY_CAP',
          confidenceScore: 0.90,
          impactScore: 60,
          sourcePattern: pattern.id
        });
        break;
        
      case PATTERNS.MOMENTUM_STRENGTH:
        recommendations.push({
          id: `REC_STR_MAINTAIN_${pattern.lift.replace(/\s+/g, '_')}_${Date.now()}`,
          actionType: ACTIONS.MAINTAIN,
          target: pattern.lift,
          magnitude: 0,
          reasoningCode: 'POSITIVE_MOMENTUM',
          confidenceScore: 0.95,
          impactScore: 50,
          sourcePattern: pattern.id
        });
        break;
    }
  });

  return recommendations;
}
