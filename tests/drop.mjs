// Moving designs between the canvas and the live page (ROADMAP › "First
// after the video" › Drag designs into the page). Runs on a scratch copy of
// console-app/ served on 5393 (COPY=<console copy dir>); leaves it with an
// empty canvas.
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
const DESIGN = '<div data-em-kind="frame" data-em-name="Promo" style="position: absolute; left: 40px; top: 40px; width: 360px; height: 72px; background-color: rgb(255, 236, 200); border-radius: 12px; display: flex; align-items: center; padding: 0px 20px; gap: 12px;"><div data-em-kind="text" data-em-name="Promo text" style="font-size: 15px; font-weight: 600;">Try the new payroll view</div></div>';
await p.goto('http://localhost:5393'); await p.waitForSelector('.people-table');
await R((html) => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html }) }), DESIGN);
await p.reload(); await p.waitForSelector('.people-table');
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(900);
await p.keyboard.press('Shift+Digit1'); await p.waitForTimeout(300); // fit page and canvas
const promo = () => document.querySelector('[data-em-name="Promo"]');
const rectOf = (sel) => R((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
const drag = async (from, to, mid) => {
  await p.mouse.move(...from); await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(from[0] + (to[0] - from[0]) * i / 12, from[1] + (to[1] - from[1]) * i / 12);
  await p.waitForTimeout(80);
  const seen = mid ? await R(mid) : null;
  await p.mouse.up(); await p.waitForTimeout(250);
  return seen;
};
const pageList = () => R(() => window.__editMode.changes.list().map((c) => `${c.kind} ${c.element}`));
const rootHtml = () => R(() => document.querySelector('#root').innerHTML.replace(/ style=""/g, ''));
const before = await rootHtml();
const home = await R(() => { const s = document.querySelector('[data-em-name="Promo"]').style; return [s.left, s.top]; });

// 1. Canvas → page: above the people card, into the content column.
const people = await rectOf('#root .people');
const ui = (s) => document.querySelector('edit-mode-root').shadowRoot.querySelector(s);
const mid = await drag(center(await rectOf('[data-em-name="Promo"]')), [people.x + people.w / 2, people.y + 6],
  () => {
    const l = document.querySelector('edit-mode-root').shadowRoot.querySelector('.insert');
    const r = l.getBoundingClientRect(), a = document.querySelector('#root .charts').getBoundingClientRect(), b = document.querySelector('#root .people').getBoundingClientRect();
    return { line: !l.hidden, mid: r.top + r.height / 2, gap: (a.bottom + b.top) / 2 };
  });
let s = await R(() => { const n = document.querySelector('[data-em-name="Promo"]'); const cs = getComputedStyle(n); return { onPage: document.querySelector('#root').contains(n), next: n.nextElementSibling?.className, placed: n.hasAttribute('data-em-placed'), pos: cs.position, w: n.getBoundingClientRect().width / window.__editMode.state.view?.z || null, bg: cs.backgroundColor, font: getComputedStyle(n.firstElementChild).fontSize }; });
check('dragged over the page, the insert line shows, in the middle of the gap between the charts and the people card', mid?.line && Math.abs(mid.mid - mid.gap) < 1.5, JSON.stringify(mid));
check('dropped on the page: it’s in the content column, before the people card', s.onPage && /^people/.test(s.next || ''), JSON.stringify(s));
check('it joins the flow (no longer placed at x/y) and keeps its look', s.placed && s.pos === 'relative' && s.bg === 'rgb(255, 236, 200)' && s.font === '15px', JSON.stringify(s));
const w = await R(() => { const n = document.querySelector('[data-em-name="Promo"]'); return [getComputedStyle(n).width, n.getAttribute('style')]; });
check('its width stays as designed (360)', Math.round(parseFloat(w[0])) === 360, JSON.stringify(w));
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT }); // the design on the page
check('nothing is listed as a page edit', (await pageList()).length === 0, JSON.stringify(await pageList()));
// Saved with the canvas at its old spot, in case the page reloads.
await p.waitForTimeout(700);
let saved = await R(async () => (await (await fetch('/@edit-mode/canvas')).json()).html);
check('the canvas save keeps it at its spot on the canvas', (saved.match(/data-em-name="Promo"/g) || []).length === 1 && /inset: 40px auto auto 40px !important/.test(saved) && !/data-em-placed/.test(saved), saved.slice(0, 200));

