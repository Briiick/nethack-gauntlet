// Movement input check: every way to move (arrows, vi-keys, numpad, Home/PgUp/End/PgDn, Shift-run,
// wait) must change the hero's position or advance the turn counter.
import { chromium } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const H = harness(page);
await page.goto(`${url}?k=${Date.now()}#wizard`);
await page.waitForSelector('#start-go:not([disabled])');
await page.click('#start-go'); await H.settle({ maxSteps: 25 });
// a big empty level to move around in
await H.key('#'); await H.wait(150); await page.keyboard.type('wizmap'); await H.key('Enter'); await H.settle();
const where = () => page.evaluate(() => ({ ...window.__nhg.game.hero, t: +(window.__nhg.game.status[16]?.val || 0) }));
const tests = [
  ['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1], ['ArrowUp', 0, -1],
  ['l', 1, 0], ['h', -1, 0], ['j', 0, 1], ['k', 0, -1], ['y', -1, -1], ['n', 1, 1], ['u', 1, -1], ['b', -1, 1],
  ['Numpad6', 1, 0], ['Numpad4', -1, 0], ['Numpad2', 0, 1], ['Numpad8', 0, -1], ['Numpad9', 1, -1], ['Numpad1', -1, 1], ['Numpad7', -1, -1], ['Numpad3', 1, 1],
  ['Home', -1, -1], ['PageDown', 1, 1], ['PageUp', 1, -1], ['End', -1, 1],
  ['Shift+ArrowRight', 'run'], ['Shift+L', 'run'], ['Shift+ArrowLeft', 'run'],
  ['.', 'wait'], ['Numpad5', 'wait'], ['s', 'wait'],
];
const results = [];
const OPP = { ArrowRight: 'h', ArrowLeft: 'l', ArrowDown: 'k', ArrowUp: 'j', l: 'h', h: 'l', j: 'k', k: 'j', y: 'n', n: 'y', u: 'b', b: 'u',
  Numpad6: 'h', Numpad4: 'l', Numpad2: 'k', Numpad8: 'j', Numpad9: 'b', Numpad1: 'u', Numpad7: 'n', Numpad3: 'y', Home: 'n', PageDown: 'y', PageUp: 'b', End: 'u',
  'Shift+ArrowRight': 'h', 'Shift+L': 'h', 'Shift+ArrowLeft': 'l' };
const terrain = (x, y) => page.evaluate(([x, y]) => window.__nhg.renderer.terrainClassAt(x, y), [x, y]);
for (const [k, dx, dy] of tests) {
  let ok = false;
  for (let attempt = 0; attempt < 4 && ok !== true; attempt++) {
    const a = await where();
    // facing a wall? step away from it first (moving into a wall takes no time and says nothing)
    const tx = typeof dx === 'number' ? a.x + dx : a.x + (/Right|L$/.test(k) ? 1 : -1), ty = typeof dy === 'number' ? a.y + dy : a.y;
    if (dx !== 'wait' && !/floor|corr|door/.test(await terrain(tx, ty))) { await page.keyboard.press(OPP[k]); await H.settle({ maxSteps: 10 }); continue; }
    await page.keyboard.press(k); await H.settle({ maxSteps: 20 });
    const b = await where();
    if (dx === 'run') ok = Math.abs(b.x - a.x) >= 1;
    else if (dx === 'wait') {
      // NetHack 5 refuses to idle next to a monster ("Are you waiting to get hit?"): the key still arrived
      const said = await page.evaluate(() => window.__nhg.ui.historyLog.slice(-1)[0] || '');
      ok = (b.t > a.t && b.x === a.x && b.y === a.y) || /waiting to get hit|already found a monster/.test(said);
    }
    else ok = b.x - a.x === dx && b.y - a.y === dy;
  }
  if (ok !== true) {
    const a = await where();
    console.log('  ', k, JSON.stringify(a), await page.evaluate(() => window.__nhg.ui.historyLog.slice(-2).join(' | ')),
      await page.evaluate(([x, y]) => [-1, 0, 1].map((dy) => [-1, 0, 1].map((dx) => window.__nhg.renderer.terrainClassAt(x + dx, y + dy).slice(0, 4)).join(',')).join(' / '), [a.x, a.y]),
      JSON.stringify(await H.state()));
  }
  results.push([k, ok]);
}
for (const [k, ok] of results) console.log((ok === true ? 'ok     ' : ok === 'blocked' ? 'blocked' : 'FAIL   '), k);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
await browser.close();
