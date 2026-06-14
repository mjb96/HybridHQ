// ==========================================
// DASHBOARD TILE TESTS (tests/dashboard_tiles.test.js)
// Guards the v2-blind tile fix: the `today` and `consistency` tiles read the
// program schedule via getDisplayBlueprint (schema-aware) instead of the flat
// program.days{} map, which v2 programs don't have — previously the Today tile
// always fell back to "Rest Day" and run-only days went uncounted. Run with
// `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE_REGISTRY } from '../js/dashboard-tiles.js';
import { createEmptyV2Program, makeRunEntry } from '../js/schema.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const tile = (id) => TILE_REGISTRY.find(t => t.id === id);

test('today tile reads the v2 day blueprint instead of the absent days{} map', () => {
  const prog = createEmptyV2Program({ id: 'p', name: 'P', totalWeeks: 1 });
  prog.weeks[0].days.mon.title = 'Heavy Lower';
  prog.weeks[0].days.mon.block.push({ kind: 'lift', name: 'Back Squat', sets: 5, reps: { min: 5, max: 5 } });
  const appState = { currentWeek: '1', weeks: { '1': { lifts: { mon: {} }, runs: {} } } };

  const data = tile('today').renderData(appState, DAYS, prog, 'mon');
  // Before the fix prog.days was undefined → hero fell back to 'Rest Day'.
  assert.equal(data.hero, 'Heavy Lower');
});

test('consistency tile counts a v2 run-only scheduled day', () => {
  const prog = createEmptyV2Program({ id: 'p', name: 'P', totalWeeks: 1 });
  prog.weeks[0].days.mon.block.push(makeRunEntry({ type: 'easy' }));
  const appState = { currentWeek: '1', weeks: { '1': { lifts: {}, runs: { mon: { dist: '5' } } } } };

  const data = tile('consistency').renderData(appState, DAYS, prog);
  assert.equal(data.total, 1); // run-only day is now scheduled+counted
  assert.equal(data.done, 1);  // and logged (5 km)
});
