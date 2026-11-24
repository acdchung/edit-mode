export const ATTR = 'data-src';

// Tags that are never layers (Layers panel, page top level).
export const NOT_LAYER = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK|META|BR)$/; // a <br> is part of its text layer

// Canvas zoom (see canvas.js). Screen pixels ÷ z = CSS pixels.
export const view = { z: 1 };

// An element's box in CSS pixels, unaffected by the canvas zoom. Use it for
// sizes and distances; use getBoundingClientRect for drawing on screen.
export function box(el) {
  const r = ownRect(el);
  const z = view.z;
  return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z };
}

// Its rect as if it weren't rotated or flipped (8d): Figma's W/H/X/Y are the layer's own size,
// not the tilted footprint. Only elements with their own rotate/scale pay for the swap.
function ownRect(el) {
  const cs = getComputedStyle(el);
  if ((cs.rotate === 'none' || /^0deg$/.test(cs.rotate)) && cs.scale === 'none') return el.getBoundingClientRect();
  const saved = ['rotate', 'scale'].map((p) => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
  for (const [p] of saved) el.style.setProperty(p, 'none', 'important');
  const r = el.getBoundingClientRect();
  for (const [p, v, prio] of saved) { if (v) el.style.setProperty(p, v, prio); else el.style.removeProperty(p); }
  if (el.getAttribute('style') === '') el.removeAttribute('style');
  return r;
}

export const fmt = (n) => String(Math.round(n * 10) / 10);
export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const isNumber = (s) => /^-?\d*\.?\d+$/.test(s);

export function parseSrc(value) {
  const m = /^(.*):(\d+):(\d+)$/.exec(value || '');
  return m ? { file: m[1], line: +m[2], col: +m[3] } : null;
}

export const describe = (el) =>
  el.tagName.toLowerCase() + [...el.classList].map((c) => '.' + c).join('');

// Elements rendered from the same JSX line (code instances only).
export const sameSource = (el) => {
  const src = el.getAttribute(ATTR);
  return src ? [...document.querySelectorAll(`[${ATTR}="${CSS.escape(src)}"]`)] : [el];
};

// "All like this" works on a family:
// - elements rendered from the same JSX line (data-src)
// - plus copies of them made in this session (⌘D, paste, ⌥-drag), and the
//   elements inside those copies (data-em-copy-of = that line)
// - a shape or text you added is a family of its own, joined by its copies
//   (data-em-copy-of = "new #N")
export const familyKey = (el) =>
  el.getAttribute(ATTR) ?? el.dataset?.emCopyOf ?? (el.dataset?.emNew ? `new #${el.dataset.emNew}` : null);

export function family(el) {
  const key = familyKey(el);
  if (!key) return [el];
  const q = CSS.escape(key);
  const m = /^new #(\d+)$/.exec(key);
  const sel = `[${ATTR}="${q}"], [data-em-copy-of="${q}"]` + (m ? `, [data-em-new="${m[1]}"]:not([data-em-copy-of])` : '');
  const all = [...document.querySelectorAll(sel)].filter((n) => familyKey(n) === key);
  return all.includes(el) ? all : [el, ...all];
}

// "rgb(226, 87, 43)" / "rgba(0, 0, 0, 0.5)" → { hex: "#E2572B", a: 0.5 }
export function parseColor(color) {
  const m = /rgba?\(([^)]+)\)/.exec(color || '');
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  const hex = '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  return { hex: hex.toUpperCase(), a };
}

