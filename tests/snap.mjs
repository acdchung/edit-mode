// Snapping (Figma's smart guides) on the canvas: resizing the starter frame
// snaps its height to the page's (with the page outlined as the match);
// ⌃ resizes freely; a moved rectangle's edge snaps to another's; a resized
// width snaps to another's width; the red guides go away afterwards. Runs on
// the demo copy (5391). COPY=<demo copy dir>; leaves its canvas empty.
import { chromium } from 'playwright-core';
import { rmSync, writeFileSync } from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
const COPY = process.env.COPY;
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
rmSync(`${COPY}/.editmode/canvas.json`, { force: true }); // a fresh canvas: one page-wide "Page" frame
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(700);
const S = (fn) => R(([src]) => new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot), [fn.toString()]);
const FRAME = '[data-em-canvas] > [data-em-name="Page"]';
const handle = (dir) => S(`(root) => { const r = root.querySelector('.handle[data-dir="${dir}"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
const guides = () => S(`(root) => ({ lines: root.querySelectorAll('.guides .sguide').length, boxes: root.querySelectorAll('.guides .sbox').length })`);
const z = () => R(() => { const a = document.querySelector('[data-em-canvas]'); return a.getBoundingClientRect().width / a.offsetWidth; });

// ---------- Resize the starter frame to the page's height ----------
await p.keyboard.press('Shift+Digit1'); await wait(300); // fit page and canvas
await R((s) => window.__editMode.select(document.querySelector(s)), FRAME); await wait(150);
const pageH = await R(() => document.body.offsetHeight);
const frameH0 = await R((s) => document.querySelector(s).offsetHeight, FRAME);
check('the starter frame is shorter than the page to begin with', frameH0 < pageH - 20, `${frameH0} vs ${pageH}`);
let zz = await z();
let [hx, hy] = await handle('s');
const target = hy + (pageH - frameH0) * zz + 4; // 4 screen px past the page's bottom
await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx, hy + 20, { steps: 3 }); await p.mouse.move(hx, target, { steps: 6 }); await wait(60);
const during = await guides();
await p.mouse.up(); await wait(150);
let frameH = await R((s) => document.querySelector(s).offsetHeight, FRAME);
check('dragging the bottom edge near the page’s height snaps to it exactly', frameH === pageH, `${frameH} vs page ${pageH}`);
check('…showing a red guide and the page outlined as the match while dragging', during.lines > 0 || during.boxes > 0, JSON.stringify(during));
check('…and the guides are gone after letting go', (await guides()).lines === 0 && (await guides()).boxes === 0);

// ⌃ held: no snapping.
await p.keyboard.press('Meta+z'); await wait(150);
await R((s) => window.__editMode.select(document.querySelector(s)), FRAME); await wait(150);
[hx, hy] = await handle('s');
await p.keyboard.down('Control');
await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx, hy + 20, { steps: 3 }); await p.mouse.move(hx, target, { steps: 6 }); await wait(60);
const free = await guides();
await p.mouse.up(); await p.keyboard.up('Control'); await wait(150);
frameH = await R((s) => document.querySelector(s).offsetHeight, FRAME);
check('with ⌃ held it resizes freely (no snap, no guides)', frameH !== pageH && Math.abs(frameH - pageH) < 40 && free.lines === 0 && free.boxes === 0, `${frameH} vs ${pageH}, ${JSON.stringify(free)}`);
await p.keyboard.press('Meta+z'); await wait(150);

// ---------- Move: an edge snaps to another's ----------
await R((s) => {
  const f = document.querySelector(s);
  const mk = (name, css) => { const d = document.createElement('div'); d.dataset.emKind = 'rectangle'; d.dataset.emName = name; d.style.cssText = css; f.append(d); };
  mk('A', 'position: absolute; left: 200px; top: 120px; width: 160px; height: 100px; background-color: #5b4cf5;');
  mk('B', 'position: absolute; left: 520px; top: 320px; width: 120px; height: 80px; background-color: #12a26a;');
}, FRAME);
await R((s) => window.__editMode.select(document.querySelector(`${s} [data-em-name="B"]`)), FRAME); await wait(100);
await p.keyboard.press('Shift+Digit1'); await wait(300); // fit everything
zz = await z();
const rect = (n) => R(([s, n]) => { const r = document.querySelector(`${s} [data-em-name="${n}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, [FRAME, n]);
let A = await rect('A'), B = await rect('B');
// Drag B so its left edge lands 2 screen px right of A's left edge (nearer than any other line: centres would win otherwise, as in Figma).
const from = [B.x + B.w / 2, B.y + B.h / 2];
const to = [from[0] + (A.x - B.x) + 2, from[1] - 60];
await p.mouse.move(...from); await p.mouse.down(); await p.mouse.move(from[0] + 10, from[1] - 5, { steps: 3 }); await p.mouse.move(...to, { steps: 8 }); await wait(60);
const moving = await guides();
await p.mouse.up(); await wait(200);
const left = (n) => R(([s, n]) => document.querySelector(`${s} [data-em-name="${n}"]`).style.left, [FRAME, n]);
check('a moved rectangle’s left edge snaps to the other’s left edge', (await left('B')) === (await left('A')), `${await left('B')} vs ${await left('A')} (zoom ${zz.toFixed(2)})`);
check('…with a guide while moving', moving.lines > 0, JSON.stringify(moving));

// ---------- Resize: a width snaps to another's width ----------
await R((s) => window.__editMode.select(document.querySelector(`${s} [data-em-name="B"]`)), FRAME); await wait(150);
A = await rect('A'); B = await rect('B');
[hx, hy] = await handle('e');
await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx + 10, hy, { steps: 3 }); await p.mouse.move(hx + (A.w - B.w) - 3, hy + 40, { steps: 6 }); await wait(60);
await p.mouse.up(); await wait(150);
const width = (n) => R(([s, n]) => document.querySelector(`${s} [data-em-name="${n}"]`).offsetWidth, [FRAME, n]);
check('resizing near another’s width matches it exactly', (await width('B')) === (await width('A')), `${await width('B')} vs ${await width('A')}`);
check('no page errors', errors.length === 0, errors.join(' | '));

await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await wait(600);
await b.close();
writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
