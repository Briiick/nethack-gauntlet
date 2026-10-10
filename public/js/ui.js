// HUD, message feed, menus, prompts and input for NetHack Gauntlet.
import { BL, CONDITIONS, badConditions } from './game.js';
import { isInventoryMenu, inventoryMenu } from './inventory.js';
import { openSettings } from './settings.js';
import { spriteBounds } from './render.js';
import { ModernControls, mountActionBar } from './controls.js';

const ESC = 27;
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// keyboard -> NetHack character codes (number_pad off, vi-keys)
const ARROWS = { ArrowLeft: 'h', ArrowRight: 'l', ArrowUp: 'k', ArrowDown: 'j', Home: 'y', PageUp: 'u', End: 'b', PageDown: 'n' };
const NUMPAD = { Numpad4: 'h', Numpad6: 'l', Numpad8: 'k', Numpad2: 'j', Numpad7: 'y', Numpad9: 'u', Numpad1: 'b', Numpad3: 'n', Numpad5: '.', NumpadDecimal: '.' };
export function keyToCode(e) {
  if (e.key === 'Escape') return ESC;
  if (e.key === 'Enter' || e.key === 'NumpadEnter') return 10;
  if (e.key === 'Backspace') return 8;
  if (e.key === 'Tab') return 9;
  const dir = ARROWS[e.key] || NUMPAD[e.code];
  if (dir) return (e.shiftKey && dir !== '.' ? dir.toUpperCase() : dir).charCodeAt(0);
  if (e.ctrlKey && e.key.length === 1 && /[a-z]/i.test(e.key)) return e.key.toLowerCase().charCodeAt(0) & 0x1f;
  if (e.ctrlKey && e.key.length === 1 && '@[\\]^_'.includes(e.key)) return e.key.charCodeAt(0) & 0x1f;   // ^_ retravel, ^^ etc.
  if (e.ctrlKey && e.key === '-' && e.shiftKey) return 31;
  if (e.altKey && /^Key[A-Z]$/.test(e.code)) return (e.shiftKey ? e.code[3] : e.code[3].toLowerCase()).charCodeAt(0) | 0x80;
  if (e.altKey && e.key.length === 1) return e.key.charCodeAt(0) | 0x80;
  if (e.key.length === 1) return e.key.charCodeAt(0);
  return null;
}

export class UI {
  constructor({ tiles, atlas, renderer, settings, saveSettings }) {
    this.tiles = tiles; this.atlas = atlas; this.renderer = renderer;
    this.settings = settings; this.saveSettings = saveSettings;
    this.keyQueue = []; this.waiter = null; this.modal = null;
    this.feed = $('#feed'); this.historyLog = [];
    this.prompt = $('#prompt');
    addEventListener('keydown', (e) => this.onKey(e));
    $('#view').addEventListener('pointerdown', (e) => this.onPointer(e));
    $('#view').addEventListener('contextmenu', (e) => e.preventDefault());
    $('#settings-btn').addEventListener('click', () => this.openSettings());
    $('#help-btn').addEventListener('click', () => this.pushKey('?'.charCodeAt(0)));
    this.controls = new ModernControls(this);
    mountActionBar(this);
  }

