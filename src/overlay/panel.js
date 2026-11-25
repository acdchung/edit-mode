// The right-hand column: a Selection card and the properties panel.
// Properties: Typography · Appearance (fill, opacity, roundness) · Stroke ·
// Effects (shadow) · Layout (size, gap, padding, margin).
//
// Every field reads the selected element's computed style and writes through
// `changes.set(...)`, which previews the edit as an inline style.

import {
  ATTR, NOT_LAYER, box, colorFromText, describe, family, fmt, isNumber, num, onCanvas, parseColor, parseSrc, placedOf, resolveColor, sameSource,
} from './util.js';
import { isText } from './changes.js';
import { firstFamily, googleFamilies, googleReady, googleStyles, loadGoogle, loadLocal, localFamilies, localStatus, localStyles, useFont } from './fonts.js';
import { ICON, KEY } from './icons.js';
import { IMAGE_FIT, fitOf, pickImage, uploadImage } from './assets.js';
import { CONSTRAINT_OPTIONS, constraintOf, frameBox, isPlaced, placeBox } from './constraints.js';

const ROOT = (window.__EDIT_MODE__ && window.__EDIT_MODE__.root) || '';

const WEIGHTS = [
  ['100', 'Thin'], ['200', 'Extra Light'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'],
  ['600', 'Semi Bold'], ['700', 'Bold'], ['800', 'Extra Bold'], ['900', 'Black'],
];
// Copy / paste style (⌥⌘C / ⌥⌘V): fill, stroke, effects, corner radius, opacity,
// and the text style for text. Order matters: a border's style before its width.
const SIDE_PROPS = ['top', 'right', 'bottom', 'left'].flatMap((s) => [`border-${s}-style`, `border-${s}-width`, `border-${s}-color`]);
const STYLE_PROPS = ['background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
  ...SIDE_PROPS, 'outline-style', 'outline-width', 'outline-color', 'outline-offset',
  'box-shadow', 'filter', 'backdrop-filter',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius', 'opacity'];
const TEXT_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align',
  'text-decoration-line', 'text-transform', 'color'];
const hasText = (el) => isText(el) || [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
// Any CSS colour → hue (0–360), saturation, value (0–1) and alpha (the colour picker's model).
const colorCtx = document.createElement('canvas').getContext('2d');
function toHsva(c) {
  colorCtx.fillStyle = '#000';
  colorCtx.fillStyle = c || '#000';
  const v = colorCtx.fillStyle; // "#rrggbb" or "rgba(r, g, b, a)"
  const m = /^#(..)(..)(..)$/.exec(v);
  const [r, g, b, a = 1] = m ? [...m.slice(1).map((x) => parseInt(x, 16)), 1] : v.match(/[\d.]+/g).map(Number);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max / 255, a };
}
function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); };
  return [f(5), f(3), f(1)];
}
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
const MAX_STOPS = 10;
const FILL_TYPES = [['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Angular'], ['image', 'Image']];
const GRAD_DIR = { linear: '180deg', radial: null, conic: null }; // CSS defaults: top to bottom; from the center

