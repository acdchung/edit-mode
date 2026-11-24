// Shift+↑/↓ in a panel field: the field keeps the focus until you leave it (the user, 2026-11-24).
// Runs on the sample copy (5390).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
const html = () => p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''));
const start = await html();
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150);
const R = (q) => `edit-mode-root ${q}`;
const pick = async (q) => { await p.evaluate((q) => window.__editMode.select(document.querySelector(q)), q); await p.waitForTimeout(80); };
const btn = (label) => p.locator(R(`button[aria-label="${label}"]`)).first();
const focused = () => p.evaluate(() => document.querySelector('edit-mode-root').shadowRoot.activeElement?.getAttribute('aria-label') || null);
async function nudge(label, dir, expect) {
  const f = p.locator(R(`input[aria-label="${label}"]`)).first();
  await f.scrollIntoViewIfNeeded().catch(() => {});
  await f.click(); await p.waitForTimeout(60);
  const v0 = await f.inputValue();
  for (let i = 0; i < 3; i++) { await p.keyboard.press(`Shift+${dir > 0 ? 'ArrowUp' : 'ArrowDown'}`); await p.waitForTimeout(70); }
  const still = await focused();
  const v1 = await f.inputValue();
  check(`${label}: stays in the field through three Shift+${dir > 0 ? '↑' : '↓'}`, still === label, `focus: ${still}`);
  check(`${label}: ${v0} → ${expect}`, v1 === String(expect), `${v0} → ${v1}`);
  await p.evaluate(() => document.querySelector('edit-mode-root').shadowRoot.activeElement?.blur()); await p.waitForTimeout(60);
}
await pick('.hero-title');
await nudge('Font size', 1, 74);
await nudge('Letter spacing', 1, 30);
await nudge('Opacity', -1, 70);
await nudge('Corner radius', 1, 30);
await btn('Type details').click(); await p.waitForTimeout(80);
await p.locator(R('.pop.details .checkrow')).click(); await p.waitForTimeout(80);
await nudge('Max lines', 1, 31);
await p.keyboard.press('Escape');
await pick('main .card');
await btn('Add fill').click(); await p.waitForTimeout(80);
await nudge('Fill opacity', -1, 70);
await btn('Add fill').click(); await p.waitForTimeout(80);
await nudge('Layer color opacity', -1, 70);
await btn('Add effect').click(); await p.waitForTimeout(80);
await nudge('Shadow X offset', 1, 30);
await nudge('Shadow color opacity', 1, 55);
await p.locator(R('.layers-list > .grad .kind')).click(); await p.waitForTimeout(80);
await p.locator(R('.pop .pop-item'), { hasText: 'Linear' }).first().click(); await p.waitForTimeout(100);
await nudge('Stop 1 position', 1, 30);
await p.locator(R('button[aria-label="Width sizing"]')).click(); await p.waitForTimeout(80);
await p.locator(R('.pop .pop-item'), { hasText: 'Add max width' }).click(); await p.waitForTimeout(80);
const mw = +(await p.locator(R('input[aria-label="Maximum width"]')).inputValue());
await nudge('Maximum width', -1, Math.round((mw - 30) * 10) / 10);
// One ⌘Z per field session, all the way back.
let n = 0; for (; n < 30 && (await html()) !== start; n++) { await p.keyboard.press('Meta+z'); await p.waitForTimeout(50); }
check('⌘Z all the way back', (await html()) === start, `${n} steps`);
check('no page errors', !errors.length, errors.join(' | '));
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await b.close();
