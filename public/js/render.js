// Gauntlet-style renderer for the real NetHack map.
// Terrain is baked per cell into a level canvas; monsters are actors with
// 4-direction animated sprite sheets that tween between cells; light is a
// per-cell lightmap plus point lights; combat is inferred from game messages.
import { COLNO, ROWNO, MG } from './game.js';
import TERRAIN_PROPS from './props/terrain.js';
import FURNITURE_PROPS from './props/furniture.js';
import TRAP_PROPS from './props/traps.js';
import FX_ART from './props/fx.js';
import { HERO_ANIM } from './heroanim.js';
import { heroSheet as composedHeroSheet } from './gear.js';

// hand-drawn art for features, traps and terrain details, by NetHack glyph name (see props/README.md)
const PROPS = { ...TERRAIN_PROPS, ...FURNITURE_PROPS, ...TRAP_PROPS };

export const T = 24;
const W = COLNO * T, H = ROWNO * T;
const TERRAIN_CLASSES = new Set(['stone', 'wall', 'doorway', 'opendoor', 'closeddoor', 'bars', 'tree', 'floor', 'darkfloor',
  'engraving', 'corr', 'litcorr', 'feature', 'water', 'ice', 'lava', 'trap', 'cloud', 'air', 'void']);
const OPEN_GROUND = new Set(['floor', 'darkfloor', 'engraving', 'corr', 'litcorr', 'doorway', 'opendoor', 'feature', 'trap',
  'water', 'ice', 'lava', 'cloud', 'air', 'bars', 'tree']);
const FX_CLASSES = new Set(['zap', 'explosion', 'swallow', 'warning', 'cursor']);

const THEMES = {
  main: { floor: ['#7a7468', '#6e685e', '#827a6c', '#746c62', '#686258'], seam: '#3a3630', corr: '#5a5248', cap: '#2a2a34', capHi: '#4a4a5a', face: '#56505e', faceHi: '#6a6474', mortar: '#3a3640', moss: true },
  mines: { floor: ['#6e5c48', '#665440', '#76624c', '#6a5844', '#5e4e3c'], seam: '#3a2e24', corr: '#54463a', cap: '#2e2620', capHi: '#4e4236', face: '#5e4e40', faceHi: '#726050', mortar: '#3a3028', moss: false, rough: true },
  gehennom: { floor: ['#5a3e3a', '#523834', '#62423c', '#4e3632', '#583c38'], seam: '#2a1a1a', corr: '#4a3230', cap: '#2a1618', capHi: '#4a2a2a', face: '#5a3434', faceHi: '#704040', mortar: '#2e1a1c', moss: false },
  sokoban: { floor: ['#6a7282', '#626a7a', '#707888', '#666e7e', '#5e6676'], seam: '#343a48', corr: '#545a68', cap: '#242a3a', capHi: '#3e4660', face: '#4e5a7a', faceHi: '#62709a', mortar: '#2e3448', moss: false },
  knox: { floor: ['#7a6a48', '#726242', '#82704c', '#766646', '#6c5c3e'], seam: '#3a3020', corr: '#5e5238', cap: '#302818', capHi: '#50442a', face: '#6e5c3a', faceHi: '#8a744a', mortar: '#3a301c', moss: false },
};
const DIRS = { S: 0, E: 1, N: 2, W: 3 };

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function hexrgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
const shade = (rgb, k) => [Math.min(255, rgb[0] * k) | 0, Math.min(255, rgb[1] * k) | 0, Math.min(255, rgb[2] * k) | 0];
const ease = (t) => 1 - (1 - t) * (1 - t);

function pxEllipse(rx, ry, a) {
  const c = document.createElement('canvas'); c.width = rx * 2 + 1; c.height = ry * 2 + 1;
  const x = c.getContext('2d'); x.fillStyle = `rgba(0,0,0,${a})`;
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i / rx) ** 2 + (j / (ry + 0.5)) ** 2 <= 1) x.fillRect(i + rx, j + ry, 1, 1);
  return c;
}
function ring(color, dark) {
  const R = 14, c = document.createElement('canvas'); c.width = R * 2 + 3; c.height = R + 3; const x = c.getContext('2d');
  for (let a = 0; a < 360; a += 1.5) for (const rr of [R - 1, R]) {
    const t = a * Math.PI / 180; x.fillStyle = rr === R ? color : dark;
    x.fillRect(Math.round(R + 1 + Math.cos(t) * rr), Math.round(R / 2 + 1 + Math.sin(t) * rr * 0.42), 1, 1);
  }
  return c;
}
function tinted(img, color) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function grayscale(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height); const p = d.data;
  for (let i = 0; i < p.length; i += 4) { const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11; p[i] = l * 0.92; p[i + 1] = l * 0.95; p[i + 2] = l; }
  x.putImageData(d, 0, 0); return c;
}

// Opaque bounds of a sheet's south-facing idle frame (cached on the sheet entry).
export function spriteBounds(e) {
  if (e.bounds) return e.bounds;
  const n = e.meta.size, c = document.createElement('canvas'); c.width = n; c.height = n;
  const x = c.getContext('2d'); x.drawImage(e.img, 0, 0, n, n, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data;
  let x0 = n, y0 = n, x1 = -1, y1 = -1;
  for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) if (d[(y * n + i) * 4 + 3] > 0) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  e.bounds = x1 < 0 ? [0, 0, n, n] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  return e.bounds;
}

// Lazily loaded 4-direction sprite sheets, one per monster (rows S,E,N,W; cols idle0 idle1 walk0-3 atk0-2)
class ActorSheets {
  constructor(manifest, onLoad) { this.m = manifest || {}; this.cache = new Map(); this.onLoad = onLoad; }
  get(mnum) {
    if (mnum < 0 || !this.m[mnum]) return null;
    let e = this.cache.get(mnum);
    if (!e) {
      e = { ready: false, meta: this.m[mnum] };
      this.cache.set(mnum, e);
      const img = new Image();
      img.onload = () => { e.img = img; e.ready = true; this.onLoad?.(mnum); };
      img.src = `assets/actors/${mnum}.png`;
    }
    if (!e.ready) return null;
    if (!e.white) { e.white = tinted(e.img, '#ffffff'); e.red = tinted(e.img, 'rgba(255,60,50,0.85)'); }
    return e;
  }
  gray(e) { if (!e.grayImg) e.grayImg = grayscale(e.img); return e.grayImg; }
}

