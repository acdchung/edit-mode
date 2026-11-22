# Edit Mode

**Design on your real, running product the way you would in Figma, and let Claude Code turn what you changed into code.**

![Edit Mode on the Payloom Console](docs/hero.png)

Designers work in Figma, but people use the product, which is code. Every handoff loses something: a spacing value, a font weight, a layout that comes back almost right. Edit Mode removes the handoff. Turn it on in the browser and your running React app becomes a Figma-style canvas: Layers, auto layout, constraints and the same shortcuts. What you select is the real screen, with real data.

- **Tweak the live page.** Change padding, size, colour or text right where they are.
- **Rework on the canvas.** Duplicate the page onto a canvas beside it. Every piece of the copy remembers the line of code it came from, so you can restructure freely and still get exact edits back.
- **Design something new.** Frames, auto layout and text, with real components pasted in from the page.
- **Push.** Edit Mode compares your design with the code, lists exactly what changed, and has Claude Code rewrite your source with your project's own components and tokens. **Undo** puts the files back.

It runs only on the dev server; nothing ships in `vite build`.

## Try it

You need [Node.js](https://nodejs.org) 18 or newer. Push also needs [Claude Code](https://claude.com/claude-code) installed and logged in; everything else works without it.

```sh
git clone https://github.com/acdchung/edit-mode.git
cd edit-mode
npm install               # Edit Mode itself
cd console-app
npm install               # the demo app
npm run dev
```

Open http://localhost:5291 and press **⌥E** (Option-E). Then try this:

1. Click a name in the people table, choose **All like this** in the panel and change **H**.
2. Click the small copy icon beside the page's top-right corner (**Duplicate page**). Move or restyle something on the copy.
3. Press **Push** to see the list of changes. **Proceed** runs Claude Code on the demo app's files, and **Undo** in the pill restores them.

The repo has three example apps, all fictional: `console-app/` (a payroll review screen, the main demo), `demo-app/` (a landing page) and `sample-app/` (a small test bed).

## Add it to your own project

For a React + Vite project that uses plain CSS:

```sh
npm install --save-dev /path/to/edit-mode
```

```js
// vite.config.js
import editMode from 'edit-mode';

export default defineConfig({
  plugins: [editMode(), react()],
});
```

Run `npm run dev` as usual. Add an `EDITMODE.md` with your team's conventions (see the [guide](docs/GUIDE.md)), or let the Push dialog draft one.

## How it was built

I'm Andrew Chung, a product designer. I designed and built Edit Mode on my own, with Claude Code as my engineering partner. I made the product calls; Claude wrote the code and the browser tests. The working files are here too:

- `DESIGN.md`: my design rules for the tool, with my original words kept as comments
- `ROADMAP.md`: the plan, what was decided and why, and what each real Push taught us
- `CLAUDE.md`: the notes each Claude Code session starts from (architecture, testing rules, gotchas)
- `tests/`: the browser tests (Playwright), including pixel comparisons and replays of real Pushes

## The basics

| Key | What it does |
| --- | --- |
| ⌥E | Edit mode on/off |
| Click / double-click | Select a layer / go one level deeper (or edit text) |
| F / R / O / T | Frame, Rectangle, Ellipse, Text |
| ⇧A | Auto layout |
| ⇧1 | Fit the page and the canvas |
| ⌘Z / ⌘⇧Z | Undo / redo |
| ⌘↵ | Push |

The [full guide](docs/GUIDE.md) covers every shortcut, the panel, the canvas, Push, `EDITMODE.md` and how the code is laid out.
