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

import { ATTR, describe, family, familyKey, friendlyName, sameSource, visualKids, visualParent } from './util.js';

export const TEXT = '#text';
export const RICH = '#rich'; // a rich text layer's markup (10a)
export const POS = '#pos'; // position in the DOM: [parent, nextSibling]
const SIZE = /^(width|height|flex-basis|(min|max)-(width|height))$/;
const PLACE = /^(left|right|top|bottom|translate)$/; // canvas positions under constraints (constraints.js)

// Text layers: elements holding only text and line breaks (`<br>`), like
// `Pay people<br/>anywhere`. A line break reads as "\n". Elements with other
// elements inside (a bold word, a link) aren't text layers (yet).
const isBr = (n) => n.nodeName === 'BR';
export const isText = (el) => {
  const nodes = [...el.childNodes].filter((n) => n.nodeType !== 8); // comments don't count
  return nodes.some((n) => n.nodeType === 3) && nodes.every((n) => n.nodeType === 3 || isBr(n));
};
// A <br> from the code that the text no longer needs is hidden, not removed (React
// keeps it); the inline style is the mark, so it survives a reload of the canvas.
const unused = (n) => n.style.display === 'none';
export const textOf = (el) => [...el.childNodes].map((n) => (n.nodeType === 3 ? n.nodeValue : isBr(n) && !unused(n) ? '\n' : '')).join('');

// The text and <br> nodes React rendered, captured before anything edits them.
// Writing text never removes them (React would fail to update a node that's
// gone): lines go into them in order, extra lines get new nodes, and spare ones
// are emptied (text) or hidden (<br>).
const base = new WeakMap();
const added = new WeakMap();
const keepNodes = (el) => { if (!base.has(el)) base.set(el, [...el.childNodes].filter((n) => n.nodeType === 3 || isBr(n))); };
function setText(el, value) {
  keepNodes(el);
  for (const n of added.get(el) || []) n.remove();
  const own = base.get(el);
  const texts = own.filter((n) => n.nodeType === 3);
  const brs = own.filter(isBr);
  const fresh = [];
  const out = [];
  const lines = value.split('\n');
  lines.forEach((line, i) => {
    const t = texts.shift() ?? (fresh.push(document.createTextNode('')), fresh.at(-1));
    t.nodeValue = line;
    out.push(t);
    if (i < lines.length - 1) {
      const br = brs.shift() ?? (fresh.push(document.createElement('br')), fresh.at(-1));
      if (unused(br)) { br.style.removeProperty('display'); if (br.getAttribute('style') === '') br.removeAttribute('style'); }
      out.push(br);
    }
  });
  for (const t of texts) { t.nodeValue = ''; out.push(t); }
  for (const br of brs) { br.style.display = 'none'; out.push(br); }
  added.set(el, fresh);
  el.replaceChildren(...out);
}

// What the person typed while editing (contenteditable may add its own <br>s,
// text nodes or a <div> per line).
function typed(el) {
  let s = '';
  const walk = (p) => {
    for (const n of p.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (isBr(n)) { if (!unused(n)) s += '\n'; }
      else if (n.nodeType === 1) { if (s && !s.endsWith('\n') && /^(DIV|P)$/.test(n.nodeName)) s += '\n'; walk(n); }
    }
  };
  walk(el);
  return s;
}

// ---------- Rich text (10a): words with styled bits inside ----------
// A text layer with words of its own next to inline styled elements (bold, links, a
// tag) and icons (svg, img), like `<span class="who">Priya</span> approved the run`.
// While editing, the app's own nodes are set aside (elements hidden, text emptied) and
// you type into a copy; afterwards the words go back into the app's nodes when the
// structure is the same, or the copy stays on top of the hidden originals (React's
// nodes are never removed, so it can still update them). Its value is inline markup;
// icons are `<em-keep n="0"></em-keep>` (left as they are in the code).
const INLINE = /^(STRONG|B|EM|I|U|S|STRIKE|DEL|INS|A|SPAN|CODE|MARK|SMALL|SUB|SUP|ABBR|Q|CITE|TIME|DATA|KBD|LABEL)$/;
const ATOM = /^(SVG|IMG|svg)$/;
const KEEP = 'EM-KEEP';
function richOk(n) {
  for (const k of n.childNodes) {
    if (k.nodeType === 3 || k.nodeType === 8 || isBr(k)) continue;
    if (k.nodeType !== 1) return false;
    if (k.dataset?.emGone != null) continue;
    if (ATOM.test(k.nodeName)) continue;
    if (!INLINE.test(k.nodeName) || !richOk(k)) return false;
  }
  return true;
}
export const isRich = (el) => !isText(el) && !!el.childNodes.length && richOk(el) &&
  [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()) && [...el.children].some((k) => !isBr(k));
