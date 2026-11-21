// Snapping (Figma's smart guides). While moving or resizing, edges and
// centres snap to the edges and centres of what's around (siblings, the
// frames it's in, other canvas items, the live page), and a size snaps to
// another element's size (a page frame as tall as the page). Red lines show
// what it snapped to. Hold ⌃ to place freely. All in screen pixels.

const SNAP = 6; // how close (screen px) before it snaps
const xs = (r) => [r.left, r.left + r.width / 2, r.right];
const ys = (r) => [r.top, r.top + r.height / 2, r.bottom];

export function createSnapper(layer) {
  // What can be snapped to: screen rects (with the element, for size labels).
  function targets(moving, { canvas, page, near = [] }) {
    const skip = (el) => moving.some((m) => m === el || m.contains(el));
    const out = [];
    const add = (el) => {
      if (!el || skip(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width || r.height) out.push({ el, r });
    };
    if (page) add(page);
    for (const el of near) add(el);
    if (canvas) {
      // Canvas items and what's in them, a few levels down (enough for frames in frames).
      const walk = (n, depth) => { for (const k of n.children) { add(k); if (depth < 3 && out.length < 400) walk(k, depth + 1); } };
      walk(canvas, 1);
    }
    return out;
  }

  // The nearest line within reach, for any of the moving values: [delta, line] or null.
  function nearest(values, lines) {
    let best = null;
    for (const v of values) for (const l of lines) {
      const d = l - v;
      if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best[0]))) best = [d, l];
    }
    return best;
  }

  // Moving a box: how far to shift it so an edge or its centre lands on a line.
  function move(rect, ts) {
    const bx = nearest(xs(rect), ts.flatMap((t) => xs(t.r)));
    const by = nearest(ys(rect), ts.flatMap((t) => ys(t.r)));
    return { dx: bx ? bx[0] : 0, dy: by ? by[0] : 0 };
  }

  // Resizing: the dragged edge snaps to a line, or the size to another
  // element's size, whichever is closer. `dir` is the handle (n, se, …).
  // Returns the snapped width/height and what matched (for the label).
  function resize(rect, dir, ts) {
    const out = { width: rect.width, height: rect.height, size: [] };
    const axis = (horiz) => {
      const start = horiz ? dir.includes('w') : dir.includes('n');
      if (!(horiz ? /[ew]/ : /[ns]/).test(dir)) return;
      const len = horiz ? rect.width : rect.height;
      const edge = horiz ? (start ? rect.left : rect.right) : (start ? rect.top : rect.bottom);
      const e = nearest([edge], ts.flatMap((t) => (horiz ? xs(t.r) : ys(t.r))));
      const sizes = ts.map((t) => (horiz ? t.r.width : t.r.height));
      const s = nearest([len], sizes);
      const edgeFix = e ? (start ? -e[0] : e[0]) : null; // change in length
      const sizeFix = s ? s[0] : null;
      if (sizeFix != null && (edgeFix == null || Math.abs(sizeFix) <= Math.abs(edgeFix))) {
        out[horiz ? 'width' : 'height'] = len + sizeFix;
        out.size.push({ horiz, el: ts[sizes.indexOf(s[1])].el });
      } else if (edgeFix != null) out[horiz ? 'width' : 'height'] = len + edgeFix;
    };
    axis(true);
    axis(false);
    return out;
  }

  // Red lines where the box's edges or centre meet another's, and a red
  // outline around an element whose size it matched.
  function show(rect, ts, matched = []) {
    layer.replaceChildren();
    const line = (left, top, width, height) => {
      const d = document.createElement('div');
      d.className = 'sguide';
      d.style.cssText = `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
      layer.append(d);
    };
    const near = (a, b) => Math.abs(a - b) < 0.5;
    for (const t of ts) {
      for (const x of xs(rect)) if (xs(t.r).some((v) => near(v, x))) {
        const top = Math.min(rect.top, t.r.top), bottom = Math.max(rect.bottom, t.r.bottom);
        line(Math.round(x), top, 1, bottom - top);
      }
      for (const y of ys(rect)) if (ys(t.r).some((v) => near(v, y))) {
        const left = Math.min(rect.left, t.r.left), right = Math.max(rect.right, t.r.right);
        line(left, Math.round(y), right - left, 1);
      }
    }
    for (const m of matched) {
      const r = m.el.getBoundingClientRect();
      const d = document.createElement('div');
      d.className = 'sbox';
      d.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
      layer.append(d);
    }
  }

  const clear = () => layer.replaceChildren();
  return { targets, move, resize, show, clear };
}
