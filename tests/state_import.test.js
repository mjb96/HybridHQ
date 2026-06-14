// ==========================================
// STATE MODULE-LOAD TEST (tests/state_import.test.js)
// Guards the Phase 4 Step 1 refactor: state.js must import cleanly in a
// DOM-less context. Previously the eager `window.supabase` lookup ran at
// module load (a swallowed ReferenceError under node); the Supabase client is
// now created lazily, so importing the module must neither throw nor require a
// window. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appState, DEFAULT_DAYS } from '../js/state.js';

test('state.js imports without a DOM and exposes its base state', () => {
  assert.equal(typeof appState, 'object');
  assert.equal(appState.currentWeek, '1');
  assert.deepEqual(DEFAULT_DAYS, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
});
