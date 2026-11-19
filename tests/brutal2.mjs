import { chromium } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ channel: 'chrome' });
const R = 'edit-mode-root';
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
async function page(vp = { width: 1280, height: 1000 }) {
  const p = await b.newPage({ viewport: vp });
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} }); // Layers closed: these suites predate it (item2.mjs covers it)
  await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
  p.start = await p.$eval('#root', e => e.innerHTML);
  await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150);
  p.S = (sel) => p.locator(`${R} ${sel}`);
  p.box = async (sel) => p.locator(sel).first().boundingBox();
  p.tap = async (sel, shift) => { const bb = await p.box(sel); await p.keyboard.down('Meta'); if (shift) await p.keyboard.down('Shift'); await p.mouse.click(bb.x + bb.width/2, bb.y + bb.height/2); if (shift) await p.keyboard.up('Shift'); await p.keyboard.up('Meta'); await p.waitForTimeout(60); };
  p.sel = () => p.evaluate(() => { const s = window.__editMode.state; return s.multi.map(x => x.dataset.emNew ? '#new' + x.dataset.emNew : (x.className || x.tagName).split(' ').pop()).join(','); });
  p.same = async () => (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === p.start;
  return p;
}
const allErrors = [];

// ⌥ measure
{ const p = await page();
  await p.tap('.cta-primary'); const t = await p.box('.hero-title');
  await p.keyboard.down('Alt'); await p.mouse.move(t.x + 50, t.y + 10); await p.waitForTimeout(80);
  const labels = await p.S('.mlabel').allTextContents();
  await p.screenshot({ path: out + '/45-measure.png', clip: { x: 180, y: 40, width: 700, height: 300 } });
  await p.mouse.move(5, 990); await p.waitForTimeout(80);
  const parentLabels = await p.S('.mlabel').allTextContents();
  await p.keyboard.up('Alt'); await p.waitForTimeout(50);
  const after = await p.S('.mlabel').count();
  check('⌥ shows distance to hovered element', labels.length >= 1, `labels ${labels}`);
  check('⌥ over nothing measures to parent (4 sides)', parentLabels.length === 4, `labels ${parentLabels}`);
  check('releasing ⌥ hides measurements', after === 0);
  allErrors.push(...p.errors); await p.close(); }

// ⌥-drag duplicate, one undo removes the copy
{ const p = await page();
  await p.tap('.eyebrow'); const e = await p.box('.eyebrow'); const t = await p.box('.hero-body');
  await p.keyboard.down('Alt'); await p.mouse.move(e.x + 20, e.y + 5); await p.mouse.down(); await p.mouse.move(t.x + 20, t.y + t.height - 2, { steps: 8 }); await p.mouse.up(); await p.keyboard.up('Alt');
  const order = await p.evaluate(() => [...document.querySelector('.hero').children].map(c => (c.dataset.emNew ? 'NEW ' : '') + c.className.split(' ').pop()).join(', '));
  check('⌥-drag leaves original and drops a copy', order.startsWith('eyebrow') && order.includes('NEW'), order);
  await p.keyboard.press('Meta+z');
  check('one ⌘Z removes the ⌥-dragged copy', await p.same());
  allErrors.push(...p.errors); await p.close(); }

// Tab / ⌘A
{ const p = await page();
  await p.tap('.eyebrow'); await p.keyboard.press('Tab'); const a = await p.sel(); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Shift+Tab'); const c = await p.sel();
  check('Tab / Shift-Tab walk siblings (wrapping)', a === 'hero-title' && c === 'cta-primary', `${a} / ${c}`);
  await p.keyboard.press('Meta+a'); check('⌘A selects all siblings', (await p.sel()).split(',').length === 4, await p.sel());
  allErrors.push(...p.errors); await p.close(); }

