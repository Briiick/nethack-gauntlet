// Terrain props: trees, engravings, iron bars, doors, drawbridges, air and clouds. See README.md.
// Static standing props are rendered once into small cached sprites and blitted, so a forest or a
// cloud bank costs one drawImage per cell per frame.

const T = 24;
const OUT = '#140e0a';
const R = (ctx, c, x, y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const hexrgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const css = (c, a) => (a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
const sh = (h, k) => css(hexrgb(h).map((v) => Math.min(255, v * k)));
function rng(seed) {
  let a = (Math.imul(seed | 0, 2654435761) ^ 0x5bd1e995) | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const cache = new Map();
function sprite(key, w, h, fn) {
  let c = cache.get(key);
  if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); cache.set(key, c); }
  return c;
}
const thKey = (th) => [th.cap, th.capHi, th.face, th.faceHi, th.mortar, th.seam, th.floor && th.floor[2]].join();
// palette helpers matching render.js drawWall (caps are brightened there)
const wallPal = (th) => ({ cap: sh(th.cap, 1.3), capHi: sh(th.capHi, 1.45), face: th.face, faceHi: th.faceHi, faceTop: sh(th.faceHi, 1.15), mortar: th.mortar, faceLo: sh(th.face, 0.75) });
// does the wall around this cell run east-west? (else north-south)
const isW = (c) => c === 'wall';
const isWB = (c) => c === 'wall' || c === 'bars';
function wallRunsEW(n, test = isW) {
  if (!n) return true;
  if (test(n.E) || test(n.W)) return true;
  if (test(n.N) || test(n.S)) return false;
  return true;
}
const ROOMISH = new Set(['floor', 'darkfloor', 'engraving', 'feature', 'trap']);
const CORRISH = new Set(['corr', 'litcorr']);
// render.js draws a brick face on a wall only when the cell below it is open; for a door in a
// room's bottom wall (room to the north, corridor to the south) the neighbouring walls are bare caps
const wallHasFace = (n) => !(n && ROOMISH.has(n.N) && (CORRISH.has(n.S) || n.S === 'stone' || n.S === 'void'));

// ------------------------------------------------------------------------------------------ tree
const LEAF = ['#1d3318', '#2d5222', '#467a2e', '#78a848'];
const BARK = { hi: '#7a5230', lt: '#6a4426', mid: '#523420', dk: '#3b2616', deep: '#24170c' };
function treeSprite(v) {
  return sprite('tree' + v, 32, 48, (ctx, W, H) => {
    // sprite (0,0) = cell (-4,-24); cell centre x = 16, cell bottom y = 48
    const rnd = rng(v * 7919 + 101);
    const img = ctx.createImageData(W, H), d = img.data;
    const col = new Array(W * H).fill(null);
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) col[y * W + x] = c; };
    // ground shadow (falls a little down-right, light is upper left)
    const shadow = new Uint8Array(W * H);
    const scx = 17.5, scy = 44, srx = 11.5 + rnd() * 1.5, sry = 3.6;
    for (let y = 38; y < H; y++) for (let x = 0; x < W; x++) {
      const q = ((x + 0.5 - scx) / srx) ** 2 + ((y + 0.5 - scy) / sry) ** 2;
      if (q <= 1) shadow[y * W + x] = q < 0.55 ? 2 : 1;
    }
    // trunk: tapers upward, forks into two limbs under the crown
    const lean = rnd() < 0.5 ? 0 : (rnd() < 0.5 ? -1 : 1);
    const tTop = 22, tBot = 44;
    for (let y = tTop; y <= tBot; y++) {
      const off = y < 36 ? lean : 0;
      const wdt = y > 40 ? 6 : y > 32 ? 5 : 4;
      const x0 = 16 - (wdt >> 1) - (wdt === 5 ? 0 : 0) + off - (wdt === 6 ? 0 : 0);
      for (let i = 0; i < wdt; i++) {
        const f = i / (wdt - 1);
        let c = f < 0.3 ? BARK.lt : f < 0.7 ? BARK.mid : BARK.dk;
        const g = hash(x0 + i, y >> 1, v + 5);
        if (g < 0.16) c = f < 0.3 ? BARK.mid : (f < 0.7 ? BARK.dk : BARK.deep);
        else if (i === 0 && g > 0.8) c = BARK.hi;
        put(x0 + i, y, c);
      }
    }
    // limbs
    for (let k = 0; k < 5; k++) {
      put(13 + lean - k, 30 - k, BARK.lt); put(14 + lean - k, 30 - k, BARK.mid);
      put(18 + lean + k, 31 - k, BARK.mid); put(19 + lean + k, 31 - k, BARK.dk);
    }
    // root flare
    const roots = [[12, 41], [12, 42], [11, 43], [10, 44], [11, 44], [12, 43], [12, 44],
      [19, 41], [19, 42], [19, 43], [20, 43], [20, 44], [21, 44], [19, 44]];
    for (const [x, y] of roots) put(x, y, x < 16 ? (y > 43 ? BARK.mid : BARK.lt) : BARK.dk);
    if (rnd() < 0.5) { put(15, 45, BARK.mid); put(16, 45, BARK.dk); }
    // a moss patch on the roots now and then
    if (rnd() < 0.6) for (let k = 0; k < 4; k++) put(12 + Math.floor(rnd() * 8), 42 + Math.floor(rnd() * 3), rnd() < 0.5 ? LEAF[2] : LEAF[1]);

    // canopy: clustered leaf masses, back ones first
    const s = 1.0 + rnd() * 0.08;
    const cx = 16, cy = 18;
    const base = [
      [0, -9.5, 5.2], [-6, -6.5, 5.2], [6, -6.5, 5.2],
      [-8, 0, 4.4], [0, -2.5, 6.5], [8, 0, 4.4],
      [-5.5, 4.5, 6], [5.5, 4.5, 6], [0, 7, 5.2],
    ];
    const blobs = [];
    base.forEach(([bx, by, r], i) => {
      if ((i === 0 || i === 3 || i === 5) && rnd() < 0.25) return;       // drop a lobe: lopsided crowns
      blobs.push({ x: cx + bx * s + (rnd() * 2 - 1) * 1.2, y: cy + by * s + (rnd() * 2 - 1) * 1.0, r: r * s + (rnd() * 2 - 1) * 0.6, ph: rnd() * 6.28 });
    });
    if (rnd() < 0.5) blobs.push({ x: cx + (rnd() < 0.5 ? -8 : 8), y: cy - 7 + rnd() * 3, r: 3.6, ph: 0 });   // a stray twig cluster
    blobs.sort((a, b) => (a.y + a.r) - (b.y + b.r));
    const own = new Int16Array(W * H).fill(-1), U = new Float32Array(W * H), V = new Float32Array(W * H);
    blobs.forEach((b, i) => {
      const ry = b.r * 0.88;
      for (let y = Math.floor(b.y - ry - 2); y <= b.y + ry + 2; y++) for (let x = Math.floor(b.x - b.r - 2); x <= b.x + b.r + 2; x++) {
        if (x < 1 || y < 0 || x >= 31 || y >= H) continue;
        const u = (x + 0.5 - b.x) / b.r, w = (y + 0.5 - b.y) / ry;
        const scallop = 1 + 0.13 * Math.sin(Math.atan2(w, u) * 5 + b.ph);   // leafy, scalloped rim
        if (u * u + w * w <= scallop * scallop) { const k = y * W + x; own[k] = i; U[k] = u; V[k] = w; }
      }
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x, i = own[k];
      if (i < 0) continue;
      const u = U[k], w = V[k];
      let l = -(u * 0.55 + w * 0.95);                                  // per-clump light: lit crown, dark belly
      l += -((x - 16) / 14) * 0.2 - ((y - 16) / 14) * 0.3;             // whole-crown light
      l += (hash(x >> 1, y >> 1, v) - 0.5) * 0.35 + (hash(x, y, v + 9) - 0.5) * 0.18;   // leafy break-up
      let t = l > 0.55 ? 3 : l > -0.05 ? 2 : l > -0.6 ? 1 : 0;
      // a dark crease where a front clump overlaps this one
      const below = y + 1 < H ? own[k + W] : -1, right = x + 1 < W ? own[k + 1] : -1, below2 = y + 2 < H ? own[k + 2 * W] : -1;
      if (below > i || right > i) t = 0;
      else if (below2 > i && t > 1) t = 1;
      // single bright leaves sparkle on the lit side
      if (t === 2 && l > 0.25 && hash(x, y, v + 3) < 0.14) t = 3;
      if (t === 1 && hash(x, y, v + 4) < 0.06) t = 0;
      put(x, y, LEAF[t]);
    }
    // canopy shade on the upper trunk
    for (let y = tTop; y <= tBot; y++) for (let x = 10; x < 22; x++) {
      const k = y * W + x;
      if (own[k] < 0 && col[k] && y > 0 && (own[k - W] >= 0 || own[k - 2 * W] >= 0)) col[k] = BARK.deep;
    }
    // outline
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && col[y * W + x] !== null;
    const outline = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) outline.push(y * W + x);
    }
    for (const k of outline) col[k] = OUT;
    for (let k = 0; k < W * H; k++) {
      const c = col[k];
      if (c) { const [r, g, b] = hexrgb(c); d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = 255; }
      else if (shadow[k]) { d[k * 4] = 8; d[k * 4 + 1] = 10; d[k * 4 + 2] = 6; d[k * 4 + 3] = shadow[k] === 2 ? 120 : 80; }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// ------------------------------------------------------------------------------------ engraving
// Elder-futhark-ish runes as 1px strokes on a 3x7 grid: [x0, y0, x1, y1]
const RUNES = [
  [[1, 0, 1, 6]],                                                  // isa
  [[0, 0, 0, 6], [0, 2, 2, 0], [0, 4, 2, 2]],                      // fehu
  [[0, 0, 0, 6], [1, 0, 2, 1], [2, 2, 1, 3], [1, 4, 2, 6]],        // raido
  [[0, 0, 0, 6], [1, 2, 2, 3], [1, 4, 1, 4]],                      // thurisaz
  [[1, 0, 1, 6], [0, 2, 2, 4]],                                    // naudiz
  [[0, 1, 2, 5], [2, 1, 0, 5]],                                    // gebo
  [[1, 0, 1, 6], [0, 0, 0, 1], [2, 0, 2, 1]],                      // algiz
  [[0, 0, 0, 6], [2, 0, 2, 6], [1, 1, 1, 2]],                      // mannaz-ish
  [[2, 0, 0, 2], [0, 3, 2, 3], [2, 4, 0, 6]],                      // sowilo
  [[2, 1, 0, 3], [1, 4, 2, 5]],                                    // kaunan
  [[0, 0, 0, 6], [1, 1, 2, 2]],                                    // laguz
  [[1, 0, 1, 6], [0, 0, 0, 0], [2, 0, 2, 0], [0, 6, 0, 6], [2, 6, 2, 6]], // a carved I
  [[0, 0, 0, 6], [2, 0, 2, 6], [1, 3, 1, 3]],                      // hagalaz
  [[1, 0, 0, 1], [1, 0, 2, 1], [0, 2, 1, 3], [2, 2, 1, 3], [0, 4, 0, 6], [2, 4, 2, 6]], // othala
];
function strokePixels(rune) {
  const out = [];
  for (const [x0, y0, x1, y1] of rune) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) out.push([Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1))]);
  }
  return out;
}
const RUNE_PX = RUNES.map(strokePixels);
function drawEngraving(ctx, ox, oy, o) {
  const rnd = rng((o.seed | 0) * 31 + 7);
  const count = rnd() < 0.35 ? 3 : 4, gap = 2;
  const width = count * 3 + (count - 1) * gap;
  const x0 = ox + Math.floor((T - width) / 2) + (rnd() < 0.5 ? 0 : 1) - 1, y0 = oy + 7 + Math.floor(rnd() * 2);
  const groove = new Set(), list = [];
  const add = (x, y) => { const k = x + ',' + y; if (!groove.has(k)) { groove.add(k); list.push([x, y]); } };
  for (let i = 0; i < count; i++) {
    const rx = x0 + i * (3 + gap), dip = rnd() < 0.3 ? 1 : 0;
    for (const [px, py] of RUNE_PX[Math.floor(rnd() * RUNES.length)]) add(rx + px, y0 + py + dip);
  }
  // a scratched rule under the line, broken where the chisel slipped
  const ruleY = y0 + 9;
  for (let x = x0 + 1; x < x0 + width - 1; x++) if (hash(x, ruleY, o.seed | 0) > 0.22) add(x, ruleY);
  // worn, dusty patch where feet have scuffed the lettering
  ctx.fillStyle = 'rgba(214,190,150,0.06)';
  ctx.fillRect(x0 - 2, y0, width + 4, 10); ctx.fillRect(x0 - 1, y0 - 1, width + 2, 12); ctx.fillRect(x0 + 1, y0 - 2, width - 2, 14);
  // grooves: dark cut, lit far lip (lower right catches the light from the upper left), dust in the cut
  for (const [x, y] of list) if (!groove.has((x + 1) + ',' + (y + 1))) R(ctx, '#9a8e78', x + 1, y + 1);
  for (const [x, y] of list) if (!groove.has(x + ',' + (y + 1)) && groove.has((x - 1) + ',' + y) === false && hash(x, y, 4) < 0.5) R(ctx, 'rgba(154,142,120,0.6)', x, y + 1);
  for (const [x, y] of list) R(ctx, '#2a2620', x, y);
  for (const [x, y] of list) if (hash(x, y, (o.seed | 0) + 2) < 0.14) R(ctx, 'rgba(200,170,120,0.55)', x, y);
}

