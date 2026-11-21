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
| Drag an element | Reorder it inside the frame it's in, as Layers shows it (the drop line shows where). Letting go outside the frame moves nothing: moving into another frame changes structure, which will be the canvas's job (see ROADMAP). With several selected from the same frame, drag any of them to move them all, in page order. Push applies the move as you saw it ("Put Nav after Hero and before Logos") |
| V / F / R / O / T | Select, Frame (canvas only), Rectangle, Ellipse, Text tools (toolbar above the pill). Hold Shift while drawing for a square or circle |
| Shift-click | Add to / remove from the selection, at the same depth as what's selected (title selected → Shift-click another card's title adds that title). Holding Shift previews it. ⇧⌘-click adds exactly the deepest element |
| Tab / Shift-Tab | Next / previous sibling |
| ⌘A | Select all siblings |
| Hold ⌥ | Measure distances to the hovered element (or to the parent) |
| ⌥A / ⌥H / ⌥D · ⌥W / ⌥V / ⌥S | On the canvas: align left / horizontal centers / right · top / vertical centers / bottom (also the two groups at the top of the panel: horizontal, vertical). One thing aligns to its frame; several align to each other. Not for things inside auto layout (greyed out, with the reason) |
| ⌃⌥H / ⌃⌥V | On the canvas: distribute horizontal / vertical spacing (three or more: equal gaps, the outer two stay put) |
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

**Panel:** Layout (size, gap, padding, margin, and **Clip content** for anything that holds content: hides what sticks out past its edges; canvas frames start clipped, as in Figma). Sizing menus only offer what works: Hug is greyed out, with the reason, when nothing inside takes up space, and Fill when the element is placed by position. Appearance (opacity, roundness), Text, Fill, Stroke (inside = border, outside = outline; the sides button next to the weight picks All, one side, or Custom with a weight per side), Effects (shadow). Line height shows the way the code writes it (a multiplier like 1.35, Auto, or pixels). **Fill** has Figma's types: **Solid, Linear, Radial, Angular and Image**. To turn a solid fill into a gradient or an image, click its swatch and pick a type at the top of the color menu; a gradient or image fill switches type from its own menu (the first button in its row). A new gradient starts as the fill's color fading out, top to bottom. Gradients show a bar with a handle per stop: drag a handle to move its stop, click the bar to add one (in the color between its neighbours), select a handle and press Delete to remove it (a gradient keeps at least two), or nudge it with ←/→ (Shift: 10%). Each stop also has its own row: position (%), color and opacity, and ×. Linear and Angular have an angle field. **Image** asks for a file from your computer and fills the element with it: **Fill** (covers it, cropping the edges), **Fit** (the whole image, letterboxed) or **Tile** (repeats at its own size). Picking Image again replaces the image. This works on the live page and on the canvas. Empty fill/stroke/effects show as **+**. Colors, sizes and CSS variables already on the page are offered as quick picks.

**Several selected:** the panel shows Group / Auto layout / Delete, then the properties they share. Text, Gap and Auto layout show when every selected element has them; Fill, Stroke and Effects when any of them does. A field reads **Mixed** when the values differ. Typing a value sets it on all of them; ↑/↓ or dragging the label on a Mixed field shifts each one's own value by the same amount. Every edit is one ⌘Z.

**Layers panel (left):** the page's element tree, top to bottom in page order. Click a row to select, ⌘-click to add or remove, Shift-click for a range. Hovering a row highlights the element on the page, and the tree opens to whatever you select on the canvas. Drag rows to reorder them among their siblings (just below an open frame's row is its first spot). The arrow opens or closes a row (⌥-click opens everything inside). On hover, each row shows **eye** (hide: a change that Push applies as CSS) and **lock** (can't be clicked on the page; only for this session, not pushed). The top row is the **Page**. Layers are named the way a designer would (`nav-links` shows as "Nav links"; the code isn't changed). Wrappers you can't see are skipped, here and on the canvas: a plain wrapper around a single thing, `display: contents`, and `<main>`, the page's content area. So the page reads like a Figma file (Nav, Hero, Logos side by side under Page). The **Show all layers** button in the panel's header shows the code's own tree, wrappers included. Drag the panel's right edge to make it wider or narrower (double-click the edge to reset). Open or closed, and the width, are remembered.

**Canvas:** while editing, the page sits on a gray canvas like a Figma frame, and you can zoom and pan it so nothing is stuck under a panel. The page's own looping animations (a drifting background, a pulse) slow to a quarter speed while you edit. Sizes, fields and measurements always show real CSS pixels, whatever the zoom. Turning edit mode off puts the page back as it was. One limit: while editing, sticky and fixed headers scroll with the page.

**Width / height:** Fixed, Hug contents or Fill container (menu in the W and H fields), like Figma's resizing. Fill means the element follows its container (Edit Mode checks by growing the container for a moment); something stretched to its grid cell is Fill too. The **link** button in the Layout title row constrains proportions: setting W also sets H (and the reverse), and resize handles keep the ratio. While it's on, the W and H fields are outlined and joined in blue. It's per element and only for this session, not pushed.

