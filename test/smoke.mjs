// Smoke test: serve the app with the network blocked, start a game, open the inventory, walk a little;
// fail on any console error, any request that leaves this machine, or a missing font.
// Run with `npm test` (needs `npm install` in test/ for playwright-core and a Chromium; set CHROME to its path).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, ['server.mjs', String(port)], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, NO_OPEN: '1' }, stdio: 'ignore' });
const fail = (msg) => { console.error('FAIL:', msg); server.kill(); process.exit(1); };
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [], external = [];
// no network: anything not served by our own local server is blocked and reported
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.protocol === 'data:' || u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.continue();
  external.push(u.href); return route.abort();
});
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('#start-go:not([disabled])', { timeout: 30000 });
  await page.click('#start-go');
  // NetHack 5.0 shows the starting inventory after the intro
  for (let i = 0; i < 15 && !(await page.$('.bg-inv')); i++) { await page.waitForTimeout(600); await page.keyboard.press('Enter'); }
  if (!(await page.$('.bg-inv'))) fail('inventory screen never appeared');
  const items = await page.$$eval('.bg-inv [data-i]', (els) => els.length);
  if (items < 3) fail(`expected a starting kit, saw ${items} items`);
  await page.keyboard.press('Escape');
  for (const k of ['l', 'l', 'j', 'h', 's']) { await page.keyboard.press(k); await page.waitForTimeout(150); }
  const state = await page.evaluate(() => ({ hero: window.__nhg.game.hero, actors: window.__nhg.renderer.actors.size }));
  if (!state.hero || state.actors < 1) fail('no hero on the map: ' + JSON.stringify(state));
  if (errs.length) fail('console errors:\n' + errs.join('\n'));
  if (external.length) fail('tried to reach the network:\n' + external.join('\n'));
  const fonts = await page.evaluate(async () => { await document.fonts.ready; const want = ['700 16px Cinzel', '600 16px "Barlow Condensed"', '500 16px "EB Garamond"', '16px "Pirata One"']; await Promise.all(want.map((f) => document.fonts.load(f))); return want.filter((f) => !document.fonts.check(f)); });
  if (fonts.length) fail('fonts not loaded: ' + fonts.join(', '));
  console.log(`ok: ${items} items in the starting inventory, ${state.actors} actors on the map`);
} finally {
  await browser.close();
  server.kill();
}
