// Canvas: zoom and pan the live page like a Figma frame.
//
// While edit mode is on, the page's <body> is moved with one transform,
// translate(tx, ty) scale(z), and the window itself doesn't scroll. The
// Edit Mode UI lives outside <body> (on <html>), so it isn't zoomed, and
// getBoundingClientRect keeps returning on-screen boxes, so everything
// drawn over the page lines up at any zoom. Sizes shown or set in CSS
// pixels go through `box()` / `view.z` (util.js).
//
// Known limit: a transform makes position: fixed / sticky elements in the
// app scroll with the page while editing. At 100% the page otherwise looks
// exactly as before.

import { view } from './util.js';

const STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const MIN = 0.1;
const MAX = 4;
const CANVAS = '#e9e9eb';
const KEEP = 80; // px of the page that always stays on screen

export function createCanvas({ onChange = () => {}, area = () => ({ left: 0, right: innerWidth, top: 0, bottom: innerHeight }) } = {}) {
  let on = false;
  let tx = 0;
  let ty = 0;
  let saved = null;

  const html = document.documentElement;
  const body = () => document.body;

  // Inline styles we set, with what was there before, so exit() puts them back.
  function setStyle(el, prop, value) {
    saved.styles.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, 'important');
  }

  const setTransform = (b) => b.style.setProperty('transform', `translate(${tx}px, ${ty}px) scale(${view.z})`, 'important');

  // Write the transform, then keep some of the page on screen wherever you pan.
  function apply() {
    const b = body();
    if (!b) return;
    setTransform(b);
    const r = b.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (r.right < KEEP) dx = KEEP - r.right;
    else if (r.left > innerWidth - KEEP) dx = innerWidth - KEEP - r.left;
    if (r.bottom < KEEP) dy = KEEP - r.bottom;
    else if (r.top > innerHeight - KEEP) dy = innerHeight - KEEP - r.top;
    if (dx || dy) { tx += dx; ty += dy; setTransform(b); }
    onChange();
  }

  function enter() {
    if (on || !body()) return;
    on = true;
    const b = body();
    saved = { x: scrollX, y: scrollY, styles: [] };
    const bcs = getComputedStyle(b);
    const hcs = getComputedStyle(html);
    const clear = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    // The page keeps its own background; the area around it becomes canvas.
    const pageBg = !clear(bcs.backgroundColor) ? null : !clear(hcs.backgroundColor) ? hcs.backgroundColor : '#ffffff';
    // Body margin would show as canvas around the page: make it padding instead
    // (same layout, but painted with the page's background).
    const m = ['top', 'right', 'bottom', 'left'].map((s) => bcs.getPropertyValue(`margin-${s}`));
    setStyle(html, 'overflow', 'hidden');
    setStyle(html, 'background', CANVAS);
    if (pageBg) setStyle(b, 'background-color', pageBg);
    if (m.some((v) => parseFloat(v))) {
      ['top', 'right', 'bottom', 'left'].forEach((s, i) => {
        setStyle(b, `padding-${s}`, `calc(${bcs.getPropertyValue(`padding-${s}`)} + ${m[i]})`);
        setStyle(b, `margin-${s}`, '0px');
      });
    }
    if (b.getBoundingClientRect().height < innerHeight) setStyle(b, 'min-height', '100vh');
    setStyle(b, 'transform-origin', '0 0');
    setStyle(b, 'box-shadow', '0 0 0 1px rgba(0,0,0,.06), 0 2px 12px rgba(0,0,0,.08)');
    window.scrollTo(0, 0);
    view.z = 1;
    tx = -saved.x;
    ty = -saved.y;
    apply();
  }

  function exit() {
    if (!on) return;
    on = false;
    const top = -ty / view.z;
    const left = -tx / view.z;
    for (const [el, prop, value, prio] of saved.styles.reverse()) {
      if (value) el.style.setProperty(prop, value, prio);
      else el.style.removeProperty(prop);
      if (el.getAttribute('style') === '') el.removeAttribute('style');
    }
    const b = body();
    b?.style.removeProperty('transform');
    if (b?.getAttribute('style') === '') b.removeAttribute('style');
    view.z = 1;
    tx = ty = 0;
    saved = null;
    window.scrollTo(Math.max(0, left), Math.max(0, top));
    onChange();
  }

  // Zoom to z, keeping the page point under (cx, cy) where it is.
  function zoomAt(z, cx = innerWidth / 2, cy = innerHeight / 2) {
    if (!on) return;
    z = Math.min(MAX, Math.max(MIN, z));
    const b = body().getBoundingClientRect();
    const k = z / view.z;
    // b.left/top is where the body's origin is on screen; scale around (cx, cy).
    const nx = cx - (cx - b.left) * k;
    const ny = cy - (cy - b.top) * k;
    tx += nx - b.left;
    ty += ny - b.top;
    view.z = z;
    apply();
  }

  const step = (dir) => {
    const z = view.z;
    const next = dir > 0 ? STEPS.find((s) => s > z + 0.001) ?? MAX : [...STEPS].reverse().find((s) => s < z - 0.001) ?? MIN;
    zoomAt(next);
  };

  function panBy(dx, dy) {
    if (!on) return;
    tx += dx;
    ty += dy;
    apply();
  }

  // Fit a screen rect (part of the page, at the current zoom) into the free
  // area between the panels: centred, or at the top when it's too tall.
  function fitRect(r, { maxZ = MAX, top = false } = {}) {
    if (!on) return;
    const a = area();
    const pad = 24;
    const w = a.right - a.left - pad * 2;
    const h = a.bottom - a.top - pad * 2;
    const z0 = view.z;
    const b0 = body().getBoundingClientRect();
    const px = (r.left - b0.left) / z0; // the rect's offset inside the page, in CSS px
    const py = (r.top - b0.top) / z0;
    const cssW = r.width / z0;
    const cssH = r.height / z0;
    const z = Math.min(maxZ, MAX, Math.max(MIN, Math.min(w / cssW, top ? Infinity : h / cssH)));
    const nw = cssW * z;
    const nh = cssH * z;
    const left = (a.left + a.right) / 2 - nw / 2;
    const topY = top || nh > h ? a.top + pad : (a.top + a.bottom) / 2 - nh / 2;
    view.z = z;
    apply();
    const b1 = body().getBoundingClientRect();
    tx += left - px * z - b1.left;
    ty += topY - py * z - b1.top;
    apply();
  }

  // The whole page width between the panels, top of the page at the top.
  function fit() {
    if (!on) return;
    const b = body().getBoundingClientRect();
    fitRect({ left: b.left, top: b.top, width: b.width, height: b.height }, { maxZ: 1, top: true });
  }

  function toSelection(el) {
    if (!on || !el) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    fitRect({ left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 }, { maxZ: 4 });
  }

  function reset() {
    zoomAt(1);
  }

  return {
    enter, exit, zoomAt, step, panBy, fit, toSelection, reset,
  };
}
