// Furniture: altars, throne, fountain, sink, grave, stairs and ladders. See README.md.
// Hand-drawn in code: whole-pixel fillRects only, 1px dark outline on standing things, light from
// the upper left. Coordinates in the helpers are relative to the cell's top-left (ox, oy).

const OL = '#120e0c';                       // outline
const SHADOW = 'rgba(8,6,4,0.38)';

// ---- colour helpers (memoised: tall props redraw every frame) ----
const shCache = new Map();
function sh(hex, k) {                        // scale a #rrggbb colour by k
  const key = hex + k;
  let v = shCache.get(key);
  if (!v) {
    v = '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
    shCache.set(key, v);
  }
  return v;
}

// a pen bound to one cell: p(colour, x, y, w, h) and p.oval(colour, x, y, w, h)
function pen(ctx, ox, oy) {
  const p = (c, x, y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h); };
  p.oval = (c, x, y, w, h) => {
    ctx.fillStyle = c;
    for (let j = 0; j < h; j++) {
      const dy = (j + 0.5 - h / 2) / (h / 2);
      const hw = (w / 2) * Math.sqrt(Math.max(0, 1 - dy * dy));
      const l = Math.round(x + w / 2 - hw), r = Math.round(x + w / 2 + hw);
      if (r > l) ctx.fillRect(ox + l, oy + y + j, r - l, 1);
    }
  };
  // is (x, y) inside the oval (x0, y0, w, h)?
  p.inOval = (x, y, x0, y0, w, h) => ((x + 0.5 - x0 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - y0 - h / 2) / (h / 2)) ** 2 <= 1;
  // pixels from a little picture: rows of characters, '.' or ' ' transparent
  p.pic = (x, y, rows, pal) => {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const c = pal[rows[j][i]];
      if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x + i, oy + y + j, 1, 1); }
    }
  };
  return p;
}

// ===================================================================== fountain
function drawFountain(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy), t = o.t || 0;
  const base = o.theme.floor[2];
  const rimHi = sh(base, 1.55), rim = sh(base, 1.28), rimLo = sh(base, 1.0);
  const faceHi = sh(base, 0.92), face = sh(base, 0.76), faceLo = sh(base, 0.56), seam = sh(base, 0.4), inner = sh(base, 0.42);
  // floor shadow, down and to the right
  p.oval(SHADOW, 2, 11, 23, 13);
  // body outline: top ellipse + bottom ellipse + the band between (a short stone drum)
  p.oval(OL, 0, 5, 24, 13); p.oval(OL, 0, 9, 24, 14); p(OL, 0, 11, 24, 6);
  // drum face, lit on the left, with block joints
  for (let x = 1; x < 23; x++) for (let y = 11; y < 22; y++) {
    if (!(y < 16 || p.inOval(x, y, 1, 10, 22, 12))) continue;
    let c = x < 5 ? faceHi : x > 16 ? faceLo : face;
    if (x === 6 || x === 12 || x === 18) c = seam;
    if (!p.inOval(x, y + 1, 1, 10, 22, 12) && y >= 16) c = sh(base, 0.45);   // bottom edge
    p(c, x, y);
  }
  // rim (top of the drum): dark lower-right edge, lit upper-left edge
  p.oval(rimLo, 1, 6, 22, 11);
  p.oval(rimHi, 1, 6, 21, 10);
  p.oval(rim, 2, 7, 20, 9);
  // opening: shadowed inner wall, then the water
  p.oval(OL, 3, 7, 18, 9);
  p.oval(inner, 4, 8, 16, 8);
  p.oval('#183a78', 4, 9, 16, 7);
  p('#10285a', 7, 9, 10, 1);                    // rim shadow on the far water
  p(rimHi, 7, 16, 10, 1);                        // lit lip of the near rim
  // ripples spreading from the spout
  for (let k = 0; k < 2; k++) {
    const ph = ((t / 1100) + k * 0.5) % 1;
    const rx = 2.5 + ph * 6, ry = rx * 0.45;
    const col = ph < 0.6 ? '#3c78c8' : '#28589e';
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const x = Math.round(12 + Math.cos(ang) * rx - 0.5), y = Math.round(12.5 + Math.sin(ang) * ry - 0.5);
      if (p.inOval(x, y, 4, 10, 16, 6)) p(col, x, y);
    }
  }
  p('#5a96e0', 6, 11, 2, 1); p('#3c78c8', 16, 14, 2, 1);    // glints
  // spout: a stone column with a cup on top
  p(OL, 10, 1, 4, 12);
  p(rimHi, 11, 2, 1, 10); p(face, 12, 2, 1, 10);
  p('#3c78c8', 11, 11, 2, 1);
  p.oval(OL, 7, -1, 10, 5);
  p.oval(rimLo, 8, 0, 8, 3); p(rimHi, 9, 0, 5, 1);
  p('#3c78c8', 10, 1, 4, 1);
  // jet: bobbing plume and arcs of droplets falling into the basin
  const jh = [3, 4, 5, 4][Math.floor(t / 110) % 4];
  p('#a8d0f0', 11, -jh, 2, jh); p('#e8f4ff', 11, -jh, 1, jh - 1);
  p('#e8f4ff', 11, -jh - 1, 2, 1);
  for (let k = 0; k < 10; k++) {
    const ph = ((t / 700) + k / 10) % 1, side = k % 2 ? 1 : -1;
    const x = Math.round(12 + side * (0.5 + ph * 6) - (side < 0 ? 1 : 0));
    const y = Math.round(-jh + 1 - 4 * ph + 16 * ph * ph);
    if (y < 12) p(ph < 0.5 ? '#e8f4ff' : '#a8d0f0', x, y);
  }
  // splashes where the arcs land
  const sp = Math.floor(t / 160) % 3;
  p('#a8d0f0', 5 + sp % 2, 12); p('#a8d0f0', 18 - sp % 2, 12);
  if (sp === 1) { p('#e8f4ff', 5, 11); p('#e8f4ff', 18, 11); }
}

