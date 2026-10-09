// Debug-mode showcase: wish for a full kit, equip it, screenshot the inventory and the map.
import { chromium } from 'playwright-core';
const [url, outDir] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto(url + '#wizard');
await page.waitForSelector('#start-go:not([disabled])', { timeout: 30000 });
await page.selectOption('#start-role', 'Valkyrie').catch(() => {});
await page.click('#start-go');
const wait = (ms) => page.waitForTimeout(ms);
const key = async (k, ms = 160) => { await page.keyboard.press(k); await wait(ms); };
const settle = async () => { for (let i = 0; i < 6; i++) { if (await page.$('#modal:not([hidden])') || await page.$('#more:not([hidden])')) await key('Escape', 200); else break; } };
await wait(3500);
await settle();
const wishes = ['blessed +2 silver saber', 'blessed +3 gray dragon scale mail', 'blessed cloak of magic resistance', 'speed boots',
  'gauntlets of power', 'helm of brilliance', 'amulet of life saving', 'ring of conflict', 'ring of free action', 'wand of death',
  '3 potions of full healing', '2 scrolls of genocide', 'spellbook of finger of death', 'magic marker', 'bag of holding',
  'unicorn horn', '40 +2 arrows', 'kitten corpse', 'luckstone', 'magic lamp', '2 potions of sleeping', 'wand of digging', 'ruby', 'apple'];
for (const w of wishes) {
  await key('Control+w', 300);
  await page.keyboard.type(w, { delay: 5 });
  await key('Enter', 350);
  await settle();
}
// read inventory letters from the inventory screen, then equip by name
await key('i', 900);
const inv = await page.$$eval('.bg-inv .grid .slot:not(.empty)', (els) => els.map((e) => [e.querySelector('.acc').textContent, e.getAttribute('aria-label')]));
await key('Escape', 300); await settle();
const find = (re, skip = []) => (inv.find(([l, t]) => re.test(t) && !skip.includes(l)) || [])[0];
const rings = inv.filter(([, t]) => /\bring\b/.test(t)).map(([l]) => l);
const seq = [['w', find(/saber/)], ['W', find(/dragon scale mail/)], ['W', find(/cloak|cope|cape|mantle|pall|robe/)], ['W', find(/boots/)],
  ['W', find(/gloves|gauntlets/)], ['W', find(/helm/)], ['P', find(/amulet/)], ['P', rings[0], 'r'], ['P', rings[1], 'l'], ['Q', find(/arrow/)]];
for (const s of seq) { if (s[1] === undefined) continue; for (const k of s) await key(k, 260); await wait(500); await settle(); }
const letter = (re) => find(re) || 'x';
await key('i', 900);
await page.screenshot({ path: `${outDir}/kit-inventory.png` });
// hover a potion to show its details
const pot = await page.$('.bg-inv .grid .slot:not(.empty)');
if (pot) { await pot.hover(); await wait(300); await page.screenshot({ path: `${outDir}/kit-inventory-hover.png` }); }
await key('Escape', 400); await settle();
for (const [d, item] of [['l', letter(/lamp/)], ['l', letter(/corpse/)], ['l', letter(/potions? of full|potion/)], ['j', letter(/spellbook/)], ['h', letter(/scroll/)], ['h', letter(/bag/)], ['k', letter(/apple/)]]) {
  await key('d', 260); await key(item, 400); await settle(); await key(d, 400); await settle();
}
await wait(800);
await page.screenshot({ path: `${outDir}/kit-map.png` });
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
await browser.close();
