// Roadmap item 2: the Layers panel. Run against the sample-app copy on port 5390.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = "") => { const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`; results.push(line); console.error(line); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
await p.evaluate(() => localStorage.removeItem('edit-mode:layers'));
const start = await p.$eval('#root', e => e.innerHTML);
const same = async () => (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);

const open = () => p.evaluate(() => window.__editMode.layers.open);
const sel = () => p.evaluate(() => { const s = window.__editMode.state.selected; return s ? (s.className || s.tagName) : null; });
// Bounding box of the Layers row for the element matched by `q` (nth match `i`).
const row = (q, i = 0) => p.evaluate(([q, i]) => { const el = document.querySelectorAll(q)[i]; const r = el && window.__editMode.layers.rowFor(el); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, cls: r.className }; }, [q, i]);
const clickRow = async (q, i = 0, mods = []) => { const r = await row(q, i); for (const m of mods) await p.keyboard.down(m); await p.mouse.click(r.x + 70, r.y + r.h / 2); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(80); };
const caret = async (q, i = 0) => { const r = await row(q, i); const c = await p.evaluate(([q, i]) => { const b = window.__editMode.layers.rowFor(document.querySelectorAll(q)[i]).querySelector('.caret').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, [q, i]); await p.mouse.click(...c); await p.waitForTimeout(80); };
const btn = async (q, which, i = 0) => { const r = await row(q, i); await p.mouse.move(r.x + 60, r.y + r.h / 2); await p.waitForTimeout(40); const c = await p.evaluate(([q, i, w]) => { const b = window.__editMode.layers.rowFor(document.querySelectorAll(q)[i]).querySelector('.lbtn.' + w).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, [q, i, which]); await p.mouse.click(...c); await p.waitForTimeout(80); };
const ctr = async (q, i = 0) => { const bb = await p.locator(q).nth(i).boundingBox(); return [bb.x + bb.width / 2, bb.y + bb.height / 2]; };
const esc = async (n = 5) => { for (let k = 0; k < n; k++) await p.keyboard.press('Escape'); };

// Opening and closing
check('open by default when edit mode turns on', await open());
check('top rows: page → hero, routes, signup', !!(await row('.hero')) && !!(await row('.routes')) && !!(await row('.signup')) && !(await row('.card')));
await p.keyboard.press('Alt+Digit1'); await p.waitForTimeout(80);
check('⌥1 closes it', !(await open()));
await p.keyboard.press('Alt+Digit1'); await p.waitForTimeout(80);
check('⌥1 opens it again', await open());
{ const bb = await p.locator('edit-mode-root .layers-btn').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(80);
  check('toolbar button closes it', !(await open()));
  await p.reload(); await p.waitForSelector('.cta-primary'); await p.waitForTimeout(250);
  if (!(await p.evaluate(() => window.__editMode.state.on))) { await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250); }
  check('closed state is remembered after reload', !(await open()));
  const bb2 = await p.locator('edit-mode-root .layers-btn').boundingBox(); await p.mouse.click(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2); await p.waitForTimeout(80);
  check('toolbar button opens it', await open()); }
await p.keyboard.press('Meta+Backslash'); await p.waitForTimeout(60);
check('⌘\\ hides it with the rest of the UI', await p.evaluate(() => getComputedStyle(document.querySelector('edit-mode-root').shadowRoot.querySelector('.layers')).display === 'none'));
await p.keyboard.press('Meta+Backslash'); await p.waitForTimeout(60);

// Selecting
await clickRow('.hero');
check('clicking a row selects its element', (await sel()) === 'hero', await sel());
check('selected row is highlighted', (await row('.hero')).cls.includes('sel'));
{ const [x, y] = await ctr('.badge', 2); await p.keyboard.down('Meta'); await p.mouse.click(x, y); await p.keyboard.up('Meta'); await p.waitForTimeout(120);
  const r = await row('.badge', 2);
  check('canvas selection opens the tree down to it', !!r && r.cls.includes('sel'), r?.cls);
  check('…and the row is scrolled into view', r && r.y > 40 && r.y + r.h < 900); }
{ const [x, y] = await ctr('.hero-title'); await p.mouse.move(x, y); await p.mouse.move(x + 2, y); await p.waitForTimeout(80);
  check('hovering on the canvas highlights the row', (await row('.hero')).cls.includes('hov')); }
{ const r = await row('.routes'); await p.mouse.move(r.x + 80, r.y + r.h / 2); await p.waitForTimeout(80);
  check('hovering a row highlights the element on the canvas', await p.evaluate(() => window.__editMode.state.hovered?.className === 'routes')); }
await esc(); await clickRow('.card', 0);
await clickRow('.card', 2, ['Meta']);
check('⌘-click a row adds it', (await p.evaluate(() => window.__editMode.state.multi.length)) === 2);
await clickRow('.card', 0, ['Meta']);
check('⌘-click a selected row removes it', (await p.evaluate(() => window.__editMode.state.multi.length)) === 1);
await clickRow('.card', 0); await clickRow('.card', 2, ['Shift']);
check('Shift-click selects the range', (await p.evaluate(() => window.__editMode.state.multi.map(x => x.className).join())) === 'card,card,card');

// Expand / collapse
await esc(); await clickRow('.routes');
await p.evaluate(() => {}); 
{ const before = !!(await row('.card-grid')); await caret('.routes'); const after = !!(await row('.card-grid'));
  await caret('.routes'); const again = !!(await row('.card-grid'));
  check('caret collapses and expands', before && !after && again, `${before}/${after}/${again}`); }

// Drag to reorder: card 1 onto the top edge of card 3's row → just before card 3
await esc();
{ const a = await row('.card', 0);
  await p.mouse.move(a.x + 80, a.y + a.h / 2); await p.mouse.down(); await p.mouse.move(a.x + 80, a.y + 20, { steps: 3 });
  const c3 = await row('.card', 2);
  await p.mouse.move(c3.x + 80, c3.y + 3, { steps: 6 }); await p.waitForTimeout(40);
  const line = await p.evaluate(() => !document.querySelector('edit-mode-root').shadowRoot.querySelector('.ldrop').hidden);
  await p.mouse.up(); await p.waitForTimeout(120);
  const order = await p.evaluate(() => [...document.querySelectorAll('.card-grid > .card .card-title')].map(t => t.textContent).join(' / '));
  check('drag a row onto another row’s top edge reorders (with an insert line)', line && order === 'Granite Staircase / Moonlight Arête / The Long Traverse', order);
  check('moved element stays selected', (await sel()) === 'card');
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(120);
  check('one ⌘Z undoes the layer move', await same()); }

// Below an expanded frame's row = its first child (Figma)
{ await clickRow('.card', 2); // card 3 is expanded since earlier
  const a = await row('.card', 0); const c3 = await row('.card', 2);
  await p.mouse.move(a.x + 80, a.y + a.h / 2); await p.mouse.down(); await p.mouse.move(a.x + 80, a.y + 20, { steps: 3 });
  const c3b = await row('.card', 2); await p.mouse.move(c3b.x + 80, c3b.y + c3b.h - 3, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(120);
  const first = await p.evaluate(() => document.querySelectorAll('.card-grid > .card')[1].firstElementChild.className);
  check('drop just below an open frame’s row → its first child', first === 'card', first);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(120);
  check('⌘Z undoes it', await same()); }

// Drag into a frame: "Popular routes" heading into hero
{ const t = await row('.section-title'); const hr = await row('.hero');
  await p.mouse.move(t.x + 80, t.y + t.h / 2); await p.mouse.down(); await p.mouse.move(t.x + 80, t.y - 10, { steps: 3 });
  const hr2 = await row('.hero'); await p.mouse.move(hr2.x + 80, hr2.y + hr2.h / 2, { steps: 6 }); await p.waitForTimeout(40);
  const into = (await row('.hero')).cls.includes('into');
  await p.mouse.up(); await p.waitForTimeout(120);
  const inHero = await p.evaluate(() => document.querySelector('.hero').lastElementChild?.className);
  check('drag onto the middle of a frame row drops it inside (last child)', into && inHero === 'section-title', `into=${into} last=${inHero}`);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(120);
  check('⌘Z undoes it', await same()); }

// Can't drop a frame into itself
{ await clickRow('.routes'); const r = await row('.routes'); const g = await row('.card-grid');
  await p.mouse.move(r.x + 80, r.y + r.h / 2); await p.mouse.down(); await p.mouse.move(g.x + 80, g.y + g.h / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(120);
  check('dropping a frame into its own child does nothing', await same()); }

// Hide
await esc(); await clickRow('.hero');
await btn('.hero', 'eye');
check('eye hides the element', await p.evaluate(() => getComputedStyle(document.querySelector('.hero')).display === 'none'));
check('hidden row stays, dimmed', (await row('.hero'))?.cls.includes('dim'));
check('hide is a change Push will see', await p.evaluate(() => window.__editMode.changes.list().some(c => c.property === 'display' && c.to === 'none')));
await clickRow('.hero');
check('hidden element can still be selected from Layers', (await sel()) === 'hero');
await btn('.hero', 'eye');
check('eye again shows it', await p.evaluate(() => getComputedStyle(document.querySelector('.hero')).display !== 'none') && await same());
await btn('.hero', 'eye'); await p.keyboard.press('Meta+z'); await p.waitForTimeout(100);
check('⌘Z undoes a hide', await same());

// Lock
await esc();
await btn('.hero', 'lock');
{ const [x, y] = await ctr('.hero-title'); await p.mouse.click(x, y); await p.waitForTimeout(80);
  check('locked layer can’t be selected on the canvas', (await sel()) !== 'hero' && (await sel()) !== 'hero-title', String(await sel()));
  await p.keyboard.down('Meta'); await p.mouse.click(x, y); await p.keyboard.up('Meta'); await p.waitForTimeout(80);
  check('…not even its children with ⌘-click', (await sel()) !== 'hero-title', String(await sel())); }
await clickRow('.hero');
check('locked layer is still selectable from Layers', (await sel()) === 'hero');
check('lock icon stays visible', (await row('.hero')).cls.includes('locked'));
check('lock is not a pushed change', (await p.evaluate(() => window.__editMode.changes.count)) === 0);
await btn('.hero', 'lock'); await esc();
{ const [x, y] = await ctr('.hero-title'); await p.mouse.click(x, y); await p.waitForTimeout(80);
  check('unlocked: canvas picks it again', (await sel()) === 'hero'); }

// Inserts and undo keep the tree right
await esc();
{ const c = await p.locator('.cta-primary').boundingBox();
  await p.keyboard.press('KeyR'); await p.mouse.move(c.x + 60, c.y + c.height + 8); await p.mouse.down(); await p.mouse.move(c.x + 140, c.y + c.height + 48, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(150); // drawn clear of the Layers panel
  const r = await row('[data-em-new]');
  const name = r && await p.evaluate(() => window.__editMode.layers.rowFor(document.querySelector('[data-em-new]')).querySelector('.lname').textContent);
  check('a drawn rectangle shows up as "Rectangle", selected', !!r && r.cls.includes('sel') && name === 'Rectangle', `${name} ${JSON.stringify(r)} new=${await p.evaluate(() => document.querySelectorAll('[data-em-new]').length)} sel=${await sel()} changes=${await p.evaluate(() => JSON.stringify(window.__editMode.changes.list().map(c => c.kind + ':' + (c.property || ''))))}`);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(150);
  const gone = await p.evaluate(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.lname')].some(n => n.textContent === 'Rectangle'));
  check('…and disappears on undo', !gone); }

// Properties panel stays clear of the Layers panel
await esc();
{ const [x, y] = await ctr('.card', 0); await p.mouse.click(x, y); await p.mouse.dblclick(x, y); await p.mouse.dblclick(x, y); await p.waitForTimeout(80);
  const [x3, y3] = await ctr('.card', 2); await p.mouse.click(x3, y3); await p.waitForTimeout(200);
  const pos = await p.evaluate(() => { const r = document.querySelector('edit-mode-root').shadowRoot; return [r.querySelector('.side').getBoundingClientRect().left, r.querySelector('.layers').getBoundingClientRect().right, r.querySelector('.side').className]; });
  check('properties panel never overlaps Layers', !pos[2].includes('left') || pos[0] >= pos[1], JSON.stringify(pos)); }

await esc();
await p.screenshot({ path: process.argv[2] || 'item2.png' });
check('no page errors', !errors.length, errors.join('; '));
check('DOM unchanged overall', await same(), await p.evaluate((start) => { const a = document.querySelector('#root').innerHTML.replace(/ style=""/g, ''); let i = 0; while (i < a.length && a[i] === start[i]) i++; return a.slice(Math.max(0, i - 80), i + 120); }, start));
console.log(results.join('\n'));
await b.close();
