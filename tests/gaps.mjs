// The three known gaps after item 10 (2026-11-27):
//   1. a rotated layer's selection frame turns with it (own size, level size label,
//      resize along its own axes, the opposite edge stays put)
//   2. mixed-style text changed on a canvas copy is compared for Push (one rich text change)
//   3. "All like this" + a structure change to mixed text previews on every instance
// Runs on the sample copy (5390). COPY=<sample copy dir>: it puts mixed text into the
// copy's Hero.jsx for the run and restores it; leaves the canvas empty.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the sample copy folder');
const COPY = process.env.COPY;
let fails = 0;
const results = [];
const check = (name, ok, detail = '') => { if (!ok) fails++; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const file = `${COPY}/src/components/Hero.jsx`;
const orig = fs.readFileSync(file, 'utf8');
fs.writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
const b = await chromium.launch({ channel: 'chrome' });
try {
  fs.writeFileSync(file, orig
    .replace('Hand-picked multi-pitch routes with local guides.</p>', 'Hand-picked <strong className="em-bold">multi-pitch</strong> routes with <a href="#guides">local guides</a>.</p>')
    .replace(/Get started\s*<\/button>/, 'Get started <svg className="cta-icon" width="12" height="12" viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" strokeWidth="3" /></svg></button>'));
  await new Promise((r) => setTimeout(r, 700));
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  let puts = 0; p.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('/@edit-mode/canvas')) puts++; });
  await p.goto('http://localhost:5390'); await p.waitForSelector('.hero-body strong', { state: 'attached' });
  const html = () => p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''));
  const start = await html();
  await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(600);
  const wait = (ms = 80) => p.waitForTimeout(ms);
  const key = async (k) => { await p.keyboard.press(k); await wait(60); };
  const R = (f, a) => p.evaluate(f, a);
  const S = (src) => R((src) => new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot), src);
  const pick = async (q) => { await R((q) => window.__editMode.select(document.querySelector(q)), q); await wait(); };
  const typeIn = (label, value) => R(([label, value]) => {
    const i = document.querySelector('edit-mode-root').shadowRoot.querySelector(`input[aria-label="${label}"]`);
    i.focus(); i.value = value; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.blur();
  }, [label, String(value)]);
  const undoAll = async (to) => { for (let i = 0; i < 30 && (await html()) !== to; i++) await key('Meta+z'); return (await html()) === to; };
  // The frame's four corners on screen (its own box turned by its transform).
  const frameInfo = (sel) => S(`(root) => {
    const f = root.querySelector('${sel}'); const cs = getComputedStyle(f); const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat); const w = parseFloat(f.style.width), h = parseFloat(f.style.height), l = parseFloat(f.style.left), t = parseFloat(f.style.top);
    const pt = (x, y) => { const q = m.transformPoint(new DOMPoint(x - ox, y - oy)); return [l + ox + q.x, t + oy + q.y]; };
    const lab = f.querySelector('.size').getBoundingClientRect();
    return { corners: [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)], w, h, label: f.querySelector('.size').textContent, labelBox: { top: lab.top, cx: lab.left + lab.width / 2, h: lab.height } };
  }`);
  // An element's real corners on screen: its own box (rotation off for a moment) turned about its origin.
  const corners = (q) => R((q) => {
    const el = document.querySelector(q); const cs = getComputedStyle(el); const deg = parseFloat(cs.rotate) || 0;
    const z = window.__editMode.state.zoom ?? (document.body.getBoundingClientRect().width / document.body.offsetWidth);
    const save = el.style.getPropertyValue('rotate'), prio = el.style.getPropertyPriority('rotate');
    el.style.setProperty('rotate', 'none', 'important'); const r = el.getBoundingClientRect(); el.style.setProperty('rotate', save, prio);
    const [ox, oy] = cs.transformOrigin.split(' ').map((v) => parseFloat(v) * z); const a = deg * Math.PI / 180;
    const pt = (x, y) => [r.left + ox + (x - ox) * Math.cos(a) - (y - oy) * Math.sin(a), r.top + oy + (x - ox) * Math.sin(a) + (y - oy) * Math.cos(a)];
    const f = el.getBoundingClientRect();
    return { pts: [pt(0, 0), pt(r.width, 0), pt(r.width, r.height), pt(0, r.height)], foot: { bottom: f.bottom, cx: f.left + f.width / 2 }, own: [el.offsetWidth, el.offsetHeight] };
  }, q);
  const near = (a, b, tol = 1.5) => a.every((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) <= tol);

  // ---------- 1. Rotated frame ----------
  await pick('.cta-primary');
  await typeIn('Rotation', 30); await wait(150);
  let fi = await frameInfo('.frame'), el = await corners('.cta-primary');
  check('rotated 30°: the frame sits on the layer’s own corners (turned with it)', near(fi.corners, el.pts), JSON.stringify([fi.corners.map((c) => c.map(Math.round)), el.pts.map((c) => c.map(Math.round))]));
  const lw = fi.label.split(' × ').map(Number);
  check('…the size label reads its own size', Math.abs(lw[0] - el.own[0]) <= 0.5 && Math.abs(lw[1] - el.own[1]) <= 0.5, `${fi.label} vs ${el.own}`);
  check('…and stays level, centred just below the tilted footprint', Math.abs(fi.labelBox.cx - el.foot.cx) < 1.5 && fi.labelBox.top > el.foot.bottom && fi.labelBox.top < el.foot.bottom + 12, JSON.stringify([fi.labelBox, el.foot]));
  const rotZone = await S(`(root) => { const r = root.querySelector('.frame .rot[data-dir="ne"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
  check('…the rotate zone sits off the turned corner', Math.hypot(rotZone[0] - el.pts[1][0], rotZone[1] - el.pts[1][1]) < 20, JSON.stringify([rotZone, el.pts[1]]));
  const p0 = puts; await wait(1500);
  check('selected and still: no canvas saves (measuring it doesn’t touch it)', puts - p0 === 0, `${puts - p0} saves`);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '-rot.png', clip: { x: el.foot.cx - 160, y: el.foot.bottom - 160, width: 320, height: 220 } });
  await typeIn('Rotation', 0); await wait(120);
  fi = await frameInfo('.frame'); el = await corners('.cta-primary');
  check('back to 0: a plain, level frame again', near(fi.corners, el.pts) && !(await S(`(root) => root.querySelector('.frame').style.transform`)));
  // "All like this" frames (passive) turn too: rotate a card title with All like this.
  await R(() => { window.__editMode.state.scope = 'all'; }); await pick('#root .card:nth-child(1) .card-title');
  await typeIn('Rotation', 20); await wait(150);
  fi = await frameInfo('.sibs .frame'); el = await corners('#root .card:nth-child(2) .card-title');
  check('"All like this": each instance’s frame turns with it', near(fi.corners, el.pts, 2), JSON.stringify([fi.corners.map((c) => c.map(Math.round)), el.pts.map((c) => c.map(Math.round))]));
  await R(() => { window.__editMode.state.scope = 'one'; });
  check('⌘Z steps all the way back', await undoAll(start));

  // Resize a rotated rectangle on the canvas: along its own axis, its other edge stays put.
  await key('Escape'); await key('Escape');
  await p.mouse.move(700, 400); await p.mouse.wheel(1800, 0); await wait(150);
  await key('r');
  await p.mouse.move(700, 300); await p.mouse.down(); await p.mouse.move(760, 330, { steps: 3 }); await p.mouse.move(900, 400, { steps: 5 }); await p.mouse.up(); await wait(200);
  const RECT = '[data-em-canvas] > [data-em-kind="rectangle"]';
  const own0 = await p.$eval(RECT, (e) => [e.offsetWidth, e.offsetHeight]);
  await typeIn('Rotation', 90); await wait(150); // Figma 90 = a quarter turn counter-clockwise
  const handle = (d) => S(`(root) => { const r = root.querySelector('.frame .handle[data-dir="${d}"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
  const e0 = await handle('e'), w0 = await handle('w');
  const z = await R(() => document.body.getBoundingClientRect().width / document.body.offsetWidth);
  check('turned a quarter: its right handle now points up', e0[1] < w0[1] - 50 && Math.abs(e0[0] - w0[0]) < 2, JSON.stringify([e0, w0]));
  await p.mouse.move(...e0); await p.mouse.down(); await p.mouse.move(e0[0], e0[1] - 10, { steps: 2 }); await p.mouse.move(e0[0], e0[1] - 40, { steps: 4 }); await p.mouse.up(); await wait(150);
  const own1 = await p.$eval(RECT, (e) => [e.offsetWidth, e.offsetHeight]);
  const w1 = await handle('w');
  check('dragging that handle up widens it (its own axis)', Math.abs(own1[0] - (own0[0] + Math.round(40 / z))) <= 1 && own1[1] === own0[1], `${own0} → ${own1} (z ${z.toFixed(2)})`);
  check('…and its other edge stays where it was on screen', Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) < 1.5, JSON.stringify([w0, w1]));
  fi = await frameInfo('.frame'); el = await corners(RECT);
  check('…the frame still sits on its corners', near(fi.corners, el.pts));
  await key('Meta+z');
  check('one ⌘Z undoes the resize', JSON.stringify(await p.$eval(RECT, (e) => [e.offsetWidth, e.offsetHeight])) === JSON.stringify(own0));
  await key('Meta+z'); await key('Meta+z'); // the rotation, the drawing
  check('…and the canvas is empty again', await R(() => !document.querySelector('[data-em-canvas] [data-em-kind]')));
  await key('Escape');

  // ---------- 2. Mixed-style text on a canvas copy ----------
  await key('Shift+Digit1'); await wait(300);
  const dup = await S(`(root) => { const r = root.querySelector('.dup-page').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
  await p.mouse.move(...dup); await wait(100); await p.mouse.click(...dup); await wait(700); await key('Escape');
  const diff = () => R(() => window.__editMode.compareCanvas().flatMap((r) => r.changes));
  check('Duplicate page made a copy', await R(() => !!document.querySelector('[data-em-canvas] .hero-body')));
  let d = await diff();
  check('an untouched page copy (with mixed text and an icon): nothing to push', d.length === 0, JSON.stringify(d.map((c) => `${c.kind} ${c.element} ${c.property ?? ''}`)));
  const B = '[data-em-canvas] .hero-body', CTA = '[data-em-canvas] .cta-primary';
  const editEnd = async (q, text) => { await pick(q); await key('Enter'); await key('Meta+ArrowDown'); await key('End'); await p.keyboard.type(text); await key('Escape'); await wait(100); };
  await editEnd(B, ' today');
  d = await diff();
  check('words added on the copy: one rich text change, markup before and after', d.length === 1 && d[0].kind === 'text' && d[0].rich && d[0].element === 'p.hero-body'
    && d[0].from === 'Hand-picked <strong class="em-bold">multi-pitch</strong> routes with <a href="#guides">local guides</a>.'
    && d[0].to === 'Hand-picked <strong class="em-bold">multi-pitch</strong> routes with <a href="#guides">local guides</a>. today', JSON.stringify(d));
  await pick(B); await key('Enter'); await key('Meta+a'); await p.keyboard.type('Plain words'); await key('Escape'); await wait(100);
  d = await diff();
  check('typed over (the bold word and the link gone): one change, no stray styles or deletes', d.length === 1 && d[0].kind === 'text' && d[0].rich && d[0].to === 'Plain words', JSON.stringify(d.map((c) => `${c.kind} ${c.element} ${c.property ?? ''} ${c.to ?? ''}`)));
  await editEnd(CTA, 'now');
  d = await diff();
  const cta = d.find((c) => /cta-primary/.test(c.element));
  check('a button ending in an icon: End goes to the end of its words (not the start), and the icon stays an <em-keep>', cta && cta.rich && /^Get started now<em-keep n="0"><\/em-keep>$/.test(cta.to) && /<em-keep n="0"><\/em-keep>$/.test(cta.from), JSON.stringify(cta ?? d));
  // Plain text made rich on the copy: ⌘B on the title's first word.
  await pick('[data-em-canvas] .hero-title'); await key('Enter'); await key('Meta+ArrowUp'); await key('Alt+Shift+ArrowRight'); await key('Meta+b'); await key('Escape'); await wait(100);
  d = await diff();
  const title = d.find((c) => c.element === 'h1.hero-title');
  check('plain text given a bold word on the copy: a rich change (not an insert)', title?.rich && /^<(strong|span)[^>]*>Climb<\/(strong|span)> something new this weekend$/.test(title.to) && !d.some((c) => c.kind === 'insert'), JSON.stringify(d.map((c) => `${c.kind} ${c.element} ${c.to ?? ''}`)));
  await wait(800); await p.reload(); await p.waitForSelector('.hero-body strong', { state: 'attached' }); await wait(1000);
  const d2 = await diff();
  check('…the same three after a reload', d2.length === 3 && JSON.stringify(d2.map((c) => [c.element, c.to]).sort()) === JSON.stringify(d.map((c) => [c.element, c.to]).sort()), JSON.stringify(d2.map((c) => [c.element, c.to])));
  const pill = await S(`(root) => { const b = [...root.querySelectorAll('button.act')].find((x) => x.textContent.startsWith('Push')); return b?.querySelector('.n')?.textContent ?? ''; }`);
  check('the Push button counts them', pill === '3', pill);
  // Clear the canvas for the next part.
  await R(() => { for (const n of [...document.querySelector('[data-em-canvas]').children]) n.remove(); }); await wait(700);

  // ---------- 3. "All like this" + a structure change to mixed text ----------
  await key('Escape'); await key('Shift+Digit1'); await wait(200);
  const startCards = await html();
  const metas = () => p.$$eval('#root .card-meta', (es) => es.map((e) => [e.innerText, [...e.querySelectorAll('strong')].filter((s) => s.offsetParent).map((s) => s.textContent).join()]));
  await R(() => { window.__editMode.state.scope = 'all'; }); await pick('#root .card-meta');
  await key('Enter'); await key('Meta+ArrowDown'); await key('End');
  for (let i = 0; i < 5; i++) await key('Shift+ArrowLeft');
  await key('Meta+b'); await key('Escape'); await wait(150);
  let m = await metas();
  check('bold length on one card with All like this: every card previews it, with its own words', JSON.stringify(m) === JSON.stringify([['5.9 · 240 m', '240 m'], ['5.7 · 120 m', '120 m'], ['5.10a · 410 m', '410 m']]), JSON.stringify(m));
  const t = await R(() => window.__editMode.changes.list().filter((c) => c.kind === 'text'));
  check('…Push still gets one change for all of them', t.length === 1 && t[0].scope === 'all' && t[0].count === 3, JSON.stringify(t));
  await key('Meta+z');
  check('…one ⌘Z restores every card exactly', (await html()) === startCards);
  await key('Meta+Shift+z');
  m = await metas();
  check('…⌘⇧Z brings the preview back on all of them', m.every((x) => x[1] && x[0].endsWith(x[1])), JSON.stringify(m));
  await key('Meta+z');
  // A change it can't map (the words themselves retyped): only the edited card previews.
  await pick('#root .card-meta'); await key('Enter'); await key('Meta+a'); await p.keyboard.type('Grade 5.9'); await key('Escape'); await wait(120);
  m = await metas();
  check('words retyped with All like this: other cards keep theirs (no guess)', m[0][0] === 'Grade 5.9' && m[1][0] === '5.7 · 120 m' && m[2][0] === '5.10a · 410 m', JSON.stringify(m));
  await R(() => { window.__editMode.state.scope = 'one'; });
  check('⌘Z steps all the way back', await undoAll(startCards));
  check('no page errors', !errors.length, errors.join(' | '));
} finally {
  fs.writeFileSync(file, orig);
  fs.writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
  console.log(results.join('\n'));
  console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  await b.close();
}
