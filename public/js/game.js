// The window port: turns NetHack's window calls into map/status state and UI requests.
import { epitaph } from './epitaph.js';
import { readGlyphInfo, readExtCommands, writeMenuSelection, persistSaves } from './engine.js';

export const COLNO = 80, ROWNO = 21;
const NHW = { MESSAGE: 1, STATUS: 2, MAP: 3, MENU: 4, TEXT: 5 };
const PICK = { NONE: 0, ONE: 1, ANY: 2 };
export const MG = { HERO: 0x1, CORPSE: 0x2, INVIS: 0x4, DETECT: 0x8, PET: 0x10, RIDDEN: 0x20, STATUE: 0x40, OBJPILE: 0x80, FEMALE: 0x2000 };
export const BL = {
  TITLE: 0, STR: 1, DX: 2, CO: 3, IN: 4, WI: 5, CH: 6, ALIGN: 7, SCORE: 8, CAP: 9, GOLD: 10, ENE: 11, ENEMAX: 12,
  XP: 13, AC: 14, HD: 15, TIME: 16, HUNGER: 17, HP: 18, HPMAX: 19, LEVELDESC: 20, EXP: 21, CONDITION: 22,
  WEAPON: 23, ARMOR: 24, TERRAIN: 25, VERS: 26, FLUSH: -1, RESET: -2,
};
export const CONDITIONS = [
  [0x1, 'Bare-handed'], [0x2, 'Blind'], [0x4, 'Busy'], [0x8, 'Confused'], [0x10, 'Deaf'], [0x20, 'Iron'],
  [0x40, 'Flying'], [0x80, 'Food poisoned'], [0x100, 'Glowing hands'], [0x200, 'Grabbed'], [0x400, 'Hallucinating'],
  [0x800, 'Held'], [0x1000, 'Icy'], [0x2000, 'In lava'], [0x4000, 'Levitating'], [0x8000, 'Paralyzed'],
  [0x10000, 'Riding'], [0x20000, 'Asleep'], [0x40000, 'Slimed'], [0x80000, 'Slippery'], [0x100000, 'Stoning'],
  [0x200000, 'Strangled'], [0x400000, 'Stunned'], [0x800000, 'Submerged'], [0x1000000, 'Terminally ill'],
  [0x2000000, 'Tethered'], [0x4000000, 'Trapped'], [0x8000000, 'Unconscious'], [0x10000000, 'Wounded legs'],
  [0x20000000, 'Holding'],
];
const BAD_CONDITIONS = 0x1000000 | 0x100000 | 0x40000 | 0x200000 | 0x2000 | 0x8000 | 0x80;

export class Game {
  constructor({ ui, renderer, tiles }) {
    this.recentText = [];
    this.ui = ui; this.renderer = renderer; this.tiles = tiles;
    this.mod = null;
    this.windows = new Map();
    this.nextWin = 1;
    this.mapWin = -1; this.msgWin = -1; this.statusWin = -1;
    this.status = {}; this.conditions = 0;
    this.hero = { x: 0, y: 0 };
    this.messagesSinceInput = 0;
    this.lastLevel = null;
    this.over = false;
  }

  // ---------------------------------------------------------------- lifecycle
  // A window port must say its windows are up (tty does); until then NetHack sends every message
  // through raw_print instead of the message window, which skips the combat effects and --More--.
  shim_init_nhwindows() {
    try { globalThis.nethackGlobal.globals.iflags.window_inited = true; } catch (e) { console.warn('window_inited', e); }
  }
  shim_player_selection_or_tty() { return true; }   // NetHack's own role/race menus, via our menu UI
  shim_askname() {}
  shim_get_nh_event() {}
  shim_suspend_nhwindows() {}
  shim_resume_nhwindows() {}
  shim_mark_synch() { this.renderer.commit(); }
  shim_wait_synch() { this.renderer.commit(); }
  shim_number_pad() {}
  shim_preference_update() {}
  shim_update_positionbar() {}
  shim_change_color() {}
  shim_status_init() {}
  shim_status_enablefield() {}
  shim_getmsghistory() { return ''; }
  shim_putmsghistory(msg) { if (msg) this.ui.message(msg, 0, { history: true }); }
  shim_nhbell() { this.ui.bell(); }
  shim_cliparound() {}   // the hero comes from glyph flags; the camera follows the hero or the targeting cursor
  // The engine's view: where the hero is (the map can't tell while engulfed) and whether
  // NetHack is asking the player to pick a spot on the map.
  engineState() {
    try {
      const h = this.mod._nhg_hero();
      return { x: h & 0xff, y: (h >> 8) & 0xff, engulfed: !!((h >> 16) & 1), picking: !!((h >> 17) & 1) };
    } catch (e) { return { x: this.hero.x, y: this.hero.y, engulfed: false, picking: null }; }   // older engine
  }

