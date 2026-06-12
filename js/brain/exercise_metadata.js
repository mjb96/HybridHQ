// ==========================================
// EXERCISE METADATA LAYER (exercise_metadata.js)
// ------------------------------------------
// Turns string exercise names into a rich biomechanical + systemic schema so
// the Brain can reason about fatigue, CNS demand, stimulus and carryover rather
// than just counting sets. Keyed on the SAME canonical names the engine uses.
//
// ExerciseMetadata = {
//   name, pattern,                       // movement pattern
//   primary[], secondary[],              // muscles
//   fatigueCost,  // 1-5 systemic fatigue per hard set
//   cnsDemand,    // 1-5 neural demand
//   hypertrophyStimulus, // 1-5 growth stimulus
//   carryover: { squat?, bench?, deadlift? } // 0-1 strength transfer
// }
//
// Pure module. Safe under `node --test`.
// ==========================================
import { canonicalizeExercise, exerciseCategory } from '../schema.js';

const PATTERN = Object.freeze({
  HINGE: 'hinge', SQUAT: 'squat', LUNGE: 'lunge',
  H_PUSH: 'horizontal_push', V_PUSH: 'vertical_push',
  H_PULL: 'horizontal_pull', V_PULL: 'vertical_pull',
  ISOLATION: 'isolation', CORE: 'core',
});

// Curated metadata for the main movements; everything else falls back to a
// category default (below). Values are coaching estimates, not lab data.
export const EXERCISE_METADATA = Object.freeze({
  'Back Squat':            { pattern: PATTERN.SQUAT,  primary: ['quads', 'glutes'], secondary: ['erectors', 'adductors'], fatigueCost: 5, cnsDemand: 5, hypertrophyStimulus: 4, carryover: { squat: 1.0, deadlift: 0.4 } },
  'Front Squat':           { pattern: PATTERN.SQUAT,  primary: ['quads'], secondary: ['glutes', 'upper_back'], fatigueCost: 4, cnsDemand: 4, hypertrophyStimulus: 4, carryover: { squat: 0.7 } },
  'Deadlift':              { pattern: PATTERN.HINGE,  primary: ['hamstrings', 'glutes', 'erectors'], secondary: ['lats', 'traps', 'forearms'], fatigueCost: 5, cnsDemand: 5, hypertrophyStimulus: 3, carryover: { deadlift: 1.0, squat: 0.4 } },
  'Romanian Deadlift':     { pattern: PATTERN.HINGE,  primary: ['hamstrings', 'glutes'], secondary: ['erectors'], fatigueCost: 4, cnsDemand: 3, hypertrophyStimulus: 4, carryover: { deadlift: 0.6 } },
  'Deficit Deadlift':      { pattern: PATTERN.HINGE,  primary: ['hamstrings', 'glutes', 'erectors'], secondary: ['quads', 'lats'], fatigueCost: 5, cnsDemand: 5, hypertrophyStimulus: 3, carryover: { deadlift: 0.8 } },
  'Bulgarian Split Squat': { pattern: PATTERN.LUNGE,  primary: ['quads', 'glutes'], secondary: ['adductors'], fatigueCost: 3, cnsDemand: 2, hypertrophyStimulus: 4, carryover: { squat: 0.4 } },
  'Leg Press':             { pattern: PATTERN.SQUAT,  primary: ['quads', 'glutes'], secondary: [], fatigueCost: 3, cnsDemand: 2, hypertrophyStimulus: 4, carryover: { squat: 0.3 } },
  'Bench Press':           { pattern: PATTERN.H_PUSH, primary: ['chest', 'front_delts'], secondary: ['triceps'], fatigueCost: 4, cnsDemand: 4, hypertrophyStimulus: 4, carryover: { bench: 1.0 } },
  'Incline Bench Press':   { pattern: PATTERN.H_PUSH, primary: ['upper_chest', 'front_delts'], secondary: ['triceps'], fatigueCost: 3, cnsDemand: 3, hypertrophyStimulus: 4, carryover: { bench: 0.7 } },
  'Incline Barbell Press': { pattern: PATTERN.H_PUSH, primary: ['upper_chest', 'front_delts'], secondary: ['triceps'], fatigueCost: 3, cnsDemand: 3, hypertrophyStimulus: 4, carryover: { bench: 0.7 } },
  'Incline DB Press':      { pattern: PATTERN.H_PUSH, primary: ['upper_chest', 'front_delts'], secondary: ['triceps'], fatigueCost: 2, cnsDemand: 2, hypertrophyStimulus: 4, carryover: { bench: 0.5 } },
  'Standing Barbell OHP':  { pattern: PATTERN.V_PUSH, primary: ['front_delts'], secondary: ['triceps', 'upper_chest', 'core'], fatigueCost: 4, cnsDemand: 4, hypertrophyStimulus: 3, carryover: { bench: 0.5 } },
  'Standing OHP':          { pattern: PATTERN.V_PUSH, primary: ['front_delts'], secondary: ['triceps', 'core'], fatigueCost: 4, cnsDemand: 4, hypertrophyStimulus: 3, carryover: { bench: 0.5 } },
  'Dips':                  { pattern: PATTERN.V_PUSH, primary: ['chest', 'triceps'], secondary: ['front_delts'], fatigueCost: 3, cnsDemand: 2, hypertrophyStimulus: 4, carryover: { bench: 0.4 } },
  'Barbell Bent-Over Row': { pattern: PATTERN.H_PULL, primary: ['lats', 'upper_back'], secondary: ['biceps', 'erectors'], fatigueCost: 4, cnsDemand: 3, hypertrophyStimulus: 4, carryover: { deadlift: 0.3 } },
  'Barbell Row':           { pattern: PATTERN.H_PULL, primary: ['lats', 'upper_back'], secondary: ['biceps', 'erectors'], fatigueCost: 4, cnsDemand: 3, hypertrophyStimulus: 4, carryover: { deadlift: 0.3 } },
  'Pull-Ups':              { pattern: PATTERN.V_PULL, primary: ['lats'], secondary: ['biceps', 'upper_back'], fatigueCost: 3, cnsDemand: 2, hypertrophyStimulus: 4, carryover: {} },
  'Chin-Ups':              { pattern: PATTERN.V_PULL, primary: ['lats', 'biceps'], secondary: ['upper_back'], fatigueCost: 3, cnsDemand: 2, hypertrophyStimulus: 4, carryover: {} },
  'Lat Pulldown':          { pattern: PATTERN.V_PULL, primary: ['lats'], secondary: ['biceps'], fatigueCost: 2, cnsDemand: 1, hypertrophyStimulus: 3, carryover: {} },
  'Lateral Raise':         { pattern: PATTERN.ISOLATION, primary: ['side_delts'], secondary: [], fatigueCost: 1, cnsDemand: 1, hypertrophyStimulus: 3, carryover: {} },
  'Calf Raises':           { pattern: PATTERN.ISOLATION, primary: ['calves'], secondary: [], fatigueCost: 1, cnsDemand: 1, hypertrophyStimulus: 3, carryover: {} },
  'Bicep Curl':            { pattern: PATTERN.ISOLATION, primary: ['biceps'], secondary: [], fatigueCost: 1, cnsDemand: 1, hypertrophyStimulus: 3, carryover: {} },
});