// Panels never move on their own (DESIGN.md › Surfaces), even over the selection
{ const p = await page();
  const at = () => p.evaluate(() => Math.round(document.querySelector('edit-mode-root').shadowRoot.querySelector('.side').getBoundingClientRect().left));
  await p.tap('main .card:nth-child(1) .card-title'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  const x0 = await at();
  await p.tap('main .card:nth-child(3) .card-title'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  check('the panel stays put when the selection is under it', (await at()) === x0, `${x0} → ${await at()}`);
  allErrors.push(...p.errors); await p.close(); }

// Scroll + window resize keep the frame on the element
{ const p = await page({ width: 1280, height: 600 });
  await p.tap('.hero-title');
  await p.mouse.move(600, 300); await p.mouse.wheel(0, 250); await p.waitForTimeout(200);
  const fr = async () => p.evaluate(() => { const f = document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame:not(.passive)').getBoundingClientRect(); const e = document.querySelector('.hero-title').getBoundingClientRect(); return Math.abs(f.top - e.top) < 1 && Math.abs(f.left - e.left) < 1; });
  check('frame follows scroll', await fr());
  await p.setViewportSize({ width: 900, height: 600 }); await p.waitForTimeout(200);
  check('frame follows window resize', await fr());
  allErrors.push(...p.errors); await p.close(); }

// Rapid toggling, re-entering edit mode is clean
{ const p = await page();
  await p.tap('.hero-title');
  for (let i = 0; i < 7; i++) await p.keyboard.press('Alt+KeyE');
  await p.waitForTimeout(100);
  const st = await p.evaluate(() => { const s = window.__editMode.state; const root = document.querySelector('edit-mode-root').shadowRoot; return { on: s.on, glass: !root.querySelector('.glass').hidden, tools: !root.querySelector('.tools').hidden, sel: !!s.selected, tool: s.tool }; });
  check('rapid ⌥E ends in a consistent state', st.on === false && !st.glass && !st.tools && !st.sel, JSON.stringify(st));
  allErrors.push(...p.errors); await p.close(); }

// Undo/redo edge cases
{ const p = await page();
  await p.keyboard.press('Meta+z'); await p.keyboard.press('Meta+Shift+z');
  await p.tap('.hero-title'); await p.keyboard.press('Backspace'); await p.keyboard.press('Meta+z'); await p.keyboard.press('Meta+Shift+z');
  const hidden = await p.$eval('.hero-title', e => getComputedStyle(e).display);
  await p.keyboard.press('Meta+z');
  check('undo/redo a delete; nothing-to-undo is harmless', hidden === 'none' && await p.same(), hidden);
  allErrors.push(...p.errors); await p.close(); }

// Gap typed "auto", eye then undo, Push disabled with no changes
{ const p = await page();
  check('Push is disabled with no changes', await p.S('.act').filter({ hasText: 'Push' }).isDisabled());
  await p.tap('.hero-body'); await p.tap('.cta-primary', true); await p.keyboard.press('Shift+KeyA');
  await p.S('input[aria-label="Gap between children"]').fill('auto'); await p.keyboard.press('Enter');
  const j = await p.evaluate(() => getComputedStyle(window.__editMode.state.selected).justifyContent);
  check('typing "auto" in Gap sets auto spacing', j === 'space-between', j);
  await p.tap('.cta-primary'); await p.S('.crow:has(input[aria-label="Fill"]) .icon').first().click();
  const off = await p.$eval('.cta-primary', e => getComputedStyle(e).backgroundColor);
  await p.keyboard.press('Meta+z');
  const on = await p.$eval('.cta-primary', e => getComputedStyle(e).backgroundColor);
  const eye = await p.S('.crow:has(input[aria-label="Fill"])').evaluate(e => e.classList.contains('off'));
  check('hiding fill then ⌘Z brings it back and the eye agrees', off.includes('0)') && !on.includes('0)') && !eye, `${off} -> ${on} eye-off=${eye}`);
  allErrors.push(...p.errors); await p.close(); }

check('no page errors in batch 2', !allErrors.length, allErrors.join(' | '));
console.log(results.join('\n'));
await b.close();
