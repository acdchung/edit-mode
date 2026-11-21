// Canvas step C3: starting points and copies. A fresh canvas starts with a
// page-sized frame; ⌘V puts copies of page pieces onto the canvas, looking
// identical and remembering their source; Duplicate page copies the whole
// page. Runs on the demo copy (5391). COPY=<demo copy dir> (to start fresh).
import { chromium } from 'playwright-core';
import { rmSync } from 'node:fs';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
rmSync(`${process.env.COPY}/.editmode/canvas.json`, { force: true }); // a fresh canvas
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
const start = await p.$eval('#root', (e) => e.innerHTML);
const pageSame = async () => (await p.$eval('#root', (e) => e.innerHTML.replace(/ style=""/g, ''))) === start;
await p.keyboard.press('Alt+KeyE'); await wait(500);

// Compares a copy with its original, node by node: every style except sizes
// and animated ones, plus each node's size. Returns the mismatches.
const compare = (copySel, origSel) => R(([copySel, origSel]) => {
  const SKIP = /^(width|height|inline-size|block-size|min-|transform|perspective-origin|transform-origin|background-position|animation|transition)/;
  const a = document.querySelector(origSel), c = document.querySelector(copySel);
  const os = [a, ...a.querySelectorAll('*')], cs = [c, ...c.querySelectorAll('*')];
  if (os.length !== cs.length) return [`node count ${os.length} vs ${cs.length}`];
  const out = [];
  const z = document.querySelector('[data-em-canvas]').getBoundingClientRect().width / document.querySelector('[data-em-canvas]').offsetWidth;
  os.forEach((o, i) => {
    const x = getComputedStyle(o), y = getComputedStyle(cs[i]);
    for (let k = 0; k < x.length; k++) {
      const prop = x[k];
      if (SKIP.test(prop) || prop.startsWith('--')) continue;
      if (i === 0 && /^(position|top|left|right|bottom|margin|grid|align-self|justify-self|flex|order|z-index|inset)/.test(prop)) continue;
      if (x.getPropertyValue(prop) !== y.getPropertyValue(prop)) out.push(`${o.className || o.tagName} ${prop}: ${x.getPropertyValue(prop)} vs ${y.getPropertyValue(prop)}`);
    }
    const ro = o.getBoundingClientRect(), rc = cs[i].getBoundingClientRect();
    if (Math.abs(ro.width - rc.width) > 1.5 * z || Math.abs(ro.height - rc.height) > 1.5 * z) out.push(`${o.className || o.tagName} size ${Math.round(ro.width)}x${Math.round(ro.height)} vs ${Math.round(rc.width)}x${Math.round(rc.height)}`);
  });
  return out;
}, [copySel, origSel]);

// ---------- A fresh canvas: one page-sized frame ----------
const starter = await R(() => { const f = document.querySelector('[data-em-canvas] > [data-em-kind="frame"]'); return f && { name: f.dataset.emName, w: f.offsetWidth, h: f.offsetHeight, page: Math.round(document.getElementById('root').getBoundingClientRect().width / (document.body.getBoundingClientRect().width / document.body.offsetWidth)) }; });
check('a fresh canvas starts with one empty frame the size of the page', starter && starter.name === 'Page' && starter.w === starter.page && starter.h === 900, JSON.stringify(starter));
const names = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.lrow .lname')].map((n) => n.textContent));
check('Layers names it "Page" under Canvas', names.slice(names.indexOf('Canvas')).includes('Page'), names.join(' | '));