**Padding and gap on the canvas:** select an auto-layout frame and point at it. Small purple bars mark each padding side and each gap between children. Hover one to see its value; drag it to change it (Shift snaps to steps of 8, ⌥ changes the opposite padding side too). Click a gap to type a value in the Gap field. Hold ⌘ to click through the bars to what's underneath. A padding of 0 still has a thin strip you can drag open. Dragging an **Auto** gap turns it into a fixed one. Each drag is one ⌘Z.

**Gap:** a plain number field. Its menu has one choice, **Auto**, which pushes children to the ends of the frame (Figma's auto spacing); typing `auto` does the same.

**This one / All like this:** for repeated elements. Defaults to This one. "All like this" covers a *family*:
- every element rendered from the same line of code (a card rendered 3 times = 3)
- plus any copies you make of them with ⌘D, paste or ⌥-drag, including the elements inside those copies
- a shape or text you add is its own family, and its copies join it

Push styles a family through one shared CSS rule, so the copies match the originals once they're in the code.

**Push:** shows the list of changes; **Proceed** snapshots your source, runs Claude in the background to apply them, then reloads the page. **Undo** (in the pill afterwards) restores the files Claude changed and brings your edits back so you can adjust and push again.

**Canvas (being built, roadmap B2):** while Edit Mode is on, a design canvas sits on the board 160px to the right of your page (pan over, or ⇧1 to fit both). It has its own **Canvas** section in Layers. What's on it can be selected and edited like the page and undone with ⌘Z, but it's never part of Push. It's saved in `.editmode/canvas.json`, so it survives reloads. The canvas is **freeform**: things stay exactly where you put them, and you build structure when you're ready. The **Frame tool (F)** draws white frames at the size you drag (a click makes 100 × 100), with no auto layout. Rectangle, Ellipse and Text draw into a frame or onto the canvas, right where you click. **Drag anything anywhere** (like Figma): let go over a frame and it goes inside it, staying where you see it (or, in an auto-layout frame, joining its flow where the blue line shows); let go over the empty canvas and it's top-level. Out of auto layout, it becomes freely placed and the frame closes up behind it. While you drag, it floats above everything, so a clipping frame can't hide it. Rectangles, ellipses, images and text don't take things inside them (the drop goes to their frame). Moved pieces keep their look (a copied heading dragged out of its card keeps its font and color). Several selected move together, keeping their arrangement. In Layers, drop a row on the middle of a frame's row to put it inside (the row lights up), or above/below a row to place it there. Each move is one ⌘Z. Arrows nudge anything placed freely (Shift: 10px). **⇧A** turns a frame (or a selection) into auto layout without anything moving: the current arrangement becomes the direction (row or column), the gap and the padding. Inside an auto-layout frame, things stack and reorder. Delete on the canvas really removes the item (⌘Z brings it back). The Frame tool doesn't work on the live page: structure lives on the canvas. A fresh canvas starts with one empty frame the size of your page. **Duplicate page** (the copy button on the Canvas row in Layers) puts an identical copy of the whole page beside it, structure kept. ⌘C something on the page, select a canvas frame and ⌘V: the copy lands in the same spot it has on the page (in an auto-layout frame, it joins the layout). With nothing on the canvas selected, ⌘V pastes where the pointer is. Copies look identical and remember which code they came from (the panel shows "copy of …"), so Push can compare them with the originals later. They're visual only: buttons and links don't respond. **Images:** drag image files from Finder onto the canvas (into a frame, or loose on the canvas, centered where you drop them; several land side by side), or copy an image anywhere (a browser, Preview, a screenshot, a file in Finder) and ⌘V: it lands in the selected canvas frame, centered, or where the pointer is, otherwise to the right of everything on the canvas. Each becomes an **image layer** named after its file, at its own size (at most 1000px on its longest side), with an image fill you can change like any other. PNG, JPG, GIF, WebP, AVIF and SVG, up to 25 MB. Dropping on the live page adds nothing (use Fill › Image for something on the page). Images are kept in `.editmode/assets/`; when an image fill reaches Push, Edit Mode copies the file into the project's `public/images/` first (Undo removes it again). More structural editing comes next.

**EDITMODE.md (your project's conventions):** a short file at the project root that tells Push how your team writes UI code: how styles are written (plain CSS, CSS modules, Tailwind…), where design tokens live, which layout and shared components to reuse, and what to avoid. Push reads it first, and it wins over Edit Mode's defaults. If a project doesn't have one, the Push dialog offers **Draft one**: Claude reads your codebase and writes only that file (anything else it touches is put back), for you to review and edit. Point `EDIT_MODE_CLAUDE` (or the plugin's `claudePath` option) at a different `claude` binary if needed.

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
  - `design.js`: the design canvas beside the page
  - `assets.js`: images (upload, file picker, image fill modes)
  - `changes.js`: every edit, with undo/redo
  - `tokens.js`: colors, sizes and variables used on the page
- `tests/`: Playwright QA scripts (run against a copy of sample-app on port 5390)
- `sample-app/`: test project (`cd sample-app && npm run dev`)

Handoff batches, the canvas and added images are written to `.editmode/` in your project (git-ignored automatically).
