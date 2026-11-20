// The right-hand column: a Selection card and the properties panel.
// Properties: Typography · Appearance (fill, opacity, roundness) · Stroke ·
// Effects (shadow) · Layout (size, gap, padding, margin).
//
// Every field reads the selected element's computed style and writes through
// `changes.set(...)`, which previews the edit as an inline style.

import {
  ATTR, box, colorFromText, describe, family, fmt, isNumber, num, parseColor, parseSrc, resolveColor, sameSource,
} from './util.js';
import { textNodeOf } from './changes.js';
import { ICON, KEY } from './icons.js';

const ROOT = (window.__EDIT_MODE__ && window.__EDIT_MODE__.root) || '';

const WEIGHTS = [
  ['100', 'Thin'], ['200', 'Extra Light'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'],
  ['600', 'Semi Bold'], ['700', 'Bold'], ['800', 'Extra Bold'], ['900', 'Black'],
];
const DEFAULT_FILL = '#FFFFFF';
const DEFAULT_SHADOW = '0px 4px 4px 0px rgba(0, 0, 0, 0.25)';
const SIDES = ['top', 'right', 'bottom', 'left'];

export { ICON };



const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

// Basic arithmetic for number fields (Figma lets you type 8*2 or 100/3).
// Only digits, + - * / and brackets get here; returns null if it doesn't parse.
function calc(expr) {
  const t = expr.replace(/\s+/g, '');
  let i = 0;
  const num = () => {
    if (t[i] === '(') { i++; const v = sum(); if (t[i++] !== ')') throw 0; return v; }
    if (t[i] === '-') { i++; return -num(); }
    const m = /^\d*\.?\d+/.exec(t.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    return +m[0];
  };
  const prod = () => { let v = num(); while (t[i] === '*' || t[i] === '/') v = t[i++] === '*' ? v * num() : v / num(); return v; };
  const sum = () => { let v = prod(); while (t[i] === '+' || t[i] === '-') v = t[i++] === '+' ? v + prod() : v - prod(); return v; };
  try { const v = sum(); return i === t.length && Number.isFinite(v) ? Math.round(v * 100) / 100 : null; } catch { return null; }
}

// width/height in px as the border box (what you see) → the CSS value to set.
export function cssSize(el, axis, px) {
  const cs = getComputedStyle(el);
  if (cs.boxSizing === 'content-box') {
    const [a, b] = axis === 'width' ? ['Left', 'Right'] : ['Top', 'Bottom'];
    px -= num(cs['padding' + a]) + num(cs['padding' + b]) + num(cs[`border${a}Width`]) + num(cs[`border${b}Width`]);
  }
  return `${Math.max(0, Math.round(px * 10) / 10)}px`;
}

// ---------- color + shadow helpers ----------
const alphaOf = (c) => parseColor(c)?.a ?? 1;
const isClear = (c) => alphaOf(c) === 0;
function withAlpha(color, a) {
  const c = parseColor(color) ?? parseColor(resolveColor(color)); // typed hex (#FF0000) too, not just rgb()
  if (!c) return color;
  if (a >= 1) return c.hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
}
function splitList(v) {
  if (!v || v === 'none') return [];
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function parseShadow(s) {
  if (!s) return null;
  const color = (s.match(/rgba?\([^)]*\)/) || ['rgba(0, 0, 0, 0.25)'])[0];
  const [x = 0, y = 0, blur = 0, spread = 0] = (s.replace(color, '').match(/-?[\d.]+px/g) || []).map(num);
  return { inset: /\binset\b/.test(s), color, x, y, blur, spread };
}
// background-image layers: gradients are editable, images can be hidden/removed.
function parseGradient(layer) {
  const m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(layer || '');
  if (!m) return null;
  const args = splitList(m[3]);
  const dir = args.length && !/^(rgba?\(|#|transparent)/.test(args[0]) ? args.shift() : null;
  const stops = args.map((a) => {
    const color = (a.match(/rgba?\([^)]*\)|transparent|#[0-9a-f]+/i) || [a])[0];
    return { color, pos: a.replace(color, '').trim() };
  });
  return { repeating: !!m[1], type: m[2], dir, stops };
}
const buildGradient = (g) =>
  `${g.repeating ? 'repeating-' : ''}${g.type}-gradient(${[g.dir, ...g.stops.map((s) => (s.pos ? `${s.color} ${s.pos}` : s.color))].filter(Boolean).join(', ')})`;
const MAX_STOPS = 4;

const buildShadow = (s) => `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;

function strokeOf(cs) {
  const sides = SIDES.filter((s) => cs.getPropertyValue(`border-${s}-style`) !== 'none' && num(cs.getPropertyValue(`border-${s}-width`)) > 0);
  if (sides.length) {
    const s = sides[0];
    return { pos: 'inside', sides, color: cs.getPropertyValue(`border-${s}-color`),
             width: num(cs.getPropertyValue(`border-${s}-width`)), style: cs.getPropertyValue(`border-${s}-style`) };
  }
  if (cs.outlineStyle !== 'none' && num(cs.outlineWidth) > 0) {
    return { pos: 'outside', sides: [], color: cs.outlineColor, width: num(cs.outlineWidth), style: cs.outlineStyle };
  }
  return null;
}

export function createPanel(ctx) {
  const { shadow, changes, state } = ctx;
  const sel = () => state.selected;
  const apply = (prop, value) => changes.set(sel(), state.scope, prop, value);

  // Several elements selected: every field reads all of them ("Mixed" when
  // they differ) and every edit runs once per element, with sel() pointing at
  // that element. So writers that build on the current value (a shadow's X,
  // a color's opacity) keep each element's other values.
  const MIXED = 'Mixed';
  const many = () => state.multi.length > 1;
  const picked = () => (many() ? state.multi.filter((x) => x.isConnected) : [sel()]);
  function withEl(el, fn, scope = many() ? 'one' : state.scope) {
    const prev = [state.selected, state.scope];
    state.selected = el;
    state.scope = scope;
    try { return fn(); } finally { [state.selected, state.scope] = prev; }
  }
  let busy = false; // inside a multi edit: refresh once at the end, not after every element
  function each(fn) {
    if (!many()) return fn();
    let ok;
    busy = true;
    try {
      for (const el of picked()) if (withEl(el, fn) === false) ok = false;
    } finally { busy = false; }
    return ok;
  }
  // The value `read` gives for every selected element, or MIXED.
  function common(read) {
    let first;
    for (const [i, el] of picked().entries()) {
      const v = String(withEl(el, () => read(el, getComputedStyle(el))));
      if (!i) first = v;
      else if (v !== first) return MIXED;
    }
    return first;
  }
  const act = (group, fn) => {
    const r = changes.batch(group, () => each(fn));
    ctx.onEdit();
    return r;
  };
  const fields = [];
  let fieldSeq = 0;

  // Remove something: undo it if it was added this session, otherwise override it.
  const clear = (props, stillThere, override) => {
    for (const p of props) if (changes.has(sel(), state.scope, p)) changes.revert(sel(), state.scope, p);
    if (stillThere(getComputedStyle(sel()))) override();
  };

  // Eye toggles: what was there before hiding, per element.
  const hiddenStore = new WeakMap();
  const stash = (el) => hiddenStore.get(el) || (hiddenStore.set(el, {}), hiddenStore.get(el));

  const column = h('div', 'side glassy');

  // ---------- Popover (lists, color palette) ----------
  const pop = h('div', 'pop glassy');
  pop.hidden = true;
  let popAnchor = null;

  function openPop(anchor, build) {
    if (!pop.hidden && popAnchor === anchor) return closePop();
    pop.replaceChildren();
    build(pop);
    pop.hidden = false;
    popAnchor = anchor;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const above = r.bottom + 4 + ph > innerHeight;
    pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    pop.style.top = (above ? Math.max(8, r.top - 4 - ph) : r.bottom + 4) + 'px';
    pop.style.transformOrigin = `${above ? 'bottom' : 'top'} right`; // grows out of its field
  }
  function closePop() {
    pop.hidden = true;
    popAnchor = null;
  }
  shadow.addEventListener('pointerdown', (e) => {
    if (pop.hidden) return;
    const path = e.composedPath();
    if (!path.includes(pop) && !path.includes(popAnchor)) closePop();
  });

  function listPop(anchor, items, current, onPick) {
    openPop(anchor, (box) => {
      if (!items.length) box.append(h('div', 'pop-empty', 'Nothing found on this page'));
      // An item can carry a reason it's unavailable: shown greyed out, with the reason under it.
      for (const [value, label, off] of items) {
        const b = h('button', 'pop-item' + (String(value) === String(current) ? ' on' : '') + (off ? ' off' : ''));
        b.textContent = label;
        if (off) {
          b.disabled = true;
          b.append(h('span', 'pop-why', off));
        } else b.addEventListener('click', () => { closePop(); onPick(String(value)); });
        box.append(b);
      }
    });
  }

  function colorPop(anchor, current, onPick) {
    const t = ctx.tokens();
    openPop(anchor, (box) => {
      const grid = (title, items) => {
        if (!items.length) return;
        box.append(h('div', 'pop-title', title));
        const g = h('div', 'sw-grid');
        for (const it of items) {
          const b = h('button', 'sw' + (it.rgb === current ? ' on' : ''));
          b.style.background = it.rgb;
          b.title = it.title;
          b.addEventListener('click', () => { closePop(); onPick(it.value); });
          g.append(b);
        }
        box.append(g);
      };
      grid('Variables', t.colorVars.map((v) => ({ rgb: v.rgb, value: v.value, title: `${v.name}  ${parseColor(v.rgb)?.hex ?? ''}` })));
      grid('On this page', t.colors.map((c) => ({ rgb: c, value: c, title: parseColor(c)?.hex ?? c })));

      const row = h('div', 'pop-row');
      const custom = h('label', 'btn', 'Custom…');
      const picker = h('input');
      picker.type = 'color';
      picker.className = 'native-color';
      const parsed = parseColor(current);
      if (parsed) picker.value = parsed.hex.toLowerCase();
      picker.addEventListener('input', () => onPick(picker.value, 'picker'));
      custom.append(picker);
      row.append(custom);
      if ('EyeDropper' in window) {
        const drop = h('button', 'btn icon-btn', ICON.drop);
        drop.title = 'Pick a color from the screen';
        drop.addEventListener('click', async () => {
          closePop();
          try {
            const { sRGBHex } = await new window.EyeDropper().open();
            onPick(sRGBHex);
          } catch {} // cancelled
        });
        row.append(drop);
      }
      box.append(row);
    });
  }

  // ---------- Field builders ----------
  const cap = (text) => h('div', 'cap', text);

  // Number-ish field: ↑/↓ nudge (Shift = 10), Enter commits, Esc reverts,
  // drag the caption or prefix icon to scrub.
  function numField(def) {
    const id = ++fieldSeq;
    const outer = h('div', 'f');
    const wrap = h('div', 'field num');
    let caption;
    if (def.cap) outer.append((caption = cap(def.cap)));
    let prefix;
    if (def.prefix) {
      prefix = h('span', def.prefix.startsWith('<') ? 'pre' : 'pre txt', def.prefix); // a letter (W, H, X…) needs less room than an icon
      prefix.title = def.title;
      wrap.append(prefix);
    }
    const input = h('input');
    input.spellcheck = false;
    input.setAttribute('aria-label', def.title);
    wrap.append(input);
    if (def.suffix) wrap.append(h('span', 'sfx', def.suffix));
    if (def.picks) {
      const pickBtn = h('button', 'pick', ICON.chevron);
      pickBtn.title = def.pickTitle || 'Values used on this page';
      pickBtn.addEventListener('click', () =>
        listPop(pickBtn, def.picks().map((v) => [v, v]), input.value, (v) => {
          input.value = v;
          commit(null);
          refreshField(true);
        }));
      wrap.append(pickBtn);
    }
    let modeTag;
    if (def.modes) {
      modeTag = h('span', 'mode-tag');
      const modeBtn = h('button', 'pick', ICON.chevron);
      modeBtn.title = `${def.title} sizing: fixed, hug or fill`;
      modeBtn.setAttribute('aria-label', `${def.title} sizing`);
      modeBtn.addEventListener('click', () => {
        const el = sel();
        listPop(modeBtn, def.modes.options(el), def.modes.read(el), (v) => {
          act(null, () => def.modes.write(v));
          refreshField(true);
        });
      });
      wrap.append(modeTag, modeBtn);
    }
    outer.append(wrap);

    const min = def.min ?? 0;
    const max = def.max ?? Infinity;
    const clamp = (v) => Math.min(max, Math.max(min, v));
    let focusGroup = null;
    const commit = (group, final = false) => {
      let text = input.value.trim().replace(/\s*%$/, def.suffix === '%' ? '' : '%');
      if (!text) return;
      if (/[-+*/()]/.test(text.slice(1)) && /^[\d.\s+\-*/()]+$/.test(text)) {
        if (!final) return; // math like 8*2 is worked out on Enter
        const v = calc(text);
        if (v == null) { wrap.classList.add('bad'); return; }
        input.value = text = fmt(v);
      }
      if (isNumber(text) && +text > max) input.value = text = fmt(max); // e.g. opacity stops at 100
      const ok = act(group, () => def.write(text));
      wrap.classList.toggle('bad', ok === false);
    };
    // Mixed values: shift each element's own value by the same amount (Figma).
    const shiftEach = (group, from, d) => act(group, () => {
      const v = from(sel());
      if (isNumber(v)) def.write(fmt(clamp(+v + d)));
    });
    const readOne = (el) => def.read(el, getComputedStyle(el));
    const nudge = (dir, big) => {
      const d = dir * (big ? 10 : def.step ?? 1);
      if (input.value.trim() === MIXED) return shiftEach(focusGroup, readOne, d);
      const n = isNumber(input.value.trim()) ? +input.value : num(input.value);
      input.value = fmt(clamp(n + d));
      commit(focusGroup);
    };

    let focusValue = '';
    input.addEventListener('focus', () => {
      focusValue = input.value.trim();
      focusGroup = `f${id}:${Date.now()}`;
      input.select();
    });
    input.addEventListener('input', () => commit(focusGroup));
    input.addEventListener('blur', () => {
      if (input.value.trim() && input.value.trim() !== focusValue) commit(focusGroup, true); // only if you changed it
      focusGroup = null;
      refreshField(true);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') { input.value = ''; refreshField(true); input.blur(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
      }
    });

    for (const handle of [caption, prefix].filter(Boolean)) {
      handle.classList.add('scrub');
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        const x0 = e.clientX;
        const start = num(input.value);
        const starts = input.value.trim() === MIXED ? new Map(picked().map((el) => [el, withEl(el, () => readOne(el))])) : null;
        const group = `f${id}:scrub:${Date.now()}`;
        const move = (ev) => {
          const d = Math.round((ev.clientX - x0) / 2) * (ev.shiftKey ? 10 : def.step ?? 1);
          if (starts) return shiftEach(group, (el) => starts.get(el), d);
          input.value = fmt(clamp(start + d));
          commit(group);
        };
        const up = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          refreshField(true);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
      });
    }

    if (def.hint) hintOn(outer, def.hint);

    function refreshField(force) {
      const el = sel();
      if (!el || (!force && shadow.activeElement === input)) return;
      input.value = common(def.read);
      // Refilled while focused (the selection changed): that's the page's value, not a change of yours, so blur mustn't commit it.
      if (shadow.activeElement === input) focusValue = input.value.trim();
      wrap.classList.remove('bad');
      if (modeTag) {
        const m = common((x) => def.modes.read(x));
        modeTag.textContent = { hug: 'Hug', fill: 'Fill' }[m] ?? '';
      }
    }
    fields.push(refreshField);
    return outer;
  }

  // Button that opens a dark list (font weight, stroke position, shadow type).
  function dropdown(def) {
    const outer = h('div', 'f');
    if (def.cap) outer.append(cap(def.cap));
    const btn = h('button', 'field dd');
    btn.setAttribute('aria-label', def.title);
    const label = h('span', 'dd-label');
    btn.append(label, h('span', 'chev', ICON.chevron));
    outer.append(btn);
    let current = '';
    btn.addEventListener('click', () => {
      const el = sel();
      listPop(btn, def.options(el, getComputedStyle(el)), current, (v) => act(null, () => def.write(v)));
    });
    fields.push(() => {
      const el = sel();
      if (!el) return;
      current = common(def.read);
      const opt = def.options(el, getComputedStyle(el)).find(([v]) => v === current);
      label.textContent = opt ? opt[1] : current;
    });
    return outer;
  }

  function segField(def) {
    const wrap = h('div', 'seg');
    const buttons = def.options.map(([value, icon, title]) => {
      const b = h('button', '', icon);
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', () => act(null, () => def.write(value)));
      wrap.append(b);
      return [value, b];
    });
    fields.push(() => {
      if (!sel()) return;
      const v = common(def.read);
      for (const [value, b] of buttons) b.classList.toggle('on', value === v);
    });
    return wrap;
  }

  // Swatch + hex + opacity, optionally followed by eye and × buttons.
  function colorRow(def) {
    const id = ++fieldSeq;
    const row = h('div', 'crow');
    const wrap = h('div', 'field color');
    const sw = h('button', 'swatch', '<i></i>');
    sw.title = 'Pick a color';
    const hex = h('input', 'hex');
    hex.spellcheck = false;
    hex.setAttribute('aria-label', def.title);
    const alpha = h('input', 'alpha');
    alpha.setAttribute('aria-label', def.title + ' opacity');
    wrap.append(sw, hex, h('span', 'divider'), alpha, h('span', 'sfx', '%'));
    row.append(wrap);

    let eye;
    if (def.eye) {
      eye = h('button', 'icon', ICON.eye);
      eye.addEventListener('click', () => { act(null, def.eye.toggle); });
      row.append(eye);
    }
    if (def.remove) {
      const x = h('button', 'icon', ICON.x);
      x.title = 'Remove';
      x.setAttribute('aria-label', 'Remove ' + def.title.toLowerCase());
      x.addEventListener('click', () => act(null, def.remove));
      row.append(x);
    }

    const current = () => def.read(sel(), getComputedStyle(sel()));
    // `value` can be a function: worked out per element (each keeps its own opacity or color).
    const write = (value, group) => act(group, () => def.write(typeof value === 'function' ? value() : value));
    let pickerGroup = 0;
    sw.addEventListener('click', () =>
      colorPop(sw, current(), (v, from) => write(v, from === 'picker' ? `c${id}:picker:${pickerGroup}` : null)));
    sw.addEventListener('pointerdown', () => pickerGroup++);

    hex.addEventListener('focus', () => hex.select());
    hex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') hex.blur();
      else if (e.key === 'Escape') { refreshRow(true); hex.blur(); }
    });
    hex.addEventListener('change', () => {
      const v = colorFromText(hex.value);
      wrap.classList.toggle('bad', !v);
      if (v) write(isClear(v) || alphaOf(v) < 1 ? v : () => withAlpha(v, alphaOf(current())));
    });

    let alphaGroup = null;
    alpha.addEventListener('focus', () => { alphaGroup = `c${id}:a:${Date.now()}`; alpha.select(); });
    alpha.addEventListener('blur', () => refreshRow(true));
    alpha.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') alpha.blur();
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        alpha.value = Math.min(100, Math.max(0, num(alpha.value) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)));
        alpha.dispatchEvent(new Event('input'));
      }
    });
    alpha.addEventListener('input', () => {
      if (!isNumber(alpha.value.trim())) return;
      if (+alpha.value > 100) alpha.value = '100';
      const a = Math.min(100, Math.max(0, +alpha.value)) / 100;
      write(() => withAlpha(current(), a), alphaGroup);
    });

    function refreshRow(force) {
      const el = sel();
      if (!el || !row.isConnected) return;
      const c = common(def.read);
      const mixed = c === MIXED;
      const p = parseColor(c);
      sw.firstChild.style.background = mixed ? '' : c;
      sw.classList.toggle('mixed', mixed);
      wrap.classList.toggle('mixed', mixed);
      if (force || shadow.activeElement !== hex) hex.value = mixed ? MIXED : p ? p.hex.slice(1) : c;
      if (force || shadow.activeElement !== alpha) {
        const a = common((x, cs) => Math.round(alphaOf(def.read(x, cs)) * 100));
        alpha.value = a === MIXED ? '' : a;
      }
      wrap.classList.remove('bad');
      if (eye) {
        const off = def.eye.hidden();
        eye.innerHTML = off ? ICON.eyeOff : ICON.eye;
        eye.title = off ? 'Show' : 'Hide';
        row.classList.toggle('off', off);
      }
    }
    fields.push(refreshRow);
    return row;
  }

  function hintOn(node, hint) {
    let inside = false;
    const sync = () => ctx.setHint(inside || node.contains(shadow.activeElement) ? hint : null);
    node.addEventListener('pointerenter', () => { inside = true; sync(); });
    node.addEventListener('pointerleave', () => { inside = false; sync(); });
    node.addEventListener('focusin', () => ctx.setHint(hint));
    node.addEventListener('focusout', () => setTimeout(sync));
  }

  // ---------- Writers ----------
  const pxWriter = (props, { min = 0 } = {}) => (text) => {
    const list = [].concat(props);
    let value;
    if (isNumber(text)) value = `${Math.max(min, +text)}px`;
    else if (CSS.supports(list[0], text)) value = text;
    else return false;
    for (const p of list) apply(p, value);
  };
  const pxRead = (prop) => (el, cs) => {
    const v = cs.getPropertyValue(prop);
    return v.endsWith('px') ? fmt(num(v)) : v;
  };
  const pairRead = (a, b) => (el, cs) => {
    const x = pxRead(a)(el, cs);
    const y = pxRead(b)(el, cs);
    return x === y ? x : 'Mixed';
  };

  // ---------- Sizing: fixed / hug / fill (Figma's resizing modes) ----------
  // How the parent lays this element out along `axis`.
  function flow(el, axis) {
    const p = el.parentElement;
    const pcs = p ? getComputedStyle(p) : null;
    const flex = !!pcs && /flex/.test(pcs.display);
    const row = flex && !pcs.flexDirection.startsWith('column');
    return { p, pcs, flex, main: flex && (axis === 'width') === row };
  }

  function sizeMode(el, axis) {
    const cs = getComputedStyle(el);
    const { p, pcs, flex, main } = flow(el, axis);
    if (main && num(cs.flexGrow) > 0) return 'fill';
    // A size set in this session says exactly what was chosen.
    const own = el.style.getPropertyValue(axis);
    if (/px$/.test(own)) return 'fixed';
    if (own === 'fit-content') return 'hug';
    if ((own === 'auto' || own === '100%') && (flex || axis === 'width')) return 'fill';
    const now = box(el)[axis];
    const hugs = () => Math.abs(probe(el, { [axis]: 'fit-content' }, () => box(el)[axis]) - now) < 0.5;
    if (!p || main) return hugs() ? 'hug' : 'fixed';
    // Fill = it follows its container. Grow the container for a moment and
    // see. (Comparing sizes alone misreads a container that is only as big as
    // this element, like a row of fixed-height buttons.) This comes before
    // Hug: wrapped text that spans its column measures the same either way,
    // and following the container is what it actually does. A capped frame
    // (max-width, like a centred page container) fills up to its cap, so its
    // own cap is lifted for the measurement too.
    const pb = box(p)[axis];
    const grow = { [axis]: `${pb + 40}px`, [`max-${axis}`]: 'none' }; // a capped container (max-width) still grows
    const follows = probe(el, { [`max-${axis}`]: 'none' }, () => probe(p, grow, () => box(el)[axis])) - now > 1;
    if (follows && (flex || axis === 'width' || /grid/.test(pcs.display))) {
      // Stretched inside a container that's only as big as its contents (a hugging
      // row of same-height links): the stretch changes nothing you can see, so it reads Hug.
      // (Measured at its unwrapped size: wrapping text makes "fit-content" match any width.)
      const parentHugs = flex && !main && Math.abs(probe(p, { [axis]: 'max-content' }, () => box(p)[axis]) - pb) < 0.5;
      return parentHugs && hugs() ? 'hug' : 'fill';
    }
    if (hugs()) return 'hug';
    // A grid item stretched to its cell (no size of its own) fills the cell.
    const self = axis === 'width' ? cs.justifySelf : cs.alignSelf;
    if (/grid/.test(pcs.display) && /^(normal|stretch|auto)$/.test(self) &&
        Math.abs(probe(el, { [axis]: 'auto' }, () => box(el)[axis]) - now) < 0.5) return 'fill';
    return 'fixed';
  }

  // Set `styles` on `el` for one measurement, then put its inline style back exactly.
  function probe(el, styles, measure) {
    const saved = Object.keys(styles).map((k) => [k, el.style.getPropertyValue(k), el.style.getPropertyPriority(k)]);
    for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v, 'important');
    const m = measure();
    for (const [k, v, prio] of saved) {
      if (v) el.style.setProperty(k, v, prio);
      else el.style.removeProperty(k);
    }
    if (el.getAttribute('style') === '') el.removeAttribute('style');
    return m;
  }

  // Hug needs something inside that takes up space (Figma only offers it then).
  // A frame whose contents are all pinned (absolute), or that's empty, would
  // shrink to nothing: CSS "fit the content" with no content in flow is 0.
  const hasFlowContent = (el) =>
    /^(IMG|SVG|VIDEO|CANVAS|INPUT|TEXTAREA|SELECT|IFRAME|PICTURE)$/i.test(el.tagName) ||
    [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()) ||
    [...el.children].some((k) => k.getClientRects().length && !/absolute|fixed/.test(getComputedStyle(k).position));

  function sizeOptions(el, axis) {
    const opts = [['fixed', `Fixed ${axis}`],
      ['hug', 'Hug contents', hasFlowContent(el) ? null : 'Nothing inside takes up space (it\'s empty, or what\'s inside is pinned), so it would shrink to 0']];
    if (axis === 'width' || flow(el, axis).flex) {
      // Placed by position (absolute/fixed): it isn't in the layout, so there's no container space to fill.
      const placed = /absolute|fixed/.test(getComputedStyle(el).position);
      opts.push(['fill', 'Fill container', placed ? 'Placed by position, outside the layout: there\'s no layout space to fill' : null]);
    }
    return opts;
  }

  // Leaving Fill: undo whatever made it fill (grow on the main axis, stretch across it).
  function stopGrowing(el, axis) {
    const { main, flex } = flow(el, axis);
    if (main && num(getComputedStyle(el).flexGrow) > 0) {
      apply('flex-grow', '0');
      apply('flex-basis', 'auto');
    }
    if (flex && !main && changes.has(el, state.scope, 'align-self')) changes.revert(el, state.scope, 'align-self');
  }

  function setSizing(axis, mode) {
    const el = sel();
    const cs = getComputedStyle(el);
    if (cs.display === 'inline') apply('display', 'inline-block'); // inline ignores width/height
    const { flex, main } = flow(el, axis);
    if (mode === 'fixed') {
      const px = box(el)[axis];
      stopGrowing(el, axis);
      apply(axis, cssSize(el, axis, px));
    } else if (mode === 'hug') {
      stopGrowing(el, axis);
      apply(axis, 'fit-content');
    } else if (main) {
      apply('flex-grow', '1');
      apply('flex-basis', '0px');
      apply(axis === 'width' ? 'min-width' : 'min-height', '0px');
      apply(axis, 'auto');
    } else if (flex) {
      apply('align-self', 'stretch');
      apply(axis, 'auto');
    } else {
      apply(axis, axis === 'width' && /^(block|flex|grid|table|list-item)$/.test(getComputedStyle(el).display) ? 'auto' : '100%');
    }
  }

  function setSize(axis, text) {
    const el = sel();
    if (getComputedStyle(el).display === 'inline') apply('display', 'inline-block'); // inline ignores width/height
    if (isNumber(String(text))) {
      stopGrowing(el, axis); // typing a number makes it Fixed
      apply(axis, cssSize(el, axis, +text));
    } else if (CSS.supports(axis, text)) apply(axis, text);
    else return false;
  }

  // ---------- Header: what's selected ----------
  const header = h('div', 'ph');
  const nameRow = h('div', 'ph-row');
  const nameEl = h('div', 'ph-name');
  const openBtn = h('a', 'icon', ICON.open);
  openBtn.title = 'Open in VS Code';
  openBtn.setAttribute('aria-label', 'Open in VS Code');
  const copyBtn = h('button', 'icon', ICON.copy);
  copyBtn.title = 'Copy path';
  copyBtn.setAttribute('aria-label', 'Copy path');
  nameRow.append(nameEl, openBtn, copyBtn);
  const metaEl = h('div', 'ph-meta');
  const scopeSeg = h('div', 'seg scope');
  const scopeOne = h('button', '', 'This one');
  const scopeAll = h('button', '', 'All like this');
  scopeOne.addEventListener('click', () => ctx.setScope('one'));
  scopeAll.addEventListener('click', () => ctx.setScope('all'));
  scopeSeg.append(scopeOne, scopeAll);
  header.append(nameRow, metaEl, scopeSeg);

  let srcText = '';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(srcText);
      copyBtn.innerHTML = ICON.check;
      setTimeout(() => (copyBtn.innerHTML = ICON.copy), 1200);
    } catch {}
  });

  // ---------- Sections ----------
  const section = (title, ...kids) => {
    const s = h('section');
    const head = h('div', 'sh');
    head.append(h('h4', '', title));
    const body = h('div', 'sb');
    body.append(...kids);
    s.append(head, body);
    s.head = head;
    s.body = body;
    return s;
  };
  const row = (cls, ...kids) => {
    const r = h('div', 'row ' + cls);
    r.append(...kids);
    return r;
  };
  const addButton = (label, onAdd) => {
    const b = h('button', 'icon add', ICON.plus);
    b.title = `Add ${label}`;
    b.setAttribute('aria-label', `Add ${label}`);
    b.addEventListener('click', () => act(null, onAdd));
    return b;
  };

  // Layout: size, gap, padding, margin
  // A "set each side / corner separately" toggle. It opens by itself when
  // the selected element's values differ, and stays as you leave it otherwise.
  function splitToggle(label, isMixed, onChange) {
    const btn = h('button', 'icon split', ICON.sides);
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', 'false');
    let open = false;
    let lastEl = null;
    const set = (v) => {
      open = v;
      btn.classList.toggle('on', open);
      btn.setAttribute('aria-pressed', String(open));
      onChange(open);
    };
    btn.addEventListener('click', () => set(!open));
    fields.push(() => {
      const el = sel();
      if (el && el !== lastEl) { lastEl = el; set(isMixed(el, getComputedStyle(el))); }
    });
    set(false);
    return btn;
  }

  const SIDE_ICON = { top: ICON.sideTop, right: ICON.sideRight, bottom: ICON.sideBottom, left: ICON.sideLeft };
  function spacing(kind, hint, min) {
    const wrap = h('div', 'spacing');
    const head = h('div', 'sub');
    const p = (s) => `${kind}-${s}`;
    const pair = row('two',
      numField({ prefix: ICON.padH, title: `${kind} left and right`, hint, min,
        read: pairRead(p('left'), p('right')), write: pxWriter([p('left'), p('right')], { min }) }),
      numField({ prefix: ICON.padV, title: `${kind} top and bottom`, hint, min,
        read: pairRead(p('top'), p('bottom')), write: pxWriter([p('top'), p('bottom')], { min }) }));
    const four = row('two', ...SIDES.map((s) =>
      numField({ prefix: SIDE_ICON[s], title: `${kind} ${s}`, hint, min, read: pxRead(p(s)), write: pxWriter(p(s), { min }) })));
    const toggle = splitToggle(`Set each ${kind} side separately`,
      (el, cs) => cs.getPropertyValue(p('left')) !== cs.getPropertyValue(p('right')) ||
                  cs.getPropertyValue(p('top')) !== cs.getPropertyValue(p('bottom')),
      (open) => { pair.hidden = open; four.hidden = !open; });
    head.append(h('span', 'cap', kind[0].toUpperCase() + kind.slice(1)), toggle);
    wrap.append(head, pair, four);
    return wrap;
  }


  const gapRow = row('two',
    numField({ prefix: ICON.gap, title: 'Gap between children', hint: 'gap',
      // Figma's auto spacing (children pushed to the ends, space shared between them):
      // pick "Auto" from the menu, or type "auto". No preset numbers (DESIGN.md).
      picks: () => ['Auto'], pickTitle: 'Auto spacing',
      read: (el, cs) => {
        if (/flex/.test(cs.display) && cs.justifyContent === 'space-between') return 'Auto';
        const v = cs.flexDirection.startsWith('column') ? cs.rowGap : cs.columnGap;
        return v === 'normal' ? '0' : fmt(num(v));
      },
      write: (t) => {
        const cs = getComputedStyle(sel());
        if (/^auto$/i.test(t)) {
          if (!/flex/.test(cs.display)) return false;
          return apply('justify-content', 'space-between');
        }
        if (cs.justifyContent === 'space-between') apply('justify-content', 'flex-start');
        return pxWriter('gap')(t);
      } }));
  // Auto layout (flexbox): direction, alignment on both axes, gap.
  const ALIGN = { 'flex-start': 'start', start: 'start', normal: 'start', center: 'center', 'flex-end': 'end', end: 'end',
                  'space-between': 'between', stretch: 'stretch' };
  const isCol = (cs) => cs.flexDirection.startsWith('column');
  const mainSeg = (col) => segField({
    // Space-between lives in the Gap field as "Auto" (Figma's auto spacing), so it isn't repeated here.
    options: ['Start', 'Center', 'End'].map((n) => [n.toLowerCase(), ICON[`main${n}${col ? 'Col' : 'Row'}`],
      `Align ${n.toLowerCase()} (main axis)`]),
    read: (el, cs) => ALIGN[cs.justifyContent] || 'start',
    write: (v) => apply('justify-content', { start: 'flex-start', center: 'center', end: 'flex-end' }[v]) });
  const crossSeg = (col) => segField({
    options: ['Start', 'Center', 'End', 'Stretch'].map((n) => [n.toLowerCase(), ICON[`cross${n}${col ? 'Col' : 'Row'}`],
      n === 'Stretch' ? 'Stretch' : `Align ${n.toLowerCase()} (cross axis)`]),
    read: (el, cs) => (cs.alignItems === 'normal' ? 'stretch' : ALIGN[cs.alignItems] || 'stretch'),
    write: (v) => apply('align-items', { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }[v]) });
  const dirSeg = segField({
    options: [['row', ICON.dirRow, 'Horizontal'], ['column', ICON.dirCol, 'Vertical']],
    read: (el, cs) => (isCol(cs) ? 'column' : 'row'),
    write: (v) => apply('flex-direction', v) });
  const segRowMain = mainSeg(false);
  const segColMain = mainSeg(true);
  const segRowCross = crossSeg(false);
  const segColCross = crossSeg(true);
  const autoBlock = h('div', 'auto');
  const autoHead = h('div', 'sub');
  const autoX = h('button', 'icon', ICON.x);
  autoX.title = 'Remove auto layout';
  autoX.setAttribute('aria-label', 'Remove auto layout');
  autoX.addEventListener('click', () => act(null, () =>
    clear(['display', 'flex-direction', 'justify-content', 'align-items', 'gap'], (cs) => /flex/.test(cs.display), () => apply('display', 'block'))));
  autoHead.append(h('span', 'cap', 'Auto layout'), autoX);
  autoBlock.append(autoHead, row('one', dirSeg), row('two', segRowMain, segColMain, segRowCross, segColCross));
  const autoAdd = h('button', 'icon add', ICON.autoLayout);
  autoAdd.title = 'Add auto layout (⇧A)';
  autoAdd.setAttribute('aria-label', 'Add auto layout');
  autoAdd.addEventListener('click', () => act(null, () => autoLayout(sel())));

  // Constrain proportions (Figma): a link in the Layout title row. With it on, setting W also sets H,
  // and the reverse; resize handles keep the ratio as if Shift were held.
  // Kept per element in state.ratio (overlay-only, not pushed).
  const ratioBtn = h('button', 'icon', ICON.ratioOff);
  ratioBtn.title = 'Constrain proportions';
  ratioBtn.addEventListener('click', () => {
    const el = sel();
    const b = box(el);
    if (state.ratio.has(el)) state.ratio.delete(el);
    else if (b.width && b.height) state.ratio.set(el, b.width / b.height);
    syncRatio();
  });
  const syncRatio = () => {
    ratioBtn.hidden = many(); // kept per element; for a multi-selection the handles follow the primary's
    const on = !many() && state.ratio.has(sel());
    ratioBtn.innerHTML = on ? ICON.ratioOn : ICON.ratioOff;
    ratioBtn.classList.toggle('on', on);
    ratioBtn.setAttribute('aria-pressed', String(on));
    sizeRow.classList.toggle('linked', on);
  };
  fields.push(syncRatio);
  const writeSize = (axis, t) => {
    const ok = setSize(axis, t);
    const ratio = state.ratio.get(sel());
    if (ok === false || !ratio || !isNumber(String(t))) return ok;
    const other = axis === 'width' ? 'height' : 'width';
    setSize(other, fmt(axis === 'width' ? +t / ratio : +t * ratio));
  };
  const sizeRow = row('two',
    ...['width', 'height'].map((axis) => numField({
      prefix: axis === 'width' ? 'W' : 'H', title: axis === 'width' ? 'Width' : 'Height',
      read: (el) => fmt(box(el)[axis]),
      write: (t) => writeSize(axis, t),
      modes: { options: (el) => sizeOptions(el, axis), read: (el) => sizeMode(el, axis), write: (m) => setSizing(axis, m) },
    })));

  // Plain-language notes for layout that doesn't map to Figma (ROADMAP › A3):
  // said once, at the top of Layout, instead of fields that quietly misread.
  const notes = h('div', 'notes');
  function layoutNotes(el) {
    const cs = getComputedStyle(el);
    const pcs = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const out = [];
    if (cs.position === 'sticky') out.push('Pinned: it sticks to the screen while you scroll past it (sticky).');
    else if (cs.position === 'fixed') out.push('Pinned to the screen: it stays put while the page scrolls (fixed).');
    else if (cs.position === 'absolute') out.push('Placed by position, outside the layout: it doesn\'t push its neighbours, and reordering it won\'t move it.');
    if (pcs && /grid/.test(pcs.display) && !/absolute|fixed/.test(cs.position)) out.push('In a grid: the grid\'s columns and rows decide where it sits and how much room it gets.');
    if (pcs && /flex/.test(pcs.display)) {
      const m = el.computedStyleMap();
      const sides = ['left', 'right', 'top', 'bottom'].filter((s) => String(m.get(`margin-${s}`)) === 'auto');
      if (sides.length) out.push(`Pushed by an automatic margin (${sides.join(', ')}): it takes all the free space on that side.`);
    }
    return out;
  }
  fields.push(() => {
    const el = sel();
    const list = el && picked().length === 1 ? layoutNotes(el) : [];
    notes.replaceChildren(...list.map((t) => { const n = h('div', 'note', ICON.info); n.append(h('span', null, t)); return n; }));
    notes.hidden = !list.length;
  });

  const layout = section('Layout',
    notes,
    autoBlock,
    sizeRow,
    gapRow,
    spacing('padding', 'padding', 0),
    spacing('margin', 'margin', -9999));

  layout.head.append(h('span', 'sh-acts')); // W/H keep their full width; the link lives in the title row
  layout.head.lastChild.append(ratioBtn, autoAdd);

  // Turn an element into a flex container that keeps its current look.
  function autoLayout(el, { wrapper = false } = {}) {
    if (wrapper) {
      // A new frame around elements (⇧A): like Figma, it hugs them, keeps the
      // visible spacing between them as its gap, and lines them up at the
      // start. Their margins move off the children (so spacing isn't counted
      // twice) and the frame takes over the outer ones, so nothing jumps.
      const kids = [...el.children].filter((k) => k.getClientRects().length);
      const rects = kids.map((k) => box(k));
      const row = rects.length > 1 && rects[1].left >= rects[0].right - 1;
      const gaps = rects.slice(1).map((r, i) => (row ? r.left - rects[i].right : r.top - rects[i].bottom)).filter((g) => g >= 0);
      const gap = gaps.length ? Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : 0;
      const m = (k, side) => num(getComputedStyle(k)['margin' + side]);
      const outerTop = row ? Math.max(0, ...kids.map((k) => m(k, 'Top'))) : m(kids[0], 'Top');
      const outerBottom = row ? Math.max(0, ...kids.map((k) => m(k, 'Bottom'))) : m(kids.at(-1), 'Bottom');
      for (const k of kids) {
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          if (m(k, side) !== 0) changes.set(k, 'one', `margin-${side.toLowerCase()}`, '0px');
        }
      }
      const prev = state.selected;
      state.selected = el;
      apply('display', 'flex');
      apply('flex-direction', row ? 'row' : 'column');
      apply('align-items', kids.length > 1 ? 'flex-start' : 'center');
      apply('gap', `${gap}px`);
      apply('width', 'fit-content');
      if (outerTop) apply('margin-top', `${outerTop}px`);
      if (outerBottom) apply('margin-bottom', `${outerBottom}px`);
      state.selected = prev;
      return;
    }
    const kids = [...el.children].filter((k) => k.getClientRects().length);
    const rects = kids.map((k) => box(k));
    const row = rects.length > 1 && rects[1].left >= rects[0].right - 1;
    const gaps = rects.slice(1).map((r, i) => (row ? r.left - rects[i].right : r.top - rects[i].bottom)).filter((g) => g >= 0);
    const gap = gaps.length ? Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : 0;
    const prev = state.selected;
    state.selected = el;
    apply('display', 'flex');
    apply('flex-direction', row ? 'row' : 'column');
    apply('gap', `${gap}px`);
    apply('align-items', row ? 'flex-start' : 'stretch');
    state.selected = prev;
  }

  // Corner radius: one value, or each corner.
  const CORNERS = [['top-left', ICON.cornerTL], ['top-right', ICON.cornerTR], ['bottom-right', ICON.cornerBR], ['bottom-left', ICON.cornerBL]];
  const cornerProp = (c) => `border-${c}-radius`;
  const radiusAll = numField({ prefix: ICON.radius, title: 'Corner radius', picks: () => ctx.tokens().radii,
    read: (el, cs) => {
      const v = CORNERS.map(([c]) => cs.getPropertyValue(cornerProp(c)));
      return v.every((x) => x === v[0]) ? fmt(num(v[0])) : 'Mixed';
    },
    write: pxWriter('border-radius') });
  const radiusFour = row('two', ...CORNERS.map(([c, ic]) =>
    numField({ prefix: ic, title: `${c.replace('-', ' ')} corner radius`, read: pxRead(cornerProp(c)), write: pxWriter(cornerProp(c)) })));
  const radiusCell = h('div', 'crow tight');
  radiusCell.append(radiusAll, splitToggle('Set each corner separately',
    (el, cs) => new Set(CORNERS.map(([c]) => cs.getPropertyValue(cornerProp(c)))).size > 1,
    (open) => { radiusFour.hidden = !open; }));

  // Appearance: opacity, roundness
  const appearance = section('Appearance',
    row('two',
      numField({ prefix: ICON.opacity, title: 'Opacity', suffix: '%', max: 100,
        read: (el, cs) => String(Math.round(num(cs.opacity) * 100)),
        write: (t) => {
          if (!isNumber(t)) return false;
          apply('opacity', String(Math.min(100, Math.max(0, +t)) / 100));
        } }),
      radiusCell),
    radiusFour);

  // Text
  const typography = section('Text',
    row('one',
      numField({ title: 'Font', picks: () => ctx.tokens().fonts,
        read: (el, cs) => cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        write: (t) => {
          const rest = getComputedStyle(sel()).fontFamily.split(',').slice(1).join(',').trim();
          const value = t.includes(',') ? t : `"${t.replace(/["']/g, '')}"${rest ? ', ' + rest : ''}`;
          if (!CSS.supports('font-family', value)) return false;
          apply('font-family', value);
        } })),
    row('two',
      dropdown({ title: 'Font weight',
        options: (el, cs) => (WEIGHTS.some(([w]) => w === cs.fontWeight) ? WEIGHTS : [...WEIGHTS, [cs.fontWeight, cs.fontWeight]]),
        read: (el, cs) => cs.fontWeight,
        write: (v) => apply('font-weight', v) }),
      numField({ title: 'Font size', picks: () => ctx.tokens().fontSizes, min: 1,
        read: pxRead('font-size'), write: pxWriter('font-size', { min: 1 }) })),
    row('two',
      numField({ prefix: ICON.lineHeight, title: 'Line height',
        read: (el, cs) => {
          // As the code writes it: a multiplier (1.35) stays a multiplier; getComputedStyle would give pixels.
          if (cs.lineHeight === 'normal') return 'Auto';
          const v = el.computedStyleMap?.().get('line-height');
          return v?.unit === 'number' ? String(Math.round(v.value * 100) / 100) : fmt(num(cs.lineHeight)); // 1.35, not 1.4
        },
        write: (t) => {
          if (/^auto$/i.test(t)) return apply('line-height', 'normal');
          if (isNumber(t)) return apply('line-height', +t <= 3 ? t : `${t}px`); // ≤3 reads as a multiplier
          if (!CSS.supports('line-height', t)) return false;
          apply('line-height', t);
        } }),
      numField({ prefix: ICON.letterSpacing, title: 'Letter spacing', min: -100, step: 0.1,
        read: (el, cs) => (cs.letterSpacing === 'normal' ? '0' : fmt(num(cs.letterSpacing))),
        write: pxWriter('letter-spacing', { min: -100 }) })),
    row('one',
      segField({
        options: [['left', ICON.left, 'Align left'], ['center', ICON.center, 'Align center'],
                  ['right', ICON.right, 'Align right'], ['justify', ICON.justify, 'Justify']],
        read: (el, cs) => ({ start: 'left', end: 'right', '-webkit-center': 'center' })[cs.textAlign] || cs.textAlign,
        write: (v) => apply('text-align', v) })),
    colorRow({ title: 'Text color', read: (el, cs) => cs.color, write: (v) => apply('color', v) }));

  // Fill
  const fillHidden = () => {
    const el = sel();
    const s = hiddenStore.get(el);
    if (s?.fill && isClear(getComputedStyle(el).backgroundColor)) return true;
    if (s) delete s.fill;
    return false;
  };
  const fillRow = colorRow({
    title: 'Fill',
    read: (el, cs) => (fillHidden() ? hiddenStore.get(el).fill : cs.backgroundColor),
    write: (v) => { if (fillHidden()) delete stash(sel()).fill; apply('background-color', v); },
    eye: {
      hidden: fillHidden,
      toggle: () => {
        const el = sel();
        if (fillHidden()) {
          const v = stash(el).fill;
          delete stash(el).fill;
          apply('background-color', v);
        } else {
          stash(el).fill = getComputedStyle(el).backgroundColor;
          apply('background-color', 'transparent');
        }
      },
    },
    remove: () => {
      delete stash(sel()).fill;
      clear(['background-color'], (cs) => !isClear(cs.backgroundColor), () => apply('background-color', 'transparent'));
    },
  });
  // Gradient / image layer (first background-image layer).
  const layers = () => splitList(gradHidden() ? hiddenStore.get(sel()).grad : getComputedStyle(sel()).backgroundImage);
  const gradHidden = () => {
    const el = sel();
    const s = hiddenStore.get(el);
    if (s?.grad && getComputedStyle(el).backgroundImage === 'none') return true;
    if (s) delete s.grad;
    return false;
  };
  const gradient = () => parseGradient(layers()[0]);
  function gradSet(patch) {
    if (gradHidden()) { apply('background-image', stash(sel()).grad); delete stash(sel()).grad; }
    const list = layers();
    const g = parseGradient(list[0]);
    if (!g) return;
    list[0] = buildGradient(patch(g));
    apply('background-image', list.join(', '));
  }
  const gradKind = h('div', 'field kind');
  const gradEye = h('button', 'icon', ICON.eye);
  gradEye.addEventListener('click', () => act(null, () => {
    if (gradHidden()) { apply('background-image', stash(sel()).grad); delete stash(sel()).grad; }
    else { stash(sel()).grad = getComputedStyle(sel()).backgroundImage; apply('background-image', 'none'); }
  }));
  const gradX = h('button', 'icon', ICON.x);
  gradX.title = 'Remove';
  gradX.setAttribute('aria-label', 'Remove gradient or image');
  gradX.addEventListener('click', () => act(null, () => {
    delete stash(sel()).grad;
    clear(['background-image', 'background'], (cs) => cs.backgroundImage !== 'none', () => apply('background-image', 'none'));
  }));
  const angleField = numField({ prefix: ICON.angle, title: 'Gradient angle', min: -360, suffix: '°',
    read: () => {
      const d = gradient()?.dir;
      if (!d) return '180';
      const deg = /^(-?[\d.]+)deg$/.exec(d);
      return deg ? fmt(+deg[1]) : d;
    },
    write: (t) => (isNumber(t) ? gradSet((g) => ({ ...g, dir: `${+t}deg` })) : false) });
  const gradHead = h('div', 'crow');
  gradHead.append(gradKind, angleField, gradEye, gradX);
  const stopRows = Array.from({ length: MAX_STOPS }, (_, i) => colorRow({
    title: `Gradient stop ${i + 1}`,
    read: () => gradient()?.stops[i]?.color ?? 'transparent',
    write: (v) => gradSet((g) => {
      const stops = g.stops.slice();
      stops[i] = { ...stops[i], color: v };
      return { ...g, stops };
    }),
  }));
  const gradBlock = h('div', 'grad');
  gradBlock.append(gradHead, ...stopRows);
  fields.push(() => {
    const el = sel();
    if (!el) return;
    const list = layers();
    const g = parseGradient(list[0]);
    const off = gradHidden();
    // Several selected: only when they share the same layers (stops are edited by position).
    gradBlock.hidden = !list.length || (many() && common((x, cs) => cs.backgroundImage) === MIXED);
    gradKind.textContent = g ? `${g.type[0].toUpperCase()}${g.type.slice(1)}` : /^url\(/.test(list[0] || '') ? 'Image' : 'Pattern';
    angleField.hidden = g?.type !== 'linear' || (g.dir && !/deg$/.test(g.dir));
    stopRows.forEach((r, i) => (r.hidden = !g || i >= g.stops.length));
    gradEye.innerHTML = off ? ICON.eyeOff : ICON.eye;
    gradBlock.classList.toggle('off', off);
  });

  const fill = section('Fill', gradBlock, fillRow);
  const fillAdd = addButton('fill', () => apply('background-color', DEFAULT_FILL));
  fill.head.append(fillAdd);

  // Stroke: "Inside" = border, "Outside" = outline.
  const strokeHidden = () => {
    const el = sel();
    const s = hiddenStore.get(el);
    if (s?.stroke && !strokeOf(getComputedStyle(el))) return true;
    if (s) delete s.stroke;
    return false;
  };
  const stroke = () => (strokeHidden() ? hiddenStore.get(sel()).stroke : strokeOf(getComputedStyle(sel())));
  function strokeSet(part, value, info = stroke()) {
    if (!info) return;
    if (info.pos === 'outside') apply(`outline-${part}`, value);
    else if (info.sides.length === 4) apply(`border-${part}`, value);
    else for (const s of info.sides) apply(`border-${s}-${part}`, value);
  }
  const BORDER_PROPS = ['border-style', 'border-width', 'border-color',
    ...SIDES.flatMap((s) => [`border-${s}-style`, `border-${s}-width`, `border-${s}-color`])];
  const OUTLINE_PROPS = ['outline-style', 'outline-width', 'outline-color', 'outline-offset'];
  function clearStroke(info) {
    clear(info.pos === 'outside' ? OUTLINE_PROPS : BORDER_PROPS,
      (cs) => strokeOf(cs)?.pos === info.pos,
      () => strokeSet('style', 'none', info));
  }
  function strokeShow() {
    const info = stash(sel()).stroke;
    delete stash(sel()).stroke;
    strokeSet('style', info.style, info);
  }
  // Stroke sides (Figma): All, one side, or Custom (a weight per side; 0 = none).
  // Inside strokes only: an outside stroke is an outline, which has no sides.
  const sideOn = (cs, s) => cs.getPropertyValue(`border-${s}-style`) !== 'none' && num(cs.getPropertyValue(`border-${s}-width`)) > 0;
  function setSide(s, px, info) {
    if (px > 0) {
      apply(`border-${s}-style`, info.style);
      apply(`border-${s}-width`, `${px}px`);
      apply(`border-${s}-color`, info.color);
    } else apply(`border-${s}-style`, 'none');
  }
  function sidesMode(el, cs) {
    const on = SIDES.filter((s) => sideOn(cs, s));
    const widths = new Set(on.map((s) => cs.getPropertyValue(`border-${s}-width`)));
    if (on.length === 4 && widths.size === 1) return 'all';
    return on.length === 1 ? on[0] : 'custom';
  }
  let customFor = null; // the element whose Custom fields were opened from the menu (they stay open)
  const sidesBtn = h('button', 'icon', ICON.sides);
  sidesBtn.title = 'Stroke sides';
  sidesBtn.setAttribute('aria-label', 'Stroke sides');
  sidesBtn.addEventListener('click', () => {
    const current = common(sidesMode);
    listPop(sidesBtn, [['all', 'All'], ['top', 'Top'], ['right', 'Right'], ['bottom', 'Bottom'], ['left', 'Left'], ['custom', 'Custom']], current, (v) => {
      if (v === 'custom') { customFor = sel(); return refresh(true); }
      customFor = null;
      act(null, () => {
        if (strokeHidden()) strokeShow();
        const info = stroke();
        if (!info || info.pos !== 'inside') return;
        for (const s of SIDES) setSide(s, v === 'all' || v === s ? info.width : 0, info);
      });
    });
  });
  const strokeWeight = numField({ prefix: ICON.weight, title: 'Stroke weight',
    read: () => fmt(stroke()?.width ?? 0),
    write: (t) => {
      if (!isNumber(t)) return false;
      if (strokeHidden()) strokeShow();
      strokeSet('width', `${Math.max(0, +t)}px`);
    } });
  const strokeWeightCell = h('div', 'crow tight');
  strokeWeightCell.append(strokeWeight, sidesBtn);
  const strokeFour = row('two', ...SIDES.map((s) => numField({ prefix: SIDE_ICON[s], title: `Stroke ${s}`,
    read: (el, cs) => (sideOn(cs, s) ? fmt(num(cs.getPropertyValue(`border-${s}-width`))) : '0'),
    write: (t) => {
      if (!isNumber(t)) return false;
      if (strokeHidden()) strokeShow();
      const info = stroke();
      if (!info || info.pos !== 'inside') return false;
      setSide(s, Math.max(0, +t), info);
    } })));
  fields.push(() => {
    if (!sel()) return;
    const info = stroke();
    const inside = info?.pos === 'inside';
    const mode = inside ? common(sidesMode) : 'all';
    sidesBtn.hidden = !inside;
    sidesBtn.classList.toggle('on', mode !== 'all');
    strokeFour.hidden = !inside || (mode !== 'custom' && customFor !== sel());
    strokeWeight.hidden = !strokeFour.hidden; // Custom: the four fields replace the single weight
  });

  const strokeSec = section('Stroke',
    colorRow({
      title: 'Stroke',
      read: () => stroke()?.color ?? 'transparent',
      write: (v) => { if (strokeHidden()) strokeShow(); strokeSet('color', v); },
      eye: {
        hidden: strokeHidden,
        toggle: () => {
          if (strokeHidden()) return strokeShow();
          const info = stroke();
          stash(sel()).stroke = info;
          strokeSet('style', 'none', info);
        },
      },
      remove: () => {
        if (strokeHidden()) strokeShow();
        delete stash(sel()).stroke;
        const info = stroke();
        if (info) clearStroke(info);
      },
    }),
    row('two',
      dropdown({ title: 'Stroke position',
        options: () => [['inside', 'Inside'], ['outside', 'Outside']],
        read: () => stroke()?.pos ?? 'inside',
        write: (v) => {
          if (strokeHidden()) strokeShow();
          const info = stroke();
          if (!info || info.pos === v) return;
          clearStroke(info);
          if (v === 'outside') {
            apply('outline-style', info.style);
            apply('outline-width', `${info.width}px`);
            apply('outline-color', info.color);
            apply('outline-offset', '0px');
          } else {
            apply('border-style', info.style);
            apply('border-width', `${info.width}px`);
            apply('border-color', info.color);
          }
        } }),
      strokeWeightCell),
    strokeFour);
  const strokeAdd = addButton('stroke', () => {
    apply('border-style', 'solid');
    apply('border-width', '1px');
    apply('border-color', '#000000');
  });
  strokeSec.head.append(strokeAdd);

  // Effects: first box-shadow, Figma-style.
  const shadowHidden = () => {
    const el = sel();
    const s = hiddenStore.get(el);
    if (s?.shadow && getComputedStyle(el).boxShadow === 'none') return true;
    if (s) delete s.shadow;
    return false;
  };
  const shadowList = () => splitList(shadowHidden() ? hiddenStore.get(sel()).shadow : getComputedStyle(sel()).boxShadow);
  const shadowFirst = () => parseShadow(shadowList()[0]);
  function shadowSet(patch) {
    if (shadowHidden()) {
      const v = stash(sel()).shadow;
      delete stash(sel()).shadow;
      apply('box-shadow', v);
    }
    const list = shadowList();
    if (!list.length) return;
    list[0] = buildShadow({ ...parseShadow(list[0]), ...patch });
    apply('box-shadow', list.join(', '));
  }
  const shadowNum = (prefix, key, min, title) =>
    numField({ prefix, title, min,
      read: () => fmt(shadowFirst()?.[key] ?? 0),
      write: (t) => (isNumber(t) ? shadowSet({ [key]: Math.max(min, +t) }) : false) });
  const shadowEye = h('button', 'icon', ICON.eye);
  shadowEye.addEventListener('click', () => act(null, () => {
    if (shadowHidden()) {
      const v = stash(sel()).shadow;
      delete stash(sel()).shadow;
      apply('box-shadow', v);
    } else {
      stash(sel()).shadow = getComputedStyle(sel()).boxShadow;
      apply('box-shadow', 'none');
    }
  }));
  const shadowX = h('button', 'icon', ICON.x);
  shadowX.title = 'Remove';
  shadowX.setAttribute('aria-label', 'Remove shadow');
  shadowX.addEventListener('click', () => act(null, () => {
    delete stash(sel()).shadow;
    clear(['box-shadow'], (cs) => cs.boxShadow !== 'none', () => apply('box-shadow', 'none'));
  }));
  const shadowTypeRow = h('div', 'crow');
  shadowTypeRow.append(
    dropdown({ title: 'Shadow type',
      options: () => [['drop', 'Drop shadow'], ['inner', 'Inner shadow']],
      read: () => (shadowFirst()?.inset ? 'inner' : 'drop'),
      write: (v) => shadowSet({ inset: v === 'inner' }) }),
    shadowEye, shadowX);
  const effects = section('Effects',
    shadowTypeRow,
    colorRow({ title: 'Shadow color', read: () => shadowFirst()?.color ?? 'rgba(0, 0, 0, 0.25)', write: (v) => shadowSet({ color: v }) }),
    row('four',
      shadowNum('X', 'x', -999, 'Shadow X offset'), shadowNum('Y', 'y', -999, 'Shadow Y offset'),
      shadowNum('B', 'blur', 0, 'Shadow blur'), shadowNum('S', 'spread', -999, 'Shadow spread')));
  const shadowAdd = addButton('shadow', () => apply('box-shadow', DEFAULT_SHADOW));
  effects.head.append(shadowAdd);
  fields.push(() => {
    if (!sel()) return;
    const off = shadowHidden();
    shadowEye.innerHTML = off ? ICON.eyeOff : ICON.eye;
    shadowEye.title = off ? 'Show' : 'Hide';
    effects.body.classList.toggle('off', off);
  });

  const footer = h('div', 'foot');
  footer.innerHTML = `<span><kbd>esc</kbd> parent</span><span><kbd>${KEY.enter}</kbd> child</span>`;

  // Several selected: structure actions, above the shared properties.
  const multi = h('section', 'multi');
  const multiBtn = (iconName, text, keys, fn) => {
    const b = h('button', 'mbtn', `${ICON[iconName]}<span>${text}</span><kbd>${keys}</kbd>`);
    b.addEventListener('click', fn);
    return b;
  };
  multi.append(
    multiBtn('group', 'Group', `${KEY.command}G`, () => ctx.groupSelection()),
    multiBtn('autoLayout', 'Auto layout', `${KEY.shift}A`, () => ctx.autoLayoutSelection()),
    multiBtn('trash', 'Delete', KEY.backspace, () => ctx.deleteSelection()));

  const body = h('div', 'pb');
  body.append(multi, layout, appearance, typography, fill, strokeSec, effects);
  column.append(header, body, footer);
  column.hidden = true;

  // ---------- Public ----------
  function show(el) {
    closePop();
    multi.hidden = !many();
    if (many() && el) {
      column.hidden = false;
      nameEl.textContent = `${state.multi.length} selected`;
      nameEl.title = nameEl.textContent;
      const parents = new Set(state.multi.map((x) => x.parentElement));
      metaEl.textContent = parents.size === 1 ? `in ${describe(state.multi[0].parentElement)}` : `in ${parents.size} containers`;
      metaEl.title = '';
      openBtn.hidden = copyBtn.hidden = scopeSeg.hidden = true;
      refresh(true);
      return;
    }
    column.hidden = !el; // appears instantly: it shows on almost every selection
    if (!el) return;

    const own = el.getAttribute(ATTR);
    const tagged = own ? el : el.parentElement?.closest(`[${ATTR}]`);
    const src = tagged && parseSrc(tagged.getAttribute(ATTR));
    const instances = own ? sameSource(el) : [el]; // code instances (for "2 of 3")
    const fam = family(el); // what "All like this" covers, copies included

    const newRoot = el.closest('[data-em-new]');
    const isNew = newRoot ? newRoot.dataset.emNew : null;
    nameEl.textContent = !isNew ? describe(el) : newRoot === el ? `new ${el.tagName.toLowerCase()} #${isNew}` : `${describe(el)} in new #${isNew}`;
    nameEl.title = nameEl.textContent;
    metaEl.textContent = isNew ? 'added · not in code yet' : src
      ? `${src.file.split('/').pop()}:${src.line}` + (own ? '' : ' (parent)') +
        (instances.length > 1 ? `  ·  ${instances.indexOf(el) + 1} of ${instances.length}` : '')
      : 'no source';
    metaEl.title = src ? `${src.file}:${src.line}:${src.col}` : 'Not rendered from a JSX file in this project';

    openBtn.hidden = copyBtn.hidden = !src || !!isNew;
    if (src) {
      srcText = `${src.file}:${src.line}:${src.col}`;
      openBtn.href = `vscode://file/${ROOT}/${srcText}`;
    }

    scopeSeg.hidden = fam.length < 2;
    scopeAll.textContent = `All like this · ${fam.length}`;
    scopeOne.classList.toggle('on', state.scope === 'one');
    scopeAll.classList.toggle('on', state.scope === 'all');

    refresh(true);
  }

  // Which sections/rows apply right now. Several selected: Text, Gap and Auto
  // layout need every element to have them; Fill, Stroke and Effects show
  // when any of them has one (an edit then reaches the ones that have it).
  function arrange(el) {
    const cs = getComputedStyle(el);
    const els = picked();
    const all = (f) => els.every((x) => withEl(x, () => f(x, getComputedStyle(x))));
    const any = (f) => els.some((x) => withEl(x, () => f(x, getComputedStyle(x))));
    typography.hidden = !all((x) => /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName) || textNodeOf(x) ||
      [...x.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()));
    gapRow.hidden = !all((x, s) => /flex|grid/.test(s.display));
    const flex = all((x, s) => /flex/.test(s.display));
    autoBlock.hidden = !flex;
    autoAdd.hidden = many() || flex || !el.children.length || /grid/.test(cs.display); // several: the ⇧A button above
    const col = isCol(cs);
    segRowMain.hidden = segRowCross.hidden = col;
    segColMain.hidden = segColCross.hidden = !col;

    const empty = (sec, add, isEmpty) => {
      sec.body.hidden = isEmpty;
      add.hidden = !isEmpty;
      sec.classList.toggle('empty', isEmpty);
    };
    const solid = any((x, s) => !isClear(s.backgroundColor) || fillHidden());
    fillRow.hidden = !solid;
    empty(fill, fillAdd, !solid && !any((x, s) => s.backgroundImage !== 'none' || gradHidden()));
    fillAdd.hidden = solid;
    empty(strokeSec, strokeAdd, !any((x, s) => strokeOf(s) || strokeHidden()));
    empty(effects, shadowAdd, !any((x, s) => s.boxShadow !== 'none' || shadowHidden()));
  }

  function refresh(force) {
    const el = sel();
    if (!el || busy) return;
    arrange(el);
    for (const f of fields) f(force);
  }

  return {
    el: column,
    pop,
    show,
    refresh,
    sizeModeOf: (el, axis) => sizeMode(el, axis), // for tests
    // Resize handles: set one element's size (CSS px), whatever is selected.
    sizeOf: (el, scope, axis, px) => withEl(el, () => setSize(axis, String(px)), scope),
    autoLayout: (el, group, opts) => {
      const r = changes.batch(group ?? null, () => autoLayout(el, opts)); // once, not once per selected element
      ctx.onEdit();
      return r;
    },
    // Clicking a gap on the canvas: type a new gap.
    focusGap: () => {
      const input = gapRow.querySelector('input');
      if (gapRow.hidden || !input) return;
      input.focus();
      input.select();
    },
    menuOpen: () => !pop.hidden,
    closeMenu: closePop,
  };
}