// ------------------------------------------------------------------------------------ iron bars
const IRON = { hi: '#9090a0', lt: '#707080', body: '#2a2a32', dk: '#18181e', rivet: '#a8a8b8' };
function barsSprite(ew, th) {
  // sprite (0,0) = cell (0,-10)
  return sprite('bars' + ew + (ew ? '' : thKey(th)), 24, 36, (ctx) => {
    const Y = (y) => y + 10;
    if (ew) {
      // floor shadow along the foot and down-right of each bar
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(0, Y(21), 24, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, Y(23), 24, 1);
      const xs = [2, 8, 14, 20];
      // rails behind the bars? no: rails in front read better at this size; bars first, then rails
      for (const x of xs) {
        R(ctx, OUT, x - 1, Y(-8), 4, 31);
        R(ctx, IRON.body, x, Y(-8), 2, 30);
        R(ctx, IRON.lt, x, Y(-8), 1, 30);
        R(ctx, IRON.hi, x, Y(-8), 1, 3);
        R(ctx, OUT, x, Y(-9), 2, 1);
        // spear tip
        R(ctx, OUT, x - 1, Y(-10), 4, 1); R(ctx, IRON.lt, x, Y(-10), 1, 1); R(ctx, IRON.body, x + 1, Y(-10), 1, 1);
        R(ctx, OUT, x, Y(-11 + 0), 2, 1);
        R(ctx, IRON.dk, x + 1, Y(14), 1, 7);
      }
      for (const ry of [-5, 9, 19]) {
        R(ctx, OUT, 0, Y(ry - 1), 24, 1);
        R(ctx, IRON.lt, 0, Y(ry), 24, 1);
        R(ctx, IRON.body, 0, Y(ry + 1), 24, 1);
        R(ctx, OUT, 0, Y(ry + 2), 24, 1);
        for (const x of xs) { R(ctx, IRON.rivet, x, Y(ry), 1, 1); R(ctx, IRON.lt, x + 1, Y(ry + 1), 1, 1); }
      }
    } else {
      // seen end-on: a north-south grille set in a low stone curb; its bars line up one behind another
      const p = wallPal(th);
      R(ctx, 'rgba(0,0,0,0.3)', 17, Y(0), 2, 24);
      R(ctx, p.cap, 6, Y(0), 11, 24); R(ctx, p.capHi, 6, Y(0), 1, 24); R(ctx, p.capHi, 16, Y(0), 1, 24);
      R(ctx, 'rgba(0,0,0,0.35)', 13, Y(-4), 4, 26);       // the grille's shade on the curb
      R(ctx, OUT, 9, Y(-10), 5, 32);
      R(ctx, IRON.body, 10, Y(-9), 3, 30);
      R(ctx, IRON.lt, 10, Y(-9), 1, 30);
      for (let k = 0; k < 5; k++) {                 // bar tips and rail rivets marching away
        const y = -9 + k * 6;
        R(ctx, IRON.hi, 10, Y(y), 2, 1); R(ctx, IRON.rivet, 11, Y(y + 3), 1, 1); R(ctx, OUT, 10, Y(y + 5), 3, 1);
      }
      R(ctx, IRON.dk, 10, Y(20), 3, 1);
    }
  });
}

