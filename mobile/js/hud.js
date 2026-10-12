// The phone HUD: quick slots under the left thumb and a cluster under the right (search, look,
// backpack, every other action), a context button for what you'd most likely do next (attack
// what's beside you, take the stairs, pick up), and sheets listing every NetHack command as a button.
import { openHallOfFame } from '../../js/records.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const VI = { '-1,-1': 'y', '0,-1': 'k', '1,-1': 'u', '-1,0': 'h', '1,0': 'l', '-1,1': 'b', '0,1': 'j', '1,1': 'n' };

const I = {   // 24x24 line icons
  search: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM14.5 14.5 20 20',
  rest: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9',
  look: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  bag: 'M9 4h6l-1.5 3c4 1.2 6.5 4.5 6.5 9 0 3.5-3.5 5-8 5s-8-1.5-8-5c0-4.5 2.5-7.8 6.5-9z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sword: 'M19 3l2 2-11 11-2-2L19 3zM6 14l4 4M7 17l-3 3',
  down: 'M4 6h5v4h5v4h6M14 18l3 3 3-3M17 12v9',
  up: 'M4 18h5v-4h5v-4h6M14 6l3-3 3 3M17 12V3',
  pick: 'M12 3v11M7 9l5 5 5-5M5 21h14',
  centre: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  chest: 'M3 10h18v10H3zM3 10c0-4 2-6 9-6s9 2 9 6M11 12h2v3h-2z',
  force: 'M4 20l8-8M14 4l6 6-3 3-6-6zM11 13l-2-2',
  // the actions sheet
  eat: 'M7 3v7a2 2 0 0 0 4 0V3M9 3v18M17 3c-2 0-3 3-3 6s1 4 3 4v8', drink: 'M10 3h4M10 3v5L6 16a3 3 0 0 0 3 5h6a3 3 0 0 0 3-5l-4-8V3',
  read: 'M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM8 7h6M8 11h6', zap: 'M4 20L15 9M17 3v4M15 5h4M20 10v2M19 11h2',
  apply: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z', cast: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7', wear: 'M8 3l4 2 4-2 5 4-3 3-2-1v12H8V9l-2 1-3-3z', takeoff: 'M12 15V5M8 9l4-4 4 4M5 20h14',
  puton: 'M12 9a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM9.5 3h5L12 7z', remove: 'M12 9a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM4 4l16 16',
  fire: 'M5 19L19 5M14 5h5v5M5 14v5h5', throw: 'M4 20l7-7M13 4l7 7-6 2-3-3z', quiver: 'M7 21V8M12 21V6M17 21V8M5 8l2-4 2 4M10 6l2-3 2 3M15 8l2-4 2 4',
  drop: 'M12 3v12M8 11l4 4 4-4M5 21h14', dropmany: 'M9 3v10M5 9l4 4 4-4M17 3v10M13 9l4 4 4-4M4 21h16',
  dip: 'M6 3h12M8 3v6l-3 8a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-3-8V3M7 14h10', rub: 'M4 16c4-1 6-5 8-5s3 3 8 1M4 20h16',
  invoke: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', tip: 'M4 7h12l-2 13H6zM16 10l4-2M10 3v2',
  adjust: 'M4 7h10M4 12h16M4 17h7M17 5v4M14 7h6', name: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4', moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  kick: 'M7 3v10l-3 4v3h15a2 2 0 0 0-1-3l-6-2V3z', open: 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14 12h.01', close: 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M9 3v18',
  travel: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', untrap: 'M4 18h16M7 18l2-8M17 18l-2-8M9 10h6M12 4v6',
  engrave: 'M4 20h16M6 16L16 6l2 2L8 18H6z', sit: 'M6 4v16M6 12h12v8M18 12V8', chat: 'M4 5h16v11H9l-5 4z', pay: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8',
  pray: 'M12 3c-1 3-4 5-4 9a4 4 0 0 0 8 0c0-4-3-6-4-9z', offer: 'M4 14h16l-2 6H6zM12 3v8M9 8l3 3 3-3', jump: 'M4 20c2-8 6-12 8-12s6 4 8 12M12 3v3',
  ride: 'M4 15c2-4 6-6 10-6l4-4 2 2-2 4v6M6 15v5M16 15v5', wipe: 'M5 12a7 7 0 0 0 14 0M9 9h.01M15 9h.01', monster: 'M5 20V9a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-2-2z',
  turn: 'M12 3v18M7 8h10', person: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-4 4-6 8-6s7 2 8 6', skills: 'M5 20V12M10 20V6M15 20v-9M20 20V3',
  spells: 'M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM12 6l1 2.5 2.5 1-2.5 1L12 13l-1-2.5-2.5-1 2.5-1z', equip: 'M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z',
  discover: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z', map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  conduct: 'M6 3h12v18l-6-4-6 4z', skull: 'M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14zM9 12h.01M15 12h.01', log: 'M5 6h14M5 12h14M5 18h9',
  what: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5M12 17h.01', again: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
  any: 'M5 8l4 4-4 4M11 16h8', save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6', fame: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  zoomin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6M11 8v6', zoomout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6',
  keys: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
};
const svg = (d, s = 24) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// Every command, by what you'd want to do. k: keys typed; x: extended command; f: this interface; i: its icon.
const ACTIONS = [
  ['Items', [
    ['Eat', { k: 'e', i: 'eat' }], ['Drink', { k: 'q', i: 'drink' }], ['Read', { k: 'r', i: 'read' }], ['Zap wand', { k: 'z', i: 'zap' }], ['Apply / use', { k: 'a', i: 'apply' }], ['Cast spell', { k: 'Z', i: 'cast' }],
    ['Wield', { k: 'w', i: 'sword' }], ['Swap weapons', { k: 'x', i: 'swap' }], ['Wear', { k: 'W', i: 'wear' }], ['Take off', { k: 'T', i: 'takeoff' }], ['Put on', { k: 'P', i: 'puton' }], ['Remove', { k: 'R', i: 'remove' }],
    ['Fire quiver', { k: 'f', i: 'fire' }], ['Throw', { k: 't', i: 'throw' }], ['Ready quiver', { k: 'Q', i: 'quiver' }], ['Pick up', { k: ',', i: 'pick' }], ['Drop', { k: 'd', i: 'drop' }], ['Drop many', { k: 'D', i: 'dropmany' }],
    ['Dip', { x: 'dip', i: 'dip' }], ['Rub', { x: 'rub', i: 'rub' }], ['Invoke', { x: 'invoke', i: 'invoke' }], ['Tip container', { x: 'tip', i: 'tip' }], ['Adjust letters', { x: 'adjust', i: 'adjust' }], ['Name / call', { x: 'name', i: 'name' }],
  ]],
  ['Around you', [
    ['Search', { k: 's', i: 'search' }], ['Rest 20 turns', { k: '20s', i: 'moon' }], ['Kick', { k: '\x04', i: 'kick' }], ['Open door', { k: 'o', i: 'open' }], ['Close door', { k: 'c', i: 'close' }], ['Travel to…', { k: '_', i: 'travel' }],
    ['Go up <', { k: '<', i: 'up' }], ['Go down >', { k: '>', i: 'down' }], ['Look here', { k: ':', i: 'look' }], ['Look at…', { k: ';', i: 'look' }], ['Loot', { x: 'loot', i: 'chest' }], ['Force lock', { x: 'force', i: 'force' }],
    ['Untrap', { x: 'untrap', i: 'untrap' }], ['Engrave', { k: 'E', i: 'engrave' }], ['Sit', { x: 'sit', i: 'sit' }], ['Chat', { x: 'chat', i: 'chat' }], ['Pay', { k: 'p', i: 'pay' }], ['Pray', { x: 'pray', i: 'pray' }],
    ['Offer', { x: 'offer', i: 'offer' }], ['Jump', { x: 'jump', i: 'jump' }], ['Ride', { x: 'ride', i: 'ride' }], ['Wipe face', { x: 'wipe', i: 'wipe' }], ['Monster ability', { x: 'monster', i: 'monster' }], ['Turn undead', { x: 'turn', i: 'turn' }],
  ]],
  ['You', [
    ['Character', { k: '\x18', i: 'person' }], ['Skills', { x: 'enhance', i: 'skills' }], ['Spells', { k: '+', i: 'spells' }], ['Equipment', { k: '*', i: 'equip' }], ['Discoveries', { k: '\\', i: 'discover' }], ['Dungeon overview', { k: '\x0f', i: 'map' }],
    ['Conduct', { x: 'conduct', i: 'conduct' }], ['Vanquished', { x: 'vanquished', i: 'skull' }], ['Messages', { f: 'history', i: 'log' }], ['What is…', { k: '/', i: 'what' }], ['Again', { k: '\x01', i: 'again' }], ['Any command…', { k: '#', i: 'any' }],
  ]],
  ['Game', [
    ['Save & quit', { k: 'S', i: 'save' }], ['Hall of Fame', { f: 'fame', i: 'fame' }], ['Settings', { f: 'settings', i: 'gear' }], ['Help', { k: '?', i: 'what' }], ['Zoom in', { f: 'zoomin', i: 'zoomin' }], ['Zoom out', { f: 'zoomout', i: 'zoomout' }], ['Keyboard…', { f: 'keys', i: 'keys' }],
  ]],
];

