// Get engulfed by a fog cloud (debug mode) and check the UI: no false "choose a spot" hint, the engulf
// effect draws, the game keeps accepting commands, and fighting your way out works.
import { chromium } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const H = harness(page);
await page.goto(`${url}?e=${Date.now()}#wizard`);
await page.waitForSelector('#start-go:not([disabled])');
await page.click('#start-go'); await H.settle({ maxSteps: 25 });
const pol = { line: () => 'fog cloud' };
let engulfed = false, tries = 0;
while (!engulfed && tries++ < 6) {
  await H.key('#'); await H.wait(150); await page.keyboard.type('wizgenesis'); await H.key('Enter'); await H.settle({ policy: pol });
  for (let i = 0; i < 15 && !engulfed; i++) { await H.key('m'); await H.key('.'); await H.settle({ maxSteps: 15 }); engulfed = await page.evaluate(() => !!window.__nhg.renderer.engulfed); }
}
await H.wait(400);
const during = await page.evaluate(() => ({ engulfed: window.__nhg.renderer.engulfed, hint: !document.querySelector('#target-hint')?.hidden, targeting: !!window.__nhg.ui.isTargeting }));
await page.screenshot({ path: out });
const r = await H.settle({ maxSteps: 10 });
let out2 = null;
for (let i = 0; i < 25; i++) { await H.key('F'); await H.key('l'); await H.settle({ maxSteps: 15 }); if (!(await page.evaluate(() => window.__nhg.renderer.engulfed))) { out2 = i; break; } }
console.log(JSON.stringify({ during, settleWhileEngulfed: r, gotOutAfter: out2, errs }));
await browser.close();
