// Past games and saved games, on the desktop page and the phone version: a game that ends lands in
// the Hall of Fame (from NetHack's own xlogfile line); a saved game shows on the start screen as a
// card (who, where, which turn) and Resume carries on without typing the name.
// Usage: node test/records.mjs http://127.0.0.1:8080/ [screenshot-dir]
import { chromium, devices } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url, shots] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const results = [];
const check = (label, ok, info = '') => { results.push([label, ok ? 'ok' : `FAIL ${info}`]); if (process.env.VERBOSE) console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : info); };
const errs = [];

async function run(kind, page) {
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const H = harness(page);
  const base = kind === 'phone' ? `${url}m/` : url;
  const press = (sel) => (kind === 'phone' ? page.tap(sel) : page.click(sel));
  const open = async () => { await page.goto(`${base}?r=${Date.now()}`); await page.waitForSelector('#start-go:not([disabled])'); };
  const begin = async (name) => {
    await page.fill('#start-name', name);
    if (kind !== 'phone') { await page.selectOption('#start-controls', 'classic'); await page.uncheck('#start-tutorial'); }
    await press('#start-go'); await H.settle({ maxSteps: 40 });
  };
  const ended = () => page.waitForFunction(() => window.__nhg.game.over, null, { timeout: 15000 }).then(() => page.waitForTimeout(600));
  const tag = kind === 'phone' ? 'P' : 'D', stamp = Date.now() % 100000;
  const quitter = `Quitter${tag}${stamp}`, saver = `Saver${tag}${stamp}`;
  await page.goto(`${base}?r=0`); await page.evaluate(() => { localStorage.removeItem('nhg-history'); });

  // 1. a game that ends goes into the Hall of Fame
  await open(); await begin(quitter);
  await page.evaluate(() => { const ui = window.__nhg.ui; ui.pendingExt = 'quit'; ui.pushKey(35); });
  for (let i = 0; i < 30 && !(await page.evaluate(() => window.__nhg.game.over)); i++) {
    await page.waitForTimeout(250);
    const p = await page.evaluate(() => (document.getElementById('prompt').hidden ? '' : document.getElementById('prompt').innerText));
    if (/Really quit/i.test(p)) await page.keyboard.press('y'); else if (p) await page.keyboard.press('n');
    else if (await page.evaluate(() => !!window.__nhg.ui.modal)) await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(1500);
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('nhg-history') || '[]'));
  check(`${kind}: a finished game is recorded`, hist.some((g) => g.name === quitter && g.death === 'quit' && g.role), JSON.stringify(hist.slice(-1)));
  await press('#gameover-fame'); await page.waitForTimeout(400);
  check(`${kind}: the game-over screen opens the Hall of Fame`, (await page.innerText('#modal .fame').catch(() => '')).includes(quitter));

  // 2. a saved game shows as a card and resumes with one press
  await open(); await begin(saver);
  await page.evaluate(() => window.__nhg.game.saveAndQuit(8000)); await ended();
  await open();
  const card = await page.innerText('#saves').catch(() => '');
  check(`${kind}: the saved game shows as a card`, card.includes(saver) && /turn \d+/i.test(card) && /saved/i.test(card), card);
  if (shots) await page.screenshot({ path: `${shots}/records-${kind}-start.png` });
  await page.fill('#start-name', 'SomeoneElse');   // the name box doesn't matter for Resume
  await press(`#saves .resume[data-name="${saver}"]`); await H.settle({ maxSteps: 40 });
  const who = await page.evaluate(() => ({ name: window.__nhg.ui.playerName, back: window.__nhg.ui.historyLog.some((m) => /welcome back/i.test(m)) }));
  check(`${kind}: Resume carries on the saved game`, who.name === saver && who.back, JSON.stringify(who));
  await page.evaluate(() => window.__nhg.game.saveAndQuit(8000)); await ended();
  // tidy up: delete the test save from its card
  await open();
  await press(`#saves .del[data-file$="${saver}"]`); await press(`#saves .del[data-file$="${saver}"]`); await page.waitForTimeout(400);
  check(`${kind}: Delete removes the card`, !(await page.innerText('#saves').catch(() => '')).includes(saver));
  await press('#start-fame'); await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: `${shots}/records-${kind}-fame.png` });
}

{ const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); await run('desktop', page); await page.close(); }
{ const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage(); await run('phone', page); await ctx.close(); }
for (const [l, r] of results) console.log(r === 'ok' ? 'ok  ' : 'FAIL', l, r === 'ok' ? '' : r);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
await browser.close();
