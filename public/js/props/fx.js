// Effects: wand/spell beams, explosions, boomerangs, shields, warning markers. See README.md.
// One function draws any effect glyph by its NetHack name, every frame (o.t animates).
//
// Continuity rules (the map draws each effect cell on its own):
// - beams: everything that must line up between neighbouring cells of a ray (flicker, zig-zags,
//   gas puffs, travelling pulses) is keyed on the GLOBAL position along the ray, never on o.seed,
//   and every cell runs edge to edge (diagonals corner to corner) with no end caps.
// - explosions: the 3x3 block is one 72x72 burst keyed on time only (each cell has its own seed);
//   each cell paints just its own slice of it.

const T = 24;
const OUT = '#120e0c';

// ---- small helpers -------------------------------------------------------------------------
const hash = (a, b = 0, c = 0, d = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440662683) + Math.imul(d | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const vnoise = (x, k = 0, c = 0) => {   // 1D value noise, smooth
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i, k, c) * (1 - u) + hash(i + 1, k, c) * u;
};
const vnoise2 = (x, y, k = 0) => {      // 2D value noise, smooth
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, k), b = hash(ix + 1, iy, k), c = hash(ix, iy + 1, k), d = hash(ix + 1, iy + 1, k);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
};
const cache = new Map();
const rgba = (hex, a = 1) => {
  const key = hex + a; let s = cache.get(key);
  if (!s) {
    const n = parseInt(hex.slice(1), 16);
    s = a >= 1 ? hex : `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
    cache.set(key, s);
  }
  return s;
};
const R = Math.round;

// ---- beams ---------------------------------------------------------------------------------
// A beam cell in "ray space": s = 0..23 along the ray, p = perpendicular offset (pixels).
// d: 0 vertical |, 1 horizontal -, 2 diagonal \, 3 diagonal /.
function rayspace(ctx, ox, oy, d) {
  const diag = d >= 2;
  const G0 = d === 0 ? oy : ox;                         // global coordinate along the ray: G0 + s
  const line = d === 0 ? ox : d === 1 ? oy : d === 2 ? ox - oy : ox + oy;   // which ray
  const at = (s, p) => d === 0 ? [ox + 12 + p, oy + s] : d === 1 ? [ox + s, oy + 12 + p]
    : d === 2 ? [ox + s + p, oy + s] : [ox + s + p, oy + 23 - s];
  // a perpendicular run [a, b] at step s
  const run = (s, a, b) => {
    const w = b - a + 1; if (w <= 0) return;
    if (d === 0) ctx.fillRect(ox + 12 + a, oy + s, w, 1);
    else if (d === 1) ctx.fillRect(ox + s, oy + 12 + a, 1, w);
    else if (d === 2) ctx.fillRect(ox + s + a, oy + s, w, 1);
    else ctx.fillRect(ox + s + a, oy + 23 - s, w, 1);
  };
  // half-width -> run bounds (even width on straights, odd on diagonals, ~same visual thickness)
  const hw = (half) => diag ? Math.max(0, R(half * 1.41 - 0.5)) : half;
  const band = (s, half, off = 0) => {
    if (half <= 0) return;
    const h = hw(half);
    if (diag) run(s, off - h, off + h); else run(s, off - h, off + h - 1);
  };
  // one side of a band: the pixels between half-widths a (inner) and b (outer), side = -1 | 1
  const side = (s, a, b, sd, off = 0) => {
    const ha = hw(a), hb = hw(b);
    if (hb <= ha) return;
    if (sd < 0) run(s, off - hb, off - ha - 1);
    else if (diag) run(s, off + ha + 1, off + hb); else run(s, off + ha, off + hb - 1);
  };
  const dot = (s, p, c, w = 1, h = 1) => { const [x, y] = at(s, p); ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  return { d, diag, G0, line, at, run, band, side, hw, dot };
}

const lighter = (ctx) => { ctx.globalCompositeOperation = 'lighter'; };
const normal = (ctx) => { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; };

// soft outer glow: two stacked additive bands
function glow(ctx, B, hex, a, outer = 7, inner = 4, off = null) {
  lighter(ctx);
  ctx.fillStyle = rgba(hex, a * 0.55); for (let s = 0; s < T; s++) B.band(s, outer, off ? off(s) : 0);
  ctx.fillStyle = rgba(hex, a); for (let s = 0; s < T; s++) B.band(s, inner, off ? off(s) : 0);
  normal(ctx);
}
function solid(ctx, B, c, half) { ctx.fillStyle = c; for (let s = 0; s < T; s++) B.band(s, half); }

// 4-point twinkle star centred on pixel (x, y)
function star(ctx, x, y, arm, core, big) {
  ctx.fillStyle = arm;
  ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
  if (big) { ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x, y + 2, 1, 1); }
  ctx.fillStyle = core; ctx.fillRect(x, y, 1, 1);
}

const BEAMS = {
  // magic missile: white core, magenta halo, travelling bright pulses, star sparks
  missile(ctx, B, o) {
    const t = o.t;
    glow(ctx, B, '#ff2ad0', 0.24, 7, 5);
    solid(ctx, B, '#c81ea8', 3);
    solid(ctx, B, '#ff5ae6', 2);
    for (let s = 0; s < T; s++) {
      // energy surges running along the ray: the halo swells and brightens (no beads in the core)
      const m = (((B.G0 + s - t * 0.11) % 24) + 24) % 24, k = m < 12 ? 1 - Math.abs(m - 6) / 6 : 0;
      if (k > 0.25) { ctx.fillStyle = k > 0.65 ? '#ffb0f6' : '#ff7aec'; B.band(s, 2); }
      if (k > 0.5) { ctx.fillStyle = '#e040c8'; B.side(s, 3, 4, -1); B.side(s, 3, 4, 1); }
      ctx.fillStyle = '#ffffff'; B.band(s, 1);
    }
    const f = Math.floor(t / 110);
    for (let i = 0; i < 4; i++) {
      const h = hash(B.line, B.G0, i, f >> 1), s = Math.floor(hash(B.G0, i, B.line, 7) * 22) + 1;
      const p = (i & 1 ? 1 : -1) * (5 + Math.floor(hash(i, B.G0, f, 3) * 4));
      if (h < 0.3) continue;
      const [x, y] = B.at(s, p);
      star(ctx, x, y, h > 0.7 ? '#ff8af0' : '#ffb8f4', '#ffffff', h > 0.65);
    }
  },

  // fire: yellow-white core -> orange -> dark red edge, licking flame edges, embers
  fire(ctx, B, o) {
    const t = o.t, f = Math.floor(t / 70);
    const wl = [], wr = [];
    for (let s = 0; s < T; s++) {
      const g = B.G0 + s;
      wl[s] = 3 + Math.floor(vnoise(g / 3 + f * 1.7, B.line, 1) * 3);
      wr[s] = 3 + Math.floor(vnoise(g / 3 - f * 1.3, B.line, 2) * 3);
    }
    glow(ctx, B, '#ff6a10', 0.22, 8, 5);
    for (let s = 0; s < T; s++) {
      ctx.fillStyle = '#9a1c0c'; B.side(s, 0, wl[s] + 1, -1); B.side(s, 0, wr[s] + 1, 1);
      ctx.fillStyle = '#e8481a'; B.side(s, 0, wl[s], -1); B.side(s, 0, wr[s], 1);
      ctx.fillStyle = '#ff9a28'; B.side(s, 0, wl[s] - 1, -1); B.side(s, 0, wr[s] - 1, 1);
      ctx.fillStyle = '#ffd848'; B.band(s, 2);
      ctx.fillStyle = vnoise(B.G0 + s + f * 3, B.line, 5) > 0.7 ? '#ffffff' : '#fff6c8'; B.band(s, 1);
    }
    // embers drifting off both sides
    for (let i = 0; i < 6; i++) {
      const h = hash(B.G0, B.line, i, 11), life = ((t / 380 + h) % 1);
      const s = Math.floor(hash(i, B.G0, 4) * 24), sd = i & 1 ? 1 : -1;
      const p = sd * (5 + Math.floor(life * 6));
      B.dot(s + Math.floor(life * 3) % 24, p, life < 0.4 ? '#ffe070' : life < 0.75 ? '#ff8a20' : '#a82810');
    }
  },

  // frost: white core, pale icy blue halo with a crisp edge, twinkling ice flecks and rime spikes
  frost(ctx, B, o) {
    const t = o.t;
    glow(ctx, B, '#5ab8ff', 0.2, 7, 5);
    solid(ctx, B, '#3a86d8', 4);
    solid(ctx, B, '#9cd8ff', 3);
    solid(ctx, B, '#d4f0ff', 2);
    solid(ctx, B, '#ffffff', 1);
    // rime spikes along both edges (static, keyed on the ray position)
    for (let s = 0; s < T; s++) {
      const g = B.G0 + s, h = hash(g, B.line, 21);
      if (h > 0.78) { ctx.fillStyle = '#e8f8ff'; B.side(s, 4, h > 0.92 ? 6 : 5, hash(g, 3) < 0.5 ? -1 : 1); }
    }
    // ice flecks: little crystals that twinkle
    const f = Math.floor(t / 160);
    for (let i = 0; i < 5; i++) {
      const s = 2 + Math.floor(hash(B.G0, B.line, i, 31) * 20), sd = i & 1 ? 1 : -1;
      const p = sd * (6 + Math.floor(hash(i, B.G0, 32) * 3));
      const [x, y] = B.at(s, p), tw = hash(i, B.G0, f, 33);
      if (tw < 0.25) continue;
      if (tw > 0.7) { ctx.fillStyle = '#2a6ab8'; ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); }
      star(ctx, x, y, tw > 0.6 ? '#d8f4ff' : '#9cd8ff', '#ffffff', tw > 0.85);
    }
  },

  // sleep: soft lavender core, two indigo/pink strands twisting round it, dreamy drifting sparkles
  sleep(ctx, B, o) {
    const t = o.t;
    glow(ctx, B, '#5a3ae0', 0.24, 7, 5);
    lighter(ctx);
    ctx.fillStyle = rgba('#9a7aff', 0.5); for (let s = 0; s < T; s++) B.band(s, 3);
    normal(ctx);
    solid(ctx, B, '#b8a2ff', 2);
    solid(ctx, B, '#efe6ff', 1);
    const ph = t / 260;
    for (const [k, c, sh] of [[0, '#ffb4ec', '#c070c8'], [Math.PI, '#9a9cff', '#5a4ac0']]) {
      for (let s = 0; s < T; s++) {
        const a = 2 * Math.PI * (B.G0 + s) / 24 + ph + k, off = R(3.5 * Math.sin(a));
        const front = Math.cos(a) > 0;          // the strand passing in front of the core
        if (!front && Math.abs(off) < 2) continue;
        const w = B.diag ? 1 : 0;
        ctx.fillStyle = sh; B.run(s, off, off + w + 1);
        ctx.fillStyle = c; B.run(s, off, off + w);
      }
    }
    // dreamy sparkles drifting slowly away from the ray, fading in and out
    for (let i = 0; i < 5; i++) {
      const h = hash(B.G0, B.line, i, 41), life = (t / 1400 + h) % 1;
      const s = Math.floor(hash(i, B.G0, 42) * 24), sd = i & 1 ? 1 : -1;
      const p = sd * (4 + Math.floor(life * 6));
      if (life > 0.85) continue;
      const [x, y] = B.at(s, p);
      star(ctx, x, y, life < 0.5 ? '#d8c4ff' : '#9a80e8', life < 0.6 ? '#ffffff' : '#e8dcff', life > 0.2 && life < 0.5);
    }
  },

  // death: near-black core, bruised violet band, pale violet/grey-green outline that pulses, so it
  // reads on dark stone; dark motes and sickly green flickers
  death(ctx, B, o) {
    const t = o.t, f = Math.floor(t / 90);
    glow(ctx, B, '#8a4ac8', 0.26, 8, 6);
    lighter(ctx); ctx.fillStyle = rgba('#5a8a5a', 0.18); for (let s = 0; s < T; s++) B.band(s, 5); normal(ctx);
    for (let s = 0; s < T; s++) {
      const g = B.G0 + s, k = (((g - Math.floor(t / 40)) % 12) + 12) % 12;
      ctx.fillStyle = k < 6 ? '#d6bcf4' : '#a8c89a'; B.band(s, 4);      // crawling two-tone outline
      ctx.fillStyle = '#3a2450'; B.band(s, 3);
      ctx.fillStyle = '#1c1028'; B.band(s, 2);
      ctx.fillStyle = '#020104'; B.band(s, 1);
      if (hash(g, B.line, f, 51) > 0.86) B.dot(s, hash(g, f, 52) < 0.5 ? -3 : 2, '#9ad08a');
    }
    // dark motes peeling off with a violet rim
    for (let i = 0; i < 4; i++) {
      const h = hash(B.G0, B.line, i, 53), life = (t / 700 + h) % 1;
      const s = Math.floor(hash(i, B.G0, 54) * 22) + 1, sd = i & 1 ? 1 : -1;
      const [x, y] = B.at(s, sd * (6 + Math.floor(life * 4)));
      ctx.fillStyle = life < 0.6 ? '#b88ae8' : '#6a8a6a'; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = '#06030a'; ctx.fillRect(x, y, 1, 1);
    }
  },

  // lightning: white core on a jagged zig-zag that re-forks every 80ms, yellow halo, afterimage
  lightning(ctx, B, o) {
    const t = o.t, f = Math.floor(t / 80), K = 6, A = 5;
    const path = (fr) => (g) => {
      const i = Math.floor(g / K), u = g / K - i;
      const a = (hash(i, B.line, fr, 61) - 0.5) * 2 * A, b = (hash(i + 1, B.line, fr, 61) - 0.5) * 2 * A;
      return R(a + (b - a) * u);
    };
    const cur = path(f), old = path(f - 1);
    const bright = hash(f, B.line, 62) > 0.2;
    glow(ctx, B, '#ffd820', bright ? 0.2 : 0.12, 8, 5, (s) => cur(B.G0 + s));
    // previous bolt lingers as a dim afterimage
    lighter(ctx); ctx.fillStyle = rgba('#c8a020', 0.55);
    for (let s = 0; s < T; s++) { const a = old(B.G0 + s - 1), b = old(B.G0 + s); B.run(s, Math.min(a, b), Math.max(a, b)); }
    normal(ctx);
    const wid = B.diag ? 1 : 0;
    for (let s = 0; s < T; s++) {
      const a = cur(B.G0 + s - 1), b = cur(B.G0 + s), lo = Math.min(a, b), hi = Math.max(a, b);
      ctx.fillStyle = '#ffd21e'; B.run(s, lo - 2, hi + 1 + wid);
    }
    for (let s = 0; s < T; s++) {
      const a = cur(B.G0 + s - 1), b = cur(B.G0 + s), lo = Math.min(a, b), hi = Math.max(a, b);
      ctx.fillStyle = bright ? '#ffffff' : '#fff6b0'; B.run(s, lo - 1, hi + wid);
    }
    // forks off some knots
    for (let s = 0; s < T; s++) {
      const g = B.G0 + s; if (g % K) continue;
      const h = hash(g / K, B.line, f, 63); if (h < 0.55) continue;
      const sd = h > 0.78 ? 1 : -1, base = cur(g), len = 3 + Math.floor(hash(g, f, 64) * 4);
      let prev = base + (sd > 0 ? 1 : -2);
      for (let k = 1; k <= len; k++) {
        const ss = s + k; if (ss > 23) break;
        const pp = prev + sd * (k === 2 ? 2 : 1);
        ctx.fillStyle = '#ffd21e'; B.run(ss, Math.min(prev, pp) - 1, Math.max(prev, pp) + 1);
        ctx.fillStyle = k < len ? '#ffffff' : '#fff2a0'; B.run(ss, Math.min(prev, pp), Math.max(prev, pp));
        prev = pp;
      }
    }
  },

  // poison gas: murky green, no white core, dithered gas puffs billowing along the ray
  'poison gas'(ctx, B, o) {
    const t = o.t;
    glow(ctx, B, '#4a8a18', 0.2, 8, 5);
    solid(ctx, B, '#44622a', 3);
    solid(ctx, B, '#647f34', 2);
    for (let s = 0; s < T; s++) {
      const g = B.G0 + s;
      ctx.fillStyle = vnoise(g / 4 - t / 300, B.line, 71) > 0.55 ? '#c4d870' : '#a2be52'; B.band(s, 1);
    }
    // gas puffs on global knots (so neighbouring cells agree): each swells, drifts off the ray and
    // thins out through ordered-dither densities (solid -> checker -> sparse) as it dissipates
    const K = 5, BAYER = [0, 2, 3, 1];
    for (let k = Math.floor((B.G0 - 10) / K); k <= Math.floor((B.G0 + 34) / K); k++) {
      const h = hash(k, B.line, 72), life = (t / 1500 + h) % 1, sd = hash(k, B.line, 74) < 0.5 ? -1 : 1;
      const sc = k * K + 3 - B.G0 + R((hash(k, B.line, 75) - 0.5) * 4);
      if (sc < 0 || sc > 23) continue;           // one owner per puff: drawn whole by that cell
      const [cx, cy] = B.at(sc, sd * R(1 + life * 5));
      const r = 3 + life * 4 + hash(k, B.line, 73) * 1.5, ri = Math.ceil(r);
      const dens = life < 0.4 ? 3 : life < 0.75 ? 2 : 1;      // pixels kept out of each 2x2
      for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
        const dd = dx * dx + dy * dy; if (dd > r * r) continue;
        const x = cx + dx, y = cy + dy;
        if (BAYER[(x & 1) + ((y & 1) << 1)] >= dens) continue;
        const lit = dx + dy < -r * 0.4, shade = dx + dy > r * 0.7;
        ctx.fillStyle = lit ? '#a8c25a' : shade ? '#4a6426' : '#76923a';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  },

  // acid: bright hard yellow-green with a pale core, sizzle pixels, drops falling off the ray
  acid(ctx, B, o) {
    const t = o.t, f = Math.floor(t / 60);
    glow(ctx, B, '#9aff10', 0.2, 7, 5);
    solid(ctx, B, '#3e7a08', 4);
    solid(ctx, B, '#8cdc10', 3);
    solid(ctx, B, '#d2ff2a', 2);
    solid(ctx, B, '#fbffc8', 1);
    for (let s = 0; s < T; s++) {
      const g = B.G0 + s;
      if (hash(g, B.line, f, 81) > 0.82) B.dot(s, hash(g, f, 82) < 0.5 ? -3 : 2, '#ffffff');
    }
    // drops: fall straight down the screen from the lower edge of the ray
    for (let i = 0; i < 4; i++) {
      const h = hash(B.G0, B.line, i, 83), life = (t / 600 + h) % 1;
      const s = 2 + Math.floor(hash(i, B.G0, 84) * 20);
      let [x, y] = B.at(s, 0);
      if (B.d === 0) x += (i & 1 ? 4 : -5);       // vertical ray: drip off the sides
      else y += B.diag ? 3 : 4;                  // otherwise off the lower edge
      const fall = Math.floor(life * life * 12);
      if (life < 0.2) { ctx.fillStyle = '#8cdc10'; ctx.fillRect(x, y - 1, 2, 2); continue; }   // swelling bead
      ctx.fillStyle = '#3e7a08'; ctx.fillRect(x, y + fall - 1, 2, 3);
      ctx.fillStyle = '#d2ff2a'; ctx.fillRect(x, y + fall, 2, 2);
      ctx.fillStyle = '#fbffc8'; ctx.fillRect(x, y + fall, 1, 1);
    }
  },
};

// ---- non-directional beams -----------------------------------------------------------------
// dig beam: amber drilling burst filling the cell, spinning drill teeth, rock chips flung out
function digBeam(ctx, ox, oy, o) {
  const t = o.t, cx = ox + 12, cy = oy + 12;
  lighter(ctx);
  for (const [r, a] of [[15, 0.12], [12, 0.16]]) {
    ctx.fillStyle = rgba('#ff9a20', a);
    for (let y = -r; y < r; y++) { const w = R(Math.sqrt(r * r - (y + 0.5) * (y + 0.5))); ctx.fillRect(cx - w, cy + y, 2 * w, 1); }
  }
  normal(ctx);
  // disc: brown rim, amber body, hot centre
  const disc = (r, c) => { ctx.fillStyle = c; for (let y = -r; y < r; y++) { const w = R(Math.sqrt(r * r - (y + 0.5) * (y + 0.5))); ctx.fillRect(cx - w, cy + y, 2 * w, 1); } };
  disc(10, '#3a2210'); disc(9, '#7a4a1c'); disc(7, '#c07a24'); disc(5, '#f0a030'); disc(3, '#ffd070'); disc(2, '#fff6c8');
  // three spinning teeth on the rim
  const a0 = t / 70;
  for (let k = 0; k < 3; k++) {
    const a = a0 + k * 2.094;
    for (let r = 3; r <= 10; r++) {
      const x = cx + R(Math.cos(a + r * 0.22) * r) - 1, y = cy + R(Math.sin(a + r * 0.22) * r) - 1;
      ctx.fillStyle = r > 7 ? '#5a3418' : r > 5 ? '#ffd070' : '#fff0b0'; ctx.fillRect(x, y, 2, 2);
    }
  }
  // rock chips flying out
  for (let i = 0; i < 6; i++) {
    const h = hash(i, o.seed, 91), life = (t / 450 + h) % 1, a = hash(i, o.seed, 92) * 6.283;
    const r = 9 + life * 8, x = cx + R(Math.cos(a) * r), y = cy + R(Math.sin(a) * r) + R(life * life * 3);
    ctx.fillStyle = OUT; ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = i & 1 ? '#8a7a68' : '#a08a6a'; ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.fillStyle = '#c8b498'; ctx.fillRect(x - 1, y - 1, 1, 1);
  }
}

// flash beam (camera): yellow-white starburst, rays flick between + and x
function flashBeam(ctx, ox, oy, o) {
  const t = o.t, cx = ox + 12, cy = oy + 12, f = Math.floor(t / 90);
  lighter(ctx);
  for (const [r, a] of [[14, 0.1], [10, 0.16], [6, 0.26]]) {
    ctx.fillStyle = rgba('#fff080', a);
    for (let y = -r; y < r; y++) { const w = R(Math.sqrt(r * r - (y + 0.5) * (y + 0.5))); ctx.fillRect(cx - w, cy + y, 2 * w, 1); }
  }
  normal(ctx);
  const long = 11, short = 7, plus = f % 2 === 0;
  const ray = (dx, dy, len, c) => { for (let k = 1; k <= len; k++) { ctx.fillStyle = k > len - 3 ? '#ffe040' : c; ctx.fillRect(cx + dx * k - (dx < 0 ? 1 : 0) - (dx === 0 ? 1 : 0), cy + dy * k - (dy < 0 ? 1 : 0) - (dy === 0 ? 1 : 0), dx === 0 ? 2 : 1, dy === 0 ? 2 : 1); } };
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(dx, dy, plus ? long : short, '#fffbe0');
  for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) ray(dx, dy, plus ? short - 2 : long - 3, '#fff4b0');
  ctx.fillStyle = '#ffe040'; ctx.fillRect(cx - 3, cy - 3, 6, 6);
  ctx.fillStyle = '#fffbe0'; ctx.fillRect(cx - 2, cy - 3, 4, 6); ctx.fillRect(cx - 3, cy - 2, 6, 4);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 1, cy - 2, 2, 4); ctx.fillRect(cx - 2, cy - 1, 4, 2);
}

// ---- masks: shapes with a 1px outline and upper-left light ---------------------------------
// inside(x, y) for x, y in 0..n-1 (cell-local grid offset by x0, y0); returns true for body
function mask(ctx, x0, y0, n, inside, base, hi, lo, out = OUT) {
  const m = new Uint8Array((n + 2) * (n + 2)), I = (x, y) => (y + 1) * (n + 2) + x + 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (inside(x, y)) m[I(x, y)] = 1;
  const at = (x, y) => (x < -1 || y < -1 || x > n || y > n ? 0 : m[I(x, y)]);
  ctx.fillStyle = out;
  for (let y = -1; y <= n; y++) for (let x = -1; x <= n; x++) {
    if (at(x, y)) continue;
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) ctx.fillRect(x0 + x, y0 + y, 1, 1);
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!at(x, y)) continue;
    const top = !at(x, y - 1) || !at(x - 1, y), bot = !at(x, y + 1) || !at(x + 1, y);
    ctx.fillStyle = top && !bot ? hi : bot && !top ? lo : base;
    ctx.fillRect(x0 + x, y0 + y, 1, 1);
  }
}

// boomerang: chunky wooden V spinning (left/right are alternate spin frames), with a swept trail
function boomerang(ctx, ox, oy, o, right) {
  const t = o.t, a = t / 45 * (right ? 1 : -1) + (right ? Math.PI / 2 : 0);
  const segs = [[-4, -4, 8, -3], [-4, -4, -3, 8]];   // elbow and two arm tips (local, centred)
  const dseg = (px, py, [x1, y1, x2, y2]) => {
    const vx = x2 - x1, vy = y2 - y1, u = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy)));
    const dx = px - x1 - vx * u, dy = py - y1 - vy * u; return Math.sqrt(dx * dx + dy * dy);
  };
  const ca = Math.cos(a), sa = Math.sin(a), cx = 12, cy = 12, sh = 0.9, shy = 0.9;
  // trail: the arm tips swept back through the last few angles
  lighter(ctx);
  for (let k = 1; k <= 7; k++) {
    const b = a - k * 0.16 * (right ? 1 : -1), cb = Math.cos(b), sb = Math.sin(b);
    for (const [, , tx, ty] of segs) for (const u of [1, 0.75]) {
      const lx = (tx + 4) * u - 4 + sh, ly = (ty + 4) * u - 4 + shy, x = ox + cx + R(lx * cb - ly * sb), y = oy + cy + R(lx * sb + ly * cb);
      ctx.fillStyle = rgba('#fff0d0', 0.5 - k * 0.06); ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  normal(ctx);
  const n = 24, x0 = ox, y0 = oy;
  mask(ctx, x0, y0, n, (x, y) => {
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    const lx = px * ca + py * sa - sh, ly = -px * sa + py * ca - shy;   // inverse rotate
    return dseg(lx, ly, segs[0]) <= 2.5 || dseg(lx, ly, segs[1]) <= 2.5;
  }, '#b87838', '#e8b070', '#7a4620');
}

// shield (reflection ward): bright ring with a dark outline, rotating rune ticks; hue per frame
const SHIELDS = [
  { r: 6.5, c: '#3ae8ff', hi: '#e8ffff', dk: '#0a4a6a' },
  { r: 8, c: '#ffc82a', hi: '#fffbe0', dk: '#6a3a08' },
  { r: 9.5, c: '#ff4ad8', hi: '#ffe0f8', dk: '#5a0a50' },
  { r: 10.5, c: '#6a7aff', hi: '#e0e4ff', dk: '#1a1a6a' },
];
function shield(ctx, ox, oy, o, k) {
  const S = SHIELDS[k], t = o.t, rr = S.r, rot = t / 400 + k * 0.4;
  lighter(ctx);
  for (let y = -4; y < T + 4; y++) for (let x = -4; x < T + 4; x++) {
    const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
    if (d < rr - 2) { ctx.fillStyle = rgba(S.c, 0.1 + 0.22 * (d / rr) * (d / rr)); ctx.fillRect(ox + x, oy + y, 1, 1); }
    else if (d >= rr + 2 && d < rr + 4) { ctx.fillStyle = rgba(S.c, d < rr + 3 ? 0.3 : 0.14); ctx.fillRect(ox + x, oy + y, 1, 1); }
  }
  normal(ctx);
  for (let y = -3; y < T + 3; y++) for (let x = -3; x < T + 3; x++) {
    const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12), e = d - rr;
    let c = null;
    if (e >= -1.5 && e < 1.5) {
      const ang = Math.atan2(y + 0.5 - 12, x + 0.5 - 12) - rot;
      const tick = (((ang / (Math.PI / 4)) % 1) + 1) % 1 < 0.2;   // 8 brighter rune segments
      c = e < -0.5 ? S.hi : e < 0.5 ? (tick ? '#ffffff' : S.c) : (tick ? S.hi : S.c);
    } else if (e >= -2.5 && e < -1.5) c = S.dk;
    else if (e >= 1.5 && e < 2.5) c = OUT;
    if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); }
  }
  // four sparkles riding the ring
  for (let i = 0; i < 4; i++) {
    const a = rot * 1.6 + i * Math.PI / 2, x = ox + 12 + R(Math.cos(a) * rr - 0.5), y = oy + 12 + R(Math.sin(a) * rr - 0.5);
    star(ctx, x, y, S.hi, '#ffffff', k >= 2);
  }
}

// warning: pulsing '!' marker, white -> yellow -> orange -> red -> magenta -> violet
const WARN = [
  ['#f4f4f4', '#ffffff', '#a8a8b0'], ['#ffe23a', '#fff7b0', '#b89410'], ['#ff9a28', '#ffd090', '#b05a10'],
  ['#ff3a2a', '#ff9a80', '#9a1410'], ['#ff40e0', '#ffb0f4', '#9a1a8a'], ['#a050ff', '#d8b0ff', '#5a1aa8'],
];
const BANG = ['.##.', '####', '####', '####', '####', '.##.', '.##.', '.##.', '....', '....', '.##.', '####', '####', '.##.'];
function warning(ctx, ox, oy, o, lv) {
  const [c, hi, lo] = WARN[lv], t = o.t, k = 0.5 + 0.5 * Math.sin(t / (260 - lv * 25));
  const bob = R(Math.sin(t / 300) * 1);
  lighter(ctx);
  const rad = 12 + (lv >> 1);
  for (let y = -rad; y < rad; y++) {
    const w = R(Math.sqrt(rad * rad - (y + 0.5) * (y + 0.5)));
    ctx.fillStyle = rgba(c, 0.1 + 0.16 * k); ctx.fillRect(ox + 12 - w, oy + 12 + y + bob, 2 * w, 1);
  }
  normal(ctx);
  // dark badge behind the mark so it reads on any floor, rimmed in the danger colour
  const disc = (r, c) => { ctx.fillStyle = c; for (let y = -r; y < r; y++) { const w = R(Math.sqrt(r * r - (y + 0.5) * (y + 0.5))); ctx.fillRect(ox + 12 - w, oy + 12 + y + bob, 2 * w, 1); } };
  disc(10, OUT); disc(9, rgba(c, 0.6 + 0.4 * k)); disc(8, '#1a1418');
  // a pulsing outer ring for the dangerous ones
  if (lv >= 3) {
    const rr = 11.5 + k * 1.5;
    ctx.fillStyle = rgba(c, 0.4 + 0.5 * (1 - k));
    for (let y = -3; y < T + 3; y++) for (let x = -3; x < T + 3; x++) {
      const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12 - bob);
      if (d >= rr - 0.5 && d < rr + 0.5 && (lv >= 4 || (x + y) % 3)) ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
  const x0 = ox + 10, y0 = oy + 5 + bob;
  mask(ctx, x0 - 1, y0 - 1, 15, (x, y) => { const r = BANG[y - 1]; return !!r && r[x - 1] === '#'; },
    k > 0.6 ? hi : c, hi, lo);
}

// valid-position cursor: pulsing corner brackets
function cursor(ctx, ox, oy, o) {
  const k = R((0.5 + 0.5 * Math.sin(o.t / 180)) * 2);
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = ox + (sx ? 23 - k : k), y = oy + (sy ? 23 - k : k), dx = sx ? -1 : 1, dy = sy ? -1 : 1;
    ctx.fillStyle = OUT;
    ctx.fillRect(Math.min(x, x + dx * 5) - 1 + (dx < 0 ? 1 : 0), y - 1 + (dy < 0 ? 1 : 0) - (dy < 0 ? 1 : 0), 7, 3);
    ctx.fillRect(x - 1, Math.min(y, y + dy * 5) - 1 + (dy < 0 ? 1 : 0), 3, 7);
    ctx.fillStyle = '#9af0ff';
    ctx.fillRect(Math.min(x, x + dx * 4) + (dx < 0 ? 0 : 0), y, 5, 1);
    ctx.fillRect(x, Math.min(y, y + dy * 4), 1, 5);
  }
}

// ---- explosions ----------------------------------------------------------------------------
// palette: centre -> rim (5 tones), smoke, dark edge, glow colour, debris
const EXPL = {
  fiery:   { c: ['#fffbe0', '#ffe46a', '#ffaa2a', '#f06818', '#b8301a'], smoke: '#4a2a22', edge: '#1e0e0a', glow: '#ff6a10', deb: ['#ffd848', '#ff8a20'] },
  frosty:  { c: ['#ffffff', '#f0fcff', '#c8f0ff', '#8ad8f8', '#4aa8e0'], smoke: '#eefaff', edge: '#1a3a5a', glow: '#8ad8ff', deb: ['#ffffff', '#c8f0ff'], shards: true },
  magical: { c: ['#ffffff', '#ffd8ff', '#ff8af0', '#d040e0', '#7a20b0'], smoke: '#3a1250', edge: '#140620', glow: '#ff3ad8', deb: ['#ffffff', '#ff9af0'] },
  wet:     { c: ['#e8f8ff', '#9ad4ff', '#4a9ae8', '#2a64c8', '#183a90'], smoke: '#e0f4ff', edge: '#08142e', glow: '#2a80ff', deb: ['#ffffff', '#9ad4ff'] },
  muddy:   { c: ['#e8d0a0', '#c89c5a', '#9a7038', '#6e4a24', '#4a3018'], smoke: '#3a2614', edge: '#140c06', glow: '#a07030', deb: ['#7a5430', '#c89c5a'] },
  noxious: { c: ['#f0ffc0', '#b8f060', '#7ac838', '#3e9a2a', '#23602a'], smoke: '#2a3a1a', edge: '#0c1408', glow: '#6ad020', deb: ['#b8f060', '#3e9a2a'] },
  dark:    { c: ['#030106', '#0e0418', '#22083a', '#4a1878', '#a050ff'], smoke: '#d8a8ff', edge: '#06020c', glow: '#9a40ff', deb: ['#c890ff', '#7a30d0'], inverse: true },
};
const ROWS = { top: 0, middle: 1, bottom: 2 }, COLS = { left: 0, center: 1, right: 2 };

function explosion(ctx, ox, oy, kind, row, col, o) {
  const P = EXPL[kind] || EXPL.fiery, t = o.t, cx = COLS[col] ?? 1, ry = ROWS[row] ?? 1;
  const bx = ox - cx * T, by = oy - ry * T;          // top-left of the 72x72 block
  const Rb = 30 + 2 * Math.sin(t / 140);             // pulsing radius
  const x0 = cx === 0 ? -5 : 0, x1 = cx === 2 ? T + 5 : T, y0 = ry === 0 ? -5 : 0, y1 = ry === 2 ? T + 5 : T;
  const kseed = kind.length * 7;
  const shape = (X, Y) => {
    const dx = X + 0.5 - 36, dy = Y + 0.5 - 36, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    // cauliflower rim: round billows with pinched valleys, rolling slowly round, plus a slow wobble
    const sc = Math.sqrt(Math.abs(Math.sin(4.5 * th + t / 400 + kseed)));
    const lump = 0.13 * sc - 0.06 + 0.05 * Math.sin(2 * th + t / 300 + kseed) + 0.035 * Math.sin(3 * th - t / 230);
    const v = r / (Rb * (1 + lump));
    // shading: hot spot up-left of centre (light from upper left) + rolling turbulence
    const rh = Math.hypot(dx + 4, dy + 5) / Rb;
    const tb = vnoise2(X / 6 + t / 600, Y / 6 - t / 700, kseed) - 0.5;
    return { v, w: 0.5 * v + 0.5 * rh + tb * 0.34 * Math.min(1, v * 1.6) };
  };
  const bands = [0.2, 0.42, 0.62, 0.8, 0.92];
  // outer glow (additive) on the ring just beyond the rim
  lighter(ctx);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const { v } = shape(cx * T + x, ry * T + y);
    if (v >= 1 && v < 1.18) { ctx.fillStyle = rgba(P.glow, v < 1.08 ? 0.3 : 0.14); ctx.fillRect(ox + x, oy + y, 1, 1); }
  }
  normal(ctx);
  // the burst body, merging equal-colour runs per row
  for (let y = y0; y < y1; y++) {
    let runC = null, runX = 0;
    const flush = (xe) => { if (runC) { ctx.fillStyle = runC; ctx.fillRect(ox + runX, oy + y, xe - runX, 1); } };
    for (let x = x0; x <= x1; x++) {
      let c = null;
      if (x < x1) {
        const X = cx * T + x, Y = ry * T + y, { v, w } = shape(X, Y);
        if (v < 1) {
          if (v > 0.95) c = P.edge;
          else if (w > 0.86 && !P.inverse) {
            // smoke: two-tone puffs (noise, not a checkerboard)
            c = vnoise2(X / 4 - t / 500, Y / 4, kseed + 3) > 0.5 ? P.smoke : P.c[4];
          } else {
            let i = 0; while (i < 4 && w > bands[i]) i++;
            c = P.c[i];
            if (P.inverse && w > 0.86) c = vnoise2(X / 4 + t / 400, Y / 4, kseed + 3) > 0.45 ? P.smoke : P.c[4];
          }
        }
      }
      if (c !== runC) { flush(x); runC = c; runX = x; }
    }
  }
  // inverse (dark) burst: a violet glimmer swirling in the void
  if (P.inverse) {
    for (let i = 0; i < 10; i++) {
      const a = i * 0.628 + t / 300 * (i & 1 ? 1 : -1), r = 6 + (i % 4) * 5 + Math.sin(t / 200 + i) * 2;
      const X = 36 + R(Math.cos(a) * r), Y = 36 + R(Math.sin(a) * r), x = X - cx * T, y = Y - ry * T;
      if (x >= 0 && x < T && y >= 0 && y < T) { ctx.fillStyle = i % 3 ? '#7a3ac8' : '#c890ff'; ctx.fillRect(ox + x, oy + y, 1, 1); }
    }
  }
  // debris / droplets / sparks / ice shards flung past the rim
  for (let i = 0; i < 26; i++) {
    const h = hash(i, kseed, 101), life = (t / 900 + h) % 1, a = hash(i, kseed, 102) * 6.283;
    const r = Rb * (0.9 + life * 0.35), X = 36 + R(Math.cos(a) * r), Y = 36 + R(Math.sin(a) * r) + (kind === 'wet' || kind === 'muddy' ? R(life * life * 5) : 0);
    const x = X - cx * T, y = Y - ry * T;
    if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
    const X0 = ox + x, Y0 = oy + y, c = P.deb[i & 1];
    if (P.shards && i % 3 === 0) {          // little ice diamond
      ctx.fillStyle = P.edge; ctx.fillRect(X0 - 1, Y0 - 2, 3, 5); ctx.fillRect(X0 - 2, Y0 - 1, 5, 3);
      ctx.fillStyle = '#c8f0ff'; ctx.fillRect(X0, Y0 - 1, 1, 3); ctx.fillRect(X0 - 1, Y0, 3, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(X0, Y0 - 1, 1, 2);
      continue;
    }
    const sz = life < 0.55 ? 2 : 1;
    ctx.fillStyle = P.edge; ctx.fillRect(X0 - 1, Y0 - 1, sz + 2, sz + 2);
    ctx.fillStyle = c; ctx.fillRect(X0, Y0, sz, sz);
  }
}

// ---- entry point ---------------------------------------------------------------------------
export default {
  draw(ctx, ox, oy, name, o) {
    ox = Math.round(ox); oy = Math.round(oy);
    try {
      let m;
      if ((m = /^zap (.+) zap \d (\d)$/.exec(name))) {
        const fn = BEAMS[m[1]]; if (fn) fn(ctx, rayspace(ctx, ox, oy, +m[2]), o);
      } else if ((m = /^explosion (\w+) (\w+) (\w+)$/.exec(name))) explosion(ctx, ox, oy, m[1], m[2], m[3], o);
      else if ((m = /^warning (\d)$/.exec(name))) warning(ctx, ox, oy, o, Math.min(5, +m[1]));
      else if ((m = /^shield(\d)$/.exec(name))) shield(ctx, ox, oy, o, Math.min(3, Math.max(0, +m[1] - 1)));
      else if (name === 'dig beam') digBeam(ctx, ox, oy, o);
      else if (name === 'flash beam') flashBeam(ctx, ox, oy, o);
      else if (name === 'boom left' || name === 'boom right') boomerang(ctx, ox, oy, o, name === 'boom right');
      else if (name === 'valid position') cursor(ctx, ox, oy, o);
    } finally { normal(ctx); }
  },
};
