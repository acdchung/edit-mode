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

// 8c. Stroke style: solid, dashed, dotted.
const ddPick = async (title, label) => { await p.locator(R(`button[aria-label="${title}"]`)).first().click(); await p.waitForTimeout(80); await p.locator(R('.pop .pop-item'), { hasText: label }).first().click(); await p.waitForTimeout(100); };
const sides = () => p.$eval('main .card', e => { const c = getComputedStyle(e); return ['top', 'right', 'bottom', 'left'].map(s => c.getPropertyValue(`border-${s}-style`)).join(' ') + ' | outline ' + c.outlineStyle; });
await pick('main .card'); await p.waitForTimeout(80);
const ddLabel = (title) => p.locator(R(`button[aria-label="${title}"] .dd-label`)).first().textContent();
check('the card\'s stroke reads Solid', (await ddLabel('Stroke style')) === 'Solid', await ddLabel('Stroke style'));
await ddPick('Stroke style', 'Dashed');
check('Dashed: every side', (await sides()) === 'dashed dashed dashed dashed | outline none', await sides());
await ddPick('Stroke style', 'Dotted');
check('Dotted', (await sides()).startsWith('dotted dotted dotted dotted'), await sides());
if (process.env.SHOT) { await ddPick('Stroke style', 'Dashed'); const r = await p.locator(R('section:has(h4:text-is("Stroke"))')).boundingBox(); await p.screenshot({ path: process.env.SHOT.replace(/\.png$/, '') + '-stroke.png', clip: { x: r.x - 4, y: r.y - 4, width: r.width + 8, height: r.height + 8 } }); const c2 = await p.locator('main .card').first().boundingBox(); await p.screenshot({ path: process.env.SHOT.replace(/\.png$/, '') + '-card.png', clip: { x: c2.x - 10, y: c2.y - 10, width: c2.width + 20, height: c2.height + 20 } }); await ddPick('Stroke style', 'Dotted'); }
await ddPick('Stroke position', 'Outside');
check('Outside keeps the style (an outline)', (await sides()) === 'none none none none | outline dotted', await sides());
await ddPick('Stroke position', 'Inside');
await p.locator(R('button[aria-label="Stroke sides"]')).click(); await p.waitForTimeout(80);
await p.locator(R('.pop .pop-item'), { hasText: 'Bottom' }).first().click(); await p.waitForTimeout(100);
await ddPick('Stroke style', 'Dashed');
check('one side: only that side changes', (await sides()) === 'none none dashed none | outline none', await sides());
check('Push gets the border style', await p.evaluate(() => window.__editMode.changes.list().some(c => /border.*style/.test(c.property))));
check('⌘Z steps all the way back', await undoAll(start));

// 8d. Rotation and flip.
const tf = (q) => p.$eval(q, e => { const c = getComputedStyle(e); return `${c.rotate}|${c.scale}`; });
await pick('.cta-primary'); await p.waitForTimeout(80);
check('Rotation reads 0', (await field('Rotation').inputValue()) === '0', await field('Rotation').inputValue());
await set('Rotation', 15);
check('15° in the field turns it counter-clockwise (Figma): CSS rotate −15deg', (await tf('.cta-primary')) === '-15deg|none', await tf('.cta-primary'));
await btn('Rotate 90° right').click(); await p.waitForTimeout(80);
check('Rotate 90° right', (await tf('.cta-primary')) === '75deg|none' && (await field('Rotation').inputValue()) === '-75', `${await tf('.cta-primary')} ${await field('Rotation').inputValue()}`);
await set('Rotation', 0);
check('0 takes the rotation off', (await tf('.cta-primary')).startsWith('none') || (await tf('.cta-primary')).startsWith('0deg'), await tf('.cta-primary'));
await btn('Flip horizontal').click(); await p.waitForTimeout(80);
check('Flip horizontal = scale -1 1', (await tf('.cta-primary')).endsWith('|-1 1'), await tf('.cta-primary'));
await btn('Flip vertical').click(); await p.waitForTimeout(80);
check('then Flip vertical = -1 -1 (Chrome writes it "-1")', /\|-1( -1)?$/.test(await tf('.cta-primary')), await tf('.cta-primary'));
await btn('Flip horizontal').click(); await p.waitForTimeout(80); await btn('Flip vertical').click(); await p.waitForTimeout(80);
check('flipping back leaves nothing behind', (await tf('.cta-primary')).endsWith('|none') && !(await p.evaluate(() => window.__editMode.changes.list().some(c => c.property === 'scale'))), await tf('.cta-primary'));
// Drag the zone just outside a corner: a quarter turn clockwise, ⇧ snaps to 15°.
const zone = await p.evaluate(() => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame .rot[data-dir="ne"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const bb = await p.locator('.cta-primary').boundingBox();
const [cx, cy] = [bb.x + bb.width / 2, bb.y + bb.height / 2];
const ang = Math.atan2(zone[1] - cy, zone[0] - cx); const rad = Math.hypot(zone[0] - cx, zone[1] - cy);
await p.mouse.move(...zone); await p.keyboard.down('Shift'); await p.mouse.down();
for (let i = 1; i <= 8; i++) { const a = ang + (Math.PI / 2) * (i / 8); await p.mouse.move(cx + rad * Math.cos(a), cy + rad * Math.sin(a)); }
await p.mouse.up(); await p.keyboard.up('Shift'); await p.waitForTimeout(100);
check('dragging a corner zone a quarter turn with ⇧: 90° clockwise', (await tf('.cta-primary')).startsWith('90deg') && (await field('Rotation').inputValue()) === '-90', `${await tf('.cta-primary')} ${await field('Rotation').inputValue()}`);
const props = await p.evaluate(() => window.__editMode.changes.list().map(c => c.property));
check('Push gets rotate', props.includes('rotate'), props.join(','));
const own = await p.$eval('.cta-primary', e => [e.offsetWidth, e.offsetHeight]);
const wh = [Math.round(+(await field('Width').inputValue())), Math.round(+(await field('Height').inputValue()))];
check("rotated: W/H show the layer's own size, not its tilted footprint", Math.abs(wh[0] - own[0]) <= 1 && Math.abs(wh[1] - own[1]) <= 1, `${wh} vs ${own}`);
if (process.env.SHOT) {
  await set('Rotation', -12);
  const r = await p.locator(R('section:has(h4:text-is("Layout"))')).boundingBox();
  await p.screenshot({ path: process.env.SHOT.replace(/\.png$/, '') + '-rot.png', clip: { x: r.x - 4, y: r.y - 4, width: r.width + 8, height: 200 } });
  await p.evaluate(() => document.querySelector('edit-mode-root').style.visibility = 'hidden');
  const hb = await p.locator('.hero').boundingBox();
  await p.screenshot({ path: process.env.SHOT.replace(/\.png$/, '') + '-hero.png', clip: { x: hb.x, y: hb.y, width: hb.width, height: hb.height } });
  await p.evaluate(() => document.querySelector('edit-mode-root').style.visibility = '');
}
check('⌘Z steps all the way back', await undoAll(start));

check('no page errors', !errors.length, errors.join(' | '));
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await b.close();
