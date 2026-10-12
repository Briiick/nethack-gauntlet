// The iPhone app's native extras (mobile/js/native.js), run in Chromium against a stand-in for
// Capacitor's plugins: saves go to Documents/saves as files (not IndexedDB), the start screen lists
// them and Resume works, the app's pause event saves the game, resume carries on, and the records
// (Hall of Fame, save cards, settings) are mirrored to Documents/records.json.
// Usage: node test/ios-bridge.mjs http://127.0.0.1:8080/
import { chromium, devices } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
// a pretend native side: Filesystem kept in localStorage (so it survives reloads), App events, Haptics
await ctx.addInitScript(() => {
  const disk = () => JSON.parse(localStorage.getItem('fake-documents') || '{}');
  const put = (d) => localStorage.setItem('fake-documents', JSON.stringify(d));
  const listeners = {};
  window.__fake = { haptics: 0, fire: (ev) => (listeners[ev] || []).forEach((f) => f()) };
  window.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => 'ios',
    Plugins: {
      Filesystem: {
        async readdir({ path }) { const pre = path + '/'; const names = Object.keys(disk()).filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length)); if (!names.length && !Object.keys(disk()).some((k) => k.startsWith(pre))) throw new Error('no such folder'); return { files: names.map((name) => ({ name, type: 'file' })) }; },
        async readFile({ path }) { const d = disk(); if (!(path in d)) throw new Error('not found ' + path); return { data: d[path] }; },
        async writeFile({ path, data }) { const d = disk(); d[path] = data; put(d); return { uri: 'file:///' + path }; },
        async deleteFile({ path }) { const d = disk(); delete d[path]; put(d); },
      },
      App: { addListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return { remove() {} }; } },
      Haptics: { async impact() { window.__fake.haptics++; } },
    },
  };
});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const H = harness(page);
const results = [];
const check = (label, ok, info = '') => { results.push([label, ok ? 'ok' : `FAIL ${info}`]); if (process.env.VERBOSE) console.log(ok ? 'ok  ' : 'FAIL', label, ok ? '' : info); };
const docs = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fake-documents') || '{}')));
const NAME = 'Native' + (Date.now() % 10000);

await page.goto(`${url}m/?i=0`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.goto(`${url}m/?i=${Date.now()}`);
await page.waitForSelector('#start-go:not([disabled])');
check('The file bridge is installed; no "Add to Home Screen" hint', await page.evaluate(() => !!globalThis.nhgFiles && document.getElementById('start-install').hidden));
await page.fill('#start-name', NAME); await page.tap('#start-go'); await H.settle({ maxSteps: 40 });
// 1. the app goes to the background mid-game: saved as a file
await page.evaluate(() => window.__fake.fire('pause'));
await page.waitForFunction(() => window.__nhg.game.over, null, { timeout: 15000 }); await page.waitForTimeout(800);
const files = await docs();
check('Pausing the app saves the game to Documents/saves', files.some((f) => f.startsWith('saves/') && f.endsWith(NAME)), JSON.stringify(files));
check('…and backs up the records to Documents/records.json', files.includes('records.json'), JSON.stringify(files));
// 2. back to the app: the game reloads and carries on
await Promise.all([page.waitForNavigation(), page.evaluate(() => window.__fake.fire('resume'))]);
await H.settle({ maxSteps: 40 });
const back = await page.evaluate(() => ({ name: window.__nhg.ui.playerName, welcome: window.__nhg.ui.historyLog.some((m) => /welcome back/i.test(m)) }));
check('Coming back resumes the same game', back.name === NAME && back.welcome, JSON.stringify(back));
// 3. a save from the start screen's card (as after iOS closed the app)
await page.evaluate(() => window.__nhg.game.saveAndQuit(8000)); await page.waitForFunction(() => window.__nhg.game.over); await page.waitForTimeout(600);
await page.goto(`${url}m/?i=${Date.now()}`); await page.waitForSelector('#start-go:not([disabled])');
const card = await page.innerText('#saves').catch(() => '');
check('The start screen lists the save from Documents', card.includes(NAME), card);
await page.evaluate(() => indexedDB.deleteDatabase('/save'));   // (nothing should depend on IndexedDB)
await page.tap(`#saves .resume[data-name="${NAME}"]`); await H.settle({ maxSteps: 40 });
check('Resume from the card', await page.evaluate((n) => window.__nhg.ui.playerName === n && window.__nhg.ui.historyLog.some((m) => /welcome back/i.test(m)), NAME));
// 4. haptics through the native plugin (a long press)
await page.evaluate(() => window.__nhg.ui.bell());
check('Haptics use the native plugin', await page.evaluate(() => window.__fake.haptics > 0));
// tidy up
await page.evaluate(() => window.__nhg.game.saveAndQuit(8000)); await page.waitForTimeout(800);
for (const [l, r] of results) console.log(r === 'ok' ? 'ok  ' : 'FAIL', l, r === 'ok' ? '' : r);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
await browser.close();
