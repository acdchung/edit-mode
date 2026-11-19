# Edit Mode: notes for Claude

Read this file first, then ROADMAP.md (what's next) and README.md (user-facing features and shortcuts).

## Who and what

- The user is a designer, not an engineer, so explain anything they need to run. They want Figma's **canvas** behavior on a live localhost page. Components and variables are out of scope.
- Edit Mode is a Vite plugin (React + plain CSS). The user edits the running page, edits are batched in the browser, and **Push** writes a batch to `.editmode/` and runs the `claude` CLI to rewrite the source. **Undo** restores the files that pass changed.
- Don't add Edit Mode to the user's own projects until they ask. `sample-app/` is the test bed.

## Working rules

- **Never run automated tests against the user's server** (sample-app on port 5288, which they use live, including real pushes). Test on a copy:
  - scratchpad `sample-copy/`: a copy of sample-app with `node_modules` symlinked, running on **port 5390** with its own `.editmode/`
  - start it with `npx vite --port 5390 --strictPort`
  - drive it with `playwright-core` + system Chrome (`chromium.launch({ channel: 'chrome' })`)
  - if the scratchpad was wiped, recreate the copy: `cp -R sample-app <dir>/sample-copy`, delete its `.editmode`, and symlink `node_modules`
- **Git:** the project is a local git repo. Commit a checkpoint after each roadmap item passes QA (and before risky changes). Never commit `node_modules`, `.editmode/` or `dist/` (see `.gitignore`).
- **Tests live in `tests/`:** `item1.mjs`, `item2.mjs`, `zoom.mjs`, `brutal1.mjs` and `brutal2.mjs`. Every suite except `item2.mjs` starts with the Layers panel closed, through `addInitScript` setting `localStorage['edit-mode:layers'] = '0'`. Otherwise the panels cover the spots those tests click on. Run them with `cd tests && node <file>` while the copy runs on 5390 (`npm install` in `tests/` if `node_modules` is missing). Add an `itemN.mjs` for each roadmap item.
- Use **mouse clicks** in tests (`page.mouse.click(x, y)`), not `locator.click()`: the glass layer intercepts pointer events.
- A plain click selects at the current level (Figma). To select a specific nested element in a test, hold Meta while clicking (`brutal*.mjs`'s `p.tap` does this); `tests/item1.mjs` covers the level rules.
- In the browser console, `window.__editMode` gives `{ state, changes }`.
- QA every feature as it lands. Check:
  - the behavior itself
  - one ⌘Z restores the DOM exactly (compare `#root` innerHTML, ignoring `style=""`)
  - no page errors
  - a screenshot, read back, for anything visual
- The user's taste:
  - minimal, "high-class tech" dark UI
  - system sans font, mono only for the element name and meta in the panel header
  - Lucide icons only (generated into `icons.js`)
  - quick morph transitions
  - Figma behavior is the reference for every interaction

## Architecture

- `src/plugin.js`: the Vite plugin, dev only (`apply: 'serve'`, `enforce: 'pre'`).
  - `transform` tags JSX via `tag-source.js`
  - `transformIndexHtml` injects `/@edit-mode/main.js`
  - middleware: `/@edit-mode/{freeze,status,push,undo}` plus the overlay files
  - `handleHotUpdate` returns `[]` while frozen (edit mode pings every 2s, 75s window) or while Claude runs; on unfreeze it sends a full reload if updates are pending
- `src/tag-source.js`: adds `data-src="rel/path:line:col"` after every lowercase JSX tag name (@babel/parser + magic-string, with sourcemaps).
- `src/runner.js`:
  - writes `.editmode/batch-<ts>/` (`changes.json`, `context.json`, `snapshot.json`, `result.json`)
  - spawns `claude -p … --permission-mode acceptEdits --allowedTools Read,Edit,Write,Glob,Grep`
  - finds claude on PATH, then `~/.local/bin/claude`, then the VS Code extension binary
  - Undo restores only the files changed in that pass, and only if they're untouched since
  - `state.json` holds the last pass
- `src/apply-edits.md`: the prompt Claude follows when it applies a batch. It covers:
  - scope one/all
  - move, insert, copy, group and delete semantics
  - reuse of CSS variables, no inline styles
  - **When the overlay starts emitting a new kind of change, update this file too.**
- `src/overlay/`: browser UI inside a Shadow DOM host `<edit-mode-root>`.
  - `main.js` (~1360 lines):
    - state, glass pointer handling (select, drag-move, tools, Shift-click multi), keyboard, pill and dialogs, text editing
    - copy/paste/duplicate, group, auto layout, the rAF render loop (frames, hover, spacing hints, ⌥ measure)
    - selection levels: `pageRoot()` (skips single-child wrappers like `#root`), `hit(x, y, deep)` (layer at the selection's level; `deep` = ⌘), `deepHit`, `hitInside` (double-click drill)
    - key functions: `hit`, `select`, `dropAt`, `startDrag`/`finishDrag`, `finishDraw`, `rhythm`, `insertCopies`, `toggleMulti`, `autoLayoutSelection`, `startText`/`stopText`, `guardWhileEditing`, `render`, `drawFrames`, `drawMeasure`
  - `canvas.js`: zoom and pan. While edit mode is on, `<body>` gets `translate(tx, ty) scale(z)` with origin `0 0`. `<html>` gets `overflow: hidden` and the canvas gray, and the window never scrolls. Body margin becomes padding so the page background covers it. Every inline style it sets is saved and restored on `exit()`, which also scrolls the window back to the panned spot. `apply()` clamps so at least 80px of the page stays on screen. `fit()` and `toSelection()` use `area()`, the space between the panels and above the toolbar; it always reserves the properties panel.
  - **Zoom rule:** `getBoundingClientRect` gives screen pixels. Use it only to draw on screen or to compare against the pointer. For any size or distance that's shown to the user or written as CSS, use `box(el)` from `util.js` (CSS px), or divide by `view.z`. Going the other way, from CSS values to screen (as `spacingRects` does), multiply by `view.z`.
  - `layers.js`: the Layers panel (left). It rebuilds rows from the DOM (MutationObserver + `changes` onChange, throttled to the render loop through `sync()`), so there's no parallel model. Row drag uses `changes.move`. The eye button uses `changes.set(el, 'one', 'display', 'none')`. Lock lives in `state.locked` (a WeakSet, overlay-only), and `deepHit` skips locked elements. `rowFor(el)` exists for tests. The open/closed state is in `localStorage['edit-mode:layers']`.
  - `panel.js` (~1260 lines): properties panel, built from `section`/`row`/`numField`/`segField`/`splitToggle`/`listPop`.
    - `numField` supports `prefix`, `suffix`, `picks`, `modes`, `min`/`max`, `hint`, scrubbing and math.
    - Sizing helpers: `sizeMode`, `setSizing` (Fixed/Hug/Fill).
    - `autoLayout(el, {wrapper})` turns an element into auto layout.
  - `changes.js`: every edit is an inline `!important` style, a DOM move/insert, or text. It keeps a snapshot-based undo/redo stack:
    - `batch(group, fn)` merges several edits into one undo step
    - each step stores the selection
    - `list()` produces what Push sends
  - `styles.js`: CSS variables (`--accent #0d99ff`, `--glass`, `--text`, `--muted`, `--dim`).
  - `tokens.js`: colors, sizes and CSS variables already on the page, offered as quick picks.
  - `icons.js`: Lucide paths plus the `icon()`, `ICON` and `KEY` glyphs.
  - `util.js`: helpers.

## Figma → CSS mapping in use

| Figma | CSS |
|---|---|
| Auto layout | flex |
| Hug | `fit-content` |
| Fill | `flex-grow: 1` / `align-self: stretch` / `width: auto` or `100%` |
| Gap "Auto" | `justify-content: space-between` (the main-axis alignment buttons no longer offer "between") |
| Stroke inside / outside | `border` / `outline` |
| Group | wrapper div |

New elements copy the parent's spacing rhythm (`rhythm()`).

## Gotchas already hit

- Keyboard shortcuts must only bail out when the user is *typing* (input or contenteditable), not merely when focus is on a panel button.
- Esc closes `.dialog` elements only; toasts must never swallow it.
- Panel number fields commit on blur only if the value changed (`focusValue`), otherwise they create phantom changes.
- Inside contenteditable buttons, spaces need `execCommand('insertText')`.
- `sizeMode` reads inline styles first; measuring alone misreads Fixed as Fill.
