// Traps: every NetHack trap as seen once discovered. See README.md.
// Physical things on/in the stone floor: plates, vents, pits, hatches, engraved rune circles.
// Muted floor palette with dark outlines; saturated colour only for the magic glows.

const OUT = '#120e0c';
const TAU = Math.PI * 2;
const hash = (a, b = 0, c = 0) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function R(ctx, c, x, y, w = 1, h = 1) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function alpha(ctx, a, fn) { const g = ctx.globalAlpha; ctx.globalAlpha = g * Math.max(0, Math.min(1, a)); try { fn(); } finally { ctx.globalAlpha = g; } }
function linePts(x0, y0, x1, y1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const pts = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 64; i++) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}
function line(ctx, c, x0, y0, x1, y1) { ctx.fillStyle = c; for (const [x, y] of linePts(x0, y0, x1, y1)) ctx.fillRect(x, y, 1, 1); }
// filled disc of whole pixels, centre (cx, cy) in pixel-corner coordinates
function disc(ctx, c, cx, cy, r) {
  ctx.fillStyle = c;
  for (let y = Math.floor(cy - r); y < Math.ceil(cy + r); y++) {
    const dy = y + 0.5 - cy, w = Math.sqrt(Math.max(0, r * r - dy * dy));
    const x0 = Math.round(cx - w), x1 = Math.round(cx + w);
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}
// a small floor stone: dark base, lit top-left
function rock(ctx, x, y, w, h, s = 0) {
  R(ctx, OUT, x, y + 1, w, h);
  R(ctx, s ? '#6a645a' : '#5e584e', x, y, w, h);
  R(ctx, s ? '#a8a090' : '#948c7c', x, y, w - 1, h - 1 || 1);
  R(ctx, '#bab2a0', x, y, 1, 1);
}
// a pressure plate set into the floor: dark gap, slightly raised slab, lit top-left
function plate(ctx, x, y, w, h, tone = 0) {
  R(ctx, '#2a2620', x - 1, y - 1, w + 2, h + 2);
  R(ctx, tone ? '#7e776a' : '#8a8274', x, y, w, h);
  R(ctx, '#a69e8c', x, y, w - 1, 1); R(ctx, '#a69e8c', x, y, 1, h - 1);
  R(ctx, '#5a544a', x + 1, y + h - 1, w - 1, 1); R(ctx, '#5a544a', x + w - 1, y + 1, 1, h - 1);
}

// ---------- pits and holes ----------
function pitShape(seed, cx, cy, rx, ry, rough) {
  const N = 14, k = [];
  for (let i = 0; i < N; i++) k.push((hash(seed, i, 41) - 0.5) * rough);
  return (x, y) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    let a = (Math.atan2(dy, dx) / TAU + 1) * N; const i0 = Math.floor(a) % N, f = a - Math.floor(a);
    const n = k[i0] * (1 - f) + k[(i0 + 1) % N] * f;
    return dx * dx + dy * dy < (1 + n) * (1 + n);
  };
}
function drawPit(ctx, ox, oy, o, cx, cy, rx, ry, wallH, rubble, rough = 0.28) {
  const inside = pitShape(o.seed | 0, cx, cy, rx, ry, rough);
  const x0 = Math.max(0, Math.floor(cx - rx - 3)), x1 = Math.min(23, Math.ceil(cx + rx + 3));
  const y0 = Math.max(0, Math.floor(cy - ry - 3)), y1 = Math.min(23, Math.ceil(cy + ry + 3));
  const wall = ['#8a7a64', '#6c5e4c', '#524638', '#3a3128', '#272019', '#18130e'];
  // shadow skirt around the opening (floor darkens toward the drop)
  alpha(ctx, 0.28, () => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (inside(x, y)) continue;
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1) || inside(x, y - 2)) R(ctx, '#000', ox + x, oy + y);
    }
  });
  for (let x = x0; x <= x1; x++) {
    let top = -1, bot = -1;
    for (let y = y0; y <= y1; y++) if (inside(x, y)) { if (top < 0) top = y; bot = y; }
    if (top < 0) continue;
    for (let y = top; y <= bot; y++) {
      if (!inside(x, y)) continue;
      const d = y - top, fromBot = bot - y;
      let c = '#0a0806';
      if (d < wallH) {
        const j = Math.min(wall.length - 1, Math.floor((d / wallH) * wall.length + (hash(ox + x, oy + y, 5) < 0.25 ? 1 : 0)));
        c = wall[j];
        if (d === 0 && hash(x, o.seed, 6) < 0.6) c = '#a29480';     // the lit lip of the far wall
        if (hash(ox + x, oy + y, 7) < 0.1 && d > 0) c = '#2c251d';    // strata/cracks
      } else if (fromBot < 1) c = '#050403';
      R(ctx, c, ox + x, oy + y);
    }
    // outline: a dark crisp edge, heavier on the near (south) rim
    R(ctx, OUT, ox + x, oy + top - 1);
    R(ctx, OUT, ox + x, oy + bot + 1);
    R(ctx, '#2a241e', ox + x, oy + bot + 2);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (inside(x, y)) continue;
    if (inside(x - 1, y) || inside(x + 1, y)) R(ctx, OUT, ox + x, oy + y);
  }
  // rubble around the rim
  for (let i = 0, n = 0; i < 20 && n < rubble; i++) {
    const a = hash(o.seed, i, 11) * TAU, rr = 1.05 + hash(o.seed, i, 12) * 0.3;
    const x = Math.round(cx + Math.cos(a) * rx * rr), y = Math.round(cy + Math.sin(a) * ry * rr + 1);
    if (x < 1 || x > 21 || y < 1 || y > 21) continue;
    const big = hash(o.seed, i, 13) < 0.4;
    if (inside(x, y) || inside(x + 1, y) || inside(x, y + 1) || inside(x + 1, y + 1) || inside(x, y + 2)) continue;
    rock(ctx, ox + x, oy + y, big ? 3 : 2, 2, i & 1); n++;
  }
  return inside;
}

