// ==========================================
// PATTERN DETECTION ENGINE (patterns.js)
// Layer 2: Boolean logic gates evaluating Observations.
// ==========================================
import { DOMAINS, PATTERNS, THRESHOLDS } from './constants_brain.js';

export function detectPatterns(observations) {
  const patterns = [];

  const strengthObs = observations.filter(o => o.domain === DOMAINS.STRENGTH && o.metric === 'E1RM_VARIANCE');
  strengthObs.forEach(obs => {
    if (obs.value <= THRESHOLDS.E1RM_VARIANCE_TOLERANCE && obs.value >= -THRESHOLDS.E1RM_VARIANCE_TOLERANCE) {
      patterns.push({
        id: `PAT_${PATTERNS.STAGNATION_STRENGTH}_${obs.lift.toUpperCase()}`,
        type: PATTERNS.STAGNATION_STRENGTH,
        domain: DOMAINS.STRENGTH,
        severity: 3,
        lift: obs.lift,
        supportingObservations: [obs.id]
      });
    } else if (obs.value > THRESHOLDS.E1RM_VARIANCE_TOLERANCE * 2) {
      patterns.push({
        id: `PAT_${PATTERNS.MOMENTUM_STRENGTH}_${obs.lift.toUpperCase()}`,
        type: PATTERNS.MOMENTUM_STRENGTH,
        domain: DOMAINS.STRENGTH,
        severity: 1, // Opportunity
        lift: obs.lift,
        supportingObservations: [obs.id]
      });
    }
  });

  const sysObs = observations.find(o => o.domain === DOMAINS.SYSTEMIC && o.metric === 'SCORE');
  if (sysObs && sysObs.value >= 75) {
    patterns.push({
      id: `PAT_${PATTERNS.SYSTEMIC_OVERREACHING}`,
      type: PATTERNS.SYSTEMIC_OVERREACHING,
      domain: DOMAINS.SYSTEMIC,
      severity: sysObs.value >= 90 ? 5 : 4,
      supportingObservations: [sysObs.id]
    });
  }

  const aeroObs = observations.find(o => o.domain === DOMAINS.AEROBIC && o.metric === 'SCORE');
  if (aeroObs && aeroObs.value >= 75) {
    patterns.push({
      id: `PAT_${PATTERNS.AEROBIC_FATIGUE}`,
      type: PATTERNS.AEROBIC_FATIGUE,
      domain: DOMAINS.AEROBIC,
      severity: aeroObs.value >= 90 ? 5 : 4,
      supportingObservations: [aeroObs.id]
    });
  }

  const legsObs = observations.find(o => o.domain === DOMAINS.LOCAL_LEGS && o.metric === 'SCORE');
  if (legsObs && legsObs.value >= 75) {
    patterns.push({
      id: `PAT_${PATTERNS.LOCAL_FATIGUE_LEGS}`,
      type: PATTERNS.LOCAL_FATIGUE_LEGS,
      domain: DOMAINS.LOCAL_LEGS,
      severity: legsObs.value >= 90 ? 4 : 3,
      supportingObservations: [legsObs.id]
    });
  }

  return patterns;
}
