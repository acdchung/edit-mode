// Item 7: min / max width and height. Runs on the sample copy (5390).
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
const undoAll = async (to) => { for (let i = 0; i < 12 && (await html()) !== to; i++) await key('Meta+z'); return (await html()) === to; };
const field = (label) => p.locator(R(`input[aria-label="${label}"]`));
const shown = () => p.evaluate(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.row.limits > .f')].filter(f => !f.hidden && !f.closest('[hidden]')).map(f => f.querySelector('input').getAttribute('aria-label') + '@' + f.style.gridRow + '/' + f.style.gridColumn));
const menu = async (axis) => { await p.locator(R(`button[aria-label="${axis} sizing"]`)).click(); await p.waitForTimeout(100); return p.locator(R('.pop .pop-item')).allTextContents(); };
const choose = async (label) => { await p.locator(R('.pop .pop-item'), { hasText: label }).click(); await p.waitForTimeout(100); };

// A limit set in the code shows on its own: the page column's 960px max width.
await pick('.page'); await p.waitForTimeout(80);
let s = await shown();
check("the code's max width shows by itself, under W", s.join() === 'Maximum width@1/1' && (await field('Maximum width').inputValue()) === '960', s.join());
// Nothing set: no limit fields.
await pick('main .card'); await p.waitForTimeout(80);
check('nothing set: no limit fields', (await shown()).length === 0, (await shown()).join());
// Add min width / max width from the W menu.
let items = await menu('Width');
check('the W menu offers Add min / max width, after a divider', items.includes('Add min width') && items.includes('Add max width') && await p.locator(R('.pop .pop-sep')).count() === 1, items.join('|'));
await choose('Add max width');
const w = await p.$eval('main .card', e => Math.round(e.getBoundingClientRect().width));
s = await shown();
check('Add max width: a field at the current width', s.join() === 'Maximum width@1/1' && Math.round(+(await field('Maximum width').inputValue())) === w, `${s.join()} ${await field('Maximum width').inputValue()} vs ${w}`);
await field('Maximum width').fill('200'); await field('Maximum width').press('Enter'); await p.waitForTimeout(80);
check('typing a smaller max width shrinks it', Math.round(await p.$eval('main .card', e => e.getBoundingClientRect().width)) === 200);
check('…and W shows the real width', (await field('Width').inputValue()) === '200', await field('Width').inputValue());
items = await menu('Height');
await choose('Add min height');
s = await shown();
check('a min height goes under H, in the row above the max width', s.join() === 'Minimum height@1/2,Maximum width@2/1', s.join());
await field('Minimum height').fill('400'); await field('Minimum height').press('Enter'); await p.waitForTimeout(80);
check('the min height holds it at 400', Math.round(await p.$eval('main .card', e => e.getBoundingClientRect().height)) === 400);
// Resize handles respect them.
const hd = async (dir) => p.evaluate((dir) => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector(`.frame .handle[data-dir="${dir}"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, dir);
const [sx, sy] = await hd('s');
await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx, sy - 200, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(80);
check('dragging it shorter stops at the min height', Math.round(await p.$eval('main .card', e => e.getBoundingClientRect().height)) === 400);
const pushed = await p.evaluate(() => window.__editMode.changes.list().filter(c => c.kind === 'style').map(c => `${c.property}=${c.value}`));
check('Push gets the limits', pushed.includes('max-width=200px') && pushed.includes('min-height=400px'), pushed.join(','));
items = await menu('Width');
check('the menu now offers Remove max width', items.includes('Remove max width') && items.includes('Add min width'), items.join('|'));
await choose('Remove max width');
check('Remove max width: gone, the field too', (await p.$eval('main .card', e => getComputedStyle(e).maxWidth)) === 'none' && !(await shown()).some(x => x.startsWith('Maximum width')), (await shown()).join());
check('⌘Z steps back through it all', await undoAll(start));
// Removing the code's own limit overrides it (Push sees it).
await pick('.page'); await p.waitForTimeout(80);
await menu('Width'); await choose('Remove max width');
check("removing the code's max width overrides it", (await p.$eval('.page', e => getComputedStyle(e).maxWidth)) === 'none' && (await p.evaluate(() => window.__editMode.changes.list().some(c => c.property === 'max-width' && c.value === 'none'))));
check('⌘Z restores', await undoAll(start));
if (process.env.SHOT) {
  await pick('main .card'); await menu('Width'); await choose('Add max width'); await menu('Height'); await choose('Add min height');
  const r = await p.locator(R('section:has(h4:text-is("Layout"))')).boundingBox();
  await p.screenshot({ path: process.env.SHOT, clip: { x: r.x - 4, y: r.y - 4, width: r.width + 8, height: 220 } });
  await undoAll(start);
}

check('no page errors', !errors.length, errors.join(' | '));
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await b.close();