// ===================================================================== sink
function drawSink(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy);
  p.oval(SHADOW, 4, 14, 21, 10);
  // pewter basin with rounded corners: thin bright rim, shallow front face
  p(OL, 2, 7, 20, 15); p(OL, 3, 6, 18, 17);
  p('#a8aeb8', 3, 7, 18, 12);
  p('#e0e4ea', 4, 7, 16, 1); p('#d0d6de', 3, 8, 1, 10);    // lit rim edges
  p('#7a808a', 20, 8, 1, 11); p('#8a909a', 4, 18, 16, 1);
  p('#4a4e58', 3, 19, 18, 2); p('#5e6470', 3, 19, 18, 1);  // front face
  p('#34383e', 4, 21, 16, 1);
  // the bowl: rounded, shadowed under the far and left rims, brightening toward the near side
  p('#3a3e46', 6, 9, 12, 8); p('#3a3e46', 5, 10, 14, 6);
  p('#5a606a', 6, 11, 12, 5); p('#5a606a', 7, 10, 11, 1);
  p('#727884', 7, 12, 11, 4);
  p('#8a909a', 8, 14, 10, 2);
  p('#9aa0aa', 9, 16, 8, 1);
  p('#b8bec8', 17, 11, 1, 4); p('#a8aeb8', 18, 11, 1, 4);   // lit right inner wall
  p('#c8d0d8', 14, 14, 2, 1);                               // shine
  // drain
  p('#2e3238', 11, 12, 3, 2); p('#08080a', 12, 12, 1, 2); p('#08080a', 11, 13, 3, 1);
  // a puddle with a drip under the tap
  p('#5a86c0', 9, 15, 3, 1); p('#9ac8f0', 10, 15, 1, 1);
  // brass gooseneck tap rising from the back rim and curving over the bowl
  p(OL, 9, 4, 6, 5); p(OL, 10, -2, 3, 7); p(OL, 10, -3, 6, 3); p(OL, 13, -1, 3, 5);
  p('#8a6a20', 10, 5, 4, 3); p('#d0a040', 10, 5, 4, 1); p('#6a4a10', 13, 6, 1, 2);
  p('#d0a040', 11, -2, 1, 7); p('#8a6a20', 12, -1, 1, 6);
  p('#d0a040', 11, -2, 4, 1); p('#f0d070', 11, -2, 2, 1);
  p('#8a6a20', 14, -1, 1, 3); p('#6a4a10', 14, 2, 1, 1);
  p('#9ac8f0', 14, 4, 1, 1);
  // hot and cold handles
  p(OL, 5, 3, 5, 5); p(OL, 15, 3, 5, 5);
  p('#d0a040', 6, 5, 3, 1); p('#d0a040', 7, 4, 1, 3); p('#c03028', 7, 5, 1, 1);
  p('#d0a040', 16, 5, 3, 1); p('#d0a040', 17, 4, 1, 3); p('#3060d0', 17, 5, 1, 1);
}

