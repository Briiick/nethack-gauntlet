// Plays the phone version with random touches for a while: taps and holds on the map, every
// toolbar button, the context button, random actions from the action sheet, random answers to
// prompts and menus, the backpack and loot screens. Fails on page errors and on any moment the
// game is stuck: NetHack waiting for something with nothing on screen to answer it.
// Usage: node test/mobile-fuzz.mjs <url> [steps=300] [Role] [seed]
import { chromium, devices } from 'playwright-core';
import { CHROME } from './lib.mjs';
const [url, stepsArg, role = 'Valkyrie', seedArg] = process.argv.slice(2);
const STEPS = +stepsArg || 300;
let seed = +seedArg || Date.now() % 100000;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errs = []; page.on('pageerror', (e) => errs.push(e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' <- '))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text() + ' @ ' + JSON.stringify(m.location())); });
const wait = (ms) => page.waitForTimeout(ms);
const problems = [];

const state = () => page.evaluate(() => {
  const n = window.__nhg; if (!n) return null;
  const { game: g, ui, renderer: r } = n, $ = (s) => document.querySelector(s);
  const m = ui.modal && ui.modal.el;
  return { waiting: g.waiting, over: !!g.over, waiter: !!ui.waiter, modal: m ? m.className : null, prompt: $('#prompt').hidden ? null : $('#prompt').innerText.slice(0, 120),
    more: !$('#more').hidden, targeting: !!ui.isTargeting, dir: !!ui.dirFinish, hero: { ...r.heroCell }, turn: g.status[16]?.val || '', last: ui.historyLog.slice(-1)[0] || '' };
});
const toScreen = (x, y) => page.evaluate(([x, y]) => { const r = window.__nhg.renderer, v = r.view.getBoundingClientRect(), k = v.width / r.vw; return { x: v.left + (x * 24 + 12 - r.cam.x) * k, y: v.top + (y * 24 + 12 - r.cam.y) * k }; }, [x, y]);
const near = (h, d = 5) => ({ x: Math.max(0, Math.min(79, h.x + Math.round((rnd() * 2 - 1) * d))), y: Math.max(1, Math.min(20, h.y + Math.round((rnd() * 2 - 1) * d))) });
const tapCell = async (c) => { const p = await toScreen(c.x, c.y); if (p.y > 120 && p.y < 760) await page.touchscreen.tap(p.x, p.y); };
const holdCell = async (c) => { const p = await toScreen(c.x, c.y); if (p.y < 120 || p.y > 760) return; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await wait(600); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const tapSel = async (sel) => { const els = await page.$$(sel); const vis = []; for (const e of els) if (await e.isVisible()) vis.push(e); if (!vis.length) return false; await pick(vis).tap({ timeout: 2000 }).catch(() => {}); return true; };
// never end the run on purpose: no quitting, saving, climbing out of the dungeon, or praying in a loop
const BAD = /quit|save|still climb|no return|really attack|pray|genocide|level teleport|destroy|kill yourself|wish/i;

await page.goto(`${url}m/?f=${Date.now()}`);
await page.waitForSelector('#start-go:not([disabled])');
await page.fill('#start-name', 'Fuzz' + seed);
await page.selectOption('#start-role', role);
await page.tap('#start-go');
await wait(2500);

let stuck = 0, last = '', steps = 0, startTurn = null;
const counts = {};
for (; steps < STEPS; steps++) {
  await wait(120 + rnd() * 150);
  const s = await state();
  if (!s) continue;
  if (s.over) break;
  if (startTurn === null && s.turn) startTurn = s.turn;
  const key = JSON.stringify([s.waiting, s.modal, s.prompt, s.more, s.targeting, s.dir, s.turn, s.hero]);
  // NetHack waiting for something, with nothing on screen to answer it
  const visible = s.modal !== null || s.prompt || s.more || s.targeting || s.dir;
  const silentWait = s.waiting && !['shim_nh_poskey', 'shim_nhgetch', 'shim_delay_output'].includes(s.waiting) && !visible;
  stuck = (key === last && (silentWait || (s.waiting === 'shim_nh_poskey' && !s.waiter && !visible))) ? stuck + 1 : 0;
  last = key;
  if (stuck >= 12) { problems.push(`stuck at step ${steps}: ${key}`); break; }
  let did = '';
  try {
    if (s.more) { await page.tap('#more'); did = 'more'; }
    else if (s.prompt) {
      const buttons = await page.$$eval('#prompt button', (bs) => bs.map((b) => [b.dataset.k, b.innerText]));
      const ok = buttons.filter(([k, t]) => !(BAD.test(s.prompt) && /^(y|Yes)$/.test(k === 'y' ? 'y' : t)));
      const choice = BAD.test(s.prompt) ? ok.find(([k]) => k === 'n' || k === 'q' || k === '\x1b') || pick(ok) : pick(ok);
      if (s.dir && rnd() < 0.6) { await tapCell(near(s.hero, 2)); did = 'dir-tap'; }
      else if (choice) { await page.tap(`#prompt button[data-k="${choice[0].replace(/"/g, '\\"')}"]`).catch(() => {}); did = 'prompt'; }
    } else if (s.targeting) { if (rnd() < 0.8) await tapCell(near(s.hero, 6)); else await page.tap('#target-hint button'); did = 'target'; }
    else if (s.modal !== null) {
      const m = s.modal;
      if (/text/.test(m)) { await page.tap('#modal .panel'); did = 'text'; }
      else if (/getline/.test(m)) { await page.tap('#modal [data-key="Escape"]'); did = 'getline-cancel'; }
      else if (/loot/.test(m)) { for (let i = 0; i < 3; i++) await tapSel('#modal .lcell'); await page.tap(pick(['#modal .loot .go', '#modal .loot .cancel', '#modal .loot .takeall'])).catch(() => page.tap('#modal .loot .cancel')); did = 'loot'; }
      else if (/bag/.test(m)) {
        const r = rnd();
        if (r < 0.5) { await tapSel('#modal .bag .cell'); if (rnd() < 0.5) await tapSel('#modal .bag .detail [data-f="use"], #modal .bag .detail [data-f="actions"], #modal .bag [data-f="ok"], #modal .bag [data-f="all"]'); }
        else await page.tap(pick(['#modal .bag .x', '#modal .bag [data-f="cancel"]'])).catch(() => page.tap('#modal .bag .x').catch(() => {}));
        did = 'bag';
      } else if (/actsheet/.test(m)) {
        const labels = await page.$$eval('#modal .acts button', (bs) => bs.map((b) => b.innerText));
        const okL = labels.filter((l) => !/Save|Keyboard|Settings|Help|Any command|Pray|Offer|Turn undead|Invoke|Rub|Monster/.test(l));
        if (okL.length && rnd() < 0.85) await page.tap(`#modal .acts button:text-is("${pick(okL)}")`).catch(() => {}); else await page.tap('#modal .x');
        did = 'sheet';
      } else if (/menu|spells/.test(m)) {
        const text = await page.innerText('#modal').catch(() => '');
        if (BAD.test(text.split('\n')[0]) || rnd() < 0.3) await tapSel('#modal [data-key="Escape"], #modal .x');
        else { await tapSel('#modal .item, #modal .card'); if (await page.$('#modal [data-key="Enter"]')) await page.tap('#modal [data-key="Enter"]').catch(() => {}); }
        did = 'menu';
      } else if (/settings/.test(m)) { await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); did = 'settings-close'; }
      else { await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))); did = 'escape:' + m; }
    } else if (s.waiting === 'shim_nh_poskey' && s.waiter) {
      const r = rnd();
      if (r < 0.45) { await tapCell(near(s.hero, r < 0.25 ? 1 : 7)); did = 'tap'; }
      else if (r < 0.52) { await tapCell(s.hero); did = 'tap-self'; }
      else if (r < 0.60) { await holdCell(near(s.hero, 3)); await wait(250); if (await tapSel('#modal .spot .acts button')) did = 'hold'; }
      else if (r < 0.70) { if (await tapSel('#ctx:not([hidden])')) did = 'ctx'; }
      else if (r < 0.78) { await page.tap(pick(['[data-act="search"]', '[data-act="look"]', '[data-act="bag"]'])); did = 'toolbar'; }
      else if (r < 0.88) { await page.tap('[data-act="more"]'); did = 'actions'; }
      else if (r < 0.93) { await tapSel('#quickbar button'); did = 'quick'; }
      else { const p = await toScreen(s.hero.x, s.hero.y); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); for (let i = 1; i < 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x - i * 15, y: p.y }] }); await wait(16); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); did = 'pan'; }
    }
  } catch (e) { problems.push(`step ${steps} (${did}): ${e.message.split('\n')[0]}`); }
  if (did) counts[did.split(':')[0]] = (counts[did.split(':')[0]] || 0) + 1;
}
const end = await state();
console.log(JSON.stringify({ role, seed, steps, turns: `${startTurn} -> ${end?.turn}`, over: end?.over, counts }));
for (const p of problems) console.log('PROBLEM', p);
console.log(errs.length ? 'ERRORS ' + [...new Set(errs)].join(' | ') : 'no page errors');
await browser.close();
