// Canvas step C4a: drag anything anywhere on the canvas, like Figma. Into a
// frame (kept where you see it; into the flow of an auto-layout frame), out
// to the empty canvas, between frames, several at once, from Layers too.
// Things keep their look wherever they go; each move is one ⌘Z. Runs on the
// demo copy (5391). COPY=<demo copy dir>; leaves its canvas empty.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
writeFileSync(`${process.env.COPY}/.editmode/canvas.json`, '{"html":""}'); // an empty canvas
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(600);

// The board: frame A (no auto layout) holding rectangle R; frame B (auto
// layout, column) holding b1 and b2. Built directly; the drags are the test.
await R(() => {
  const area = document.querySelector('[data-em-canvas]');
  const mk = (kind, css, name) => { const d = document.createElement('div'); d.dataset.emKind = kind; if (name) d.dataset.emName = name; d.style.cssText = css; return d; };
  const A = mk('frame', 'position: absolute; left: 0px; top: 0px; width: 400px; height: 300px; background-color: #fff; overflow: hidden;', 'A');
  const r = mk('rectangle', 'position: absolute; left: 20px; top: 20px; width: 50px; height: 50px; background-color: #e2572b;', 'R');
  A.append(r);
  const B = mk('frame', 'position: absolute; left: 480px; top: 0px; width: 200px; background-color: #fff; display: flex; flex-direction: column; gap: 10px; padding: 10px;', 'B');
  for (const n of ['b1', 'b2']) B.append(mk('rectangle', 'width: 100px; height: 40px; flex-shrink: 0; background-color: #0d99ff;', n));
  area.append(A, B);
});
await wait(100);
// Bring the board into view, at 100%.
await R(() => { const a = document.querySelector('[data-em-canvas]'); window.__editMode.select(a.firstElementChild); });
await p.keyboard.press('Shift+Digit2'); await wait(200);
await p.keyboard.press('Shift+Digit0'); await wait(200);
await R(() => window.__editMode.select(null));
const q = (name) => `[data-em-canvas] [data-em-name="${name}"]`;
const rect = (name) => R((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, q(name));
const info = (name) => R((s) => { const n = document.querySelector(s); const cs = getComputedStyle(n); return { parent: n.parentElement.dataset.emName || (n.parentElement.hasAttribute('data-em-canvas') ? 'canvas' : n.parentElement.tagName), index: [...n.parentElement.children].indexOf(n), pos: cs.position, left: cs.left, top: cs.top, w: n.offsetWidth, h: n.offsetHeight }; }, q(name));
const board = () => R(() => document.querySelector('[data-em-canvas]').innerHTML.replace(/ style=""/g, ''));
const pick = (name) => R((s) => window.__editMode.select(document.querySelector(s)), q(name));
async function drag(from, to, mid) {
  await p.mouse.move(from[0], from[1]); await p.mouse.down();
  await p.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 });
  await p.mouse.move(to[0], to[1], { steps: 4 }); await wait(60);
  const during = mid ? await mid() : null;
  await p.mouse.up(); await wait(150);
  return during;
}
const lineShown = () => R(() => !document.querySelector('edit-mode-root').shadowRoot.querySelector('.insert').hidden);

// ---------- Free frame → auto-layout frame ----------
let start = await board();
await pick('R');
let r0 = await rect('R'); const b1 = await rect('b1'); const b2 = await rect('b2');
const during = await drag([r0.cx, r0.cy], [b1.cx, (b1.y + b1.h + b2.y) / 2], async () => ({ line: await lineShown(), lifted: await R(() => document.querySelector('[data-em-name="R"]').parentElement.hasAttribute('data-em-canvas')) }));
check('while dragging, the line shows where it will go in the auto-layout frame', during.line);
check('while dragging, it’s lifted above everything (nothing clips it)', during.lifted);
let i = await info('R');
check('dropped into the auto-layout frame, between b1 and b2, in its flow', i.parent === 'B' && i.index === 1 && i.pos !== 'absolute', JSON.stringify(i));
check('it keeps its size', i.w === 50 && i.h === 50, JSON.stringify(i));
await p.keyboard.press('Meta+z'); await wait();
check('one ⌘Z puts it back exactly', (await board()) === start);

// ---------- Out of auto layout onto the empty canvas ----------
start = await board();
await pick('b1');
const bb = await rect('b1');
const target = [bb.cx + 30, bb.cy + 400];
await drag([bb.cx, bb.cy], target);
i = await info('b1');
const nb = await rect('b1');
check('dragged out of auto layout onto the empty canvas: top-level, placed freely', i.parent === 'canvas' && i.pos === 'absolute', JSON.stringify(i));
check('…exactly where it was let go, at its size', Math.abs(nb.cx - target[0]) <= 1 && Math.abs(nb.cy - target[1]) <= 1 && i.w === 100 && i.h === 40, JSON.stringify(nb));
check('the auto-layout frame closes up behind it', (await info('b2')).index === 0);
await p.keyboard.press('Meta+z'); await wait();
check('one ⌘Z puts it back exactly', (await board()) === start);

// ---------- Inside its own frame, and from frame to frame ----------
await pick('R'); r0 = await rect('R');
await drag([r0.cx, r0.cy], [r0.cx + 100, r0.cy + 60]);
i = await info('R');
check('inside its own frame it just moves (and stays in that frame)', i.parent === 'A' && i.left === '120px' && i.top === '80px', JSON.stringify(i));
r0 = await rect('R');
const out = [r0.cx + 40, r0.cy + 500];
await drag([r0.cx, r0.cy], out);
i = await info('R'); const nr = await rect('R');
check('out of a frame onto the canvas: top-level, where it was let go', i.parent === 'canvas' && Math.abs(nr.cx - out[0]) <= 1 && Math.abs(nr.cy - out[1]) <= 1, JSON.stringify(i));
const a = await rect('A');
await drag([nr.cx, nr.cy], [a.x + 300, a.y + 200], async () => R(() => { const t = document.querySelector('edit-mode-root').shadowRoot.querySelector('.target'); return !t.hidden; }));
i = await info('R');
check('back into a frame without auto layout: inside it, where it was let go', i.parent === 'A' && i.left === '275px' && i.top === '175px', JSON.stringify(i));

