// Edit Mode overlay — runs in the browser, injected by the Vite plugin.
// Everything visual lives inside a Shadow DOM so app CSS can't touch it
// and its CSS can't touch the app.

import { STYLES } from './styles.js';
import { ATTR, NOT_LAYER, box, describe, family, num, parseColor, sameSource, view } from './util.js';
import { createCanvas } from './canvas.js';
import { createChanges, textNodeOf } from './changes.js';
import { collectTokens } from './tokens.js';
import { createPanel } from './panel.js';
import { createLayers } from './layers.js';
import { ICON, KEY as GLYPH } from './icons.js';

if (!window.__editModeOverlay) {
  window.__editModeOverlay = true;
  init();
}

function init() {
  const KEY = { on: 'edit-mode:on', toast: 'edit-mode:toast', reapply: 'edit-mode:reapply' };
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} },
  };

  // ---------- DOM ----------
  const host = document.createElement('edit-mode-root');
  host.style.cssText =
    'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${STYLES}</style>
    <div class="ui">
      <div class="glass" hidden></div>
      <div class="layer sibs"></div>
      <div class="layer hints"></div>
      <div class="hover" hidden></div>
      <div class="target" hidden></div>
      <div class="ghost" hidden></div>
      <div class="insert" hidden></div>
      <div class="layer measure"></div>
      <div class="frame" hidden>
        ${['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map((d) => `<i class="handle" data-dir="${d}"></i>`).join('')}
        <div class="size"></div>
      </div>
      <div class="layer multis"></div>
      <div class="dock">
        <div class="slot"></div>
        <div class="tools glassy" hidden>
          <button data-tool="select" title="Select (V)" aria-label="Select tool">${ICON.select}</button>
          <button data-tool="rect" title="Rectangle (R)" aria-label="Rectangle tool">${ICON.rect}</button>
          <button data-tool="ellipse" title="Ellipse (O)" aria-label="Ellipse tool">${ICON.ellipse}</button>
          <button data-tool="text" title="Text (T)" aria-label="Text tool">${ICON.text}</button>
          <span class="tsep"></span>
          <button class="layers-btn" title="Layers (⌥1)" aria-label="Layers panel" aria-pressed="false">${ICON.layers}</button>
          <button class="zoom-btn" title="Zoom" aria-label="Zoom" aria-haspopup="menu">100%</button>
        </div>
        <div class="zmenu glassy" role="menu" hidden></div>
        <div class="pill glassy">
          <button class="toggle" aria-pressed="false" title="Edit mode (⌥E)">
            <span class="switch"><i></i></span><span>Edit</span><kbd>${GLYPH.option}E</kbd>
          </button>
          <span class="pill-end"></span>
        </div>
      </div>
    </div>`;

  const $ = (sel) => shadow.querySelector(sel);
  const ui = $('.ui');
  const glass = $('.glass');
  const hoverBox = $('.hover');
  const frame = $('.frame');
  const sizeLabel = $('.size');
  const toggleBtn = $('.toggle');
  const pillEnd = $('.pill-end');
  const slot = $('.slot');
  const sibLayer = $('.sibs');
  const hintLayer = $('.hints');
  const ghostBox = $('.ghost');
  const measureLayer = $('.measure');
  const targetBox = $('.target');
  const insertLine = $('.insert');

  // ---------- State ----------
  const state = {
    multi: [], // all selected elements (siblings) when shift-clicking
    tool: 'select', // select | rect | ellipse | text
    on: false,
    hovered: null,
    selected: null,
    scope: 'one',
    hint: null,
    tokens: null,
    editing: null, // element whose text is being edited
    phase: 'idle', // idle | running (Claude is applying) | undoing
    server: null, // last /status response
    locked: new WeakSet(), // locked in the Layers panel: not pickable on the canvas (overlay-only)
    ratio: new WeakMap(), // constrain proportions: element → width / height (overlay-only)
  };
  let raf = 0;
  let pingTimer = 0;

  const changes = createChanges(() => {
    renderPill();
    if (state.selected) panel.refresh(); // Layers watches the page itself
  }, {
    // Undo/redo put the selection back to what it was at that point, like Figma.
    getSelection: () => [...state.multi],
    setSelection: (els) => {
      const live = els.filter((x) => x.isConnected && x.getClientRects().length);
      if (live.length) selectAll(live);
      else if (state.selected && !state.selected.getClientRects().length) select(pickable(state.selected.parentElement));
    },
  });
  const panel = createPanel({
    shadow,
    state,
    changes,
    tokens: () => (state.tokens ||= collectTokens()),
    setHint: (hint) => (state.hint = hint),
    setScope: (scope) => {
      state.scope = scope;
      panel.show(state.selected);
    },
    onEdit: () => panel.refresh(),
    groupSelection: () => groupSelection(),
    autoLayoutSelection: () => autoLayoutSelection(),
    deleteSelection: () => deleteSelection(),
  });
  const toolsBar = $('.tools');
  // Clicking toolbar, pill and panel buttons shouldn't leave them keyboard-focused
  // (that left a stray focus ring on the tool you'd clicked).
  shadow.addEventListener('mousedown', (e) => {
    if (e.composedPath()[0].closest?.('button, a')) e.preventDefault();
  });
  const multiLayer = $('.multis');
  for (const b of toolsBar.querySelectorAll('button[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
  ui.append(panel.el, panel.pop);

  // Layers panel (left). Open/closed is remembered per browser; open by default.
  const LAYERS_KEY = 'edit-mode:layers';
  const layersPref = () => { try { return localStorage.getItem(LAYERS_KEY) !== '0'; } catch { return true; } };
  const layersBtn = $('.layers-btn');
  const layers = createLayers({
    state, changes, host,
    pageRoot: () => pageRoot(),
    select: (el) => select(el),
    selectAll: (els) => selectAll(els),
    canContain: (n) => canContain(n),
    onToggle: (open) => {
      ui.classList.toggle('layers-open', open);
      layersBtn.setAttribute('aria-pressed', String(open));
      layersBtn.classList.toggle('on', open);
    },
  });
  ui.append(layers.el);

  // Canvas: zoom and pan the page (canvas.js). The free area is the space
  // between the panels and above the toolbar.
  const zoomBtn = $('.zoom-btn');
  const zmenu = $('.zmenu');
  ui.append(zmenu); // out of the dock: its transform would offset a fixed menu
  const canvas = createCanvas({
    onChange: () => {
      zoomBtn.textContent = `${Math.round(view.z * 100)}%`;
      // The page moved under a still pointer: hover what's under it now.
      if (pointer && !press && !drag && !draw && !pan && state.tool === 'select') state.hovered = hoverAt(pointer.x, pointer.y, pointer);
    },
    area: () => ({
      left: layers.open && !ui.classList.contains('ui-hidden') ? layers.el.getBoundingClientRect().right : 0,
      // Always leave room for the properties panel: it appears as soon as something is selected.
      right: ui.classList.contains('ui-hidden') ? innerWidth : innerWidth - 12 - 252,
      top: 0,
      bottom: innerHeight - 110, // the toolbar and pill
    }),
  });
  const ZOOM_ITEMS = [
    ['in', 'Zoom in', `${GLYPH.command}+`],
    ['out', 'Zoom out', `${GLYPH.command}−`],
    ['fit', 'Zoom to fit', `${GLYPH.shift}1`],
    ['100', 'Zoom to 100%', `${GLYPH.shift}0`],
    ['sel', 'Zoom to selection', `${GLYPH.shift}2`],
  ];
  function zoomAction(id) {
    if (id === 'in') canvas.step(1);
    else if (id === 'out') canvas.step(-1);
    else if (id === 'fit') canvas.fit();
    else if (id === '100') canvas.reset();
    else if (id === 'sel' && state.selected) canvas.toSelection(unionRect(selection()));
  }
  zmenu.innerHTML = ZOOM_ITEMS.map(([id, label, keys]) => `<button role="menuitem" data-z="${id}"><span>${label}</span><kbd>${keys}</kbd></button>`).join('');
  const closeZoomMenu = () => { zmenu.hidden = true; zoomBtn.classList.remove('on'); };
  zoomBtn.addEventListener('click', () => {
    if (!zmenu.hidden) return closeZoomMenu();
    zmenu.querySelector('[data-z="sel"]').disabled = !state.selected;
    zmenu.hidden = false;
    zoomBtn.classList.add('on');
    const b = zoomBtn.getBoundingClientRect();
    zmenu.style.left = `${Math.min(innerWidth - zmenu.offsetWidth - 8, b.left)}px`;
    zmenu.style.bottom = `${innerHeight - b.top + 8}px`;
  });
  zmenu.addEventListener('click', (e) => {
    const b = e.composedPath().find((n) => n.dataset?.z);
    if (!b || b.disabled) return;
    closeZoomMenu();
    zoomAction(b.dataset.z);
  });
  shadow.addEventListener('pointerdown', (e) => {
    if (!zmenu.hidden && !e.composedPath().some((n) => n === zmenu || n === zoomBtn)) closeZoomMenu();
  });
  window.addEventListener('pointerdown', (e) => {
    if (!zmenu.hidden && !e.composedPath().includes(host)) closeZoomMenu();
  }, true);

  function toggleLayers() {
    const next = !layers.open;
    try { localStorage.setItem(LAYERS_KEY, next ? '1' : '0'); } catch {}
    layers.setOpen(next);
  }
  layersBtn.addEventListener('click', toggleLayers);

  const mount = () => document.documentElement.appendChild(host);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // window.__editMode is handy for poking at state from the browser console.
  window.__editMode = { state, changes, layers };

  const h = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  };

  // ---------- Toggle ----------
  function setOn(next, { force = false } = {}) {
    if (next === state.on) return;
    if (!next && changes.count && !force) {
      const n = changes.count;
      confirmDialog({
        title: `Discard ${n} change${n === 1 ? '' : 's'}?`,
        text: 'Turning off edit mode throws away edits you haven’t pushed.',
        ok: 'Discard',
        onOk: () => setOn(false, { force: true }),
      });
      return;
    }
    if (state.editing) stopText();
    closeDialog();

    state.on = next;
    toolsBar.hidden = !next;
    layers.setOpen(next && layersPref());
    setTool('select');
    toggleBtn.setAttribute('aria-pressed', String(next));
    glass.hidden = !next;
    store.set(KEY.on, next ? '1' : null);

    if (next) {
      canvas.enter();
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      state.tokens = null;
      freeze(true);
      pingTimer = setInterval(() => freeze(true), 2000);
      loop();
    } else {
      changes.discardAll();
      closeZoomMenu();
      canvas.exit();
      select(null);
      state.hovered = null;
      clearInterval(pingTimer);
      freeze(false);
      cancelAnimationFrame(raf);
      render();
    }
    renderPill();
  }

  // Tell the dev server to hold hot-reload updates while editing.
  function freeze(on) {
    fetch('/@edit-mode/freeze', { method: 'POST', body: on ? 'on' : 'off', keepalive: true }).catch(() => {});
  }

  toggleBtn.addEventListener('click', () => {
    if (state.phase === 'idle') setOn(!state.on);
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.on && changes.count && state.phase === 'idle') {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------- Pill ----------
  // Rebuild the pill only when its shape changes, and morph its width when it does.
  const pill = $('.pill');
  let pillSig = '';
  function renderPill() {
    const n = changes.count;
    const sig = [state.phase, state.on, n > 0, !!state.server?.last?.undoable].join('|');
    if (sig === pillSig) {
      const badge = pillEnd.querySelector('.n');
      if (badge) badge.textContent = String(n);
      return;
    }
    pillSig = sig;
    const w0 = pill.getBoundingClientRect().width;
    buildPill();
    morph(pill, w0);
  }

  function morph(el, w0) {
    if (!w0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.style.transition = 'none';
    el.style.width = '';
    const w1 = el.getBoundingClientRect().width;
    if (Math.abs(w1 - w0) < 1) return;
    el.style.width = w0 + 'px';
    void el.offsetWidth;
    el.style.transition = 'width 180ms var(--ease)';
    el.style.width = w1 + 'px';
    clearTimeout(el._morph);
    el._morph = setTimeout(() => { el.style.width = ''; el.style.transition = ''; }, 200);
  }

  function buildPill() {
    pillEnd.replaceChildren();
    toggleBtn.disabled = state.phase !== 'idle';
    toggleBtn.querySelector('kbd').hidden = state.on;
    if (state.phase === 'running' || state.phase === 'undoing') {
      const s = h('span', 'status', '<span class="spin"></span>');
      s.append(state.phase === 'running' ? 'Claude is updating your code' : 'Restoring');
      pillEnd.append(h('span', 'sep'), s);
      return;
    }
    if (state.on) {
      const n = changes.count;
      const push = h('button', 'act', 'Push');
      push.title = 'Send changes to Claude (⌘↵)';
      push.disabled = !n;
      if (n) push.append(h('span', 'n', String(n)));
      push.addEventListener('click', openPushDialog);
      pillEnd.append(h('span', 'sep'), push);
    } else if (state.server?.last?.undoable) {
      const undo = h('button', 'act', 'Undo');
      undo.title = 'Undo Claude’s last pass';
      undo.addEventListener('click', openUndoDialog);
      pillEnd.append(h('span', 'sep'), undo);
    }
  }

  // ---------- Dialogs & toast ----------
  function closeDialog() {
    slot.replaceChildren();
  }

  function actions(okLabel, onOk, hint) {
    const row = h('div', 'actions');
    if (hint) row.append(h('span', 'hint', hint));
    const cancel = h('button', 'pbtn ghost', 'Cancel');
    const ok = h('button', 'pbtn primary', okLabel);
    cancel.addEventListener('click', closeDialog);
    ok.addEventListener('click', () => { closeDialog(); onOk(); });
    row.append(cancel, ok);
    return { row, ok };
  }

  function confirmDialog({ title, text, ok, onOk }) {
    const d = h('div', 'dialog glassy');
    d.append(h('h3', '', title));
    if (text) d.append(Object.assign(h('p'), { textContent: text }));
    const a = actions(ok, onOk);
    d.append(a.row);
    slot.replaceChildren(d);
    a.ok.focus();
  }

  function openPushDialog() {
    if (!changes.count || state.phase !== 'idle') return;
    if (state.editing) stopText();
    const list = changes.list();
    const d = h('div', 'dialog glassy');
    d.append(h('h3', '', `Push ${list.length} change${list.length === 1 ? '' : 's'} to code`));
    d.append(Object.assign(h('p'), { textContent: 'Claude will update your source to match. You can undo afterwards.' }));
    const wrap = h('div', 'list-wrap');
    const ul = h('ul', 'list');
    for (const c of list) {
      const li = h('li');
      li.textContent = describeChange(c);
      li.title = li.textContent;
      ul.append(li);
    }
    const more = h('button', 'more', `Show all ${list.length}`);
    more.hidden = list.length <= 4;
    more.addEventListener('click', () => {
      const open = ul.classList.toggle('open');
      more.textContent = open ? 'Show less' : `Show all ${list.length}`;
    });
    wrap.append(ul, more);
    const a = actions('Proceed', push);
    a.ok.insertAdjacentHTML('beforeend', `<kbd>${GLYPH.command}${GLYPH.enter}</kbd>`);
    d.append(wrap, a.row);
    slot.replaceChildren(d);
    a.ok.focus();
  }

  function openUndoDialog() {
    const files = state.server?.last?.files?.length || 0;
    confirmDialog({
      title: 'Undo previous changes?',
      text: `Restores ${files} file${files === 1 ? '' : 's'} Claude changed, then brings back your edits so you can adjust and push again.`,
      ok: 'Undo',
      onOk: undoPass,
    });
  }

  let toastTimer = 0;
  function toast(label, text, { error = false, ms = 9000 } = {}) {
    const t = h('div', 'toast glassy' + (error ? ' err' : ''));
    const b = h('b');
    b.textContent = label;
    const span = h('span');
    span.textContent = text;
    t.append(b, span);
    t.title = 'Click to dismiss';
    t.addEventListener('click', closeDialog);
    slot.replaceChildren(t);
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => t.isConnected && closeDialog(), ms);
  }

  // ---------- Describing changes ----------
  const NAMES = {
    'background-color': 'Fill', color: 'Text color', 'border-radius': 'Roundness', 'box-shadow': 'Shadow',
    'border-color': 'Stroke color', 'border-width': 'Stroke weight', 'border-style': 'Stroke',
    'outline-color': 'Stroke color', 'outline-width': 'Stroke weight', 'outline-style': 'Stroke',
  };
  const propName = (p) => NAMES[p] || p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ');
  const pretty = (v) => {
    const s = String(v).replace(/rgba?\([^)]*\)/g, (c) => {
      const p = parseColor(c);
      if (!p) return c;
      if (p.a === 0) return 'none';
      return p.a === 1 ? p.hex : `${p.hex} ${Math.round(p.a * 100)}%`;
    });
    return s.length > 40 ? s.slice(0, 39) + '…' : s;
  };
  function describeChange(c) {
    if (c.kind === 'insert' && c.what === 'copy') {
      return `Duplicate ${c.copyOf?.element} into ${c.parent?.element}` + (c.after ? `, after ${c.after.element}` : ', first');
    }
    if (c.kind === 'insert') {
      const what = c.what === 'text' ? `text “${pretty(c.text ?? '')}”` : `${c.what} ${c.styles.width?.replace('px', '') ?? ''}×${c.styles.height?.replace('px', '') ?? ''}`;
      return `Add ${what} in ${c.parent?.element}` + (c.after ? `, after ${c.after.element}` : ', first');
    }
    if (c.kind === 'group' && c.children.length === 1) return `Wrap ${c.children[0].element} in ${c.element} (auto layout frame)`;
    if (c.kind === 'group') return `Group ${c.children.map((k) => k.element).join(', ')} in ${c.element}`;
    const who = c.element + (c.scope === 'all' ? ` (all ${c.count})` : c.count > 1 ? ' (just this one)' : '');
    if (c.kind === 'delete') return `Delete ${who}`;
    if (c.kind === 'move') {
      const where = c.after ? `after ${c.after.element}` : 'first';
      const moved = c.parent && c.fromParent && (c.parent.source !== c.fromParent.source || c.parent.index !== c.fromParent.index);
      return moved ? `Move ${who} into ${c.parent.element}, ${where}` : `Move ${who}: position ${c.from + 1} → ${c.to + 1}, ${where}`;
    }
    if (c.kind === 'text') return `Text of ${who}: “${pretty(c.from)}” → “${pretty(c.to)}”`;
    return `${propName(c.property)} of ${who}: ${pretty(c.from)} → ${pretty(c.to)}`;
  }

  // ---------- Push → Claude ----------
  function contextFor(list) {
    const seen = new Map();
    for (const c of list) {
      const key = `${c.source}#${c.scope === 'all' ? 'all' : c.index}`;
      if (seen.has(key) || !c.source) continue;
      const els = [...document.querySelectorAll(`[${ATTR}="${CSS.escape(c.source)}"]`)];
      const el = els[c.scope === 'all' ? 0 : c.index ?? 0];
      if (!el) continue;
      const clone = el.cloneNode(true);
      for (const n of [clone, ...clone.querySelectorAll('[style]')]) n.removeAttribute?.('style');
      const parent = el.parentElement?.closest(`[${ATTR}]`);
      seen.set(key, {
        element: describe(el),
        source: c.source,
        scope: c.scope,
        index: c.index,
        instances: els.length,
        classes: [...el.classList],
        text: (c.kind === 'text' ? c.from : el.textContent).trim().slice(0, 120),
        html: clone.outerHTML.slice(0, 1200),
        parent: parent ? { element: describe(parent), source: parent.getAttribute(ATTR) } : null,
      });
    }
    return [...seen.values()];
  }

  async function push() {
    const list = changes.list();
    if (!list.length) return;
    closeDialog();
    select(null);
    state.phase = 'running';
    renderPill();
    try {
      const res = await fetch('/@edit-mode/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: location.href,
          viewport: { width: innerWidth, height: innerHeight },
          changes: list,
          context: contextFor(list),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Push failed');
      waitForRun(data.id);
    } catch (err) {
      state.phase = 'idle';
      renderPill();
      toast('Push failed', err.message, { error: true, ms: 0 });
    }
  }

  async function fetchStatus() {
    try {
      state.server = await (await fetch('/@edit-mode/status')).json();
    } catch {
      state.server = null;
    }
    return state.server;
  }

  function waitForRun(id) {
    const timer = setInterval(async () => {
      const s = await fetchStatus();
      if (!s || s.running) return;
      clearInterval(timer);
      if (s.last?.id === id && s.last.ok) {
        store.set(KEY.toast, JSON.stringify({ id, summary: s.last.summary }));
        state.phase = 'idle';
        setOn(false, { force: true }); // unfreezes; the server reloads the page with Claude's changes
        setTimeout(() => location.reload(), 2000); // in case nothing triggered a reload
      } else {
        state.phase = 'idle';
        renderPill();
        toast('Claude couldn’t finish', s.last?.error || 'Unknown error. Your edits are still here.', { error: true, ms: 0 });
      }
    }, 1000);
  }

  async function undoPass() {
    state.phase = 'undoing';
    renderPill();
    try {
      const res = await fetch('/@edit-mode/undo', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Undo failed');
      store.set(KEY.reapply, JSON.stringify(data.changes));
      store.set(KEY.on, '1');
      if (data.skipped?.length) {
        store.set(KEY.toast, JSON.stringify({ label: 'Undone, mostly', summary: `Left alone because they were edited after Claude: ${data.skipped.join(', ')}` }));
      }
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      state.phase = 'idle';
      renderPill();
      toast('Undo failed', err.message, { error: true, ms: 0 });
    }
  }

  // ---------- Picking elements ----------
  // Clicking inside an SVG icon selects the whole <svg>, not a <path>.
  function pickable(el) {
    if (!(el instanceof Element)) return null;
    let svg = el.closest('svg');
    while (svg && svg.parentElement?.closest('svg')) svg = svg.parentElement.closest('svg');
    if (svg) el = svg;
    if (el === document.documentElement || el === document.body || el === host) return null;
    return el;
  }

  // The deepest element under the pointer (⌘-click, the Text tool, scrolling).
  // Locked layers (and what's inside them) are skipped: clicks fall through.
  function deepHit(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === host) continue;
      const p = pickable(el);
      if (!p || !layers.isLocked(p)) return p;
    }
    return null;
  }

  // The page's top level, like a Figma page's top-level frames: skip down
  // through wrappers with a single visible child (body > #root > main.page),
  // and the children of what's left are the top-level layers.
  const layerKids = (n) => [...n.children].filter((k) => k !== host && !NOT_LAYER.test(k.tagName) &&
    (k.getClientRects().length || k.style.getPropertyValue('display') === 'none')); // hidden with the eye: still a layer
  function pageRoot() {
    let n = document.body;
    for (let kids = layerKids(n); kids.length === 1 && !LEAF.test(kids[0].tagName); kids = layerKids(n)) n = kids[0];
    return n;
  }

  // What a click selects, the Figma way: the layer at the current level.
  // The level is the selection's parent (top level when nothing is selected);
  // a click outside it walks up until a level contains the click. Clicking a
  // level's own background selects that level's frame. `deep` (⌘) picks the
  // deepest element instead.
  function hit(x, y, deep = false) {
    const el = deepHit(x, y);
    if (deep || !el) return el;
    const root = pageRoot();
    if (el === root || !root.contains(el)) return null; // the page background
    const sel = state.selected;
    let ctx = sel && sel !== root && root.contains(sel) ? sel.parentElement : root;
    while (ctx !== root && (ctx === el || !ctx.contains(el))) ctx = ctx.parentElement;
    let n = el;
    while (n.parentElement !== ctx) n = n.parentElement;
    return pickable(n) || n;
  }

  // One level deeper inside `el`, under (x, y): its child that holds the point.
  function hitInside(el, x, y) {
    const d = deepHit(x, y);
    if (!d || d === el || !el.contains(d)) return null;
    let n = d;
    while (n.parentElement !== el) n = n.parentElement;
    return pickable(n) || n;
  }

  function select(el) {
    state.selected = el;
    state.multi = el ? [el] : [];
    panel.show(el);
  }

  // ---------- Pointer: select, drag to move, tools ----------
  // Press: select the layer under the pointer at the current level (see hit),
  // or the deepest one with ⌘. Pressing inside the selection keeps it, so a
  // selected card can be dragged by its title or image. Drag past 4px: move
  // it. Pressing one of several selected elements keeps them all until
  // release. Shift-click adds siblings to the selection.
  let press = null;
  let pointer = null; // last pointer position, to refresh hover when ⌘ is pressed
  let drag = null;
  let draw = null; // a shape being placed with a tool

  // Space-drag or middle-drag pans the canvas (Figma).
  let pan = null;
  let spaceDown = false;
  glass.addEventListener('pointerdown', (e) => {
    if (state.phase !== 'idle' || !(e.button === 1 || (e.button === 0 && spaceDown))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    glass.setPointerCapture(e.pointerId);
    pan = { x: e.clientX, y: e.clientY };
    state.hovered = null;
    glass.classList.add('panning');
  });
  glass.addEventListener('pointermove', (e) => {
    if (!pan) return;
    e.stopImmediatePropagation();
    canvas.panBy(e.clientX - pan.x, e.clientY - pan.y);
    pan = { x: e.clientX, y: e.clientY };
  });
  const endPan = (e) => {
    if (!pan) return;
    e.stopImmediatePropagation();
    pan = null;
    glass.classList.remove('panning');
  };
  glass.addEventListener('pointerup', endPan);
  glass.addEventListener('pointercancel', endPan);
  const trackSpace = (e) => {
    if (e.code !== 'Space' || state.editing) return;
    const path = e.composedPath();
    if (path.includes(host) && /^(INPUT|SELECT|TEXTAREA)$/.test(path[0].tagName)) return;
    if (!state.on) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    spaceDown = e.type === 'keydown';
    glass.classList.toggle('grab', spaceDown);
  };
  window.addEventListener('keydown', trackSpace, true);
  window.addEventListener('keyup', trackSpace, true);
  window.addEventListener('blur', () => { spaceDown = false; glass.classList.remove('grab'); });

  glass.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || state.phase !== 'idle') return;
    e.preventDefault();
    glass.setPointerCapture(e.pointerId);
    if (state.tool === 'text') {
      const onText = deepHit(e.clientX, e.clientY);
      if (onText && textNodeOf(onText)) { // like Figma: the Text tool edits text you click on
        setTool('select');
        select(onText);
        startText(onText);
        return;
      }
    }
    if (state.tool !== 'select') {
      const drop = dropAt(e.clientX, e.clientY, null);
      if (drop) draw = { x: e.clientX, y: e.clientY, drop };
      return;
    }
    if (e.shiftKey && state.selected) {
      const add = multiTarget(e.clientX, e.clientY, e.metaKey || e.ctrlKey);
      if (add) toggleMulti(add);
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    let el = hit(e.clientX, e.clientY, mod);
    if (state.multi.length > 1 && !mod) {
      // Pressing anywhere inside one of several selected elements grabs them all, even across containers.
      const d = deepHit(e.clientX, e.clientY);
      el = (d && state.multi.find((x) => x.contains(d))) || el;
    }
    const keep = !!(el && state.multi.length > 1 && state.multi.includes(el));
    if (!keep) select(el);
    press = { x: e.clientX, y: e.clientY, el, target: el, keep };
  });

  glass.addEventListener('pointermove', (e) => {
    const x = e.clientX;
    const y = e.clientY;
    pointer = { x, y, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey };
    if (draw) return showDraw(x, y, e.shiftKey);
    if (state.tool !== 'select') { state.hovered = null; return showDrop(dropAt(x, y, null), true); }
    if (press && !drag && press.target && Math.hypot(x - press.x, y - press.y) > 4) {
      // Several selected: they all move (pressed one leads), in page order.
      const els = press.keep ? [press.target, ...state.multi.filter((k) => k !== press.target)] : [press.target];
      if (e.altKey) {
        // ⌥-drag: drag copies and leave the originals where they were (Figma).
        const g = `altdrag:${Date.now()}`;
        const copies = els.map((k) => insertCopies([{ clone: cloneFor(k), from: k }], k, g, { duplicate: true })[0]);
        if (copies.every(Boolean)) { selectAll(copies); startDrag(copies, press); drag && (drag.group = g); }
      } else startDrag(els, press);
    }
    if (drag) return updateDrag(x, y);
    if (!press) state.hovered = hoverAt(x, y, e);
  });

  glass.addEventListener('pointerup', (e) => {
    if (draw) { finishDraw(e.clientX, e.clientY, e.shiftKey); draw = null; return; }
    if (drag) finishDrag();
    else if (press?.keep) select(press.el);
    press = null;
  });
  glass.addEventListener('pointercancel', () => { drag = press = draw = null; endDragUI(); });
  glass.addEventListener('pointerleave', () => {
    pointer = null;
    if (!press) state.hovered = null;
    if (state.tool !== 'select' && !draw) showDrop(null);
  });

  const flowKids = (parent) => [...parent.children].filter((k) => {
    if (k === host) return false;
    const cs = getComputedStyle(k);
    return cs.display !== 'none' && !/absolute|fixed/.test(cs.position) && k.getClientRects().length;
  });

  // Elements that hold text or are controls never become containers.
  const LEAF = /^(P|H[1-6]|SPAN|A|BUTTON|LABEL|IMG|INPUT|TEXTAREA|SELECT|svg|SVG|VIDEO|CANVAS|IFRAME|STRONG|EM|B|I|SMALL|CODE)$/;
  const canContain = (n) => (n.hasAttribute(ATTR) || !!n.dataset.emNew || !!n.dataset.emCopyOf) && !LEAF.test(n.tagName) && !n.closest('svg');

  // Where something would land at (x, y): a container and an index among its
  // element children, plus the insertion line to draw. `el` is the element
  // being moved (null when adding a new one); `moving` is everything moving
  // with it (a multi-selection), which is never a drop spot. Look-alike
  // siblings (other cards) only reorder; other siblings take a drop when
  // you're well inside. Empty boxes only accept drops if they were added in
  // this session. toIndex counts the container's children minus `moving`.
  function dropAt(x, y, el, moving = el ? [el] : []) {
    const origin = el?.parentElement ?? null;
    const src = el?.getAttribute(ATTR);
    const hitEl = document.elementsFromPoint(x, y).find((n) => n !== host && !moving.some((m) => m.contains(n)));
    let container = null;
    for (let n = hitEl; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n === origin) { container = origin; break; }
      const kids = flowKids(n).filter((k) => !moving.includes(k));
      if (!canContain(n) || (!kids.length && !n.dataset.emNew)) continue;
      if (origin && n.parentElement === origin) {
        if (src && n.getAttribute(ATTR) === src) continue;
        const r = n.getBoundingClientRect();
        const ix = Math.min(24, r.width / 4);
        const iy = Math.min(24, r.height / 4);
        if (x < r.left + ix || x > r.right - ix || y < r.top + iy || y > r.bottom - iy) continue;
      }
      container = n;
      break;
    }
    container ||= origin;
    if (!container) return null;

    const sibs = flowKids(container).filter((k) => !moving.includes(k));
    if (!sibs.length) return { container, toIndex: 0, line: null };
    const cs = getComputedStyle(container);
    const horizontal = (/flex/.test(cs.display) && cs.flexDirection.startsWith('row')) ||
      /grid/.test(cs.display) || (el && /^inline/.test(getComputedStyle(el).display));
    let best = null;
    let bestD = Infinity;
    for (const s of sibs) {
      const r = s.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (d < bestD) { bestD = d; best = { s, r }; }
    }
    const { s, r } = best;
    const after = horizontal ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    const others = [...container.children].filter((k) => !moving.includes(k));
    const toIndex = others.indexOf(s) + (after ? 1 : 0);

    // Insertion line, centred in the gap to the neighbour when there is one.
    const i = sibs.indexOf(s);
    const nb = sibs[after ? i + 1 : i - 1]?.getBoundingClientRect();
    let line;
    if (horizontal) {
      let lx = after ? r.right : r.left;
      if (nb && Math.abs(nb.top - r.top) < r.height / 2) lx = after ? (r.right + nb.left) / 2 : (nb.right + r.left) / 2;
      line = { left: lx - 1, top: r.top, width: 2, height: r.height };
    } else {
      let ly = after ? r.bottom : r.top;
      if (nb) ly = after ? (r.bottom + nb.top) / 2 : (nb.bottom + r.top) / 2;
      line = { left: r.left, top: ly - 1, width: r.width, height: 2 };
    }
    return { container, toIndex, line };
  }

  function showDrop(drop, alwaysTarget = false) {
    insertLine.hidden = !drop?.line;
    if (drop?.line) place(insertLine, drop.line);
    targetBox.hidden = !drop || (!alwaysTarget && drop.container === drag?.parent);
    if (!targetBox.hidden) place(targetBox, drop.container.getBoundingClientRect());
  }

  // `els`: what moves; the first one leads (it picks the drop spot).
  function startDrag(els, p) {
    const el = els[0];
    const parent = el?.parentElement;
    if (!parent || parent === document.documentElement || el === document.body) { press = null; return; }
    const r = unionRect(els);
    drag = { el, els: inOrder(els), parent, rect: r, dx: p.x - r.left, dy: p.y - r.top, drop: null };
    state.hovered = null;
    glass.classList.add('dragging');
    frame.classList.add('moving');
    multiLayer.classList.add('moving');
  }

  function updateDrag(x, y) {
    drag.drop = dropAt(x, y, drag.el, drag.els);
    showDrop(drag.drop);
    place(ghostBox, { left: x - drag.dx, top: y - drag.dy, width: drag.rect.width, height: drag.rect.height });
    ghostBox.hidden = false;
  }

  function endDragUI() {
    ghostBox.hidden = insertLine.hidden = targetBox.hidden = true;
    glass.classList.remove('dragging');
    frame.classList.remove('moving');
    multiLayer.classList.remove('moving');
  }

  // Drop: everything dragged lands together, in page order, before `anchor`
  // (the container's child that was at toIndex). One undo step.
  function finishDrag() {
    const { els, drop, group } = drag;
    drag = null;
    endDragUI();
    if (!drop) return;
    const { container } = drop;
    const anchor = [...container.children].filter((k) => !els.includes(k))[drop.toIndex] ?? null;
    const kids = [...container.children];
    const at = els.map((k) => kids.indexOf(k));
    const end = anchor ? kids.indexOf(anchor) : kids.length;
    const inPlace = at.every((i, n) => i === end - els.length + n); // already there, side by side
    if (!inPlace) {
      const scope = els.length > 1 ? 'one' : state.scope;
      changes.batch(group ?? `move:${Date.now()}`, () => {
        for (const k of els) {
          const rest = [...container.children].filter((c) => c !== k);
          changes.move(k, scope, anchor ? rest.indexOf(anchor) : rest.length, container);
        }
      });
    }
    panel.show(state.selected);
  }

  // Double-click goes one level deeper (Figma). On text that's already the
  // selection, it starts editing.
  glass.addEventListener('dblclick', (e) => {
    if (state.phase !== 'idle' || state.tool !== 'select') return;
    const sel = state.selected;
    if (!sel) return;
    const inner = hitInside(sel, e.clientX, e.clientY);
    if (inner) select(inner);
    else if (textNodeOf(sel)) startText(sel);
  });

  // The glass covers the page, so pass scrolling through to whatever scrollable
  // element is underneath. (Over plain page areas the window scrolls by itself.)
  // Wheel: ⌘-scroll or pinch zooms around the pointer (Figma). Otherwise a
  // scrollable element under the pointer scrolls; if there isn't one, the
  // canvas pans (Shift turns vertical scrolling sideways).
  glass.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      canvas.zoomAt(view.z * Math.exp(-e.deltaY * k * (e.ctrlKey && !e.metaKey ? 0.01 : 0.005)), e.clientX, e.clientY);
      return;
    }
    let dx = e.deltaX * k;
    let dy = e.deltaY * k;
    if (e.shiftKey && !dx) [dx, dy] = [dy, 0];
    const scroller = scrollableAt(deepHit(e.clientX, e.clientY), { deltaX: dx, deltaY: dy });
    if (scroller) scroller.scrollBy(dx / view.z, dy / view.z);
    else canvas.panBy(-dx, -dy);
  }, { passive: false });

  function scrollableAt(el, e) {
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const y = /auto|scroll|overlay/.test(cs.overflowY) && n.scrollHeight > n.clientHeight && e.deltaY;
      const x = /auto|scroll|overlay/.test(cs.overflowX) && n.scrollWidth > n.clientWidth && e.deltaX;
      if (x || y) return n;
    }
    return null;
  }

  // ---------- Tools: rectangle, ellipse, text ----------
  function setTool(t) {
    state.tool = t;
    for (const b of toolsBar.querySelectorAll('button[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
    glass.dataset.tool = t;
    if (t === 'select') showDrop(null);
  }

  // The shape's box from the press point to (x, y); Shift makes it square.
  function drawBox(x, y, square) {
    let w = x - draw.x;
    let h = y - draw.y;
    if (square) {
      const m = Math.max(Math.abs(w), Math.abs(h));
      w = (w < 0 ? -1 : 1) * m;
      h = (h < 0 ? -1 : 1) * m;
    }
    return { left: Math.min(draw.x, draw.x + w), top: Math.min(draw.y, draw.y + h), width: Math.abs(w), height: Math.abs(h) };
  }

  function showDraw(x, y, square) {
    const { drop } = draw;
    draw.last = [x, y];
    showDrop(drop, true);
    if (state.tool === 'text') return;
    place(ghostBox, drawBox(x, y, square));
    ghostBox.classList.toggle('round', state.tool === 'ellipse');
    ghostBox.hidden = false;
  }

  function finishDraw(x, y, square) {
    const { drop } = draw;
    const tool = state.tool;
    endDragUI();
    ghostBox.classList.remove('round');
    const box = drawBox(x, y, square);
    let w = Math.round(box.width / view.z); // screen → CSS px
    let h = Math.round(box.height / view.z);
    if (box.width < 4 && box.height < 4) w = h = 100; // a click makes a 100 × 100 shape

    let el;
    let info;
    if (tool === 'text') {
      el = document.createElement('p');
      el.textContent = 'Text';
      info = { what: 'text', styles: { margin: '0px' }, text: 'Text' };
    } else {
      el = document.createElement('div');
      info = { what: tool === 'ellipse' ? 'ellipse' : 'rectangle',
        styles: { width: `${w}px`, height: `${h}px`, 'background-color': '#D9D9D9', 'flex-shrink': '0',
                  ...(tool === 'ellipse' ? { 'border-radius': '50%' } : {}) } };
    }
    Object.assign(info.styles, rhythm(drop.container, drop.toIndex));
    for (const [k, v] of Object.entries(info.styles)) el.style.setProperty(k, v);
    changes.insert(el, drop.container, drop.toIndex, info);
    setTool('select');
    select(el);
    if (tool === 'text') startText(el);
  }

  // Spacing for a new element dropped into a normal (non auto layout)
  // container: the typical space between the container's existing children,
  // as margins, so the new element sits evenly instead of flush against its
  // neighbours. Auto layout and grid containers space children with their gap.
  function rhythm(container, index) {
    const cs = getComputedStyle(container);
    if (/flex|grid/.test(cs.display)) return {};
    const kids = flowKids(container);
    const rects = kids.map((k) => box(k)); // CSS px, whatever the zoom
    const gaps = rects.slice(1).map((r, i) => r.top - rects[i].bottom).filter((g) => g > 0.5);
    if (!gaps.length) return {};
    const gap = Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]);
    const out = {};
    if (index > 0) out['margin-top'] = `${gap}px`;
    if (index < kids.length) out['margin-bottom'] = `${gap}px`;
    if (out['margin-top'] || out['margin-bottom']) {
      out['margin-top'] ??= '0px';
      out['margin-bottom'] ??= '0px';
    }
    return out;
  }

  // ---------- Copy, paste, duplicate ----------
  // The clipboard holds detached clones taken at copy time, so later edits to
  // the original don't change what gets pasted.
  let clipboard = [];
  const selection = () => (state.multi.length ? state.multi : state.selected ? [state.selected] : []);
  const inOrder = (els) => [...els].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  // A clone that no longer claims to be the original: data-src becomes
  // data-em-copy-of. It isn't a code instance, but it joins the original's
  // family for "All like this" (see family() in util.js). A copy of a copy
  // keeps the first original's family.
  function cloneFor(el) {
    const c = el.cloneNode(true);
    for (const n of [c, ...c.querySelectorAll('*')]) {
      const from = n.getAttribute(ATTR) ?? n.dataset.emCopyOf ?? (n.dataset.emNew ? `new #${n.dataset.emNew}` : null);
      n.removeAttribute(ATTR);
      delete n.dataset.emNew;
      if (from) n.dataset.emCopyOf = from;
    }
    c.removeAttribute('contenteditable');
    return c;
  }

  function copySelection() {
    const els = inOrder(selection());
    if (!els.length) return;
    clipboard = els.map((el) => ({ clone: cloneFor(el), from: el }));
    toast('Copied', `${els.length === 1 ? describe(els[0]) : `${els.length} elements`}. Paste with ⌘V.`, { ms: 1800 });
  }

  // Insert copies of `items` after `anchor` (or inside it, if it's an empty box you added).
  function insertCopies(items, anchor, group, { duplicate = false } = {}) {
    const into = !duplicate && /flex|grid/.test(getComputedStyle(anchor).display) && !items.some((it) => it.from === anchor);
    const parent = into ? anchor : anchor.parentElement;
    if (!parent) return [];
    let index = into ? parent.children.length : [...parent.children].indexOf(anchor) + 1;
    const added = [];
    changes.batch(group, () => {
      for (const { clone, from } of items) {
        const el = clone.cloneNode(true);
        const copyOf = from.isConnected ? from : null;
        changes.insert(el, parent, index++, {
          what: 'copy',
          styles: {},
          text: el.textContent.trim().slice(0, 200),
          copyOf: copyOf ? { element: describe(copyOf), source: copyOf.getAttribute(ATTR), newId: copyOf.dataset.emNew,
                             index: sameSource(copyOf).indexOf(copyOf) } : { element: describe(el), source: el.dataset.emCopyOf },
        });
        added.push(el);
      }
    });
    return added;
  }

  function selectAll(els) {
    select(els[0] ?? null);
    if (els.length > 1) {
      state.multi = els;
      panel.show(state.selected);
    }
  }

  function pasteClipboard() {
    if (!clipboard.length) return;
    const sel = selection();
    const anchor = sel.length ? inOrder(sel).at(-1) : clipboard.at(-1).from;
    if (!anchor?.isConnected) return;
    selectAll(insertCopies(clipboard, anchor, `paste:${Date.now()}`));
  }

  function duplicateSelection() {
    const els = inOrder(selection());
    if (!els.length) return;
    const g = `duplicate:${Date.now()}`;
    // Each copy goes right after its own original, even across containers.
    const copies = els.map((el) => insertCopies([{ clone: cloneFor(el), from: el }], el, g, { duplicate: true })[0]);
    selectAll(copies.filter(Boolean));
  }

  function cutSelection() {
    copySelection();
    deleteSelection();
  }

  // ---------- Multi-select, group, auto layout ----------
  // What Shift-click adds: the element under the pointer at the same depth
  // as the selection, so with one card's title selected, Shift-clicking
  // another card's title adds that title (and Shift-clicking a card adds
  // the card when a card is selected). Shallower than the selection: the
  // element itself. ⇧⌘-click: exactly the deepest element.
  function multiTarget(x, y, deep) {
    const d = deepHit(x, y);
    if (deep || !d || !state.selected) return d;
    const root = pageRoot();
    if (d === root || !root.contains(d)) return null;
    const depth = (n) => { let k = 0; for (; n && n !== root; n = n.parentElement) k++; return k; };
    const want = depth(state.selected);
    let n = d;
    while (n && n !== root && depth(n) > want) n = n.parentElement;
    return n && n !== root ? pickable(n) || n : d;
  }

  // Shift-click: add to / remove from the selection.
  function toggleMulti(n) {
    if (state.multi.includes(n)) {
      state.multi = state.multi.filter((x) => x !== n);
      if (n === state.selected) state.selected = state.multi[0] ?? null;
    } else if (!state.multi.some((x) => x.contains(n) || n.contains(x))) {
      state.multi = [...state.multi, n];
    }
    panel.show(state.selected);
  }

  function groupSelection() {
    if (state.multi.length < 2) return null;
    const wrap = changes.group(state.multi);
    select(wrap);
    return wrap;
  }

  // ⇧A, like Figma: several siblings → wrap them in an auto layout frame.
  // One element with children (or a box you drew) → make it auto layout.
  // One element without children (text, a shape) → wrap it in a frame that
  // hugs it, so you can give it fill, padding and radius (how buttons are made).
  function autoLayoutSelection() {
    const g = `autolayout:${Date.now()}`;
    let el = state.selected;
    if (!el) return;
    if (state.multi.length > 1) {
      el = changes.batch(g, () => changes.group(state.multi));
      panel.autoLayout(el, g, { wrapper: true });
    } else if (/flex/.test(getComputedStyle(el).display)) {
      el = changes.batch(g, () => changes.group([el])); // already auto layout: wrap it, like Figma
      panel.autoLayout(el, g, { wrapper: true });
    } else if (el.children.length || (el.dataset.emNew && canContain(el))) {
      panel.autoLayout(el, g);
    } else {
      el = changes.batch(g, () => changes.group([el]));
      panel.autoLayout(el, g, { wrapper: true });
    }
    select(el);
  }

  function deleteSelection() {
    const els = state.multi.length ? state.multi : [state.selected];
    const parent = pickable(els[0].parentElement);
    const g = `delete:${Date.now()}`;
    changes.batch(g, () => { for (const x of els) changes.remove(x, els.length > 1 ? 'one' : state.scope); });
    select(parent);
  }

  // ---------- Text editing ----------
  const POINTER_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick'];

  function startText(el) {
    if (!changes.beginText(el)) return;
    state.editing = el;
    glass.hidden = true;
    frame.classList.add('editing');
    el.contentEditable = 'plaintext-only';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    for (const t of POINTER_EVENTS) window.addEventListener(t, guardWhileEditing, true);
  }

  function stopText() {
    const el = state.editing;
    if (!el) return;
    state.editing = null;
    for (const t of POINTER_EVENTS) window.removeEventListener(t, guardWhileEditing, true);
    el.removeAttribute('contenteditable');
    getSelection().removeAllRanges();
    changes.endText();
    glass.hidden = !state.on;
    frame.classList.remove('editing');
    if (el.dataset.emNew && !el.textContent.trim()) { // empty new text: gone, like Figma
      changes.remove(el, 'one');
      select(pickable(el.parentElement));
    }
    panel.refresh(true);
  }

  // While editing text the glass is lifted. Clicks inside the text move the
  // caret but never reach the app; a click anywhere else ends editing.
  function guardWhileEditing(e) {
    const path = e.composedPath();
    if (path.includes(host)) {
      if (e.type === 'pointerdown') stopText();
      return;
    }
    e.stopImmediatePropagation();
    if (path.includes(state.editing)) return;
    e.preventDefault();
    if (e.type === 'pointerdown') {
      stopText();
      const mod = e.metaKey || e.ctrlKey;
      if (e.shiftKey && state.selected) { const add = multiTarget(e.clientX, e.clientY, mod); if (add) toggleMulti(add); } // Shift-click adds, even mid-typing
      else select(hit(e.clientX, e.clientY, mod));
    }
  }

  // ---------- Resize handles ----------
  // One element: set its size. Several: the handles sit on the frame around
  // all of them, and each element's size scales by the same factor as that
  // frame (they stay in the page's flow, so their positions don't scale).
  // Shift, or constrain proportions on the primary, keeps proportions.
  for (const handle of frame.querySelectorAll('.handle')) {
    handle.addEventListener('pointerdown', (e) => {
      const el = state.selected;
      if (!el || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const dir = handle.dataset.dir;
      const els = state.multi.length > 1 ? state.multi.filter((k) => k.isConnected && visible(k)) : [el];
      const scope = els.length > 1 ? 'one' : state.scope;
      const start = els.map((k) => [k, box(k)]); // CSS px
      const r0 = unionRect(els);
      const x0 = e.clientX;
      const y0 = e.clientY;
      const group = `resize:${Date.now()}`;

      const move = (ev) => {
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        let w = r0.width + (dir.includes('e') ? dx : dir.includes('w') ? -dx : 0);
        let h = r0.height + (dir.includes('s') ? dy : dir.includes('n') ? -dy : 0);
        const lock = (ev.shiftKey || state.ratio.has(el)) && r0.width && r0.height; // el: the primary // Shift or constrain proportions
        if (lock) {
          const ratio = r0.width / r0.height;
          const corner = /[ew]/.test(dir) && /[ns]/.test(dir);
          if (corner ? Math.abs(w / r0.width - 1) > Math.abs(h / r0.height - 1) : /[ew]/.test(dir)) h = w / ratio;
          else w = h * ratio;
        }
        // New size of each element: scaled with the frame (or, from nothing, the frame's own size).
        const size = (b0, frame0, now) => Math.max(0, Math.round(frame0 ? b0 * (now / frame0) : now / view.z)); // screen → CSS px
        changes.batch(group, () => {
          for (const [k, b] of start) {
            if (lock || /[ew]/.test(dir)) panel.sizeOf(k, scope, 'width', size(b.width, r0.width, w));
            if (lock || /[ns]/.test(dir)) panel.sizeOf(k, scope, 'height', size(b.height, r0.height, h));
          }
        });
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  // ---------- Keyboard ----------
  // Hold ⌥ to measure distances from the selection to what you hover.
  const trackAlt = (e) => { if (e.key === 'Alt') state.alt = e.type === 'keydown'; };
  window.addEventListener('keydown', trackAlt, true);
  window.addEventListener('keyup', trackAlt, true);
  window.addEventListener('blur', () => (state.alt = false));

  const redrawOnShift = (e) => {
    if (draw?.last && e.key === 'Shift') showDraw(draw.last[0], draw.last[1], e.type === 'keydown');
  };
  window.addEventListener('keyup', redrawOnShift, true);

  // Hover shows what a click would pick: Shift previews what it would add,
  // ⌘ the deepest element. Pressing or releasing those keys updates it.
  function hoverAt(x, y, keys) {
    const deep = keys.metaKey || keys.ctrlKey;
    if (keys.shiftKey && state.selected) return multiTarget(x, y, deep);
    return hit(x, y, deep);
  }
  const rehover = (e) => {
    if (!/^(Meta|Control|Shift)$/.test(e.key)) return;
    if (pointer && !press && !drag && !draw && !pan && state.tool === 'select' && state.on) state.hovered = hoverAt(pointer.x, pointer.y, e);
  };
  window.addEventListener('keydown', rehover, true);
  window.addEventListener('keyup', rehover, true);

  window.addEventListener('keydown', (e) => {
    redrawOnShift(e);
    const path = e.composedPath();
    const inOverlay = path.includes(host);
    const target = path[0];
    const typing = inOverlay && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
    const onControl = inOverlay && (typing || /^(BUTTON|A|LABEL)$/.test(target.tagName));
    const mod = e.metaKey || e.ctrlKey;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };

    // Editing text on the page: Enter or Esc finishes; other keys type.
    if (state.editing) {
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') { stop(); stopText(); }
      else if (e.key === ' ') { stop(); document.execCommand('insertText', false, ' '); } // buttons eat Space otherwise
      else e.stopImmediatePropagation();
      return;
    }

    // ⌥E toggles edit mode (uses the physical key, since ⌥E types "´" on a Mac).
    if (e.altKey && !mod && e.code === 'KeyE' && !typing) {
      stop();
      if (state.phase === 'idle') setOn(!state.on);
      return;
    }
    if (!state.on || typing || state.phase !== 'idle') return;

    if (e.key === 'Escape') {
      stop();
      if (!zmenu.hidden) closeZoomMenu();
      else if (state.tool !== 'select') setTool('select');
      else if (panel.menuOpen()) panel.closeMenu();
      else if (slot.querySelector('.dialog')) closeDialog(); // notices don't swallow Esc
      else if (state.selected) {
        // Up one level; past the page's top level, deselect (Figma).
        const root = pageRoot();
        select(state.selected === root || !root.contains(state.selected) ? null : pickable(state.selected.parentElement));
      }
      return;
    }
    if (mod && e.key === 'Enter') {
      stop();
      if (slot.querySelector('.dialog .list')) push();
      else openPushDialog();
      return;
    }
    if (mod && e.code === 'KeyZ') {
      stop();
      if (e.shiftKey) changes.redo(); else changes.undo();
      return;
    }
    if (mod && e.code === 'KeyY') { stop(); changes.redo(); return; }
    if (mod && e.code === 'KeyG' && !e.shiftKey) { stop(); groupSelection(); return; }
    if (e.key === 'Tab' && state.selected && !mod) {
      // Tab / Shift-Tab: next / previous sibling (Figma).
      stop();
      const sibs = [...state.selected.parentElement.children].filter((k) => k !== host && k.getClientRects().length);
      const i = sibs.indexOf(state.selected);
      const next = sibs[(i + (e.shiftKey ? -1 : 1) + sibs.length) % sibs.length];
      if (next) select(pickable(next) || next);
      return;
    }
    if (mod && e.code === 'KeyA' && state.selected) {
      // ⌘A: select everything next to the selection.
      stop();
      const sibs = [...state.selected.parentElement.children].filter((k) => k !== host && k.getClientRects().length && pickable(k));
      selectAll([state.selected, ...sibs.filter((k) => k !== state.selected)]);
      return;
    }
    if (e.altKey && !mod && e.code === 'Digit1') { stop(); toggleLayers(); return; } // ⌥1, as in Figma
    // Zoom (Figma): ⌘+ / ⌘− / ⌘0, ⇧0 100%, ⇧1 fit, ⇧2 selection.
    if (mod && !e.altKey && /^(Equal|NumpadAdd)$/.test(e.code)) { stop(); canvas.step(1); return; }
    if (mod && !e.altKey && /^(Minus|NumpadSubtract)$/.test(e.code)) { stop(); canvas.step(-1); return; }
    if (mod && !e.altKey && !e.shiftKey && e.code === 'Digit0') { stop(); canvas.reset(); return; }
    if (e.shiftKey && !mod && !e.altKey && /^Digit[012]$/.test(e.code)) {
      stop();
      zoomAction({ Digit0: '100', Digit1: 'fit', Digit2: 'sel' }[e.code]);
      return;
    }
    if (mod && e.code === 'Backslash') { stop(); ui.classList.toggle('ui-hidden'); return; } // ⌘\ hides the panel and tools, like Figma
    if (mod && !e.shiftKey && !e.altKey) {
      const action = { KeyC: copySelection, KeyV: pasteClipboard, KeyD: duplicateSelection, KeyX: cutSelection }[e.code];
      if (action) { stop(); action(); return; }
    }
    if (e.shiftKey && !mod && !e.altKey && e.code === 'KeyA') { stop(); autoLayoutSelection(); return; }
    const TOOLS = { KeyV: 'select', KeyR: 'rect', KeyO: 'ellipse', KeyT: 'text' };
    if (!mod && !e.altKey && !e.shiftKey && TOOLS[e.code]) { stop(); setTool(TOOLS[e.code]); return; }

    const sel = state.selected;
    if (sel && !mod) {
      if (e.key === 'Enter' && !onControl) {
        stop();
        if (textNodeOf(sel)) startText(sel);
        else if (sel.firstElementChild) select(pickable(sel.firstElementChild) || sel);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        stop();
        deleteSelection();
        return;
      }
      const arrows = { ArrowLeft: ['margin-left', -1], ArrowRight: ['margin-left', 1], ArrowUp: ['margin-top', -1], ArrowDown: ['margin-top', 1] };
      if (arrows[e.key]) {
        stop();
        // Inside auto layout, arrows move each selected element earlier/later
        // (Figma); elsewhere they nudge it with margin. Several selected move
        // as a block: one that hits the end (or a stuck neighbour) stays put.
        const els = inOrder(selection());
        const scope = els.length > 1 ? 'one' : state.scope;
        const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
        const [prop, dir] = arrows[e.key];
        const stuck = new Set();
        changes.batch(`nudge:${Date.now()}`, () => {
          for (const k of back ? els : els.reverse()) {
            const pcs = k.parentElement && getComputedStyle(k.parentElement);
            if (pcs && /flex/.test(pcs.display)) {
              const along = pcs.flexDirection.startsWith('column') ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
              if (!along.includes(e.key)) continue;
              const nb = back ? k.previousElementSibling : k.nextElementSibling;
              if (!nb || stuck.has(nb)) { stuck.add(k); continue; }
              changes.move(k, scope, [...k.parentElement.children].indexOf(k) + (back ? -1 : 1), k.parentElement);
            } else {
              const now = num(getComputedStyle(k).getPropertyValue(prop));
              changes.set(k, scope, prop, `${now + dir * (e.shiftKey ? 10 : 1)}px`);
            }
          }
        });
        return;
      }
    }
    // Keep the app's own keyboard shortcuts quiet while editing.
    if (!inOverlay) e.stopImmediatePropagation();
  }, true);

  // ---------- Drawing ----------
  function place(box, r) {
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
  }

  // Reuse divs in a layer so redrawing every frame stays cheap.
  function drawBoxes(layer, rects, cls) {
    while (layer.children.length > rects.length) layer.lastChild.remove();
    while (layer.children.length < rects.length) layer.append(document.createElement('div'));
    rects.forEach((r, i) => {
      const box = layer.children[i];
      box.className = 'box ' + cls;
      place(box, r);
    });
  }

  const visible = (el) => el.getClientRects().length > 0;

  // Screen rect around several elements.
  function unionRect(els) {
    const rs = els.map((k) => k.getBoundingClientRect());
    const left = Math.min(...rs.map((r) => r.left));
    const top = Math.min(...rs.map((r) => r.top));
    const right = Math.max(...rs.map((r) => r.right));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  // Extra selection frames (each element of a multi-selection, "All like
  // this"): same look as the main one, with handles and a size label, but
  // only the main frame's handles resize.
  const FRAME_HTML = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map((d) => `<i class="handle" data-dir="${d}"></i>`).join('') + '<div class="size"></div>';
  function drawFrames(layer, els) {
    while (layer.children.length > els.length) layer.lastChild.remove();
    while (layer.children.length < els.length) {
      const f = document.createElement('div');
      f.className = 'frame passive';
      f.innerHTML = FRAME_HTML;
      layer.append(f);
    }
    els.forEach((x, i) => {
      const r = x.getBoundingClientRect();
      const f = layer.children[i];
      place(f, r);
      f.lastChild.textContent = `${fmtSize(r.width / view.z)} × ${fmtSize(r.height / view.z)}`;
    });
  }

  function render() {
    // React may replace the selected node on re-render; drop stale references.
    if (state.selected && !state.selected.isConnected) select(null);
    if (state.hovered && !state.hovered.isConnected) state.hovered = null;
    if (state.editing && !state.editing.isConnected) stopText(); // don't stay stuck in text editing
    const sel = state.selected;

    hoverBox.hidden = !state.on || !state.hovered || state.multi.includes(state.hovered) || !!state.editing;
    if (!hoverBox.hidden) place(hoverBox, state.hovered.getBoundingClientRect());

    // Several selected: the main frame (with the working handles) goes around
    // all of them, and each one also gets its own frame (DESIGN.md › Interaction).
    const many = state.multi.length > 1;
    const shown = many ? state.multi.filter((x) => x.isConnected && visible(x)) : [];
    frame.hidden = many ? !shown.length : !sel || !visible(sel);
    frame.classList.toggle('group', many);
    const fr = frame.hidden ? null : many ? unionRect(shown) : sel.getBoundingClientRect();
    if (fr) {
      place(frame, fr);
      sizeLabel.textContent = `${fmtSize(fr.width / view.z)} × ${fmtSize(fr.height / view.z)}`;
    }

    // Keep the panel off the selection: if it covers it, move it to the other side.
    if (fr && !panel.el.hidden) {
      const pr = panel.el.getBoundingClientRect();
      const overlaps = (r) => fr.left < r.right && fr.right > r.left && fr.top < r.bottom && fr.bottom > r.top;
      if (overlaps(pr)) {
        const left = panel.el.classList.contains('left');
        const lx = layers.open ? layers.el.getBoundingClientRect().right + 8 : 12;
        const other = { left: left ? innerWidth - 12 - pr.width : lx, right: left ? innerWidth - 12 : lx + pr.width, top: pr.top, bottom: pr.bottom };
        if (!overlaps(other)) panel.el.classList.toggle('left', !left);
      }
    }

    const sibs = sel && !many && state.scope === 'all' ? family(sel).filter((x) => x !== sel && visible(x)) : [];
    drawFrames(sibLayer, sibs); // "All like this": each instance framed like a selected element (handles + size)
    drawFrames(multiLayer, shown);

    drawMeasure(sel, fr);
    layers.sync();

    const hint = sel && state.hint;
    drawBoxes(hintLayer, hint ? spacingRects(sel, hint) : [], hint || '');
  }

  // ⌥ measurement: red lines with distances between the selection and the
  // hovered element (or its parent when hovering it / nothing).
  function drawMeasure(sel, selRect) {
    const lines = [];
    if (state.on && state.alt && sel && selRect && !drag && !state.editing) {
      let other = state.hovered && state.hovered !== sel ? state.hovered : sel.parentElement;
      if (other && sel.contains(other)) other = sel.parentElement;
      if (other) {
        const a = selRect; // the frame around the whole selection
        const b = other.getBoundingClientRect();
        const mx = (a.left + a.right) / 2;
        const my = (a.top + a.bottom) / 2;
        const v = (x, y1, y2) => y2 - y1 > 0.5 && lines.push({ left: x, top: y1, width: 1, height: y2 - y1, d: y2 - y1 });
        const hz = (y, x1, x2) => x2 - x1 > 0.5 && lines.push({ left: x1, top: y, width: x2 - x1, height: 1, d: x2 - x1 });
        if (other.contains(sel)) {
          v(mx, b.top, a.top); v(mx, a.bottom, b.bottom); hz(my, b.left, a.left); hz(my, a.right, b.right);
        } else {
          const oy = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
          const ox = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
          const y = a.bottom > b.top && b.bottom > a.top ? oy : my;
          const x = a.right > b.left && b.right > a.left ? ox : mx;
          if (a.right <= b.left) hz(y, a.right, b.left);
          if (b.right <= a.left) hz(y, b.right, a.left);
          if (a.bottom <= b.top) v(x, a.bottom, b.top);
          if (b.bottom <= a.top) v(x, b.bottom, a.top);
        }
        lines.target = b;
      }
    }
    const want = lines.length * 2 + (lines.target ? 1 : 0);
    while (measureLayer.children.length > want) measureLayer.lastChild.remove();
    while (measureLayer.children.length < want) measureLayer.append(document.createElement('div'));
    lines.forEach((l, i) => {
      const line = measureLayer.children[i * 2];
      const label = measureLayer.children[i * 2 + 1];
      line.className = 'mline';
      place(line, l);
      label.className = 'mlabel';
      label.textContent = fmtSize(Math.round((l.d / view.z) * 10) / 10);
      label.style.left = l.left + l.width / 2 + 'px';
      label.style.top = l.top + l.height / 2 + 'px';
    });
    if (lines.target) {
      const box = measureLayer.lastChild;
      box.className = 'mtarget';
      place(box, lines.target);
    }
  }

  const fmtSize = (n) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10);

  function spacingRects(el, kind) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const v = (p) => num(cs[p]) * view.z; // CSS px → screen
    const rect = (left, top, width, height) => ({ left, top, width, height });
    let out = [];

    if (kind === 'padding') {
      const [bt, br, bb, bl] = ['Top', 'Right', 'Bottom', 'Left'].map((s) => v(`border${s}Width`));
      const [pt, pr, pb, pl] = ['Top', 'Right', 'Bottom', 'Left'].map((s) => v(`padding${s}`));
      const innerW = r.width - bl - br;
      const innerH = r.height - bt - bb - pt - pb;
      out = [
        rect(r.left + bl, r.top + bt, innerW, pt),
        rect(r.left + bl, r.bottom - bb - pb, innerW, pb),
        rect(r.left + bl, r.top + bt + pt, pl, innerH),
        rect(r.right - br - pr, r.top + bt + pt, pr, innerH),
      ];
    } else if (kind === 'margin') {
      const [mt, mr, mb, ml] = ['Top', 'Right', 'Bottom', 'Left'].map((s) => v(`margin${s}`));
      out = [
        rect(r.left, r.top - mt, r.width, mt),
        rect(r.left, r.bottom, r.width, mb),
        rect(r.left - ml, r.top, ml, r.height),
        rect(r.right, r.top, mr, r.height),
      ];
    } else if (kind === 'gap') {
      const kids = [...el.children]
        .filter((c) => !/absolute|fixed/.test(getComputedStyle(c).position))
        .map((c) => c.getBoundingClientRect())
        .filter((k) => k.width || k.height);
      for (let i = 0; i < kids.length - 1; i++) {
        const a = kids[i];
        const b = kids[i + 1];
        const top = Math.min(a.top, b.top);
        const left = Math.min(a.left, b.left);
        if (b.left >= a.right - 0.5) out.push(rect(a.right, top, b.left - a.right, Math.max(a.bottom, b.bottom) - top));
        else if (b.top >= a.bottom - 0.5) out.push(rect(left, a.bottom, Math.max(a.right, b.right) - left, b.top - a.bottom));
      }
    }
    return out.filter((x) => x.width > 0.5 && x.height > 0.5);
  }

  function loop() {
    render();
    raf = requestAnimationFrame(loop);
  }

  // ---------- Start-up ----------
  renderPill();
  (async () => {
    const s = await fetchStatus();

    // A pass was running when the page loaded (e.g. after a manual refresh).
    if (s?.running) {
      setOn(true);
      state.phase = 'running';
      renderPill();
      waitForRun(s.running);
      return;
    }

    const reapply = store.get(KEY.reapply);
    if (store.get(KEY.on) || reapply) setOn(true);
    if (reapply) {
      store.set(KEY.reapply, null);
      const list = JSON.parse(reapply);
      // Wait for the app to render the elements before putting edits back.
      const first = list.find((c) => c.source)?.source;
      for (let i = 0; i < 40 && first && !document.querySelector(`[${ATTR}="${CSS.escape(first)}"]`); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const missing = changes.reapply(list);
      toast('Undone', missing ? `Your edits are back, except ${missing} that no longer match the page.` : 'Your code is restored and your edits are back. Adjust and push again.');
    }

    const t = store.get(KEY.toast);
    if (t) {
      store.set(KEY.toast, null);
      const { label, summary } = JSON.parse(t);
      toast(label || 'Claude', summary || 'Done.', { ms: 15000 });
    }
    renderPill();
  })();
}
