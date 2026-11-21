// B3a: Push compares the canvas with the page. Untouched copies list
// nothing (also after a reload); each kind of change on a copy comes out as
// one row (style, text, delete, add, reorder, move into another container,
// group, auto layout, placed freely with constraints); repeated items get a
// "Just this one / All N" switch; two copies changing the same thing
// differently are flagged; a copy can be unticked; canvas rows aren't sent
// yet (B3b). Push is intercepted: Claude never runs. Runs on the demo copy
// (5391). COPY=<demo copy dir>; leaves its canvas empty.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
const COPY = process.env.COPY;
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
const pushed = [];
await p.route('**/@edit-mode/push', (route) => { pushed.push(JSON.parse(route.request().postData())); route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"test: not sent"}' }); });
const R = (f, a) => p.evaluate(f, a);
const wait = (ms = 80) => p.waitForTimeout(ms);
await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
await p.keyboard.press('Alt+KeyE'); await wait(600);

const S = (fn, arg) => R(([src, arg]) => new Function('root', 'arg', `return (${src})(root, arg)`)(document.querySelector('edit-mode-root').shadowRoot, arg), [fn.toString(), arg]);
const pick = async (...sels) => { await R((ss) => { const els = ss.map((s) => document.querySelector(s)); window.__editMode.select(els[0]); if (els.length > 1) window.__editMode.state.multi = els; window.__editMode.panel.show(els[0]); }, sels); await wait(); };
const clickPanel = (fn) => R(([src]) => { const n = new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot); n.click(); return !!n; }, [fn]);
const typeIn = (label, value) => R(([label, value]) => {
  const i = document.querySelector('edit-mode-root').shadowRoot.querySelector(`input[aria-label="${label}"]`);
  i.focus(); i.value = value; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); i.blur();
}, [label, String(value)]);
const clickAt = async (r) => { await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await wait(); };
const panelRect = (fn) => S(`(root) => { const el = (${fn})(root); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }`);
const section = (title) => `[...root.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === '${title}')`;
const diff = () => R(() => window.__editMode.compareCanvas().map((r) => ({ name: r.copy.name, missing: r.missing, changes: r.changes.map((c) => ({ ...c, children: c.children?.map((k) => k.element) })) })));
const rows = (d, name) => (d.find((r) => r.name === name)?.changes ?? []);
const pill = () => S(`(root) => { const b = [...root.querySelectorAll('button.act')].find((x) => x.textContent.startsWith('Push')); return b && { disabled: b.disabled, n: b.querySelector('.n')?.textContent ?? '' }; }`);
const settle = () => wait(450); // the pill's count refreshes 300ms after edits

const PC = '[data-em-canvas] > [data-em-name="Page copy"]';
const PASTED = '[data-em-canvas] > .payslip';
const P = `${PC} .payslip`;

