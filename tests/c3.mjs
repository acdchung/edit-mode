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

// ---------- Duplicate page ----------
const dup = await R(() => { const b = [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.lbtn.dup')][0].getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
const t1 = Date.now();
await p.mouse.click(...dup); await wait(300);
const dupMs = Date.now() - t1;
const pc = await R(() => { const f = [...document.querySelectorAll('[data-em-canvas] > [data-em-kind="frame"]')].find((x) => x.dataset.emName === 'Page copy'); const s = document.querySelector('[data-em-canvas] > [data-em-name="Page"]'); return f && { left: f.offsetLeft, startRight: s.offsetLeft + s.offsetWidth, w: f.offsetWidth, nav: !!f.querySelector('.nav'), hero: !!f.querySelector('.hero') }; });
check('Duplicate page puts a page-wide "Page copy" frame to the right of what’s there', pc && pc.left >= pc.startRight + 100 && pc.nav && pc.hero, JSON.stringify(pc));
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