// Is this text edited as rich text (styled words kept)? Once formatted, a plain text stays rich.
export const editsRich = (el) => rich.has(el) || (!isText(el) && isRich(el));
const rich = new WeakMap(); // el → { nodes: its own child nodes, texts: Map(text node → value), atoms: [svg…], baseHtml }
const escapeText = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function keepRich(el) {
  if (rich.has(el)) return rich.get(el);
  const texts = new Map();
  const walk = (n) => { for (const k of n.childNodes) { if (k.nodeType === 3) texts.set(k, k.nodeValue); else if (k.nodeType === 1 && !ATOM.test(k.nodeName)) walk(k); } };
  walk(el);
  const atoms = [...el.querySelectorAll('svg, img')].filter((a) => !a.parentElement.closest('svg'));
  const r = { nodes: [...el.childNodes], texts, atoms };
  rich.set(el, r);
  r.baseHtml = richOf(el);
  return r;
}
// The markup of what shows (hidden originals left out).
function richOf(el, atomAt) {
  const r = rich.get(el);
  atomAt ??= (k) => (r?.atoms || []).indexOf(k._emAtom || k);
  const ser = (n) => [...n.childNodes].map((k) => {
    if (k.nodeType === 3) return escapeText(k.nodeValue);
    if (k.nodeType !== 1) return '';
    if (k.dataset.emGone != null) return '';
    if (isBr(k)) return unused(k) ? '' : '<br>';
    if (ATOM.test(k.nodeName)) { const i = atomAt(k); return `<em-keep n="${i < 0 ? 0 : i}"></em-keep>`; }
    const tag = { b: 'strong', i: 'em', strike: 's' }[k.nodeName.toLowerCase()] || k.nodeName.toLowerCase(); // the browser's bold/italic/strike → semantic tags
    const attrs = ['class', 'href', 'style'].map((a) => {
      let v = k.getAttribute(a);
      if (a === 'style' && v) v = v.split(';').filter((d) => d.trim() && !/^\s*display\s*:\s*none/.test(d) && !/^\s*outline/.test(d)).join(';').trim();
      return v ? ` ${a}="${escapeAttr(v)}"` : '';
    }).join('');
    if (tag === 'span' && !attrs) return ser(k); // a bare span (selected words never styled): just its words
    return `<${tag}${attrs}>${ser(k)}</${tag}>`;
  }).join('');
  return ser(el);
}
// The same markup, read from the DOM alone (a canvas copy after a reload has no editing
// state). Icons are numbered as they sit among the element's own nodes (the ones set
// aside, once its words were retyped); a copy of an icon takes its original's number.
export function richMarkup(el) {
  const atomsIn = (nodes) => nodes.flatMap((n) => (n.nodeType !== 1 ? [] : ATOM.test(n.nodeName) ? [n] : [...n.querySelectorAll('svg, img')].filter((a) => !a.parentElement.closest('svg'))));
  const kids = [...el.childNodes];
  const gone = kids.filter((n) => n.nodeType === 1 && n.dataset.emGone != null);
  const own = atomsIn(gone.length ? gone : kids);
  const clean = (a) => { const c = a.cloneNode(true); delete c.dataset.emGone; c.style.removeProperty('display'); if (c.getAttribute('style') === '') c.removeAttribute('style'); return c; };
  return richOf(el, (k) => {
    const i = own.indexOf(k._emAtom || k);
    if (i >= 0) return i;
    const ck = clean(k);
    return own.findIndex((a) => clean(a).isEqualNode(ck));
  });
}
// Same elements in the same places (only the words differ)?
const shapeOf = (html) => html.replace(/>[^<]*</g, '><').replace(/^[^<]*/, '').replace(/[^>]*$/, '');
function parseRich(el, html) {
  const r = rich.get(el);
  const t = document.createElement('template');
  t.innerHTML = html;
  for (const k of [...t.content.querySelectorAll('*')]) {
    if (k.nodeName === KEEP) { const a = r.atoms[+k.getAttribute('n')]; if (a) { const c = a.cloneNode(true); c._emAtom = a; delete c.dataset.emGone; c.style.removeProperty('display'); if (c.getAttribute('style') === '') c.removeAttribute('style'); k.replaceWith(c); /* a copy of the icon, visible: the original may already be set aside */ } else k.remove(); continue; }
    if (k.nodeName === 'BR' || INLINE.test(k.nodeName)) { for (const at of [...k.attributes]) if (!/^(class|href|style)$/.test(at.name)) k.removeAttribute(at.name); continue; }
    if (k.closest('svg, img')) continue;
    k.replaceWith(...k.childNodes); // anything else: its words only
  }
  return [...t.content.childNodes];
}
function restoreRich(el) {
  const r = rich.get(el);
  for (const n of [...el.childNodes]) if (!r.nodes.includes(n)) n.remove(); // the copy, and whatever the browser made while editing (a <b>…)
  for (const n of r.nodes) if (n.nodeType === 1 && n.dataset.emGone != null) { delete n.dataset.emGone; n.style.removeProperty('display'); if (n.getAttribute('style') === '') n.removeAttribute('style'); }
  for (const [n, v] of r.texts) n.nodeValue = v;
  if (r.nodes.some((n) => n.parentNode !== el)) el.replaceChildren(...r.nodes);
}
// Show `html` in the element (see above).
function setRich(el, html) {
  const r = keepRich(el);
  restoreRich(el);
  if (html === r.baseHtml) return;
  if (shapeOf(html) === shapeOf(r.baseHtml)) { // only words changed: into the app's own text nodes, in order
    const words = [];
    const t = document.createElement('template');
    t.innerHTML = html;
    const walk = (n) => { for (const k of n.childNodes) { if (k.nodeType === 3) words.push(k.nodeValue); else if (k.nodeType === 1 && k.nodeName !== KEEP) walk(k); } };
    walk(t.content);
    const own = [...r.texts.keys()];
    if (words.length === own.length) { own.forEach((n, i) => { n.nodeValue = words[i]; }); return; }
  }
  coverRich(el, html);
}
function coverRich(el, html) {
  const r = rich.get(el);
  for (const n of r.nodes) {
    if (n.nodeType === 3) n.nodeValue = '';
    else if (n.nodeType === 1) { n.dataset.emGone = ''; n.style.setProperty('display', 'none', 'important'); }
  }
  el.append(...parseRich(el, html));
}
// "All like this": the markup `html` (made on `el`) as another instance `x` would show
// it, with its own words. Each of the app's text nodes in `el` (as the code rendered it)
// is looked for, in order, among the new markup's words and swapped for `x`'s. Null
// when a word that differs can't be found whole (it was retyped or split by new formatting).
function asInstance(el, html, x) {
  const a = [...keepRich(el).texts.values()], b = [...keepRich(x).texts.values()];
  if (a.length !== b.length) return null;
  const parts = html.split(/(<[^>]*>)/); // even: words, odd: tags
  let seg = 0, off = 0;
  for (let j = 0; j < a.length; j++) {
    if (!a[j].trim()) continue;
    const t = escapeText(a[j]), s = escapeText(b[j]);
    let found = false;
    for (let i = seg; i < parts.length && !found; i += 2) {
      const k = parts[i].indexOf(t, i === seg ? off : 0);
      if (k < 0) continue;
      parts[i] = parts[i].slice(0, k) + s + parts[i].slice(k + t.length);
      seg = i; off = k + s.length; found = true;
    }
    if (!found && t !== s) return null;
  }
  return parts.join('');
}
// Editing starts: type into a copy (the app's nodes set aside).
function editRich(el) {
  const html = richOf(el);
  keepRich(el);
  restoreRich(el);
  coverRich(el, html);
}

