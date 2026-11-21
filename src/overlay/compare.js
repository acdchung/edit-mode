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
import { textNodeOf } from './changes.js';
import { constraintOf, frameBox } from './constraints.js';

const FROM = 'data-em-from';
// The copy's root: how it sits on the canvas, not part of the design.
const ROOT_SLOT = /^(position|top|right|bottom|left|inset|margin|grid|align-self|justify-self|place-self|flex|order|z-index|width|height|min-|max-|inline-size|block-size|translate)/;
// Folded into a `place` entry.
const PLACE = /^(position|top|right|bottom|left|inset|translate)/;
const KIND_NAME = { frame: 'frame', rectangle: 'rectangle', ellipse: 'ellipse', text: 'text', image: 'image', group: 'group' };

// The original on the page for a copied node: { el, source, index, count }.
export function originalOf(n) {
  const m = /^(.*)#(\d+)$/.exec(n.getAttribute(FROM) || '');
  if (!m) return null;
  const els = document.querySelectorAll(`[${ATTR}="${CSS.escape(m[1])}"]`);
  return { el: els[+m[2]] || null, source: m[1], index: +m[2], count: els.length };
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
      if (to === from) continue;
      // A frame made `relative` only so things can be placed freely in it: part of placing them.
      if (p === 'position' && to === 'relative' && from === 'static' && [...c.children].some((k) => placed.has(k))) continue;
      out.push({ kind: 'style', ...ref(o), property: p, from, to, value: c.style.getPropertyValue(p) });
    }
    // A fill is several background properties (image, color, size…): one entry, the rest in `also`.
    const bg = out.filter((e) => e.kind === 'style' && e.fromCanvas === copy.id && e.source === o.source && e.index === o.index && e.element === ref(o).element && /^background-/.test(e.property));
    if (bg.length > 1) {
      const main = bg.find((e) => e.property === 'background-image') || bg[0];
      main.also = Object.fromEntries(bg.filter((e) => e !== main).map((e) => [e.property, e.value]));
      for (const e of bg) if (e !== main) out.splice(out.indexOf(e), 1);
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
    const ct = textNodeOf(c), ot = textNodeOf(o.el);
    if (ct && ot && ct.nodeValue !== ot.nodeValue) out.push({ kind: 'text', ...ref(o), from: ot.nodeValue, to: ct.nodeValue });
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
      if (NOT_LAYER.test(k.tagName) || copyOf.has(k)) continue;
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
      styles: inlineStyles(n), text: n.children.length ? null : n.textContent, html: cleanHtml(n), parent, ...neighbours(n),
      insideNew: linked.has(pe) ? undefined : idOf(pe), fromCanvas: copy.id, copyName: copy.name });
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
const shares = (a, b) => [...a.classList].filter((c) => b.classList.contains(c)).length;
const compatible = (c, o) => !!o && c.tagName === o.tagName && (!c.classList.length || !o.classList.length || shares(c, o) > 0);
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
    if (c.tagName !== p.tagName) return -Infinity;
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
export function relinkCopy({ roots }) {
  const { sim } = matcher();
  const pageEls = [...document.querySelectorAll(`[${ATTR}]`)];
  const used = new Set();
  const plan = [];
  for (const r of roots) {
    const file = (r.getAttribute(FROM) || r.getAttribute(WAS) || '').split(':')[0];
    let cands = pageEls.filter((p) => p.tagName === r.tagName && (!r.classList.length || shares(r, p) > 0));
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
    for (const p of scope) { if (used.has(p) || p.tagName !== k.tagName || !shares(k, p)) continue; const sc = sim(k, p, 2); if (sc > bestScore) { best = p; bestScore = sc; } }
    if (best) { used.add(best); walk(k, best); } else setAside(k);
  }
  return true;
}

// Re-link copies whose links broke (or all of them, after a Push). True when any changed.
export function relinkCanvas({ force = false } = {}) {
  let any = false;
  for (const u of copiesOnCanvas()) if (force || !linksOk(u)) any = relinkCopy(u) || any;
  return any;
}

// Every copy on the canvas, compared. Two copies changing the same thing differently are flagged.
export function compareCanvas() {
  relinkCanvas();
  const results = copiesOnCanvas().map((u, i) => compareCopy(u, { id: i + 1, name: copyName(u.top) }));
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
