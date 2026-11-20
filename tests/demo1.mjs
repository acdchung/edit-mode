// Audit fixes on the realistic page (demo-app copy on port 5391):
// sizing modes read what the CSS really does, and stroke sides.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
const start = await p.$eval('#root', e => e.innerHTML);
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
const r = await p.$eval('.payslip-who', e => { const b = e.getBoundingClientRect(); return [b.right - 6, b.bottom - 4]; });
await p.keyboard.down('Meta'); await p.mouse.click(...r); await p.keyboard.up('Meta'); await p.waitForTimeout(120);
const R = (s) => `edit-mode-root ${s}`;
const sides = () => p.$eval('.payslip-who', e => ['top', 'right', 'bottom', 'left'].map(s => { const c = getComputedStyle(e); return c.getPropertyValue(`border-${s}-style`) === 'none' ? 0 : parseFloat(c.getPropertyValue(`border-${s}-width`)); }).join(','));
let fails = 0;
const ok = (name, cond, d = '') => { if (!cond) fails++; console.error(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${d}`); };
const sel = await p.evaluate(() => window.__editMode.state.selected.className);
ok('payslip row selected', sel === 'payslip-who', sel);
ok('sides button shows, marked (bottom only)', await p.locator(R('button[aria-label="Stroke sides"]')).isVisible() && await p.$eval('edit-mode-root', h => h.shadowRoot.querySelector('button[aria-label="Stroke sides"]').classList.contains('on')));
const choose = async (label) => { await p.locator(R('button[aria-label="Stroke sides"]')).click(); await p.waitForTimeout(60); await p.locator(R('.pop-item'), { hasText: label }).first().click(); await p.waitForTimeout(80); };
await p.locator(R('button[aria-label="Stroke sides"]')).click(); await p.waitForTimeout(60);
ok('menu marks the current choice (Bottom)', (await p.locator(R('.pop-item.on')).textContent()) === 'Bottom');
await p.keyboard.press('Escape');
await choose('All'); ok('All: every side', (await sides()) === '1,1,1,1', await sides());
await choose('Top'); ok('Top: only the top', (await sides()) === '1,0,0,0', await sides());
await choose('Custom'); ok('Custom shows four fields', await p.locator(R('input[aria-label="Stroke right"]')).isVisible() && !(await p.locator(R('input[aria-label="Stroke weight"]')).isVisible()));
const f = p.locator(R('input[aria-label="Stroke right"]')); await f.fill('3'); await f.press('Enter'); await p.waitForTimeout(80);
ok('a side weight adds that side', (await sides()) === '1,3,0,0', await sides());
for (let i = 0; i < 6; i++) { await p.keyboard.press('Meta+z'); await p.waitForTimeout(60); }
ok('undo restores the page exactly', (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === start);
// Sizing modes (W/H) read what the CSS does
for (const [q, i, want] of [['.hero-actions .button', 0, 'Hug/Fixed'], ['.shot-name', 1, 'Fill/Hug'], ['.logos-label', 0, 'Fill/Hug'], ['.payslip-who', 0, 'Fill/Hug'], ['.payslip', 0, 'Fixed/Hug'], ['.nav-link', 1, 'Hug/Hug']]) {
  const pt = await p.evaluate(([q, i]) => { const e = document.querySelectorAll(q)[i]; const r = e.getBoundingClientRect();
    for (let fy = 0.1; fy < 1; fy += 0.2) for (let fx = 0.05; fx < 1; fx += 0.1) { const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x > innerWidth - 280) continue; if (document.elementsFromPoint(x, y).find(n => n.tagName !== 'EDIT-MODE-ROOT') === e) return [x, y]; } return null; }, [q, i]);
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.keyboard.down('Meta'); await p.mouse.click(...pt); await p.keyboard.up('Meta'); await p.waitForTimeout(100);
  const got = await p.evaluate(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.mode-tag')].map(t => t.textContent || 'Fixed').join('/'));
  ok(`${q} reads ${want}`, got === want, got);
}
ok('reading sizes leaves no styles behind', (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === start);
await p.keyboard.press('Escape'); await p.keyboard.press('Escape');

// Outside stroke: no sides button
const o = await p.$eval('.payslip', e => { const b = e.getBoundingClientRect(); return [b.left + 8, b.top + 8]; });
await p.keyboard.down('Meta'); await p.mouse.click(...o); await p.keyboard.up('Meta'); await p.waitForTimeout(100);
await p.locator(R('button[aria-label="Add stroke"]')).click(); await p.waitForTimeout(60);
await p.locator(R('button[aria-label="Stroke position"]')).click(); await p.waitForTimeout(60); await p.locator(R('.pop-item'), { hasText: 'Outside' }).click(); await p.waitForTimeout(80);
ok('outside stroke hides the sides button', !(await p.locator(R('button[aria-label="Stroke sides"]')).isVisible()));
ok('no page errors', !errs.length, errs.join('; '));
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
