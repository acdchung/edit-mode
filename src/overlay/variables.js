// Color variables (2026-11-25): the app's own :root color variables, plus ones the
// designer adds or changes here, like Figma's local variables. Until Push writes
// them into the code they live in .editmode/variables.json and in a <style> on the
// page, so everything that uses them (var(--name)) updates at once.

import { resolveColor } from './util.js';

const ROOT_RULE = /(^|,)\s*(:root|html)\s*(,|$)/;
const NOT_COLOR = /^-?[\d.]+(px|rem|em|%)?$/;
const URL = '/@edit-mode/variables';

export function createVariables({ onChange }) {
  let set = {}; // name → value: pending (new, or changed from the code)
  let added = []; // the new ones (not in the code yet), in the order they were made
  const style = document.createElement('style');
  style.dataset.emVars = '';

  function paint() {
    const entries = Object.entries(set);
    style.textContent = entries.length ? `:root { ${entries.map(([k, v]) => `${k}: ${v};`).join(' ')} }` : '';
    if (!style.isConnected) document.head.append(style);
  }
  let timer = 0;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fetch(URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set, added }) }).catch(() => {});
    }, 250);
  };
  const changed = () => { paint(); save(); onChange(); };

  async function load() {
    try {
      const d = await (await fetch(URL)).json();
      set = d.set || {};
      added = d.added || [];
    } catch {}
    paint();
    onChange();
  }

  // The project's own :root variables and their values in the code (ours left out).
  function inCode() {
    const out = new Map();
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode === style) continue;
      let rules;
      try { rules = sheet.cssRules; } catch { continue; } // cross-origin
      for (const rule of rules) {
        if (!rule.selectorText || !ROOT_RULE.test(rule.selectorText)) continue;
        for (const prop of rule.style) if (prop.startsWith('--')) out.set(prop, rule.style.getPropertyValue(prop).trim());
      }
    }
    return out;
  }
  const isColor = (raw) => !!raw && !NOT_COLOR.test(raw) && CSS.supports('color', raw);

  // Every color variable: { name, value, rgb, code (its value in the code, or null), state: 'code' | 'changed' | 'new' }.
  function list() {
    const code = inCode();
    const out = [];
    const root = getComputedStyle(document.documentElement);
    for (const name of [...code.keys(), ...added.filter((n) => !code.has(n))]) {
      const value = set[name] ?? code.get(name);
      if (!isColor(value)) continue;
      const resolved = root.getPropertyValue(name).trim() || value;
      out.push({ name, value, rgb: resolveColor(resolved), code: code.get(name) ?? null,
                 state: added.includes(name) ? 'new' : name in set ? 'changed' : 'code' });
    }
    return out;
  }

  // Something on the page or the canvas uses it (an edit's preview, a canvas design).
  const inUse = (name) => !!document.querySelector(`[style*="var(${CSS.escape(name)})"]`);
  const clean = (text) => {
    const s = String(text).trim().toLowerCase().replace(/^-+/, '').replace(/[\s_/]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+$/, '');
    return s ? `--${s}` : null;
  };
  const taken = (name) => inCode().has(name) || added.includes(name);

  function add(value = '#d9d9d9') {
    let i = added.length + 1;
    while (taken(`--color-${i}`)) i++;
    const name = `--color-${i}`;
    added.push(name);
    set[name] = value;
    changed();
    return name;
  }
  function setValue(name, value) {
    if (!value || value.replace(/\s/g, '') === `var(${name})`) return; // a variable can't be itself
    const code = inCode().get(name);
    if (!added.includes(name) && code != null && value.trim() === code) delete set[name];
    else set[name] = value;
    changed();
  }
  // Renaming and removing are for new variables nothing uses yet: the edits using one
  // point at its name, so they'd lose their color.
  function rename(name, text) {
    const to = clean(text);
    if (!to || to === name) return name;
    if (!added.includes(name) || inUse(name) || taken(to)) return null;
    added[added.indexOf(name)] = to;
    set[to] = set[name];
    delete set[name];
    changed();
    return to;
  }
  function remove(name) {
    if (added.includes(name)) {
      if (inUse(name)) return false;
      added = added.filter((n) => n !== name);
    }
    delete set[name]; // a changed one goes back to the code's value
    changed();
    return true;
  }

  // For Push: what goes into the code.
  const pending = () => Object.entries(set).map(([name, value]) => ({
    kind: 'variable', name, value, added: added.includes(name), ...(added.includes(name) ? {} : { from: inCode().get(name) ?? null }),
  }));

  const hide = () => style.remove();
  const count = () => Object.keys(set).length;

  return { load, hide, list, add, setValue, rename, remove, inUse, pending, count };
}
