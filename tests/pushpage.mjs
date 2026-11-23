// Push for designs moved onto the page (ROADMAP › "Drag designs into the
// page", step 2): what Push sends, the list, "replaces", and the round trip
// (a successful Push removes the canvas safety copy; Undo puts the design
// back on the page). The server's push/status/undo are faked, so Claude never
// runs. Runs on a scratch copy of console-app/ on 5393 (COPY=<console copy
// dir>); leaves it with an empty canvas.
import { chromium } from 'playwright-core';
if (!process.env.COPY) throw new Error('Set COPY to the console copy folder');
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f, a) => p.evaluate(f, a);
const DESIGN = '<div data-em-kind="frame" data-em-name="Promo" style="position: absolute; left: 40px; top: 40px; width: 360px; height: 72px; background-color: rgb(255, 236, 200); border-radius: 12px; display: flex; align-items: center; padding: 0px 20px;"><div data-em-kind="text" data-em-name="Promo text" style="font-size: 15px;">Try the new payroll view</div></div>'
  + '<div data-em-kind="frame" data-em-name="Banner" style="position: absolute; left: 40px; top: 200px; width: 300px; height: 48px; background-color: rgb(220, 240, 255);"></div>';
let pushed = null;
let status = { running: false, last: null };
await p.route('**/@edit-mode/push', (route) => { pushed = JSON.parse(route.request().postData()); status = { running: false, last: { id: 'run1', ok: true, summary: 'Built it (test).', files: ['src/App.jsx'], undoable: true } }; route.fulfill({ contentType: 'application/json', body: '{"id":"run1"}' }); });
await p.route('**/@edit-mode/status', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(status) }));
await p.route('**/@edit-mode/undo', (route) => { status = { running: false, last: null }; route.fulfill({ contentType: 'application/json', body: JSON.stringify({ changes: pushed.changes }) }); });

await p.goto('http://localhost:5393'); await p.waitForSelector('.people-table');
await R((html) => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html }) }), DESIGN);
await p.reload(); await p.waitForSelector('.people-table');
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(900);
await p.keyboard.press('Shift+Digit1'); await p.waitForTimeout(300);
const rectOf = (sel) => R((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const drag = async (from, to) => {
  await p.mouse.move(...from); await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(from[0] + (to[0] - from[0]) * i / 12, from[1] + (to[1] - from[1]) * i / 12);
  await p.waitForTimeout(80); await p.mouse.up(); await p.waitForTimeout(250);
};
const ui = (s) => R((s) => document.querySelector('edit-mode-root').shadowRoot.querySelector(s)?.textContent ?? null, s);

// Promo goes before the people card; the stats card is deleted and Banner takes its place.
const people = await rectOf('#root .people');
await drag(center(await rectOf('[data-em-name="Promo"]')), [people.x + people.w / 2, people.y + 6]);
const stats = await rectOf('#root .stats');
await drag(center(await rectOf('[data-em-name="Banner"]')), [stats.x + stats.w / 2, stats.y + 6]);
await R(() => window.__editMode.select(document.querySelector('#root .stats')));
await p.keyboard.press('Backspace'); await p.waitForTimeout(500);
check('both designs are on the page', await R(() => ['Promo', 'Banner'].every((n) => document.querySelector('#root').contains(document.querySelector(`[data-em-name="${n}"]`)))));
check('the pill counts them with the delete (3)', (await ui('.n')) === '3', await ui('.n'));

await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(400);
const rows = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('li.design.on-page')].map((li) => li.textContent));
check('the Push list shows them as placed, with no choices', rows.length === 2 && rows.some((r) => /^Promo.*Charts/.test(r)) && rows.some((r) => /^Banner.*Replaces “Stats”/.test(r)) &&
  await R(() => !document.querySelector('edit-mode-root').shadowRoot.querySelector('li.design.on-page .seg')), JSON.stringify(rows));
