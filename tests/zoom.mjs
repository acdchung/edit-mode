// Canvas zoom and pan (roadmap item "Zoom and pan"). Run against the sample-app copy on port 5390.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`; results.push(line); console.error(line); };
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
const start = await p.$eval('#root', e => e.innerHTML);
const same = async () => (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === start;
const SR = "document.querySelector('edit-mode-root').shadowRoot";
const z = () => p.evaluate(() => +document.querySelector('edit-mode-root').shadowRoot.querySelector('.zoom-btn').textContent.replace('%', '') / 100);
const rect = (q, i = 0) => p.evaluate(([q, i]) => { const r = document.querySelectorAll(q)[i].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, [q, i]);
const near = (a, b, t = 1) => Math.abs(a - b) <= t;
const sel = () => p.evaluate(() => { const s = window.__editMode.state.selected; return s ? (s.className || s.tagName) : null; });
const esc = async (n = 5) => { for (let k = 0; k < n; k++) await p.keyboard.press('Escape'); };
const deepClick = async (q, i = 0) => { const r = await rect(q, i); await p.keyboard.down('Meta'); await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await p.keyboard.up('Meta'); await p.waitForTimeout(80); };
const label = () => p.evaluate(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.size').textContent);
const panelW = () => p.evaluate(() => { const r = document.querySelector('edit-mode-root').shadowRoot; const f = [...r.querySelectorAll('input')].find(i => i.closest('.field, .num, div')?.textContent.includes('W') ); return f?.value; });

// Entering edit mode while scrolled: nothing moves
await p.evaluate(() => window.scrollTo(0, 200)); await p.waitForTimeout(80);
const before = await rect('.card', 1);
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
const after = await rect('.card', 1);
check('turning edit mode on keeps the page where it was (100%)', near(before.x, after.x, 0.5) && near(before.y, after.y, 0.5) && near(before.w, after.w, 0.5), `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
check('starts at 100%', (await z()) === 1);

// Zoom keys
await p.keyboard.press('Meta+Minus'); await p.waitForTimeout(80);
check('⌘− zooms out a step', near(await z(), 0.75, 0.01), String(await z()));
await p.keyboard.press('Meta+Minus'); await p.keyboard.press('Meta+Minus'); await p.waitForTimeout(80);
check('⌘− steps 100 → 75 → 67 → 50%', near(await z(), 0.5, 0.01), String(await z()));
{ const c = await rect('.card', 1); check('elements are drawn at half size', near(c.w, before.w / 2, 1), `${c.w} vs ${before.w}`); }
await p.keyboard.press('Meta+Equal'); await p.waitForTimeout(80);
check('⌘+ zooms in a step (50 → 67%)', near(await z(), 0.67, 0.01), String(await z()));
await p.keyboard.press('Meta+Digit0'); await p.waitForTimeout(80);
check('⌘0 → 100%', (await z()) === 1);

// Fit: page between the panels
await p.keyboard.press('Shift+Digit1'); await p.waitForTimeout(100);
{ const page = await p.evaluate(() => { const r = document.body.getBoundingClientRect(); return [r.left, r.right, r.top]; });
  const lay = await p.evaluate(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.layers').getBoundingClientRect().right);
  check('⇧1 fits the page between Layers and the properties panel', page[0] >= lay && page[1] <= 1280 - 264 && page[2] >= 0 && (await z()) < 1, `${page.map(Math.round)} z=${await z()}`); }

// Selection, labels and fields in CSS px at 50%
await p.keyboard.press('Meta+Digit0'); await p.keyboard.press('Meta+Minus'); await p.keyboard.press('Meta+Minus'); await p.keyboard.press('Meta+Minus'); await p.waitForTimeout(100);
await deepClick('.card', 1); await p.keyboard.press('Escape'); // card-? → its parent
await esc(); await deepClick('.card-title', 1); await p.keyboard.press('Escape'); await p.waitForTimeout(80);
check('clicking works at 50% (selects the card)', (await sel()) === 'card', await sel());
{ const css = await p.evaluate(() => document.querySelectorAll('.card')[1].offsetWidth);
  const l = await label();
  check('size label shows CSS px, not screen px', l.startsWith(String(Math.round(css))) || l.startsWith(String(css)), `${l} vs offsetWidth ${css}`);
  const w = await p.evaluate(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('input')].map(i => i.value)[0]);
  check('panel W field shows CSS px', near(parseFloat(w), css, 1), `${w}`); }

// ⇧2 zoom to selection
await p.keyboard.press('Shift+Digit2'); await p.waitForTimeout(100);
{ const r = await rect('.card', 1); const cx = r.x + r.w / 2;
  const lay = await p.evaluate(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.layers').getBoundingClientRect().right);
  check('⇧2 zooms to the selection, centred between the panels', (await z()) > 1 && near(cx, (lay + 1280 - 264) / 2, 2), `z=${await z()} cx=${Math.round(cx)}`); }

// ⌘-scroll zooms around the pointer
await p.keyboard.press('Meta+Digit0'); await p.waitForTimeout(80);
{ const t = await rect('.hero-title'); const px = t.x + 40, py = t.y + 10;
  await p.mouse.move(px, py); await p.keyboard.down('Meta'); await p.mouse.wheel(0, 120); await p.keyboard.up('Meta'); await p.waitForTimeout(120);
  const t2 = await rect('.hero-title');
  const zz = await z();
  // the page point under the pointer stays put: (px - t.x) scaled = px - t2.x
  check('⌘-scroll zooms out around the pointer', zz < 1 && near(px - t2.x, (px - t.x) * zz, 2) && near(py - t2.y, (py - t.y) * zz, 2), `z=${zz}`); }
await p.keyboard.press('Meta+Digit0'); await p.waitForTimeout(80);

// Scrolling pans; Space-drag and middle-drag pan
{ const a = await rect('.hero'); await p.mouse.move(640, 450); await p.mouse.wheel(0, 100); await p.waitForTimeout(100);
  const b2 = await rect('.hero'); check('scrolling pans the page', near(b2.y, a.y - 100, 1), `${a.y} → ${b2.y}`);
  await p.mouse.wheel(60, 0); await p.waitForTimeout(100);
  const c = await rect('.hero'); check('sideways scrolling pans sideways', near(c.x, b2.x - 60, 1), `${b2.x} → ${c.x}`); }
{ await esc(); const a = await rect('.hero');
  await p.keyboard.down('Space'); await p.mouse.move(600, 400); await p.mouse.down(); await p.mouse.move(700, 450, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Space'); await p.waitForTimeout(80);
  const b2 = await rect('.hero');
  check('Space-drag pans', near(b2.x, a.x + 100, 1) && near(b2.y, a.y + 50, 1), `${JSON.stringify(a)} → ${JSON.stringify(b2)}`);
  check('…without selecting anything', (await sel()) === null, String(await sel()));
  await p.mouse.move(700, 450); await p.mouse.down({ button: 'middle' }); await p.mouse.move(640, 400, { steps: 5 }); await p.mouse.up({ button: 'middle' }); await p.waitForTimeout(80);
  const c = await rect('.hero'); check('middle-drag pans', near(c.x, b2.x - 60, 1) && near(c.y, b2.y - 50, 1)); }
{ await p.mouse.move(640, 450); for (let i = 0; i < 40; i++) await p.mouse.wheel(0, 2000); await p.waitForTimeout(100);
  // The board is the page plus the design canvas beside it (C1): some of it always stays on screen.
  const r = await p.evaluate(() => Math.max(document.body.getBoundingClientRect().bottom, document.querySelector('[data-em-canvas]')?.getBoundingClientRect().bottom ?? -Infinity));
  check('panning can’t lose the board (page and canvas) off screen', r >= 79, String(r)); }
await p.keyboard.press('Shift+Digit1'); await p.keyboard.press('Meta+Digit0'); await p.waitForTimeout(80);

// Editing at 50%: resize, draw, move — values in CSS px; undo restores
await p.keyboard.press('Meta+Minus'); await p.keyboard.press('Meta+Minus'); await p.keyboard.press('Meta+Minus'); await p.waitForTimeout(80);
await esc(); await deepClick('.cta-primary');
{ const w0 = await p.evaluate(() => document.querySelector('.cta-primary').offsetWidth);
  const h = await p.evaluate(() => { const b = document.querySelector('edit-mode-root').shadowRoot.querySelector('.handle[data-dir="e"]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await p.mouse.move(...h); await p.mouse.down(); await p.mouse.move(h[0] + 50, h[1], { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(80);
  const w1 = await p.evaluate(() => document.querySelector('.cta-primary').offsetWidth);
  check('resize at 50%: 50 screen px = 100 CSS px', near(w1 - w0, 100, 1.5), `${w0} → ${w1}`);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);
  check('one ⌘Z undoes it', await same()); }
{ const c = await rect('.cta-primary'); await esc();
  await p.keyboard.press('KeyR'); await p.mouse.move(c.x + 10, c.y + c.h + 10); await p.mouse.down(); await p.mouse.move(c.x + 50, c.y + c.h + 40, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(120);
  const s = await p.evaluate(() => { const n = document.querySelector('[data-em-new]'); return n && [n.offsetWidth, n.offsetHeight]; });
  check('drawing at 50%: 40×30 screen px = 80×60 CSS px', s && near(s[0], 80, 1) && near(s[1], 60, 1), JSON.stringify(s));
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);
  check('⌘Z removes it', await same()); }
{ await esc(); const r = await rect('.card', 0); await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await p.mouse.dblclick(r.x + r.w / 2, r.y + r.h / 2); await p.mouse.dblclick(r.x + r.w / 2, r.y + r.h / 2); await p.waitForTimeout(60);
  const c3 = await rect('.card', 2);
  await p.mouse.move(r.x + r.w / 2, r.y + 10); await p.mouse.down(); await p.mouse.move(c3.x + c3.w - 5, c3.y + c3.h / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(120);
  const order = await p.evaluate(() => [...document.querySelectorAll('.card-grid > .card .card-title')].map(t => t.textContent).join(' / '));
  check('drag-to-move works at 50%', order === 'Granite Staircase / The Long Traverse / Moonlight Arête', order);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);
  check('⌘Z undoes the move', await same()); }

// Padding hint and ⌥ measure at 50%: drawn at the right size, labelled in CSS px
await esc(); await deepClick('.hero-title');
{ await p.keyboard.down('Alt'); const t = await rect('.hero'); await p.mouse.move(t.x + 6, t.y + t.h - 6); await p.mouse.move(t.x + 7, t.y + t.h - 6); await p.waitForTimeout(100); // hover the hero's padding: measures title ↔ hero
  const labels = await p.evaluate(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.mlabel')].map(l => +l.textContent));
  const pad = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.hero')).paddingLeft));
  await p.keyboard.up('Alt');
  check('⌥ measure labels are CSS px', labels.some(v => near(v, pad, 1)), `${labels} (padding ${pad})`); }

// Leaving edit mode puts everything back
await esc(); await p.keyboard.press('Meta+Digit0'); await p.keyboard.press('Shift+Digit1'); await p.keyboard.press('Meta+Digit0'); await p.waitForTimeout(60);
await p.mouse.move(640, 450); await p.mouse.wheel(0, 300); await p.waitForTimeout(100); // panned down, as if scrolled
{ const inEdit = await rect('.hero');
  await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(200);
  const st = await p.evaluate(() => [document.documentElement.getAttribute('style'), document.body.getAttribute('style')]);
  const out = await rect('.hero');
  check('edit mode off: html/body styles restored', !st[0] && !st[1], JSON.stringify(st));
  // The window scrolls back to where the canvas was panned, as far as the page can scroll.
  const [top, maxScroll] = await p.evaluate(() => [document.querySelector('.hero').getBoundingClientRect().top + scrollY, document.documentElement.scrollHeight - innerHeight]);
  const want = Math.max(0, Math.min(maxScroll, top - inEdit.y));
  check('…and scrolls to where you were looking (as far as the page scrolls)', near(await p.evaluate(() => scrollY), want, 2), `scrollY=${await p.evaluate(() => scrollY)} want=${want}`); }

await p.screenshot({ path: process.argv[2] || 'zoom.png' });
check('no page errors', !errors.length, errors.join('; '));
check('DOM unchanged overall', await same());
console.log(results.join('\n'));
await b.close();
