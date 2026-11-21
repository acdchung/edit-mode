// B3d: new designs made from scratch on the canvas. Every top-level canvas
// item that isn't a copy of the page is a new design (an auto-layout frame,
// a lone text…), even when it holds a piece pasted from the page (reused,
// not compared). The Push dialog lists them (Skip by default; Place on the
// page at a spot picked on the live page; or Component), the choice is saved
// with the canvas, and Push sends a `build` with clean markup, the reused
// pieces and the spot. Push is intercepted: Claude never runs. Runs on the
// demo copy (5391). COPY=<demo copy dir>; leaves its canvas empty.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
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
const S = (fn) => R(([src]) => new Function('root', `return (${src})(root)`)(document.querySelector('edit-mode-root').shadowRoot), [fn.toString()]);
const clickIn = async (fn) => { const r = await S(`(root) => { const el = (${fn})(root); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`); if (!r) throw new Error('not found: ' + fn); await p.mouse.click(...r); await wait(150); };
const dlg = () => S(`(root) => { const d = root.querySelector('.dialog'); if (!d) return null; return {
  title: d.querySelector('h3').textContent, secs: [...d.querySelectorAll('h4.sec')].map((h) => h.textContent),
  designs: [...d.querySelectorAll('li.design')].map((l) => ({ name: l.querySelector('.text').textContent, on: l.querySelector('.seg .on')?.textContent, spot: l.querySelector('.spot').hidden ? '' : l.querySelector('.spot').textContent })),
  proceed: d.querySelector('.pbtn.primary').disabled }; }`);
// Pan (at 100%) until the element's top-left is at screen (x, y).
const bringTo = async (sel, x, y) => {
  await p.mouse.move(720, 450);
  for (let i = 0; i < 12; i++) {
    const r = await R((s) => { const n = document.querySelector(s).getBoundingClientRect(); return { x: n.x, y: n.y }; }, sel);
    if (Math.abs(r.x - x) < 1 && Math.abs(r.y - y) < 1) return;
    await p.mouse.wheel(r.x - x, r.y - y); await wait(60);
  }
};
const row = (name) => `[...root.querySelectorAll('li.design')].find((l) => l.querySelector('.text').textContent === '${name}')`;

// A page copy (not a design), a "Pricing card" in auto layout with your real
// button pasted in, and a lone text on the canvas.
const dup = await S(`(root) => { const r = root.querySelector('.lbtn.dup').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }`);
await p.mouse.move(...dup); await wait(100); await p.mouse.click(...dup); await wait(600); await p.keyboard.press('Escape');
await R(() => {
  const area = document.querySelector('[data-em-canvas]');
  const right = Math.max(...[...area.children].map((k) => k.offsetLeft + k.offsetWidth)) + 160;
  const mk = (kind, name, css, text) => { const d = document.createElement('div'); d.dataset.emKind = kind; if (name) d.dataset.emName = name; d.style.cssText = css; if (text) d.textContent = text; return d; };
  const card = mk('frame', 'Pricing card', `position: absolute; left: ${right}px; top: 0px; width: 320px; display: flex; flex-direction: column; gap: 12px; padding: 24px; background-color: #FFFFFF; border-radius: 16px;`);
  card.append(mk('text', 'Plan', 'font-size: 14px; color: rgb(100, 100, 120);', 'Team'), mk('text', 'Price', 'font-size: 32px; font-weight: 700;', '$12 / person'));
  const note = mk('text', null, `position: absolute; left: ${right}px; top: 400px; font-size: 18px;`, 'Trusted by 4,000 teams');
  area.append(card, note);
});
await R(() => window.__editMode.select(document.querySelector('#root .hero-actions a, #root .hero-actions button'))); await wait();
await p.keyboard.press('Meta+c'); await wait();
await R(() => window.__editMode.select(document.querySelector('[data-em-canvas] [data-em-name="Pricing card"]'))); await wait();
await p.keyboard.press('Meta+v'); await wait(300); await p.keyboard.press('Escape'); await wait(500);
const pasted = await R(() => !!document.querySelector('[data-em-canvas] [data-em-name="Pricing card"] [data-em-from]'));
check('your real button is pasted into the card', pasted);

