// Smoke test: serve the app, start a game, open the inventory, walk a little; fail on any console error.
// Run with `npm test` (needs `npm install` in test/ for playwright-core and a Chromium; set CHROME to its path).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn(process.execPath, ['server.mjs', String(port)], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, NO_OPEN: '1' }, stdio: 'ignore' });
const fail = (msg) => { console.error('FAIL:', msg); server.kill(); process.exit(1); };
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
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
  console.log(`ok: ${items} items in the starting inventory, ${state.actors} actors on the map`);
} finally {
  await browser.close();
  server.kill();
}
