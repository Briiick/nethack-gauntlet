// Headless end-to-end check: boots the app, starts a game, plays some turns, takes screenshots.
import { chromium } from 'playwright-core';
const [url, outDir, ...keys] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto(url);
await page.waitForSelector('#start-go:not([disabled])', { timeout: 30000 });
await page.screenshot({ path: `${outDir}/0-start.png` });
await page.click('#start-go');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/1-intro.png` });
let n = 2;
for (const k of keys) {
  if (k.startsWith('wait')) { await page.waitForTimeout(+k.slice(4)); continue; }
  if (k === 'shot') { await page.waitForTimeout(500); await page.screenshot({ path: `${outDir}/${n++}-shot.png` }); continue; }
  await page.keyboard.press(k);
  await page.waitForTimeout(220);
}
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/${n}-final.png` });
const state = await page.evaluate(() => ({ hero: window.__nhg?.game.hero, status: Object.fromEntries(Object.entries(window.__nhg?.game.status || {}).map(([k, v]) => [k, v.val])), actors: window.__nhg?.renderer.actors.size, feed: document.getElementById('feed').innerText }));
console.log(JSON.stringify(state, null, 1));
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
await browser.close();
