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
    .replace('Hand-picked multi-pitch routes with local guides.', 'Hand-picked <strong className="em-bold">multi-pitch</strong> routes with <a href="#guides">local guides</a>.')
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
  check('no page errors', !errors.length, errors.join(' | '));
} finally {
  fs.writeFileSync(file, orig);
  await b.close();
}
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