check('the title counts them', /Push 3 changes/.test(await ui('.dialog h3')), await ui('.dialog h3'));
await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(400);
const builds = pushed?.changes.filter((c) => c.kind === 'build') ?? [];
const promo = builds.find((c) => c.name === 'Promo'), banner = builds.find((c) => c.name === 'Banner');
check('Push sends both as builds on the page', builds.length === 2 && builds.every((c) => c.onPage && c.mode === 'place'), JSON.stringify(builds.map((c) => [c.name, c.onPage, c.mode])));
check('Promo: after the charts, before the people card, width as designed', promo?.placement.after?.name === 'Charts' && /people/.test(promo?.placement.before?.element) && promo.width === 'fixed' && promo.size.width === 360,
  JSON.stringify(promo?.placement));
check('Banner replaces the stats card (also sent as a delete)', banner?.placement.replaces?.[0]?.name === 'Stats' && pushed.changes.some((c) => c.kind === 'delete' && /stats/.test(c.element)),
  JSON.stringify(banner?.placement));
check('its html is the design, without Edit Mode’s markers or its canvas spot', /data-name="Promo text"/.test(promo?.html) && !/data-em-|position: relative|inset/.test(promo?.html), promo?.html.slice(0, 160));
check('no page edits for the designs themselves', pushed.changes.filter((c) => c.kind !== 'build' && c.kind !== 'delete').length === 0, JSON.stringify(pushed.changes.map((c) => c.kind + ' ' + c.element)));

// "Success": Edit Mode turns off and the page reloads (the fake changed no code, so the designs are simply gone from the page).
await p.waitForTimeout(3500); await p.waitForSelector('.people-table');
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(1500);
let s = await R(() => ({ names: [...document.querySelectorAll('[data-em-name]')].map((n) => n.dataset.emName), page: !!document.querySelector('#root [data-em-placed]') }));
check('after the Push, their safety copies don’t come back on the canvas', !s.names.includes('Promo') && !s.names.includes('Banner') && !s.page, JSON.stringify(s));
await p.waitForTimeout(700);
const saved = await R(async () => (await (await fetch('/@edit-mode/canvas')).json()).html);
check('…and the saved canvas no longer has them', !/Promo|Banner/.test(saved), saved.slice(0, 120));

// Undo: the code comes back (faked), and so do the designs, on the page where they sat.
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(400); // off: the pill offers Undo
status = { running: false, last: { id: 'run1', ok: true, summary: 'x', files: ['src/App.jsx'], undoable: true } };
await R(() => window.__editMode && null);
await p.evaluate(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.act')?.click()); await p.waitForTimeout(300);
await p.evaluate(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.pbtn.primary')].find((x) => x.textContent === 'Undo')?.click());
await p.waitForTimeout(2500); await p.waitForSelector('.people-table'); await p.waitForTimeout(1200);
s = await R(() => {
  const pr = document.querySelector('#root [data-em-name="Promo"]'), bn = document.querySelector('#root [data-em-name="Banner"]');
  return { promo: !!pr?.hasAttribute('data-em-placed'), promoNext: pr?.nextElementSibling?.className, banner: !!bn, bannerNext: bn?.nextElementSibling?.className, bannerPrev: bn?.previousElementSibling?.className,
    statsHidden: getComputedStyle(document.querySelector('#root .stats')).display === 'none', list: window.__editMode.changes.list().map((c) => c.kind + ' ' + c.element) };
});
check('after Undo, Promo is back on the page before the people card, as a design', s.promo && /^people/.test(s.promoNext || ''), JSON.stringify(s));
check('…and Banner where the stats card was, with the stats card deleted again', s.banner && /stats/.test(s.bannerNext || '') && s.statsHidden && s.list.length === 1 && /delete/.test(s.list[0]), JSON.stringify(s));

check('no page errors', errors.length === 0, errors.join(' | '));
await p.unroute('**/@edit-mode/status');
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
