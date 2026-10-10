// Preview sheet for paper-doll hero sprites (public/js/gear.js + public/assets/gear/): a few outfits
// composed by the real runtime in Chromium, every direction, chosen frames, zoomed and labelled.
// The role's own actor sheet (assets/actors/<mnum>.png) is drawn in the first column for comparison.
//   node tools/gear-preview.mjs out.png [--zoom 4] [--frames 0,3,5,6,7,8] [--outfits valk-bare,valk-plate,...]
import { spawn } from 'node:child_process';
import { chromium } from '../test/node_modules/playwright-core/index.mjs';
import { CHROME } from '../test/lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const out = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 'gear-preview.png';
const zoom = +opt('zoom', 4);
const frames = opt('frames', '0,3,5,6,7,8').split(',').map(Number);

const it = (name, cat = 'Armor') => ({ name, text: name, glyph: -1, cat });
const w = (name) => it(name, 'Weapons');
const OUTFITS = {
  'valk-bare': ['valkyrie', {}],
  'valk-start': ['valkyrie', { main: w('long sword'), off: it('wooden shield'), alt: w('dagger') }],
  'valk-plate': ['valkyrie', { head: it('plumed helmet'), body: it('plate mail'), off: it('large shield'), main: w('long sword'), feet: it('jackboots') }],
  'wiz-cone': ['wizard', { head: it('conical hat'), cloak: it('ornamental cope'), main: w('quarterstaff') }],
  'sam-splint': ['samurai', { main: w('katana'), body: it('splint mail'), head: it('kabuto'), hands: it('yugake') }],
  'arc-start': ['archeologist', { head: it('fedora'), cloak: it('leather jacket'), main: it('pick-axe', 'Tools'), feet: it('walking shoes') }],
  'kni-start': ['knight', { head: it('helmet'), body: it('ring mail'), off: it('wooden shield'), hands: it('old gloves'), main: w('long sword') }],
  'bar-dsm': ['barbarian', { body: it('silver dragon scale mail'), main: w('two-handed sword'), head: it('hard hat'), feet: it('pair of combat boots') }],
  'pri-robe': ['priest', { cloak: it('robe'), main: w('mace'), off: it('blue and green shield') }],
  'tou-shirt': ['tourist', { shirt: it('Hawaiian shirt'), main: it('expensive camera', 'Tools'), head: it('dented pot'), cloak: it('tattered cape') }],
  'hea-start': ['healer', { main: w('scalpel'), hands: it('riding gloves'), body: it('elven mithril-coat'), feet: it('pair of snow boots') }],
  'ran-cloak': ['ranger', { cloak: it('piece of cloth'), main: w('bow'), head: it('leather hat'), feet: it('high boots') }],
  'rog-leather': ['rogue', { body: it('studded leather armor'), main: w('short sword'), cloak: it('opera cloak'), hands: it('fencing gloves') }],
  'mon-robe': ['monk', { cloak: it('robe'), hands: it('leather gloves') }],
  'cav-club': ['caveman', { main: w('club'), body: it('leather armor'), head: it('iron skull cap') }],
};
const pick = opt('outfits', 'valk-bare,valk-plate,wiz-cone,sam-splint').split(',');

const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, ['server.mjs', String(port)], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, NO_OPEN: '1' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#20222a"><canvas id="c"></canvas><script type="module">
import { loadGear, composeHero, outfit } from '/js/gear.js';
const OUT = ${JSON.stringify(Object.fromEntries(pick.map((k) => [k, OUTFITS[k]])))};
const FR = ${JSON.stringify(frames)}, Z = ${zoom};
const g = await loadGear('/assets/gear/');
const man = await (await fetch('/assets/actors/manifest.json')).json();
const rows = [];
for (const [key, [role, eq]] of Object.entries(OUT)) {
  const sheet = await composeHero(role, eq);
  const R = g.roles[role];
  const orig = new Image(); orig.src = '/assets/actors/' + R.mnum + '.png'; await orig.decode();
  rows.push({ key, role, sheet, orig, size: R.size, feet: R.feet, list: outfit(eq).map((o) => o.variant) });
}
const n = 48, cw = n * Z, lab = 18, colW = cw + 6;
const c = document.getElementById('c');
c.width = (FR.length + 1) * colW + 6; c.height = rows.length * (4 * (cw + 4) + lab) + 6;
const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
x.fillStyle = '#20222a'; x.fillRect(0, 0, c.width, c.height);
let y = 4;
for (const r of rows) {
  x.fillStyle = '#e8e0c8'; x.font = '13px monospace';
  x.fillText(r.key + ' (' + r.role + '): ' + (r.list.join(', ') || 'bare'), 6, y + 13); y += lab;
  for (let d = 0; d < 4; d++) {
    const cols = [[r.orig, 0], ...FR.map((f) => [r.sheet, f])];
    cols.forEach(([img, f], i) => {
      const ox = 4 + i * colW;
      x.fillStyle = i === 0 ? '#2c2a34' : ((i + d) % 2 ? '#3a3c46' : '#363842'); x.fillRect(ox, y, cw, cw);
      x.fillStyle = 'rgba(255,200,80,.25)'; x.fillRect(ox, y + r.feet[1] * Z, cw, Z);       // the manifest's feet line
      x.drawImage(img, f * n, d * n, n, n, ox, y, cw, cw);
    });
    y += cw + 4;
  }
}
document.title = 'done';
</script>`;
await page.route('**/__gear.html', (r) => r.fulfill({ contentType: 'text/html', body: html }));
await page.goto(`http://127.0.0.1:${port}/__gear.html`);
await page.waitForFunction(() => document.title === 'done', null, { timeout: 60000 }).catch(() => errs.push('preview did not finish'));
const size = await page.evaluate(() => { const c = document.getElementById('c'); return { w: c.width, h: c.height }; });
await page.setViewportSize({ width: Math.min(size.w, 8000), height: Math.min(size.h, 8000) });
await page.locator('#c').screenshot({ path: out });
await browser.close(); server.kill();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('wrote', out, size.w + 'x' + size.h);
