// The Push button counts new designs (B3d follow-up): a new design on its own
// enables Push, opens the list under "New designs", and survives a reload. COPY=<demo copy dir>; leaves the canvas empty.
import { chromium } from 'playwright-core';
import { rmSync, writeFileSync } from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
const COPY = process.env.COPY;
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
rmSync(`${COPY}/.editmode/canvas.json`, { force: true }); // fresh: just the empty starter frame
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(900);
const S = (src) => p.evaluate((src) => new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot), src);
const push = () => S(`(root) => { const b = [...root.querySelectorAll('button.act')].find((x) => x.textContent.startsWith('Push')); return b && { disabled: b.disabled, n: b.querySelector('.n')?.textContent ?? null }; }`);

check('a fresh (empty) canvas: Push is off', (await push())?.disabled === true, JSON.stringify(await push()));

await p.keyboard.press('Shift+Digit1'); await wait(300); // the canvas starts right of the page: fit both
// The empty canvas's "Duplicate page" button copies the page where the canvas begins; ⌘Z takes it back.
const dup = await S(`(root) => { const b = root.querySelector('.dup-page'); if (b.hidden) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
check('an empty canvas shows the Duplicate page button', !!dup);
if (dup) { await p.mouse.click(...dup); await wait(900); }
const copy = await p.evaluate(() => { const f = document.querySelector('[data-em-canvas] > [data-em-copy="page"]'); return f && { left: f.offsetLeft, top: f.offsetTop, hero: !!f.querySelector('.hero') }; });
check('…clicking it puts a copy of the page at the canvas’s top-left', copy?.left === 0 && copy.top === 0 && copy.hero, JSON.stringify(copy));
check('…and the button goes away', await S(`(root) => root.querySelector('.dup-page').hidden`));
await p.keyboard.press('Meta+z'); await wait(600);
check('…⌘Z empties the canvas again, button back', (await p.evaluate(() => document.querySelector('[data-em-canvas]').children.length)) === 0 && !(await S(`(root) => root.querySelector('.dup-page').hidden`)));

// Draw a rectangle on the empty canvas.
await p.keyboard.press('Shift+Digit1'); await wait(300);
const r = await p.evaluate(() => { const f = document.querySelector('[data-em-canvas]').getBoundingClientRect(); return { x: f.left + 40, y: f.top + 40 }; });
await p.keyboard.press('r'); await wait(80);
await p.mouse.move(r.x + 40, r.y + 20); await p.mouse.down(); await p.mouse.move(r.x + 80, r.y + 60, { steps: 3 }); await p.mouse.move(r.x + 140, r.y + 110, { steps: 4 }); await p.mouse.up();
await wait(600);
let st = await push();
check('a new design on its own turns Push on, counted', st?.disabled === false && st.n === '1', JSON.stringify(st));

// Push opens the list with it under New designs (intercept, so Claude never runs).
await p.route('**/@edit-mode/push', (route) => route.fulfill({ status: 500, body: 'test' }));
await S(`(root) => [...root.querySelectorAll('button.act')].find((x) => x.textContent.startsWith('Push')).click()`); await wait(300);
const dialog = await S(`(root) => { const d = root.querySelector('.dialog'); return d ? d.textContent : null; }`);
check('clicking Push opens the list, with the design under New designs', !!dialog && /New designs/.test(dialog) && /Rectangle/.test(dialog), (dialog || '').slice(0, 160));
await p.keyboard.press('Escape'); await wait(150);

check('…titled plainly while no design is picked yet', /^Push to code/.test(dialog || ''), (dialog || '').slice(0, 30));

// ⌘Z removes it: Push off again; ⌘⇧Z brings it back.
await p.keyboard.press('Meta+z'); await wait(600);
st = await push();
check('undoing it turns Push off again', st?.disabled === true, JSON.stringify(st));
await p.keyboard.press('Meta+Shift+z'); await wait(600);
check('redo turns it back on', (await push())?.disabled === false);

await p.waitForTimeout(600); // let the canvas save
await p.reload(); await p.waitForSelector('.hero'); await wait(1400);
st = await push();
check('after a reload it still counts', st?.disabled === false && st.n === '1', JSON.stringify(st));
check('no page errors', errors.length === 0, errors.join(' | '));

await p.evaluate(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await wait(500);
await b.close();
writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
