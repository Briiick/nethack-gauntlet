// The item screen must say what it's for: plain inventory vs. choosing something to drop/eat.
import { chromium } from 'playwright-core';
import { harness, CHROME } from './lib.mjs';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const H = harness(page);
await page.addInitScript(() => { try { localStorage.setItem('nhg-settings', JSON.stringify({ version: 2, controls: 'classic' })); } catch (e) { /* */ } });
await page.goto(`${url}?a=${Date.now()}`);
await page.waitForSelector('#start-go:not([disabled])');
await page.click('#start-go');
for (let i = 0; i < 8; i++) { await H.wait(600); const s = await H.state(); if (s.waiting === 'shim_nh_poskey' && !s.inv && !s.menu && !s.prompt) break; await H.key(s.prompt ? 'y' : 'Escape'); }
const look = () => page.$eval('.bg-inv', (e) => ({ acting: e.classList.contains('acting'), title: e.querySelector('h2').innerText, banner: e.querySelector('.actbar')?.innerText.replace(/\s+/g, ' ') || '' }));
const results = [];
await H.key('i'); await H.wait(700); const a = await look(); await page.screenshot({ path: `${out}/act-inventory.png` });
results.push(['i: plain inventory', !a.acting && a.title === 'Inventory' ? 'ok' : JSON.stringify(a)]);
await H.key('Escape'); await H.settle();
await H.key('d'); await H.wait(300); await H.key('?'); await H.wait(700); const b = await look(); await page.screenshot({ path: `${out}/act-drop.png` });
results.push(['d then ?: says Drop', b.acting && b.title === 'Drop' && /drop/i.test(b.banner) ? 'ok' : JSON.stringify(b)]);
await H.key('Escape'); await H.settle();
const n = (await H.state()).msgs;
await H.key('e'); await H.wait(300); await H.key('*'); await H.wait(700); const c = await look();
results.push(['e then *: says Eat', c.acting && c.title === 'Eat' ? 'ok' : JSON.stringify(c)]);
await H.key('Escape'); await H.settle();
const said = (await H.msgsSince(n)).join(' ');
results.push(['Esc does nothing but cancel', !/drop|eat|you (finish|stop)/i.test(said) ? 'ok' : said]);
for (const [l, r] of results) console.log(r === 'ok' ? 'ok  ' : 'FAIL', l, r === 'ok' ? '' : r);
await browser.close();
