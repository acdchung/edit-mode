// B3: what changed on the canvas, compared with the page.
//
// Every node of a copy remembers its original (data-em-from =
// "file:line:col#index": the index among elements rendered from that line).
// At Push, each copy is compared with the page as it is now, and the
// differences come out in the same shape as live edits (changes.js), so
// Push and Claude treat them alike:
//   style   a property set on the copy that renders differently from the original
//   text    the copy's text differs
//   place   placed freely (absolute) where the original is in the flow, with its constraints
//   move    reordered among its siblings, or moved into another container
//   delete  an original child with no copy left
//   group   a new wrapper (group or auto-layout frame) around copied things
//   insert  something new inside the copy
// Nothing is recorded while you work, so it can't drift and survives reloads.
// Things on the canvas outside any copy aren't compared (B3d: "Build this").

import { ATTR, NOT_LAYER, canvasArea, describe } from './util.js';
import { isText, textOf } from './changes.js';
import { constraintOf, frameBox } from './constraints.js';

const FROM = 'data-em-from';
// The copy's root: how it sits on the canvas, not part of the design.
const ROOT_SLOT = /^(position|top|right|bottom|left|inset|margin|grid|align-self|justify-self|place-self|flex|order|z-index|width|height|min-|max-|inline-size|block-size|translate)/;
// Folded into a `place` entry.
const PLACE = /^(position|top|right|bottom|left|inset|translate)/;
const KIND_NAME = { frame: 'frame', rectangle: 'rectangle', ellipse: 'ellipse', text: 'text', image: 'image', group: 'group' };

const FAMILIES = [
  ['background', /^background-/],
  ['border-radius', /^border-(top|bottom)-(left|right)-radius$/],
  ['padding', /^padding-(top|right|bottom|left)$/],
  ['margin', /^margin-(top|right|bottom|left)$/],
  ['border-width', /^border-(top|right|bottom|left)-width$/],
  ['border-style', /^border-(top|right|bottom|left)-style$/],
  ['border-color', /^border-(top|right|bottom|left)-color$/],
  ['gap', /^(row|column)-gap$/],
];

// The original on the page for a copied node: { el, source, index, count }.
export function originalOf(n) {
  const m = /^(.*)#(\d+)$/.exec(n.getAttribute(FROM) || '');
  if (!m) return null;
  const els = document.querySelectorAll(`[${ATTR}="${CSS.escape(m[1])}"]`);
  return { el: els[+m[2]] || null, source: m[1], index: +m[2], count: els.length };
}

// A top-level canvas item that's a copy of the page (vs a new design): a
// Duplicate page frame, a pasted piece, or a frame that's mostly copied
// pieces. A new design may hold a pasted piece (your real button): it's
// reused, not compared.
export function isCopyTop(n) {
  if (n.dataset.emDesign) return n.hasAttribute(FROM); // a new design, once built and linked to its code
  if (n.dataset.emCopy === 'page' || n.hasAttribute(FROM)) return true;
  const kids = [...n.children].filter((k) => !NOT_LAYER.test(k.tagName));
  const copied = kids.filter((k) => k.hasAttribute(FROM) || k.hasAttribute(WAS)).length;
  return copied > 0 && copied * 2 >= kids.length;
}

