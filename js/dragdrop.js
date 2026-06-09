// ==========================================
// DRAG & DROP REORDERING
// ==========================================
import { showToast } from './state.js';

let sourceDraggedElementNode = null;
let _getState;
let _getSelectedDay;
let _saveState;

export function initDragDrop(getStateFn, getSelectedDayFn, saveStateFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _saveState = saveStateFn;
}

export function mountExerciseDragAndDropSystems() {
  const container = document.getElementById('cockpitExercisesContainer');
  const elements = container.querySelectorAll('.cockpit-exercise');

  elements.forEach(element => {
    const grip = element.querySelector('.drag-handle-grip');
    if (!grip) return;

    grip.addEventListener('mousedown', () => element.setAttribute('draggable', 'true'));
    grip.addEventListener('mouseup', () => element.setAttribute('draggable', 'false'));

    element.addEventListener('dragstart', (e) => {
      sourceDraggedElementNode = element;
      element.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    element.addEventListener('dragend', () => {
      element.classList.remove('is-dragging');
      commitReorderedDOMStateToStorage();
    });

    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (element === sourceDraggedElementNode) return;
      const bounding = element.getBoundingClientRect();
      const offset = e.clientY - bounding.top;
      if (offset > bounding.height / 2) element.after(sourceDraggedElementNode);
      else element.before(sourceDraggedElementNode);
    });

    grip.addEventListener('touchstart', () => {
      sourceDraggedElementNode = element;
      element.classList.add('is-dragging');
      if (navigator.vibrate) navigator.vibrate(10);
    }, { passive: true });

    grip.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touchLocation = e.touches[0];
      const targetNode = document.elementFromPoint(touchLocation.clientX, touchLocation.clientY);
      if (!targetNode) return;
      const closestCard = targetNode.closest('.cockpit-exercise');
      if (closestCard && closestCard !== sourceDraggedElementNode && closestCard.parentNode === container) {
        const bounding = closestCard.getBoundingClientRect();
        const offset = touchLocation.clientY - bounding.top;
        if (offset > bounding.height / 2) closestCard.after(sourceDraggedElementNode);
        else closestCard.before(sourceDraggedElementNode);
      }
    }, { passive: false });

    grip.addEventListener('touchend', () => {
      if (sourceDraggedElementNode) {
        sourceDraggedElementNode.classList.remove('is-dragging');
        sourceDraggedElementNode = null;
        commitReorderedDOMStateToStorage();
      }
    });
  });
}

export function commitReorderedDOMStateToStorage() {
  const appState = _getState();
  const selectedDay = _getSelectedDay();
  const container = document.getElementById('cockpitExercisesContainer');
  const cards = container.querySelectorAll('.cockpit-exercise');
  const wk = appState.currentWeek;
  const newOrderedLiftsMap = {};
  cards.forEach(card => {
    const liftName = card.getAttribute('data-liftname');
    if (appState.weeks[wk].lifts[selectedDay][liftName]) {
      newOrderedLiftsMap[liftName] = appState.weeks[wk].lifts[selectedDay][liftName];
    }
  });
  appState.weeks[wk].lifts[selectedDay] = newOrderedLiftsMap;
  _saveState(true);
  showToast('Order Updated ✓');
}

// ==========================================
// DASHBOARD TILE ORDER PERSISTENCE
// ==========================================
const TILE_ORDER_KEY = 'dashboardTileOrder';

