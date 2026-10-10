// Graphics gallery: paints a synthetic "showroom" level through the game's real renderer and
// screenshots it, every item labelled with its NetHack name. For eyeballing the art, by people
// or by review agents.
//   node tools/gallery.mjs http://127.0.0.1:8080/ out-dir [sheet...]
// Sheets: features, terrain, doors, objects, monsters, effects (default: all).
import { mkdirSync } from 'node:fs';
import { chromium } from '../test/node_modules/playwright-core/index.mjs';
import { CHROME } from '../test/lib.mjs';

const [url, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${url}?g=${Date.now()}#wizard`);
await page.waitForSelector('#start-go:not([disabled])');
await page.uncheck('#start-tutorial'); await page.click('#start-go');
await page.waitForFunction(() => window.__nhg?.game?.waiting === 'shim_nh_poskey', null, { timeout: 30000 }).catch(() => {});
for (let i = 0; i < 6; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
await page.addStyleTag({ content: '#hud,#status,.hud,.plate,#plate,#feed,#actionbar,#banner,#prompt,.topbar,#help-btn,#settings-btn,#target-hint,#modal{display:none!important} .gal{position:fixed;z-index:99;color:#fff;font:600 12px/1.1 system-ui;background:rgba(0,0,0,.72);padding:1px 4px;border-radius:3px;transform:translateX(-50%);white-space:nowrap;pointer-events:none}' });
await page.evaluate(() => { const s = window.__nhg.ui.settings; s.zoom = 3; s.shake = 'off'; window.__nhg.renderer.resize?.(); });

// Each sheet: a list of scenes; a scene paints cells and returns labelled spots.
const sheets = {
  features: { names: (n, c) => ['feature', 'trap', 'engraving', 'tree', 'bars', 'cloud', 'statue'].includes(c) && !/^swallow/.test(n) && (c !== 'statue' || /^statue of (a |an )?(newt|soldier ant|dragon|human|dwarf)/.test(n)), cols: 7, gap: 3 },
  objects: { names: (n, c, g, T) => c === 'obj' && T.gobj[g] >= 0 && g % 7 === 0, cols: 8, gap: 3, limit: 160 },
  monsters: { names: (n, c, g) => c === 'mon' && /^male /.test(n) && g % 3 === 0, cols: 8, gap: 3, limit: 130 },
  // MONSTERS="centaur|naga" picks monsters by name instead of a sample
  picked: { names: new Function('n', 'c', `return c === 'mon' && /^male /.test(n) && /${(process.env.MONSTERS || '^$').replace(/[`$\\]/g, '')}/.test(n)`), cols: 8, gap: 3, limit: 64 },
  effects: { names: (n, c) => ['zap', 'explosion', 'warning'].includes(c) && !/(top|bottom|middle) (left|right)|top center|bottom center/.test(n), cols: 8, gap: 3 },
};

async function paintGrid(key, spec) {
  const items = await page.evaluate(([k, src, limit]) => {
    const { renderer: r, game } = window.__nhg, T = r.tiles;
    const pick = new Function('n', 'c', 'g', 'T', 'return (' + src + ')(n, c, g, T)');
    const out = [];
    for (let g = 0; g < T.glyphs; g++) { const n = T.gname[g], c = T.classes[T.gcls[g]]; if (pick(n, c, g, T)) out.push({ g, n }); if (limit && out.length >= limit) break; }
    return out;
  }, [key, spec.names.toString(), spec.limit || 0]);
  const perShot = spec.cols * 4;
  for (let s = 0; s * perShot < items.length; s++) {
    const chunk = items.slice(s * perShot, (s + 1) * perShot);
    const spots = await page.evaluate(([chunk, cols, gap]) => {
      const { renderer: r } = window.__nhg, T = r.tiles;
      const G = (name) => T.gname.indexOf(name);
      const floor = G('cmap A floor of a room'), wall = { h: G('cmap A main walls horizontal'), v: G('cmap A main walls vertical') };
      r.clearMap(); r.newLevel();
      const W = cols * gap + 2, H = 4 * gap + 2;
      for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
        const edge = y === 0 || y === H || x === 0 || x === W;
        const gl = edge ? (y === 0 || y === H ? wall.h : wall.v) : floor;
        r.setCell(x, y, { glyph: gl >= 0 ? gl : floor, flags: 0 }, { glyph: floor });
      }
      const spots = chunk.map((it, i) => {
        const x = 2 + (i % cols) * gap, y = 2 + Math.floor(i / cols) * gap;
        r.setCell(x, y, { glyph: it.g, flags: 0 }, { glyph: floor });
        return { x, y, n: it.n };
      });
      r.setHero(Math.floor(W / 2), Math.floor(H / 2)); r.cursor = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
      r.cam.init = false; r.commit();
      return spots;
    }, [chunk, spec.cols, spec.gap]);
    await page.waitForTimeout(700);
    await label(spots);
    await page.screenshot({ path: `${out}/${key}-${s + 1}.png` });
  }
  return items.length;
}

async function label(spots) {
  await page.evaluate((spots) => {
    document.querySelectorAll('.gal').forEach((e) => e.remove());
    const r = window.__nhg.renderer, rect = r.view.getBoundingClientRect(), k = rect.width / r.vw, T = 24;
    for (const s of spots) {
      const d = document.createElement('div'); d.className = 'gal';
      d.textContent = s.n.replace(/^cmap A /, '').slice(0, 30);
      d.style.left = (rect.left + (s.x * T + T / 2 - r.cam.x) * k) + 'px';
      d.style.top = (rect.top + (s.y * T + T + 2 - r.cam.y) * k) + 'px';
      document.body.appendChild(d);
    }
  }, spots);
}

// Terrain and doors need neighbours: hand-built scenes.
async function terrain() {
  const spots = await page.evaluate(() => {
    const { renderer: r } = window.__nhg, T = r.tiles, G = (n) => T.gname.indexOf(n);
    const F = G('cmap A floor of a room'), D = G('cmap A dark part of a room'), C = G('cmap A corridor'), LC = G('cmap A lit corridor');
    const H = G('cmap A main walls horizontal'), V = G('cmap A main walls vertical'), TL = G('cmap A main walls top left corner'), TR = G('cmap A main walls top right corner');
    const BL = G('cmap A main walls bottom left corner'), BR = G('cmap A main walls bottom right corner');
    const S = (x, y, g) => r.setCell(x, y, { glyph: g, flags: 0 }, { glyph: F });
    r.clearMap(); r.newLevel();
    // a room with every door kind in its walls, pools, trees, bars, dark floor
    for (let y = 1; y <= 13; y++) for (let x = 1; x <= 26; x++) S(x, y, (y === 1 || y === 13) ? H : (x === 1 || x === 26) ? V : F);
    S(1, 1, TL); S(26, 1, TR); S(1, 13, BL); S(26, 13, BR);
    const spots = [];
    const put = (x, y, name, label) => { S(x, y, G(name)); spots.push({ x, y, n: label || name }); };
    put(5, 1, 'cmap A doorway'); put(9, 1, 'cmap A open door'); put(13, 1, 'cmap A closed door');
    put(1, 5, 'cmap A open door', 'open door (side wall)'); put(26, 5, 'cmap A closed door', 'closed door (side wall)'); put(1, 9, 'cmap A doorway', 'doorway (side wall)');
    for (let x = 0; x > -6; x--) S(x, 9, C); spots.push({ x: -3, y: 9, n: 'corridor' });
    for (let y = 14; y < 18; y++) S(5, y, LC); S(5, 13, G('cmap A doorway')); spots.push({ x: 5, y: 16, n: 'lit corridor' });
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 6; x++) S(x, y, G('water')); spots.push({ x: 4, y: 5, n: 'water pool' });
    for (let y = 3; y <= 5; y++) for (let x = 9; x <= 12; x++) S(x, y, G('molten lava')); spots.push({ x: 10, y: 5, n: 'lava' });
    for (let y = 3; y <= 5; y++) for (let x = 15; x <= 18; x++) S(x, y, G('ice')); spots.push({ x: 16, y: 5, n: 'ice' });
    for (const [x, y] of [[21, 3], [22, 3], [21, 4], [23, 4], [22, 5]]) S(x, y, G('cmap A tree')); spots.push({ x: 22, y: 5, n: 'trees' });
    for (let x = 3; x <= 8; x++) S(x, 8, G('cmap A iron bars')); spots.push({ x: 5, y: 8, n: 'iron bars' });
    for (let y = 8; y <= 11; y++) for (let x = 11; x <= 15; x++) S(x, y, D); spots.push({ x: 13, y: 10, n: 'dark part of a room' });
    for (let y = 8; y <= 10; y++) for (let x = 18; x <= 20; x++) S(x, y, G('cloud')); spots.push({ x: 19, y: 10, n: 'cloud' });
    for (let y = 8; y <= 10; y++) for (let x = 22; x <= 24; x++) S(x, y, G('air')); spots.push({ x: 23, y: 10, n: 'air' });
    S(8, 11, G('cmap A engraving')); spots.push({ x: 8, y: 11, n: 'engraving' });
    S(3, 11, G('cmap A tree')); spots.push({ x: 3, y: 11, n: 'single tree' });
    r.setHero(13, 7); r.cursor = { x: 13, y: 7 }; r.cam.init = false; r.commit();
    return spots;
  });
  await page.waitForTimeout(800); await label(spots);
  await page.screenshot({ path: `${out}/terrain-1.png` });
}

const want = (k) => !only.length || only.includes(k);
const report = {};
if (want('terrain')) { await terrain(); report.terrain = 1; }
for (const [k, spec] of Object.entries(sheets)) if (want(k)) report[k] = await paintGrid(k, spec);
console.log(JSON.stringify({ report, errs }));
await browser.close();
