// Phase B1: the project conventions file (EDITMODE.md). Self-contained: makes
// its own copy of sample-app, runs it on port 5392 with a fake `claude`
// (fake-claude.mjs), so no real Claude run happens.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const app = join(here, '../sample-app');
const dir = mkdtempSync(join(tmpdir(), 'em-b1-'));
cpSync(app, dir, { recursive: true, filter: (src) => !/\/(node_modules|\.editmode)(\/|$)/.test(src) });
rmSync(join(dir, 'EDITMODE.md'), { force: true });
symlinkSync(join(app, 'node_modules'), join(dir, 'node_modules'));
const appBefore = readFileSync(join(dir, 'src/App.jsx'), 'utf8');
const vite = spawn('npx', ['vite', '--port', '5392', '--strictPort'], { cwd: dir, env: { ...process.env, EDIT_MODE_CLAUDE: join(here, 'fake-claude.mjs') }, stdio: 'pipe' });
await new Promise((ok, fail) => { vite.stdout.on('data', (d) => /ready|Local/.test(d) && ok()); setTimeout(() => fail(new Error('vite did not start')), 20000); });

const b = await chromium.launch({ channel: 'chrome' });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('edit-mode:layers', '0'); } catch {} });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:5392'); await p.waitForSelector('.signup');
  await p.keyboard.press('Alt+KeyE'); await p.waitForTimeout(250);
  const R = (f) => p.evaluate(f);
  const status = () => R(() => fetch('/@edit-mode/status').then((r) => r.json()));
  check('no EDITMODE.md yet: status says so', (await status()).conventions === false);

  await R(() => window.__editMode.changes.set(document.querySelector('.signup'), 'one', 'padding-top', '10px'));
  await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(400);
  const row = () => R(() => { const c = document.querySelector('edit-mode-root').shadowRoot.querySelector('.dialog .conv'); return c && !c.hidden ? c.textContent : null; });
  check('the Push dialog offers to draft one', /No EDITMODE\.md yet.*Draft one/.test((await row()) || ''), String(await row()));
  const btn = await R(() => { const b = [...document.querySelector('edit-mode-root').shadowRoot.querySelectorAll('.dialog .conv .pbtn')][0].getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await p.mouse.click(...btn);
  let t = 0; while (!/Drafted EDITMODE/.test((await row()) || '') && t++ < 40) await p.waitForTimeout(250);
  check('drafting finishes and the dialog says so', /Drafted EDITMODE\.md/.test((await row()) || ''), String(await row()));
  check('EDITMODE.md is in the project', existsSync(join(dir, 'EDITMODE.md')));
  check('any other file the draft touched is put back (App.jsx)', readFileSync(join(dir, 'src/App.jsx'), 'utf8') === appBefore);
  check('…and new stray files are removed', !existsSync(join(dir, 'src/stray.css')));
  check('it asks you to review it, and the Push dialog stays open', /Review it in your code editor/.test((await row()) || ''));
  const okEnabled = await R(() => !document.querySelector('edit-mode-root').shadowRoot.querySelector('.dialog .pbtn.primary').disabled);
  check('Push can proceed afterwards', okEnabled);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await p.keyboard.press('Meta+Enter'); await p.waitForTimeout(400);
  check('next time, the dialog doesn’t offer it', (await row()) === null, String(await row()));
  const again = await R(() => fetch('/@edit-mode/draft-conventions', { method: 'POST' }).then((r) => r.json()));
  check('drafting again is refused while one exists', /already exists/.test(again.error || ''), JSON.stringify(again));
  const prompt = readFileSync(join(here, '../src/apply-edits.md'), 'utf8');
  check('Push reads EDITMODE.md first and lets it win', /^0\. If the project has `EDITMODE\.md`/m.test(prompt));
  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await b.close();
  vite.kill();
  rmSync(dir, { recursive: true, force: true });
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
