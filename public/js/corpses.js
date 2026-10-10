// Corpse sprites: every monster rendered lying dead on the floor (tools/sprites3d/corpses.py),
// packed into one atlas. Usage:
//   import { loadCorpses, drawCorpse } from './corpses.js';
//   await loadCorpses();                       // once, at startup (resolves even if the files are missing)
//   drawCorpse(ctx, mnum, cellX, cellY[, {clip}]); // pixel coords of the cell's top-left; returns false if
//                                              // the atlas isn't loaded or has no corpse for mnum
// Corpses are drawn 1:1 (no scaling). A big monster's corpse can spill a few pixels outside its 24 px cell.

const CELL = 24;
// Where in the cell the corpse's footprint centre (the atlas anchor) sits.
const ANCHOR_X = 12, ANCHOR_Y = 14;

let atlas = null;   // { "<mnum>": [x, y, w, h, anchorX, anchorY] }
let image = null;
let loading = null;

export function loadCorpses(base = 'assets/') {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [map, img] = await Promise.all([
        fetch(base + 'corpses.json').then((r) => (r.ok ? r.json() : null)),
        new Promise((resolve) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = base + 'corpses.png';
        }),
      ]);
      if (map && img) { atlas = map; image = img; }
    } catch (e) {
      atlas = image = null;
    }
    return !!atlas;
  })();
  return loading;
}

export function corpsesReady() { return !!(atlas && image); }

export function hasCorpse(mnum) { return !!(atlas && image && atlas[mnum]); }

// opts.clip: clip to the cell (for per-cell baked layers, where pixels spilling into a
// neighbour would be painted over or left stale when only one cell is redrawn).
export function drawCorpse(ctx, mnum, cellX, cellY, opts) {
  const e = atlas && image && atlas[mnum];
  if (!e) return false;
  const [x, y, w, h, ax, ay] = e;
  const clip = opts && opts.clip;
  if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(cellX, cellY, CELL, CELL); ctx.clip(); }
  ctx.drawImage(image, x, y, w, h, Math.round(cellX + ANCHOR_X - ax), Math.round(cellY + ANCHOR_Y - ay), w, h);
  if (clip) ctx.restore();
  return true;
}

export const CORPSE_CELL = CELL;
