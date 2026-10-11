// The phone HUD: a toolbar along the bottom (search, look, quick slots, backpack, every other
// action), a context button for what you'd most likely do next (attack what's beside you, take
// the stairs, pick up), and sheets listing every NetHack command as a button.
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
};
const svg = (d, s = 24) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

// Every command, by what you'd want to do. k: keys typed; x: extended command; f: this interface.
const ACTIONS = [
  ['Items', [
    ['Eat', { k: 'e' }], ['Drink', { k: 'q' }], ['Read', { k: 'r' }], ['Zap wand', { k: 'z' }], ['Apply / use', { k: 'a' }], ['Cast spell', { k: 'Z' }],
    ['Wield', { k: 'w' }], ['Swap weapons', { k: 'x' }], ['Wear', { k: 'W' }], ['Take off', { k: 'T' }], ['Put on', { k: 'P' }], ['Remove', { k: 'R' }],
    ['Fire quiver', { k: 'f' }], ['Throw', { k: 't' }], ['Ready quiver', { k: 'Q' }], ['Pick up', { k: ',' }], ['Drop', { k: 'd' }], ['Drop many', { k: 'D' }],
    ['Dip', { x: 'dip' }], ['Rub', { x: 'rub' }], ['Invoke', { x: 'invoke' }], ['Tip container', { x: 'tip' }], ['Adjust letters', { x: 'adjust' }], ['Name / call', { x: 'name' }],
  ]],
  ['Around you', [
    ['Search', { k: 's' }], ['Rest 20 turns', { k: '20s' }], ['Kick', { k: '\x04' }], ['Open door', { k: 'o' }], ['Close door', { k: 'c' }], ['Travel to…', { k: '_' }],
    ['Go up <', { k: '<' }], ['Go down >', { k: '>' }], ['Look here', { k: ':' }], ['Look at…', { k: ';' }], ['Loot', { x: 'loot' }], ['Force lock', { x: 'force' }],
    ['Untrap', { x: 'untrap' }], ['Engrave', { k: 'E' }], ['Sit', { x: 'sit' }], ['Chat', { x: 'chat' }], ['Pay', { k: 'p' }], ['Pray', { x: 'pray' }],
    ['Offer', { x: 'offer' }], ['Jump', { x: 'jump' }], ['Ride', { x: 'ride' }], ['Wipe face', { x: 'wipe' }], ['Monster ability', { x: 'monster' }], ['Turn undead', { x: 'turn' }],
  ]],
  ['You', [
    ['Character', { k: '\x18' }], ['Skills', { x: 'enhance' }], ['Spells', { k: '+' }], ['Equipment', { k: '*' }], ['Discoveries', { k: '\\' }], ['Dungeon overview', { k: '\x0f' }],
    ['Conduct', { x: 'conduct' }], ['Vanquished', { x: 'vanquished' }], ['Messages', { f: 'history' }], ['What is…', { k: '/' }], ['Again', { k: '\x01' }], ['Any command…', { k: '#' }],
  ]],
  ['Game', [
    ['Save & quit', { k: 'S' }], ['Settings', { f: 'settings' }], ['Help', { k: '?' }], ['Zoom in', { f: 'zoomin' }], ['Zoom out', { f: 'zoomout' }], ['Keyboard…', { f: 'keys' }],
  ]],
];

export class Hud {
  constructor(ui) {
    this.ui = ui; ui.hud = this;
    this.bar = $('#toolbar'); this.ctx = $('#ctx');
    this.bar.innerHTML = `
      <button type="button" class="tb" data-act="search" aria-label="Search (hold: rest)">${svg(I.search)}<span>Search</span></button>
      <button type="button" class="tb" data-act="look" aria-label="Look at…">${svg(I.look)}<span>Look</span></button>
      <div class="qslot"></div>
      <button type="button" class="tb" data-act="bag" aria-label="Backpack">${svg(I.bag)}<span>Bag</span></button>
      <button type="button" class="tb" data-act="more" aria-label="All actions">${svg(I.more, 26)}<span>Actions</span></button>`;
    this.bar.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-act="search"]');
      clearTimeout(this.restT);
      if (b) this.restT = setTimeout(() => { this.restT = null; this.restHeld = true; navigator.vibrate?.(12); this.run('20s'); }, 450);
    });
    this.bar.addEventListener('pointerup', () => clearTimeout(this.restT));
    this.bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'search' && this.restHeld) { this.restHeld = false; return; }
      ({ search: () => this.run('s'), look: () => this.run(';'), bag: () => this.run('i'), more: () => this.sheet('Actions', ACTIONS) })[b.dataset.act]();
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
    if (!ui.game?.started || ui.game.over) return;
    if (ui.modal || !ui.waiter || ui.isTargeting || ui.dirFinish) { this.flash('Finish what you are doing first'); return; }
    ui.renderer.pan.x = 0; ui.renderer.pan.y = 0; this.panned(false);
    for (const c of keys) ui.pushKey(c.charCodeAt(0));
  }
  ext(name) { const ui = this.ui; if (!ui.waiter || ui.modal) return; ui.pendingExt = name; this.run('#'); }

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
      <div class="groups">${groups.map(([g, list]) => `<h3>${esc(g)}</h3><div class="acts">${list.map(([label, a], i) => `<button type="button" data-g="${esc(g)}" data-i="${i}">${esc(label)}</button>`).join('')}</div>`).join('')}
      <label class="auto"><input type="checkbox" ${ui.settings.autoSave ? 'checked' : ''}> Save automatically when I leave the app</label></div>`;
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
