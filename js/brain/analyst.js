// ==========================================
// ANALYST ENGINE (analyst.js)
// Layer 3: Maps patterns to Insights, Risks, Opportunities, and Recommendations.
// ==========================================
import { PATTERNS, ITEM_TYPES } from './constants_brain.js';

export function generateAnalystItems(patterns) {
  const items = [];

  patterns.forEach(pattern => {
    switch (pattern.type) {
      
      case PATTERNS.SYSTEMIC_OVERREACHING:
        items.push({
          id: `RISK_SYS_${Date.now()}`,
          type: ITEM_TYPES.RISK,
          domain: pattern.domain,
          severity: pattern.severity,
          text: 'Acute load spike detected. Systemic fatigue is extremely high.'
        });
        items.push({
          id: `REC_SYS_${Date.now()}`,
          type: ITEM_TYPES.RECOMMENDATION,
          domain: pattern.domain,
          severity: pattern.severity,
          text: 'Consider prioritising recovery before attempting another hard session.'
        });
        break;

      case PATTERNS.AEROBIC_FATIGUE:
        items.push({
          id: `RISK_AERO_${Date.now()}`,
          type: ITEM_TYPES.RISK,
          domain: pattern.domain,
          severity: pattern.severity,
          text: 'High anaerobic load accumulation.'
        });
        items.push({
          id: `REC_AERO_${Date.now()}`,
          type: ITEM_TYPES.RECOMMENDATION,
          domain: pattern.domain,
          severity: pattern.severity,
          text: 'Consider converting your next run to a strictly easy Zone 2 session.'
        });
        break;

      case PATTERNS.LOCAL_FATIGUE_LEGS:
        items.push({
          id: `RISK_LEGS_${Date.now()}`,
          type: ITEM_TYPES.RISK,
          domain: pattern.domain,
          severity: pattern.severity,
          text: 'Elevated lower body fatigue detected.'
        });
        items.push({
          id: `REC_LEGS_${Date.now()}`,
          type: ITEM_TYPES.RECOMMENDATION,
          domain: pattern.domain,
          severity: pattern.severity,
          text: 'Consider reducing lower-body stress this week to allow for localized recovery.'
        });
        break;

      case PATTERNS.STAGNATION_STRENGTH:
        items.push({
          id: `INS_STAG_${pattern.lift}_${Date.now()}`,
          type: ITEM_TYPES.INSIGHT,
          domain: pattern.domain,
          severity: pattern.severity,
          text: `${pattern.lift} e1RM unchanged for 3 weeks.`
        });
        break;

      case PATTERNS.MOMENTUM_STRENGTH:
        items.push({
          id: `OPP_MOMENTUM_${pattern.lift}_${Date.now()}`,
          type: ITEM_TYPES.OPPORTUNITY,
          domain: pattern.domain,
          severity: pattern.severity,
          text: `${pattern.lift} is progressing strongly.`
        });
        break;
    }
  });

  return items;
}