export class Renderer {
  constructor(canvas, tiles, atlas, actorManifest, settings, items) {
    this.view = canvas; this.vctx = canvas.getContext('2d');
    this.items = items;                       // { cols, img18 } rendered item icons, one per object appearance
    this.objDescr = (o) => o;                 // replaced once the engine is up (appearances are shuffled per game)
    this.officialImg = null;                  // NetHack's own 16x16 tiles (Settings > Graphics)
    this.objGlyph = [new Map(), new Map()];   // [plain, piletop]: object type -> its glyph
    tiles.gobj.forEach((o, g) => {
      if (o < 0 || /body of /.test(tiles.gname[g])) return;
      const m = this.objGlyph[/^piletop /.test(tiles.gname[g]) ? 1 : 0];
      if (!m.has(o)) m.set(o, g);
    });
    this.corpseCache = new Map();
    this.tiles = tiles; this.atlas = atlas; this.settings = settings;
    this.sheets = new ActorSheets(actorManifest, (mnum) => this.onSheet(mnum));
    this.cls = tiles.gcls.map((i) => tiles.classes[i]);
    this.theme = tiles.gtheme.map((i) => tiles.themes[i]);
    const n = COLNO * ROWNO;
    this.glyph = new Int32Array(n).fill(-1);
    this.bk = new Int32Array(n).fill(-1);
    this.gflags = new Uint32Array(n);
    this.terrMem = new Int32Array(n).fill(-1);   // last terrain glyph seen at each cell
    this.dirty = new Uint8Array(n);
    this.anyDirty = false;
    this.terrain = document.createElement('canvas'); this.terrain.width = W; this.terrain.height = H;
    this.tctx = this.terrain.getContext('2d');
    this.decals = document.createElement('canvas'); this.decals.width = W; this.decals.height = H;
    this.dctx = this.decals.getContext('2d');
    this.lightCells = new Float32Array(n);
    this.lightTex = document.createElement('canvas'); this.lightTex.width = COLNO; this.lightTex.height = ROWNO;
    this.lightTexCtx = this.lightTex.getContext('2d');
    this.scene = document.createElement('canvas'); this.sctx = this.scene.getContext('2d');
    this.lightC = document.createElement('canvas'); this.lctx = this.lightC.getContext('2d');
    this.actors = new Map(); this.nextActor = 1;
    this.heroCell = { x: -1, y: -1 };
    this.objMem = new Int32Array(COLNO * ROWNO).fill(-1);
    this.liveProps = new Map();   // cell -> { x, y, prop }: props drawn every frame (tall or animated)
    this.particles = []; this.arcs = []; this.flashes = []; this.ghosts = []; this.pillars = [];
    this.pendingKills = []; this.levelTheme = 'main'; this.torches = []; this.lightSources = [];
    this.cam = { x: 0, y: 0, init: false }; this.shake = 0;
    // hit-stop freezes the animation clock: clock() is performance.now() minus the time spent frozen
    this.stopped = 0; this.stopFrom = 0; this.stopUntil = 0;
    this.initActions();
    this.lastCommit = 0; this.zoom = 2;
    this.shadows = { 48: pxEllipse(9, 3, 0.42), 64: pxEllipse(14, 4, 0.42), small: pxEllipse(7, 2, 0.4) };
    this.rings = { hero: ring('#5aa8ff', '#2a6ae0'), pet: ring('#7ae08a', '#2a8a4a') };
    addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------------ map input
  idx(x, y) { return y * COLNO + x; }
  mnumOf(g) { return g >= 0 ? this.tiles.gmon[g] : -1; }

  terrainClassAt(x, y, depth = 0) {
    if (x < 0 || y < 0 || x >= COLNO || y >= ROWNO) return 'void';
    const g = this.glyph[this.idx(x, y)];
    if (g < 0) return 'void';
    const gc = this.cls[g];
    if (TERRAIN_CLASSES.has(gc)) return gc === 'feature' || gc === 'trap' ? this.groundUnder(x, y, depth) : gc;
    return this.groundUnder(x, y, depth);
  }
  // NetHack doesn't say what is under a monster or object: use what we last saw there,
  // else guess from the neighbours (room floor vs corridor)
  groundUnder(x, y, depth) {
    const m = this.terrMem[this.idx(x, y)];
    if (m >= 0) { const c = this.cls[m]; return c === 'feature' || c === 'trap' ? 'floor' : c; }
    if (depth > 0) return 'floor';
    const counts = {};
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = this.terrainClassAt(x + dx, y + dy, depth + 1);
      if (['floor', 'darkfloor', 'corr', 'litcorr'].includes(c)) counts[c] = (counts[c] || 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : 'floor';
  }

  setCell(x, y, gi, bk) {
    if (x < 0 || y < 0 || x >= COLNO || y >= ROWNO) return;
    const i = this.idx(x, y);
    this.glyph[i] = gi.glyph;
    this.bk[i] = bk && bk.glyph >= 0 && bk.glyph < this.tiles.glyphs ? bk.glyph : -1;
    this.gflags[i] = gi.flags;
    const gc = this.cls[gi.glyph];
    this.stepSets.set(i, { g: gi.glyph, prev: this.objMem[i] }); this.missileCells.delete(i);   // (thrown-object tracking, see onDelay)
    if (TERRAIN_CLASSES.has(gc) && gc !== 'void') this.terrMem[i] = gi.glyph;
    else if (this.bk[i] >= 0 && !['stone', 'void'].includes(this.cls[this.bk[i]])) this.terrMem[i] = this.bk[i];
    if (gc === 'wall') this.levelTheme = this.theme[gi.glyph] || 'main';
    // objects last seen here (the hero or a monster standing on them hides them)
    if (gc === 'obj') this.objMem[i] = gi.glyph;
    else if (TERRAIN_CLASSES.has(gc)) this.objMem[i] = -1;
    this.markDirty(x, y);
  }
  markDirty(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < COLNO && ny < ROWNO) this.dirty[this.idx(nx, ny)] = 1;
    }
    this.anyDirty = true;
  }
  clearMap() {
    this.glyph.fill(-1); this.bk.fill(-1); this.gflags.fill(0); this.dirty.fill(1); this.terrMem.fill(-1); this.objMem.fill(-1); this.liveProps.clear(); this.anyDirty = true;
  }
  newLevel() {
    this.dctx.clearRect(0, 0, W, H);
    this.actors.clear(); this.particles = []; this.ghosts = [];
    this.cam.init = false;
  }
  setHero(x, y) { this.heroCell = { x, y }; }
  onSheet(mnum) {   // statues and corpses of this monster can now use its real sprite
    for (let i = 0; i < this.glyph.length; i++) {
      const g = this.glyph[i];
      if (g >= 0 && (this.cls[g] === 'statue' || this.tiles.gobj[g] >= 0) && this.mnumOf(g) === mnum) { this.dirty[i] = 1; this.anyDirty = true; }
    }
  }

  // ------------------------------------------------------------------ items
  // What icon an object glyph shows: a corpse of some monster, or the item cell of its appearance.
  itemOf(g) {
    const o = g >= 0 ? this.tiles.gobj[g] : -1;
    if (o < 0) return null;
    if (/^(piletop )?body of /.test(this.tiles.gname[g]) && this.tiles.gmon[g] >= 0) return { corpse: this.tiles.gmon[g], cell: o };
    let d = o;
    try { d = this.objDescr(o); } catch (e) { /* engine not ready */ }
    return { cell: d >= 0 ? d : o };
  }

  // A monster's sprite lying on its side, greyed and bloodied: px x px canvas (null until its sheet loads).
  corpseCanvas(mnum, px) {
    const key = mnum + ':' + px;
    if (this.corpseCache.has(key)) return this.corpseCache.get(key);
    const e = this.sheets.get(mnum);
    if (!e) return null;
    const [bx, by, bw, bh] = spriteBounds(e);
    const c = document.createElement('canvas'); c.width = px; c.height = px;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const k = Math.min((px * 0.96) / bh, (px * 0.7) / bw, px / 24 * 1.4);
    x.fillStyle = 'rgba(90,8,8,.55)';
    x.beginPath(); x.ellipse(px / 2, px * 0.62, bh * k * 0.5, bw * k * 0.32, 0, 0, Math.PI * 2); x.fill();
    x.save(); x.translate(px / 2, px * 0.6); x.rotate(-Math.PI / 2);
    x.drawImage(e.img, bx, by, bw, bh, Math.round(-bw * k / 2), Math.round(-bh * k / 2), Math.round(bw * k), Math.round(bh * k));
    x.restore();
    const d = x.getImageData(0, 0, px, px), p = d.data;
    for (let i = 0; i < p.length; i += 4) {     // drain the colour out
      const l = p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
      p[i] = (p[i] * 0.45 + l * 0.55) * 0.82; p[i + 1] = (p[i + 1] * 0.45 + l * 0.55) * 0.74; p[i + 2] = (p[i + 2] * 0.45 + l * 0.55) * 0.74;
    }
    x.putImageData(d, 0, 0);
    this.corpseCache.set(key, c);
    return c;
  }

  drawItem(ctx, g, ox, oy) {
    const it = this.itemOf(g);
    if (!it || !this.items) return false;
    if (it.corpse !== undefined) {
      const c = this.corpseCanvas(it.corpse, T);
      if (c) { ctx.drawImage(c, ox, oy); return true; }
    }
    const n = 18, cols = this.items.cols;
    ctx.drawImage(this.shadows.small, ox + T / 2 - 7, oy + T - 7);
    ctx.drawImage(this.items.img18, (it.cell % cols) * n, Math.floor(it.cell / cols) * n, n, n, ox + (T - n) / 2, oy + T - n - 3, n, n);
    return true;
  }

  // ------------------------------------------------------------------ terrain baking
  rebuildTerrain() {
    if (!this.anyDirty) return;
    this.anyDirty = false;
    const th = THEMES[this.levelTheme] || THEMES.main;
    for (let y = 0; y < ROWNO; y++) for (let x = 0; x < COLNO; x++) {
      const i = this.idx(x, y);
      if (!this.dirty[i]) continue;
      this.dirty[i] = 0;
      this.drawCell(x, y, th);
    }
    this.rebuildLight();
  }

  drawCell(x, y, th) {
    const ctx = this.tctx, ox = x * T, oy = y * T;
    const g = this.glyph[this.idx(x, y)];
    const tcls = this.terrainClassAt(x, y);
    ctx.clearRect(ox, oy, T, T);
    const wallTheme = g >= 0 && this.cls[g] === 'wall' ? (THEMES[this.theme[g]] || th) : th;
    const i = this.idx(x, y);
    this.liveProps.delete(i);
    // a hand-drawn prop for what's here, or for the remembered terrain under a monster/object
    const propG = g >= 0 && this.propOf(g) ? g : (this.terrMem[i] >= 0 && this.propOf(this.terrMem[i]) ? this.terrMem[i] : -1);
    const prop = propG >= 0 ? this.propOf(propG) : null;
    if (prop) {
      this.drawTerrainBase(x, y, th, tcls);   // floor (or the pool a prop stands in), then the prop
      const o = this.propCtx(x, y, th, 0);
      if (prop.kind === 'tall' || prop.animated) this.liveProps.set(i, { x, y, prop, o });
      else prop.draw(ctx, ox, oy, o);
      if (propG === g) return;   // the prop is the glyph itself; otherwise an object/monster sits on it
    } else switch (tcls) {
      case 'void': case 'stone': break;
      case 'wall': this.drawWall(x, y, wallTheme); break;
      case 'corr': case 'litcorr': this.drawCorridor(x, y, th, tcls === 'litcorr'); break;
      case 'water': this.drawLiquid(x, y, [24, 58, 120], [60, 120, 200]); break;
      case 'lava': this.drawLiquid(x, y, [150, 36, 10], [255, 150, 40]); break;
      case 'ice': this.drawLiquid(x, y, [150, 190, 220], [220, 240, 255], true); break;
      case 'closeddoor': this.drawDoor(x, y, th, false); break;
      case 'doorway': case 'opendoor': this.drawFloor(x, y, th); this.drawDoor(x, y, th, true, tcls === 'doorway'); break;
      default: this.drawFloor(x, y, th);
    }
    this.drawGlyphOn(x, y, g);
  }

