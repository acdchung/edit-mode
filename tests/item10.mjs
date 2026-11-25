// Item 10: mixed-style text. Needs COPY=<sample copy dir> (port 5390): it puts mixed text
// into the copy's Hero.jsx for the run and restores it.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const file = `${process.env.COPY}/src/components/Hero.jsx`;
const orig = fs.readFileSync(file, 'utf8');
const b = await chromium.launch({ channel: 'chrome' });
try {
  fs.writeFileSync(file, orig
    .replace('Hand-picked multi-pitch routes with local guides.</p>', 'Hand-picked <strong className="em-bold">multi-pitch</strong> routes with <a href="#guides">local guides</a>.</p>\n      <p className="hero-note">Plain words to format</p>')
    .replace(/Get started\s*<\/button>/, 'Get started <svg className="cta-icon" width="12" height="12" viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" strokeWidth="3" /></svg></button>'));
  await new Promise((r) => setTimeout(r, 700));
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
  await p.goto('http://localhost:5390'); await p.waitForSelector('.hero-body strong', { state: 'attached' });
  const html = () => p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''));
  const start = await html();
  await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150);
  const pick = async (q) => { await p.evaluate((q) => window.__editMode.select(document.querySelector(q)), q); await p.waitForTimeout(60); };
  const key = async (k) => { await p.keyboard.press(k); await p.waitForTimeout(60); };
  const editing = () => p.evaluate(() => !!window.__editMode.state.editing);
  const shown = (q) => p.$eval(q, e => e.innerText);
  const texts = () => p.evaluate(() => window.__editMode.changes.list().filter(c => c.kind === 'text'));
  // React's own nodes in the body: still attached, and visible?
  await p.evaluate(() => { const b = document.querySelector('.hero-body'); window.__own = [...b.childNodes]; window.__strong = b.querySelector('strong'); });
  const own = () => p.evaluate(() => ({ attached: window.__own.every(n => n.parentNode === document.querySelector('.hero-body')), strongShown: window.__strong.isConnected && getComputedStyle(window.__strong).display !== 'none' }));

  await pick('.hero-body');
  check('mixed text reads as a text layer (the panel shows Text)', await p.evaluate(() => !document.querySelector('edit-mode-root').shadowRoot.querySelector('section:has(h4)') || [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('section h4')].some(h => h.textContent === 'Text' && !h.closest('section').hidden)));
  await key('Enter');
  check('Enter starts editing it', await editing() && (await p.$eval('.hero-body', e => e.contentEditable)) === 'true');
  await key('Meta+ArrowDown'); await key('End'); await p.keyboard.type(' today'); await key('Escape');
  check('typing keeps the bold word and the link', (await shown('.hero-body')) === 'Hand-picked multi-pitch routes with local guides. today' && await p.$eval('.hero-body strong', e => e.textContent) === 'multi-pitch' && await p.$eval('.hero-body a', e => e.textContent) === 'local guides', await shown('.hero-body'));
  let o = await own();
  check("only words changed: they go back into the app's own nodes", o.attached && o.strongShown && await p.evaluate(() => !document.querySelector('.hero-body [data-em-gone]')), JSON.stringify(o));
  let t = await texts();
  check('Push gets the markup, before and after', t.length === 1 && t[0].rich && /<strong class="em-bold">multi-pitch<\/strong>/.test(t[0].to) && /<a href="#guides">local guides<\/a>\. today$/.test(t[0].to) && !/today/.test(t[0].from), JSON.stringify(t[0]?.to));
  await key('Meta+z');
  check('one ⌘Z restores the page exactly', (await html()) === start);
  // Structure changes (the bold word typed over): the copy stays on top, the app's nodes hidden in place.
  await pick('.hero-body'); await key('Enter');
  await p.keyboard.type('Plain words'); await key('Escape');
  o = await own();
  check('typing over everything: shows the new words', (await shown('.hero-body')) === 'Plain words', await shown('.hero-body'));
  check("…the app's own nodes stay attached (hidden), so React can still update them", o.attached && !o.strongShown);
  t = await texts();
  check('…Push: to = "Plain words"', t[0]?.to === 'Plain words', t[0]?.to);
  await key('Meta+z');
  check('…⌘Z restores the page exactly', (await html()) === start);
  // Undo and redo across the structure change.
  await key('Meta+Shift+z');
  check('⌘⇧Z brings it back', (await shown('.hero-body')) === 'Plain words');
  await key('Meta+z');
  // Paste: words only.
  await pick('.hero-body'); await key('Enter'); await key('Meta+ArrowDown'); await key('End');
  await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', ' pasted'); dt.setData('text/html', '<b style="color:red">pasted</b>'); document.querySelector('.hero-body').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  await key('Escape');
  t = await texts();
  check('pasting adds words only (no outside markup)', /guides<\/a>\. pasted$/.test(t[0]?.to || '') && !/<b|red/.test(t[0]?.to || ''), t[0]?.to);
  await key('Meta+z');
  // An icon inside: the words around it edit, the icon stays.
  await pick('.cta-primary');
  check('a button with an icon is a text layer too', await p.evaluate(() => { const r = document.querySelector('edit-mode-root').shadowRoot; return [...r.querySelectorAll('section h4')].some(h => h.textContent === 'Text' && !h.closest('section').hidden); }));
  await key('Enter');
  check('…editing it', await editing());
  await p.keyboard.type('Go'); await key('Escape');
  const btn = await p.$eval('.cta-primary', e => ({ text: e.innerText.trim(), icons: [...e.querySelectorAll('svg')].filter(s => getComputedStyle(s).display !== 'none').length }));
  check('typing over all of it keeps the icon', btn.text === 'Go' && btn.icons === 1, JSON.stringify(btn));
  t = await texts();
  check('Push marks the icon as kept (<em-keep>)', /^Go<em-keep n="0"><\/em-keep>$/.test(t.find(x => /Go/.test(x.to))?.to || ''), JSON.stringify(t.map(x => x.to)));
  // Layers: no stray rows for the hidden originals.
  await p.evaluate(() => localStorage.setItem('edit-mode:layers', '1'));
  check('⌘Z restores the page exactly', await (async () => { for (let i = 0; i < 8 && (await html()) !== start; i++) await key('Meta+z'); return (await html()) === start; })());
  // 10b. Formatting selected words while typing.
  const selectWords = async (fromStart, n) => { await key(fromStart ? 'Meta+ArrowLeft' : 'Meta+ArrowRight'); if (fromStart) await key('Meta+ArrowUp'); for (let i = 0; i < n; i++) await key(fromStart ? 'Alt+Shift+ArrowRight' : 'Alt+Shift+ArrowLeft'); };
  const titleNode = await p.evaluateHandle(() => document.querySelector('.hero-note').firstChild);
  await pick('.hero-note'); await key('Enter');
  await selectWords(true, 1);
  await key('Meta+KeyB');
  check('⌘B on a selected word in plain text: bold, still typing', await editing() && await p.$eval('.hero-note', e => e.querySelector('b, strong')?.textContent) === 'Plain', await p.$eval('.hero-note', e => e.innerHTML));
  await key('Escape');
  t = await texts();
  check('Push: one change, the plain words → the word in <strong>', t.length === 1 && t[0].rich && t[0].from === 'Plain words to format' && t[0].to === '<strong>Plain</strong> words to format', JSON.stringify(t.map(x => [x.from, x.to])));
  check("React's own text node is still there (hidden behind the copy)", await titleNode.evaluate(n => n.parentNode === document.querySelector('.hero-note')));
  await pick('.hero-note'); await key('Enter');
  await selectWords(true, 1);
  await key('Meta+KeyB');
  await key('Escape');
  check('⌘B again on the bold word: back to plain, no change left', (await texts()).length === 0 && !(await p.$eval('.hero-note', e => [...e.querySelectorAll('b, strong')].some(x => x.dataset.emGone == null))), JSON.stringify((await texts()).map(x => x.to)));
  await key('Meta+z'); await key('Meta+z');
  check('⌘Z twice: the page exactly as it was', (await html()) === start);
  // Italic, underline, strikethrough on the mixed body.
  await pick('.hero-body'); await key('Enter');
  await selectWords(false, 2);
  await key('Meta+KeyI'); await key('Meta+KeyU'); await key('Meta+Shift+KeyX');
  await key('Escape');
  t = await texts();
  check('⌘I / ⌘U / ⇧⌘X: em, u and s around the words', /<em>|<u>|<s>/.test(t[0]?.to || '') && /<em>/.test(t[0].to) && /<u>/.test(t[0].to) && /<s>/.test(t[0].to), t[0]?.to);
  await key('Meta+z');
  // ⌘K: a link on the selected words.
  await pick('.hero-title'); await key('Enter');
  await selectWords(false, 1);
  await key('Meta+KeyK');
  const box = p.locator('edit-mode-root .linkbox input');
  check('⌘K opens the link field', await box.isVisible());
  await box.fill('https://example.com/weekend'); await box.press('Enter'); await p.waitForTimeout(80);
  check('Enter links the words, and you keep typing', await editing() && await p.$eval('.hero-title', e => e.querySelector('a')?.getAttribute('href')) === 'https://example.com/weekend');
  await key('Escape');
  t = await texts();
  check('Push gets the link', /<a href="https:\/\/example.com\/weekend">weekend<\/a>$/.test(t[0]?.to || ''), t[0]?.to);
  await key('Meta+z');
  check('⌘Z restores', (await html()) === start);
  // No selection: ⌘B still styles the whole layer.
  await pick('.hero-title'); await key('Enter'); await key('Meta+ArrowRight');
  await key('Meta+KeyB'); await key('Escape');
  check('caret only: ⌘B styles the whole layer (no words wrapped)', (await p.$eval('.hero-title', e => getComputedStyle(e).fontWeight)) === '400' && (await texts()).length === 0);
  await key('Meta+z');
  // "All like this": bolding the first word of one card title goes to every card in Push.
  await pick('main .card .card-title');
  await p.locator('edit-mode-root .scope button', { hasText: 'All like this' }).click(); await p.waitForTimeout(60);
  await key('Enter'); await selectWords(true, 1); await key('Meta+KeyB'); await key('Escape');
  t = await texts();
  check('All like this: the bold goes to every instance in Push', t.length === 1 && t[0].scope === 'all' && t[0].count === 3, JSON.stringify(t.map(x => [x.scope, x.count, x.to])));
  await p.locator('edit-mode-root .scope button', { hasText: 'This one' }).click();
  check('⌘Z all the way back', await (async () => { for (let i = 0; i < 8 && (await html()) !== start; i++) await key('Meta+z'); return (await html()) === start; })());
  // 10c. The Text section on selected words.
  const R = (q) => `edit-mode-root ${q}`;
  const panelState = () => p.evaluate(() => { const r = document.querySelector('edit-mode-root').shadowRoot; const vis = (n) => n && !n.hidden && !n.closest('[hidden]'); return { name: r.querySelector('.ph-name')?.textContent, sections: [...r.querySelectorAll('.side section')].filter(vis).map(s => s.querySelector('h4')?.textContent).filter(Boolean), align: vis(r.querySelector('button[aria-label="Align left"]')) }; });
  const fld = (label) => p.locator(R(`input[aria-label="${label}"]`)).first();
  await pick('.hero-body'); await key('Enter');
  await selectWords(false, 2);
  let ps = await panelState();
  check('selecting some words: the panel shows them, Text only', ps.name === 'Selected words' && ps.sections.join() === 'Text' && !ps.align, JSON.stringify(ps));
  await fld('Font size').fill('24'); await fld('Font size').press('Enter'); await p.waitForTimeout(80);
  check('clicking into the panel keeps you editing', await editing());
  await fld('Text color').fill('FF0000'); await fld('Text color').press('Enter'); await p.waitForTimeout(80);
  const styled = await p.$eval('.hero-body', e => { const s = [...e.querySelectorAll('span')].find(x => x.style.fontSize); return s ? { text: s.textContent, size: getComputedStyle(s).fontSize, color: getComputedStyle(s).color } : null; });
  check('size and colour change only those words', styled?.size === '24px' && styled.color === 'rgb(255, 0, 0)' && /guides/.test(styled.text) && (await p.$eval('.hero-body', e => getComputedStyle(e).fontSize)) !== '24px', JSON.stringify(styled));
  check('the field reads the words', (await fld('Font size').inputValue()) === '24');
  await key('Escape');
  t = await texts();
  check('Push: the words in a <span style>', /<span style="[^"]*font-size: 24px[^"]*color: rgb\(255, 0, 0\)[^"]*">/.test(t[0]?.to || '') || /<span style="[^"]*color: rgb\(255, 0, 0\)[^"]*font-size: 24px/.test(t[0]?.to || ''), t[0]?.to);
  check('after editing, the panel is the layer again', (await panelState()).name !== 'Selected words');
  await key('Meta+z');
  check('⌘Z restores the page exactly', (await html()) === start);
  // Mixed: bold and plain words selected.
  await pick('.hero-body'); await key('Enter');
  await key('Meta+ArrowLeft');
  for (let i = 0; i < 8 && !/multi/.test(await p.evaluate(() => String(getSelection()))); i++) await key('Alt+Shift+ArrowRight'); // into the bold word
  const wlabel = await p.locator(R('button[aria-label="Font weight"] .dd-label')).first().textContent();
  check('bold and plain words selected: weight reads Mixed', wlabel === 'Mixed', `${wlabel} for “${await p.evaluate(() => String(getSelection()))}”`);
  await key('Escape');
  // Plain text: styling a word from the panel makes it rich (one change).
  await pick('.hero-note'); await key('Enter'); await selectWords(true, 1);
  await fld('Font size').fill('30'); await fld('Font size').press('Enter'); await p.waitForTimeout(80);
  await key('Escape');
  t = await texts();
  check('plain text: one change, the word in a span', t.length === 1 && t[0].from === 'Plain words to format' && /^<span style="font-size: 30px;?">Plain<\/span> words to format$/.test(t[0].to), JSON.stringify(t.map(x => [x.from, x.to])));
  check('⌘Z all the way back', await (async () => { for (let i = 0; i < 6 && (await html()) !== start; i++) await key('Meta+z'); return (await html()) === start; })());
  if (process.env.SHOT) {
    await pick('.hero-body'); await key('Enter'); await selectWords(false, 2);
    await fld('Font size').fill('24'); await fld('Font size').press('Enter'); await p.waitForTimeout(80);
    await p.screenshot({ path: process.env.SHOT, clip: { x: 0, y: 0, width: 1280, height: 600 } });
    await key('Escape'); await key('Meta+z');
  }
  check('no page errors', !errors.length, errors.join(' | '));
} finally {
  fs.writeFileSync(file, orig);
  await b.close();
}
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
