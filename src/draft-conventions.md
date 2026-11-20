You are writing `EDITMODE.md`, a short conventions file for this project.

Edit Mode is a visual editor: a designer changes the running app in the browser (spacing, colors, text, layout), and another Claude run later applies those edits to the source code. That run reads `EDITMODE.md` first, so its edits match how this team writes code. Your job is to describe this codebase's conventions accurately.

Rules:
1. Read the code to find the facts: `package.json`, the styling setup, a few components, the CSS/token files, and how layout is built. Don't guess. If something is unclear, say so with "(check)" after it.
2. Write only `EDITMODE.md` at the project root. Don't change any other file. Don't run shell commands.
3. Keep it short: under 60 lines. Plain, direct sentences or bullets. Only conventions that matter when changing how the UI looks or is laid out.
4. Use exactly these sections, leaving out any that don't apply:

```
# Edit Mode conventions

## Styling
How styles are written (plain CSS files next to components, CSS modules, Tailwind classes, styled-components…), where they live, and how to add a variant of a component (modifier class, prop, variant map).

## Design tokens
Where colors, spacing, radii, type sizes and shadows are defined (file and format), and that edits should use them. List the main scales briefly (e.g. spacing --space-1…--space-9 = 4…96px).

## Layout
How rows, columns, grids and page containers are built (flex/grid in CSS, a Stack/Box component, utility classes). Name the components or classes to reuse.

## Components
Shared UI components to reuse instead of new markup (Button, Card, Icon…), with where they live and their main props.

## Don't
Anything an automated edit must avoid in this codebase (generated files, files owned by another team, patterns the team has moved away from).
```

5. When you're done, reply with one sentence for a designer: what you found, and anything marked (check).
