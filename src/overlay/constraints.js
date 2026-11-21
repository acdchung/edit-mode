// Things placed freely on the canvas (C4b–d): X/Y and Figma's constraints.
// A constraint says how something follows its frame when the frame is
// resized, per axis, and maps to CSS like this (horizontal; vertical is the
// same with top/bottom/height):
//   start  (Left)           left: X;  right: auto;  width: W
//   end    (Right)          right: R; left: auto;   width: W
//   both   (Left and right) left: X;  right: R;     width: auto
//   center (Center)         left: calc(50% + D);    translate: -50%
//   scale  (Scale)          left: X%; width: W%
// Every write keeps the element where it is on screen, and goes through
// `set(prop, value)` (changes.set), so it's one undo step with the rest.

import { box, onCanvas } from './util.js';

const AXES = {
  h: { start: 'left', end: 'right', size: 'width', pos: 'x', len: 'w', inner: 'clientWidth' },
  v: { start: 'top', end: 'bottom', size: 'height', pos: 'y', len: 'h', inner: 'clientHeight' },
};
export const CONSTRAINT_OPTIONS = {
  h: [['start', 'Left'], ['end', 'Right'], ['both', 'Left and right'], ['center', 'Center'], ['scale', 'Scale']],
  v: [['start', 'Top'], ['end', 'Bottom'], ['both', 'Top and bottom'], ['center', 'Center'], ['scale', 'Scale']],
};

// On the canvas and placed by position (inside a frame, or top-level).
export const isPlaced = (el) => !!el && onCanvas(el) && getComputedStyle(el).position === 'absolute';

// Read from the inline style, which is where the canvas keeps positions.
export function constraintOf(el, axis) {
  const a = AXES[axis];
  const st = el.style;
  const given = (p) => { const v = st.getPropertyValue(p).trim(); return v && v !== 'auto' ? v : null; };
  const s = given(a.start);
  const e = given(a.end);
  if (s && /50%/.test(s) && /calc/.test(s)) return 'center';
  if (s && e) return 'both';
  if (s && /%$/.test(s)) return 'scale';
  if (!s && e) return 'end';
  return 'start';
}

// Where it is in its frame (CSS px, from the frame's inner top-left corner), and the frame's inner size.
export function frameBox(el) {
  const p = el.parentElement;
  if (!p) return { x: 0, y: 0, w: 0, h: 0, pw: 0, ph: 0 }; // just removed (the panel can read it once more)
  const b = box(el);
  const pb = box(p);
  return { x: b.left - pb.left - p.clientLeft, y: b.top - pb.top - p.clientTop, w: b.width, h: b.height, pw: p.clientWidth, ph: p.clientHeight };
}

const px = (n) => `${Math.round(n * 10) / 10}px`;
const pct = (n) => `${Math.round(n * 10000) / 100}%`;

// Put `el` at `to` ({ x, y, w, h }, any of them; the rest stay as they are)
// under constraints `cons` ({ h, v }; default: its current ones). A size is
// only written when it's given or when the constraint needs one.
export function placeBox(el, set, to = {}, cons = {}) {
  const now = frameBox(el);
  const write = (p, v) => { if (el.style.getPropertyValue(p) !== v) set(p, v); };
  const translate = [];
  for (const axis of ['h', 'v']) {
    const a = AXES[axis];
    const was = constraintOf(el, axis);
    const c = cons[axis] ?? was;
    const pos = to[a.pos] ?? now[a.pos];
    const sizeGiven = to[a.len] != null;
    const len = to[a.len] ?? now[a.len];
    const P = axis === 'h' ? now.pw : now.ph;
    // A size that came from the old constraint (auto or %) becomes pixels again.
    const needSize = sizeGiven || was === 'both' || was === 'scale';
    if (c === 'start') {
      write(a.start, px(pos)); write(a.end, 'auto');
      if (needSize) write(a.size, px(len));
    } else if (c === 'end') {
      write(a.start, 'auto'); write(a.end, px(P - pos - len));
      if (needSize) write(a.size, px(len));
    } else if (c === 'both') {
      write(a.start, px(pos)); write(a.end, px(P - pos - len)); write(a.size, 'auto');
    } else if (c === 'center') {
      write(a.start, `calc(50% + ${px(pos + len / 2 - P / 2)})`); write(a.end, 'auto');
      if (needSize) write(a.size, px(len));
    } else if (c === 'scale') {
      write(a.start, pct(P ? pos / P : 0)); write(a.end, 'auto'); write(a.size, pct(P ? len / P : 0));
    }
    translate.push(c === 'center' ? '-50%' : '0px');
  }
  const t = translate.join(' ');
  if (t !== '0px 0px') write('translate', t);
  else if (el.style.getPropertyValue('translate')) write('translate', 'none');
}
