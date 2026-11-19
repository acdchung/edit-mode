# Roadmap

The plan agreed with the user on 2026-11-18: build items 1–9 in order, with QA at every step on the test copy (see CLAUDE.md, "Working rules"). After each item:

1. Run the item's own checks.
2. Rerun the regression suites in `tests/` (`brutal1.mjs`, `brutal2.mjs`, and every earlier `itemN.mjs`).
3. Update README.md (shortcuts and features), `src/apply-edits.md` (if Push sees a new kind of change) and this file.
4. Commit a git checkpoint.
5. Report to the user in plain language.

Figma is the reference for every behavior. Where a live web page can't work like Figma, pick the closest behavior that feels natural and say so.

## Next up

### 2. Layers panel
- Left-side panel, glass style like the properties panel.
- Shows the DOM tree under `#root`, with names from `describe()`.
- Each row:
  - click selects; Shift and ⌘ add to the selection
  - hovering highlights the element on the canvas
  - expand/collapse
  - drag to reorder or reparent, using the same `changes.move` path as dragging on the canvas
  - eye and lock toggles (see 9)
- Auto-expands to the selection and scrolls it into view.
- Toggle with a toolbar button. Hidden by ⌘\ along with the rest of the UI.
- It must stay correct after undo/redo and inserts. Rebuild from the DOM on change; don't keep a parallel model.

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
| ⇧⌘H | Hide/show. Previews as `display: none` with the element still selectable from Layers; tell Push what this means |
| ⇧⌘L | Lock: can't be selected on the canvas. Overlay-only state, not pushed |
| ⌘[ / ⌘] | Send backward / bring forward. Moves earlier or later among siblings, or changes z-index when the element is absolute |
| ⇧⌘G | Ungroup: unwrap the frame, keeping its children where they were |
| ⌥⇧A | Remove auto layout |

## Later / maybe
- ⌥-resize from the center.
- Snapping and smart guides while dragging or resizing absolute elements.
- Zoom and pan. Probably not worth it on a live page.

## Done (highlights)
- 2026-11-18, item 1: Figma-style selection. Click picks the layer at the current level (top-level sections when nothing is selected, else siblings of the selection, walking up when you click outside); double-click drills one level and edits selected text; ⌘-click and ⌘-hover go deepest; Esc stops at the page's top frame and then deselects. Clicking the empty page deselects rather than selecting the page frame (unlike a Figma artboard), because the page fills the whole viewport.
- Overlay, data-src tagging, properties panel, Push via the Claude CLI with snapshot + Undo.
- Select / drag-to-move (reorder or reparent), delete, text editing, ⌘Z/⌘⇧Z, scope "This one" / "All like this".
- Tools: Rectangle, Ellipse, Text; Shift draws perfect shapes; new elements follow the parent's spacing.
- Copy, paste, cut, ⌘D, ⌥-drag duplicate.
- Group (⌘G), auto layout (⇧A) with Fixed/Hug/Fill, gap "Auto" (space-between), per-side padding, per-corner radius.
- Multi-select across containers with frames on each selected element. Tab/Shift-Tab between siblings, ⌘A, ⌘\ hides the UI, the panel moves off the selection, ⌥ measurement.
- Gradient fills, strokes inside/outside, shadows.
- 2026-11-18: removed "Space between" from the auto-layout alignment buttons. The Gap field's "Auto" already covers it.