// ---------------------------------------------------------------------------- doors & doorways
const WOOD = { dk: '#5a3418', mid: '#8a5a2c', lt: '#b07a40', deep: '#3a200e', top: '#c48a4c' };
const BAND = { hi: '#6a6a78', body: '#34343e', dk: '#1c1c22', rivet: '#a0a0b0' };
// stone sill + jambs (shared by doorway and open door)
function drawFrame(ctx, ox, oy, o) {
  const th = o.theme, n = o.n || {}, p = wallPal(th);
  const fl = th.floor || ['#7a7468', '#6e685e', '#827a6c'];
  const slab = sh(fl[2], 1.08), slabHi = sh(fl[2], 1.32), slabLo = sh(fl[2], 0.86), seam = th.seam || '#3a3630';
  if (wallRunsEW(n)) {
    const faces = wallHasFace(n);
    // shade cast by the left jamb onto the floor
    R(ctx, 'rgba(0,0,0,0.28)', ox + 4, oy, 1, T); R(ctx, 'rgba(0,0,0,0.14)', ox + 5, oy, 1, T);
    // threshold slab at the wall's foot, worn in the middle
    const sy = faces ? 17 : 9;
    R(ctx, seam, ox + 4, oy + sy - 1, 16, 1);
    R(ctx, slabHi, ox + 4, oy + sy, 16, 1);
    R(ctx, slab, ox + 4, oy + sy + 1, 16, 4);
    R(ctx, slabLo, ox + 4, oy + sy + 4, 16, 1);
    R(ctx, seam, ox + 11, oy + sy + 1, 1, 4); R(ctx, slabHi, ox + 12, oy + sy + 1, 1, 3);
    for (let x = 6; x < 18; x++) if (hash(ox + x, oy, 3) < 0.25) R(ctx, slabLo, ox + x, oy + sy + 2);
    R(ctx, 'rgba(0,0,0,0.35)', ox + 4, oy + sy + 5, 16, 1);
    // jambs: stubs of the wall, same cap and brick face as the walls either side
    const capH = faces ? 9 : T;
    for (const [x, inner, lit] of [[0, 3, false], [20, 20, true]]) {
      R(ctx, p.cap, ox + x, oy, 4, capH);
      R(ctx, p.capHi, ox + x, oy, 4, 2);
      R(ctx, p.capHi, ox + inner, oy, 1, capH);
      if (!faces) R(ctx, p.capHi, ox + x, oy + T - 2, 4, 2);
      if (faces) {
        R(ctx, p.face, ox + x, oy + 9, 4, 15);
        for (let y = 13; y < T - 2; y += 5) R(ctx, p.mortar, ox + x, oy + y, 4, 1);
        R(ctx, p.faceTop, ox + x, oy + 9, 4, 1);
        R(ctx, lit ? p.faceHi : p.mortar, ox + inner, oy + 10, 1, 14);
        R(ctx, p.faceLo, ox + x, oy + 22, 4, 2);
      }
    }
  } else {
    // door in a north-south wall: the sill runs down the cell, posts top and bottom
    R(ctx, seam, ox + 4, oy, 1, T);
    R(ctx, slabHi, ox + 5, oy, 1, T);
    R(ctx, slab, ox + 6, oy, 12, T);
    R(ctx, slabLo, ox + 18, oy, 1, T);
    R(ctx, seam, ox + 19, oy, 1, T);
    R(ctx, 'rgba(0,0,0,0.3)', ox + 20, oy, 1, T);
    for (const [y, x0, x1] of [[8, 5, 19], [16, 5, 19]]) { R(ctx, seam, ox + x0, oy + y, x1 - x0, 1); R(ctx, slabHi, ox + x0 + 1, oy + y + 1, x1 - x0 - 2, 1); }
    R(ctx, seam, ox + 12, oy + 9, 1, 7); R(ctx, slabHi, ox + 13, oy + 9, 1, 7);
    for (let y = 2; y < 22; y++) if (hash(ox, oy + y, 5) < 0.3) R(ctx, slabLo, ox + 7 + Math.floor(hash(ox, oy + y, 6) * 10), oy + y);
    // the wall above casts a shadow across the opening
    R(ctx, 'rgba(0,0,0,0.22)', ox, oy, T, 3); R(ctx, 'rgba(0,0,0,0.1)', ox, oy + 3, T, 2);
  }
}
function drawOpenDoor(ctx, ox, oy, o) {
  drawFrame(ctx, ox, oy, o);
  const n = o.n || {};
  if (wallRunsEW(n)) {
    // leaf swung back against the left jamb, seen edge-on as a 5px plank strip
    const x = ox + 4, y0 = oy + 1, h = 21;
    R(ctx, 'rgba(0,0,0,0.3)', x + 5, y0 + 2, 2, h);
    R(ctx, OUT, x - 1, y0 - 1, 7, h + 2);
    R(ctx, WOOD.lt, x, y0, 1, h); R(ctx, WOOD.mid, x + 1, y0, 2, h); R(ctx, WOOD.dk, x + 3, y0, 1, h); R(ctx, WOOD.deep, x + 4, y0, 1, h);
    R(ctx, WOOD.top, x, y0, 5, 1);
    for (let y = 3; y < h; y += 6) R(ctx, WOOD.dk, x + 1 + (y % 2), y0 + y, 1, 2);
    for (const by of [4, 15]) {
      R(ctx, BAND.hi, x, y0 + by, 5, 1); R(ctx, BAND.body, x, y0 + by + 1, 5, 1);
      R(ctx, BAND.rivet, x + 2, y0 + by, 1, 1);
      R(ctx, BAND.dk, x - 2, y0 + by, 2, 2); R(ctx, BAND.hi, x - 2, y0 + by, 1, 1);   // hinge knuckle on the jamb
    }
  } else {
    // leaf flat against the upper jamb
    const x0 = ox + 1, y = oy + 3, w = 22;
    R(ctx, 'rgba(0,0,0,0.3)', x0 + 2, y + 5, w, 2);
    R(ctx, OUT, x0 - 1, y - 1, w + 2, 7);
    R(ctx, WOOD.top, x0, y, w, 1); R(ctx, WOOD.lt, x0, y + 1, w, 1); R(ctx, WOOD.mid, x0, y + 2, w, 2); R(ctx, WOOD.dk, x0, y + 4, w, 1);
    for (let x = 5; x < w; x += 6) R(ctx, WOOD.deep, x0 + x, y + 1, 1, 4);
    for (const bx of [3, 16]) {
      R(ctx, BAND.hi, x0 + bx, y, 1, 5); R(ctx, BAND.body, x0 + bx + 1, y, 1, 5); R(ctx, BAND.rivet, x0 + bx, y + 2, 1, 1);
      R(ctx, BAND.dk, x0 + bx, y - 2, 2, 2);
    }
  }
}
function closedDoorSprite(o) {
  const ew = wallRunsEW(o.n), faces = wallHasFace(o.n), th = o.theme;
  return sprite('cdoor' + ew + faces + thKey(th), 24, 32, (ctx) => {
    // sprite (0,0) = cell (0,-8)
    const p = wallPal(th), Y = (y) => y + 8;
    if (ew) {
      // stone surround matching the walls either side: cap on top, brick face below
      R(ctx, p.cap, 0, Y(0), 24, faces ? 9 : 24);
      R(ctx, p.capHi, 0, Y(0), 24, 2);
      if (faces) {
        R(ctx, p.face, 0, Y(9), 24, 15);
        for (let y = 13; y < 22; y += 5) R(ctx, p.mortar, 0, Y(y), 24, 1);
        R(ctx, p.faceTop, 0, Y(9), 24, 1);
        R(ctx, p.faceLo, 0, Y(22), 24, 2);
      }
      // arched leaf, taller than the brick face: the opening is cut up into the wall top
      const top = 3, inset = [4, 2, 1, 0];
      const inLeaf = (x, y) => y >= top && y <= 23 && x >= 5 + (inset[y - top] || 0) && x <= 18 - (inset[y - top] || 0);
      // arch stones (voussoirs) and dark reveal around the leaf
      for (let y = top - 2; y <= 23; y++) for (let x = 2; x < 22; x++) {
        if (inLeaf(x, y)) continue;
        const near2 = inLeaf(x - 2, y) || inLeaf(x + 2, y) || inLeaf(x, y + 2) || inLeaf(x - 1, y + 1) || inLeaf(x + 1, y + 1) || inLeaf(x - 2, y + 1) || inLeaf(x + 2, y + 1);
        const near1 = inLeaf(x - 1, y) || inLeaf(x + 1, y) || inLeaf(x, y + 1);
        if (near1) R(ctx, OUT, x, Y(y));
        else if (near2) R(ctx, (x + y) % 4 === 0 ? p.mortar : (x < 12 ? p.faceTop : p.faceHi), x, Y(y));
      }
      // planks
      const planks = [[5, 3], [8, 4], [12, 3], [15, 4]];
      for (const [px, w] of planks) for (let y = top; y <= 23; y++) for (let x = px; x < px + w; x++) {
        if (!inLeaf(x, y)) continue;
        let c = x === px ? WOOD.lt : x === px + w - 1 ? WOOD.dk : WOOD.mid;
        if (x !== px && hash(x, y >> 1, 11) < 0.13) c = WOOD.dk;
        if (!inLeaf(x, y - 1)) c = x === px ? WOOD.top : WOOD.lt;
        R(ctx, c, x, Y(y));
      }
      R(ctx, WOOD.deep, 5, Y(top + 3), 14, 1);                   // shade under the arch
      // iron straps with rivets; hinge straps run into the left jamb
      for (const by of [8, 18]) {
        R(ctx, BAND.dk, 5, Y(by + 2), 14, 1);
        R(ctx, BAND.body, 5, Y(by), 14, 2); R(ctx, BAND.hi, 5, Y(by), 13, 1);
        for (const x of [6, 10, 13, 17]) R(ctx, BAND.rivet, x, Y(by), 1, 1);
        R(ctx, BAND.dk, 2, Y(by - 1), 3, 4); R(ctx, BAND.body, 3, Y(by), 2, 2); R(ctx, BAND.hi, 3, Y(by), 1, 1);   // hinge knuckle
      }
      // ring pull on the right
      R(ctx, BAND.dk, 14, Y(12), 3, 2); R(ctx, '#7a5a20', 15, Y(12), 1, 1);
      R(ctx, '#c8a040', 14, Y(14), 1, 2); R(ctx, '#c8a040', 16, Y(14), 1, 2); R(ctx, '#a07828', 15, Y(16), 1, 1);
      R(ctx, '#ffd65c', 14, Y(14), 1, 1); R(ctx, OUT, 15, Y(14), 1, 2);
      R(ctx, '#2a1408', 5, Y(23), 14, 1);                       // gap under the door
    } else {
      // edge-on in a north-south wall: a thick wooden slab between the wall ends
      R(ctx, 'rgba(0,0,0,0.3)', 16, Y(2), 2, 22);
      R(ctx, OUT, 7, Y(-1), 10, 25);
      // top edge of the leaf (lit), seen from above
      R(ctx, WOOD.mid, 8, Y(0), 8, 15);
      R(ctx, WOOD.lt, 8, Y(0), 2, 15); R(ctx, WOOD.top, 8, Y(0), 8, 1);
      R(ctx, WOOD.dk, 14, Y(1), 2, 14);
      R(ctx, WOOD.deep, 11, Y(1), 1, 14);
      // south end of the leaf (in shade), with straps
      R(ctx, WOOD.dk, 8, Y(15), 8, 8);
      R(ctx, WOOD.mid, 8, Y(15), 8, 1);
      R(ctx, WOOD.deep, 11, Y(16), 1, 7);
      for (const by of [3, 11]) { R(ctx, BAND.hi, 8, Y(by), 8, 1); R(ctx, BAND.body, 8, Y(by + 1), 8, 1); R(ctx, BAND.rivet, 12, Y(by), 1, 1); }
      for (const by of [17, 20]) { R(ctx, BAND.body, 8, Y(by), 8, 1); R(ctx, BAND.rivet, 9, Y(by), 1, 1); R(ctx, BAND.rivet, 14, Y(by), 1, 1); }
      // ring pull sticking out on the east face
      R(ctx, '#c8a040', 17, Y(8), 1, 3); R(ctx, '#ffd65c', 17, Y(8), 1, 1); R(ctx, OUT, 18, Y(8), 1, 3);
      // stone posts at both ends of the opening
      for (const [y, h] of [[0, 3], [21, 3]]) { R(ctx, p.cap, 0, Y(y), 7, h); R(ctx, p.cap, 17, Y(y), 7, h); R(ctx, p.capHi, 0, Y(y), 7, 1); R(ctx, p.capHi, 17, Y(y), 7, 1); }
    }
  });
}

