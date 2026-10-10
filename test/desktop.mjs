// Desktop app test: launch the Electron app, play a little, close the window with the inventory
// open, check the save landed in the saves folder on disk, relaunch and resume the same game.
// Run with `npm run test:desktop` (on Linux without a display: `xvfb-run -a npm run test:desktop`).
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { harness } from './lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const profile = mkdtempSync(path.join(tmpdir(), 'nhg-desktop-'));
const savesDir = path.join(profile, 'saves');
const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
const errs = [];

async function launch() {
  const app = await electron.launch({
    // NHG_APP tests a packaged build (e.g. dist/linux-unpacked/nethack-gauntlet) instead of the source
    executablePath: process.env.NHG_APP || path.join(ROOT, 'node_modules/.bin/electron'),
    args: [...(process.env.NHG_APP ? [] : [ROOT]), ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
    env: { ...process.env, NHG_USER_DATA: profile },
  });
  const page = await app.firstWindow();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.waitForSelector('#start-go:not([disabled])', { timeout: 30000 });
  return { app, page };
}
const turn = (page) => page.evaluate(() => +((window.__nhg.game.status[16]?.val || '').match(/\d+/) || [0])[0]);
const closeWindow = async (app) => {
  const gone = new Promise((r) => app.process().once('exit', r));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await Promise.race([gone, new Promise((_, no) => setTimeout(() => no(new Error('app did not quit')), 15000))]);
};

try {
  // 1. a new game
  let { app, page } = await launch();
  if (!(await page.evaluate(() => !!window.nhgDesktop))) fail('desktop bridge missing');
  const H = harness(page);
  await page.fill('#start-name', 'Closer');
  await page.selectOption('#start-role', 'Valkyrie');
  await page.uncheck('#start-tutorial'); await page.click('#start-go');
  await H.settle({ maxSteps: 60 });
  for (const k of ['Space', 'Space', 'Space', 'Space', 'Space']) { await H.key(k); await H.settle(); }
  const before = await turn(page);
  if (!before) fail('no turn counter after playing');
  await H.key('i');   // leave the inventory open: closing must still save
  await H.wait(300);
  if (!(await H.state()).inv) fail('inventory did not open');

  // 2. close the window: the app saves, then quits
  await closeWindow(app);
  const files = readdirSync(savesDir);
  if (!files.some((f) => /Closer/.test(f))) fail('no save file on disk after closing: ' + JSON.stringify(files));
  console.log(`saved on close at turn ${before}: ${files.join(', ')}`);

  // 3. relaunch: the save is offered, and resuming continues the same game
  ({ app, page } = await launch());
  const H2 = harness(page);
  const offered = await page.$$eval('#saves .resume', (b) => b.map((x) => x.dataset.name));
  if (!offered.includes('Closer')) fail('save not offered on relaunch: ' + JSON.stringify(offered));
  // the Saves tab names the folder on disk
  await page.click('#start-settings');
  await page.click('.panel.settings [data-tab="saves"]');
  await page.waitForFunction((d) => document.querySelector('.saves-dir code')?.textContent === d, savesDir, { timeout: 5000 })
    .catch(() => fail('Saves tab does not show the saves folder'));
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'desktop-saves.png') });
  await H2.key('Escape');
  await page.click('#saves .resume[data-name="Closer"]');
  await H2.settle({ maxSteps: 60 });
  const after = await turn(page);
  if (after < before) fail(`resumed at turn ${after}, saved at ${before}`);
  console.log(`resumed at turn ${after}`);

  // 4. closing at the start screen (no game running) quits right away
  await closeWindow(app);
  ({ app, page } = await launch());
  const t0 = Date.now();
  await closeWindow(app);
  if (Date.now() - t0 > 4000) fail('closing with no game took too long');
  if (errs.length) fail('console errors:\n' + errs.join('\n'));
  console.log('ok: desktop app saves on close and resumes');
} finally {
  rmSync(profile, { recursive: true, force: true });
}
