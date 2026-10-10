// Preview sheet for map props (public/js/props/*.js): every prop on a stone floor, at 4x, labelled,
// at two animation times side by side. For the artists (people or agents) drawing them.
//   node tools/props-preview.mjs http://127.0.0.1:8080/ out.png [module ...]
import { chromium } from '../test/node_modules/playwright-core/index.mjs';
import { CHROME } from '../test/lib.mjs';

const [url, out, ...mods] = process.argv.slice(2);
const modules = mods.length ? mods : ['terrain', 'furniture', 'traps', 'fx'];
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#06060a">
<canvas id="c"></canvas><script type="module">
const T = 24, Z = 4, COLS = 6;
const theme = { floor: ['#7a7468', '#6e685e', '#827a6c', '#746c62', '#686258'], seam: '#3a3630', cap: '#2a2a34', capHi: '#4a4a5a', face: '#56505e', faceHi: '#6a6474', mortar: '#3a3640' };
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function floor(ctx, cx, cy) {
  const img = ctx.createImageData(T, T), d = img.data, tones = theme.floor.map(hex), seam = hex(theme.seam);
  for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
    const ax = cx * T + px, ay = cy * T + py, row = Math.floor(ay / 12), off = (row % 2) * 12, sx = (ax + off) % 24, sy = ay % 12;
    let c = tones[(Math.floor((ax + off) / 24) * 31 + row * 17) % 5];
    if (sx === 0 || sy === 0) c = seam; else if (hash(ax, ay, 3) < 0.03) c = c.map((v) => v * 0.8);
    const k = (py * T + px) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
  }
  ctx.putImageData(img, cx * T, cy * T);
}
function wall(ctx, cx, cy) {
  ctx.fillStyle = theme.cap; ctx.fillRect(cx * T, cy * T, T, T);
  ctx.fillStyle = theme.face; ctx.fillRect(cx * T, cy * T + 10, T, 14);
  ctx.fillStyle = theme.mortar; for (let y = 14; y < T; y += 5) ctx.fillRect(cx * T, cy * T + y, T, 1);
  ctx.fillStyle = theme.capHi; ctx.fillRect(cx * T, cy * T, T, 1);
}
const MODS = ${JSON.stringify(modules)};
const all = [];
for (const m of MODS) {
  const mod = (await import('/js/props/' + m + '.js?' + Date.now())).default;
  if (m !== 'fx') { for (const [name, p] of Object.entries(mod)) all.push({ m, name, p }); continue; }
  // effects: one draw(ctx, ox, oy, glyphName, o) for every effect glyph; preview beams as 3-cell
  // chains in their direction, explosions as their 3x3 block, the rest on their own
  const D = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const cells = (list) => ({ kind: 'fx', animated: true, draw(ctx, ox, oy, o) { for (const [dx, dy, n] of list) mod.draw(ctx, ox + dx * T, oy + dy * T, n, o); } });
  for (const z of ['missile', 'fire', 'frost', 'sleep', 'death', 'lightning', 'poison gas', 'acid']) {
    const idx = ['missile', 'fire', 'frost', 'sleep', 'death', 'lightning', 'poison gas', 'acid'].indexOf(z) + 1;
    for (let d = 0; d < 4; d++) all.push({ m, name: z + ' ' + ['|', '-', '\\\\', '/'][d], p: cells([-1, 0, 1].map((k) => [D[d][0] * k, D[d][1] * k, 'zap ' + z + ' zap ' + idx + ' ' + d])) });
  }
  const parts = ['top left', 'top center', 'top right', 'middle left', 'middle center', 'middle right', 'bottom left', 'bottom center', 'bottom right'];
  for (const e of ['dark', 'noxious', 'muddy', 'wet', 'magical', 'fiery', 'frosty']) all.push({ m, name: 'explosion ' + e, p: cells(parts.map((q, i) => [(i % 3) - 1, Math.floor(i / 3) - 1, 'explosion ' + e + ' ' + q])) });
  for (const n of ['dig beam', 'flash beam', 'boom left', 'boom right', 'shield1', 'shield2', 'shield3', 'shield4', 'warning 0', 'warning 1', 'warning 2', 'warning 3', 'warning 4', 'warning 5']) all.push({ m, name: n, p: cells([[0, 0, n]]) });
}
const rows = Math.ceil(all.length / COLS), cellW = 4, cellH = 4;   // each prop gets a 4x4-cell patch
const W = COLS * cellW * T, H = rows * cellH * T;
const c = document.getElementById('c'); c.width = W * Z * 2 + 40; c.height = H * Z + 20;
const v = c.getContext('2d'); v.imageSmoothingEnabled = false; v.fillStyle = '#06060a'; v.fillRect(0, 0, c.width, c.height);
for (const [k, t] of [[0, 0], [1, 650]]) {
  const off = document.createElement('canvas'); off.width = W; off.height = H; const ctx = off.getContext('2d');
  all.forEach((it, i) => {
    const bx = (i % COLS) * cellW, by = Math.floor(i / COLS) * cellH, px = bx + 1, py = by + 2;
    for (let y = by; y < by + cellH; y++) for (let x = bx; x < bx + cellW; x++) floor(ctx, x, y);
    // doors and bars sit in a wall: give them wall neighbours left and right
    const inWall = /door|bars|drawbridge/.test(it.name);
    if (inWall) { wall(ctx, px - 1, py); wall(ctx, px + 1, py); }
    const n = inWall ? { N: 'floor', S: 'floor', E: 'wall', W: 'wall' } : { N: 'floor', S: 'floor', E: 'floor', W: 'floor' };
    try { it.p.draw(ctx, px * T, py * T, { t, seed: i * 7 + 3, n, theme }); } catch (e) { ctx.fillStyle = 'magenta'; ctx.fillRect(px * T, py * T, T, T); console.error(it.name, e); }
  });
  v.drawImage(off, 0, 0, W, H, 10 + k * (W * Z + 20), 10, W * Z, H * Z);
  v.font = '600 22px system-ui'; v.textAlign = 'center';
  all.forEach((it, i) => {
    const x = 10 + k * (W * Z + 20) + ((i % COLS) * cellW + 1.5) * T * Z, y = 10 + (Math.floor(i / COLS) * cellH + 3.7) * T * Z;
    v.fillStyle = 'rgba(0,0,0,.75)'; const w = v.measureText(it.name).width + 10; v.fillRect(x - w / 2, y - 20, w, 26);
    v.fillStyle = '#fff'; v.fillText(it.name + (it.p.animated ? ' ~' : ''), x, y);
  });
}
document.title = 'done';
</script>`;
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
await page.route('**/__props.html', (r) => r.fulfill({ contentType: 'text/html', body: html }));
await page.goto(new URL('__props.html', url).href);
await page.waitForFunction(() => document.title === 'done', null, { timeout: 20000 }).catch(() => errs.push('preview did not finish'));
const size = await page.evaluate(() => { const c = document.getElementById('c'); return { w: c.width, h: c.height }; });
await page.setViewportSize({ width: Math.min(size.w, 8000), height: Math.min(size.h, 8000) });
await page.locator('#c').screenshot({ path: out });
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : `ok: ${out}`);
await browser.close();
