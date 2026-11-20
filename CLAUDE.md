# Edit Mode: notes for Claude

Read this file first, then DESIGN.md (the user's design rules), ROADMAP.md (what's next) and README.md (user-facing features and shortcuts).

## Where things stand (2026-11-20)

- Done: roadmap items 1 (Figma-style selection), 2 (Layers panel) and 3 (multi-element move/resize/panel), canvas zoom/pan, "All like this" families, same-depth Shift-click, the Tight panel density, a motion/press polish pass, Gap as a plain input, constrain proportions, and a QA + UX audit on the Payloom page (sizing reads, stroke sides, resizable Layers, "Page" row, line height as written, panels that never move on their own). See ROADMAP.md › Done.
- Done 2026-11-20: roadmap item 4, padding and gap handles on the canvas (`spacing.js`, `tests/item4.mjs`, which runs on both copies: 5390 and 5391).
- **Next: roadmap item 5, absolute position inside auto layout.** ROADMAP.md has the plan.
- **Paused: `demo-app/`**, the Payloom landing page (plan and status in `demo-app/OUTLINE.md`). Step 1 is done and the user approved the look (colors, three-line headline, Inter). Step 2 (sections 4–11) comes when the user asks.
- **Demo app:** the user runs it on port **5290** (`npm run dev` in `demo-app/`). Test it on a scratchpad copy on **5391**: copy `index.html package.json vite.config.js src` into `<scratchpad>/demo-copy`, symlink `node_modules` to `demo-app/node_modules`, and in the copy's `vite.config.js` add `fs: { allow: ['.', '<abs path>/demo-app/node_modules'] }` to `server` (otherwise the bundled font 403s through the symlink). Product shots follow the stageshow skill's craft rules (real words only on the story; only filler bleeds off an edge; a phone layout that's redesigned, not squeezed).
- All suites pass (276 checks including item4's 36; brutal3 not rerun for item 4, counted once each; some suites print every line twice, so count unique lines). The last commit is pushed to GitHub.
- **Starting a session:** the scratchpad changes every session, so the test copy usually needs recreating:
  1. copy the app: `cp -R ~/edit-mode/sample-app <scratchpad>/sample-copy`
  2. in the copy, delete `.editmode` and replace `node_modules` with a symlink to `~/edit-mode/sample-app/node_modules`
  3. run `npx vite --port 5390 --strictPort` in it, in the background
  4. recreate the demo copy too (see "Demo app" above) and run it on 5391 in the background
  5. run the suites to confirm a clean baseline (with `nice -n 15`; see "keep it light" under Working rules)

## Who and what

- The user is a designer, not an engineer, so explain anything they need to run. They want Figma's **canvas** behavior on a live localhost page. Components and variables are out of scope.
- Edit Mode is a Vite plugin (React + plain CSS). The user edits the running page, edits are batched in the browser, and **Push** writes a batch to `.editmode/` and runs the `claude` CLI to rewrite the source. **Undo** restores the files that pass changed.
- Don't add Edit Mode to the user's own projects until they ask. `sample-app/` is the test bed.

## Working rules

- **After each roadmap item (or batch of fixes):**
  - commit a checkpoint and push to the private GitHub repo (https://github.com/acdchung/edit-mode)
  - give the user a detailed, plain-language update covering:
    - what changed and how to use it
    - where it differs from Figma, and why
    - what was tested, with the results
    - what was committed

- **Never run automated tests against the user's server** (sample-app on port 5288, which they use live, including real pushes). Test on a copy:
  - scratchpad `sample-copy/`: a copy of sample-app with `node_modules` symlinked, running on **port 5390** with its own `.editmode/`
  - start it with `npx vite --port 5390 --strictPort`
  - drive it with `playwright-core` + system Chrome (`chromium.launch({ channel: 'chrome' })`)
  - if the scratchpad was wiped, recreate the copy: `cp -R sample-app <dir>/sample-copy`, delete its `.editmode`, and symlink `node_modules`
- **Git:** branch `main`, pushed to the private GitHub repo after every checkpoint. Commit after each roadmap item passes QA (and before risky changes). Never commit `node_modules`, `.editmode/` or `dist/` (see `.gitignore`).
- **Tests live in `tests/`:** `demo1.mjs`, `demo2.mjs` and `brutal3.mjs` run on the demo-app copy (port 5391); the rest on the sample-app copy (5390). `brutal3.mjs` is a random-edit run: **keep it light** (default 15 rounds, reduced motion; run with `nice`, and ask the user before raising ITER: a 120-round run froze their laptop). `item4.mjs` uses both copies. Also `item1.mjs`, `item2.mjs`, `item3.mjs`, `zoom.mjs`, `polish1.mjs`, `brutal1.mjs` and `brutal2.mjs`. `item2.mjs` and `polish1.mjs` run with the Layers panel open; the others start with it closed, through `addInitScript` setting `localStorage['edit-mode:layers'] = '0'`. Otherwise the panels cover the spots those tests click on. Run them with `cd tests && node <file>` while the copy runs on 5390 (`npm install` in `tests/` if `node_modules` is missing). Add an `itemN.mjs` for each roadmap item.
- Use **mouse clicks** in tests (`page.mouse.click(x, y)`), not `locator.click()`: the glass layer intercepts pointer events.
- A plain click selects at the current level (Figma). To select a specific nested element in a test, hold Meta while clicking (`brutal*.mjs`'s `p.tap` does this); `tests/item1.mjs` covers the level rules.
- In the browser console, `window.__editMode` gives `{ state, changes, layers }`.
- QA every feature as it lands. Check:
  - the behavior itself
  - one ⌘Z restores the DOM exactly (compare `#root` innerHTML, ignoring `style=""`)
  - no page errors
  - a screenshot, read back, for anything visual
- **Before building or changing UI, read DESIGN.md.** It holds the user's taste: surfaces, type, spacing, interaction and motion rules.

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
  - `main.js` (~1600 lines):
    - state, glass pointer handling (select, drag-move, tools, Shift-click multi), keyboard, pill and dialogs, text editing
    - copy/paste/duplicate, group, auto layout, the rAF render loop (frames, hover, spacing hints, ⌥ measure)
    - selection levels: `pageRoot()` (skips single-child wrappers like `#root`), `hit(x, y, deep)` (layer at the selection's level; `deep` = ⌘), `deepHit`, `hitInside` (double-click drill)
    - multi-selection: the main `.frame` (class `group`) goes around `unionRect` of all selected elements and its handles resize them all; each element also gets a passive frame in `.multis`. `startDrag(els, press)` drags them all; `dropAt(x, y, el, moving)` ignores everything moving
    - key functions: `hit`, `select`, `dropAt`, `startDrag`/`finishDrag`, `finishDraw`, `rhythm`, `insertCopies`, `toggleMulti`, `autoLayoutSelection`, `startText`/`stopText`, `guardWhileEditing`, `render`, `drawFrames`, `drawMeasure`
  - `canvas.js`: zoom and pan. While edit mode is on, `<body>` gets `translate(tx, ty) scale(z)` with origin `0 0`. `<html>` gets `overflow: hidden` and the canvas gray, and the window never scrolls. Body margin becomes padding so the page background covers it. Every inline style it sets is saved and restored on `exit()`, which also scrolls the window back to the panned spot. `apply()` clamps so at least 80px of the page stays on screen. `fit()` and `toSelection()` use `area()`, the space between the panels and above the toolbar; it always reserves the properties panel.
  - **Zoom rule:** `getBoundingClientRect` gives screen pixels. Use it only to draw on screen or to compare against the pointer. For any size or distance that's shown to the user or written as CSS, use `box(el)` from `util.js` (CSS px), or divide by `view.z`. Going the other way, from CSS values to screen (as `spacingRects` does), multiply by `view.z`.
  - `layers.js`: the Layers panel (left). It rebuilds rows from the DOM, so there's no parallel model. A MutationObserver marks it dirty, and the render loop's `sync()` rebuilds. Inline-style mutations only count when they change a row's hidden state or layout icon, so resizing doesn't rebuild every frame. Row drag uses `changes.move`. The eye button uses `changes.set(el, 'one', 'display', 'none')`. Lock lives in `state.locked` (a WeakSet, overlay-only), and `deepHit` skips locked elements. `rowFor(el)` exists for tests. Shared tag list: `NOT_LAYER` in `util.js`. The open/closed state is in `localStorage['edit-mode:layers']`. The page root's row is named "Page". The right edge (`.lresize`) drags to resize (200–520px, double-click resets to 240); the width is in `localStorage['edit-mode:layers-width']`, and `area()` in main.js reads the live width.
  - `panel.js` (~1260 lines): properties panel, built from `section`/`row`/`numField`/`segField`/`splitToggle`/`listPop`.
    - `numField` supports `prefix`, `suffix`, `picks`, `modes`, `min`/`max`, `hint`, scrubbing and math.
    - Sizing helpers: `sizeMode`, `setSizing` (Fixed/Hug/Fill).
    - `autoLayout(el, {wrapper})` turns an element into auto layout.
    - Constrain proportions: a link button in the Layout title row (`.sh-acts`). The ratio is kept in `state.ratio` (WeakMap, overlay-only). `writeSize` keeps W/H in step, and the resize handles in `main.js` treat it like Shift. When it's on, the W/H row gets `.linked`.
    - Letter prefixes (W, H, X…) get `.pre.txt` (20px); icon prefixes keep 26px.
    - Multi-selection: `act` runs each edit once per selected element through `each()`, with `withEl(el, fn)` pointing `sel()` (and scope "one") at that element, so writers work unchanged. Fields read through `common(read)`, which returns `MIXED` when values differ. `refresh` is skipped while `busy` (inside `each`). Anything that must run once, not per element, goes through `changes.batch` directly (see the `autoLayout` export). `sizeOf(el, scope, axis, px)` is what the resize handles call.
  - `spacing.js`: padding and gap handles (item 4). `createSpacing({ layer, label, changes, state, focusGap, drill })`; main.js's `render()` calls `spacing.render(sel, show)` every frame (show = one flex frame selected, pointer over it, nothing else in progress; `cursor` is tracked on window because the glass loses the pointer over the zones). Zones are recomputed from the live layout each frame while shown. Writes go through `changes.set` in one `changes.batch` per drag; the panel's `focusGap()` is the click target.
  - `changes.js`: every edit is an inline `!important` style, a DOM move/insert, or text. It keeps a snapshot-based undo/redo stack:
    - `batch(group, fn)` merges several edits into one undo step
    - each step stores the selection
    - `list()` produces what Push sends
  - `styles.js`: CSS variables (`--accent #0d99ff`, `--glass`, `--text`, `--muted`, `--dim`).
  - `tokens.js`: colors, CSS variables, font sizes, radii and fonts already on the page, offered as quick picks (spacing fields have none, at the user's request).
  - `icons.js`: Lucide paths plus the `icon()`, `ICON` and `KEY` glyphs.
  - `util.js`: helpers.

## "All like this" families

- `family(el)` / `familyKey(el)` in `util.js`. The key is the element's `data-src`, else its `data-em-copy-of`, else `new #N` for an element you added. `cloneFor` sets `data-em-copy-of` (keeping the first original's key on a copy of a copy).
- `changes.targets(el, 'all')` uses the family, and Push entries carry `family`.
- `sameSource` stays strict (code instances only) for `index`/`count` and "2 of 3".

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

## Keeping it lean

- Delete what isn't used: icons, helpers, CSS rules, API members. Don't keep things "for later" (git has them).
- Work that runs every frame (`render`, `layers.sync`) must not scan the DOM or rebuild lists unless something changed.

## Gotchas already hit

- Keyboard shortcuts must only bail out when the user is *typing* (input or contenteditable), not merely when focus is on a panel button.
- Esc closes `.dialog` elements only; toasts must never swallow it.
- Panel number fields commit on blur only if the value changed (`focusValue`), otherwise they create phantom changes.
- Inside contenteditable buttons, spaces need `execCommand('insertText')`.
- `sizeMode` reads inline styles first; measuring alone misreads Fixed as Fill. Fill is detected by `probe()`: grow the parent for one measurement (lifting its max size) and see if the element follows. Comparing sizes misread a fixed-height button whose row is only as tall as it.
- Line height reads through `computedStyleMap()` so a unitless multiplier (1.35) shows as written; `getComputedStyle` always gives pixels.
- In tests, Edit Mode stays on across a reload (sessionStorage), so don't press ⌥E again after `reload()`. Points near the left edge can land under the Layers panel: click clear of it.
- `changes.set` puts the original inline style back when an edit lands on the starting value (no stray `!important` copies), except for size properties (`SIZE`), where Hug → Fixed at the same pixel size is still a real change.
- A focused panel field that gets refilled because the selection changed must not commit on blur: `refreshField` resets `focusValue` when it refills the focused input. Before that, clicking a gap (which focuses Gap) and then selecting something else wrote the new element's gap back onto it as an edit.