  // ------------------------------------------------------------------ input queue
  onKey(e) {
    // modern controls also answer "in what direction?" with WASD
    if (this.dirFinish && this.controls.on && this.controls.directionPrompt(e, this.dirFinish)) { e.preventDefault(); return; }
    if (this.modal && this.modal.onKey) { if (this.modal.onKey(e) !== false) { e.preventDefault(); return; } }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    if (e.key === 'F1') { e.preventDefault(); this.openSettings(); return; }
    // Ctrl+S (Cmd+S on a Mac) saves in either control scheme, like any other game
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();   // never the browser's "save page"
      // only when NetHack is waiting for a command (not on the start screen, in a prompt, or picking a spot)
      if (this.waiter && !this.modal && !this.isTargeting && !(this.game && this.game.over)) this.pushKey(83);   // S: "Really save?"
      return;
    }
    if (e.metaKey) return;
    if (this.controls.on && !this.modal && !(this.game && this.game.over)) {
      if (this.isTargeting ? this.controls.targeting(e) : this.controls.command(e)) { e.preventDefault(); return; }
    }
    const code = keyToCode(e);
    if (code === null) return;
    e.preventDefault();
    this.pushKey(code);
  }
  pushKey(code) {
    this.lastDirKey = String.fromCharCode(code);
    if (this.waiter) { const w = this.waiter; this.waiter = null; w({ key: code }); }
    else if (this.keyQueue.length < 8) this.keyQueue.push({ key: code });
  }
  onPointer(e) {
    if (this.modal || (this.settings.clickTravel === false && !this.isTargeting)) return;
    const c = this.renderer.screenToCell(e.clientX, e.clientY);
    if (e.button === 2 && this.controls.on && !this.isTargeting && this.waiter) {   // right-click: examine that spot
      this.pushKey(';'.charCodeAt(0));
      this.keyQueue.push({ click: { x: c.x, y: c.y, button: 1 } });
      return;
    }
    const ev = { click: { x: c.x, y: c.y, button: e.button === 2 ? 2 : 1 } };
    if (this.waiter && this.waiter.allowClick) { const w = this.waiter; this.waiter = null; w(ev); }
  }
  waitInput({ allowClick } = {}) {
    if (this.keyQueue.length) return Promise.resolve(this.keyQueue.shift());
    return new Promise((res) => { this.waiter = res; this.waiter.allowClick = allowClick; });
  }
  async waitKey() { const ev = await this.waitInput({ allowClick: false }); return ev.key; }

  // "pick a position" mode: NetHack has moved the map cursor off the hero
  targeting(on) {
    if (on === this.isTargeting) return;
    this.isTargeting = on;
    let el = $('#target-hint');
    if (!el) { el = document.createElement('div'); el.id = 'target-hint'; el.setAttribute('role', 'status'); $('#stage').appendChild(el); }
    el.innerHTML = this.controls.on
      ? 'Choose a spot: move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> (Shift moves 8), then <kbd>E</kbd>, <kbd>Space</kbd> or click to pick it · <kbd>&lt;</kbd> <kbd>&gt;</kbd> jump to stairs · <kbd>Esc</kbd> cancels'
      : 'Choose a spot: move with the direction keys (Shift moves 8), <kbd>.</kbd> or <kbd>,</kbd> or click to pick, <kbd>&lt;</kbd> <kbd>&gt;</kbd> <kbd>_</kbd> <kbd>m</kbd> jump to stairs, altars, monsters, <kbd>Esc</kbd> to cancel';
    el.hidden = !on;
  }

  trimFeed() {
    const n = +this.settings.feedLines || 6;
    while (this.feed.children.length > n) this.feed.firstChild.remove();
  }

  // ------------------------------------------------------------------ messages
  message(text, attr = 0, { history = false } = {}) {
    if (!text) return;
    this.historyLog.push(text); if (this.historyLog.length > 300) this.historyLog.shift();
    if (history) return;
    const div = document.createElement('div');
    div.innerHTML = this.decorate(text);
    if (attr === 1 || /You die|You feel much better|Welcome to experience level/.test(text)) div.className = 'strong';
    this.feed.appendChild(div);
    this.trimFeed();
    [...this.feed.children].forEach((d, i, all) => { d.style.opacity = String(0.35 + 0.65 * (i + 1) / all.length); });
  }
  decorate(text) {
    return esc(text)
      .replace(/^(You (?:kill|destroy) )(the |your )?([^!.]+)/, '$1$2<b class="kill">$3</b>')
      .replace(/^(The |Your )?([a-z][a-z -]+?) (bites|hits|misses|touches|stings|butts|kicks|claws)/, '$1<b>$2</b> $3')
      .replace(/(You hit |You miss )(the |your )?([^!.]+)/, '$1$2<b>$3</b>');
  }
  // NetHack's tutorial puts your own kit away while you practise with its items, and hands it back
  // when you leave through a magic portal. NetHack doesn't say so; without this it looks like a bug.
  tutorialNote() {
    this.message('Tutorial: your own equipment is put away for now and comes back, untouched, when you leave through a magic portal.', 1);
  }
  bell() { $('#stage').classList.remove('bell'); void $('#stage').offsetWidth; $('#stage').classList.add('bell'); }

  async more() {
    $('#more').hidden = false;
    await this.waitKey();
    $('#more').hidden = true;
  }

  async history() {
    await this.textWindow(this.historyLog.slice(-120).map((t) => ({ text: t, attr: 0 })), { blocking: true, title: 'Message history' });
  }

  // ------------------------------------------------------------------ status HUD
  status(s, cond) {
    // NetHack embeds glyphs in some fields as \GXXXXXXXX (e.g. the gold symbol); strip them
    const v = (k) => (s[k] ? s[k].val.replace(/\\G[0-9A-Fa-f]{8}:?/g, '').trim() : '');
    const hp = parseInt(v(BL.HP), 10) || 0, hpmax = parseInt(v(BL.HPMAX), 10) || 1;
    const pw = parseInt(v(BL.ENE), 10) || 0, pwmax = parseInt(v(BL.ENEMAX), 10) || 1;
    $('#hpbar').style.width = Math.max(0, Math.min(100, hp / hpmax * 100)) + '%';
    $('#hptext').textContent = `${hp} / ${hpmax}`;
    $('#pwbar').style.width = Math.max(0, Math.min(100, pw / pwmax * 100)) + '%';
    $('#pwtext').textContent = `${pw} / ${pwmax}`;
    const title = v(BL.TITLE);
    const [name, ...rest] = title.split(' the ');
    $('#hero-name').textContent = name || 'Adventurer';
    $('#hero-title').textContent = rest.length ? 'the ' + rest.join(' the ') : '';
    $('#xl').textContent = `XL ${v(BL.XP)}${v(BL.EXP) ? ' · ' + v(BL.EXP) : ''}`;
    $('#stats').textContent = `St ${v(BL.STR)}  Dx ${v(BL.DX)}  Co ${v(BL.CO)}  In ${v(BL.IN)}  Wi ${v(BL.WI)}  Ch ${v(BL.CH)}`;
    $('#gold').textContent = '$ ' + v(BL.GOLD).replace(/^\$:?\s*/, '');
    $('#ac').textContent = `AC ${v(BL.AC)}`;
    $('#turn').textContent = v(BL.TIME) ? `T ${v(BL.TIME)}` : '';
    $('#align').textContent = v(BL.ALIGN);
    const chips = [];
    if (v(BL.HUNGER)) chips.push([v(BL.HUNGER), /Weak|Fainting|Fainted/.test(v(BL.HUNGER)) ? 'bad' : 'warn']);
    if (v(BL.CAP)) chips.push([v(BL.CAP), 'warn']);
    for (const [mask, label] of CONDITIONS) if (cond & mask) chips.push([label, badConditions(mask) ? 'bad' : 'warn']);
    $('#chips').innerHTML = chips.map(([t, k]) => `<span class="chip ${k}">${esc(t)}</span>`).join('');
    const ld = v(BL.LEVELDESC);
    $('#level').textContent = ld.replace(/^Dlvl:(\d+)/, 'Level $1');
    this.levelDesc = ld;
    this.updateBranch();
    $('#plate').classList.toggle('low', hp <= hpmax / 4);
    this.drawPortrait();
  }

  startPortraitLoop() { setInterval(() => { this.drawPortrait(); this.updateBranch(); }, 400); }
  // NetHack's status only says "Dlvl:4"; the level's wall style tells us which branch we are in
  updateBranch() {
    const ld = this.levelDesc || '';
    const named = /Home|Gehennom|Sokoban|Mines|Quest|Ludios|Plane|Astral|Vlad|Wizard|Tutorial/.test(ld);
    const branch = { mines: 'Gnomish Mines', sokoban: 'Sokoban', gehennom: 'Gehennom', knox: 'Fort Ludios' }[this.renderer.levelTheme] || 'Dungeons of Doom';
    const text = named ? '' : branch;
    if ($('#branch').textContent !== text) $('#branch').textContent = text;
  }

  drawPortrait() {
    const hero = this.renderer.heroActor();
    if (!hero) return;   // the hero's actor is briefly rebuilt during combat: keep the last portrait
    const c = $('#portrait'), ctx = c.getContext('2d');
    const e = this.official ? null : this.renderer.sheets.get(this.tiles.gmon[hero.g]);
    const key = hero.g + (this.official ? ':o' : e ? ':s' : ':t');
    if (key === this.portraitKey) return;
    this.portraitKey = key;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    if (this.official) {
      this.renderer.drawOfficial(ctx, hero.g, 2, 2, c.width - 4);
    } else if (e) {
      // head and shoulders, cropped to the sprite's real bounds
      const [bx, by, bw] = spriteBounds(e);
      const w = Math.max(16, Math.round(bw * 0.86));
      ctx.drawImage(e.img, Math.round(bx + bw / 2 - w / 2), Math.max(0, by - 1), w, w, 0, 0, c.width, c.height);
    } else {
      const t = this.tiles.g2t[hero.g], cell = this.tiles.cell, cols = this.tiles.cols;
      ctx.drawImage(this.atlas, (t % cols) * cell, Math.floor(t / cols) * cell, cell, cell, 5, 5, cell, cell);
    }
  }

  // ------------------------------------------------------------------ modals
  openModal(el, onKey) {
    this.closeModal();
    const host = $('#modal');
    host.innerHTML = ''; host.appendChild(el); host.hidden = false;
    this.modal = { el, onKey };
  }
  closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; this.modal = null; }

  // Item icon for an object glyph at `px` pixels, from the atlas that scales most cleanly.
  get official() { return this.settings.graphics === 'official' && !!this.renderer.officialImg; }

  // NetHack's own tile for a glyph (appearance shuffle included), as an icon of px pixels
  officialIcon(glyph, px) {
    if (glyph < 0) return '';
    const t = this.renderer.officialTile(glyph), cols = this.tiles.cols, k = px / 16;
    return `<span class="icon official" style="width:${px}px;height:${px}px;background-image:url(assets/official.png);background-position:-${(t % cols) * 16 * k}px -${Math.floor(t / cols) * 16 * k}px;background-size:${cols * 16 * k}px auto"></span>`;
  }

  itemIcon(glyph, px = 48) {
    if (this.official) return this.officialIcon(glyph, px);
    const it = this.renderer.itemOf(glyph);
    if (!it || !this.renderer.items) return this.tileIcon(glyph, px / this.tiles.cell, true);
    if (it.corpse !== undefined) {
      const c = this.renderer.corpseCanvas(it.corpse, 48);
      if (c) {
        if (!c.url) c.url = c.toDataURL();
        return `<img class="icon" src="${c.url}" width="${px}" height="${px}" alt="">`;
      }
    }
    const n = [48, 32, 24].find((z) => px % z === 0) || (px >= 44 ? 48 : px >= 30 ? 32 : 24);
    const k = px / n, cols = this.renderer.items.cols;
    const x = (it.cell % cols) * n * k, y = Math.floor(it.cell / cols) * n * k;
    return `<span class="icon item" style="width:${px}px;height:${px}px;background-image:url(assets/items/items${n}.png);background-position:-${x}px -${y}px;background-size:${cols * n * k}px auto"></span>`;
  }

  tileIcon(glyph, s = 2, raw = false) {
    if (glyph < 0) return '';
    if (!raw && this.official) return this.officialIcon(glyph, 16 * Math.max(1, Math.round(s)));
    if (!raw && this.renderer.itemOf(glyph)) return this.itemIcon(glyph, Math.round(this.tiles.cell * s));
    const t = this.tiles.g2t[glyph], cell = this.tiles.cell, cols = this.tiles.cols;
    const x = (t % cols) * cell, y = Math.floor(t / cols) * cell;
    return `<span class="icon" style="width:${cell * s}px;height:${cell * s}px;background-position:-${x * s}px -${y * s}px;background-size:${cols * cell * s}px auto"></span>`;
  }

  menu(menu, how) {
    if (isInventoryMenu(menu, this.tiles)) return inventoryMenu(this, menu, how);
    return new Promise((resolve) => {
      const items = menu.items;
      const el = document.createElement('div'); el.className = 'panel menu';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', menu.prompt || 'Menu');
      const selectable = items.filter((it) => !it.header && it.ident !== 0);
      let auto = 'a'.charCodeAt(0);
      for (const it of selectable) if (!it.ch) { it.ch = auto++; if (auto === 'z'.charCodeAt(0) + 1) auto = 'A'.charCodeAt(0); }
      let focus = selectable.findIndex(() => true);
      const pickAny = how === 2;
      el.innerHTML = `${menu.prompt ? `<h2>${esc(menu.prompt)}</h2>` : ''}<div class="items" role="listbox" ${pickAny ? 'aria-multiselectable="true"' : ''}></div>
        <div class="foot">${how === 0 ? 'Press any key to close' : pickAny ? '<kbd>letter</kbd> toggle · <kbd>,</kbd> all · <kbd>Enter</kbd> confirm · <kbd>Esc</kbd> cancel' : '<kbd>letter</kbd> choose · <kbd>Esc</kbd> cancel'}</div>`;
      const list = el.querySelector('.items');
      const render = () => {
        list.innerHTML = items.map((it, i) => {
          if (it.header || it.ident === 0) return `<div class="hdr">${esc(it.text)}</div>`;
          const si = selectable.indexOf(it);
          return `<button type="button" class="item${it.selected ? ' sel' : ''}${si === focus ? ' focus' : ''}" data-i="${i}" role="option" aria-selected="${!!it.selected}">
            <span class="acc">${it.ch ? esc(String.fromCharCode(it.ch)) : ''}</span>${this.tileIcon(it.glyph)}<span class="txt">${esc(it.text)}</span></button>`;
        }).join('');
        const f = list.querySelector('.focus'); if (f) f.scrollIntoView({ block: 'nearest' });
      };
      const finish = (sel) => { this.closeModal(); resolve(sel); };
      const chosen = () => selectable.filter((it) => it.selected).map((it) => ({ ident: it.ident, count: -1 }));
      const choose = (it) => {
        if (how === 0) return finish([]);
        if (pickAny) { it.selected = !it.selected; render(); }
        else finish([{ ident: it.ident, count: -1 }]);
      };
      list.addEventListener('click', (e) => { const b = e.target.closest('.item'); if (b) choose(items[+b.dataset.i]); });
      render();
      this.openModal(el, (e) => {
        if (how === 0) { finish([]); return; }
        if (e.key === 'Escape') return finish(null);
        if (e.key === 'Enter' || (e.key === ' ' && pickAny)) {
          if (!pickAny && selectable[focus]) return finish([{ ident: selectable[focus].ident, count: -1 }]);
          return finish(chosen());
        }
        if (e.key === 'ArrowDown') { focus = Math.min(selectable.length - 1, focus + 1); render(); return; }
        if (e.key === 'ArrowUp') { focus = Math.max(0, focus - 1); render(); return; }
        if (pickAny && e.key === ',') { const all = !selectable.every((i) => i.selected); selectable.forEach((i) => { i.selected = all; }); render(); return; }
        if (pickAny && e.key === '-') { selectable.forEach((i) => { i.selected = false; }); render(); return; }
        if (e.key.length === 1) {
          const code = e.key.charCodeAt(0);
          const it = selectable.find((i) => i.ch === code) || selectable.find((i) => i.gch === code);
          if (it) choose(it);
          return;
        }
        return false;
      });
    });
  }

  textWindow(lines, { blocking = true, title = '' } = {}) {
    return new Promise((resolve) => {
      const el = document.createElement('div'); el.className = 'panel text';
      const tomb = lines.some((l) => /REST\s+IN\s+PEACE|Do you want your possessions identified/.test(l.text));
      el.innerHTML = `${title ? `<h2>${esc(title)}</h2>` : ''}<pre class="${tomb ? 'tomb' : ''}">${lines.map((l) => l.attr === 1 || l.attr === 7 ? `<b>${esc(l.text)}</b>` : esc(l.text)).join('\n')}</pre><div class="foot">Press any key to continue</div>`;
      const pre = el.querySelector('pre');
      const done = () => { this.closeModal(); resolve(); };
      this.openModal(el, (e) => {
        if (e.key === 'ArrowDown' || e.key === 'j') { pre.scrollTop += 40; return; }
        if (e.key === 'ArrowUp' || e.key === 'k') { pre.scrollTop -= 40; return; }
        if (e.key === ' ' && pre.scrollTop + pre.clientHeight < pre.scrollHeight - 4) { pre.scrollTop += pre.clientHeight - 30; return; }
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        done();
      });
      el.addEventListener('click', done);
      if (!blocking) setTimeout(done, 1);
    });
  }

  // Answers for the questions a command is about to ask (drag-to-equip types "W" and answers
  // "What do you want to wear?" with the item). Each answers only a question that matches it;
  // anything unexpected drops the rest and asks the player as usual.
  answerNext(list) { this.answers = list.slice(); }
  takeAnswer(query) {
    const a = this.answers && this.answers[0];
    if (!a) return null;
    if (!a.re.test(query)) { this.answers = []; return null; }
    this.answers.shift();
    return a.key.charCodeAt(0);
  }

  yn(query, resp, def) {
    const pre = this.takeAnswer(query);
    if (pre !== null) return Promise.resolve(pre);
    return new Promise((resolve) => {
      const isDir = /direction/i.test(query) && !resp;
      const opts = resp ? resp.split('\x1b')[0].replace(/[^ -~]/g, '') : '';
      this.prompt.innerHTML = `<span class="q">${esc(query)}</span>${opts ? `<span class="opts">${[...opts].map((c) => `<button type="button" data-k="${esc(c)}" class="${c.charCodeAt(0) === def ? 'def' : ''}">${esc(c)}</button>`).join('')}</span>` : ''}`;
      this.prompt.hidden = false;
      $('#compass').hidden = !isDir;
      if (isDir) this.renderer.showCompass = true;
      const finish = (code) => { this.dirFinish = null; this.prompt.hidden = true; $('#compass').hidden = true; this.renderer.showCompass = false; this.closeModal(); resolve(code); };
      this.dirFinish = isDir ? finish : null;
      this.prompt.onclick = (e) => { const b = e.target.closest('button'); if (b) finish(b.dataset.k.charCodeAt(0)); };
      $('#compass').onclick = (e) => { const b = e.target.closest('button'); if (b) finish(b.dataset.k.charCodeAt(0)); };
      this.openModal(document.createElement('div'), (e) => {
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        let code = keyToCode(e);
        if (code === null) return;
        if (code === ESC) {
          if (opts.includes('q')) code = 113; else if (opts.includes('n')) code = 110; else code = opts ? def : ESC;
          return finish(code);
        }
        if (code === 10 || code === 13 || code === 32) { if (opts) return finish(def || code); return finish(code); }
        const ch = String.fromCharCode(code);
        if (!opts || opts.includes(ch) || /[#0-9]/.test(ch) && opts.includes('#')) return finish(code);
        // NetHack treats y/n prompts case-insensitively
        if (opts.includes(ch.toLowerCase())) return finish(ch.toLowerCase().charCodeAt(0));
      });
      $('#modal').hidden = true;     // prompts don't dim the map
    });
  }

  getline(query) {
    return new Promise((resolve) => {
      const el = document.createElement('form'); el.className = 'panel getline';
      el.innerHTML = `<label for="getline-input">${esc(query)}</label><input id="getline-input" autocomplete="off" spellcheck="false" maxlength="250"><div class="foot"><kbd>Enter</kbd> confirm · <kbd>Esc</kbd> cancel</div>`;
      const input = el.querySelector('input');
      el.addEventListener('submit', (e) => { e.preventDefault(); this.closeModal(); resolve(input.value); });
      this.openModal(el, (e) => {
        if (e.key === 'Escape') { this.closeModal(); resolve(null); return; }
        return false;
      });
      setTimeout(() => input.focus(), 0);
    });
  }

  extCommand(cmds) {
    if (this.pendingExt) {   // chosen from the Controls list
      const c = cmds.find((x) => x.name === this.pendingExt);
      this.pendingExt = null;
      if (c) return Promise.resolve(c.index);
    }
    return new Promise((resolve) => {
      const el = document.createElement('form'); el.className = 'panel getline ext';
      el.innerHTML = `<label for="ext-input">Extended command</label><input id="ext-input" autocomplete="off" spellcheck="false" placeholder="pray, offer, force, loot…"><div class="ext-list" role="listbox"></div><div class="foot"><kbd>Tab</kbd> complete · <kbd>Enter</kbd> run · <kbd>Esc</kbd> cancel</div>`;
      const input = el.querySelector('input'), list = el.querySelector('.ext-list');
      const usable = cmds.filter((c) => c.name && c.name !== '#' && c.name !== '?' && !(c.flags & 0x40) && (this.wizard || !(c.flags & 0x4)));
      let matches = usable;
      const render = () => {
        const q = input.value.trim().toLowerCase();
        matches = usable.filter((c) => c.name.startsWith(q)).slice(0, 8);
        list.innerHTML = matches.map((c, i) => `<button type="button" data-i="${c.index}" class="${i === 0 ? 'focus' : ''}"><b>${esc(c.name)}</b> <span>${esc(c.desc)}</span></button>`).join('');
      };
      input.addEventListener('input', render);
      list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.closeModal(); resolve(+b.dataset.i); } });
      el.addEventListener('submit', (e) => { e.preventDefault(); this.closeModal(); resolve(matches.length ? matches[0].index : -1); });
      this.openModal(el, (e) => {
        if (e.key === 'Escape') { this.closeModal(); resolve(-1); return; }
        if (e.key === 'Tab') { if (matches[0]) { input.value = matches[0].name; render(); } return; }
        return false;
      });
      render();
      setTimeout(() => input.focus(), 0);
    });
  }

  // ------------------------------------------------------------------ settings & end
  openSettings(tab) { openSettings(this, tab); }
  applySettings() {
    this.renderer.resize(); this.renderer.rebuildLight(); this.trimFeed(); mountActionBar(this);
  }


  gameOver(text, heading) {
    const el = $('#gameover');
    el.querySelector('h1').textContent = heading || 'Farewell';
    el.querySelector('p').textContent = text;
    el.hidden = false;
  }
}
