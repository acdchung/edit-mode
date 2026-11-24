// Canvas frames that stand for the page match the whole page, not its
// content column: Duplicate page (with the content
// where it sits on the page). The sample app has a centered 960px column,
// which the Payloom suites can't catch. Runs on the sample copy (5390).
// COPY=<sample copy dir>; leaves its canvas empty for the other suites.
import { chromium } from 'playwright-core';
import { rmSync, writeFileSync } from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the sample copy folder');
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
rmSync(`${process.env.COPY}/.editmode/canvas.json`, { force: true }); // a fresh canvas
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1470, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f) => p.evaluate(f);
await p.goto('http://localhost:5390'); await p.waitForSelector('.page');
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(800);


await p.keyboard.press('Shift+Digit1'); await p.waitForTimeout(300); // fit: the Duplicate page icon sits just right of the page's corner (off-screen in this wide window otherwise)
const btn = await R(() => { const root = document.querySelector('edit-mode-root').shadowRoot; const x = root.querySelector('.dup-page'); const r = x.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await p.mouse.move(...btn); await p.waitForTimeout(100); await p.mouse.click(...btn); await p.waitForTimeout(800);
const d = await R(() => {
  const f = document.querySelector('[data-em-canvas] > [data-em-name="Page copy"]'); const c = f.firstElementChild; const z = f.getBoundingClientRect().width / f.offsetWidth;
  const o = document.querySelector('#root .page'); const body = document.body.getBoundingClientRect(); const fr = f.getBoundingClientRect();
  const or = o.getBoundingClientRect(), cr = c.getBoundingClientRect();
  return { frameW: f.offsetWidth, body: document.body.offsetWidth, origLeft: Math.round((or.left - body.left) / z), copyLeft: Math.round((cr.left - fr.left) / z),
    origW: Math.round(or.width / z), copyW: Math.round(cr.width / z), origH: Math.round(or.height / z), copyH: Math.round(cr.height / z), ml: getComputedStyle(c).marginLeft === getComputedStyle(c).marginRight };
});
check('Duplicate page: the frame is as wide as the whole page', d.frameW === d.body, JSON.stringify(d));
check('…and the content sits where it does on the page, at its size', d.copyLeft === d.origLeft && d.copyW === d.origW && d.copyH === d.origH, JSON.stringify(d));
check('…centered content stays centered (equal side margins)', d.ml);
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
writeFileSync(`${process.env.COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
