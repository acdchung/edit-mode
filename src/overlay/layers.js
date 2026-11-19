// The Layers panel (left side): the page's element tree, like Figma's.
//
// Rows are rebuilt from the DOM whenever it changes (edits, undo/redo,
// React re-renders), so there's no separate model to fall out of sync.
// Order is DOM order, top to bottom, which matches how a page reads
// (Figma lists the topmost layer first; on a web page that's usually last).

import { describe } from './util.js';
import { textNodeOf } from './changes.js';
import { ICON } from './icons.js';

const NOT_LAYER = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK|META)$/;
const INDENT = 14;

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

export function createLayers({ state, changes, host, pageRoot, select, selectAll, canContain, onToggle }) {
  const el = h('div', 'layers glassy');
  el.hidden = true;
  el.innerHTML = `<div class="lh"><span>Layers</span></div><div class="lb" role="tree"></div><div class="ldrop" hidden></div>`;
  const body = el.querySelector('.lb');
  const dropLine = el.querySelector('.ldrop');

  const expanded = new WeakSet();
  const seen = new WeakSet(); // tops already opened once by default (after that, the user decides)
  let rows = []; // [{ el, row, depth }]
  const rowOf = new WeakMap();
  let dirty = true;
  let lastSel = null;
  let lastMark = '';
  let anchor = null; // where a Shift-click range starts
  let drag = null;

  // ---------- What's a layer ----------
  const hiddenByUs = (n) => n.style.getPropertyValue('display') === 'none';
  const isHidden = (n) => { for (let x = n; x && x !== document.body; x = x.parentElement) if (hiddenByUs(x)) return true; return false; };
  const isLocked = (n) => { for (let x = n; x && x !== document.body; x = x.parentElement) if (state.locked.has(x)) return true; return false; };

  function kidsOf(n, underHidden) {
    return [...n.children].filter((k) => {
      if (k === host || NOT_LAYER.test(k.tagName) || k.closest('svg') !== k && k.closest('svg')) return false;
      if (k.getClientRects().length || hiddenByUs(k)) return true;
      return underHidden && getComputedStyle(k).display !== 'none';
    });
  }
  const leafOf = (n) => n.tagName.toLowerCase() === 'svg' || n instanceof SVGElement;

  function nameOf(n) {
    const tag = n.tagName.toLowerCase();
    if (n.dataset.emNew && !n.children.length && !textNodeOf(n)) return n.style.borderRadius === '50%' ? 'Ellipse' : 'Rectangle';
    const text = textNodeOf(n)?.nodeValue.trim();
    if (text) return text.length > 40 ? text.slice(0, 40) + '…' : text;
    if (tag === 'img') return n.alt || 'Image';
    if (n.dataset.emNew) return 'Frame';
    if (tag === 'svg') return n.classList[0] || 'Vector';
    const cls = [...n.classList][0];
    if (cls) return cls;
    if (tag === 'input') return n.placeholder || 'input';
    return tag;
  }

  function iconOf(n) {
    const tag = n.tagName.toLowerCase();
    if (tag === 'svg') return ICON.vector;
    if (/^(img|picture|video)$/.test(tag)) return ICON.image;
    if (textNodeOf(n)) return ICON.text;
    if (n.dataset.emNew && !n.children.length) return n.style.borderRadius === '50%' ? ICON.ellipse : ICON.rect;
    const cs = getComputedStyle(n);
    if (/flex/.test(cs.display)) return cs.flexDirection.startsWith('column') ? ICON.stackCol : ICON.stackRow;
    return n.children.length ? ICON.frame : ICON.rect;
  }

  // ---------- Build ----------
  function build() {
    dirty = false;
    const root = pageRoot();
    const scroll = body.scrollTop;
    body.textContent = '';
    rows = [];
    if (!root || root === document.body) {
      for (const k of kidsOf(document.body, false)) add(k, 0, false);
    } else {
      if (!seen.has(root)) { seen.add(root); expanded.add(root); }
      add(root, 0, false);
    }
    body.scrollTop = scroll;
    lastMark = '';
    mark();
  }

  function add(n, depth, underHidden) {
    const hidden = underHidden || hiddenByUs(n);
    const kids = leafOf(n) ? [] : kidsOf(n, hidden);
    const open = kids.length && expanded.has(n);
    const row = h('div', 'lrow');
    row.setAttribute('role', 'treeitem');
    row.style.paddingLeft = `${4 + depth * INDENT}px`;
    row.title = describe(n);
    row.classList.toggle('dim', hidden);
    row.classList.toggle('locked', state.locked.has(n));
    const caret = h('span', 'caret' + (kids.length ? '' : ' none') + (open ? ' open' : ''), kids.length ? ICON.caret : '');
    const icon = h('span', 'licon', iconOf(n));
    const name = h('span', 'lname');
    name.textContent = nameOf(n);
    const lock = h('button', 'lbtn lock' + (state.locked.has(n) ? ' on' : ''), state.locked.has(n) ? ICON.lock : ICON.unlock);
    lock.title = state.locked.has(n) ? 'Unlock' : 'Lock';
    const eye = h('button', 'lbtn eye' + (hiddenByUs(n) ? ' on' : ''), hiddenByUs(n) ? ICON.eyeOff : ICON.eye);
    eye.title = hiddenByUs(n) ? 'Show' : 'Hide';
    row.append(caret, icon, name, lock, eye);
    if (kids.length) row.setAttribute('aria-expanded', String(!!open));
    body.append(row);
    const entry = { el: n, row, depth };
    rows.push(entry);
    rowOf.set(n, entry);

    caret.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    caret.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!kids.length) return;
      const next = !expanded.has(n);
      if (e.altKey) for (const d of [n, ...n.querySelectorAll('*')]) next ? expanded.add(d) : expanded.delete(d); // ⌥-click: all the way down
      else next ? expanded.add(n) : expanded.delete(n);
      build();
    });
    for (const b of [lock, eye]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    lock.addEventListener('click', (e) => { e.stopPropagation(); toggleLock(n); });
    eye.addEventListener('click', (e) => { e.stopPropagation(); toggleHidden(n); });
    row.addEventListener('pointerenter', () => { if (!drag) state.hovered = n; });
    row.addEventListener('pointerleave', () => { if (!drag && state.hovered === n) state.hovered = null; });
    row.addEventListener('pointerdown', (e) => pressRow(e, entry));

    if (open) for (const k of kids) add(k, depth + 1, hidden);
  }

  // Selection, hover and multi-selection marks, without rebuilding.
  function mark() {
    const sel = state.selected;
    const key = [sel, state.hovered, ...state.multi].map((x) => (x ? rows.findIndex((r) => r.el === x) : -1)).join(',');
    if (key === lastMark) return;
    lastMark = key;
    for (const r of rows) {
      const picked = state.multi.includes(r.el);
      r.row.classList.toggle('sel', picked);
      r.row.classList.toggle('in-sel', !picked && state.multi.some((m) => m.contains(r.el)));
      r.row.classList.toggle('hov', r.el === state.hovered && !picked);
      r.row.setAttribute('aria-selected', String(picked));
    }
  }

  // Open the tree down to the selection and scroll it into view.
  function reveal(n) {
    let changed = false;
    for (let x = n.parentElement; x && x !== document.body; x = x.parentElement) {
      if (!expanded.has(x)) { expanded.add(x); changed = true; }
    }
    if (changed || !rowOf.get(n) || !rows.includes(rowOf.get(n))) build();
    const r = rowOf.get(n);
    if (!r) return;
    const top = r.row.offsetTop;
    const bottom = top + r.row.offsetHeight;
    if (top < body.scrollTop) body.scrollTop = top - 8;
    else if (bottom > body.scrollTop + body.clientHeight) body.scrollTop = bottom - body.clientHeight + 8;
  }

  // Called from the overlay's animation frame.
  function sync() {
    if (el.hidden) return;
    if (dirty && !drag) build();
    if (state.selected !== lastSel) {
      lastSel = state.selected;
      if (lastSel?.isConnected) reveal(lastSel);
    }
    mark();
  }

  // Rebuild after anything changes the page.
  const observer = new MutationObserver((list) => {
    if (list.some((m) => m.target !== body && !el.contains(m.target))) dirty = true;
  });
  const watch = (on) => {
    if (on) observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    else observer.disconnect();
  };

  // ---------- Clicks ----------
  function pressRow(e, entry) {
    if (e.button !== 0) return;
    e.preventDefault();
    const n = entry.el;
    if (e.shiftKey && anchor && rows.some((r) => r.el === anchor)) {
      const a = rows.findIndex((r) => r.el === anchor);
      const b = rows.indexOf(entry);
      const range = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.el);
      selectAll(range.filter((x) => !range.some((y) => y !== x && y.contains(x))));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      anchor = n;
      const has = state.multi.includes(n);
      const next = has ? state.multi.filter((x) => x !== n) : [...state.multi.filter((x) => !x.contains(n) && !n.contains(x)), n];
      if (next.length) selectAll(next); else select(null);
      return;
    }
    anchor = n;
    const keep = state.multi.length > 1 && state.multi.includes(n);
    if (!keep) select(n);
    drag = { el: n, x: e.clientX, y: e.clientY, started: false, keep, drop: null };
    el.setPointerCapture(e.pointerId);
  }

  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      if (drag.el === pageRoot()) return; // the page itself stays put
      drag.started = true;
      el.classList.add('dragging');
    }
    drag.drop = dropAt(e.clientX, e.clientY);
    showDrop(drag.drop);
    state.hovered = drag.drop?.container ?? null;
  });

  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    el.classList.remove('dragging');
    dropLine.hidden = true;
    for (const r of rows) r.row.classList.remove('into');
    state.hovered = null;
    if (!d.started) { if (d.keep && e.type === 'pointerup') select(d.el); return; }
    if (e.type !== 'pointerup' || !d.drop) { dirty = true; return; }
    const { container, toIndex } = d.drop;
    const others = [...container.children].filter((k) => k !== d.el);
    if (container !== d.el.parentElement || others[toIndex] !== d.el.nextElementSibling) {
      changes.batch(null, () => changes.move(d.el, state.scope, toIndex, container));
      expanded.add(container);
    }
    select(d.el);
    dirty = true;
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  // Where a dragged row would land: before / after a row, or into a frame
  // (the middle of a frame's row; it goes in as the last child).
  function dropAt(x, y) {
    const moving = drag.el;
    const root = pageRoot();
    const hitRow = rows.find((r) => { const b = r.row.getBoundingClientRect(); return y >= b.top && y < b.bottom; })
      ?? (y > body.getBoundingClientRect().bottom - 4 ? rows[rows.length - 1] : null);
    if (!hitRow || moving.contains(hitRow.el)) return null;
    const b = hitRow.row.getBoundingClientRect();
    const t = (y - b.top) / b.height;
    const n = hitRow.el;
    const can = canContain(n) && !leafOf(n);
    let where = can ? (t < 0.25 ? 'before' : t > 0.75 ? 'after' : 'into') : (t < 0.5 ? 'before' : 'after');
    if (n === root) where = 'into';
    if (where === 'after' && can && expanded.has(n) && kidsOf(n, false).length) {
      // Below an open frame's row is its first child's spot, as in Figma.
      return place(n, 0, hitRow, 'first');
    }
    if (where === 'into') {
      if (!can) return null;
      const others = [...n.children].filter((k) => k !== moving);
      return place(n, others.length, hitRow, 'into');
    }
    const container = n.parentElement;
    if (!container || container === document.body || container === document.documentElement || !root.contains(container)) return null;
    const others = [...container.children].filter((k) => k !== moving);
    const i = others.indexOf(n);
    return place(container, where === 'before' ? i : i + 1, hitRow, where);
  }

  function place(container, toIndex, hitRow, where) {
    return { container, toIndex, row: hitRow, where };
  }

  function showDrop(drop) {
    for (const r of rows) r.row.classList.toggle('into', !!drop && drop.where === 'into' && r === drop.row);
    dropLine.hidden = !drop || drop.where === 'into';
    if (dropLine.hidden) return;
    const box = el.getBoundingClientRect();
    const b = drop.row.row.getBoundingClientRect();
    const depth = drop.where === 'first' ? drop.row.depth + 1 : drop.row.depth;
    const y = drop.where === 'before' ? b.top : b.bottom;
    dropLine.style.top = `${y - box.top - 1}px`;
    dropLine.style.left = `${4 + depth * INDENT + 18}px`;
  }

  // ---------- Hide and lock ----------
  function toggleHidden(n) {
    if (hiddenByUs(n)) {
      if (changes.has(n, 'one', 'display')) changes.revert(n, 'one', 'display');
      else changes.set(n, 'one', 'display', '');
    } else changes.set(n, 'one', 'display', 'none');
    dirty = true;
  }

  // Lock is overlay-only (Figma: can't be picked on the canvas). Not pushed.
  function toggleLock(n) {
    if (state.locked.has(n)) state.locked.delete(n); else state.locked.add(n);
    dirty = true;
  }

  // ---------- Open / close ----------
  function setOpen(open) {
    el.hidden = !open;
    watch(open);
    if (open) { dirty = true; lastSel = null; sync(); }
    onToggle(open);
  }

  return {
    el,
    sync,
    setOpen,
    get open() { return !el.hidden; },
    isLocked,
    toggleHidden,
    toggleLock,
    refresh: () => { dirty = true; },
    rowFor: (n) => (rows.includes(rowOf.get(n)) ? rowOf.get(n).row : null), // for tests
  };
}