// ===================================================================== grave
const RIP = [
  'xxx.x.xxx',
  'x.x.x.x.x',
  'xx..x.xxx',
  'x.x.x.x..',
  'x.x.x.x..',
];
function drawGrave(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy);
  const st = '#8a8884', stHi = '#b0aea8', stLo = '#62605c', stDk = '#46443f', carve = '#3a3834';
  // shadow of the stone, thrown back-right onto the floor
  ctx.fillStyle = 'rgba(8,6,4,0.3)';
  for (let j = 0; j < 9; j++) ctx.fillRect(ox + 18 + Math.floor(j / 3), oy + 3 + j, 3, 1);
  p.oval(SHADOW, 5, 15, 18, 9);
  // headstone silhouette: rounded top, slightly wider plinth
  p(OL, 5, -6, 14, 19); p(OL, 6, -8, 12, 2); p(OL, 8, -9, 8, 1);
  p(OL, 4, 9, 16, 5);
  // face
  p(st, 6, -6, 12, 16); p(st, 7, -7, 10, 1); p(st, 9, -8, 6, 1);
  // top cap in 3/4 (lit) and the left edge
  p(stHi, 9, -8, 6, 1); p(stHi, 7, -7, 3, 1); p(stHi, 6, -6, 2, 1); p(stHi, 14, -7, 3, 1); p(stHi, 16, -6, 2, 1);
  p(stHi, 6, -5, 1, 14);
  // right side in shade
  p(stLo, 16, -5, 2, 15); p(stDk, 17, -4, 1, 14);
  p(stLo, 15, -6, 1, 1);
  // plinth
  p(stLo, 5, 9, 14, 4); p(stHi, 5, 9, 13, 1); p(stDk, 17, 10, 2, 3); p(stDk, 5, 12, 14, 1);
  // carving: RIP or a cross (per grave)
  if ((o.seed || 0) % 3 === 0) {
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) if (RIP[Math.min(j, 4)] && j < 5 && RIP[j][i] === 'x') {
      p(carve, 7 + i, 0 + j);
      if (j === 4 || RIP[j + 1][i] !== 'x') p(stHi, 7 + i, 1 + j);
    }
    p(carve, 8, -4, 7, 1); p(stHi, 8, -3, 7, 1);           // a line above
  } else {
    p(carve, 11, -5, 2, 11); p(carve, 8, -2, 8, 2);
    p(stHi, 13, -5, 1, 3); p(stHi, 13, 0, 1, 6); p(stHi, 11, 6, 2, 1); p(stHi, 8, 0, 3, 1); p(stHi, 13, 0, 3, 1); p(stHi, 16, -2, 1, 2);
  }
  // weathering: a crack and moss creeping up the base
  p(stDk, 15, -6, 1, 2); p(stDk, 14, -4, 1, 2); p(stDk, 15, -2, 1, 1);
  p('#4a6a34', 6, 7, 2, 2); p('#5e823e', 6, 6, 1, 1); p('#4a6a34', 16, 8, 1, 1);
  // dirt mound in front: a long low heap, lit on top, with clods, grass and a flower
  const HW = [3, 5, 6, 7, 7, 7, 7, 7, 7, 7, 6, 5, 3];
  HW.forEach((w, j) => p(OL, 12 - w - 1, 10 + j, w * 2 + 2, 1));
  p(OL, 12 - HW[0], 9, HW[0] * 2, 1); p(OL, 12 - HW[12], 23, HW[12] * 2, 1);
  HW.forEach((w, j) => {
    const y = 10 + j;
    p(j < 3 ? '#62482f' : j < 9 ? '#4a3626' : '#3a2a1c', 12 - w, y, w * 2, 1);
    p('#33251a', 12 + w - 2, y, 2, 1);                  // shaded right flank
    if (j > 1) p('#5a4230', 12 - w, y, 1, 1);           // lit left flank
  });
  p('#7a5c3c', 9, 10, 5, 1); p('#6a5038', 7, 11, 3, 1);
  p('#3a2a1c', 7, 15, 9, 1); p('#3a2a1c', 8, 18, 7, 1);  // furrows
  p('#6a5038', 8, 16, 2, 1); p('#6a5038', 13, 13, 2, 1); p('#6a5038', 11, 19, 2, 1);
  p('#8a8478', 7, 17, 1, 1); p('#a09a8c', 15, 16, 1, 1);
  p('#4a6a34', 4, 17, 1, 3); p('#5e823e', 5, 15, 1, 2); p('#4a6a34', 19, 15, 1, 3); p('#5e823e', 18, 19, 1, 3);
  if ((o.seed || 0) % 2) { p('#4a6a34', 14, 14, 1, 2); p('#d8d0e8', 13, 13, 1, 1); p('#d8d0e8', 15, 13, 1, 1); p('#f0d070', 14, 13, 1, 1); p('#d8d0e8', 14, 12, 1, 1); }
}

