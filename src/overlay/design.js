// The design canvas (roadmap B2): an area on the same board as the live page,
// 160px to its right. It lives inside <body>, so canvas.js zooms and pans it
// with the page, and the page's own styles apply to what's on it. It exists
// only while Edit Mode is on, and its HTML is saved to .editmode/canvas.json
// (through /@edit-mode/canvas) shortly after every change.
//
// Top-level items are placed at x/y inside the area (like Figma's top-level
// frames); what's inside them follows their own layout.

import { CANVAS_ATTR } from './util.js';

const GAP = 160; // between the page and the canvas
const MIN_W = 1440;
const MIN_H = 1000;
const ROOM = 400; // free space kept to the right of and below the content
const SAVE_MS = 400;

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

  const html = () => area.innerHTML;
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
      if (area) area.innerHTML = data.html || '';
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
  };
}
