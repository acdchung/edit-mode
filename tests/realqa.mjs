// Real pushes that stack edge cases into one batch (2026-11-25 QA). A REAL Claude run
// per scenario: ask the user first. Runs on the sample-app copy on port 5390:
//   COPY=<sample copy dir> SCENARIO=1|2 OUT=<folder for the diff> node realqa.mjs
//   COPY=<console copy dir> SCENARIO=3 …
//   SCENARIO=4: on the sample copy, edits made on a Duplicate page copy (the canvas); leaves the canvas empty (the Payloom Console copy on port 5393)
// Each scenario: make the edits (UI where it's reliable), Push for real, wait for Claude,
// check the page with Edit Mode off, save the source diff, then Undo and check the
// files are back exactly. The copy must start in sync with sample-app/src.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
const COPY = process.env.COPY;
const SC = process.env.SCENARIO || '1';
const OUT = process.env.OUT || '.';
const APPNAME = SC === '3' ? 'console-app' : 'sample-app';
const PORT = SC === '3' ? 5393 : 5390;
const APP = new URL(`../${APPNAME}/src`, import.meta.url).pathname;
if (!COPY) throw new Error('COPY=<sample copy dir> is required');
const HTML = new URL(`../${APPNAME}/index.html`, import.meta.url).pathname;
const inSync = () => { try { execSync(`diff -r "${APP}" "${COPY}/src" && diff "${HTML}" "${COPY}/index.html"`); return true; } catch { return false; } };
if (!inSync()) throw new Error('The copy is not in sync with sample-app/src');
rmSync(COPY + '/.editmode/variables.json', { force: true });

