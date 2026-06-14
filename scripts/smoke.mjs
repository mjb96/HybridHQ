// ==========================================
// APP SMOKE TEST (scripts/smoke.mjs) — run with: node scripts/smoke.mjs
// ------------------------------------------
// Imports the real app.js module graph under a minimal DOM mock and forces a
// home render. Catches cross-module import-resolution errors and module-eval /
// render crashes that `node --check` and unit tests do NOT (a bad import gives
// a blank screen in the browser). CDN (https://) imports are stubbed.
// ==========================================
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s,c,n){ if(s.startsWith('https://')) return {url:'stub:'+s,shortCircuit:true}; return n(s,c); }
export async function load(u,c,n){ if(u.startsWith('stub:')) return {format:'module',shortCircuit:true,source:"const d={from:()=>({})};export default d;export const Buffer=d;export class FitParser{parse(){}}"}; return n(u,c); }
`));

const noop = () => {};
const store = new Map();
const makeEl = (id) => {
  const e = { id: id || '', setAttribute: noop, getAttribute: () => null, appendChild: (c) => c,
    insertBefore: (c) => c, removeChild: noop, remove: noop, addEventListener: noop, removeEventListener: noop,
    dispatchEvent: noop, querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    contains: () => false, click: noop, focus: noop, getBoundingClientRect: () => ({ top:0,left:0,width:100,height:50 }),
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    previousElementSibling: null, firstChild: null, parentElement: null, parentNode: { removeChild: noop }, children: [], offsetWidth: 100 };
  let h = '', t = '', v = '';
  Object.defineProperty(e, 'innerHTML', { get: () => h, set: (x) => { h = String(x); } });
  Object.defineProperty(e, 'textContent', { get: () => t, set: (x) => { t = String(x); } });
  Object.defineProperty(e, 'value', { get: () => v, set: (x) => { v = String(x); } });
  return e;
};
globalThis.document = { addEventListener: noop, removeEventListener: noop,
  getElementById: (id) => { if (!store.has(id)) store.set(id, makeEl(id)); return store.get(id); },
  querySelector: () => null, querySelectorAll: () => [], createElement: () => makeEl(), dispatchEvent: noop,
  readyState: 'complete', body: makeEl('body'), documentElement: makeEl('html') };
globalThis.window = { addEventListener: noop, removeEventListener: noop, supabase: undefined,
  location: { reload: noop, href: '' }, scrollTo: noop, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.localStorage = { s: {}, getItem(k){ return this.s[k] ?? null; }, setItem(k,v){ this.s[k] = String(v); }, removeItem(k){ delete this.s[k]; } };
Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { register: () => Promise.reject(new Error('no sw')), addEventListener: noop, removeEventListener: noop }, vibrate: noop }, configurable: true });
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
globalThis.L = { map: () => ({ remove: noop, fitBounds: noop }), tileLayer: () => ({ addTo: () => ({}) }), polyline: () => ({ addTo: () => ({ getBounds: noop }) }) };

try {
  const mod = await import(new URL('../js/app.js', import.meta.url));
  await new Promise(r => setTimeout(r, 150));
  if (mod.hydrateCurrentView) mod.hydrateCurrentView();
  console.log('SMOKE OK — app graph imported and home rendered without throwing');
} catch (e) {
  console.error('SMOKE FAIL:\n', e && e.stack ? e.stack : e);
  process.exit(1);
}
