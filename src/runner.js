// Push → Claude: writes the handoff batch, snapshots source files, runs
// Claude Code headless to apply the edits, and can undo that pass. Also
// drafts the project's conventions file (EDITMODE.md) on request.
//
// .editmode/
//   state.json                  last batch (for Undo)
//   batch-<timestamp>/
//     changes.json, context.json   what the designer changed
//     snapshot.json               source files before Claude ran
//     result.json                 what Claude changed + its summary
//   canvas.json                 the design canvas beside the page
//   assets/<hash>.<ext>         images added in Edit Mode, until Push copies them into the project

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPT = fileURLToPath(new URL('./apply-edits.md', import.meta.url));
const DRAFT_PROMPT = fileURLToPath(new URL('./draft-conventions.md', import.meta.url));
// The team's own rules for this codebase (styling, tokens, layout components…).
// Push reads it first; Edit Mode can draft it.
export const CONVENTIONS = 'EDITMODE.md';
const SKIP_DIRS = new Set(['node_modules', '.git', '.editmode', 'dist', 'build', '.next', '.vite', 'coverage', '.turbo']);
const SOURCE_EXT = /\.(jsx?|tsx?|mjs|cjs|css|scss|sass|less|html|json|svg|md)$/;
const MAX_FILE = 1_000_000;
const TIMEOUT_MS = 10 * 60_000;
const TOOLS = 'Read,Edit,Write,Glob,Grep';
const MAX_ASSET = 25_000_000;
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };

