// Screenshot the "pick a position" cursor (farlook) to check it is visible and the hint shows.
import { chromium } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const H = harness(page);
await page.goto(url);
await page.waitForSelector('#start-go:not([disabled])');
await page.click('#start-go'); await H.settle({ maxSteps: 25 });
await H.key(';'); await H.wait(300);
for (const k of ['l', 'l', 'l', 'j']) await H.key(k);
await H.wait(500);
const s = await page.evaluate(() => ({ cursor: window.__nhg.renderer.cursor, hint: !document.querySelector('#target-hint')?.hidden }));
await page.screenshot({ path: out });
await H.key('.'); await H.wait(400);
const after = await page.evaluate(() => ({ cursor: window.__nhg.renderer.cursor, hint: !document.querySelector('#target-hint')?.hidden, msg: window.__nhg.ui.historyLog.slice(-1)[0] }));
console.log(JSON.stringify({ during: s, after }));
await browser.close();
