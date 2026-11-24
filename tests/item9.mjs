// Item 9: Figma shortcuts. Runs on the sample copy (5390).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
await p.goto('http://localhost:5390'); await p.waitForSelector('.cta-primary');
const html = () => p.$eval('#root', e => e.innerHTML.replace(/ style=""/g, ''));
const start = await html();
await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(150);
const pick = (q) => p.evaluate((q) => window.__editMode.select(document.querySelector(q)), q);
const key = async (k) => { await p.keyboard.press(k); await p.waitForTimeout(60); };
const undoAll = async (to) => { for (let i = 0; i < 20 && (await html()) !== to; i++) await key('Meta+z'); return (await html()) === to; };
const cs = (q) => p.$eval(q, e => { const c = getComputedStyle(e); return { w: c.fontWeight, st: c.fontStyle, d: c.textDecorationLine, size: c.fontSize, align: c.textAlign, display: c.display }; });
const ctr = async (q) => { const r = await p.locator(q).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };

// 9a. ⇧⌘H hide / show, ⇧⌘L lock.
await pick('.hero-title'); await p.waitForTimeout(60);
await key('Meta+Shift+KeyH');
check('⇧⌘H hides', (await cs('.hero-title')).display === 'none');
check('…as a change Push sees', await p.evaluate(() => window.__editMode.changes.list().some(c => c.property === 'display')));
await key('Meta+Shift+KeyH');
check('⇧⌘H again shows it', (await cs('.hero-title')).display !== 'none' && (await html()) === start);
// Several: the title and the subtitle (Shift-click adds at the same depth).
await pick('.hero-title'); await p.waitForTimeout(60);
await p.keyboard.down('Shift'); await p.mouse.click(...(await ctr('.hero-body'))); await p.keyboard.up('Shift'); await p.waitForTimeout(60);
const n = await p.evaluate(() => window.__editMode.state.multi.length);
await key('Meta+Shift+KeyH');
check('⇧⌘H on two: both hidden, one ⌘Z', n === 2 && (await cs('.hero-title')).display === 'none' && (await cs('.hero-body')).display === 'none', `multi=${n}`);
await key('Meta+z');
check('…⌘Z shows both', (await html()) === start);
await pick('.hero-title'); await p.waitForTimeout(60);
await key('Meta+Shift+KeyL');
const locked = () => p.evaluate(() => window.__editMode.layers.isLocked(document.querySelector('.hero-title')));
check('⇧⌘L locks', await locked());
await key('Escape'); await key('Escape'); await key('Escape');
await p.keyboard.down('Meta'); await p.mouse.click(...(await ctr('.hero-title'))); await p.keyboard.up('Meta'); await p.waitForTimeout(60);
const got = await p.evaluate(() => window.__editMode.state.selected?.className);
check('a locked layer can\'t be picked on the page', got !== 'hero-title', got);
await pick('.hero-title'); await key('Meta+Shift+KeyL');
check('⇧⌘L again unlocks', !(await locked()));

