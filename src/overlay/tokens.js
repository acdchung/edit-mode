// Collects values already used on the page (colors, CSS variables, font sizes,
// spacing, radii, fonts) to offer as quick picks in the panel.

import { num, resolveColor } from './util.js';

const MAX_ELEMENTS = 4000;

export function collectTokens() {
  const colors = new Map();
  const fontSizes = new Map();
  const spacing = new Map();
  const radii = new Map();
  const fonts = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const bumpPx = (m, v) => {
    const n = num(v);
    if (n > 0 && String(v).endsWith('px')) bump(m, Math.round(n * 10) / 10);
  };

  const els = document.body ? document.body.querySelectorAll('*') : [];
  for (let i = 0; i < els.length && i < MAX_ELEMENTS; i++) {
    const el = els[i];
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

    if (hasText) {
      bump(colors, cs.color);
      bumpPx(fontSizes, cs.fontSize);
      bump(fonts, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
    }
    if (!isClear(cs.backgroundColor)) bump(colors, cs.backgroundColor);
    if (num(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') bump(colors, cs.borderTopColor);
    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                     'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'rowGap', 'columnGap']) {
      bumpPx(spacing, cs[p]);
    }
    bumpPx(radii, cs.borderTopLeftRadius);
  }

  // Color variables defined on :root (e.g. --accent), shown first with their names.
  const vars = [];
  const seen = new Set();
  for (const name of rootVariables()) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw || /^-?[\d.]+(px|rem|em|%)?$/.test(raw) || !CSS.supports('color', raw)) continue;
    const rgb = resolveColor(raw);
    vars.push({ name, value: `var(${name})`, rgb });
    seen.add(rgb);
  }

  const byUse = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const byValue = (m) => [...m.keys()].sort((a, b) => a - b);

  return {
    colorVars: vars,
    colors: byUse(colors).filter((c) => !seen.has(c) && !isClear(c)).slice(0, 16),
    fontSizes: byValue(fontSizes),
    spacing: byValue(spacing),
    radii: byValue(radii),
    fonts: byUse(fonts).slice(0, 8),
  };
}

const isClear = (c) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);

function rootVariables() {
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules; // throws for cross-origin sheets
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule.selectorText && /(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText)) {
        for (const prop of rule.style) if (prop.startsWith('--')) names.add(prop);
      }
    }
  }
  return names;
}
