// The phone version (mobile/, served at /m/) on an emulated iPhone, played only with touch:
// taps walk, travel and rest; a long press opens NetHack's "What do you want to do?"; direction and
// pick-a-spot questions take taps on the map; questions have word buttons; the backpack, quick
// slots and the action sheet work; drag pans and pinch zooms; leaving the app saves the game and
// coming back resumes it.
// Usage: node test/mobile.mjs http://127.0.0.1:8080/ test/out
import { chromium, devices } from 'playwright-core';
import { CHROME } from './lib.mjs';
const [url] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
const results = [];
const check = (label, ok, info = '') => { results.push([label, ok ? 'ok' : `FAIL ${info}`]); if (process.env.VERBOSE) console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : info); };

const state = () => page.evaluate(() => {
  const { game: g, ui, renderer: r } = window.__nhg, $ = (s) => document.querySelector(s);
  return { waiting: g.waiting, over: !!g.over, modal: ui.modal ? ui.modal.el.className : null, prompt: $('#prompt').hidden ? null : $('#prompt').innerText.trim(),
    more: !$('#more').hidden, targeting: !!ui.isTargeting, hero: { ...r.heroCell }, turn: g.status[16]?.val || '', feed: [...document.querySelectorAll('#feed div')].map((d) => d.dataset.text) };
});
const idle = (s) => s.waiting === 'shim_nh_poskey' && !s.modal && !s.prompt && !s.more && !s.targeting;
async function settle(max = 30) {
  let s;
  for (let i = 0; i < max; i++) {
    await wait(200);
    s = await state();
    if (idle(s) || s.over) return s;
    if (s.more) { await page.tap('#more'); continue; }
    if (s.prompt && /\[yn|\[ynaq/.test(s.prompt) && await page.$('#prompt [data-k="y"]')) { await page.tap('#prompt [data-k="y"]'); continue; }
    if (s.modal && /text/.test(s.modal)) { await page.tap('#modal .panel'); continue; }
    if (s.modal && /menu/.test(s.modal)) { const y = await page.$('#modal .item:has-text("start game")'); if (y) { await y.tap(); continue; } }
  }
  return s;
}
const toScreen = (x, y) => page.evaluate(([x, y]) => { const r = window.__nhg.renderer, v = r.view.getBoundingClientRect(), k = v.width / r.vw; return { x: v.left + (x * 24 + 12 - r.cam.x) * k, y: v.top + (y * 24 + 12 - r.cam.y) * k }; }, [x, y]);
const tapAt = async (x, y) => { await wait(350); const p = await toScreen(x, y); await page.touchscreen.tap(p.x, p.y); };   // (let the camera settle first)
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const hold = async (x, y) => { await wait(350); const p = await toScreen(x, y); await touch('touchStart', [p]); await wait(650); await touch('touchEnd', []); };
// a walkable cell near the hero at a given distance
const floorNear = (dist) => page.evaluate((dist) => {
  const r = window.__nhg.renderer, h = r.heroCell;
  const open = (x, y) => { const g = r.glyph[y * 80 + x]; return g >= 0 && ['floor', 'darkfloor', 'corr', 'litcorr', 'doorway', 'opendoor'].includes(r.cls[g]) && ![...r.actors.values()].some((a) => a.x === x && a.y === y); };
  // the nearest open square at that distance or farther, else the farthest closer one (small, dark rooms)
  for (let d = dist; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    if (open(h.x + dx, h.y + dy)) return { x: h.x + dx, y: h.y + dy };
  }
  for (let d = dist - 1; d >= 1; d--) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === d && open(h.x + dx, h.y + dy)) return { x: h.x + dx, y: h.y + dy };
  }
  return null;
}, dist);
const sheetTap = async (label) => { await page.tap('[data-act="more"]'); await wait(300); await page.tap(`.actsheet .acts button:text-is("${label}")`); await wait(400); };

