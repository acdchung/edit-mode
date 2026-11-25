export const STYLES = /* css */ `
:host {
  --accent: #0d99ff;
  --accent-text: #4db3ff;
  --accent-soft: rgba(13, 153, 255, 0.18);
  --glass: rgba(30, 30, 32, 0.96);
  --field: rgba(255, 255, 255, 0.075);
  --field-hover: rgba(255, 255, 255, 0.11);
  --hair: rgba(255, 255, 255, 0.1);
  --hair-strong: rgba(255, 255, 255, 0.18);
  --text: #f5f5f7;
  --muted: #b4b4bb;
  --dim: #8c8c94;
  --danger: #ff7a6b;
  --sans: "Edit Mode Geist", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif; /* bundled, loaded in main.js */
  --ease: cubic-bezier(0.23, 1, 0.32, 1); /* strong ease-out (Emil Kowalski) */
  --pad: rgba(151, 71, 255, 0.22); --pad-edge: rgba(151, 71, 255, 0.6); --pad-strong: #9747ff;
  --mar: rgba(255, 153, 0, 0.2); --mar-edge: rgba(255, 153, 0, 0.6);
  --lift: 0 0 0 0.5px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.05) inset, 0 12px 40px rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.25);
}
* { box-sizing: border-box; }
.ui { font: 12px/16px var(--sans); letter-spacing: 0.01em; /* Geist runs a touch tight at UI sizes (picked 2026-11-25) */
      color: var(--text); -webkit-font-smoothing: antialiased; }
.ui input, .ui textarea, .ui select, .ui button { letter-spacing: inherit; } /* browsers reset it on controls */
[hidden] { display: none !important; }
button { font: inherit; color: inherit; }
svg { display: block; }
kbd { display: inline-flex; align-items: center; justify-content: center; gap: 1px; box-sizing: border-box;
      height: 18px; min-width: 18px; padding: 0 4px; border-radius: 5px; vertical-align: middle;
      font: 500 10.5px/1 var(--sans); color: var(--muted); box-shadow: inset 0 0 0 1px var(--hair-strong); }
kbd .i { width: 11px; height: 11px; flex: none; }
.glassy { background: var(--glass); backdrop-filter: blur(24px) saturate(160%); -webkit-backdrop-filter: blur(24px) saturate(160%);
          box-shadow: var(--lift); border: 1px solid var(--hair); }

/* Glass: covers the page while editing so the app never sees hovers or clicks. */
.glass { position: fixed; inset: 0; pointer-events: auto; cursor: default; }
.dup-page { appearance: none; margin: 0; padding: 0; border: 0; position: fixed; left: 0; top: 0; pointer-events: auto; display: grid; place-items: center;
            width: 24px; height: 24px; border-radius: 6px; background: transparent; color: var(--on-canvas, rgba(0, 0, 0, .45)); cursor: pointer; }
.dup-page[hidden] { display: none; }
.dup-page svg { width: 14px; height: 14px; }
.dup-page:hover { background: rgba(0, 0, 0, .06); color: rgba(0, 0, 0, .8); }
.dup-page:active { scale: .95; }
.dup-page:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.glass.dragging { cursor: grabbing; }

/* ---------- Canvas ---------- */
.hover, .frame, .box, .ghost, .insert { position: fixed; pointer-events: none; }
.hover { border: 1px solid var(--accent); }
.frame { border: 1px solid var(--accent); }
.frame.editing .handle, .frame.editing .size { display: none; }
.frame.moving, .multis.moving { opacity: .35; }
.frame.group .size { transform: translate(-50%, 27px); } /* below the selected elements' own labels */
.box.padding { background: var(--pad); outline: 1px dashed var(--pad-edge); outline-offset: -1px; }
.box.gap { background: repeating-linear-gradient(45deg, var(--pad) 0 3px, transparent 3px 6px); outline: 1px dashed var(--pad-edge); outline-offset: -1px; }
/* Padding and gap handles (spacing.js): grab zones on a selected auto-layout frame */
.sz { position: fixed; pointer-events: auto; }
.spacing.pass .sz { pointer-events: none; }
.sz.y { cursor: ns-resize; }
.sz.x { cursor: ew-resize; }
.sz .fill { position: absolute; display: none; background: var(--pad); }
.sz.on .fill { display: block; }
.sz .bar { position: absolute; left: 50%; top: 50%; background: var(--pad-strong); border-radius: 1px;
           box-shadow: 0 0 0 1px rgba(255,255,255,.85); transform: translate(-50%, -50%); }
.sz.padding.y .bar, .sz.gap.y .bar { width: 12px; height: 2px; }
.sz.padding.x .bar, .sz.gap.x .bar { width: 2px; height: 12px; }
.sz-label { position: fixed; transform: translate(-50%, -50%); pointer-events: none; background: var(--pad-strong); color: #fff;
            padding: 1px 5px; border-radius: 3px; font: 500 10.5px/14px var(--sans); font-variant-numeric: tabular-nums; white-space: nowrap; }
.box.margin { background: var(--mar); outline: 1px dashed var(--mar-edge); outline-offset: -1px; }
.target { position: fixed; pointer-events: none; outline: 2px solid var(--accent); outline-offset: -1px; border-radius: 2px;
          background: rgba(13, 153, 255, 0.05); }
.ghost { border: 1px solid var(--accent); background: rgba(13, 153, 255, 0.08); border-radius: 2px; }
.insert { background: var(--accent); border-radius: 2px; box-shadow: 0 0 0 1px rgba(255,255,255,.9), 0 0 12px rgba(13,153,255,.6); }

.handle { position: absolute; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; background: #fff;
          border: 1px solid var(--accent); border-radius: 1px; pointer-events: auto; }
.rot { position: absolute; width: 16px; height: 16px; pointer-events: auto; cursor: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2720%27%20height%3D%2720%27%20viewBox%3D%27-2%20-2%2028%2028%27%20fill%3D%27none%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cg%20stroke%3D%27white%27%20stroke-width%3D%275%27%3E%3Cpath%20d%3D%27M21%2012a9%209%200%201%201-9-9c2.52%200%204.93%201%206.74%202.74L21%208%27%20/%3E%3Cpath%20d%3D%27M21%203v5h-5%27%20/%3E%3C/g%3E%3Cg%20stroke%3D%27black%27%20stroke-width%3D%272%27%3E%3Cpath%20d%3D%27M21%2012a9%209%200%201%201-9-9c2.52%200%204.93%201%206.74%202.74L21%208%27%20/%3E%3Cpath%20d%3D%27M21%203v5h-5%27%20/%3E%3C/g%3E%3C/svg%3E") 10 10, crosshair; } /* Lucide rotate-cw */
.rot[data-dir="nw"] { left: -20px; top: -20px; }
.rot[data-dir="ne"] { left: calc(100% + 4px); top: -20px; }
.rot[data-dir="sw"] { left: -20px; top: calc(100% + 4px); }
.rot[data-dir="se"] { left: calc(100% + 4px); top: calc(100% + 4px); }
.frame.editing .rot, .frame.passive .rot { display: none; }
.handle[data-dir="nw"] { left: 0; top: 0; cursor: nwse-resize; }
.handle[data-dir="n"]  { left: 50%; top: 0; cursor: ns-resize; }
.handle[data-dir="ne"] { left: 100%; top: 0; cursor: nesw-resize; }
.handle[data-dir="w"]  { left: 0; top: 50%; cursor: ew-resize; }
.handle[data-dir="e"]  { left: 100%; top: 50%; cursor: ew-resize; }
.handle[data-dir="sw"] { left: 0; top: 100%; cursor: nesw-resize; }
.handle[data-dir="s"]  { left: 50%; top: 100%; cursor: ns-resize; }
.handle[data-dir="se"] { left: 100%; top: 100%; cursor: nwse-resize; }
.size { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 7px);
        background: var(--accent); color: #fff; padding: 1px 5px; border-radius: 3px;
        font: 500 10.5px/14px var(--sans); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ---------- Dock: dialogs + pill ---------- */
.dock { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
        display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; }
.pill { display: flex; align-items: center; height: 38px; padding: 0 4px; gap: 2px; border-radius: 12px;
        pointer-events: auto; user-select: none; }
.toggle { all: unset; display: flex; align-items: center; gap: 9px; height: 30px; padding: 0 10px 0 9px;
          border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--muted); }
.toggle:hover { background: var(--field); color: var(--text); }
.toggle[aria-pressed="true"] { color: var(--text); }
.toggle:disabled { cursor: default; }
.switch { position: relative; width: 26px; height: 16px; border-radius: 8px; background: rgba(255,255,255,.12);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); transition: background-color 160ms ease; }
.switch i { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #d6d6da;
            box-shadow: 0 1px 2px rgba(0,0,0,.4); transition: transform 160ms var(--ease), background-color 160ms ease; }
[aria-pressed="true"] .switch { background: var(--accent); box-shadow: 0 0 10px rgba(13,153,255,.45); }
[aria-pressed="true"] .switch i { transform: translateX(10px); background: #fff; }
.toggle kbd { margin-left: 1px; }
.pill-end { display: flex; align-items: center; }
.sep { width: 1px; height: 16px; background: var(--hair-strong); margin: 0 4px; }
.act { all: unset; display: flex; align-items: center; gap: 7px; height: 30px; padding: 0 10px; border-radius: 8px;
       cursor: pointer; font-size: 12px; font-weight: 500; color: var(--text); }
.act:hover { background: var(--field); }
.act:disabled { color: var(--dim); cursor: default; background: none; }
.act .n { font: 600 10.5px/16px var(--sans); font-variant-numeric: tabular-nums; min-width: 16px; padding: 0 4px; border-radius: 5px; text-align: center;
          background: var(--accent-soft); color: var(--accent-text); }
.status { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px; color: var(--muted); font-size: 12px; }
.spin { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--hair-strong); border-top-color: var(--accent);
        animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.toggle:focus-visible, .act:focus-visible, .pbtn:focus-visible, .icon:focus-visible, .seg button:focus-visible,
.pick:focus-visible, .sw:focus-visible, .dd:focus-visible, .swatch:focus-visible, .pop-item:focus-visible
  { outline: 1.5px solid var(--accent); outline-offset: 1px; }

.dialog { width: 400px; max-width: calc(100vw - 32px); padding: 16px; border-radius: 14px; pointer-events: auto; }
.dialog h3 { margin: 0; font-size: 13px; font-weight: 600; }
.dialog p { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 17px; }
.list-wrap { position: relative; margin-top: 12px; }
.list { list-style: none; margin: 0; padding: 8px 10px; border-radius: 8px; background: rgba(0,0,0,.25);
        box-shadow: inset 0 0 0 1px var(--hair); font: 12px/20px var(--sans); color: var(--text);
        max-height: 82px; overflow: hidden; }
.list.open { max-height: 40vh; overflow-y: auto; }
.list li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 12px; position: relative; }
.list li::before { content: ""; position: absolute; left: 1px; top: 8px; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
.list-wrap .more { all: unset; display: block; margin-top: 6px; color: var(--muted); font-size: 11px; cursor: pointer; }
.list-wrap .more:hover { color: var(--text); }
.dialog h4.sec { display: flex; align-items: center; gap: 8px; margin: 14px 0 0; font-size: 11px; font-weight: 600; color: var(--muted); }
.dialog h4.sec .tag { padding: 1px 6px; border-radius: 4px; background: var(--field); color: var(--dim); font-weight: 500; }
.copyrow { margin-top: 4px; height: 26px; color: var(--text); font-size: 12px; }
.copyrow .name { flex: 1; }
.copyrow .n { color: var(--dim); font-variant-numeric: tabular-nums; }
.copyrow + .list-wrap { margin-top: 2px; }
.list-wrap.off .list { opacity: .4; }
.list li:has(.scope) { display: flex; align-items: center; gap: 8px; }
.list li .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.list li .scope { all: unset; flex: none; padding: 0 6px; border-radius: 4px; background: var(--field); color: var(--muted); font-size: 11px; line-height: 18px; cursor: pointer; }
.list li .scope:hover { background: var(--field-hover); color: var(--text); }
.list li.conflict::before { background: var(--danger); }
.list.designs { max-height: none; }
.list li.design { display: flex; align-items: center; gap: 8px; height: 26px; }
.list li.design-width { display: flex; align-items: center; gap: 8px; height: 26px; padding-left: 24px; color: var(--muted); }
.list li.design-width[hidden] { display: none; }
.list li.design-width { margin-top: 8px; } /* breathing room under its design's buttons (DESIGN.md: 8px between rows) */
.list li.design-width + li.design, .list li.design + li.design { margin-top: 12px; } /* each design reads as one group */
.list li.design-width .text { flex: 1; }
.list li.design-width::before { display: none; }
.list li.design .text { flex: 0 1 auto; min-width: 48px; max-width: 50%; overflow: hidden; text-overflow: ellipsis; }
.list li.design .where { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
.list li.design .spot { all: unset; flex: 1 1 0; text-align: left; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent-text); font-size: 11px; cursor: pointer; }
.list li.design .spot:hover { text-decoration: underline; }
.seg { flex: none; display: flex; padding: 1px; border-radius: 5px; background: var(--field); }
.seg button { all: unset; padding: 0 6px; border-radius: 4px; color: var(--muted); font-size: 11px; line-height: 18px; cursor: pointer; }
.seg button:hover { color: var(--text); }
.seg button.on { background: var(--field-hover); color: var(--text); box-shadow: 0 0 0 1px var(--hair-strong); }
.list li.conflict .text, .list li.conflict:not(:has(.text)) { color: var(--danger); }
.conv { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--hair);
        color: var(--muted); font-size: 12px; line-height: 17px; }
.conv > span:first-child { flex: 1; }
.conv .pbtn { flex: none; }
.actions { display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 14px; }
.actions .hint { margin-right: auto; color: var(--dim); font-size: 11px; }
.pbtn { all: unset; display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-radius: 7px;
        font-size: 12px; font-weight: 500; cursor: pointer; }
.pbtn.primary { background: var(--accent); color: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.12) inset, 0 4px 14px rgba(13,153,255,.3); }
.pbtn.primary:hover { background: #2aa5ff; }
.pbtn.primary kbd { color: rgba(255,255,255,.75); box-shadow: inset 0 0 0 1px rgba(255,255,255,.3); }
.pbtn.ghost { color: var(--muted); }
.pbtn.ghost:hover { background: var(--field); color: var(--text); }
.pbtn:disabled { opacity: .5; cursor: default; }
.pbtn.ghost:disabled:hover { background: none; color: var(--muted); }

.toast { max-width: 440px; padding: 10px 12px; border-radius: 12px; pointer-events: auto;
         font-size: 12px; line-height: 17px; display: flex; gap: 10px; align-items: flex-start; cursor: default; }
.toast b { font-weight: 600; color: var(--accent-text); white-space: nowrap; }
.toast.err b { color: var(--danger); }

/* ---------- Panel ---------- */
.mline { position: fixed; background: #f24822; pointer-events: none; }
.sguide { position: fixed; background: #f24822; pointer-events: none; }
.sbox { position: fixed; outline: 1px solid #f24822; outline-offset: -1px; pointer-events: none; }
.mlabel { position: fixed; transform: translate(-50%, -50%); background: #f24822; color: #fff; padding: 1px 4px; border-radius: 3px;
          font: 500 10.5px/14px var(--sans); font-variant-numeric: tabular-nums; pointer-events: none; white-space: nowrap; }
.mtarget { position: fixed; outline: 1px solid #f24822; pointer-events: none; }
.ui-hidden .side, .ui-hidden .tools, .ui-hidden .pop, .ui-hidden .layers, .ui-hidden .zmenu { display: none !important; }

/* ---------- Layers ---------- */
.layers { position: fixed; top: 12px; left: 12px; width: 240px; max-height: calc(100vh - 24px);
          display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; pointer-events: auto; user-select: none; }
.lh { display: flex; align-items: center; height: 40px; padding: 0 12px; border-bottom: 1px solid var(--hair); flex: none;
      font-weight: 600; font-size: 12px; }
.lh .lraw { margin-left: auto; display: grid; width: 24px; height: 24px; }
.lh .lraw .i { width: 14px; height: 14px; }
.lh .lraw.on { color: var(--accent-text); background: var(--accent-soft); }
.lb { position: relative; overflow-y: auto; min-height: 0; padding: 4px; overscroll-behavior: contain;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent; }
.lrow { display: flex; align-items: center; height: 28px; padding-right: 4px; border-radius: 6px; cursor: default;
        color: var(--muted); }
.lrow:hover, .lrow.hov { background: var(--field); color: var(--text); }
.lrow.in-sel { background: rgba(13, 153, 255, 0.07); }
.lrow.sel { background: var(--accent-soft); color: var(--text); }
.lrow.sel .licon { color: var(--accent-text); }
.lrow.dim .licon, .lrow.dim .lname { opacity: .45; }
.caret { flex: none; display: grid; place-items: center; width: 16px; height: 28px; color: var(--dim); }
.caret .i { width: 10px; height: 10px; transition: transform .12s var(--ease); }
.caret.open .i { transform: rotate(90deg); }
.caret:not(.none):hover { color: var(--text); }
.licon { flex: none; display: grid; place-items: center; width: 16px; margin-right: 6px; color: var(--dim); }
.licon .i { width: 12px; height: 12px; }
.lname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lbtn { all: unset; flex: none; display: none; place-items: center; width: 22px; height: 22px; border-radius: 5px; color: var(--dim); cursor: pointer; }
.lbtn .i { width: 12px; height: 12px; }
.lrow .lbtn.dup { display: grid; margin-left: auto; }
.align-row { display: flex; gap: 8px; padding: 12px; } /* even top and bottom: no rows below it adding space */
.align-row .align-seg { flex: 1; min-width: 0; }
.align-row .align-seg button { padding: 0; min-width: 0; color: var(--muted); }
.align-row .align-seg button:disabled { opacity: .35; cursor: default; }
.align-row .align-seg button:disabled:hover { color: var(--muted); }
.checkrow { display: flex; align-items: center; gap: 8px; height: 28px; color: var(--muted); cursor: pointer; }
.checkrow input { appearance: none; display: grid; place-items: center; margin: 0; width: 14px; height: 14px; border-radius: 4px;
                  border: 1px solid var(--hair-strong); background: var(--field); cursor: pointer; }
.checkrow input:checked, .checkrow input:indeterminate { border-color: var(--accent); background: var(--accent) center / 10px no-repeat; }
.checkrow input:checked { background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\"); } /* Lucide check */
.checkrow input:indeterminate { background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round'%3E%3Cpath d='M5 12h14'/%3E%3C/svg%3E\"); } /* Lucide minus */
.checkrow input:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }
.checkrow:hover { color: var(--text); }
.lbtn:hover { color: var(--text); background: var(--field-hover); }
.lrow:hover .lbtn, .lbtn.on { display: grid; }
.lrow:not(:hover) .lbtn.lock.on + .lbtn.eye:not(.on) { visibility: hidden; display: grid; }
.lbtn:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }
.layers.dragging .lrow { cursor: grabbing; }
.layers.dragging .lrow:hover:not(.into) { background: none; }
.lrow.into { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
.lresize { position: absolute; top: 0; right: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.lresize:hover, .layers.resizing .lresize { box-shadow: inset -2px 0 0 var(--accent); }
.layers.resizing { user-select: none; }
.ldrop { position: absolute; right: 8px; height: 2px; border-radius: 1px; background: var(--accent); pointer-events: none;
         box-shadow: 0 0 0 1px rgba(255,255,255,.9); }
.tsep { width: 1px; height: 16px; background: var(--hair-strong); margin: 0 3px; align-self: center; }

.side { position: fixed; top: 12px; right: 12px; width: 252px; max-height: calc(100vh - 24px);
        display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; pointer-events: auto; user-select: none; }
.ph { padding: 14px 12px 12px; border-bottom: 1px solid var(--hair); flex: none; }
.ph-row { display: flex; align-items: center; gap: 2px; }
.ph-name { flex: 1; min-width: 0; font: 500 12px/18px var(--sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-meta { font: 11px/16px var(--sans); color: var(--muted); margin-top: 1px; white-space: pre; overflow: hidden; text-overflow: ellipsis; }
.scope { margin-top: 10px; }

.pb { overflow-y: auto; min-height: 0; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent; }
section { padding: 16px 12px 8px; border-top: 1px solid var(--hair); } /* "Grouped" spacing, picked 2026-11-25 */
section:first-child { border-top: 0; }
section.empty { padding: 8px 12px; } /* 40px tall */
.sh { display: flex; align-items: center; justify-content: space-between; height: 24px; margin-bottom: 10px; }
section.empty .sh { margin-bottom: 0; }
h4 { margin: 0; font-size: 12px; font-weight: 600; color: var(--text); }
.sub { display: flex; align-items: center; justify-content: space-between; height: 22px; margin: 0 0 6px; }
.cap { color: var(--muted); font-size: 11.5px; }
.sb > .cap { display: block; margin-bottom: 6px; } /* a label above a row (Canvas › Background) */
/* Groups inside a section (Auto layout, Padding, Margin, Clip content) start 16px below the rows before them; rows within a group stay 8px apart */
.sb > :is(.auto, .spacing, .checkrow):not(:first-child) { margin-top: 16px; }
.row { display: grid; gap: 8px; margin-bottom: 8px; } /* 8px rhythm (the "Tight" density, picked 2026-11-19) */
.row.two { grid-template-columns: 1fr 1fr; }
.row.four { grid-template-columns: repeat(4, 1fr); gap: 4px; }
.sh-acts { display: flex; align-items: center; gap: 4px; }
/* Constrain proportions on: W and H read as one linked pair */
.row.linked { position: relative; }
.row.linked > .field { box-shadow: inset 0 0 0 1px rgba(13,153,255,.45); }
.row.linked::after { content: ""; position: absolute; left: 50%; top: 50%; width: 8px; height: 1.5px; border-radius: 1px;
                     transform: translate(-50%, -50%); background: var(--accent); pointer-events: none; }
.f { min-width: 0; }
.f > .cap { display: block; margin-bottom: 4px; }

.field { display: flex; align-items: center; height: 28px; min-width: 0; background: var(--field);
         border: 1px solid transparent; border-radius: 6px; position: relative; transition: background .12s, border-color .12s; }
.field:hover { background: var(--field-hover); }
.field:focus-within { border-color: var(--accent); background: rgba(13,153,255,.06); }
.field.bad { border-color: var(--danger); }
.pre { flex: none; display: grid; place-items: center; width: 26px; height: 100%; color: var(--muted); font-size: 11px; font-weight: 500; }
.pre.scrub, .cap.scrub { cursor: ew-resize; }
.pre.scrub:hover { color: var(--text); }
.row.four .pre { width: 18px; }
.pre.txt { width: 20px; }
.pre.txt.long { width: 40px; } /* Min W, Max H */
.pop-sep { height: 1px; margin: 4px 0; background: var(--hair); }
.fx-list:empty { display: none; }
.linkbox { position: fixed; z-index: 3; width: 260px; padding: 6px; border-radius: 10px; pointer-events: auto; }
.linkbox[hidden] { display: none; }
.linkbox input { height: 28px; padding: 0 8px; border-radius: 6px; background: var(--field); }
.layers-list { position: relative; }
.layers-list > .grad { margin-bottom: 8px; }
.flrow > .dd.kind { flex: 1; min-width: 0; }
.fl-drop { position: absolute; left: 0; right: 0; height: 2px; border-radius: 1px; background: var(--accent); pointer-events: none; }
.fx + .fx { padding-top: 8px; border-top: 1px solid var(--hair); }
.fx .crow > .f:first-child { min-width: 0; }
.mode-tag + .pick { margin-right: 0; }
input { border: 0; outline: none; background: transparent; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
        color: inherit; padding: 0 0 0 8px; margin: 0; min-width: 0; width: 100%; height: 100%; }
input::selection { background: rgba(13,153,255,.4); }
.pre + input { padding-left: 0; }
.mode-tag { color: var(--muted); font-size: 11px; padding: 0 2px 0 3px; white-space: nowrap; }
.mode-tag:empty { display: none; }
.sfx { color: var(--dim); padding-right: 8px; font-size: 11px; }
.dd { all: unset; box-sizing: border-box; display: flex; align-items: center; width: 100%; height: 28px; padding: 0 4px 0 8px;
      background: var(--field); border: 1px solid transparent; border-radius: 6px; cursor: pointer; font-size: 12px; }
.dd:hover { background: var(--field-hover); }
.dd-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { display: flex; color: var(--muted); }

.icon, .pick { all: unset; flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px;
               color: var(--muted); cursor: pointer; transition: background .12s, color .12s; }
.icon:hover, .pick:hover { background: var(--field-hover); color: var(--text); }
.icon.on { color: var(--accent-text); }
.pick { width: 20px; height: 20px; margin-right: 3px; }

.seg { display: flex; padding: 2px; gap: 2px; border-radius: 7px; background: var(--field); }
.seg button { all: unset; flex: 1; display: grid; place-items: center; height: 24px; padding: 0 8px; border-radius: 5px;
              color: var(--muted); cursor: pointer; white-space: nowrap; font-size: 11.5px; font-weight: 500; }
.seg button:hover { color: var(--text); }
.seg button.on { background: rgba(255,255,255,.1); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.05); }
.row .seg button { padding: 0; }

.crow { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; }
.crow > .icon { width: 24px; height: 28px; } /* row actions (eye, ×): fixed slots, as tall as the field */
.crow > .field, .crow > .f { flex: 1; }
/* Selection colors: how many places use the color, in the row-action slot; "See all" under the list */
.vars-list { max-height: calc(100vh - 260px); overflow-y: auto; margin: 0 -12px; padding: 0 12px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.15) transparent; }
.field .vname { flex: 1; min-width: 0; padding-left: 8px; text-overflow: ellipsis; }
.field .vname[readonly] { cursor: default; }
.field .vhex { flex: none; width: 62px; padding-left: 8px; }
.sc-n { flex: none; width: 24px; text-align: center; color: var(--dim); font-size: 11px; font-variant-numeric: tabular-nums; }
.sc-more { all: unset; display: block; margin: 0 0 8px; color: var(--muted); font-size: 11px; cursor: pointer; }
.sc-more:hover { color: var(--text); }
.sc-more[hidden] { display: none; }
.crow.off .field, .off .crow .field, .off .row { opacity: .4; }
.color { padding-left: 8px; }
.swatch { all: unset; flex: none; width: 14px; height: 14px; border-radius: 4px; cursor: pointer; overflow: hidden;
          background: repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 6px 6px; }
.swatch i { display: block; width: 100%; height: 100%; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.18); }
.color .hex { padding-left: 8px; text-transform: uppercase; }
.divider { width: 1px; align-self: stretch; background: var(--hair); margin: 8px 0; }
.color .alpha { flex: none; width: 34px; padding-left: 8px; }
.color .sfx { padding: 0 7px 0 1px; }

.spacing .icon { width: 22px; height: 22px; }
.icon.split.on { background: var(--accent-soft); color: var(--accent-text); }
.crow.tight { margin-bottom: 0; gap: 4px; }
.crow.tight > .f { flex: 1; min-width: 0; }
.foot { flex: none; display: flex; justify-content: center; align-items: center; gap: 14px; padding: 9px 12px;
        border-top: 1px solid var(--hair); color: var(--dim); font-size: 11px; }
.foot span { display: flex; align-items: center; gap: 5px; }
.foot kbd { color: var(--muted); }

/* ---------- Popover ---------- */
.pop { position: fixed; z-index: 2; min-width: 150px; width: max-content; max-width: 240px; max-height: 300px; overflow-y: auto;
       padding: 4px; border-radius: 10px; pointer-events: auto; user-select: none; }
.pop:has(.sw-grid), .pop.colors { width: 240px; padding: 10px; max-height: none; }
/* The colour picker (dark, like the rest of the panel) */
.cp { margin-bottom: 10px; }
.cp-sv { position: relative; height: 164px; border-radius: 6px; cursor: crosshair; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); touch-action: none; }
.cp-tools { display: flex; align-items: center; gap: 8px; margin: 10px 0; }
.cp-bars { flex: 1; display: grid; gap: 8px; }
.cp-bar { position: relative; height: 12px; border-radius: 6px; cursor: pointer; touch-action: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.cp-hue { background: linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00); }
.cp-alpha { background: repeating-conic-gradient(#777 0 25%, #555 0 50%) 0 0 / 8px 8px; }
.cp-alpha-fill { position: absolute; inset: 0; border-radius: inherit; }
.cp-knob { position: absolute; width: 12px; height: 12px; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none;
           box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgba(0,0,0,.25), 0 1px 3px rgba(0,0,0,.4); }
.cp-bar .cp-knob { top: 50%; }
.cp-fields { margin-bottom: 2px; }
.cp-fields .hex { padding-left: 10px; }
.pop-title { color: var(--muted); font-size: 11px; margin: 0 0 6px; }
.pop.details { width: 200px; padding: 10px; }
.pop.fonts { width: 232px; max-height: none; overflow: hidden; padding: 8px; }
.pop.fonts .field { margin-bottom: 6px; }
.font-list { height: 280px; overflow-y: auto; margin: 0 -4px; padding: 0 4px; } /* a fixed height, so the menu doesn't jump as the list fills */
.font-list .pop-title { margin: 8px 0 4px 8px; }
.font-list .pop-title:first-child { margin-top: 2px; }
.font-list .pop-empty { white-space: normal; }
.pop.details .seg { margin-bottom: 10px; }
.pop.details .checkrow { height: 24px; }
.pop.details .lines { display: grid; grid-template-columns: 1fr 64px; align-items: center; gap: 8px; margin-top: 4px; }
.seg button:disabled { opacity: .35; cursor: default; }
.seg button:disabled:hover { color: var(--muted); }
.sw-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; margin-bottom: 10px; }
.sw { all: unset; aspect-ratio: 1; border-radius: 5px; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(255,255,255,.15); transition: transform 120ms var(--ease); }
@media (hover: hover) and (pointer: fine) { .sw:hover { transform: scale(1.1); } }
.sw.on { outline: 1.5px solid var(--accent); outline-offset: 1.5px; }
.pop-item { all: unset; display: block; box-sizing: border-box; width: 100%; padding: 5px 8px; border-radius: 6px; cursor: pointer;
            font-size: 12px; font-variant-numeric: tabular-nums; }
.pop-item:hover { background: var(--field-hover); }
.pop-item.on { color: var(--accent-text); }
.pop-item.off { color: var(--dim); cursor: default; }
.pop-item.off:hover { background: none; }
.pop-why { display: block; max-width: 200px; margin-top: 2px; font-size: 11px; line-height: 14px; color: var(--dim); white-space: normal; }
.pop-empty { color: var(--muted); padding: 6px; }

/* ---------- Tools, multi-select, gradients ---------- */
.tools { display: flex; gap: 2px; padding: 4px; border-radius: 12px; pointer-events: auto; }
.tools button { all: unset; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px;
                color: var(--muted); cursor: pointer; transition: background .12s, color .12s; }
.tools button:hover { background: var(--field); color: var(--text); }
.tools button.on { background: var(--accent); color: #fff; }
.tools button.layers-btn.on { background: var(--field-hover); color: var(--text); }
.tools button.zoom-btn { width: auto; min-width: 44px; padding: 0 8px; font: 500 11.5px/30px var(--sans); font-variant-numeric: tabular-nums; }
.tools button.zoom-btn.on { background: var(--field-hover); color: var(--text); }
.zmenu { position: fixed; z-index: 2; transform-origin: bottom left; min-width: 210px; padding: 4px; border-radius: 10px; pointer-events: auto; user-select: none; }
.zmenu button { all: unset; display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; box-sizing: border-box;
                height: 28px; padding: 0 8px; border-radius: 6px; font-size: 12px; color: var(--text); cursor: default; }
.zmenu button:hover:not(:disabled) { background: var(--accent); }
.zmenu button:hover:not(:disabled) kbd { color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
.zmenu button:disabled { color: var(--dim); }
.glass.grab { cursor: grab; }
.glass.panning { cursor: grabbing; }
.tools button:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }
.glass[data-tool="rect"], .glass[data-tool="ellipse"] { cursor: crosshair; }
.glass[data-tool="text"] { cursor: text; }
.ghost.round { border-radius: 50%; }
.frame.passive .handle { pointer-events: none; }
.field.mixed .hex { text-transform: none; }
.swatch.mixed i { background: linear-gradient(135deg, var(--text) 0 50%, var(--dim) 50%); }
.multi { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; }
.mbtn { all: unset; display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 8px; border-radius: 7px; cursor: pointer; }
.mbtn:hover { background: var(--field); }
.mbtn .i { color: var(--muted); }
.mbtn span { flex: 1; }
.grad { margin-bottom: 6px; }
.grad .crow { margin-bottom: 4px; }
.kind { flex: 1 !important; min-width: 0; color: var(--text); }
.kind .thumb { flex: none; width: 14px; height: 14px; margin-right: 6px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.18); }
.grad .crow > .f, .grad .crow > .fit { flex: 0 0 68px; }
.grad .crow.stop > .f { flex: 0 0 56px; }
.grad .crow.stop > .field { min-width: 0; }
.icon:disabled { opacity: .35; cursor: default; }
.icon:disabled:hover { background: none; color: var(--muted); }
/* Gradient stops: the bar (drag a handle, click the bar to add one) */
.gbar { padding: 2px 7px; margin-bottom: 8px; }
.gtrack { position: relative; height: 12px; border-radius: 4px; cursor: copy;
          background-image: var(--g, none), repeating-conic-gradient(#bbb 0 25%, #fff 0 50%);
          background-size: 100% 100%, 8px 8px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.18); }
.gstop { all: unset; position: absolute; top: 50%; width: 14px; height: 14px; box-sizing: border-box; padding: 2px;
         transform: translate(-50%, -50%); border-radius: 4px; background: #fff; cursor: grab;
         box-shadow: 0 1px 3px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.25); }
.gstop i { display: block; width: 100%; height: 100%; border-radius: 2px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.gstop.on { box-shadow: 0 1px 3px rgba(0,0,0,.45), 0 0 0 2px var(--accent); }
.gstop:focus-visible { outline: none; }
.gstop:active { cursor: grabbing; }
.types { margin-bottom: 10px; }
.types button { flex: 1 1 auto; padding: 0 4px; }
.pop:has(.types) { width: 252px; max-width: 252px; }

/* ---------- Motion: quick, small, and off when reduced motion is preferred ---------- */
/* What animates is what you see occasionally: dialogs, toasts, menus you
   click open. What you use constantly appears instantly: the panels, the
   toolbar (⌥E), Layers (⌥1), selection, hover and drag feedback. */
@keyframes rise { from { opacity: 0; transform: translateY(6px) scale(.98); } }
@keyframes grow { from { opacity: 0; transform: scale(.97); } }
@keyframes fade { from { opacity: 0; } }
.dialog, .toast { animation: rise 180ms var(--ease); }
.zmenu:not([hidden]) { animation: grow 120ms var(--ease); } /* from the % button (origin: bottom left) */
.pop { animation: grow 120ms var(--ease); } /* origin set in JS: the corner nearest its field */
.pill-end > * { animation: fade 180ms var(--ease); }
.pill { overflow: hidden; }

/* Press feedback: everything clickable gives a little (menu items don't, like native menus). */
.toggle, .act, .pbtn, .tools button, .mbtn, .dd {
  transition: background-color 120ms ease, color 120ms ease, transform 160ms var(--ease); }
.icon, .pick, .lbtn, .seg button, .swatch {
  transition: background-color 120ms ease, color 120ms ease, transform 160ms var(--ease); }
.toggle:active, .act:active:not(:disabled), .pbtn:active, .tools button:active, .mbtn:active, .dd:active { transform: scale(.97); }
.icon:active, .pick:active, .lbtn:active, .seg button:active, .swatch:active { transform: scale(.95); }
.zmenu button:focus-visible, .mbtn:focus-visible { outline: 1.5px solid var(--accent); outline-offset: 1px; }

@media (prefers-reduced-motion: reduce) {
  .dialog, .toast, .pop, .zmenu, .pill-end > * { animation: none !important; }
  .switch, .switch i, .caret .i, .sw { transition: none; }
}
`;
