// Color variables (2026-11-25): the Variables list with nothing selected, adding and
// renaming one, using it, changing one of the app's, saving across reloads, and Push.
// Run against the sample-app copy on port 5390 (COPY=<its folder> to clean up its variables.json).
import { chromium } from 'playwright-core';
import { rmSync } from 'node:fs';
const out = process.env.OUT; // optional: a folder for screenshots
if (process.env.COPY) rmSync(process.env.COPY + '/.editmode/variables.json', { force: true });
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); if (!sessionStorage.getItem('t')) { localStorage.removeItem('edit-mode:recent-colors'); localStorage.removeItem('edit-mode:color-tab'); sessionStorage.setItem('t', '1'); } } catch {} });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const pushed = [];
await p.route('**/@edit-mode/push', (route) => { pushed.push(JSON.parse(route.request().postData())); route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test: not sent"}' }); });
const check = (n, ok, d = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
const R = (f, a) => p.evaluate(f, a);
const root = 'document.querySelector("edit-mode-root").shadowRoot';
const rows = () => R(`[...${root}.querySelectorAll('section.vars .crow')].map((r) => r.querySelector('.vname').value + '=' + r.querySelector('.vhex').value)`);
const rowAt = async (name) => p.locator('edit-mode-root section.vars .crow').nth(await R(`[...${root}.querySelectorAll('section.vars .crow')].findIndex((r) => r.querySelector('.vname').value === ${JSON.stringify(name)})`));
const row = (name) => ({ locator: (q) => ({ boundingBox: async () => (await rowAt(name)).locator(q).boundingBox() }) });
const clickAt = async (loc) => { const bb = await loc.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(200); };
const type = async (loc, text) => { await clickAt(loc); await p.keyboard.press('Meta+a'); await p.keyboard.type(text); await p.keyboard.press('Enter'); await p.waitForTimeout(300); };
const shot = async (name) => { if (!out) return; const bb = await p.locator('edit-mode-root .side').boundingBox(); await p.screenshot({ path: `${out}/${name}.png`, clip: { x: bb.x - 4, y: bb.y - 4, width: bb.width + 8, height: bb.height + 8 } }); };

await p.goto('http://localhost:5390'); await p.waitForSelector('.card');
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(600);
const more = () => R(`(() => { const b = ${root}.querySelector('section.vars .sc-more'); return b && !b.hidden ? b.textContent : null; })()`);
const r3 = await rows();
check('the list starts with 3, then "See all 4"', r3.length === 3 && (await more()) === 'See all 4', `${r3.join(' ')} | ${await more()}`);
await clickAt(p.locator('edit-mode-root section.vars .sc-more'));
const r0 = await rows();
check('nothing selected: the app\'s color variables are listed', ['ink', 'muted', 'accent', 'surface'].every((n) => r0.some((r) => r.startsWith(n + '='))), r0.join(' '));
check('…not its non-colors (--radius)', !r0.some((r) => r.startsWith('radius=')));
await shot('vars-start');

// + adds one, with its name ready to type
await clickAt(p.locator('edit-mode-root section.vars .sh .add'));
const focused = await R(`${root}.activeElement?.className`);
check('+ adds --color-1 and focuses its name', (await rows()).some((r) => r.startsWith('color-1=')) && focused === 'vname', focused);
await p.keyboard.type('Brand Primary'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
check('renaming: "Brand Primary" becomes --brand-primary', (await rows()).some((r) => r.startsWith('brand-primary=')), (await rows()).join(' '));
await type(row('brand-primary').locator('.vhex'), '5b5bd6');
const live = await R(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim());
check('its color is live on the page', live.toLowerCase() === '#5b5bd6', live);
await shot('vars-added');

// It's in every color menu: use it as a card's fill
const r = await p.$eval('.card-thumb', (e) => { const r = e.getBoundingClientRect(); return [r.x + 10, r.y + 10]; });
await p.keyboard.down('Meta'); await p.mouse.click(r[0], r[1]); await p.keyboard.up('Meta'); await p.waitForTimeout(200);
await p.keyboard.press('Escape'); await p.waitForTimeout(300); // the card
await clickAt(p.locator('edit-mode-root section:has(h4:text-is("Fill")) .sh .add'));
await clickAt(p.locator('edit-mode-root section:has(h4:text-is("Fill")) .crow .swatch').last());
const tabsNow = await R(`[...${root}.querySelectorAll('.pop .cp-tabs button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')).join(' ')`);
check('the color menu has Variables and Recent tabs, Variables open', tabsNow === 'Variables* Recent', tabsNow);
const items = await R(`[...${root}.querySelectorAll('.pop .var-item')].map((b) => b.querySelector('.vn').textContent + ' ' + b.querySelector('.vh').textContent)`);
check('one variable per row, with its name and hex', items.includes('ink 1B1D1F') && items.includes('brand-primary 5B5BD6'), items.join(' | '));
if (out) { const bb = await p.locator('edit-mode-root .pop').boundingBox(); await p.screenshot({ path: `${out}/menu-vars.png`, clip: { x: bb.x - 4, y: bb.y - 4, width: bb.width + 8, height: bb.height + 8 } }); }
const sw = p.locator('edit-mode-root .pop .var-item[title="--brand-primary"]');
check('the new variable is in the color menu', await sw.count() === 1);
await clickAt(sw);
const bg = await R(() => document.querySelector('.card').style.getPropertyValue('background-color'));
check('picking it fills the card with var(--brand-primary)', bg === 'var(--brand-primary)', bg);
// Recent: a color picked from the page's colors shows up there next time
await clickAt(p.locator('edit-mode-root section:has(h4:text-is("Fill")) .crow .swatch').last());
await clickAt(p.locator('edit-mode-root .pop .cp-tabs button', { hasText: 'Recent' }));
const pageSw = p.locator('edit-mode-root .pop .sw-grid .sw').first();
const pageColor = await pageSw.evaluate((e) => e.title);
if (out) { const bb = await p.locator('edit-mode-root .pop').boundingBox(); await p.screenshot({ path: `${out}/menu-recent.png`, clip: { x: bb.x - 4, y: bb.y - 4, width: bb.width + 8, height: bb.height + 8 } }); }
await clickAt(pageSw);
await clickAt(p.locator('edit-mode-root section:has(h4:text-is("Fill")) .crow .swatch').last());
const rec = await R(`(() => { const t = [...${root}.querySelectorAll('.pop .pop-title')].map((x) => x.textContent); const g = ${root}.querySelector('.pop .sw-grid .sw'); return { tab: ${root}.querySelector('.pop .cp-tabs .on')?.textContent, titles: t.join(','), first: g?.title }; })()`);
check('the menu reopens on Recent, with the picked color first under "Recent"', rec.tab === 'Recent' && rec.titles.startsWith('Recent') && rec.first === pageColor, JSON.stringify(rec) + ' picked ' + pageColor);
await clickAt(p.locator('edit-mode-root .pop .cp-tabs button', { hasText: 'Variables' }));
await clickAt(p.locator('edit-mode-root .pop .var-item[title="--brand-primary"]'));

// In use: its name is locked and it can't be deleted
await p.keyboard.press('Escape'); await R(() => window.__editMode.select(null)); await p.waitForTimeout(300);
const used = await R(`(() => { const r = [...${root}.querySelectorAll('section.vars .crow')].find((r) => r.querySelector('.vname').value === 'brand-primary'); return { ro: r.querySelector('.vname').readOnly, x: getComputedStyle(r.querySelector('.icon')).visibility }; })()`);
check('in use: name locked, no delete', used.ro && used.x === 'hidden', JSON.stringify(used));
await type(row('brand-primary').locator('.vhex'), 'ff00aa');
const cardBg = await R(() => getComputedStyle(document.querySelector('.card')).backgroundColor);
check('changing the variable recolors what uses it', cardBg === 'rgb(255, 0, 170)', cardBg);

// Changing one of the app's own
const accent0 = await R(() => getComputedStyle(document.querySelector('.cta-primary')).backgroundColor);
await type(row('accent').locator('.vhex'), '00aa55');
const accent1 = await R(() => getComputedStyle(document.querySelector('.cta-primary')).backgroundColor);
check('changing --accent recolors the page', accent1 === 'rgb(0, 170, 85)', `${accent0} → ${accent1}`);
const xVis = await R(`getComputedStyle([...${root}.querySelectorAll('section.vars .crow')].find((r) => r.querySelector('.vname').value === 'accent').querySelector('.icon')).visibility`);
check('…and offers × to go back to the code\'s value', xVis === 'visible', xVis);
await shot('vars-changed');

// The pill counts them; Push sends them first
const n = await R(`[...${root}.querySelectorAll('button.act')].find((x) => x.textContent.startsWith('Push'))?.querySelector('.n')?.textContent`);
check('the Push pill counts 2 variables + 1 edit', n === '3', n);
await clickAt(p.locator('edit-mode-root button.act', { hasText: 'Push' }));
const dlg = await R(`[...${root}.querySelectorAll('.dialog h4.sec, .dialog li')].map((e) => e.textContent).slice(0, 4)`);
check('the Push dialog lists the variables first', dlg[0] === 'Variables' && /--brand-primary/.test(dlg.join('|')) && /--accent .* → #00AA55/.test(dlg.join('|')), dlg.join(' | '));
await clickAt(p.locator('edit-mode-root .dialog button', { hasText: 'Proceed' }));
await p.waitForTimeout(500);
const sent = pushed[0]?.changes || [];
check('Push sends the variables before the edits', sent[0]?.kind === 'variable' && sent[1]?.kind === 'variable' && sent.slice(2).every((c) => c.kind !== 'variable'), sent.map((c) => c.kind + ':' + (c.name || c.property)).join(', '));
const nv = sent.find((c) => c.name === '--brand-primary'); const ev = sent.find((c) => c.name === '--accent');
check('…a new one with its value, a changed one with its code value', nv?.added === true && nv.value === '#ff00aa' && ev?.added === false && ev.from === '#e2572b' && ev.value === '#00aa55', JSON.stringify([nv, ev]));
await p.keyboard.press('Escape');

// Saved: a reload keeps them
await p.reload(); await p.waitForSelector('.card'); await p.waitForTimeout(800);
await R(() => window.__editMode.select(null)); await p.waitForTimeout(300);
await clickAt(p.locator('edit-mode-root section.vars .sc-more'));
const after = await rows();
check('after a reload, the new and the changed variables are still there', after.includes('brand-primary=FF00AA') && after.includes('accent=00AA55'), after.join(' '));

// × puts the app's one back; a new unused one can be deleted
await clickAt(row('accent').locator('.icon'));
const back = await R(() => getComputedStyle(document.querySelector('.cta-primary')).backgroundColor);
check('× puts --accent back to the code\'s value', back === accent0, back);
await clickAt(p.locator('edit-mode-root section.vars .sh .add')); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
const before = (await rows()).length;
await clickAt(row('color-1').locator('.icon'));
check('a new unused variable can be deleted', (await rows()).length === before - 1 && !(await rows()).some((x) => x.startsWith('color-1=')));
await p.keyboard.press('Escape');

// Edit Mode off: the page is the code again
await R(() => window.__editMode.changes.discardAll?.());
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(400);
const off = await R(() => getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim());
check('Edit Mode off: the pending variables leave the page', off === '', off);
check('no page errors', !errs.length, errs[0]);
if (process.env.COPY) rmSync(process.env.COPY + '/.editmode/variables.json', { force: true });
await b.close();
