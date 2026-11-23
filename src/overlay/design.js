// The design canvas (roadmap B2): an area on the same board as the live page,
// 160px to its right. It lives inside <body>, so canvas.js zooms and pans it
// with the page, and the page's own styles apply to what's on it. It exists
// only while Edit Mode is on, and its HTML is saved to .editmode/canvas.json
// (through /@edit-mode/canvas) shortly after every change.
//
// Top-level items are placed at x/y inside the area (like Figma's top-level
// frames); what's inside them follows their own layout.

import { CANVAS_ATTR, PLACED_ATTR, placedDesigns } from './util.js';

const GAP = 160; // between the page and the canvas
const MIN_W = 1440;
const MIN_H = 1000;
const ROOM = 400; // free space kept to the right of and below the content
const SAVE_MS = 400;

// A fresh canvas starts empty: the whole space is yours (Figma's new page);
// main.js offers Duplicate page while it's empty.
export function createDesign() {
  let area = null;
  let observer = null;
  let timer = 0;
  let loading = false;

  // Grow the area to hold its content plus some room, so the board pans to it.
  function size() {
    let w = MIN_W;
    let h = MIN_H;
    for (const k of area.children) {
      w = Math.max(w, k.offsetLeft + k.offsetWidth + ROOM);
      h = Math.max(h, k.offsetTop + k.offsetHeight + ROOM);
    }
    area.style.width = `${w}px`;
    area.style.height = `${h}px`;
  }

  // Designs moved onto the live page aren't code yet: they're saved back at
  // their spot on the canvas, so a reload (or a Push that doesn't build them)
  // never loses them.
  function html() {
    let out = area.innerHTML;
    for (const n of placedDesigns()) {
      const c = n.cloneNode(true);
      let home = null;
      try { home = JSON.parse(n.dataset.emHome || 'null'); } catch {}
      c.removeAttribute(PLACED_ATTR);
      c.removeAttribute('data-em-home');
      const set = (p, v) => c.style.setProperty(p, v, 'important');
      set('position', 'absolute');
      set('left', `${Math.round(home?.left ?? 0)}px`); set('top', `${Math.round(home?.top ?? 0)}px`);
      set('right', 'auto'); set('bottom', 'auto');
      out += c.outerHTML;
    }
    return out;
  }
  function save({ keepalive = false } = {}) {
    clearTimeout(timer);
    timer = 0;
    if (!area || loading) return;
    fetch('/@edit-mode/canvas', {
      method: 'PUT', keepalive,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: html() }),
    }).catch(() => {});
  }
  const flush = () => { if (timer) save({ keepalive: true }); };

  async function mount() {
    if (area) return;
    area = document.createElement('div');
    area.setAttribute(CANVAS_ATTR, '');
    area.style.cssText = `position: absolute; top: 0; left: calc(100% + ${GAP}px); margin: 0; padding: 0; width: ${MIN_W}px; height: ${MIN_H}px;`;
    document.body.append(area);
    loading = true;
    try {
      const data = await (await fetch('/@edit-mode/canvas')).json();
      if (area) {
        area.innerHTML = data.html || '';
        // Session-only markers would clash with this session's numbering ("All like this" families).
        for (const n of area.querySelectorAll(`[data-em-new], [data-em-copy-of], [contenteditable], [${PLACED_ATTR}], [data-em-home]`)) {
          n.removeAttribute('data-em-new');
          n.removeAttribute('data-em-copy-of');
          n.removeAttribute('contenteditable');
          n.removeAttribute(PLACED_ATTR);
          n.removeAttribute('data-em-home');
        }
      }
    } catch {}
    loading = false;
    if (!area) return;
    size();
    observer = new MutationObserver((list) => {
      if (loading || list.every((m) => m.target === area && m.type === 'attributes')) return; // our own resizing
      size();
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_MS);
    });
    observer.observe(area, { subtree: true, childList: true, attributes: true, characterData: true });
    addEventListener('pagehide', flush);
  }

  function unmount() {
    if (!area) return;
    flush();
    observer?.disconnect();
    removeEventListener('pagehide', flush);
    area.remove();
    area = null;
  }

  // Screen rect around what's on the canvas (null when it's empty).
  function contentRect() {
    if (!area?.children.length) return null;
    const rs = [...area.children].map((k) => k.getBoundingClientRect()).filter((r) => r.width || r.height);
    if (!rs.length) return null;
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  return {
    mount, unmount, contentRect,
    get el() { return area; },
    saveNow: () => save(), // for tests
    touch() { if (area && !loading) { clearTimeout(timer); timer = setTimeout(save, SAVE_MS); } }, // something saved with it changed elsewhere
  };
}

