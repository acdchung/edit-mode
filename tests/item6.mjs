// Item 6: text. Runs on the sample copy (5390).
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
