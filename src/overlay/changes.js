// Every edit made in this session.
//
// Edits are previewed in the browser only (inline styles, text, display:none
// for deletes). This module records them so that:
//   - the Push handoff can describe them (list()),
//   - ⌘Z / ⌘⇧Z can step back and forth (undo()/redo()),
//   - everything can be thrown away (discardAll()).
//
// Undo works on snapshots: before a step touches an element property, the
// old inline value is saved. Calls made inside the same `group` (one typing
// session in a field, one drag) merge into a single undo step.

import { ATTR, describe, sameSource } from './util.js';

export const TEXT = '#text';
export const POS = '#pos'; // position in the DOM: [parent, nextSibling]

export const textNodeOf = (el) => {
  const nodes = [...el.childNodes].filter((n) => !(n.nodeType === 3 && !n.nodeValue.trim() && el.childNodes.length > 1));
  return nodes.length === 1 && nodes[0].nodeType === 3 ? nodes[0] : null;
};

export function createChanges(onChange, { getSelection = () => [], setSelection = () => {} } = {}) {
  let entries = new Map(); // logical key → entry (what Claude will be told)
  const original = new Map(); // el → Map(prop → first-ever value), for discardAll
  let undoStack = [];
  let redoStack = [];
  let group = null;
  let auto = 0;
  const ids = new WeakMap();
  let seq = 0;
  const idOf = (el) => ids.get(el) ?? (ids.set(el, ++seq), seq);
  let newSeq = 0;
  const label = (el) => (el.dataset?.emNew ? `new ${el.tagName.toLowerCase()} #${el.dataset.emNew}` : describe(el));

  // ---------- low level ----------
  const read = (el, prop) =>
    prop === TEXT
      ? textNodeOf(el)?.nodeValue ?? ''
      : prop === POS
        ? [el.parentNode, el.nextSibling]
        : [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];

  function write(el, prop, value) {
    if (prop === POS) {
      const [parent, next] = value;
      if (parent) parent.insertBefore(el, next && next.parentNode === parent ? next : null);
      else el.remove(); // it didn't exist yet (an added element or group)
      return;
    }
    if (prop === TEXT) {
      const n = textNodeOf(el);
      if (n) n.nodeValue = value;
      return;
    }
    if (value[0]) el.style.setProperty(prop, value[0], value[1]);
    else el.style.removeProperty(prop);
    if (el.getAttribute('style') === '') el.removeAttribute('style');
  }

  function step() {
    const g = group ?? `auto${++auto}`;
    let top = undoStack.at(-1);
    if (!top || top.group !== g || redoStack.length) {
      top = { group: g, saved: new Map(), entries: new Map(entries), selection: getSelection() };
      undoStack.push(top);
      redoStack = [];
    }
    return top;
  }

  function touch(st, el, prop) {
    let m = st.saved.get(el);
    if (!m) st.saved.set(el, (m = new Map()));
    if (!m.has(prop)) m.set(prop, read(el, prop));
    let o = original.get(el);
    if (!o) original.set(el, (o = new Map()));
    if (!o.has(prop)) o.set(prop, read(el, prop));
  }

  function targets(el, scope) {
    const all = sameSource(el);
    if (scope === 'all' && all.length > 1) {
      return { key: `all:${el.getAttribute(ATTR)}`, els: all, scope: 'all', count: all.length };
    }
    return { key: `one:${idOf(el)}`, els: [el], scope: 'one', index: all.indexOf(el), count: all.length };
  }

  const meta = (el, t) => ({
    element: label(el),
    source: el.getAttribute(ATTR),
    newId: el.dataset?.emNew,
    insideNew: el.dataset?.emNew ? undefined : el.parentElement?.closest('[data-em-new]')?.dataset.emNew,
    copyOf: el.dataset?.emCopyOf,
    scope: t.scope,
    index: t.index,
    count: t.count,
  });

  function put(key, entry) {
    if (entry) entries.set(key, entry);
    else entries.delete(key);
  }

  // ---------- edits ----------
  function set(el, scope, prop, value) {
    const t = targets(el, scope);
    const st = step();
    const key = `${t.key}|${prop}`;
    const from = entries.get(key)?.from ?? getComputedStyle(el).getPropertyValue(prop);
    for (const x of t.els) {
      touch(st, x, prop);
      x.style.setProperty(prop, value, 'important');
    }
    const to = getComputedStyle(el).getPropertyValue(prop);
    put(key, to === from ? null : { kind: 'style', ...meta(el, t), property: prop, from, to, value });
    onChange();
  }

  // Move el to `toIndex` among the element children of `newParent` (its own
  // parent by default). With scope "all", every look-alike moves too: into the
  // matching container inside its own copy of the component.
  const indexOf = (el) => [...el.parentElement.children].indexOf(el);
  const moveOrigin = new Map(); // element → where it was before any move
  const near = (n) => {
    if (!n) return null;
    const src = n.getAttribute(ATTR) ?? n.closest(`[${ATTR}]`)?.getAttribute(ATTR) ?? null;
    const same = n.hasAttribute(ATTR) ? sameSource(n) : [n];
    return { element: label(n), source: src, newId: n.dataset?.emNew, index: same.indexOf(n) };
  };

  function parentFor(x, el, newParent) {
    if (x === el || newParent === el.parentElement) return x === el ? newParent : x.parentElement;
    // Climb from el until we reach an ancestor containing newParent; climb x the same amount.
    let a = el;
    let ax = x;
    while (a && !a.contains(newParent)) { a = a.parentElement; ax = ax?.parentElement; }
    if (!a || !ax) return null;
    if (a === newParent) return ax;
    const src = newParent.getAttribute(ATTR);
    if (!src) return newParent;
    const sel = `[${ATTR}="${CSS.escape(src)}"]`;
    const i = [...a.querySelectorAll(sel)].indexOf(newParent);
    return ax.querySelectorAll(sel)[i] ?? null;
  }

  function move(el, scope, toIndex, newParent = el.parentElement) {
    const t = targets(el, scope);
    const st = step();
    const key = `${t.key}|#move`;
    if (!moveOrigin.has(el)) moveOrigin.set(el, { parent: el.parentElement, index: indexOf(el) });
    const origin = moveOrigin.get(el);

    const plan = t.els.map((x) => [x, parentFor(x, el, newParent)]).filter(([, p]) => p);
    for (const [x, parent] of plan) {
      if (x.contains(parent)) continue;
      touch(st, x, POS);
      const others = [...parent.children].filter((k) => k !== x);
      parent.insertBefore(x, others[toIndex] ?? null);
    }

    const same = el.parentElement === origin.parent && indexOf(el) === origin.index;
    put(key, same ? null : {
      kind: 'move', ...meta(el, t),
      from: origin.index, fromParent: near(origin.parent),
      to: indexOf(el), parent: near(el.parentElement),
      after: near(el.previousElementSibling), before: near(el.nextElementSibling),
    });
    onChange();
  }

  // Add a new element (from the Rectangle / Ellipse / Text tools).
  function insert(el, parent, index, info) {
    const st = step();
    el.dataset.emNew = String(++newSeq);
    touch(st, el, POS); // not in the page yet: undo removes it
    parent.insertBefore(el, [...parent.children][index] ?? null);
    put(`new:${el.dataset.emNew}|#insert`, {
      kind: 'insert', newId: el.dataset.emNew, element: label(el), what: info.what,
      tag: el.tagName.toLowerCase(), styles: info.styles, text: info.text ?? null, copyOf: info.copyOf,
      parent: near(parent), to: indexOf(el),
      after: near(el.previousElementSibling), before: near(el.nextElementSibling),
    });
    onChange();
    return el;
  }

  // Wrap elements in a new <div>. They don't have to be siblings: the
  // wrapper goes into their closest shared container, where the first one
  // was, and they all move into it in page order.
  function groupEls(els) {
    let parent = els[0].parentElement;
    while (parent && !els.every((x) => parent.contains(x) && parent !== x)) parent = parent.parentElement;
    const ordered = [...els].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    let branch = ordered[0];
    while (branch.parentElement !== parent) branch = branch.parentElement;
    const moved = ordered.some((x) => x.parentElement !== parent);
    const st = step();
    for (const x of ordered) touch(st, x, POS);
    const wrap = document.createElement('div');
    wrap.dataset.emNew = String(++newSeq);
    touch(st, wrap, POS);
    parent.insertBefore(wrap, branch);
    for (const x of ordered) wrap.appendChild(x);
    put(`new:${wrap.dataset.emNew}|#group`, {
      kind: 'group', newId: wrap.dataset.emNew, element: label(wrap), parent: near(parent), to: indexOf(wrap),
      children: ordered.map(near), fromDifferentContainers: moved,
    });
    onChange();
    return wrap;
  }

  // Put a property back to how it was before this session (drops the change).
  function revert(el, scope, prop) {
    const t = targets(el, scope);
    const st = step();
    for (const x of t.els) {
      touch(st, x, prop);
      write(x, prop, original.get(x).get(prop));
    }
    put(`${t.key}|${prop}`, null);
    onChange();
  }
  const has = (el, scope, prop) => entries.has(`${targets(el, scope).key}|${prop}`);

  function remove(el, scope) {
    const t = targets(el, scope);
    const st = step();
    for (const x of t.els) {
      touch(st, x, 'display');
      x.style.setProperty('display', 'none', 'important');
    }
    put(`${t.key}|#delete`, { kind: 'delete', ...meta(el, t) });
    onChange();
  }

  // Text editing happens in the DOM (contenteditable); bracket it with these.
  let textEdit = null;
  function beginText(el) {
    const node = textNodeOf(el);
    if (!node) return false;
    const st = step();
    touch(st, el, TEXT);
    textEdit = { el, node, before: node.nodeValue };
    return true;
  }
  function endText() {
    if (!textEdit) return;
    const { el, node, before } = textEdit;
    textEdit = null;
    // contenteditable may split/replace text nodes; put React's original node back.
    const text = el.textContent.replace(/\n$/, '');
    node.nodeValue = text;
    el.replaceChildren(node);
    const t = targets(el, 'one');
    const key = `${t.key}|${TEXT}`;
    const from = entries.get(key)?.from ?? before;
    put(key, text === from ? null : { kind: 'text', ...meta(el, t), from, to: text });
    onChange();
  }

  // ---------- history ----------
  function capture(st) {
    const saved = new Map();
    for (const [el, props] of st.saved) {
      const m = new Map();
      for (const prop of props.keys()) m.set(prop, read(el, prop));
      saved.set(el, m);
    }
    return { group: null, saved, entries: new Map(entries), selection: getSelection() };
  }
  // Positions go back last and in reverse, so earlier moves see their old neighbours.
  function writeAll(saved) {
    const moves = [];
    for (const [el, props] of saved) {
      for (const [prop, v] of props) {
        if (prop === POS) moves.push([el, v]);
        else write(el, prop, v);
      }
    }
    for (const [el, v] of moves.reverse()) write(el, POS, v);
  }
  function restore(st) {
    writeAll(st.saved);
    entries = new Map(st.entries);
    setSelection(st.selection || []);
  }
  function undo() {
    const st = undoStack.pop();
    if (!st) return false;
    redoStack.push(capture(st));
    restore(st);
    onChange();
    return true;
  }
  function redo() {
    const st = redoStack.pop();
    if (!st) return false;
    undoStack.push(capture(st));
    restore(st);
    onChange();
    return true;
  }

  function discardAll() {
    while (undoStack.length) restore(undoStack.pop()); // unwinds moves/groups in the right order
    writeAll(original);
    original.clear();
    entries.clear();
    moveOrigin.clear();
    undoStack = [];
    redoStack = [];
    onChange();
  }

  // Run fn so every edit inside it becomes (or joins) one undo step.
  function batch(g, fn) {
    const prev = group;
    group = g ?? `auto${++auto}`;
    try {
      return fn();
    } finally {
      group = prev;
    }
  }

  // Re-create edits from a saved list (after "Undo Claude's pass").
  function reapply(list) {
    let missing = 0;
    batch(null, () => {
      for (const c of list) {
        const els = c.source ? [...document.querySelectorAll(`[${ATTR}="${CSS.escape(c.source)}"]`)] : [];
        const el = c.scope === 'all' ? els[0] : els[c.index ?? 0];
        if (!el) { missing++; continue; }
        if (c.kind === 'style') set(el, c.scope, c.property, c.value);
        else if (c.kind === 'delete') remove(el, c.scope);
        else if (c.kind === 'move') {
          const ps = c.parent?.source ? document.querySelectorAll(`[${ATTR}="${CSS.escape(c.parent.source)}"]`) : [];
          move(el, c.scope, c.to, ps[c.parent.index ?? 0] || el.parentElement);
        }
        else if (c.kind === 'text' && beginText(el)) {
          textNodeOf(el).nodeValue = c.to;
          endText();
        }
      }
    });
    return missing;
  }

  // What Claude is told. Elements added and then deleted drop out; text typed
  // into an added element folds into its insert entry.
  function list() {
    const all = [...entries.values()];
    const gone = new Set(all.filter((c) => c.kind === 'delete' && c.newId).map((c) => c.newId));
    const added = new Map();
    const out = [];
    for (const c of all) {
      if (c.newId && gone.has(c.newId)) continue;
      if (c.kind === 'text' && c.newId && added.has(c.newId)) { added.get(c.newId).text = c.to; continue; }
      const copy = { ...c };
      if (c.kind === 'insert') added.set(c.newId, copy);
      out.push(copy);
    }
    return out;
  }

  return {
    insert, group: groupEls,
    set, move, revert, has, remove, beginText, endText, undo, redo, discardAll, batch, reapply,
    get count() { return list().length; },
    list,
  };
}