// Reasonable defaults by library category for un-curated names.
const CATEGORY_DEFAULTS = Object.freeze({
  Legs:        { pattern: PATTERN.SQUAT,     fatigueCost: 4, cnsDemand: 3, hypertrophyStimulus: 3 },
  Push:        { pattern: PATTERN.H_PUSH,    fatigueCost: 2, cnsDemand: 2, hypertrophyStimulus: 3 },
  Pull:        { pattern: PATTERN.H_PULL,    fatigueCost: 3, cnsDemand: 2, hypertrophyStimulus: 3 },
  Accessories: { pattern: PATTERN.CORE,      fatigueCost: 1, cnsDemand: 1, hypertrophyStimulus: 2 },
});
const UNKNOWN_DEFAULT = { pattern: PATTERN.ISOLATION, fatigueCost: 2, cnsDemand: 1, hypertrophyStimulus: 2 };

// Resolve metadata for any exercise name (curated → category default → unknown).
export function getExerciseMetadata(name) {
  const canon = canonicalizeExercise(name);
  if (EXERCISE_METADATA[canon]) return { name: canon, primary: [], secondary: [], carryover: {}, ...EXERCISE_METADATA[canon] };
  const cat = exerciseCategory(canon);
  const def = CATEGORY_DEFAULTS[cat] || UNKNOWN_DEFAULT;
  return { name: canon, primary: [], secondary: [], carryover: {}, ...def };
}

export { PATTERN as MOVEMENT_PATTERNS };
