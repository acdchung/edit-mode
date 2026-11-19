# Edit Mode

Figma-style visual editing layer for React + Vite projects (plain CSS). Edit the running page, click **Push**, and Claude Code rewrites your source to match. Dev server only — nothing ships in `vite build`.

## Add to a project

```sh
npm install --save-dev ~/edit-mode
```

```js
// vite.config.js
import editMode from 'edit-mode';

export default defineConfig({
  plugins: [editMode(), react()],
});
```

Run `npm run dev` as usual. Push needs the Claude Code CLI (`claude`) to be installed and logged in.

## Use

| Key / action | What it does |
| --- | --- |
| Pill switch, or ⌥E | Edit mode on/off |
| Click | Select the outermost layer at the current level, like Figma: top-level sections first, then siblings of whatever is selected. Clicking inside the selection keeps it |
| Double-click | Go one level deeper. On selected text, edit it |
| ⌘-click | Select the deepest element directly (hold ⌘ to preview it on hover) |
| Esc / Enter | Select parent / first child (Enter on text starts editing it). Esc past the top level deselects |
| ⌫ / Delete | Delete element |
| Arrows / Shift + arrows | Nudge 1px / 10px (margin); inside auto layout, move earlier/later. With several selected, all of them (as a block in auto layout) |
| ⌘Z / ⌘⇧Z | Undo / redo |
| ⌘↵ | Push |
| Drag an element | Move it: reorder, or drop into another container. With several selected, drag any of them to move them all, in page order |
| V / R / O / T | Select, Rectangle, Ellipse, Text tools (toolbar above the pill). Hold Shift while drawing for a square or circle |
| Shift-click | Add to / remove from the selection, at the same depth as what's selected (title selected → Shift-click another card's title adds that title). Holding Shift previews it. ⇧⌘-click adds exactly the deepest element |
| Tab / Shift-Tab | Next / previous sibling |
| ⌘A | Select all siblings |
| Hold ⌥ | Measure distances to the hovered element (or to the parent) |
| ⌥-drag | Duplicate and move the copy (or copies) |
| ⌥1, or the Layers button in the toolbar | Show / hide the Layers panel |
| ⌘+ / ⌘− / ⌘0 | Zoom in / out / to 100% (or use the % menu in the toolbar) |
| ⇧1 / ⇧2 / ⇧0 | Zoom to fit the page between the panels / to the selection / to 100% |
| Scroll, Shift-scroll | Pan the page (inside a scrollable box, scrolls that box) |
| ⌘-scroll or pinch | Zoom around the pointer |
| Space-drag, or middle-drag | Pan |
| ⌘\ | Hide / show the Edit Mode UI |
| ⌘C / ⌘V / ⌘X | Copy, paste (after the selection, or into an empty box you added), cut |
| ⌘D | Duplicate |
| ⌘G | Group the selection |
| ⇧A | Auto layout: wraps a multi-selection or a single text/shape in a hugging frame; turns a container into auto layout |
| Drag a handle | Resize (hold Shift to keep proportions). With several selected, the handles are on the frame around all of them, and each element's size scales by the same amount |
| In a field: type, ↑/↓, or drag its label | Change a value (accepts %, and math like `8*2`) |

**Panel:** Layout (size, gap, padding, margin), Appearance (opacity, roundness), Text, Fill, Stroke (inside = border, outside = outline), Effects (shadow). Fill shows solid colors and gradients (angle and stops) or images. Empty fill/stroke/effects show as **+**. Colors, sizes and CSS variables already on the page are offered as quick picks.

**Several selected:** the panel shows Group / Auto layout / Delete, then the properties they share. Text, Gap and Auto layout show when every selected element has them; Fill, Stroke and Effects when any of them does. A field reads **Mixed** when the values differ. Typing a value sets it on all of them; ↑/↓ or dragging the label on a Mixed field shifts each one's own value by the same amount. Every edit is one ⌘Z.

**Layers panel (left):** the page's element tree, top to bottom in page order. Click a row to select, ⌘-click to add or remove, Shift-click for a range. Hovering a row highlights the element on the page, and the tree opens to whatever you select on the canvas. Drag rows to reorder or to move into another frame (drop on the middle of a frame's row). The arrow opens or closes a row (⌥-click opens everything inside). On hover, each row shows **eye** (hide: a change that Push applies as CSS) and **lock** (can't be clicked on the page; only for this session, not pushed). Open or closed is remembered.

**Canvas:** while editing, the page sits on a gray canvas like a Figma frame, and you can zoom and pan it so nothing is stuck under a panel. Sizes, fields and measurements always show real CSS pixels, whatever the zoom. Turning edit mode off puts the page back as it was. One limit: while editing, sticky and fixed headers scroll with the page.

**Width / height:** Fixed, Hug contents or Fill container (menu in the W and H fields), like Figma's resizing. The **link** button in the Layout title row constrains proportions: setting W also sets H (and the reverse), and resize handles keep the ratio. While it's on, the W and H fields are outlined and joined in blue. It's per element and only for this session, not pushed.

**Gap:** a plain number field. Type `auto` to push children to the ends of the frame (Figma's auto spacing).

**This one / All like this:** for repeated elements. Defaults to This one. "All like this" covers a *family*:
- every element rendered from the same line of code (a card rendered 3 times = 3)
- plus any copies you make of them with ⌘D, paste or ⌥-drag, including the elements inside those copies
- a shape or text you add is its own family, and its copies join it

Push styles a family through one shared CSS rule, so the copies match the originals once they're in the code.

**Push:** shows the list of changes; **Proceed** snapshots your source, runs Claude in the background to apply them, then reloads the page. **Undo** (in the pill afterwards) restores the files Claude changed and brings your edits back so you can adjust and push again.

While edit mode is on (and while Claude works), hot reload is paused so file saves can't wipe your edits.

## Docs

- `CLAUDE.md`: architecture, conventions and testing rules (for Claude sessions)
- `ROADMAP.md`: what's next, in order

## Files

- `src/plugin.js`: the Vite plugin (tagging, overlay injection, hot-reload pause, push/undo endpoints)
- `src/tag-source.js`: adds `data-src="file:line:col"` to every HTML-style JSX tag
- `src/runner.js`: writes the handoff batch, runs Claude, snapshots and undo
- `src/apply-edits.md`: the instructions Claude follows
- `src/overlay/`: the in-browser UI (Shadow DOM)
  - `main.js`: pill, dialogs, selection, keyboard, text editing
  - `panel.js`: Selection card and properties panel
  - `layers.js`: Layers panel
  - `canvas.js`: zoom and pan
  - `changes.js`: every edit, with undo/redo
  - `tokens.js`: colors, sizes and variables used on the page
- `tests/`: Playwright QA scripts (run against a copy of sample-app on port 5390)
- `sample-app/`: test project (`cd sample-app && npm run dev`)

Handoff batches are written to `.editmode/` in your project (git-ignored automatically).