let d = await R(() => ({ copies: window.__editMode.compareCanvas().map((r) => r.copy.name) }));
check('the card isn’t treated as a copy (its pasted button is reused, not compared)', JSON.stringify(d.copies) === '[]' || d.copies.every((n) => n === 'Page copy'), JSON.stringify(d.copies));

// ---------- The dialog ----------
await p.keyboard.press('Meta+Enter'); await wait(250);
let g = await dlg();
check('Push opens with a "New designs" section', g && g.secs.includes('New designs'), JSON.stringify(g?.secs));
check('…the card and the lone text, not the page copy', g && g.designs.map((x) => x.name).sort().join() === ['Pricing card', 'Trusted by 4,000 teams'].sort().join(), JSON.stringify(g?.designs));
check('…both on Skip, and Proceed is off (nothing to send)', g && g.designs.every((x) => x.on === 'Skip') && g.proceed === true, JSON.stringify(g));
await clickIn(`(root) => ${row('Trusted by 4,000 teams')}.querySelector('.seg button[data-mode="component"]')`);
g = await dlg();
check('Component: the count includes it and Proceed is on', g.title === 'Push 1 change to code' && g.proceed === false && g.designs.find((x) => x.name === 'Trusted by 4,000 teams').on === 'Component', JSON.stringify(g));