// 9a. Text shortcuts.
await pick('.hero-title'); await p.waitForTimeout(60);
const w0 = (await cs('.hero-title')).w;
await key('Meta+KeyB');
check('⌘B toggles bold off', w0 === '700' && (await cs('.hero-title')).w === '400', `${w0} → ${(await cs('.hero-title')).w}`);
await key('Meta+KeyB');
check('⌘B again: bold', (await cs('.hero-title')).w === '700');
await key('Meta+KeyI'); await key('Meta+KeyU');
let c = await cs('.hero-title');
check('⌘I italic, ⌘U underline', c.st === 'italic' && c.d === 'underline', JSON.stringify(c));
await key('Meta+KeyI'); await key('Meta+KeyU');
c = await cs('.hero-title');
check('…and off again', c.st === 'normal' && c.d === 'none', JSON.stringify(c));
await key('Meta+Shift+Period');
check('⇧⌘> font size +1', (await cs('.hero-title')).size === '45px', (await cs('.hero-title')).size);
await key('Meta+Alt+Shift+Period');
check('⌥⇧⌘> +10', (await cs('.hero-title')).size === '55px', (await cs('.hero-title')).size);
await key('Meta+Shift+Comma');
check('⇧⌘< −1', (await cs('.hero-title')).size === '54px', (await cs('.hero-title')).size);
await key('Meta+Alt+KeyT');
check('⌥⌘T center', (await cs('.hero-title')).align === 'center');
await key('Meta+Alt+KeyR');
check('⌥⌘R right', (await cs('.hero-title')).align === 'right');
await key('Meta+Alt+KeyL');
check('⌥⌘L left', /left|start/.test((await cs('.hero-title')).align));
check('the panel follows', await p.locator('edit-mode-root input[aria-label="Font size"]').inputValue() === '54');
check('⌘Z steps all the way back', await undoAll(start));
// While editing: styles the whole layer, keeps editing, the text is untouched.
await pick('.hero-title'); await key('Enter');
await key('Meta+KeyB');
check('⌘B while editing text', (await cs('.hero-title')).w === '400' && await p.evaluate(() => !!window.__editMode.state.editing));
await key('Escape');
check('…the text is unchanged', !(await p.evaluate(() => window.__editMode.changes.list().some(c => c.kind === 'text'))));
check('⌘Z restores', await undoAll(start));
// Nothing with text selected: the keys do nothing.
await pick('.hero'); await p.waitForTimeout(60);
await key('Meta+KeyB'); await key('Meta+Shift+Period');
check('on a section without its own text: nothing changes', (await html()) === start);

// 9b. ⌥⌘C / ⌥⌘V: copy and paste properties.
const look = (q) => p.$eval(q, e => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return { bg: c.backgroundColor, radius: c.borderTopLeftRadius, color: c.color, font: c.fontFamily, size: c.fontSize, weight: c.fontWeight, w: Math.round(r.width), h: Math.round(r.height) }; });
const src = await look('.cta-primary');
await pick('.cta-primary'); await key('Meta+Alt+KeyC');
check('⌥⌘C says "Copied properties"', /Copied properties/.test(await p.locator('edit-mode-root .toast').last().textContent().catch(() => '')));
const card0 = await look('main .card');
await pick('main .card'); await key('Meta+Alt+KeyV');
let card = await look('main .card');
check('onto a card: fill and corners', card.bg === src.bg && card.radius === src.radius, JSON.stringify(card));
check("…its size doesn't change", card.w === card0.w && card.h === card0.h, `${card0.w}×${card0.h} → ${card.w}×${card.h}`);
check('…no text style on something without its own text', card.color === card0.color && card.size === card0.size, JSON.stringify(card));
await key('Meta+z');
check('one ⌘Z undoes the paste', (await html()) === start);
const t0 = await look('.hero-title');
await pick('.hero-title'); await key('Meta+Alt+KeyV');
let t = await look('.hero-title');
check('onto text: the text style too', t.bg === src.bg && t.color === src.color && t.size === src.size && t.weight === src.weight && t.font === src.font, JSON.stringify(t));
check("…its width doesn't change", t.w === t0.w, `${t0.w} → ${t.w}`);
const styled = await p.evaluate(() => window.__editMode.changes.list().filter(c => c.kind === 'style').map(c => c.property));
const rows = await p.evaluate(() => window.__editMode.changes.list().length);
check('a lean Push list (no border details for a border that is gone)', rows <= 12, `${rows} rows`);
check('Push gets them as style changes', ['background-color', 'color', 'font-size'].every(x => styled.includes(x)), styled.join(','));
await key('Meta+z');
check('one ⌘Z undoes it', (await html()) === start);
await pick('.hero-title'); await p.waitForTimeout(60);
await p.keyboard.down('Shift'); await p.mouse.click(...(await ctr('.hero-body'))); await p.keyboard.up('Shift'); await p.waitForTimeout(60);
await key('Meta+Alt+KeyV');
check('onto two at once', (await look('.hero-title')).bg === src.bg && (await look('.hero-body')).bg === src.bg);
await key('Meta+z');
check('…one ⌘Z', (await html()) === start);
await key('Escape'); await key('Escape'); await key('Escape');

check('no page errors', !errors.length, errors.join(' | '));
console.log(results.join('\n'));
console.log(`${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await b.close();