// ===================================================================== throne
function drawThrone(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy);
  const g = '#8a6a20', gHi = '#d0a040', gLt = '#f0d070', gDk = '#5a420e';
  const v = '#5a1018', vHi = '#8a2030', vLt = '#a83040', vDk = '#3a0810';
  // dais: low stone step under the whole throne
  p(OL, 0, 14, 24, 10);
  p('#8a8478', 1, 15, 22, 4); p('#a8a294', 1, 15, 22, 1); p('#a8a294', 1, 15, 1, 4);
  p('#4a453e', 1, 19, 22, 4); p('#5e584e', 1, 19, 22, 1); p('#36322c', 1, 22, 22, 1);
  p('#36322c', 7, 20, 1, 2); p('#36322c', 16, 20, 1, 2);
  p('#8a2030', 8, 19, 8, 4); p('#a83040', 8, 19, 8, 1); p('#5a1018', 15, 20, 1, 3);   // carpet runner
  p(gHi, 8, 22, 8, 1);
  // shadow of the throne on the dais
  ctx.fillStyle = 'rgba(8,6,4,0.35)'; ctx.fillRect(ox + 19, oy + 15, 3, 4); ctx.fillRect(ox + 6, oy + 18, 15, 1);
  // back: gold frame with finials and a crest
  p(OL, 5, -6, 14, 18);
  p(OL, 4, -9, 4, 4); p(OL, 16, -9, 4, 4);       // finial balls
  p(OL, 10, -10, 4, 5); p(OL, 9, -8, 6, 2);       // crest
  p(g, 6, -5, 12, 16);
  p(gHi, 6, -5, 12, 1); p(gHi, 6, -5, 1, 16); p(gDk, 17, -4, 1, 15);
  p(g, 5, -8, 2, 2); p(gLt, 5, -8, 1, 1); p(g, 17, -8, 2, 2); p(gLt, 17, -8, 1, 1);
  p(g, 11, -9, 2, 4); p(g, 10, -7, 4, 1); p(gLt, 11, -9, 1, 1); p('#c02020', 11, -7, 2, 1);  // ruby
  // velvet panel, tufted
  p(vDk, 8, -3, 8, 12);
  p(v, 8, -2, 8, 11); p(vHi, 8, -2, 1, 11); p(vHi, 9, -3, 6, 1);
  for (const [bx, by] of [[10, -1], [13, -1], [11, 2], [10, 5], [13, 5], [12, 2]]) { p(gHi, bx, by); p(vLt, bx - 1, by - 1); }
  p(vDk, 15, -2, 1, 11);
  // arms: gold rails with lion-knob ends
  p(OL, 2, 4, 6, 12); p(OL, 16, 4, 6, 12);
  p(g, 3, 5, 4, 10); p(gHi, 3, 5, 4, 1); p(gHi, 3, 5, 1, 10); p(gDk, 6, 6, 1, 9);
  p(g, 17, 5, 4, 10); p(gHi, 17, 5, 4, 1); p(gHi, 17, 5, 1, 10); p(gDk, 20, 6, 1, 9);
  p(gLt, 4, 6, 1, 1); p(gLt, 18, 6, 1, 1);
  p(vHi, 4, 7, 2, 4); p(vHi, 18, 7, 2, 4); p(v, 5, 8, 1, 3); p(v, 19, 8, 1, 3);  // padded armrests
  // seat cushion and gold apron
  p(OL, 6, 8, 12, 9);
  p(vHi, 7, 9, 10, 4); p(vLt, 7, 9, 10, 1); p(vLt, 7, 9, 1, 3); p(v, 7, 12, 10, 1); p(v, 16, 10, 1, 3);
  p(g, 7, 13, 10, 3); p(gHi, 7, 13, 10, 1); p(gDk, 7, 15, 10, 1);
  p(gLt, 11, 14, 2, 1);
  // feet
  p(OL, 3, 15, 3, 2); p(OL, 18, 15, 3, 2); p(gDk, 4, 15, 1, 1); p(gDk, 19, 15, 1, 1);
}

// ===================================================================== altars
// an altar seen in 3/4: an overhanging slab (top y 5..10, edge y 11..12, x 2..21) on a narrower
// body (x 4..19, y 13..18) on a wide plinth (y 19..21)
function altarBlock(p, ctx, ox, oy, s) {
  ctx.fillStyle = SHADOW;
  ctx.fillRect(ox + 4, oy + 22, 20, 2); ctx.fillRect(ox + 23, oy + 7, 1, 15); ctx.fillRect(ox + 20, oy + 13, 3, 6);
  p(OL, 1, 4, 22, 10); p(OL, 3, 13, 18, 7); p(OL, 1, 18, 22, 5);
  // slab
  p(s.top, 2, 5, 20, 6);
  p(s.topHi, 2, 5, 20, 1); p(s.topHi, 2, 5, 1, 6); p(s.topLo, 21, 6, 1, 5);
  p(s.edge, 2, 11, 20, 1); p(s.frontHi, 2, 12, 20, 1); p(s.front, 20, 11, 2, 2);
  // body under the overhang
  p(s.front, 4, 13, 16, 6);
  p(s.frontLo, 4, 13, 16, 1); p(s.frontHi, 4, 14, 1, 5); p(s.frontLo, 18, 14, 2, 5);
  // plinth
  p(s.top, 2, 19, 20, 2); p(s.topHi, 2, 19, 20, 1); p(s.frontLo, 2, 21, 20, 1); p(s.topLo, 21, 19, 1, 2);
}
const STONE = { top: '#8a8478', topHi: '#aaa496', topLo: '#746e62', edge: '#b8b2a2', front: '#4a453e', frontHi: '#5e584e', frontLo: '#36322c' };

function drawCandle(p, x, y, t, k) {
  p(OL, x - 1, y - 1, 4, 7);
  p('#f0ead0', x, y, 2, 5); p('#c8c0a0', x + 1, y + 1, 1, 4); p('#fffbea', x, y, 1, 1);
  const f = (Math.floor(t / 130) + k) % 4;
  p('#ff9a30', x, y - 2, 2, 2);
  p('#ffd65c', x + (f === 1 ? 1 : 0), y - 3 - (f === 2 ? 1 : 0), 1, 2 + (f === 2 ? 1 : 0));
  p('#fff6c0', x + (f === 1 ? 1 : 0), y - 2, 1, 1);
}

