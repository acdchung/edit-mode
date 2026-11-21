// B3d with Claude's real output: a Pricing card (auto layout, with the real
// "Start now" button pasted in) placed after the hero, and a Trust badge as a
// component, were pushed for real once (2026-11-21); tests/fixtures/b3d-claude
// holds what Claude wrote (a PricingCard component inside the page's
// `.container`, a TrustBadge component, tokens for values). Here the same two
// designs go through the real dialog and picker, Claude's files go in, and:
// the card links to .pricing-card (not the wrapper), only the two values
// Claude snapped to tokens stay listed (corners 20 → 16, the description's
// grey), the badge is back on Skip; after Undo the card is a new design again.
// Runs on the demo copy (5391). COPY=<demo copy dir>; restores its files.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
const COPY = process.env.COPY;
if (!COPY) throw new Error('Set COPY to the demo copy folder');
const FIX = new URL('./fixtures/b3d-claude/', import.meta.url).pathname;
const C = `${COPY}/src/components`;
const app0 = readFileSync(`${COPY}/src/App.jsx`, 'utf8');
const created = ['PricingCard.jsx', 'PricingCard.css', 'TrustBadge.jsx', 'TrustBadge.css'].map((f) => [`${C}/${f}`, FIX + f]);
const restore = () => { writeFileSync(`${COPY}/src/App.jsx`, app0); for (const [to] of created) if (existsSync(to)) rmSync(to); };
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const log = () => {};
writeFileSync(COPY + '/.editmode/canvas.json', '{"html":""}');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const pushed = [];
await p.route('**/@edit-mode/push', (route) => { pushed.push(JSON.parse(route.request().postData())); route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test: not sent"}' }); });
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
const S = (fn) => R(([src]) => new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot), [fn.toString()]);
const clickIn = async (fn) => { const r = await S(`(root) => { const el = (${fn})(root); el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`); await p.mouse.click(...r); await wait(200); };
const bringTo = async (sel, x, y) => { await p.mouse.move(720, 450); for (let i = 0; i < 12; i++) { const r = await R((s) => { const n = document.querySelector(s).getBoundingClientRect(); return { x: n.x, y: n.y }; }, sel); if (Math.abs(r.x - x) < 0.05 && Math.abs(r.y - y) < 0.05) return; await p.mouse.wheel(r.x - x, r.y - y); await wait(60); } };
const hide = (v) => R((v) => { document.querySelector('edit-mode-root').style.visibility = v; }, v);
const row = (name) => `[...root.querySelectorAll('li.design')].find((l) => l.querySelector('.text').textContent === '${name}')`;
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(700);

// The two designs, made of canvas layers (as the Frame/Text tools and ⇧A make them).
await R(() => {
  const area = document.querySelector('[data-em-canvas]');
  const mk = (kind, name, css, text) => { const d = document.createElement('div'); d.dataset.emKind = kind; if (name) d.dataset.emName = name; d.style.cssText = css; if (text) d.textContent = text; return d; };
  const card = mk('frame', 'Pricing card', 'position: absolute; left: 0px; top: 0px; width: 360px; display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding: 32px; background-color: #FFFFFF; border-radius: 20px; box-shadow: 0 12px 32px rgba(11, 34, 64, 0.12); border: 1px solid rgb(230, 232, 240);');
  const head = mk('frame', 'Heading', 'display: flex; flex-direction: column; gap: 4px;');
  head.append(mk('text', 'Plan', 'font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: rgb(91, 77, 255);', 'Team plan'),
    mk('text', 'Price', 'font-size: 40px; font-weight: 700; letter-spacing: -0.02em; color: rgb(11, 34, 64);', '$12 / person'));
  card.append(head, mk('text', 'Description', 'font-size: 15px; line-height: 22px; color: rgb(85, 96, 115);', 'Run payroll in 90 countries with local taxes and compliance handled for you.'));
  const badge = mk('frame', 'Trust badge', 'position: absolute; left: 0px; top: 480px; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background-color: rgb(238, 240, 255); border-radius: 999px;');
  badge.append(mk('ellipse', 'Dot', 'width: 8px; height: 8px; border-radius: 50%; background-color: rgb(34, 160, 107);'),
    mk('text', 'Label', 'font-size: 13px; font-weight: 600; color: rgb(11, 34, 64);', 'SOC 2 Type II certified'));
  area.append(card, badge);
});
// Your real "Start now" button, pasted into the card (last).
await R(() => window.__editMode.select(document.querySelector('#root .hero-actions .button--primary'))); await wait();
await p.keyboard.press('Meta+c'); await wait();
await R(() => window.__editMode.select(document.querySelector('[data-em-canvas] [data-em-name="Pricing card"]'))); await wait();
await p.keyboard.press('Meta+v'); await wait(400); await p.keyboard.press('Escape'); await wait(500);
log('button pasted:', await R(() => !!document.querySelector('[data-em-canvas] [data-em-name="Pricing card"] > [data-em-from]')));
await p.keyboard.press('Shift+Digit0'); await wait(200);
await bringTo('[data-em-canvas] [data-em-name="Pricing card"]', 400, 120);

// Push dialog: Component for the badge, Place for the card (after the hero).
await p.keyboard.press('Meta+Enter'); await wait(300);
await clickIn(`(root) => ${row('Trust badge')}.querySelector('.seg button[data-mode="component"]')`);
await clickIn(`(root) => ${row('Pricing card')}.querySelector('.seg button[data-mode="place"]')`);
await bringTo('#root .logos', 300, 500);
await p.mouse.move(680, 508); await p.mouse.move(700, 506); await wait(150);
await p.mouse.click(700, 506); await wait(400);
log('dialog:', JSON.stringify(await S(`(root) => root.querySelector('.dialog')?.innerText`)));
await p.keyboard.press('Meta+Enter'); await wait(500);
const builds = pushed[0]?.changes ?? [];
check('Push sends the card (placed after the hero) and the badge (component)', builds.length === 2 && builds.some((c) => c.mode === 'place' && c.placement.after?.name === 'Hero') && builds.some((c) => c.mode === 'component' && c.component === 'TrustBadge'), JSON.stringify(builds.map((c) => [c.mode, c.component])));
await S(`(root) => root.querySelectorAll('.toast').forEach((t) => t.remove())`);
try {
  writeFileSync(`${COPY}/src/App.jsx`, readFileSync(FIX + 'App.jsx', 'utf8'));
  for (const [to, from] of created) writeFileSync(to, readFileSync(from, 'utf8'));
  await R((built) => { sessionStorage.setItem('edit-mode:built', built); sessionStorage.setItem('edit-mode:relink', '1'); },
    JSON.stringify(builds.map((c) => ({ id: c.id, mode: c.mode, placement: c.placement, component: c.component }))));
  await wait(1500); await p.reload(); await p.waitForSelector('.pricing-card'); await wait(1800);
  const linked = await R(() => { const n = document.querySelector('[data-em-canvas] [data-em-name="Pricing card"]'); const [src, i] = (n?.dataset.emFrom || '#').split('#'); return document.querySelectorAll(`[data-src="${CSS.escape(src)}"]`)[+i]?.className ?? null; });
  check('the card links to the new .pricing-card (not the container Claude wrapped it in)', linked === 'pricing-card', linked);
  const left = await R(() => window.__editMode.compareCanvas().flatMap((r) => r.changes.map((c) => `${c.kind} ${c.element} ${c.property ?? ''} ${c.from ?? ''} → ${c.to ?? ''}`.trim())));
  check('only the two values Claude snapped to tokens stay listed (corners, the description’s grey)', JSON.stringify(left) === JSON.stringify(['style div.pricing-card border-radius 16px → 20px', 'style p.pricing-card-description color rgb(63, 81, 104) → rgb(85, 96, 115)']), JSON.stringify(left));
  const badge = await R(() => { const n = document.querySelector('[data-em-canvas] [data-em-name="Trust badge"]'); return [n.dataset.emBuild, n.dataset.emBuilt]; });
  check('the badge, built as a component, is back on Skip', badge[0] === 'skip' && badge[1] === 'TrustBadge', JSON.stringify(badge));
} finally {
  restore();
}
await R(() => sessionStorage.setItem('edit-mode:relink', '1'));
await wait(1500); await p.reload(); await p.waitForSelector('.hero'); await wait(1800);
await p.keyboard.press('Meta+Enter'); await wait(300);
const after = await S(`(root) => [...root.querySelectorAll('li.design')].map((l) => l.querySelector('.text').textContent + ': ' + (l.querySelector('.spot').hidden ? l.querySelector('.seg .on').textContent : l.querySelector('.spot').textContent))`);
check('after Undo, the card is a new design again, still set to go after the hero', JSON.stringify(after) === JSON.stringify(['Pricing card: After “Hero”', 'Trust badge: Skip']), JSON.stringify(after));
await p.keyboard.press('Escape');
check('no page errors', errors.length === 0, errors.join(' | '));
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await wait(600);
await b.close();
writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