// ---------------------------------------------------------------------------------- drawbridges
const doorish = (c) => c === 'doorway' || c === 'opendoor' || c === 'closeddoor';
function drawLoweredBridge(ctx, ox, oy, o) {
  const n = o.n || {};
  // planks lie across the crossing; the crossing runs towards the gate (a door-ish neighbour)
  const swap = (doorish(n.E) || doorish(n.W)) && !(doorish(n.N) || doorish(n.S));
  const P = (c, x, y, w = 1, h = 1) => (swap ? R(ctx, c, ox + y, oy + x, h, w) : R(ctx, c, ox + x, oy + y, w, h));
  P('#1a0e06', 0, 0, T, T);
  for (let k = 0; k < 6; k++) {
    const y = k * 4;
    P(WOOD.lt, 0, y, T, 1);
    P(WOOD.mid, 0, y + 1, T, 2);
    P('#24140a', 0, y + 3, T, 1);                       // dark gap between planks
    if (k % 2 === 1) { const j = 8 + Math.floor(hash(k, ox + oy, 7) * 8); P('#24140a', j, y, 1, 3); P(WOOD.lt, j + 1, y, 1, 3); }   // butt joint
    for (let x = 1; x < T - 1; x++) if (hash(x, y + oy, ox + 3) < 0.12) P(WOOD.dk, x, y + 1 + (x % 2));
  }
  // edge beams
  P(OUT, 0, 0, 1, T); P(WOOD.dk, 1, 0, 1, T); P(OUT, T - 1, 0, 1, T); P(WOOD.deep, T - 2, 0, 1, T);
  // iron straps running along the crossing
  for (const x of [4, 18]) {
    P(BAND.dk, x - 1, 0, 1, T); P(BAND.body, x, 0, 2, T); P(BAND.hi, x, 0, 1, T);
    for (let y = 1; y < T; y += 4) P(BAND.rivet, x + 1, y);
  }
  // chain stubs at the far end
  for (const x of [4, 18]) {
    P(OUT, x - 1, 0, 4, 4);
    P('#8a8a98', x, 0, 2, 1); P('#5a5a66', x, 1, 1, 2); P('#5a5a66', x + 1, 1, 1, 2); P('#b0b0c0', x, 3, 2, 1);
  }
}
function raisedBridgeSprite(o) {
  const ew = wallRunsEW(o.n);
  return sprite('rbridge' + ew, 24, 34, (ctx) => {
    // sprite (0,0) = cell (0,-10)
    const Y = (y) => y + 10;
    if (ew) {
      R(ctx, 'rgba(0,0,0,0.35)', 0, Y(22), 24, 2);
      R(ctx, OUT, 0, Y(-9), 24, 32);
      const planks = [[1, 4], [5, 4], [9, 5], [14, 5], [19, 4]];
      for (const [x, w] of planks) {
        R(ctx, WOOD.mid, x, Y(-8), w, 30);
        R(ctx, WOOD.lt, x, Y(-8), 1, 30);
        R(ctx, WOOD.dk, x + w - 1, Y(-8), 1, 30);
        R(ctx, WOOD.top, x, Y(-8), w - 1, 1);
        for (let y = -6; y < 21; y++) if (hash(x * 5, y, 13) < 0.14) R(ctx, WOOD.dk, x + 1 + ((y + x) % 2), Y(y));
      }
      // heavy iron bands with studs
      for (const by of [-4, 7, 17]) {
        R(ctx, BAND.dk, 1, Y(by + 3), 22, 1);
        R(ctx, BAND.body, 1, Y(by), 22, 3); R(ctx, BAND.hi, 1, Y(by), 22, 1);
        for (let x = 3; x < 22; x += 4) { R(ctx, BAND.rivet, x, Y(by + 1), 1, 1); R(ctx, BAND.dk, x + 1, Y(by + 2), 1, 1); }
      }
      // chains up into the wall
      for (const x of [3, 19]) for (let y = -10; y < -4; y += 2) { R(ctx, '#8a8a98', x, Y(y), 2, 1); R(ctx, '#4a4a56', x + (y % 4 ? 1 : 0), Y(y + 1), 1, 1); }
      R(ctx, '#140c06', 1, Y(21), 22, 1);
    } else {
      R(ctx, 'rgba(0,0,0,0.3)', 17, Y(0), 3, 24);
      R(ctx, OUT, 6, Y(-9), 12, 33);
      R(ctx, WOOD.mid, 7, Y(-8), 10, 20); R(ctx, WOOD.lt, 7, Y(-8), 2, 20); R(ctx, WOOD.top, 7, Y(-8), 10, 1); R(ctx, WOOD.dk, 15, Y(-7), 2, 19);
      R(ctx, WOOD.dk, 7, Y(12), 10, 11); R(ctx, WOOD.mid, 7, Y(12), 10, 1);
      for (const by of [-4, 4]) { R(ctx, BAND.body, 7, Y(by), 10, 2); R(ctx, BAND.hi, 7, Y(by), 10, 1); R(ctx, BAND.rivet, 9, Y(by), 1, 1); R(ctx, BAND.rivet, 14, Y(by), 1, 1); }
      for (const by of [15, 19]) { R(ctx, BAND.body, 7, Y(by), 10, 1); R(ctx, BAND.rivet, 8, Y(by), 1, 1); R(ctx, BAND.rivet, 15, Y(by), 1, 1); }
    }
  });
}

