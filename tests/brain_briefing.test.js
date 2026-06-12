// ==========================================
// BRAIN BRIEFING TESTS (tests/brain_briefing.test.js) — `node --test`
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeBriefing, buildTelemetry } from '../js/brain/briefing.js';

test('cold start → an inviting placeholder briefing', () => {
  assert.match(composeBriefing({ dataWeeks: 0 }), /Log a few sessions/);
});

test('briefing leads with recovery, load and the focus observation', () => {
  const text = composeBriefing({
    dataWeeks: 3,
    recovery: { score: 92, hasData: true },
    readiness: { score: 88, acwr: 1.05, hasData: true },
    energy: { bmr: 1820, active: 850, total: 2670, hasProfile: true },
    focusObservation: 'Bench Press estimated 1RM is trending up (+8%).',
  });
  assert.match(text, /Recovery is at 92%/);
  assert.match(text, /push intensity/);
  assert.match(text, /1\.05; current training load is sustainable/);
  assert.match(text, /Bench Press/);
  assert.match(text, /2,670 kcal \(base 1,820 \+ active 850\)/);
});

test('high load + low recovery change the wording', () => {
  const text = composeBriefing({
    dataWeeks: 4,
    recovery: { score: 38, hasData: true },
    readiness: { score: 40, acwr: 1.62, hasData: true },
  });
  assert.match(text, /running low/);
  assert.match(text, /protect rest/);
  assert.match(text, /load is high/);
});

test('telemetry includes energy complications when profile is set', () => {
  const t = buildTelemetry({
    recovery: { score: 80, hasData: true },
    readiness: { score: 85, acwr: 1.1, hasData: true },
    energy: { bmr: 1820, active: 850, total: 2670, hasProfile: true },
  });
  const keys = t.map(x => x.key);
  assert.deepEqual(keys, ['readiness', 'recovery', 'base', 'active', 'burned']);
  assert.equal(t.find(x => x.key === 'burned').value, '2,670');
});

test('telemetry nudges to set up energy when no profile', () => {
  const t = buildTelemetry({ energy: { hasProfile: false } });
  const p = t.find(x => x.key === 'profile');
  assert.ok(p);
  assert.equal(p.nav, 'profile');
});
