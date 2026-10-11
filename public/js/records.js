// Your games, kept in this browser (or the desktop app's profile):
//  - Past games: when a game ends, NetHack writes a line to its xlogfile (score, role, how it ended,
//    depth, turns...). That file lives in memory, so the line is copied into storage here, and the
//    Hall of Fame lists them: best scores and most recent.
//  - Saved games: NetHack's save file is binary, so when the game saves, a short description is kept
//    beside it (who, where, which turn, when) for the start screen's Continue cards.
const HISTORY = 'nhg-history', META = 'nhg-save-meta', MAX = 500;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };

const ROLES = { Arc: 'Archeologist', Bar: 'Barbarian', Cav: 'Caveman', Hea: 'Healer', Kni: 'Knight', Mon: 'Monk', Pri: 'Priest', Ran: 'Ranger',
  Rog: 'Rogue', Sam: 'Samurai', Tou: 'Tourist', Val: 'Valkyrie', Wiz: 'Wizard' };
const RACES = { Hum: 'human', Elf: 'elven', Dwa: 'dwarven', Gno: 'gnomish', Orc: 'orcish' };
const ALIGNS = { Law: 'lawful', Neu: 'neutral', Cha: 'chaotic', Una: 'unaligned' };
// the role's own sprite sheet (assets/actors/<n>.png) for portraits
const SHEET = { archeologist: 331, barbarian: 332, caveman: 333, cavewoman: 333, healer: 334, knight: 335, monk: 336, priest: 337, priestess: 337,
  ranger: 338, rogue: 339, samurai: 340, tourist: 341, valkyrie: 342, wizard: 343 };
const DUNGEONS = ['the Dungeons of Doom', 'Gehennom', 'the Gnomish Mines', 'the Quest', 'Sokoban', 'Fort Ludios', "Vlad's Tower", 'the Elemental Planes', 'the Tutorial'];

const platform = () => (globalThis.nhgDesktop ? 'desktop' : document.body.classList.contains('m') ? 'phone' : 'browser');

export function pastGames() { return load(HISTORY, []); }

// The game just ended (not saved): keep NetHack's own record of it. NetHack writes the xlogfile
// line right after it closes its windows, so wait a moment for it.
export async function recordGameEnd(game, epitaph) {
  let line = '';
  for (let i = 0; i < 40 && !line; i++) {
    try { line = new TextDecoder().decode(game.mod.FS.readFile('/xlogfile')).trim().split('\n').pop() || ''; } catch (e) { /* none yet */ }
    if (!line) await new Promise((r) => setTimeout(r, 100));
  }
  if (!line) return null;
  const x = {};
  for (const kv of line.split('\t')) { const i = kv.indexOf('='); if (i > 0) x[kv.slice(0, i)] = kv.slice(i + 1); }
  const st = game.status || {}, v = (k) => (st[k] ? st[k].val : '');
  const entry = {
    name: x.name, role: x.role, race: x.race, gender: x.gender, align: x.align, points: +x.points || 0, death: x.death || '',
    epitaph: epitaph || '', turns: +x.turns || 0, deathlev: +x.deathlev || 0, maxlvl: +x.maxlvl || 0, deathdnum: +x.deathdnum || 0,
    hp: +x.hp || 0, maxhp: +x.maxhp || 0, gold: +x.gold || 0, xl: +(String(v(13)).match(/\d+/) || [0])[0] || 0,
    start: (+x.starttime || 0) * 1000, end: (+x.endtime || 0) * 1000 || Date.now(), realtime: +x.realtime || 0,
    conducts: (x.conductX || '').split(',').filter(Boolean), achievements: (x.achieveX || '').split(',').filter(Boolean), platform: platform(),
  };
  const all = pastGames();
  if (!all.some((g) => g.end === entry.end && g.name === entry.name)) { all.push(entry); store(HISTORY, all.slice(-MAX)); }
  forgetSave(entry.name);   // a game that's over has no save any more
  return entry;
}

