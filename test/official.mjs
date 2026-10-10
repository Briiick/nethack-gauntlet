// Official NetHack tiles mode: map, inventory and targeting render with NetHack's own tiles, object
// tiles follow the appearance shuffle, and switching back to the redrawn sprites works.
import { chromium } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.addInitScript(() => { try { localStorage.setItem('nhg-settings', JSON.stringify({ version: 2, graphics: 'official' })); } catch (e) { /* */ } });
const H = harness(page);
await page.goto(`${url}?o=${Date.now()}`);
await page.waitForSelector('#start-go:not([disabled])');
await page.selectOption('#start-role', 'Wizard');
await page.uncheck('#start-tutorial'); await page.click('#start-go'); await H.settle({ maxSteps: 30 });
await H.key('Escape'); await H.wait(600);
await page.screenshot({ path: `${out}/official-map.png` });
// shuffle: a potion glyph's official tile must be the tile of its shuffled appearance
const shuffle = await page.evaluate(() => {
  const r = window.__nhg.renderer, t = r.tiles;
  let differs = 0, checked = 0;
  t.gobj.forEach((o, g) => { if (o < 0 || /piletop|body of/.test(t.gname[g])) return; checked++; if (r.officialTile(g) !== t.g2t[g]) differs++; });
  return { checked, shuffled: differs };
});
await H.key('i'); await H.wait(800);
await page.screenshot({ path: `${out}/official-inventory.png` });
await H.key('Escape'); await H.settle();
await H.key(';'); await H.wait(200); await H.key('l'); await H.key('l'); await H.wait(300);
const target = await page.evaluate(() => ({ cursor: window.__nhg.renderer.cursor, view: window.__nhg.renderer.officialView }));
await page.screenshot({ path: `${out}/official-target.png` });
await H.key('Escape'); await H.settle();
// switch back to the redrawn sprites through Settings
await H.key('F1'); await H.wait(300);
await page.selectOption('#set-graphics', 'redrawn'); await H.wait(200); await H.key('Escape'); await H.wait(700);
const back = await page.evaluate(() => ({ graphics: window.__nhg.renderer.settings.graphics, officialView: window.__nhg.renderer.officialView, zoom: window.__nhg.renderer.zoom }));
await page.screenshot({ path: `${out}/official-switched-back.png` });
console.log(JSON.stringify({ shuffle, target, back, errs }));
await browser.close();
