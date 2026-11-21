// B3 with Claude's real output: the payslip reworked on a page copy (auto
// layout, reorder, a pinned amount, a group, a gradient, a text) was pushed
// for real once (2026-11-21); tests/fixtures/b3-claude holds the files
// Claude wrote. Here the same rework is made, Claude's files go in, and the
// copy must list nothing (equivalent CSS like `transparent` or a default
// `normal` doesn't count) while the page looks like the canvas design.
// Runs on the demo copy (5391). COPY=<demo copy dir>; restores its files.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const FIX = new URL('./fixtures/b3-claude/', import.meta.url).pathname;
const JSX = `${process.env.COPY}/src/components/HeroShot.jsx`, CSSF = `${process.env.COPY}/src/components/HeroShot.css`;
const jsx0 = readFileSync(JSX, 'utf8'), css0 = readFileSync(CSSF, 'utf8');
const restore = () => { writeFileSync(JSX, jsx0); writeFileSync(CSSF, css0); };
let fails = 0;
writeFileSync(process.env.COPY + '/.editmode/canvas.json', '{"html":""}');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(600);
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
const P = `${PC} .payslip`;
const dup = await S(`(root) => { const r = root.querySelector('.lbtn.dup').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
await p.mouse.move(...dup); await wait(100); await p.mouse.click(...dup); await wait(600); await p.keyboard.press('Escape');
await p.keyboard.press('Shift+Digit0'); await wait(200);
// The rework.
await R((s) => { const ls = [...document.querySelectorAll(`${s} > .payslip-line`)]; window.__editMode.select(ls[0]); window.__editMode.state.multi = ls; }, P); await wait();
await p.keyboard.press('Shift+KeyA'); await wait(200);
await pick(`${P} > .payslip-net`); await p.keyboard.press('Alt+Meta+BracketLeft'); await wait(150);
const amt = `${P} .payslip-net-value`;
await pick(amt);
await clickPanel(`(root) => root.querySelector('button[title^="Ignore auto layout"]')`); await wait(150);
for (const [axis, label] of [['h', 'Right'], ['v', 'Bottom']]) {
  await clickAt(await panelRect(`(root) => ${section('Constraints')}.querySelectorAll('.dd')[${axis === 'h' ? 0 : 1}]`));
  await clickAt(await panelRect(`(root) => [...root.querySelectorAll('.pop .pop-item')].find((x) => x.textContent === '${label}')`));
}
await pick(`${P} > .payslip-kicker`, `${P} > .payslip-who`); await p.keyboard.press('Meta+KeyG'); await wait(150);
await pick(P);
await clickAt(await panelRect(`(root) => [...${section('Fill')}.querySelectorAll('.crow')].filter((r) => !r.closest('.grad')).find((r) => !r.hidden)?.querySelector('.swatch')`));
await clickAt(await panelRect(`(root) => [...root.querySelectorAll('.pop .types button')].find((b) => b.textContent === 'Linear')`));
await p.keyboard.press('Escape'); await wait();
await R((s) => { const { changes } = window.__editMode; const n = document.querySelector(`${s} .payslip-name`); changes.beginText(n); n.firstChild.nodeValue = 'Lucía F.'; changes.endText(); }, P);
await p.keyboard.press('Escape'); await wait(800);
const list = () => R(() => window.__editMode.compareCanvas().flatMap((r) => r.changes.map((c) => `${c.kind} ${c.element} ${c.property ?? ''}`.trim())).sort());
let l = await list();
check('the rework lists six changes', JSON.stringify(l) === JSON.stringify(['group frame', 'group group', 'move div.payslip-net', 'place span.payslip-net-value', 'style div.payslip background-image', 'text div.payslip-name']), JSON.stringify(l));
await bringTo(P, 400, 200);
const box = await rect(P);
const clip = { x: 404, y: 204, width: Math.floor(box.w) - 8, height: Math.floor(box.h) - 8 };
const shotOf = async () => { await R(() => { document.querySelector('edit-mode-root').style.visibility = 'hidden'; }); const s = (await p.screenshot({ clip })).toString('base64'); await R(() => { document.querySelector('edit-mode-root').style.visibility = ''; }); return s; };
const design = await shotOf();
try {
  writeFileSync(JSX, readFileSync(FIX + 'HeroShot.jsx', 'utf8')); writeFileSync(CSSF, readFileSync(FIX + 'HeroShot.css', 'utf8'));
  await R(() => sessionStorage.setItem('edit-mode:relink', '1'));
  await wait(1200); await p.reload(); await p.waitForSelector('.hero'); await wait(1500);
  l = await list();
  check('with Claude’s files in, nothing is left to push', l.length === 0, JSON.stringify(l));
  check('…the copy’s group and auto layout frame are linked to Claude’s wrappers', await R((s) => { const cls = (n) => { const [src, i] = (n?.dataset.emFrom || '#').split('#'); return document.querySelectorAll(`[data-src="${CSS.escape(src)}"]`)[+i]?.className; }; return cls(document.querySelector(`${s} [data-em-kind="group"]`)) === 'payslip-header' && cls(document.querySelector(`${s} [data-em-kind="frame"]`)) === 'payslip-lines'; }, P));
  await p.keyboard.press('Shift+Digit0'); await wait(200);
  await bringTo('#root .payslip', 400, 200);
  const d = await pixelDiff(design, await shotOf());
  check('the page’s payslip now looks like the canvas design', d < 0.01, `${(d * 100).toFixed(2)}% of pixels differ`);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
  await p.keyboard.press('Alt+KeyE'); await wait(600);
} finally {
  restore();
  await b.close();
  writeFileSync(`${process.env.COPY}/.editmode/canvas.json`, '{"html":""}');
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