function drawLawful(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy), t = o.t || 0;
  altarBlock(p, ctx, ox, oy, STONE);
  // white cloth over the top and hanging down the front, gold hem
  const w = '#e8e4d8', wHi = '#fffcf0', wSh = '#b8b2a0', wDk = '#8e8878', gold = '#d0a040', goldHi = '#f0d070';
  p(OL, 6, 13, 12, 6);
  p(w, 5, 5, 14, 6); p(wHi, 5, 5, 14, 1); p(wSh, 18, 6, 1, 5);
  p(w, 6, 11, 12, 7); p(wHi, 6, 11, 12, 1); p(wSh, 15, 12, 2, 5); p(wDk, 17, 12, 1, 6);
  p(wSh, 8, 13, 1, 4);
  p(gold, 6, 17, 12, 1); p(goldHi, 6, 17, 4, 1); p(wDk, 6, 18, 12, 1);
  p(gold, 5, 5, 1, 6); p(gold, 18, 5, 1, 6);
  // sunburst on the hanging cloth
  p(gold, 11, 12, 2, 4); p(gold, 10, 13, 4, 2); p(goldHi, 11, 13, 1, 1);
  p(gold, 9, 12, 1, 1); p(gold, 14, 12, 1, 1); p(gold, 9, 15, 1, 1); p(gold, 14, 15, 1, 1);
  // a gold chalice in the middle, candles at the back corners
  p(OL, 10, 3, 4, 7); p(gold, 11, 4, 2, 2); p(goldHi, 11, 4, 1, 1); p('#8a6a20', 11, 6, 2, 1); p(gold, 11, 7, 1, 1); p(gold, 10, 8, 4, 1);
  drawCandle(p, 3, 4, t, 0); drawCandle(p, 19, 4, t, 2);
}

function drawNeutral(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy);
  altarBlock(p, ctx, ox, oy, STONE);
  const c = '#6a7a94', cHi = '#8a9ab4', cLt = '#a8b8d0', cDk = '#46546c', silver = '#c8d0d8';
  // grey-blue runner across the top and down the front, silver hem and tassels
  p(OL, 6, 13, 12, 6);
  p(c, 6, 5, 12, 6); p(cLt, 6, 5, 12, 1); p(cHi, 6, 5, 1, 6); p(cDk, 17, 6, 1, 5);
  p(c, 6, 11, 12, 6); p(cLt, 6, 11, 12, 1); p(cHi, 6, 12, 1, 5); p(cDk, 16, 12, 2, 5);
  p(silver, 6, 16, 12, 1); p(cDk, 6, 17, 12, 1);
  p(silver, 7, 18, 1, 2); p(silver, 10, 18, 1, 1); p(silver, 13, 18, 1, 1); p(silver, 16, 18, 1, 2);
  // balance emblem: a ring, half filled
  p(silver, 11, 12, 2, 1); p(silver, 10, 13, 1, 2); p(silver, 13, 13, 1, 2); p(silver, 11, 15, 2, 1);
  p(silver, 12, 13, 1, 2);
  // a silver offering bowl on top
  p.oval(OL, 8, 3, 8, 6);
  p.oval('#8a909a', 9, 4, 6, 4); p('#e0e4ea', 9, 5, 6, 1); p('#3c78c8', 10, 5, 4, 1); p('#6e747e', 10, 7, 4, 1);
}

function drawChaotic(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy);
  altarBlock(p, ctx, ox, oy, STONE);
  const k = '#1c1618', kHi = '#34282c', kLt = '#4a3a3e', b = '#8a0e10', bHi = '#c01c18', bDk = '#5a080a';
  // black cloth, ragged hem
  p(k, 4, 5, 16, 6); p(kLt, 4, 5, 16, 1); p(kHi, 4, 5, 1, 6);
  p(OL, 5, 13, 12, 5);
  p(k, 5, 11, 12, 6); p(kLt, 5, 11, 12, 1); p(kHi, 5, 12, 1, 5);
  p(k, 5, 17, 2, 1); p(k, 9, 17, 3, 1); p(k, 14, 17, 2, 2);
  p(kHi, 9, 12, 1, 4); p(kHi, 13, 12, 1, 3);
  // blood: a pool on top, running over the edge, down the cloth and the bare stone
  p(bDk, 8, 6, 7, 4); p(b, 9, 6, 5, 3); p(bHi, 10, 7, 2, 1); p('#ff5a40', 10, 7, 1, 1);
  p(b, 13, 9, 2, 3); p(b, 14, 11, 1, 6); p(bDk, 14, 17, 1, 2);
  p(b, 7, 10, 1, 4); p(bDk, 7, 14, 1, 1);
  p(b, 18, 10, 1, 3); p(b, 18, 13, 1, 4); p(bDk, 18, 17, 1, 2);
  p(bDk, 16, 20, 4, 1); p(b, 17, 20, 2, 1);
  // a sacrificial dagger and a skull
  p(OL, 15, 3, 7, 3); p('#c8ccd4', 16, 4, 4, 1); p('#ffffff', 16, 4, 1, 1); p('#6a4a2a', 20, 4, 1, 1);
  p(OL, 2, 2, 6, 6); p('#d8d0b8', 3, 3, 4, 3); p('#d8d0b8', 4, 6, 2, 1); p('#120e0c', 3, 4, 1, 1); p('#120e0c', 5, 4, 1, 1); p('#a8a088', 6, 4, 1, 2);
}

