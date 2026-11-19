// Fixes before item 3: "All like this" families, same-depth Shift-click,
// solid instance outlines, and outlines that used to get stuck.
// Run against the sample-app copy on port 5390.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`; results.push(line); console.error(line); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
const start = await p.$eval('#root', e => e.innerHTML);
const same = async () => (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
await p.keyboard.press('Shift+Digit1'); await p.waitForTimeout(100); // fit the page between the panels

const st = (f) => p.evaluate(f);
const sel = () => st(() => { const s = window.__editMode.state.selected; return s ? (s.className || s.tagName) : null; });
const multi = () => st(() => window.__editMode.state.multi.map(s => s.className || s.tagName));
const rect = (q, i = 0) => p.evaluate(([q, i]) => { const r = document.querySelectorAll(q)[i].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, [q, i]);
const ctr = async (q, i = 0) => { const r = await rect(q, i); return [r.x + r.w / 2, r.y + r.h / 2]; };
const click = async (q, i = 0, mods = []) => { const [x, y] = await ctr(q, i); for (const m of mods) await p.keyboard.down(m); await p.mouse.click(x, y); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(80); };
const esc = async (n = 5) => { for (let k = 0; k < n; k++) await p.keyboard.press('Escape'); };
const scopeText = () => st(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.scope button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(' | '));
const clickScopeAll = async () => { const bb = await p.locator('edit-mode-root .scope button').nth(1).boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(80); };
const clickScopeOne = async () => { const bb = await p.locator('edit-mode-root .scope button').nth(0).boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(80); };
const setOpacity = async (v) => { const f = p.locator('edit-mode-root input[aria-label="Opacity"]'); await f.fill(String(v)); await f.press('Enter'); await p.waitForTimeout(80); };
const opac = () => st(() => [...document.querySelectorAll('.card')].map(c => getComputedStyle(c).opacity).join(','));

// ---------- "All like this" families ----------
await click('.card', 0, ['Meta']); await p.keyboard.press('Escape'); // badge... → up to the card
await esc(); await click('.card-thumb', 0, ['Meta']); await p.keyboard.press('Escape');
check('a card is selected', (await sel()) === 'card', await sel());
await p.keyboard.press('Meta+d'); await p.waitForTimeout(120);
check('⌘D makes a copy (4 cards on the page)', (await st(() => document.querySelectorAll('.card').length)) === 4);
check('the copy is selected and offers "All like this · 4"', (await scopeText()).includes('All like this · 4'), await scopeText());
await clickScopeAll(); await setOpacity(50);
check('All like this on the copy changes the 3 originals and the copy', (await opac()) === '0.5,0.5,0.5,0.5', await opac());
{ const e = await st(() => window.__editMode.changes.list().find(c => c.property === 'opacity'));
  check('Push sees scope "all" with the family (the card’s JSX line)', e?.scope === 'all' && /Card\.jsx/.test(e.family || ''), JSON.stringify({ scope: e?.scope, family: e?.family })); }
await clickScopeOne();
// elements inside the copy are in their originals' families
await esc(); await click('.card-title', 1, ['Meta']); // copy sits right after card 1, so it's index 1
check('a title inside the copy offers "All like this · 4"', (await scopeText()).includes('All like this · 4'), await scopeText());
// copy of a copy
await esc(); await click('.card-thumb', 1, ['Meta']); await p.keyboard.press('Escape'); await p.keyboard.press('Meta+d'); await p.waitForTimeout(120);
check('a copy of a copy stays in the family ("All like this · 5")', (await scopeText()).includes('All like this · 5'), await scopeText());
for (let i = 0; i < 3; i++) { await p.keyboard.press('Meta+z'); await p.waitForTimeout(80); }
check('undo puts everything back', await same());

// Shapes you add: a family with their copies
await esc();
{ const c = await rect('.cta-primary'); await p.keyboard.press('KeyR'); await p.mouse.move(c.x + c.w + 30, c.y); await p.mouse.down(); await p.mouse.move(c.x + c.w + 60, c.y + 30, { steps: 3 }); await p.mouse.up(); await p.waitForTimeout(120); }
check('a new rectangle alone has no "All like this"', !(await scopeText()).includes('All like this ·') || (await st(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.scope').hidden)), await scopeText());
await p.keyboard.press('Meta+d'); await p.keyboard.press('Meta+d'); await p.waitForTimeout(120);
check('after two ⌘D, the rectangle family has 3', (await scopeText()).includes('All like this · 3'), await scopeText());
await clickScopeAll(); await setOpacity(30);
{ const o = await st(() => [...document.querySelectorAll('[data-em-new]')].map(n => getComputedStyle(n).opacity).join(','));
  check('All like this on a drawn shape changes it and its copies', o === '0.3,0.3,0.3', o); }
await clickScopeOne();
for (let i = 0; i < 4; i++) { await p.keyboard.press('Meta+z'); await p.waitForTimeout(80); }
check('undo removes them all', await same());

// "All like this" instances are framed exactly like the selection (handles + size label)
await esc(); await click('.card-title', 0, ['Meta']); await clickScopeAll(); await p.waitForTimeout(80);
{ const s = await st(() => { const r = document.querySelector('edit-mode-root').shadowRoot; const fs = [...r.querySelectorAll('.sibs .frame')]; const main = r.querySelector('.frame:not(.passive)');
    return { n: fs.length, handles: fs.map(f => f.querySelectorAll('.handle').length), border: fs[0] && getComputedStyle(fs[0]).borderTopStyle + ' ' + getComputedStyle(fs[0]).borderTopColor, mainBorder: getComputedStyle(main).borderTopStyle + ' ' + getComputedStyle(main).borderTopColor, label: fs[0]?.querySelector('.size')?.textContent }; });
  check('other instances get the same frame as the selection: border, 8 handles, size', s.n === 2 && s.handles.every(h => h === 8) && s.border === s.mainBorder && /×/.test(s.label || ''), JSON.stringify(s)); }
await clickScopeOne();

// DESIGN.md › Spacing & layout: the panel stays dense
await esc(); await click('.cta-primary', 0, ['Meta']); await p.waitForTimeout(80);
{ const d = await st(() => { const r = document.querySelector('edit-mode-root').shadowRoot; const c = (q) => getComputedStyle(r.querySelector(q));
    const icon = r.querySelector('.crow > .icon').getBoundingClientRect();
    return { side: r.querySelector('.side').getBoundingClientRect().width, field: r.querySelector('.field').getBoundingClientRect().height,
      row: c('.row').rowGap, crow: Math.min(...[...r.querySelectorAll('.crow')].filter(x => x.offsetParent).map(x => parseFloat(getComputedStyle(x).columnGap))),
      tight: [...r.querySelectorAll('.crow')].filter(x => x.offsetParent && parseFloat(getComputedStyle(x).columnGap) < 4).map(x => x.className + ' in ' + x.closest('section')?.querySelector('h4')?.textContent), icon: [icon.width, icon.height] }; });
  check('panel density (DESIGN.md): 252px panel, 28px fields, 8px rows, ≥4px in rows, 24×28 action slots',
    d.side === 252 && d.field === 28 && d.row === '8px' && d.crow >= 4 && d.icon[0] === 24 && d.icon[1] === 28, JSON.stringify(d)); }

// Efficiency: resizing (style edits every frame) doesn't rebuild the Layers tree
await esc(); await click('.cta-primary', 0, ['Meta']); await p.waitForTimeout(80);
{ await st(() => { window.__row0 = window.__editMode.layers.rowFor(document.querySelector('.cta-primary')); });
  const h = await st(() => { const b = document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame:not(.passive) .handle[data-dir="e"]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await p.mouse.move(...h); await p.mouse.down(); await p.mouse.move(h[0] + 60, h[1], { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(80);
  const same1 = await st(() => window.__row0 === window.__editMode.layers.rowFor(document.querySelector('.cta-primary')));
  check('resizing doesn’t rebuild Layers rows every frame', same1);
  await p.keyboard.press('Meta+z'); await p.waitForTimeout(80); }

// Gap is a plain input (no preset list); typing "auto" still works
await esc(); await click('.card-grid', 0, ['Meta']); await p.waitForTimeout(80);
{ const pick = await st(() => { const r = document.querySelector('edit-mode-root').shadowRoot; const f = r.querySelector('input[aria-label="Gap between children"]')?.closest('.field'); return f ? f.querySelectorAll('.pick').length : 'no gap field'; });
  check('Gap has no preset list', pick === 0, String(pick)); }

// Constrain proportions
await esc(); await click('.card-thumb', 1, ['Meta']); await p.waitForTimeout(80);
{ const ratioBtn = async () => { const b = await p.locator('edit-mode-root button[title="Constrain proportions"]').boundingBox(); await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await p.waitForTimeout(60); };
  const size = () => st(() => { const n = document.querySelectorAll('.card-thumb')[1]; return [n.offsetWidth, n.offsetHeight]; }); // CSS px (the canvas is zoomed)
  const [w0, h0] = await size(); const before = await st(() => window.__editMode.changes.count);
  await ratioBtn();
  check('locked W and H are visually linked', await st(() => { const f = document.querySelector('edit-mode-root').shadowRoot.querySelector('input[aria-label="Width"]').closest('.row'); return f.classList.contains('linked') && getComputedStyle(f, '::after').width === '8px'; }));
  check('constrain proportions turns on (and isn’t a pushed change)', await st(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('button[title="Constrain proportions"]').getAttribute('aria-pressed')) === 'true' && (await st(() => window.__editMode.changes.count)) === before);
  const W = p.locator('edit-mode-root input[aria-label="Width"]'); await W.fill(String(Math.round(w0 / 2))); await W.press('Enter'); await p.waitForTimeout(80);
  const [w1, h1] = await size();
  check('typing W also sets H, keeping the ratio', Math.abs(w1 / h1 - w0 / h0) < 0.02 && Math.abs(w1 - Math.round(w0 / 2)) < 1, `${w0}×${h0} → ${w1}×${h1}`);
  await p.keyboard.press('Escape'); await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);
  const [w2, h2] = await size();
  check('one ⌘Z undoes both W and H', Math.abs(w2 - w0) < 0.5 && Math.abs(h2 - h0) < 0.5, `${w2}×${h2}`);
  const hd = await st(() => { const b = document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame:not(.passive) .handle[data-dir="e"]').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await p.mouse.move(...hd); await p.mouse.down(); await p.mouse.move(hd[0] - 40, hd[1], { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(80);
  const [w3, h3] = await size();
  check('dragging a side handle keeps the ratio too', Math.abs(w3 / h3 - w0 / h0) < 0.03 && w3 < w0, `${w3}×${h3}`);
  await p.keyboard.press('Meta+z'); await ratioBtn();
  const H = p.locator('edit-mode-root input[aria-label="Height"]'); await H.fill('50'); await H.press('Enter'); await p.waitForTimeout(80);
  const [w4] = await size();
  check('turned off: H changes alone', Math.abs(w4 - w0) < 0.5, String(w4));
  await p.keyboard.press('Escape'); await p.keyboard.press('Meta+z'); await p.waitForTimeout(80); }

// ---------- Shift-click at the same depth ----------
await esc(); await click('.card-title', 0, ['Meta']);
{ const [x, y] = await ctr('.card-title', 2); await p.keyboard.down('Shift'); await p.mouse.move(x, y); await p.mouse.move(x + 1, y); await p.waitForTimeout(60);
  const hv = await st(() => window.__editMode.state.hovered?.className); await p.keyboard.up('Shift');
  check('holding Shift previews the same-depth element (another title)', hv === 'card-title', hv); }
await click('.card-title', 1, ['Shift']);
check('Shift-click another card’s title adds that title', (await multi()).join() === 'card-title,card-title', (await multi()).join());
{ const f = await st(() => { const r = document.querySelector('edit-mode-root').shadowRoot; const main = getComputedStyle(r.querySelector('.frame:not(.passive)'));
    return [...r.querySelectorAll('.multis .frame')].map(x => ({ h: x.querySelectorAll('.handle').length, b: getComputedStyle(x).borderTopStyle + getComputedStyle(x).borderTopColor === main.borderTopStyle + main.borderTopColor, l: /×/.test(x.querySelector('.size').textContent) })); });
  check('Shift-selected elements get the same frame as the selection (DESIGN.md)', f.length === 2 && f.every(x => x.h === 8 && x.b && x.l), JSON.stringify(f)); }
{ const r = await p.evaluate(() => { const t = document.querySelectorAll('.card-title')[1]; const row = window.__editMode.layers.rowFor(t); return row?.className; });
  check('Layers opens down to the added element too and marks it', !!r && r.includes('sel'), String(r)); }
await click('.card-meta', 2, ['Shift']);
check('Shift-click on a sibling-depth element in a 3rd card adds it', (await multi()).length === 3 && (await multi())[2] === 'card-meta', (await multi()).join());
await click('.badge', 0, ['Shift', 'Meta']);
check('⇧⌘-click adds exactly the deepest element', (await multi()).includes('badge'), (await multi()).join());
await click('.card-title', 1, ['Shift']);
check('Shift-click a selected one removes it', (await multi()).filter(c => c === 'card-title').length === 1, (await multi()).join());
await esc(); await click('.card', 0, ['Meta']); await p.keyboard.press('Escape'); await esc();
await click('.card-thumb', 0, ['Meta']); await p.keyboard.press('Escape'); // card
await click('.card-title', 2, ['Shift']);
check('with a card selected, Shift-click inside another card adds the card', (await multi()).join() === 'card,card', (await multi()).join());
await click('.hero-title', 0, ['Shift']);
check('Shift-click something shallower adds that element as is', (await multi()).includes('hero-title'), (await multi()).join());

// ---------- Outlines that used to get stuck ----------
await esc();
{ const [x, y] = await ctr('.hero-title'); await p.mouse.move(x, y); await p.mouse.move(x + 1, y); await p.waitForTimeout(60);
  const before = await st(() => window.__editMode.state.hovered?.className);
  await p.mouse.wheel(0, 260); await p.waitForTimeout(120);
  const after = await st(() => window.__editMode.state.hovered?.className);
  const under = await p.evaluate(([x, y]) => { for (const el of document.elementsFromPoint(x, y)) if (el.tagName !== 'EDIT-MODE-ROOT') return el.closest('.page > *')?.className ?? null; return null; }, [x + 1, y]);
  check('after scrolling, hover follows what’s under the pointer', after === under && after !== before, `${before} → ${after} (under: ${under})`);
  await p.mouse.wheel(0, -260); await p.waitForTimeout(80); }
{ const r = await p.evaluate(() => { const b = window.__editMode.layers.rowFor(document.querySelector('.hero')).getBoundingClientRect(); return [b.x + 80, b.y + b.height / 2]; });
  await p.mouse.move(...r); await p.waitForTimeout(60);
  const on = await st(() => window.__editMode.state.hovered?.className);
  await st(() => document.querySelector('.hero').classList.add('x-test')); await p.waitForTimeout(100); // the panel rebuilds
  await st(() => document.querySelector('.hero').classList.remove('x-test')); await p.waitForTimeout(100);
  const zb = await p.locator('edit-mode-root .zoom-btn').boundingBox(); await p.mouse.move(zb.x + 5, zb.y + 5); await p.waitForTimeout(80); // leave to the toolbar
  const off = await st(() => window.__editMode.state.hovered);
  check('hovering a Layers row, then leaving after a rebuild, clears the outline', on === 'hero' && off === null, `${on} → ${off}`); }
await esc(); await click('.section-title', 0, ['Meta']); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
check('Enter starts editing the title', await st(() => !!window.__editMode.state.editing));
await st(() => { const t = document.querySelector('.section-title'); t.replaceWith(t.cloneNode(true)); }); await p.waitForTimeout(120); // like a React re-render
check('if the page replaces the text being edited, editing ends (no stuck state)', await st(() => !window.__editMode.state.editing && !document.querySelector('edit-mode-root').shadowRoot.querySelector('.glass').hidden));

check('no page errors', !errors.length, errors.join('; '));
console.log(results.join('\n'));
await b.close();
