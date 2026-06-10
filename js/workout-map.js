// ==========================================
// WORKOUT RUN MAP (workout-map.js)
// Renders the IndexedDB-stored GPS route for the active day via Leaflet.
// Extracted verbatim from workout.js renderWorkout(); logic unchanged.
// ==========================================
import { getMapFromDB } from './db.js';

// Private module-scoped Leaflet instance for the active workout map.
let activeWorkoutMapInstance = null;

// hasDistance: pass the run's recorded distance (truthy => a run exists to map).
export function renderRunMap(wk, selectedDay, hasDistance) {
  const runMapContainer = document.getElementById('runMapContainer');
  if (!runMapContainer) return;

  if (hasDistance) {
    getMapFromDB(wk, selectedDay).then(coords => {
      if (coords && coords.length > 0) {
        runMapContainer.style.display = 'block';
        setTimeout(() => {
          if (activeWorkoutMapInstance) { activeWorkoutMapInstance.remove(); activeWorkoutMapInstance = null; }
          runMapContainer.innerHTML = '';
          activeWorkoutMapInstance = L.map('runMapContainer');
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(activeWorkoutMapInstance);
          const route = L.polyline(coords, { color: '#f43f5e', weight: 4, opacity: 0.9 }).addTo(activeWorkoutMapInstance);
          activeWorkoutMapInstance.fitBounds(route.getBounds(), { padding: [10, 10] });
          activeWorkoutMapInstance.invalidateSize();
        }, 100);
      } else {
        runMapContainer.style.display = 'none';
      }
    });
  } else {
    runMapContainer.style.display = 'none';
  }
}