  // what used to be drawCell's base terrain switch, for props standing on liquids/clouds
  drawTerrainBase(x, y, th, tcls) {
    if (tcls === 'water') this.drawLiquid(x, y, [24, 58, 120], [60, 120, 200]);
    else if (tcls === 'lava') this.drawLiquid(x, y, [150, 36, 10], [255, 150, 40]);
    else if (tcls === 'ice') this.drawLiquid(x, y, [150, 190, 220], [220, 240, 255], true);
    else this.drawFloor(x, y, th);
  }

  propOf(g) { return g >= 0 ? PROPS[this.tiles.gname[g].replace(/^cmap A /, '')] || null : null; }
  propCtx(x, y, th, t) {
    return { t, seed: (x * 73856093 ^ y * 19349663) >>> 0, theme: th,
      n: { N: this.terrainClassAt(x, y - 1), S: this.terrainClassAt(x, y + 1), E: this.terrainClassAt(x + 1, y), W: this.terrainClassAt(x - 1, y) } };
  }

  drawGlyphOn(x, y, g) {
    const ctx = this.tctx, ox = x * T, oy = y * T;
    if (g < 0) return;
    const c = this.cls[g], nm = this.tiles.gname[g];
    if (c === 'feature' && /staircase|ladder/.test(nm)) this.drawStairs(x, y, /down/.test(nm), /ladder/.test(nm));
    else if (c === 'statue') this.drawStatue(x, y, g);
    else if (c === 'obj' && this.missileCells.has(this.idx(x, y))) { /* in flight: drawn as a projectile instead */ }
    else if (c === 'obj' && this.drawItem(ctx, g, ox, oy)) { /* drawn */ }
    else if (['feature', 'trap', 'obj', 'bars', 'tree', 'cloud', 'air', 'engraving'].includes(c)) {
      if (c === 'obj') this.tctx.drawImage(this.shadows.small, ox + T / 2 - 7, oy + T - 7);
      this.blitTile(ctx, g, ox, oy, c === 'obj' ? 2 : 0);
    }
  }

  blitTile(ctx, glyph, ox, oy, lift = 0) {
    const t = this.tiles.g2t[glyph], cell = this.tiles.cell, cols = this.tiles.cols;
    const o = (T - cell) / 2;
    ctx.drawImage(this.atlas, (t % cols) * cell, Math.floor(t / cols) * cell, cell, cell, ox + o, oy + o - lift, cell, cell);
  }

  drawStatue(x, y, g) {
    const e = this.sheets.get(this.mnumOf(g));
    if (!e) { this.blitTile(this.tctx, g, x * T, y * T, 2); return; }
    const { size, feet } = e.meta;
    const gx = x * T + T / 2 - feet[0], gy = y * T + T - 3 - feet[1];
    this.tctx.save(); this.tctx.beginPath(); this.tctx.rect(x * T - T, y * T - T * 2, T * 3, T * 3); this.tctx.clip();
    this.tctx.drawImage(this.sheets.gray(e), 0, 0, size, size, gx, gy, size, size);
    this.tctx.restore();
  }

  drawFloor(x, y, th) {
    const ctx = this.tctx, ox = x * T, oy = y * T;
    const img = ctx.createImageData(T, T); const d = img.data;
    const tones = th.floor.map(hexrgb), seam = hexrgb(th.seam);
    const above = this.terrainClassAt(x, y - 1), left = this.terrainClassAt(x - 1, y);
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const ax = ox + px, ay = oy + py;
      const row = Math.floor(ay / 12), off = (row % 2) * 12;
      const sx = (ax + off) % 24, sy = ay % 12;
      const stone = (Math.floor((ax + off) / 24) * 31 + row * 17) % 5;
      let c = tones[stone];
      if (th.rough) c = tones[Math.floor(hash(ax >> 2, ay >> 2) * 5)];
      if (!th.rough && (sx === 0 || sy === 0)) c = seam;
      else if (!th.rough && (sy === 1 || sx === 1)) c = shade(c, 1.1);
      else if (!th.rough && (sy === 11 || sx === 23)) c = shade(c, 0.86);
      if (!th.rough && hash(Math.floor((ax + off) / 24), row, 4) < 0.25 && sx > 3 && sx < 20 && sy > 3 && sy < 9 && hash(ax, ay, 6) < 0.12) c = shade(c, 0.82);
      if (hash(ax, ay, 3) < 0.03) c = shade(c, 0.8);
      if (above === 'wall' && py < 6) c = shade(c, 0.45 + py * 0.1);
      if (left === 'wall' && px < 3) c = shade(c, 0.78 + px * 0.07);
      const k = (py * T + px) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    if (th.moss && (above === 'wall' || left === 'wall') && hash(x, y, 9) < 0.5) {
      for (let n = 0; n < 12; n++) {
        const px = Math.floor(hash(x, y, n) * (T - 2)) + 1, py = Math.floor(hash(y, x, n) * (T - 2)) + 1;
        const k = (py * T + px) * 4; const mc = hash(x + n, y) < 0.5 ? [74, 106, 52] : [94, 130, 64];
        d[k] = mc[0]; d[k + 1] = mc[1]; d[k + 2] = mc[2];
      }
    }
    ctx.putImageData(img, ox, oy);
    if (th === THEMES.main && hash(x, y, 77) < 0.025) {           // occasional drain grate
      ctx.fillStyle = '#24221e'; ctx.fillRect(ox + 5, oy + 7, 14, 10);
      ctx.fillStyle = '#4a463e'; for (let gx = 6; gx < 19; gx += 3) ctx.fillRect(ox + gx, oy + 8, 1, 8);
    }
  }

  drawCorridor(x, y, th, lit) {
    const ctx = this.tctx, ox = x * T, oy = y * T;
    const img = ctx.createImageData(T, T); const d = img.data;
    const base = hexrgb(th.corr);
    const open = (dx, dy) => OPEN_GROUND.has(this.terrainClassAt(x + dx, y + dy));
    const n = open(0, -1), s = open(0, 1), w = open(-1, 0), e = open(1, 0);
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const ax = ox + px, ay = oy + py;
      let c = hash(ax, ay) < 0.15 ? shade(base, 0.86) : base;
      if (hash(ax >> 1, ay >> 1, 5) < 0.04) c = shade(base, 1.3);
      let edge = 99;
      if (!n) edge = Math.min(edge, py); if (!s) edge = Math.min(edge, T - 1 - py);
      if (!w) edge = Math.min(edge, px); if (!e) edge = Math.min(edge, T - 1 - px);
      if (edge < 4 && hash(ax, ay, 8) < 0.9 - edge * 0.22) c = [20, 18, 16];
      if (lit) c = shade(c, 1.08);
      const k = (py * T + px) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    ctx.putImageData(img, ox, oy);
  }

  drawWall(x, y, th) {
    const ctx = this.tctx, ox = x * T, oy = y * T;
    // wall tops a little brighter than the dark around them, with a lit rim facing the room
    const cap = shade(hexrgb(th.cap), 1.3), capHi = shade(hexrgb(th.capHi), 1.45), face = hexrgb(th.face), faceHi = hexrgb(th.faceHi), mortar = hexrgb(th.mortar);
    const img = ctx.createImageData(T, T); const d = img.data;
    const below = this.terrainClassAt(x, y + 1);
    const hasFace = OPEN_GROUND.has(below) || below === 'closeddoor';
    const n = this.terrainClassAt(x, y - 1), w = this.terrainClassAt(x - 1, y), e = this.terrainClassAt(x + 1, y);
    const faceTop = 9;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const ax = ox + px, ay = oy + py;
      let c = hash(ax, ay) < 0.2 ? shade(cap, 0.88) : cap;
      if (th.rough) c = shade(cap, 0.85 + hash(ax >> 1, ay >> 1) * 0.3);
      if (py <= 1 && n !== 'wall') c = capHi;
      if (px <= 1 && OPEN_GROUND.has(w)) c = capHi;
      if (px >= T - 2 && OPEN_GROUND.has(e)) c = capHi;
      if (py >= T - 2 && !hasFace && OPEN_GROUND.has(below)) c = capHi;
      if (hasFace && py >= faceTop) {
        const yy = py - faceTop, row = Math.floor(yy / 5);
        const isMortar = th.rough ? hash(ax >> 1, ay >> 1, 4) < 0.18 : ((yy % 5) === 4 || ((ax + (row % 2) * 8) % 16) === 0);
        c = isMortar ? mortar : ((yy % 5) === 0 ? faceHi : face);
        if (!isMortar && !th.rough && hash(Math.floor((ax + (row % 2) * 8) / 16), row + oy, 2) < 0.3) c = shade(c, 0.9);
        if (th.rough && !isMortar) c = shade(face, 0.85 + hash(ax >> 1, ay >> 1, 2) * 0.35);
        if (py === faceTop) c = shade(faceHi, 1.15);
        if (py >= T - 2) c = shade(c, 0.75);
      }
      const k = (py * T + px) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    ctx.putImageData(img, ox, oy);
  }

