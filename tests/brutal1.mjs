import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const R = 'edit-mode-root';
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
async function page() {
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
  p.start = await p.$eval('#root', e => e.innerHTML);
  await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150);
  p.S = (sel) => p.locator(`${R} ${sel}`);
  p.box = async (sel) => p.locator(sel).first().boundingBox();
  p.tap = async (sel, shift) => { const bb = await p.box(sel); await p.keyboard.down('Meta'); if (shift) await p.keyboard.down('Shift'); await p.mouse.click(bb.x + bb.width/2, bb.y + bb.height/2); if (shift) await p.keyboard.up('Shift'); await p.keyboard.up('Meta'); await p.waitForTimeout(60); };
  p.sel = () => p.evaluate(() => { const s = window.__editMode.state.selected; return s ? (s.dataset.emNew ? '#new' + s.dataset.emNew : s.className || s.tagName) : null; });
  p.same = async () => (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === p.start;
  p.cs = (sel, prop) => p.$eval(sel, (el, prop) => getComputedStyle(el)[prop], prop);
  return p;
}

// 1. Discard after a pile of mixed edits restores the page exactly
{ const p = await page();
  const c = await p.box('.cta-primary');
  await p.keyboard.press('KeyR'); await p.mouse.move(c.x + 5, c.y + c.height + 5); await p.mouse.down(); await p.mouse.move(c.x + 85, c.y + c.height + 45, { steps: 4 }); await p.mouse.up();
  await p.keyboard.press('KeyT'); await p.mouse.click(c.x + 5, c.y - 4); await p.keyboard.type('Hello'); await p.keyboard.press('Enter');
  await p.tap('.eyebrow'); await p.tap('.hero-title', true); await p.keyboard.press('Shift+KeyA');
  await p.tap('main .card:nth-child(1) .card-thumb'); await p.S('input[aria-label="Gradient stop 1"]').fill('FF0000'); await p.keyboard.press('Enter');
  await p.tap('main .card:nth-child(2) .card-title'); await p.keyboard.press('Escape'); await p.keyboard.press('Meta+d');
  await p.tap('.section-title'); await p.keyboard.press('Backspace');
  const t3 = await p.box('main .card:nth-child(4) .card-title');
  await p.tap('main .card:nth-child(1) .card-title'); await p.keyboard.press('Escape');
  await p.mouse.move(t3.x + 5, t3.y); await p.mouse.down(); await p.mouse.move(t3.x + 40, t3.y + 10, { steps: 6 }); await p.mouse.up();
  await p.S('.toggle').click(); await p.waitForTimeout(100);
  const dialog = await p.S('.dialog h3').innerText().catch(() => '');
  await p.S('.dialog .pbtn.primary').click().catch(() => {}); await p.waitForTimeout(150);
  check('discard after mixed edits restores DOM', await p.same(), dialog);
  check('no page errors (1)', !p.errors.length, p.errors.join('; ')); await p.close(); }

// 2. Emptying a new text leaves an invisible element behind?
{ const p = await page();
  const c = await p.box('.cta-primary');
  await p.keyboard.press('KeyT'); await p.mouse.click(c.x + 5, c.y + c.height + 5); await p.keyboard.press('Backspace'); await p.keyboard.press('Enter');
  const left = await p.evaluate(() => [...document.querySelectorAll('[data-em-new]')].filter(e => e.getClientRects().length).length);
  const listed = await p.evaluate(() => window.__editMode.changes.count);
  check('emptied new text is removed (Figma deletes empty text)', left === 0 && listed === 0, `visible=${left} changes=${listed}`);
  await p.close(); }

// 3. Text tool clicked on existing text: Figma edits that text
{ const p = await page();
  await p.keyboard.press('KeyT'); const t = await p.box('.hero-title'); await p.mouse.click(t.x + 30, t.y + t.height / 2); await p.waitForTimeout(80);
  const editing = await p.evaluate(() => window.__editMode.state.editing?.className ?? null);
  const added = await p.evaluate(() => document.querySelectorAll('[data-em-new]').length);
  check('Text tool on existing text edits it instead of adding new', editing === 'hero-title' && added === 0, `editing=${editing} added=${added}`);
  await p.keyboard.press('Escape'); await p.close(); }

// 4. Opacity "50%" and math "8*2"
{ const p = await page();
  await p.tap('.cta-primary');
  await p.S('input[aria-label="Opacity"]').fill('50%'); await p.keyboard.press('Enter');
  check('opacity accepts "50%"', (await p.cs('.cta-primary', 'opacity')) === '0.5', await p.cs('.cta-primary', 'opacity'));
  await p.S('input[aria-label="Corner radius"]').fill('8*2'); await p.keyboard.press('Enter');
  check('number fields accept math ("8*2")', (await p.cs('.cta-primary', 'borderTopLeftRadius')) === '16px', await p.cs('.cta-primary', 'borderTopLeftRadius'));
  await p.close(); }

