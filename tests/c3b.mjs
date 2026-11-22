// Canvas step C3b: images and gradients in Fill. Fill types (Solid, Linear,
// Radial, Angular, Image), gradient stops (add, move, remove, position),
// image fills (Fill / Fit / Tile), image layers dropped or pasted onto the
// canvas, and Push copying images into the project. Runs on the demo copy
// (5391). COPY=<demo copy dir> (it deletes the copy's canvas.json to start fresh).
import { chromium } from 'playwright-core';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
const COPY = process.env.COPY;
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// ---------- Push copies images into the project (runner only, fake Claude) ----------
{
  const { createRunner } = await import('../src/runner.js');
  const root = mkdtempSync(join(tmpdir(), 'em-c3b-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/App.jsx'), 'export default () => null;\n');
  const runner = createRunner({ root, claudePath: new URL('./fake-claude.mjs', import.meta.url).pathname, log: () => {} });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const a = runner.saveAsset('x.png', png);
  check('an image is stored in .editmode/assets, named by its content', existsSync(join(root, a.path)) && /^\/@edit-mode\/assets\/[0-9a-f]{12}\.png$/.test(a.url));
  check('the same image twice is one file', runner.saveAsset('again.png', png).file === a.file);
  let threw = false; try { runner.saveAsset('page.html', png); } catch { threw = true; }
  check('anything but an image is refused', threw);
  const { id } = runner.push({ changes: [{ kind: 'style', element: '.hero-pill', styles: { 'background-image': `url("${a.url}")` } }], url: 'x', viewport: {}, context: [] });
  const ctx = JSON.parse(readFileSync(join(root, '.editmode', id, 'context.json'), 'utf8'));
  check('Push copies the image into public/images before Claude runs, and tells Claude where', existsSync(join(root, 'public/images', a.file)) &&
    ctx.images?.[0]?.src === `/images/${a.file}` && ctx.images[0].url === a.url, JSON.stringify(ctx.images));
  for (let i = 0; i < 100 && runner.isRunning(); i++) await new Promise((r) => setTimeout(r, 50));
  const u = runner.undo();
  check('Undo removes the image that pass copied', !existsSync(join(root, 'public/images', a.file)) && u.restored.includes(`public/images/${a.file}`), JSON.stringify(u.restored));
  rmSync(root, { recursive: true, force: true });
}

// ---------- In the browser ----------
rmSync(`${COPY}/.editmode/canvas.json`, { force: true }); // a fresh canvas (the test adds a "Page" frame)
const b = await chromium.launch({ channel: 'chrome' });
const bctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await bctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await bctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(500);
await p.evaluate(() => { // a page-sized frame to design in (what a fresh canvas used to start with)
  const f = document.createElement('div'); f.dataset.emKind = 'frame'; f.dataset.emName = 'Page';
  f.style.cssText = `position: absolute; left: 0px; top: 0px; width: ${document.body.offsetWidth}px; height: ${innerHeight}px; background-color: #FFFFFF; overflow: hidden;`;
  document.querySelector('[data-em-canvas]').append(f);
}); await p.waitForTimeout(150);

// A 40 × 20 PNG, made in the page.
const pngB64 = await R(() => { const c = document.createElement('canvas'); c.width = 40; c.height = 20; const g = c.getContext('2d'); g.fillStyle = '#e2572b'; g.fillRect(0, 0, 40, 20); g.fillStyle = '#0d99ff'; g.fillRect(20, 0, 20, 20); return c.toDataURL('image/png').split(',')[1]; });
const pngPath = join(mkdtempSync(join(tmpdir(), 'em-img-')), 'sunset.png');
writeFileSync(pngPath, Buffer.from(pngB64, 'base64'));

const S = (fn, arg) => R(([src, arg]) => new Function('root', 'arg', `return (${src})(root, arg)`)(document.querySelector('edit-mode-root').shadowRoot, arg), [fn.toString(), arg]);
const fillSec = `(root) => [...root.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === 'Fill')`;
const clickAt = async (r) => { await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await wait(); };
const rectOf = (pick) => S(`(root, arg) => { const sec = (${fillSec})(root); const el = (${pick})(sec, root); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }`);
const bg = (sel) => R((sel) => { const cs = getComputedStyle(document.querySelector(sel)); return { img: cs.backgroundImage, color: cs.backgroundColor, size: cs.backgroundSize, repeat: cs.backgroundRepeat }; }, sel);
const FRAME = '[data-em-canvas] > [data-em-name="Page"]';

