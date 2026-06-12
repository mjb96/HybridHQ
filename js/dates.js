// ==========================================
// CALENDAR / TIME-AXIS UTILITIES (dates.js)
// ------------------------------------------
// Gives the ordinal week→day model a real calendar. Each training week carries
// a `startedAt` (the Monday of that week); from it any (week, day) slot resolves
// to a real date. This is the foundation for honest time-windowed analysis
// (recency, days-between-sessions, real acute/chronic windows).
//
// Pure module: no DOM, no browser globals. Safe under `node --test`.
// ==========================================

export const DAY_INDEX = Object.freeze({ mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Real calendar date for a (weekStartISO, dayKey) slot. weekStart is the Monday
// of the training week; dayKey offsets from it.
export function slotDate(weekStartISO, dayKey) {
  if (!weekStartISO) return null;
  const base = new Date(weekStartISO);
  if (isNaN(base.getTime())) return null;
  const idx = DAY_INDEX[dayKey] ?? 0;
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + idx);
  return d;
}

// ISO yyyy-mm-dd for a slot.
export function slotDateISO(weekStartISO, dayKey) {
  const d = slotDate(weekStartISO, dayKey);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
}

// Estimate a week's start ISO from the current week's known start, assuming
// 7-day weeks. Used to backfill historical weeks that predate dated storage.
export function estimateWeekStart(currentWeekStartISO, currentWeekNum, targetWeekNum) {
  if (!currentWeekStartISO) return null;
  const base = new Date(currentWeekStartISO);
  if (isNaN(base.getTime())) return null;
  const deltaWeeks = (parseInt(targetWeekNum, 10) || 1) - (parseInt(currentWeekNum, 10) || 1);
  const d = new Date(base);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return d.toISOString();
}

// Whole days from a→b (b - a), or null if either is invalid.
export function daysBetween(aISO, bISO) {
  const a = new Date(aISO), b = new Date(bISO);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

// Human label for a training week, e.g. "Jun 9–15" or "May 30 – Jun 5".
export function weekRangeLabel(weekStartISO) {
  const mon = slotDate(weekStartISO, 'mon');
  const sun = slotDate(weekStartISO, 'sun');
  if (!mon || !sun) return '';
  const m1 = MONTHS[mon.getMonth()], m2 = MONTHS[sun.getMonth()];
  return m1 === m2
    ? `${m1} ${mon.getDate()}–${sun.getDate()}`
    : `${m1} ${mon.getDate()} – ${m2} ${sun.getDate()}`;
}
