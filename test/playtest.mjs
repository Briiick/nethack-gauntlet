// Autoplayer for playtesting: plays a real game (not debug mode) through the UI and reports problems.
//
//   node test/playtest.mjs http://127.0.0.1:8080/ out-dir Role [actions] [--save-restore]
//
// It explores toward unexplored territory (clicking to travel or stepping with the keys), fights
// whatever is next to it, eats when hungry, prays when low, picks things up, takes the stairs down,
// and regularly opens the inventory, look, attributes and settings screens.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { harness, CHROME } from './lib.mjs';

const [url, outDir, role = 'Valkyrie', maxActionsArg = '400', ...flags] = process.argv.slice(2);
const MAX = +maxActionsArg;
const saveRestore = flags.includes('--save-restore');
const tag = role.toLowerCase();
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
const H = harness(page);
const { key, wait, state, settle } = H;
const report = { role, actions: 0, maxDepth: 1, problems: [], uiChecks: {}, events: [] };
const problem = (p) => { report.problems.push(p); console.log('PROBLEM', p); };
let shots = 0;
const shot = async (name) => { await page.screenshot({ path: `${outDir}/${tag}-${String(shots++).padStart(2, '0')}-${name}.png` }); };

const DIRS = { '-1,-1': 'y', '0,-1': 'k', '1,-1': 'u', '-1,0': 'h', '1,0': 'l', '-1,1': 'b', '0,1': 'j', '1,1': 'n' };
const peaceful = new Set();

async function start(name) {
  await page.goto(url);
  await page.waitForSelector('#start-go:not([disabled])', { timeout: 30000 });
  await page.fill('#start-name', name);
  await page.selectOption('#start-role', role);
  await page.selectOption('#start-controls', 'classic');   // the autoplayer types NetHack's own keys
  await page.uncheck('#start-tutorial'); await page.click('#start-go');
  await settle({ maxSteps: 30 });
}

// A snapshot of what the hero knows: a char grid plus hero, monsters and status.
const look = () => page.evaluate(() => {
  const { renderer: r, game: g } = window.__nhg;
  const W = 80, Hh = 21, rows = [];
  for (let y = 0; y < Hh; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const t = r.terrainClassAt(x, y), gl = r.glyph[y * W + x], c = gl >= 0 ? r.cls[gl] : '';
      const tm = r.terrMem[y * W + x], n = tm >= 0 ? r.tiles.gname[tm] : gl >= 0 ? r.tiles.gname[gl] : '';   // terrain under monsters/objects
      let ch = ' ';
      if (['floor', 'darkfloor', 'corr', 'litcorr', 'feature', 'ice', 'engraving', 'cloud', 'air'].includes(t)) ch = '.';
      if (t === 'doorway' || t === 'opendoor') ch = 'd';
      if (t === 'closeddoor') ch = 'D';
      if (t === 'wall' || t === 'tree' || t === 'bars') ch = '|';
      if (t === 'water' || t === 'lava') ch = '~';
      if (c === 'trap') ch = '^';
      if (/staircase down|ladder down/.test(n)) ch = '>';
      if (/staircase up|ladder up/.test(n)) ch = '<';
      if (c === 'obj' && ch !== ' ') ch = 'o';
      if (c === 'obj' && ch === ' ') ch = 'o';
      row += ch;
    }
    rows.push(row);
  }
  const mons = [...r.actors.values()].filter((a) => !a.hero).map((a) => ({ x: a.x, y: a.y, pet: !!(a.f & 0x10), name: r.monsterName(a) }));
  const st = (i) => (g.status[i] ? g.status[i].val : '');
  return { rows, hero: { ...g.hero }, mons, hp: +st(18), hpmax: +st(19), hunger: st(17), level: st(20), time: +((st(16).match(/\d+/) || [0])[0]), xl: st(13), title: st(0) };
});

