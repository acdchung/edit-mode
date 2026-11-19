export const ATTR = 'data-src';

// Canvas zoom (see canvas.js). Screen pixels ÷ z = CSS pixels.
export const view = { z: 1 };

// An element's box in CSS pixels, unaffected by the canvas zoom. Use it for
// sizes and distances; use getBoundingClientRect for drawing on screen.
export function box(el) {
  const r = el.getBoundingClientRect();
  const z = view.z;
  return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z };
}

export const fmt = (n) => String(Math.round(n * 10) / 10);
export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const isNumber = (s) => /^-?\d*\.?\d+$/.test(s);

export function parseSrc(value) {
  const m = /^(.*):(\d+):(\d+)$/.exec(value || '');
  return m ? { file: m[1], line: +m[2], col: +m[3] } : null;
}

export const describe = (el) =>
  el.tagName.toLowerCase() + [...el.classList].map((c) => '.' + c).join('');

export const sameSource = (el) => {
  const src = el.getAttribute(ATTR);
  return src ? [...document.querySelectorAll(`[${ATTR}="${CSS.escape(src)}"]`)] : [el];
};

// "rgb(226, 87, 43)" / "rgba(0, 0, 0, 0.5)" → { hex: "#E2572B", a: 0.5 }
export function parseColor(color) {
  const m = /rgba?\(([^)]+)\)/.exec(color || '');
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  const hex = '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  return { hex: hex.toUpperCase(), a };
}

// How a computed color is shown in a field.
export function colorText(color) {
  const c = parseColor(color);
  if (!c) return color;
  if (c.a === 0) return 'None';
  return c.a === 1 ? c.hex : `${c.hex} ${Math.round(c.a * 100)}%`;
}

// What the user typed in a color field → a CSS color, or null if invalid.
export function colorFromText(text) {
  let t = text.trim();
  if (/^none$/i.test(t)) return 'transparent';
  const pct = /^(#?[0-9a-f]{3,8})\s+(\d{1,3})%$/i.exec(t);
  if (pct) {
    const hex = pct[1].startsWith('#') ? pct[1] : '#' + pct[1];
    const c = parseColor(resolveColor(hex));
    if (!c) return null;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${Math.min(100, +pct[2]) / 100})`;
  }
  if (/^[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(t)) t = '#' + t;
  return CSS.supports('color', t) ? t : null;
}

// Turn any CSS color (incl. var(--x)) into its computed rgb() string.
let probe;
export function resolveColor(value) {
  if (!probe) {
    probe = document.createElement('i');
    probe.style.display = 'none';
  }
  document.documentElement.appendChild(probe);
  probe.style.color = '';
  probe.style.color = value;
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
}

export function svg(path, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true">${path}</svg>`;
}