function spike(ctx, x, y, h) {
  // a sharpened iron stake rising from the pit floor, lit on its left flank
  for (let i = 0; i < h; i++) {
    const w = i < 2 ? 1 : (i < h - 2 ? 2 : 3), l = w === 3 ? x - 1 : x;
    R(ctx, '#4a4846', l, y + i, w, 1);
    R(ctx, i === 0 ? '#f0eee6' : (i < 3 ? '#b8b6ae' : '#8a8884'), l, y + i, 1, 1);
  }
  R(ctx, '#050403', x - 1, y + h, 3, 1);
}

// ---------- rune circles ----------
const maskCache = new Map();
function ringPts(set, r, cx = 12, cy = 12, w = 0.5) {
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (Math.abs(d - r) < w) set.add(x + y * 24);
  }
}
function segPts(set, x0, y0, x1, y1) { for (const [x, y] of linePts(x0, y0, x1, y1)) if (x >= 0 && x < 24 && y >= 0 && y < 24) set.add(x + y * 24); }
function polar(r, a, cx = 12, cy = 12) { return [cx - 0.5 + Math.cos(a) * r, cy - 0.5 + Math.sin(a) * r]; }
function mask(name, build) {
  let m = maskCache.get(name);
  if (!m) {
    const set = new Set(); build(set);
    const halo = new Set();
    for (const k of set) {
      const x = k % 24, y = (k / 24) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < 24 && ny >= 0 && ny < 24 && !set.has(nx + ny * 24)) halo.add(nx + ny * 24);
      }
    }
    m = { pts: [...set].map((k) => [k % 24, (k / 24) | 0]), halo: [...halo].map((k) => [k % 24, (k / 24) | 0]) };
    maskCache.set(name, m);
  }
  return m;
}
// engraved groove lines filled with glowing light: col(x, y) -> [colour, 0..1 strength]
function drawRunes(ctx, ox, oy, m, groove, col, haloA = 0.3) {
  for (const [x, y] of m.pts) R(ctx, groove, ox + x, oy + y + 1);           // groove depth (shadow below)
  for (const [x, y] of m.halo) {
    const [c, k] = col(x, y, true);
    if (k > 0.05) alpha(ctx, haloA * k, () => R(ctx, c, ox + x, oy + y));
  }
  for (const [x, y] of m.pts) { const [c] = col(x, y, false); R(ctx, c, ox + x, oy + y); }
}
const ang = (x, y) => Math.atan2(y + 0.5 - 12, x + 0.5 - 12);
const dist = (x, y) => Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
const ramp = (k, cols) => cols[Math.max(0, Math.min(cols.length - 1, Math.floor(k * cols.length)))];
function scorch(ctx, ox, oy, r, c, a) { alpha(ctx, a, () => disc(ctx, c, ox + 12, oy + 12, r)); }

// ---------- vents ----------
function puff(ctx, x, y, r, c, a) { alpha(ctx, a, () => disc(ctx, c, x, y, r)); }