function bfs(v, from) {
  const pass = (x, y) => x >= 0 && y >= 0 && x < 80 && y < 21 && '.dDo<>'.includes(v.rows[y][x]);
  const door = (x, y) => 'dD'.includes(v.rows[y][x]);
  const dist = new Map(), prev = new Map(), q = [[from.x, from.y]];
  const k = (x, y) => x + ',' + y;
  dist.set(k(from.x, from.y), 0);
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!pass(nx, ny) || dist.has(k(nx, ny))) continue;
      if (dx && dy && (door(x, y) || door(nx, ny))) continue;   // no diagonal moves through doorways
      if (v.mons.some((m) => m.x === nx && m.y === ny && !m.pet)) continue;
      dist.set(k(nx, ny), dist.get(k(x, y)) + 1); prev.set(k(nx, ny), [x, y]); q.push([nx, ny]);
    }
  }
  const firstStep = (tx, ty) => {
    let cur = [tx, ty];
    while (prev.has(k(...cur)) && (prev.get(k(...cur))[0] !== from.x || prev.get(k(...cur))[1] !== from.y)) cur = prev.get(k(...cur));
    return cur;
  };
  return { dist, firstStep, k, prevMap: prev };
}

const exhausted = new Set(), visited = new Set();
// cells the hero has stood on: everything next to them has been seen. After a click-travel the
// cells along the likely route count too.
let prevSeen = null;
function markVisited(v) {
  visited.add(`${v.level}:${v.hero.x},${v.hero.y}`);
  if (prevSeen && prevSeen.level === v.level) {
    const b = bfs(v, prevSeen);
    let cur = [v.hero.x, v.hero.y], n = 0;
    const back = b.prevMap;
    while (back.has(b.k(...cur)) && n++ < 200) { cur = back.get(b.k(...cur)); visited.add(`${v.level}:${cur[0]},${cur[1]}`); }
  }
  prevSeen = { x: v.hero.x, y: v.hero.y, level: v.level };
}
function frontier(v, b) {
  const unknown = (x, y) => x >= 0 && y >= 0 && x < 80 && y < 21 && v.rows[y][x] === ' ';
  let best = null;
  for (const [kk, d] of b.dist) {
    if (exhausted.has(v.level + kk) || visited.has(`${v.level}:${kk}`)) continue;
    const [x, y] = kk.split(',').map(Number);
    let open = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (unknown(x + dx, y + dy)) open++;
    if (!open) continue;
    const score = d - open * 0.5;
    if (d > 0 && (!best || score < best.score)) best = { x, y, d, score };
  }
  return best;
}

async function cellOnScreen(x, y) {
  return page.evaluate(([x, y]) => {
    const r = window.__nhg.renderer, v = r.view.getBoundingClientRect(), T = 24;
    const px = v.left + ((x * T + T / 2) - r.cam.x) * (v.width / r.vw), py = v.top + ((y * T + T / 2) - r.cam.y) * (v.height / r.vh);
    return px > v.left + 40 && px < v.right - 40 && py > v.top + 80 && py < v.bottom - 200 ? [px, py] : null;
  }, [x, y]);
}

const policy = {
  yn: (p) => {
    if (/really attack/i.test(p)) return 'n';
    if (/pray/i.test(p)) return 'y';
    if (/here; eat/i.test(p)) return 'n';   // old corpses kill: eat rations instead
    if (/beware, there will be no return|still climb/i.test(p)) return 'n';
    return null;
  },
};

async function uiCheck(name, keys, expect) {
  const s0 = await state();
  for (const k of keys) await key(k);
  await wait(250);
  const s = await state();
  const ok = expect(s);
  report.uiChecks[name] = (report.uiChecks[name] || 0) + (ok ? 1 : 0);
  if (!ok) problem(`${name}: expected screen did not open (${JSON.stringify({ inv: s.inv, menu: s.menu, text: s.text, modal: s.ext })})`);
  await settle({ maxSteps: 10 });
  void s0;
}