// What the user typed in a color field → a CSS color, or null if invalid.
export function colorFromText(text) {
  let t = text.trim();
  if (/^none$/i.test(t)) return 'transparent';
  const pct = /^(#?[0-9a-f]{3,8})\s+(\d{1,3})%$/i.exec(t);
  if (pct) {
    const hex = pct[1].startsWith('#') ? pct[1] : '#' + pct[1];
    const c = parseColor(resolveColor(hex));
    if (!c) return null;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${Math.min(100, +pct[2]) / 100})`;
  }
  if (/^[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(t)) t = '#' + t;
  return CSS.supports('color', t) ? t : null;
}

// Turn any CSS color (incl. var(--x)) into its computed rgb() string.
let probe;
export function resolveColor(value) {
  if (!probe) {
    probe = document.createElement('i');
    probe.style.display = 'none';
  }
  document.documentElement.appendChild(probe);
  probe.style.color = '';
  probe.style.color = value;
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
}


// ---------- The Figma view (roadmap Phase A1) ----------
// A pass-through layer is a wrapper you can't see and that adds no layout
// you'd notice: a plain wrapper around one thing, `display: contents`, or
// `<main>` (the page's content area).
// Layers and the canvas skip it, so its children show as children of the
// frame around it, the way you'd draw the page in Figma. The code is never
// changed for this; "Show all layers" (layerView.raw) shows the code's tree.
export const layerView = { raw: false };

const NOT_PASS = /^(A|BUTTON|LABEL|FORM|FIELDSET|DETAILS|SUMMARY|UL|OL|LI|TABLE|svg)$/i;
const transparent = (c) => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
const shownKids = (n) => [...n.children].filter((k) => !NOT_LAYER.test(k.tagName) && k.tagName !== 'EDIT-MODE-ROOT' && k.getClientRects().length);

export function passThrough(el) {
  if (layerView.raw || !(el instanceof HTMLElement) || !el.parentElement || el === document.body) return false;
  if (el.dataset.emNew || el.dataset.emCopyOf || NOT_PASS.test(el.tagName)) return false; // things you made, and controls, are real
  const cs = getComputedStyle(el);
  if (cs.display === 'contents') return true;
  if (!/^(block|flow-root)$/.test(cs.display) || cs.position !== 'static') return false;
  if ([...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())) return false; // holds text
  const kids = shownKids(el);
  if (!kids.length) return false;
  // A wrapper around several things groups them (a Figma group: moving it moves them all), so it's
  // real. The exception is <main>, the page's content area, which in Figma is just the page.
  if (kids.length > 1 && el.tagName !== 'MAIN') return false;
  const side = (s) => parseFloat(cs[`border${s}Width`]) || parseFloat(cs[`padding${s}`]);
  if (!transparent(cs.backgroundColor) || cs.backgroundImage !== 'none' || ['Top', 'Right', 'Bottom', 'Left'].some(side)) return false;
  if (cs.boxShadow !== 'none' || cs.outlineStyle !== 'none' || cs.overflow !== 'visible' || cs.opacity !== '1' ||
      cs.transform !== 'none' || cs.filter !== 'none' || cs.backdropFilter !== 'none') return false;
  // Exactly as big as what's inside: it adds no size of its own.
  const r = el.getBoundingClientRect();
  const rs = kids.map((k) => k.getBoundingClientRect());
  const near = (a, b) => Math.abs(a - b) < 1.5;
  return near(r.left, Math.min(...rs.map((x) => x.left))) && near(r.top, Math.min(...rs.map((x) => x.top))) &&
    near(r.right, Math.max(...rs.map((x) => x.right))) && near(r.bottom, Math.max(...rs.map((x) => x.bottom)));
}

// The frame an element sits in, in the Figma view (never above `root`).
export function visualParent(el, root) {
  let p = el.parentElement;
  while (p && p !== root && passThrough(p)) p = p.parentElement;
  return p;
}

// An element's children in the Figma view: pass-through wrappers are opened up.
export function visualKids(n, keep) {
  const out = [];
  for (const k of n.children) {
    if (!keep(k)) continue;
    if (passThrough(k)) out.push(...visualKids(k, keep));
    else out.push(k);
  }
  return out;
}

// A designer-friendly layer name from a class or tag ("nav-links" → "Nav links").
const TAG_NAME = { div: 'Frame', span: 'Text', p: 'Paragraph', a: 'Link', ul: 'List', ol: 'List', li: 'List item', img: 'Image' };
export function friendlyName(n) {
  const cls = [...n.classList].find((c) => !/^(is|has)-/.test(c));
  const tag = n.tagName.toLowerCase();
  const raw = cls ? cls.replace(/--.*$/, '') : TAG_NAME[tag] || tag;
  const words = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : raw;
}

// ---------- The design canvas (roadmap B2, design.js) ----------
// The canvas area sits on the board beside the page. Anything inside it is
// "on the canvas": undoable like the page, but never pushed (until B3).
export const CANVAS_ATTR = 'data-em-canvas';
export const canvasArea = () => document.querySelector(`[${CANVAS_ATTR}]`);
export const onCanvas = (el) => !!el?.closest?.(`[${CANVAS_ATTR}]`);

// A design moved (or pasted) from the canvas onto the live page: not code
// yet, so its edits stay out of the page's Push list; Push builds it there.
export const PLACED_ATTR = 'data-em-placed';
export const placedOf = (el) => (el?.closest && !onCanvas(el) ? el.closest(`[${PLACED_ATTR}]`) : null);
export const placedDesigns = () => [...document.querySelectorAll(`[${PLACED_ATTR}]`)]
  .filter((n) => !onCanvas(n) && !n.parentElement?.closest(`[${PLACED_ATTR}]`));
