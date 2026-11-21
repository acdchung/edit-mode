# Edit Mode: notes for Claude

Read this file first, then DESIGN.md (the user's design rules), ROADMAP.md (what's next) and README.md (user-facing features and shortcuts).

## Where things stand (2026-11-21)

- **Done earlier:** roadmap items 1–4 (selection, Layers, multi-select, padding/gap handles), zoom/pan, "All like this", the Tight panel, constrain proportions, a QA + UX audit on Payloom. See ROADMAP.md › Done.
- **Direction (agreed with the user 2026-11-20; ROADMAP.md › "Update" and "The plan from here"):** Edit Mode must work on any codebase (the user may open-source it). **The canvas is the main workspace; the live page is where you check** (quick exact tweaks stay possible there). Copies on the canvas remember their source per node, so Push (B3) can compare each one with its original and turn tweaks into exact edits.
- **Done this session:**
  - Phase A: A1 Figma view (skip invisible wrappers, friendly names, "Show all layers"), A2 live drags only reorder within the visual frame and Push gets the move as intent (one real Push verified), A3 guards (Hug/Fill greyed out with a reason when they'd break; better Hug/Fill reads). Plain-language layout notes were tried and removed at the user's request (DESIGN.md: no explanatory text in the panel).
  - B1: `EDITMODE.md`, the project's conventions for Push, with "Draft one" in the Push dialog (not yet tried with a real drafting run; the user will try it during normal use).
  - Canvas C1 (the board beside the page, saved to `.editmode/canvas.json`), C2 (Frame tool F; **freeform**: no auto layout by default, things stay where drawn, ⇧A converts without a jump), C3 (fresh canvas starts with a page-sized "Page" frame; Duplicate page on Layers' Canvas row; ⌘C on the page → ⌘V onto the canvas, identical look, source remembered).
  - C3 follow-ups: ⌘V into a selected canvas frame lands at the same spot as on the page; the align row (two groups: horizontal and vertical, each with distribute spacing; ⌥A/H/D/W/V/S, ⌃⌥H/V); Clip content (checkbox in Layout; canvas frames start clipped).
  - C4a: drag anything anywhere on the canvas (into/out of frames, auto layout or free; Layers too; look kept; one ⌘Z).
  - C4b–f: X/Y, Ignore auto layout (pin), constraints, ⌘[ / ⌘] layer order, canvas ⌘G groups, ⇧⌘G Ungroup, ⌥⇧A Remove auto layout.
  - C3b: images and gradients in Fill (fill types Solid/Linear/Radial/Angular/Image; gradient bar with draggable stops; image fill Fill/Fit/Tile; image layers by dropping files on the canvas or ⌘V; Push copies images into `public/images/`).
  - C5: QA on the canvas (`tests/c5.mjs`); fixed auto margins in copies, in-flow ⌘G on the canvas, and ⇧A shrinking full-width rows.
- **Next:** B3 (Push compares the canvas with the original). Plan and decisions agreed 2026-11-21 in ROADMAP.md › "B3 plan": B3a comparison → update; B3b–c → one update; Preview in page later. Then roadmap items 5–9 (what's left of them). The user has no specific canvas ideas beyond these; propose, don't wait.
- **Check in with the user after each step** with a detailed plain-language update (memory: edit-mode-updates).
- **Paused: `demo-app/`**, the Payloom landing page (plan and status in `demo-app/OUTLINE.md`). Step 1 is done and the user approved the look (colors, three-line headline, Inter). Step 2 (sections 4–11) comes when the user asks.
- **Demo app:** the user runs it on port **5290** (`npm run dev` in `demo-app/`). Test it on a scratchpad copy on **5391**: copy `index.html package.json vite.config.js src` into `<scratchpad>/demo-copy`, symlink `node_modules` to `demo-app/node_modules`, and in the copy's `vite.config.js` add `fs: { allow: ['.', '<abs path>/demo-app/node_modules'] }` to `server` (otherwise the bundled font 403s through the symlink). Product shots follow the stageshow skill's craft rules (real words only on the story; only filler bleeds off an edge; a phone layout that's redesigned, not squeezed).
- All suites pass (516 checks over 21 suites after C4, including c4a's 23 and c4b's 38; brutal3 not rerun; some suites print every line twice, so count unique lines). Run them **one at a time** (a long chained loop of suites was blocked by the permission checker as too heavy). The last commit is pushed to GitHub.
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
- **Tests live in `tests/`:** `demo1.mjs`, `demo2.mjs` and `brutal3.mjs` run on the demo-app copy (port 5391); the rest on the sample-app copy (5390). `brutal3.mjs` is a random-edit run: **keep it light** (default 15 rounds, reduced motion; run with `nice`, and ask the user before raising ITER: a 120-round run froze their laptop). `item4.mjs` uses both copies; `a1.mjs`, `a2.mjs` and `a3.mjs` run on the demo copy (5391); `c1.mjs` and `c2.mjs` run on the demo copy (5391) and leave its canvas empty; `c3.mjs` needs `COPY=<demo copy dir>` (it deletes the copy's canvas.json to start fresh). `c3b.mjs` needs `COPY=<demo copy dir>`; `c4a.mjs` and `c4b.mjs` need `COPY=<demo copy dir>` (they leave the canvas empty); `c5.mjs` needs `COPY=<demo copy dir>` (QA: pixel comparisons, a rework, two reloads; leaves the canvas empty; `DEBUG=<dir>` saves its screenshots); `pagewidth.mjs` needs `COPY=<sample copy dir>` (the sample app's centered 960px column: page frames must match the whole page, not the column). The sample-app suites assume an empty canvas: when recreating `sample-copy`, write `{"html":""}` to its `.editmode/canvas.json`, or a fresh canvas's starter frame sits where they click; `b1.mjs` is self-contained (its own temp copy of sample-app on 5392, with `fake-claude.mjs` standing in for `claude` via `EDIT_MODE_CLAUDE`, so no real run); `PUSH=1 COPY=<demo copy dir> node a2.mjs` does a real Push (a real Claude run: ask the user first, and restore the copy's `src/App.jsx` afterwards). Also `item1.mjs`, `item2.mjs`, `item3.mjs`, `zoom.mjs`, `polish1.mjs`, `brutal1.mjs` and `brutal2.mjs`. `item2.mjs` and `polish1.mjs` run with the Layers panel open; the others start with it closed, through `addInitScript` setting `localStorage['edit-mode:layers'] = '0'`. Otherwise the panels cover the spots those tests click on. Run them with `cd tests && node <file>` while the copy runs on 5390 (`npm install` in `tests/` if `node_modules` is missing). Add an `itemN.mjs` for each roadmap item.
- Use **mouse clicks** in tests (`page.mouse.click(x, y)`), not `locator.click()`: the glass layer intercepts pointer events.
- A plain click selects at the current level (Figma). To select a specific nested element in a test, hold Meta while clicking (`brutal*.mjs`'s `p.tap` does this); `tests/item1.mjs` covers the level rules.
- In the browser console, `window.__editMode` gives `{ state, changes, layers, panel, select }` (`panel.sizeModeOf(el, axis)` reads Fixed/Hug/Fill; `select(el)` selects).
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
  - middleware: `/@edit-mode/{freeze,status,push,undo,canvas}`, `assets` (POST an image → `.editmode/assets/<sha1-12>.<ext>`; GET `assets/<file>` serves it) plus the overlay files
  - `handleHotUpdate` returns `[]` while frozen (edit mode pings every 2s, 75s window) or while Claude runs; on unfreeze it sends a full reload if updates are pending
- `src/tag-source.js`: adds `data-src="rel/path:line:col"` after every lowercase JSX tag name (@babel/parser + magic-string, with sourcemaps).
- `src/runner.js`:
  - writes `.editmode/batch-<ts>/` (`changes.json`, `context.json`, `snapshot.json`, `result.json`)
  - spawns `claude -p … --permission-mode acceptEdits --allowedTools Read,Edit,Write,Glob,Grep`
  - finds claude on PATH, then `~/.local/bin/claude`, then the VS Code extension binary
  - Undo restores only the files changed in that pass, and only if they're untouched since
  - `state.json` holds the last pass
  - images: `saveAsset`/`readAsset`; at Push, `copyImages` copies every `/@edit-mode/assets/…` file the changes use into `<publicDir>/images/` (Claude can't copy binaries), lists them in `context.json` › `images` (`apply-edits.md` rule 9), and Undo removes the copies (`last.images`)
- `EDITMODE.md` (in the user's project): the team's conventions. `apply-edits.md` rule 0 makes Push read it first and lets it win. `src/draft-conventions.md` is the prompt for drafting one (`runner.draftConventions`: Read/Glob/Grep/Write only, and any file other than EDITMODE.md that changed is put back). `runner.status()` reports `conventions` (exists) and `draft` (last result); `running` is `'draft'` while drafting.
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
  - **Figma view** (`util.js`): `passThrough(el)` decides which wrappers are skipped; `visualParent(el, root)` and `visualKids(n, keep)` walk the tree that way. Selection levels in main.js go through `levelUp`/`siblingsOf`, `deepHit` never returns a pass-through, and Layers' `kidsOf` uses `visualKids`. `layerView.raw` (the "Show all layers" button, `localStorage['edit-mode:layers-raw']`) turns it off. Live drags only reorder within the visual frame (`reorderAt` in main.js, `dropAt` in layers.js); a move's Push entry carries `visual` (neighbours in the Figma view plus an `intent` sentence, from `visualSpot` in changes.js, which gets `pageRoot` from main.js). `dropAt` in main.js is now only for the drawing tools.
  - `design.js`: the design canvas (B2). A `[data-em-canvas]` div appended to `<body>` while Edit Mode is on (so canvas.js zooms and pans it with the page), 160px right of the page; top-level items sit at x/y inside it. Loaded from and saved to `.editmode/canvas.json` via `/@edit-mode/canvas` (GET/PUT; debounced 400ms by a MutationObserver; flushed on unmount and pagehide). `util.js` has `CANVAS_ATTR`, `canvasArea()`, `onCanvas(el)`. main.js: `rootOf(el)` picks the page or the canvas as the root for clicks and levels; `pickable` never returns the canvas area itself; `layerKids` skips it (so `pageRoot()` is unchanged). Canvas edits carry `onCanvas` and `changes.list()` leaves them out of Push. canvas.js takes `extra()` (`area` for the pan limit, `content` for ⇧1). Turning Edit Mode off unmounts (saves) the canvas before discarding page edits. Drawn items carry `data-em-kind` (frame / rectangle / ellipse / text) so names, icons and `canContain` survive reloads (`data-em-new`/`data-em-copy-of` are stripped on load: they're per-session). Tools go through `toolDrop` (the Frame tool only on the canvas). The canvas is freeform (DESIGN.md): drawing onto the canvas or into a frame without auto layout places the item at x/y (`position: absolute`); only auto-layout frames take things into their flow (`flowSpot`). New frames are `position: relative`, no flex. Anything freely placed (`isLoose`: on the canvas and absolute) drags freely (`drag.free`) and arrows nudge `left`/`top`. ⇧A on freely placed children goes through `flowFromPlaced` in panel.js (reads direction, gap and padding from the arrangement, then switches them to flow); a ⇧A wrapper on the canvas gets `data-em-kind="frame"`. `changes.remove` really removes canvas elements (POS snapshot), so undo reinserts them.
  - Canvas copies (C3, design.js): `cloneToCanvas(orig)` clones, moves each node's `data-src` to `data-em-from="file:line:col#index"`, ids to `data-em-id`, and records the root's slot in `data-em-slot`; it snapshots the original's computed styles (sizes skipped, so copies reflow). After insertion, `matchLook` writes inline only the styles that differ, top-down, and gives the root its new place. A fresh canvas (no canvas.json: `readCanvas()` returns `fresh`) starts with a page-sized `Page` frame (`data-em-name`).
  - Fill (C3b, panel.js): Solid = `background-color`; the layer row = `background-image`'s **first** layer (gradient or image; more layers are item 8). `setFillType(type, from)` switches types (from the solid row's color menu tabs, `typeTabs`, shown only when there's no layer; or the layer row's `kindBtn` menu); it picks the image file first (async), then edits every selected element in one batch. Gradient stops: `stopPositions` fills in implicit positions (null if any stop is in px → the bar hides, stops edit by color only); `stopsEdit(edit)` rewrites all stops with explicit %, sorted, and keeps `stopSel` on the edited stop; `writeStops` wraps it in `act` (don't nest `act`: with several selected it would run N² times). The bar's handles (`.gstop`) handle their own Delete/arrow keys; main.js's keydown skips them. `MAX_STOPS` 10.
  - `assets.js`: `uploadImage(file)` (→ url, name, natural size), `pickImage(parent)`, `IMAGE_FIT` (fill/fit/tile CSS), `fitOf(cs)`. Image layers (main.js `addImages`): a div with `data-em-kind="image"`, `data-em-name` (file name), an image fill, at natural size capped at 1000px. ⌘V arms `armPaste` (no preventDefault) and the window `paste` listener takes images from `clipboardData.files`, else falls back to `pasteClipboard` (also after 80ms if no paste event comes). `copySelection` writes the names to the system clipboard so an older image there doesn't win. Window `dragover`/`drop` listeners (while on) always preventDefault for files, so a stray drop can't open the file and lose edits.
  - Canvas moves (C4a, main.js): a drag where every element is on the canvas goes through `drag.canvas`: `lift(els)` (measure all first, then append each to the canvas area, absolute at its screen spot, `pointer-events: none`, look kept raw with `keepLook`; all raw, saved and undone by `unlift`), live left/top while dragging, `canvasDropAt` (deepest element under the pointer that `receives`: the canvas, or a canvas container that isn't a rectangle/ellipse/image/text, has no own text and isn't a pass-through; auto layout → `flowSpot` + an `anchor` child). On drop: `unlift`, then `moveOnCanvas(els, container, { anchor, rects, looks })`, one batch: `changes.move` (skipped when it stays in its free frame: z-order kept), `keepLook` via `changes.set`, then the slot (free: absolute + left/top from the drop rect, margins 0, Fill → px; flow: `position: relative`, insets auto; a static receiving container gets `position: relative`). Layers calls the same `moveOnCanvas` (ctx `canvasReceives`/`moveOnCanvas`; row middle = into, `.lrow.into`). Off-screen or no receiver: nothing moves.
  - `constraints.js` (C4b–d): positions of things placed freely on the canvas. `constraintOf(el, 'h'|'v')` reads the inline style (start/end/both/center/scale = Left/Right/Left and right/Center/Scale); `frameBox(el)` is its box in its frame (CSS px from the frame's inner corner); `placeBox(el, set, {x,y,w,h}, {h,v})` writes position (and size only when given or needed) under a constraint, keeping the element where it is. **Every canvas position write goes through it**: `moveOnCanvas`, `shiftBy` (nudge, align, distribute), resize handles (placed things keep the opposite edge), the panel's X/Y and W/H (`writeSize`), constraint menus. `changes.set` treats left/right/top/bottom/translate like sizes (`PLACE`): a different value is a change even if it measures the same (5% = 20px).
  - Structure (C4c/f, main.js): `placeFreely(els, rects)` (absolute at the given screen rects; parent made relative; Fill → px), `joinFlow`, `ignoreAutoLayout(on)` (the panel's pin, shown when `inAutoLayout`), `removeAutoLayout` (⌥⇧A and the panel's ×; canvas: frame keeps its px size, children placed freely), `canvasGroup` (⌘G on canvas: `data-em-kind="group"`, sized to the union, placed or in the flow; children placed freely inside), `ungroupSelection` (⇧⌘G, canvas only: `moveOnCanvas(kids, parent, { anchor: group })` then remove, one group name so it's one undo), `reorderSelection` (⌘] ⌘[ ⌥⌘] ⌥⌘[ via `changes.move`; also blocks the browser's ⌘[ Back).
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
- `sizeMode` order matters: "follows its container" (grow the parent for one measurement, with the element's own max size lifted) comes before Hug, because wrapped text measures the same either way. The one exception, stretch inside a hugging auto-layout row, checks the parent with `max-content`, not `fit-content` (wrapping text makes fit-content match any width).
- `listPop` items can be `[value, label, reason]`: a reason greys the item out and shows under it. Use it instead of hiding an option that doesn't apply.
- The user's dev servers (5288 sample-app, 5290 demo-app) were restarted by me on 2026-11-20 at their request, detached with `nohup` (logs in that session's scratchpad). If they ask again: find them with `lsof -iTCP:<port> -sTCP:LISTEN`, kill, and restart from `sample-app/` (`npx vite --port 5288 --strictPort`) and `demo-app/` (`npm run dev`). Plugin or runner changes (`src/plugin.js`, `src/runner.js`) need a restart; overlay files don't.
- Undo can put a property back at the end of an inline style, so compare styles order-independently in tests (`c4b.mjs`'s `board()`).
- In the overlay's keydown handler, a focused checkbox isn't "typing" (only text inputs, selects and textareas are), or ⌘Z and other shortcuts stop working after clicking one.
- Checkboxes in the panel (`.checkrow`) are drawn with `appearance: none` and a Lucide check as a background image: `::after` content doesn't render reliably inside inputs.
- Chrome can report an `auto` margin as `0px` through `getComputedStyle` after some re-layouts, while it still renders centered. Copies (design.js `snapshot`) read auto margins through `computedStyleMap()` instead.
- Pixel comparisons in tests: hide `edit-mode-root` for the shot (hover outlines differ), set 100% (⇧0) after Duplicate page (it zooms out), and line things up to 0.02px (`c5.mjs`'s `bringTo`). A piece pasted at a different sub-pixel spot can differ by under 1% of pixels (1/64px layout rounding).
