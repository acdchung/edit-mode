// Roadmap item 4: padding and gap handles on the canvas.
// Part 1 runs on the sample-app copy (5390), part 2 on the demo-app copy (5391).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const seen = new Set();
const check = (name, ok, detail = '') => {
  if (!ok) fails++;
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`;
  if (!seen.has(line)) { seen.add(line); console.log(line); }
};

async function open(url, ready) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url); await p.waitForSelector(ready);
  const start = await p.$eval('#root', (e) => e.innerHTML);
  await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
  const wait = (ms = 60) => p.waitForTimeout(ms);
  const R = (f, a) => p.evaluate(f, a);
  const h = {
    p, errors, wait, R,
    same: async () => (await p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''))) === start,
    rect: (q) => R((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, q),
    // ⌘-click a spot inside `q` (its own padding/gap, so the deepest hit is q itself).
    pick: async (x, y) => { await p.keyboard.down('Meta'); await p.mouse.click(x, y); await p.keyboard.up('Meta'); await wait(); },
    sel: () => R(() => window.__editMode.state.selected?.className),
    zones: () => R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.spacing .sz')].map((z) => {
      const r = z.getBoundingClientRect(); return { id: z.dataset.id, on: z.classList.contains('on'), x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    })),
    zone: async (id) => (await h.zones()).find((z) => z.id === id),
    label: () => R(() => { const l = document.querySelector('edit-mode-root').shadowRoot.querySelector('.sz-label'); return l.hidden ? null : l.textContent; }),
    css: (q, prop) => R(([q, prop]) => getComputedStyle(document.querySelector(q)).getPropertyValue(prop), [q, prop]),
    drag: async (from, dx, dy, mods = []) => {
      for (const m of mods) await p.keyboard.down(m);
      await p.mouse.move(from.cx, from.cy); await p.mouse.down();
      await p.mouse.move(from.cx + dx, from.cy + dy, { steps: 8 }); await wait(40); await p.mouse.up();
      for (const m of mods) await p.keyboard.up(m);
      await wait();
    },
    undo: async () => { await p.keyboard.press('Meta+z'); await wait(); },
    field: (label) => p.locator(`edit-mode-root input[aria-label="${label}"]`).first(),
  };
  return h;
}

// ---------- Part 1: sample app, the signup row (flex, gap 8, no padding) ----------
{
  const h = await open('http://localhost:5390', '.signup');
  const { p, wait } = h;
  const s = await h.rect('.signup');
  await h.pick(s.x + s.w * 0.5, s.y + s.h - 1); // hmm: may land on a child; fall back below
  if ((await h.sel()) !== 'signup') {
    // the gap between input and button belongs to .signup itself
    const i = await h.rect('.signup-input');
    await h.pick(i.x + i.w + 4, i.y + i.h / 2);
  }
  check('signup row selected', (await h.sel()) === 'signup', await h.sel());

  await p.mouse.move(s.x + 400, s.y - 80); await wait();
  check('no handles while the pointer is away from the frame', (await h.zones()).length === 0, JSON.stringify(await h.zones()));
  await p.mouse.move(s.x + 30, s.y + s.h / 2); await wait();
  const z = await h.zones();
  check('pointer over the frame: 4 padding zones and 1 gap zone', z.length === 5 && z.filter((x) => x.id.startsWith('pad:')).length === 4 && !!z.find((x) => x.id === 'gap:0'), z.map((x) => x.id).join());
  check('0 padding still gets a grab strip (10px)', z.filter((x) => x.id.startsWith('pad:')).every((x) => Math.min(x.w, x.h) >= 9.9), JSON.stringify(z.map((x) => [x.id, x.w, x.h])));

  let gap = await h.zone('gap:0');
  await p.mouse.move(gap.cx, gap.cy); await wait();
  check('hovering the gap shows its value', (await h.label()) === '8', String(await h.label()));
  check('hovered zone is lit', (await h.zone('gap:0')).on);

  await h.drag(gap, 20, 0);
  check('dragging the gap right by 20 makes it 28', (await h.css('.signup', 'column-gap')) === '28px', await h.css('.signup', 'column-gap'));
  check('panel Gap field follows', (await h.field('Gap between children').inputValue()) === '28', await h.field('Gap between children').inputValue());
  await h.undo();
  check('one ⌘Z restores the page exactly', await h.same());

  gap = await h.zone('gap:0') || gap;
  await h.drag(gap, 13, 0, ['Shift']);
  check('Shift-drag snaps to steps of 8 (8+13 → 24)', (await h.css('.signup', 'column-gap')) === '24px', await h.css('.signup', 'column-gap'));
  await h.undo();

  gap = await h.zone('gap:0') || gap;
  await p.mouse.click(gap.cx, gap.cy); await wait();
  const focused = await h.R(() => document.querySelector('edit-mode-root').shadowRoot.activeElement?.getAttribute('aria-label'));
  check('clicking a gap focuses the Gap field', focused === 'Gap between children', String(focused));
  check('…and changes nothing', await h.same());
  await p.keyboard.press('Escape'); await h.R(() => document.querySelector('edit-mode-root').shadowRoot.activeElement?.blur());
  await p.mouse.move(s.x + 30, s.y + s.h / 2); await wait();

  const top = await h.zone('pad:top');
  await h.drag(top, 0, 12);
  check('dragging top padding down from 0 makes it 12', (await h.css('.signup', 'padding-top')) === '12px' && (await h.css('.signup', 'padding-bottom')) === '0px',
    `${await h.css('.signup', 'padding-top')} / ${await h.css('.signup', 'padding-bottom')}`);
  await h.undo();
  check('⌘Z restores', await h.same());

  await p.mouse.move(s.x + 30, s.y + s.h / 2); await wait();
  const left = await h.zone('pad:left');
  await h.drag(left, 10, 0, ['Alt']);
  check('⌥-drag sets both sides (left and right 10)', (await h.css('.signup', 'padding-left')) === '10px' && (await h.css('.signup', 'padding-right')) === '10px',
    `${await h.css('.signup', 'padding-left')} / ${await h.css('.signup', 'padding-right')}`);
  await h.undo();
  check('one ⌘Z restores both', await h.same());

  // Zoomed in: screen pixels are halved into CSS pixels.
  await p.keyboard.press('Meta+Equal'); await wait(120);
  const zoom = parseInt(await h.R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.zoom-btn').textContent), 10) / 100;
  const s2 = await h.rect('.signup');
  await p.mouse.move(s2.x + 30, s2.y + s2.h / 2); await wait();
  gap = await h.zone('gap:0');
  await h.drag(gap, 40, 0);
  const want = `${Math.round(8 + 40 / zoom)}px`;
  check(`at ${Math.round(zoom * 100)}% a 40px screen drag adds ${Math.round(40 / zoom)} CSS px`, (await h.css('.signup', 'column-gap')) === want, `${await h.css('.signup', 'column-gap')} vs ${want}`);
  await h.undo();
  await p.keyboard.press('Shift+Digit1'); await wait(120);

  // The Gap field's menu offers Auto (Figma's auto spacing), and only that.
  { const pick = await h.R(() => { const r = document.querySelector('edit-mode-root').shadowRoot;
      const f = r.querySelector('input[aria-label="Gap between children"]').closest('.field').querySelector('.pick');
      const b = f.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
    await p.mouse.click(...pick); await wait(150);
    const items = await h.R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.pop-item')].map((b) => b.textContent));
    check('the Gap menu offers just "Auto"', items.join() === 'Auto', items.join());
    const at = await h.R(() => { const b = document.querySelector('edit-mode-root').shadowRoot.querySelector('.pop-item').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
    await p.mouse.click(...at); await wait();
    check('picking Auto sets auto spacing', (await h.css('.signup', 'justify-content')) === 'space-between' && (await h.field('Gap between children').inputValue()) === 'Auto',
      `${await h.css('.signup', 'justify-content')} ${await h.field('Gap between children').inputValue()}`);
    await h.undo();
    check('⌘Z restores', await h.same()); }

  // A drag whose release is lost (the bar redrawn under the pointer) must not leave handles behind.
  { const s4 = await h.rect('.signup');
    await p.mouse.move(s4.x + 30, s4.y + s4.h / 2); await wait();
    const g4 = await h.zone('gap:0');
    await p.mouse.move(g4.cx, g4.cy); await p.mouse.down(); await p.mouse.move(g4.cx + 6, g4.cy, { steps: 3 });
    await h.R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.spacing').replaceChildren()); // the captured bar disappears
    await p.mouse.move(g4.cx + 12, g4.cy, { steps: 3 }); await p.mouse.up(); await wait();
    const after = await h.css('.signup', 'column-gap');
    await p.mouse.move(g4.cx + 60, g4.cy, { steps: 3 }); await wait();
    check('the drag still follows the pointer and ends on release', parseFloat(after) > 8 && (await h.css('.signup', 'column-gap')) === after,
      `${after} → ${await h.css('.signup', 'column-gap')}`);
    await h.undo();
    await p.mouse.move(s4.x + 30, s4.y + s4.h / 2); await wait();
    const g5 = await h.zone('gap:0');
    await p.mouse.move(g5.cx, g5.cy); await p.mouse.down(); await p.mouse.move(g5.cx + 6, g5.cy, { steps: 3 });
    await h.R(() => window.__editMode.state && document.querySelector('edit-mode-root')); // mid-drag, the selection goes away:
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();
    await p.mouse.up(); await wait();
    await p.mouse.move(s4.x + 30, s4.y + s4.h / 2); await wait();
    check('nothing selected: no handles left over', !(await h.sel()) && (await h.zones()).length === 0, `${await h.sel()} ${(await h.zones()).length}`);
    while (!(await h.same())) await h.undo();
    check('back to the start after the drag tests', await h.same());
    const i = await h.rect('.signup-input'); await h.pick(i.x + i.w + 4, i.y + i.h / 2); }

  // ⌘-click goes through the handles to the deepest element.
  { const s5 = await h.rect('.signup');
    await p.mouse.move(s5.x + 30, s5.y + s5.h / 2); await wait();
    const g6 = await h.zone('gap:0');
    await h.pick(g6.cx, g6.cy);
    const focused = await h.R(() => document.querySelector('edit-mode-root').shadowRoot.activeElement?.getAttribute('aria-label'));
    check('⌘-click on a gap bar selects through it, without focusing Gap', (await h.sel()) === 'signup' && !focused && await h.same(), `${await h.sel()} ${focused}`); }

  // Double-click on a zone still drills into a child.
  const s3 = await h.rect('.signup');
  await p.mouse.move(s3.x + 30, s3.y + s3.h / 2); await wait();
  const l3 = await h.zone('pad:left');
  await p.mouse.dblclick(l3.cx, l3.cy); await wait();
  check('double-click drilling changes nothing', await h.same());
  check('double-click on a zone drills in', (await h.sel()) === 'signup-input', String(await h.sel()));

  // A block element (not auto layout) gets no handles.
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();
  const hero = await h.rect('.hero');
  await h.pick(hero.x + 10, hero.y + 10);
  await p.mouse.move(hero.x + 20, hero.y + 20); await wait();
  check('non-auto-layout frame: no handles', (await h.sel()) === 'hero' && (await h.zones()).length === 0, `${await h.sel()} ${(await h.zones()).length}`);
  check('the page is unchanged at the end', await h.same());
  check('no page errors (sample)', h.errors.length === 0, h.errors.join(' | '));
  await p.context().close();
}

// ---------- Part 2: Payloom, the payslip ----------
{
  const h = await open('http://localhost:5391', '.payslip-who');
  const { p, wait } = h;
  await p.keyboard.press('Shift+Digit0'); await wait(120);
  await h.R(() => document.querySelector('.payslip-who').scrollIntoView({ block: 'center' }));
  await p.keyboard.press('Shift+Digit1'); await wait(150);
  let w = await h.rect('.payslip-who');
  await h.pick(w.x + w.w - 3, w.y + w.h - 3); // its own bottom padding
  check('payslip row selected', (await h.sel()) === 'payslip-who', String(await h.sel()));
  await p.mouse.move(w.x + w.w - 6, w.y + w.h / 2); await wait();
  let bottom = await h.zone('pad:bottom');
  check('the hidden 14px bottom padding shows as a zone', !!bottom, (await h.zones()).map((x) => x.id).join());
  if (bottom) {
    await p.mouse.move(bottom.cx, bottom.cy); await wait();
    check('hovering it shows 14', (await h.label()) === '14', String(await h.label()));
    await p.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/item4-payslip.png` : '/dev/null', clip: { x: Math.max(0, w.x - 60), y: Math.max(0, w.y - 60), width: w.w + 120, height: w.h + 120 } }).catch(() => {});
    const zoom = parseInt(await h.R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.zoom-btn').textContent), 10) / 100;
    await h.drag(bottom, 0, 6 * zoom);
    check('dragging the bottom padding down shrinks it (14 → 8)', (await h.css('.payslip-who', 'padding-bottom')) === '8px', `${await h.css('.payslip-who', 'padding-bottom')} at ${zoom}`);
    await h.undo();
    check('⌘Z restores', await h.same());
  }

  // An "Auto" gap (space-between): label says Auto; dragging turns it into a fixed gap.
  w = await h.rect('.payslip-line');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait();
  await h.pick(w.x + w.w / 2, w.y + 2);
  check('payslip line selected', (await h.sel()) === 'payslip-line', String(await h.sel()));
  await p.mouse.move(w.x + w.w / 2, w.y + 3); await wait();
  const g = await h.zone('gap:0');
  if (g) {
    await p.mouse.move(g.cx, g.cy); await wait();
    check('an auto gap shows "Auto"', (await h.label()) === 'Auto', String(await h.label()));
    await h.drag(g, -20, 0);
    const jc = await h.css('.payslip-line', 'justify-content');
    check('dragging an auto gap makes it fixed', jc !== 'space-between' && parseFloat(await h.css('.payslip-line', 'column-gap')) > 0, `${jc} ${await h.css('.payslip-line', 'column-gap')}`);
    await h.undo();
    check('⌘Z restores', await h.same());
  } else check('payslip line has a gap zone', false, (await h.zones()).map((x) => x.id).join());
  check('no page errors (demo)', h.errors.length === 0, h.errors.join(' | '));
  await p.context().close();
}

await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
