// Paper-doll hero sprites: the role's base body (underclothes only) with every worn and
// wielded item drawn on top, in the exact layout of an actor sheet (9 frames x 4 rows
// S,E,N,W; frame size and feet as the role's sheet in assets/actors/manifest.json).
//
// Art comes from tools/sprites3d/gear.py (assets/gear/). Each base and each layer has an
// .aux.png alongside: R = depth (0 empty, else smaller = nearer the camera), G = tint
// channel (0 fixed colour, 1 tint, 2 tint a shade darker), B = light level 0..4 (+5 when
// darkened at a depth edge, 15 for the outline). Pieces are merged with a z-buffer, so a
// shield behind the body, a beard over a breastplate or a robe over boots come out right
// whatever is worn, and recolourable pieces (cloaks, boots, gloves, dragon scales, plate
// metals...) take their colour from the item via the same hue-shifted ramp as the renderer.
//
//   await loadGear('assets/gear/');                    // optional; composeHero loads lazily
//   const sheet = await composeHero('valkyrie', game.equipment);   // canvas or null
//   const now = heroSheet('valkyrie', eq, () => redraw());          // cached canvas or null (composes in the background)

let base = 'assets/gear/';
let gearP = null;
let G = null;
const imgCache = new Map();      // file -> Promise<ImageData>
const sheetCache = new Map();    // signature -> Promise<canvas|null>
const ready = new Map();         // signature -> canvas|null

export function loadGear(path) {
  if (path) { if (path !== base) { gearP = null; imgCache.clear(); sheetCache.clear(); ready.clear(); } base = path.endsWith('/') ? path : path + '/'; }
  if (!gearP) {
    gearP = fetch(base + 'gear.json').then((r) => { if (!r.ok) throw new Error('gear.json ' + r.status); return r.json(); })
      .then((g) => { G = g; return g; })
      .catch((e) => { gearP = null; throw e; });
  }
  return gearP;
}

// ------------------------------------------------------------------ names -> variants
const EROSION = /\b(?:very|thoroughly)?\s*(?:rusty|rusted|burnt|rotted|corroded|eroded|deteriorated)\b/g;
const PROOF = /\b(?:rustproof|fireproof|corrodeproof|rotproof|erodeproof|fixed|greased|poisoned|partly eaten|diluted|lit|unlit)\b/g;

export function normalizeName(s) {
  let n = String(s || '').toLowerCase().trim();
  n = n.replace(/\s*\([^)]*\)\s*$/, '');                       // "(being worn)", "(weapon in hand)"
  n = n.replace(/^(?:a|an|the|\d+)\s+/, '');
  n = n.replace(/\b(?:uncursed|blessed|cursed)\s+/g, '').replace(/(^|\s)[+-]\d+\s+/g, '$1');
  n = n.replace(EROSION, '').replace(PROOF, '');
  n = n.replace(/^\s*(?:pair|set) of\s+/, '');
  n = n.replace(/\s+(?:named|called)\s+.*$/, '');
  return n.replace(/\s+/g, ' ').trim();
}

function lookup(n) {
  const it = G.items;
  if (Object.prototype.hasOwnProperty.call(it, n)) return it[n];
  const art = G.artifacts[n] ?? G.artifacts['the ' + n];
  if (art !== undefined) return art === null ? null : lookup(art);
  if (n.startsWith('the ')) return lookup(n.slice(4));
  return undefined;
}

// equipment slot + { name, text, cat } -> variant id, or null for nothing to draw
export function resolveVariant(slot, item) {
  if (!G || !item) return null;
  const isWeaponCat = /weapon/i.test(item.cat || '');
  const tries = [item.name, item.text].filter(Boolean).map(normalizeName);
  for (const n of tries) {
    const v = lookup(n);
    if (v === null) return null;
    if (v !== undefined) {
      const vs = G.variants[v]?.slot;
      if (!vs) continue;
      if (slot === 'main' && vs !== 'main') return null;          // wielding armour: not drawn as a weapon
      if (slot === 'off' && vs === 'main') return null;           // second weapon when two-weaponing: not drawn
      return v;
    }
  }
  const n = tries[0] || '';
  const kslot = slot === 'off' && isWeaponCat ? null : slot;
  for (const [kw, v] of (kslot && G.keywords[kslot]) || []) if (n.includes(kw)) return v;
  if (slot === 'main') return isWeaponCat ? G.fallback.main : null;
  return G.fallback[slot] || null;
}