// ------------------------------------------------------------------------------------------ air
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SKY = ['#14295a', '#1a3470', '#213f84', '#294c98', '#3359aa', '#3f67b8'];
const AP = 96;                // texture period (world pixels); cells sit at multiples of 24
let skyTex = null, wispTex = null;
function buildSky() {
  skyTex = document.createElement('canvas'); skyTex.width = AP; skyTex.height = AP;
  const x = skyTex.getContext('2d'), tau = Math.PI * 2;
  for (let py = 0; py < AP; py++) for (let px = 0; px < AP; px++) {
    let v = 0.5 + 0.28 * Math.sin(tau * (py / AP + 0.12 * Math.sin(tau * px / AP)))
      + 0.14 * Math.sin(tau * (px / 48 + py / 96) + 1.3) + 0.08 * Math.sin(tau * (2 * px / AP - py / 48));
    v = Math.max(0, Math.min(0.999, v));
    const f = v * (SKY.length - 1), i = Math.floor(f);
    const c = (f - i) * 16 > BAYER[(py & 3) * 4 + (px & 3)] + 0.5 ? Math.min(i + 1, SKY.length - 1) : i;
    R(x, SKY[c], px, py);
  }
  // wisps: long thin streaks, drawn twice wide so a 24px window never has to wrap
  wispTex = document.createElement('canvas'); wispTex.width = AP + T; wispTex.height = AP;
  const w = wispTex.getContext('2d'), rnd = rng(4242);
  const streak = (sx, sy, len, a) => {
    for (const dx of [0, AP]) {
      const X = (xx) => ((xx % AP) + AP) % AP + dx;
      for (let i = 0; i < len; i++) {
        const e = Math.sin(Math.PI * i / len);                    // thick in the middle, tapering
        const xx = X(sx + i); if (xx >= AP + T + dx) continue;
        const yy = sy + Math.round(Math.sin((sx + i) * 0.09) * 1.5);
        w.fillStyle = `rgba(230,240,255,${(a * (0.4 + 0.6 * e)).toFixed(3)})`;
        w.fillRect(xx, (yy + AP) % AP, 1, 1);
        if (e > 0.55) { w.fillStyle = `rgba(230,240,255,${(a * 0.45 * e).toFixed(3)})`; w.fillRect(xx, (yy + 1 + AP) % AP, 1, 1); }
        if (e > 0.85) { w.fillStyle = `rgba(255,255,255,${(a * 0.6).toFixed(3)})`; w.fillRect(xx, (yy - 1 + AP) % AP, 1, 1); }
      }
    }
  };
  for (let k = 0; k < 9; k++) streak(Math.floor(rnd() * AP), Math.floor(k * AP / 9 + rnd() * 6), 18 + Math.floor(rnd() * 26), 0.16 + rnd() * 0.14);
  for (let k = 0; k < 14; k++) streak(Math.floor(rnd() * AP), Math.floor(rnd() * AP), 4 + Math.floor(rnd() * 6), 0.12);
  // clip the doubled copy to exactly AP + T columns
  w.clearRect(AP + T, 0, AP, AP);
}
function drawAir(ctx, ox, oy, o) {
  if (!skyTex) buildSky();
  const sx = ((ox % AP) + AP) % AP, sy = ((oy % AP) + AP) % AP;
  ctx.drawImage(skyTex, sx, sy, T, T, ox, oy, T, T);
  // wind drifts the wisps right: one period every 6 s
  const shift = Math.floor(((o.t || 0) % 6000) / 6000 * AP);
  const wx = (((sx - shift) % AP) + AP) % AP;
  ctx.drawImage(wispTex, wx, sy, T, T, ox, oy, T, T);
}

