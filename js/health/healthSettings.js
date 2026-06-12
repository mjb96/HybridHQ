// ==========================================
// HEALTH CONNECT SETTINGS (healthSettings.js)
// ------------------------------------------
// Renders the Health Data settings screen in the Program Hub.
// Handles detection, connection status, permissions, sync, and disconnect.
// ==========================================
import { checkAvailability, HealthConnectAvailability, HEALTH_RECORD_TYPES } from './healthConnect.js';
import { escapeHtml } from '../util.js';

const RECORD_TYPE_LABELS = Object.freeze({
  Steps:                 'Step Count',
  ActiveCaloriesBurned:  'Active Calories',
  SleepSession:          'Sleep Sessions',
  HeartRate:             'Heart Rate',
  RestingHeartRate:      'Resting Heart Rate',
  Weight:                'Body Weight',
  ExerciseSession:       'Exercise Sessions',
});

// ── Status helpers ─────────────────────────────────────────────────────────────

function lastSyncDisplay(health) {
  if (!health?.syncedAt) return null;
  try {
    const d = new Date(health.syncedAt);
    const diffMs   = Date.now() - d.getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 2)   return 'Just now';
    if (diffMins < 60)  return `${diffMins} minutes ago`;
    const diffH = Math.round(diffMins / 60);
    if (diffH < 24)     return `${diffH} hour${diffH !== 1 ? 's' : ''} ago`;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return null; }
}

function permissionRows(health, grantedTypes) {
  const granted = new Set(grantedTypes || (health ? HEALTH_RECORD_TYPES : []));
  return HEALTH_RECORD_TYPES.map(type => {
    const isGranted = health ? granted.has(type) : false;
    const color = isGranted ? '#10b981' : '#ef4444';
    const icon  = isGranted ? '✓' : '✗';
    return `<div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
      <span class="text-sm text-inverse">${escapeHtml(RECORD_TYPE_LABELS[type] || type)}</span>
      <span class="font-bold" style="font-size:0.8rem;color:${color};">${icon} ${isGranted ? 'Granted' : 'Not granted'}</span>
    </div>`;
  }).join('');
}