function drawUnaligned(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy);
  const s = { top: '#7e7a70', topHi: '#9a958a', topLo: '#6a665c', edge: '#a8a294', front: '#46423c', frontHi: '#58534b', frontLo: '#302d28' };
  altarBlock(p, ctx, ox, oy, s);
  const cr = '#26231f', crHi = '#b0aa9a';
  // cracks across the slab and down the body
  p(cr, 5, 6, 1, 1); p(cr, 6, 7, 2, 1); p(cr, 8, 8, 1, 2); p(cr, 9, 10, 1, 2); p(cr, 9, 12, 1, 1); p(cr, 10, 13, 1, 3); p(cr, 11, 16, 1, 3);
  p(crHi, 6, 8, 2, 1); p(crHi, 9, 9, 1, 1); p(crHi, 11, 14, 1, 1);
  p(cr, 15, 5, 1, 2); p(cr, 16, 7, 1, 1); p(cr, 17, 8, 2, 1); p(cr, 13, 9, 3, 1);
  // a chipped front corner, with the chip lying on the plinth
  p(OL, 18, 10, 4, 2); p(OL, 20, 12, 2, 1); p(s.frontLo, 18, 12, 2, 1);
  p(OL, 19, 18, 3, 2); p('#8a8478', 19, 18, 1, 1);
  // lichen and grit
  p('#5e6a3c', 2, 9, 2, 1); p('#4a5630', 2, 10, 1, 1); p('#5e6a3c', 4, 18, 2, 1); p('#6e7a44', 3, 19, 1, 1);
  p('#5e584e', 6, 22, 1, 1); p('#7a7468', 14, 22, 1, 1);
}

