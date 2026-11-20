// Roadmap item 3: moving and resizing several elements at once.
// Run against the sample-app copy on port 5390.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`; results.push(line); console.error(line); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
const start = await p.$eval('#root', e => e.innerHTML);
const same = async () => (await p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
await p.keyboard.press('Shift+Digit1'); await p.waitForTimeout(100); // fit the page between the panels

const st = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
const multi = () => st(() => window.__editMode.state.multi.map(s => s.className || s.tagName));
const rect = (q, i = 0) => st(([q, i]) => { const r = document.querySelectorAll(q)[i].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, [q, i]);
const ctr = async (q, i = 0) => { const r = await rect(q, i); return [r.x + r.w / 2, r.y + r.h / 2]; };
const click = async (x, y, mods = []) => { for (const m of mods) await p.keyboard.down(m); await p.mouse.click(x, y); for (const m of mods) await p.keyboard.up(m); await wait(); };
const clickQ = async (q, i = 0, mods = []) => { const [x, y] = await ctr(q, i); await click(x, y, mods); };
const esc = async (n = 5) => { for (let k = 0; k < n; k++) await p.keyboard.press('Escape'); };
const undo = async (n = 1) => { for (let k = 0; k < n; k++) { await p.keyboard.press('Meta+z'); await wait(); } };
const drag = async (from, to, mods = []) => {
  for (const m of mods) await p.keyboard.down(m);
  await p.mouse.move(...from); await p.mouse.down(); await p.mouse.move(from[0] + 8, from[1] + 8, { steps: 2 });
  await p.mouse.move(...to, { steps: 10 }); await wait(40); await p.mouse.up();
  for (const m of mods) await p.keyboard.up(m);
  await wait();
};
const R = (f) => st(f);
const shadowQ = (q) => `document.querySelector('edit-mode-root').shadowRoot.querySelector(${JSON.stringify(q)})`;
const field = (label) => p.locator(`edit-mode-root input[aria-label="${label}"]`).first();
const cardNames = () => st(() => [...document.querySelectorAll('.card-grid > .card .card-title')].map(t => t.textContent.split(' ')[0]));
// A card's own padding (bottom-left corner): ⌘-click there selects the card itself.
const cardSpot = async (i) => { const r = await rect('.card', i); return [r.x + 5, r.y + r.h - 4]; };
const selectCards = async (...idx) => {
  await esc();
  const [x, y] = await cardSpot(idx[0]); await click(x, y, ['Meta']);
  for (const i of idx.slice(1)) { const [a, c] = await cardSpot(i); await click(a, c, ['Shift']); }
};

// ---------- Group frame ----------
await selectCards(0, 2);
check('two cards selected', (await multi()).join() === 'card,card', (await multi()).join());
{ const f = await R(() => {
    const r = document.querySelector('edit-mode-root').shadowRoot;
    const main = r.querySelector('.frame:not(.passive)');
    const cards = [...document.querySelectorAll('.card')];
    const u = { l: Math.min(...[0, 2].map(i => cards[i].getBoundingClientRect().left)), r: Math.max(...[0, 2].map(i => cards[i].getBoundingClientRect().right)),
                t: Math.min(...[0, 2].map(i => cards[i].getBoundingClientRect().top)), b: Math.max(...[0, 2].map(i => cards[i].getBoundingClientRect().bottom)) };
    const m = main.getBoundingClientRect();
    const own = [...r.querySelectorAll('.multis .frame')];
    const lab = main.querySelector('.size').getBoundingClientRect();
    const ownLab = own.map(x => x.querySelector('.size').getBoundingClientRect());
    return { group: main.classList.contains('group'), fits: Math.abs(m.left - u.l) < 1 && Math.abs(m.right - u.r) < 1 && Math.abs(m.top - u.t) < 1 && Math.abs(m.bottom - u.b) < 1,
      handles: main.querySelectorAll('.handle').length, own: own.length, ownHandles: own.map(x => x.querySelectorAll('.handle').length),
      border: getComputedStyle(main).borderTopStyle + getComputedStyle(main).borderTopColor === getComputedStyle(own[0]).borderTopStyle + getComputedStyle(own[0]).borderTopColor,
      label: main.querySelector('.size').textContent, labelsClear: ownLab.every(o => lab.top >= o.bottom || lab.bottom <= o.top || lab.right <= o.left || lab.left >= o.right) };
  });
  check('one frame with handles goes around the whole selection', f.group && f.fits && f.handles === 8, JSON.stringify(f));
  check('each selected element keeps its own full frame, same style (DESIGN.md)', f.own === 2 && f.ownHandles.every(h => h === 8) && f.border, JSON.stringify(f));
  check('the group size label doesn’t sit on the elements’ own labels', f.labelsClear, f.label); }
await p.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/item3-group.png` : '/dev/null' }).catch(() => {});

// ---------- Panel: shared fields ----------
{ const t = await R(() => { const r = document.querySelector('edit-mode-root').shadowRoot;
    return { name: r.querySelector('.ph-name').textContent, secs: [...r.querySelectorAll('.pb > section:not(.multi)')].filter(s => !s.hidden && s.offsetParent).map(s => s.querySelector('h4').textContent),
      group: !!r.querySelector('.multi:not([hidden]) .mbtn') }; });
  check('panel shows "2 selected", the Group/Auto layout/Delete buttons and shared sections', t.name === '2 selected' && t.group && ['Layout', 'Appearance', 'Stroke'].every(s => t.secs.includes(s)) && !t.secs.includes('Text'), JSON.stringify(t)); }
check('equal values show plainly (stroke weight 1)', await field('Stroke weight').inputValue() === '1', await field('Stroke weight').inputValue());
await field('Stroke weight').fill('3'); await field('Stroke weight').press('Enter'); await wait();
{ const w = await st(() => [...document.querySelectorAll('.card')].map(c => getComputedStyle(c).borderTopWidth).join());
  check('an edit applies to every selected element', w === '3px,1px,3px', w); }
await undo();
check('one ⌘Z undoes it on all of them', await same());

// Mixed values: thumbnails 1 and 3 have different corner radii (featured = 18px).
await esc(); await clickQ('.card-thumb', 0, ['Meta']); await clickQ('.card-thumb', 2, ['Shift']);
const radii = () => st(() => [...document.querySelectorAll('.card-thumb')].map(c => getComputedStyle(c).borderTopLeftRadius).join());
const r0 = await radii();
check('different values read "Mixed"', await field('Corner radius').inputValue() === 'Mixed', `${await field('Corner radius').inputValue()} (${r0})`);
await field('Corner radius').focus(); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await field('Corner radius').blur(); await wait();
{ const a = r0.split(',').map(parseFloat); const bb = (await radii()).split(',').map(parseFloat);
  check('↑ on a Mixed field shifts each element by the same amount', bb[0] === a[0] + 2 && bb[2] === a[2] + 2 && bb[1] === a[1], `${r0} → ${bb}`); }
await field('Corner radius').fill('20'); await field('Corner radius').press('Enter'); await wait();
check('typing a value sets it on all of them', (await radii()) === `20px,${r0.split(',')[1]},20px`, await radii());
check('…and the field now reads it plainly', await field('Corner radius').inputValue() === '20');
await undo(2);
check('⌘Z twice restores both', await same());

// Shadow: added to both, then X changed: each keeps its own other values.
await selectCards(0, 1);
await p.locator('edit-mode-root button[aria-label="Add shadow"]').click(); await wait();
await field('Shadow X offset').fill('10'); await field('Shadow X offset').press('Enter'); await wait();
{ const s = await st(() => [...document.querySelectorAll('.card')].map(c => getComputedStyle(c).boxShadow));
  check('Add shadow + X offset reach both cards', s[0] === s[1] && /10px 4px/.test(s[0]) && s[2] === 'none', s.join(' | ')); }
await field('Shadow color').fill('FF0000'); await field('Shadow color').press('Enter'); await wait();
{ const s = await st(() => [...document.querySelectorAll('.card')].map(c => getComputedStyle(c).boxShadow));
  check('changing a color keeps each one’s opacity', s.every((x, i) => i === 2 || /rgba\(255, 0, 0, 0.25\)/.test(x)), s.join(' | ')); }
{ const list = await st(() => window.__editMode.changes.list().map(c => `${c.scope}:${c.property}`));
  check('Push gets one entry per element (scope "one")', list.length === 2 && list.every(x => x.startsWith('one:box-shadow')), list.join()); }
await undo(3);
check('undo puts the shadows away', await same());

// Text: a title and the hero title differ in size.
await esc(); await clickQ('.card-title', 0, ['Meta']); await clickQ('.hero-title', 0, ['Shift', 'Meta']);
{ const secs = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.pb > section')].filter(s => s.offsetParent && !s.hidden).map(s => s.querySelector('h4')?.textContent));
  check('two texts: the Text section shows, font size reads Mixed', secs.includes('Text') && await field('Font size').inputValue() === 'Mixed', `${secs} / ${await field('Font size').inputValue()}`); }
await esc();

// ---------- Drag several ----------
await selectCards(0, 2);
{ const from = await ctr('.card-title', 0); // pressing a title inside a selected card grabs the selection
  const c2 = await rect('.card', 1);
  await drag(from, [c2.x + c2.w - 10, c2.y + c2.h / 2]);
  const names = await cardNames();
  check('dragging one of two selected cards moves both, in order', names.join() === 'Granite,Moonlight,The', names.join());
  check('both stay selected after the drop', (await multi()).length === 2);
  check('Push describes two moves', (await st(() => window.__editMode.changes.list().filter(c => c.kind === 'move').length)) === 2);
  await undo();
  check('one ⌘Z puts both back', await same(), (await cardNames()).join()); }

await selectCards(0, 2);
{ const from = await ctr('.card-title', 2);
  const body = await rect('.hero-body');
  await drag(from, [body.x + 40, body.y + body.h - 2]);
  // Live page: moving into another frame is structure (the canvas's job), so nothing moves.
  check('dropping them outside their frame moves nothing', await same(), (await cardNames()).join());
  check('…and they stay selected', (await multi()).length === 2); }

await selectCards(0, 2);
{ const from = await ctr('.card-title', 0);
  const c2 = await rect('.card', 1);
  await drag(from, [c2.x + c2.w - 10, c2.y + c2.h / 2], ['Alt']);
  const n = await st(() => document.querySelectorAll('.card').length);
  const sel = await multi();
  check('⌥-drag copies all of them and leaves the originals', n === 5 && sel.length === 2 && (await st(() => window.__editMode.state.multi.every(x => x.dataset.emCopyOf))), `cards=${n}, selected=${sel}`);
  await undo();
  check('one ⌘Z removes both copies', await same()); }

await selectCards(0, 2);
{ const [x, y] = await ctr('.card-title', 2); await click(x, y);
  check('a click (no drag) on one of them selects just that one', (await multi()).join() === 'card' || (await multi()).length === 1, (await multi()).join()); }

// ---------- Resize several ----------
await selectCards(0, 2);
{ const before = await st(() => [...document.querySelectorAll('.card')].map(c => c.getBoundingClientRect()).map(r => [r.width, r.height]));
  const h = await st(() => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame.group .handle[data-dir="e"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const g0 = await st(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame.group').getBoundingClientRect().width);
  await p.mouse.move(...h); await p.mouse.down(); await p.mouse.move(h[0] - g0 * 0.2, h[1], { steps: 10 }); await p.mouse.up(); await wait();
  const after = await st(() => [...document.querySelectorAll('.card')].map(c => c.getBoundingClientRect()).map(r => [r.width, r.height]));
  const f = (g0 * 0.8) / g0;
  const okW = [0, 2].every(i => Math.abs(after[i][0] / before[i][0] - f) < 0.02) && Math.abs(after[1][0] - before[1][0]) < 0.5;
  check('dragging the group’s side handle scales each element’s width by the same factor', okW, `×${f.toFixed(2)}: ${before.map(x => x[0].toFixed(1))} → ${after.map(x => x[0].toFixed(1))}`);
  check('…heights untouched without Shift', [0, 2].every(i => Math.abs(after[i][1] - before[i][1]) < 1));
  check('Push gets plain widths in CSS px', (await st(() => window.__editMode.changes.list().filter(c => c.property === 'width').every(c => /^\d+px$/.test(c.value)))));
  await undo();
  check('one ⌘Z restores both sizes', await same()); }

await selectCards(0, 2);
{ const before = await st(() => [...document.querySelectorAll('.card')].map(c => c.getBoundingClientRect()).map(r => [r.width, r.height]));
  const h = await st(() => { const r = document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame.group .handle[data-dir="se"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.keyboard.down('Shift');
  await p.mouse.move(...h); await p.mouse.down(); await p.mouse.move(h[0] - 60, h[1] - 10, { steps: 10 }); await p.mouse.up();
  await p.keyboard.up('Shift'); await wait();
  const after = await st(() => [...document.querySelectorAll('.card')].map(c => c.getBoundingClientRect()).map(r => [r.width, r.height]));
  const fw = after[0][0] / before[0][0]; const fh = after[0][1] / before[0][1];
  check('Shift keeps proportions (width and height scale together)', Math.abs(fw - fh) < 0.03 && fw < 0.98, `w×${fw.toFixed(3)} h×${fh.toFixed(3)}`);
  await undo();
  check('…and one ⌘Z restores', await same()); }

// ---------- Arrow keys ----------
await selectCards(0, 2);
await p.keyboard.press('ArrowRight'); await p.keyboard.press('Shift+ArrowRight'); await wait();
{ const m = await st(() => [...document.querySelectorAll('.card')].map(c => getComputedStyle(c).marginLeft).join());
  check('outside auto layout, arrows nudge every selected element', m === '11px,0px,11px', m); }
await undo(2);
check('two ⌘Z undo both nudges', await same());

// Hero → auto layout (vertical), then move two of its children as a block.
await esc(); await clickQ('.eyebrow', 0, ['Meta']); await p.keyboard.press('Escape'); await p.keyboard.press('Shift+KeyA'); await wait();
const kids = () => st(() => [...document.querySelector('.hero').children].map(k => k.className.split(' ').pop()).join());
await esc(); await clickQ('.eyebrow', 0, ['Meta']); await clickQ('.hero-title', 0, ['Shift']);
await p.keyboard.press('ArrowDown'); await wait();
check('inside auto layout, ↓ moves both one step later, as a block', (await kids()) === 'hero-body,eyebrow,hero-title,cta-primary', await kids());
await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await wait();
check('↑ at the start stops without scrambling them', (await kids()) === 'eyebrow,hero-title,hero-body,cta-primary', await kids());
await undo(4);
check('undo restores the hero', await same());

// ---------- Zoomed ----------
await esc(); await p.keyboard.press('Shift+Digit0'); await wait(); // 100%
await p.keyboard.press('Meta+Minus'); await wait(150);
await selectCards(0, 1);
{ const lab = await st(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.frame.group .size').textContent);
  const css = await st(() => { const c = [...document.querySelectorAll('.card')]; const w = c[1].offsetLeft + c[1].offsetWidth - c[0].offsetLeft; return `${w} × ${c[0].offsetHeight}`; });
  check('zoomed out, the group label is in CSS px', lab.replace(/\.\d+/g, '') === css || Math.abs(parseFloat(lab) - parseFloat(css)) < 1, `${lab} vs ${css}`); }

check('no page errors', !errors.length, errors.join('; '));
await b.close();
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