// ---------------------------------------------------------------------------------------- clouds
const CLOUD = { pal: ['#9098a8', '#c8ccd4', '#e4e7ec', '#ffffff'], alpha: 0.8 };
const POISON = { pal: ['#2e5214', '#4a7a20', '#6a9a28', '#8ab830'], alpha: 0.62 };
function puff(ctx, cx, cy, r, pal) {
  const ry = r * 0.82;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const u = (x + 0.5 - cx) / r, w = (y + 0.5 - cy) / ry, q = u * u + w * w;
    if (q > 1) continue;
    const l = -(u * 0.45 + w * 0.95) + (hash(x >> 1, y >> 1, 21) - 0.5) * 0.2;
    const t = l > 0.5 && q < 0.8 ? 3 : l > -0.25 ? 2 : l > -0.85 ? 1 : 0;
    R(ctx, pal[t], x, y);
  }
}
const CLOUD_PERIOD = 3000;
function cloudFrame(spec, v, t) {
  const rnd = rng(v * 131 + (spec === POISON ? 77 : 0));
  // puffs around the cell, reaching ~4px past it so neighbours knit together
  const P = [
    [8, 12, 8], [24, 11, 7.5], [16, 19, 10.5], [8, 26, 7.5], [24, 27, 8],
  ].map(([x, y, r]) => ({ x: x + Math.round((rnd() * 2 - 1) * 1.5), y: y + Math.round((rnd() * 2 - 1) * 1.5), r: r + (rnd() * 2 - 1) * 1.1, ph: rnd() }));
  if (rnd() < 0.6) P.push({ x: 10 + Math.floor(rnd() * 12), y: 6 + Math.floor(rnd() * 4), r: 5 + rnd() * 1.5, ph: rnd() });   // a small top puff
  const ph = (t % CLOUD_PERIOD) / CLOUD_PERIOD;
  const offs = P.map((p) => [Math.round(Math.sin((ph + p.ph) * Math.PI * 2) * 1.2), Math.round(Math.cos((ph + p.ph) * Math.PI * 2) * 0.8)]);
  const key = 'cl' + (spec === POISON ? 'p' : 'c') + v + ':' + offs.join(';');
  return sprite(key, 32, 37, (ctx) => {
    // sprite (0,0) = cell (-4,-6)
    P.map((p, i) => ({ ...p, x: p.x + offs[i][0], y: p.y + offs[i][1] })).sort((a, b) => a.y - b.y).forEach((p) => puff(ctx, p.x, p.y, p.r, spec.pal));
  });
}
function drawCloud(spec) {
  return (ctx, ox, oy, o) => {
    const v = Math.floor(hash(o.seed | 0, 3, 17) * 8);
    const t = (o.t || 0) + v * 700;
    const img = cloudFrame(spec, v, t);
    ctx.globalAlpha = spec.alpha;
    ctx.drawImage(img, ox - 4, oy - 6);
    ctx.globalAlpha = 1;
    if (spec === POISON) {
      // a few darker bubbles welling up and popping
      for (let k = 0; k < 3; k++) {
        const s = hash(o.seed | 0, k, 31), ph = (((o.t || 0) / 2000) + s) % 1;
        const bx = ox + 4 + Math.floor(hash(o.seed | 0, k, 37) * 15), by = oy + 18 - Math.floor(ph * 14);
        ctx.globalAlpha = ph < 0.8 ? 0.75 : (1 - ph) * 3.5;
        if (ph < 0.85) {
          R(ctx, '#203c0c', bx, by, 2, 1); R(ctx, '#203c0c', bx - 1, by + 1, 4, 1); R(ctx, '#2e5214', bx, by + 2, 2, 1);
          R(ctx, '#a8d050', bx - 1, by + 1, 1, 1);
        } else { R(ctx, '#8ab830', bx - 1, by, 1, 1); R(ctx, '#8ab830', bx + 2, by, 1, 1); R(ctx, '#8ab830', bx, by - 1, 1, 1); }
        ctx.globalAlpha = 1;
      }
    }
  };
}

