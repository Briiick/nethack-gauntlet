// Drag to equip: on the inventory screen, dragging an item onto the character (or a slot) wields,
// wears or puts it on with NetHack's own command, and dragging a worn item back to the pack takes
// it off. Checked against what NetHack then reports in the inventory.
import { chromium } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const H = harness(page);
await page.goto(`${url}?d=${Date.now()}#wizard`);
await page.waitForSelector('#start-go:not([disabled])');
await page.selectOption('#start-role', 'Valkyrie');
await page.uncheck('#start-tutorial'); await page.click('#start-go');
await H.settle({ maxSteps: 40 });
// a ring to put on and a spear to wield (the starting dagger sits in the alternate-weapon slot)
for (const wish of ['uncursed ring of adornment', 'uncursed spear']) { await H.key('Control+w'); await H.wait(300); await page.keyboard.type(wish); await H.key('Enter'); await H.settle(); }

const results = [];
const openInv = async () => { await H.key('i'); await page.waitForSelector('.bg-inv', { timeout: 5000 }); await H.wait(200); };
// after equipping, the inventory comes back by itself
const reopened = async () => { try { await page.waitForSelector('.bg-inv', { timeout: 4000 }); await H.wait(200); return true; } catch (e) { return false; } };
// what a slot holds ('' when empty): the slot's label is "Left ring: ring of adornment" or "Left ring (empty)"
const slotText = (slot) => page.$eval(`.bg-inv .s-${slot}`, (b) => (b.getAttribute('aria-label').split(': ')[1] || ''));
const packCell = async (re) => `.bg-inv .grid .slot[data-i="${await page.evaluate((src) => [...document.querySelectorAll('.bg-inv .grid .slot[data-i]')].find((b) => new RegExp(src, 'i').test(b.getAttribute('aria-label')))?.dataset.i, re.source)}"]`;
const drag = async (from, to) => {
  // the browser's own drag events (dragstart, dragover, drop, dragend), as a mouse drag produces them
  await page.evaluate(([f, t]) => {
    const src = document.querySelector(f), dst = document.querySelector(t), dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    fire(src, 'dragstart');
    return new Promise((res) => requestAnimationFrame(() => { fire(dst, 'dragenter'); fire(dst, 'dragover'); fire(dst, 'drop'); fire(src, 'dragend'); res(); }));
  }, [from, to]);
  await H.wait(900);   // NetHack runs the command; the inventory comes back by itself (no settle(): it would click in it)
};
const check = (label, ok, info = '') => results.push([label, ok ? 'ok' : `FAIL ${info}`]);

// 1. spear onto the character: wield it
await openInv();
await drag(await packCell(/spear/), '.bg-inv .figure');
const ro = await reopened();
check('Inventory reopens after equipping', ro);
let main = await slotText('main');
check('Drag spear onto character wields it', /spear/i.test(main), main);
await page.screenshot({ path: `${out}/drag-wielded.png` });
// 2. shield from its slot back to the pack: take it off
const shieldSlot = '.bg-inv .eq[data-i][data-slot="off"]';
await drag(shieldSlot, '.bg-inv .grid');
await reopened();
let off = await slotText('off');
check('Drag worn shield to the pack takes it off', off === '', off);
// 3. shield back onto its slot: wear it
await drag(await packCell(/shield/), '.bg-inv .s-off');
await reopened();
off = await slotText('off');
check('Drag shield onto its slot wears it', /shield/i.test(off), off);
// 4. ring onto the left-hand slot: put it on that hand
await drag(await packCell(/ring/), '.bg-inv .s-ringL');
await reopened();
const ringL = await slotText('ringL');
check('Drag ring onto left hand puts it on the left', /ring/i.test(ringL), ringL);
await page.screenshot({ path: `${out}/drag-ring.png` });
// 5. I closes the inventory (modern controls), I opens it again
await H.key('i'); await H.wait(300);
const closed = !(await page.$('.bg-inv'));
await H.settle();
await openInv();
check('I toggles the inventory', closed && !!(await page.$('.bg-inv')));
// 6. click an item, pick "Take off" from NetHack's item menu: done, and back in the inventory
await page.click('.bg-inv .eq[data-slot="off"]'); await H.wait(400);
const takeOff = await page.$$eval('#modal .panel.menu .item', (b) => b.map((x) => x.innerText));
const idx = takeOff.findIndex((t) => /take off/i.test(t));
if (idx >= 0) await page.click(`#modal .panel.menu .item >> nth=${idx}`);
await H.wait(900);
const back = await reopened();
check('Item menu "Take off" works and returns to the inventory', idx >= 0 && back && (await slotText('off')) === '', `${idx} ${back} ${await slotText('off').catch(() => '?')}`);
await H.key('Escape'); await H.settle();
// 7. not when NetHack asked something: "What do you want to drop?" lists items without dragging
await page.evaluate(() => { window.__nhg.ui.settings.controls = 'classic'; window.__nhg.ui.applySettings(); });
await H.key('d'); await H.wait(200); await H.key('?'); await H.wait(500);
const draggable = await page.$$eval('.bg-inv .grid .slot[draggable="true"]', (x) => x.length);
check('No dragging while choosing what to drop', draggable === 0, String(draggable));
await H.key('Escape'); await H.settle();

for (const [l, r] of results) console.log(r === 'ok' ? 'ok  ' : 'FAIL', l, r === 'ok' ? '' : r);
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
await browser.close();
