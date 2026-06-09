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
