// Screenshot every settings tab, run a command from the Controls list, check settings persist.
import { chromium } from 'playwright-core';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto(url);
await page.waitForSelector('#start-go:not([disabled])');
await page.click('#start-settings'); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/set-start.png` });
await page.keyboard.press('Escape');
await page.click('#start-go');
for (let i = 0; i < 12; i++) { await page.waitForTimeout(500); if (await page.$('.bg-inv')) { await page.keyboard.press('Escape'); break; } await page.keyboard.press('Escape'); }
await page.waitForTimeout(500);
await page.keyboard.press('F1'); await page.waitForTimeout(300);
for (const t of ['display', 'gameplay', 'controls', 'saves', 'about']) {
  await page.click(`.settings [data-tab="${t}"]`); await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/set-${t}.png` });
}
await page.click('.settings [data-tab="display"]');
await page.selectOption('#set-bright', 'bright'); await page.uncheck('#set-gore');
await page.click('.settings [data-tab="controls"]');
await page.fill('.settings .filter', 'pray'); await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/set-controls-search.png` });
const n = await page.$$eval('.cmd', (b) => b.length);
await page.click('.cmd[data-cmd="pray"]'); await page.waitForTimeout(800);
const prompt = await page.evaluate(() => document.querySelector('#prompt')?.innerText || '');
await page.screenshot({ path: `${out}/set-ran-pray.png` });
await page.keyboard.press('n'); await page.waitForTimeout(300);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nhg-settings')));
console.log(JSON.stringify({ commandsListed: n, prayPrompt: prompt.slice(0, 80), brightness: saved.brightness, gore: saved.gore }));
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
await browser.close();