// ---------- Solid → Linear from the fill's color menu ----------
await R((s) => window.__editMode.select(document.querySelector(s)), FRAME); await wait();
const before = await R((s) => document.querySelector(s).outerHTML, FRAME);
await clickAt(await rectOf('(sec) => [...sec.querySelectorAll(".crow")].filter((r) => !r.closest(".grad")).find((r) => !r.hidden)?.querySelector(".swatch")'));
const tabs = await S('(root) => [...root.querySelectorAll(".pop .types button")].map((b) => b.textContent)');
check('the fill\'s color menu offers the fill types', tabs.join(',') === 'Solid,Linear,Radial,Angular,Image', tabs.join(','));
await clickAt(await S('(root) => { const r = [...root.querySelectorAll(".pop .types button")][1].getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }'));
let f = await bg(FRAME);
check('Linear turns the white fill into white fading out, top to bottom', /^linear-gradient\(rgb\(255, 255, 255\) 0%, rgba\(255, 255, 255, 0\) 100%\)$/.test(f.img) && f.color === 'rgba(0, 0, 0, 0)', `${f.img} / ${f.color}`);
const ui = await S(`(root) => { const sec = (${fillSec})(root); return { kind: sec.querySelector(".kind .dd-label")?.textContent, handles: [...sec.querySelectorAll(".gstop")].filter((h) => !h.hidden).length, rows: [...sec.querySelectorAll(".crow.stop")].filter((r) => !r.hidden).length, xOff: [...sec.querySelectorAll(".crow.stop")][0].querySelector(":scope > .icon:last-child").disabled }; }`);
check('the panel shows the gradient: type, a bar with two handles and two stop rows', ui.kind === 'Linear' && ui.handles === 2 && ui.rows === 2, JSON.stringify(ui));
check('with two stops, removing one is greyed out (a gradient needs two)', ui.xOff);

// ---------- Stops: add, move, position, remove ----------
let tr = await rectOf('(sec) => sec.querySelector(".gtrack")');
await p.mouse.click(tr.x + tr.width / 2, tr.y + tr.height / 2); await wait();
f = await bg(FRAME);
check('clicking the bar adds a stop there, in the color between its neighbours', /rgb\(255, 255, 255\) 0%, rgba\(255, 255, 255, 0\.5\) 50%, rgba\(255, 255, 255, 0\) 100%/.test(f.img), f.img);
// Make the stops easy to tell apart: color stop 1 red.
await S(`(root) => { const sec = (${fillSec})(root); const hex = [...sec.querySelectorAll(".crow.stop")][0].querySelector(".hex"); hex.value = "FF0000"; hex.dispatchEvent(new Event("change")); }`); await wait();
tr = await rectOf('(sec) => sec.querySelector(".gtrack")');
const h1 = await rectOf('(sec) => [...sec.querySelectorAll(".gstop")][0]');
await p.mouse.move(h1.x + h1.width / 2, h1.y + h1.height / 2); await p.mouse.down();
await p.mouse.move(tr.x + tr.width * 0.75, h1.y + 7, { steps: 4 }); await p.mouse.up(); await wait();
f = await bg(FRAME);
check('dragging a handle moves its stop, and the stops stay in order', /rgba\(255, 255, 255, 0\.5\) 50%, rgb\(255, 0, 0\) 7\d(\.\d)?%, rgba\(255, 255, 255, 0\) 100%/.test(f.img), f.img);
const selStop = await S(`(root) => [...(${fillSec})(root).querySelectorAll(".gstop")].findIndex((h) => h.classList.contains("on"))`);
check('the dragged stop stays selected after it passes another', selStop === 1, String(selStop));
await S(`(root) => { const sec = (${fillSec})(root); const i = [...sec.querySelectorAll(".crow.stop")][1].querySelector(".f input"); i.focus(); i.value = "25"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); i.blur(); }`); await wait();
f = await bg(FRAME);
check('typing a position moves the stop', /rgb\(255, 0, 0\) 25%, rgba\(255, 255, 255, 0\.5\) 50%/.test(f.img), f.img);
const h2 = await rectOf('(sec) => [...sec.querySelectorAll(".gstop")][1]');
await p.mouse.click(h2.x + h2.width / 2, h2.y + h2.height / 2); await wait();
await p.keyboard.press('Backspace'); await wait();
f = await bg(FRAME);
check('Delete on a selected handle removes that stop (and not the frame)', /^linear-gradient\(rgb\(255, 0, 0\) 25%, rgba\(255, 255, 255, 0\) 100%\)$/.test(f.img) &&
  await R((s) => !!document.querySelector(s), FRAME), f.img);

