// Padding and gap handles on the canvas (Figma). When an auto-layout frame
// is selected and the pointer is over it, each padding side and each gap
// between children becomes a zone you can drag:
//   - hover shows the value; drag changes it (one undo step)
//   - Shift snaps to steps of 8; ⌥ sets the opposite padding side too
//   - clicking a gap (no drag) focuses the panel's Gap field
// Zones are computed from the live layout every frame, so they follow
// zoom, pan and the edit itself. Values are CSS px (screen ÷ view.z).

import { fmt, num, view } from './util.js';

const GRAB = 10; // thinnest zone you can grab, in screen px (0 padding still gets one); its middle clears the frame's edge handles
const MIN_LONG = 16; // don't offer a zone this short: the frame is too small
const SIDES = ['top', 'right', 'bottom', 'left'];
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export function createSpacing({ layer, label, changes, state, focusGap, drill }) {
  let zones = []; // what's drawn now: { id, kind, side?, axis, rect (visible), hit (grab area), value, auto? }
  let hovered = null; // zone id under the pointer
  let drag = null; // { id, el, start, opp, x0, y0, axis, sign, group, moved, last }

  const isAuto = (el) => /flex/.test(getComputedStyle(el).display);

  function compute(el) {
    const cs = getComputedStyle(el);
    const z = view.z;
    const r = el.getBoundingClientRect();
    const [bt, br, bb, bl] = SIDES.map((s) => num(cs.getPropertyValue(`border-${s}-width`)) * z);
    const [pt, pr, pb, pl] = SIDES.map((s) => num(cs.getPropertyValue(`padding-${s}`)) * z);
    const inner = { left: r.left + bl, top: r.top + bt, right: r.right - br, bottom: r.bottom - bb };
    const content = { left: inner.left + pl, top: inner.top + pt, right: inner.right - pr, bottom: inner.bottom - pb };
    const out = [];
    const R = (left, top, width, height) => ({ left, top, width: Math.max(0, width), height: Math.max(0, height) });

    // Padding: the visible band, and a grab area at least GRAB thick (grown inward).
    const pad = {
      top: [R(inner.left, inner.top, inner.right - inner.left, pt), 'y'],
      bottom: [R(inner.left, inner.bottom - pb, inner.right - inner.left, pb), 'y'],
      left: [R(inner.left, content.top, pl, content.bottom - content.top), 'x'],
      right: [R(inner.right - pr, content.top, pr, content.bottom - content.top), 'x'],
    };
    for (const side of SIDES) {
      const [rect, axis] = pad[side];
      const long = axis === 'y' ? rect.width : rect.height;
      if (long < MIN_LONG) continue;
      const hit = { ...rect };
      if (axis === 'y' && hit.height < GRAB) { if (side === 'bottom') hit.top = rect.top + rect.height - GRAB; hit.height = GRAB; }
      if (axis === 'x' && hit.width < GRAB) { if (side === 'right') hit.left = rect.left + rect.width - GRAB; hit.width = GRAB; }
      out.push({ id: `pad:${side}`, kind: 'padding', side, axis, rect, hit, value: num(cs.getPropertyValue(`padding-${side}`)) });
    }

    // Gaps along the main axis, between neighbouring children on the same line.
    const row = !cs.flexDirection.startsWith('column');
    const kids = [...el.children]
      .filter((k) => k.getClientRects().length && !/absolute|fixed/.test(getComputedStyle(k).position))
      .map((k) => k.getBoundingClientRect())
      .filter((k) => k.width || k.height)
      .sort((a, b) => (row ? a.left - b.left : a.top - b.top));
    const auto = cs.justifyContent === 'space-between';
    const set = num(row ? cs.columnGap : cs.rowGap); // 'normal' → 0
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i];
      const b = kids[i + 1];
      const sameLine = row ? b.top < a.bottom && a.top < b.bottom : b.left < a.right && a.left < b.right;
      const g = row ? b.left - a.right : b.top - a.bottom;
      if (!sameLine || g < -0.5) continue;
      const rect = row
        ? R(a.right, content.top, g, content.bottom - content.top)
        : R(content.left, a.bottom, content.right - content.left, g);
      if ((row ? rect.height : rect.width) < MIN_LONG) continue;
      const hit = { ...rect };
      if (row && hit.width < GRAB) { hit.left -= (GRAB - hit.width) / 2; hit.width = GRAB; }
      if (!row && hit.height < GRAB) { hit.top -= (GRAB - hit.height) / 2; hit.height = GRAB; }
      out.push({ id: `gap:${i}`, kind: 'gap', axis: row ? 'x' : 'y', rect, hit, auto, value: auto ? Math.round(g / z) : set });
    }
    return out;
  }

  // ---------- Drawing ----------
  function place(node, r) {
    node.style.left = r.left + 'px';
    node.style.top = r.top + 'px';
    node.style.width = r.width + 'px';
    node.style.height = r.height + 'px';
  }

  // Called every frame. `show`: the zones should be on screen now.
  function render(el, show) {
    // A drag only lives while its frame is still the selection (a lost release must never leave handles behind).
    if (drag && (!drag.el.isConnected || drag.el !== el)) end();
    const target = drag ? drag.el : show && el && isAuto(el) ? el : null;
    zones = target ? compute(target) : [];
    if (!zones.some((z) => z.id === hovered)) hovered = null;

    while (layer.children.length > zones.length) layer.lastChild.remove();
    while (layer.children.length < zones.length) {
      const zone = document.createElement('div');
      zone.innerHTML = '<i class="fill"></i><i class="bar"></i>';
      layer.append(zone);
    }
    const lit = new Set();
    if (drag) {
      lit.add(drag.id);
      if (drag.alt && drag.side) lit.add(`pad:${OPPOSITE[drag.side]}`);
    } else if (hovered) lit.add(hovered);
    zones.forEach((z, i) => {
      const node = layer.children[i];
      node.className = `sz ${z.kind} ${z.axis}${lit.has(z.id) ? ' on' : ''}`;
      node.dataset.id = z.id;
      place(node, z.hit);
      // The fill shows the real spacing inside the (maybe larger) grab area.
      place(node.firstChild, { left: z.rect.left - z.hit.left, top: z.rect.top - z.hit.top, width: z.rect.width, height: z.rect.height });
    });

    const shown = zones.find((z) => z.id === (drag?.id ?? hovered));
    label.hidden = !shown;
    if (shown) {
      label.textContent = shown.auto && !drag?.moved ? 'Auto' : fmt(shown.value);
      label.style.left = shown.hit.left + shown.hit.width / 2 + 'px';
      label.style.top = shown.hit.top + shown.hit.height / 2 + 'px';
    }
  }

  // ---------- Dragging ----------
  function write(ev) {
    const z = view.z;
    const d = drag.axis === 'x' ? ev.clientX - drag.x0 : ev.clientY - drag.y0;
    if (!drag.moved && Math.abs(d) < 3) return;
    drag.moved = true;
    let v = Math.max(0, drag.start + (drag.sign * d) / z);
    v = ev.shiftKey ? Math.round(v / 8) * 8 : Math.round(v);
    drag.alt = !!drag.side && ev.altKey;
    const key = `${v}|${drag.alt}`;
    if (key === drag.last) return;
    drag.last = key;
    const { el } = drag;
    const scope = state.scope;
    changes.batch(drag.group, () => {
      if (drag.side) {
        changes.set(el, scope, `padding-${drag.side}`, `${v}px`);
        const opp = OPPOSITE[drag.side];
        changes.set(el, scope, `padding-${opp}`, drag.alt ? `${v}px` : drag.opp);
      } else {
        if (getComputedStyle(el).justifyContent === 'space-between') changes.set(el, scope, 'justify-content', 'flex-start');
        changes.set(el, scope, 'gap', `${v}px`);
      }
    });
  }

  function end() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', release, true);
    window.removeEventListener('pointercancel', release, true);
    drag = null;
  }

  // Pressing or releasing Shift/⌥ mid-drag applies at once, without moving.
  function onKey(e) {
    if (!drag || !/^(Shift|Alt)$/.test(e.key) || !drag.ptr) return;
    write({ clientX: drag.ptr.x, clientY: drag.ptr.y, shiftKey: e.shiftKey, altKey: e.altKey });
  }

  const zoneOf = (e) => {
    const node = e.target.closest?.('.sz');
    return node && zones.find((z) => z.id === node.dataset.id);
  };

  layer.addEventListener('pointerdown', (e) => {
    const z = zoneOf(e);
    if (!z || e.button !== 0 || !state.selected) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.closest('.sz').setPointerCapture(e.pointerId);
    const el = state.selected;
    const cs = getComputedStyle(el);
    drag = {
      id: z.id, el, side: z.side, axis: z.axis, start: z.value,
      // Padding: drag toward the content grows it. Gap: right / down grows it.
      sign: z.side === 'bottom' || z.side === 'right' ? -1 : 1,
      opp: z.side ? cs.getPropertyValue(`padding-${OPPOSITE[z.side]}`) : null,
      x0: e.clientX, y0: e.clientY, group: `spacing:${Date.now()}`, moved: false, last: null, alt: false,
      ptr: { x: e.clientX, y: e.clientY },
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    // The release is caught anywhere: the zone under the pointer can be redrawn mid-drag.
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
  });
  function onMove(e) {
    if (!drag) return;
    drag.ptr = { x: e.clientX, y: e.clientY };
    write(e);
  }
  layer.addEventListener('pointermove', (e) => { if (!drag) hovered = zoneOf(e)?.id ?? null; });
  function release(e) {
    if (!drag) return;
    const click = !drag.moved && !drag.side;
    end();
    if (click && e.type === 'pointerup') focusGap();
  }
  layer.addEventListener('lostpointercapture', (e) => { if (drag && !e.buttons) release(e); });
  layer.addEventListener('pointerleave', () => { if (!drag) hovered = null; });
  // A zone can cover a child's edge: double-click still drills in (Figma).
  layer.addEventListener('dblclick', (e) => { if (zoneOf(e)) drill(e.clientX, e.clientY); });

  // Holding ⌘ (Ctrl) lets clicks through to the page: ⌘-click picks the deepest element (Figma).
  const pass = (e) => layer.classList.toggle('pass', !drag && (e.metaKey || e.ctrlKey));
  for (const t of ['keydown', 'keyup', 'pointermove']) window.addEventListener(t, pass, true);

  return {
    render,
    get dragging() { return !!drag; },
    get hovering() { return !!hovered; },
  };
}
