// Phase A3: guards on the live page. Only offer what maps to Figma, read
// sizes the way they behave, and say plainly when a layout doesn't map.
// Runs on the demo-app copy (Payloom) on port 5391.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
const start = await p.$eval('#root', (e) => e.innerHTML);
const same = async () => (await p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
const wait = (ms = 80) => p.waitForTimeout(ms);
const R = (f, a) => p.evaluate(f, a);
const pick = async (q, i = 0) => { await R(([q, i]) => window.__editMode.select(document.querySelectorAll(q)[i]), [q, i]); await wait(); };
const mode = (q, axis, i = 0) => R(([q, axis, i]) => window.__editMode.panel.sizeModeOf(document.querySelectorAll(q)[i], axis), [q, axis, i]);
const notes = () => R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.notes .note')].map((n) => n.textContent));
const shadowCenter = (q) => R((q) => { const b = document.querySelector('edit-mode-root').shadowRoot.querySelector(q).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, q);

// ---------- Hug only where it maps ----------
await pick('.hero-visual');
const hBtn = await R(() => { const f = document.querySelector('edit-mode-root').shadowRoot.querySelector('button[aria-label="Height sizing"]').getBoundingClientRect(); return [f.x + f.width / 2, f.y + f.height / 2]; });
await p.mouse.click(...hBtn); await wait(150);
const items = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.pop-item')].map((b) => ({ t: b.firstChild.textContent, off: b.disabled, why: b.querySelector('.pop-why')?.textContent })));
const hug = items.find((x) => x.t === 'Hug contents');
check('hero-visual (contents all pinned): Hug is greyed out, with the reason', hug?.off && /shrink to 0/.test(hug.why || ''), JSON.stringify(items));
await p.mouse.click(...(await shadowCenter('.pop-item.off'))); await wait();
check('…and clicking it changes nothing', await same());
await p.keyboard.press('Escape'); await wait();
await pick('.hero-copy');
await p.mouse.click(...(await R(() => { const f = document.querySelector('edit-mode-root').shadowRoot.querySelector('button[aria-label="Height sizing"]').getBoundingClientRect(); return [f.x + f.width / 2, f.y + f.height / 2]; }))); await wait(150);
const items2 = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.pop-item')].map((b) => ({ t: b.firstChild.textContent, off: b.disabled })));
check('a frame with content: Hug is offered', items2.some((x) => x.t === 'Hug contents' && !x.off), JSON.stringify(items2));
await p.keyboard.press('Escape'); await wait();

await pick('.payslip');
await p.mouse.click(...(await R(() => { const f = document.querySelector('edit-mode-root').shadowRoot.querySelector('button[aria-label="Width sizing"]').getBoundingClientRect(); return [f.x + f.width / 2, f.y + f.height / 2]; }))); await wait(150);
const items3 = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.pop-item')].map((b) => ({ t: b.firstChild.textContent, off: b.disabled })));
check('the payslip (placed by position): Fill is greyed out', items3.some((x) => x.t === 'Fill container' && x.off), JSON.stringify(items3));
await p.mouse.move(10, 400); await wait(); // let the menu be seen in a screenshot
await p.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/a3-menu.png` : '/dev/null' }).catch(() => {});
await p.keyboard.press('Escape'); await wait();

// ---------- Readings ----------
check('page containers read Fill (capped), not Fixed', (await mode('.container', 'width', 0)) === 'fill' && (await mode('.container', 'width', 1)) === 'fill' && (await mode('.container', 'width', 2)) === 'fill',
  [await mode('.container', 'width', 0), await mode('.container', 'width', 1), await mode('.container', 'width', 2)].join());
check('the headline spans its column: Fill', (await mode('.hero-title', 'width')) === 'fill', await mode('.hero-title', 'width'));
check('name and place in the payslip read the same (Fill: stacked lines fill their group)', (await mode('.payslip-name', 'width')) === 'fill' && (await mode('.payslip-place', 'width')) === 'fill', `${await mode('.payslip-name', 'width')} / ${await mode('.payslip-place', 'width')}`);
check('nav links in their hugging row read Hug, not Fill', (await mode('.nav-link', 'height')) === 'hug', await mode('.nav-link', 'height'));
check('a button sized by its label: Hug', (await mode('.nav-actions .button', 'width')) === 'hug', await mode('.nav-actions .button', 'width'));
check('the nav bar’s fixed height: Fixed', (await mode('.nav .container', 'height')) === 'fixed', await mode('.nav .container', 'height'));

check('the page is untouched', await same());
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