// ---------- ⌘C a page piece, ⌘V on the canvas ----------
const payslip = await R(() => { const r = document.querySelector('.payslip').getBoundingClientRect(); return [r.x + 10, r.y + 10]; });
await p.keyboard.down('Meta'); await p.mouse.click(...payslip); await p.keyboard.up('Meta'); await wait();
await R(() => window.__editMode.select(document.querySelector('.payslip'))); await wait();
await p.keyboard.press('Meta+c'); await wait();
await p.mouse.move(700, 450);
for (let i = 0; i < 4; i++) { await p.mouse.wheel(500, 0); await wait(40); }
const fr = await R(() => { const r = document.querySelector('[data-em-canvas] > [data-em-kind="frame"]').getBoundingClientRect(); return { x: r.x, y: r.y }; });
const at = [Math.max(fr.x, 300) + 80, fr.y + 120];
await p.mouse.move(...at); await wait();
const t0 = Date.now();
await p.keyboard.press('Meta+v'); await wait(200);
const pasteMs = Date.now() - t0;
const copy = await R(() => { const c = document.querySelector('[data-em-canvas] [data-em-kind="frame"] > .payslip'); if (!c) return null; const r = c.getBoundingClientRect(); return { pos: getComputedStyle(c).position, x: r.x, y: r.y, from: c.dataset.emFrom, src: !!c.querySelector('[data-src]') || c.hasAttribute('data-src'), slot: !!c.dataset.emSlot }; });
check('⌘V with the pointer over a canvas frame puts the copy into it, at the pointer', copy && copy.pos === 'absolute' && Math.abs(copy.x - at[0]) < 2 && Math.abs(copy.y - at[1]) < 2, JSON.stringify(copy));
check('the copy remembers its source (and which instance), and where it sat', /HeroShot\.jsx:\d+:\d+#0/.test(copy?.from || '') && copy.slot, String(copy?.from));
check('…but carries no page tags (never mixed with the page in "All like this" or Push)', copy && !copy.src);
check('every node inside remembers its own source too', await R(() => [...document.querySelector('[data-em-canvas] .payslip').querySelectorAll('*')].filter((n) => n.tagName !== 'path' && !n.closest('svg')).every((n) => n.dataset.emFrom)));
let diff = await compare('[data-em-canvas] .payslip', '#root .payslip');
check('the copy looks identical: every node matches its original (styles and sizes)', diff.length === 0, diff.slice(0, 6).join(' | '));
check('it’s selected, and the panel says what it’s a copy of', await R(() => window.__editMode.state.selected?.classList.contains('payslip')) &&
  /copy of HeroShot\.jsx/.test(await R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.ph-meta, .meta, [class*=meta]')?.textContent || '')),
  await R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('.ph-meta, .meta, [class*=meta]')?.textContent));
check('nothing on the canvas is in the Push list', (await R(() => window.__editMode.changes.list().length)) === 0);
await p.keyboard.press('Meta+z'); await wait();
check('⌘Z removes the copy', await R(() => !document.querySelector('[data-em-canvas] .payslip')));

// ---------- Paste into a selected frame: the same spot as on the page ----------
await R(() => window.__editMode.select(document.querySelector('[data-em-canvas] > [data-em-name="Page"]'))); await wait();
await p.mouse.move(5, 5); // the pointer isn't what decides here
await p.keyboard.press('Meta+v'); await wait(200);
const same = await R(() => {
  const c = document.querySelector('[data-em-canvas] [data-em-name="Page"] > .payslip');
  const o = document.querySelector('#root .payslip').getBoundingClientRect(), root = document.getElementById('root').getBoundingClientRect();
  const z = document.body.getBoundingClientRect().width / document.body.offsetWidth;
  return c && { left: parseFloat(getComputedStyle(c).left), top: parseFloat(getComputedStyle(c).top), want: [Math.round((o.left - root.left) / z), Math.round((o.top - root.top) / z)] };
});
check('with a canvas frame selected, ⌘V puts the copy at the same spot it has on the page', same && same.left === same.want[0] && same.top === same.want[1], JSON.stringify(same));

// ---------- Align ----------
const alignBtn = (how) => R((how) => { const b = document.querySelector('edit-mode-root').shadowRoot.querySelector(`.align-row [data-align="${how}"]`); return b && { disabled: b.disabled, title: b.title, shown: !b.closest('.align-row').hidden }; }, how);
const lt = (q) => R((q) => { const e = document.querySelector(q); return [parseFloat(getComputedStyle(e).left), parseFloat(getComputedStyle(e).top)]; }, q);
await R(() => {
  const f = document.querySelector('[data-em-canvas] > [data-em-name="Page"]');
  f.insertAdjacentHTML('beforeend', '<div class="ra" data-em-kind="rectangle" style="position:absolute;left:100px;top:50px;width:80px;height:40px;background:#ccc"></div><div class="rb" data-em-kind="rectangle" style="position:absolute;left:300px;top:200px;width:120px;height:60px;background:#aaa"></div>');
});
await R(() => window.__editMode.select(document.querySelector('.ra'))); await wait();
check('selecting something placed freely on the canvas shows the align row, enabled', (await alignBtn('left'))?.shown && !(await alignBtn('left')).disabled, JSON.stringify(await alignBtn('left')));
await p.keyboard.press('Alt+KeyH'); await wait();
check('⌥H centers it horizontally in its frame', (await lt('.ra'))[0] === (1440 - 80) / 2, String(await lt('.ra')));
await p.keyboard.press('Alt+KeyS'); await wait();
check('⌥S aligns it to the frame’s bottom', (await lt('.ra'))[1] === 900 - 40, String(await lt('.ra')));
await p.keyboard.press('Meta+z'); await wait();
check('⌘Z undoes one align', (await lt('.ra'))[1] === 50, String(await lt('.ra')));
await R(() => { const s = window.__editMode.state; s.selected = document.querySelector('.ra'); s.multi = [document.querySelector('.ra'), document.querySelector('.rb')]; }); await wait();
await p.keyboard.press('Alt+KeyD'); await wait();
// .ra is still centered (left 680, right 760); .rb runs 300–420: the selection's right edge is 760.
check('with two selected, ⌥D aligns their right edges to each other (not the frame)', (await lt('.ra'))[0] === 680 && (await lt('.rb'))[0] === 760 - 120, `${await lt('.ra')} / ${await lt('.rb')}`);
await p.keyboard.press('Alt+KeyV'); await wait();
// tops 50 (h 40) and 200 (h 60): the selection spans 50–260, centre 155.
check('…and ⌥V centers them vertically on each other', (await lt('.ra'))[1] === 155 - 20 && (await lt('.rb'))[1] === 155 - 30, `${await lt('.ra')} / ${await lt('.rb')}`);
// Distribute: needs three; equal gaps in the order they sit, the outer two stay put.
await R(() => { const s = window.__editMode.state; s.selected = document.querySelector('.ra'); s.multi = [document.querySelector('.ra'), document.querySelector('.rb')]; window.__editMode.panel.refresh(); }); await wait();
check('with two selected, distribute is greyed out, with the reason', /three or more/.test((await alignBtn('hspace'))?.title || '') && (await alignBtn('hspace')).disabled && !(await alignBtn('left')).disabled, JSON.stringify(await alignBtn('hspace')));
await R(() => {
  const f = document.querySelector('[data-em-canvas] > [data-em-name="Page"]');
  f.insertAdjacentHTML('beforeend', '<div class="d1" data-em-kind="rectangle" style="position:absolute;left:0px;top:500px;width:50px;height:50px"></div><div class="d2" data-em-kind="rectangle" style="position:absolute;left:90px;top:500px;width:100px;height:50px"></div><div class="d3" data-em-kind="rectangle" style="position:absolute;left:400px;top:500px;width:50px;height:50px"></div>');
  const s = window.__editMode.state; s.selected = f.querySelector('.d1'); s.multi = [...f.querySelectorAll('.d1,.d2,.d3')];
}); await wait();
await p.keyboard.press('Control+Alt+KeyH'); await wait();
// span 0–450, widths 200: gaps (450-200)/2 = 125; d2 goes to 50+125 = 175.
check('⌃⌥H distributes the horizontal spacing evenly (125px gaps); the outer two stay put', (await lt('.d1'))[0] === 0 && (await lt('.d2'))[0] === 175 && (await lt('.d3'))[0] === 400, `${await lt('.d1')} / ${await lt('.d2')} / ${await lt('.d3')}`);
const groups = await R(() => [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.align-row .align-seg')].map((g) => [...g.children].map((b) => b.dataset.align).join(',')));
check('the align row has two groups: horizontal and vertical', groups.join(' | ') === 'left,hcenter,right,hspace | top,vcenter,bottom,vspace', groups.join(' | '));

// Clip content
const clip = () => R(() => getComputedStyle(document.querySelector('[data-em-canvas] > [data-em-name="Page"]')).overflow);
check('a fresh canvas’s Page frame clips its content (like a new Figma frame)', (await clip()) === 'hidden', await clip());
await R(() => window.__editMode.select(document.querySelector('[data-em-canvas] > [data-em-name="Page"]'))); await wait();
const box = () => R(() => { const c = document.querySelector('edit-mode-root').shadowRoot.querySelector('.checkrow'); const i = c.querySelector('input'); const r = i.getBoundingClientRect(); return { shown: !c.hidden && !!c.offsetParent, checked: i.checked, at: [r.x + r.width / 2, r.y + r.height / 2] }; });
let cb = await box();
check('the panel shows "Clip content", checked', cb.shown && cb.checked, JSON.stringify(cb));
await p.mouse.click(...cb.at); await wait();
check('unchecking it lets content show past the frame’s edges', (await clip()) === 'visible' && !(await box()).checked, await clip());
await p.keyboard.press('Meta+z'); await wait();
check('⌘Z clips it again', (await clip()) === 'hidden');

await R(() => window.__editMode.select(document.querySelector('[data-em-canvas] > [data-em-name="Page"]'))); await wait();
const top = await alignBtn('left');
check('a single top-level frame: the align row is greyed out, with the reason', top?.shown && top.disabled && /isn’t inside a frame/.test(top.title), JSON.stringify(top));
await R(() => window.__editMode.select(document.querySelector('#root .hero-title'))); await wait();
check('on the live page there’s no align row', !(await alignBtn('left'))?.shown);

// ---------- Duplicate page ----------
const dup = await R(() => { const b = [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.lbtn.dup')][0].getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
const t1 = Date.now();
await p.mouse.click(...dup); await wait(300);
const dupMs = Date.now() - t1;
const pc = await R(() => { const f = [...document.querySelectorAll('[data-em-canvas] > [data-em-kind="frame"]')].find((x) => x.dataset.emName === 'Page copy'); const s = document.querySelector('[data-em-canvas] > [data-em-name="Page"]'); return f && { left: f.offsetLeft, startRight: s.offsetLeft + s.offsetWidth, w: f.offsetWidth, nav: !!f.querySelector('.nav'), hero: !!f.querySelector('.hero') }; });
check('Duplicate page puts a page-wide "Page copy" frame to the right of what’s there', pc && pc.left >= pc.startRight + 100 && pc.nav && pc.hero, JSON.stringify(pc));
check('…and clips at the page’s edges', await R(() => getComputedStyle(document.querySelector('[data-em-canvas] [data-em-name="Page copy"]')).overflow) === 'hidden');
diff = await compare('[data-em-canvas] [data-em-name="Page copy"] > *', '#root');
check('the whole page copy looks identical, node by node', diff.length === 0, `${diff.length}: ${diff.slice(0, 6).join(' | ')}`);
check(`copying the whole page is quick (${dupMs}ms)`, dupMs < 3000);
check('no duplicate ids in the document', await R(() => { const ids = [...document.querySelectorAll('[id]')].map((n) => n.id); return ids.length === new Set(ids).size; }));

// ---------- Reload ----------
await wait(700);
await p.reload(); await p.waitForSelector('.hero'); await wait(700);
check('after a reload, the page copy is still on the canvas, sources and all', await R(() => !!document.querySelector('[data-em-canvas] [data-em-name="Page copy"] .hero-title[data-em-from]')));
check('the app itself is untouched', await pageSame());
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`(paste took ${pasteMs}ms)`);
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await wait(600);
await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
