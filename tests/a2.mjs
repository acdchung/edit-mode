// Phase A2: simple reorders on the live page, recorded as the designer saw
// them. Runs on the demo-app copy (Payloom) on port 5391.
// PUSH=1 also runs a real Push (starts a real Claude run; ask the user first)
// and checks the copy's source afterwards. COPY=<dir of the demo copy> is needed then.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); localStorage.removeItem('edit-mode:layers-raw'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
const start = await p.$eval('#root', (e) => e.innerHTML);
const same = async () => (await p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
await p.keyboard.press('Shift+Digit1'); await p.waitForTimeout(150); // fit the page
const wait = (ms = 70) => p.waitForTimeout(ms);
const R = (f, a) => p.evaluate(f, a);
const rect = (q) => R((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, q);
const sel = () => R(() => window.__editMode.state.selected?.classList[0] ?? null);
const drag = async (from, to) => {
  await p.mouse.move(...from); await p.mouse.down(); await p.mouse.move(from[0] + 8, from[1] + 8, { steps: 2 });
  await p.mouse.move(...to, { steps: 12 }); await wait(60); await p.mouse.up(); await wait(150);
};
const order = () => R(() => ['.nav', '.hero', '.logos'].map((q) => [q, document.querySelector(q).getBoundingClientRect().top]).sort((a, b) => a[1] - b[1]).map((x) => x[0].slice(1)).join());

// ---------- Nav below Hero, on the canvas ----------
const nav = await rect('.nav');
await p.mouse.click(nav.x + nav.w * 0.6, nav.y + nav.h / 2); await wait();
check('Nav selected', (await sel()) === 'nav', String(await sel()));
const logos = await rect('.logos');
await drag([nav.x + nav.w * 0.6, nav.y + nav.h / 2], [logos.x + logos.w / 2, logos.y + 6]);
check('dragging Nav to the top of Logos puts it between Hero and Logos', (await order()) === 'hero,nav,logos', await order());
const entry = await R(() => window.__editMode.changes.list().find((c) => c.kind === 'move'));
check('Push gets the move as you saw it', entry?.visual?.intent === 'Put "Nav" inside "Page", after "Hero" and before "Logos".', entry?.visual?.intent);
check('…with the neighbours in the Figma view', entry?.visual?.after?.element === 'section.hero' && entry?.visual?.before?.element === 'section.logos',
  JSON.stringify([entry?.visual?.after?.element, entry?.visual?.before?.element]));
await p.keyboard.press('Meta+Enter'); await wait(200);
const listed = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.dialog .list li')].map((l) => l.textContent));
check('the Push list reads as that sentence', listed.some((t) => t.startsWith('Put "Nav" inside "Page", after "Hero"')), listed.join(' | '));

if (process.env.PUSH === '1') {
  // ---------- A real Push ----------
  await p.keyboard.press('Meta+Enter'); // push
  const t0 = Date.now();
  let status;
  do { await wait(3000); status = await R(() => fetch('/@edit-mode/status').then((r) => r.json()).catch(() => null)); }
  while ((status?.running || !status) && Date.now() - t0 < 8 * 60 * 1000);
  await wait(4000);
  await p.waitForSelector('.hero', { timeout: 30000 });
  const app = readFileSync(`${process.env.COPY}/src/App.jsx`, 'utf8');
  const iHero = app.indexOf('<Hero'), iNav = app.indexOf('<Nav'), iLogos = app.indexOf('<LogoStrip');
  check('after Push, the code renders Nav between Hero and LogoStrip', iHero > -1 && iHero < iNav && iNav < iLogos, `Hero@${iHero} Nav@${iNav} Logos@${iLogos}`);
  await wait(1500);
  check('…and the reloaded page shows Hero, Nav, Logos', (await order()) === 'hero,nav,logos', await order());
  console.log('Claude said:', JSON.stringify(status?.last ?? status));
} else {
  await p.keyboard.press('Escape'); await wait();
  await p.keyboard.press('Meta+z'); await wait(150);
  check('one ⌘Z puts it back', await same());

  // ---------- A drop outside the frame moves nothing ----------
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();
  const copy = await rect('.hero-copy');
  await p.keyboard.down('Meta'); await p.mouse.click(copy.x + copy.w / 2, copy.y + 2); await p.keyboard.up('Meta'); await wait();
  const title = await rect('.hero-title');
  await p.mouse.click(title.x + 10, title.y + title.h / 2); await wait(); // a sibling inside Hero copy
  const lg = await rect('.logos-grid');
  await drag([title.x + 10, title.y + title.h / 2], [lg.x + lg.w / 2, lg.y + lg.h / 2]);
  check('dragging the headline into Logos moves nothing (structure is the canvas’s job)', await same());
  await drag([title.x + 10, title.y + title.h / 2], [title.x + 10, (await rect('.hero-trust')).y + 30]);
  const last = await R(() => document.querySelector('.hero-copy').lastElementChild.className);
  check('…but reordering it inside Hero copy works (to the end)', last === 'hero-title', last);
  await p.keyboard.press('Meta+z'); await wait(150);
  check('⌘Z', await same());
}
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