// New designs (B3d): every top-level canvas item that isn't a copy, except
// an empty frame (a fresh canvas's starter frame).
export function newDesigns() {
  const area = canvasArea();
  if (!area) return [];
  return [...area.children].filter((n) => !NOT_LAYER.test(n.tagName) && !isCopyTop(n) && (n.children.length || n.dataset.emKind !== 'frame' || n.textContent.trim()));
}
// Its name in the Push list and as a component: its layer name, else what it is.
export function designName(n) {
  return n.dataset.emName || { frame: 'Frame', rectangle: 'Rectangle', ellipse: 'Ellipse', text: (n.textContent.trim().slice(0, 24) || 'Text'), image: 'Image', group: 'Group' }[n.dataset.emKind] || friendly(n);
}
export const componentName = (name) => (name.normalize('NFKD').replace(/[^\w\s-]/g, '').split(/[\s_-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Design').replace(/^(\d)/, 'Design$1');

// A new design as Claude gets it: its markup with every style inline (the
// look, measured), `data-name`/`data-kind` for its layers, and pieces pasted
// from the page marked `data-reuse="file:line:col#index"` (render the real
// component there, don't rebuild it). Its spot on the canvas is dropped.
export function buildHtml(n) {
  const c = n.cloneNode(true);
  const reuse = [];
  const all = [c, ...c.querySelectorAll('*')];
  // The pasted pieces: copied nodes with no copied node above them (marked before anything is cleaned up).
  const tops = all.filter((x) => x !== c && x.hasAttribute(FROM) && !x.parentElement.closest(`[${FROM}]`));
  for (const x of tops) {
    const from = x.getAttribute(FROM);
    x.setAttribute('data-reuse', from);
    const o = originalOf(x);
    reuse.push({ element: o?.el ? describe(o.el) : describe(x), source: o?.source ?? from.replace(/#\d+$/, ''), index: o?.index ?? 0 });
  }
  for (const x of all) {
    for (const a of [...x.attributes]) {
      if (a.name === 'data-em-name') x.setAttribute('data-name', a.value);
      if (a.name === 'data-em-kind') x.setAttribute('data-kind', a.value);
      if (a.name.startsWith('data-em-')) x.removeAttribute(a.name);
    }
  }
  for (const p of ['position', 'left', 'top', 'right', 'bottom', 'inset', 'translate', 'z-index']) c.style.removeProperty(p);
  const html = c.outerHTML;
  return { html: html.length > 60000 ? html.slice(0, 60000) + '<!-- cut: too long -->' : html, reuse };
}

// The copies on the canvas, one per top-level canvas item that holds copied
// things (Duplicate page's frame, a pasted piece): its roots are the copied
// nodes with no copied node above them (a page copy has several: nav, main…).
export function copiesOnCanvas() {
  const area = canvasArea();
  if (!area) return [];
  const units = new Map();
  for (const n of area.querySelectorAll(`[${FROM}]`)) {
    if (n.parentElement.closest(`[${FROM}]`)) continue;
    let top = n;
    while (top.parentElement !== area) top = top.parentElement;
    if (!isCopyTop(top)) continue; // part of a new design: reused, not compared
    if (!units.has(top)) units.set(top, []);
    units.get(top).push(n);
  }
  return [...units].map(([top, roots]) => ({ top, roots }));
}

// A name for a copy: its canvas item's name ("Page copy"), else what it copies.
export function copyName(top) {
  return top.dataset.emName || friendly(top);
}
const friendly = (n) => {
  const cls = [...n.classList].find((c) => !/^(is|has)-/.test(c));
  const raw = (cls || n.tagName.toLowerCase()).replace(/--.*$/, '').replace(/[-_]+/g, ' ');
  return raw[0].toUpperCase() + raw.slice(1);
};

// How Push refers to a page element (same shape as changes.js `near`).
function near(el) {
  if (!el) return null;
  const src = el.getAttribute(ATTR) ?? el.closest(`[${ATTR}]`)?.getAttribute(ATTR) ?? null;
  const same = el.hasAttribute(ATTR) ? [...document.querySelectorAll(`[${ATTR}="${CSS.escape(src)}"]`)] : [el];
  return { element: describe(el), source: src, index: same.indexOf(el) };
}

const inlineStyles = (n) => {
  const out = {};
  for (let i = 0; i < n.style.length; i++) out[n.style[i]] = n.style.getPropertyValue(n.style[i]);
  return out;
};
// Two computed values that render the same, written differently: what Claude
// writes (`transparent`, `bottom: 0`, a default `normal`) vs what the canvas
// measured (`rgba(255, 255, 255, 0)`, `-0.2px`, `stretch`).
const NORMAL_IS = { 'align-items': 'stretch', 'justify-items': 'stretch', 'align-self': 'stretch', 'justify-self': 'stretch', 'row-gap': '0px', 'column-gap': '0px' };
// A gradient's first stop at 0% and last at 100% are the defaults: written or not, the same.
const stops = (v) => v.replace(/(gradient\((?:[^(),]+, )?(?:rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)) 0%,/g, '$1,').replace(/((?:rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)) 100%\)/g, '$1)');
const clear = (v) => stops(v).replace(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/g, 'rgba(0, 0, 0, 0)').replace(/\btransparent\b/g, 'rgba(0, 0, 0, 0)');
export function sameValue(prop, a, b) {
  if (a === b) return true;
  if (NORMAL_IS[prop] && (a === 'normal' ? NORMAL_IS[prop] : a) === (b === 'normal' ? NORMAL_IS[prop] : b)) return true;
  // Colours a few steps apart (a value snapped to the project's token): the same to the eye.
  const ca = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(a), cb = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(b);
  if (ca && cb && Math.hypot(ca[1] - cb[1], ca[2] - cb[2], ca[3] - cb[3]) <= 12 && Math.abs((ca[4] ?? 1) - (cb[4] ?? 1)) <= 0.02) return true;
  const px = /^(-?[\d.]+)px$/;
  const ma = px.exec(a), mb = px.exec(b);
  if (ma && mb && Math.abs(ma[1] - mb[1]) < 0.5) return true;
  return clear(a) === clear(b);
}
const newName = (n) => n.dataset.emName || KIND_NAME[n.dataset.emKind] || n.tagName.toLowerCase();
const cleanHtml = (n) => {
  const c = n.cloneNode(true);
  for (const x of [c, ...c.querySelectorAll('*')]) for (const a of [...x.attributes]) if (a.name.startsWith('data-em-') && a.name !== 'data-em-name') x.removeAttribute(a.name);
  return c.outerHTML.slice(0, 4000);
};

// The differences between one copy and the page.
export function compareCopy({ top, roots }, copy = { id: 0, name: copyName(top) }) {
  const linked = new Map(); // copy node → original info
  const copyOf = new Map(); // original element → copy node
  const isRoot = new Set(roots);
  const nodes = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]).filter((n) => !NOT_LAYER.test(n.tagName));
  let missing = 0;
  for (const n of nodes) {
    if (!n.hasAttribute(FROM)) continue;
    const o = originalOf(n);
    if (o?.el && compatible(n, o.el)) { linked.set(n, o); copyOf.set(o.el, n); } else missing++;
  }
  // Things the project's code doesn't render itself (an icon library's <svg>)
  // carry no source: they're matched by position inside their matched parent.
  const untagged = (k) => !k.hasAttribute(FROM) && !k.hasAttribute(WAS) && !k.dataset?.emKind && !k.dataset?.emName;
  const pairUp = (c, o) => {
    const ck = [...c.children].filter(untagged), ok = [...o.children].filter((k) => !k.hasAttribute(ATTR) && !NOT_LAYER.test(k.tagName));
    if (!ck.length || ck.length !== ok.length || ck.some((k, i) => k.tagName !== ok[i].tagName)) return;
    ck.forEach((k, i) => {
      const host = o.closest(`[${ATTR}]`);
      const info = { el: ok[i], source: host?.getAttribute(ATTR) ?? null, index: linked.get(c)?.index ?? 0, count: linked.get(c)?.count ?? 1, inside: describe(host || o) };
      linked.set(k, info); copyOf.set(ok[i], k);
      pairUp(k, ok[i]);
    });
  };
  for (const [c, o] of [...linked]) pairUp(c, o.el);
  const linkedUp = (n) => { if (isRoot.has(n)) return null; for (let p = n.parentElement; p; p = p.parentElement) { if (linked.has(p)) return p; if (isRoot.has(p)) return null; } return null; };
  const ref = (o) => ({ element: describe(o.el) + (o.inside ? ` in ${o.inside}` : ''), source: o.source, index: o.index, count: o.count, scope: 'one', fromCanvas: copy.id, copyName: copy.name });
  // The nearest copied siblings before and after a node (through new wrappers), as page refs.
  const neighbours = (n) => {
    const sib = (dir) => { for (let s = n[dir]; s; s = s[dir]) { if (linked.has(s)) return near(linked.get(s).el); const inner = s.querySelector?.(`[${FROM}]`); if (inner && linked.has(inner)) return near(linked.get(inner).el); } return null; };
    return { after: sib('previousElementSibling'), before: sib('nextElementSibling') };
  };
  const out = [];

  // Placed freely: absolute on the canvas, in the flow on the page.
  const placed = new Set();
  for (const [c, o] of linked) {
    if (!isRoot.has(c) && getComputedStyle(c).position === 'absolute' && getComputedStyle(o.el).position !== 'absolute') placed.add(c);
  }

  for (const [c, o] of linked) {
    const cs = getComputedStyle(c), os = getComputedStyle(o.el);
    // Styles: only what's set on the copy, and only where it renders differently.
    for (let i = 0; i < c.style.length; i++) {
      const p = c.style[i];
      if (isRoot.has(c) && ROOT_SLOT.test(p)) continue;
      if (placed.has(c) && PLACE.test(p)) continue;
      const to = cs.getPropertyValue(p), from = os.getPropertyValue(p);
      if (sameValue(p, to, from)) continue;
      // Shrinking only matters when space runs out: the same size on both sides, nothing to push.
      if (p === 'flex-shrink' && Math.abs(c.offsetWidth - o.el.offsetWidth) < 1 && Math.abs(c.offsetHeight - o.el.offsetHeight) < 1) continue;
      // A frame made `relative` only so things can be placed freely in it: part of placing them.
      if (p === 'position' && to === 'relative' && from === 'static' && [...c.children].some((k) => placed.has(k))) continue;
      out.push({ kind: 'style', ...ref(o), property: p, from, to, value: c.style.getPropertyValue(p) });
    }
    // One change, several properties: a fill (background image, colour, size…),
    // four corners, four sides. One entry; when every side got the same value
    // it's the shorthand (`border-radius: 20px`), else the rest are in `also`.
    const mine = out.filter((e) => e.kind === 'style' && e.fromCanvas === copy.id && e.source === o.source && e.index === o.index && e.element === ref(o).element);
    for (const [short, re] of FAMILIES) {
      const fam = mine.filter((e) => re.test(e.property) && out.includes(e));
      if (fam.length < 2) continue;
      const main = (short === 'background' && fam.find((e) => e.property === 'background-image')) || fam[0];
      const same = fam.every((e) => e.to === main.to && e.from === main.from && e.value === main.value);
      if (same && short !== 'background') main.property = short;
      else main.also = Object.fromEntries(fam.filter((e) => e !== main).map((e) => [e.property, e.value]));
      for (const e of fam) if (e !== main) out.splice(out.indexOf(e), 1);
    }
    if (placed.has(c)) {
      const b = frameBox(c);
      const r = (v) => Math.round(v * 10) / 10;
      out.push({ kind: 'place', ...ref(o), constraints: { h: constraintOf(c, 'h'), v: constraintOf(c, 'v') },
        box: { x: r(b.x), y: r(b.y), width: r(b.w), height: r(b.h), frameWidth: r(b.pw), frameHeight: r(b.ph) },
        styles: Object.fromEntries(Object.entries(inlineStyles(c)).filter(([p]) => PLACE.test(p))),
        parent: near(linked.get(linkedUp(c))?.el ?? o.el.parentElement) });
    }
    // Text.
    if (isText(c) && isText(o.el) && textOf(c) !== textOf(o.el)) out.push({ kind: 'text', ...ref(o), from: textOf(o.el), to: textOf(c) });
    // Moved into another container.
    if (!isRoot.has(c)) {
      const up = linkedUp(c);
      const now = up ? linked.get(up).el : null;
      if (now && now !== o.el.parentElement) {
        out.push({ kind: 'move', ...ref(o), fromParent: near(o.el.parentElement), parent: near(now), ...neighbours(c), into: true });
      }
    }
  }

  // Reordered among siblings: the ones off the longest run that kept the page's order.
  for (const [p, po] of linked) {
    const kids = [...p.querySelectorAll('*')].filter((k) => linked.has(k) && linkedUp(k) === p && linked.get(k).el.parentElement === po.el);
    if (kids.length < 2) continue;
    const order = [...po.el.children];
    const idx = kids.map((k) => order.indexOf(linked.get(k).el));
    const keep = longestRun(idx);
    kids.forEach((k, i) => {
      if (keep.has(i)) return;
      const o = linked.get(k);
      out.push({ kind: 'move', ...ref(o), fromParent: near(po.el), parent: near(po.el), from: idx[i], to: i, ...neighbours(k) });
    });
  }

  // Deleted: an original child with no copy left (only the top one of what's gone).
  for (const [, o] of linked) {
    for (const k of o.el.children) {
      if (NOT_LAYER.test(k.tagName) || copyOf.has(k) || copy.builtEls?.has(k)) continue; // built from a design on the canvas: not this copy's to delete
      if (!k.getClientRects().length && getComputedStyle(k).display === 'none') continue; // hidden on the page as well
      const same = k.hasAttribute(ATTR) ? [...document.querySelectorAll(`[${ATTR}="${CSS.escape(k.getAttribute(ATTR))}"]`)] : [k];
      out.push({ kind: 'delete', element: describe(k), source: k.getAttribute(ATTR), index: same.indexOf(k), count: same.length, scope: 'one', fromCanvas: copy.id, copyName: copy.name });
    }
  }

  // New things: wrappers around copied things, and new elements.
  let newSeq = 0;
  const newIds = new Map();
  const idOf = (n) => newIds.get(n) ?? (newIds.set(n, `c${copy.id}-${++newSeq}`), newIds.get(n));
  for (const n of nodes) {
    if (linked.has(n) || n.hasAttribute(FROM)) continue;
    const up = linkedUp(n);
    if (!up) continue; // outside the copy's copied part (shouldn't happen)
    const parent = near(linked.get(up).el);
    if (n.querySelector(`[${FROM}]`)) {
      const children = [...n.children].map((k) => (linked.has(k) ? near(linked.get(k).el) : { element: `new ${newName(k)}`, newId: idOf(k) }));
      out.push({ kind: 'group', newId: idOf(n), element: newName(n), what: n.dataset.emKind || 'group', parent, ...neighbours(n),
        children, styles: inlineStyles(n), autoLayout: /flex/.test(getComputedStyle(n).display), fromCanvas: copy.id, copyName: copy.name });
      continue;
    }
    // A new element: only the top one of a new piece (its insides come with its html).
    const pe = n.parentElement;
    if (!linked.has(pe) && !pe.querySelector(`[${FROM}]`)) continue;
    out.push({ kind: 'insert', newId: idOf(n), element: `new ${newName(n)}`, what: n.dataset.emKind || n.tagName.toLowerCase(), tag: n.tagName.toLowerCase(),
      styles: inlineStyles(n), text: isText(n) ? textOf(n) : n.children.length ? null : n.textContent, html: cleanHtml(n), parent, ...neighbours(n),
      insideNew: linked.has(pe) ? undefined : idOf(pe), fromCanvas: copy.id, copyName: copy.name });
  }

  // The same change on every instance rendered from one line (all four figures
  // made semibold): one change for all of them, as "All like this" would send.
  const groups = new Map();
  for (const c of out) if (c.kind === 'style' && c.source && c.count > 1) {
    const k = `${c.source}|${c.property}|${c.value}|${JSON.stringify(c.also ?? null)}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(c);
  }
  for (const list of groups.values()) {
    if (new Set(list.map((c) => c.index)).size !== list[0].count) continue;
    Object.assign(list[0], { scope: 'all', family: list[0].source, index: undefined });
    for (const c of list.slice(1)) out.splice(out.indexOf(c), 1);
  }
  return { top, copy, changes: out, missing };
}

// Indices (into `a`) of a longest increasing run.
function longestRun(a) {
  const n = a.length, len = Array(n).fill(1), prev = Array(n).fill(-1);
  let best = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) if (a[j] < a[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
    if (len[i] > len[best]) best = i;
  }
  const keep = new Set();
  for (let i = n ? best : -1; i >= 0; i = prev[i]) keep.add(i);
  return keep;
}

// ---------- Re-linking (B3c) ----------
// After a Push (or any code edit) line numbers move, so a copy's links can
// point at nothing or at the wrong element. Each copy is then matched to
// the page again by structure (same tags, shared classes, children that line
// up) and its links rewritten, including new groups and new elements that
// now exist in the code. What can't be matched is set aside
// (data-em-from-was), never guessed, so it shows up as still different.
const WAS = 'data-em-from-was';
// A layer drawn on the canvas vs the tag Claude chose for it: a text layer may
// be any text element, a frame or group any block. Otherwise the same tag.
const TEXTY = /^(P|SPAN|DIV|H[1-6]|LABEL|STRONG|EM|SMALL|A|LI|DT|DD|FIGCAPTION|BLOCKQUOTE)$/;
const BLOCKY = /^(DIV|SECTION|ARTICLE|HEADER|FOOTER|NAV|ASIDE|MAIN|UL|OL|LI|FIGURE|FORM|FIELDSET)$/;
export const tagOk = (c, p) => c.tagName === p.tagName ||
  (c.tagName === 'DIV' && ((c.dataset?.emKind === 'text' && TEXTY.test(p.tagName)) || (/^(frame|group|rectangle|ellipse)$/.test(c.dataset?.emKind || '') && BLOCKY.test(p.tagName))));
const shares = (a, b) => [...a.classList].filter((c) => b.classList.contains(c)).length;
const compatible = (c, o) => !!o && tagOk(c, o) && (!c.classList.length || !o.classList.length || shares(c, o) > 0);
const kidsOf = (n) => [...n.children].filter((k) => !NOT_LAYER.test(k.tagName) && k.tagName !== 'EDIT-MODE-ROOT' && !k.hasAttribute('data-em-canvas'));

export function linksOk({ roots }) {
  for (const r of roots) for (const n of [r, ...r.querySelectorAll(`[${FROM}]`)]) {
    if (!n.hasAttribute(FROM)) continue;
    if (!compatible(n, originalOf(n)?.el)) return false;
  }
  return true;
}

function matcher() {
  const memo = new Map();
  function sim(c, p, depth) {
    if (!tagOk(c, p)) return -Infinity;
    let m = memo.get(c);
    if (!m) memo.set(c, (m = new Map()));
    const key = `${depth}`;
    let byP = m.get(key);
    if (!byP) m.set(key, (byP = new Map()));
    if (byP.has(p)) return byP.get(p);
    const sh = shares(c, p);
    // Same classes (or neither has any): a likely pair. A copy node with no
    // class (a group or frame made on the canvas) vs a page node with one
    // (the wrapper Claude wrote): only if their contents line up. Different
    // classes: unlikely.
    let score = c.classList.length ? (p.classList.length ? (sh ? 1 + 2 * sh : -1.5) : 0.5) : (p.classList.length ? -0.5 : 1);
    // Inline styles the code sets itself (React's style prop: a bar's width) stay on the copy.
    for (let i = 0; i < p.style.length; i++) { const q = p.style[i]; if (c.style.getPropertyValue(q) === p.style.getPropertyValue(q)) score += 0.5; }
    const ck = kidsOf(c), pk = kidsOf(p);
    if (!ck.length && !pk.length && c.textContent.trim() === p.textContent.trim()) score += 2;
    if (depth > 0 && ck.length && pk.length) score += 0.5 * align(ck, pk, depth - 1).total;
    byP.set(p, score);
    return score;
  }
  // The best order-keeping pairing of two child lists.
  function align(a, b, depth) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    const S = a.map((x) => b.map((y) => sim(x, y, depth)));
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const s = S[i - 1][j - 1];
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], s > 0 ? dp[i - 1][j - 1] + s : -Infinity);
    }
    const pairs = [];
    for (let i = n, j = m; i > 0 && j > 0;) {
      const s = S[i - 1][j - 1];
      if (s > 0 && dp[i][j] === dp[i - 1][j - 1] + s) { pairs.push([a[i - 1], b[j - 1]]); i--; j--; }
      else if (dp[i][j] === dp[i - 1][j]) i--;
      else j--;
    }
    return { pairs: pairs.reverse(), total: dp[n][m] };
  }
  return { sim, align };
}

function setLink(c, p) {
  const src = p.getAttribute(ATTR);
  if (src) {
    const i = [...document.querySelectorAll(`[${ATTR}="${CSS.escape(src)}"]`)].indexOf(p);
    c.setAttribute(FROM, `${src}#${i}`);
    c.removeAttribute(WAS);
  } else if (c.hasAttribute(FROM)) { // matched something the project doesn't render itself: paired by position at compare time
    c.setAttribute(WAS, c.getAttribute(FROM));
    c.removeAttribute(FROM);
  }
}
function setAside(n) {
  for (const x of [n, ...n.querySelectorAll(`[${FROM}]`)]) {
    if (!x.hasAttribute(FROM)) continue;
    x.setAttribute(WAS, x.getAttribute(FROM));
    x.removeAttribute(FROM);
  }
}

// Match one copy to the page again. Returns false (and changes nothing) when
// a root has no counterpart yet, e.g. the app hasn't rendered.
// Children are matched in any order (the designer may have reordered them);
// the insides of a group or frame made on the canvas are matched against
// the page container it sits in; something moved into another container is
// looked for anywhere in the copied piece.
export function relinkCopy({ roots }, anchors = null) {
  const { sim } = matcher();
  const pageEls = [...document.querySelectorAll(`[${ATTR}]`)];
  const used = new Set();
  const plan = [];
  for (const r of anchors ? [] : roots) {
    const file = (r.getAttribute(FROM) || r.getAttribute(WAS) || '').split(':')[0];
    let cands = pageEls.filter((p) => tagOk(r, p) && (!r.classList.length || shares(r, p) > 0));
    if (file && cands.some((p) => p.getAttribute(ATTR).startsWith(file + ':'))) cands = cands.filter((p) => p.getAttribute(ATTR).startsWith(file + ':'));
    if (cands.length > 300) cands = cands.slice(0, 300);
    let best = null, bestScore = 0;
    for (const p of cands) { if (used.has(p)) continue; const sc = sim(r, p, 2); if (sc > bestScore) { best = p; bestScore = sc; } }
    if (!best) return false;
    used.add(best);
    plan.push([r, best]);
  }
  // A group or frame made on the canvas: no class, not linked to anything yet.
  // (Made on the canvas = it has a kind; a copy of the page never does. Once
  // pushed it's linked to the wrapper in the code, until that's gone again.)
  const canvasWrapper = (k) => kidsOf(k).length > 0 && (/^(group|frame)$/.test(k.dataset.emKind || '') || (!k.classList.length && !k.hasAttribute(FROM) && !k.hasAttribute(WAS)));
  // Best pairs, highest score first (ties: closest in order), each side once.
  const assign = (cs, ps) => {
    const all = [];
    const at = (i, n) => (n > 1 ? i / (n - 1) : 0); // relative position in the list
    cs.forEach((c, i) => ps.forEach((p, j) => { if (used.has(p)) return; const sc = sim(c, p, 2); if (sc > 0) all.push([sc, Math.abs(at(i, cs.length) - at(j, ps.length)), c, p]); }));
    all.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    const got = new Map();
    for (const [, , c, p] of all) if (!got.has(c) && !used.has(p)) { got.set(c, p); used.add(p); }
    return got;
  };
  if (anchors) for (const [r, p] of anchors) { used.add(p); plan.push([r, p]); }
  const pending = [];
  const walk = (c, p) => {
    setLink(c, p);
    const pk = kidsOf(p);
    const pairs = assign(kidsOf(c), pk);
    const open = (k) => {
      if (pairs.has(k)) return;
      if (canvasWrapper(k)) { // its insides belong to this container on the page
        if (k.hasAttribute(FROM)) { k.setAttribute(WAS, k.getAttribute(FROM)); k.removeAttribute(FROM); } // the code's wrapper is gone
        const inner = assign(kidsOf(k), pk);
        for (const [x, y] of inner) pairs.set(x, y);
        for (const x of kidsOf(k)) open(x);
        return;
      }
      pending.push(k);
    };
    for (const k of kidsOf(c)) open(k);
    for (const [x, y] of pairs) walk(x, y);
  };
  for (const [r, p] of plan) walk(r, p);
  // Moved into another container: look anywhere in the copied piece (same classes needed).
  const scope = plan.flatMap(([, p]) => [p, ...p.querySelectorAll('*')]);
  for (const k of pending) {
    let best = null, bestScore = 2.5;
    for (const p of scope) { if (used.has(p) || !tagOk(k, p) || !shares(k, p)) continue; const sc = sim(k, p, 2); if (sc > bestScore) { best = p; bestScore = sc; } }
    if (best) { used.add(best); walk(k, best); } else setAside(k);
  }
  return true;
}

// A new design that was just built on the page (B3d): link it to what now
// renders at its spot, so from now on it's compared like a copy. The element
// is the one right after the spot's `after` neighbour (or before `before`).
// A page element from a ref ({ element, source, index }). After a push the
// lines move, so if the source no longer points at that element, it's found
// by what it is (tag and classes) in the same file.
export function findRef(r) {
  if (!r?.source) return null;
  const el = document.querySelectorAll(`[${ATTR}="${CSS.escape(r.source)}"]`)[r.index ?? 0];
  if (el && describe(el) === r.element) return el;
  const file = r.source.split(':')[0];
  const same = [...document.querySelectorAll(`[${ATTR}^="${CSS.escape(file)}:"]`)].filter((n) => describe(n) === r.element);
  return same[r.index ?? 0] ?? same[0] ?? null;
}

export function linkDesign(design, placement) {
  const find = findRef;
  const after = find(placement.after), before = find(placement.before);
  const tagged = (n) => { for (let x = n; x; x = x.firstElementChild) if (x.hasAttribute(ATTR)) return x; return null; };
  let el = after ? after.nextElementSibling : before ? before.previousElementSibling : null;
  if (el && before && el === before) el = null;
  el = el && tagged(el);
  if (!el) return false;
  // Claude may wrap it (in the page's layout container, say): the best match at the spot or inside it.
  const { sim } = matcher();
  let best = el, bestScore = -Infinity;
  for (const c of [el, ...el.querySelectorAll(`[${ATTR}]`)]) { const sc = sim(design, c, 2); if (sc > bestScore) { best = c; bestScore = sc; } }
  relinkCopy({ roots: [design] }, [[design, best]]);
  return design.hasAttribute(FROM);
}

// Re-link copies whose links broke (or all of them, after a Push). True when any changed.
export function relinkCanvas({ force = false } = {}) {
  let any = false;
  for (const u of copiesOnCanvas()) {
    if (!force && linksOk(u)) continue;
    if (u.top.dataset.emDesign) { // a built design: only at its own spot; if it's gone (Undo), a new design again
      let at = null;
      try { at = JSON.parse(u.top.dataset.emPlace || 'null'); } catch {}
      if (!(at && linkDesign(u.top, at))) unlinkDesign(u.top);
      any = true;
      continue;
    }
    any = relinkCopy(u) || any;
  }
  return any;
}

// Before linking a design, remember the links its pasted pieces had (to the
// real button…); unlinking puts exactly those back.
export function rememberLinks(design) {
  for (const x of [design, ...design.querySelectorAll(`[${FROM}]`)]) if (x.hasAttribute(FROM)) x.dataset.emFromPre = x.getAttribute(FROM);
}
export function unlinkDesign(design) {
  for (const x of [design, ...design.querySelectorAll('*')]) {
    x.removeAttribute(WAS);
    if (x.dataset.emFromPre) x.setAttribute(FROM, x.dataset.emFromPre);
    else x.removeAttribute(FROM);
  }
  delete design.dataset.emBuilt;
}

// Every copy on the canvas, compared. Two copies changing the same thing differently are flagged.
export function compareCanvas() {
  relinkCanvas();
  const units = copiesOnCanvas();
  const builtEls = new Set(units.filter((u) => u.top.dataset.emDesign).map((u) => originalOf(u.top)?.el).filter(Boolean));
  const results = units.map((u, i) => compareCopy(u, { id: i + 1, name: copyName(u.top), builtEls }));
  const seen = new Map();
  for (const r of results) {
    for (const c of r.changes) {
      if (!c.source || c.kind === 'insert' || c.kind === 'group') continue;
      const key = `${c.source}#${c.index}|${c.kind}|${c.property || ''}`;
      const val = JSON.stringify(c.to ?? c.constraints ?? c.parent ?? '');
      const other = seen.get(key);
      if (other && other.copy !== r.copy.id && other.val !== val) { c.conflict = other.name; other.change.conflict ||= r.copy.name; }
      else if (!other) seen.set(key, { copy: r.copy.id, name: r.copy.name, val, change: c });
    }
  }
  return results;
}
