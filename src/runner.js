// Push → Claude: writes the handoff batch, snapshots source files, runs
// Claude Code headless to apply the edits, and can undo that pass.
//
// .editmode/
//   state.json                  last batch (for Undo)
//   batch-<timestamp>/
//     changes.json, context.json   what the designer changed
//     snapshot.json               source files before Claude ran
//     result.json                 what Claude changed + its summary

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPT = fileURLToPath(new URL('./apply-edits.md', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', '.editmode', 'dist', 'build', '.next', '.vite', 'coverage', '.turbo']);
const SOURCE_EXT = /\.(jsx?|tsx?|mjs|cjs|css|scss|sass|less|html|json|svg|md)$/;
const MAX_FILE = 1_000_000;
const TIMEOUT_MS = 10 * 60_000;
const TOOLS = 'Read,Edit,Write,Glob,Grep';

export function createRunner({ root, claudePath, log }) {
  const dir = join(root, '.editmode');
  const statePath = join(dir, 'state.json');
  let running = null; // batch id while Claude works

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
    return { running, last };
  }

  function findClaude() {
    if (claudePath) return claudePath;
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
    writeJSON(join(batchDir, 'context.json'), { url: payload.url, viewport: payload.viewport, elements: payload.context });
    const before = scan();
    writeJSON(join(batchDir, 'snapshot.json'), before);

    running = id;
    log(`pushing ${payload.changes.length} change(s) to Claude (${id})`);
    const prompt = readFileSync(PROMPT, 'utf8').replaceAll('{{BATCH}}', `.editmode/${id}`);
    const child = spawn(bin, ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', TOOLS], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);

    const finish = (result) => {
      clearTimeout(timer);
      running = null;
      const after = scan();
      const changed = Object.keys(after).filter((f) => f in before && before[f] !== after[f]);
      const created = Object.keys(after).filter((f) => !(f in before));
      const record = { id, ...result, files: [...changed, ...created], changed, created, at: Date.now() };
      writeJSON(join(batchDir, 'result.json'), { ...record, after: Object.fromEntries([...changed, ...created].map((f) => [f, after[f]])) });
      writeJSON(statePath, { last: record });
      log(result.ok ? `Claude finished: ${result.summary}` : `Claude failed: ${result.error}`);
    };

    child.on('error', (e) => finish({ ok: false, error: e.message }));
    child.on('close', (code) => {
      let parsed = null;
      try { parsed = JSON.parse(out); } catch {}
      if (code === 0 && parsed && !parsed.is_error) finish({ ok: true, summary: String(parsed.result || '').trim() });
      else finish({ ok: false, error: (parsed?.result || err || out || `exit code ${code}`).toString().trim().slice(-600) });
    });
    return { id };
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
    writeJSON(statePath, { last: { ...last, undone: true } });
    log(`undid ${last.id}: restored ${restored.length} file(s)` + (skipped.length ? `, skipped ${skipped.join(', ')}` : ''));
    return { changes: readJSON(join(batchDir, 'changes.json'), []), restored, skipped };
  }

  return { push, undo, status, isRunning: () => !!running };
}