export class Hud {
  constructor(ui) {
    this.ui = ui; ui.hud = this;
    this.bar = $('#toolbar'); this.ctx = $('#ctx');
    this.bar.innerHTML = `
      <div class="qslot"></div>
      <div class="cluster">
        <button type="button" class="tb" data-act="search" aria-label="Search (hold: rest)">${svg(I.search, 30)}<span>Search</span></button>
        <button type="button" class="tb" data-act="look" aria-label="Look at…">${svg(I.look)}<span>Look</span></button>
        <button type="button" class="tb" data-act="more" aria-label="All actions">${svg(I.read)}<span>Actions</span></button>
        <button type="button" class="tb" data-act="bag" aria-label="Backpack">${svg(I.bag)}<span>Bag</span></button>
      </div>`;
    this.bar.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-act="search"]');
      clearTimeout(this.restT);
      if (b) this.restT = setTimeout(() => { this.restT = null; this.restHeld = true; (globalThis.nhgHaptic ? globalThis.nhgHaptic() : navigator.vibrate?.(12)); this.run('20s'); }, 450);
    });
    this.bar.addEventListener('pointerup', () => clearTimeout(this.restT));
    this.bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'search' && this.restHeld) { this.restHeld = false; return; }
      ({ search: () => this.run(this.insist() ? 'ms' : 's'), look: () => this.run(';'), bag: () => this.run('i'), more: () => this.sheet('Actions', ACTIONS) })[b.dataset.act]();
    });
    // the shared quickbar, moved into the toolbar
    const qb = ui.quickbar.el;
    this.bar.querySelector('.qslot').appendChild(qb);
    qb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (b && b.classList.contains('empty')) this.flash('Hold an item in your bag to put it here');
    }, true);
    qb.addEventListener('contextmenu', (e) => e.preventDefault(), true);

    this.ctx.addEventListener('click', () => this.ctxAct && this.ctxAct());
    $('#settings-btn').addEventListener('click', (e) => { e.stopImmediatePropagation(); this.sheet('Game', ACTIONS.filter(([g]) => g === 'Game' || g === 'You')); }, true);
    $('#port-btn').addEventListener('click', () => this.run('\x18'));
    $('#feed').addEventListener('click', () => { if (!ui.modal && ui.game?.started) ui.history(); });
    $('#more').addEventListener('click', () => ui.pushKey(13));

    this.centre = document.createElement('button');
    this.centre.type = 'button'; this.centre.id = 'recentre'; this.centre.hidden = true;
    this.centre.innerHTML = `${svg(I.centre, 18)}<span>Back to you</span>`;
    this.centre.addEventListener('click', () => { ui.renderer.pan.x = 0; ui.renderer.pan.y = 0; this.panned(false); });
    $('#stage').appendChild(this.centre);

    this.toast = document.createElement('div'); this.toast.id = 'toast'; this.toast.hidden = true;
    $('#stage').appendChild(this.toast);

    setInterval(() => this.update(), 250);
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  started() { document.body.classList.add('playing'); this.layout(); }
  layout() { this.ui.renderer.resize?.(); }

  // type keys as if at the keyboard, once NetHack is waiting for a command
  run(keys) {
    const ui = this.ui;
    if (!ui.game?.started || ui.game.over) return false;
    if (!document.getElementById('more').hidden) { ui.pushKey(13); return false; }   // a --More-- pause: this tap only moves on
    if (ui.modal || !ui.waiter || !ui.waiter.allowClick || ui.isTargeting || ui.dirFinish) { this.flash('Finish what you are doing first'); return false; }
    ui.renderer.pan.x = 0; ui.renderer.pan.y = 0; this.panned(false);
    for (const c of keys) ui.pushKey(c.charCodeAt(0));
    return true;
  }
  // NetHack just refused to rest or search with a monster beside you: this time, insist
  insist() { return /waiting to get hit|another search|good idea right now/.test((this.ui.historyLog || []).slice(-1)[0] || ''); }
  // an extended command: only named once '#' is really on its way (else the name would linger for the next one)
  ext(name) { const ui = this.ui; ui.pendingExt = name; if (!this.run('#')) ui.pendingExt = null; }

  flash(text, ms = 1600) {
    this.toast.textContent = text; this.toast.hidden = false;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { this.toast.hidden = true; }, ms);
  }
  panned(on) { this.centre.hidden = !on; }

  // ---- the context button: the obvious next thing to do
  update() {
    const ui = this.ui, r = ui.renderer;
    let label = '', icon = '', act = null;
    const idle = ui.game?.started && !ui.game.over && ui.waiter && !ui.modal && !ui.isTargeting;
    if (idle) {
      const t = r.attackTarget();
      const here = ui.controls.here();
      if (t) {
        label = 'Attack'; icon = I.sword;
        const name = r.monsterName(t.a);
        act = () => this.run('F' + VI[`${t.dx},${t.dy}`]);
        label = `Attack<small>${esc(name)}</small>`;
      } else if (here.container) {
        label = here.locked ? `Force lock<small>${esc(here.container)}</small>` : `Open<small>${esc(here.container)}</small>`; icon = here.locked ? I.force : I.chest;
        act = () => this.ext(here.locked ? 'force' : 'loot');
      } else if (here.stairs) {
        label = here.stairs === '>' ? 'Go down' : 'Go up'; icon = here.stairs === '>' ? I.down : I.up;
        act = () => this.run(here.stairs);
      } else if (here.items) {
        label = 'Pick up'; icon = I.pick; act = () => this.run(',');
      }
    }
    this.ctxAct = act;
    const html = act ? `${svg(icon, 26)}<span>${label}</span>` : '';
    if (this.ctx.dataset.html !== html) { this.ctx.innerHTML = html; this.ctx.dataset.html = html; }
    this.ctx.hidden = !act;
  }

  // ---- a sheet of buttons
  sheet(title, groups) {
    const ui = this.ui;
    if (ui.modal) return;
    const el = document.createElement('div');
    el.className = 'panel actsheet sheet';
    el.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" class="x" aria-label="Close">✕</button></header>
      ${groups.length > 1 ? `<nav class="jump" aria-label="Kinds of action">${groups.map(([g], n) => `<button type="button" data-to="${n}">${esc(g)}</button>`).join('')}</nav>` : ''}
      <div class="groups">${groups.map(([g, list]) => `<h3>${esc(g)}</h3><div class="acts">${list.map(([label, a], i) => `<button type="button" data-g="${esc(g)}" data-i="${i}">${a.i ? svg(I[a.i], 26) : ''}${esc(label)}</button>`).join('')}</div>`).join('')}
      <label class="auto"><input type="checkbox" ${ui.settings.autoSave ? 'checked' : ''}> Save automatically when I leave the app</label></div>`;
    el.querySelector('.jump')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-to]');
      if (b) el.querySelectorAll('.groups h3')[+b.dataset.to].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const close = () => ui.closeModal();
    el.querySelector('.x').addEventListener('click', close);
    el.querySelector('.auto input').addEventListener('change', (e) => { ui.settings.autoSave = e.target.checked; ui.saveSettings(); });
    el.querySelector('.groups').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const [, list] = ACTIONS.find(([g]) => g === b.dataset.g);
      const a = list[+b.dataset.i][1];
      close();
      if (a.k) this.run(a.k);
      else if (a.x) this.ext(a.x);
      else if (a.f === 'history') ui.history();
      else if (a.f === 'settings') ui.openSettings();
      else if (a.f === 'fame') openHallOfFame(ui);
      else if (a.f === 'zoomin') this.touch?.zoomStep(1);
      else if (a.f === 'zoomout') this.touch?.zoomStep(-1);
      else if (a.f === 'keys') this.keyboard();
    });
    ui.openModal(el, (e) => { if (e.key === 'Escape') { close(); return; } return false; });
  }

  // ---- a long press: what's at that spot, and what you can do about it
  spotSheet(c) {
    const ui = this.ui, r = ui.renderer, h = ui.game?.hero || r.heroCell;
    if (ui.modal || !ui.waiter || !ui.waiter.allowClick || c.x < 0 || c.y < 0 || c.x >= 80 || c.y >= 21) return;
    const dx = c.x - h.x, dy = c.y - h.y, self = !dx && !dy, near = Math.max(Math.abs(dx), Math.abs(dy)) === 1;
    const i = c.y * 80 + c.x, gname = (g) => (g >= 0 ? r.tiles.gname[g] : '');
    const actor = [...r.actors.values()].find((a) => a.x === c.x && a.y === c.y && !a.hero);
    const terr = r.terrMem?.[i] >= 0 ? r.terrMem[i] : r.glyph[i];
    const raw = self ? 'You' : actor ? r.monsterName(actor) : r.objMem?.[i] >= 0 ? gname(r.objMem[i]) : gname(terr) || 'unexplored';
    const what = raw.replace(/^(cmap|obj|explode|zap|swallow|warning|statue of|invisible) /, '').replace(/^(a|an|the) /i, '').replace(/ of a room$/, '') || 'Somewhere';
    const lined = !self && (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy));
    const dir = VI[`${Math.sign(dx)},${Math.sign(dy)}`];
    const acts = [
      ['Look', () => { ui.pushKey(59); ui.keyQueue.push({ click: { x: c.x, y: c.y, button: 1 } }); }],
      [self ? 'Use / rest here' : near ? (actor ? 'Attack / move' : 'Step / open') : 'Travel here', () => this.click(c, 2)],
      ...(lined ? [['Fire this way', () => { ui.answerNext([{ re: /direction/i, key: dir }]); ui.pushKey(102); }]] : []),
      ...(self || near ? [['More actions…', () => this.click(c, 1)]] : []),
    ];
    const el = document.createElement('div');
    el.className = 'panel actsheet sheet spot';
    el.innerHTML = `<header><h2>${esc(what.replace(/^./, (x) => x.toUpperCase()))}</h2><button type="button" class="x" aria-label="Close">✕</button></header>
      <div class="groups"><div class="acts">${acts.map(([l], k) => `<button type="button" data-k="${k}">${esc(l)}</button>`).join('')}</div></div>`;
    el.querySelector('.x').addEventListener('click', () => ui.closeModal());
    el.querySelector('.acts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      ui.closeModal();
      ui.renderer.pan.x = 0; ui.renderer.pan.y = 0; this.panned(false);
      acts[+b.dataset.k][1]();
    });
    ui.openModal(el, (e) => { if (e.key === 'Escape') { ui.closeModal(); return; } return false; });
  }
  click(c, button) {
    const ui = this.ui, w = ui.waiter;
    if (!w || !w.allowClick) return;
    ui.waiter = null; w({ click: { x: c.x, y: c.y, button } });
  }

  // anything else: type NetHack keys on the phone's keyboard
  async keyboard() {
    const ui = this.ui;
    if (!ui.waiter) return;
    const s = await ui.getline('Type NetHack keys (e.g. 20s, or #pray)');
    if (!s) return;
    if (s.startsWith('#') && s.length > 1) { this.ext(s.slice(1).trim()); return; }
    this.run(s);
  }
}
