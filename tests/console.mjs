// The Payloom Console (console-app/, a data-heavy enterprise screen) works
// with Edit Mode: Duplicate page copies all of it, the untouched copy lists
// nothing to push, and it matches the page pixel for pixel. Runs on a
// scratch copy of console-app/ served on 5393 (never the user's console-app:
// the test saves a canvas). COPY=<console copy dir>; leaves it without a canvas.
import { chromium } from 'playwright-core';
import { rmSync } from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the console copy folder');
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f, a) => p.evaluate(f, a);
await p.goto('http://localhost:5393'); await p.waitForSelector('.people-table');
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) })); await p.reload(); await p.waitForSelector('.people-table');
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(700);
const dup = await R(() => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector('.lbtn.dup').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const t0 = Date.now(); await p.mouse.click(...dup); await p.waitForTimeout(800); const ms = Date.now() - t0;
const r = await R(() => { const t = performance.now(); const d = window.__editMode.compareCanvas(); return { ms: Math.round(performance.now() - t), copies: d.map((x) => [x.copy.name, x.missing, x.changes.length, x.changes.slice(0, 5).map((c) => `${c.kind} ${c.element} ${c.property ?? ''}`)]), nodes: document.querySelectorAll('[data-em-canvas] *').length }; });
check(`Duplicate page copies the whole console (${r.nodes} nodes, ${ms}ms)`, r.nodes > 500 && ms < 3000);
check(`the untouched copy lists nothing to push (compared in ${r.ms}ms)`, r.copies.length === 1 && r.copies[0][1] === 0 && r.copies[0][2] === 0, JSON.stringify(r.copies));
// pixel compare: page vs copy at 100%, same screen spot
await p.keyboard.press('Escape'); await p.keyboard.press('Shift+Digit0'); await p.waitForTimeout(200);
const bringTo = async (sel, x, y) => { await p.mouse.move(720, 450); for (let i = 0; i < 12; i++) { const q = await R((s) => { const n = document.querySelector(s).getBoundingClientRect(); return { x: n.x, y: n.y }; }, sel); if (Math.abs(q.x - x) < 0.02 && Math.abs(q.y - y) < 0.02) return; await p.mouse.wheel(q.x - x, q.y - y); await p.waitForTimeout(60); } };
const shot = async () => { await R(() => { document.querySelector('edit-mode-root').style.visibility = 'hidden'; }); const s = (await p.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } })).toString('base64'); await R(() => { document.querySelector('edit-mode-root').style.visibility = ''; }); return s; };
await bringTo('#root', 0, 0); const a = await shot();
await bringTo('[data-em-canvas] > [data-em-name="Page copy"]', 0, 0); const c = await shot();
const d = await R(async ([a, c]) => {
  const load = async (b64) => { const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height); };
  const A = await load(a), C = await load(c); let bad = 0;
  for (let i = 0; i < A.data.length; i += 4) if (Math.abs(A.data[i] - C.data[i]) > 40 || Math.abs(A.data[i + 1] - C.data[i + 1]) > 40 || Math.abs(A.data[i + 2] - C.data[i + 2]) > 40) bad++;
  return bad / (A.data.length / 4);
}, [a, c]);
check('the copy looks like the page, pixel for pixel', d < 0.005, (d * 100).toFixed(2) + '% of pixels differ');

// Placing a new design in a nested app layout: near a card's top edge the
// picker offers "before the card" (not "inside it, before its toolbar").
await R(() => {
  const area = document.querySelector('[data-em-canvas]');
  const t = document.createElement('div'); t.dataset.emKind = 'text'; t.textContent = 'A note';
  t.style.cssText = 'position: absolute; left: 0px; top: 4000px; font-size: 14px;';
  area.append(t);
});
await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(300);
const place = await R(() => { const b = [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('li.design .seg button')].find((x) => x.dataset.mode === 'place').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
await p.mouse.click(...place); await p.waitForTimeout(200);
await p.keyboard.press('Shift+Digit0'); await p.waitForTimeout(200); // 100%
await bringTo('#root .people', 300, 400);
await p.mouse.move(600, 412); await p.mouse.move(620, 405); await p.waitForTimeout(120);
await p.mouse.click(620, 405); await p.waitForTimeout(300);
const spot = await R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('li.design .spot')?.textContent);
check('near the people card’s top edge, the spot is between the charts and the card (not inside the card)', spot === 'After “Charts” in “Content”', spot);
await p.keyboard.press('Escape'); await p.waitForTimeout(100);

// The same change to every instance (all four figures semibold) is one change for all of them.
await R(() => { const { changes } = window.__editMode; for (const v of document.querySelectorAll('[data-em-canvas] .stat-value')) changes.set(v, 'one', 'font-weight', '600'); });
const folded = await R(() => window.__editMode.compareCanvas().flatMap((r) => r.changes).filter((c) => c.property === 'font-weight').map((c) => `${c.element} ${c.scope}`));
check('making all four figures semibold is one change, for all of them', JSON.stringify(folded) === JSON.stringify(['div.stat-value all']), JSON.stringify(folded));
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(500);
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
rmSync(`${process.env.COPY}/.editmode/canvas.json`, { force: true }); // a fresh canvas next time (starter frame)
process.exit(fails ? 1 : 0);