// ---------- Place: pick a spot on the live page ----------
await clickIn(`(root) => ${row('Pricing card')}.querySelector('.seg button[data-mode="place"]')`);
check('Place hides the dialog and says what to do', (await S(`(root) => !root.querySelector('.dialog') && /Click where “Pricing card” goes/.test(root.querySelector('.toast')?.textContent || '')`)));
await p.keyboard.press('Shift+Digit0'); await wait(200);
await bringTo('#root .logos', 300, 500);
const logos = await R(() => { const r = document.querySelector('#root .logos').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const at = [700, logos.y + 6];
await p.mouse.move(at[0] - 20, at[1] + 2); await wait(50);
await p.mouse.move(...at); await wait(120);
await p.screenshot({ path: new URL('./b3d-pick.png', import.meta.url).pathname, clip: { x: 200, y: 0, width: 1000, height: 700 } });
const line = await S(`(root) => { const l = root.querySelector('.insert'); if (l.hidden) return null; const r = l.getBoundingClientRect(); return { y: r.y, w: r.width }; }`);
check('hovering the top of the logo strip shows the line above it', line && Math.abs(line.y - logos.y) < 3 && line.w > 200, JSON.stringify([line, logos.y]));
await p.mouse.click(...at); await wait(300);
g = await dlg();
const card = g?.designs.find((x) => x.name === 'Pricing card');
check('a click sets the spot and the dialog comes back: “After Hero”', card?.on === 'Place' && /^After “Hero”$/.test(card.spot) && g.title === 'Push 2 changes to code', JSON.stringify(card));

await p.screenshot({ path: new URL('./b3d.png', import.meta.url).pathname, clip: await S(`(root) => { const r = root.querySelector('.dialog').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; }`) });
// Change → Esc keeps the spot.
await clickIn(`(root) => ${row('Pricing card')}.querySelector('.spot')`);
await p.keyboard.press('Escape'); await wait(300);
g = await dlg();
check('Change, then Esc: the spot stays as it was', g?.designs.find((x) => x.name === 'Pricing card')?.spot === 'After “Hero”', JSON.stringify(g?.designs));

// ⌘ goes inside a section: between its pieces.
await clickIn(`(root) => ${row('Pricing card')}.querySelector('.spot')`);
await bringTo('#root .hero-lede', 400, 400);
const lede = await R(() => { const r = document.querySelector('#root .hero-lede').getBoundingClientRect(); return [r.x + 40, r.y + r.height - 4]; });
await p.keyboard.down('Meta'); await p.mouse.move(lede[0] - 5, lede[1]); await p.mouse.move(...lede); await wait(80); await p.mouse.click(...lede); await p.keyboard.up('Meta'); await wait(300);
g = await dlg();
const inner = g?.designs.find((x) => x.name === 'Pricing card')?.spot;
check('with ⌘, a spot inside the hero: after its intro text', /^After “Hero lede” in “Hero copy”$/.test(inner || ''), inner);
// Back to between sections for the push.
await clickIn(`(root) => ${row('Pricing card')}.querySelector('.spot')`);
await bringTo('#root .logos', 300, 500);
await p.mouse.move(at[0] - 20, at[1] + 2); await p.mouse.move(...at); await wait(80); await p.mouse.click(...at); await wait(300);

// ---------- What Push sends ----------
await p.keyboard.press('Meta+Enter'); await wait(500);
const sent = pushed[0]?.changes ?? [];
const place = sent.find((c) => c.kind === 'build' && c.mode === 'place');
const comp = sent.find((c) => c.kind === 'build' && c.mode === 'component');
check('Push sends two builds', sent.length === 2 && place && comp, JSON.stringify(sent.map((c) => `${c.kind} ${c.mode} ${c.name}`)));
check('…the card: named PricingCard, placed after the hero, before the logos', place?.component === 'PricingCard' && place.placement.after.name === 'Hero' && place.placement.before.name === 'Logos' && /Hero\.jsx/.test(place.placement.after.source), JSON.stringify(place?.placement));
check('…its markup: layer names and kinds, auto layout inline, no Edit Mode markers, no canvas position', place && /data-name="Plan"/.test(place.html) && /data-kind="text"/.test(place.html) && /display: flex/.test(place.html) && !/data-em-/.test(place.html) && !/left: \d/.test(place.html.slice(0, 300)), place?.html.slice(0, 300));
check('…the pasted button is marked to reuse the real Button', place && /data-reuse="src\/components\/Button\.jsx:\d+:\d+#\d+"/.test(place.html) && place.reuse.length === 1 && /Button\.jsx/.test(place.reuse[0].source), JSON.stringify(place?.reuse));
check('…the lone text: a component named after its text, not placed', comp?.component === 'TrustedBy4000Teams' && comp.placement === null, comp?.component);
check('…and the context shows Claude the spot’s neighbours', pushed[0].context.some((x) => /Hero\.jsx/.test(x.source)) && pushed[0].context.some((x) => /LogoStrip\.jsx/.test(x.source)), JSON.stringify(pushed[0].context.map((x) => x.element)));
await wait(300);
await S(`(root) => root.querySelectorAll('.toast').forEach((t) => t.remove())`);

// ---------- After the push: "Claude" built the card; it's linked to its code ----------
const APP = `${COPY}/src/App.jsx`, BASE = `${COPY}/src/styles/base.css`;
const app0 = readFileSync(APP, 'utf8'), base0 = readFileSync(BASE, 'utf8');
try {
  writeFileSync(APP, app0.replace("import LogoStrip from './components/LogoStrip.jsx';", "import LogoStrip from './components/LogoStrip.jsx';\nimport Button from './components/Button.jsx';")
    .replace('        <Hero />\n', '        <Hero />\n        <div className="pricing-card">\n          <div className="pricing-card-plan">Team</div>\n          <div className="pricing-card-price">$12 / person</div>\n          <Button>Start now</Button>\n        </div>\n'));
  writeFileSync(BASE, base0 + '\n.pricing-card { width: 320px; display: flex; flex-direction: column; gap: 12px; padding: 24px; background-color: #fff; border-radius: 16px; }\n.pricing-card-plan { font-size: 14px; color: rgb(100, 100, 120); }\n.pricing-card-price { font-size: 32px; font-weight: 700; }\n.pricing-card .button { width: fit-content; flex-shrink: 0; }\n');
  const id = await R(() => document.querySelector('[data-em-canvas] [data-em-name="Pricing card"]').dataset.emDesign);
  const lone = await R(() => [...document.querySelectorAll('[data-em-canvas] > [data-em-kind="text"]')].find((n) => /Trusted/.test(n.textContent)).dataset.emDesign);
  await R(([built]) => { sessionStorage.setItem('edit-mode:built', built); sessionStorage.setItem('edit-mode:relink', '1'); },
    [JSON.stringify([{ id, mode: 'place', placement: place.placement, component: 'PricingCard' }, { id: lone, mode: 'component', placement: null, component: 'TrustedBy4000Teams' }])]);
  await wait(1200); await p.reload(); await p.waitForSelector('.pricing-card'); await wait(1500);
  const linked = await R(() => { const n = document.querySelector('[data-em-canvas] [data-em-name="Pricing card"]'); const [src, i] = (n.dataset.emFrom || '#').split('#'); return { from: n.dataset.emFrom, cls: document.querySelectorAll(`[data-src="${CSS.escape(src)}"]`)[+i]?.className, built: n.dataset.emBuilt }; });
  check('after the push, the card on the canvas is linked to the new pricing-card in the code', linked.cls === 'pricing-card' && linked.built === 'PricingCard', JSON.stringify(linked));
  const left = await R(() => window.__editMode.compareCanvas().flatMap((r) => r.changes.map((c) => `${r.copy.name}: ${c.kind} ${c.element} ${c.property ?? ''}${c.from ? ` ${c.from} → ${c.to} (${c.value})` : ''}`)));
  check('…and compared like a copy: built as designed, nothing left to push', left.length === 0, JSON.stringify(left));
  await p.keyboard.press('Meta+Enter'); await wait(250);
  g = await dlg();
  check('…it’s no longer a new design; the component one is back on Skip', g && !g.designs.some((x) => x.name === 'Pricing card') && g.designs.find((x) => x.name === 'Trusted by 4,000 teams')?.on === 'Skip', JSON.stringify(g?.designs));
  await p.keyboard.press('Escape'); await wait();
  // A tweak on the built card now pushes as an exact edit.
  await R(() => window.__editMode.changes.set(document.querySelector('[data-em-canvas] [data-em-name="Price"]'), 'one', 'color', 'rgb(200, 0, 0)')); await wait(500);
  const tweak = await R(() => window.__editMode.compareCanvas().flatMap((r) => r.changes.map((c) => `${c.kind} ${c.element} ${c.property ?? ''}`)));
  check('a tweak on it afterwards is an exact edit to the new code', JSON.stringify(tweak) === JSON.stringify(['style div.pricing-card-price color']), JSON.stringify(tweak));
  await R(() => window.__editMode.changes.undo()); await wait(200);
} finally {
  writeFileSync(APP, app0); writeFileSync(BASE, base0);
}
// Undo: the code goes back; the card is a new design again, still placed after the hero.
await R(() => sessionStorage.setItem('edit-mode:relink', '1'));
await wait(1200); await p.reload(); await p.waitForSelector('.hero'); await wait(1500);
await p.keyboard.press('Meta+Enter'); await wait(250);
g = await dlg();
check('after Undo, the card is a new design again, still set to go after the hero', g?.designs.find((x) => x.name === 'Pricing card')?.spot === 'After “Hero”', JSON.stringify(g?.designs));
await p.keyboard.press('Escape'); await wait();

// ---------- Saved with the canvas ----------
await wait(700); await p.reload(); await p.waitForSelector('.hero'); await wait(900);
await p.keyboard.press('Meta+Enter'); await wait(250);
g = await dlg();
check('after a reload, the choices and the spot are still there', g && g.designs.find((x) => x.name === 'Pricing card')?.spot === 'After “Hero”' && g.designs.find((x) => x.name === 'Trusted by 4,000 teams')?.on === 'Skip', JSON.stringify(g?.designs));
await p.keyboard.press('Escape');
check('no page errors', errors.length === 0, errors.join(' | '));

await R(() => fetch('/@edit-mode/canvas', { method: 'PUT', body: JSON.stringify({ html: '' }) }));
await p.keyboard.press('Alt+KeyE'); await wait(600);
await b.close();
writeFileSync(`${COPY}/.editmode/canvas.json`, '{"html":""}');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
