// Canvas step C1: the board. The design canvas sits beside the page while
// Edit Mode is on, is saved and reloaded, takes clicks and edits like the
// page, but stays out of Push. Runs on the demo-app copy (Payloom) on 5391.
// (Frames are added straight into the DOM here; the Frame tool is C2.)
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); localStorage.removeItem('edit-mode:layers-raw'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) })); // start empty
const start = await p.$eval('#root', (e) => e.innerHTML);
const pageSame = async () => (await p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await wait(400);

const area = () => R(() => { const a = document.querySelector('[data-em-canvas]'); if (!a) return null; const r = a.getBoundingClientRect(); const b = document.body.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, gap: (r.left - b.right) / (window.__z || 1) }; });
let a = await area();
check('Edit Mode on: the canvas is on the board, to the right of the page', !!a && a.gap > 100, JSON.stringify(a));
const rows = () => R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.lrow')].map((r) => ({ name: r.querySelector('.lname').textContent, depth: Math.round((parseFloat(r.style.paddingLeft) - 4) / 14) })));
let rs = await rows();
check('Layers: Page keeps Nav, Hero, Logos; Canvas is its own section', rs.filter((r) => r.depth === 1).slice(0, 3).map((r) => r.name).join() === 'Nav,Hero,Logos' && rs.some((r) => r.name === 'Canvas' && r.depth === 0), rs.filter((r) => r.depth <= 1).map((r) => r.name).join());
check('a "Canvas" label sits above it on the board', await R(() => !document.querySelector('edit-mode-root').shadowRoot.querySelector('.board-label').hidden));

// Two frames, straight into the DOM (C2 brings the Frame tool).
await R(() => {
  const a = document.querySelector('[data-em-canvas]');
  a.innerHTML = '<div class="f1" style="position:absolute;left:80px;top:80px;width:320px;height:200px;background:#fff;display:flex;flex-direction:column;padding:16px;gap:8px"><p class="t1" style="margin:0">Hello canvas</p><p class="t2" style="margin:0">Second line</p></div>'
    + '<div class="f2" style="position:absolute;left:480px;top:80px;width:200px;height:120px;background:#fff"></div>';
});
await wait(700);
const saved = await R(() => fetch('/@edit-mode/canvas').then((r) => r.json()));
check('changes on the canvas are saved to the project', /Hello canvas/.test(saved.html) && /class="f2"/.test(saved.html));
rs = await rows();
check('its frames show under Canvas in Layers', rs.filter((r) => r.depth === 1).map((r) => r.name).includes('F1'), rs.map((r) => r.name).join());

// Pan so the canvas is in view (the pan limit must allow it), then click.
await p.keyboard.press('Shift+Digit1'); await wait(200);
const both = await R(() => { const f = document.querySelector('.f2').getBoundingClientRect(); const b = document.body.getBoundingClientRect(); return { f2: f.right < innerWidth && f.left > 0, page: b.left < innerWidth && b.right > 0 }; });
check('⇧1 fits the page and what’s on the canvas', both.f2 && both.page, JSON.stringify(both));
const f1 = await R(() => { const r = document.querySelector('.f1').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await p.mouse.click(f1.x + f1.w - 6, f1.y + f1.h - 6); await wait();
const sel = () => R(() => window.__editMode.state.selected?.className ?? null);
check('a plain click selects a top-level canvas frame', (await sel()) === 'f1', String(await sel()));
await p.keyboard.press('Tab'); await wait();
check('Tab goes to the next canvas frame (not into the page)', (await sel()) === 'f2', String(await sel()));
await p.keyboard.press('Shift+Tab'); await wait();
const t1 = await R(() => { const r = document.querySelector('.t1').getBoundingClientRect(); return [r.x + 10, r.y + r.height / 2]; });
await p.mouse.dblclick(...t1); await wait();
check('double-click drills into the frame', (await sel()) === 't1', String(await sel()));
await p.keyboard.press('Escape'); await wait();
check('Esc goes up to the frame', (await sel()) === 'f1', String(await sel()));
await p.keyboard.press('Escape'); await wait();
check('Esc again: nothing selected (never the canvas itself)', (await sel()) === null, String(await sel()));

// Edits: undoable, but never in Push.
await R(() => window.__editMode.changes.set(document.querySelector('.f1'), 'one', 'padding-top', '40px'));
check('a canvas edit applies', (await R(() => getComputedStyle(document.querySelector('.f1')).paddingTop)) === '40px');
check('…but isn’t in the Push list', (await R(() => window.__editMode.changes.list().length)) === 0);
await R(() => window.__editMode.changes.set(document.querySelector('.hero-title'), 'one', 'letter-spacing', '1px'));
check('a page edit next to it is (only that one)', (await R(() => window.__editMode.changes.list().map((c) => c.element).join())) === 'h1.hero-title');
await p.keyboard.press('Meta+z'); await wait(); await p.keyboard.press('Meta+z'); await wait();
check('⌘Z undoes both', (await R(() => getComputedStyle(document.querySelector('.f1')).paddingTop)) === '16px' && await pageSame());

// Reload: still there. Off: gone, page untouched.
await wait(600);
await p.reload(); await p.waitForSelector('.hero'); await wait(600);
check('after a reload, the canvas is back with its frames', await R(() => !!document.querySelector('[data-em-canvas] .f1 .t1')));
await p.keyboard.press('Alt+KeyE'); await wait(300);
check('Edit Mode off: the canvas is gone from the page', await R(() => !document.querySelector('[data-em-canvas]')));
check('…and the app itself is untouched', await pageSame());
check('no page errors', errors.length === 0, errors.join(' | '));
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) })); // leave it empty
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