export function loadTileOrder() {
  try {
    const raw = localStorage.getItem(TILE_ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTileOrder(orderedIds) {
  try {
    localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(orderedIds));
  } catch {}
}

export function resetTileOrder() {
  try {
    localStorage.removeItem(TILE_ORDER_KEY);
  } catch {}
}

// ==========================================
// TILE DRAG AND DROP
// Long-press to enter edit mode, then drag to reorder.
// ==========================================
let tileDragSource   = null;
let tileDragEditMode = false;
let tileLongPressTimer = null;
let tileTouchDragActive = false;

export function mountTileDragAndDrop() {
  const grid = document.getElementById('glanceGrid');
  if (!grid) return;

  const tiles = Array.from(grid.querySelectorAll('.glance-card'));
  if (!tiles.length) return;

  tiles.forEach(tile => {
    if (tile.dataset.tileDragBound === '1') return;
    tile.dataset.tileDragBound = '1';

    // --- Mouse ---
    tile.addEventListener('mousedown', onTileMouseDown);
    tile.addEventListener('dragstart', onTileDragStart);
    tile.addEventListener('dragover',  onTileDragOver);
    tile.addEventListener('dragleave', onTileDragLeave);
    tile.addEventListener('drop',      onTileDrop);
    tile.addEventListener('dragend',   onTileDragEnd);

    // --- Touch ---
    tile.addEventListener('touchstart', onTileTouchStart, { passive: true });
    tile.addEventListener('touchmove',  onTileTouchMove,  { passive: false });
    tile.addEventListener('touchend',   onTileTouchEnd);
  });
}

function enterTileEditMode() {
  if (tileDragEditMode) return;
  tileDragEditMode = true;
  const grid = document.getElementById('glanceGrid');
  grid?.querySelectorAll('.glance-card').forEach(t => t.classList.add('tile-drag-mode'));
  if (navigator.vibrate) navigator.vibrate(30);
  showToast('Drag to reorder tiles');
}

export function exitTileEditMode() {
  tileDragEditMode = false;
  const grid = document.getElementById('glanceGrid');
  grid?.querySelectorAll('.glance-card').forEach(t => {
    t.classList.remove('tile-drag-mode', 'tile-drag-over');
  });
}

function commitTileOrder() {
  const grid = document.getElementById('glanceGrid');
  if (!grid) return;
  const orderedIds = Array.from(grid.querySelectorAll('.glance-card'))
    .map(t => t.id.replace('glance-tile-', ''));
  saveTileOrder(orderedIds);
  showToast('Tile order saved ✓');
}

// Mouse handlers
function onTileMouseDown(e) {
  const tile = e.currentTarget;
  tileLongPressTimer = setTimeout(() => {
    enterTileEditMode();
    tile.setAttribute('draggable', 'true');
  }, 450);
}

function onTileDragStart(e) {
  clearTimeout(tileLongPressTimer);
  if (!tileDragEditMode) { e.preventDefault(); return; }
  tileDragSource = e.currentTarget;
  e.currentTarget.classList.add('tile-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.currentTarget.id);
}

function onTileDragOver(e) {
  if (!tileDragEditMode || !tileDragSource) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const target = e.currentTarget;
  if (target === tileDragSource) return;
  target.classList.add('tile-drag-over');
}

function onTileDragLeave(e) {
  e.currentTarget.classList.remove('tile-drag-over');
}

function onTileDrop(e) {
  if (!tileDragEditMode || !tileDragSource) return;
  e.preventDefault();
  const target = e.currentTarget;
  if (target === tileDragSource) return;
  const grid = document.getElementById('glanceGrid');
  const tiles = Array.from(grid.querySelectorAll('.glance-card'));
  const srcIdx = tiles.indexOf(tileDragSource);
  const tgtIdx = tiles.indexOf(target);
  if (srcIdx < tgtIdx) target.after(tileDragSource);
  else target.before(tileDragSource);
  target.classList.remove('tile-drag-over');
}

function onTileDragEnd(e) {
  clearTimeout(tileLongPressTimer);
  e.currentTarget.classList.remove('tile-dragging');
  e.currentTarget.setAttribute('draggable', 'false');
  document.getElementById('glanceGrid')
    ?.querySelectorAll('.glance-card')
    .forEach(t => t.classList.remove('tile-drag-over'));
  if (tileDragEditMode) commitTileOrder();
}

// Touch handlers
function onTileTouchStart(e) {
  const tile = e.currentTarget;
  tileLongPressTimer = setTimeout(() => {
    enterTileEditMode();
    tileTouchDragActive = true;
    tileDragSource = tile;
    tile.classList.add('tile-dragging');
  }, 450);
}

function onTileTouchMove(e) {
  clearTimeout(tileLongPressTimer);
  if (!tileTouchDragActive || !tileDragSource) return;
  e.preventDefault();
  const touch = e.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (!el) return;
  const target = el.closest('.glance-card');
  if (!target || target === tileDragSource) return;
  const grid = document.getElementById('glanceGrid');
  if (!grid.contains(target)) return;
  const mid = target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
  grid.querySelectorAll('.glance-card').forEach(t => t.classList.remove('tile-drag-over'));
  target.classList.add('tile-drag-over');
  if (touch.clientY > mid) target.after(tileDragSource);
  else target.before(tileDragSource);
}

function onTileTouchEnd() {
  clearTimeout(tileLongPressTimer);
  if (tileDragSource) tileDragSource.classList.remove('tile-dragging');
  document.getElementById('glanceGrid')
    ?.querySelectorAll('.glance-card')
    .forEach(t => t.classList.remove('tile-drag-over'));
  if (tileTouchDragActive) {
    tileTouchDragActive = false;
    tileDragSource = null;
    commitTileOrder();
  }
}

// ==========================================
// HIDDEN TILES PERSISTENCE
// ==========================================
const TILE_HIDDEN_KEY = 'dashboardTilesHidden';

export function loadHiddenTiles() {
  try {
    const raw = localStorage.getItem(TILE_HIDDEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveHiddenTiles(hiddenSet) {
  try {
    localStorage.setItem(TILE_HIDDEN_KEY, JSON.stringify([...hiddenSet]));
  } catch {}
}

export function resetHiddenTiles() {
  try {
    localStorage.removeItem(TILE_HIDDEN_KEY);
  } catch {}
}