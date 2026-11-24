// Brutal QA on the realistic page (demo-app): random selections and edits
// all over Payloom, each followed by undo/redo checks. Run against the
// demo-app copy on port 5391.  SEED=n ITER=n to vary.
// Kept light on purpose (the user's laptop): few iterations, reduced motion
// (pauses the hero gradient), and a small undo budget. Ask before raising ITER.
import { chromium } from 'playwright-core';
const SEED = +(process.env.SEED ?? 7);
const ITER = +(process.env.ITER ?? 15);
const URL = process.env.URL ?? 'http://localhost:5391';
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('dialog', (d) => d.accept());
await p.goto(URL); await p.waitForSelector('.hero');
const clean = () => p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''));
const start = await clean();
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
await p.keyboard.press('Shift+Digit1'); await p.waitForTimeout(150); // the whole page in view

const results = [];
const fails = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`; results.push(line); if (!ok) { fails.push(line); console.error(line); } };
const wait = (ms = 60) => p.waitForTimeout(ms);
const st = (f, a) => p.evaluate(f, a);
const count = () => st(() => window.__editMode.changes.count);
const selName = () => st(() => { const x = window.__editMode.state.selected; return x ? `${x.tagName.toLowerCase()}${x.getAttribute('class') ? '.' + x.getAttribute('class').split(' ').join('.') : ''}` : null; });
const field = (label) => p.locator(`edit-mode-root input[aria-label="${label}"]`).first();
const btn = (label) => p.locator(`edit-mode-root button[aria-label="${label}"]`).first();
const visible = async (loc) => loc.isVisible().catch(() => false);
const typeInto = async (label, v) => { const f = field(label); if (!(await visible(f))) return false; await f.fill(String(v)); await f.press('Enter'); await wait(); return true; };

// Elements tagged from source, visible, with a point that hits them (or something inside).
const targets = await st(() => [...document.querySelectorAll('#root [data-src]')].map((e, i) => (e.dataset.qa = i, i)));
async function pointIn(i) {
  return st((i) => {
    const e = document.querySelector(`[data-qa="${i}"]`); if (!e) return null;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null;
    for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1], [0.3, 0.6]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > innerWidth - 270 || y > innerHeight - 110) continue; // not under the panel or toolbar
      const hitEl = document.elementsFromPoint(x, y).find((n) => n.tagName !== 'EDIT-MODE-ROOT');
      if (hitEl && (hitEl === e || e.contains(hitEl))) return [x, y];
    }
    return null;
  }, i);
}
async function selectSomething() {
  for (let k = 0; k < 20; k++) {
    const i = pick(targets); const pt = await pointIn(i); if (!pt) continue;
    await p.keyboard.down('Meta'); await p.mouse.click(...pt); await p.keyboard.up('Meta'); await wait();
    for (let up = Math.floor(rnd() * 3); up > 0; up--) await p.keyboard.press('Escape');
    await wait(40);
    if (await selName()) return pt;
  }
  return null;
}
async function otherPoint() { for (let k = 0; k < 20; k++) { const pt = await pointIn(pick(targets)); if (pt) return pt; } return null; }
async function drag(from, to, mods = []) {
  for (const m of mods) await p.keyboard.down(m);
  await p.mouse.move(...from); await p.mouse.down(); await p.mouse.move(from[0] + 6, from[1] + 6, { steps: 2 });
  await p.mouse.move(...to, { steps: 8 }); await p.mouse.up();
  for (const m of mods) await p.keyboard.up(m);
  await wait();
}

const ACTIONS = {
  width: () => typeInto('Width', Math.round(60 + rnd() * 300)),
  height: () => typeInto('Height', Math.round(20 + rnd() * 200)),
  fill: async () => { if (await visible(btn('Add fill'))) { await btn('Add fill').click(); await wait(); } return typeInto('Fill', pick(['FF3366', '00AA88', '000000'])); },
  opacity: () => typeInto('Opacity', pick([0, 40, 100])),
  radius: () => typeInto('Corner radius', pick([0, 12, 999])),
  padding: () => typeInto('padding left and right', pick([0, 20, 48])),
  gap: () => typeInto('Gap between children', pick(['0', '24', 'auto'])),
  stroke: async () => { if (await visible(btn('Add stroke'))) { await btn('Add stroke').click(); await wait(); } return typeInto('Stroke weight', 3); },
  shadow: async () => { if (await visible(btn('Add shadow'))) { await btn('Add shadow').click(); await wait(); } return typeInto('Shadow X offset', 8); },
  fontSize: () => typeInto('Font size', pick([12, 40])),
  delete: async () => { await p.keyboard.press('Backspace'); await wait(); return true; },
  duplicate: async () => { await p.keyboard.press('Meta+d'); await wait(); return true; },
  nudge: async () => { await p.keyboard.press(pick(['ArrowDown', 'ArrowRight', 'Shift+ArrowUp', 'ArrowLeft'])); await wait(); return true; },
  autoLayout: async () => { await p.keyboard.press('Shift+KeyA'); await wait(); return true; },
  group: async (pt) => { const o = await otherPoint(); if (!o) return false; await p.keyboard.down('Shift'); await p.mouse.click(...o); await p.keyboard.up('Shift'); await wait(); await p.keyboard.press('Meta+g'); await wait(); return true; },
  text: async () => { await p.keyboard.press('Enter'); await wait(); if (!(await st(() => !!window.__editMode.state.editing))) return false; await p.keyboard.type('QA'); await p.keyboard.press('Escape'); await wait(); return true; },
  drag: async (pt) => { const o = await otherPoint(); if (!o) return false; await drag(pt, o); return true; },
  altDrag: async (pt) => { const o = await otherPoint(); if (!o) return false; await drag(pt, o, ['Alt']); return true; },
  cutPaste: async () => { await p.keyboard.press('Meta+x'); await wait(); await p.keyboard.press('Meta+v'); await wait(); return true; },
  multiFill: async () => { const o = await otherPoint(); if (!o) return false; await p.keyboard.down('Shift'); await p.mouse.click(...o); await p.keyboard.up('Shift'); await wait(); return typeInto('Opacity', 50); },
  resizeHandle: async () => {
    const h = await st(() => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame:not(.passive) .handle[data-dir="se"]')?.getBoundingClientRect(); return r && r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; });
    if (!h) return false; await drag(h, [h[0] + 30, h[1] + 20]); return true;
  },
  // Choosing a sizing mode must read back as that mode.
  modes: async () => {
    for (const axis of ['Width', 'Height']) {
      const m = btn(`${axis} sizing`); if (!(await visible(m))) continue;
      await m.click(); await wait(40);
      const items = await p.locator('edit-mode-root .pop-item').allTextContents();
      await p.keyboard.press('Escape');
      for (const label of items) {
        await m.click(); await wait(40);
        await p.locator('edit-mode-root .pop-item', { hasText: label }).first().click(); await wait();
        const tag = await m.evaluate((b) => b.previousElementSibling.textContent);
        const want = label.startsWith('Hug') ? 'Hug' : label.startsWith('Fill') ? 'Fill' : '';
        if (tag !== want) check(`sizing mode reads back what you chose (${await selName()}, ${axis} → ${label})`, false, `reads "${tag || 'Fixed'}"`);
      }
    }
    return true;
  },
};
const NAMES = Object.keys(ACTIONS);
const tally = {};

for (let i = 0; i < ITER; i++) {
  let action = pick(NAMES);
  const pt = await selectSomething();
  if (!pt) continue;
  const who = await selName();
  const before = await clean();
  const errs0 = errors.length;
  let did = false;
  // An edit that doesn't apply here (no such field): try up to three others on the same selection.
  for (let tries = 0; !did && tries < 4; tries++) {
    if (tries) action = pick(NAMES);
    try { did = await ACTIONS[action](pt); } catch (e) { check(`${action} on ${who} runs`, false, e.message.split('\n')[0]); break; }
  }
  if (!did) { await p.keyboard.press('Escape'); continue; }
  tally[action] = (tally[action] ?? 0) + 1;
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  if (errors.length > errs0) check(`${action} on ${who}: no page errors`, false, errors.slice(errs0).join('; '));
  const n = await count();
  // undo/redo/undo round trip
  if (n) {
    const after = await clean();
    await p.keyboard.press('Meta+z'); await wait(); await p.keyboard.press('Meta+Shift+z'); await wait();
    const redone = await clean();
    if (redone !== after) check(`${action} on ${who}: redo gives back the same page`, false);
  }
  for (let k = 0; k < 12 && (await count()); k++) { await p.keyboard.press('Meta+z'); await wait(40); }
  const restored = await clean();
  if (restored !== before) {
    // find the first difference to make the failure readable
    let d = 0; while (d < restored.length && restored[d] === before[d]) d++;
    check(`${action} on ${who}: undo restores the page exactly`, false, `…${before.slice(Math.max(0, d - 60), d + 80)}… vs …${restored.slice(Math.max(0, d - 60), d + 80)}…`);
    await p.goto(URL); await p.waitForSelector('.hero'); // start over from a clean page
    await st(() => [...document.querySelectorAll('#root [data-src]')].forEach((e, i) => (e.dataset.qa = i)));
    await p.keyboard.press('Alt+KeyE'); await wait(250); await p.keyboard.press('Shift+Digit1'); await wait(150);
  }
}

await p.keyboard.press('Escape');
check('page matches the original after everything', (await clean()).replace(/ data-qa="\d+"/g, '') === start, '');
check('no page errors overall', !errors.length, [...new Set(errors)].slice(0, 5).join(' | '));
console.error('actions run:', JSON.stringify(tally));
await b.close();
console.log(`\n${results.length - fails.length}/${results.length} passed (${fails.length} failures)`);
process.exit(fails.length ? 1 : 0);
