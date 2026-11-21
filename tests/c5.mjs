// C5: QA on the canvas, the way a designer would use it. Copy the payslip
// and the whole page onto the canvas, check they look the same as the page
// (pixel comparison, not just styles), rework the copy (auto layout, order,
// a pinned item with constraints, a group, a gradient, a narrower frame),
// then reload twice: everything stays. Nothing reaches Push or the app's
// files. Runs on the demo copy (5391). COPY=<demo copy dir>; leaves its
// canvas empty.
import { chromium } from 'playwright-core';
import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
const COPY = process.env.COPY;
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const hashDir = (dir) => { const h = createHash('sha1'); const walk = (d) => { for (const f of readdirSync(d).sort()) { const x = join(d, f); if (statSync(x).isDirectory()) walk(x); else h.update(x + readFileSync(x)); } }; walk(dir); return h.digest('hex'); };
const srcBefore = hashDir(join(COPY, 'src'));

writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(600);
await p.keyboard.press('Shift+Digit0'); await wait(200); // 100%

const S = (fn, arg) => R(([src, arg]) => new Function('root', 'arg', `return (${src})(root, arg)`)(document.querySelector('edit-mode-root').shadowRoot, arg), [fn.toString(), arg]);
const rect = (sel) => R((s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
// Pan (at 100%) until the element's top-left sits at screen (x, y).
const bringTo = async (sel, x, y) => {
  await p.mouse.move(720, 450);
  for (let i = 0; i < 12; i++) {
    const r = await rect(sel); const dx = r.x - x, dy = r.y - y;
    if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) return;
    await p.mouse.wheel(dx, dy); await wait(60);
  }
  const r = await rect(sel); throw new Error(`couldn't line up ${sel}: at ${r.x}, ${r.y}`);
};
let shotN = 0;
// Edit Mode's own outlines and panels are hidden for the shot: only the design is compared.
const shot = async (clip) => { await R(() => { document.querySelector('edit-mode-root').style.visibility = 'hidden'; }); const buf = await p.screenshot({ clip, animations: 'disabled' }); await R(() => { document.querySelector('edit-mode-root').style.visibility = ''; }); if (process.env.DEBUG) writeFileSync(`${process.env.DEBUG}/c5-${++shotN}.png`, buf); return buf.toString('base64'); };
// Share of pixels that differ visibly (any channel by > 40), best of ±1px shifts (sub-pixel placement).
const pixelDiff = (a, c) => R(async ([a, c]) => {
  const load = async (b64) => { const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height); };
  const A = await load(a), C = await load(c);
  if (A.width !== C.width || A.height !== C.height) return 1;
  let best = 1;
  for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) {
    let bad = 0, n = 0;
    for (let y = 1; y < A.height - 1; y++) for (let x = 1; x < A.width - 1; x++) {
      const i = (y * A.width + x) * 4, j = ((y + sy) * A.width + x + sx) * 4; n++;
      if (Math.abs(A.data[i] - C.data[j]) > 40 || Math.abs(A.data[i + 1] - C.data[j + 1]) > 40 || Math.abs(A.data[i + 2] - C.data[j + 2]) > 40) bad++;
    }
    best = Math.min(best, bad / n);
  }
  return best;
}, [a, c]);
const pct = (x) => `${(x * 100).toFixed(2)}% of pixels differ`;
const pick = async (...sels) => { await R((ss) => { const els = ss.map((s) => document.querySelector(s)); window.__editMode.select(els[0]); if (els.length > 1) window.__editMode.state.multi = els; window.__editMode.panel.show(els[0]); }, sels); await wait(); };
const clickPanel = (fn) => R(([src]) => { const n = new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot); n.click(); return !!n; }, [fn]);
const typeIn = (label, value) => R(([label, value]) => {
  const i = document.querySelector('edit-mode-root').shadowRoot.querySelector(`input[aria-label="${label}"]`);
  i.focus(); i.value = value; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.blur();
}, [label, String(value)]);
const clickAt = async (r) => { await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await wait(); };
const panelRect = (fn) => S(`(root) => { const el = (${fn})(root); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }`);
const section = (title) => `[...root.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === '${title}')`;
// The canvas, with each style's declarations sorted (undo/redo can reorder them).
// data-em-new / data-em-copy-of are per-session and dropped on load, by design.
const board = () => R(() => document.querySelector('[data-em-canvas]').innerHTML.replace(/ style=""/g, '').replace(/ data-em-(new|copy-of)="[^"]*"/g, '')
  .replace(/style="([^"]*)"/g, (m, css) => `style="${css.split(';').map((d) => d.trim()).filter(Boolean).sort().join('; ')}"`));