function dataSourceRows(health) {
  const workouts = health?.workouts || [];
  if (!workouts.length) return '';
  const sources = new Set(workouts.map(w => w.dataOrigin || w.source).filter(Boolean));
  if (!sources.size) return '';
  return [...sources].map(src => `
    <div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
      <span class="text-sm text-inverse">${escapeHtml(src)}</span>
      <span class="text-xs text-muted">Exercise sessions</span>
    </div>`).join('');
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderHealthSettings(appState) {
  const container = document.getElementById('healthSettingsContent');
  if (!container) return;

  const availability = checkAvailability();
  const health       = appState.health;
  const healthLog    = appState.healthLog || [];
  const lastSync     = lastSyncDisplay(health);
  const isConnected  = !!health;

  // ── NOT_SUPPORTED (desktop / iOS / plain browser) ─────────────────────────
  if (availability === HealthConnectAvailability.NOT_SUPPORTED) {
    container.innerHTML = `
      <div class="card-dark p-4 mb-4 text-center" style="border:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:2rem;margin-bottom:8px;">📵</div>
        <div class="font-heavy text-inverse mb-2" style="font-size:1.1rem;">Not Available on This Device</div>
        <div class="text-sm text-muted" style="line-height:1.6;">Health Connect is an Android feature. Open HybridHQ on your Android device to connect your health data.</div>
      </div>
      ${healthLog.length > 0 ? _renderSyncHistory(health, healthLog) : ''}`;
    return;
  }

  // ── NOT_INSTALLED ─────────────────────────────────────────────────────────
  if (availability === HealthConnectAvailability.NOT_INSTALLED) {
    container.innerHTML = `
      <div class="card-dark p-4 mb-4" style="border:1px solid rgba(245,158,11,0.4);">
        <div class="font-heavy text-inverse mb-2" style="font-size:1rem;">Health Connect Not Installed</div>
        <div class="text-sm text-muted mb-4" style="line-height:1.6;">
          Health Connect is a free Android app by Google that lets HybridHQ securely read your health data from Garmin Connect, Samsung Health, Fitbit, and other apps you already use.
        </div>
        <div class="text-xs text-muted mb-3" style="font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">How to get started:</div>
        <div class="text-sm text-inverse mb-2" style="line-height:1.5;">
          <span style="color:#f59e0b;font-weight:700;">1.</span> Open the Google Play Store on your Android device.<br>
          <span style="color:#f59e0b;font-weight:700;">2.</span> Search for <strong>Health Connect</strong> and install it.<br>
          <span style="color:#f59e0b;font-weight:700;">3.</span> Open Health Connect and connect your health apps (Garmin, Samsung Health, etc.).<br>
          <span style="color:#f59e0b;font-weight:700;">4.</span> Return to HybridHQ and tap <strong>Connect Health Data</strong> below.
        </div>
        <button class="btn-action-block btn-amber mt-4" data-action="sync-health">Connect After Installing</button>
      </div>`;
    return;
  }

  // ── AVAILABLE ─────────────────────────────────────────────────────────────
  const grantedTypes = health?._grantedTypes || (isConnected ? HEALTH_RECORD_TYPES.slice() : []);
  const missingCount = HEALTH_RECORD_TYPES.filter(t => !grantedTypes.includes(t)).length;

  container.innerHTML = `
    <!-- Connection status hero -->
    <article class="card-dark p-4 mb-4" style="border:1px solid ${isConnected ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'};">
      <div class="flex-between mb-3">
        <div>
          <div class="font-heavy text-inverse" style="font-size:1rem;">Health Connect</div>
          <div class="text-xs text-muted mt-1">Android Health Platform</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${isConnected ? '#10b981' : '#6b7280'};"></div>
          <span class="font-bold" style="font-size:0.8rem;color:${isConnected ? '#10b981' : 'var(--text-muted)'};">${isConnected ? 'Connected' : 'Not connected'}</span>
        </div>
      </div>
      ${lastSync ? `
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">Last sync</span>
        <span class="text-sm font-bold text-inverse">${escapeHtml(lastSync)}</span>
      </div>` : ''}
      ${healthLog.length > 0 ? `
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">Days logged</span>
        <span class="text-sm font-bold text-inverse">${healthLog.length} days</span>
      </div>` : ''}
      ${missingCount > 0 ? `
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">Permissions</span>
        <span class="text-sm font-bold" style="color:#f59e0b;">${HEALTH_RECORD_TYPES.length - missingCount}/${HEALTH_RECORD_TYPES.length} granted</span>
      </div>` : isConnected ? `
      <div class="flex-between mb-3">
        <span class="text-sm text-muted">Permissions</span>
        <span class="text-sm font-bold" style="color:#10b981;">All ${HEALTH_RECORD_TYPES.length} granted</span>
      </div>` : ''}
      <button class="btn-action-block btn-blue mt-2" data-action="sync-health">
        ${isConnected ? '↻ Sync Now' : 'Connect Health Data'}
      </button>
    </article>

    <!-- Current snapshot summary -->
    ${isConnected && health ? `
    <h2 class="section-header">Today's Data</h2>
    <article class="card-dark p-3 mb-4">
      ${health.steps > 0 ? `<div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <span class="text-sm text-muted">Steps</span>
        <span class="font-bold text-inverse">${health.steps.toLocaleString()}</span>
      </div>` : ''}
      ${health.sleepHours > 0 ? `<div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <span class="text-sm text-muted">Sleep last night</span>
        <span class="font-bold text-inverse">${health.sleepHours}h${health.sleepScore != null ? ' · Score ' + health.sleepScore : ''}</span>
      </div>` : ''}
      ${health.restingHeartRate ? `<div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <span class="text-sm text-muted">Resting HR</span>
        <span class="font-bold text-inverse">${health.restingHeartRate} bpm</span>
      </div>` : ''}
      ${health.activeCalories > 0 ? `<div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <span class="text-sm text-muted">Active calories</span>
        <span class="font-bold text-inverse">${health.activeCalories.toLocaleString()} kcal</span>
      </div>` : ''}
      ${health.weightKg ? `<div class="flex-between py-2">
        <span class="text-sm text-muted">Weight</span>
        <span class="font-bold text-inverse">${health.weightKg} kg</span>
      </div>` : ''}
    </article>` : ''}

    <!-- Permissions breakdown -->
    <h2 class="section-header">Data Permissions</h2>
    <article class="card-dark p-3 mb-4">
      ${isConnected
        ? permissionRows(health, grantedTypes)
        : `<div class="text-sm text-muted text-center py-2">Connect Health Connect to see permission status.</div>`}
    </article>

    ${missingCount > 0 && isConnected ? `
    <article class="card-dark p-3 mb-4" style="border-left:3px solid #f59e0b;">
      <div class="text-sm text-inverse mb-1 font-bold">Some permissions not granted</div>
      <div class="text-xs text-muted" style="line-height:1.5;">
        Tap <strong>Sync Now</strong> to re-request. If a permission was permanently denied, open Android Settings → Apps → HybridHQ → Permissions to re-enable it.
      </div>
    </article>` : ''}

    <!-- Data sources -->
    ${health?.workouts?.length > 0 ? `
    <h2 class="section-header">Connected Apps</h2>
    <article class="card-dark p-3 mb-4">
      ${dataSourceRows(health)}
      <div class="text-xs text-muted mt-2" style="line-height:1.5;">Data is read from these apps via Health Connect. To add a source, connect it in the Health Connect app.</div>
    </article>` : ''}

    <!-- Disconnect -->
    ${isConnected ? `
    <h2 class="section-header">Manage Data</h2>
    <article class="card-dark p-3 mb-4">
      <div class="text-sm text-muted mb-3" style="line-height:1.5;">Disconnecting clears all Health Connect data from HybridHQ. Your data remains in Health Connect and your connected apps.</div>
      <button class="btn-action-block btn-ghost" style="border-color:var(--color-red,#ef4444);color:var(--color-red,#ef4444);" data-action="disconnect-health">Disconnect Health Data</button>
    </article>` : `
    <article class="card-dark p-3 mb-4">
      <div class="text-sm text-muted mb-2 font-bold">Why connect Health Connect?</div>
      <div class="text-sm text-muted" style="line-height:1.6;">
        • Sleep data improves your Recovery and Readiness scores<br>
        • Resting HR detects accumulated fatigue before it affects performance<br>
        • Step count tracks daily activity load alongside your training<br>
        • Weight syncs automatically without manual entry<br>
        • All data stays on your device — HybridHQ never uploads health data to servers
      </div>
    </article>`}

    ${_renderSyncHistory(health, healthLog)}
  `;
}

function _renderSyncHistory(health, healthLog) {
  if (!healthLog.length) return '';
  const recent = [...healthLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const rows = recent.map(e => `
    <div class="flex-between py-2" style="border-bottom:1px solid rgba(255,255,255,0.05);">
      <span class="text-sm text-muted">${escapeHtml(e.date)}</span>
      <div class="text-xs" style="text-align:right;color:var(--text-muted);">
        ${e.sleepHours > 0 ? `${e.sleepHours}h sleep  ` : ''}${e.restingHeartRate > 0 ? `${e.restingHeartRate} bpm  ` : ''}${e.steps > 0 ? e.steps.toLocaleString() + ' steps' : ''}
      </div>
    </div>`).join('');

  return `<h2 class="section-header">Sync History</h2>
    <article class="card-dark p-3 mb-4">
      ${rows}
      ${healthLog.length > 5 ? `<div class="text-xs text-muted mt-2">${healthLog.length - 5} earlier entries in history.</div>` : ''}
    </article>`;
}
