// ==========================================
// ANALYTICS VIEW — BODY WEIGHT (view-bodyweight.js)
// ------------------------------------------
// Renders the 'bodyweight' analytics context.
// ==========================================
import { renderBodyWeightChart } from '../charts.js';

export function renderBodyweightView(appState) {
  renderBodyWeightChart(document.getElementById('bwChartContainer'), appState.bodyWeightLog || []);
}
