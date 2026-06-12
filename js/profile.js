// ==========================================
// ATHLETE PROFILE & ENERGY INTELLIGENCE (profile.js)
// ------------------------------------------
// Lightweight energy-expenditure layer so the Brain can reason about systemic
// workload and recovery demand. NOT a nutrition feature: no food logging, no
// macros, no targets, no energy balance — only "what did the body spend".
//
//   AthleteProfile = { age, sex: 'male'|'female', heightCm, weightKg }
//   stored at appState.athleteProfile
//
// Pure module: no DOM. Safe under `node --test`.
// ==========================================

export const SEX = Object.freeze({ MALE: 'male', FEMALE: 'female' });

export function emptyAthleteProfile() {
  return { age: null, sex: null, heightCm: null, weightKg: null };
}

export function isProfileComplete(p) {
  if (!p) return false;
  return [p.age, p.heightCm, p.weightKg].every(v => parseFloat(v) > 0);
}

// Basal Metabolic Rate via Mifflin–St Jeor (kcal/day). Returns 0 if the profile
// is incomplete. Sex defaults to male's constant when unspecified.
export function mifflinStJeorBMR(profile) {
  const w = parseFloat(profile?.weightKg);
  const h = parseFloat(profile?.heightCm);
  const a = parseFloat(profile?.age);
  if (!(w > 0 && h > 0 && a > 0)) return 0;
  const base = 10 * w + 6.25 * h - 5 * a;
  const sexConst = profile.sex === SEX.FEMALE ? -161 : 5;
  return Math.round(base + sexConst);
}

// Total energy burned = BMR + active calories (active is the moved/exercise
// portion — in this app sourced from logged Garmin/Health calories, mockable).
export function totalCaloriesBurned(bmr, activeCalories) {
  return Math.round((parseFloat(bmr) || 0) + (parseFloat(activeCalories) || 0));
}

// One call → the full energy picture for a day.
export function energyProfile(profile, activeCalories) {
  const bmr = mifflinStJeorBMR(profile);
  const active = Math.round(parseFloat(activeCalories) || 0);
  return { bmr, active, total: totalCaloriesBurned(bmr, active), hasProfile: bmr > 0 };
}

// Active calories actually logged for a (week, day) — runs + gym imports. This
// is the real "imported from Health" value; falls back to 0 (mockable upstream).
export function activeCaloriesForDay(state, wk, day) {
  const w = state?.weeks?.[String(wk)];
  if (!w) return 0;
  const run = parseFloat(w.runs?.[day]?.cals) || 0;
  const gym = parseFloat(w.gymStats?.[day]?.cals) || 0;
  return Math.round(run + gym);
}
