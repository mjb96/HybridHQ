// ==========================================
// DECISION ENGINE (decision_matrix.js)
// Layer 4: Priority queue and conflict resolution.
// ==========================================
import { ACTIONS, PRIORITY_WEIGHTS } from './constants_brain.js';

function assignPriorityWeight(recommendation) {
  if (recommendation.target === 'GLOBAL' && recommendation.actionType === ACTIONS.REDUCE_VOLUME) {
    return PRIORITY_WEIGHTS.INJURY_PREVENTION;
  }
  if (recommendation.actionType === ACTIONS.CONVERT_TO_EASY_RUN) {
    return PRIORITY_WEIGHTS.RECOVERY;
  }
  if (recommendation.target.startsWith('CATEGORY_')) {
    return PRIORITY_WEIGHTS.RECOVERY;
  }
  if (recommendation.actionType === ACTIONS.MAINTAIN) {
    return PRIORITY_WEIGHTS.MAX_STRENGTH;
  }
  return PRIORITY_WEIGHTS.HYPERTROPHY;
}

export function resolveDecisions(recommendations) {
  const actions = [];
  const processedTargets = new Set();

  // Sort recommendations by Priority Weight, then by Impact Score, then by Confidence
  const sortedRecs = [...recommendations].sort((a, b) => {
    const weightA = assignPriorityWeight(a);
    const weightB = assignPriorityWeight(b);
    if (weightA !== weightB) return weightB - weightA;
    if (a.impactScore !== b.impactScore) return b.impactScore - a.impactScore;
    return b.confidenceScore - a.confidenceScore;
  });

  sortedRecs.forEach(rec => {
    // Conflict Resolution: If a higher priority rule already modified GLOBAL or this specific target, 
    // we ignore contradictory lower-priority rules.
    
    if (processedTargets.has('GLOBAL') && rec.target !== 'GLOBAL') {
      // Global reduction supersedes everything else. Do not issue conflicting local instructions.
      return;
    }
    
    if (processedTargets.has(rec.target)) {
      // Target already handled by higher priority recommendation.
      return;
    }

    if (rec.actionType === ACTIONS.MAINTAIN) {
       // Maintain is a passive action. We register it to prevent changes, but don't output a mutation action.
       processedTargets.add(rec.target);
       return;
    }

    // Construct the concrete, traceable action
    actions.push({
      id: `ACT_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      action: rec.actionType,
      target: rec.target,
      value: rec.magnitude,
      auditTrail: [rec.id]
    });

    processedTargets.add(rec.target);
  });

  return actions;
}