// ---------- What doesn't take children ----------
await pick('b2');
const b2r = await rect('b2'); r0 = await rect('R');
await drag([b2r.cx, b2r.cy], [r0.cx, r0.cy]);
i = await info('b2');
check('let go over a rectangle: it goes into the rectangle’s frame instead', i.parent === 'A' && i.pos === 'absolute', JSON.stringify(i));
await p.keyboard.press('Meta+z'); await wait();

// ---------- Several at once ----------
start = await board();
await pick('b1'); await p.keyboard.down('Shift');
const b2now = await rect('b2'); await p.mouse.click(b2now.cx, b2now.cy); await p.keyboard.up('Shift'); await wait();
const nSel = await R(() => window.__editMode.state.multi.length);
const b1now = await rect('b1');
const aa = await rect('A');
await drag([b1now.cx, b1now.cy], [aa.x + 100, aa.y + 150]);
const both = [await info('b1'), await info('b2')];
const [r1, r2] = [await rect('b1'), await rect('b2')];
check('several selected move together into a frame, keeping their arrangement', nSel === 2 && both.every((x) => x.parent === 'A' && x.pos === 'absolute') &&
  Math.abs(r2.y - r1.y - 50) <= 1 && Math.abs(r2.x - r1.x) <= 1, JSON.stringify({ nSel, both, d: [r2.x - r1.x, r2.y - r1.y] }));
check('the empty auto-layout frame stays', !!(await R((s) => document.querySelector(s), q('B'))));
await p.keyboard.press('Meta+z'); await wait();
check('one ⌘Z puts both back', (await board()) === start);

// ---------- A copy from the page keeps its look when moved out ----------
await R(() => window.__editMode.select(document.querySelector('.payslip'))); await wait();
await p.keyboard.press('Meta+c'); await wait();
await R(() => window.__editMode.select(null));
const empty = await rect('A');
await p.mouse.move(empty.x + 60, empty.y + empty.h + 120); await wait(); // over the empty canvas, below A
await p.keyboard.press('Meta+v'); await wait(400);
const txt = await R(() => {
  const copy = document.querySelector('[data-em-canvas] .payslip');
  const own = (n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
  const t = [...copy.querySelectorAll('*')].find((n) => own(n) && n.getBoundingClientRect().width > 20);
  t.dataset.emName = 'T';
  const cs = getComputedStyle(t);
  return { look: [cs.color, cs.fontFamily, cs.fontSize, cs.fontWeight, cs.lineHeight, cs.letterSpacing].join(' / '), w: t.offsetWidth };
});
start = await board();
await pick('T');
const tr = await rect('T');
await drag([tr.cx, tr.cy], [tr.cx + 360, tr.cy - 40]); // empty canvas to the right of the copy
const moved = await R((s) => { const t = document.querySelector(s); const cs = getComputedStyle(t); return { parent: t.parentElement.hasAttribute('data-em-canvas'), look: [cs.color, cs.fontFamily, cs.fontSize, cs.fontWeight, cs.lineHeight, cs.letterSpacing].join(' / ') }; }, q('T'));
check('a piece of a page copy, dragged out to the canvas, looks the same (font, color, size)', moved.parent && moved.look === txt.look, `${txt.look}  →  ${moved.look}`);
await p.keyboard.press('Meta+z'); await wait();
check('one ⌘Z puts it back inside the copy, exactly', (await board()) === start);
await p.keyboard.press('Meta+z'); await wait(); // the paste

// ---------- Layers: into a frame's row ----------
await R(() => localStorage.setItem('edit-mode:layers', '1'));
await p.keyboard.press('Alt+Digit1'); await wait(200);
await pick('R'); await wait(200);
const rows = await R(() => Object.fromEntries([...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.lrow')].map((r) => { const b = r.getBoundingClientRect(); return [r.querySelector('.lname').textContent, [b.x + 60, b.y + b.height / 2, b.height]]; })));
const [rx, ry] = rows.R; const [bx, by] = rows.B;
await p.mouse.move(rx, ry); await p.mouse.down(); await p.mouse.move(rx, ry + 10, { steps: 2 }); await p.mouse.move(bx, by, { steps: 4 }); await wait(60);
const rowLit = await R(() => !!document.querySelector('edit-mode-root').shadowRoot.querySelector('.lrow.into'));
await p.mouse.up(); await wait(200);
i = await info('R');
check('Layers: dropping a row on a frame’s row puts it inside (that row is highlighted)', rowLit && i.parent === 'B', JSON.stringify(i));
await p.keyboard.press('Meta+z'); await wait();
check('…one ⌘Z', (await info('R')).parent === 'A');

// Saved with the canvas.
await pick('R'); r0 = await rect('R'); const bnow = await rect('B');
await drag([r0.cx, r0.cy], [bnow.cx, bnow.y + bnow.h - 5]);
await wait(700);
await p.reload(); await p.waitForSelector('.hero'); await wait(700);
check('after a reload it’s still where it was dropped', (await info('R')).parent === 'B');
check('the live page is untouched, and nothing on the canvas is in the Push list', (await R(() => window.__editMode.changes.list().length)) === 0);
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
writeFileSync(`${process.env.COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
