// Looting a chest takes one screen: on the desktop, E (or Space) on a chest opens it with the
// contents beside your pack; marking things on both sides and pressing the button takes out and
// puts in, through NetHack's own loot menus. Cancel backs out cleanly; "Take all" empties it; the
// "what type of objects?" step is skipped when picking up several things. Then the same on a phone:
// the context button says Open, and taps do the rest.
// Usage: node test/loot.mjs http://127.0.0.1:8080/
import { chromium, devices } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const results = [];
const check = (label, ok, info = '') => { results.push([label, ok ? 'ok' : `FAIL ${info}`]); if (process.env.VERBOSE) console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : info); };
const errs = [];

async function setup(page, H, start) {
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await start();
  // off the stairs (tapping yourself on stairs climbs them, as in NetHack)
  const at = () => page.evaluate(() => JSON.stringify(window.__nhg.renderer.heroCell));
  const start0 = await at();
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) {
    await page.keyboard.press(k); await H.settle();
    if (await at() !== start0) break;
  }
  // a chest at your feet, and a couple of things to put in it
  for (const wish of ['untrapped unlocked chest', '2 uncursed daggers', 'uncursed scroll of light']) {
    await page.keyboard.press('Control+w'); await H.settle({ policy: { line: () => wish } });
  }
  const letter = await page.evaluate(() => String.fromCharCode((window.__nhg.game.inventory || []).find((it) => / chest/.test(it.text)).ch));
  await page.evaluate((l) => { const ui = window.__nhg.ui; ui.answerNext([{ re: /drop/i, key: l }]); ui.pushKey(100); }, letter);
  await H.settle();
}
const lootState = (page) => page.evaluate(() => {
  const el = document.querySelector('#modal .panel.loot');
  return el ? { inside: el.querySelectorAll('.inside .lcell').length, mine: el.querySelectorAll('.mine .lcell').length, title: el.querySelector('h2').textContent } : null;
});
const inv = (page) => page.evaluate(() => (window.__nhg.game.inventory || []).filter((it) => !it.header && it.ident !== 0).map((it) => it.text));
const feed = (page) => page.evaluate(() => window.__nhg.ui.historyLog.slice(-6).join(' | '));
const waitLoot = async (page) => { for (let i = 0; i < 25; i++) { const s = await lootState(page); if (s) return s; await page.waitForTimeout(120); } return null; };

// ---------------------------------------------------------------- desktop
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const H = harness(page);
  await setup(page, H, async () => {
    await page.goto(`${url}?l=${Date.now()}#wizard`);
    await page.waitForSelector('#start-go:not([disabled])');
    await page.uncheck('#start-tutorial'); await page.click('#start-go'); await H.settle({ maxSteps: 25 });
  });
  await H.key('e');
  let s = await waitLoot(page);
  check('Desktop: E on a chest opens the loot screen', !!s && /chest/i.test(s.title), JSON.stringify(s) + await page.evaluate(() => JSON.stringify([window.__nhg.game.waiting, window.__nhg.ui.historyLog.slice(-5), window.__nhg.ui.controls.here(), window.__nhg.ui.modal?.el.className])));
  const before = await inv(page);
  // put the daggers in (click them on the pack side), take one thing out if there is anything
  await page.click('#modal .loot .mine .lcell[aria-label*="daggers"]');
  const tookOut = s && s.inside ? await page.$eval('#modal .loot .inside .lcell', (b) => b.getAttribute('aria-label')) : null;
  if (tookOut) await page.click('#modal .loot .inside .lcell');
  const label = await page.textContent('#modal .loot .go');
  check('Desktop: the button says what will happen', /Put in 1/.test(label) && (!tookOut || /Take 1/.test(label)), label);
  await page.click('#modal .loot .go');
  await H.settle();
  const after = await inv(page), log = await feed(page);
  check('Desktop: marked items go in (one press, no menus)', !after.some((t) => /\d+ .*daggers/.test(t)) && /You put \d+ .*daggers/.test(log), log);
  const core = (tookOut || '').replace(/^(a|an|the|\d+) /, '').replace(/ \(.*\)$/, '').split(' ').slice(-1)[0].replace(/s$/, '');
  check('Desktop: …and marked items come out', !tookOut || log.includes(core), `${tookOut} / ${core} / ${log}`);
  // open it again: the daggers are inside now; Cancel backs out without a question
  await H.key('e'); s = await waitLoot(page);
  const inside = await page.$$eval('#modal .loot .inside .lcell', (bs) => bs.map((b) => b.getAttribute('aria-label')));
  if (process.env.SHOTD) { await page.click('#modal .loot .inside .lcell'); await page.click('#modal .loot .mine .lcell:not(.locked) >> nth=-1'); await page.screenshot({ path: process.env.SHOTD }); await page.click('#modal .loot .inside .lcell'); await page.click('#modal .loot .mine .lcell:not(.locked) >> nth=-1'); }
  check('Desktop: reopening shows what you put in', inside.some((t) => /dagger/.test(t)), JSON.stringify(inside));
  await H.key('Escape'); await page.waitForTimeout(400);
  const idle = await page.evaluate(() => ({ w: window.__nhg.game.waiting, modal: !!window.__nhg.ui.modal, prompt: !document.getElementById('prompt').hidden }));
  check('Desktop: Esc backs out cleanly', idle.w === 'shim_nh_poskey' && !idle.modal && !idle.prompt, JSON.stringify(idle));
  // take everything
  await H.key('e'); s = await waitLoot(page);
  await page.click('#modal .loot .takeall'); await H.settle();
  const all = await inv(page);
  check('Desktop: Take all empties it', all.some((t) => /\d+ .*daggers/.test(t)), JSON.stringify(all));
  // picking up several kinds of things: no "what type of objects?" step
  await page.evaluate(() => { const ui = window.__nhg.ui, inv = window.__nhg.game.inventory.filter((it) => !it.header && it.ident !== 0); const d = inv.find((it) => /dagger/.test(it.text)), r = inv.find((it) => /scroll/.test(it.text)); ui.answerNext([{ re: /drop/i, key: String.fromCharCode(d.ch) }]); ui.pushKey(100); window.__scroll = String.fromCharCode(r.ch); });
  await H.settle();
  await page.evaluate(() => { const ui = window.__nhg.ui; ui.answerNext([{ re: /drop/i, key: window.__scroll }]); ui.pushKey(100); });
  await H.settle();
  await H.key(','); await page.waitForTimeout(500);
  const pickup = await page.evaluate(() => ({ menu: document.querySelector('#modal .panel.menu h2')?.textContent || '', inv: document.querySelector('#modal .bg-inv .plaque h2')?.textContent || '' }));
  check('Desktop: picking up several kinds goes straight to the items', !/what type/i.test(pickup.menu) && /pick up/i.test(pickup.inv), JSON.stringify(pickup));
  await H.key('Escape'); await H.settle();
  // a locked box: E finds out, the next E forces the lock (NetHack asks first)
  await page.keyboard.press('Control+w'); await H.settle({ policy: { line: () => 'locked large box' } });
  const box = await page.evaluate(() => String.fromCharCode(window.__nhg.game.inventory.find((it) => /large box/.test(it.text)).ch));
  await page.evaluate((l) => { const ui = window.__nhg.ui; ui.answerNext([{ re: /drop/i, key: l }]); ui.pushKey(100); }, box);
  await H.settle();
  await H.key('e'); await H.settle();
  const lockedNow = await page.evaluate(() => window.__nhg.ui.controls.here());
  await H.key('e'); await page.waitForTimeout(500);
  const ask = await page.evaluate(() => (document.getElementById('prompt').hidden ? '' : document.getElementById('prompt').innerText));
  check('Desktop: a locked box: E again offers to force it', lockedNow.locked && /force its lock/i.test(ask), JSON.stringify([lockedNow, ask]));
  await H.key('n'); await H.settle();
  await page.close();
}

