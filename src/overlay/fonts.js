// Fonts for the Font field (roadmap 6e).
//
// - Fonts on this computer: Chrome's Local Font Access (`queryLocalFonts`),
//   asked once (Chrome shows a permission prompt the first time; it needs a
//   click to start it). Safari and Firefox don't have it: the list then only
//   shows the page's fonts.
// - Fonts the project's code loads: every family named in its stylesheets
//   (`font-family` in any rule) or declared with @font-face. Edits are inline
//   styles, so they never count. A font picked from this computer that isn't
//   one of these only shows where it's installed: Push says so.

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
    if (sheet.ownerNode?.closest?.('edit-mode-root')) continue;
    try { walk(sheet.cssRules); } catch {} // a cross-origin sheet can't be read: its fonts don't count
  }
  for (const face of document.fonts) inCode.add(face.family.replace(/["']/g, '').trim().toLowerCase());
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
