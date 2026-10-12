// The iPhone app's bundle (tools/build-web.mjs --app) served the way Capacitor's iOS router serves
// it (any path without a file extension gets /index.html): the game must load and stay loaded.
// (A redirect to "m/" instead of "m/index.html" reloaded forever on a real iPhone.)
// Usage: node test/ios-routing.mjs
import { chromium, devices } from 'playwright-core';
import { CHROME } from './lib.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const repo = fileURLToPath(new URL('..', import.meta.url));
const www = join(tmpdir(), 'nhg-ios-www');
execFileSync(process.execPath, [join(repo, 'tools/build-web.mjs'), www, '--app'], { stdio: 'ignore' });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
let rootHits = 0;
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!extname(p)) p = '/index.html';   // CapacitorRouter.route(for:)
  if (p === '/index.html') { rootHits++; if (process.env.DEBUG) console.log('front page for', req.url); }
  try { const body = await readFile(join(www, p)); res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ executablePath: CHROME });
// (no service worker: the app doesn't use one, and its precaching would fetch the front page too)
const page = await (await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' })).newPage();
let ok = false;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { timeout: 15000 });
  await page.waitForSelector('#start-go:not([disabled])', { timeout: 20000 });
  const before = rootHits; await page.waitForTimeout(2000);
  ok = rootHits === before && /\/m\/index\.html$/.test(page.url());
} catch (e) { console.log(e.message.split('\n')[0]); }
console.log(ok ? 'ok   the app bundle loads under Capacitor routing (no reload loop)' : `FAIL the app bundle reloads (front page served ${rootHits} times)`);
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
