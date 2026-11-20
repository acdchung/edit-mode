// Audit follow-ups on the demo-app copy (port 5391): resizable Layers,
// the "Page" row, line height shown as written.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
let fails = 0;
const ok = (n, c, d = '') => { if (!c) fails++; console.error(`${c ? 'PASS' : 'FAIL'}  ${n}  ${d}`); };
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
const start = await p.$eval('#root', e => e.innerHTML);
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
const R = (f) => p.evaluate(f);
ok('top row is "Page"', (await R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.lname').textContent)) === 'Page');
const width = () => R(() => Math.round(document.querySelector('edit-mode-root').shadowRoot.querySelector('.layers').getBoundingClientRect().width));
const g = await R(() => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector('.lresize').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await p.mouse.move(...g); await p.mouse.down(); await p.mouse.move(g[0] + 120, g[1], { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(60);
ok('dragging the edge widens Layers', (await width()) === 360, String(await width()));
await p.mouse.move(g[0] + 120, g[1]); await p.mouse.down(); await p.mouse.move(g[0] + 900, g[1], { steps: 4 }); await p.mouse.up();
ok('…up to 520', (await width()) === 520, String(await width()));
await p.reload(); await p.waitForSelector(".hero"); await p.waitForTimeout(400); // edit mode stays on across a reload
ok('the width is remembered', (await width()) === 520, String(await width()));
const g2 = await R(() => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector('.lresize').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await p.mouse.dblclick(...g2); await p.waitForTimeout(60);
ok('double-click resets to 240', (await width()) === 240, String(await width()));
ok('the page is untouched', (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === start);
// line height
const pt = await p.$eval('.shot-name', e => { const r = e.getBoundingClientRect(); return [r.x + 4, r.y + r.height / 2]; });
await p.keyboard.down('Meta'); await p.mouse.click(...pt); await p.keyboard.up('Meta'); await p.waitForTimeout(100);
const lh = () => p.locator('edit-mode-root input[aria-label="Line height"]').inputValue();
ok('line height reads as written (1.35)', (await lh()) === '1.35', await lh());
const pt2 = await p.$eval('.hero-lede', e => { const r = e.getBoundingClientRect(); return [r.right - 30, r.y + 10]; });
await p.keyboard.down('Meta'); await p.mouse.click(...pt2); await p.keyboard.up('Meta'); await p.waitForTimeout(100);
ok('…and 1.55 on the intro paragraph', (await lh()) === '1.55', await lh());
ok('no page errors', !errs.length, errs.join('; '));
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