const SLOTS = ['shirt', 'body', 'cloak', 'feet', 'hands', 'head', 'off', 'main'];

export function roleKey(role) {
  if (!G) return null;
  if (typeof role === 'number' || /^\d+$/.test(String(role))) {
    for (const [k, r] of Object.entries(G.roles)) if (r.mnum === +role) return k;
    return null;
  }
  const k = String(role || '').toLowerCase().trim();
  return G.roles[k] ? k : G.roleAliases[k] || null;
}

// The variants an outfit draws, in draw order: [{ slot, variant, layer, tint, metal }]
export function outfit(equipment) {
  const out = [], seen = new Set();
  for (const slot of SLOTS) {
    const v = resolveVariant(slot, equipment?.[slot]);
    if (!v || seen.has(G.variants[v].layer)) continue;
    seen.add(G.variants[v].layer);
    out.push({ slot, variant: v, ...G.variants[v] });
  }
  return out.sort((a, b) => G.layers[a.layer].order - G.layers[b.layer].order);
}

export function signature(role, equipment) {
  return roleKey(role) + '|' + outfit(equipment).map((o) => o.variant).join(',');
}

// ------------------------------------------------------------------ colour ramp (sdf.ramp)
function rgbToHls(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mn + mx) / 2;
  if (mn === mx) return [0, l, 0];
  const s = l <= 0.5 ? (mx - mn) / (mx + mn) : (mx - mn) / (2 - mx - mn);
  const rc = (mx - r) / (mx - mn), gc = (mx - g) / (mx - mn), bc = (mx - b) / (mx - mn);
  let h = r === mx ? bc - gc : g === mx ? 2 + rc - bc : 4 + gc - rc;
  h = (((h / 6) % 1) + 1) % 1;
  return [h, l, s];
}
function hlsToRgb(h, l, s) {
  if (s === 0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s, m1 = 2 * l - m2;
  const v = (hue) => {
    hue = ((hue % 1) + 1) % 1;
    if (hue < 1 / 6) return m1 + (m2 - m1) * hue * 6;
    if (hue < 0.5) return m2;
    if (hue < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - hue) * 6;
    return m1;
  };
  return [v(h + 1 / 3), v(h), v(h - 1 / 3)];
}
const pmod = (a) => ((a % 1) + 1) % 1;
export function ramp(hex, metal = false, k = 1) {
  let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  if (k !== 1) { r = Math.trunc(r * k); g = Math.trunc(g * k); b = Math.trunc(b * k); }
  const [h, l, s] = rgbToHls(r / 255, g / 255, b / 255);
  const out = [];
  for (let st = -2; st <= 2; st++) {
    let hh = h;
    if (st < 0) hh = h + (pmod(0.72 - h + 0.5) - 0.5) * (0.10 * -st);
    else if (st > 0) hh = h + (pmod(0.13 - h + 0.5) - 0.5) * (0.08 * st);
    const step = metal ? 0.15 : 0.13;
    const ll = Math.min(0.95, Math.max(0.04, l + st * step));
    const ss = Math.min(1, Math.max(0, st < 0 ? s * (1 + 0.12 * -st) : s * (1 - 0.1 * st)));
    out.push(hlsToRgb(pmod(hh), ll, ss).map((c) => Math.trunc(c * 255)));
  }
  return out;
}

// ------------------------------------------------------------------ image loading
function pixels(file) {
  let p = imgCache.get(file);
  if (!p) {
    p = (async () => {
      const url = base + file;
      let src;
      if (typeof createImageBitmap === 'function') {
        const blob = await (await fetch(url)).blob();
        src = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      } else {
        src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      }
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
      return x.getImageData(0, 0, c.width, c.height);
    })();
    p.catch(() => imgCache.delete(file));
    imgCache.set(file, p);
  }
  return p;
}

// ------------------------------------------------------------------ composition
async function build(role, list) {
  const R = G.roles[role];
  const [bc, ba] = await Promise.all([pixels(R.base), pixels(R.aux)]);
  const lays = await Promise.all(list.map(async (o) => {
    const L = G.layers[o.layer];
    const [c, a] = await Promise.all([pixels(L.file), pixels(L.aux)]);
    return { o, c, a };
  }));
  const n = R.size, W = n * G.cols, H = n * G.rows, F = G.frame, P = G.pad;
  const out = new ImageData(new Uint8ClampedArray(bc.data), W, H);
  const od = out.data, bad = ba.data;
  const zb = new Uint16Array(W * H);
  for (let i = 0, j = 0; i < zb.length; i++, j += 4) zb[i] = bad[j] ? bad[j] : 0xffff;
  for (const { o, c, a } of lays) {
    const tints = o.tint ? [null, ramp(o.tint, o.metal), ramp(o.tint, o.metal, G.darkTint)] : null;
    const cd = c.data, ad = a.data, LW = c.width;
    for (let row = 0; row < G.rows; row++) {
      const [sx, sy] = R.shift[row] || [0, 0];
      for (let col = 0; col < G.cols; col++) {
        for (let v = 0; v < F; v++) {
          const by = v - P - sy;
          if (by < 0 || by >= n) continue;
          for (let u = 0; u < F; u++) {
            const bx = u - P - sx;
            if (bx < 0 || bx >= n) continue;
            const li = ((row * F + v) * LW + col * F + u) * 4;
            const q = ad[li];
            if (!q) continue;
            const oi = (row * n + by) * W + col * n + bx;
            if (q > zb[oi]) continue;
            zb[oi] = q;
            const k = oi * 4, ch = ad[li + 1], code = ad[li + 2];
            if (tints && ch && code < 10) {
              const rgb = tints[ch][code % 5], d = code >= 5 ? 0.55 : 1;
              od[k] = Math.trunc(rgb[0] * d); od[k + 1] = Math.trunc(rgb[1] * d); od[k + 2] = Math.trunc(rgb[2] * d);
            } else {
              od[k] = cd[li]; od[k + 1] = cd[li + 1]; od[k + 2] = cd[li + 2];
            }
            od[k + 3] = 255;
          }
        }
      }
    }
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.getContext('2d').putImageData(out, 0, 0);
  cv.meta = { size: n, feet: R.feet, role, outfit: list.map((x) => x.variant) };
  return cv;
}

// Resolves to a canvas laid out exactly like the role's actor sheet (null for an unknown role).
// `equipment` is game.equipment (see equipmentOf in inventory.js): slot -> { name, text, glyph, cat }.
export async function composeHero(role, equipment) {
  await loadGear();
  const rk = roleKey(role);
  if (!rk) return null;
  const list = outfit(equipment || {});
  const sig = rk + '|' + list.map((o) => o.variant).join(',');
  let p = sheetCache.get(sig);
  if (!p) {
    p = build(rk, list).then((cv) => { ready.set(sig, cv); return cv; });
    p.catch(() => sheetCache.delete(sig));
    sheetCache.set(sig, p);
  }
  return p;
}

// Synchronous convenience for draw loops: the composed sheet if it is ready, else null (and
// it starts composing, calling onReady(canvas) when done).
export function heroSheet(role, equipment, onReady) {
  if (!G) { loadGear().then(() => heroSheet(role, equipment, onReady)).catch(() => {}); return null; }
  if (!roleKey(role)) return null;
  const sig = signature(role, equipment || {});
  if (ready.has(sig)) return ready.get(sig);
  composeHero(role, equipment).then((cv) => onReady?.(cv)).catch(() => {});
  return null;
}