// ---------- Untouched copies list nothing ----------
await R(() => window.__editMode.select(document.querySelector('#root .payslip'))); await wait();
await p.keyboard.press('Meta+c'); await wait(); await p.keyboard.press('Escape'); await wait();
await p.mouse.wheel(1800, 0); await wait(100); await p.mouse.move(700, 300); await wait();
await p.keyboard.press('Meta+v'); await wait(300); await p.keyboard.press('Escape'); await wait();
const dup = await S(`(root) => { const r = root.querySelector('.lbtn.dup').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
await p.mouse.move(...dup); await wait(100); await p.mouse.click(...dup); await wait(600); await p.keyboard.press('Escape');
let d = await diff();
check('a pasted payslip and a whole page copy, untouched: nothing to push', d.length === 2 && d.every((r) => r.changes.length === 0 && r.missing === 0), JSON.stringify(d.map((r) => [r.name, r.changes.length, r.changes.slice(0, 3).map((c) => `${c.kind} ${c.element} ${c.property ?? ''}`)])));
check('…each copy once, named like its canvas item (Page copy, Payslip)', d.map((r) => r.name).sort().join() === 'Page copy,Payslip', d.map((r) => r.name).join());
const ms = await R(() => { const t = performance.now(); window.__editMode.compareCanvas(); return performance.now() - t; });
check(`comparing them is quick (${Math.round(ms)}ms)`, ms < 100);
await settle();
check('the Push button stays off', (await pill())?.disabled === true, JSON.stringify(await pill()));
await wait(700); await p.reload(); await p.waitForSelector('.hero'); await wait(900);
d = await diff();
check('…and still nothing after a reload', d.length === 2 && d.every((r) => r.changes.length === 0), JSON.stringify(d.map((r) => [r.name, r.changes.length])));

// ---------- One of each kind of change on the page copy's payslip ----------
// Auto layout around the bar lines (⇧A).
await pick(`${P} > .payslip-line:nth-of-type(3)`, `${P} > .payslip-line:nth-of-type(4)`); await p.keyboard.press('Shift+KeyA'); await wait(200);
// Net pay to the top (⌥⌘[).
await pick(`${P} > .payslip-net`); await p.keyboard.press('Alt+Meta+BracketLeft'); await wait(150);
// The amount placed freely, pinned right and bottom.
const amt = `${P} .payslip-net-value`;
await pick(amt);
await clickPanel(`(root) => root.querySelector('button[title^="Ignore auto layout"]')`); await wait(150);
for (const [axis, label] of [['h', 'Right'], ['v', 'Bottom']]) {
  await clickAt(await panelRect(`(root) => ${section('Constraints')}.querySelectorAll('.dd')[${axis === 'h' ? 0 : 1}]`));
  await clickAt(await panelRect(`(root) => [...root.querySelectorAll('.pop .pop-item')].find((x) => x.textContent === '${label}')`));
}
// Kicker + name grouped (⌘G).
await pick(`${P} > .payslip-kicker`, `${P} > .payslip-who`); await p.keyboard.press('Meta+KeyG'); await wait(150);
// A gradient fill on the payslip.
await pick(P);
await clickAt(await panelRect(`(root) => [...${section('Fill')}.querySelectorAll('.crow')].filter((r) => !r.closest('.grad')).find((r) => !r.hidden)?.querySelector('.swatch')`));
await clickAt(await panelRect(`(root) => [...root.querySelectorAll('.pop .types button')].find((b) => b.textContent === 'Linear')`));
await p.keyboard.press('Escape'); await wait();
// Net pay 200 wide.
await pick(`${P} > .payslip-net`); await typeIn('Width', 200); await wait(150);
// The name's text, the place line deleted, the avatar moved into Net pay, a new text added.
await R((s) => {
  const { changes } = window.__editMode;
  const name = document.querySelector(`${s} .payslip-name`);
  changes.beginText(name); name.firstChild.nodeValue = 'Lucía F.'; changes.endText();
  changes.remove(document.querySelector(`${s} .payslip-place`), 'one');
  const net = document.querySelector(`${s} .payslip-net`);
  changes.move(document.querySelector(`${s} .payslip-avatar`), 'one', 0, net);
  const t = document.createElement('div'); t.dataset.emKind = 'text'; t.textContent = 'Paid on the 28th';
  changes.insert(t, document.querySelector(s), document.querySelector(s).children.length, { what: 'text', styles: {}, text: 'Paid on the 28th' });
}, P);
// A repeated item: Kenji's name (one of three people) in bold.
await pick(`${PC} .shot-row .shot-name`); await R((s) => window.__editMode.changes.set(document.querySelector(s), 'one', 'font-weight', '800'), `${PC} .shot-row .shot-name`);
// The same amount, different colours in the two copies: a conflict.
await R(([a, b2]) => { const { changes } = window.__editMode; changes.set(document.querySelector(a), 'one', 'color', 'rgb(220, 0, 0)'); changes.set(document.querySelector(b2), 'one', 'color', 'rgb(0, 0, 220)'); }, [amt, `${PASTED} .payslip-net-value`]);
await p.keyboard.press('Escape'); await settle();

d = await diff();
const pc = rows(d, 'Page copy'), ps = rows(d, 'Payslip');
const find = (list, f) => list.filter(f);
const one = (name, list, f, detail) => { const m = find(list, f); check(name, m.length === 1, detail ?? JSON.stringify(m.map((c) => `${c.kind} ${c.element} ${c.property ?? ''} ${c.to ?? ''}`))); return m[0]; };
one('style: the gradient fill', pc, (c) => c.kind === 'style' && c.element === 'div.payslip' && c.property === 'background-image' && /^linear-gradient/.test(c.to));
one('style: Net pay 184 → 200 wide', pc, (c) => c.kind === 'style' && c.element === 'div.payslip-net' && c.property === 'width' && c.from === '184px' && c.to === '200px');
const place = one('placed freely: the amount, pinned right and bottom, in Net pay', pc, (c) => c.kind === 'place' && c.element === 'span.payslip-net-value');
check('…with where it sits and how big its frame is', place && place.constraints.h === 'end' && place.constraints.v === 'end' && place.parent.element === 'div.payslip-net' && place.box.frameWidth > 0, JSON.stringify(place));
one('reorder: Net pay to the top (before the kicker)', pc, (c) => c.kind === 'move' && c.element === 'div.payslip-net' && !c.into && !c.after && c.before?.element === 'div.payslip-kicker');
const grp = one('a group around the kicker and the name', pc, (c) => c.kind === 'group' && !c.autoLayout && c.children.join() === 'div.payslip-kicker,div.payslip-who');
check('…placed after Net pay', grp?.after?.element === 'div.payslip-net', JSON.stringify(grp?.after));
const al = one('an auto layout frame around the two bar lines', pc, (c) => c.kind === 'group' && c.autoLayout && c.children.join() === 'div.payslip-line,div.payslip-line');
check('…with its layout (column, the gap)', al && al.styles.display === 'flex' && al.styles['flex-direction'] === 'column' && 'row-gap' in al.styles, JSON.stringify(al?.styles));
one('text: Lucía Ferreira → Lucía F.', pc, (c) => c.kind === 'text' && c.from === 'Lucía Ferreira' && c.to === 'Lucía F.');
one('delete: the place line', pc, (c) => c.kind === 'delete' && c.element === 'div.payslip-place');
one('move into another container: the avatar into Net pay, first', pc, (c) => c.kind === 'move' && c.into && /payslip-avatar/.test(c.element) && c.parent.element === 'div.payslip-net' && !c.after);
one('add: the new text, last in the payslip', pc, (c) => c.kind === 'insert' && c.what === 'text' && c.text === 'Paid on the 28th' && c.parent.element === 'div.payslip');
const kenji = one('a repeated item: Kenji’s name, one of three', pc, (c) => c.kind === 'style' && c.element === 'span.shot-name' && c.property === 'font-weight' && c.count === 3 && c.index === 0);
const conflictPC = one('the amount’s colour in the page copy…', pc, (c) => c.kind === 'style' && c.property === 'color' && c.element === 'span.payslip-net-value');
const conflictPS = one('…and in the pasted payslip', ps, (c) => c.kind === 'style' && c.property === 'color' && c.element === 'span.payslip-net-value');
check('…are flagged as a conflict, each naming the other copy', conflictPC?.conflict === 'Payslip' && conflictPS?.conflict === 'Page copy', `${conflictPC?.conflict} / ${conflictPS?.conflict}`);
const known = new Set([...pc, ...ps].filter((c) => [place, grp, al, kenji, conflictPC, conflictPS].includes(c)));
const extra = pc.filter((c) => !known.has(c) && !(
  (c.kind === 'style' && c.element === 'div.payslip' && /^background-(image|color)$/.test(c.property)) || (c.kind === 'style' && c.element === 'div.payslip-net' && c.property === 'width') ||
  (c.kind === 'move' && /payslip-(net|avatar)/.test(c.element)) || /^(text|delete|insert)$/.test(c.kind)));
check('nothing else is listed (no noise from how copies are made)', extra.length === 0 && ps.length === 1, JSON.stringify(extra.map((c) => `${c.kind} ${c.element} ${c.property ?? ''} ${c.from ?? ''} → ${c.to ?? ''}`)));

// ---------- The Push dialog ----------
await settle();
const total = pc.length + ps.length;
check(`the Push button counts the canvas changes (${total})`, (await pill())?.n === String(total) && !(await pill()).disabled, JSON.stringify(await pill()));
await p.keyboard.press('Meta+Enter'); await wait(200);
const dlg = () => S(`(root) => { const d = root.querySelector('.dialog'); if (!d) return null; return {
  title: d.querySelector('h3').textContent, secs: [...d.querySelectorAll('h4.sec')].map((h) => h.textContent),
  copies: [...d.querySelectorAll('.copyrow')].map((r) => [r.querySelector('.name').textContent, r.querySelector('.n').textContent, r.querySelector('input').checked]),
  rows: [...d.querySelectorAll('.list li')].map((l) => l.textContent), conflicts: d.querySelectorAll('.list li.conflict').length,
  scopes: [...d.querySelectorAll('.list li .scope')].map((s) => s.textContent), proceed: d.querySelector('.pbtn.primary').disabled }; }`);
let g = await dlg();
await p.screenshot({ path: new URL('./b3a.png', import.meta.url).pathname, clip: await S(`(root) => { const r = root.querySelector('.dialog').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; }`) });
check('the dialog has a "From the canvas" section, marked not sent yet', g && g.secs.join() === 'From the canvasNot sent yet', JSON.stringify(g?.secs));
check('…a ticked row per copy, with its count', g && JSON.stringify(g.copies) === JSON.stringify([['Payslip', '1', true], ['Page copy', String(pc.length), true]]) || JSON.stringify(g?.copies) === JSON.stringify([['Page copy', String(pc.length), true], ['Payslip', '1', true]]), JSON.stringify(g?.copies));
check('…each change in words', g && g.rows.some((r) => /^Place span\.payslip-net-value freely in div\.payslip-net, pinned right and bottom$/.test(r)) && g.rows.some((r) => /^Auto layout frame around div\.payslip-line, div\.payslip-line$/.test(r)) &&
  g.rows.some((r) => /^Move div\.payslip-net before div\.payslip-kicker$/.test(r)) && g.rows.some((r) => /^Text of .*Lucía F\./.test(r)), JSON.stringify(g?.rows));
check('…the conflicting rows stand out', g?.conflicts === 2);
check('…the repeated item has a "Just this one" switch', g && g.scopes.join() === 'Just this one', JSON.stringify(g?.scopes));
check('…Proceed is off: there’s nothing on the page to send, and canvas changes are sent from B3b on', g?.proceed === true);
await clickAt(await S(`(root) => { const r = root.querySelector('.list li .scope').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }`));
g = await dlg();
check('the switch flips to "All 3", and the row says so', g.scopes.join() === 'All 3' && g.rows.some((r) => /span\.shot-name \(all 3\)/.test(r)), JSON.stringify(g.rows.filter((r) => /shot-name/.test(r))));
await clickAt(await S(`(root) => { const r = [...root.querySelectorAll('.copyrow')].find((x) => x.textContent.startsWith('Payslip')).querySelector('input').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }`));
g = await dlg();
check('unticking a copy takes its changes out of the count', g.title === `Push ${pc.length} changes to code` && (await pill())?.n === String(pc.length), `${g.title} / ${JSON.stringify(await pill())}`);
await p.keyboard.press('Escape'); await wait();

// ---------- With a change on the page too, only that one is sent (for now) ----------
await R(() => window.__editMode.changes.set(document.querySelector('#root .hero-title'), 'one', 'color', 'rgb(200, 0, 100)')); await settle();
await p.keyboard.press('Meta+Enter'); await wait(200);
g = await dlg();
check('"On the page" and "From the canvas", and Proceed is on', g.secs.join('|') === 'On the page|From the canvasNot sent yet' && g.proceed === false, JSON.stringify(g.secs));
await p.keyboard.press('Meta+Enter'); await wait(400);
check('Push sends the page change only', pushed.length === 1 && pushed[0].changes.length === 1 && pushed[0].changes[0].element === 'h1.hero-title', JSON.stringify(pushed.map((x) => x.changes.map((c) => c.element))));
await wait(300);
await S(`(root) => root.querySelectorAll('.toast').forEach((t) => t.remove())`);

// ---------- Undo it all: nothing left to push ----------
for (let i = 0; i < 60 && (await R(() => window.__editMode.changes.undo())); i++) await wait(20);
await settle();
d = await diff();
check('after undoing everything, the copies list nothing again', d.every((r) => r.changes.length === 0), JSON.stringify(d.map((r) => [r.name, r.changes.map((c) => `${c.kind} ${c.element} ${c.property ?? ''}`)])));
check('no page errors', errors.length === 0, errors.join(' | '));

await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await wait(600);
await b.close();
writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