// ---------------------------------------------------------------- phone
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const H = harness(page);
  await setup(page, H, async () => {
    await page.goto(`${url}m/?l=${Date.now()}#wizard`);
    await page.waitForSelector('#start-go:not([disabled])');
    await page.tap('#start-go'); await H.settle({ maxSteps: 40 });
  });
  await page.waitForTimeout(400);
  // a monster next to you comes first (the button says Attack): deal with it
  for (let i = 0; i < 15 && /attack/i.test(await page.$eval('#ctx', (b) => (b.hidden ? '' : b.textContent))); i++) { await page.tap('#ctx'); await H.settle(); await page.waitForTimeout(300); }
  const ctxLabel = await page.$eval('#ctx', (b) => (b.hidden ? '' : b.textContent));
  check('Phone: the context button offers to open the chest', /open/i.test(ctxLabel) && /chest/i.test(ctxLabel), ctxLabel);
  await page.tap('#ctx');
  const s = await waitLoot(page);
  check('Phone: one tap opens the loot screen', !!s, JSON.stringify(s));
  await page.tap('#modal .loot .mine .lcell[aria-label*="daggers"]');
  await page.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});
  await page.tap('#modal .loot .go');
  await H.settle();
  const log = await feed(page);
  check('Phone: tap to mark, tap to put in', /You put \d+ .*daggers/.test(log), log);
  // tapping yourself on the chest loots it too (NetHack's own mouse action)
  await page.evaluate(() => { const ui = window.__nhg.ui, h = window.__nhg.renderer.heroCell, w = ui.waiter; ui.waiter = null; w({ click: { x: h.x, y: h.y, button: 2 } }); });
  const s2 = await waitLoot(page);
  check('Phone: tapping yourself on the chest opens it', !!s2 && s2.inside > 0, JSON.stringify(s2) + await page.evaluate(() => JSON.stringify([window.__nhg.game.waiting, window.__nhg.ui.historyLog.slice(-4), window.__nhg.ui.modal?.el.className, document.getElementById('prompt').hidden ? '' : document.getElementById('prompt').innerText])));
  if (s2) { await page.tap('#modal .loot .takeall'); await H.settle(); }
  check('Phone: Take all', (await inv(page)).some((t) => /\d+ .*daggers/.test(t)));
  await ctx.close();
}

for (const [l, r] of results) console.log(r === 'ok' ? 'ok  ' : 'FAIL', l, r === 'ok' ? '' : r);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
await browser.close();