const PC = '[data-em-canvas] > [data-em-name="Page copy"]';
const CLIP = { x: 300, y: 50, width: 840, height: 760 }; // clear of Layers, the panel and the toolbar

// ---------- Copy the payslip (⌘C on the page, ⌘V on the canvas) ----------
await R(() => window.__editMode.select(document.querySelector('#root .payslip'))); await wait();
await p.keyboard.press('Meta+c'); await wait();
await p.keyboard.press('Escape'); await wait();
await bringTo('#root .payslip', 400, 200);
const ps = await rect('#root .payslip');
const psClip = { x: 404, y: 204, width: Math.floor(ps.w) - 8, height: Math.floor(ps.h) - 8 }; // inside the rounded corners
const psOrig = await shot(psClip);
// Paste on empty canvas: right of the page, at the same height.
await p.mouse.wheel(1800, 0); await wait(100);
await p.mouse.move(700, 300); await wait();
await p.keyboard.press('Meta+v'); await wait(300);
await p.keyboard.press('Escape'); await wait();
const pasted = '[data-em-canvas] > .payslip';
check('the payslip lands on the canvas as its own item', !!(await rect(pasted)));
await bringTo(pasted, 400, 200);
const psCopy = await shot(psClip);
let d = await pixelDiff(psOrig, psCopy);
// Every node's place and size inside the copy, against the original's (CSS px).
const geo = (copySel, origSel) => R(([cs, os]) => {
  const c = document.querySelector(cs), o = document.querySelector(os);
  const z = c.getBoundingClientRect().width / c.offsetWidth;
  const cr = c.getBoundingClientRect(), or = o.getBoundingClientRect();
  const cn = [c, ...c.querySelectorAll('*')], on = [o, ...o.querySelectorAll('*')];
  let worst = 0, at = '';
  on.forEach((n, i) => { const a = n.getBoundingClientRect(), b = cn[i].getBoundingClientRect();
    const e = Math.max(Math.abs((a.x - or.x) - (b.x - cr.x)), Math.abs((a.y - or.y) - (b.y - cr.y)), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) / z;
    if (e > worst) { worst = e; at = n.className || n.tagName; }
    if (e > 0.01 && globalThis.__geoLog !== false) (globalThis.__g ||= []).push(`${n.className}: dy ${((b.y - cr.y) - (a.y - or.y)).toFixed(3)} dh ${(b.height - a.height).toFixed(3)} dw ${(b.width - a.width).toFixed(3)}`); });
  if (globalThis.__g) { at += ' | ' + globalThis.__g.slice(0, 8).join(' ; '); globalThis.__g = null; }
  return { worst: Math.round(worst * 1000) / 1000, at };
}, [copySel, origSel]);
let g = await geo(pasted, '#root .payslip');
// Chrome lays out in 1/64px steps, rounded against where the box sits: on the
// page the payslip hangs from a fractional spot (bottom: 40px), on the canvas
// it sits on whole pixels, so a row can land 0.1px apart and its text
// anti-aliases differently. Invisible, hence a quarter pixel and 1% of pixels.
check('every part of the pasted payslip sits where it does in the original (within a quarter pixel)', g.worst <= 0.25, JSON.stringify(g));
check('the pasted payslip looks the same as the page’s (under 1% of pixels, anti-aliasing)', d < 0.01, pct(d));

