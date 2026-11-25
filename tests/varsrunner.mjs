// Color variables on the server (2026-11-25): a Push hands the pending variables to its
// batch, and Undo brings them back (merged with any made since). No browser; uses
// fake-claude.mjs, so no real run. Run: node varsrunner.mjs
import { createRunner } from '../src/runner.js';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = mkdtempSync(join(tmpdir(), 'em-vars-'));
mkdirSync(join(root, 'src'));
writeFileSync(join(root, 'src/app.css'), ':root { --a: #000; }\n');
const r = createRunner({ root, claudePath: fileURLToPath(new URL('./fake-claude.mjs', import.meta.url)), log: () => {} });
const ok = (n, c, d = '') => console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (d ? '  — ' + d : ''));
r.writeVars({ set: { '--brand': '#ff00aa' }, added: ['--brand'] });
r.push({ url: 'x', viewport: {}, changes: [{ kind: 'variable', name: '--brand', value: '#ff00aa', added: true }], context: [] });
while (r.isRunning()) await new Promise((res) => setTimeout(res, 100));
const st = r.status();
ok('push finished', st.last?.ok, st.last?.error || '');
ok('pending variables were handed to the batch', JSON.stringify(r.readVars()) === JSON.stringify({ set: {}, added: [] }) && existsSync(join(root, '.editmode', st.last.id, 'variables.json')));
r.writeVars({ set: { '--new': '#123456' }, added: ['--new'] });
r.undo();
const v = r.readVars();
ok('undo brings them back, keeping ones made since', v.set['--brand'] === '#ff00aa' && v.set['--new'] === '#123456' && v.added.includes('--brand') && v.added.includes('--new'), JSON.stringify(v));
rmSync(root, { recursive: true, force: true });
