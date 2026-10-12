#!/usr/bin/env node
// Assemble the static website: the desktop page (public/) at the root and the phone version
// (mobile/) at m/, plus m/precache.json (every file and a version hash) for offline play.
// --app: the bundle for the iPhone app (ios-app/www): the same files, but the front page goes
// straight to the phone version.
// Usage: node tools/build-web.mjs [outDir=_site] [--app]
import { cp, rm, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), app = args.includes('--app');
const out = resolve(root, args.find((a) => !a.startsWith('--')) || '_site');
await rm(out, { recursive: true, force: true });
await cp(join(root, 'public'), out, { recursive: true });
await cp(join(root, 'mobile'), join(out, 'm'), { recursive: true });
if (app) {
  await writeFile(join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<title>NetHack Gauntlet</title><style>html,body{margin:0;height:100%;background:#06060a}</style><script>location.replace("m/" + location.hash)</script>');
}

async function walk(dir) {
  const all = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) all.push(...await walk(p)); else all.push(p);
  }
  return all;
}
const hash = createHash('sha256');
const files = [];
for (const f of (await walk(out)).sort()) {
  const rel = relative(out, f).split(sep).join('/');
  if (rel === 'm/sw.js' || rel === 'm/precache.json' || /(^|\/)\./.test(rel) || /\.md$/.test(rel)) continue;
  hash.update(rel); hash.update(await readFile(f));
  files.push(rel === 'index.html' ? './' : rel === 'm/index.html' ? 'm/' : rel);
}
const version = hash.digest('hex').slice(0, 12);
await writeFile(join(out, 'm/precache.json'), JSON.stringify({ version, files }, null, 0));
// the worker carries its build's version, so every build installs as a new worker (and cache)
const sw = join(out, 'm/sw.js');
await writeFile(sw, (await readFile(sw, 'utf8')).replace("'__VERSION__'", `'${version}'`));
await writeFile(join(out, '.nojekyll'), '');
let bytes = 0; for (const f of await walk(out)) bytes += (await stat(f)).size;
console.log(`built ${relative(root, out)}: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB, version ${version}`);