const NAME = 'Tapper' + (Date.now() % 10000);
await page.goto(`${url}m/?t=${Date.now()}`);
await page.waitForSelector('#start-go:not([disabled])');
await page.fill('#start-name', NAME);
await page.tap('#start-go');
let s = await settle(60);
check('Starts and waits for a command', idle(s), JSON.stringify(s));
check('Toolbar shown; no stray "tap a spot" hint', await page.evaluate(() => { const h = document.getElementById('target-hint'); return getComputedStyle(document.getElementById('toolbar')).display !== 'none' && (!h || getComputedStyle(h).display === 'none'); }));

// tap a neighbouring floor square: one step
let target = await floorNear(1), before = s.hero;
await tapAt(target.x, target.y); s = await settle();
check('Tap next to you: one step there', s.hero.x === target.x && s.hero.y === target.y, `${JSON.stringify(before)} -> ${JSON.stringify(s.hero)} want ${JSON.stringify(target)}`);
// tap farther away: travel
target = await floorNear(4);
await tapAt(target.x, target.y); await wait(1200); s = await settle();
// travel stops when something comes into view; a second tap carries on, as a player would
if (Math.max(Math.abs(s.hero.x - target.x), Math.abs(s.hero.y - target.y)) > 1) { await tapAt(target.x, target.y); await wait(1200); s = await settle(); }
check('Tap farther away: travel there', Math.max(Math.abs(s.hero.x - target.x), Math.abs(s.hero.y - target.y)) <= 1, `${JSON.stringify(s.hero)} want ${JSON.stringify(target)}`);
// tap yourself: rest (or the stairs / pick up, whichever applies), a turn passes either way
const t0 = s.turn;
await tapAt(s.hero.x, s.hero.y); s = await settle();
check('Tap yourself: a turn passes', s.turn !== t0 || s.over, `${t0} -> ${s.turn}`);

// long press: what's there and what to do about it
target = await floorNear(3);
await hold(target.x, target.y); await wait(300); s = await state();
check('Hold: a sheet for that spot', /spot/.test(s.modal || '') && await page.isVisible('.spot button:text-is("Travel here")'), JSON.stringify(s));
await page.tap('.spot button:text-is("Look")'); s = await settle();
check('…whose Look describes it', idle(s) && s.feed.length > 2, JSON.stringify(s.feed));
await hold(s.hero.x, s.hero.y); await wait(300);
await page.tap('.spot button:text-is("More actions…")'); await wait(400); s = await state();
if (/menu/.test(s.modal || '')) { await page.tap('#modal .foot [data-key="Escape"]'); s = await settle(); }
check('…and More actions / Cancel come back to the map', idle(s), JSON.stringify(s));

// a direction question: answered by tapping the map
const empty = await floorNear(1);
await sheetTap('Kick');
s = await state();
check('Kick asks for a direction with the compass up', /direction/i.test(s.prompt || '') && await page.isVisible('#compass'), JSON.stringify(s));
const turnK = s.turn;
await tapAt(empty.x, empty.y); s = await settle();
check('Tapping the map answers the direction', !s.prompt && (s.turn !== turnK || s.feed.length > 0), JSON.stringify(s));

// pick a spot: Look, then tap
await page.tap('[data-act="look"]'); await wait(400); s = await state();
check('Look: "tap a spot" hint', s.targeting && await page.isVisible('#target-hint'), JSON.stringify(s));
const feedBefore = s.feed.join('|');
await tapAt(s.hero.x, s.hero.y); s = await settle();
check('Tapping a spot looks at it', !s.targeting && s.feed.join('|') !== feedBefore, JSON.stringify(s.feed));

// questions say what they mean
await sheetTap('Pray'); s = await state();
const words = await page.$$eval('#prompt button', (bs) => bs.map((b) => b.innerText));
check('Yes/No questions have word buttons', words.includes('Yes') && words.includes('No'), JSON.stringify(words));
await page.tap('#prompt [data-k="n"]'); s = await settle();
check('No answers no', idle(s), JSON.stringify(s));