  shim_curs(win, x, y) {
    const w = this.windows.get(win);
    if (!w || w.type !== NHW.MAP) return;
    const s = this.engineState();
    this.renderer.engulfed = s.engulfed;
    if (s.engulfed) { this.hero.x = s.x; this.hero.y = s.y; this.renderer.setHero(s.x, s.y); }
    this.cursorAt = { x, y };
    const picking = s.picking === null ? (x !== s.x || y !== s.y) : s.picking;
    this.renderer.cursor = picking ? { x, y } : null;
    this.ui.targeting(picking);
  }

  // the engine stopped (exit) without going through exit_nhwindows
  async onEngineExit(code, str) {
    if (this.over) return;
    this.over = true;
    this.persisted = persistSaves(this.mod);
    await this.persisted;
    const log = this.ui.historyLog.slice(-12);
    const said = [...log].reverse().find((m) => /^you die|killed by|you (drown|starve|turn to stone|burn to a crisp)|died/i.test(m));
    const death = epitaph(this.recentText, this.ui.historyLog.slice(-12)) || said;
    const where = this.status[BL.LEVELDESC]?.val?.replace(/^Dlvl:/, 'dungeon level ') || '';
    const turn = (this.status[BL.TIME]?.val.match(/\d+/) || [])[0];
    const when = [where && `on ${where}`, turn && `on turn ${turn}`].filter(Boolean).join(', ');
    if (death) this.ui.gameOver(`${death}${when ? ` (${when})` : ''}`);
    else if (log.some((m) => /saving|be seeing you/i.test(m)) || /be seeing you/i.test(str || '')) this.ui.gameOver('Your game has been saved.');
    else this.ui.gameOver(str || `Your adventure has ended${when ? ` ${when}` : ''}.`);
  }

  async shim_exit_nhwindows(str) { await this.onEngineExit(0, str); }

  // Save the game in progress and stop, exactly as NetHack's S command does. The desktop app
  // calls this when its window closes, so closing never loses a game.
  async saveAndQuit(timeout = 8000) {
    if (!this.started || this.over) return;
    const ui = this.ui, end = Date.now() + timeout;
    this.autoSaving = true;
    let sentAt = 0;
    while (!this.over && Date.now() < end) {
      if (!document.getElementById('more').hidden) {
        ui.pushKey(13);
      } else if (ui.modal || ui.isTargeting || ui.dirFinish) {
        dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));   // back out of whatever is open
      } else if (ui.waiter && Date.now() - sentAt > 1000) {
        ui.pushKey('S'.charCodeAt(0)); sentAt = Date.now();
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await this.persisted;
    this.autoSaving = false;
  }

  async shim_delay_output() {
    // NetHack paces thrown objects, zaps and explosions with this
    this.renderer.commit();
    await new Promise((r) => setTimeout(r, this.ui.settings.fastMissiles ? 18 : 40));
  }

  // ---------------------------------------------------------------- windows
  shim_create_nhwindow(type) {
    const id = this.nextWin++;
    this.windows.set(id, { type, lines: [], menu: null });
    if (type === NHW.MAP) this.mapWin = id;
    if (type === NHW.MESSAGE) this.msgWin = id;
    if (type === NHW.STATUS) this.statusWin = id;
    return id;
  }

  shim_clear_nhwindow(win) {
    const w = this.windows.get(win);
    if (!w) return;
    if (win === this.mapWin) this.renderer.clearMap();
    else if (win !== this.msgWin) { w.lines = []; }
  }

