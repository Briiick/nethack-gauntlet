// Command coverage: run every NetHack command (from the engine's own command table) through the
// real UI, answer whatever it asks, and report hangs, console errors and unknown keys.
//
//   node test/commands.mjs http://127.0.0.1:8080/ out-dir [--only=name,name]
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { harness, CHROME } from './lib.mjs';

const [url, outDir, ...flags] = process.argv.slice(2);
const only = (flags.find((f) => f.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
const { wait, key, state, msgsSince, settle: settleL } = harness(page);
const settle = (maxSteps = 40, log = null) => settleL({ maxSteps, log });

// commands that end the game run last
const LAST = ['exploremode', 'panic', 'quit', 'save'];
// debug commands that need a file on disk or would hang a browser
const SKIP = new Set(['wizloaddes', 'wizloadlua']);

async function newGame(name = 'Tester', wizard = true) {
  await page.goto(`${url}?r=${Date.now()}${wizard ? '#wizard' : ''}`);   // a fresh load, not just a hash change
  await page.waitForSelector('#start-go:not([disabled])', { timeout: 30000 });
  await page.fill('#start-name', name);
  await page.selectOption('#start-role', 'Valkyrie');
  await page.selectOption('#start-controls', 'classic');   // every command by NetHack's own key
  await page.click('#start-go');
  await settle(30);
  if (!wizard) return;
  for (const w of ['pick-axe', 'magic marker', 'unicorn horn', 'bag of holding', 'wand of digging', '3 potions of water', 'blindfold',
    'leash', 'tin opener', 'tinning kit', 'can of grease', 'magic lamp', 'tooled horn', 'stethoscope', 'credit card',
    'spellbook of force bolt', 'saddle', '20 darts', 'scroll of identify', 'apple', 'ring of adornment', 'amulet of ESP', 'towel']) {
    await key('Control+w'); await wait(150); await page.keyboard.type(w); await key('Enter'); await settle(10);
  }
}

const report = [];
await newGame();
let cmds = await page.evaluate(async () => {
  const { commandList } = await import('./js/settings.js');
  return commandList(window.__nhg.mod, true).map((c) => ({ name: c.name, key: c.key, desc: c.desc, group: c.group }));
});
if (only.length) cmds = cmds.filter((c) => only.includes(c.name));
cmds.sort((a, b) => LAST.indexOf(a.name) - LAST.indexOf(b.name));
console.log(`${cmds.length} commands`);

// the game-ending commands are carried out for real
const endPolicy = {
  yn: (p) => (/explore mode|really quit|really save/i.test(p) ? 'y' : /dump core/i.test(p) ? 'n' : /do you want|identified/i.test(p) ? 'q' : null),
};
for (const c of cmds) {
  if (SKIP.has(c.name)) { report.push({ ...c, result: 'skipped (needs a file on disk)' }); continue; }
  errs = [];
  if (c.name === 'save') {   // save in a fresh game, then reload and resume it
    await newGame('Saver', false);   // debug-mode games always save as "wizard"
    for (let i = 0; i < 6; i++) { await key('s'); await settle(5); }
    const t0 = await page.evaluate(() => window.__nhg.game.status[16]?.val);
    await key('S'); const r1 = await settleL({ maxSteps: 30, log: [], policy: endPolicy });
    await page.goto(`${url}?r=${Date.now()}`); await page.waitForSelector('#start-go:not([disabled])');
    const listed = await page.$$eval('#saves .resume', (b) => b.map((x) => x.dataset.name));
    await page.fill('#start-name', 'Saver'); await page.click('#start-go'); await settle(20);
    const back = await page.evaluate(() => ({ t: window.__nhg.game.status[16]?.val, msgs: window.__nhg.ui.historyLog.slice(-8).join(' ') }));
    const ok = r1 === 'over' && listed.includes('Saver') && back.t === t0;
    report.push({ ...c, via: 'key', result: ok ? 'ok' : 'SAVE-FAILED', flow: `saved (${r1}), listed=${listed}, turn ${t0} -> ${back.t}`, msgs: [back.msgs.slice(-120)], errors: [...errs] });
    console.log(`${ok ? 'ok' : 'FAIL'}       save             saved at ${t0}, resumed at ${back.t}, start screen listed ${listed}`);
    continue;
  }
  const before = await state();
  if (before.over || before.gameover) await newGame();
  const s0 = await state();
  const log = [];
  // key-bound commands by keystroke, the rest through the # extended-command prompt
  const k = c.key;
  if (k && k >= 32 && k < 127) await page.keyboard.press(String.fromCharCode(k));
  else if (k && k < 32) await page.keyboard.press('Control+' + (k <= 26 ? String.fromCharCode(k + 96) : String.fromCharCode(k + 64)));
  else if (k && k >= 128) { const ch = String.fromCharCode(k & 0x7f); await page.keyboard.press(/[A-Z]/.test(ch) ? 'Alt+Shift+' + ch : 'Alt+' + ch); }
  else { await key('#'); await wait(150); await page.keyboard.type(c.name); await key('Enter'); }
  if (c.group === 'Prefixes') await key('l');   // a prefix wants a direction / command after it
  const result = await settleL({ maxSteps: 45, log, policy: ['exploremode', 'quit'].includes(c.name) ? endPolicy : {} });
  const msgs = (await msgsSince(s0.msgs)).slice(0, 4);
  const unknown = msgs.some((m) => /unknown command|isn't a command|not a valid command/i.test(m));
  const entry = { ...c, via: k ? 'key' : '#', result, flow: [...new Set(log)].join(' > '), msgs, errors: [...errs] };
  if (unknown) entry.result = 'UNKNOWN-KEY';
  report.push(entry);
  console.log(`${entry.result.padEnd(8)} ${c.name.padEnd(16)} ${entry.flow.slice(0, 60).padEnd(60)} ${msgs[0] ? msgs[0].slice(0, 70) : ''}${errs.length ? '  ERR ' + errs[0].slice(0, 80) : ''}`);
  if (result === 'hang' || result === 'timeout') { await page.screenshot({ path: `${outDir}/stuck-${c.name}.png` }); await key('Escape'); await key('Escape'); }
}
writeFileSync(`${outDir}/commands.json`, JSON.stringify(report, null, 1));
const bad = report.filter((r) => !['ok', 'over'].includes(r.result) && !r.result.startsWith('skipped') || r.errors?.length);
console.log(`\n${report.length} commands, ${bad.length} problems`);
for (const b of bad) console.log(' -', b.name, b.result, b.errors?.[0] || '');
await browser.close();