// ---------- Type menu: Radial, Angular (with angle), Solid ----------
const pickType = async (label) => {
  await clickAt(await rectOf('(sec) => sec.querySelector(".kind")'));
  const r = await S(`(root) => { const b = [...root.querySelectorAll(".pop .pop-item")].find((x) => x.textContent === ${JSON.stringify(label)}); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }`);
  await clickAt(r);
};
await pickType('Radial');
f = await bg(FRAME);
check('Radial keeps the stops', /^radial-gradient\(rgb\(255, 0, 0\) 25%/.test(f.img), f.img);
check('…and has no angle field', await S(`(root) => (${fillSec})(root).querySelector(".grad .crow .f").hidden`));
await pickType('Angular');
await S(`(root) => { const i = (${fillSec})(root).querySelector(".grad .crow .f input"); i.focus(); i.value = "90"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); i.blur(); }`); await wait();
f = await bg(FRAME);
check('Angular is a conic gradient, and its angle works', /^conic-gradient\(from 90deg, rgb\(255, 0, 0\) 25%/.test(f.img), f.img);
await pickType('Solid');
f = await bg(FRAME);
check('Solid goes back to one color (the first stop)', f.img === 'none' && f.color === 'rgb(255, 0, 0)', `${f.img} / ${f.color}`);
for (let i = 0; i < 12; i++) await p.keyboard.press('Meta+z');
await wait(150);
check('⌘Z all the way restores the frame exactly', (await R((s) => document.querySelector(s).outerHTML, FRAME)) === before);

// ---------- Image fill on a page element (Fill / Fit / Tile) ----------
await R(() => window.__editMode.select(document.querySelector('.hero-pill'))); await wait();
const pillBefore = await R(() => document.getElementById('root').innerHTML);
await clickAt(await rectOf('(sec) => [...sec.querySelectorAll(".crow")].filter((r) => !r.closest(".grad")).find((r) => !r.hidden)?.querySelector(".swatch") || sec.querySelector(".add")'));
const chooser = p.waitForEvent('filechooser');
await clickAt(await S('(root) => { const b = [...root.querySelectorAll(".pop .types button")].find((x) => x.textContent === "Image"); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }'));
await (await chooser).setFiles(pngPath); await wait(600);
f = await bg('.hero-pill');
check('Image asks for a file and fills the element with it (Fill = cover)', /url\("http:\/\/localhost:5391\/@edit-mode\/assets\/[0-9a-f]{12}\.png"\)/.test(f.img) && f.size === 'cover' && f.repeat === 'no-repeat', `${f.img} ${f.size}`);
const file = /assets\/([0-9a-f]{12}\.png)/.exec(f.img)?.[1];
check('the image is saved in the project\'s .editmode/assets', file && existsSync(`${COPY}/.editmode/assets/${file}`));
const ok = await R((u) => fetch(u).then((r) => r.ok && r.headers.get('content-type') === 'image/png'), `/@edit-mode/assets/${file}`);
check('…and served back to the page', ok);
const fitTo = async (label) => {
  await clickAt(await rectOf('(sec) => sec.querySelector(".fit")'));
  await clickAt(await S(`(root) => { const b = [...root.querySelectorAll(".pop .pop-item")].find((x) => x.textContent === ${JSON.stringify(label)}); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }`));
};
await fitTo('Fit'); f = await bg('.hero-pill');
check('Fit = contain', f.size === 'contain' && f.repeat === 'no-repeat', f.size);
const push = await R(() => JSON.stringify(window.__editMode.changes.list()));
check('Push gets the image fill (the url Push copies into the project)', push.includes('/@edit-mode/assets/') && push.includes('background-size'), push.replace(/"source"[^}]*?"property"/g, '').slice(0, 600));
await fitTo('Tile'); f = await bg('.hero-pill');
check('Tile = repeat at its own size', f.size === 'auto' && f.repeat === 'repeat', `${f.size} ${f.repeat}`);
check('…which is the browser default, so Push only gets the image', !(await R(() => JSON.stringify(window.__editMode.changes.list()))).includes('background-size'));
for (let i = 0; i < 6; i++) await p.keyboard.press('Meta+z');
await wait(150);
check('⌘Z restores the page exactly', (await R(() => document.getElementById('root').innerHTML.replace(/ style=""/g, ''))) === pillBefore.replace(/ style=""/g, ''));

// ---------- Drop an image file onto the canvas ----------
const drop = (x, y, name = 'sunset.png', type = 'image/png') => R(([x, y, b64, name, type]) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], name, { type }));
  const t = document.elementFromPoint(x, y);
  t.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: dt }));
  t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: dt }));
}, [x, y, pngB64, name, type]);
await R(() => window.__editMode.select(null)); await wait();
await p.mouse.move(700, 450);
for (let i = 0; i < 4; i++) { await p.mouse.wheel(500, 0); await wait(40); }
const fr = await R((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }, FRAME);
const at = [Math.max(fr.x, 300) + 200, fr.y + 200];
await drop(...at); await wait(600);
const img = await R(() => { const n = document.querySelector('[data-em-kind="image"]'); if (!n) return null; const r = n.getBoundingClientRect(); const z = r.width / n.offsetWidth;
  return { parent: n.parentElement.dataset.emName, name: n.dataset.emName, w: n.offsetWidth, h: n.offsetHeight, cx: r.x + r.width / 2, cy: r.y + r.height / 2, pos: getComputedStyle(n).position, size: getComputedStyle(n).backgroundSize, sel: window.__editMode.state.selected === n }; });