// ---------- Copies from the page (C3) ----------
// A copy keeps its classes, and remembers its source: each node's data-src
// becomes data-em-from="file:line:col#index" (the index among elements
// rendered from that line), so Push can compare it with its original (B3)
// and "All like this" never mixes copies with the page. Ids move to
// data-em-id (no duplicate ids in the document).
export function cloneToCanvas(orig, { ATTR, sameSource }) {
  const copy = orig.cloneNode(true);
  const from = [orig, ...orig.querySelectorAll('*')];
  const to = [copy, ...copy.querySelectorAll('*')];
  to.forEach((n, i) => {
    const o = from[i];
    const src = o.getAttribute?.(ATTR);
    if (src) n.dataset.emFrom = `${src}#${sameSource(o).indexOf(o)}`;
    n.removeAttribute(ATTR);
    for (const a of ['data-em-new', 'data-em-copy-of', 'data-em-kind', 'contenteditable']) n.removeAttribute(a);
    if (n.id) { n.dataset.emId = n.id; n.removeAttribute('id'); }
  });
  // How it sat in its parent (its "slot"), for Push to keep (B3).
  const cs = getComputedStyle(orig);
  const parentSrc = orig.parentElement?.closest(`[${ATTR}]`);
  copy.dataset.emSlot = JSON.stringify({
    parent: parentSrc ? `${parentSrc.getAttribute(ATTR)}#${sameSource(parentSrc).indexOf(parentSrc)}` : null,
    index: orig.parentElement ? [...orig.parentElement.children].indexOf(orig) : 0,
    styles: Object.fromEntries(SLOT.map((p) => [p, cs.getPropertyValue(p)])),
  });
  return { copy, from, to, looks: from.map((o) => snapshot(o)) };
}

// How the original looked, captured before the copy is placed.
const SKIP = new Set(['width', 'height', 'inline-size', 'block-size', 'min-width', 'min-height', 'min-inline-size', 'min-block-size',
  'transform-origin', 'perspective-origin']); // sizes stay free to reflow inside the copy
const SLOT = ['position', 'top', 'right', 'bottom', 'left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'grid-area', 'grid-column', 'grid-row', 'align-self', 'justify-self', 'flex', 'order', 'z-index', 'width', 'height'];
function snapshot(el) {
  const cs = getComputedStyle(el);
  const out = {};
  for (let i = 0; i < cs.length; i++) { const p = cs[i]; if (!SKIP.has(p) && !p.startsWith('--')) out[p] = cs.getPropertyValue(p); }
  for (const p of autoMargins(el)) out[p] = 'auto';
  return out;
}
// Margins that are `auto` (a centered column). Chrome sometimes reports an
// auto margin as 0px after a re-layout, though the page still shows it
// centered; and `auto` keeps a copy centered when its frame is resized.
const MARGIN = /^margin-(top|right|bottom|left|inline-start|inline-end|block-start|block-end)$/;
function autoMargins(el) {
  const map = el.computedStyleMap?.();
  if (!map) return [];
  const out = [];
  for (const [p, v] of map) if (MARGIN.test(p) && String(v) === 'auto') out.push(p);
  return out;
}
// The value to compare with a snapshot: `auto` margins read as auto.
function current(n, now, autos, p) { return autos.has(p) ? 'auto' : now.getPropertyValue(p); }

// Once the copy is in place: write inline every style that came out
// different from the original (ancestor selectors, inherited font and
// color, variables set on a parent). Top-down, so a parent's fix reaches
// its children before they're compared. The copy's root sheds its slot.
export function matchLook({ to, looks }, rootStyles) {
  to.forEach((n, i) => {
    const want = looks[i];
    const now = getComputedStyle(n);
    const autos = new Set(autoMargins(n));
    for (const p in want) {
      if (i === 0 && SLOT.includes(p)) continue;
      if (current(n, now, autos, p) !== want[p]) n.style.setProperty(p, want[p]);
    }
  });
  for (const [p, v] of Object.entries(rootStyles)) to[0].style.setProperty(p, v);
}

// ---------- Moving things on the canvas (C4a) ----------
// Something moved into another frame can lose styles that came from its old
// surroundings (inherited font and color, ancestor selectors like `.card h3`).
// Figma layers don't inherit, so the look is kept: snapshot it before the
// move, then write back whatever came out different. The root's own place
// (position, insets, margins, size, flex/grid slot) is left to the move.
const ROOT_PLACE = /^(position|top|right|bottom|left|inset|margin|grid|align-self|justify-self|place-self|flex|order|z-index|width|height|min-|max-|inline-size|block-size|translate)/;
export function lookOf(el) {
  const to = [el, ...el.querySelectorAll('*')];
  return { to, looks: to.map(snapshot) };
}
export function keepLook({ to, looks }, set) {
  to.forEach((n, i) => {
    const want = looks[i];
    const now = getComputedStyle(n);
    const autos = new Set(autoMargins(n));
    for (const p in want) {
      if (i === 0 && ROOT_PLACE.test(p)) continue;
      if (current(n, now, autos, p) !== want[p]) set(n, p, want[p]);
    }
  });
}
