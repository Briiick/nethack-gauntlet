// Spawns jackals in debug mode and fights them, capturing frames mid-animation.
import { chromium } from 'playwright-core';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url + '#wizard');
await page.waitForSelector('#start-go:not([disabled])');
await page.uncheck('#start-tutorial'); await page.click('#start-go');
await page.waitForTimeout(2000);
const key = async (k, w = 250) => { await page.keyboard.press(k); await page.waitForTimeout(w); };
await key('Space'); await key('Space');
for (let i = 0; i < 3; i++) {
  await key('Control+g', 400);
  await page.keyboard.type('jackal'); await key('Enter', 400);
}
await page.screenshot({ path: `${out}/c0.png` });
let shots = 1;
for (let turn = 0; turn < 26; turn++) {
  const dir = await page.evaluate(() => {
    const r = window.__nhg.renderer, h = r.heroCell;
    for (const a of r.actors.values()) {
      if (a.hero) continue;
      const n = r.tiles.gname[a.g];
      if (!/jackal/.test(n) || /pet/.test(n)) continue;
      const dx = a.x - h.x, dy = a.y - h.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) return { '-1,-1': 'y', '0,-1': 'k', '1,-1': 'u', '-1,0': 'h', '1,0': 'l', '-1,1': 'b', '0,1': 'j', '1,1': 'n' }[dx + ',' + dy];
    }
    return null;
  });
  if (dir) { await key('F', 120); await page.keyboard.press(dir); await page.waitForTimeout(90); if (shots < 6) await page.screenshot({ path: `${out}/c${shots++}.png` }); await page.waitForTimeout(300); }
  else await key('s', 300);
  const modal = await page.evaluate(() => !document.getElementById('modal').hidden || !document.getElementById('prompt').hidden || !document.getElementById('more').hidden);
  if (modal) await key('Escape', 200);
}
await page.screenshot({ path: `${out}/c_end.png` });
console.log(await page.evaluate(() => document.getElementById('feed').innerText));
console.log(errs.length ? errs.join('\n') : 'no errors');
await browser.close();
