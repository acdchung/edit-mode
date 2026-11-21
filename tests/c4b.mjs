// Canvas steps C4b–f: X/Y, Ignore auto layout, constraints, layer order,
// group / ungroup and remove auto layout on the canvas. Runs on the demo
// copy (5391). COPY=<demo copy dir>; leaves its canvas empty.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
writeFileSync(`${process.env.COPY}/.editmode/canvas.json`, '{"html":""}');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(600);

// Frame A (no auto layout) with rectangles R and R2; frame B (auto layout) with b1, b2.
await R(() => {
  const area = document.querySelector('[data-em-canvas]');
  const mk = (kind, css, name) => { const d = document.createElement('div'); d.dataset.emKind = kind; d.dataset.emName = name; d.style.cssText = css; return d; };
  const A = mk('frame', 'position: absolute; left: 0px; top: 0px; width: 400px; height: 300px; background-color: #fff; overflow: hidden;', 'A');
  A.append(mk('rectangle', 'position: absolute; left: 20px; top: 20px; width: 50px; height: 50px; background-color: #e2572b;', 'R'));
  A.append(mk('rectangle', 'position: absolute; left: 100px; top: 120px; width: 60px; height: 40px; background-color: #333;', 'R2'));
  const B = mk('frame', 'position: absolute; left: 480px; top: 0px; width: 200px; background-color: #fff; display: flex; flex-direction: column; gap: 10px; padding: 10px;', 'B');
  for (const n of ['b1', 'b2']) B.append(mk('rectangle', 'width: 100px; height: 40px; flex-shrink: 0; background-color: #0d99ff;', n));
  area.append(A, B);
  window.__editMode.select(A);
});
await p.keyboard.press('Shift+Digit2'); await wait(200); await p.keyboard.press('Shift+Digit0'); await wait(200);
const q = (name) => `[data-em-canvas] [data-em-name="${name}"]`;
const pick = async (...names) => { await R((ss) => { const els = ss.map((s) => document.querySelector(s)); window.__editMode.select(els[0]); if (els.length > 1) { window.__editMode.state.multi = els; } window.__editMode.panel.show(els[0]); }, names.map(q)); await wait(); };
const scr = (name) => R((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; }, q(name));
const st = (name, prop) => R(([s, prop]) => document.querySelector(s).style.getPropertyValue(prop), [q(name), prop]);
const info = (name) => R((s) => { const n = document.querySelector(s); return { parent: n.parentElement.dataset.emName || (n.parentElement.hasAttribute('data-em-canvas') ? 'canvas' : '?'), index: [...n.parentElement.children].indexOf(n), pos: getComputedStyle(n).position, kind: n.dataset.emKind }; }, q(name));
// The board's HTML, with each style's declarations sorted (undo can put a property back at the end).
const board = () => R(() => document.querySelector('[data-em-canvas]').innerHTML.replace(/ style=""/g, '')
  .replace(/style="([^"]*)"/g, (m, css) => `style="${css.split(';').map((d) => d.trim()).filter(Boolean).sort().join('; ')}"`));