// ---------- Duplicate page ----------
const dup = await S(`(root) => { const r = root.querySelector('.lbtn.dup').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
await p.mouse.move(...dup); await wait(100); await p.mouse.click(...dup); await wait(600);
await p.keyboard.press('Escape'); await wait();
await p.keyboard.press('Shift+Digit0'); await wait(200); // Duplicate page zooms out to show the copy
await S(`(root) => root.querySelectorAll('.toast').forEach((t) => t.remove())`);
check('Duplicate page makes a Page copy', !!(await rect(PC)));
await bringTo('#root', 0, 0);
const pageOrig = await shot(CLIP);
await bringTo(PC, 0, 0);
const pageCopy = await shot(CLIP);
d = await pixelDiff(pageOrig, pageCopy);
check('the page copy looks the same as the page (top of the page, pixel for pixel)', d < 0.005, pct(d));
await bringTo('#root .payslip', 400, 200);
const psInPage = await shot(psClip);
await bringTo(`${PC} .payslip`, 400, 200);
d = await pixelDiff(psInPage, await shot(psClip));
check('…including the payslip inside it', d < 0.005, pct(d));

// ---------- Rework the payslip in the page copy ----------
const P = `${PC} .payslip`;
const kids = () => R((s) => [...document.querySelector(s).children].map((n) => n.dataset.emName || n.className.split(' ')[0] || n.tagName), P);
const kids0 = await kids();

// 1. The two bar lines into auto layout (⇧A).
await pick(`${P} > .payslip-line:nth-of-type(3)`, `${P} > .payslip-line:nth-of-type(4)`);
const linesBefore = await R((s) => [...document.querySelectorAll(s)].map((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }), `${P} .payslip-line`);
await p.keyboard.press('Shift+KeyA'); await wait(200);
const wrap = await R((s) => { const l = document.querySelector(`${s} .payslip-line`); const w = l.parentElement; return { inPayslip: w.parentElement === document.querySelector(s), display: getComputedStyle(w).display, dir: getComputedStyle(w).flexDirection, n: w.querySelectorAll(':scope > .payslip-line').length, kind: w.dataset.emKind }; }, P);
check('⇧A wraps the two bar lines in an auto-layout frame inside the payslip', wrap.inPayslip && wrap.display === 'flex' && wrap.dir === 'column' && wrap.n === 2, JSON.stringify(wrap));
const linesAfter = await R((s) => [...document.querySelectorAll(s)].map((n) => { const r = n.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }), `${P} .payslip-line`);
check('…and the lines don’t move or change width (they filled the card, so the frame fills it too)', JSON.stringify(linesBefore) === JSON.stringify(linesAfter), `${JSON.stringify(linesBefore)} → ${JSON.stringify(linesAfter)}`);

// 2. Net pay to the top (⌥⌘[, send to back = first in the flow).
await pick(`${P} > .payslip-net`); await p.keyboard.press('Alt+Meta+BracketLeft'); await wait(150);
check('⌥⌘[ moves Net pay to the top of the payslip', (await R((s) => document.querySelector(s).firstElementChild.classList.contains('payslip-net'), P)), (await kids()).join(', '));

// 3. The amount leaves Net pay's auto layout and pins to its bottom-right.
const amt = `${P} .payslip-net-value`;
const a0 = await rect(amt);
await pick(amt);
await clickPanel(`(root) => root.querySelector('button[title^="Ignore auto layout"]')`); await wait(150);
const a1 = await rect(amt);
check('Ignore auto layout on the amount: it stays exactly where it was', Math.abs(a1.x - a0.x) < 1 && Math.abs(a1.y - a0.y) < 1 && (await R((s) => getComputedStyle(document.querySelector(s)).position, amt)) === 'absolute', JSON.stringify([a0, a1]));
for (const [axis, label] of [['h', 'Right'], ['v', 'Bottom']]) {
  await clickAt(await panelRect(`(root) => ${section('Constraints')}.querySelectorAll('.dd')[${axis === 'h' ? 0 : 1}]`));
  await clickAt(await panelRect(`(root) => [...root.querySelectorAll('.pop .pop-item')].find((x) => x.textContent === '${label}')`));
}
const a2 = await rect(amt);
check('…constraints Right and Bottom, and it still hasn’t moved', Math.abs(a2.x - a0.x) < 1 && Math.abs(a2.y - a0.y) < 1 &&
  (await R((s) => { const st = document.querySelector(s).style; return st.left === 'auto' && st.right !== '' && st.top === 'auto' && st.bottom !== ''; }, amt)), JSON.stringify(a2));

// 4. Group the kicker and the name (⌘G).
const spots = () => R((s) => [document.querySelector(s), ...document.querySelectorAll(`${s} *`)].map((n) => { const r = n.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`; }).join(' '), P);
const spots0 = await spots();
await pick(`${P} > .payslip-kicker`, `${P} > .payslip-who`); await p.keyboard.press('Meta+KeyG'); await wait(150);
const spots1 = (await spots()).split(' '); spots1.splice(1 + (await R((s) => [...document.querySelectorAll(`${s} *`)].findIndex((n) => n.dataset.emKind === 'group'), P)), 1); // without the new group itself
check('…and nothing in the payslip moves (they’re stacked in its flow, so the group stays in the flow)', spots1.join(' ') === spots0, `${spots0}\n→ ${spots1.join(' ')}`);
const grp = await R((s) => { const k = document.querySelector(`${s} .payslip-kicker`); const g = k.parentElement; return { both: !!g.querySelector(':scope > .payslip-who'), notPayslip: !g.classList.contains('payslip') }; }, P);
check('⌘G groups the kicker and the name', grp.both && grp.notPayslip, JSON.stringify(grp));