// ---- saved games
const welcome = (log) => {   // "You are a lawful dwarven Valkyrie." (new game or welcome back)
  for (const m of [...log].reverse()) { const r = m.match(/You are an? (\w+)(?: (male|female))? (\w+) (\w+)\./); if (r) return { align: r[1], gender: r[2] || '', race: r[3], role: r[4] }; }
  return null;
};
export function recordSave(game, file) {
  const st = game.status || {}, v = (k) => (st[k] ? String(st[k].val).replace(/\\G[0-9A-Fa-f]{8}:?/g, '') : '');
  const who = welcome(game.ui.historyLog || []) || load(META, {})[file]?.who || null;
  const meta = load(META, {});
  meta[file] = { name: game.ui.playerName, who, title: v(0), xl: +(v(13).match(/\d+/) || [0])[0], depth: v(20).replace(/^Dlvl:/, 'level '), turn: +(v(16).match(/\d+/) || [0])[0],
    hp: +v(18) || 0, hpmax: +v(19) || 0, gold: +(v(10).match(/\d+$/) || [0])[0], savedAt: Date.now() };
  store(META, meta);
}
function forgetSave(name) {
  const meta = load(META, {});
  for (const f of Object.keys(meta)) if (meta[f].name === name || f.replace(/^\d+/, '') === name) delete meta[f];
  store(META, meta);
}

const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} minutes ago` : s < 129600 ? `${Math.round(s / 3600)} hours ago` : s < 2592000 ? `${Math.round(s / 86400)} days ago` : new Date(t).toLocaleDateString();
};
const sheetOf = (roleWord) => SHEET[String(roleWord || '').toLowerCase()] || null;
// a head-and-shoulders portrait from the role's sprite sheet (south-facing idle frame)
export function drawPortraits(root) {
  root.querySelectorAll('canvas[data-sheet]').forEach((c) => {
    const img = new Image();
    img.onload = () => { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height); x.drawImage(img, 9, 2, 30, 30, 0, 0, c.width, c.height); };
    img.src = `assets/actors/${c.dataset.sheet}.png`;
  });
}
const portrait = (roleWord, px = 56) => { const n = sheetOf(roleWord); return `<span class="pt">${n ? `<canvas data-sheet="${n}" width="${px}" height="${px}"></canvas>` : ''}</span>`; };

// The start screen's Continue cards. saves: [{ file, name }] -> calls onResume(name) / onDelete(file)
export function mountSaves(el, saves, { onResume, onDelete }) {
  const meta = load(META, {});
  if (!saves.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<h2>Continue</h2>${saves.map((s) => {
    const m = meta[s.file], who = m && m.who;
    const line1 = m ? [m.xl && `XL ${m.xl}`, who ? `${who.align} ${who.race} ${who.role}` : m.title.split(' the ').slice(1).join(' the ')].filter(Boolean).join(' · ') : 'Saved game';
    const line2 = m ? [m.depth && `Dungeon ${m.depth}`, m.turn && `turn ${m.turn}`, m.hpmax && `HP ${m.hp}/${m.hpmax}`].filter(Boolean).join(' · ') : '';
    return `<div class="savecard">
      ${portrait(who && who.role)}
      <div class="who"><b>${esc(s.name)}</b><small>${esc(line1)}</small>${line2 ? `<small>${esc(line2)}</small>` : ''}${m ? `<small class="when">Saved ${esc(ago(m.savedAt))}</small>` : ''}</div>
      <div class="acts"><button type="button" class="resume primary" data-name="${esc(s.name)}">Resume</button><button type="button" class="del" data-file="${esc(s.file)}" aria-label="Delete the save for ${esc(s.name)}">Delete</button></div>
    </div>`;
  }).join('')}`;
  drawPortraits(el);
  el.onclick = async (e) => {
    const r = e.target.closest('.resume'), d = e.target.closest('.del');
    if (r) onResume(r.dataset.name);
    if (d) {
      if (!d.dataset.confirm) { d.dataset.confirm = '1'; d.textContent = 'Really delete?'; return; }
      await onDelete(d.dataset.file);
      const meta2 = load(META, {}); delete meta2[d.dataset.file]; store(META, meta2);
      d.closest('.savecard').remove();
      if (!el.querySelector('.savecard')) el.innerHTML = '';
    }
  };
}