// Each stop's position in %, filling in the ones CSS leaves implicit (first
// 0%, last 100%, the rest evenly between). null when a stop is placed in px
// or has two positions: those gradients keep their stops as written.
function stopPositions(stops) {
  const out = stops.map((st) => {
    if (!st.pos) return null;
    const m = /^(-?[\d.]+)%$/.exec(st.pos);
    return m ? +m[1] : NaN;
  });
  if (!out.length || out.some(Number.isNaN)) return null;
  out[0] ??= 0;
  if (out.length > 1) out[out.length - 1] ??= 100;
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] != null) continue;
    let j = i;
    while (out[j] == null) j++;
    for (let k = i; k < j; k++) out[k] = out[i - 1] + ((out[j] - out[i - 1]) * (k - i + 1)) / (j - i + 1);
  }
  return out;
}
// The color a fraction `t` of the way from a to b (a new stop between two).
function mixColor(a, b, t) {
  const rgba = (c) => {
    const p = parseColor(c) ?? parseColor(resolveColor(c));
    if (!p) return [0, 0, 0, 0];
    return [...[1, 3, 5].map((i) => parseInt(p.hex.slice(i, i + 2), 16)), p.a];
  };
  const [x, y] = [rgba(a), rgba(b)];
  const m = x.map((v, i) => v + (y[i] - v) * Math.min(1, Math.max(0, t)));
  return `rgba(${m.slice(0, 3).map(Math.round).join(', ')}, ${Math.round(m[3] * 100) / 100})`;
}

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
  // Words selected while typing (10c): the Text section reads and styles them. `range` comes
  // from main.js: read() the elements holding the selected words, write() wraps them in a
  // span first and returns it with the styled words inside. Those edits are part of the
  // text change (raw inline styles on the copy being typed in), not changes of their own.
  let range = null;
  let rangeEls = null;
  const apply = (prop, value) => (rangeEls ? sel().style.setProperty(prop, value) : changes.set(sel(), state.scope, prop, value));

  // Several elements selected: every field reads all of them ("Mixed" when
  // they differ) and every edit runs once per element, with sel() pointing at
  // that element. So writers that build on the current value (a shadow's X,
  // a color's opacity) keep each element's other values.
  const MIXED = 'Mixed';
  const many = () => state.multi.length > 1;
  const picked = () => rangeEls || range?.read() || (many() ? state.multi.filter((x) => x.isConnected) : [sel()]);
  function withEl(el, fn, scope = many() ? 'one' : state.scope) {
    const prev = [state.selected, state.scope];
    state.selected = el;
    state.scope = scope;
    try { return fn(); } finally { [state.selected, state.scope] = prev; }
  }
  let busy = false; // inside a multi edit: refresh once at the end, not after every element
  function each(fn) {
    if (!many() && !range) return fn();
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
    if (range) { // selected words: style them directly (they're part of the text being typed)
      rangeEls = range.write();
      try { each(fn); } finally { rangeEls = null; }
      refresh(true);
      return;
    }
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
    pop.className = 'pop glassy'; // a builder may add its own class (Type details)
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
      for (const item of items) {
        if (!item) { box.append(h('div', 'pop-sep')); continue; } // null: a divider
        const [value, label, off] = item;
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

  function colorPop(anchor, current, onPick, head, opts = {}) {
    const t = ctx.tokens();
    openPop(anchor, (box) => {
      box.classList.add('colors');
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
      head?.(box); // the fill type tabs, above the picker
      picker(box, current, onPick, opts);
      grid('Variables', t.colorVars.map((v) => ({ rgb: v.rgb, value: v.value, title: `${v.name}  ${parseColor(v.rgb)?.hex ?? ''}` })));
      grid('On this page', t.colors.map((c) => ({ rgb: c, value: c, title: parseColor(c)?.hex ?? c })));

    });
  }

  // The colour picker at the top of every colour menu (Figma's): a saturation /
  // brightness square, hue and opacity sliders, the eyedropper, hex and opacity.
  // Drawn by Edit Mode (the browser's own picker can't match the dark UI).
  // Dragging edits live; `onPick(value, 'picker')` lets the caller keep one undo step.
  function picker(box, current, onPick, { alpha = true } = {}) {
    let { h: hue, s: sat, v: val, a } = toHsva(current);
    const cp = h('div', 'cp');
    const sv = h('div', 'cp-sv');
    const svKnob = h('i', 'cp-knob');
    sv.append(svKnob);
    const hueBar = h('div', 'cp-bar cp-hue');
    const hueKnob = h('i', 'cp-knob');
    hueBar.append(hueKnob);
    const alphaBar = h('div', 'cp-bar cp-alpha');
    const alphaFill = h('div', 'cp-alpha-fill');
    const alphaKnob = h('i', 'cp-knob');
    alphaBar.append(alphaFill, alphaKnob);
    const bars = h('div', 'cp-bars');
    bars.append(hueBar);
    if (alpha) bars.append(alphaBar);
    const tools = h('div', 'cp-tools');
    if ('EyeDropper' in window) {
      const drop = h('button', 'icon', ICON.drop);
      drop.title = 'Pick a color from the screen';
      drop.setAttribute('aria-label', 'Pick a color from the screen');
      drop.addEventListener('click', async () => {
        try {
          const { sRGBHex } = await new window.EyeDropper().open();
          ({ h: hue, s: sat, v: val } = toHsva(sRGBHex));
          paint(); emit();
        } catch {} // cancelled
      });
      tools.append(drop);
    }
    tools.append(bars);
    const fields = h('div', 'field color cp-fields');
    const hexIn = h('input', 'hex');
    hexIn.spellcheck = false;
    hexIn.setAttribute('aria-label', 'Hex');
    fields.append(hexIn);
    let alphaIn;
    if (alpha) {
      alphaIn = h('input', 'alpha');
      alphaIn.setAttribute('aria-label', 'Opacity');
      fields.append(h('span', 'divider'), alphaIn, h('span', 'sfx', '%'));
    }
    cp.append(sv, tools, fields);
    box.append(cp);

    const rgb = () => hsvToRgb(hue, sat, val);
    const hex = () => '#' + rgb().map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    const value = () => (a < 1 ? `rgba(${rgb().join(', ')}, ${Math.round(a * 100) / 100})` : hex());
    function paint() {
      const pure = `rgb(${hsvToRgb(hue, 1, 1).join(', ')})`;
      sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})`;
      svKnob.style.left = `${sat * 100}%`;
      svKnob.style.top = `${(1 - val) * 100}%`;
      svKnob.style.background = hex();
      hueKnob.style.left = `${(hue / 360) * 100}%`;
      hueKnob.style.background = pure;
      alphaFill.style.background = `linear-gradient(to right, transparent, ${hex()})`;
      alphaKnob.style.left = `${a * 100}%`;
      if (shadow.activeElement !== hexIn) hexIn.value = hex().slice(1);
      if (alphaIn && shadow.activeElement !== alphaIn) alphaIn.value = Math.round(a * 100);
    }
    const emit = () => onPick(value(), 'picker');
    const drag = (el, fn) => el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const at = (ev) => {
        const r = el.getBoundingClientRect();
        fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
        paint(); emit();
      };
      at(e);
      const up = () => { el.removeEventListener('pointermove', at); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', at);
      el.addEventListener('pointerup', up);
    });
    drag(sv, (x, y) => { sat = x; val = 1 - y; });
    drag(hueBar, (x) => { hue = x * 360; });
    drag(alphaBar, (x) => { a = Math.round(x * 100) / 100; });
    const keys = (input, commit) => {
      input.addEventListener('focus', () => input.select());
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); else if (e.key === 'Escape') { paint(); input.blur(); } });
      input.addEventListener('change', commit);
    };
    keys(hexIn, () => {
      const c = colorFromText(hexIn.value);
      fields.classList.toggle('bad', !c);
      if (!c) return;
      ({ h: hue, s: sat, v: val } = toHsva(c));
      paint(); emit();
    });
    if (alphaIn) keys(alphaIn, () => {
      if (!isNumber(alphaIn.value.trim())) return paint();
      a = Math.min(100, Math.max(0, +alphaIn.value)) / 100;
      paint(); emit();
    });
    paint();
  }

  // ---------- Field builders ----------  // ---------- Field builders ----------
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
      prefix = h('span', (def.prefix.startsWith('<') ? 'pre' : 'pre txt') + (def.prefixClass ? ` ${def.prefixClass}` : ''), def.prefix); // a letter (W, H, X…) needs less room than an icon
      prefix.title = def.title;
      wrap.append(prefix);
    }
    const input = h('input');
    input.spellcheck = false;
    input.setAttribute('aria-label', def.title);
    wrap.append(input);
    if (def.suffix) wrap.append(h('span', 'sfx', def.suffix));
    if (def.picks || def.pickPop) {
      const pickBtn = h('button', 'pick', ICON.chevron);
      pickBtn.title = def.pickTitle || 'Values used on this page';
      pickBtn.setAttribute('aria-label', def.pickTitle || `${def.title} suggestions`);
      const set = (v) => {
        input.value = v;
        commit(null);
        refreshField(true);
      };
      pickBtn.addEventListener('click', () => (def.pickPop
        ? def.pickPop(pickBtn, input.value, set)
        : listPop(pickBtn, def.picks().map((v) => [v, v]), input.value, set)));
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
      const off = def.off ? common((el, cs) => def.off(el, cs) || '') : '';
      for (const [value, b, title] of buttons.map((x, i) => [...x, def.options[i][2]])) {
        b.classList.toggle('on', value === v);
        b.disabled = !!off && off !== MIXED;
        b.title = b.disabled ? `${title}: ${off}` : title;
      }
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
    if (def.lead) row.append(def.lead);
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
      colorPop(sw, current(), (v, from) => write(v, from === 'picker' ? `c${id}:picker:${pickerGroup}` : null), def.popHead));
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
  autoX.addEventListener('click', () => ctx.removeAutoLayout()); // ⌥⇧A: on the canvas, everything inside stays put
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
    if (isPlaced(sel()) && isNumber(String(t))) { // placed freely: through its constraints (Left and right → the right inset moves)
      const ratio = state.ratio.get(sel());
      const v = Math.max(0, +t);
      const to = axis === 'width' ? { w: v, ...(ratio && { h: v / ratio }) } : { h: v, ...(ratio && { w: v * ratio }) };
      return placeBox(sel(), apply, to);
    }
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
      modes: { options: (el) => [...sizeOptions(el, axis), ...limitItems(el, axis)], read: (el) => sizeMode(el, axis),
        write: (m) => (/^(add|remove)-/.test(m) ? setLimit(axis, m) : setSizing(axis, m)) },
    })));

  // Min / max width and height (Figma's "Add min width"…, item 7): added and removed from the
  // W / H menus; a field under W (width) or H (height) shows whenever a limit is set, by you or the code.
  const limitSet = (cs, k, axis) => {
    const v = cs.getPropertyValue(`${k}-${axis}`);
    return k === 'min' ? !/^(auto|0px|0)$/.test(v) : v !== 'none';
  };
  const AXIS_WORD = { width: 'width', height: 'height' };
  const limitItems = (el, axis) => [null, ...['min', 'max'].map((k) => (limitSet(getComputedStyle(el), k, axis)
    ? [`remove-${k}`, `Remove ${k} ${AXIS_WORD[axis]}`] : [`add-${k}`, `Add ${k} ${AXIS_WORD[axis]}`]))];
  function setLimit(axis, m) {
    const [what, k] = m.split('-');
    const prop = `${k}-${axis}`;
    if (what === 'add') return apply(prop, `${fmt(box(sel())[axis])}px`); // starts at the current size (Figma)
    if (changes.has(sel(), state.scope, prop)) changes.revert(sel(), state.scope, prop);
    if (limitSet(getComputedStyle(sel()), k, axis)) apply(prop, k === 'min' ? 'auto' : 'none'); // set by the code: override it
  }
  const limitFields = ['min', 'max'].flatMap((k) => ['width', 'height'].map((axis) => {
    const f = numField({ prefix: `${k === 'min' ? 'Min' : 'Max'} ${axis === 'width' ? 'W' : 'H'}`, prefixClass: 'long',
      title: `${k === 'min' ? 'Minimum' : 'Maximum'} ${axis}`, read: pxRead(`${k}-${axis}`), write: pxWriter(`${k}-${axis}`) });
    f.style.gridColumn = axis === 'width' ? '1' : '2';
    return { k, axis, f };
  }));
  const limitRow = row('two limits', ...limitFields.map((x) => x.f));
  function arrangeLimits(any) {
    const shown = limitFields.map((x) => any((el, cs) => limitSet(cs, x.k, x.axis)));
    const minRow = shown[0] || shown[1];
    limitFields.forEach((x, i) => {
      x.f.hidden = !shown[i];
      x.f.style.gridRow = x.k === 'min' || !minRow ? '1' : '2'; // no empty row above the max fields
    });
    limitRow.hidden = !shown.some(Boolean);
  }

  // Rotation and flip (8d; Figma's row under X / Y): CSS's own `rotate` and `scale`
  // properties, so a transform the code already has is left alone. The field reads
  // like Figma's (positive = counter-clockwise); CSS turns clockwise, so it's negated.
  const rotOf = (cs) => { const m = /(-?[\d.]+)deg/.exec(cs.rotate || ''); return m ? +m[1] : 0; };
  const scaleOf = (cs) => { const v = (cs.scale && cs.scale !== 'none' ? cs.scale : '1 1').split(/\s+/).map(Number); return [v[0], v[1] ?? v[0]]; };
  function setRot(cssDeg) {
    let d = ((cssDeg % 360) + 540) % 360 - 180; // −180…180
    d = Math.round(d * 100) / 100;
    if (changes.has(sel(), state.scope, 'rotate')) changes.revert(sel(), state.scope, 'rotate');
    if (rotOf(getComputedStyle(sel())) !== d) apply('rotate', d ? `${d}deg` : '0deg');
  }
  function flip(axis) {
    const [x, y] = scaleOf(getComputedStyle(sel()));
    const [nx, ny] = axis === 'h' ? [-x, y] : [x, -y];
    if (changes.has(sel(), state.scope, 'scale')) changes.revert(sel(), state.scope, 'scale');
    const [cx, cy] = scaleOf(getComputedStyle(sel()));
    if (cx !== nx || cy !== ny) apply('scale', nx === 1 && ny === 1 ? 'none' : `${nx} ${ny}`);
  }
  const rotField = numField({ prefix: ICON.rotate, title: 'Rotation', suffix: '°', min: -360,
    read: (el, cs) => fmt(-rotOf(cs) || 0),
    write: (t) => (isNumber(t) ? setRot(-t) : false) });
  const rotBtn = (icon, title, fn) => {
    const b = h('button', 'icon', ICON[icon]);
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', () => act(null, fn));
    return b;
  };
  const rotRow = h('div', 'crow');
  rotRow.append(rotField,
    rotBtn('rotate90', 'Rotate 90° right', () => setRot(rotOf(getComputedStyle(sel())) + 90)),
    rotBtn('flipV', 'Flip vertical', () => flip('v')),
    rotBtn('flipH', 'Flip horizontal', () => flip('h')));

  // X / Y (C4b): where something placed freely sits in its frame (top-level: on the canvas).
  const posRow = row('two',
    ...[['x', 'X'], ['y', 'Y']].map(([k, label]) => numField({
      prefix: label, title: label === 'X' ? 'X position' : 'Y position', min: -99999,
      read: (el) => fmt(frameBox(el)[k]),
      write: (t) => (isNumber(t) ? placeBox(sel(), apply, { [k]: +t }) : false),
    })));

  // Ignore auto layout (C4c; Figma's absolute position): out of the flow, staying where it is.
  const pinBtn = h('button', 'icon', ICON.pin);
  pinBtn.addEventListener('click', () => ctx.ignoreAutoLayout(!pinBtn.classList.contains('on')));
  fields.push(() => {
    if (!sel()) return;
    const on = picked().every(isPlaced);
    pinBtn.classList.toggle('on', on);
    pinBtn.setAttribute('aria-pressed', String(on));
    pinBtn.title = on ? 'Back into auto layout' : 'Ignore auto layout (absolute position)';
  });

  // Constraints (C4d): how it follows its frame when the frame is resized.
  const consBtns = ['h', 'v'].map((axis) => {
    const b = h('button', 'dd', '<span class="dd-label"></span>');
    b.append(h('span', 'chev', ICON.chevron));
    b.title = axis === 'h' ? 'Horizontal constraint' : 'Vertical constraint';
    b.addEventListener('click', () => {
      const now = common((el) => constraintOf(el, axis));
      listPop(b, CONSTRAINT_OPTIONS[axis], now, (v) => act(null, () => placeBox(sel(), apply, {}, { [axis]: v })));
    });
    fields.push(() => {
      if (!sel()) return;
      const now = common((el) => constraintOf(el, axis));
      b.querySelector('.dd-label').textContent = now === MIXED ? MIXED : Object.fromEntries(CONSTRAINT_OPTIONS[axis])[now];
    });
    return b;
  });
  const constraints = section('Constraints', row('two', ...consBtns));

  // Clip content (Figma): hide whatever sticks out past the frame's edges.
  const clipRow = h('label', 'checkrow');
  const clipBox = h('input');
  clipBox.type = 'checkbox';
  clipRow.append(clipBox, h('span', '', 'Clip content'));
  clipBox.addEventListener('change', () => act(null, () => apply('overflow', clipBox.checked ? 'hidden' : 'visible')));
  fields.push(() => {
    if (!sel()) return;
    const v = common((x, cs) => (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' ? 'on' : 'off'));
    clipBox.indeterminate = v === MIXED;
    clipBox.checked = v === 'on';
  });

  const layout = section('Layout',
    autoBlock,
    sizeRow,
    limitRow,
    posRow,
    rotRow,
    gapRow,
    spacing('padding', 'padding', 0),
    spacing('margin', 'margin', -9999),
    clipRow);

  layout.head.append(h('span', 'sh-acts')); // W/H keep their full width; the link lives in the title row
  layout.head.lastChild.append(pinBtn, ratioBtn, autoAdd);

  // Turn an element into a flex container that keeps its current look.
  // Freely placed things on the canvas becoming auto layout (⇧A), like Figma:
  // read the arrangement first (row or column by how they're spread, the
  // spacing between them as the gap, the space to the frame's edges as
  // padding), then put them in that order in the flow, so nothing jumps.
  // A new wrapper (`wrapper`) takes their place at x/y and hugs them.
  function flowFromPlaced(el, kids, wrapper) {
    const rs = kids.map((k) => ({ k, r: box(k) }));
    const cx = rs.map(({ r }) => r.left + r.width / 2);
    const cy = rs.map(({ r }) => r.top + r.height / 2);
    const row = Math.max(...cx) - Math.min(...cx) > Math.max(...cy) - Math.min(...cy);
    rs.sort((a, b) => (row ? a.r.left - b.r.left : a.r.top - b.r.top));
    const gaps = rs.slice(1).map(({ r }, i) => (row ? r.left - rs[i].r.right : r.top - rs[i].r.bottom)).filter((g) => g >= 0);
    const gap = gaps.length ? Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) : 0;
    const u = {
      left: Math.min(...rs.map(({ r }) => r.left)), top: Math.min(...rs.map(({ r }) => r.top)),
      right: Math.max(...rs.map(({ r }) => r.right)), bottom: Math.max(...rs.map(({ r }) => r.bottom)),
    };
    const prev = state.selected;
    state.selected = el;
    if (wrapper) {
      const p = el.parentElement;
      const pb = box(p);
      apply('position', 'absolute');
      apply('left', `${Math.round(u.left - pb.left - p.clientLeft)}px`);
      apply('top', `${Math.round(u.top - pb.top - p.clientTop)}px`);
      apply('width', 'fit-content');
    } else {
      const fb = box(el);
      const pad = {
        top: u.top - fb.top - el.clientTop, left: u.left - fb.left - el.clientLeft,
        right: fb.right - (el.offsetWidth - el.clientWidth - el.clientLeft) - u.right,
        bottom: fb.bottom - (el.offsetHeight - el.clientHeight - el.clientTop) - u.bottom,
      };
      for (const [side, v] of Object.entries(pad)) apply(`padding-${side}`, `${Math.max(0, Math.round(v))}px`);
    }
    rs.forEach(({ k }, i) => {
      if ([...el.children].indexOf(k) !== i) changes.move(k, 'one', i, el);
      changes.set(k, 'one', 'position', 'static');
      changes.set(k, 'one', 'left', 'auto');
      changes.set(k, 'one', 'top', 'auto');
    });
    apply('display', 'flex');
    apply('flex-direction', row ? 'row' : 'column');
    apply('align-items', 'flex-start');
    apply('gap', `${gap}px`);
    state.selected = prev;
  }

  function autoLayout(el, { wrapper = false } = {}) {
    const shown = [...el.children].filter((k) => k.getClientRects().length);
    if (shown.length && shown.every((k) => onCanvas(k) && getComputedStyle(k).position === 'absolute')) return flowFromPlaced(el, shown, wrapper);
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
      // Stacked rows that filled their parent's width (bar lines, list rows)
      // keep filling it: the frame fills too and stretches them (Figma's Fill),
      // instead of hugging and shrinking them.
      const inner = el.clientWidth - num(getComputedStyle(el).paddingLeft) - num(getComputedStyle(el).paddingRight);
      const fill = !row && kids.every((k) => Math.abs(k.offsetWidth + m(k, 'Left') + m(k, 'Right') - inner) < 1);
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
      apply('align-items', fill ? 'stretch' : kids.length > 1 ? 'flex-start' : 'center');
      apply('gap', `${gap}px`);
      if (!fill) apply('width', 'fit-content');
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

  // Font styles (Figma): a font from this computer lists its own styles
  // ("Medium Italic"); any other font gets the nine weights, each also italic.
  // A value is "weight|normal" or "weight|italic".
  const styleKey = (cs) => `${cs.fontWeight}|${/italic|oblique/.test(cs.fontStyle) ? 'italic' : 'normal'}`;
  const styleName = (key) => {
    const [w, st] = key.split('|');
    const name = (WEIGHTS.find(([x]) => x === w) || [w, w])[1];
    return st === 'italic' ? (name === 'Regular' ? 'Italic' : `${name} Italic`) : name;
  };
  function styleOptions(cs) {
    const own = fontStyles(cs);
    const opts = own
      ? own.map((x) => { const k = `${x.weight}|${x.italic ? 'italic' : 'normal'}`; return [k, x.name || styleName(k)]; })
      : WEIGHTS.flatMap(([w]) => [`${w}|normal`, `${w}|italic`]).map((k) => [k, styleName(k)]);
    const now = styleKey(cs);
    return opts.some(([v]) => v === now) ? opts : [...opts, [now, styleName(now)]];
  }

  // The styles a font really has: this computer's, else Google's (null: unknown).
  const fontStyles = (cs) => localStyles(firstFamily(cs.fontFamily)) || googleStyles(firstFamily(cs.fontFamily));
  // A font from this computer without the current style: its nearest style (Figma), same italic first.
  function nearestStyle() {
    const cs = getComputedStyle(sel());
    const own = fontStyles(cs);
    if (!own || own.some((x) => `${x.weight}|${x.italic ? 'italic' : 'normal'}` === styleKey(cs))) return;
    const italic = styleKey(cs).endsWith('italic');
    const best = [...own].sort((a, b) => (a.italic !== italic) - (b.italic !== italic) || Math.abs(a.weight - num(cs.fontWeight)) - Math.abs(b.weight - num(cs.fontWeight)))[0];
    apply('font-weight', String(best.weight));
    apply('font-style', best.italic ? 'italic' : 'normal');
  }

  // The font list (Figma's font picker): search, the page's fonts first, then
  // this computer's (Chrome asks once for permission; the click opening the
  // list is what lets it ask). Enter picks the first match.
  function fontPop(anchor, current, onPick) {
    openPop(anchor, (box) => {
      box.classList.add('fonts');
      const field = h('label', 'field');
      const search = h('input');
      search.placeholder = 'Search fonts';
      search.spellcheck = false;
      search.setAttribute('aria-label', 'Search fonts');
      field.append(search);
      const list = h('div', 'font-list');
      box.append(field, list);
      const page = ctx.tokens().fonts;
      const render = () => {
        const q = search.value.trim().toLowerCase();
        const match = (f) => !q || f.toLowerCase().includes(q);
        list.replaceChildren();
        const group = (title, fams) => {
          if (!fams.length) return;
          list.append(h('div', 'pop-title', title));
          for (const f of fams) {
            const b = h('button', 'pop-item' + (f === current ? ' on' : ''));
            b.textContent = f;
            b.addEventListener('click', () => { closePop(); onPick(f); });
            list.append(b);
          }
        };
        group('On this page', page.filter(match));
        const st = localStatus();
        const mine = st === 'ready' ? localFamilies() : [];
        if (st === 'ready') group('On your computer', mine.filter((f) => !page.includes(f) && match(f)));
        else if (st === 'loading') list.append(h('div', 'pop-title', 'On your computer'), h('div', 'pop-empty', 'Loading…'));
        else if (st === 'denied' && !q) list.append(h('div', 'pop-title', 'On your computer'),
          h('div', 'pop-empty', 'Chrome didn\'t allow access to your fonts. Allow Fonts in the site settings (left of the address), then reopen this list.'));
        if (googleReady()) {
          const shown = new Set([...page, ...mine]);
          group('Google Fonts', googleFamilies().filter((f) => !shown.has(f) && match(f)));
        }
        if (!list.querySelector('.pop-item') && q) list.append(h('div', 'pop-empty', 'No fonts match'));
      };
      search.addEventListener('input', render);
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); list.querySelector('.pop-item')?.click(); }
        else if (e.key === 'Escape') { e.preventDefault(); closePop(); }
      });
      if (localStatus() !== 'ready' && localStatus() !== 'unsupported') {
        loadLocal().then(() => { if (box.contains(list)) render(); });
      }
      if (!googleReady()) loadGoogle().then(() => { if (box.contains(list)) render(); });
      render();
      requestAnimationFrame(() => search.focus());
    });
  }

  // Text resizing (Figma): Auto width = one line that hugs; Auto height = a set
  // (or filling) width that wraps, as tall as its text; Fixed size = both set.
  const noWrap = (cs) => cs.textWrapMode === 'nowrap' || /nowrap|^pre$/.test(cs.whiteSpace);
  function textResizing(el) {
    if (sizeMode(el, 'height') === 'fixed') return 'fixed';
    return sizeMode(el, 'width') === 'hug' && (noWrap(getComputedStyle(el)) || !wraps(el)) ? 'auto-width' : 'auto-height';
  }
  const wraps = (el) => probe(el, { 'white-space': 'nowrap' }, () => box(el).height) < box(el).height - 0.5; // more than one line now
  const ensure = (axis, mode) => { if (sizeMode(sel(), axis) !== mode) setSizing(axis, mode); }; // no change when it's already so
  function wrapText() {
    if (!noWrap(getComputedStyle(sel()))) return;
    if (changes.has(sel(), state.scope, 'white-space')) changes.revert(sel(), state.scope, 'white-space');
    if (noWrap(getComputedStyle(sel()))) apply('white-space', 'normal');
  }
  function setTextResizing(mode) {
    if (mode === 'auto-width') {
      if (!noWrap(getComputedStyle(sel()))) apply('white-space', 'nowrap');
      ensure('width', 'hug');
      ensure('height', 'hug');
      return;
    }
    if (sizeMode(sel(), 'width') === 'hug') setSizing('width', 'fixed'); // measured first, so wrapping changes nothing yet
    wrapText();
    ensure('height', mode === 'fixed' ? 'fixed' : 'hug');
  }

  // Vertical alignment inside a fixed-height text box: align-content on a
  // block (the box's content moves; Chrome 123+, Safari 17.4+), the cross or
  // main axis on a flex text element (a button).
  const V_IN = { normal: 'top', start: 'top', 'flex-start': 'top', center: 'middle', end: 'bottom', 'flex-end': 'bottom' };
  function vAlignOf(el, cs) {
    if (/flex/.test(cs.display)) return V_IN[cs.flexDirection.startsWith('column') ? cs.justifyContent : cs.alignItems] || 'top';
    if (cs.alignContent === 'normal' && el.tagName === 'BUTTON') return 'middle'; // buttons centre their text by default
    return V_IN[cs.alignContent] || 'top';
  }
  function setVAlign(v) {
    const cs = getComputedStyle(sel());
    const flex = /flex/.test(cs.display);
    const prop = flex ? (cs.flexDirection.startsWith('column') ? 'justify-content' : 'align-items') : 'align-content';
    if (changes.has(sel(), state.scope, prop)) changes.revert(sel(), state.scope, prop);
    if (vAlignOf(sel(), getComputedStyle(sel())) !== v) apply(prop, { top: flex ? 'flex-start' : 'start', middle: 'center', bottom: flex ? 'flex-end' : 'end' }[v]);
  }

  // Type details (Figma's "⋯"): decoration, case, truncate after N lines.
  const clamped = (cs) => cs.webkitLineClamp !== 'none'; // (Chrome reports a clamped box's display as flow-root)
  const detailsBtn = h('button', 'icon', ICON.more);
  detailsBtn.title = 'Type details';
  detailsBtn.setAttribute('aria-label', 'Type details');
  function setTruncate(on, lines = 1) {
    const props = ['display', '-webkit-box-orient', '-webkit-line-clamp', 'overflow'];
    if (on) {
      apply('display', '-webkit-box');
      apply('-webkit-box-orient', 'vertical');
      apply('-webkit-line-clamp', String(lines));
      apply('overflow', 'hidden');
      return;
    }
    for (const p of props) if (changes.has(sel(), state.scope, p)) changes.revert(sel(), state.scope, p);
    if (clamped(getComputedStyle(sel()))) apply('-webkit-line-clamp', 'none'); // truncated by the code itself
  }
  function detailsPop(box) {
    box.classList.add('details');
    box.replaceChildren();
    const again = () => { ctx.onEdit(); detailsPop(box); };
    const seg = (cap, options, read, write) => {
      const now = common(read);
      const w = h('div', 'seg');
      for (const [value, label, title] of options) {
        const b = h('button', value === now ? 'on' : '', label);
        b.title = title;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', () => { act(null, () => write(value)); again(); });
        w.append(b);
      }
      box.append(h('div', 'pop-title', cap), w);
    };
    seg('Decoration', [['none', ICON.noDecoration, 'No decoration'], ['underline', ICON.underline, 'Underline'], ['line-through', ICON.strike, 'Strikethrough']],
      (el, cs) => (/underline/.test(cs.textDecorationLine) ? 'underline' : /line-through/.test(cs.textDecorationLine) ? 'line-through' : 'none'),
      (v) => apply('text-decoration-line', v));
    seg('Case', [['none', '–', 'As typed'], ['uppercase', 'AA', 'Uppercase'], ['lowercase', 'aa', 'Lowercase'], ['capitalize', 'Aa', 'Title case']],
      (el, cs) => (/^(uppercase|lowercase|capitalize)$/.test(cs.textTransform) ? cs.textTransform : 'none'),
      (v) => apply('text-transform', v));
    if (range) return; // truncating is the whole layer's, not selected words'
    const now = common((el, cs) => (clamped(cs) ? cs.webkitLineClamp : 'off'));
    const check = h('label', 'checkrow');
    const box1 = h('input');
    box1.type = 'checkbox';
    box1.checked = now !== 'off' && now !== MIXED;
    box1.indeterminate = now === MIXED;
    check.append(box1, h('span', '', 'Truncate text'));
    box1.addEventListener('change', () => { act(null, () => setTruncate(box1.checked)); again(); });
    box.append(check);
    if (box1.checked) {
      const f = h('label', 'field num');
      const input = h('input');
      input.value = now;
      input.setAttribute('aria-label', 'Max lines');
      let last = now;
      const group = `lines:${Date.now()}`; // ↑/↓ while focused: one undo step
      const commit = () => {
        const n = Math.min(99, Math.round(+input.value));
        if (!(n >= 1)) return (input.value = last);
        input.value = n;
        if (String(n) === last) return;
        last = String(n);
        act(group, () => setTruncate(true, n)); // in place: the field keeps the focus
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); input.value = Math.max(1, (+input.value || 1) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)); commit(); }
      });
      input.addEventListener('blur', commit);
      f.append(input);
      const line = h('div', 'lines');
      line.append(h('span', 'cap', 'Max lines'), f);
      box.append(line);
    }
  }
  detailsBtn.addEventListener('click', () => openPop(detailsBtn, detailsPop));

  // Text
  const typography = section('Text',
    row('one',
      numField({ title: 'Font', pickPop: fontPop, pickTitle: 'Fonts',
        read: (el, cs) => cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        write: (t) => {
          const rest = getComputedStyle(sel()).fontFamily.split(',').slice(1).join(',').trim();
          const value = t.includes(',') ? t : `"${t.replace(/["']/g, '')}"${rest ? ', ' + rest : ''}`;
          if (!CSS.supports('font-family', value)) return false;
          useFont(value); // a Google font: load it on the page
          apply('font-family', value);
          nearestStyle();
        } })),
    row('two',
      dropdown({ title: 'Font weight',
        options: (el, cs) => styleOptions(cs),
        read: (el, cs) => styleKey(cs),
        write: (v) => {
          const [w, style] = v.split('|');
          apply('font-weight', w);
          apply('font-style', style);
        } }),
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
    row('two',
      segField({
        options: [['top', ICON.vTop, 'Align text top'], ['middle', ICON.vMiddle, 'Align text middle'], ['bottom', ICON.vBottom, 'Align text bottom']],
        read: (el, cs) => vAlignOf(el, cs),
        off: (el) => (sizeMode(el, 'height') === 'fixed' ? null : 'only with a fixed height (Fixed size): the box is as tall as its text'),
        write: (v) => setVAlign(v) }),
      segField({
        options: [['auto-width', ICON.autoWidth, 'Auto width'], ['auto-height', ICON.autoHeight, 'Auto height'], ['fixed', ICON.fixedSize, 'Fixed size']],
        read: (el) => textResizing(el),
        write: (v) => setTextResizing(v) })),
    colorRow({ title: 'Text color', read: (el, cs) => cs.color, write: (v) => apply('color', v) }));
  typography.head.append(h('span', 'sh-acts'));
  typography.head.lastChild.append(detailsBtn);
  const [, , , textAlignRow, textBoxRow] = typography.body.querySelectorAll(':scope > .row'); // paragraph-level: the whole layer, not selected words

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
    popHead: (box) => { if (!layers().length) typeTabs(box, 'solid', (t) => setFillType(t, 'solid')); },
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
  // The layer: background-image's first layer, a gradient or an image
  // (several layers stacked: roadmap item 8). Figma's fill types map to
  // Solid = background-color, Linear/Radial/Angular = linear/radial/conic-gradient,
  // Image = url() with Fill (cover), Fit (contain) or Tile.
  // Stacked fills (8b): background-image's layers, top first, each a row; the solid
  // background-color is the bottom row. A hidden layer leaves the CSS but keeps its
  // place (kept per element with the CSS it was hidden against, so an undo wins).
  // `li` is the layer being edited (its row shows the angle, gradient bar and stops).
  let li = 0;
  let shownEl = null;
  function bgModel(el = sel()) {
    const cs = getComputedStyle(el);
    const st = hiddenStore.get(el);
    if (st?.bg && st.bg.seen !== cs.backgroundImage) delete st.bg; // stale: an undo
    const list = splitList(cs.backgroundImage).map((value) => ({ value, hidden: false }));
    for (const x of (st?.bg?.list || []).slice().sort((a, b) => a.at - b.at)) list.splice(Math.min(x.at, list.length), 0, { value: x.value, hidden: true });
    return list;
  }
  function bgWrite(list) {
    const el = sel();
    const vis = list.filter((x) => !x.hidden).map((x) => x.value);
    if (vis.length) { if (getComputedStyle(el).backgroundImage !== vis.join(', ')) apply('background-image', vis.join(', ')); }
    else clear(['background-image', 'background'], (cs) => cs.backgroundImage !== 'none', () => apply('background-image', 'none'));
    const hidden = list.flatMap((x, at) => (x.hidden ? [{ at, value: x.value }] : []));
    if (hidden.length) stash(el).bg = { list: hidden, seen: getComputedStyle(el).backgroundImage };
    else if (hiddenStore.get(el)) delete hiddenStore.get(el).bg;
  }
  const layers = () => bgModel().map((x) => x.value); // every layer, hidden ones too (indexes stay put)
  const gradHidden = () => !!bgModel()[li]?.hidden;
  const gradient = () => parseGradient(layers()[li]);
  const isImage = (layer) => /^url\(/.test(layer || '');
  // A solid colour as a layer (Figma's solid fill above others): a gradient of one colour.
  const solidLayer = (c) => `linear-gradient(${c}, ${c})`;
  const solidOf = (layer) => { const g = parseGradient(layer); return g && g.type === 'linear' && g.stops.length === 2 && g.stops[0].color === g.stops[1].color ? g.stops[0].color : null; };
  function gradSet(patch) {
    const list = bgModel();
    const g = parseGradient(list[li]?.value);
    if (!g) return;
    const next = patch(g);
    if (!next) return false;
    list[li].value = buildGradient(next);
    bgWrite(list);
  }
  const resetImageFit = () => clear(['background-size', 'background-position', 'background-repeat'], () => false, () => {});

  // Switch a fill's type. `from`: the solid row or the layer row. Gradients
  // keep their stops; a solid becomes its color fading out (Figma's default).
  async function setFillType(type, from) {
    const els = picked();
    const scope = many() ? 'one' : state.scope;
    let image = null;
    if (type === 'image') {
      const file = await pickImage(column);
      if (!file) return;
      try { image = await uploadImage(file); } catch (err) { ctx.toast('Couldn\'t add that image', err.message, { ms: 3500 }); return; }
    }
    changes.batch(null, () => { for (const el of els) if (el.isConnected) withEl(el, () => fillTypeOne(type, from, image), scope); });
    ctx.onEdit();
  }
  function fillTypeOne(type, from, image) {
    const cs = getComputedStyle(sel());
    const model = bgModel();
    const first = from === 'layer' ? model[li]?.value : null;
    const solidColor = solidOf(first); // a solid layer: becomes its colour fading out, like a solid fill
    const g = solidColor ? null : parseGradient(first);
    const wasImage = isImage(first);
    const solid = fillHidden() ? stash(sel()).fill : cs.backgroundColor;
    if (type === 'solid') {
      if (from === 'solid' || solidColor) return;
      const color = g ? g.stops[0].color : DEFAULT_FILL;
      if (li === model.length - 1 && isClear(cs.backgroundColor)) { // the bottom layer over no colour: plain background-color
        model.splice(li, 1);
        bgWrite(model);
        li = Math.max(0, li - 1);
        apply('background-color', color);
      } else { model[li].value = solidLayer(color); bgWrite(model); }
      if (wasImage && !model.some((x) => isImage(x.value))) resetImageFit();
      return;
    }
    let layer;
    if (type === 'image') layer = `url("${image.url}")`;
    else if (g) layer = buildGradient({ ...g, type, dir: GRAD_DIR[type] });
    else {
      const base = solidColor || (from === 'solid' && !isClear(solid) ? solid : '#000000');
      layer = buildGradient({ repeating: false, type, dir: GRAD_DIR[type],
        stops: [{ color: withAlpha(base, 1), pos: '0%' }, { color: withAlpha(base, 0), pos: '100%' }] });
    }
    if (from === 'layer') model[li].value = layer;
    else { model.unshift({ value: layer, hidden: false }); li = 0; }
    bgWrite(model);
    if (type === 'image' && !wasImage) for (const [k, v] of Object.entries(IMAGE_FIT.fill)) apply(k, v);
    if (type !== 'image' && wasImage && !model.some((x) => isImage(x.value))) resetImageFit();
    if (from === 'solid') {
      delete stash(sel()).fill;
      clear(['background-color'], (c) => !isClear(c.backgroundColor), () => apply('background-color', 'transparent'));
    }
  }
  const typeOf = (layer) => (isImage(layer) ? 'image' : solidOf(layer) ? 'solid' : parseGradient(layer)?.type ?? 'pattern');
  // Fill types, as a row of tabs at the top of the solid fill's color menu.
  function typeTabs(box, now, onPick) {
    const seg = h('div', 'seg types');
    for (const [v, label] of FILL_TYPES) {
      const b = h('button', v === now ? 'on' : '', label);
      b.addEventListener('click', () => { closePop(); onPick(v); });
      seg.append(b);
    }
    box.prepend(seg);
  }

  // Header row: [preview + type ▾] [angle | image fit ▾] [eye] [×]
  const kindBtn = h('button', 'dd kind', '<i class="thumb"></i><span class="dd-label"></span>');
  kindBtn.append(h('span', 'chev', ICON.chevron));
  kindBtn.title = 'Fill type';
  kindBtn.addEventListener('click', () => {
    if (kindBtn.dragged) return; // the end of a reorder drag, not a click
    const now = typeOf(layers()[li]);
    listPop(kindBtn, FILL_TYPES, now, (t) => {
      if (t === now && t !== 'image') return;
      setFillType(t, 'layer'); // Image again: choose another image
    });
  });
  const fitBtn = h('button', 'dd fit', '<span class="dd-label"></span>');
  fitBtn.append(h('span', 'chev', ICON.chevron));
  fitBtn.title = 'How the image fills the layer';
  fitBtn.addEventListener('click', () =>
    listPop(fitBtn, [['fill', 'Fill'], ['fit', 'Fit'], ['tile', 'Tile']], fitOf(getComputedStyle(sel())), (v) =>
      act(null, () => { for (const [k, val] of Object.entries(IMAGE_FIT[v])) apply(k, val); })));
  const gradEye = h('button', 'icon', ICON.eye);
  const toggleLayer = (i) => act(null, () => { const m = bgModel(); if (!m[i]) return; m[i].hidden = !m[i].hidden; bgWrite(m); });
  const removeLayer = (i) => act(null, () => {
    const m = bgModel();
    if (!m[i]) return;
    const was = m.splice(i, 1)[0].value;
    bgWrite(m);
    if (isImage(was) && !m.some((x) => isImage(x.value))) resetImageFit();
    li = Math.min(li, Math.max(0, m.length - 1));
  });
  gradEye.addEventListener('click', () => toggleLayer(li));
  const gradX = h('button', 'icon', ICON.x);
  gradX.title = 'Remove';
  gradX.setAttribute('aria-label', 'Remove gradient or image');
  gradX.addEventListener('click', () => removeLayer(li));
  const angleOf = (dir) => /^(?:from\s+)?(-?[\d.]+)deg/.exec(dir || '');
  const angleField = numField({ prefix: ICON.angle, title: 'Gradient angle', min: -360, suffix: '°',
    read: () => {
      const g = gradient();
      if (!g?.dir) return g?.type === 'conic' ? '0' : '180';
      const deg = angleOf(g.dir);
      return deg ? fmt(+deg[1]) : g.dir;
    },
    write: (t) => (isNumber(t) ? gradSet((g) => ({ ...g,
      dir: g.type === 'conic' ? `from ${+t}deg${/\sat\s.*/.exec(g.dir || '')?.[0] ?? ''}` : `${+t}deg` })) : false) });
  const gradHead = h('div', 'crow');
  gradHead.append(kindBtn, angleField, fitBtn, gradEye, gradX);

  // Stops: a bar with a handle per stop (drag to move, click the bar to add,
  // Delete removes the selected one), and a row per stop: position, color, ×.
  let stopSel = 0;
  // Rewrite the stops with explicit % positions, in order. `edit(stops)`
  // changes the list and returns the stop to keep selected.
  function stopsEdit(edit) {
    return gradSet((g) => {
      const ps = stopPositions(g.stops);
      if (!ps) return null; // positions in px: not editable here
      const stops = g.stops.map((st, i) => ({ color: st.color, p: ps[i] }));
      const keep = edit(stops);
      if (keep === false) return null;
      stops.sort((a, b) => a.p - b.p);
      if (keep) stopSel = stops.indexOf(keep);
      return { ...g, stops: stops.map((st) => ({ color: st.color, pos: `${Math.round(Math.min(100, Math.max(0, st.p)) * 10) / 10}%` })) };
    });
  }
  const writeStops = (edit, group = null) => act(group, () => stopsEdit(edit));
  const removeEdit = (i) => (stops) => {
    if (stops.length <= 2) return false; // a gradient needs two
    stops.splice(i, 1);
    return stops[Math.min(i, stops.length - 1)];
  };
  const removeStop = (i) => writeStops(removeEdit(i));
  const bar = h('div', 'gbar');
  const track = h('div', 'gtrack');
  bar.append(track);
  const pAt = (x) => {
    const r = track.getBoundingClientRect();
    return Math.min(100, Math.max(0, ((x - r.left) / r.width) * 100));
  };
  const handles = Array.from({ length: MAX_STOPS }, (_, i) => {
    const b = h('button', 'gstop', '<i></i>');
    b.title = 'Drag to move · Delete to remove';
    b.setAttribute('aria-label', `Gradient stop ${i + 1}`);
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      stopSel = i;
      b.focus();
      refresh();
      const group = `gstop:${Date.now()}`;
      const startX = e.clientX;
      const move = (ev) => {
        if (Math.abs(ev.clientX - startX) < 2) return;
        writeStops((stops) => { stops[stopSel].p = pAt(ev.clientX); return stops[stopSel]; }, group);
        handles[stopSel]?.focus();
      };
      const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeStop(i); handles[stopSel]?.focus(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1);
        writeStops((stops) => { stops[i].p += d; return stops[i]; }, `gnudge:${i}`);
        handles[stopSel]?.focus();
      }
    });
    track.append(b);
    return b;
  });
  track.addEventListener('pointerdown', (e) => {
    if (e.target !== track) return;
    e.preventDefault();
    const p = pAt(e.clientX);
    writeStops((stops) => {
      if (stops.length >= MAX_STOPS) return false;
      const after = stops.findIndex((st) => st.p > p);
      const a = stops[after - 1] ?? stops[0];
      const b = stops[after] ?? stops.at(-1);
      const made = { color: mixColor(a.color, b.color, a === b ? 0 : (p - a.p) / (b.p - a.p || 1)), p };
      stops.push(made);
      return made;
    });
    handles[stopSel]?.focus();
  });

  const stopRows = Array.from({ length: MAX_STOPS }, (_, i) => {
    const pos = numField({ title: `Stop ${i + 1} position`, suffix: '%', min: 0, max: 100,
      read: () => {
        const g = gradient();
        const ps = g && stopPositions(g.stops);
        return ps ? fmt(Math.round(ps[i] * 10) / 10) : g?.stops[i]?.pos || '';
      },
      write: (t) => (isNumber(t) ? stopsEdit((stops) => { stops[i].p = Math.min(100, Math.max(0, +t)); return stops[i]; }) : false) });
    const row = colorRow({
      title: `Gradient stop ${i + 1}`,
      lead: pos,
      read: () => gradient()?.stops[i]?.color ?? 'transparent',
      write: (v) => gradSet((g) => {
        const stops = g.stops.slice();
        stops[i] = { ...stops[i], color: v };
        return { ...g, stops };
      }),
      remove: () => { stopSel = i; return stopsEdit(removeEdit(i)); },
    });
    row.classList.add('stop');
    return row;
  });
  // A solid layer's colour (both stops of its one-colour gradient).
  const solidRow = colorRow({ title: 'Layer color',
    read: () => solidOf(layers()[li]) ?? 'transparent',
    write: (v) => { const m = bgModel(); if (!m[li]) return; m[li].value = solidLayer(v); bgWrite(m); } });
  solidRow.classList.add('solid-layer');
  const gradBlock = h('div', 'grad');
  gradBlock.append(gradHead, bar, solidRow, ...stopRows);

  // The other layers: a compact row each ([swatch + type] [eye] [×]); clicking one edits it.
  // Drag any row's swatch up or down to restack (Figma: top of the list = on top).
  const layerList = h('div', 'layers-list');
  let layerSig = null;
  function layerRow(i, x) {
    const r = h('div', 'crow flrow' + (x.hidden ? ' off' : ''));
    const kb = h('button', 'dd kind', '<i class="thumb"></i><span class="dd-label"></span>');
    kb.title = 'Edit this fill · drag to restack';
    kb.setAttribute('aria-label', `Fill layer ${i + 1}`);
    const th = kb.querySelector('.thumb');
    th.style.background = x.value;
    th.style.backgroundSize = 'cover';
    kb.querySelector('.dd-label').textContent = Object.fromEntries(FILL_TYPES)[typeOf(x.value)] ?? 'Pattern';
    kb.addEventListener('click', () => { if (kb.dragged) return; li = i; refresh(true); });
    dragRow(kb, i);
    const eye = h('button', 'icon', x.hidden ? ICON.eyeOff : ICON.eye);
    eye.title = x.hidden ? 'Show' : 'Hide';
    eye.addEventListener('click', () => toggleLayer(i));
    const del = h('button', 'icon', ICON.x);
    del.title = 'Remove';
    del.setAttribute('aria-label', `Remove fill layer ${i + 1}`);
    del.addEventListener('click', () => removeLayer(i));
    r.append(kb, eye, del);
    return r;
  }
  // Restack by dragging a row's swatch: a line shows where it lands; one ⌘Z.
  const dropMark = h('div', 'fl-drop');
  function dragRow(handle, i) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const y0 = e.clientY;
      let to = null;
      handle.dragged = false;
      const rowsNow = () => [...layerList.children].filter((n) => n.dataset.i != null);
      const move = (ev) => {
        if (!handle.dragged && Math.abs(ev.clientY - y0) < 4) return;
        handle.dragged = true;
        const rs = rowsNow();
        to = rs.findIndex((n) => ev.clientY < n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2);
        if (to < 0) to = rs.length;
        const ref = rs[to];
        const lr = layerList.getBoundingClientRect();
        dropMark.style.top = `${(ref ? ref.getBoundingClientRect().top : rs.at(-1).getBoundingClientRect().bottom) - lr.top - 4}px`;
        layerList.append(dropMark);
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        dropMark.remove();
        const from = i ?? li; // the open row's own swatch: the layer being edited
        if (handle.dragged && to != null) {
          const j = to > from ? to - 1 : to;
          if (j !== from) act(null, () => { const m = bgModel(); const [x] = m.splice(from, 1); m.splice(j, 0, x); bgWrite(m); });
          li = j;
          refresh(true);
        }
        setTimeout(() => { handle.dragged = false; }); // the click that follows the drag isn't a click
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    });
  }
  dragRow(kindBtn, null);
  fields.push(() => {
    const el = sel();
    if (!el) return;
    const model = bgModel();
    const list = model.map((x) => x.value);
    li = Math.min(li, Math.max(0, list.length - 1));
    // Several selected: only when they share the same layers (stops are edited by position).
    const shared = !many() || common((x, cs) => cs.backgroundImage) !== MIXED;
    layerList.hidden = !list.length || !shared;
    // Rebuild the rows only when the stack's shape changes (moving the open editor would
    // take the focus out of a field mid-typing, e.g. Shift+↑ in its opacity); values update in place.
    const sig = `${li}|${model.map((x) => `${x.hidden}:${typeOf(x.value)}`).join('|')}`;
    if (!layerList.hidden && sig !== layerSig) {
      layerSig = sig;
      layerList.replaceChildren(...model.map((x, i) => {
        const node = i === li ? gradBlock : layerRow(i, x);
        node.dataset.i = i;
        return node;
      }));
    } else if (!layerList.hidden) {
      for (const r of layerList.querySelectorAll(':scope > .flrow')) r.querySelector('.thumb').style.background = model[+r.dataset.i]?.value || '';
    }
    const g = parseGradient(list[li]);
    const off = gradHidden();
    gradBlock.hidden = layerList.hidden;
    if (gradBlock.hidden) return;
    const type = typeOf(list[li]);
    kindBtn.querySelector('.dd-label').textContent = Object.fromEntries(FILL_TYPES)[type] ?? 'Pattern';
    const thumb = kindBtn.querySelector('.thumb');
    thumb.style.background = list[li] || '';
    thumb.style.backgroundSize = 'cover';
    thumb.style.backgroundPosition = 'center';
    angleField.hidden = !g || type === 'solid' || g.type === 'radial' || (g.dir && !angleOf(g.dir));
    solidRow.hidden = type !== 'solid';
    fitBtn.hidden = type !== 'image';
    if (type === 'image') fitBtn.querySelector('.dd-label').textContent = { fill: 'Fill', fit: 'Fit', tile: 'Tile', custom: 'Custom' }[fitOf(getComputedStyle(el))];
    const ps = g && type !== 'solid' && stopPositions(g.stops);
    bar.hidden = !ps;
    if (ps) {
      stopSel = Math.min(stopSel, g.stops.length - 1);
      track.style.setProperty('--g', `linear-gradient(90deg, ${g.stops.map((st, i) => `${st.color} ${ps[i]}%`).join(', ')})`);
      handles.forEach((b, i) => {
        b.hidden = i >= g.stops.length;
        if (b.hidden) return;
        b.style.left = `${ps[i]}%`;
        b.firstChild.style.background = g.stops[i].color;
        b.classList.toggle('on', i === stopSel);
      });
    }
    stopRows.forEach((r, i) => {
      r.hidden = !g || type === 'solid' || i >= g.stops.length;
      const x = r.querySelector(':scope > .icon:last-child');
      if (x) { x.disabled = !g || g.stops.length <= 2; x.title = x.disabled ? 'A gradient needs two stops' : 'Remove stop'; }
    });
    gradEye.innerHTML = off ? ICON.eyeOff : ICON.eye;
    gradBlock.classList.toggle('off', off);
  });

  const fill = section('Fill', layerList, fillRow);
  // + (Figma): nothing yet → a solid colour; otherwise a solid layer on top of the rest.
  const fillAdd = addButton('fill', () => {
    const cs = getComputedStyle(sel());
    if (isClear(cs.backgroundColor) && !fillHidden() && !bgModel().length) return apply('background-color', DEFAULT_FILL);
    const m = bgModel();
    m.unshift({ value: solidLayer('rgb(217, 217, 217)'), hidden: false });
    bgWrite(m);
    li = 0;
  });
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
    strokeFour,
    row('two',
      dropdown({ title: 'Stroke style',
        options: () => {
          const now = stroke()?.style;
          const opts = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']];
          return !now || opts.some(([v]) => v === now) ? opts : [...opts, [now, now[0].toUpperCase() + now.slice(1)]]; // double, groove… as the code has it
        },
        read: () => stroke()?.style ?? 'solid',
        write: (v) => {
          if (strokeHidden()) strokeShow();
          strokeSet('style', v); // only the stroke's own sides (one side, or Custom)
        } })));
  const strokeAdd = addButton('stroke', () => {
    apply('border-style', 'solid');
    apply('border-width', '1px');
    apply('border-color', '#000000');
  });
  strokeSec.head.append(strokeAdd);

  // Effects (Figma, 8a): a list of Drop shadow / Inner shadow (box-shadow layers, in order),
  // Layer blur (filter: blur) and Background blur (backdrop-filter: blur). Hidden ones are kept
  // per element (with what the CSS looked like then, so an undo that brings them back wins).
  const FX_TYPES = [['drop', 'Drop shadow'], ['inner', 'Inner shadow'], ['blur', 'Layer blur'], ['backdrop', 'Background blur']];
  const blurOf = (v) => { const m = /blur\(\s*([\d.]+)px\s*\)/.exec(v || ''); return m ? +m[1] : null; };
  const withBlur = (v, px) => {
    const rest = (v && v !== 'none' ? v : '').replace(/blur\([^)]*\)/, '').trim();
    const out = [rest, px == null ? '' : `blur(${fmt(px)}px)`].filter(Boolean).join(' ');
    return out || 'none';
  };
  // The list as shown: [{ kind: 'shadow' | 'blur' | 'backdrop', value, hidden }]
  function fxModel(el) {
    const cs = getComputedStyle(el);
    const st = hiddenStore.get(el);
    if (st?.fx && st.fx.seen !== `${cs.boxShadow}|${cs.filter}|${cs.backdropFilter}`) delete st.fx; // stale (an undo)
    const hid = st?.fx?.list || [];
    const shadows = splitList(cs.boxShadow).map((value) => ({ kind: 'shadow', value, hidden: false }));
    for (const x of hid.filter((x) => x.kind === 'shadow').sort((a, b) => a.at - b.at)) shadows.splice(Math.min(x.at, shadows.length), 0, { kind: 'shadow', value: x.value, hidden: true });
    const out = [...shadows];
    for (const kind of ['blur', 'backdrop']) {
      const px = blurOf(kind === 'blur' ? cs.filter : cs.backdropFilter);
      const h0 = hid.find((x) => x.kind === kind);
      if (px != null) out.push({ kind, value: px, hidden: false });
      else if (h0) out.push({ kind, value: h0.value, hidden: true });
    }
    return out;
  }
  function fxWrite(list) {
    const el = sel();
    const shadows = list.filter((x) => x.kind === 'shadow');
    const visible = shadows.filter((x) => !x.hidden).map((x) => x.value).join(', ') || 'none';
    const cs = getComputedStyle(el);
    if (cs.boxShadow !== visible) apply('box-shadow', visible);
    for (const kind of ['blur', 'backdrop']) {
      const prop = kind === 'blur' ? 'filter' : 'backdrop-filter';
      const x = list.find((y) => y.kind === kind && !y.hidden);
      const v = withBlur(getComputedStyle(el).getPropertyValue(prop), x ? x.value : null);
      if (getComputedStyle(el).getPropertyValue(prop) !== v) {
        if (v === 'none' && changes.has(el, state.scope, prop)) changes.revert(el, state.scope, prop);
        if (getComputedStyle(el).getPropertyValue(prop) !== v) apply(prop, v);
      }
    }
    const hidden = list.flatMap((x, i) => (x.hidden ? [{ kind: x.kind, value: x.value, at: x.kind === 'shadow' ? shadows.indexOf(x) : 0 }] : []));
    const after = getComputedStyle(el);
    if (hidden.length) stash(el).fx = { list: hidden, seen: `${after.boxShadow}|${after.filter}|${after.backdropFilter}` };
    else if (hiddenStore.get(el)) delete hiddenStore.get(el).fx;
  }
  const fxEdit = (fn) => { const list = fxModel(sel()); if (fn(list) !== false) fxWrite(list); };
  const typeOfFx = (x) => (x.kind === 'shadow' ? (parseShadow(x.value).inset ? 'inner' : 'drop') : x.kind);
  function setFxType(i, type) {
    fxEdit((list) => {
      const x = list[i];
      if (!x || typeOfFx(x) === type) return false;
      if (x.kind === 'shadow' && (type === 'drop' || type === 'inner')) { x.value = buildShadow({ ...parseShadow(x.value), inset: type === 'inner' }); return; }
      if (type === 'blur' || type === 'backdrop') {
        if (list.some((y, j) => j !== i && y.kind === type)) return false; // one of each (greyed out in the menu)
        list[i] = { kind: type, value: x.kind === 'shadow' ? 4 : x.value, hidden: x.hidden };
      } else list[i] = { kind: 'shadow', value: buildShadow({ ...parseShadow(DEFAULT_SHADOW), inset: type === 'inner' }), hidden: x.hidden };
      list.sort((a, b) => (a.kind === 'shadow' ? 0 : a.kind === 'blur' ? 1 : 2) - (b.kind === 'shadow' ? 0 : b.kind === 'blur' ? 1 : 2));
    });
  }
  const fxAdd = () => fxEdit((list) => { list.splice(list.filter((x) => x.kind === 'shadow').length, 0, { kind: 'shadow', value: DEFAULT_SHADOW, hidden: false }); });

  const effectsList = h('div', 'fx-list');
  const effects = section('Effects', effectsList);
  const fxAddBtn = addButton('effect', fxAdd);
  effects.head.append(fxAddBtn);
  let fxSig = null;
  let fxFields = [];
  function fxRow(i, x, n) {
    const label = (t) => (n === 1 ? t : t.replace(/^(Remove shadow|Shadow)/, `$1 ${n}`)); // the first shadow keeps plain names ("Shadow X offset"); then "Shadow 2 X offset"
    const typeBtn = dropdown({ title: label(x.kind === 'shadow' ? 'Shadow type' : 'Effect type'),
      options: (el) => { const m = fxModel(el); return FX_TYPES.map(([v, l]) => [v, l, (v === 'blur' || v === 'backdrop') && m.some((y, j) => j !== i && y.kind === v) ? `Already has a ${l.toLowerCase()}` : null]); },
      read: (el) => (fxModel(el)[i] ? typeOfFx(fxModel(el)[i]) : MIXED),
      write: (v) => setFxType(i, v) });
    const eye = h('button', 'icon', x.hidden ? ICON.eyeOff : ICON.eye);
    eye.title = x.hidden ? 'Show' : 'Hide';
    eye.addEventListener('click', () => act(null, () => fxEdit((list) => { if (!list[i]) return false; list[i].hidden = !list[i].hidden; })));
    const del = h('button', 'icon', ICON.x);
    del.title = 'Remove';
    del.setAttribute('aria-label', x.kind === 'shadow' ? label('Remove shadow') : `Remove ${x.kind === 'blur' ? 'layer blur' : 'background blur'}`);
    del.addEventListener('click', () => act(null, () => fxEdit((list) => { if (!list[i]) return false; list.splice(i, 1); })));
    const head = h('div', 'crow' + (x.hidden ? ' off' : ''));
    const box = h('div', 'fx' + (x.hidden ? ' off' : ''));
    if (x.kind !== 'shadow') {
      const amount = numField({ prefix: 'B', title: x.kind === 'blur' ? 'Layer blur' : 'Background blur', min: 0,
        read: (el) => fmt(fxModel(el)[i]?.value ?? 0),
        write: (t) => (isNumber(t) ? fxEdit((list) => { if (!list[i]) return false; list[i].value = Math.max(0, +t); }) : false) });
      head.append(typeBtn, eye, del);
      box.append(head, row('two', amount));
      return box;
    }
    const sh = (el) => parseShadow(fxModel(el)[i]?.value);
    const setSh = (patch) => fxEdit((list) => { if (list[i]?.kind !== 'shadow') return false; list[i].value = buildShadow({ ...parseShadow(list[i].value), ...patch }); });
    const num1 = (prefix, key, min, title) => numField({ prefix, title: label(title), min,
      read: (el) => fmt(sh(el)?.[key] ?? 0),
      write: (t) => (isNumber(t) ? setSh({ [key]: Math.max(min, +t) }) : false) });
    head.append(typeBtn, eye, del);
    box.append(head,
      colorRow({ title: label('Shadow color'), read: (el) => sh(el)?.color ?? 'rgba(0, 0, 0, 0.25)', write: (v) => setSh({ color: v }) }),
      row('four', num1('X', 'x', -999, 'Shadow X offset'), num1('Y', 'y', -999, 'Shadow Y offset'),
        num1('B', 'blur', 0, 'Shadow blur'), num1('S', 'spread', -999, 'Shadow spread')));
    return box;
  }
  // Rebuild the rows when the list's shape changes; otherwise just refresh their fields.
  fields.push((force) => {
    const el = sel();
    if (!el) return;
    const model = fxModel(el);
    const sig = model.map((x) => `${typeOfFx(x)}${x.hidden ? '-' : ''}`).join(',');
    if (sig !== fxSig) {
      fxSig = sig;
      const n0 = fields.length;
      let shadowN = 0;
      effectsList.replaceChildren(...model.map((x, i) => fxRow(i, x, x.kind === 'shadow' ? ++shadowN : 1)));
      fxFields = fields.splice(n0); // these rows' fields refresh here, and go when the rows do
    }
    for (const f of fxFields) f(force);
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

  // Alignment (Figma's row at the top of the panel): one thing aligns to its
  // frame, several align to each other. Only for things placed freely on the
  // canvas; `ctx.alignState()` says why not otherwise (greyed out, reason in the tooltip).
  // Two groups: horizontal (left, centers, right, distribute) and vertical (top, middles, bottom, distribute).
  const ALIGN_BTNS = [
    [['left', 'alignLeft', 'Align left', '⌥A'], ['hcenter', 'alignHCenter', 'Align horizontal centers', '⌥H'], ['right', 'alignRight', 'Align right', '⌥D'], ['hspace', 'distributeH', 'Distribute horizontal spacing', '⌃⌥H']],
    [['top', 'alignTop', 'Align top', '⌥W'], ['vcenter', 'alignVCenter', 'Align vertical centers', '⌥V'], ['bottom', 'alignBottom', 'Align bottom', '⌥S'], ['vspace', 'distributeV', 'Distribute vertical spacing', '⌃⌥V']],
  ];
  const alignRow = h('section', 'align-row');
  const alignBtns = ALIGN_BTNS.flatMap((group) => {
    const seg = h('div', 'seg align-seg');
    alignRow.append(seg);
    return group.map(([how, icon, title, key]) => {
      const b = h('button', '', ICON[icon]);
      b.dataset.align = how;
      b.setAttribute('aria-label', title);
      b.dataset.title = `${title} (${key})`;
      b.addEventListener('click', () => ctx.align(how));
      seg.append(b);
      return b;
    });
  });
  fields.push(() => {
    const st = ctx.alignState();
    alignRow.hidden = !st.show;
    for (const b of alignBtns) {
      const spread = /space$/.test(b.dataset.align);
      const why = !st.ok ? st.why : spread && !st.spread ? 'Select three or more to distribute the spacing between them.' : null;
      b.disabled = !!why;
      b.title = why || b.dataset.title;
    }
  });

  // Selection colors (Figma's): every solid color used inside the selection (fills, text,
  // strokes, icons; not shadows or gradients), one row per color. Editing a row changes every
  // place that uses it, as one undo step. Shown when the selection covers more than one layer.
  const SC_MAX = 8;
  const SC_SCAN = 2000; // elements: enough for a whole page, bounded for huge ones
  let scAll = false; // "See all" opened
  const scList = h('div', 'sc-list');
  const scMore = h('button', 'sc-more');
  scMore.addEventListener('click', () => { scAll = !scAll; refreshSc(true); });
  const selColors = section('Selection colors', scList, scMore);
  const colorKey = (c) => { const p = parseColor(c); return p ? `${p.hex}|${Math.round(alphaOf(c) * 100)}` : null; };
  function scUses() {
    const roots = picked();
    const els = [];
    for (const r of roots) {
      els.push(r);
      for (const d of r.querySelectorAll('*')) { if (els.length >= SC_SCAN) break; els.push(d); }
    }
    const uses = [];
    const add = (el, kind, c) => { if (c && !isClear(c) && colorKey(c)) uses.push({ el, kind, c }); };
    for (const el of new Set(els)) {
      if (NOT_LAYER.test(el.tagName) || el.closest('edit-mode-root')) continue;
      if (el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg') continue; // an icon counts once, at its <svg>
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      if (el.tagName.toLowerCase() === 'svg') {
        const shape = el.querySelector('path, circle, rect, line, polyline, polygon, ellipse') || el;
        const ss = getComputedStyle(shape);
        // currentColor icons (Lucide and most sets): their color is the svg's text color
        const pick = (v) => (v !== 'none' && !/^url/.test(v) ? v : null);
        const st = pick(ss.stroke), fi = pick(ss.fill);
        if (st && st === cs.color || fi && fi === cs.color) add(el, 'color', cs.color);
        if (st && st !== cs.color) add(el, 'stroke', st);
        if (fi && fi !== cs.color) add(el, 'fill', fi);
        continue;
      }
      add(el, 'background-color', cs.backgroundColor);
      if (hasText(el) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) add(el, 'color', cs.color);
      const st = strokeOf(cs);
      if (st) add(el, 'stroke-css', st.color);
    }
    const groups = new Map();
    for (const u of uses) {
      const k = colorKey(u.c);
      if (!groups.has(k)) groups.set(k, { key: k, color: u.c, uses: [] });
      groups.get(k).uses.push(u);
    }
    return [...groups.values()].sort((a, b) => b.uses.length - a.uses.length);
  }
  // Change every use in one group to `value` (a color, or a function of the old one).
  function scWrite(uses, value, group) {
    const scope = many() ? 'one' : state.scope;
    const r = changes.batch(group, () => {
      for (const u of uses) {
        if (!u.el.isConnected) continue;
        withEl(u.el, () => {
          const v = typeof value === 'function' ? value(u.c) : value;
          if (u.kind === 'stroke-css') strokeSet('color', v, strokeOf(getComputedStyle(u.el)));
          else apply(u.kind, v);
        }, scope);
      }
    });
    ctx.onEdit();
    return r;
  }
  const scRows = [];
  function scRow() {
    const id = ++fieldSeq;
    const row = h('div', 'crow');
    const wrap = h('div', 'field color');
    const sw = h('button', 'swatch', '<i></i>');
    sw.title = 'Pick a color';
    const hex = h('input', 'hex');
    hex.spellcheck = false;
    hex.setAttribute('aria-label', 'Selection color');
    const alpha = h('input', 'alpha');
    alpha.setAttribute('aria-label', 'Selection color opacity');
    const count = h('span', 'sc-n');
    wrap.append(sw, hex, h('span', 'divider'), alpha, h('span', 'sfx', '%'));
    row.append(wrap, count);
    const r = { row, group: null };
    let pg = 0;
    sw.addEventListener('pointerdown', () => pg++);
    sw.addEventListener('click', () => {
      const uses = r.group.uses; // the same places all through a picker drag, even as their color changes
      colorPop(sw, r.group.color, (v, from) => scWrite(uses, v, from === 'picker' ? `sc${id}:picker:${pg}` : null));
    });
    let held = null; // the places being edited while a field has the focus
    hex.addEventListener('focus', () => { held = r.group.uses; hex.select(); });
    hex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') hex.blur();
      else if (e.key === 'Escape') { paint(r, true); hex.blur(); }
    });
    hex.addEventListener('change', () => {
      const v = colorFromText(hex.value);
      wrap.classList.toggle('bad', !v);
      if (v) scWrite(held || r.group.uses, alphaOf(v) < 1 ? v : (old) => withAlpha(v, alphaOf(old)));
    });
    hex.addEventListener('blur', () => { held = null; });
    let ag = null;
    alpha.addEventListener('focus', () => { held = r.group.uses; ag = `sc${id}:a:${Date.now()}`; alpha.select(); });
    alpha.addEventListener('blur', () => { held = null; refreshSc(true); });
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
      scWrite(held || r.group.uses, (old) => withAlpha(old, a), ag);
    });
    Object.assign(r, { sw, hex, alpha, wrap, count });
    return r;
  }
  function paint(r, force) {
    const c = r.group.color;
    r.sw.firstChild.style.background = c;
    if (force || shadow.activeElement !== r.hex) r.hex.value = (parseColor(c)?.hex || c).replace(/^#/, '');
    if (force || shadow.activeElement !== r.alpha) r.alpha.value = Math.round(alphaOf(c) * 100);
    r.count.textContent = r.group.uses.length;
    r.count.title = `Used in ${r.group.uses.length} place${r.group.uses.length === 1 ? '' : 's'}`;
    r.wrap.classList.remove('bad');
  }
  // One layer that holds nothing else has no "selection colors": Fill and Stroke already show them.
  const scApplies = () => !range && (many() || picked().some((x) => x.firstElementChild && !(x.tagName.toLowerCase() === 'svg')));
  function refreshSc(force) {
    if (selColors.hidden) return;
    const editing = scRows.some((r) => r.row.isConnected && [r.hex, r.alpha].includes(shadow.activeElement));
    if (editing && !force) return; // don't reshuffle the rows under the field being typed in
    const groups = scUses();
    selColors.hidden = !groups.length;
    const shown = scAll ? groups : groups.slice(0, SC_MAX);
    while (scRows.length < shown.length) scRows.push(scRow());
    scList.replaceChildren(...shown.map((g, i) => { scRows[i].group = g; paint(scRows[i], force); return scRows[i].row; }));
    scMore.hidden = groups.length <= SC_MAX;
    scMore.textContent = scAll ? 'Show less' : `See all ${groups.length}`;
  }
  fields.push(refreshSc);

  const body = h('div', 'pb');
  body.append(alignRow, multi, layout, constraints, appearance, typography, fill, strokeSec, effects, selColors);
  // Nothing selected: the canvas's own colour (Figma shows the page's Background here).
  // Edit Mode's, not the app's: remembered per browser, never pushed, no undo step.
  const bgWrap = h('div', 'field color');
  const bgSw = h('button', 'swatch', '<i></i>');
  bgSw.title = 'Pick a color';
  const bgHex = h('input', 'hex');
  bgHex.spellcheck = false;
  bgHex.setAttribute('aria-label', 'Canvas background');
  bgWrap.append(bgSw, bgHex);
  const bgReset = h('button', 'icon', ICON.x);
  bgReset.title = 'Back to the default grey';
  bgReset.setAttribute('aria-label', 'Reset canvas background');
  const bgRow = h('div', 'crow');
  bgRow.append(bgWrap, bgReset);
  const canvasSec = section('Canvas', h('div', 'cap', 'Background'), bgRow);
  canvasSec.classList.add('canvas-bg');
  const paintBg = () => {
    const c = ctx.canvasBackground();
    bgSw.firstChild.style.background = c;
    if (shadow.activeElement !== bgHex) bgHex.value = (parseColor(c)?.hex || c).replace(/^#/, '');
    bgReset.style.visibility = c.toLowerCase() === ctx.defaultCanvasBackground() ? 'hidden' : '';
    bgWrap.classList.remove('bad');
  };
  const setBg = (c) => { ctx.setCanvasBackground(c); paintBg(); };
  bgSw.addEventListener('click', () => colorPop(bgSw, ctx.canvasBackground(), (v) => setBg(parseColor(v)?.hex || v), null, { alpha: false }));
  bgHex.addEventListener('focus', () => bgHex.select());
  bgHex.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') bgHex.blur();
    else if (e.key === 'Escape') { paintBg(); bgHex.blur(); }
  });
  bgHex.addEventListener('change', () => {
    const v = colorFromText(bgHex.value);
    if (v) setBg(parseColor(v)?.hex || v); else bgWrap.classList.add('bad');
  });
  bgReset.addEventListener('click', () => setBg(null));

  column.append(header, body, footer, canvasSec);
  column.hidden = true;

  // ---------- Public ----------
  function show(el) {
    closePop();
    if (el !== shownEl) { li = 0; layerSig = null; shownEl = el; } // a new selection starts at its top fill
    multi.hidden = !many() || !!range;
    header.hidden = body.hidden = footer.hidden = !el;
    canvasSec.hidden = !!el;
    if (range && el) {
      column.hidden = false;
      const words = range.text().replace(/\s+/g, ' ').trim();
      nameEl.textContent = nameEl.title = 'Selected words';
      metaEl.textContent = `“${words.length > 28 ? words.slice(0, 28) + '…' : words}”`;
      metaEl.title = words;
      openBtn.hidden = copyBtn.hidden = scopeSeg.hidden = true;
      refresh(true);
      return;
    }
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
    column.hidden = !el && !state.on; // appears instantly; with nothing selected (Edit Mode on) it shows the canvas colour
    if (!el) return paintBg();

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

    const placed = placedOf(el);
    if (onCanvas(el) || placed) { // on the design canvas (or a design moved onto the page): its kind (or the copy's tag) and where it lives
      const kind = { frame: 'Frame', rectangle: 'Rectangle', ellipse: 'Ellipse', text: 'Text', image: 'Image', group: 'Group' }[el.dataset.emKind];
      nameEl.textContent = nameEl.title = el.dataset.emName || kind || describe(el);
      const from = parseSrc((el.dataset.emFrom || '').replace(/#\d+$/, ''));
      metaEl.textContent = placed ? 'design on the page · not in code yet'
        : from ? `copy of ${from.file.split('/').pop()}:${from.line} · on the canvas` : 'on the canvas · not pushed';
      metaEl.title = placed ? 'Moved here from the canvas. Push builds it here; drag it back to the canvas to take it out.'
        : 'The design canvas beside your page. It\'s saved with the project, and never part of Push.';
    }

    openBtn.hidden = copyBtn.hidden = !src || !!isNew || onCanvas(el) || !!placed;
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
    for (const sec of [layout, appearance, fill, strokeSec, effects]) sec.hidden = !!range; // selected words: only Text
    selColors.hidden = !scApplies(); // refreshSc hides it again when there are no colors
    textAlignRow.hidden = textBoxRow.hidden = !!range;
    if (range) { typography.hidden = false; constraints.hidden = true; return; }
    const cs = getComputedStyle(el);
    const els = picked();
    const all = (f) => els.every((x) => withEl(x, () => f(x, getComputedStyle(x))));
    const any = (f) => els.some((x) => withEl(x, () => f(x, getComputedStyle(x))));
    typography.hidden = !all((x) => /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName) || isText(x) ||
      [...x.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()));
    gapRow.hidden = !all((x, s) => /flex|grid/.test(s.display));
    clipRow.hidden = !all((x) => x.children.length > 0 || x.dataset.emKind === 'frame'); // things that can hold content
    const placed = all((x) => isPlaced(x));
    arrangeLimits(any);
    posRow.hidden = !placed;
    pinBtn.hidden = !all((x) => ctx.inAutoLayout(x));
    constraints.hidden = !placed || !all((x) => !x.parentElement?.hasAttribute('data-em-canvas')); // top-level things have no frame to follow
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
    empty(fill, fillAdd, !solid && !any((x) => bgModel(x).length > 0));
    fillAdd.hidden = false; // fills stack: + always adds one on top
    empty(strokeSec, strokeAdd, !any((x, s) => strokeOf(s) || strokeHidden()));
    effects.classList.toggle('empty', !any((x) => fxModel(x).length > 0)); // + always shows: effects stack
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
    // The rotate zones outside the corners (CSS degrees, clockwise).
    rotationOf: (el) => rotOf(getComputedStyle(el)),
    rotate: (el, scope, cssDeg) => withEl(el, () => setRot(cssDeg), scope),
    // Text and the resize handles (Figma): dragging a side of one-line text lets it wrap
    // (Auto height); double-clicking a side or the bottom fits it (Auto width / Auto height).
    textWrap: (el, scope) => withEl(el, () => wrapText(), scope),
    textFit: (el, mode) => act(null, () => { if (isText(sel())) setTextResizing(mode); }),
    textResizingOf: (el) => withEl(el, () => textResizing(el)), // for tests
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
    // Words selected while typing (10c): { read, write, text } from main.js, or null.
    setRange: (r) => {
      const was = !!range;
      range = r;
      if (!!r !== was) show(state.selected);
      else if (r) { metaEl.textContent = `“${r.text().replace(/\s+/g, ' ').trim().slice(0, 28)}”`; refresh(true); }
    },
    inRange: () => !!range,
    // ⌥⌘C / ⌥⌘V (Figma's copy / paste properties): the look, not the size or layout.
    copyStyle: () => {
      const el = sel();
      if (!el) return null;
      const cs = getComputedStyle(el);
      // Only what's there: no border → just its style ("none"), no image → no image settings.
      const skip = (p) => (/^border-(top|right|bottom|left)-(width|color)$/.test(p) && cs.getPropertyValue(p.replace(/-(width|color)$/, '-style')) === 'none')
        || (/^outline-(width|color|offset)$/.test(p) && cs.outlineStyle === 'none')
        || (/^background-(size|position|repeat)$/.test(p) && cs.backgroundImage === 'none');
      const props = [...STYLE_PROPS, ...(hasText(el) ? TEXT_PROPS : [])].filter((p) => !skip(p)); // text style only from text
      return { values: props.map((p) => [p, cs.getPropertyValue(p)]) };
    },
    pasteStyle: (clip) => {
      act(`paste-style:${Date.now()}`, () => {
        const cs = getComputedStyle(sel());
        const own = hasText(sel());
        for (const [p, v] of clip.values) {
          if (TEXT_PROPS.includes(p) && !own) continue; // text style only onto things with text
          if (cs.getPropertyValue(p) !== v) apply(p, v);
        }
      });
      refresh(true);
    },
    // Figma's text shortcuts on the selection (all of it must be text): bold, italic, underline,
    // font size up/down, text alignment. Returns false when nothing selected has text.
    textKey: (kind, arg) => {
      if (!sel() || typography.hidden) return false;
      act(null, () => {
        const cs = getComputedStyle(sel());
        if (kind === 'bold') {
          const on = picked().every((x) => num(getComputedStyle(x).fontWeight) >= 600);
          apply('font-weight', on ? '400' : '700');
          nearestStyle();
        } else if (kind === 'italic') {
          const on = picked().every((x) => /italic|oblique/.test(getComputedStyle(x).fontStyle));
          apply('font-style', on ? 'normal' : 'italic');
          nearestStyle();
        } else if (kind === 'underline') {
          const on = picked().every((x) => /underline/.test(getComputedStyle(x).textDecorationLine));
          apply('text-decoration-line', on ? 'none' : 'underline');
        } else if (kind === 'size') apply('font-size', `${Math.max(1, Math.round(num(cs.fontSize)) + arg)}px`);
        else if (kind === 'align') apply('text-align', arg);
      });
      refresh(true);
      return true;
    },
    closeMenu: closePop,
  };
}