await start('Tester');
await shot('start');
const levelActions = {};
let lastDepth = 1, stuck = 0, lastPos = '', prayedAt = -2000, searches = 0;
for (let a = 0; a < MAX; a++) {
  report.actions = a + 1;
  const s = await state();
  if (s.over || s.gameover) break;
  const v = await look();
  const depth = +((v.level.match(/\d+/) || [1])[0]);
  if (depth !== lastDepth) {
    report.events.push(`T${v.time}: reached ${v.level}`); lastDepth = depth;
    report.maxDepth = Math.max(report.maxDepth, depth); await shot(`depth${depth}`);
  }
  markVisited(v);
  const levelKey = v.level; levelActions[levelKey] = (levelActions[levelKey] || 0) + 1;
  const pos = v.hero.x + ',' + v.hero.y;
  stuck = pos === lastPos ? stuck + 1 : 0; lastPos = pos;
  const unknownBefore = errs.length;

  // periodic tours of the UI
  if (a % 40 === 7) await uiCheck('inventory', ['i'], (st) => st.inv || st.menu);
  else if (a % 40 === 17) await uiCheck('look-here', [':'], () => true);
  else if (a % 80 === 27) await uiCheck('attributes', ['Control+x'], (st) => st.text || st.menu);
  else if (a % 80 === 67) { await key('F1'); await wait(200); const ok = await page.$('.panel.settings'); report.uiChecks.settings = (report.uiChecks.settings || 0) + (ok ? 1 : 0); if (!ok) problem('settings did not open'); await key('Escape'); }
  if (a % 150 === 149) await shot(`t${v.time}`);

  const adj = v.mons.filter((m) => !m.pet && (m.x !== v.hero.x || m.y !== v.hero.y) && Math.abs(m.x - v.hero.x) <= 1 && Math.abs(m.y - v.hero.y) <= 1 && !peaceful.has(m.name));
  let act = '';
  if (v.hp && v.hpmax && v.hp < v.hpmax / 3 && v.time - prayedAt > 1000) {
    act = 'pray'; prayedAt = v.time; await key('Alt+p');
  } else if (await page.evaluate(() => !!window.__nhg.renderer.engulfed)) {
    act = 'fight engulfer'; await key('F'); await key('l');
  } else if (adj.length) {
    const m = adj[0], d = DIRS[`${m.x - v.hero.x},${m.y - v.hero.y}`];
    act = 'fight ' + m.name; await key('F'); await key(d);
    const msgs = (await H.msgsSince(Math.max(0, s.msgs - 1))).join(' ');
    if (/really attack/i.test(msgs) || /peaceful/i.test(msgs)) peaceful.add(m.name);
  } else if (/hungry|weak|fainting/i.test(v.hunger)) {
    act = 'eat'; await key('e');
  } else if (v.rows[v.hero.y]?.[v.hero.x] === 'o' && a % 3 === 0) {
    act = 'pickup'; await key(',');
  } else {
    const b = bfs(v, v.hero);
    let stairs = null;
    for (let y = 0; y < 21; y++) { const x = v.rows[y].indexOf('>'); if (x >= 0 && b.dist.has(x + ',' + y)) stairs = { x, y }; }
    // explore the level a little before descending
    const f = frontier(v, b);
    const ready = !f || levelActions[levelKey] > 70;   // a short look around each level, then down
    if (stairs && stairs.x === v.hero.x && stairs.y === v.hero.y && ready) { act = 'descend'; await key('>'); }
    else if (stairs && ready && b.dist.get(stairs.x + ',' + stairs.y) <= 3) {
      const [sx, sy] = b.firstStep(stairs.x, stairs.y);
      act = 'step to >'; await key(DIRS[`${sx - v.hero.x},${sy - v.hero.y}`] || 's');
    } else if (stairs && ready) {
      act = 'travel to >'; await key('_'); await wait(150); await key('>'); await key('.');
    } else if (f && stuck < 6) {
      const xy = f.d >= 4 && a % 2 === 0 ? await cellOnScreen(f.x, f.y) : null;
      if (xy) { act = `click-travel ${f.x},${f.y}`; await page.mouse.click(xy[0], xy[1]); }
      else {
        const [sx, sy] = b.firstStep(f.x, f.y);
        const d = DIRS[`${sx - v.hero.x},${sy - v.hero.y}`];
        if (d && v.rows[sy][sx] === 'D' && stuck >= 2) { act = `kick door ${d}`; await key('Control+d'); await key(d); }
        else if (d) { act = `step ${d}`; await key(d); }
      }
      if (f.d <= 1 && stuck > 2) exhausted.add(v.level + b.k(f.x, f.y));
    } else {
      act = 'search'; searches++;
      await page.keyboard.type('15'); await key('s');
      if (f && stuck >= 6) exhausted.add(v.level + b.k(f.x, f.y));
      if (searches % 6 === 5) { const d = 'hjklyubn'[a % 8]; await key(d); }   // wander a bit
    }
  }
  if (process.env.TRACE && a % 40 === 3) console.log(v.rows.map((r, y) => r.split('').map((c, x) => (x === v.hero.x && y === v.hero.y ? '@' : c)).join('')).join('\n'));
  if (process.env.TRACE) console.log(`#${a} T${v.time} @${pos} ${v.level} hp${v.hp}/${v.hpmax} stairs=${JSON.stringify((() => { for (let y = 0; y < 21; y++) { const x = v.rows[y].indexOf('>'); if (x >= 0) return [x, y]; } return null; })())} act=${act}`);
  const r = await settle({ maxSteps: 40, policy });
  if (r === 'hang' || r === 'timeout') { problem(`${r} after "${act}" at T${v.time}`); await shot(`stuck-${a}`); await key('Escape'); await key('Escape'); }
  const newMsgs = await H.msgsSince(s.msgs);
  if (newMsgs.some((m) => /unknown command|isn't a command/i.test(m))) problem(`unknown command after "${act}": ${newMsgs.join(' | ')}`);
  if (errs.length > unknownBefore) problem(`console error after "${act}": ${errs.slice(unknownBefore).join(' | ')}`);
}

const fin = await look().catch(() => null);
const over = await state();
if (over.over || over.gameover) {
  await wait(800); await shot('gameover');
  report.outcome = 'died: ' + (await page.evaluate(() => document.querySelector('#gameover')?.innerText || '')).replace(/\s+/g, ' ').slice(0, 200);
  report.endText = await page.evaluate(() => window.__nhg.game.recentText?.slice(-40));
} else {
  report.outcome = 'alive';
  await shot('end');
  if (saveRestore) {
    // save, reload the page, and resume the same character
    await key('S'); await wait(200); await key('y'); await wait(1500);
    const saved = await page.evaluate(() => !!window.__nhg.game.over);
    await start('Tester');
    const back = await look();
    const resumed = saved && back.hero.x >= 0 && back.time >= (fin?.time || 0) - 1;
    report.saveRestore = { saved, resumedAtTurn: back.time, savedAtTurn: fin?.time, ok: resumed };
    if (!resumed) problem('save/restore did not resume the game: ' + JSON.stringify(report.saveRestore));
    await shot('restored');
  }
}
if (fin) Object.assign(report, { turns: fin.time, xl: fin.xl, title: fin.title, finalLevel: fin.level });
report.consoleErrors = errs;
writeFileSync(`${outDir}/${tag}.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ role, outcome: report.outcome, actions: report.actions, turns: report.turns, maxDepth: report.maxDepth, xl: report.xl, problems: report.problems.length, uiChecks: report.uiChecks, saveRestore: report.saveRestore }));
await browser.close();