export default {
  'arrow trap': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      plate(ctx, ox + 7, oy + 7, 10, 10);
      R(ctx, '#6a6458', ox + 9, oy + 11, 6, 1); R(ctx, '#6a6458', ox + 11, oy + 9, 1, 6); // worn cross on the slab
      // arrow slits either side, an arrowhead glinting in each
      for (const [sx, dir] of [[2, 1], [20, -1]]) {
        R(ctx, '#a69e8c', ox + sx - 1, oy + 7, 4, 1);
        R(ctx, OUT, ox + sx, oy + 8, 2, 9);
        R(ctx, '#0a0806', ox + sx, oy + 9, 2, 7);
        R(ctx, '#5a544a', ox + sx - 1, oy + 17, 4, 1);
        const hx = dir > 0 ? sx + 2 : sx - 1;
        R(ctx, '#8a6438', ox + (dir > 0 ? sx + 1 : sx), oy + 12, 1, 1);
        R(ctx, '#8a8a88', ox + hx, oy + 11, 1, 3);
        R(ctx, '#e0e0dc', ox + hx + dir, oy + 12, 1, 1);
        R(ctx, OUT, ox + hx + dir, oy + 13, 1, 1);
      }
      // a spent arrow lying on the stones
      line(ctx, OUT, ox + 5, oy + 21, ox + 17, oy + 19);
      line(ctx, '#8a6438', ox + 5, oy + 20, ox + 16, oy + 18);
      R(ctx, '#c8c8c4', ox + 17, oy + 18, 1, 1); R(ctx, '#7a7a78', ox + 16, oy + 17, 1, 1); R(ctx, '#7a7a78', ox + 16, oy + 19, 1, 1);
      R(ctx, '#b8ad94', ox + 4, oy + 19, 2, 1); R(ctx, '#8e8470', ox + 4, oy + 21, 2, 1);
    },
  },

  'dart trap': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      disc(ctx, '#2a2620', ox + 12, oy + 11, 8);
      disc(ctx, '#8a8274', ox + 12, oy + 11, 7);
      disc(ctx, '#a69e8c', ox + 11, oy + 10, 6);
      disc(ctx, '#8a8274', ox + 12, oy + 11, 6);
      // a grid of tiny dart holes
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        if ((i + j) % 2) continue;
        const x = ox + 8 + i * 3, y = oy + 7 + j * 3;
        R(ctx, '#0a0806', x, y, 2, 2); R(ctx, '#3a3630', x, y, 2, 1); R(ctx, '#b0a896', x, y + 2, 2, 1);
      }
      for (const [i, j] of [[1, 0], [0, 1], [2, 1], [1, 2]]) {
        const x = ox + 8 + i * 3, y = oy + 7 + j * 3;
        R(ctx, '#0a0806', x, y, 1, 1); R(ctx, '#b0a896', x, y + 1, 1, 1);
      }
      // a fallen dart
      R(ctx, OUT, ox + 13, oy + 21, 8, 1);
      R(ctx, '#6a6a6a', ox + 14, oy + 20, 5, 1);
      R(ctx, '#d0d0cc', ox + 19, oy + 20, 1, 1);
      R(ctx, '#8a3a2a', ox + 12, oy + 19, 2, 1); R(ctx, '#6a2a20', ox + 12, oy + 21, 2, 1); R(ctx, '#7a3424', ox + 13, oy + 20, 1, 1);
    },
  },

  'falling rock trap': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy, o) {
      // the shadow of a jagged crack in the ceiling high above
      alpha(ctx, 0.14, () => { for (let y = 2; y < 12; y++) { const w = 18 - Math.abs(y - 6) * 3; R(ctx, '#000', ox + 12 - w / 2, oy + y, w, 1); } });
      const crack = [[2, 6], [6, 4], [9, 7], [13, 5], [16, 8], [21, 6]];
      alpha(ctx, 0.4, () => { for (let i = 0; i < crack.length - 1; i++) { const [ax, ay] = crack[i], [bx, by] = crack[i + 1]; line(ctx, '#000', ox + ax, oy + ay, ox + bx, oy + by); line(ctx, '#000', ox + ax, oy + ay + 1, ox + bx, oy + by + 1); } });
      // impact cracks in the floor
      line(ctx, '#3a3630', ox + 9, oy + 16, ox + 5, oy + 19);
      line(ctx, '#3a3630', ox + 15, oy + 15, ox + 19, oy + 13);
      // the fallen rock: one big chunk and scattered stones
      alpha(ctx, 0.35, () => R(ctx, '#000', ox + 9, oy + 18, 9, 1));
      R(ctx, OUT, ox + 9, oy + 11, 7, 7); R(ctx, OUT, ox + 8, oy + 12, 9, 5);
      R(ctx, '#3e3a34', ox + 9, oy + 12, 7, 5); R(ctx, '#3e3a34', ox + 8, oy + 13, 8, 3);
      R(ctx, '#625c50', ox + 9, oy + 12, 6, 3); R(ctx, '#625c50', ox + 8, oy + 13, 2, 2);
      R(ctx, '#857d6e', ox + 9, oy + 12, 4, 1); R(ctx, '#857d6e', ox + 9, oy + 13, 2, 1);
      R(ctx, '#a29a88', ox + 10, oy + 12, 2, 1);
      R(ctx, '#2a2620', ox + 12, oy + 15, 3, 1); R(ctx, '#4e483e', ox + 14, oy + 13, 1, 2);
      const spots = [[4, 13, 3, 2], [18, 16, 2, 2], [6, 20, 2, 1], [15, 20, 3, 2], [20, 11, 2, 2], [11, 20, 1, 1], [3, 17, 1, 1], [19, 20, 1, 1], [17, 12, 1, 1], [7, 10, 2, 1]];
      spots.forEach(([x, y, w, h], i) => (w * h > 1 ? rock(ctx, ox + x, oy + y, w, h, (i + o.seed) & 1) : (R(ctx, '#2a2620', ox + x, oy + y + 1), R(ctx, '#9a9282', ox + x, oy + y))));
      // grit
      for (const [x, y] of [[5, 15], [13, 19], [21, 14], [8, 18], [16, 11]]) R(ctx, '#a49c8a', ox + x, oy + y);
    },
  },

  'squeaky board': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      // two floorboards let into the stone; the lower one has worked loose and lifts at its right end
      R(ctx, '#2a2620', ox + 2, oy + 5, 20, 6);
      R(ctx, '#745636', ox + 3, oy + 6, 18, 4);
      R(ctx, '#957149', ox + 3, oy + 6, 18, 1); R(ctx, '#4e3822', ox + 3, oy + 9, 18, 1);
      R(ctx, '#5e4429', ox + 6, oy + 8, 5, 1); R(ctx, '#5e4429', ox + 14, oy + 7, 4, 1);
      R(ctx, '#2e2e2e', ox + 4, oy + 7, 1, 1); R(ctx, '#2e2e2e', ox + 19, oy + 7, 1, 1);
      R(ctx, '#2a2620', ox + 2, oy + 12, 20, 6);
      R(ctx, '#0a0806', ox + 3, oy + 13, 18, 4);
      for (let x = 3; x < 21; x++) {
        const lift = x < 9 ? 0 : (x < 15 ? 1 : 2);
        R(ctx, '#86663f', ox + x, oy + 13 - lift, 1, 4);
        R(ctx, '#b48e5c', ox + x, oy + 13 - lift, 1, 1);
        R(ctx, '#5a4028', ox + x, oy + 16 - lift, 1, 1);
      }
      R(ctx, '#6a4e30', ox + 5, oy + 14, 3, 1); R(ctx, '#6a4e30', ox + 11, oy + 14, 4, 1);
      R(ctx, '#2e2e2e', ox + 4, oy + 14, 1, 1);
      // a dark gap under the lifted end and its shadow on the stone
      R(ctx, '#0a0806', ox + 15, oy + 15, 6, 2); R(ctx, '#1a140e', ox + 9, oy + 16, 6, 1);
      alpha(ctx, 0.35, () => R(ctx, '#000', ox + 10, oy + 18, 12, 1));
      // the popped nail
      R(ctx, '#d0d0cc', ox + 19, oy + 10, 1, 1); R(ctx, '#6a6a68', ox + 19, oy + 11, 1, 1);
    },
  },

  'bear trap': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      const cx = 12, cy = 12;
      // chain to a stake driven into the floor
      const links = [[17, 16], [18, 18], [19, 20]];
      links.forEach(([x, y], i) => { R(ctx, OUT, ox + x - 1, oy + y - 1, 3, 3); R(ctx, i & 1 ? '#6a6a6e' : '#8a8a8e', ox + x, oy + y - 1, 1, 2); R(ctx, '#4a4a4e', ox + x - 1, oy + y, 1, 1); });
      R(ctx, OUT, ox + 19, oy + 20, 4, 4); R(ctx, '#4a4a4e', ox + 20, oy + 21, 2, 2); R(ctx, '#9a9a9e', ox + 20, oy + 21, 1, 1);
      // spring arms out to either side
      for (const sx of [1, 18]) {
        R(ctx, OUT, ox + sx, oy + 10, 5, 4);
        R(ctx, '#6e7076', ox + sx + 1, oy + 11, 3, 2); R(ctx, '#a8aab0', ox + sx + 1, oy + 11, 3, 1);
      }
      // open jaws: a steel ring with teeth pointing inward
      for (let y = 4; y < 21; y++) for (let x = 3; x < 21; x++) {
        const dx = (x + 0.5 - cx) / 8.5, dy = (y + 0.5 - cy) / 6.5, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1.13) continue;
        if (d > 1.0) R(ctx, OUT, ox + x, oy + y);
        else if (d > 0.8) {
          const top = y + 0.5 < cy;
          R(ctx, top ? (d > 0.9 ? '#b8bac0' : '#8a8c92') : (d > 0.9 ? '#7a7c82' : '#5a5c62'), ox + x, oy + y);
          if (hash(x, y, 3) < 0.12) R(ctx, '#7a5236', ox + x, oy + y);                // rust
        } else if (d > 0.62 && (x + (y + 0.5 < cy ? 0 : 1)) % 2 === 0) R(ctx, (y + 0.5 < cy) ? '#d0d2d6' : '#9a9ca2', ox + x, oy + y); // teeth
        else if (d > 0.62) R(ctx, '#2a2620', ox + x, oy + y);
      }
      // hinges and the trigger pan
      R(ctx, OUT, ox + 3, oy + 11, 2, 2); R(ctx, OUT, ox + 19, oy + 11, 2, 2);
      R(ctx, '#c8cace', ox + 3, oy + 11, 1, 1); R(ctx, '#c8cace', ox + 19, oy + 11, 1, 1);
      disc(ctx, OUT, ox + 12, oy + 12, 3.2);
      disc(ctx, '#6a6c72', ox + 12, oy + 12, 2.4);
      R(ctx, '#a8aab0', ox + 10, oy + 10, 2, 1); R(ctx, '#3a3c40', ox + 12, oy + 12, 1, 1);
    },
  },

  'land mine': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      // disturbed earth
      const soil = pitShape((o.seed | 0) + 9, 12, 13, 9, 7, 0.35);
      for (let y = 4; y < 22; y++) for (let x = 2; x < 22; x++) if (soil(x, y)) R(ctx, hash(ox + x, oy + y, 1) < 0.25 ? '#3e362c' : (hash(ox + x, oy + y, 2) < 0.2 ? '#6a5e4c' : '#524838'), ox + x, oy + y);
      // the half-buried disc
      disc(ctx, OUT, ox + 12, oy + 13, 6.4);
      disc(ctx, '#3e4234', ox + 12, oy + 13, 5.6);
      disc(ctx, '#5c6248', ox + 12, oy + 12, 5);
      disc(ctx, '#767c5c', ox + 11, oy + 11, 3.4);
      disc(ctx, '#5c6248', ox + 12, oy + 12, 3);
      // soil spilling back over the near edge
      for (let x = 7; x < 18; x++) if (hash(x, o.seed, 3) < 0.45) R(ctx, '#524838', ox + x, oy + 17 + (hash(x, o.seed, 4) < 0.5 ? 0 : 1));
      // rusted pressure cap
      disc(ctx, OUT, ox + 12, oy + 12, 2.6);
      disc(ctx, '#7a4424', ox + 12, oy + 12, 2);
      R(ctx, '#a8643a', ox + 11, oy + 11, 1, 1); R(ctx, '#5a2e18', ox + 12, oy + 12, 1, 1);
      // tiny arming light, blinking
      const on = ((o.t || 0) % 1400) < 380;
      const lx = ox + 16, ly = oy + 9;
      R(ctx, OUT, lx - 1, ly - 1, 3, 3);
      if (on) { alpha(ctx, 0.45, () => { R(ctx, '#ff3a20', lx - 2, ly, 5, 1); R(ctx, '#ff3a20', lx, ly - 2, 1, 5); }); R(ctx, '#ffb090', lx, ly, 1, 1); }
      else R(ctx, '#5a1a14', lx, ly, 1, 1);
    },
  },

  'rolling boulder trap': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      // a shallow channel worn across the cell: shadowed far edge, lit near edge, polished streaks
      R(ctx, '#625c52', ox, oy + 7, 24, 10);
      R(ctx, '#2e2a24', ox, oy + 6, 24, 1); R(ctx, '#46423a', ox, oy + 7, 24, 1); R(ctx, '#56504a', ox, oy + 8, 24, 1);
      for (const [x, y, w] of [[0, 10, 7], [13, 9, 11], [1, 13, 6], [15, 14, 9], [0, 15, 4], [19, 11, 5]]) R(ctx, '#7c7466', ox + x, oy + y, w, 1);
      R(ctx, '#a69e8c', ox, oy + 17, 24, 1); R(ctx, '#8a8274', ox, oy + 16, 24, 1);
      // the trigger plate, with a boulder-round dish worn into it
      plate(ctx, ox + 8, oy + 8, 8, 8, 1);
      disc(ctx, '#5e584e', ox + 12, oy + 12, 2.6);
      R(ctx, '#a29a88', ox + 11, oy + 13, 2, 1); R(ctx, '#46403a', ox + 11, oy + 10, 2, 1);
      // chips knocked off the edges
      rock(ctx, ox + 3, oy + 20, 2, 2); rock(ctx, ox + 18, oy + 2, 2, 2, 1); rock(ctx, ox + 20, oy + 20, 2, 1);
    },
  },

  'sleeping gas trap': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0;
      alpha(ctx, 0.12, () => disc(ctx, '#a890d0', ox + 12, oy + 15, 9));
      // square floor grate with slats
      R(ctx, OUT, ox + 5, oy + 10, 14, 11);
      R(ctx, '#5e5a54', ox + 6, oy + 11, 12, 9);
      R(ctx, '#8a8680', ox + 6, oy + 11, 12, 1); R(ctx, '#8a8680', ox + 6, oy + 11, 1, 9);
      for (let i = 0; i < 4; i++) { R(ctx, '#0c0a0e', ox + 8, oy + 12 + i * 2, 8, 1); R(ctx, '#2e2a36', ox + 8, oy + 12 + i * 2, 1, 1); }
      R(ctx, '#3a3632', ox + 17, oy + 11, 1, 9); R(ctx, '#3a3632', ox + 6, oy + 19, 12, 1);
      // lavender haze seeping up
      for (let i = 0; i < 4; i++) {
        const p = ((t / 2600) + i / 4) % 1;
        const x = ox + 12 + Math.round(Math.sin(p * 5 + i * 1.7) * 3), y = oy + 15 - Math.round(p * 13);
        puff(ctx, x, y, 2.5 + p * 3, '#c8b4f0', 0.5 * Math.sin(p * Math.PI));
        puff(ctx, x - 1, y - 1, 1.2 + p * 1.5, '#e4d8ff', 0.3 * Math.sin(p * Math.PI));
      }
    },
  },

  'rust trap': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0;
      // a standing puddle, rust stains spreading from it, a small drain at its heart
      const pud = pitShape((o.seed | 0) + 17, 12, 15, 9, 5.5, 0.4);
      for (let y = 6; y < 23; y++) for (let x = 1; x < 23; x++) {
        if (pud(x, y)) R(ctx, pud(x, y - 1) ? (hash(x, y, 5) < 0.06 ? '#7a90a4' : '#465664') : '#2e3840', ox + x, oy + y);
        else if ((pud(x, y - 1) || pud(x - 1, y) || pud(x + 1, y) || pud(x, y - 2)) && hash(x, y, 8) < 0.7) R(ctx, hash(x, y, 9) < 0.5 ? '#7a4a2c' : '#8a5634', ox + x, oy + y);
      }
      R(ctx, '#8aa2b6', ox + 6, oy + 13, 4, 1); R(ctx, '#6e869a', ox + 15, oy + 18, 3, 1); R(ctx, '#a8bccc', ox + 7, oy + 13, 1, 1);
      disc(ctx, OUT, ox + 12, oy + 15, 3.2);
      disc(ctx, '#6e4228', ox + 12, oy + 15, 2.5);
      R(ctx, '#0a0806', ox + 10, oy + 15, 4, 1); R(ctx, '#0a0806', ox + 12, oy + 13, 1, 4);
      R(ctx, '#a8643a', ox + 10, oy + 13, 1, 1); R(ctx, '#a8643a', ox + 11, oy + 13, 1, 1);
      // drips falling from above, splashing into the puddle
      for (let i = 0; i < 2; i++) {
        const p = ((t / 1300) + i * 0.5) % 1, x = ox + (i ? 16 : 8);
        const land = oy + 15 + (i ? 1 : -1);
        if (p < 0.6) {
          const y = oy + Math.round((p / 0.6) * (land - oy - 2));
          R(ctx, '#6e8498', x, y, 1, 3); R(ctx, '#dce8f0', x, y + 1, 1, 1);
        } else {
          const q = (p - 0.6) / 0.4, r = 1 + Math.round(q * 3);
          alpha(ctx, 1 - q, () => { R(ctx, '#c8dae6', x - r, land, 1, 1); R(ctx, '#c8dae6', x + r, land, 1, 1); R(ctx, '#c8dae6', x, land - 1 - Math.round((1 - q) * 2), 1, 1); });
        }
      }
    },
  },

  'fire trap': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0, f = Math.floor(t / 110);
      // charred soot around the vent
      const soot = pitShape((o.seed | 0) + 3, 12, 13, 10, 9, 0.5);
      alpha(ctx, 0.5, () => { for (let y = 1; y < 24; y++) for (let x = 0; x < 24; x++) if (soot(x, y)) R(ctx, '#1a1410', ox + x, oy + y); });
      scorch(ctx, ox, oy + 1, 7.5, '#0e0a08', 0.55);
      // round iron vent with a cross grille, embers glowing in it
      disc(ctx, OUT, ox + 12, oy + 13, 6.2);
      disc(ctx, '#3a3430', ox + 12, oy + 13, 5.4);
      R(ctx, '#5a504a', ox + 9, oy + 8, 5, 1);
      for (let y = 9; y < 18; y++) for (let x = 8; x < 17; x++) {
        const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 13);
        if (d > 4.2 || x === 12 || y === 13) continue;
        const h = hash(x, y, f);
        R(ctx, h < 0.25 ? '#ffc050' : (h < 0.6 ? '#f07020' : (h < 0.85 ? '#b83a12' : '#5a1a0a')), ox + x, oy + y);
      }
      R(ctx, '#2a2420', ox + 12, oy + 9, 1, 9); R(ctx, '#2a2420', ox + 8, oy + 13, 9, 1);
      // heat glow and rising sparks
      alpha(ctx, 0.14 + 0.06 * Math.sin(t / 160), () => disc(ctx, '#ff7020', ox + 12, oy + 13, 8));
      for (let i = 0; i < 3; i++) {
        const p = ((t / 1500) + i / 3) % 1;
        const x = ox + 10 + i * 2 + Math.round(Math.sin(p * 6 + i) * 1.5), y = oy + 11 - Math.round(p * 10);
        alpha(ctx, 1 - p, () => R(ctx, p < 0.4 ? '#ffd070' : '#ff7a2a', x, y, 1, 1));
      }
    },
  },

  'pit': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy, o) { drawPit(ctx, ox, oy, o, 12, 12.5, 9.5, 8.5, 5, 5); },
  },

  'spiked pit': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy, o) {
      drawPit(ctx, ox, oy, o, 12, 12.5, 9.5, 8.5, 4, 4);
      for (const [x, y, h] of [[7, 12, 6], [11, 10, 8], [15, 12, 6], [10, 15, 5], [17, 15, 4]]) spike(ctx, ox + x, oy + y, h);
    },
  },

  'hole': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy, o) {
      // cracks spreading from the break
      line(ctx, '#3a3630', ox + 5, oy + 12, ox + 1, oy + 9);
      line(ctx, '#3a3630', ox + 18, oy + 14, ox + 22, oy + 18);
      line(ctx, '#3a3630', ox + 13, oy + 7, ox + 15, oy + 3);
      line(ctx, '#3a3630', ox + 9, oy + 17, ox + 7, oy + 21);
      drawPit(ctx, ox, oy, o, 12, 12, 6.5, 5.5, 2, 3, 0.4);
    },
  },

  'trap door': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      // a wooden hatch set flush in the floor
      R(ctx, OUT, ox + 3, oy + 3, 18, 18);
      const pl = ['#6a4426', '#744c2a', '#664024', '#704828'];
      for (let i = 0; i < 4; i++) {
        R(ctx, pl[i], ox + 4 + i * 4, oy + 4, 4, 16);
        R(ctx, '#8e6236', ox + 4 + i * 4, oy + 4, 1, 16);
        R(ctx, '#3e2814', ox + 7 + i * 4, oy + 4, 1, 16);
        R(ctx, '#5a3a20', ox + 5 + i * 4, oy + 6 + i * 3, 1, 3);
      }
      R(ctx, '#9a6c3e', ox + 4, oy + 4, 16, 1);
      // iron bands with rivets
      for (const by of [6, 16]) {
        R(ctx, '#2a2a30', ox + 4, oy + by, 16, 2);
        R(ctx, '#5c5c66', ox + 4, oy + by, 16, 1);
        for (let x = 5; x < 20; x += 4) R(ctx, '#9a9aa4', ox + x, oy + by, 1, 1);
      }
      // ring pull
      R(ctx, OUT, ox + 10, oy + 10, 4, 5);
      R(ctx, '#6a6a72', ox + 10, oy + 10, 4, 1); R(ctx, '#6a6a72', ox + 10, oy + 10, 1, 4); R(ctx, '#6a6a72', ox + 13, oy + 10, 1, 4); R(ctx, '#4a4a52', ox + 10, oy + 13, 4, 1);
      R(ctx, '#a8a8b0', ox + 10, oy + 10, 2, 1);
      R(ctx, '#3a2614', ox + 11, oy + 11, 2, 2);
      R(ctx, '#2a2a30', ox + 11, oy + 9, 2, 1);
    },
  },

  'teleportation trap': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0, ph = (t / 1500) * TAU;
      const m = mask('teleport', (s) => {
        ringPts(s, 10); ringPts(s, 7);
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8 + TAU / 16, [x0, y0] = polar(7.8, a), [x1, y1] = polar(9.2, a);
          segPts(s, x0, y0, x1, y1);
        }
        for (let i = 0; i < 4; i++) { const [x, y] = polar(3, i * TAU / 4); segPts(s, x, y, x, y); }
        segPts(s, 11, 11, 12, 12); segPts(s, 12, 11, 11, 12);
      });
      scorch(ctx, ox, oy, 10.5, '#140c18', 0.18);
      drawRunes(ctx, ox, oy, m, '#24182a', (x, y) => {
        const d = dist(x, y), a = ang(x, y);
        let k = d < 4 ? 0.6 + 0.4 * Math.sin(ph * 2) : 0.35 + 0.65 * Math.pow(Math.max(0, Math.cos(a - ph)), 4);
        if (d > 6 && d < 8 && Math.cos(a + ph) > 0.8) k = Math.max(k, 0.9);
        return [ramp(k, ['#6a2e7a', '#a040b8', '#d060e0', '#ffb0ff']), k];
      }, 0.45);
    },
  },

  'level teleporter': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0, ph = (t / 1400) * TAU;
      const m = mask('levelport', (s) => {
        ringPts(s, 10);
        const v = [0, 1, 2].map((i) => polar(7.5, TAU / 4 + i * TAU / 3));   // a downward-pointing triangle
        for (let i = 0; i < 3; i++) segPts(s, v[i][0], v[i][1], v[(i + 1) % 3][0], v[(i + 1) % 3][1]);
        ringPts(s, 2.2);
        for (let i = 0; i < 6; i++) { const a = -TAU / 4 + i * TAU / 6 + TAU / 12, [x0, y0] = polar(10.6, a), [x1, y1] = polar(11.6, a); segPts(s, x0, y0, x1, y1); }
      });
      scorch(ctx, ox, oy, 10.5, '#1a0a06', 0.22);
      drawRunes(ctx, ox, oy, m, '#2e1810', (x, y) => {
        const k = 0.5 + 0.5 * Math.sin(ph + dist(x, y) * 0.6);   // rings of light sinking inward
        return [ramp(k, ['#7a2a14', '#b8401a', '#e86a2a', '#ffc880']), k];
      }, 0.45);
    },
  },

  'magic portal': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0, ph = (t / 1600) * TAU;
      // outer glow on the floor
      alpha(ctx, 0.22 + 0.06 * Math.sin(ph * 2), () => disc(ctx, '#60d8ff', ox + 12, oy + 12, 12));
      disc(ctx, OUT, ox + 12, oy + 12, 10.8);
      const cols = ['#1c1240', '#3a2490', '#3a6ad8', '#3ab4f0', '#8ae8ff', '#d8fcff', '#ffffff'];
      for (let y = 1; y < 23; y++) for (let x = 1; x < 23; x++) {
        const d = dist(x, y);
        if (d > 10.2) continue;
        const a = ang(x, y), arm = 0.5 + 0.5 * Math.sin(3 * a + d * 0.75 - ph * 1.0);
        const fall = 1 - d / 10.5;
        const b = arm * 0.55 * (0.4 + fall) + fall * fall * 0.85;
        R(ctx, ramp(Math.min(0.999, b), cols), ox + x, oy + y);
      }
      // motes being drawn into the vortex
      for (let i = 0; i < 4; i++) {
        const p = ((t / 1200) + i / 4) % 1, a = i * TAU / 4 + ph * 0.5 + p * 2, r = 11 - p * 9;
        const [x, y] = polar(r, a);
        R(ctx, p > 0.5 ? '#ffffff' : '#a8f0ff', ox + Math.round(x), oy + Math.round(y));
      }
    },
  },

  'web': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy, o) {
      const cx = 11, cy = 10;
      const ends = [[0, 0], [11, 0], [23, 1], [23, 11], [23, 23], [12, 23], [0, 22], [0, 11]];
      alpha(ctx, 0.55, () => {
        for (const [x, y] of ends) line(ctx, '#e8e4d8', ox + cx, oy + cy, ox + x, oy + y);
        for (const f of [0.28, 0.52, 0.78]) {
          for (let i = 0; i < ends.length; i++) {
            const [ax, ay] = ends[i], [bx, by] = ends[(i + 1) % ends.length];
            const ff = f + (hash(i, f * 10, o.seed) - 0.5) * 0.08;
            line(ctx, '#d8d4c8', ox + cx + (ax - cx) * ff, oy + cy + (ay - cy) * ff, ox + cx + (bx - cx) * ff, oy + cy + (by - cy) * ff);
          }
        }
      });
      // catching the light where strands cross
      alpha(ctx, 0.8, () => { for (const [x, y] of [[cx, cy], [cx - 3, cy - 3], [cx + 5, cy + 5], [cx + 6, cy - 2]]) R(ctx, '#fffcf0', ox + x, oy + y); });
      // an egg sac tucked in the corner
      alpha(ctx, 0.7, () => { line(ctx, '#e8e4d8', ox + 19, oy + 16, ox + 22, oy + 13); line(ctx, '#e8e4d8', ox + 17, oy + 19, ox + 14, oy + 20); });
      disc(ctx, OUT, ox + 19, oy + 19, 3.3);
      disc(ctx, '#b8b09a', ox + 19, oy + 19, 2.6);
      disc(ctx, '#e4dec8', ox + 18.5, oy + 18.5, 1.6);
      R(ctx, '#fffaea', ox + 18, oy + 18, 1, 1); R(ctx, '#968e78', ox + 19, oy + 21, 2, 1);
    },
  },

  'statue trap': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      // only a faint seam betrays the plate
      alpha(ctx, 0.6, () => {
        R(ctx, '#2a2620', ox + 5, oy + 5, 14, 1); R(ctx, '#2a2620', ox + 5, oy + 5, 1, 14);
        R(ctx, '#2a2620', ox + 5, oy + 18, 14, 1); R(ctx, '#2a2620', ox + 18, oy + 5, 1, 14);
      });
      alpha(ctx, 0.45, () => { R(ctx, '#b0a896', ox + 6, oy + 6, 12, 1); R(ctx, '#b0a896', ox + 6, oy + 6, 1, 12); });
      alpha(ctx, 0.3, () => { R(ctx, '#2a2620', ox + 8, oy + 15, 3, 1); R(ctx, '#2a2620', ox + 14, oy + 9, 2, 1); });
    },
  },

  'magic trap': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0;
      const m = mask('magic', (s) => {
        ringPts(s, 9.5);
        for (let i = 0; i < 8; i++) { const [x, y] = polar(i % 2 ? 5.5 : 8.5, i * TAU / 8 - TAU / 4); segPts(s, 11.5 + 0, 11.5, x, y); }
      });
      scorch(ctx, ox, oy, 10, '#1a1408', 0.15);
      drawRunes(ctx, ox, oy, m, '#2e2614', (x, y) => {
        const k = 0.45 + 0.35 * Math.sin(t / 240 + hash(x, y, 9) * TAU);
        return [ramp(k, ['#7a5c1c', '#b08a24', '#e0b838', '#fff0a0']), k];
      }, 0.35);
      // sparkles popping over it
      for (let i = 0; i < 3; i++) {
        const cyc = t / 700 + i / 3, n = Math.floor(cyc), p = cyc - n;
        const x = ox + 4 + Math.floor(hash(n, i, 21) * 16), y = oy + 4 + Math.floor(hash(n, i, 22) * 16);
        const a = Math.sin(p * Math.PI);
        alpha(ctx, a, () => { R(ctx, '#fff8d0', x, y); if (a > 0.6) { R(ctx, '#ffe070', x - 1, y); R(ctx, '#ffe070', x + 1, y); R(ctx, '#ffe070', x, y - 1); R(ctx, '#ffe070', x, y + 1); } });
      }
    },
  },

  'anti-magic field': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0;
      const m = mask('antimagic', (s) => {
        ringPts(s, 10, 12, 12, 0.9);
        const v = [0, 1, 2, 3].map((i) => polar(7.4, i * TAU / 4));
        for (let i = 0; i < 4; i++) segPts(s, v[i][0], v[i][1], v[(i + 1) % 4][0], v[(i + 1) % 4][1]);
        ringPts(s, 3.2);
      });
      // the floor inside looks drained of light
      alpha(ctx, 0.38, () => disc(ctx, '#06060a', ox + 12, oy + 12, 10.5));
      alpha(ctx, 0.3, () => disc(ctx, '#06060a', ox + 12, oy + 12, 6.5));
      alpha(ctx, 0.4, () => disc(ctx, '#000', ox + 12, oy + 12, 2.5));
      drawRunes(ctx, ox, oy, m, '#0a0a0e', (x, y, halo) => (halo ? ['#000', 0.8] : [hash(x, y, 4) < 0.3 ? '#3a3a48' : '#26262e', 0]), 0.35);
      // dim motes sinking into the centre
      for (let i = 0; i < 3; i++) {
        const p = ((t / 2400) + i / 3) % 1, [x, y] = polar(10 - p * 8, i * TAU / 3 + 0.5);
        alpha(ctx, 0.6 * (1 - p), () => R(ctx, '#7a7a8c', ox + Math.round(x), oy + Math.round(y)));
      }
    },
  },

  'polymorph trap': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0;
      const m = mask('poly', (s) => {
        ringPts(s, 10);
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
          const d = dist(x, y), a = ang(x, y);
          if (Math.abs(d - (6 + 1.6 * Math.sin(5 * a))) < 0.55) s.add(x + y * 24);
        }
        ringPts(s, 1.6);
      });
      scorch(ctx, ox, oy, 10.5, '#100c14', 0.18);
      drawRunes(ctx, ox, oy, m, '#1e1a22', (x, y) => {
        const h = ((ang(x, y) * 180 / Math.PI) + dist(x, y) * 24 + t * 0.24) % 360;
        return [`hsl(${Math.round((h + 360) % 360)},70%,60%)`, 0.8];
      }, 0.3);
    },
  },

  'vibrating square': {
    kind: 'ground', animated: true,
    draw(ctx, ox, oy, o) {
      const t = o.t || 0, k = 0.5 + 0.5 * Math.sin((t / 900) * TAU);
      const sq = mask('vibsq', (s) => {
        segPts(s, 3, 3, 20, 3); segPts(s, 20, 3, 20, 20); segPts(s, 20, 20, 3, 20); segPts(s, 3, 20, 3, 3);
        for (const [x, y] of [[1, 1], [22, 1], [1, 22], [22, 22]]) s.add(x + y * 24);
        for (const [x, y] of [[11, 1], [12, 1], [11, 22], [12, 22], [1, 11], [1, 12], [22, 11], [22, 12]]) s.add(x + y * 24);
      });
      const di = mask('vibdia', (s) => {
        segPts(s, 11, 6, 6, 11); segPts(s, 12, 6, 17, 11); segPts(s, 6, 12, 11, 17); segPts(s, 17, 12, 12, 17);
        segPts(s, 10, 10, 13, 10); segPts(s, 10, 13, 13, 13); segPts(s, 10, 10, 10, 13); segPts(s, 13, 10, 13, 13);
      });
      scorch(ctx, ox, oy, 12, '#140c1a', 0.18);
      const jit = (Math.floor(t / 70) % 2) && k > 0.7 ? 1 : 0;   // a fine tremble at the peak of each pulse
      drawRunes(ctx, ox + jit, oy, sq, '#22162a', () => [ramp(k, ['#5a2a7a', '#8a3ab8', '#b860f0', '#e8b0ff']), k], 0.45);
      drawRunes(ctx, ox - jit, oy, di, '#2a2210', () => [ramp(1 - k, ['#7a5c1c', '#b88a24', '#e8c040', '#fff0a8']), 1 - k], 0.45);
    },
  },

  'trapped door': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      // a taut tripwire between two pegs, one glint along it
      for (const px of [2, 20]) { R(ctx, OUT, ox + px, oy + 15, 2, 4); R(ctx, '#5a5650', ox + px, oy + 15, 2, 3); R(ctx, '#8a867e', ox + px, oy + 15, 1, 1); }
      alpha(ctx, 0.6, () => R(ctx, '#1a1612', ox + 4, oy + 17, 16, 1));
      R(ctx, '#b8b4a8', ox + 4, oy + 16, 16, 1);
      R(ctx, '#fffcf0', ox + 14, oy + 16, 1, 1);
      R(ctx, '#e8e4d8', ox + 13, oy + 16, 1, 1); R(ctx, '#e8e4d8', ox + 15, oy + 16, 1, 1);
      alpha(ctx, 0.7, () => { R(ctx, '#fffcf0', ox + 14, oy + 15, 1, 1); R(ctx, '#fffcf0', ox + 14, oy + 17, 1, 1); });
    },
  },

  'trapped chest': {
    kind: 'ground', animated: false,
    draw(ctx, ox, oy) {
      // a lock plate with a poisoned needle poking out of the keyhole
      R(ctx, OUT, ox + 6, oy + 8, 10, 11);
      R(ctx, '#5e5a52', ox + 7, oy + 9, 8, 9);
      R(ctx, '#948e80', ox + 7, oy + 9, 8, 1); R(ctx, '#948e80', ox + 7, oy + 9, 1, 9); R(ctx, '#3e3a34', ox + 8, oy + 17, 7, 1);
      R(ctx, '#b0a896', ox + 8, oy + 10, 1, 1); R(ctx, '#b0a896', ox + 13, oy + 10, 1, 1); R(ctx, '#b0a896', ox + 8, oy + 15, 1, 1); R(ctx, '#b0a896', ox + 13, oy + 15, 1, 1);
      R(ctx, '#0a0806', ox + 10, oy + 11, 2, 2); R(ctx, '#0a0806', ox + 10, oy + 13, 2, 3); R(ctx, '#0a0806', ox + 9, oy + 12, 4, 1);
      line(ctx, OUT, ox + 12, oy + 13, ox + 18, oy + 7);
      line(ctx, '#b8b8b4', ox + 12, oy + 12, ox + 18, oy + 6);
      R(ctx, '#fffcf0', ox + 18, oy + 6, 1, 1);
      alpha(ctx, 0.75, () => { R(ctx, '#fffcf0', ox + 19, oy + 6, 1, 1); R(ctx, '#fffcf0', ox + 18, oy + 5, 1, 1); R(ctx, '#fffcf0', ox + 17, oy + 6, 1, 1); R(ctx, '#fffcf0', ox + 20, oy + 6, 1, 1); R(ctx, '#fffcf0', ox + 18, oy + 4, 1, 1); });
      R(ctx, '#7a9a3a', ox + 18, oy + 8, 1, 2); R(ctx, '#a8c860', ox + 18, oy + 8, 1, 1);
    },
  },
};
