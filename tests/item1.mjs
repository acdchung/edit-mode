import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} }); // Layers closed: these suites predate it (item2.mjs covers it)
  await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
const start = await p.$eval('#root', e => e.innerHTML);
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150);
const name = (s) => s ? (s.className || s.tagName) : null;
const sel = () => p.evaluate(() => { const s = window.__editMode.state.selected; return s ? (s.className || s.tagName) : null; });
const multi = () => p.evaluate(() => window.__editMode.state.multi.map(s => s.className).join(' | '));
const hov = () => p.evaluate(() => { const s = window.__editMode.state.hovered; return s ? (s.className || s.tagName) : null; });
const ctr = async (q) => { const bb = await p.locator(q).first().boundingBox(); return [bb.x + bb.width / 2, bb.y + bb.height / 2]; };
const click = async (q, mods = []) => { const [x, y] = await ctr(q); for (const m of mods) await p.keyboard.down(m); await p.mouse.click(x, y); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(60); };
const dbl = async (q) => { const [x, y] = await ctr(q); await p.mouse.dblclick(x, y); await p.waitForTimeout(80); };
const same = async () => (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === start;

// Hover with nothing selected shows the top-level section
{ const [x, y] = await ctr('.card:nth-child(1) .card-title'); await p.mouse.move(x, y); await p.mouse.move(x + 1, y); await p.waitForTimeout(60);
  check('hover, nothing selected → top-level section', (await hov()) === 'routes', await hov());
  await p.keyboard.down('Meta'); await p.waitForTimeout(60);
  check('holding ⌘ → hover goes deepest', (await hov()) === 'card-title', await hov());
  await p.keyboard.up('Meta'); await p.waitForTimeout(60);
  check('releasing ⌘ → hover back to top level', (await hov()) === 'routes', await hov()); }

await click('.card:nth-child(1) .card-title');
check('click, nothing selected → top-level section', (await sel()) === 'routes', await sel());
await click('.hero-title');
check('click elsewhere at top level → other section', (await sel()) === 'hero', await sel());

// Double-click drills one level at a time; on selected text it edits
await click('body', []); // reset
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await dbl('.card:nth-child(1) .card-title');
check('dblclick → one level down (card-grid)', (await sel()) === 'card-grid', await sel());
await dbl('.card:nth-child(1) .card-title');
check('dblclick → card', (await sel()) === 'card', await sel());
await dbl('.card:nth-child(1) .card-title');
check('dblclick → card title', (await sel()) === 'card-title', await sel());
await dbl('.card:nth-child(1) .card-title');
check('dblclick on selected text → editing', await p.evaluate(() => !!window.__editMode.state.editing));
await p.keyboard.press('Escape'); await p.waitForTimeout(60);

// Sibling level
await p.keyboard.press('Escape'); // card-title → card
check('Esc → parent (card)', (await sel()) === 'card', await sel());
await click('.card:nth-child(2) .card-meta');
check('card selected, click inside another card → that card', (await sel()) === 'card' && await p.evaluate(() => window.__editMode.state.selected === document.querySelectorAll('.card')[1]));
{ const [x, y] = await ctr('.card:nth-child(3) .card-title'); await p.mouse.move(x, y); await p.mouse.move(x + 1, y); await p.waitForTimeout(60);
  check('card selected, hover another card → that card', (await hov()) === 'card' || (await hov())?.startsWith('card '), await hov()); }

// Click inside the selection keeps it
await click('.card:nth-child(2) .card-title');
check('click inside the selection keeps it', await p.evaluate(() => window.__editMode.state.selected === document.querySelectorAll('.card')[1]));

// Gap between cards → the grid
{ const a = await p.locator('.card:nth-child(1)').boundingBox(); const c = await p.locator('.card:nth-child(2)').boundingBox();
  if (c.x > a.x + a.width + 2) { await p.mouse.click((a.x + a.width + c.x) / 2, a.y + 20); await p.waitForTimeout(60);
    check('click gap between selected card and sibling → the grid', (await sel()) === 'card-grid', await sel()); }
  else check('click gap → grid (no horizontal gap found)', true, 'skipped'); }

// Leaving the context walks up
await click('.card:nth-child(1)'); await dbl('.card:nth-child(1) .card-title'); // card → card-title
await click('.hero-title');
check('deep selection, click another section → that section', (await sel()) === 'hero', await sel());

// ⌘-click
await click('.card:nth-child(3) .badge', ['Meta']);
check('⌘-click → deepest', (await sel()) === 'badge', await sel());

// Shift-click at the same level
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); // badge → card-meta → card
check('Esc twice → card', (await sel())?.startsWith('card'), await sel());
await click('.card:nth-child(1) .card-title', ['Shift']);
check('Shift-click inside a sibling card adds the card', (await multi()).split(' | ').length === 2 && !(await multi()).includes('card-title'), await multi());

// Pressing one of several selected keeps the multi-selection until release
{ const [x, y] = await ctr('.card:nth-child(1) .card-title'); await p.mouse.move(x, y); await p.mouse.down(); await p.waitForTimeout(40);
  const during = (await multi()).split(' | ').length; await p.mouse.up(); await p.waitForTimeout(60);
  check('press on one of a multi-selection keeps all; release selects it', during === 2 && (await multi()).split(' | ').length === 1, `during=${during}`); }

// Drag the selected card by its title, then ⌘Z
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await click('.card:nth-child(1) .card-title'); await dbl('.card:nth-child(1) .card-title'); await dbl('.card:nth-child(1) .card-title');
check('card selected for drag', (await sel()) === 'card', await sel());
{ const [x, y] = await ctr('.card:nth-child(1) .card-title'); const t = await p.locator('.card:nth-child(3)').boundingBox();
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(t.x + t.width - 10, t.y + t.height / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(100);
  const moved = await p.evaluate(() => document.querySelectorAll('.card')[2].querySelector('.card-title').textContent);
  check('drag selected card by its title moves the card', moved === 'Moonlight Arête', moved);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(100);
  check('⌘Z restores DOM after drag', await same()); }

// Text tool on existing nested text edits it
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await p.keyboard.press('KeyT'); await click('.card:nth-child(2) .card-title');
check('Text tool on nested text edits it', await p.evaluate(() => window.__editMode.state.editing?.className === 'card-title'));
await p.keyboard.press('Escape'); await p.waitForTimeout(60);

// Esc climbs to the page root, then deselects; Enter goes to first child
await click('.hero-title', ['Meta']); await p.keyboard.press('Escape');
check('Esc from text → hero', (await sel()) === 'hero', await sel());
await p.keyboard.press('Escape');
check('Esc from top-level → page', (await sel()) === 'page', await sel());
await p.keyboard.press('Escape');
check('Esc from page → nothing (not #root)', (await sel()) === null, await sel());
await click('.hero-title'); await p.keyboard.press('Enter');
check('Enter → first child', (await sel()) === 'eyebrow', await sel());

// With the page itself selected, clicks still pick top-level sections
await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await click('.signup-input');
check('page selected, click → top-level section', (await sel()) === 'signup', await sel());

// Background click deselects
{ const r = await p.locator('main.page').boundingBox(); await p.mouse.click(5, r.y + r.height + 20 < 995 ? r.y + r.height + 20 : 995); await p.waitForTimeout(60);
  const s = await sel(); check('click page background → deselect (or page edge)', s === null || s === 'page', s); }

await p.screenshot({ path: process.argv[2] || 'item1.png' });
check('no page errors', !errors.length, errors.join('; '));
check('DOM unchanged overall', await same());
console.log(results.join('\n'));
await b.close();
