// Screenshot the inventory screen: start a Valkyrie, wait for the starting-inventory display.
import { chromium } from 'playwright-core';
const [url, out, w = 1440, h = 900] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto(url);
await page.waitForSelector('#start-go:not([disabled])', { timeout: 30000 });
await page.selectOption('#start-role', 'Valkyrie').catch(() => {});
await page.click('#start-go');
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(700);
  if (await page.$('.bg-inv')) break;
  await page.keyboard.press('Enter');
}
if (!await page.$('.bg-inv')) { await page.keyboard.press('i'); await page.waitForTimeout(800); }
await page.waitForTimeout(900);
await page.screenshot({ path: out });
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
await browser.close();