const sh = (fn) => R(([src]) => new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot), [fn]);
const typeIn = (label, value) => R(([label, value]) => {
  const i = document.querySelector('edit-mode-root').shadowRoot.querySelector(`input[aria-label="${label}"]`);
  i.focus(); i.value = value; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.blur();
}, [label, String(value)]);
const shown = (sel) => sh(`(root) => { const n = root.querySelector('${sel}'); return !!n && !n.closest('[hidden]') && !n.hidden; }`);
const sectionShown = (title) => sh(`(root) => { const s = [...root.querySelectorAll('section')].find((x) => x.querySelector('h4')?.textContent === '${title}'); return !!s && !s.hidden; }`);
const consLabels = () => sh(`(root) => { const s = [...root.querySelectorAll('section')].find((x) => x.querySelector('h4')?.textContent === 'Constraints'); return [...s.querySelectorAll('.dd-label')].map((l) => l.textContent).join(' / '); }`);
const setCons = async (axis, label) => {
  const r = await sh(`(root) => { const s = [...root.querySelectorAll('section')].find((x) => x.querySelector('h4')?.textContent === 'Constraints'); const b = s.querySelectorAll('.dd')[${axis === 'h' ? 0 : 1}]; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
  await p.mouse.click(...r); await wait();
  const it = await sh(`(root) => { const b = [...root.querySelectorAll('.pop .pop-item')].find((x) => x.textContent === '${label}'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
  await p.mouse.click(...it); await wait();
};
const near = (a, b) => Math.abs(a - b) <= 1;

// ---------- C4b: X / Y ----------
await pick('R');
check('X/Y show for something placed freely, measured from its frame', await shown('input[aria-label="X position"]') &&
  (await R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('input[aria-label="X position"]').value)) === '20');
let start = await board();
let r0 = await scr('R');
await typeIn('X position', 100); await typeIn('Y position', 60);
let r1 = await scr('R');
check('typing X and Y moves it there', near(r1.x - r0.x, 80) && near(r1.y - r0.y, 40) && (await st('R', 'left')) === '100px', JSON.stringify([r0, r1]));
await p.keyboard.press('Meta+z'); await p.keyboard.press('Meta+z'); await wait();
check('⌘Z puts it back', (await board()) === start);
await pick('A');
check('top-level frames have X/Y but no constraints (nothing to follow)', await shown('input[aria-label="X position"]') && !(await sectionShown('Constraints')));
await pick('b1');
check('inside auto layout: no X/Y, but the Ignore auto layout button', !(await shown('input[aria-label="X position"]')) && await shown('button[title^="Ignore auto layout"]'));

// ---------- C4c: Ignore auto layout ----------
start = await board();
r0 = await scr('b1'); const b2before = await scr('b2');
await R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('button[title^="Ignore auto layout"]').click()); await wait();
let i = await info('b1'); r1 = await scr('b1'); const b2after = await scr('b2');
check('Ignore auto layout: it leaves the flow and stays exactly where it was', i.pos === 'absolute' && i.parent === 'B' && near(r1.x, r0.x) && near(r1.y, r0.y) && near(r1.w, r0.w), JSON.stringify([r0, r1]));
check('…the others close up, and X/Y appear', near(b2after.y, r0.y) && await shown('input[aria-label="X position"]'), JSON.stringify([b2before, b2after]));
check('…the button shows it’s on', await sh(`(root) => root.querySelector('button[title="Back into auto layout"]')?.classList.contains('on')`));
await R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('button[title="Back into auto layout"]').click()); await wait();
i = await info('b1');
check('turning it off puts it back into the flow', i.pos === 'relative' && near((await scr('b1')).y, r0.y));
await p.keyboard.press('Meta+z'); await p.keyboard.press('Meta+z'); await wait();
check('⌘Z twice restores it exactly', (await board()) === start);