// the backpack
await page.tap('[data-act="bag"]'); await wait(500); s = await state();
check('Bag opens as the phone backpack', /bag/.test(s.modal || '') && (await page.$$('.bag .cell')).length > 0, JSON.stringify(s));
const food = await page.$('.bag .cell[aria-label*="food ration"]') || await page.$('.bag .cell:not(.worn)');
await food.tap(); await wait(200);
check('Tapping an item shows it with actions', await page.isVisible('.bag .detail [data-f="actions"]'));
await page.tap('.bag .detail [data-f="quick"]'); await page.tap('.bag .qpick [data-q="1"]'); await wait(200);
const slot1 = await page.$eval('#quickbar [data-n="1"]', (b) => !b.classList.contains('empty'));
check('Quick slot from the bag', slot1);
await page.tap('.bag .detail [data-f="actions"]'); await wait(500); s = await state();
check('"All actions…" opens NetHack\'s item menu', /menu/.test(s.modal || '') && /do what with/i.test(await page.innerText('#modal')), JSON.stringify(s));
await page.tap('#modal .foot [data-key="Escape"]'); s = await settle();

// the action sheet: any extended command
await sheetTap('Any command…'); s = await state();
check('Any command… opens the extended command list', /ext/.test(s.modal || ''), JSON.stringify(s));
await page.tap('#modal .foot [data-key="Escape"]'); s = await settle();
check('…and Cancel closes it', idle(s), JSON.stringify(s));

// drag to look around, then back
const mid = await toScreen(s.hero.x, s.hero.y);
await touch('touchStart', [mid]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: mid.x - i * 20, y: mid.y - i * 10 }]); await wait(16); } await touch('touchEnd', []);
const panned = await page.evaluate(() => ({ ...window.__nhg.renderer.pan }));
check('Drag pans the view', Math.abs(panned.x) > 20 && await page.isVisible('#recentre'), JSON.stringify(panned));
await page.tap('#recentre'); await wait(200);
check('"Back to you" recentres', await page.evaluate(() => window.__nhg.renderer.pan.x === 0 && window.__nhg.renderer.pan.y === 0));
// pinch to zoom in
const z0 = await page.evaluate(() => window.__nhg.ui.settings.zoom);
await touch('touchStart', [{ x: mid.x - 30, y: mid.y, id: 1 }, { x: mid.x + 30, y: mid.y, id: 2 }]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: mid.x - 30 - i * 12, y: mid.y, id: 1 }, { x: mid.x + 30 + i * 12, y: mid.y, id: 2 }]); await wait(16); }
await touch('touchEnd', []); await wait(200);
const z1 = await page.evaluate(() => window.__nhg.ui.settings.zoom);
check('Pinch zooms in', z1 > z0, `${z0} -> ${z1}`);

// leaving the app saves; coming back resumes
s = await settle();
await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
for (let i = 0; i < 40 && !(await state()).over; i++) await wait(150);
const saved = await page.evaluate((n) => window.__nhg.game.over && (() => { try { return window.__nhg.mod.FS.readdir('/save').some((f) => f.endsWith(n)); } catch (e) { return false; } })(), NAME);
check('Leaving the app saves the game', saved);
await wait(800);   // the save reaches IndexedDB
await Promise.all([page.waitForNavigation(), page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); })]);
s = await settle(60);
const who = await page.evaluate(() => window.__nhg?.ui.playerName);
check('Coming back resumes the same game', idle(s) && who === NAME, `${who} ${JSON.stringify(s)}`);

for (const [l, r] of results) console.log(r === 'ok' ? 'ok  ' : 'FAIL', l, r === 'ok' ? '' : r);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
// tidy up: the test character's save
await page.evaluate(async (n) => { const m = window.__nhg.mod; for (const f of m.FS.readdir('/save')) if (f.endsWith(n)) m.FS.unlink('/save/' + f); await new Promise((r) => m.FS.syncfs(false, r)); }, NAME).catch(() => {});
await browser.close();
