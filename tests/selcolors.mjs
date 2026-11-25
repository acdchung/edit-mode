// Selection colors (2026-11-25): every solid color inside the selection, one row per color;
// editing a row changes every use, one undo step. Run against the sample-app copy on port 5390.
import { chromium } from 'playwright-core';
const out = process.env.OUT; // optional: a folder for the panel screenshot
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const check = (n, ok, d = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
await p.goto('http://localhost:5390'); await p.waitForSelector('.card');
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(500);
const R = (f, a) => p.evaluate(f, a);
const sc = () => R(() => { const r = document.querySelector('edit-mode-root').shadowRoot; const s = [...r.querySelectorAll('section')].find(x => x.querySelector('h4')?.textContent === 'Selection colors'); return s && !s.hidden ? [...s.querySelectorAll('.crow')].map(c => c.querySelector('.hex').value + '×' + c.querySelector('.sc-n').textContent) : null; });
const click = async (q, mods = []) => { const r = await p.$eval(q, e => { const r = e.getBoundingClientRect(); return [r.x + 6, r.y + 6]; }); for (const m of mods) await p.keyboard.down(m); await p.mouse.click(r[0], r[1]); for (const m of mods) await p.keyboard.up(m); await p.waitForTimeout(300); };
await click('.card-thumb', ['Meta']); await p.keyboard.press('Escape'); await p.waitForTimeout(300); const sel = await R(() => window.__editMode.state.selected?.className);
const rows = await sc(); check('a card lists its colors', rows && rows.length >= 2, `${sel}: ${rows}`);
const bb = await p.locator('edit-mode-root .side').boundingBox();
if (out) await p.screenshot({ path: out + '/sc-card.png', clip: { x: bb.x - 4, y: bb.y - 4, width: bb.width + 8, height: bb.height + 8 } });
// edit the text color used by the card's meta (muted) to red
const muted = await R(() => getComputedStyle(document.querySelector('.card-meta')).color);
const before = await R(() => [...document.querySelectorAll('.card')][0].innerHTML);
const idx = await R((m) => { const r = document.querySelector('edit-mode-root').shadowRoot; const s = [...r.querySelectorAll('section')].find(x => x.querySelector('h4')?.textContent === 'Selection colors'); const c = document.createElement('div'); c.style.color = m; document.body.append(c); const rgb = getComputedStyle(c).color; c.remove(); return [...s.querySelectorAll('.crow')].findIndex(row => { const i = row.querySelector('.swatch i'); return getComputedStyle(i).backgroundColor === rgb; }); }, muted);
check('the muted text color has a row', idx >= 0, muted);
const hex = p.locator('edit-mode-root section:has(h4:text-is("Selection colors")) .crow').nth(idx).locator('.hex');
await hex.click(); await hex.fill('ff0000'); await hex.press('Enter'); await p.waitForTimeout(300);
const metaNow = await R(() => [...document.querySelector('.card').querySelectorAll('.card-meta')].map(e => getComputedStyle(e).color));
check('every use inside the card changed', metaNow.every(c => c === 'rgb(255, 0, 0)'), metaNow.join(','));
const other = await R(() => getComputedStyle(document.querySelectorAll('.card')[1].querySelector('.card-meta')).color);
check('other cards untouched (This one scope)', other === muted, other);
await p.keyboard.press('Escape'); await p.keyboard.press('Meta+KeyZ'); await p.waitForTimeout(300);
const back = await R(() => getComputedStyle(document.querySelector('.card .card-meta')).color);
check('one ⌘Z undoes it', back === muted, back);
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await click('h1', ['Meta']); check('a plain text layer hides the section', (await sc()) === null, await R(() => window.__editMode.state.selected?.tagName));
await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await click('.cta-primary', ['Meta']); await click('.card-meta', ['Meta', 'Shift']);
const m2 = await sc(); check('two separate layers selected show the section', !!m2 && m2.length >= 2, `${await R(() => window.__editMode.state.multi.length)} selected: ${m2}`);
check('no page errors', !errs.length, errs[0]);
await b.close();
