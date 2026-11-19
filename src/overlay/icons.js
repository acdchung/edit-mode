// Icons from Lucide 1.75.0 (https://lucide.dev), generated from lucide-static.
// To change one, pick a name from lucide.dev/icons and copy its SVG contents.
//
// ISC License
//
// Copyright (c) 2026 Lucide Icons and Contributors
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
//
// ---
//
// The following Lucide icons are derived from the Feather project:
//
// airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
//
// The MIT License (MIT) (for the icons listed above)
//
// Copyright (c) 2013-present Cole Bemis
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const PATHS = {
  chevron: '<path d="m6 9 6 6 6-6" />', // chevron-down
  up: '<path d="m18 15-6-6-6 6" />', // chevron-up
  plus: '<path d="M5 12h14" /><path d="M12 5v14" />', // plus
  x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />', // x
  check: '<path d="M20 6 9 17l-5-5" />', // check
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />', // eye
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />', // eye-off
  drop: '<path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" /><path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" /><path d="m2 22 .414-.414" />', // pipette
  left: '<path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" />', // text-align-start
  center: '<path d="M21 5H3" /><path d="M17 12H7" /><path d="M19 19H5" />', // text-align-center
  right: '<path d="M21 5H3" /><path d="M21 12H9" /><path d="M21 19H7" />', // text-align-end
  justify: '<path d="M3 5h18" /><path d="M3 12h18" /><path d="M3 19h18" />', // text-align-justify
  padH: '<path d="M12 10V8" /><path d="M12 16v-2" /><path d="M12 22v-2" /><path d="M12 4V2" /><path d="m19 15 3-3-3-3" /><path d="M22 12h-6" /><path d="m5 15-3-3 3-3" /><path d="M8 12H2" />', // unfold-horizontal
  padV: '<path d="M10 12H8" /><path d="M12 16v6" /><path d="M12 2v6" /><path d="M16 12h-2" /><path d="M22 12h-2" /><path d="M4 12H2" /><path d="m9 19 3 3 3-3" /><path d="m9 5 3-3 3 3" />', // unfold-vertical
  sides: '<path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />', // scan
  gap: '<path d="M12 3v18" /><path d="m16 16 4-4-4-4" /><path d="m8 8-4 4 4 4" />', // separator-vertical
  opacity: '<circle cx="15" cy="9" r="7" /><circle cx="9" cy="15" r="7" />', // blend
  radius: '<path d="M21 11a8 8 0 0 0-8-8" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />', // square-round-corner
  weight: '<path d="M13 21h8" /><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />', // pen-line
  lineHeight: '<path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" />', // arrow-up-down
  letterSpacing: '<path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" />', // arrow-left-right
  open: '<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />', // external-link
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />', // copy
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />', // command
  option: '<path d="M14 3h7" /><path d="M3 3h5.28a1 1 0 0 1 .948.684l5.544 16.632a1 1 0 0 0 .949.684H21" />', // option
  enter: '<path d="M20 4v7a4 4 0 0 1-4 4H4" /><path d="m9 10-5 5 5 5" />', // corner-down-left
  select: '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />', // mouse-pointer-2
  rect: '<rect width="18" height="18" x="3" y="3" rx="2" />', // square
  ellipse: '<circle cx="12" cy="12" r="10" />', // circle
  text: '<path d="M12 4v16" /><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" /><path d="M9 20h6" />', // type
  group: '<path d="M3 7V5c0-1.1.9-2 2-2h2" /><path d="M17 3h2c1.1 0 2 .9 2 2v2" /><path d="M21 17v2c0 1.1-.9 2-2 2h-2" /><path d="M7 21H5c-1.1 0-2-.9-2-2v-2" /><rect width="7" height="5" x="7" y="7" rx="1" /><rect width="7" height="5" x="10" y="12" rx="1" />', // group
  autoLayout: '<rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /><path d="M14 4h7" /><path d="M14 9h7" /><path d="M14 15h7" /><path d="M14 20h7" />', // layout-list
  trash: '<path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />', // trash-2
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />', // image
  angle: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />', // rotate-cw
  dirRow: '<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />', // arrow-right
  dirCol: '<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />', // arrow-down
  wrap: '<path d="m16 16-3 3 3 3" /><path d="M3 12h14.5a1 1 0 0 1 0 7H13" /><path d="M3 19h6" /><path d="M3 5h18" />', // wrap-text
  mainStartRow: '<rect width="6" height="14" x="6" y="5" rx="2" /><rect width="6" height="10" x="16" y="7" rx="2" /><path d="M2 2v20" />', // align-horizontal-justify-start
  mainCenterRow: '<rect width="6" height="14" x="2" y="5" rx="2" /><rect width="6" height="10" x="16" y="7" rx="2" /><path d="M12 2v20" />', // align-horizontal-justify-center
  mainEndRow: '<rect width="6" height="14" x="2" y="5" rx="2" /><rect width="6" height="10" x="12" y="7" rx="2" /><path d="M22 2v20" />', // align-horizontal-justify-end
  mainBetweenRow: '<rect width="6" height="14" x="3" y="5" rx="2" /><rect width="6" height="10" x="15" y="7" rx="2" /><path d="M3 2v20" /><path d="M21 2v20" />', // align-horizontal-space-between
  mainStartCol: '<rect width="14" height="6" x="5" y="16" rx="2" /><rect width="10" height="6" x="7" y="6" rx="2" /><path d="M2 2h20" />', // align-vertical-justify-start
  mainCenterCol: '<rect width="14" height="6" x="5" y="16" rx="2" /><rect width="10" height="6" x="7" y="2" rx="2" /><path d="M2 12h20" />', // align-vertical-justify-center
  mainEndCol: '<rect width="14" height="6" x="5" y="12" rx="2" /><rect width="10" height="6" x="7" y="2" rx="2" /><path d="M2 22h20" />', // align-vertical-justify-end
  mainBetweenCol: '<rect width="14" height="6" x="5" y="15" rx="2" /><rect width="10" height="6" x="7" y="3" rx="2" /><path d="M2 21h20" /><path d="M2 3h20" />', // align-vertical-space-between
  crossStartRow: '<rect width="6" height="16" x="4" y="6" rx="2" /><rect width="6" height="9" x="14" y="6" rx="2" /><path d="M22 2H2" />', // align-start-horizontal
  crossCenterRow: '<path d="M2 12h20" /><path d="M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" /><path d="M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4" /><path d="M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1" /><path d="M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1" />', // align-center-horizontal
  crossEndRow: '<rect width="6" height="16" x="4" y="2" rx="2" /><rect width="6" height="9" x="14" y="9" rx="2" /><path d="M22 22H2" />', // align-end-horizontal
  crossStretchRow: '<rect width="6" height="20" x="4" y="2" rx="2" /><rect width="6" height="20" x="14" y="2" rx="2" />', // stretch-vertical
  crossStartCol: '<rect width="9" height="6" x="6" y="14" rx="2" /><rect width="16" height="6" x="6" y="4" rx="2" /><path d="M2 2v20" />', // align-start-vertical
  crossCenterCol: '<path d="M12 2v20" /><path d="M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4" /><path d="M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4" /><path d="M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1" /><path d="M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" />', // align-center-vertical
  crossEndCol: '<rect width="16" height="6" x="2" y="4" rx="2" /><rect width="9" height="6" x="9" y="14" rx="2" /><path d="M22 22V2" />', // align-end-vertical
  crossStretchCol: '<rect width="20" height="6" x="2" y="4" rx="2" /><rect width="20" height="6" x="2" y="14" rx="2" />', // stretch-horizontal
  shift: '<path d="M9 19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-7.086-7.086a1 1 0 0 0-1.414 0l-7.086 7.086a.707.707 0 0 0 .5 1.207H8a1 1 0 0 1 1 1z" />', // arrow-big-up
  backspace: '<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" /><path d="m12 9 6 6" /><path d="m18 9-6 6" />', // delete
  sideTop: '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" />', // panel-top
  sideRight: '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M15 3v18" />', // panel-right
  sideBottom: '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 15h18" />', // panel-bottom
  sideLeft: '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" />', // panel-left
};

// <svg> markup for a Lucide icon, sized for the UI (Lucide's 24px grid scaled down).
export function icon(name, size = 14) {
  return `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

export const ICON = Object.fromEntries(Object.keys(PATHS).map((k) => [k, icon(k)]));

// Corner icons: Lucide's square-round-corner (rounded top-right), rotated.
const corner = (deg) => icon('radius').replace('<svg class="i"', `<svg class="i" style="transform: rotate(${deg}deg)"`);
ICON.cornerTL = corner(-90);
ICON.cornerTR = corner(0);
ICON.cornerBR = corner(90);
ICON.cornerBL = corner(180);

// Small key glyphs for shortcut hints.
export const KEY = {
  command: icon('command', 11),
  option: icon('option', 11),
  enter: icon('enter', 11),
  shift: icon('shift', 11),
  backspace: icon('backspace', 11),
};
