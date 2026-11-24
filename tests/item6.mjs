// Item 6: text. Runs on the sample copy (5390).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
// Fonts on this computer (6e): a fixed list stands in for Chrome's (its permission prompt can't be answered in a test).
await p.addInitScript(() => { window.queryLocalFonts = async () => [['Avenir Next', 'Regular'], ['Avenir Next', 'Demi Bold'], ['Avenir Next', 'Demi Bold Italic'], ['Menlo', 'Regular'], ['.SF NS', 'Regular']].map(([family, style]) => ({ family, style, fullName: `${family} ${style}`, postscriptName: family })); });
const pushed = [];
// Google Fonts (6f): a small list instead of the real 1,900, and no real font files.
await p.route('**/google-font-metadata@*/data/api-response.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify([
  { family: 'Inter', variants: ['regular', 'italic', '600', '700', '700italic'], category: 'sans-serif' },
  { family: 'Menlo', variants: ['regular'], category: 'monospace' }, // also on "this computer": listed once
  { family: 'Lora', variants: ['regular'], category: 'serif' }]) }));
const fontCss = [];
await p.route('https://fonts.googleapis.com/**', (r) => { fontCss.push(r.request().url()); r.fulfill({ contentType: 'text/css', body: '' }); });
await p.route('**/@edit-mode/push', (route) => { pushed.push(JSON.parse(route.request().postData())); route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test: not sent"}' }); });
await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
const html = () => p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''));
const start = await html();
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150);
const editing = () => p.evaluate(() => !!window.__editMode.state.editing);
const pick = (q) => p.evaluate((q) => window.__editMode.select(document.querySelector(q)), q);
const textList = () => p.evaluate(() => window.__editMode.changes.list().filter(c => c.kind === 'text').map(c => c.to));

// 6a. Enter is a new line; Esc finishes.
const title = await p.$eval('.hero-title', e => e.textContent);
const h0 = await p.$eval('.hero-title', e => e.offsetHeight);
await pick('.hero-title'); await p.waitForTimeout(50);
await p.keyboard.press('Enter'); await p.waitForTimeout(50);
check('Enter on selected text starts editing', await editing());
await p.keyboard.press('End'); await p.keyboard.press('Meta+ArrowDown');
await p.keyboard.press('Enter'); await p.keyboard.type('second line');
check('Enter while editing keeps editing', await editing());
await p.keyboard.press('Escape'); await p.waitForTimeout(80);
check('Esc finishes', !(await editing()));
const after = await p.$eval('.hero-title', e => ({ brs: e.querySelectorAll('br').length, h: e.offsetHeight, kids: e.childNodes.length }));
check('the line break is a <br> on the page', after.brs === 1, JSON.stringify(after));
check('the text got taller', after.h > h0, `${h0} → ${after.h}`);
const list = await textList();
check('Push gets the break as \\n', list.length === 1 && list[0] === `${title}\nsecond line`, JSON.stringify(list));
await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);
check('one ⌘Z restores the page exactly', (await html()) === start);
await p.keyboard.press('Meta+Shift+z'); await p.waitForTimeout(80);
check('⌘⇧Z brings the line back', (await p.$eval('.hero-title', e => e.querySelectorAll('br').length)) === 1);
await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);

// ⌘Enter also finishes.
await pick('.hero-title'); await p.keyboard.press('Enter'); await p.waitForTimeout(50);
await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(80);
check('⌘Enter finishes', !(await editing()));
check('…and changes nothing', (await html()) === start);

// Text that already has a <br> in the code is editable, and its own nodes stay.
await p.evaluate(() => {
  const h = document.createElement('h2'); h.className = 'lines'; h.setAttribute('data-src', 'src/App.jsx:99:1');
  h.append('One', document.createElement('br'), 'Two');
  document.querySelector('.hero').append(h);
  window.__nodes = [...h.childNodes];
});
await p.waitForTimeout(100);
const start2 = await html();
const textState = () => p.evaluate(() => { const h = document.querySelector('.lines'); return {
  kids: [...h.childNodes].length, own: window.__nodes.every(n => n.parentNode === h),
  shown: h.innerText.replace(/\n+/g, '|'), layerRow: !!window.__editMode.layers.rowFor?.(h.querySelector('br')) }; });