  async shim_display_nhwindow(win, blocking) {
    const w = this.windows.get(win);
    if (!w) return;
    if (win === this.mapWin) { this.renderer.commit(); return; }
    if (win === this.msgWin) {
      // NetHack pauses here (--More--) so messages aren't missed. The feed keeps the last few on
      // screen, so only pause when more arrived at once than the feed can show.
      if (blocking && this.messagesSinceInput > (+this.ui.settings.feedLines || 6)) {
        this.renderer.commit();
        await this.ui.more();
        this.messagesSinceInput = 0;
      }
      return;
    }
    if ((w.type === NHW.TEXT || w.type === NHW.MENU) && w.lines.length) {
      this.renderer.commit();
      await this.ui.textWindow(w.lines, { blocking: !!blocking || w.type === NHW.TEXT });
      w.lines = [];
    }
  }

  shim_destroy_nhwindow(win) {
    this.windows.delete(win);
  }

  shim_putstr(win, attr, str) {
    const w = this.windows.get(win);
    if (win === this.msgWin || !w) {
      if (this.say(str, attr)) { this.messagesSinceInput++; this.renderer.onMessage(str); }
      return;
    }
    if (w.type === NHW.STATUS) return;      // status arrives via status_update
    w.lines.push({ text: str, attr });
    this.recentText.push(str); if (this.recentText.length > 80) this.recentText.shift();   // tombstone, "Goodbye..."
  }

  // (messages printed while changing level, e.g. entering the tutorial, come through raw_print)
  shim_raw_print(str) { if (str) this.say(str, 0); }
  shim_raw_print_bold(str) { if (str) { this.say(str, 1); } }

  // One message for the feed; false if it's left out.
  say(str, attr) {
    if (this.ui.controls.on && /^Count: \d+$/.test(str)) return false;   // the modern R key types "20s"; don't echo it
    if (str === 'Entering the tutorial.') this.ui.tutorialNote();
    this.ui.message(this.ui.controls.explain(str), attr);
    this.recentText.push(str); if (this.recentText.length > 80) this.recentText.shift();   // for the epitaph
    return true;
  }

  async shim_display_file(name) {
    await this.ui.textWindow([{ text: `(${name} is not shown in this interface yet.)`, attr: 0 }], { blocking: true });
  }

  // ---------------------------------------------------------------- map
  shim_print_glyph(win, x, y, giPtr, bkPtr) {
    if (win !== this.mapWin) return;
    const gi = readGlyphInfo(this.mod, giPtr);
    const bk = readGlyphInfo(this.mod, bkPtr);
    if (!gi) return;
    if (gi.flags & MG.HERO) { this.hero.x = x; this.hero.y = y; this.renderer.setHero(x, y); }
    this.renderer.setCell(x, y, gi, bk);
  }

  // ---------------------------------------------------------------- menus
  shim_start_menu(win) {
    const w = this.windows.get(win);
    if (w) w.menu = { items: [], prompt: '' };
  }

  shim_add_menu(win, giPtr, ident, ch, gch, attr, clr, str, itemflags) {
    const w = this.windows.get(win);
    if (!w || !w.menu) return;
    const gi = readGlyphInfo(this.mod, giPtr);
    w.menu.items.push({
      ident, ch: ch & 0xff, gch: gch & 0xff, attr, clr, text: str || '',
      glyph: gi && gi.glyph >= 0 && gi.glyph < this.tiles.glyphs ? gi.glyph : -1,
      selected: !!(itemflags & 1), header: ident === 0,
    });
  }

  shim_end_menu(win, prompt) {
    const w = this.windows.get(win);
    if (w && w.menu) w.menu.prompt = prompt || '';
  }

