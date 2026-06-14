const DB_NAME = 'HybridTrainingDB';
// v2 adds the `fitStreams` store for per-record .FIT time-series. The upgrade
// is additive — existing `runMaps` (GPS routes) is preserved untouched.
const DB_VERSION = 2;
const STORE_NAME = 'runMaps';
const STREAM_STORE = 'fitStreams';

// Single shared connection, cached as a promise. Re-opening per operation (the
// old behaviour) churned connections during bursty work like a .FIT import.
// The cache is invalidated whenever the connection drops (close, version-change
// from another tab, or open error) so the next call transparently re-opens.
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      _dbPromise = null;
      reject(e);
      return;
    }
    request.onerror = (e) => {
      _dbPromise = null;
      reject(e.target.error || new Error('IndexedDB open failed'));
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      // If another tab later triggers a version change, close this connection
      // so we never block that tab's upgrade (and vice-versa).
      db.onversionchange = () => { try { db.close(); } catch {} _dbPromise = null; };
      // Drop the cache if the connection closes unexpectedly so we re-open.
      db.onclose = () => { _dbPromise = null; };
      resolve(db);
    };
    // Fires when this open is blocked by an existing connection (e.g. another
    // tab still on the old DB version). Reject instead of hanging forever so
    // callers fail fast and the UI is never wedged waiting on a dead promise.
    request.onblocked = () => {
      _dbPromise = null;
      reject(new Error('IndexedDB upgrade blocked by another open tab'));
    };
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STREAM_STORE)) {
        db.createObjectStore(STREAM_STORE);
      }
    };
  });
  return _dbPromise;
}

// ---- GPS route maps (key: "week_day", e.g. "1_mon") ----------------------
export async function saveMapToDB(week, day, coordinates) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = `${week}_${day}`;
    store.put(coordinates, key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getMapFromDB(week, day) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const key = `${week}_${day}`;
    const request = store.get(key);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteMapFromDB(week, day) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const key = `${week}_${day}`;
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

// ---- .FIT per-record streams (key: "week_day_type", e.g. "1_mon_run") ----
// `type` discriminates a run stream from a (future) gym stream on the same day.
// Values are the bulky column-oriented stream object; kept out of the synced
// state blob deliberately, mirroring the GPS-map precedent.
function streamKey(week, day, type) {
  return `${week}_${day}_${type || 'run'}`;
}

export async function saveStreamToDB(week, day, type, stream) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STREAM_STORE, 'readwrite');
    const store = tx.objectStore(STREAM_STORE);
    store.put(stream, streamKey(week, day, type));
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getStreamFromDB(week, day, type) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STREAM_STORE, 'readonly');
    const store = tx.objectStore(STREAM_STORE);
    const request = store.get(streamKey(week, day, type));
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteStreamFromDB(week, day, type) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STREAM_STORE, 'readwrite');
    const store = tx.objectStore(STREAM_STORE);
    const request = store.delete(streamKey(week, day, type));
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}