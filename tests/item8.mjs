// Item 8: effects, fills, strokes, rotation. Runs on the sample copy (5390).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
const html = () => p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''));
const start = await html();
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150);
const R = (q) => `edit-mode-root ${q}`;
const pick = (q) => p.evaluate((q) => window.__editMode.select(document.querySelector(q)), q);
const key = async (k) => { await p.keyboard.press(k); await p.waitForTimeout(60); };
const undoAll = async (to) => { for (let i = 0; i < 20 && (await html()) !== to; i++) await key('Meta+z'); return (await html()) === to; };
const btn = (label) => p.locator(R(`button[aria-label="${label}"]`)).first();
const field = (label) => p.locator(R(`input[aria-label="${label}"]`)).first();
const set = async (label, v) => { await field(label).fill(String(v)); await field(label).press('Enter'); await p.waitForTimeout(80); };
const css = (q) => p.$eval(q, e => { const c = getComputedStyle(e); return { shadow: c.boxShadow, filter: c.filter, backdrop: c.backdropFilter }; });
const rows = () => p.evaluate(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.fx-list > .fx')].map(f => (f.querySelector('.dd-label')?.textContent || '') + (f.classList.contains('off') ? ' (hidden)' : '')));
const typeTo = async (i, label) => { await p.locator(R('.fx-list > .fx')).nth(i).locator('.dd').click(); await p.waitForTimeout(80); await p.locator(R('.pop .pop-item'), { hasText: label }).first().click(); await p.waitForTimeout(100); };

// 8a. Effects.
await pick('main .card'); await p.waitForTimeout(80);
check('no effects: an empty list, + to add', (await rows()).length === 0 && await btn('Add effect').isVisible());
await btn('Add effect').click(); await p.waitForTimeout(80);
check('+ adds a drop shadow', (await rows()).join() === 'Drop shadow' && /0px 4px 4px/.test((await css('main .card')).shadow), (await css('main .card')).shadow);
await btn('Add effect').click(); await p.waitForTimeout(80);
await set('Shadow 2 Y offset', 12);
let c = await css('main .card');
check('a second shadow stacks', (await rows()).join() === 'Drop shadow,Drop shadow' && (c.shadow.match(/rgba/g) || []).length === 2 && /0px 12px/.test(c.shadow), c.shadow);
await typeTo(1, 'Inner shadow');
check('Inner shadow = inset', /inset/.test((await css('main .card')).shadow) && (await rows()).join() === 'Drop shadow,Inner shadow', (await css('main .card')).shadow);
await btn('Add effect').click(); await p.waitForTimeout(80);
await typeTo(2, 'Layer blur');
c = await css('main .card');
check('Layer blur = filter: blur(4px)', c.filter === 'blur(4px)' && (c.shadow.match(/rgba/g) || []).length === 2, JSON.stringify(c));
await set('Layer blur', 2);
check('its amount', (await css('main .card')).filter === 'blur(2px)');
await btn('Add effect').click(); await p.waitForTimeout(80);
await p.locator(R('.fx-list > .fx')).nth(2).locator('.dd').click(); await p.waitForTimeout(80);
const blurItem = p.locator(R('.pop .pop-item'), { hasText: 'Layer blur' }).first();
check('only one layer blur: greyed out with the reason', await blurItem.isDisabled() && /Already has a layer blur/.test(await blurItem.textContent()));
await p.locator(R('.pop .pop-item'), { hasText: 'Background blur' }).first().click(); await p.waitForTimeout(100);
c = await css('main .card');
check('Background blur = backdrop-filter', c.backdrop === 'blur(4px)' && (await rows()).join() === 'Drop shadow,Inner shadow,Layer blur,Background blur', `${c.backdrop} ${(await rows()).join()}`);
// Hide one shadow: it leaves the CSS, keeps its place; show it again.
await p.locator(R('.fx-list > .fx')).nth(0).locator('.crow > .icon').first().click(); await p.waitForTimeout(100);
c = await css('main .card');
check('hiding the first shadow takes it out of the CSS', (c.shadow.match(/rgba/g) || []).length === 1 && /inset/.test(c.shadow) && (await rows())[0] === 'Drop shadow (hidden)', `${c.shadow} | ${(await rows()).join()}`);
await p.locator(R('.fx-list > .fx')).nth(0).locator('.crow > .icon').first().click(); await p.waitForTimeout(100);
c = await css('main .card');
check('showing it puts it back in its place', /^rgba\(0, 0, 0, 0.25\) 0px 4px 4px/.test(c.shadow) && /inset/.test(c.shadow), c.shadow);
await btn('Remove layer blur').click(); await p.waitForTimeout(100);
check('× removes one (the layer blur)', (await css('main .card')).filter === 'none' && (await rows()).join() === 'Drop shadow,Inner shadow,Background blur', (await rows()).join());
const sent = await p.evaluate(() => window.__editMode.changes.list().filter(c => c.kind === 'style').map(c => c.property));
check('Push gets box-shadow and backdrop-filter (no stray filter)', sent.includes('box-shadow') && sent.includes('backdrop-filter') && !sent.includes('filter'), sent.join(','));
if (process.env.SHOT) { const r = await p.locator(R('section:has(h4:text-is("Effects"))')).boundingBox(); await p.screenshot({ path: process.env.SHOT, clip: { x: r.x - 4, y: r.y - 4, width: r.width + 8, height: r.height + 8 } }); }
check('⌘Z steps all the way back', await undoAll(start));
// An undo after hiding: the hidden shadow doesn't linger as a ghost row.
await pick('main .card'); await btn('Add effect').click(); await p.waitForTimeout(80);
await p.locator(R('.fx-list > .fx')).nth(0).locator('.crow > .icon').first().click(); await p.waitForTimeout(80);
await key('Meta+z'); await p.waitForTimeout(80);
check('undo after hiding: one visible shadow row, no ghost', (await rows()).join() === 'Drop shadow', (await rows()).join());
check('⌘Z restores', await undoAll(start));

// 8b. Stacked fills.
const img = () => p.$eval('main .card', e => getComputedStyle(e).backgroundImage);
const fillRows = () => p.evaluate(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.layers-list > [data-i]')].map(n => (n.classList.contains('grad') ? '*' : '') + (n.querySelector('.kind .dd-label')?.textContent || '') + (n.classList.contains('off') ? '(hidden)' : '')));
await pick('main .card'); await p.waitForTimeout(80);
check('a card without a fill: no layers yet', (await fillRows()).length === 0 && (await img()) === 'none');
await btn('Add fill').click(); await p.waitForTimeout(100);
check('+ on nothing: a plain white fill', (await p.$eval('main .card', e => getComputedStyle(e).backgroundColor)) === 'rgb(255, 255, 255)' && (await img()) === 'none');
await btn('Add fill').click(); await p.waitForTimeout(100);
check('+ adds a solid fill on top of the white', /^linear-gradient\(rgb\(217, 217, 217\), rgb\(217, 217, 217\)\)$/.test(await img()) && (await fillRows()).join() === '*Solid', `${await img()} | ${(await fillRows()).join()}`);
const lc = field('Layer color');
await lc.fill('FF0000'); await lc.press('Enter'); await p.waitForTimeout(80);
check("a solid layer's colour", /rgb\(255, 0, 0\), rgb\(255, 0, 0\)/.test(await img()), await img());
await p.locator(R('.layers-list > .grad .kind')).click(); await p.waitForTimeout(80);
await p.locator(R('.pop .pop-item'), { hasText: 'Linear' }).first().click(); await p.waitForTimeout(100);
check('its type menu turns it into a gradient', /^linear-gradient\(rgb\(255, 0, 0\) 0%/.test(await img()) && (await fillRows()).join() === '*Linear', `${await img()} | ${(await fillRows()).join()}`);
await btn('Add fill').click(); await p.waitForTimeout(100);
let fr = await fillRows();
check('another + stacks a solid on top; the gradient becomes a row below', fr.join() === '*Solid,Linear' && /^linear-gradient\(rgb\(217, 217, 217\), rgb\(217, 217, 217\)\), linear-gradient\(rgb\(255, 0, 0\)/.test(await img()), `${fr.join()} | ${await img()}`);
await p.locator(R('.layers-list > .flrow')).first().locator('.icon').first().click(); await p.waitForTimeout(100);
check('hiding the lower layer takes it out of the CSS, keeps its row', (await fillRows()).join() === '*Solid,Linear(hidden)' && !/255, 0, 0/.test(await img()), `${(await fillRows()).join()} | ${await img()}`);
await p.locator(R('.layers-list > .flrow')).first().locator('.icon').first().click(); await p.waitForTimeout(100);
check('showing it puts it back below', /217\)\), linear-gradient\(rgb\(255, 0, 0\)/.test(await img()), await img());
// Drag the lower row above the top one.
const k1 = await p.locator(R('.layers-list > .flrow .kind')).first().boundingBox();
const top = await p.locator(R('.layers-list > .grad')).boundingBox();
await p.mouse.move(k1.x + 20, k1.y + k1.height / 2); await p.mouse.down();
await p.mouse.move(k1.x + 20, top.y + 4, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(150);
check('dragging a row restacks the layers', /^linear-gradient\(rgb\(255, 0, 0\)/.test(await img()) && (await fillRows()).join() === '*Linear,Solid', `${(await fillRows()).join()} | ${await img()}`);
await p.locator(R('.layers-list > .flrow .kind')).first().click(); await p.waitForTimeout(100);
check('clicking a row opens it for editing', (await fillRows()).join() === 'Linear,*Solid', (await fillRows()).join());
await btn('Remove gradient or image').click(); await p.waitForTimeout(100);
check('× removes the open layer', (await fillRows()).join() === '*Linear' && !/217/.test(await img()), `${(await fillRows()).join()} | ${await img()}`);
check('the white solid stays underneath', (await p.$eval('main .card', e => getComputedStyle(e).backgroundColor)) === 'rgb(255, 255, 255)');
check('Push gets background-image', await p.evaluate(() => window.__editMode.changes.list().some(c => c.property === 'background-image')));
if (process.env.SHOT) { await btn('Add fill').click(); await p.waitForTimeout(100); const r = await p.locator(R('section:has(h4:text-is("Fill"))')).boundingBox(); await p.screenshot({ path: process.env.SHOT.replace(/\.png$/, '') + '-fill.png', clip: { x: r.x - 4, y: r.y - 4, width: r.width + 8, height: r.height + 8 } }); }
check('⌘Z steps all the way back', await undoAll(start));

check('no page errors', !errors.length, errors.join(' | '));
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await b.close();