check('a dropped image becomes an image layer inside the frame it was dropped on', img?.parent === 'Page' && img.pos === 'absolute', JSON.stringify(img));
check('…at its natural size, centered on the pointer, named after the file, and selected', img && img.w === 40 && img.h === 20 && Math.abs(img.cx - at[0]) < 2 && Math.abs(img.cy - at[1]) < 2 && img.name === 'sunset' && img.sel, JSON.stringify(img));
check('the panel names it Image, with an image fill', await S(`(root) => root.querySelector(".side")?.textContent.includes("sunset") && (${fillSec})(root).querySelector(".kind .dd-label")?.textContent === "Image"`));
check('nothing on the canvas is in the Push list', (await R(() => window.__editMode.changes.list().length)) === 0);
await p.keyboard.press('Meta+z'); await wait();
check('one ⌘Z removes it', await R(() => !document.querySelector('[data-em-kind="image"]')));

await drop(...at, 'notes.txt', 'text/plain'); await wait(300);
check('a file that isn\'t an image is turned away', await R(() => !document.querySelector('[data-em-canvas] [data-em-kind="image"]')) &&
  /Only images/.test(await S('(root) => root.textContent')));
await p.keyboard.press('Shift+Digit1'); await wait(200); // fit: the page is in view again
const pagePt = await R(() => { const r = document.querySelector('.hero-title').getBoundingClientRect(); return [r.x + 20, r.y + 10]; });
await drop(...pagePt); await wait(500);
check('dropping on the live page adds nothing, and says to use the canvas', (await R(() => document.querySelectorAll('[data-em-kind="image"]').length)) === 0 &&
  /Drop images on the canvas/.test(await S('(root) => root.textContent')));

// ---------- Paste an image (⌘V with an image on the clipboard) ----------
await R((s) => window.__editMode.select(document.querySelector(s)), FRAME); await wait();
await R((b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', metaKey: true, bubbles: true }));
  document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
}, pngB64); await wait(600);
const pasted = await R((s) => { const f = document.querySelector(s); const n = f.querySelector(':scope > [data-em-kind="image"]'); return n && { l: n.offsetLeft, t: n.offsetTop, fw: f.clientWidth, fh: f.clientHeight }; }, FRAME);
check('⌘V with an image on the clipboard pastes it into the selected frame, centered', pasted && Math.abs(pasted.l - (pasted.fw - 40) / 2) <= 1 && Math.abs(pasted.t - (pasted.fh - 20) / 2) <= 1, JSON.stringify(pasted));

// Saved with the canvas: still there after a reload, and the image loads.
await wait(700);
await p.reload(); await p.waitForSelector('.hero'); await wait(700);
const kept = await R(async () => { const n = document.querySelector('[data-em-canvas] [data-em-kind="image"]'); if (!n) return null; const u = /url\("?([^")]+)/.exec(getComputedStyle(n).backgroundImage)?.[1]; return { u, ok: u && (await fetch(u)).ok }; });
check('after a reload the image layer is still on the canvas, and its image loads', kept?.ok, JSON.stringify(kept));
check('the layer\'s name and icon survive the reload', await R(() => { window.__editMode.layers?.sync?.(); return document.querySelector('[data-em-kind="image"]')?.dataset.emName === 'image'; }));

check('no page errors', errors.length === 0, errors.join(' | '));
await p.screenshot({ path: new URL('./c3b.png', import.meta.url).pathname });
await b.close();
writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}'); // leave the copy's canvas empty for the other suites
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
