# Roadmap

The plan agreed with the user on 2026-11-18: build items 1–9 in order, with QA at every step on the test copy (see CLAUDE.md, "Working rules"). After each item:

1. Run the item's own checks.
2. Rerun the regression suites in `tests/` (`brutal1.mjs`, `brutal2.mjs`, and every earlier `itemN.mjs`).
3. Update README.md (shortcuts and features), `src/apply-edits.md` (if Push sees a new kind of change) and this file.
4. Commit a git checkpoint.
5. Report to the user in plain language.

Figma is the reference for every behavior. Where a live web page can't work like Figma, pick the closest behavior that feels natural and say so.

## Next up

### Phase A: any page, seen the Figma way (agreed with the user, 2026-11-20)
Edit Mode should work on any page structure, not only code shaped like Figma, because the user may open-source it and other people's pages (and agents) won't follow our rules. The code stays as developers wrote it. Edit Mode shows it through a Figma lens, and Push turns structural edits into code that fits the project.

- **Two kinds of edits.** Style edits (padding, gap, font, color, size, radius…) stay exact, as today. Structural edits (move, group, wrap or unwrap, delete a container) are recorded as intent ("put the nav after the hero"), and Claude picks the cleanest way to do that in this codebase.
- **A1. Pass-through layers.** Done 2026-11-20 (`util.js` › `passThrough`/`visualParent`/`visualKids`/`friendlyName`, `tests/a1.mjs`). Final rule: skip a plain wrapper around one thing, `display: contents`, and `<main>`; a wrapper around several things is a real group and stays. It must also have no fill, stroke, shadow, padding, clipping or transform, be static, hold no text, and be exactly as big as its contents. Friendly layer names are included. Original plan: Wrappers you can't see (no fill, stroke, shadow or padding of their own, adding no layout you'd notice: `<main>`, `#root`, fragments, `display: contents`) are skipped in Layers and on the canvas, so their children show as siblings of the frame around them. On Payloom, Nav, Hero and Logos become siblings under Page. A Layers toggle, "Show all layers", shows the raw tree for developers.
- **A2. Moves across hidden containers.** Dragging in the Figma view moves the element in the page right away; the Push entry says where it now sits visually (its neighbours in the Figma view, not just in the code). `apply-edits.md` tells Claude it may move the JSX across components or files, or move a neighbour instead, whichever is cleanest. Test case: drag the Payloom nav below the hero.
- **A3. Honest readings.** When a layout doesn't map to Figma, say so instead of guessing: "Pinned" for sticky/fixed (with what that means), grid cells, a child pushed over by an auto margin, a height that comes from a CSS variable. Re-check the Hug/Fill reads the user found confusing on Payloom.
- Keep `demo-app/` (Payloom) as written by a typical team: it's the realistic test page.

### Phase B: design page
A blank canvas beside the app for designing new components, plus pasting copies of real elements (each copy keeps its look). Push adds the result as a new section next to the original, written in the project's own conventions; the user deletes the old section by hand. Plan it together with the full-canvas idea under "Later".

### Then: roadmap items 5–9 below (unchanged).

### 5. Absolute position inside auto layout (Figma: "Ignore auto layout")
- A toggle in Layout for a child of an auto-layout frame. It sets `position: absolute`, and `position: relative` on the parent.
- Then show X/Y fields (top/left) and allow dragging the element freely inside its parent.
- Constraints (left/right/center…) are optional, later.

### 6. Text
- While editing:
  - Enter inserts a line break (`<br>`); Esc or clicking outside finishes
  - ⌘Enter also finishes
- Auto width / auto height / fixed size modes, mapped to `white-space: nowrap` + `fit-content`, `width` + wrapping, or a fixed width and height.
- Decoration (underline, strikethrough), case (`text-transform`) and paragraph spacing (margin between paragraphs), in the Text section.
- Typography fields that may be missing: alignment, vertical trim. Check what's already there first.

### 7. Min/max size and clip content
- Width and height menus: "Add min width", "Add max width" (and the same for height). Each one shows an extra field.
- An "Clip content" checkbox on frames sets `overflow: hidden`.