const PROPS = {
  'tree': {
    kind: 'tall',
    draw(ctx, ox, oy, o) { ctx.drawImage(treeSprite(Math.floor(hash(o.seed | 0, 1, 99) * 8)), ox - 4, oy - 24); },
  },
  'engraving': { kind: 'ground', draw: drawEngraving },
  'iron bars': {
    kind: 'tall',
    draw(ctx, ox, oy, o) { ctx.drawImage(barsSprite(wallRunsEW(o.n, isWB), o.theme), ox, oy - 10); },
  },
  'doorway': { kind: 'ground', draw: drawFrame },
  'open door': { kind: 'ground', draw: drawOpenDoor },
  'closed door': {
    kind: 'tall',
    draw(ctx, ox, oy, o) { ctx.drawImage(closedDoorSprite(o), ox, oy - 8); },
  },
  'lowered drawbridge': { kind: 'ground', draw: drawLoweredBridge },
  'raised drawbridge': {
    kind: 'tall',
    draw(ctx, ox, oy, o) { ctx.drawImage(raisedBridgeSprite(o), ox, oy - 10); },
  },
  'air': { kind: 'ground', animated: true, draw: drawAir },
  'cloud': { kind: 'tall', animated: true, draw: drawCloud(CLOUD) },
  'poison cloud': { kind: 'tall', animated: true, draw: drawCloud(POISON) },
};

export default PROPS;
