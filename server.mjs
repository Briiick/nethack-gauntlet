#!/usr/bin/env node
// Zero-dependency static server for NetHack Gauntlet. Usage: node server.mjs [port] [--lan]
// The desktop page is at /, the phone version (mobile/) at /m/. --lan also serves to other devices
// on your network, so a phone on the same Wi-Fi can play.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'public'), mobile = join(here, 'mobile');
const args = process.argv.slice(2);
const lan = args.includes('--lan');
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/m') { res.writeHead(301, { Location: '/m/' }).end(); return; }
    if (path.endsWith('/')) path += 'index.html';
    const [base, rel] = path.startsWith('/m/') ? [mobile, path.slice(2)] : [root, path];
    const file = normalize(join(base, rel));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  const url = `http://localhost:${port}/`;
  console.log(`NetHack Gauntlet is running at ${url}  (phone version: ${url}m/)  (Ctrl+C to stop)`);
  if (lan) {
    const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    for (const ip of ips) console.log(`  on your phone (same Wi-Fi): http://${ip}:${port}/m/`);
  }
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
    exec(`${cmd} ${url}`, () => {});
  }
});