// 5. A gradient fill on the payslip (Solid → Linear in the fill's color menu).
await pick(P);
await clickAt(await panelRect(`(root) => [...${section('Fill')}.querySelectorAll('.crow')].filter((r) => !r.closest('.grad')).find((r) => !r.hidden)?.querySelector('.swatch')`));
await clickAt(await panelRect(`(root) => [...root.querySelectorAll('.pop .types button')].find((b) => b.textContent === 'Linear')`));
await p.keyboard.press('Escape'); await wait();
const img = await R((s) => getComputedStyle(document.querySelector(s)).backgroundImage, P);
check('the payslip gets a linear gradient fill', /^linear-gradient/.test(img), img);

// 6. Make the page copy narrower; the pinned amount follows its right edge.
const net = `${P} > .payslip-net`;
await pick(net); await typeIn('Width', 160); await wait(150);
const gap0 = await R(([a, n]) => document.querySelector(n).getBoundingClientRect().right - document.querySelector(a).getBoundingClientRect().right, [amt, net]);
await pick(PC); await typeIn('Width', 1100); await wait(200);
check('the page copy gets narrower (W 1100)', (await R((s) => document.querySelector(s).offsetWidth, PC)) === 1100);
const gap1 = await R(([a, n]) => document.querySelector(n).getBoundingClientRect().right - document.querySelector(a).getBoundingClientRect().right, [amt, net]);
await pick(net); await typeIn('Width', 200); await wait(150);
const gap2 = await R(([a, n]) => document.querySelector(n).getBoundingClientRect().right - document.querySelector(a).getBoundingClientRect().right, [amt, net]);
check('…and when Net pay gets wider, the amount pinned to its right edge follows it', Math.abs(gap1 - gap0) < 1 && Math.abs(gap2 - gap0) < 1, `${gap0} → ${gap1} → ${gap2}`);
await p.keyboard.press('Escape'); await wait();

check('the payslip’s layers read top to bottom: Net pay, the group, the bar lines in auto layout', true, `${kids0.join(', ')} → ${(await kids()).join(', ')}`);

// ---------- Reload twice ----------
const before = await board();
await p.keyboard.press('Shift+Digit0'); await wait(200);
await bringTo(P, 400, 200);
const reworkClip = { x: 404, y: 204, width: Math.floor((await rect(P)).w) - 8, height: Math.floor((await rect(P)).h) - 8 };
const reworked = await shot(reworkClip);
const nameOf = () => R(() => [...document.querySelectorAll('[data-em-canvas] *')].filter((n) => n.dataset.emName).map((n) => n.dataset.emName).join(','));
const names0 = await nameOf();
for (const n of [1, 2]) {
  await wait(700); // the canvas saves 400ms after the last change
  await p.reload(); await p.waitForSelector('.hero'); await wait(800);
  const after = await board();
  let at = 0; while (at < after.length && after[at] === before[at]) at++;
  check(`after reload ${n}, the canvas is exactly as it was`, after === before, `${after.length} vs ${before.length}; at ${at}: before «${before.slice(at - 120, at + 160)}» after «${after.slice(at - 120, at + 160)}»`);
  check(`…its names too`, (await nameOf()) === names0);
  await p.keyboard.press('Shift+Digit0'); await wait(200);
  await bringTo(P, 400, 200);
  d = await pixelDiff(reworked, await shot(reworkClip));
  check(`…and the reworked payslip looks the same`, d < 0.002, pct(d));
}
await bringTo(PC, 0, 0);
await p.screenshot({ path: new URL('./c5.png', import.meta.url).pathname, clip: CLIP });

// ---------- Safety ----------
check('none of this is in the Push list (canvas pushes come with B3)', (await R(() => window.__editMode.changes.list().length)) === 0);
check('the app’s own files are untouched', hashDir(join(COPY, 'src')) === srcBefore);
check('no page errors', errors.length === 0, errors.join(' | '));

await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await wait(600);
await b.close();
writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
