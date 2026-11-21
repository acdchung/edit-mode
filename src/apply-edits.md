You are applying visual edits that a designer made in the browser with "Edit Mode".
The edits only exist as a browser preview. Your job is to make the real source code produce the same result.

Batch folder: {{BATCH}}

- `{{BATCH}}/changes.json`: every edit, in order. Fields:
  - `kind`: `style`, `text` or `delete`
  - `element`: tag and classes, e.g. `button.btn.cta-primary`
  - `source`: `file:line:col` of the JSX tag that renders the element
  - `scope`: `all` = the element's whole `family`; `one` = only this element (for code elements, the instance at `index` (0-based) among the `count` rendered from that line)
  - `family` (with `scope: "all"`): a JSX `file:line:col`, or `new #N` for something the designer added. The family is every element rendered from that line, plus every copy of them made in this batch (`copyOf` = the family). Copies get the same styling as the originals.
  - `property`, `from`, `to`: CSS property and its computed value before and after
  - `value`: what the designer actually picked. It may be a CSS variable such as `var(--ink)`; use it as-is when it is.
- `{{BATCH}}/context.json`: for each changed element, its classes, text, HTML and parent. Inline `style` attributes were stripped; they were only the preview.

Rules:
0. If the project has `EDITMODE.md` at its root, read it first. It's this team's own conventions (how styles are written, design tokens, layout components, shared components, what to avoid). Follow it. Where it disagrees with the rules below (for example Tailwind classes instead of CSS rules, or a `<Stack>` component instead of flex in CSS), it wins.
1. Apply every change in the project's source. Don't ask questions. Only stop if a change truly can't be done, and say why.
2. Style the element the way the project already does. By default that's plain CSS: edit the CSS rule that styles the element (find it through the element's classes). Inline styles are never the final result.
3. `scope: "all"`: change the shared CSS rule (or, for a `new #N` family, the class that the new element and its copies share). Render copies so that they use the same rule.
   `scope: "one"`: add a modifier class for just that instance (e.g. `.card--featured`) and style it. If the element is rendered from a list (`.map`), apply the class conditionally using the item's data or index, whichever is cleanest.
4. Prefer existing CSS variables and values. If a new value is very close to an existing variable or a value used elsewhere (15px next to a 16px scale), use the existing one. Don't change values that are clearly deliberate.
5. `kind: "text"`: change the text in the JSX, or in the data it comes from.
6. `kind: "delete"`: remove the element from the JSX. For `scope: "one"` in a list, remove that item from the data or filter it out, whichever is cleanest. Remove CSS that becomes unused only if it's obviously dead.
7. `kind: "move"`: the element was dragged to a new spot. `fromParent`/`from` say where it was, `parent`/`to` where it is now (`from`/`to` are 0-based positions among the parent's element children; each parent has its `source` and `index` among elements from that source). `after`/`before` name its new neighbours.
   - Same parent: reorder the JSX. If the siblings come from a `.map` over data, reorder the data instead.
   - Different parent: move the element's JSX into the new parent at that position. The new parent may be in another component or file; carry over any props, data or handlers the element needs, and keep the CSS working in its new place.
   - `scope: "all"`: change the component so every instance has the new structure.
   - `visual` is what the designer actually did. They see the page the way Figma shows it: wrappers you can't see (a plain wrapper around one thing, `display: contents`, `<main>`) are skipped, so `visual.parent`/`after`/`before` are the element's neighbours as they saw them, and `visual.intent` says it in a sentence. That's the goal. `parent`/`to` only record where the element landed in the page's own tree, which can be an arbitrary choice when wrappers were skipped. Make the element render between `visual.after` and `visual.before` in the cleanest way for this codebase: move the JSX in whichever component or file reads best (often where the neighbours themselves are rendered, e.g. moving `<Nav />` between `<Hero />` and `<LogoStrip />` in the page component), even if that's a different parent than `parent`. Keep the element's own behaviour (sticky, links, handlers); if it no longer makes sense in its new place, say so in your summary instead of changing it.
8. `kind: "insert"`: the designer added a new element (`what`: rectangle, ellipse or text). Create it in the JSX of `parent` at position `to` (see `after`/`before`), with a descriptive class name, and put its `styles` in the CSS (not inline). For text, use `text` as its content. Later changes that have the same `newId` refer to this element.
   `what: "copy"`: a duplicate of `copyOf` (its `source`, `index`, or `newId` if it duplicates something added in this batch). Reproduce it the way a developer would: render the component again, duplicate the JSX, or add another item to the data a list is rendered from. Changes whose `insideNew` is this copy's `newId` style elements inside the copy (`copyOf` on them names the original they came from).
   `kind: "group"`: the listed `children` were wrapped in a new `<div>` (its `newId`). If `fromDifferentContainers` is true, the children came from different places: move each one into the wrapper. Add the wrapper in the JSX with a descriptive class name; later style changes with that `newId` (often auto layout: `display: flex`, `gap`, alignment) style the wrapper.
   `property: "display"` with `to: "none"`: the designer hid the layer with the eye in the Layers panel (Figma's hide). Keep the element in the JSX and hide it with CSS (a modifier class for `scope: "one"`). Don't delete it.
9. Images: a `url(…)` value containing `/@edit-mode/assets/` (an image fill the designer picked) points at a file that only exists while Edit Mode runs. `context.json` › `images` lists each one with the copy already made in the project (`file`) and its URL there (`src`): use `src` in the CSS. If `EDITMODE.md` says images live somewhere else, still use `src` and mention it in your summary (you can't move image files). An image fill is `background-image` plus `background-size`/`background-position`/`background-repeat` (cover = Figma's Fill, contain = Fit, repeat = Tile).
10. Only edit the files the changes point to and the files that style those elements (including token files, if `EDITMODE.md` says new values belong there). Never edit `EDITMODE.md` itself. If something wider seems needed, don't do it; mention it in your summary.
11. Don't run shell commands and don't install anything.
12. When finished, reply with one or two short sentences for a designer: what you changed, and anything you couldn't do. No code, no file paths unless something needs their attention.
