// ==========================================
// PATTERN DETECTION ENGINE (patterns.js)
// Layer 2: Boolean logic gates evaluating Observations.
// ==========================================
import { DOMAINS, PATTERNS, THRESHOLDS } from './constants_brain.js';

export function detectPatterns(observations) {
  const patterns = [];

  // 1. Evaluate Strength Stagnation / Momentum
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
        severity: 1,
        lift: obs.lift,
        supportingObservations: [obs.id]
      });
    }
  });

  // 2. Evaluate Systemic Overreaching
  const acwrObs = observations.find(o => o.domain === DOMAINS.SYSTEMIC && o.metric === 'ACWR');
  if (acwrObs && acwrObs.value >= THRESHOLDS.FATIGUE_DANGER_ACWR) {
    patterns.push({
      id: `PAT_${PATTERNS.SYSTEMIC_OVERREACHING}`,
      type: PATTERNS.SYSTEMIC_OVERREACHING,
      domain: DOMAINS.SYSTEMIC,
      severity: acwrObs.value >= THRESHOLDS.FATIGUE_CRITICAL_ACWR ? 5 : 4,
      supportingObservations: [acwrObs.id]
    });
  }

  // 3. Evaluate Local Fatigue
  const pushObs = observations.find(o => o.domain === DOMAINS.LOCAL_PUSH && o.metric === 'VOLUME_SCORE');
  if (pushObs && pushObs.value >= 80) {
    patterns.push({
      id: `PAT_${PATTERNS.LOCAL_FATIGUE_PUSH}`,
      type: PATTERNS.LOCAL_FATIGUE_PUSH,
      domain: DOMAINS.LOCAL_PUSH,
      severity: pushObs.value >= 95 ? 4 : 3,
      supportingObservations: [pushObs.id]
    });
  }

  const pullObs = observations.find(o => o.domain === DOMAINS.LOCAL_PULL && o.metric === 'VOLUME_SCORE');
  if (pullObs && pullObs.value >= 80) {
    patterns.push({
      id: `PAT_${PATTERNS.LOCAL_FATIGUE_PULL}`,
      type: PATTERNS.LOCAL_FATIGUE_PULL,
      domain: DOMAINS.LOCAL_PULL,
      severity: pullObs.value >= 95 ? 4 : 3,
      supportingObservations: [pullObs.id]
    });
  }

  const legsObs = observations.find(o => o.domain === DOMAINS.LOCAL_LEGS && o.metric === 'VOLUME_SCORE');
  if (legsObs && legsObs.value >= 80) {
    patterns.push({
      id: `PAT_${PATTERNS.LOCAL_FATIGUE_LEGS}`,
      type: PATTERNS.LOCAL_FATIGUE_LEGS,
      domain: DOMAINS.LOCAL_LEGS,
      severity: legsObs.value >= 95 ? 4 : 3,
      supportingObservations: [legsObs.id]
    });
  }

  // 4. Evaluate Aerobic Fatigue
  const aeroObs = observations.find(o => o.domain === DOMAINS.AEROBIC && o.metric === 'HIGH_INTENSITY_MINS');
  if (aeroObs && aeroObs.value >= 45) {
    patterns.push({
      id: `PAT_${PATTERNS.AEROBIC_FATIGUE}`,
      type: PATTERNS.AEROBIC_FATIGUE,
      domain: DOMAINS.AEROBIC,
      severity: aeroObs.value >= 60 ? 4 : 3,
      supportingObservations: [aeroObs.id]
    });
  }

  return patterns;
}