### 8. Effects, fills and strokes
- Effects: layer blur (`filter: blur`) and background blur (`backdrop-filter`).
- Several shadows stacked in one `box-shadow`.
- Several fills stacked in `background-image` layers.
- Image fill: pick a file. Push needs a strategy, such as copying the file into `src/assets` or `public/`. Update `apply-edits.md`.
- Strokes:
  - per-side: done early (2026-11-20, the sides menu next to Stroke weight)
  - dashed or dotted (`border-style`)
- Rotation: a field, plus a rotate cursor just outside a corner handle (`transform: rotate`).

### 9. Figma shortcuts

| Shortcut | Action |
|---|---|
| ⌥⌘C / ⌥⌘V | Copy / paste style properties (fill, stroke, effects, radius, text style) |
| ⇧⌘H | Hide/show. The Layers eye already does this (`toggleHidden` in `layers.js`, and `apply-edits.md` covers it); only the shortcut is left |
| ⇧⌘L | Lock. Already in the Layers panel (`toggleLock`); only the shortcut is left |
| ⌘[ / ⌘] | Send backward / bring forward. Moves earlier or later among siblings, or changes z-index when the element is absolute |
| ⇧⌘G | Ungroup: unwrap the frame, keeping its children where they were |
| ⌥⇧A | Remove auto layout |

## Later (agreed with the user, 2026-11-18)

### Breakpoint frames: a full canvas (option C)
- Edit Mode becomes its own canvas page, and the app runs inside one or more iframes shown as frames, e.g. Desktop 1440, Tablet 768 and Mobile 375 side by side. Each frame is a real copy of the page with its own responsive layout.
- Reuse the zoom and pan from `canvas.js`. The overlay moves to the parent page and reaches into the frames (same origin), so selection, panels and Push need to know which frame an element is in.
- Big change: plan it as its own phase, after items 3–9.

## Later / maybe
- Movable panels: a grabber to place the properties panel and Layers wherever you like, remembered per browser (the user's idea, 2026-11-19). They still never move on their own. (Layers can already be resized.)
- Payloom demo page, step 2 (sections 4–11): when the user asks. Plan in `demo-app/OUTLINE.md`.
- ⌥-resize from the center.
- Snapping and smart guides while dragging or resizing absolute elements.

## Done (highlights)
- 2026-11-20, item 4: padding and gap handles on the canvas (`spacing.js`, `tests/item4.mjs`). With one auto-layout frame selected and the pointer over it: a purple bar per padding side and per main-axis gap; hover fills the zone and shows the value; drag changes it (Shift = steps of 8, ⌥ = opposite padding side too; one undo). Click a gap focuses the Gap field. Zero padding gets a 10px grab strip whose middle clears the frame's edge handles. Dragging an Auto gap sets `justify-content: flex-start` plus a fixed gap. Double-click on a zone still drills in; ⌘ lets clicks through. Follow-ups the same day: a drag whose release got lost no longer leaves handles behind with nothing selected (the drag is tracked on the window and ends when its frame stops being the selection), and the Gap field got back a menu with a single **Auto** choice. Cross-axis gaps in wrapping rows aren't offered (no Figma-style counter-axis spacing field yet).
- 2026-11-20, audit follow-ups (`tests/demo2.mjs`): the Layers panel resizes from its right edge (remembered); the top row is "Page"; line height shows as the code writes it (1.35, not 17.6px).
- 2026-11-20, QA + UX audit on the Payloom page (`tests/brutal3.mjs`, light random runs; `tests/demo1.mjs`): sizing modes now read what the CSS does (fixed-height buttons, grid cells, capped containers); no-op edits no longer leave hidden styles behind; stroke sides (All / one side / Custom per-side weights) for inside strokes. Panels no longer jump sides (2026-11-19).
- 2026-11-19, item 3: several elements at once. Drag any selected element to move them all (page order kept, one undo; ⌥-drag copies them all). One group frame with working handles goes around the selection, and each element keeps its own frame; the group's size label sits a row lower. Group resize scales each element's size by the frame's factor (Shift, or the primary's constrain proportions, keeps proportions). Arrows nudge all of them, or move them as a block inside auto layout. Panel: shared sections with "Mixed"; edits run once per element (`each`/`withEl`/`common` in `panel.js`). Also fixed: typing a hex color into a semi-transparent color dropped its opacity.
- 2026-11-19: W/H look linked while constrain proportions is on; the corner-radius row's split button is 4px from its field (DESIGN.md minimum).
- 2026-11-19: the Gap field is a plain input (no preset list; type `auto` for auto spacing). Constrain proportions is a link button in the Layout title row (`state.ratio`, overlay-only); with it on, W/H edits and resize handles keep the ratio. Letter prefixes (W, H) use a narrower slot so values like 1327.5 fit beside Hug/Fill.
- 2026-11-19, motion and press polish (`/emil-design-eng` review): panels, toolbar and Layers appear instantly; one strong ease-out; press feedback on buttons; menus grow from their trigger; drop line and target snap to the pointer; missing focus rings added; reduced-motion coverage completed.
- 2026-11-19, panel density: the "Tight" direction, chosen with /prototype over "Grouped" and "Airy". The panel stays 252px with 28px fields, on a strict 8px rhythm (row and section spacing), and row actions (eye, ×) get fixed 24×28 slots.
- 2026-11-18, fixes before item 3:
  - "All like this" families, so copies you make join their originals
  - Shift-click adds at the same depth as the selection, with a Shift hover preview; ⇧⌘-click adds the deepest element
  - Layers opens down to every selected element
  - "All like this" outlines are solid, like the selection
  - stuck outlines: hover now follows the pointer after a pan or zoom, is cleared when the Layers panel rebuilds, and text editing ends if the page replaces the element being edited
