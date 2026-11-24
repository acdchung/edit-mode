// Fonts for the Font field (roadmap 6e, 6f).
//
// - Fonts on this computer: Chrome's Local Font Access (`queryLocalFonts`),
//   asked once (Chrome shows a permission prompt the first time; it needs a
//   click to start it). Safari and Firefox don't have it: the list then only
//   shows the page's fonts.
// - Fonts the project's code loads: every family named in its stylesheets
//   (`font-family` in any rule) or declared with @font-face. Edits are inline
//   styles, so they never count. A font picked from this computer that isn't
//   one of these only shows where it's installed: Push says so.
// - Google Fonts (6f): the family list from the Google Fonts API, mirrored on
//   jsDelivr (no API key; fetched when the list first opens). Picking one loads
//   it on the page through fonts.googleapis.com; Push asks Claude to add it.

const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong|-apple-system|blinkmacsystemfont|inherit|initial|unset)$/i;
export const firstFamily = (stack) => (stack || '').split(',')[0].replace(/["']/g, '').trim();
const families = (stack) => (stack || '').split(',').map((f) => f.replace(/["']/g, '').trim()).filter((f) => f && !GENERIC.test(f));

// ---------- This computer ----------
export const localSupported = () => typeof window.queryLocalFonts === 'function';
let ready = null; // the loaded list
let local = null; // Promise<Map family → [{ name, weight, italic }]>
let localState = 'idle'; // idle | loading | ready | denied | unsupported
export const localStatus = () => (localSupported() ? localState : 'unsupported');

// Style names → CSS weight (Figma lists a font's real styles by these names).
const WEIGHT_WORDS = [
  [/(hairline|thin)/, 100], [/(extra|ultra)[\s-]?light/, 200], [/light/, 300],
  [/(semi|demi)[\s-]?bold/, 600], [/(extra|ultra)[\s-]?bold/, 800], [/(black|heavy)/, 900],
  [/medium/, 500], [/bold/, 700],
];
export function styleWeight(style) {
  const s = style.toLowerCase();
  for (const [re, w] of WEIGHT_WORDS) if (re.test(s)) return w;
  return 400;
}
const isItalic = (style) => /italic|oblique/i.test(style);

// Call from a click (Chrome only shows its prompt after a user gesture).
export function loadLocal() {
  if (!localSupported()) return Promise.resolve(null);
  if (local && localState !== 'denied') return local;
  localState = 'loading';
  local = window.queryLocalFonts().then((list) => {
    const map = new Map();
    for (const f of list) {
      if (f.family.startsWith('.')) continue; // macOS hides these system fonts too
      if (!map.has(f.family)) map.set(f.family, []);
      const styles = map.get(f.family);
      const s = { name: f.style, weight: styleWeight(f.style), italic: isItalic(f.style) };
      if (!styles.some((x) => x.weight === s.weight && x.italic === s.italic)) styles.push(s);
    }
    for (const styles of map.values()) styles.sort((a, b) => a.weight - b.weight || a.italic - b.italic);
    localState = map.size ? 'ready' : 'denied'; // refused: an empty list
    ready = map.size ? map : null;
    return ready;
  }).catch(() => {
    localState = 'denied';
    return null;
  });
  return local;
}
// The styles of a font on this computer, once the list is loaded.
export const localStyles = (family) => ready?.get(family) || null;
export const localFamilies = () => (ready ? [...ready.keys()].sort((a, b) => a.localeCompare(b)) : []);

// ---------- The project's code ----------
let inCode = null;
function codeFamilies() {
  if (inCode) return inCode;
  inCode = new Set();
  const walk = (rules) => {
    for (const r of rules) {
      if (r.style?.fontFamily) for (const f of families(r.style.fontFamily)) inCode.add(f.toLowerCase());
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode?.closest?.('edit-mode-root') || sheet.ownerNode?.dataset?.emFont) continue; // ours: not the project's
    try { walk(sheet.cssRules); } catch {} // a cross-origin sheet can't be read: its fonts don't count
  }
  for (const face of document.fonts) {
    const f = face.family.replace(/["']/g, '').trim();
    if (!injected.has(f)) inCode.add(f.toLowerCase()); // a Google font we loaded isn't the project's
  }
  return inCode;
}
// Does the project load this family (a stack's first family)? Generic families count as loaded.
export function loadedByCode(stack) {
  const f = firstFamily(stack);
  return !f || GENERIC.test(f) || codeFamilies().has(f.toLowerCase());
}
// Every family in some markup (a new design's html) that the code doesn't load.
export function notLoaded(html) {
  const out = new Set();
  for (const m of (html || '').matchAll(/font-family:\s*([^;"]+)/g)) {
    const f = firstFamily(m[1].replace(/&quot;/g, '"'));
    if (f && !loadedByCode(f)) out.add(f);
  }
  return [...out];
}

// ---------- Google Fonts ----------
const GOOGLE_LIST = 'https://cdn.jsdelivr.net/npm/google-font-metadata@6.0.8/data/api-response.json';
let google = null; // Map family → [{ name, weight, italic }]
let googleLoad = null;
export const googleReady = () => !!google;
export function loadGoogle() {
  googleLoad ||= fetch(GOOGLE_LIST).then((r) => (r.ok ? r.json() : [])).then((list) => {
    google = new Map(list.map((f) => [f.family, f.variants.map((v) => {
      const weight = v === 'regular' || v === 'italic' ? 400 : parseInt(v, 10) || 400;
      return { weight, italic: v.endsWith('italic') };
    }).sort((a, b) => a.weight - b.weight || a.italic - b.italic)]));
    return google;
  }).catch(() => { googleLoad = null; return null; }); // offline: no Google group (try again next time)
  return googleLoad;
}
export const googleFamilies = () => (google ? [...google.keys()] : []);
export const googleStyles = (family) => google?.get(family) || null;
export const isGoogle = (family) => !!google?.has(family);

// Load a Google font on the page (all its styles), once. Families the code
// already loads, or installed on this computer, don't need it.
const injected = new Set();
export function useFont(stack) {
  const f = firstFamily(stack);
  if (!f || injected.has(f) || !isGoogle(f) || localStyles(f)) return;
  codeFamilies(); // read the code's fonts before adding ours
  if (loadedByCode(f)) return;
  injected.add(f);
  const axes = googleStyles(f).map((x) => `${x.italic ? 1 : 0},${x.weight}`).sort();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.emFont = f;
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@${axes.join(';')}&display=swap`;
  document.head.append(link);
}
// Where a font the code doesn't load comes from (for Push): Google Fonts, or this computer.
export const fontSource = (stack) => (isGoogle(firstFamily(stack)) ? 'google' : 'local');

// After a reload: load the Google fonts that edits and canvas designs use.
export function restoreFonts() {
  const used = new Set();
  for (const el of document.querySelectorAll('[style*="font-family"]')) {
    const f = firstFamily(el.style.getPropertyValue('font-family'));
    if (f && !loadedByCode(f)) used.add(f);
  }
  if (!used.size) return;
  loadGoogle().then(() => { for (const f of used) useFont(f); });
}
