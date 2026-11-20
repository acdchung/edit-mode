#!/usr/bin/env node
// A stand-in for the `claude` CLI, for tests that shouldn't start a real run
// (set EDIT_MODE_CLAUDE to this file). For the EDITMODE.md draft it writes a
// small file, and misbehaves on purpose (edits App.jsx, adds a stray file) so
// tests can check that only EDITMODE.md survives. Anything else: does nothing.
import { appendFileSync, writeFileSync } from 'node:fs';
const prompt = process.argv[process.argv.indexOf('-p') + 1] || '';
if (prompt.includes('You are writing `EDITMODE.md`')) {
  writeFileSync('EDITMODE.md', '# Edit Mode conventions\n\n## Styling\nPlain CSS files next to components (check).\n');
  appendFileSync('src/App.jsx', '\n// stray edit\n');
  writeFileSync('src/stray.css', '.x {}\n');
  console.log(JSON.stringify({ result: 'Found plain CSS next to components; the token file is a guess (check).', is_error: false }));
} else {
  console.log(JSON.stringify({ result: 'Nothing to do (fake).', is_error: false }));
}