export function createRunner({ root, publicDir = join(root, 'public'), claudePath, log }) {
  const dir = join(root, '.editmode');
  const statePath = join(dir, 'state.json');
  let running = null; // batch id (or 'draft') while Claude works
  let lastDraft = null; // { ok, summary | error } of the last conventions draft

  const readJSON = (p, fallback) => {
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
  };
  const writeJSON = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2));

  function ensureDir() {
    mkdirSync(dir, { recursive: true });
    const ignore = join(dir, '.gitignore');
    if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  }

  // Text source files in the project, as { relPath: content }.
  function scan() {
    const files = {};
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
        const abs = join(d, name);
        const st = statSync(abs);
        if (st.isDirectory()) walk(abs);
        else if (SOURCE_EXT.test(name) && name !== 'package-lock.json' && st.size < MAX_FILE) {
          files[relative(root, abs)] = readFileSync(abs, 'utf8');
        }
      }
    };
    walk(root);
    return files;
  }

  function status() {
    const state = readJSON(statePath, {});
    const last = state.last && {
      id: state.last.id,
      ok: state.last.ok,
      error: state.last.error,
      summary: state.last.summary,
      files: state.last.files,
      undoable: !!state.last.ok && !state.last.undone && !!state.last.files?.length,
    };
    return { running, last, conventions: existsSync(join(root, CONVENTIONS)), draft: lastDraft };
  }

  function findClaude() {
    if (claudePath) return claudePath;
    if (process.env.EDIT_MODE_CLAUDE) return process.env.EDIT_MODE_CLAUDE;
    try {
      return execFileSync('/bin/sh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim() || null;
    } catch {}
    const candidates = [join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
    try {
      for (const ext of readdirSync(join(homedir(), '.vscode/extensions')).filter((n) => n.startsWith('anthropic.claude-code')).sort().reverse()) {
        candidates.push(join(homedir(), '.vscode/extensions', ext, 'resources/native-binary/claude'));
      }
    } catch {}
    return candidates.find((p) => existsSync(p)) || null;
  }

  function push(payload) {
    if (running) throw new Error('Claude is already applying a batch.');
    if (!payload?.changes?.length) throw new Error('No changes to push.');
    const bin = findClaude();
    if (!bin) throw new Error('Claude Code CLI not found. Install it with: curl -fsSL https://claude.ai/install.sh | bash');

    ensureDir();
    const id = 'batch-' + new Date().toISOString().replace(/[:.]/g, '-');
    const batchDir = join(dir, id);
    mkdirSync(batchDir);
    writeJSON(join(batchDir, 'changes.json'), payload.changes);
    // Designs that sat on the page, as they were (not for Claude): Undo hands them back so they return to the page.
    if (payload.onPage?.length) writeJSON(join(batchDir, 'on-page.json'), payload.onPage);
    const images = copyImages(payload.changes);
    writeJSON(join(batchDir, 'context.json'), { url: payload.url, viewport: payload.viewport, elements: payload.context,
      ...(images.map.length ? { images: images.map } : {}) });
    const before = scan();
    writeJSON(join(batchDir, 'snapshot.json'), before);

    running = id;
    log(`pushing ${payload.changes.length} change(s) to Claude (${id})`);
    const prompt = readFileSync(PROMPT, 'utf8').replaceAll('{{BATCH}}', `.editmode/${id}`);
    runClaude(bin, prompt, TOOLS, (result) => {
      running = null;
      const after = scan();
      const changed = Object.keys(after).filter((f) => f in before && before[f] !== after[f]);
      const created = Object.keys(after).filter((f) => !(f in before));
      const record = { id, ...result, files: [...changed, ...created], changed, created, images: images.copied, at: Date.now() };
      writeJSON(join(batchDir, 'result.json'), { ...record, after: Object.fromEntries([...changed, ...created].map((f) => [f, after[f]])) });
      writeJSON(statePath, { last: record });
      log(result.ok ? `Claude finished: ${result.summary}` : `Claude failed: ${result.error}`);
    });
    return { id };
  }

  // Run Claude Code headless in the project; `done` gets { ok, summary } or { ok: false, error }.
  function runClaude(bin, prompt, tools, done) {
    const child = spawn(bin, ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', tools], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);
    let ended = false;
    const finish = (result) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      done(result);
    };
    child.on('error', (e) => finish({ ok: false, error: e.message }));
    child.on('close', (code) => {
      let parsed = null;
      try { parsed = JSON.parse(out); } catch {}
      if (code === 0 && parsed && !parsed.is_error) finish({ ok: true, summary: String(parsed.result || '').trim() });
      else finish({ ok: false, error: (parsed?.result || err || out || `exit code ${code}`).toString().trim().slice(-600) });
    });
  }

  // Draft EDITMODE.md from the codebase. Claude may only write that file:
  // anything else it touches is put back afterwards.
  function draftConventions() {
    if (running) throw new Error('Claude is busy. Try again when it has finished.');
    if (existsSync(join(root, CONVENTIONS))) throw new Error(`${CONVENTIONS} already exists. Edit it in your code editor.`);
    const bin = findClaude();
    if (!bin) throw new Error('Claude Code CLI not found. Install it with: curl -fsSL https://claude.ai/install.sh | bash');
    const before = scan();
    running = 'draft';
    lastDraft = null;
    log(`drafting ${CONVENTIONS}`);
    runClaude(bin, readFileSync(DRAFT_PROMPT, 'utf8'), 'Read,Glob,Grep,Write', (result) => {
      running = null;
      const after = scan();
      const strays = Object.keys(after).filter((f) => f !== CONVENTIONS && before[f] !== after[f]);
      for (const f of strays) {
        if (f in before) writeFileSync(join(root, f), before[f]);
        else rmSync(join(root, f));
      }
      if (strays.length) log(`put back files the draft shouldn't have touched: ${strays.join(', ')}`);
      lastDraft = result.ok && !existsSync(join(root, CONVENTIONS))
        ? { ok: false, error: `Claude finished without writing ${CONVENTIONS}.` }
        : result;
      log(lastDraft.ok ? `drafted ${CONVENTIONS}` : `drafting ${CONVENTIONS} failed: ${lastDraft.error}`);
    });
    return { ok: true };
  }

  // Put back the files Claude changed, unless they were edited again since.
  function undo() {
    const state = readJSON(statePath, {});
    const last = state.last;
    if (!last?.ok || last.undone) throw new Error('Nothing to undo.');
    const batchDir = join(dir, last.id);
    const before = readJSON(join(batchDir, 'snapshot.json'), null);
    const result = readJSON(join(batchDir, 'result.json'), null);
    if (!before || !result) throw new Error('The snapshot for the last batch is missing.');

    const restored = [];
    const skipped = [];
    for (const f of last.files) {
      const abs = join(root, f);
      const now = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
      if (now !== result.after[f]) { skipped.push(f); continue; }
      if (f in before) writeFileSync(abs, before[f]);
      else rmSync(abs);
      restored.push(f);
    }
    for (const f of last.images || []) { // images this pass copied into the project
      const abs = join(root, f);
      if (existsSync(abs)) { rmSync(abs); restored.push(f); }
    }
    writeJSON(statePath, { last: { ...last, undone: true } });
    log(`undid ${last.id}: restored ${restored.length} file(s)` + (skipped.length ? `, skipped ${skipped.join(', ')}` : ''));
    return { changes: readJSON(join(batchDir, 'changes.json'), []), onPage: readJSON(join(batchDir, 'on-page.json'), []), restored, skipped };
  }

  // The design canvas beside the page (overlay: design.js), saved as its HTML.
  const canvasPath = join(dir, 'canvas.json');
  const readCanvas = () => readJSON(canvasPath, { html: '', fresh: true }); // fresh: never saved (start with a frame)
  function writeCanvas(data) {
    if (typeof data?.html !== 'string') throw new Error('Canvas: expected { html }.');
    ensureDir();
    writeJSON(canvasPath, { html: data.html, at: Date.now() });
    return { ok: true };
  }

  // Images dropped, pasted or picked in Edit Mode (C3b). They live in
  // .editmode/assets/ until Push copies one into the project's own assets.
  // Named by content, so the same image twice is one file.
  const assetsDir = join(dir, 'assets');
  function saveAsset(name, bytes) {
    const ext = (extname(name || '').slice(1) || '').toLowerCase().replace('jpeg', 'jpg');
    if (!IMAGE_TYPES[ext]) throw new Error('Assets: only images (png, jpg, gif, webp, avif, svg).');
    if (!bytes.length || bytes.length > MAX_ASSET) throw new Error('Assets: images up to 25 MB.');
    ensureDir();
    mkdirSync(assetsDir, { recursive: true });
    const file = `${createHash('sha1').update(bytes).digest('hex').slice(0, 12)}.${ext}`;
    const path = join(assetsDir, file);
    if (!existsSync(path)) writeFileSync(path, bytes);
    return { file, url: `/@edit-mode/assets/${file}`, path: `.editmode/assets/${file}` };
  }
  // Push: Claude can't copy binary files, so images the changes use are
  // copied into the project's public folder first (Vite serves it at /).
  // → map: [{ url (as in changes.json), file (in the project), src (its URL there) }]
  //   copied: the files this pass added (Undo removes them).
  function copyImages(list) {
    const names = [...new Set([...JSON.stringify(list).matchAll(/\/@edit-mode\/assets\/([0-9a-f]{12}\.[a-z]+)/g)].map((m) => m[1]))];
    const map = [];
    const copied = [];
    for (const name of names) {
      const from = join(assetsDir, name);
      if (!existsSync(from)) continue;
      const to = join(publicDir, 'images', name);
      if (!existsSync(to)) {
        mkdirSync(join(publicDir, 'images'), { recursive: true });
        writeFileSync(to, readFileSync(from));
        copied.push(relative(root, to));
      }
      map.push({ url: `/@edit-mode/assets/${name}`, file: relative(root, to), src: `/images/${name}` });
    }
    if (copied.length) log(`copied ${copied.length} image(s) into ${relative(root, publicDir) || '.'}/images`);
    return { map, copied };
  }

  function readAsset(file) {
    if (!/^[0-9a-f]{12}\.[a-z]+$/.test(file) || !IMAGE_TYPES[extname(file).slice(1)]) return null;
    const path = join(assetsDir, file);
    return existsSync(path) ? { bytes: readFileSync(path), type: IMAGE_TYPES[extname(file).slice(1)] } : null;
  }

  return { push, undo, status, draftConventions, readCanvas, writeCanvas, saveAsset, readAsset, isRunning: () => !!running };
}
