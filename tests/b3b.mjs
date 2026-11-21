// B3b–c: after the code changes, canvas copies are matched to the page again
// (compare.js relinkCanvas), so the comparison stays right:
//   - lines shift (a comment added at the top of the file): the same changes are listed;
//   - "Claude applied" part of a push (we edit the files the way Claude would):
//     only what wasn't applied is still listed, and the copy's new group is
//     linked to the wrapper that now exists in the code;
//   - Undo (the files go back): everything is listed again.
// Proceed marks the copies for re-linking on the next load. Push is
// intercepted: Claude never runs. Runs on the demo copy (5391).
// COPY=<demo copy dir>; restores the copy's files and leaves its canvas empty.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
if (!process.env.COPY) throw new Error('Set COPY to the demo copy folder');
const COPY = process.env.COPY;
const JSX = `${COPY}/src/components/HeroShot.jsx`, CSS = `${COPY}/src/components/HeroShot.css`;
const jsx0 = readFileSync(JSX, 'utf8'), css0 = readFileSync(CSS, 'utf8');
const restore = () => { writeFileSync(JSX, jsx0); writeFileSync(CSS, css0); };
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
const b = await chromium.launch({ channel: 'chrome' });
try {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '1'); } catch {} });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  // Push "starts" (the run then never shows up, so the overlay reports it couldn't finish): Claude never runs.
  await p.route('**/@edit-mode/push', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"test-not-a-run"}' }));
  const R = (f, a) => p.evaluate(f, a);
  const wait = (ms = 80) => p.waitForTimeout(ms);
  await p.goto('http://localhost:5391'); await p.waitForSelector('.hero');
  await p.keyboard.press('Alt+KeyE'); await wait(600);
  const S = (fn) => R(([src]) => new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot), [fn.toString()]);
  const pick = async (...sels) => { await R((ss) => { const els = ss.map((s) => document.querySelector(s)); window.__editMode.select(els[0]); if (els.length > 1) window.__editMode.state.multi = els; }, sels); await wait(); };
  const PC = '[data-em-canvas] > [data-em-name="Page copy"]';
  const P = `${PC} .payslip`;
  const rows = () => R(() => window.__editMode.compareCanvas().flatMap((r) => r.changes.map((c) => `${c.kind} ${c.element}${c.property ? ' ' + c.property : ''}`)).sort());
  const reloadAfterEdit = async () => { await wait(1200); await p.reload(); await p.waitForSelector('.hero'); await wait(1200); };

  // A page copy, and five changes on its payslip.
  const dup = await S(`(root) => { const r = root.querySelector('.lbtn.dup').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
  await p.mouse.move(...dup); await wait(100); await p.mouse.click(...dup); await wait(600); await p.keyboard.press('Escape');
  await R((s) => {
    const { changes } = window.__editMode;
    const name = document.querySelector(`${s} .payslip-name`);
    changes.beginText(name); name.firstChild.nodeValue = 'Lucía F.'; changes.endText();
    changes.set(document.querySelector(`${s} .payslip-kicker`), 'one', 'color', 'rgb(220, 0, 0)');
    changes.remove(document.querySelector(`${s} .payslip-place`), 'one');
  }, P);
  await pick(`${P} > .payslip-kicker`, `${P} > .payslip-who`); await p.keyboard.press('Meta+KeyG'); await wait(150);
  await pick(`${P} > .payslip-net`); await p.keyboard.press('Alt+Meta+BracketLeft'); await wait(150);
  // And more, so re-linking has every kind of change to cope with at once.
  await R((s) => { const ls = [...document.querySelectorAll(`${s} > .payslip-line`)]; window.__editMode.select(ls[0]); window.__editMode.state.multi = ls; }, P); await wait();
  await p.keyboard.press('Shift+KeyA'); await wait(200);
  await R((s) => {
    const { changes } = window.__editMode;
    changes.move(document.querySelector(`${s} .payslip-avatar`), 'one', 0, document.querySelector(`${s} .payslip-net`));
    const t = document.createElement('div'); t.dataset.emKind = 'text'; t.textContent = 'Paid on the 28th';
    changes.insert(t, document.querySelector(s), document.querySelector(s).children.length, { what: 'text', styles: {}, text: 'Paid on the 28th' });
  }, P);
  await pick(`${P} .payslip-net-value`);
  await R(() => document.querySelector('edit-mode-root').shadowRoot.querySelector('button[title^="Ignore auto layout"]').click()); await wait(150);
  await p.keyboard.press('Escape'); await wait(700);
  const more = ['group frame', 'insert new text', 'move span.shot-avatar.shot-avatar--coral.payslip-avatar', 'place span.payslip-net-value'];
  const five = ['delete div.payslip-place', 'group group', 'move div.payslip-net', 'style div.payslip-kicker color', 'text div.payslip-name', ...more].sort();
  let r = await rows();
  check('nine changes on the copy are listed', JSON.stringify(r) === JSON.stringify(five), JSON.stringify(r));

  // ---------- Lines shift ----------
  writeFileSync(JSX, '// a note\n// another note\n// and one more\n' + jsx0);
  await reloadAfterEdit();
  const broken = await R(() => [...document.querySelectorAll('[data-em-canvas] .payslip [data-em-from]')].some((n) => { const [src, i] = n.dataset.emFrom.split('#'); const o = document.querySelectorAll(`[data-src="${CSS.escape(src)}"]`)[+i]; return !o || o.tagName !== n.tagName; }));
  r = await rows();
  check('after the file’s lines shift, the same nine changes are listed (the copy is linked again)', JSON.stringify(r) === JSON.stringify(five), JSON.stringify(r));
  const now = await R((s) => document.querySelector(`${s} .payslip-net`).dataset.emFrom, P);
  check('…its links point at the new lines', /HeroShot\.jsx:8[7-9]:\d+#0$/.test(now) && !(await R(() => [...document.querySelectorAll('[data-em-canvas] .payslip [data-em-from]')].some((n) => { const [src, i] = n.dataset.emFrom.split('#'); const o = document.querySelectorAll(`[data-src="${CSS.escape(src)}"]`)[+i]; return !o || o.tagName !== n.tagName; }))), `${now} (broken before the re-link: ${broken})`);

  // ---------- Push marks the copies to be linked again ----------
  await p.keyboard.press('Meta+Enter'); await wait(200);
  await p.keyboard.press('Meta+Enter'); await wait(500);
  check('Proceed marks the copies to be linked again on the next load', (await R(() => sessionStorage.getItem('edit-mode:relink'))) === '1');
  await S(`(root) => root.querySelectorAll('.toast').forEach((t) => t.remove())`);

  // ---------- "Claude" applies four of the five ----------
  writeFileSync(JSX, jsx0.replace(
`      <div className="payslip">
        <div className="payslip-kicker">Payslip · November</div>
        <div className="payslip-who">
          <span className="shot-avatar shot-avatar--coral payslip-avatar">LF</span>
          <div>
            <div className="payslip-name">Lucía Ferreira</div>
            <div className="payslip-place">Lisbon, Portugal</div>
          </div>
        </div>`,
`      <div className="payslip">
        <div className="payslip-net">
          <span>Net pay</span>
          <span className="payslip-net-value">€4,812.50</span>
        </div>
        <div className="payslip-head">
          <div className="payslip-kicker">Payslip · November</div>
          <div className="payslip-who">
            <span className="shot-avatar shot-avatar--coral payslip-avatar">LF</span>
            <div>
              <div className="payslip-name">Lucía F.</div>
            </div>
          </div>
        </div>`).replace(
`        <div className="payslip-net">
          <span>Net pay</span>
          <span className="payslip-net-value">€4,812.50</span>
        </div>
      </div>`, `      </div>`));
  await reloadAfterEdit();
  r = await rows();
  check('after a push that applied four of them, only the other five are still listed', JSON.stringify(r) === JSON.stringify(['style div.payslip-kicker color', ...more].sort()), JSON.stringify(r));
  check('…the copy’s group is now linked to the wrapper in the code', /HeroShot\.jsx:\d+:\d+#0$/.test(await R((s) => document.querySelector(`${s} [data-em-kind="group"]`)?.dataset.emFrom ?? '', P)) &&
    (await R((s) => { const [src, i] = document.querySelector(`${s} [data-em-kind="group"]`).dataset.emFrom.split('#'); return document.querySelectorAll(`[data-src="${CSS.escape(src)}"]`)[+i]?.className; }, P)) === 'payslip-head');
  check('…and the relink mark is cleared', (await R(() => sessionStorage.getItem('edit-mode:relink'))) === null);

  // ---------- Undo: the files go back ----------
  restore();
  await R(() => sessionStorage.setItem('edit-mode:relink', '1'));
  await reloadAfterEdit();
  r = await rows();
  check('after Undo puts the code back, all nine are listed again', JSON.stringify(r) === JSON.stringify(five), JSON.stringify(r));

  // ---------- Nothing changed in the code: a forced re-link changes nothing ----------
  const before = await R(() => document.querySelector('[data-em-canvas]').innerHTML);
  await R(() => window.__editMode.relinkCanvas({ force: true }));
  check('re-linking when nothing changed leaves every link as it was', (await R(() => document.querySelector('[data-em-canvas]').innerHTML)) === before);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
  await p.keyboard.press('Alt+KeyE'); await wait(600);
} finally {
  restore();
  await b.close();
  writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
