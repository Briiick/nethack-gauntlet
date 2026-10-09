import { chromium } from 'playwright-core';
const [url, ...keys] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => console.log(m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => { globalThis.__nhgDebug = true; });
await page.goto(url);
await page.waitForSelector('#start-go:not([disabled])');
await page.click('#start-go');
await page.waitForTimeout(2000);
for (const k of keys) { console.log('--- key', k); await page.keyboard.press(k); await page.waitForTimeout(400); }
await browser.close();
