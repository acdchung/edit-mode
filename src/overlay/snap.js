// Snapping (Figma's smart guides). While moving or resizing, edges and
// centres snap to the edges and centres of what's around (siblings, the
// frames it's in, other canvas items, the live page), and a size snaps to
// another element's size (a page frame as tall as the page). Red lines show
// what it snapped to. Equal spacing snaps too: between two neighbours, or
// the same gap as the row (or column) already has, shown as gap markers with
// the value. Drawing a new shape snaps its corners. Hold ⌃ to place freely.
// All in screen pixels; `zoom()` turns a gap into CSS px for its label.

const SNAP = 6; // how close (screen px) before it snaps
const xs = (r) => [r.left, r.left + r.width / 2, r.right];
const ys = (r) => [r.top, r.top + r.height / 2, r.bottom];

export function createSnapper(layer, zoom = () => 1) {
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

  // Neighbours along one axis: what overlaps the box across that axis and
  // sits clear of it before or after. `h` = the horizontal axis (a row).
  const span = (r, h) => (h ? [r.left, r.right] : [r.top, r.bottom]);
  const across = (r, h) => (h ? [r.top, r.bottom] : [r.left, r.right]);
  function neighbours(rect, ts, h) {
    const [a0, a1] = across(rect, h);
    const [s0, s1] = span(rect, h);
    let before = null, after = null;
    for (const t of ts) {
      const [b0, b1] = across(t.r, h);
      if (b1 <= a0 || b0 >= a1) continue; // not in the same row
      const [t0, t1] = span(t.r, h);
      if (t1 <= s0 + 0.5 && (!before || t1 > span(before.r, h)[1])) before = t;
      else if (t0 >= s1 - 0.5 && (!after || t0 < span(after.r, h)[0])) after = t;
    }
    return { before, after };
  }

  // Where equal spacing would put the box's start along one axis: centred
  // between its neighbours, or the gap its neighbour already has on its far side.
  function spacingSpots(rect, ts, h) {
    const len = h ? rect.width : rect.height;
    const { before, after } = neighbours(rect, ts, h);
    const out = [];
    if (before && after) {
      const room = span(after.r, h)[0] - span(before.r, h)[1];
      if (room >= len) out.push(span(before.r, h)[1] + (room - len) / 2);
    }
    if (before) {
      const far = neighbours(before.r, ts, h).before;
      if (far) out.push(span(before.r, h)[1] + span(before.r, h)[0] - span(far.r, h)[1]);
    }
    if (after) {
      const far = neighbours(after.r, ts, h).after;
      if (far) out.push(span(after.r, h)[0] - (span(far.r, h)[0] - span(after.r, h)[1]) - len);
    }
    return out;
  }

  // Moving a box: how far to shift it so an edge or its centre lands on a
  // line, or its gaps match (whichever is closer; lines win a tie).
  function move(rect, ts) {
    const axis = (h) => {
      const line = nearest(h ? xs(rect) : ys(rect), ts.flatMap((t) => (h ? xs(t.r) : ys(t.r))));
      const start = h ? rect.left : rect.top;
      const gap = nearest([start], spacingSpots(rect, ts, h));
      if (gap && (!line || Math.abs(gap[0]) < Math.abs(line[0]))) return gap[0];
      return line ? line[0] : 0;
    };
    return { dx: axis(true), dy: axis(false) };
  }

  // A point (drawing a new shape): x and y each snap to the nearest line.
  function point(x, y, ts) {
    const bx = nearest([x], ts.flatMap((t) => xs(t.r)));
    const by = nearest([y], ts.flatMap((t) => ys(t.r)));
    return [x + (bx ? bx[0] : 0), y + (by ? by[0] : 0)];
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
    // Equal gaps: both sides of the box, or the box's gap and its neighbour's.
    const gapMark = (h, a, b, r1, r2) => { // a gap from a to b between two boxes
      const lo = Math.max(across(r1, h)[0], across(r2, h)[0]);
      const hi = Math.min(across(r1, h)[1], across(r2, h)[1]);
      const mid = Math.round((lo + hi) / 2);
      if (h) line(a, mid, b - a, 1); else line(mid, a, 1, b - a);
      const end = (v) => (h ? line(Math.round(v), mid - 4, 1, 9) : line(mid - 4, Math.round(v), 9, 1));
      end(a); end(b);
      const l = document.createElement('div');
      l.className = 'mlabel';
      l.textContent = Math.round((b - a) / zoom());
      l.style.left = `${h ? (a + b) / 2 : mid}px`;
      l.style.top = `${h ? mid + 12 : (a + b) / 2}px`;
      if (!h) l.style.left = `${mid + 14 + l.textContent.length * 3}px`;
      layer.append(l);
    };
    for (const h of [true, false]) {
      const { before, after } = neighbours(rect, ts, h);
      const gaps = [];
      const g1 = before && span(rect, h)[0] - span(before.r, h)[1];
      const g2 = after && span(after.r, h)[0] - span(rect, h)[1];
      const same = (a, b) => a > 0.5 && Math.abs(a - b) < 0.5;
      if (before && after && same(g1, g2)) gaps.push([before.r, rect], [rect, after.r]);
      if (before) {
        const far = neighbours(before.r, ts, h).before;
        if (far && same(g1, span(before.r, h)[0] - span(far.r, h)[1])) gaps.push([far.r, before.r], [before.r, rect]);
      }
      if (after) {
        const far = neighbours(after.r, ts, h).after;
        if (far && same(g2, span(far.r, h)[0] - span(after.r, h)[1])) gaps.push([rect, after.r], [after.r, far.r]);
      }
      const seen = new Set();
      for (const [r1, r2] of gaps) {
        const key = `${span(r1, h)[1]}|${span(r2, h)[0]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        gapMark(h, span(r1, h)[1], span(r2, h)[0], r1, r2);
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
  return { targets, move, point, resize, show, clear };
}