- 2026-11-18, zoom and pan (option B, added before item 3): `canvas.js`. ⌘+/⌘−/⌘0, ⇧0/⇧1/⇧2, ⌘-scroll and pinch zoom around the pointer; scroll, Space-drag and middle-drag pan; a % menu in the toolbar. Every size, label, field, resize, drawing and measurement stays in CSS px (`box()`, `view.z`). Known limit: fixed and sticky app elements scroll with the page while editing.
- 2026-11-18, Layers fixes: the top row can collapse; hiding the top layer no longer surfaces `#root` as a new parent.
- 2026-11-18, item 2: Layers panel (`layers.js`). Left side, open by default, toggled with ⌥1 or a toolbar button and remembered. Rows: select / ⌘ toggle / Shift range, two-way hover, auto-reveal of the selection, carets (⌥ for all), and drag to reorder, nest into a frame or drop as the first child of an open frame, through `changes.move`. Eye = hide (a pushed change), lock = can't pick on the canvas (overlay-only). Rows are in DOM order, not Figma's reversed z-order, because that's how a page reads. (The properties panel used to jump left over a selection; removed 2026-11-19, see DESIGN.md › Surfaces.)
- 2026-11-18, item 1: Figma-style selection. Click picks the layer at the current level (top-level sections when nothing is selected, else siblings of the selection, walking up when you click outside); double-click drills one level and edits selected text; ⌘-click and ⌘-hover go deepest; Esc stops at the page's top frame and then deselects. Clicking the empty page deselects rather than selecting the page frame (unlike a Figma artboard), because the page fills the whole viewport.
- Overlay, data-src tagging, properties panel, Push via the Claude CLI with snapshot + Undo.
- Select / drag-to-move (reorder or reparent), delete, text editing, ⌘Z/⌘⇧Z, scope "This one" / "All like this".
- Tools: Rectangle, Ellipse, Text; Shift draws perfect shapes; new elements follow the parent's spacing.
- Copy, paste, cut, ⌘D, ⌥-drag duplicate.
- Group (⌘G), auto layout (⇧A) with Fixed/Hug/Fill, gap "Auto" (space-between), per-side padding, per-corner radius.
- Multi-select across containers with frames on each selected element. Tab/Shift-Tab between siblings, ⌘A, ⌘\ hides the UI, ⌥ measurement.
- Gradient fills, strokes inside/outside, shadows.
- 2026-11-18: removed "Space between" from the auto-layout alignment buttons. The Gap field's "Auto" already covers it.
