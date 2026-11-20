# Edit Mode: design rules

The user's taste, written down so it isn't re-corrected. These rules cover Edit Mode's own UI (the overlay in `src/overlay/`), not the apps it edits. Tokens live in `src/overlay/styles.js` (`:host`).

## Surfaces

- **Minimal, "high-class tech" dark UI.** Panels and bars use `.glassy`: `--glass` background, blur, `--lift` shadow and a `--hair` border.
- **Figma is the reference for every interaction and every visual convention.** Where a live web page can't work like Figma, pick the closest natural behavior and say so.
- **Panels stay where they are.** The properties panel, Layers, the toolbar and the pill never move on their own, not even when they cover the selection. You pan or zoom the canvas to see what's underneath.
  Why: a panel that jumps sides breaks muscle memory; the canvas is what moves, as in Figma.
  <!-- 2026-11-19: "one thing i want to change is any of the panels auto relocating to the other side of the screen ... since i can zoom out, the overlay should stay static (perhaps we add a grabber so users can place them wherever they want, but let's not auto move them)" -->
  Checked by `tests/brutal2.mjs` › "the panel stays put".
- **The Layers panel's width is yours:** drag its right edge (200–520px), remembered per browser. Deep trees need the room.
  <!-- 2026-11-20: "a resizable layers panel would be ideal, if i could drag it horizontally to resize" -->

## Typography

- **System sans (`--sans`) everywhere.** Use mono (`--mono`) only for the element name and the source meta in the panel header.
- **Icons are Lucide only**, generated into `icons.js`. Never draw custom SVGs or pull in another icon set.

## Spacing & layout

- **The properties panel stays dense:**
  - 252px wide (`.side`) with 28px fields (`.field`, `.dd`)
  - 8px between rows (`.row`, `.crow`) and between a section header and its content (`.sh`)
  - 4px between controls inside a row, never less
  - row actions (eye, ×) always visible, in fixed 24×28 slots (`.crow > .icon`)
  - fix crowding with rhythm and alignment, never by widening the panel, making fields taller or hiding actions until hover

  Why: it's a tool used all day, like Figma; having everything visible on screen beats breathing room.
  <!-- 2026-11-19: "the spacing in the adjustments especially in the 'fill' section is really tight" → picked "Tight" over "Grouped"/"Airy" in a /prototype round: "I think tight is fine"; why confirmed: "rule 2 is fine" -->
  Checked by `tests/polish1.mjs` › "panel density".

## Interaction

- **Every element an action will affect is drawn with the exact selection frame:**
  - a solid 1px `--accent` border, 8 handles and the size label
  - this covers multi-selection, "All like this" instances, and the group bounding frame around a multi-selection (roadmap item 3), which uses the same style as the per-element frames
  - never a dashed, dimmed or handle-less variant

  Why: it should look the same as if each element had been selected by hand, so it's clear what's selected.
  <!-- 2026-11-18: "change the dashed outline to look the same as the original selected element"; 2026-11-19: "add the handles like the main selected element has too? so it look like how it would if you manually selected all three"; group frame confirmed: "rule 1 yes" -->
  Checked by `tests/polish1.mjs` › "same frame as the selection" (All like this and Shift-selection).

- **Fields that change together read as one linked pair.** With constrain proportions on, W and H get a `--accent` outline at 45% opacity, joined by an 8px accent line across the gap (`.row.linked`).
  Why: the link should be visible where you type, not only on the button.
  <!-- 2026-11-19: "it would also be nice when you lock the ratio for the W and H input field to be visually connected somehow" -->

- **Spacing fields (gap, padding, margin) are plain number inputs, with no preset lists.**
  <!-- 2026-11-19: "Let's remove the default options in spacing, just leave it as an input field" -->
  The one exception is the Gap field's menu, which holds a single choice, **Auto** (Figma's auto spacing), because a mode can't be typed as a number.
  <!-- 2026-11-20: "when we took away the defaut spacing options we took away the auto spacing. need to bring that back." -->

## Motion

From the `/emil-design-eng` review, accepted 2026-11-19 ("write all").

- **Anything used constantly appears instantly:** panels, the toolbar (⌥E), Layers (⌥1), selection, hover, drag feedback, and anything opened from the keyboard.
- **Only occasional UI animates:** dialogs, toasts, and menus opened by a click.
- **One easing:** `--ease` (`cubic-bezier(0.23, 1, 0.32, 1)`) at 120–180ms. Never `ease-in`, never over 300ms.
- **Popovers grow from their trigger** (`transform-origin` at the trigger's corner, scale from .97).
- **Pressable controls scale to .97 on press** (.95 for small icon buttons). Menu items don't.
- **Hover effects that move things are limited to mouse pointers** (`@media (hover: hover) and (pointer: fine)`).
- **Every animation is covered by `prefers-reduced-motion`.**
