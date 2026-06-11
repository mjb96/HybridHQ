// ==========================================
// INSIGHT PRIORITIZER (insight_prioritizer.js)
// Layer 4: Ranks data and extracts the "Primary Focus".
// ==========================================
import { ITEM_TYPES, FOCUS_THEMES } from './constants_brain.js';

export function prioritizeAndFocus(items, fatigueProfile) {
  // Sort items into their display buckets
  const insights = items.filter(i => i.type === ITEM_TYPES.INSIGHT);
  const risks = items.filter(i => i.type === ITEM_TYPES.RISK).sort((a, b) => b.severity - a.severity);
  const opportunities = items.filter(i => i.type === ITEM_TYPES.OPPORTUNITY).sort((a, b) => b.severity - a.severity);
  const recommendations = items.filter(i => i.type === ITEM_TYPES.RECOMMENDATION).sort((a, b) => b.severity - a.severity);

  // Baseline Focus
  let primaryFocus = { 
    theme: FOCUS_THEMES.CAPACITY, 
    description: "Recovery markers are strong. You appear capable of handling additional training stress if desired." 
  };

  const topRisk = risks[0];
  const topOpp = opportunities[0];

  // Evaluate Overrides
  if (topRisk && topRisk.severity >= 4) {
    if (topRisk.domain === 'SYSTEMIC') {
      primaryFocus = { 
        theme: FOCUS_THEMES.RECOVERY, 
        description: "Recent training load has increased significantly. Prioritise recovery quality and avoid adding unnecessary intensity." 
      };
    } else if (topRisk.domain === 'LOCAL_LEGS') {
      primaryFocus = { 
        theme: FOCUS_THEMES.BALANCE, 
        description: "Lower body fatigue is highly elevated. Adjust your training balance to prioritize recovery for your legs." 
      };
    } else if (topRisk.domain === 'AEROBIC') {
      primaryFocus = { 
        theme: FOCUS_THEMES.RECOVERY, 
        description: "Anaerobic load is peaking. Drop the pace and prioritize easy aerobic recovery." 
      };
    }
  } else if (topOpp) {
    if (topOpp.domain === 'STRENGTH') {
      primaryFocus = { 
        theme: FOCUS_THEMES.STRENGTH, 
        description: "Strength is progressing well. Continue prioritising your main lifts while momentum is high." 
      };
    }
  } else if (fatigueProfile.systemic < 20 && fatigueProfile.push < 20 && fatigueProfile.legs < 20) {
    // If no risks/opportunities exist and fatigue is generally very low, suggest Consistency
    primaryFocus = { 
      theme: FOCUS_THEMES.CONSISTENCY, 
      description: "Your biggest opportunity right now is training consistency rather than increasing intensity." 
    };
  }

  return {
    primaryFocus,
    insights,
    risks,
    opportunities,
    recommendations
  };
}