// ---- the Hall of Fame
const roleName = (g) => {
  const r = ROLES[g.role] || g.role || '';
  return g.gender === 'Fem' ? r.replace(/^Caveman$/, 'Cavewoman').replace(/^Priest$/, 'Priestess') : r;
};
const how = (g) => {
  const where = `${g.deathlev > 0 ? `level ${g.deathlev} of ` : ''}${DUNGEONS[g.deathdnum] || 'the dungeon'}`;
  const d = g.death || 'died';
  if (/^ascended/.test(d)) return 'Ascended to demigod-hood!';
  if (/^escaped/.test(d)) return `Escaped the dungeon (${d.replace(/^escaped\s*/, '')})`.replace(/ \(\)$/, '');
  if (d === 'quit') return `Quit on ${where}`;
  return `${d.replace(/^./, (c) => c.toUpperCase())} on ${where}`;
};
export function openHallOfFame(ui) {
  if (ui.modal) return;
  const games = pastGames();
  let tab = 'best', open = -1;
  const el = document.createElement('div');
  el.className = 'panel fame sheet';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Hall of Fame');
  const stats = () => {
    if (!games.length) return '';
    const best = Math.max(...games.map((g) => g.points)), deep = Math.max(...games.map((g) => g.maxlvl)), asc = games.filter((g) => /^ascended/.test(g.death)).length;
    return `<div class="stats"><span><b>${games.length}</b> games</span><span><b>${best.toLocaleString()}</b> best score</span><span><b>${deep}</b> deepest level</span>${asc ? `<span><b>${asc}</b> ascended</span>` : ''}</div>`;
  };
  const render = () => {
    const list = games.map((g, i) => ({ g, i })).sort(tab === 'best' ? (a, b) => b.g.points - a.g.points || b.g.end - a.g.end : (a, b) => b.g.end - a.g.end);
    el.innerHTML = `<header><h2>Hall of Fame</h2><button type="button" class="x" aria-label="Close">✕</button></header>
      <nav class="tabs"><button type="button" data-tab="best" class="${tab === 'best' ? 'on' : ''}">Best</button><button type="button" data-tab="recent" class="${tab === 'recent' ? 'on' : ''}">Recent</button></nav>
      ${stats()}
      <ol class="games">${list.length ? list.map(({ g, i }, n) => `<li class="${open === i ? 'open' : ''}" data-i="${i}">
        <span class="rank">${tab === 'best' ? n + 1 : ''}</span>${portrait(roleName(g), 44)}
        <div class="body"><div class="top"><b>${esc(g.name)}</b><span class="pts">${g.points.toLocaleString()}</span></div>
          <div class="how">${esc(how(g))}</div>
          <div class="meta">${esc([`${ALIGNS[g.align] || ''} ${RACES[g.race] || ''} ${roleName(g)}`.trim(), g.xl && `XL ${g.xl}`, `${g.turns.toLocaleString()} turn${g.turns === 1 ? '' : 's'}`, new Date(g.end).toLocaleDateString(), g.platform].filter(Boolean).join(' · '))}</div>
          ${open === i ? `<div class="more">${[g.epitaph && `<p>${esc(g.epitaph)}</p>`, `<p>Deepest level ${g.maxlvl} · HP ${g.hp}/${g.maxhp} · ${g.gold} gold${g.realtime ? ` · played ${Math.round(g.realtime / 60)} min` : ''}</p>`,
            g.achievements.length ? `<p><b>Achievements:</b> ${esc(g.achievements.join(', ').replace(/_/g, ' '))}</p>` : '',
            g.conducts.length ? `<p><b>Conducts kept:</b> ${esc(g.conducts.join(', '))}</p>` : ''].join('')}</div>` : ''}
        </div></li>`).join('') : '<li class="none">No finished games yet. They appear here when a game ends.</li>'}</ol>`;
    drawPortraits(el);
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('.x')) return ui.closeModal();
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; open = -1; render(); return; }
    const li = e.target.closest('li[data-i]'); if (li) { open = open === +li.dataset.i ? -1 : +li.dataset.i; render(); }
  });
  render();
  ui.openModal(el, (e) => { if (e.key === 'Escape') { ui.closeModal(); return; } if (e.key === 'Tab') { tab = tab === 'best' ? 'recent' : 'best'; render(); return; } return false; });
}