// 2. One ⌘Z puts it back on the canvas exactly; ⌘⇧Z brings it back onto the page.
await p.keyboard.press('Meta+KeyZ'); await p.waitForTimeout(200);
s = await R(() => { const n = document.querySelector('[data-em-name="Promo"]'); return { onCanvas: !!n.closest('[data-em-canvas]'), left: n.style.left, top: n.style.top, pos: n.style.position }; });
check('⌘Z: back on the canvas, same spot', s.onCanvas && s.left === home[0] && s.top === home[1] && s.pos === 'absolute', JSON.stringify(s));
check('⌘Z: the page is exactly as before', (await rootHtml()) === before);
await p.keyboard.press('Meta+Shift+KeyZ'); await p.waitForTimeout(200);
check('⌘⇧Z: on the page again', await R(() => document.querySelector('#root').contains(document.querySelector('[data-em-name="Promo"]'))));

// 3. Page → canvas: drag it back out onto the empty canvas.
const area = await rectOf('[data-em-canvas]');
await drag(center(await rectOf('[data-em-name="Promo"]')), [area.x + area.w * 0.5, area.y + area.h * 0.6]);
s = await R(() => { const n = document.querySelector('[data-em-name="Promo"]'); return { onCanvas: n.parentElement?.hasAttribute('data-em-canvas'), pos: getComputedStyle(n).position, bg: getComputedStyle(n).backgroundColor }; });
check('dragged back out: top level on the canvas, placed freely, look kept', s.onCanvas && s.pos === 'absolute' && s.bg === 'rgb(255, 236, 200)', JSON.stringify(s));
check('the page is exactly as before', (await rootHtml()) === before);
check('still nothing listed as a page edit', (await pageList()).length === 0);

// 4. ⌘V: with the people card selected, a copy goes on the page after it.
await R(() => window.__editMode.select(document.querySelector('[data-em-name="Promo"]')));
await p.keyboard.press('Meta+KeyC'); await p.waitForTimeout(100);
await R(() => window.__editMode.select(document.querySelector('#root .people')));
await p.mouse.move(people.x + 40, people.y + 40); await p.keyboard.press('Meta+KeyV'); await p.waitForTimeout(300);
s = await R(() => { const ns = [...document.querySelectorAll('[data-em-name="Promo"]')]; const pg = ns.find((n) => document.querySelector('#root').contains(n)); return { n: ns.length, prev: pg?.previousElementSibling?.className, placed: pg?.hasAttribute('data-em-placed'), bg: pg && getComputedStyle(pg).backgroundColor }; });
check('⌘V onto the page: a copy after the people card, the original stays on the canvas', s.n === 2 && /people/.test(s.prev || '') && s.placed && s.bg === 'rgb(255, 236, 200)', JSON.stringify(s));
check('the pasted copy isn’t a page edit either', (await pageList()).length === 0, JSON.stringify(await pageList()));

// 5. Editing it on the page, then deleting it: nothing reaches the page list; delete really removes it.
await R(() => { const n = [...document.querySelectorAll('[data-em-name="Promo"]')].find((k) => document.querySelector('#root').contains(k)); window.__editMode.changes.set(n, 'one', 'border-radius', '4px'); });
check('an edit to a design on the page isn’t a page edit', (await pageList()).length === 0, JSON.stringify(await pageList()));
await R(() => { const n = [...document.querySelectorAll('[data-em-name="Promo"]')].find((k) => document.querySelector('#root').contains(k)); window.__editMode.select(n); });
await p.keyboard.press('Backspace'); await p.waitForTimeout(200);
check('Delete removes it from the page', await R(() => document.querySelectorAll('[data-em-name="Promo"]').length === 1) && (await rootHtml()) === before);

// 6. A reload with a design on the page: it comes back on the canvas, not lost.
await R(() => window.__editMode.select(document.querySelector('[data-em-name="Promo"]')));
// It's under the properties panel now: drop it back at its first spot (⌘Z ×2 undoes the paste and the move out), then drag.
await p.keyboard.press('Escape');
const r6 = await R(() => { const n = document.querySelector('[data-em-name="Promo"]'); const { changes } = window.__editMode; changes.set(n, 'one', 'left', '40px'); changes.set(n, 'one', 'top', '40px'); const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const people6 = await rectOf('#root .people');
await drag(center(r6), [people6.x + people6.w / 2, people6.y + 6]);
const at = await R(() => { const s = document.querySelector('[data-em-name="Promo"]'); return document.querySelector('#root').contains(s); });
await p.waitForTimeout(700);
await p.reload(); await p.waitForSelector('.people-table'); await p.waitForTimeout(1200);
s = await R(() => { const ns = [...document.querySelectorAll('[data-em-name="Promo"]')]; return { n: ns.length, onCanvas: ns.every((n) => n.closest('[data-em-canvas]')), placed: ns.some((n) => n.hasAttribute('data-em-placed')) }; });
check('after a reload, the design is back on the canvas (once)', at && s.n === 1 && s.onCanvas && !s.placed, JSON.stringify({ at, ...s }));

check('no page errors', errors.length === 0, errors.join(' | '));
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
