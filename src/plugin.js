// Edit Mode — Vite plugin (dev server only; does nothing in `vite build`).
//
//   import editMode from 'edit-mode';
//   export default defineConfig({ plugins: [editMode(), react()] });
//
// It does three things:
//   1. Tags host JSX elements with data-src="file:line:col" (see tag-source.js).
//   2. Injects the overlay (src/overlay/*) into index.html.
//   3. Pauses hot reload while edit mode is on, so saving a file can't wipe
//      in-progress edits. Updates that arrive meanwhile are applied (as one
//      page reload) when edit mode is turned off.
//   4. Push: hands the edits to Claude Code (see runner.js), and Undo.
//
// Options: { claudePath } to point at a specific `claude` binary (or set EDIT_MODE_CLAUDE).

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tagSource } from './tag-source.js';
import { createRunner } from './runner.js';

const BASE = '/@edit-mode';
const overlayDir = fileURLToPath(new URL('./overlay/', import.meta.url));

// The overlay pings every 2s while edit mode is on. The window is long so that
// Chrome's timer throttling in background tabs doesn't unfreeze it by accident.
const FREEZE_WINDOW_MS = 75_000;

export default function editMode(options = {}) {
  const include = options.include ?? /\.[jt]sx$|\.js$/;
  let root = process.cwd();
  let server;
  let runner;
  let lastPing = 0;
  const pending = new Set();

  const frozen = () => runner?.isRunning() || Date.now() - lastPing < FREEZE_WINDOW_MS;

  return {
    name: 'edit-mode',
    apply: 'serve', // dev only
    enforce: 'pre', // run on the original source, before JSX is compiled away

    config() {
      // Handoff files in .editmode/ shouldn't trigger reloads.
      return { server: { watch: { ignored: ['**/.editmode/**'] } } };
    },

    configResolved(config) {
      root = config.root;
    },

    configureServer(s) {
      server = s;
      runner = createRunner({ root, claudePath: options.claudePath, log });
      server.middlewares.use(BASE, (req, res, next) => handle(req, res, next));
    },

    handleHotUpdate({ file }) {
      if (frozen()) {
        if (!pending.has(file)) log(`paused hot reload while editing: ${relative(root, file)}`);
        pending.add(file);
        return []; // swallow the update
      }
      pending.clear();
    },

    transform(code, id) {
      const file = id.split('?')[0];
      if (file.includes('/node_modules/') || !include.test(file)) return null;
      return tagSource(code, relative(root, file), file);
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: `window.__EDIT_MODE__ = ${JSON.stringify({ root })};`,
          injectTo: 'head',
        },
        { tag: 'script', attrs: { type: 'module', src: `${BASE}/main.js` }, injectTo: 'body' },
      ];
    },
  };

  async function handle(req, res, next) {
    const name = req.url.split('?')[0].replace(/^\//, '');
    const send = (code, body) => {
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    };

    try {
      if (name === 'freeze' && req.method === 'POST') {
        const body = await readBody(req);
        if (body === 'on') {
          lastPing = Date.now();
        } else if (!runner.isRunning()) {
          lastPing = 0;
          if (pending.size) {
            log(`edit mode off, applying ${pending.size} paused update(s)`);
            pending.clear();
            hot().send({ type: 'full-reload', path: '*' });
          }
        }
        return send(200, { ok: true });
      }
      if (name === 'status') return send(200, runner.status());
      if (name === 'push' && req.method === 'POST') {
        lastPing = Date.now(); // stay frozen until the page reloads
        return send(200, runner.push(JSON.parse(await readBody(req))));
      }
      if (name === 'undo' && req.method === 'POST') return send(200, runner.undo());
      if (name === 'draft-conventions' && req.method === 'POST') return send(200, runner.draftConventions());
    } catch (err) {
      return send(400, { error: err.message });
    }

    if (!/^[a-z-]+\.js$/.test(name)) return next();
    try {
      // Read on every request so overlay edits show up on refresh.
      const code = readFileSync(overlayDir + name, 'utf8');
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.end(code);
    } catch {
      next();
    }
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  function hot() {
    return server.environments?.client?.hot ?? server.ws;
  }
  function log(msg) {
    server.config.logger.info(`[edit-mode] ${msg}`, { timestamp: true });
  }
}