  drawDoor(x, y, th, open, doorway = false) {
    const ctx = this.tctx, ox = x * T, oy = y * T;
    const wallsLR = this.terrainClassAt(x - 1, y) === 'wall' || this.terrainClassAt(x + 1, y) === 'wall';
    if (!open) {
      this.drawWall(x, y, th);
      ctx.fillStyle = '#5a3418'; ctx.fillRect(ox + 4, oy + 4, 16, 20);
      ctx.fillStyle = '#8a5a2c'; for (let gx = 5; gx < 19; gx += 4) ctx.fillRect(ox + gx, oy + 5, 3, 18);
      ctx.fillStyle = '#b07a40'; for (let gx = 5; gx < 19; gx += 4) ctx.fillRect(ox + gx, oy + 5, 1, 18);
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(ox + 4, oy + 9, 16, 2); ctx.fillRect(ox + 4, oy + 18, 16, 2);
      ctx.fillStyle = '#c48a4c'; ctx.fillRect(ox + 4, oy + 4, 16, 1);
      ctx.fillStyle = '#ffd65c'; ctx.fillRect(ox + 15, oy + 13, 2, 2);
      return;
    }
    ctx.fillStyle = '#3e2610';
    if (wallsLR) { ctx.fillRect(ox, oy, 3, T); ctx.fillRect(ox + T - 3, oy, 3, T); }
    else { ctx.fillRect(ox, oy, T, 3); ctx.fillRect(ox, oy + T - 3, T, 3); }
    if (!doorway) {
      ctx.fillStyle = '#7a4e26'; ctx.fillStyle = '#8a5a2c';
      if (wallsLR) ctx.fillRect(ox + 3, oy + 1, 4, T - 2); else ctx.fillRect(ox + 1, oy + 3, T - 2, 4);
    }
  }

  drawStairs(x, y, down, ladder) {
    const ctx = this.tctx, ox = x * T, oy = y * T;
    if (ladder) {
      if (down) { ctx.fillStyle = '#0a0a0e'; ctx.fillRect(ox + 4, oy + 3, 16, 18); }
      ctx.fillStyle = '#8a5a2c'; ctx.fillRect(ox + 6, oy + 1, 2, 22); ctx.fillRect(ox + 16, oy + 1, 2, 22);
      ctx.fillStyle = '#b07a40'; for (let r = 4; r < 22; r += 4) ctx.fillRect(ox + 6, oy + r, 12, 1);
      return;
    }
    if (down) {
      ctx.fillStyle = '#08080c'; ctx.fillRect(ox + 2, oy + 2, 20, 20);
      const tones = ['#8a8478', '#6e685e', '#524e46', '#3a3731', '#26241f'];
      for (let s = 0; s < 5; s++) {
        ctx.fillStyle = tones[s]; ctx.fillRect(ox + 3 + s * 2, oy + 3 + s * 4, 18 - s * 2, 3);
        ctx.fillStyle = '#14120f'; ctx.fillRect(ox + 3 + s * 2, oy + 6 + s * 4, 18 - s * 2, 1);
      }
      ctx.fillStyle = '#3a3630'; ctx.fillRect(ox + 2, oy + 2, 20, 1); ctx.fillRect(ox + 2, oy + 2, 1, 20); ctx.fillRect(ox + 21, oy + 2, 1, 20);
    } else {
      const tones = ['#4a463e', '#5e5a50', '#746e62', '#8a8478', '#a09a8c', '#b4ae9e'];
      for (let s = 0; s < 6; s++) {
        ctx.fillStyle = tones[s]; ctx.fillRect(ox + 3, oy + 19 - s * 3.2, 18, 4);
        ctx.fillStyle = '#26231e'; ctx.fillRect(ox + 3, oy + 22 - s * 3.2, 18, 1);
      }
      ctx.fillStyle = '#d0c8b0'; ctx.fillRect(ox + 3, oy + 3, 18, 1);
    }
  }

  drawLiquid(x, y, deep, hi, solid = false) {
    const ctx = this.tctx, ox = x * T, oy = y * T;
    const img = ctx.createImageData(T, T); const d = img.data;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const ax = ox + px, ay = oy + py;
      const wave = Math.sin((ax + ay * 0.5) * 0.45) + Math.sin(ay * 0.9 - ax * 0.25);
      let c = wave > 1.3 ? hi : (wave > 0.6 ? shade(deep, 1.25) : deep);
      if (solid && hash(ax, ay) < 0.05) c = [255, 255, 255];
      const k = (py * T + px) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    ctx.putImageData(img, ox, oy);
  }

