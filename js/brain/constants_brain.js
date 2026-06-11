// ==========================================
// HYBRID BRAIN — CONSTANTS (constants_brain.js)
// Pure enums, thresholds and scoring weights. No logic, no DOM.
// ==========================================

export const DOMAINS = Object.freeze({
  STRENGTH:   'strength',
  AEROBIC:    'aerobic',
  ADHERENCE:  'adherence',
  RECOVERY:   'recovery',
  BODYWEIGHT: 'bodyweight',
  FUEL:       'fuel',
});

export const ENGINES = Object.freeze({
  STRENGTH:  'strength',
  RUNNING:   'running',
  ADHERENCE: 'adherence',
  RECOVERY:  'recovery',
  BODYCOMP:  'bodycomp',
  FUEL:      'fuel',
});

export const FINDING_TYPES = Object.freeze({
  E1RM_TREND:   'e1rm_trend',
  VOLUME_TREND: 'volume_trend',
  PLATEAU:      'plateau',
  PACE_TREND:   'pace_trend',
  LOAD_TREND:   'load_trend',
  LOAD_SPIKE:   'load_spike',
  CONSISTENCY:  'consistency',
  INTERFERENCE: 'interference',
  BODYWEIGHT_TREND: 'bodyweight_trend',
  FUEL_TREND:       'fuel_trend',
  RECOVERY_STATUS:  'recovery_status',
  STRENGTH_HIGHLIGHT: 'strength_highlight',
});

export const DIRECTION = Object.freeze({ UP: 'up', DOWN: 'down', FLAT: 'flat' });

// Athlete-facing insight categories (MVP set).
export const INSIGHT_CATEGORIES = Object.freeze({
  PROGRESS:    'progress',
  RECOVERY:    'recovery',
  RISK:        'risk',
  OPPORTUNITY: 'opportunity',
  GOAL:        'goal',
});

export const CONFIDENCE = Object.freeze({ LOW: 'low', MED: 'med', HIGH: 'high' });

export const THRESHOLDS = Object.freeze({
  TREND_FLAT_PCT:   0.02,  // |Δ| < 2% across the window → flat / plateau
  PLATEAU_WEEKS:    3,     // logged weeks of flatness to call a plateau
  MIN_POINTS_TREND: 3,     // need ≥3 logged points for a confident trend
  MIN_POINTS_LOW:   2,     // ≥2 logged points for a low-confidence trend
  LOAD_SPIKE_JUMP:  0.5,   // ≥50% week-over-week endurance-load jump = spike
});

// Confidence buckets from the number of data points backing a finding.
export const CONFIDENCE_POINTS = Object.freeze({ HIGH: 5, MED: 3 });

// Priority weighting (severity / confidence / goal-relevance / recency).
export const PRIORITY_WEIGHTS = Object.freeze({
  severity: 0.40, confidence: 0.30, goalRelevance: 0.20, recency: 0.10,
});