function drawMoloch(ctx, ox, oy, o) {
  const p = pen(ctx, ox, oy), t = o.t || 0;
  const s = { top: '#3e3836', topHi: '#544c48', topLo: '#302a28', edge: '#62564f', front: '#221e1e', frontHi: '#2e2828', frontLo: '#141010' };
  const pulse = 0.5 + 0.5 * Math.sin(t / 380);
  const ga = ctx.globalAlpha;
  // red glow on the floor around the altar, breathing
  ctx.globalAlpha = ga * (0.14 + 0.08 * pulse); p('#ff3010', -2, 2, 28, 22);
  ctx.globalAlpha = ga * (0.12 + 0.08 * pulse); p('#ff3010', -3, 6, 30, 15);
  ctx.globalAlpha = ga;
  altarBlock(p, ctx, ox, oy, s);
  // horns at the back corners
  p(OL, 1, -1, 4, 7); p(OL, 19, -1, 4, 7);
  p('#a89a88', 2, 1, 2, 4); p('#a89a88', 20, 1, 2, 4); p('#d8ccb8', 2, 0, 1, 2); p('#d8ccb8', 21, 0, 1, 2); p('#6a5e50', 3, 3, 1, 2); p('#6a5e50', 21, 3, 1, 2);
  // ember-filled hollow in the slab
  p(OL, 5, 6, 14, 5);
  const hot = ['#5a0a04', '#8a1408', '#d02810', '#ff6020', '#ffb040'];
  for (let y = 7; y < 10; y++) for (let x = 6; x < 18; x++) {
    const n = Math.sin(x * 2.1 + y * 3.7 + t / 260) + Math.sin(x * 0.7 - t / 410 + y);
    p(hot[Math.max(0, Math.min(4, Math.floor(1.6 + n + pulse * 0.8)))], x, y);
  }
  // glowing cracks in the body: a rough rune
  const cr = pulse > 0.5 ? '#ff4018' : '#c02810';
  p(cr, 12, 13, 1, 5); p(cr, 10, 13, 1, 2); p(cr, 14, 13, 1, 2); p(cr, 10, 15, 5, 1);
  p('#8a1408', 7, 14, 1, 3); p('#8a1408', 16, 15, 1, 2);
  // smoke curling up from the embers: dark puffs that swell and thin as they rise
  for (let k = 0; k < 6; k++) {
    const ph = ((t / 2400) + k / 6) % 1;
    const y = Math.round(6 - ph * 26);
    const x = Math.round(9 + (k % 3) * 3 + Math.sin(ph * 5 + k * 2) * 2.5);
    ctx.globalAlpha = ga * Math.max(0, 0.85 * (1 - ph * ph));
    if (ph < 0.2) { p('#c03020', x, y, 1, 1); p('#3a2a26', x, y - 1, 1, 1); continue; }
    const r = ph < 0.5 ? 1 : 2;
    p('#2a2220', x - r + 1, y - r, r * 2 - 1, r * 2 + 1); p('#2a2220', x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
    p('#54484a', x - r + 1, y - r + 1, 1, 1);
  }
  ctx.globalAlpha = ga;
}

// ===================================================================== stairs
const TRIM = '#d0a040', TRIM_HI = '#f0d070', RUNE = '#4aa8ff', RUNE_HI = '#c8ecff';
// a 3x5 glowing rune (an arrow-like "branch" sign) at (x, y)
function rune(p, x, y) {
  p('#141c2c', x - 1, y - 1, 5, 7);
  p(RUNE, x + 1, y, 1, 5); p(RUNE, x, y + 1, 1, 1); p(RUNE, x + 2, y + 1, 1, 1); p(RUNE, x, y + 3, 1, 1); p(RUNE, x + 2, y + 3, 1, 1);
  p(RUNE_HI, x + 1, y + 2, 1, 1);
}

// Up: a flight of five stone steps climbing toward the top of the cell, each step a little
// narrower than the one below, so the silhouette steps inward like a stair profile.
function drawStairsUp(ctx, ox, oy, o, branch) {
  const p = pen(ctx, ox, oy);
  const tread = ['#7e786c', '#948e80', '#aaa494', '#c0baa8', '#d6d0bc'];
  const treadHi = ['#948e80', '#aaa494', '#c0baa8', '#d6d0bc', '#ece6d2'];
  const riser = ['#3e3a33', '#4a463e', '#56514a', '#625d54', '#706a60'];
  const L = (s) => 1 + s, W = (s) => 22 - 2 * s, Y = (s) => 18 - 4 * s;   // step s: x from L, tread at Y
  // floor shadow down the right of each step
  ctx.fillStyle = 'rgba(8,6,4,0.35)';
  for (let s = 1; s < 5; s++) ctx.fillRect(ox + L(s) + W(s) + 1, oy + Y(s) + 1, 1, 4);
  ctx.fillRect(ox + 2, oy + 23, 22, 1);
  // stepped outline, top step first so lower steps sit in front
  for (let s = 4; s >= 0; s--) p(OL, L(s) - 1, Y(s) - 1, W(s) + 2, 6 - (s === 0 ? 1 : 0));
  p(OL, 4, 0, 16, 2);
  // top landing
  p(treadHi[4], 5, 1, 14, 1);
  for (let s = 4; s >= 0; s--) {
    const x = L(s), w = W(s), y = Y(s);
    p(tread[s], x, y, w, 2); p(treadHi[s], x, y, w, 1);
    p(riser[s], x, y + 2, w, 2); p(sh(riser[s], 0.7), x, y + 3, w, 1);
    p(treadHi[s], x, y, 1, 3);                         // lit left end
    p(sh(tread[s], 0.72), x + w - 1, y, 1, 4);         // shaded right end
    p('#120e0c', x + w - 1, y + 3, 1, 1);
    if (branch) { p(TRIM, x + 1, y, 2, 1); p(TRIM, x + w - 3, y, 2, 1); p(TRIM_HI, x + 1, y, 1, 1); }
  }
  // wear in the middle of the treads
  for (let s = 0; s < 5; s++) p(sh(tread[s], 0.9), 10, Y(s) + 1, 4, 1);
  if (branch) { rune(p, 1, 3); rune(p, 20, 3); }
}

// Down: a square shaft in the floor with steps dropping away from a warm-lit top step into black,
// narrowing as they sink, inside a stone lip.
function drawStairsDown(ctx, ox, oy, o, branch) {
  const p = pen(ctx, ox, oy);
  // lip
  p(OL, 1, 1, 22, 22);
  p(branch ? '#8a6a20' : '#6e685e', 2, 2, 20, 20);
  p(branch ? TRIM : '#8a8478', 2, 2, 19, 19);
  p(branch ? TRIM_HI : '#aaa496', 2, 2, 19, 1); p(branch ? TRIM_HI : '#aaa496', 2, 2, 1, 19);
  p(branch ? '#a8842c' : '#7a7468', 3, 3, 18, 18);
  // the shaft
  p(OL, 4, 4, 16, 16);
  p('#050506', 5, 4, 14, 16);
  const tread = ['#c8a878', '#8e7556', '#5a4a38', '#342a20'];
  const treadHi = ['#e8cc98', '#a88c66', '#6e5c44', '#40342a'];
  const riser = ['#5a4a36', '#3a3024', '#221c16', '#120f0c'];
  for (let s = 0; s < 4; s++) {
    const x = 5 + s, w = 14 - 2 * s, y = 4 + s * 4;
    p(tread[s], x, y, w, 2); p(treadHi[s], x, y, w, 1);
    p(riser[s], x, y + 2, w, 2);
    // the shaft walls beside the lower steps, falling into shadow
    if (s) { p('#16120e', 5, y, s, 4); p('#2a221a', 19 - s, y, s, 4); }
  }
  p('#020203', 9, 19, 6, 1);
  // shadow of the near (top) lip falling across the left wall, a glint on the right lip edge
  p('#0c0a08', 5, 4, 1, 16);
  if (branch) { rune(p, 1, 9); rune(p, 20, 9); }
}

// ===================================================================== ladders
function rails(p, x1, x2, y0, y1, fade) {
  // two rails with rungs every 3px; fade(y) -> 0..1 darkening with depth
  const col = (c, y) => fade ? sh(c, fade(y)) : c;
  for (let y = y0; y <= y1; y++) { p(OL, x1 - 1, y, 4, 1); p(OL, x2 - 1, y, 4, 1); }
  for (let y = y0 + 2; y < y1; y += 3) {
    p(OL, x1 + 2, y - 1, x2 - x1 - 2, 3);
    p(col('#7a5030', y), x1 + 2, y, x2 - x1 - 2, 1);
    p(col('#a0703e', y), x1 + 2, y, 3, 1);
  }
  for (let y = y0; y <= y1; y++) {
    p(col('#7a5030', y), x1, y, 1, 1); p(col('#3a2414', y), x1 + 1, y, 1, 1);
    p(col('#7a5030', y), x2, y, 1, 1); p(col('#3a2414', y), x2 + 1, y, 1, 1);
  }
}

// Up: a ladder standing on the floor and climbing into a dark hatch in the ceiling at the cell top
function drawLadderUp(ctx, ox, oy, o, branch) {
  const p = pen(ctx, ox, oy);
  // the hatch: a black opening framed by beams, its near edge catching the light
  p(OL, 2, 0, 20, 8);
  p(branch ? '#8a6a20' : '#5a3a20', 3, 0, 18, 7);
  p(branch ? TRIM : '#7a5030', 3, 5, 18, 1); p(branch ? TRIM_HI : '#a0703e', 3, 6, 18, 1);
  p('#3a2414', 3, 0, 2, 5); p('#3a2414', 19, 0, 2, 5);
  p('#050506', 5, 0, 14, 5);
  p('#1a1612', 5, 4, 14, 1);
  // ladder shadow on the floor (light from the upper left)
  ctx.fillStyle = 'rgba(8,6,4,0.35)';
  ctx.fillRect(ox + 9, oy + 22, 13, 2);
  for (let y = 9; y < 22; y++) ctx.fillRect(ox + 17 + ((y - 9) >> 2), oy + y, 2, 1);
  // ladder: feet on the floor, top vanishing into the hatch
  rails(p, 7, 15, 2, 22, (y) => (y < 5 ? 0.35 : 1));
  p(OL, 5, 22, 5, 1); p(OL, 13, 22, 5, 1);
  if (branch) { rune(p, 1, 12); rune(p, 20, 12); }
}

// Down: a round hole in the floor with a lit stone rim, the ladder's top hooked over the far edge
function drawLadderDown(ctx, ox, oy, o, branch) {
  const p = pen(ctx, ox, oy);
  p.oval('rgba(8,6,4,0.35)', 3, 4, 21, 20);
  p.oval(OL, 1, 2, 22, 20);
  p.oval(branch ? '#8a6a20' : '#5e584e', 2, 3, 20, 18);
  p.oval(branch ? TRIM_HI : '#b4ae9e', 2, 3, 19, 17);
  p.oval(branch ? TRIM : '#8a8478', 3, 4, 18, 16);
  p.oval(OL, 5, 6, 14, 13);
  p.oval('#050506', 5, 6, 14, 13);
  p.oval('#2a241e', 6, 7, 12, 3); p('#050506', 7, 9, 10, 1);    // far inner wall catching light
  // ladder hooked over the far rim and going down into the dark
  rails(p, 8, 14, 2, 18, (y) => (y < 8 ? 1 : Math.max(0.1, 1 - (y - 8) * 0.1)));
  p('#a0703e', 8, 2, 1, 1); p('#a0703e', 14, 2, 1, 1);
  p('#050506', 7, 18, 10, 1);
  if (branch) { rune(p, 1, 9); rune(p, 20, 9); }
}

// ===================================================================== exports
const ALT = { kind: 'tall' };
export default {
  'fountain': { kind: 'tall', animated: true, draw: drawFountain },
  'sink': { kind: 'tall', animated: false, draw: drawSink },
  'grave': { kind: 'tall', animated: false, draw: drawGrave },
  'opulent throne': { kind: 'tall', animated: false, draw: drawThrone },
  'lawful lawful altar': { ...ALT, animated: true, draw: drawLawful },
  'neutral neutral altar': { ...ALT, animated: false, draw: drawNeutral },
  'chaotic chaotic altar': { ...ALT, animated: false, draw: drawChaotic },
  'unaligned unaligned altar': { ...ALT, animated: false, draw: drawUnaligned },
  'other altar other altar altar': { ...ALT, animated: true, draw: drawMoloch },
  'staircase up': { kind: 'ground', animated: false, draw: (c, x, y, o) => drawStairsUp(c, x, y, o, false) },
  'staircase down': { kind: 'ground', animated: false, draw: (c, x, y, o) => drawStairsDown(c, x, y, o, false) },
  'branch staircase up': { kind: 'ground', animated: false, draw: (c, x, y, o) => drawStairsUp(c, x, y, o, true) },
  'branch staircase down': { kind: 'ground', animated: false, draw: (c, x, y, o) => drawStairsDown(c, x, y, o, true) },
  'ladder up': { kind: 'ground', animated: false, draw: (c, x, y, o) => drawLadderUp(c, x, y, o, false) },
  'ladder down': { kind: 'ground', animated: false, draw: (c, x, y, o) => drawLadderDown(c, x, y, o, false) },
  'branch ladder up': { kind: 'ground', animated: false, draw: (c, x, y, o) => drawLadderUp(c, x, y, o, true) },
  'branch ladder down': { kind: 'ground', animated: false, draw: (c, x, y, o) => drawLadderDown(c, x, y, o, true) },
};