// 5. Arrow keys inside auto layout should reorder (Figma), not add margin
{ const p = await page();
  await p.tap('.hero-body'); await p.tap('.cta-primary', true); await p.keyboard.press('Shift+KeyA');
  await p.keyboard.press('Enter'); // first child (hero-body)
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(60);
  const order = await p.evaluate(() => [...window.__editMode.state.selected.parentElement.children].map(c => c.className.split(' ').pop()));
  const mt = await p.cs('.hero-body', 'marginTop');
  check('arrow key in auto layout reorders', order[0] === 'cta-primary', `order=${order} margin-top=${mt}`);
  await p.close(); }

// 6. ⇧A on a frame that already has auto layout wraps it (Figma)
{ const p = await page();
  await p.tap('.hero-body'); await p.tap('.cta-primary', true); await p.keyboard.press('Shift+KeyA');
  const first = await p.sel(); await p.keyboard.press('Shift+KeyA'); await p.waitForTimeout(60);
  const second = await p.sel();
  check('⇧A on an auto layout frame wraps it in a new one', first !== second, `${first} -> ${second}`);
  await p.close(); }

// 7. ⌘D on a multi-selection across containers duplicates each next to its original
{ const p = await page();
  await p.tap('.eyebrow'); await p.tap('main .card:nth-child(1) .card-title', true);
  await p.keyboard.press('Meta+d'); await p.waitForTimeout(60);
  const where = await p.evaluate(() => [...document.querySelectorAll('[data-em-new]')].map(e => `${e.tagName.toLowerCase()} in ${e.parentElement.className}`));
  check('multi ⌘D keeps each copy next to its original', where.join() === 'p in hero,h3 in card', where.join(' | '));
  await p.close(); }

// 8. Undo restores the selection to what was selected (Figma) / doesn't leave a ghost
{ const p = await page();
  await p.tap('.hero-title'); await p.keyboard.press('Backspace'); await p.keyboard.press('Meta+z'); await p.waitForTimeout(60);
  check('after undoing a delete, the restored element is selected', (await p.sel()) === 'hero-title', `selected=${await p.sel()}`);
  await p.close(); }

// 9. Resize a Fill child in auto layout -> becomes Fixed; resize past zero clamps
{ const p = await page();
  await p.tap('.hero-body'); await p.tap('.cta-primary', true); await p.keyboard.press('Shift+KeyA');
  await p.S('button[aria-label="Width sizing"]').click(); await p.S('.pop-item').filter({ hasText: 'Fill' }).click();
  await p.tap('.cta-primary'); await p.S('button[aria-label="Width sizing"]').click(); await p.S('.pop-item').filter({ hasText: 'Fill' }).click();
  await p.keyboard.press('Meta+Backslash'); await p.waitForTimeout(120);
  const e = await p.S('.frame:not(.passive) .handle[data-dir="e"]').boundingBox();
  await p.mouse.move(e.x + 3, e.y + 3); await p.mouse.down(); await p.mouse.move(e.x - 600, e.y + 3, { steps: 6 }); await p.mouse.up();
  const w = await p.evaluate(() => document.querySelector('.cta-primary').offsetWidth);
  await p.keyboard.press('Meta+Backslash'); await p.waitForTimeout(120);
  const mode = await p.S('.f:has(input[aria-label="Width"]) .mode-tag').innerText();
  check('resizing a Fill child switches it to Fixed and clamps at 0', mode === '' && w >= 0, `width=${w} mode="${mode || 'Fixed'}"`);
  check('no page errors (9)', !p.errors.length, p.errors.join('; '));
  await p.close(); }

// 10. Hidden (deleted) element still shown in the panel?
{ const p = await page();
  await p.tap('main .card:nth-child(1) .badge'); await p.keyboard.press('Backspace');
  const panelName = await p.S('.ph-name').innerText().catch(() => '(hidden)');
  check('after delete, panel shows the parent', panelName.includes('card-meta'), panelName);
  await p.close(); }

// 11. Double-click on a container with no own text drills in (Figma)
{ const p = await page();
  await p.tap('main .card:nth-child(1) .card-title'); await p.keyboard.press('Escape'); // card selected
  const m = await p.box('main .card:nth-child(1) .card-meta');
  await p.mouse.dblclick(m.x + 2, m.y + m.height / 2); await p.waitForTimeout(80);
  check('double-click selects deeper / edits text', ['card-meta', 'badge'].includes(await p.sel()) || (await p.evaluate(() => !!window.__editMode.state.editing)), `selected=${await p.sel()}`);
  await p.keyboard.press('Escape'); await p.close(); }

// 12. Escape at top level clears selection; clicking empty page clears selection
{ const p = await page();
  await p.tap('.hero'); for (let i = 0; i < 6; i++) await p.keyboard.press('Escape');
  const a = await p.sel();
  await p.tap('.hero-title'); await p.mouse.click(5, 990); await p.waitForTimeout(50);
  check('Esc up to the top / click on empty page clears selection', a === null && (await p.sel()) === null, `after Esc: ${a}, after empty click: ${await p.sel()}`);
  await p.close(); }

console.log(results.join('\n'));
await b.close();