const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const check = (n, ok, d = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
const R = (f, a) => p.evaluate(f, a);
const root = 'document.querySelector("edit-mode-root").shadowRoot';
const wait = (ms) => p.waitForTimeout(ms);
const clickAt = async (loc) => { const bb = await loc.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await wait(200); };
const pick = (q, i = 0) => R(([q, i]) => window.__editMode.select(document.querySelectorAll(q)[i]), [q, i]);
const set = (q, i, scope, prop, value) => R(([q, i, scope, prop, value]) => { const el = document.querySelectorAll(q)[i]; window.__editMode.changes.batch(null, () => window.__editMode.changes.set(el, scope, prop, value)); }, [q, i, scope, prop, value]);
// Selection colors: type a hex into the row whose swatch shows `rgb`
async function scEdit(rgb, hex) {
  const i = await R(`[...${root}.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === 'Selection colors')?.querySelectorAll('.crow') ? [...[...${root}.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === 'Selection colors').querySelectorAll('.crow')].findIndex((r) => getComputedStyle(r.querySelector('.swatch i')).backgroundColor === ${JSON.stringify(rgb)}) : -1`);
  if (i < 0) return false;
  const f = p.locator('edit-mode-root section:has(h4:text-is("Selection colors")) .crow').nth(i).locator('.hex');
  await clickAt(f); await p.keyboard.press('Meta+a'); await p.keyboard.type(hex); await p.keyboard.press('Enter'); await wait(300);
  return true;
}
async function typeText(q, i, text) {
  await pick(q, i); await wait(100);
  await p.keyboard.press('Enter'); await wait(100);
  await p.keyboard.press('Meta+a');
  const lines = text.split('\n');
  for (const [k, line] of lines.entries()) { if (k) await p.keyboard.press('Enter'); await p.keyboard.insertText(line); }
  await p.keyboard.press('Escape'); await wait(200);
}

await p.goto(`http://localhost:${PORT}`); await p.waitForSelector('.card');
await p.keyboard.press('Alt+KeyE'); await wait(600);

const expect = []; // [name, fn in the page (Edit Mode off), detail fn]
if (SC === '1') {
  // Variables: a new one, and one of the app's changed (UI)
  await R(() => window.__editMode.select(null)); await wait(300);
  await clickAt(p.locator('edit-mode-root section.vars .sh .add'));
  await p.keyboard.type('Brand Primary'); await p.keyboard.press('Enter'); await wait(300);
  const rowOf = async (name) => p.locator('edit-mode-root section.vars .crow').nth(await R(`[...${root}.querySelectorAll('section.vars .crow')].findIndex((r) => r.querySelector('.vname').value === ${JSON.stringify(name)})`));
  await clickAt((await rowOf('brand-primary')).locator('.vhex')); await p.keyboard.press('Meta+a'); await p.keyboard.type('5b5bd6'); await p.keyboard.press('Enter'); await wait(300);
  await clickAt((await rowOf('accent')).locator('.vhex')); await p.keyboard.press('Meta+a'); await p.keyboard.type('00aa55'); await p.keyboard.press('Enter'); await wait(300);
  // The featured card only (a .map item, "This one") filled with the new variable
  await set('.card', 2, 'one', 'background-color', 'var(--brand-primary)');
  // Selection colors on card 2, This one: the muted text → purple
  await pick('.card', 1); await wait(400);
  check('edit: card 2 selection colors has the muted row', await scEdit('rgb(107, 112, 117)', '8a4fff'));
  // Selection colors on card 1 with All like this: the border color for every card
  await pick('.card', 0); await wait(300);
  await clickAt(p.locator('edit-mode-root .scope button').nth(1)); await wait(300);
  check('edit: card 1 (All like this) has the border row', await scEdit('rgb(230, 226, 218)', 'c8bfae'));
  await clickAt(p.locator('edit-mode-root .scope button').nth(0)); await wait(200);
  expect.push(
    ['new variable --brand-primary is in :root', () => getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim().toLowerCase()],
    ['--accent changed (the CTA follows)', () => getComputedStyle(document.querySelector('.cta-primary')).backgroundColor],
    ['only the featured card is filled with --brand-primary', () => [...document.querySelectorAll('.card')].map((c) => getComputedStyle(c).backgroundColor).join(' | ')],
    ['only card 2\'s meta text is purple', () => [...document.querySelectorAll('.card-meta')].map((c) => getComputedStyle(c).color).join(' | ')],
    ['every card\'s border is the new color', () => [...document.querySelectorAll('.card')].map((c) => getComputedStyle(c).borderTopColor).join(' | ')],
  );
  var want = ['#5b5bd6', 'rgb(0, 170, 85)', 'rgba(0, 0, 0, 0) | rgba(0, 0, 0, 0) | rgb(91, 91, 214)',
    'rgb(107, 112, 117) | rgb(138, 79, 255) | rgb(107, 112, 117)', 'rgb(200, 191, 174) | rgb(200, 191, 174) | rgb(200, 191, 174)'];
}
if (SC === '2') {
  await typeText('.hero-title', 0, 'Climb something new\nthis weekend');
  await typeText('.hero-body', 0, 'Routes for 5.9–5.12 climbers — <b> & "quotes" {braces}');
  await pick('.card', 1); await wait(200); await p.keyboard.press('Backspace'); await wait(300); // delete the middle card (a .map item)
  await R(() => { const btn = document.querySelector('.signup .btn'); window.__editMode.changes.batch(null, () => window.__editMode.changes.move(btn, 'one', 0)); }); // button before the input
  await set('.eyebrow', 0, 'one', 'display', 'none'); // hidden with the eye
  await set('.section-title', 0, 'one', 'font-family', '"Inter", system-ui, sans-serif'); // a Google font the code doesn't load
  await set('.card-title', 0, 'all', 'font-size', '20px'); // All like this
  await set('.hero', 0, 'one', 'padding', '64px');
  expect.push(
    ['title: two lines, one <br>', () => { const t = document.querySelector('.hero-title'); return `${t.querySelectorAll('br').length} ${t.textContent}`; }],
    ['body: special characters exactly', () => document.querySelector('.hero-body').textContent],
    ['the middle card is gone (from the data)', () => [...document.querySelectorAll('.card-title')].map((e) => e.textContent).join(' | ')],
    ['the button comes before the input', () => [...document.querySelector('.signup').children].map((e) => e.tagName).join(' ')],
    ['the eyebrow is hidden, still in the page', () => { const e = document.querySelector('.eyebrow'); return e ? getComputedStyle(e).display : 'removed'; }],
    ['the section title is in Inter', () => getComputedStyle(document.querySelector('.section-title')).fontFamily.split(',')[0].replace(/"/g, '')],
    ['every card title is 20px', () => [...document.querySelectorAll('.card-title')].map((e) => getComputedStyle(e).fontSize).join(' | ')],
    ['the hero padding is 64px', () => getComputedStyle(document.querySelector('.hero')).padding],
  );
  var want = ['1 Climb something newthis weekend', 'Routes for 5.9–5.12 climbers — <b> & "quotes" {braces}', 'Moonlight Arête | The Long Traverse',
    'BUTTON INPUT', 'none', 'Inter', '20px | 20px', '64px'];
}

if (SC === '4') {
  await R(() => window.__editMode.select(null)); await wait(300);
  await clickAt(p.locator('edit-mode-root section.vars .sh .add'));
  await p.keyboard.type('brand-primary'); await p.keyboard.press('Enter'); await wait(300);
  const vr = p.locator('edit-mode-root section.vars .crow').nth(await R(`[...${root}.querySelectorAll('section.vars .crow')].findIndex((r) => r.querySelector('.vname').value === 'brand-primary')`));
  await clickAt(vr.locator('.vhex')); await p.keyboard.press('Meta+a'); await p.keyboard.type('5b5bd6'); await p.keyboard.press('Enter'); await wait(300);
  await p.keyboard.press('Shift+Digit1'); await wait(400); // fit: the Duplicate page icon sits just right of the page's corner
  await clickAt(p.locator('edit-mode-root .dup-page')); await wait(1500); // Duplicate page onto the canvas
  check('edit: the page copy is on the canvas', await R(() => !!document.querySelector('[data-em-canvas] .cta-primary')));
  await set('[data-em-canvas] .cta-primary', 0, 'one', 'background-color', 'var(--brand-primary)');
  await pick('[data-em-canvas] .card', 0); await wait(500);
  check('edit: Selection colors on the canvas card', await scEdit('rgb(107, 112, 117)', '8a4fff'));
  await R(() => window.__editMode.select(null)); await wait(800);
  expect.push(
    ['the CTA is filled with the new variable', () => getComputedStyle(document.querySelector('.cta-primary')).backgroundColor],
    ['only card 1\'s meta text is purple', () => [...document.querySelectorAll('.card-meta')].map((c) => getComputedStyle(c).color).join(' | ')],
  );
  var want = ['rgb(91, 91, 214)', 'rgb(138, 79, 255) | rgb(107, 112, 117) | rgb(107, 112, 117)'];
}
if (SC === '3') {
  const rowOf = async (name) => p.locator('edit-mode-root section.vars .crow').nth(await R(`[...${root}.querySelectorAll('section.vars .crow')].findIndex((r) => r.querySelector('.vname').value === ${JSON.stringify(name)})`));
  await R(() => window.__editMode.select(null)); await wait(300);
  await clickAt(p.locator('edit-mode-root section.vars .sh .add')); // opens the full list
  await p.keyboard.type('color-info'); await p.keyboard.press('Enter'); await wait(300);
  await clickAt((await rowOf('color-info')).locator('.vhex')); await p.keyboard.press('Meta+a'); await p.keyboard.type('2f80ed'); await p.keyboard.press('Enter'); await wait(300);
  await clickAt((await rowOf('color-critical')).locator('.vhex')); await p.keyboard.press('Meta+a'); await p.keyboard.type('b42318'); await p.keyboard.press('Enter'); await wait(300);
  // The queue card: its warning color becomes the new variable (Selection colors → swatch → Variables tab)
  await pick('section.queue'); await wait(500);
  const wi = await R(`[...[...${root}.querySelectorAll('section')].find((s) => s.querySelector('h4')?.textContent === 'Selection colors').querySelectorAll('.crow')].findIndex((r) => getComputedStyle(r.querySelector('.swatch i')).backgroundColor === 'rgb(214, 137, 15)')`);
  check('edit: the queue lists the warning color', wi >= 0);
  const row = p.locator('edit-mode-root section:has(h4:text-is("Selection colors")) .crow').nth(wi);
  await row.scrollIntoViewIfNeeded(); await clickAt(row.locator('.swatch'));
  const vi = p.locator('edit-mode-root .pop .var-item[title="--color-info"]');
  await vi.scrollIntoViewIfNeeded(); await clickAt(vi); await wait(300); // the 23rd variable: scrolled into view first
  await p.keyboard.press('Escape');
  await typeText('.stat-label', 3, 'Blocked items'); // one item of a list defined in a constant
  await pick('.issue', 2); await wait(200); await p.keyboard.press('Backspace'); await wait(300); // delete one issue (data)
  await set('.person-name', 0, 'all', 'font-weight', '600'); // every row
  expect.push(
    ['new variable --color-info is in :root', () => getComputedStyle(document.documentElement).getPropertyValue('--color-info').trim().toLowerCase()],
    ['--color-critical changed where it\'s defined', () => getComputedStyle(document.documentElement).getPropertyValue('--color-critical').trim().toLowerCase()],
    ['the queue\'s warning icons use --color-info', () => [...document.querySelectorAll('.issue--warning .issue-icon')].map((e) => getComputedStyle(e).color).join(' | ')],
    ['…the warning color elsewhere is untouched (Run progress)', () => getComputedStyle(document.querySelector('.check-warn')).color],
    ['only the 4th stat label changed', () => [...document.querySelectorAll('.stat-label')].map((e) => e.textContent).join(' | ')],
    ['the third issue is gone', () => [...document.querySelectorAll('.issue-title')].map((e) => e.textContent).join(' | ')],
    ['every person name is 600', () => [...new Set([...document.querySelectorAll('.person-name')].map((e) => getComputedStyle(e).fontWeight))].join(',')],
  );
  var want = null; // filled from the page before the push (below)
}

// Before pushing: what Edit Mode shows (the target)
const preview = [];
for (const [, fn] of expect) preview.push(await R(fn));
if (SC === '3') { // the target is what Edit Mode shows, except the deleted issue (still in the page, hidden)
  want = [...preview];
  want[2] = await R(() => [...document.querySelectorAll('.issue--warning')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => getComputedStyle(e.querySelector('.issue-icon')).color).join(' | '));
  want[5] = await R(() => [...document.querySelectorAll('.issue')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.querySelector('.issue-title').textContent).join(' | '));
  console.log('target:', JSON.stringify(want));
}
const list = await R(() => window.__editMode.changes.list().map((c) => `${c.kind} ${c.property || ''} ${c.scope || ''}`));
console.log('batch:', list.length, 'edits +', SC === '1' ? '2 variables' : '0 variables');

// Push for real
const t0 = Date.now();
await clickAt(p.locator('edit-mode-root button.act', { hasText: 'Push' }));
await clickAt(p.locator('edit-mode-root .dialog button', { hasText: 'Proceed' }));
let st;
for (;;) {
  await wait(3000);
  st = await (await fetch(`http://localhost:${PORT}/@edit-mode/status`)).json();
  if (!st.running) break;
  if (Date.now() - t0 > 9 * 60_000) { console.log('FAIL  Claude took over 9 minutes'); break; }
}
check(`Claude finished (${Math.round((Date.now() - t0) / 1000)}s)`, st.last?.ok, st.last?.ok ? st.last.summary : st.last?.error);
console.log('summary:', st.last?.summary);
console.log('files:', (st.last?.files || []).join(', '));

// The page with Edit Mode off, fresh
const q = await ctx.newPage(); q.on('pageerror', (e) => errs.push(e.message));
await q.addInitScript(() => { try { sessionStorage.clear(); } catch {} });
await q.goto(`http://localhost:${PORT}`); await q.waitForSelector(SC === '3' ? '.queue' : '.page'); await q.waitForTimeout(1500);
for (const [i, [name, fn]] of expect.entries()) {
  const got = await q.evaluate(fn);
  check(name, got === want[i], `got ${got} · wanted ${want[i]} · Edit Mode showed ${preview[i]}`);
}
// The code: no preview leftovers
const diff = (() => { try { execSync(`diff -ru "${APP}" "${COPY}/src"`); return ''; } catch (e) { return e.stdout.toString(); } })();
writeFileSync(`${OUT}/realqa-${SC}.diff`, diff);
const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
check('no !important in the code', !added.includes('!important'));
check('no inline style={{…}} added', !/style=\{\{/.test(added));
check('no Edit Mode markers in the code', !/data-em-|data-src|@edit-mode/.test(added));
if (SC === '4') {
  check('the code uses var(--brand-primary), not a hex', /var\(--brand-primary\)/.test(added) && /--brand-primary:\s*#5b5bd6/i.test(added), added.split('\n').filter((l) => /brand|8a4fff/i.test(l)).join(' / '));
}
if (SC === '2') {
  const html = readFileSync(`${COPY}/index.html`, 'utf8');
  const sent = JSON.parse(readFileSync(`${COPY}/.editmode/${st.last.id}/changes.json`, 'utf8')).find((c) => c.property === 'font-family');
  check('Push told Claude Inter is on Google Fonts', sent?.fontSource === 'google', sent?.fontSource);
  check('Claude loads Inter for everyone (a Google Fonts link)', /fonts\.googleapis\.com[^"]*Inter/.test(html) || /fonts\.googleapis\.com[^"']*Inter/.test(diff), html.match(/<link[^>]*googleapis[^>]*>/)?.[0] || 'no link in index.html');
}
if (SC !== '2') check('the variables are no longer pending', JSON.stringify(await (await fetch(`http://localhost:${PORT}/@edit-mode/variables`)).json()) === '{"set":{},"added":[]}');

// Undo
const u = await (await fetch(`http://localhost:${PORT}/@edit-mode/undo`, { method: 'POST' })).json();
check('Undo restores the files exactly', inSync() && !u.skipped?.length, `restored ${u.restored?.length}, skipped ${u.skipped?.join(', ') || 'none'}`);
if (SC !== '2') {
  const v = await (await fetch(`http://localhost:${PORT}/@edit-mode/variables`)).json();
  check('Undo makes the variables pending again', (SC === '1' ? v.set['--brand-primary'] === '#5b5bd6' && v.set['--accent'] === '#00aa55' : SC === '4' ? v.set['--brand-primary'] === '#5b5bd6' : v.set['--color-info'] === '#2f80ed' && v.set['--color-critical'] === '#b42318'), JSON.stringify(v));
  rmSync(COPY + '/.editmode/variables.json', { force: true });
}
if (SC === '4') writeFileSync(COPY + '/.editmode/canvas.json', '{"html":""}'); // the sample suites expect an empty canvas
check('no page errors', !errs.length, errs[0]);
await b.close();
