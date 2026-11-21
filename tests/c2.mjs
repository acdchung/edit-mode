// Canvas step C2: frames. The Frame tool (F) draws on the canvas only;
// top-level items move freely; shapes and text draw into canvas frames;
// delete really removes (undo brings it back). Runs on the demo copy (5391).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
const start = await p.$eval('#root', (e) => e.innerHTML);
const pageSame = async () => (await p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await wait(400);
const canvasKids = () => R(() => [...document.querySelector('[data-em-canvas]').children].map((k) => k.dataset.emKind));
const sel = () => R(() => { const s = window.__editMode.state.selected; return s ? (s.dataset.emKind || s.tagName.toLowerCase()) : null; });
const rectOf = (f) => R(f);

// Frame tool on the page: nothing.
const hero = await R(() => { const r = document.querySelector('.hero-title').getBoundingClientRect(); return [r.x + 20, r.y + 20]; });
await p.keyboard.press('f'); await wait();
check('F picks the Frame tool', await R(() => window.__editMode.state.tool) === 'frame');
await p.mouse.move(...hero); await p.mouse.down(); await p.mouse.move(hero[0] + 120, hero[1] + 80, { steps: 4 }); await p.mouse.up(); await wait();
check('the Frame tool draws nothing on the live page', (await canvasKids()).length === 0 && await pageSame());

// Pan over to the canvas.
await p.keyboard.press('Escape'); await wait();
await p.mouse.move(700, 450);
for (let i = 0; i < 4; i++) { await p.mouse.wheel(500, 0); await wait(40); }
await wait(150);
const area = await R(() => { const r = document.querySelector('[data-em-canvas]').getBoundingClientRect(); return { x: r.x, y: r.y }; });
check('panned so the canvas is on screen', area.x < 900, JSON.stringify(area));

// Draw a frame.
const o = [Math.max(area.x, 300) + 40, Math.max(area.y, 0) + 120];
await p.keyboard.press('f'); await wait();
await p.mouse.move(...o); await p.mouse.down(); await p.mouse.move(o[0] + 320, o[1] + 220, { steps: 6 }); await p.mouse.up(); await wait(150);
let k = await canvasKids();
check('dragging with the Frame tool on the canvas draws a frame', k.length === 1 && k[0] === 'frame', k.join());
const f1 = await R(() => { const f = document.querySelector('[data-em-canvas] > [data-em-kind="frame"]'); const cs = getComputedStyle(f); return { pos: cs.position, w: f.offsetWidth, h: f.offsetHeight, flex: cs.display, bg: cs.backgroundColor }; });
check('…placed where it was drawn, 320 × 220, white, no auto layout (freeform, like a new Figma frame)', f1.pos === 'absolute' && f1.w === 320 && f1.h === 220 && f1.flex === 'block' && f1.bg === 'rgb(255, 255, 255)', JSON.stringify(f1));
check('…and clips its content', await R(() => getComputedStyle(document.querySelector('[data-em-canvas] > [data-em-kind="frame"]')).overflow) === 'hidden');
check('it’s selected and the tool goes back to Select', (await sel()) === 'frame' && await R(() => window.__editMode.state.tool) === 'select');
const names = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.lrow .lname')].map((n) => n.textContent));
check('Layers lists it as "Frame" under Canvas', names.slice(names.indexOf('Canvas')).includes('Frame'), names.join(' | '));

// Draw into it: a rectangle, then text.
await p.keyboard.press('r'); await wait();
await p.mouse.click(o[0] + 60, o[1] + 60); await wait();
await p.keyboard.press('t'); await wait();
await p.mouse.click(o[0] + 200, o[1] + 180); await wait(150);
await p.keyboard.type('Hello'); await p.keyboard.press('Escape'); await wait();
const z0 = await R(() => document.querySelector('[data-em-canvas]').getBoundingClientRect().width / document.querySelector('[data-em-canvas]').offsetWidth);
const inside = await R(() => [...document.querySelector('[data-em-canvas] > [data-em-kind="frame"]').children].map((c) => ({ k: c.dataset.emKind, pos: getComputedStyle(c).position, l: parseFloat(getComputedStyle(c).left), t: parseFloat(getComputedStyle(c).top), text: c.textContent })));
check('Rectangle and Text go into the frame and stay exactly where they were drawn',
  inside.map((c) => `${c.k}:${c.pos}`).join() === 'rectangle:absolute,text:absolute' && Math.abs(inside[0].l - 60 / z0) < 2 && Math.abs(inside[0].t - 60 / z0) < 2 && Math.abs(inside[1].l - 200 / z0) < 2 && inside[1].text === 'Hello',
  JSON.stringify(inside));

// ⇧A: the free arrangement becomes auto layout, without anything moving.
const kidRects = () => R(() => [...document.querySelector('[data-em-canvas] > [data-em-kind="frame"]').children].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();
await p.mouse.click(o[0] + 300, o[1] + 40); await wait(); // the frame's empty top-right
check('clicking empty space in the frame selects it', (await sel()) === 'frame', String(await sel()));
const before = await kidRects();
await p.keyboard.press('Shift+KeyA'); await wait(150);
const al = await R(() => { const f = document.querySelector('[data-em-canvas] > [data-em-kind="frame"]'); const cs = getComputedStyle(f); return { d: cs.display, dir: cs.flexDirection, gap: cs.columnGap, pl: cs.paddingLeft, pt: cs.paddingTop, kids: [...f.children].map((c) => getComputedStyle(c).position).join() }; });
check('⇧A turns the frame into auto layout: a row (they were side by side), gap 40, padding from the edges 60', al.d === 'flex' && al.dir === 'row' && al.gap === '40px' && al.pl === '60px' && al.pt === '60px' && al.kids === 'static,static', JSON.stringify(al));
const after = await kidRects();
check('…and nothing jumps: the rectangle stays put, the text stays on the same line', after[0].join() === before[0].join() && after[1][0] === before[1][0], `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
await p.keyboard.press('Meta+z'); await wait(150);
check('one ⌘Z puts it back to freeform', (await R(() => getComputedStyle(document.querySelector('[data-em-canvas] > [data-em-kind="frame"]').firstElementChild).position)) === 'absolute' && (await kidRects()).join() === before.join());

// A click with the Frame tool on empty canvas: a 100 × 100 frame.
await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
await p.keyboard.press('f'); await p.mouse.click(o[0] + 420, o[1]); await wait(150);
k = await canvasKids();
const f2 = await R(() => { const f = document.querySelectorAll('[data-em-canvas] > [data-em-kind="frame"]')[1]; return f && [f.offsetWidth, f.offsetHeight]; });
check('a click with the Frame tool makes a 100 × 100 frame', k.length === 2 && f2?.join() === '100,100', JSON.stringify(f2));

// Drag the first frame around; arrows nudge it.
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();
const pos = () => R(() => { const f = document.querySelector('[data-em-canvas] > [data-em-kind="frame"]'); return [parseFloat(getComputedStyle(f).left), parseFloat(getComputedStyle(f).top)]; });
const p0 = await pos();
const z = await R(() => document.querySelector('[data-em-canvas]').getBoundingClientRect().width / document.querySelector('[data-em-canvas]').offsetWidth);
await p.mouse.click(o[0] + 250, o[1] + 150); await wait(); // an empty spot in the frame (clear of its padding handles)
check('clicking the frame selects it', (await sel()) === 'frame', String(await sel()));
await p.mouse.move(o[0] + 250, o[1] + 150); await p.mouse.down(); await p.mouse.move(o[0] + 260, o[1] + 160, { steps: 2 }); await p.mouse.move(o[0] + 250 + 60 * z, o[1] + 150 + 40 * z, { steps: 6 }); await p.mouse.up(); await wait();
const p1 = await pos();
check('dragging a top-level frame moves it freely (+60, +40)', Math.round(p1[0] - p0[0]) === 60 && Math.round(p1[1] - p0[1]) === 40, `${p0} → ${p1}`);
check('…its contents come along', (await R(() => document.querySelector('[data-em-canvas] > [data-em-kind="frame"]').children.length)) === 2);
// A thing inside a freeform frame drags freely too.
const rp = () => R(() => { const r = document.querySelector('[data-em-canvas] [data-em-kind="rectangle"]'); return [parseFloat(getComputedStyle(r).left), parseFloat(getComputedStyle(r).top)]; });
const rc = await R(() => { const r = document.querySelector('[data-em-canvas] [data-em-kind="rectangle"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await p.keyboard.down('Meta'); await p.mouse.click(...rc); await p.keyboard.up('Meta'); await wait();
const r0 = await rp();
await p.mouse.move(...rc); await p.mouse.down(); await p.mouse.move(rc[0] + 10, rc[1], { steps: 2 }); await p.mouse.move(rc[0] + 30 * z, rc[1] + 20 * z, { steps: 5 }); await p.mouse.up(); await wait();
const r1 = await rp();
check('something inside a freeform frame drags freely (+30, +20)', Math.round(r1[0] - r0[0]) === 30 && Math.round(r1[1] - r0[1]) === 20, `${r0} → ${r1}`);
await p.keyboard.press('Meta+z'); await wait();
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();
await p.mouse.click(o[0] + 250 + 60 * z, o[1] + 150 + 40 * z); await wait(); // reselect the frame at its new spot
await p.keyboard.press('ArrowRight'); await p.keyboard.press('Shift+ArrowDown'); await wait();
const p2 = await pos();
check('arrows nudge it (→ 1, ⇧↓ 10)', p2[0] - p1[0] === 1 && p2[1] - p1[1] === 10, `${p1} → ${p2}`);
await p.keyboard.press('Meta+z'); await p.keyboard.press('Meta+z'); await p.keyboard.press('Meta+z'); await wait();
check('⌘Z walks the moves back', (await pos()).join() === p0.join(), `${await pos()}`);
await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();

// Delete: really removed; ⌘Z brings it back.
const rr = await R(() => { const r = document.querySelector('[data-em-canvas] [data-em-kind="rectangle"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await p.keyboard.down('Meta'); await p.mouse.click(...rr); await p.keyboard.up('Meta'); await wait();
check('⌘-click picks the rectangle', (await sel()) === 'rectangle', String(await sel()));
await p.keyboard.press('Backspace'); await wait();
check('delete on the canvas removes it from the DOM', (await R(() => document.querySelectorAll('[data-em-canvas] [data-em-kind="rectangle"]').length)) === 0);
await p.keyboard.press('Meta+z'); await wait();
check('⌘Z puts it back in place', (await R(() => document.querySelector('[data-em-canvas] > [data-em-kind="frame"]').firstElementChild?.dataset.emKind)) === 'rectangle');
check('nothing on the canvas is in the Push list', (await R(() => window.__editMode.changes.list().length)) === 0);

// Reload: frames come back and still take new content.
await wait(700);
await p.reload(); await p.waitForSelector('.hero'); await wait(700);
await p.mouse.move(700, 450);
for (let i = 0; i < 4; i++) { await p.mouse.wheel(500, 0); await wait(40); }
await wait(150);
k = await canvasKids();
check('after a reload, both frames are back', k.join() === 'frame,frame', k.join());
check('…without session markers', await R(() => !document.querySelector('[data-em-canvas] [data-em-new]')));
const fr = await R(() => { const r = document.querySelector('[data-em-canvas] > [data-em-kind="frame"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
if (fr.x > 0 && fr.x < 1300) {
  await p.keyboard.press('o'); await p.mouse.click(fr.x + fr.w / 2, fr.y + fr.h - 10); await wait(150);
  check('a reloaded frame still takes new shapes', (await R(() => document.querySelector('[data-em-canvas] > [data-em-kind="frame"]').lastElementChild?.dataset.emKind)) === 'ellipse');
} else check('reloaded frame is on screen', false, JSON.stringify(fr));
check('the app itself is untouched', await pageSame());
check('no page errors', errors.length === 0, errors.join(' | '));
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await wait(600);
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
