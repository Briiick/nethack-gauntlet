// Die on purpose in debug mode (eat a cockatrice corpse) and check the death screen names the cause.
import { chromium } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const H = harness(page);
await page.goto(url + '?d=' + Date.now() + '#wizard');
await page.waitForSelector('#start-go:not([disabled])');
await page.uncheck('#start-tutorial'); await page.click('#start-go'); await H.settle({ maxSteps: 25 });
await H.key('Control+w'); await H.wait(200); await page.keyboard.type('cockatrice corpse'); await H.key('Enter'); await H.settle();
// a bare-handed wish drops it on the floor: eat it from there
const pol = { yn: (p) => (/here; eat/i.test(p) ? 'y' : /die\?/i.test(p) ? 'y' : /do you want/i.test(p) ? 'y' : null) };
await H.key('e'); await H.settle({ policy: pol });
for (let i = 0; i < 12; i++) { const s = await H.state(); if (s.over || s.gameover) break; await H.key('s'); await H.settle({ policy: pol }); }
await H.wait(600);
const text = await page.evaluate(() => document.querySelector('#gameover')?.innerText.replace(/\s+/g, ' '));
await page.screenshot({ path: out });
console.log(JSON.stringify({ text, errs, tail: await page.evaluate(() => window.__nhg.game.recentText.slice(-25)) }));
await browser.close();