export function createChanges(onChange, { getSelection = () => [], setSelection = () => {}, pageRoot = () => null, onCanvas = () => false } = {}) {
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
    prop === RICH
      ? richOf(el)
      : prop === TEXT
      ? textOf(el)
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
      if (base.has(el) || isText(el)) setText(el, value);
      return;
    }
    if (prop === RICH) { setRich(el, value); return; }
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
    const fam = family(el);
    if (scope === 'all' && fam.length > 1) {
      return { key: `all:${familyKey(el)}`, els: fam, scope: 'all', count: fam.length, family: familyKey(el) };
    }
    const all = sameSource(el); // index among the code instances, for Claude
    return { key: `one:${idOf(el)}`, els: [el], scope: 'one', index: all.indexOf(el), count: all.length };
  }

  // An element a library renders (an icon component) has no source of its own: name the nearest
  // element from the project's code around it, and which one it is, so Push can tell them apart.
  const insideOf = (el) => {
    if (el.getAttribute(ATTR)) return undefined;
    const anc = el.parentElement?.closest(`[${ATTR}]`);
    if (!anc) return undefined;
    const source = anc.getAttribute(ATTR);
    const all = [...document.querySelectorAll(`[${ATTR}="${CSS.escape(source)}"]`)].filter((x) => !onCanvas(x));
    return { element: label(anc), source, index: all.indexOf(anc), count: all.length };
  };
  const meta = (el, t) => ({
    element: label(el),
    source: el.getAttribute(ATTR),
    inside: insideOf(el),
    newId: el.dataset?.emNew,
    insideNew: el.dataset?.emNew ? undefined : el.parentElement?.closest('[data-em-new]')?.dataset.emNew,
    copyOf: el.dataset?.emCopyOf,
    scope: t.scope,
    family: t.family, // scope "all": the JSX line (or "new #N") whose elements and copies this covers
    index: t.index,
    count: t.count,
    onCanvas: onCanvas(el) || undefined, // canvas edits are undoable but never pushed (until B3)
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
    // Sizes compute to pixels either way, so "same number" can still be a real
    // change (Hug → Fixed at 40px). It's a no-op only once it's back to the
    // original inline value.
    const orig = original.get(el).get(prop)[0];
    const intent = (SIZE.test(prop) || PLACE.test(prop)) && value !== orig; // also positions: 5% or calc(50% …) can measure the same as before
    // Back where it started (e.g. typing the value it already had): put the
    // original inline style back instead of leaving an !important copy.
    if (to === from && !intent) for (const x of t.els) write(x, prop, original.get(x).get(prop));
    put(key, to === from && !intent ? null
      : { kind: 'style', ...meta(el, t), property: prop, from: to === from ? orig || 'auto' : from, to: to === from ? value : to, value });
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

  // Where an element sits in the Figma view (invisible wrappers skipped), and
  // that as a sentence. Push reads this as the intent of a move: the code's
  // own parents can differ, and Claude picks the cleanest way to get there.
  function visualSpot(el) {
    const root = pageRoot();
    const parent = visualParent(el, root);
    if (!parent) return null;
    const sibs = visualKids(parent, (k) => k === el || (k.getClientRects().length > 0 && !/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK|META|EDIT-MODE-ROOT)$/.test(k.tagName)));
    const i = sibs.indexOf(el);
    const after = i > 0 ? sibs[i - 1] : null;
    const before = i >= 0 && i < sibs.length - 1 ? sibs[i + 1] : null;
    const name = (n) => `"${n === root ? 'Page' : friendlyName(n)}"`;
    const intent = `Put ${name(el)} inside ${name(parent)}` +
      (after && before ? `, after ${name(after)} and before ${name(before)}` : after ? `, last, after ${name(after)}` : before ? `, first, before ${name(before)}` : '') + '.';
    return { parent: near(parent), after: near(after), before: near(before), intent };
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
      visual: visualSpot(el),
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
      kind: 'insert', newId: el.dataset.emNew, element: label(el), what: info.what, onCanvas: onCanvas(el) || undefined,
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
      kind: 'group', newId: wrap.dataset.emNew, element: label(wrap), parent: near(parent), to: indexOf(wrap), onCanvas: onCanvas(wrap) || undefined,
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
    const info = meta(el, t); // before it's taken out: a detached element no longer reads as on the canvas
    const st = step();
    for (const x of t.els) {
      if (onCanvas(x)) { // on the canvas it's really removed (the saved canvas stays clean); undo puts it back
        touch(st, x, POS);
        x.remove();
        continue;
      }
      touch(st, x, 'display');
      x.style.setProperty('display', 'none', 'important');
    }
    put(`${t.key}|#delete`, { kind: 'delete', ...info });
    onChange();
  }

  // Text editing happens in the DOM (contenteditable); bracket it with these.
  let textEdit = null;
  function beginText(el) {
    if (rich.has(el) || (!isText(el) && !base.has(el))) {
      if (!rich.has(el) && !isRich(el)) return false;
      keepRich(el);
      const st = step();
      touch(st, el, RICH);
      textEdit = { el, before: richOf(el), rich: true };
      editRich(el); // type into a copy
      return true;
    }
    keepNodes(el);
    const st = step();
    touch(st, el, TEXT);
    textEdit = { el, before: textOf(el) };
    return true;
  }
  function endText(scope = 'one') {
    if (!textEdit) return;
    const { el, before } = textEdit;
    const isRichEdit = textEdit.rich;
    const earlier = textEdit.from; // a plain change of this session that this rich one replaces
    textEdit = null;
    if (isRichEdit) {
      let html = richOf(el).replace(/<br>$/, ''); // the browser's trailing <br>
      // Icons can't be typed away (typing over everything selected would take them): put them back.
      const r = rich.get(el);
      r.atoms.forEach((a, n) => {
        const tag = `<em-keep n="${n}"></em-keep>`;
        if (html.includes(tag)) return;
        html = r.baseHtml.trim().startsWith(tag) ? `${tag}${html}` : `${html}${tag}`;
      });
      setRich(el, html);
      // "All like this" and the structure changed (which words are bold, linked…): every instance
      // gets it in the code (each keeps its own words); the page previews this one.
      const one = targets(el, 'one');
      const prev = entries.get(`${one.key}|${RICH}`) || entries.get(`${targets(el, 'all').key}|${RICH}`);
      const from = prev?.from ?? earlier ?? before;
      const t = scope === 'all' && shapeOf(html) !== shapeOf(from) ? targets(el, 'all') : one;
      // …and the others preview it too, each with its own words (when they can be found).
      if (t !== one) {
        const st = undoStack.at(-1);
        for (const x of t.els) {
          if (x === el || !st) continue;
          const mine = asInstance(el, html, x);
          if (mine == null) continue;
          touch(st, x, RICH);
          setRich(x, mine);
        }
      }
      entries.delete(`${one.key}|${RICH}`);
      entries.delete(`${targets(el, 'all').key}|${RICH}`);
      put(`${t.key}|${RICH}`, html === from ? null : { kind: 'text', rich: true, ...meta(el, t), from, to: html });
      onChange();
      return;
    }
    // contenteditable may split/replace nodes; put React's own nodes back with the new lines.
    const text = typed(el).replace(/\n$/, ''); // the browser's trailing <br> after a last line break
    setText(el, text);
    const t = targets(el, 'one');
    const key = `${t.key}|${TEXT}`;
    const from = entries.get(key)?.from ?? before;
    put(key, text === from ? null : { kind: 'text', ...meta(el, t), from, to: text });
    onChange();
  }

  // Formatting words in plain text (10b): this edit becomes a rich one, mid-typing. React's
  // nodes go back to how they were when editing started, then the words typed so far
  // become the copy you go on editing. One change for Push (an earlier plain change of
  // this session is folded in).
  function textToRich(el) {
    if (!textEdit || textEdit.rich || textEdit.el !== el) return false;
    const now = typed(el).replace(/\n$/, '');
    setText(el, textEdit.before);
    const key = `${targets(el, 'one').key}|${TEXT}`;
    const earlier = entries.get(key)?.from;
    entries.delete(key);
    keepRich(el);
    touch(step(), el, RICH);
    const asHtml = (t) => escapeText(t).replace(/\n/g, '<br>');
    textEdit = { el, before: richOf(el), rich: true, from: earlier != null ? asHtml(earlier) : undefined };
    restoreRich(el);
    coverRich(el, asHtml(now));
    return true;
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
          if (c.rich) setRich(el, c.to); else setText(el, c.to);
          endText();
        }
      }
    });
    return missing;
  }

  // What Claude is told. Elements added and then deleted drop out; text typed
  // into an added element folds into its insert entry. Canvas edits stay out.
  function list() {
    const all = [...entries.values()].filter((c) => !c.onCanvas);
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
    set, move, revert, has, remove, beginText, endText, textToRich, undo, redo, discardAll, batch, reapply,
    get count() { return list().length; },
    list,
  };
}