// ---------- C4d: constraints ----------
await pick('R');
check('Constraints show for something placed in a frame: Left / Top by default', await sectionShown('Constraints') && (await consLabels()) === 'Left / Top', await consLabels());
start = await board();
r0 = await scr('R');
await setCons('h', 'Right'); await setCons('v', 'Bottom');
r1 = await scr('R');
check('changing constraints never moves it', near(r0.x, r1.x) && near(r0.y, r1.y) && near(r0.w, r1.w) && (await consLabels()) === 'Right / Bottom', JSON.stringify([r0, r1, await consLabels()]));
check('…Right and Bottom pin it to those edges in the code', (await st('R', 'right')) === '330px' && (await st('R', 'left')) === 'auto' && (await st('R', 'bottom')) === '230px', `${await st('R', 'right')} ${await st('R', 'bottom')}`);
await pick('A'); await typeIn('Width', 500); await typeIn('Height', 400);
r1 = await scr('R');
check('resizing the frame: it follows the right and bottom edges', near(r1.x - r0.x, 100) && near(r1.y - r0.y, 100) && near(r1.w, r0.w), JSON.stringify([r0, r1]));
await p.keyboard.press('Meta+z'); await p.keyboard.press('Meta+z'); await wait();
await pick('R');
// Moving it keeps its constraints.
r0 = await scr('R');
await p.mouse.move(r0.x + 10, r0.y + 10); await p.mouse.down(); await p.mouse.move(r0.x + 40, r0.y + 30, { steps: 4 }); await p.mouse.up(); await wait(150);
r1 = await scr('R');
check('dragging it keeps Right / Bottom (the insets change instead)', (await consLabels()) === 'Right / Bottom' && near(r1.x - r0.x, 30) && (await st('R', 'right')) === '300px', `${await consLabels()} ${await st('R', 'right')}`);
await p.keyboard.press('Meta+z'); await wait();
await setCons('h', 'Left and right');
check('Left and right: both insets set, width follows the frame', (await st('R', 'width')) === 'auto' && (await st('R', 'left')) === '20px' && (await st('R', 'right')) === '330px', `${await st('R', 'width')} ${await st('R', 'left')} ${await st('R', 'right')}`);
await typeIn('Width', 80);
check('…typing W keeps the left edge and moves the right inset', near((await scr('R')).w, 80) && (await st('R', 'right')) === '300px' && (await st('R', 'width')) === 'auto', await st('R', 'right'));
await p.keyboard.press('Meta+z'); await wait();
await pick('A'); await typeIn('Width', 500); await pick('R');
check('…resizing the frame stretches it', near((await scr('R')).w, 150), JSON.stringify(await scr('R')));
await p.keyboard.press('Meta+z'); await wait(); await pick('R');
await setCons('h', 'Center');
r0 = await scr('R');
await pick('A'); await typeIn('Width', 500); await pick('R');
r1 = await scr('R');
check('Center: resizing the frame keeps it centered (moves half as far)', near(r1.x - r0.x, 50) && near(r1.w, r0.w), JSON.stringify([r0, r1]));
await p.keyboard.press('Meta+z'); await wait(); await pick('R');
await setCons('h', 'Scale');
r0 = await scr('R');
await pick('A'); await typeIn('Width', 800); await pick('R');
r1 = await scr('R');
check('Scale: resizing the frame scales its position and size', near(r1.w, r0.w * 2) && near(r1.x - (await scr('A')).x, (r0.x - (await scr('A')).x) * 2), JSON.stringify([r0, r1]));
await p.keyboard.press('Meta+z'); await wait(); await pick('R');
await setCons('h', 'Right');
r0 = await scr('R');
const wHandle = await sh(`(root) => { const h = root.querySelector('.frame .handle[data-dir="w"]'); const r = h.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
await p.mouse.move(...wHandle); await p.mouse.down(); await p.mouse.move(wHandle[0] - 30, wHandle[1], { steps: 4 }); await p.mouse.up(); await wait();
r1 = await scr('R');
check('dragging the left resize handle keeps the right edge where it is', near(r1.x + r1.w, r0.x + r0.w) && near(r1.w, r0.w + 30), JSON.stringify([r0, r1]));
for (let n = 0; n < 20 && (await board()) !== start; n++) { await p.keyboard.press('Meta+z'); await wait(40); }
check('⌘Z all the way back restores everything exactly', (await board()) === start);

// ---------- C4e: layer order ----------
await pick('R');
await p.keyboard.press('Meta+BracketRight'); await wait();
check('⌘] brings it forward (later in the code = in front)', (await info('R')).index === 1);
await p.keyboard.press('Meta+BracketLeft'); await wait();
check('⌘[ sends it back', (await info('R')).index === 0);
await pick('R2'); await p.keyboard.press('Alt+Meta+BracketLeft'); await wait();
check('⌥⌘[ sends it to the back', (await info('R2')).index === 0);
await p.keyboard.press('Alt+Meta+BracketRight'); await wait();
check('⌥⌘] brings it to the front', (await info('R2')).index === 1);
await pick('b1'); await p.keyboard.press('Meta+BracketRight'); await wait();
check('inside auto layout it moves later in the flow', (await info('b1')).index === 1 && (await scr('b1')).y > (await scr('b2')).y);
await p.keyboard.press('Meta+z'); await wait();
check('still on the page (⌘[ didn’t go Back in the browser)', p.url() === 'http://localhost:5391/');

// ---------- C4f: group, ungroup, remove auto layout ----------
start = await board();
const before2 = [await scr('R'), await scr('R2')];
await pick('R', 'R2'); await p.keyboard.press('Meta+KeyG'); await wait(150);
const g = await R(() => { const s = window.__editMode.state.selected; const r = s.getBoundingClientRect(); return { kind: s.dataset.emKind, pos: getComputedStyle(s).position, kids: s.children.length, w: s.offsetWidth, h: s.offsetHeight, parent: s.parentElement.dataset.emName }; });
const after2 = [await scr('R'), await scr('R2')];
check('⌘G on the canvas makes a group around them, the size of what’s inside', g.kind === 'group' && g.kids === 2 && g.parent === 'A' && g.pos === 'absolute' && g.w === 140 && g.h === 140, JSON.stringify(g));
check('…and nothing moves', after2.every((r, k) => near(r.x, before2[k].x) && near(r.y, before2[k].y) && near(r.w, before2[k].w)), JSON.stringify([before2, after2]));
const layerName = await R(() => { window.__editMode.layers?.sync?.(); return true; });
await p.keyboard.press('Shift+Meta+KeyG'); await wait(150);
const ug = [await info('R'), await info('R2')];
const after3 = [await scr('R'), await scr('R2')];
check('⇧⌘G ungroups: they’re back in the frame, where they were, and the group is gone', ug.every((x) => x.parent === 'A' && x.pos === 'absolute') &&
  after3.every((r, k) => near(r.x, before2[k].x) && near(r.y, before2[k].y)) && !(await R(() => document.querySelector('[data-em-kind="group"]'))), JSON.stringify(ug));
await p.keyboard.press('Meta+z'); await wait(); await p.keyboard.press('Meta+z'); await wait();
check('⌘Z twice restores it exactly', (await board()) === start);

start = await board();
const bRects = [await scr('b1'), await scr('b2'), await scr('B')];
await pick('B'); await p.keyboard.press('Alt+Shift+KeyA'); await wait(150);
const ra = [await scr('b1'), await scr('b2'), await scr('B')];
check('⌥⇧A removes auto layout: nothing moves, the frame keeps its size', (await R((s) => getComputedStyle(document.querySelector(s)).display, q('B'))) === 'block' &&
  ra.every((r, k) => near(r.x, bRects[k].x) && near(r.y, bRects[k].y) && near(r.w, bRects[k].w) && near(r.h, bRects[k].h)), JSON.stringify([bRects, ra]));
check('…what was inside is now placed freely', (await info('b1')).pos === 'absolute' && (await info('b2')).pos === 'absolute');
await p.keyboard.press('Meta+z'); await wait();
check('one ⌘Z restores it', (await board()) === start);

await R(() => window.__editMode.select(document.querySelector('.hero-title'))); await wait();
await p.keyboard.press('Shift+Meta+KeyG'); await wait(200);
check('on the live page, Ungroup says it works on the canvas', /Ungroup works on the canvas/.test(await sh('(root) => root.textContent')));
check('nothing on the canvas is in the Push list', (await R(() => window.__editMode.changes.list().length)) === 0);
check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
writeFileSync(`${process.env.COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
