// Modern controls: every key maps to the right NetHack command, diagonals by holding two keys,
// direction prompts and pick-a-spot accept WASD, Tab opens the command palette, the action bar
// works, right-click examines, and Classic brings NetHack's own keys back.
import { chromium } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const H = harness(page);
await page.goto(`${url}?m=${Date.now()}#wizard`);
await page.waitForSelector('#start-go:not([disabled])');
await page.uncheck('#start-tutorial'); await page.click('#start-go'); await H.settle({ maxSteps: 25 });
await H.key('#'); await H.wait(150); await page.keyboard.type('wizmap'); await H.key('Enter'); await H.settle();
// record what the controls send to NetHack (without changing what they do)
await page.evaluate(() => { const ui = window.__nhg.ui, orig = ui.pushKey.bind(ui); ui.sent = []; ui.pushKey = (c) => { ui.sent.push(c); orig(c); }; });
const sent = async () => page.evaluate(() => { const s = window.__nhg.ui.sent.map((c) => (c < 32 ? '^' + String.fromCharCode(c + 64) : String.fromCharCode(c))).join(''); window.__nhg.ui.sent = []; return s; });
const results = [];
const expect = async (label, keysFn, want) => { await page.evaluate(() => { window.__nhg.ui.sent = []; }); await keysFn(); await H.wait(160); const got = await sent(); results.push([label, got.startsWith(want) ? 'ok' : `FAIL (sent "${got}", want "${want}")`]); await H.settle({ maxSteps: 12 }); };
await expect('W moves north', () => H.key('w'), 'k');
await expect('A moves west', () => H.key('a'), 'h');
await expect('S moves south', () => H.key('s'), 'j');
await expect('D moves east', () => H.key('d'), 'l');
await expect('Up arrow', () => H.key('ArrowUp'), 'k');
await expect('Shift+D runs east', () => H.key('Shift+D'), 'L');
await expect('W+D together: north-east', async () => { await page.keyboard.down('w'); await page.keyboard.down('d'); await H.wait(20); await page.keyboard.up('d'); await page.keyboard.up('w'); }, 'u');
await expect('S+A together: south-west', async () => { await page.keyboard.down('s'); await page.keyboard.down('a'); await H.wait(20); await page.keyboard.up('a'); await page.keyboard.up('s'); }, 'b');
await expect('Numpad 9', () => H.key('Numpad9'), 'u');
await expect('Space with nothing next to you waits', () => H.key(' '), 's');
await expect('. waits', () => H.key('.'), 's');
await expect('R rests', () => H.key('r'), '20s');
await expect('E interacts (nothing here: pick up)', () => H.key('e'), ',');
await expect('G picks up', () => H.key('g'), ',');
await expect('I inventory', async () => { await H.key('i'); }, 'i');
await expect('X examines', () => H.key('x'), ';');
await expect('C character sheet', () => H.key('c'), '^X');
await expect('M dungeon overview', () => H.key('m'), '^O');
await expect('Z cast', () => H.key('z'), 'Z');
await expect('F fire', () => H.key('f'), 'f');
await expect('T throw', () => H.key('t'), 't');
await expect('< still goes up stairs', () => H.key('<'), '<');
// Space attacks the monster next to you
await H.key('Control+g'); await H.wait(200); await page.keyboard.type('lichen'); await H.key('Enter'); await H.settle();
await expect('Space attacks an adjacent monster', () => H.key(' '), 'F');
// direction prompt with WASD: kick (Ctrl+D) then W
await page.evaluate(() => { window.__nhg.ui.sent = []; });
await H.key('Control+d'); await H.wait(300);
const dirOpen = !!(await page.$('#compass:not([hidden])'));
await H.key('w'); await H.wait(400);
const kicked = (await H.msgsSince((await H.state()).msgs - 2)).join(' ');
results.push(['Direction prompt takes W', dirOpen && /kick|empty space|wall|ouch|dumb/i.test(kicked) ? 'ok' : `FAIL (${dirOpen}, ${kicked})`]);
await H.settle();
// pick-a-spot: X, then D D, then E
await H.key('x'); await H.wait(300);
const t0 = await page.evaluate(() => ({ t: window.__nhg.ui.isTargeting, c: window.__nhg.renderer.cursor }));
await H.key('d'); await H.wait(150); await H.key('d'); await H.wait(300);
const t1 = await page.evaluate(() => window.__nhg.renderer.cursor);
await page.screenshot({ path: `${out}/modern-target.png` });
await H.key('e'); await H.wait(400);
const t2 = await page.evaluate(() => ({ t: window.__nhg.ui.isTargeting }));
results.push(['Pick a spot: hint at once, WASD moves, E picks', t0.t && t0.c && t1 && t1.x === t0.c.x + 2 && !t2.t ? 'ok' : `FAIL (${JSON.stringify({ t0, t1, t2 })})`]);
await H.settle();
// Tab palette: type, Enter runs the command
await H.key('Tab'); await H.wait(300);
const pal = !!(await page.$('.panel.palette'));
await page.keyboard.type('conduct'); await H.key('Enter'); await H.wait(500);
const conductShown = (await H.state()).text;
await page.screenshot({ path: `${out}/modern-after-palette.png` });
results.push(['Tab opens every action; Enter runs it', pal && conductShown ? 'ok' : `FAIL (${pal}, ${conductShown})`]);
await H.settle();
// action bar button
const barVisible = !!(await page.$('#actionbar:not([hidden])'));
await page.click('#actionbar [data-act="inventory"]'); await H.wait(600);
const invOpen = (await H.state()).inv;
await page.screenshot({ path: `${out}/modern-bar-inventory.png` });
results.push(['Action bar opens the inventory', barVisible && invOpen ? 'ok' : `FAIL (${barVisible}, ${invOpen})`]);
await H.key('Escape'); await H.settle();
// right-click examines
const box = await page.$eval('#view', (v) => { const r = v.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2 - 40]; });
const m0 = (await H.state()).msgs;
await page.mouse.click(box[0], box[1], { button: 'right' }); await H.wait(600);
const looked = (await H.msgsSince(m0)).join(' ');
results.push(['Right-click examines', looked.length > 0 && !/unknown/i.test(looked) ? 'ok' : `FAIL (${looked})`]);
await H.settle();
// Ctrl+S asks to save (answer no)
await H.key('Control+s'); await H.wait(300);
const sp = (await H.state()).prompt;
results.push(['Ctrl+S asks to save', /save/i.test(sp) ? 'ok' : `FAIL (${sp})`]);
await H.key('n'); await H.settle();
const saveBtn = !!(await page.$('#actionbar [data-act="save"]'));
results.push(['Action bar has Save', saveBtn ? 'ok' : 'FAIL']);
// classic again: D is drop
await page.evaluate(() => { window.__nhg.ui.settings.controls = 'classic'; window.__nhg.ui.applySettings(); });
await page.evaluate(() => { window.__nhg.ui.sent = []; });
await H.key('d'); await H.wait(300);
const p = (await H.state()).prompt;
results.push(['Classic: D asks what to drop; action bar hidden', /drop/i.test(p) && !(await page.$('#actionbar:not([hidden])')) ? 'ok' : `FAIL (${p})`]);
await H.key('Escape');
for (const [l, r] of results) console.log(r === 'ok' ? 'ok  ' : 'FAIL', l, r === 'ok' ? '' : r);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
await browser.close();