  // per-cell ambient light from what NetHack tells us is in view
  rebuildLight() {
    const L = this.lightCells;
    const base = (x, y) => {
      const c = this.terrainClassAt(x, y);
      const g = this.glyph[this.idx(x, y)];
      if (g >= 0 && this.cls[g] === 'mon') return 0.95;
      switch (c) {
        case 'floor': case 'feature': case 'trap': case 'water': case 'ice': case 'cloud': case 'air': case 'lava': return 1.0;
        case 'litcorr': return 0.85;
        case 'corr': return 0.5;
        case 'darkfloor': return 0.3;
        case 'doorway': case 'opendoor': return 0.8;
        default: return -1;
      }
    };
    for (let y = 0; y < ROWNO; y++) for (let x = 0; x < COLNO; x++) L[this.idx(x, y)] = base(x, y);
    for (let y = 0; y < ROWNO; y++) for (let x = 0; x < COLNO; x++) {
      const i = this.idx(x, y);
      if (L[i] >= 0) continue;
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLNO || ny >= ROWNO) continue;
        const v = base(nx, ny); if (v > m) m = v;
      }
      L[i] = this.terrainClassAt(x, y) === 'void' ? 0 : m * 0.92;
    }
    const img = this.lightTexCtx.createImageData(COLNO, ROWNO); const d = img.data;
    const bk = { dim: 0.82, normal: 1, bright: 1.22 }[this.settings.brightness] || 1, lift = this.settings.brightness === 'bright' ? 22 : 0;
    for (let i = 0; i < L.length; i++) {
      const v = Math.max(0, L[i]);
      d[i * 4] = Math.min(255, (26 + lift + v * 160) * bk); d[i * 4 + 1] = Math.min(255, (30 + lift + v * 166) * bk); d[i * 4 + 2] = Math.min(255, (52 + lift + v * 168) * bk); d[i * 4 + 3] = 255;
    }
    this.lightTexCtx.putImageData(img, 0, 0);
    this.torches = []; this.lightSources = []; this.exits = [];
    // doorways that lead somewhere you haven't been yet: they glow and get an arrow
    for (let y = 0; y < ROWNO; y++) for (let x = 0; x < COLNO; x++) {
      const c = this.terrainClassAt(x, y);
      if (c !== 'doorway' && c !== 'opendoor' && c !== 'closeddoor') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.terrainClassAt(x + dx, y + dy);
        if (n === 'stone' || n === 'void') {
          this.exits.push({ x, y, dx, dy });
          this.lightSources.push({ x, y, r: 46, rgb: '255,196,110', k: 0.42 });
          break;
        }
      }
    }
    for (let y = 0; y < ROWNO; y++) for (let x = 0; x < COLNO; x++) {
      const g = this.glyph[this.idx(x, y)];
      const below = y + 1 < ROWNO ? this.terrainClassAt(x, y + 1) : 'void';
      if (this.terrainClassAt(x, y) === 'wall' && below === 'floor' && (x * 7 + y * 3) % 6 === 0) this.torches.push({ x, y });
      if (g < 0) continue;
      const name = this.tiles.gname[g];
      if (/fountain/.test(name)) this.lightSources.push({ x, y, r: 60, rgb: '90,170,255', k: 0.55 });
      else if (/altar/.test(name)) this.lightSources.push({ x, y, r: 66, rgb: '255,205,120', k: 0.6 });
      else if (/throne/.test(name)) this.lightSources.push({ x, y, r: 66, rgb: '255,215,110', k: 0.5 });
      else if (this.cls[g] === 'lava' && (x + y) % 2 === 0) this.lightSources.push({ x, y, r: 54, rgb: '255,120,40', k: 0.45 });
    }
  }

  // ------------------------------------------------------------------ actors
  setDir(a, dx, dy, t) {
    if (!dx && !dy) return;
    const nd = Math.abs(dx) >= Math.abs(dy) && dx !== 0 ? (dx > 0 ? DIRS.E : DIRS.W) : (dy > 0 ? DIRS.S : DIRS.N);
    if (nd === a.dir) return;
    if ((nd + 2) % 4 === a.dir) { a.turnVia = (a.dir + 1) % 4; a.turnT = t; }   // about-face passes through a side view
    a.dir = nd;
  }

  commit() {
    this.rebuildTerrain();
    const t = this.clock();
    const gap = t - this.lastCommit; this.lastCommit = t;
    const speed = { instant: 0, snappy: 100, smooth: 170 }[this.settings.animSpeed] ?? 170;
    const dur = Math.max(0, Math.min(speed, gap * 0.9));
    const cur = [];
    for (let y = 0; y < ROWNO; y++) for (let x = 0; x < COLNO; x++) {
      const i = this.idx(x, y), g = this.glyph[i];
      if (g >= 0 && this.cls[g] === 'mon') cur.push({ x, y, g, f: this.gflags[i] });
    }
    // a thrown object NetHack draws on the hero's own cell (thrown into a wall) doesn't make the hero vanish
    const hc = this.heroCell, ha = this.heroActor();
    if (ha && ha.x === hc.x && ha.y === hc.y && this.missileCells.has(this.idx(hc.x, hc.y)) && !cur.some((c) => c.x === hc.x && c.y === hc.y)) cur.push({ x: hc.x, y: hc.y, g: ha.g, f: ha.f });
    const old = [...this.actors.values()];
    const used = new Set(), next = new Map();
    const take = (a, c) => { used.add(a.id); next.set(a.id, a); c.done = true; };
    for (const c of cur) {
      const a = old.find((a) => !used.has(a.id) && a.x === c.x && a.y === c.y && a.g === c.g);
      if (a) { a.f = c.f; take(a, c); }
    }
    for (const c of cur) {
      if (c.done) continue;
      let best = null, bd = 9;
      for (const a of old) {
        if (used.has(a.id) || a.g !== c.g) continue;
        const d = Math.max(Math.abs(a.x - c.x), Math.abs(a.y - c.y));
        if (d < bd && d <= 2) { bd = d; best = a; }
      }
      if (!best && (c.f & MG.HERO)) best = old.find((a) => !used.has(a.id) && a.hero);
      if (best) {
        const far = Math.max(Math.abs(best.x - c.x), Math.abs(best.y - c.y)) > 2;
        best.fx = far ? c.x : best.drawX(t); best.fy = far ? c.y : best.drawY(t);
        this.setDir(best, c.x - best.x, c.y - best.y, t);
        best.x = c.x; best.y = c.y; best.g = c.g; best.f = c.f; best.mt = t; best.md = far ? 0 : dur;
        if (!far) best.walkBase += 2;
        take(best, c);
      }
    }
    for (const c of cur) {
      if (c.done) continue;
      const same = old.find((a) => !used.has(a.id) && a.x === c.x && a.y === c.y);
      if (same) { same.g = c.g; same.f = c.f; take(same, c); continue; }
      const a = this.makeActor(c, t);
      next.set(a.id, a);
    }
    for (const a of old) {
      if (used.has(a.id)) continue;
      if (this.pendingKills.find((k) => k.actor === a)) this.deathFx(a, t);
    }
    this.pendingKills = this.pendingKills.filter((k) => t - k.t < 400 && next.has(k.actor.id));
    this.actors = next;
  }

  makeActor(c, t) {
    const h = this.heroCell;
    const a = {
      id: this.nextActor++, x: c.x, y: c.y, fx: c.x, fy: c.y, g: c.g, f: c.f, mt: t, md: 0, born: t,
      dir: DIRS.S, turnVia: 0, turnT: -1e9, walkBase: 0, atkT: -1e9,
      lunge: null, hurtT: -1e9, hurtCol: 'white', kb: { x: 0, y: 0 }, phase: Math.random() * 1000,
      get hero() { return !!(this.f & MG.HERO); },
      drawX(tt) { const k = this.md ? Math.min(1, (tt - this.mt) / this.md) : 1; return this.fx + (this.x - this.fx) * ease(k); },
      drawY(tt) { const k = this.md ? Math.min(1, (tt - this.mt) / this.md) : 1; return this.fy + (this.y - this.fy) * ease(k); },
      progress(tt) { return this.md ? Math.min(1, (tt - this.mt) / this.md) : 1; },
      moving(tt) { return this.md && tt - this.mt < this.md; },
    };
    if (!(c.f & MG.HERO) && h.x >= 0) this.setDir(a, h.x - c.x, h.y - c.y, -1e9);   // newcomers face the hero
    return a;
  }

  // The monster to hit with the action key: the one the hero faces, else the nearest (straight before diagonal).
  // Pets and the obviously peaceful are left alone (moving into them still works as in NetHack).
  attackTarget() {
    const h = this.heroCell, hero = this.heroActor();
    const facing = hero ? [[0, 1], [1, 0], [0, -1], [-1, 0]][hero.dir] : null;
    let best = null, bestScore = 9;
    for (const a of this.actors.values()) {
      if (a.hero || (a.f & MG.PET)) continue;
      const dx = a.x - h.x, dy = a.y - h.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) continue;
      if (/shopkeeper|priest|watch|guard|oracle|aligned/.test(this.monsterName(a))) continue;
      const score = facing && dx === facing[0] && dy === facing[1] ? 0 : (dx && dy ? 2 : 1);
      if (score < bestScore) { best = { dx, dy, a }; bestScore = score; }
    }
    return best;
  }
  heroActor() { for (const a of this.actors.values()) if (a.hero) return a; return null; }
  monsterName(a) { return this.tiles.gname[a.g].replace(/^(pet |detected |ridden )+/, '').replace(/^(male|female) /, ''); }

  findAdjacent(name) {
    const h = this.heroCell;
    let best = null;
    for (const a of this.actors.values()) {
      if (a.hero) continue;
      const d = Math.max(Math.abs(a.x - h.x), Math.abs(a.y - h.y));
      if (d > 1) continue;
      if (!name || this.monsterName(a) === name || name.endsWith(this.monsterName(a))) return a;
      best = best || a;
    }
    return best;
  }

  // ------------------------------------------------------------------ combat inferred from messages
  onMessage(msg) {
    const s = msg.trim();
    let m;
    const t = this.clock();
    if (this.actionMessage(s, t)) return;
    const C = T / 2;
    if ((m = s.match(/^You (hit|kill|destroy|smite|bite|kick|butt|sting|touch|bash|strike|thrust at|slash|miss) (?:the |your |an? )?(.+?)[!.]?$/i))) {
      const verb = m[1].toLowerCase();
      const target = this.findAdjacent(m[2].toLowerCase()) || this.findAdjacent(null);
      const hero = this.heroActor();
      if (!hero || !target) return;
      const dx = Math.sign(target.x - hero.x), dy = Math.sign(target.y - hero.y);
      this.setDir(hero, dx, dy, t); hero.atkT = t;
      hero.lunge = { dx, dy, t0: t + 60 };
      // the wielded weapon swings (or a fist jabs); kicks and bites keep the plain swipe
      if (!this.meleeSwing(hero, target, verb, t)) this.arcs.push({ x: hero.x * T + C, y: hero.y * T + C - 4, ang: Math.atan2(dy, dx), t0: t + 70, dur: 200 });
      this.setDir(target, -dx, -dy, t);
      if (verb !== 'miss') {
        target.hurtT = t + 110; target.hurtCol = 'white'; target.kb = { x: dx * 4, y: dy * 3 };
        this.flashes.push({ x: target.x * T + C, y: target.y * T + C, t0: t + 110 });
        setTimeout(() => {
          this.burst(target.x * T + C, target.y * T + C, 14, 'blood', { dir: Math.atan2(dy, dx), spread: 1.6, speed: 75, up: 30 });
          this.burst(target.x * T + C, target.y * T + C - 3, 7, 'spark', { dir: Math.atan2(dy, dx), spread: 2.4, speed: 90, up: 14, life: 0.35, z: 10 });
        }, 110);
        if (verb === 'kill' || verb === 'destroy') { this.pendingKills.push({ actor: target, t }); this.addShake(0.8); this.hitStop(110, 80); }
      }
    } else if ((m = s.match(/^(?:The |Your )?(.+?) (bites|hits|misses|touches|stings|butts|kicks|claws|thrusts|swings|lashes|smites|grabs|squeezes|tentacles)\b/))) {
      const a = this.findAdjacent(m[1].toLowerCase());
      const hero = this.heroActor();
      if (!a || !hero) return;
      const dx = Math.sign(hero.x - a.x), dy = Math.sign(hero.y - a.y);
      this.setDir(a, dx, dy, t); a.atkT = t + 40;
      a.lunge = { dx, dy, t0: t + 80 };
      this.setDir(hero, -dx, -dy, t);
      if (m[2] !== 'misses') {
        hero.hurtT = t + 140; hero.hurtCol = 'red';
        this.monsterHitMark(hero, m[2], dx, dy, t + 130);
        setTimeout(() => this.burst(hero.x * T + C, hero.y * T + C - 4, 6, 'blood', { speed: 36, up: 22 }), 140);
      }
    } else if (/You (are surrounded by a shimmering light|feel much better|feel a hopeful feeling)/.test(s)) {
      this.pillars.push({ t0: t, kind: 'holy' });
    } else if (/^Welcome to experience level/.test(s)) {
      this.pillars.push({ t0: t, kind: 'level' });
      const h = this.heroCell; this.burst(h.x * T + C, h.y * T + C, 26, 'holy', { up: 70, speed: 40, life: 1.2 });
    } else if (/^You die/.test(s)) {
      const h = this.heroActor(); if (h) { h.hurtT = t; h.hurtCol = 'red'; this.splat(h.x * T + C, h.y * T + C + 4, 11); }
    }
  }

  heroHurt(n) { if (n >= 5) this.addShake(Math.min(1.2, n / 8)); }

  deathFx(a, t) {
    this.ghosts.push({ a, x: a.x, y: a.y, t0: t });
    const cx = a.x * T + T / 2, cy = a.y * T + T / 2 + 4;
    setTimeout(() => this.splat(cx, cy + 1, 6 + Math.floor(Math.random() * 5)), 90);
    this.burst(cx, cy - 3, 16, 'blood', { speed: 60, up: 46 });
  }

  addShake(n) { if (this.settings.shake !== 'off' && !this.settings.reduceMotion) this.shake = Math.max(this.shake, n * (this.settings.shake === 'subtle' ? 0.5 : 1)); }

  splat(cx, cy, r) {
    if (this.settings.gore === false) return;
    const pts = new Set(); const blobs = [[cx, cy, r]];
    for (let i = 0; i < 6; i++) blobs.push([cx + (Math.random() * 2 - 1) * r, cy + (Math.random() * 2 - 1) * r * 0.6, r * (0.25 + Math.random() * 0.3)]);
    for (const [bx, by, br] of blobs) for (let y = Math.floor(by - br) - 1; y <= by + br + 1; y++) for (let x = Math.floor(bx - br) - 1; x <= bx + br + 1; x++)
      if ((x - bx) ** 2 + ((y - by) / 0.7) ** 2 <= br * br) pts.add(x + ',' + y);
    for (const p of pts) {
      const [x, y] = p.split(',').map(Number);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !pts.has((x + a) + ',' + (y + b)));
      this.dctx.fillStyle = edge ? '#500810' : ((x * 3 + y) % 13 === 0 ? '#b02030' : '#84101a');
      this.dctx.fillRect(x, y, 1, 1);
    }
  }

  burst(x, y, n, kind, o = {}) {
    if (this.settings.reduceMotion) n = Math.ceil(n / 3);
    if (kind === 'blood' && this.settings.gore === false) kind = 'spark';
    for (let i = 0; i < n; i++) {
      const a = (o.dir ?? Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 50) * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, z: o.z ?? 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: (o.up ?? 34) * (0.5 + Math.random()), kind, life: (o.life ?? 1.2) * (o.lifeVar ? 0.6 + Math.random() * 0.8 : 1), age: 0, g: o.g,
        col: kind === 'blood' ? (Math.random() < 0.6 ? '#c01428' : '#7a0a16') : o.col ? (Array.isArray(o.col) ? o.col[i % o.col.length] : o.col) : kind === 'holy' ? '#fff0b0' : '#ffd070' });
    }
  }

  // ------------------------------------------------------------------ frame
  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.max(1, this.view.clientWidth * dpr), ch = Math.max(1, this.view.clientHeight * dpr);
    const z = this.settings.zoom === 'auto' ? Math.floor(Math.min(cw / 470, ch / 290)) : +this.settings.zoom * (dpr > 1.5 ? 2 : 1);
    this.zoom = Math.max(1, Math.min(8, z || 2));
    this.vw = Math.ceil(cw / this.zoom); this.vh = Math.ceil(ch / this.zoom);
    this.view.width = this.vw * this.zoom; this.view.height = this.vh * this.zoom;
    this.scene.width = this.lightC.width = this.vw; this.scene.height = this.lightC.height = this.vh;
  }

  screenToCell(clientX, clientY) {
    if (this.officialView) {
      const r = this.view.getBoundingClientRect(), o = this.officialView;
      const px = (clientX - r.left) * (this.view.width / r.width), py = (clientY - r.top) * (this.view.height / r.height);
      return { x: Math.floor((px - o.x0) / o.size), y: Math.floor((py - o.y0) / o.size) };
    }
    const r = this.view.getBoundingClientRect();
    const wx = this.cam.x + (clientX - r.left) * (this.vw / r.width);
    const wy = this.cam.y + (clientY - r.top) * (this.vh / r.height);
    return { x: Math.floor(wx / T), y: Math.floor(wy / T) };
  }

  clock() { return performance.now() - this.stopped; }
  // freeze the picture for `dur` ms starting `delay` ms from now (the moment a blow lands)
  hitStop(delay, dur) {
    if (this.settings.reduceMotion) return;
    const from = performance.now() + delay;
    if (from < this.stopUntil) { this.stopUntil = Math.max(this.stopUntil, from + dur); return; }
    this.stopFrom = from; this.stopUntil = from + dur;
  }

  frame(raw) {
    requestAnimationFrame((tt) => this.frame(tt));
    if (this.settings.graphics === 'official' && this.officialImg) { this.frameOfficial(); return; }
    if (this.officialView) { this.officialView = null; this.resize(); }   // back from official tiles
    const rawDt = raw - (this.lastFrame || raw); this.lastFrame = raw;
    const dt = Math.min(0.05, rawDt / 1000);
    if (raw >= this.stopFrom && raw < this.stopUntil) { this.stopped += rawDt; return; }
    const t = raw - this.stopped;
    if (this.anyDirty && t - this.lastCommit > 120) this.commit();
    const { sctx, lctx, vw, vh } = this;
    const hero = this.heroActor();
    const hx = hero ? hero.drawX(t) * T + T / 2 : this.heroCell.x * T + T / 2, hy = hero ? hero.drawY(t) * T + T / 2 : this.heroCell.y * T + T / 2;
    // while picking a map position, the camera follows the cursor instead
    const cur = this.cursor;
    const fx = cur ? cur.x * T + T / 2 : hx, fy = cur ? cur.y * T + T / 2 : hy;
    let tx = fx - vw / 2, ty = fy - vh / 2;
    // keep the hero centred even at the map's edges, so they never end up under the HUD
    if (vw >= W * 1.6) tx = (W - vw) / 2;
    if (vh >= H * 1.6) ty = (H - vh) / 2 - T;
    if (!this.cam.init) { this.cam.x = tx; this.cam.y = ty; this.cam.init = true; }
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 7); this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 7);
    this.shake *= Math.pow(0.01, dt);
    const sh = this.shake > 0.15 ? this.shake : 0;
    const ox = Math.round(-this.cam.x + (Math.random() - 0.5) * sh * 2), oy = Math.round(-this.cam.y + (Math.random() - 0.5) * sh * 2);

    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = '#06060a'; sctx.fillRect(0, 0, vw, vh);
    sctx.setTransform(1, 0, 0, 1, ox, oy);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(this.terrain, 0, 0);
    sctx.drawImage(this.decals, 0, 0);

    const list = [...this.actors.values()].map((a) => ({ a, x: Math.round(this.offsetX(a, t)), y: Math.round(this.offsetY(a, t)) })).sort((p, q) => p.y - q.y);
    // standing props (trees, altars, doors...) and animated ones, back to front with the monsters
    const props = [...this.liveProps.values()].sort((p, q) => p.y - q.y);
    let pi = 0;
    const propsUpTo = (py) => { while (pi < props.length && props[pi].y * T <= py) { const p = props[pi++]; p.o.t = t; p.prop.draw(sctx, p.x * T, p.y * T, p.o); } };
    for (const { a, x, y } of list) { propsUpTo(y); this.drawActor(a, x, y, t); }
    propsUpTo(Infinity);
    this.drawMissiles(t);
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
    for (const gh of this.ghosts) {
      const k = (t - gh.t0) / 160;
      if (k < 1) { sctx.globalAlpha = 1 - k; this.drawActor(gh.a, gh.x * T, gh.y * T, t, 'white'); sctx.globalAlpha = 1; }
    }
    this.ghosts = this.ghosts.filter((g) => t - g.t0 < 160);

    for (const q of this.particles) {
      q.age += dt; q.vz -= 190 * (q.g ?? 1) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.z <= 0) {
        q.z = 0;
        if (q.kind === 'blood') { this.dctx.fillStyle = q.col; this.dctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); q.age = q.life; }
        else { q.vx *= 0.5; q.vy *= 0.5; q.vz = Math.abs(q.vz) * 0.3; }
      }
      if (q.kind === 'blood') { sctx.fillStyle = q.col; sctx.fillRect(Math.round(q.x), Math.round(q.y - q.z), 1, 1); }
    }
    this.particles = this.particles.filter((q) => q.age < q.life);

    // lighting
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = 'rgb(14,16,28)'; lctx.fillRect(0, 0, vw, vh);
    lctx.setTransform(1, 0, 0, 1, ox, oy);
    lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high';
    lctx.drawImage(this.lightTex, 0, 0, W, H);
    lctx.globalCompositeOperation = 'lighter';
    const fl = (s) => 1 + Math.sin(t / 90 + s) * 0.04 + Math.sin(t / 37 + s * 3) * 0.03;
    this.light(hx, hy, 118, '120,110,90', 0.55);
    for (const [i, tc] of this.torches.entries()) this.light(tc.x * T + T / 2, tc.y * T + 8, 96 * fl(i), '255,150,60', 0.55 * fl(i + 2));
    for (const ls of this.lightSources) this.light(ls.x * T + T / 2, ls.y * T + T / 2, ls.r * fl(ls.x), ls.rgb, ls.k);
    for (const { a, x, y } of list) if (/floating eye|light$/.test(this.tiles.gname[a.g])) this.light(x + T / 2, y, 64 + Math.sin(t / 500) * 6, '70,160,255', 0.7);
    this.flashes = this.flashes.filter((f) => t - f.t0 < 160);
    for (const f of this.flashes) { const k = (t - f.t0) / 160; if (k >= 0) this.light(f.x, f.y, 60, '220,235,255', 1 - k); }
    for (const p of this.pillars) {
      const k = (t - p.t0) / 1600;
      if (k < 1) this.light(hx, hy, 160, p.kind === 'holy' ? '255,220,120' : '255,235,160', Math.sin(k * Math.PI) * 1.1);
    }
    this.actionLights(t);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'multiply'; sctx.drawImage(this.lightC, 0, 0);
    sctx.globalCompositeOperation = 'source-over';

    // emissive pass
    sctx.setTransform(1, 0, 0, 1, ox, oy);
    this.drawFx(t);
    for (const [i, tc] of this.torches.entries()) this.drawTorch(tc.x * T + T / 2, tc.y * T + 3, t, i);
    for (const q of this.particles) if (q.kind !== 'blood') {
      sctx.fillStyle = q.col; sctx.globalAlpha = Math.max(0, 1 - q.age / q.life);
      sctx.fillRect(Math.round(q.x), Math.round(q.y - q.z), 1, 1);
    }
    sctx.globalAlpha = 1;
    this.drawArcs(t);
    this.drawActionFx(t);
    this.drawPillars(t, hx, hy);
    if (cur) this.drawCursor(cur, t);

    sctx.setTransform(1, 0, 0, 1, 0, 0);
    this.vctx.imageSmoothingEnabled = false;
    this.vctx.drawImage(this.scene, 0, 0, vw * this.zoom, vh * this.zoom);
  }

  // ------------------------------------------------------------------ official NetHack tiles
  // The tile NetHack's own tile ports would draw for a glyph, following the per-game appearance shuffle.
  officialTile(g) {
    const o = this.tiles.gobj[g];
    if (o >= 0 && !/body of /.test(this.tiles.gname[g])) {
      let d = o;
      try { d = this.objDescr(o); } catch (e) { /* engine not ready */ }
      const alt = this.objGlyph[/^piletop /.test(this.tiles.gname[g]) ? 1 : 0].get(d);
      if (alt !== undefined) g = alt;
    }
    return this.tiles.g2t[g];
  }

  drawOfficial(ctx, g, dx, dy, size) {
    const t = this.officialTile(g), cols = this.tiles.cols;
    ctx.drawImage(this.officialImg, (t % cols) * 16, Math.floor(t / cols) * 16, 16, 16, dx, dy, size, size);
  }

  // Draw the map the way NetHack's tile interfaces do: the background glyph, then the glyph, cell by cell.
  frameOfficial() {
    const c = this.view, ctx = this.vctx;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(c.clientWidth * dpr)), ch = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const z = this.settings.zoom === 'auto' ? Math.max(1, Math.floor(Math.min(cw / (16 * 40), ch / (16 * 21)))) : +this.settings.zoom * (dpr > 1.5 ? 2 : 1);
    const size = 16 * z;
    const focus = this.cursor || this.heroCell;
    const fit = (n, view) => (n * size <= view ? (view - n * size) / 2 : null);
    let x0 = fit(COLNO, cw), y0 = fit(ROWNO, ch);
    if (x0 === null) x0 = Math.round(Math.max(cw - COLNO * size, Math.min(0, cw / 2 - (focus.x + 0.5) * size)));
    if (y0 === null) y0 = Math.round(Math.max(ch - ROWNO * size, Math.min(0, ch / 2 - (focus.y + 0.5) * size)));
    x0 = Math.round(x0); y0 = Math.round(y0);
    this.officialView = { x0, y0, size };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    const xa = Math.max(0, Math.floor(-x0 / size)), xb = Math.min(COLNO - 1, Math.ceil((cw - x0) / size));
    const ya = Math.max(0, Math.floor(-y0 / size)), yb = Math.min(ROWNO - 1, Math.ceil((ch - y0) / size));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const i = this.idx(x, y), g = this.glyph[i], bk = this.bk[i];
      const dx = x0 + x * size, dy = y0 + y * size;
      if (bk >= 0 && bk !== g) this.drawOfficial(ctx, bk, dx, dy, size);
      if (g >= 0) this.drawOfficial(ctx, g, dx, dy, size);
    }
    if (this.cursor) {   // the cursor while picking a position
      const dx = x0 + this.cursor.x * size, dy = y0 + this.cursor.y * size;
      ctx.strokeStyle = '#ffd65a'; ctx.lineWidth = Math.max(2, z);
      ctx.strokeRect(dx + ctx.lineWidth / 2, dy + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
    }
  }

  // targeting brackets for "pick a position" prompts
  drawCursor(c, t) {
    const x = c.x * T, y = c.y * T, p = Math.round(1 + Math.sin(t / 140)), L = 6;
    const ctx = this.sctx;
    ctx.fillStyle = 'rgba(255,214,90,.16)'; ctx.fillRect(x, y, T, T);
    for (const [cx, cy, sx, sy] of [[x - p, y - p, 1, 1], [x + T - 1 + p, y - p, -1, 1], [x - p, y + T - 1 + p, 1, -1], [x + T - 1 + p, y + T - 1 + p, -1, -1]]) {
      ctx.fillStyle = '#1a1000';
      ctx.fillRect(cx + (sx < 0 ? -L : 0), cy - 1 + (sy < 0 ? 0 : 0), L + 1, 3); ctx.fillRect(cx - 1, cy + (sy < 0 ? -L : 0), 3, L + 1);
      ctx.fillStyle = '#ffd65a';
      ctx.fillRect(cx + (sx < 0 ? -L + 1 : 0), cy, L, 1); ctx.fillRect(cx, cy + (sy < 0 ? -L + 1 : 0), 1, L);
    }
  }

  light(x, y, r, rgb, k) {
    const g = this.lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${k})`); g.addColorStop(0.45, `rgba(${rgb},${k * 0.45})`); g.addColorStop(1, `rgba(${rgb},0)`);
    this.lctx.fillStyle = g; this.lctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  offsetX(a, t) {
    let x = a.drawX(t) * T;
    if (a.lunge) { const k = (t - a.lunge.t0) / 200; if (k >= 0 && k < 1) x += a.lunge.dx * Math.sin(k * Math.PI) * 7; else if (k >= 1) a.lunge = null; }
    const kt = Math.max(0, 1 - (t - a.hurtT) / 180); if (t >= a.hurtT) x += a.kb.x * kt;
    return x;
  }
  offsetY(a, t) {
    let y = a.drawY(t) * T;
    if (a.lunge) { const k = (t - a.lunge.t0) / 200; if (k >= 0 && k < 1) y += a.lunge.dy * Math.sin(k * Math.PI) * 5; }
    const kt = Math.max(0, 1 - (t - a.hurtT) / 180); if (t >= a.hurtT) y += a.kb.y * kt;
    return y;
  }

  frameFor(a, t) {
    const atk = t - a.atkT;
    if (atk >= 0 && atk < 260) return 6 + Math.min(2, Math.floor(atk / 85));
    if (a.moving(t)) return 2 + (Math.floor(a.walkBase - 2 + a.progress(t) * 2) % 4 + 4) % 4;
    return Math.floor((t + a.phase) / 520) % 2;
  }

  drawActor(a, x, y, t, force) {
    const { sctx } = this;
    const flashing = t - a.hurtT >= 0 && t - a.hurtT < 120;
    const variant = force || (flashing ? (a.hurtCol === 'red' ? 'red' : 'white') : 'base');
    const fadeIn = Math.min(1, (t - a.born) / 160);
    const ghostly = (a.f & (MG.DETECT | MG.INVIS)) || /ghost|shade/.test(this.tiles.gname[a.g]);
    const prevAlpha = sctx.globalAlpha;
    sctx.globalAlpha = prevAlpha * (ghostly ? 0.6 : 1) * fadeIn;
    const cx = x + T / 2, ground = y + T - 3;
    if (a.hero && this.settings.markers !== false) sctx.drawImage(this.rings.hero, cx - 15, ground - 7);
    else if ((a.f & MG.PET) && this.settings.markers !== false) sctx.drawImage(this.rings.pet, cx - 15, ground - 7);
    const posed = a.hero && !force && this.pose;
    if (posed) { this.drawPose(a, cx, ground, t, 'under'); this.drawPose(a, cx, ground, t, 'back'); }
    if (this.tiles.gname[a.g] === 'invisible mon') { this.drawUnseen(cx, ground, t + a.phase); sctx.globalAlpha = prevAlpha; return; }
    const e = this.sheets.get(this.mnumOf(a.g));
    const worn = a.hero && variant !== 'white' && variant !== 'red' ? this.heroGearSheet(a, t) : null;   // what the hero really wears
    if (e) {
      const { size, feet } = e.meta;
      sctx.drawImage(this.shadows[size] || this.shadows[48], cx - (size === 64 ? 14 : 9), ground - (size === 64 ? 4 : 3));
      const dir = t - a.turnT < 80 ? a.turnVia : a.dir;
      const col = this.frameFor(a, t);
      const src = worn || (variant === 'white' ? e.white : variant === 'red' ? e.red : e.img);
      sctx.drawImage(src, col * size, dir * size, size, size, cx - feet[0], ground - feet[1], size, size);
      if (posed) this.drawPose(a, cx, ground, t, 'front');
    } else {
      sctx.drawImage(this.shadows.small, cx - 7, ground - 2);
      const t2 = this.tiles.g2t[a.g], cell = this.tiles.cell, cols = this.tiles.cols;
      const bob = Math.floor((t + a.phase) / 650) % 2;
      if (variant !== 'base') sctx.filter = variant === 'red' ? 'brightness(0.6) sepia(1) saturate(8) hue-rotate(-30deg)' : 'brightness(3)';
      sctx.drawImage(this.atlas, (t2 % cols) * cell, Math.floor(t2 / cols) * cell, cell, cell, cx - cell / 2, ground - cell + 2 + bob, cell, cell);
      sctx.filter = 'none';
      if (posed) this.drawPose(a, cx, ground, t, 'front');
    }
    sctx.globalAlpha = prevAlpha;
  }

  // The hero drawn in the armour and weapons they actually have on (public/js/gear.js composes the
  // sheet from the role's body and equipment layers). A hand busy in an animation (a swing, a drawn
  // bow) is left empty on the sprite, since the animation draws that item itself.
  heroGearSheet(a, t) {
    if (this.settings.heroGear === false || !this.equipment) return null;
    const busy = this.heroHandsBusy ? this.heroHandsBusy(t) : {};
    const eq = { ...this.equipment };
    if (busy.main) delete eq.main;
    if (busy.off) delete eq.off;
    return composedHeroSheet(this.mnumOf(a.g), eq, () => { this.anyDirty = true; });
  }

  // "remembered, unseen monster": a smudge of shadow with two dim eyes
  drawUnseen(cx, ground, t) {
    const { sctx } = this;
    const k = 0.5 + 0.5 * Math.sin(t / 420);
    sctx.save();
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996 + t / 900, r = 2 + (i % 6) * 1.3;
      const x = Math.round(cx + Math.cos(a) * r * 1.2), y = Math.round(ground - 9 + Math.sin(a) * r * 0.9 - (i % 3));
      sctx.fillStyle = `rgba(${20 + (i % 3) * 10},${14 + (i % 2) * 8},${34 + (i % 4) * 8},${0.22 + 0.25 * k})`;
      sctx.fillRect(x - 1, y - 1, 3, 3);
    }
    sctx.fillStyle = `rgba(190,120,255,${0.35 + 0.45 * k})`;
    sctx.fillRect(Math.round(cx) - 3, Math.round(ground) - 12, 2, 1); sctx.fillRect(Math.round(cx) + 2, Math.round(ground) - 12, 2, 1);
    sctx.restore();
  }

  drawFx(t) {
    const { sctx } = this; const cell = this.tiles.cell, cols = this.tiles.cols;
    let engulfer = null;
    for (let y = 0; y < ROWNO; y++) for (let x = 0; x < COLNO; x++) {
      const g = this.glyph[this.idx(x, y)];
      if (g < 0 || !FX_CLASSES.has(this.cls[g])) continue;
      if (this.cls[g] === 'swallow') { engulfer = this.tiles.gname[g].replace(/^swallow \w+ \w+ /, ''); continue; }
      if (FX_ART.draw && this.cls[g] !== 'cursor') {
        FX_ART.draw(sctx, x * T, y * T, this.tiles.gname[g], { t, seed: (x * 73856093 ^ y * 19349663) >>> 0 });
        sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1;
        continue;
      }
      const tile = this.tiles.g2t[g], sx = (tile % cols) * cell, sy = Math.floor(tile / cols) * cell;
      sctx.globalCompositeOperation = 'lighter';
      sctx.globalAlpha = 0.35 + 0.15 * Math.sin(t / 60);
      sctx.drawImage(this.atlas, sx, sy, cell, cell, x * T - 3, y * T - 3, T + 6, T + 6);
      sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1;
      sctx.drawImage(this.atlas, sx, sy, cell, cell, x * T + (T - cell) / 2, y * T + (T - cell) / 2, cell, cell);
    }
    if (engulfer) this.drawEngulf(t, engulfer);
    if (this.settings.exitMarkers !== false) this.drawExits(t);
  }

  // a small pulsing chevron just outside each unexplored exit, pointing the way out
  drawExits(t) {
    const { sctx } = this, k = 0.55 + 0.45 * Math.sin(t / 320);
    for (const e of this.exits || []) {
      const cx = e.x * T + T / 2 + e.dx * 17, cy = e.y * T + T / 2 + e.dy * 17 - (e.dy === 0 ? 2 : 0);
      const nudge = Math.round(Math.sin(t / 320) * 2);
      for (let i = 0; i <= 6; i++) for (const side of [1, -1]) {
        const u = i - 3 + nudge, v = side * (6 - i);
        const px = Math.round(cx + u * e.dx - v * e.dy), py = Math.round(cy + u * e.dy + v * e.dx);
        sctx.fillStyle = 'rgba(20,12,0,0.7)'; sctx.fillRect(px - 1, py, 3, 3);
        sctx.fillStyle = `rgba(255,214,110,${0.55 + 0.45 * k})`; sctx.fillRect(px - 1, py - 1, 3, 3);
      }
    }
  }

  // Engulfed: the hero inside a churning wall of whatever swallowed them
  drawEngulf(t, name) {
    const { sctx } = this, h = this.heroCell, cx = h.x * T + T / 2, cy = h.y * T + T / 2;
    const rgb = /fog|steam/.test(name) ? [170, 178, 190] : /dust/.test(name) ? [160, 128, 84] : /ice/.test(name) ? [170, 220, 255]
      : /energy/.test(name) ? [120, 160, 255] : /fire/.test(name) ? [255, 120, 40] : /air/.test(name) ? [200, 220, 240] : [130, 46, 58];
    const vortex = /vortex|cloud|elemental/.test(name);
    // the inside of the engulfer: a tinted haze, thickest at the walls
    const g = sctx.createRadialGradient(cx, cy, 6, cx, cy, 46);
    g.addColorStop(0, `rgba(${rgb},0.10)`); g.addColorStop(0.55, `rgba(${rgb},0.32)`); g.addColorStop(1, `rgba(${rgb},0.75)`);
    sctx.fillStyle = g; sctx.beginPath(); sctx.ellipse(cx, cy, 46, 38, 0, 0, Math.PI * 2); sctx.fill();
    for (let ring = 0; ring < 4; ring++) {
      const R = 18 + ring * 8, n = 30 + ring * 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (vortex ? t / (500 - ring * 90) : Math.sin(t / 700 + i) * 0.05) * (ring % 2 ? -1 : 1);
        const wob = Math.sin(t / 260 + i * 1.7 + ring) * 2.5;
        const x = Math.round(cx + Math.cos(a) * (R + wob)), y = Math.round(cy + Math.sin(a) * (R + wob) * 0.8);
        const k = 0.75 + 0.45 * Math.sin(i * 2.1 + t / 300 + ring);
        sctx.fillStyle = `rgba(${Math.min(255, rgb[0] * k) | 0},${Math.min(255, rgb[1] * k) | 0},${Math.min(255, rgb[2] * k) | 0},${0.55 + ring * 0.12})`;
        const sz = 2 + ring;
        sctx.fillRect(x - 1, y - 1, sz + 1, sz);
      }
    }
  }

  drawTorch(x, y, t, i) {
    const { sctx } = this;
    sctx.fillStyle = '#3a2614'; sctx.fillRect(x - 1, y + 5, 3, 5);
    sctx.fillStyle = '#6a4a2a'; sctx.fillRect(x - 2, y + 4, 5, 2);
    const f = (Math.floor(t / 100) + i) % 4;
    sctx.fillStyle = '#ff7a1a'; sctx.fillRect(x - 2, y + 1, 5, 3); sctx.fillRect(x - 1, y, 3, 1);
    sctx.fillStyle = '#ffc040'; sctx.fillRect(x - 1, y + 1, 3, 2);
    sctx.fillStyle = '#fff2b0'; sctx.fillRect(x + (f === 1 ? -1 : f === 2 ? 1 : 0), y - 1 - (f === 3 ? 1 : 0), 1, 2);
  }

  drawArcs(t) {
    const { sctx } = this;
    this.arcs = this.arcs.filter((a) => t - a.t0 < a.dur);
    for (const a of this.arcs) {
      const k = (t - a.t0) / a.dur;
      if (k < 0) continue;
      const sweep = 2.2, start = a.ang - sweep / 2, end = start + sweep * Math.min(1, k * 1.6);
      for (let th = start; th <= end; th += 0.03) {
        const fade = (th - start) / sweep;
        for (let rr = 11; rr <= 20; rr++) {
          if (rr <= 13 && fade < 0.5) continue;
          const alpha = (1 - k) * (0.35 + fade * 0.65);
          sctx.fillStyle = rr > 16 ? `rgba(235,248,255,${alpha})` : `rgba(90,150,255,${alpha})`;
          sctx.fillRect(Math.round(a.x + Math.cos(th) * rr), Math.round(a.y + Math.sin(th) * rr * 0.8), 1, 1);
        }
      }
    }
  }

  drawPillars(t, hx, hy) {
    const { sctx } = this;
    this.pillars = this.pillars.filter((p) => t - p.t0 < 1600);
    for (const p of this.pillars) {
      if (p.kind !== 'holy') continue;
      const a = Math.sin(Math.min(1, (t - p.t0) / 1600) * Math.PI);
      for (let y = hy - 360; y < hy + 14; y++) for (let x = -5; x <= 5; x++) {
        if ((y + Math.floor(t / 40)) % 6 === 0 && Math.abs(x) < 5) continue;
        sctx.fillStyle = `rgba(255,236,170,${a * 0.5 * (Math.abs(x) === 5 ? 0.35 : 1)})`;
        sctx.fillRect(Math.round(hx) + x, y, 1, 1);
      }
    }
  }
}

// weapon swings, zaps, casting, projectiles and item feedback (see heroanim.js)
Object.assign(Renderer.prototype, HERO_ANIM);
