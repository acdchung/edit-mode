// Phase A1: the Figma view. Wrappers you can't see are skipped in Layers and
// on the canvas. Runs on the demo-app copy (Payloom) on port 5391.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); localStorage.removeItem('edit-mode:layers-raw'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
const start = await p.$eval('#root', (e) => e.innerHTML);
const same = async () => (await p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
const wait = (ms = 70) => p.waitForTimeout(ms);
const R = (f, a) => p.evaluate(f, a);
const sel = () => R(() => window.__editMode.state.selected?.classList[0] ?? window.__editMode.state.selected?.tagName ?? null);
const multi = () => R(() => window.__editMode.state.multi.map((x) => x.classList[0] || x.tagName).join());
const rows = () => R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.lrow')].map((r) => ({ name: r.querySelector('.lname').textContent, depth: Math.round((parseFloat(r.style.paddingLeft) - 4) / 14) })));
const hasRow = (q) => R((q) => !!window.__editMode.layers.rowFor(document.querySelector(q)), q);
const rect = (q) => R((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, q);
const esc = async (n = 4) => { for (let i = 0; i < n; i++) await p.keyboard.press('Escape'); await wait(); };
const shadowBtn = (q) => R((q) => { const b = document.querySelector('edit-mode-root').shadowRoot.querySelector(q).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, q);

// ---------- Layers ----------
await wait(150);
let top = (await rows()).filter((r) => r.depth === 1).map((r) => r.name);
check('Page holds Nav, Hero and Logos as siblings', top.join() === 'Nav,Hero,Logos', top.join());
// open everything (⌥-click the Page caret)
{ const c = await R(() => { const b = window.__editMode.layers.rowFor(document.querySelector('#root')).querySelector('.caret').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await p.keyboard.down('Alt'); await p.mouse.click(...c); await p.keyboard.up('Alt'); await wait(); // closes
  await p.keyboard.down('Alt'); await p.mouse.click(...c); await p.keyboard.up('Alt'); await wait(); } // opens all
check('no row for the invisible <main> wrapper', !(await hasRow('main')) && (await hasRow('.shot')));
check('hero-visual stays: it sets the 500px height the shot fills', await hasRow('.hero-visual'));
check('real frames keep their rows (containers, the payslip name group)', (await hasRow('.nav-inner')) && (await hasRow('.payslip-who > div')));
const names = (await rows()).map((r) => r.name);
check('friendly names ("Nav links", "Hero copy", "Container")', ['Nav links', 'Hero copy', 'Container'].every((n) => names.includes(n)), names.slice(0, 12).join(' | '));

await p.mouse.click(...(await shadowBtn('.lraw'))); await wait(120);
check('"Show all layers" shows the code tree, wrappers included', await hasRow('main'));
await p.mouse.click(...(await shadowBtn('.lraw'))); await wait(120);
check('…and switching it off hides them again', !(await hasRow('main')));
check('the switch is remembered', (await R(() => localStorage.getItem('edit-mode:layers-raw'))) === null);

// ---------- Canvas ----------
await esc();
const hero = await rect('.hero-copy');
await p.mouse.click(hero.x + hero.w / 2, hero.y + 4); await wait();
check('a plain click at the top level selects the Hero section, not <main>', (await sel()) === 'hero', String(await sel()));
await p.keyboard.press('Tab'); await wait();
check('Tab goes to the next sibling in the Figma view (Logos)', (await sel()) === 'logos', String(await sel()));
await p.keyboard.press('Tab'); await wait();
check('…and wraps to Nav (across the hidden <main>)', (await sel()) === 'nav', String(await sel()));
await p.keyboard.press('Meta+a'); await wait();
check('⌘A selects Nav, Hero and Logos', (await multi()) === 'nav,hero,logos', await multi());
await esc();

// Drill into the hero shot: hero → container → shot (hero-visual skipped).
await p.mouse.click(hero.x + hero.w / 2, hero.y + 4); await wait();
const shot = await rect('.shot-window');
await p.mouse.dblclick(shot.x + 30, shot.y + shot.h / 2); await wait();
check('double-click into Hero picks its container', (await sel()) === 'container', String(await sel()));
await p.mouse.dblclick(shot.x + 30, shot.y + shot.h / 2); await wait();
check('double-click again picks hero-visual', (await sel()) === 'hero-visual', String(await sel()));
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();
check('Esc twice: back to Hero', (await sel()) === 'hero', String(await sel()));
await p.keyboard.press('Escape'); await wait();
check('Esc: the Page frame (#root), skipping <main>', (await sel()) === 'DIV' && (await R(() => window.__editMode.state.selected?.id)) === 'root', String(await sel()));
await p.keyboard.press('Escape'); await wait();
check('Esc again: nothing selected', (await sel()) === null, String(await sel()));

// ---------- Layers drag across the hidden <main> ----------
const nav = await R(() => { const b = window.__editMode.layers.rowFor(document.querySelector('.nav')).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
// collapse everything so Logos is a short row
{ const c = await R(() => { const b = window.__editMode.layers.rowFor(document.querySelector('#root')).querySelector('.caret').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await p.keyboard.down('Alt'); await p.mouse.click(...c); await p.mouse.click(...c); await p.keyboard.up('Alt'); await wait();
  await p.mouse.click(...c); await wait(); await p.mouse.click(...c); await wait(); } // only Page open
const logosRow = await R(() => { const b = window.__editMode.layers.rowFor(document.querySelector('.logos')).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
const navRow = await R(() => { const b = window.__editMode.layers.rowFor(document.querySelector('.nav')).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
await p.mouse.move(navRow.x + 80, navRow.y + navRow.h / 2); await p.mouse.down();
await p.mouse.move(navRow.x + 80, navRow.y + 30, { steps: 4 });
await p.mouse.move(logosRow.x + 80, logosRow.y + logosRow.h * 0.1, { steps: 8 }); await wait(40); await p.mouse.up(); await wait(150);
top = (await rows()).filter((r) => r.depth === 1).map((r) => r.name);
const navUnderHero = await R(() => document.querySelector('.nav').getBoundingClientRect().top > document.querySelector('.hero').getBoundingClientRect().top);
check('dragging Nav between Hero and Logos in Layers moves it on the page (across the hidden <main>)', top.join() === 'Hero,Nav,Logos' && navUnderHero, top.join());
await p.keyboard.press('Meta+z'); await wait(150);
check('one ⌘Z puts it back', await same());

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
