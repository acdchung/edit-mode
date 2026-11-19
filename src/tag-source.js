// Adds data-src="file:line:col" to every host JSX element (<div>, <button>, …)
// so the overlay can map a clicked DOM node back to the exact source line.
//
// Only lowercase tags are tagged: those become real DOM elements. Components
// (<Card />) aren't tagged because they may not forward unknown props; the
// elements *inside* the component carry their own tags instead.

import { parse } from '@babel/parser';
import MagicString from 'magic-string';

export const ATTR = 'data-src';

export function tagSource(code, relPath, absPath = relPath) {
  // Cheap bail-out: no JSX-looking tags, nothing to do.
  if (!/<[a-z]/.test(code)) return null;

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch {
    return null; // Not parseable as JSX; leave the file alone.
  }

  const s = new MagicString(code);
  let count = 0;

  walk(ast.program, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    const name = node.name;
    if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(name.name)) return;
    if (node.attributes.some((a) => a.type === 'JSXAttribute' && a.name?.name === ATTR)) return;

    const { line, column } = node.loc.start;
    s.appendLeft(name.end, ` ${ATTR}="${relPath}:${line}:${column + 1}"`);
    count++;
  });

  if (!count) return null;
  return { code: s.toString(), map: s.generateMap({ hires: true, source: absPath, includeContent: true }) };
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key in node) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) for (const c of child) walk(c, visit);
    else if (child && typeof child === 'object') walk(child, visit);
  }
}
