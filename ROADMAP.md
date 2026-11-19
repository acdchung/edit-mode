# Roadmap

The plan agreed with the user on 2026-11-18: build items 1–9 in order, with QA at every step on the test copy (see CLAUDE.md, "Working rules"). After each item:

1. Run the item's own checks.
2. Rerun the regression suites in `tests/` (`brutal1.mjs`, `brutal2.mjs`, and every earlier `itemN.mjs`).
3. Update README.md (shortcuts and features), `src/apply-edits.md` (if Push sees a new kind of change) and this file.
4. Commit a git checkpoint.
5. Report to the user in plain language.

Figma is the reference for every behavior. Where a live web page can't work like Figma, pick the closest behavior that feels natural and say so.

## Next up

### 3. Move and resize several elements at once
- Dragging any element in a multi-selection moves them all, keeping their relative order, into the drop target.
- One bounding frame around the whole selection, with handles. Resizing scales each element's size proportionally; Shift keeps proportions.
- Arrow keys nudge or reorder all of them.
- Panel: for a multi-selection, show shared fields (fill, radius, opacity, stroke…) with "Mixed" where values differ. An edit applies to every selected element as one undo step.

### 4. Padding and gap handles on the canvas
- When an auto-layout frame is selected, show draggable padding zones (pink/purple, as in Figma) and gap zones between the children.
- Drag to change the value. Hover shows the value. Shift drags snap to steps of 8. ⌥ drags change the opposite sides symmetrically.
- Clicking a gap zone focuses the Gap field.

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
  - per-side (stroke weight split, like padding)
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
- ⌥-resize from the center.
- Snapping and smart guides while dragging or resizing absolute elements.

## Done (highlights)
- 2026-11-18, fixes before item 3:
  - "All like this" families, so copies you make join their originals
  - Shift-click adds at the same depth as the selection, with a Shift hover preview; ⇧⌘-click adds the deepest element
  - Layers opens down to every selected element
  - "All like this" outlines are solid, like the selection
  - stuck outlines: hover now follows the pointer after a pan or zoom, is cleared when the Layers panel rebuilds, and text editing ends if the page replaces the element being edited
- 2026-11-18, zoom and pan (option B, added before item 3): `canvas.js`. ⌘+/⌘−/⌘0, ⇧0/⇧1/⇧2, ⌘-scroll and pinch zoom around the pointer; scroll, Space-drag and middle-drag pan; a % menu in the toolbar. Every size, label, field, resize, drawing and measurement stays in CSS px (`box()`, `view.z`). Known limit: fixed and sticky app elements scroll with the page while editing.
- 2026-11-18, Layers fixes: the top row can collapse; hiding the top layer no longer surfaces `#root` as a new parent.
- 2026-11-18, item 2: Layers panel (`layers.js`). Left side, open by default, toggled with ⌥1 or a toolbar button and remembered. Rows: select / ⌘ toggle / Shift range, two-way hover, auto-reveal of the selection, carets (⌥ for all), and drag to reorder, nest into a frame or drop as the first child of an open frame, through `changes.move`. Eye = hide (a pushed change), lock = can't pick on the canvas (overlay-only). Rows are in DOM order, not Figma's reversed z-order, because that's how a page reads. When the properties panel jumps left, it now sits beside Layers.
- 2026-11-18, item 1: Figma-style selection. Click picks the layer at the current level (top-level sections when nothing is selected, else siblings of the selection, walking up when you click outside); double-click drills one level and edits selected text; ⌘-click and ⌘-hover go deepest; Esc stops at the page's top frame and then deselects. Clicking the empty page deselects rather than selecting the page frame (unlike a Figma artboard), because the page fills the whole viewport.
- Overlay, data-src tagging, properties panel, Push via the Claude CLI with snapshot + Undo.
- Select / drag-to-move (reorder or reparent), delete, text editing, ⌘Z/⌘⇧Z, scope "This one" / "All like this".
- Tools: Rectangle, Ellipse, Text; Shift draws perfect shapes; new elements follow the parent's spacing.
- Copy, paste, cut, ⌘D, ⌥-drag duplicate.
- Group (⌘G), auto layout (⇧A) with Fixed/Hug/Fill, gap "Auto" (space-between), per-side padding, per-corner radius.
- Multi-select across containers with frames on each selected element. Tab/Shift-Tab between siblings, ⌘A, ⌘\ hides the UI, the panel moves off the selection, ⌥ measurement.
- Gradient fills, strokes inside/outside, shadows.
- 2026-11-18: removed "Space between" from the auto-layout alignment buttons. The Gap field's "Auto" already covers it.