await pick('.lines'); await p.keyboard.press('Enter'); await p.waitForTimeout(50);
check('text with a <br> starts editing', await editing());
await p.keyboard.press('Meta+a'); await p.keyboard.type('Solo'); await p.keyboard.press('Escape'); await p.waitForTimeout(80);
let s = await textState();
check('one line now', s.shown === 'Solo', JSON.stringify(s));
check("the code's own nodes are still there (React keeps working)", s.own, JSON.stringify(s));
await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);
s = await textState();
check('⌘Z: two lines again', s.shown === 'One|Two', JSON.stringify(s));
check('⌘Z restores the page exactly', (await html()) === start2);
await pick('.lines'); await p.keyboard.press('Enter'); await p.waitForTimeout(50);
await p.keyboard.press('Meta+ArrowDown'); await p.keyboard.press('Enter'); await p.keyboard.type('Three'); await p.keyboard.press('Escape'); await p.waitForTimeout(80);
s = await textState();
check('a third line adds one', s.shown === 'One|Two|Three' && s.own, JSON.stringify(s));
check('a <br> is not a layer', !s.layerRow);
await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);
check('⌘Z restores it', (await html()) === start2);

// 6b. Resizing: Auto width / Auto height / Fixed size.
const R = (q) => `edit-mode-root ${q}`;
const btn = (label) => p.locator(R(`button[aria-label="${label}"]`)).first();
const mode = () => p.evaluate(() => window.__editMode.panel.textResizingOf(window.__editMode.state.selected));
const inline = (prop) => p.evaluate((prop) => window.__editMode.state.selected.style.getPropertyValue(prop), prop);
const undoAll = async (to) => { for (let i = 0; i < 12 && (await html()) !== to; i++) { await p.keyboard.press('Meta+z'); await p.waitForTimeout(60); } return (await html()) === to; };
const handle = async (dir) => p.evaluate((dir) => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector(`.frame .handle[data-dir="${dir}"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, dir);
await pick('.hero-title'); await p.waitForTimeout(80);
check('a title filling its column reads Auto height', (await mode()) === 'auto-height', await mode());
check('vertical align is greyed out unless Fixed size', await btn('Align text middle').isDisabled());
await btn('Auto width').click(); await p.waitForTimeout(80);
check('Auto width: one line that hugs', (await mode()) === 'auto-width' && /nowrap/.test(await inline('white-space')) && (await inline('width')) === 'fit-content', `${await mode()} ${await inline('white-space')} ${await inline('width')}`);
const w1 = await p.$eval('.hero-title', e => e.offsetWidth);
const [hx, hy] = await handle('w'); // the left edge: the right one sits under the properties panel
await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx + w1 * 0.4, hy, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(80);
check('dragging a side of one-line text makes it wrap (Auto height)', (await mode()) === 'auto-height' && (await p.$eval('.hero-title', e => e.offsetHeight)) > 60, `${await mode()} h=${await p.$eval('.hero-title', e => e.offsetHeight)} w=${w1}→${await p.$eval('.hero-title', e => e.offsetWidth)} ws=${await inline('white-space')} width=${await inline('width')}`);
await p.mouse.dblclick(...(await handle('w'))); await p.waitForTimeout(80);
check('double-click a side: Auto width again', (await mode()) === 'auto-width', await mode());
check('⌘Z steps back through it all', await undoAll(start2));
await pick('.hero-title'); await p.waitForTimeout(50);
await btn('Fixed size').click(); await p.waitForTimeout(80);
check('Fixed size: height set', (await mode()) === 'fixed' && /px$/.test(await inline('height')), await inline('height'));
check('vertical align is on with Fixed size', !(await btn('Align text middle').isDisabled()));
await p.evaluate(() => window.__editMode.panel.sizeOf(window.__editMode.state.selected, 'one', 'height', 200)); await p.waitForTimeout(60);
const textTop = () => p.$eval('.hero-title', e => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().top - e.getBoundingClientRect().top); });
const t0 = await textTop();
await btn('Align text middle').click(); await p.waitForTimeout(80);
const t1 = await textTop();
await btn('Align text bottom').click(); await p.waitForTimeout(80);
const t2 = await textTop();
check('Align middle / bottom move the text down the box', t0 < 5 && t1 > t0 + 20 && t2 > t1 + 20, `${t0} ${t1} ${t2}`);
await btn('Align text top').click(); await p.waitForTimeout(80);
check('Align top puts it back (no leftover style)', (await textTop()) === t0 && !(await inline('align-content')), await inline('align-content'));
await p.mouse.dblclick(...(await handle('s'))); await p.waitForTimeout(80);
check('double-click the bottom: Auto height', (await mode()) === 'auto-height', await mode());
check('⌘Z restores the page', await undoAll(start2));

// 6d. Type details: decoration, case, truncate.
await pick('.hero-title'); await p.waitForTimeout(50);
await btn('Type details').click(); await p.waitForTimeout(80);
check('⋯ opens Type details', await p.locator(R('.pop.details')).isVisible());
await btn('Underline').click(); await p.waitForTimeout(60);
await btn('Uppercase').click(); await p.waitForTimeout(60);
const cs = () => p.$eval('.hero-title', e => { const c = getComputedStyle(e); return { d: c.textDecorationLine, t: c.textTransform, clamp: c.webkitLineClamp, h: e.offsetHeight }; });
let c = await cs();
check('underline and uppercase', c.d === 'underline' && c.t === 'uppercase', JSON.stringify(c));
check('the menu shows them on', await btn('Underline').evaluate(b => b.classList.contains('on')) && await btn('Uppercase').evaluate(b => b.classList.contains('on')));
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, clip: { x: 900, y: 0, width: 380, height: 1000 } });
const h1 = (await cs()).h;
await p.evaluate(() => window.__editMode.panel.sizeOf(window.__editMode.state.selected, 'one', 'width', 260)); await p.waitForTimeout(60); // wraps to several lines
await p.locator(R('.pop.details .checkrow')).click(); await p.waitForTimeout(80);
c = await cs();
check('Truncate text: one line', c.clamp === '1' && c.h < h1, JSON.stringify(c));
const oneLine = c.h;
const ml = p.locator(R('input[aria-label="Max lines"]'));
await ml.fill('2'); await ml.press('Enter'); await p.waitForTimeout(80);
c = await cs();
check('Max lines 2: two lines', c.clamp === '2' && Math.abs(c.h - 2 * oneLine) < 4, JSON.stringify(c));
const styled = await p.evaluate(() => window.__editMode.changes.list().filter(c => c.kind === 'style').map(c => c.property));
check('Push lists them as style changes', ['text-decoration-line', 'text-transform', '-webkit-line-clamp'].every(x => styled.includes(x)), styled.join(','));
await p.locator(R('.pop.details .checkrow')).click(); await p.waitForTimeout(80);
check('unticking Truncate removes it', (await cs()).clamp === 'none' && !(await inline('display')), JSON.stringify(await cs()));
await p.keyboard.press('Escape');
check('⌘Z restores the page', await undoAll(start2));

// New text starts as Auto width.
await p.evaluate(() => document.querySelector('.lines').remove());
{ const c2 = await p.$eval('.cta-primary', e => { const r = e.getBoundingClientRect(); return [r.x + 5, r.bottom + 30]; });
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.keyboard.press('KeyT'); await p.mouse.click(...c2); await p.keyboard.type('Hi'); await p.keyboard.press('Escape'); await p.waitForTimeout(80);
  check('new text is Auto width', (await mode()) === 'auto-width', `${await mode()} ${await p.evaluate(() => { const s = window.__editMode.state.selected; return s.outerHTML.slice(0, 200); })}`);
  check('⌘Z removes it', await undoAll(start)); }

// 6e. Fonts: the page's first, then this computer's; a font's own styles; Push marks fonts the code doesn't load.
{ await pick('.hero-title'); await p.waitForTimeout(60);
  await btn('Fonts').click(); await p.waitForTimeout(150);
  const groups = () => p.evaluate(() => { const l = document.querySelector('edit-mode-root').shadowRoot.querySelector('.pop.fonts .font-list'); const out = []; for (const n of l.children) n.classList.contains('pop-title') ? out.push([n.textContent]) : out.at(-1)?.push(n.textContent); return out; });
  let g = await groups();
  check('font list: the page first, then this computer (hidden system fonts left out)', g[0]?.[0] === 'On this page' && g[0].length > 1 && g[1]?.[0] === 'On your computer' && g[1].includes('Avenir Next') && g[1].includes('Menlo') && !g.flat().includes('.SF NS'), JSON.stringify(g));
  check('the search field has focus', await p.evaluate(() => document.querySelector('edit-mode-root').shadowRoot.activeElement?.getAttribute('aria-label')) === 'Search fonts');
  await p.keyboard.type('aven'); await p.waitForTimeout(60);
  g = await groups();
  check('search filters', JSON.stringify(g) === JSON.stringify([['On your computer', 'Avenir Next']]), JSON.stringify(g));
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  check('Enter picks it', (await p.$eval('.hero-title', e => getComputedStyle(e).fontFamily)).startsWith('"Avenir Next"'), await p.$eval('.hero-title', e => getComputedStyle(e).fontFamily));
  check('a Bold title moves to the nearest style the font has (Demi Bold)', (await p.$eval('.hero-title', e => getComputedStyle(e).fontWeight)) === '600');
  await btn('Font weight').click(); await p.waitForTimeout(100);
  const items = await p.locator(R('.pop .pop-item')).allTextContents();
  check("the style menu lists the font's own styles", items.join('|') === 'Regular|Demi Bold|Demi Bold Italic', items.join('|'));
  await p.locator(R('.pop .pop-item'), { hasText: 'Demi Bold Italic' }).click(); await p.waitForTimeout(80);
  const st = await p.$eval('.hero-title', e => { const c = getComputedStyle(e); return c.fontWeight + ' ' + c.fontStyle; });
  check('Demi Bold Italic → weight 600, italic', st === '600 italic', st);
  await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(250);
  const rows = await p.locator(R('.dialog .list li')).allTextContents();
  check('the Push list says the font is installed on this computer only', rows.some(r => /Font.*Avenir Next.*installed on your computer only/i.test(r)), rows.join(' / '));
  check('…and only for the font', rows.filter(r => /installed on your computer only/.test(r)).length === 1, rows.join(' / '));
  await p.locator(R('.dialog .pbtn.primary')).click(); await p.waitForTimeout(400);
  const sent = pushed.at(-1)?.changes || [];
  check('Push tells Claude (fontNotLoaded)', sent.some(c => c.property === 'font-family' && c.fontNotLoaded === true) && !sent.some(c => c.property !== 'font-family' && c.fontNotLoaded), JSON.stringify(sent.map(c => [c.property, c.fontNotLoaded])));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  // A font the page loads is not marked; other fonts get the nine weights, each also italic.
  await pick('.cta-primary'); await p.waitForTimeout(60);
  await btn('Font weight').click(); await p.waitForTimeout(100);
  const gen = await p.locator(R('.pop .pop-item')).allTextContents();
  check('a font not on this computer: nine weights, each also italic', gen.length === 18 && gen.includes('Bold Italic') && gen.includes('Italic'), gen.join('|'));
  await p.keyboard.press('Escape');
  check('⌘Z restores the page', await undoAll(start)); }

// 6f. Google Fonts: a third group; picking one loads it; Push says where it's from.
{ await pick('.hero-title'); await p.waitForTimeout(60);
  await btn('Fonts').click(); await p.waitForTimeout(200);
  const groups = () => p.evaluate(() => { const l = document.querySelector('edit-mode-root').shadowRoot.querySelector('.pop.fonts .font-list'); const out = []; for (const n of l.children) n.classList.contains('pop-title') ? out.push([n.textContent]) : out.at(-1)?.push(n.textContent); return out; });
  let g = await groups();
  const google = g.find(x => x[0] === 'Google Fonts') || [];
  check('Google Fonts is the third group, without fonts listed above', g.length === 3 && g[2][0] === 'Google Fonts' && google.join('|') === 'Google Fonts|Inter|Lora', JSON.stringify(g));
  await p.keyboard.type('inter'); await p.keyboard.press('Enter'); await p.waitForTimeout(120);
  const link = await p.evaluate(() => document.querySelector('link[data-em-font="Inter"]')?.href || '');
  check('picking it loads it on the page, with all its styles', /family=Inter:ital,wght@0,400;0,600;0,700;1,400;1,700/.test(decodeURIComponent(link)), link);
  check('…and the title uses it', (await p.$eval('.hero-title', e => getComputedStyle(e).fontFamily)).startsWith('Inter'));
  await btn('Font weight').click(); await p.waitForTimeout(100);
  const items = await p.locator(R('.pop .pop-item')).allTextContents();
  check("the style menu lists Google's styles for it", items.join('|') === 'Regular|Italic|Semi Bold|Bold|Bold Italic', items.join('|'));
  await p.keyboard.press('Escape');
  await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(250);
  const rows = await p.locator(R('.dialog .list li')).allTextContents();
  check('the Push list says it comes from Google Fonts', rows.some(r => /Inter.*from Google Fonts/.test(r)) && !rows.some(r => /installed on your computer/.test(r)), rows.join(' / '));
  await p.locator(R('.dialog .pbtn.primary')).click(); await p.waitForTimeout(400);
  const sent = pushed.at(-1)?.changes || [];
  check('Push tells Claude (fontSource: google)', sent.some(c => c.property === 'font-family' && c.fontNotLoaded && c.fontSource === 'google'), JSON.stringify(sent.filter(c => c.property === 'font-family')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  check('⌘Z restores the page', await undoAll(start));
  // After a reload, Google fonts used in inline styles (canvas designs) load again.
  await p.reload(); await p.waitForSelector('.hero-title'); await p.waitForTimeout(500);
  const back = await p.evaluate(async () => {
    const d = document.createElement('div'); d.style.fontFamily = '"Lora", serif'; d.textContent = 'x'; document.body.append(d);
    (await import('/@edit-mode/fonts.js')).restoreFonts();
    await new Promise(r => setTimeout(r, 400)); d.remove();
    return !!document.querySelector('link[data-em-font="Lora"]');
  });
  check('after a reload, Google fonts in use load again', back);
  await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(100); await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150); }

// A <br /> written in the code (COPY=<sample copy dir>: edits its Hero.jsx, then restores it).
if (process.env.COPY) {
  const fs = await import('node:fs');
  const file = `${process.env.COPY}/src/components/Hero.jsx`;
  const orig = fs.readFileSync(file, 'utf8');
  try {
    await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150); // off, so the change reloads
    fs.writeFileSync(file, orig.replace('Climb something new this weekend', 'Climb something new<br />this weekend'));
    await p.waitForTimeout(600); await p.reload(); await p.waitForSelector('.hero-title br', { state: 'attached' });
    if (!(await p.evaluate(() => window.__editMode?.state.on))) { await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150); }
    const start3 = await html();
    const lines = () => p.$eval('.hero-title', e => e.innerText.replace(/\n+/g, '|'));
    await pick('.hero-title'); await p.keyboard.press('Enter'); await p.waitForTimeout(50);
    check('JSX <br />: editable', await editing());
    await p.keyboard.press('Meta+ArrowDown'); await p.keyboard.type('!'); await p.keyboard.press('Escape'); await p.waitForTimeout(80);
    check('JSX <br />: edited, still two lines', (await lines()) === 'Climb something new|this weekend!', await lines());
    const l = await textList();
    check('JSX <br />: Push gets both lines', l.at(-1) === 'Climb something new\nthis weekend!', JSON.stringify(l));
    await p.keyboard.press('Meta+z'); await p.waitForTimeout(80);
    check('JSX <br />: ⌘Z restores the page exactly', (await html()) === start3);
  } finally { fs.writeFileSync(file, orig); }
}

check('no page errors', !errors.length, errors.join(' | '));
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await b.close();