  async shim_select_menu(win, how, listPtr) {
    const w = this.windows.get(win);
    this.renderer.commit();
    if (!w || !w.menu) { this.mod.setValue(listPtr, 0, '*'); return how === PICK.NONE ? 0 : -1; }
    // "What do you want to drop? [abc or ?*]" then "?" lists the items: the list belongs to that question
    if (!w.menu.prompt && /\bor \?\*?\]\s*$/.test(this.lastQuery || '')) w.menu.context = this.lastQuery;
    this.lastQuery = '';
    const result = await this.ui.menu(w.menu, how);
    this.messagesSinceInput = 0;
    // equipping from the inventory's "Do what with ...?" menu: show the inventory again afterwards
    if (result && result.length && /^Do what with /.test(w.menu.prompt || '')) {
      const chosen = w.menu.items.find((it) => it.ident === result[0].ident);
      if (chosen && /^(wield|wear|put|take off|remove this|quiver)\b/i.test(chosen.text)) this.ui.reopenInventory = true;
    }
    if (result === null) { this.mod.setValue(listPtr, 0, '*'); return -1; }
    return writeMenuSelection(this.mod, listPtr, result);
  }

  async shim_message_menu(let_, how, mesg) {
    this.ui.message(mesg, 0);
    const k = await this.ui.yn(mesg, null, let_ & 0xff);
    return k;
  }

  // ---------------------------------------------------------------- prompts
  async shim_yn_function(query, resp, def) {
    this.renderer.commit();
    this.lastQuery = query || '';   // "What do you want to drop? [abc or ?*]": the item list that may follow belongs to it
    if (this.autoSaving) return /save/i.test(query || '') ? 121 : 27;   // closing the app: "Really save?" yes, anything else no
    const k = await this.ui.yn(query || '', resp || null, def & 0xff);
    this.messagesSinceInput = 0;
    return k;
  }

  async shim_getlin(query, bufPtr) {
    this.renderer.commit();
    const s = await this.ui.getline(query || '');
    this.messagesSinceInput = 0;
    this.mod.stringToUTF8(s === null ? '\x1b' : s.slice(0, 250), bufPtr, 256);
  }

  async shim_get_ext_cmd() {
    if (!this.extcmds) this.extcmds = readExtCommands(this.mod);
    const idx = await this.ui.extCommand(this.extcmds);
    this.messagesSinceInput = 0;
    return idx;
  }

  async shim_doprev_message() { await this.ui.history(); return 0; }

  // ---------------------------------------------------------------- input
  async shim_nhgetch() {
    this.renderer.commit();
    const ev = await this.ui.waitInput({ allowClick: false });
    this.messagesSinceInput = 0;
    return ev.key;
  }

  async shim_nh_poskey(xp, yp, modp) {
    this.renderer.commit();
    this.lastQuery = '';   // back at the command prompt
    if (!this.ui.keyQueue.length) {
      this.ui.answers = [];   // pre-answered questions belong to the command just typed
      if (this.ui.reopenInventory) { this.ui.reopenInventory = false; this.ui.pushKey(105); }   // 'i'
    }
    const s = this.engineState();   // picking a spot starts with the cursor on the hero: say so right away
    if (s.picking !== null) {
      if (s.picking && !this.renderer.cursor) this.renderer.cursor = { ...(this.cursorAt || { x: s.x, y: s.y }) };
      if (!s.picking) this.renderer.cursor = null;
      this.ui.targeting(s.picking);
    }
    const ev = await this.ui.waitInput({ allowClick: true });
    this.messagesSinceInput = 0;
    if (ev.click) {
      this.mod.setValue(xp, ev.click.x, 'i16');
      this.mod.setValue(yp, ev.click.y, 'i16');
      this.mod.setValue(modp, ev.click.button, 'i32');
      return 0;
    }
    return ev.key;
  }

  // ---------------------------------------------------------------- status
  shim_status_update(fld, ptr, chg, percent, color) {
    if (fld === BL.FLUSH) { this.ui.status(this.status, this.conditions); return; }
    if (fld === BL.RESET) { this.ui.status(this.status, this.conditions); return; }
    if (fld === BL.CONDITION) {
      this.conditions = ptr ? (this.mod.HEAP32[ptr >> 2] >>> 0) : 0;
      return;
    }
    if (fld < 0 || fld > BL.VERS) return;
    const val = ptr ? this.mod.UTF8ToString(ptr) : '';
    this.status[fld] = { val: val.trim(), percent, color };
    if (fld === BL.LEVELDESC && val !== this.lastLevel) {
      if (this.lastLevel !== null) this.renderer.newLevel(val.trim());
      this.lastLevel = val;
    }
    if (fld === BL.HP && this.lastHp !== undefined) {
      const hp = parseInt(val, 10);
      if (hp < this.lastHp) this.renderer.heroHurt(this.lastHp - hp);
      this.lastHp = hp;
    } else if (fld === BL.HP) this.lastHp = parseInt(val, 10);
  }
}

export function badConditions(mask) { return (mask & BAD_CONDITIONS) !== 0; }
