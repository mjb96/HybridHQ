// ==========================================
// TOAST — transient status banner (toast.js)
// ------------------------------------------
// The app's single DOM-touching status primitive, peeled out of state.js so
// the state module carries no view code and can be imported without a DOM
// (e.g. in unit tests). No-ops if the #sysToast element is absent.
// ==========================================
export function showToast(msg, isError = false) {
  const toast = document.getElementById('sysToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = isError ? 'var(--accent-red)' : 'var(--accent-green)';
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 2500);
}
