// Hero action animations: what the hero visibly does with their gear. Weapon swings and thrusts,
// wands raised and charged before the beam, spell casting circles, thrown and fired objects
// flying smoothly between cells, monster claw/bite marks, and small feedback for quaffing,
// eating, reading, wearing, wielding and picking things up. Mixed into Renderer (render.js).
//
// Everything here is purely visual. It's driven by the window port's hooks (game.js):
//   onCommand(key)        a command key reached NetHack
//   onAsk(query)          NetHack asks a question (a direction: start aiming)
//   onAnswer(query, key)  ...and got this answer (an item letter, a direction). After a direction
//                         for a zap or spell it returns how many ms NetHack should wait while
//                         the wand/hands charge, so the effect follows the wind-up (0 otherwise).
//   onMenuPick(menu, its) a menu choice (the spell to cast; items picked from a "?" list)
//   onDelay()             delay_output(): one step of a flying object or beam (returns 0)
//   setEquipment / setInventory   what the hero carries, kept current
// plus actionMessage(), called first from Renderer.onMessage.
import { COLNO, MG } from './game.js';

const T = 24, C = T / 2, TAU = Math.PI * 2;
const ease = (t) => 1 - (1 - t) * (1 - t);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const hexrgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k | 0, a[1] + (b[1] - a[1]) * k | 0, a[2] + (b[2] - a[2]) * k | 0];
const lerpAng = (a, b, k) => { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * k; };
const WHITE = [255, 255, 255];

// object types by index (objects.h order; see the names in assets/tiles.json)
const OBJ = {
  missile: (o) => o >= 18 && o <= 24,     // arrows, crossbow bolts, darts
  spinner: (o) => o === 25 || o === 26,   // shuriken, boomerang
  spear: (o) => o >= 27 && o <= 33,
  blade: (o) => o >= 34 && o <= 43,       // daggers and knives
  polearm: (o) => o >= 59 && o <= 72,     // polearms and the lance
  bow: (o) => o >= 83 && o <= 86, sling: (o) => o === 87, crossbow: (o) => o === 88,
  launcher: (o) => o >= 83 && o <= 88,
  potion: (o) => o >= 297 && o <= 322, scroll: (o) => o >= 323 && o <= 365, book: (o) => o >= 366 && o <= 409,
  wand: (o) => o >= 410 && o <= 437, stone: (o) => o >= 439 && o <= 475, venom: (o) => o === 479 || o === 480,
};
const GOLD = 438;
const ARROW_SHAFT = { 18: '#9a6a3a', 19: '#d0b070', 20: '#6a4a2a', 21: '#d8dce8', 22: '#c8b070', 23: '#7a6650', 24: '#8a8a9a' };

const tbl = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hexrgb(v)]));
const WAND_COL = tbl({ light: '#fff2b0', 'secret door detection': '#bcd4ff', enlightenment: '#ffe08a', 'create monster': '#d08aff', wishing: '#ffd84a',
  nothing: '#d8d8e0', striking: '#ffcf70', 'make invisible': '#b8c0ff', 'slow monster': '#8ab8a0', 'speed monster': '#7affc8', 'undead turning': '#fff0c0',
  polymorph: '#ff7ae0', cancellation: '#a0a0ff', teleportation: '#c07aff', opening: '#ffe08a', locking: '#c0a070', probing: '#7ad0ff', digging: '#d0a060',
  'magic missile': '#7ab8ff', fire: '#ff8a30', cold: '#bfe8ff', sleep: '#b08aff', death: '#9cff7a', lightning: '#fff8a0' });
const ZAP_COL = tbl({ missile: '#7ab8ff', fire: '#ff8a30', frost: '#bfe8ff', sleep: '#b08aff', death: '#9cff7a', lightning: '#fff8a0', poison: '#c8e040', acid: '#80ff60' });
const EXPL_COL = tbl({ dark: '#9a6aff', noxious: '#a8d040', muddy: '#b08850', wet: '#70a8ff', magical: '#c08aff', fiery: '#ff8a30', frosty: '#bfe8ff' });
const SCHOOL_COL = tbl({ attack: '#ff5040', healing: '#60e070', divination: '#60a0ff', enchantment: '#ff80d0', clerical: '#ffd050', escape: '#f0f4ff', matter: '#c08850' });
const ARCANE = hexrgb('#c8b8ff');
const DIRKEY = { h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1], '.': [0, 0], s: [0, 0], '<': [0, 0], '>': [0, 0] };
const FACING = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // actor.dir: S E N W

export const HERO_ANIM = {
  initActions() {
    this.equipment = {}; this.inventory = [];
    this.pose = null;          // what the hero is doing with their hands right now
    this.afx = [];             // timed marks: slashes, sparks, rings, item pops...
    this.alights = [];         // coloured light flashes
    this.flights = [];         // projectiles being drawn
    this.flight = null;        // the one NetHack is moving right now
    this.stepSets = new Map(); // cells NetHack drew since the last delay_output
    this.missileCells = new Set();   // cells whose object is really a projectile passing through
    this.iconCache = new Map();
    this.pendingAct = null; this.pendingPick = null; this.heroThrow = null;
    this.lastCmd = { key: 0, t: -1e9 }; this.swingSide = 1;
  },

  setEquipment(eq) { this.equipment = eq || {}; },
  // For gear overlays: which hands an animation is using right now (draw no idle weapon/shield there).
  heroHandsBusy(t = this.clock()) {
    const p = this.pose;
    if (!p || t < p.t0 || (p.end && t > p.end)) return { main: false, off: false };
    const main = /^(swing|thrust|bow|wield|throw|wand|quaff|eat|read|snap)$/.test(p.kind) || (p.kind === 'jab');
    return { main, off: p.kind === 'bow' || p.kind === 'cast' || p.kind === 'snap', kind: p.kind };
  },
  setInventory(items) { this.inventory = items || []; },
  reduced() { return !!this.settings.reduceMotion; },
  noHold() { return this.settings.reduceMotion || this.settings.animSpeed === 'instant' || (this.settings.graphics === 'official' && this.officialImg); },

  // ------------------------------------------------------------------ icons
  objType(g) { return g >= 0 && g < this.tiles.glyphs ? this.tiles.gobj[g] : -1; },
  // an item's 18px icon (from the item atlas, or a corpse) and its dominant colour
  icon(g) {
    if (g === undefined || g === null || g < 0 || !this.items) return null;
    const it = this.itemOf(g);
    if (!it) return null;
    const key = it.corpse !== undefined ? 'c' + it.corpse : it.cell;
    let e = this.iconCache.get(key);
    if (e) return e;
    const n = 18, c = document.createElement('canvas'); c.width = n; c.height = n;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    if (it.corpse !== undefined) {
      const cc = this.corpseCanvas(it.corpse, T);
      if (!cc) return null;
      x.drawImage(cc, 0, 0, T, T, 0, 0, n, n);
    } else {
      const cols = this.items.cols;
      x.drawImage(this.items.img18, (it.cell % cols) * n, Math.floor(it.cell / cols) * n, n, n, 0, 0, n, n);
    }
    const d = x.getImageData(0, 0, n, n).data;
    let r = 0, gg = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const wt = 0.2 + (mx - mn) / 255 * 2 + mx / 255;    // favour bright, saturated pixels
      r += d[i] * wt; gg += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
    }
    let rgb = w ? [r / w, gg / w, b / w] : [200, 200, 210];
    const mx = Math.max(...rgb, 1);
    rgb = rgb.map((v) => Math.min(255, Math.round(v * 235 / mx)));   // as bright as it can be
    e = { c, rgb };
    this.iconCache.set(key, e);
    return e;
  },
  // draw an icon rotated so that its blade/tip (drawn pointing up-right in the atlas) points at `ang`,
  // with the point (gx, gy) of the icon (0..1) at (x, y); `upright` icons are just turned by `ang`
  drawIconRot(ctx, ic, x, y, ang, gx, gy, s = 1, alpha = 1, upright = false) {
    if (!ic || alpha <= 0) return;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(upright ? ang : ang + Math.PI / 4);
    if (s !== 1) ctx.scale(s, s);
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ic.c, Math.round(-gx * 18), Math.round(-gy * 18));
    ctx.restore();
  },
  itemByLetter(code) { return (this.inventory || []).find((it) => !it.header && it.ident !== 0 && it.ch === code) || null; },
  launcherFor(ammoGlyph) {
    const main = this.equipment.main; if (!main) return null;
    const lo = this.objType(main.glyph), ao = this.objType(ammoGlyph);
    if ((OBJ.bow(lo) && ao >= 18 && ao <= 22) || (OBJ.crossbow(lo) && ao === 23) || (OBJ.sling(lo) && OBJ.stone(ao))) return main.glyph;
    return null;
  },
  wandColour(text) {
    const m = (text || '').match(/wand of ([a-z ]+?)(?:\s*\(|\s+named|\s+called|$)/);
    return (m && WAND_COL[m[1].trim()]) || ARCANE;
  },
  // the colour of the beam or explosion NetHack is drawing, if any
  beamColour() {
    for (let i = 0; i < this.glyph.length; i++) {
      const g = this.glyph[i];
      if (g < 0) continue;
      const c = this.cls[g];
      if (c === 'zap') { const w = this.tiles.gname[g].split(' ')[1]; return ZAP_COL[w] || ARCANE; }
      if (c === 'explosion') { const w = this.tiles.gname[g].split(' ')[1]; return EXPL_COL[w] || ARCANE; }
    }
    return null;
  },
  heroCenter(a, t) {
    const hero = a || this.heroActor();
    if (!hero) return { x: this.heroCell.x * T + C, y: this.heroCell.y * T + C };
    return { x: this.offsetX(hero, t) + C, y: this.offsetY(hero, t) + C };
  },

  // ------------------------------------------------------------------ input hooks
  onCommand(key) {
    this.lastCmd = { key, t: this.clock() };
    this.stepSets.clear();   // only what's drawn after this input can be a flight
    this.pendingAct = null; this.pendingPick = null;
    if (this.pose && this.pose.waiting) this.pose = null;
  },

  onAsk(query) {
    this.stepSets.clear();
    if (!/direction/i.test(query)) return;
    const t = this.clock();
    let act = this.pendingAct;
    // f with a filled quiver goes straight to the direction
    if (!act && this.lastCmd.key === 102 && t - this.lastCmd.t < 4000 && this.equipment.quiver) {
      act = this.pendingAct = { kind: 'throw', glyph: this.equipment.quiver.glyph, t };
    }
    if (!act) return;
    act.asked = true;
    if (act.kind === 'throw') this.startThrowPose(act, t, true);
    else if (this.pose && this.pose.act === act) this.pose.waiting = true;
  },

  onAnswer(query, k) {
    const t = this.clock();
    this.stepSets.clear();
    if (/direction/i.test(query)) return this.answerDirection(k, t);   // ms for NetHack to wait while the zap charges
    const m = query.match(/^What do you want to (zap|throw|fire|drink|eat|read|wear|put on|wield|write with|use or apply)\?/i);
    if (m) {
      const verb = m[1].toLowerCase();
      if (k === 63 || k === 42) { this.pendingPick = { verb, t }; return; }   // "?" or "*": the item comes from a menu
      const it = this.itemByLetter(k);
      this.pendingPick = null;   // (the item picker reports its pick here, before onMenuPick)
      if (it) this.itemAction(verb, it, t);
      return;
    }
    if (/really sure you want to break/i.test(query)) {
      if (k === 121 && this.pendingAct?.kind === 'break') this.breakWand(this.pendingAct, t);
      this.pendingAct = null;
      return;
    }
    if (/; eat it\?|; eat one\?/i.test(query) && k === 121) {   // a corpse on the floor
      const h = this.heroCell, g = this.objMem[this.idx(h.x, h.y)];
      this.startPose({ kind: 'eat', t0: t, dur: 720, ic: this.icon(g) });
    }
  },

  onMenuPick(menu, items) {
    if (!items || !items.length) return;
    const t = this.clock();
    if (/cast/i.test(menu.prompt || '')) { this.castSpell(items[0].text || '', t); return; }
    const p = this.pendingPick;
    if (p && t - p.t < 60000) { this.pendingPick = null; this.itemAction(p.verb, items[0], t); }
  },

  itemAction(verb, it, t) {
    const g = it.glyph, o = this.objType(g), ic = this.icon(g);
    switch (verb) {
      case 'zap': {
        const act = this.pendingAct = { kind: 'zap', glyph: g, t };
        this.startPose({ kind: 'wand', t0: t, ic, col: this.wandColour(it.text), act, waiting: true });
        this.releaseIfNoDirection(act);
        break;
      }
      case 'throw': case 'fire': this.pendingAct = { kind: 'throw', glyph: g, t }; break;
      case 'drink': this.startPose({ kind: 'quaff', t0: t, dur: 680, ic, col: ic?.rgb }); break;
      case 'eat': this.startPose({ kind: 'eat', t0: t, dur: 720, ic, col: ic?.rgb }); break;
      case 'read': if (OBJ.scroll(o) || OBJ.book(o)) this.startPose({ kind: 'read', t0: t, dur: 680, ic }); break;
      case 'wear': case 'put on': this.startPose({ kind: 'wear', t0: t, dur: 560, ic, col: ic?.rgb }); break;
      case 'wield': if (ic) this.startPose({ kind: 'wield', t0: t, dur: 460, ic, col: ic.rgb }); break;
      case 'write with':
        if (OBJ.wand(o)) {
          const act = { kind: 'engrave', glyph: g, t };
          this.startPose({ kind: 'wand', t0: t, ic, col: this.wandColour(it.text), act });
          this.release(act, { dx: 0, dy: 0, down: true }, t, 160);
        }
        break;
      case 'use or apply': if (OBJ.wand(o)) this.pendingAct = { kind: 'break', glyph: g, ic, col: this.wandColour(it.text), t }; break;
    }
  },

  // nodir wands and spells never ask a direction: release them as soon as it's clear none is coming
  releaseIfNoDirection(act) {
    setTimeout(() => { if (this.pendingAct === act && !act.asked) this.release(act, null, this.clock()); }, 30);
  },

  castSpell(text, t) {
    const school = (text.match(/\b(attack|healing|divination|enchantment|clerical|escape|matter)\b/i) || [])[1];
    const act = this.pendingAct = { kind: 'cast', t };
    this.startPose({ kind: 'cast', t0: t, col: (school && SCHOOL_COL[school.toLowerCase()]) || ARCANE, act, waiting: true });
    this.releaseIfNoDirection(act);
  },

  answerDirection(k, t) {
    const act = this.pendingAct;
    if (!act) return;
    const ch = String.fromCharCode(k);
    const d = DIRKEY[ch] || DIRKEY[ch.toLowerCase()];
    if (k === 27 || !d) { this.pendingAct = null; if (this.pose && this.pose.act === act) this.pose = null; return 0; }
    return this.release(act, { dx: d[0], dy: d[1], down: ch === '>' || ch === '.' || ch === 's', up: ch === '<' }, t);
  },

  release(act, dir, t, wind) {
    if (this.pendingAct === act) this.pendingAct = null;
    const hero = this.heroActor();
    if (dir && hero && (dir.dx || dir.dy)) this.setDir(hero, dir.dx, dir.dy, t);
    if (act.kind === 'throw') {
      if (!dir || (!dir.dx && !dir.dy)) return;
      this.heroThrow = { glyph: act.glyph, dx: dir.dx, dy: dir.dy, t };
      this.startThrowPose(act, t, false, dir);
      return 0;
    }
    const p = this.pose;
    if (!p || p.act !== act) return 0;
    p.waiting = false; p.relT = t; p.dir = dir;
    // charge a moment before the effect: the caller (a direction answer) has NetHack wait that long
    if (wind === undefined) wind = this.noHold() ? 0 : Math.max(130, Math.min(220, p.t0 + 260 - t));
    p.flashT = t + Math.max(40, wind);
    p.end = p.flashT + (p.kind === 'cast' ? 420 : 380);
    return act.kind === 'engrave' ? 0 : wind;
  },

  startPose(p) {
    p.side = p.side || 1;
    if (!p.end && p.dur) p.end = p.t0 + p.dur;
    this.pose = p;
    return p;
  },

  startThrowPose(act, t, waiting, dir) {
    const bow = this.launcherFor(act.glyph);
    const p = this.pose && this.pose.act === act ? this.pose : this.startPose({ kind: bow !== null ? 'bow' : 'throw', t0: t, act, ic: this.icon(bow !== null ? bow : act.glyph), ammo: act.glyph });
    p.waiting = waiting;
    if (!waiting) { p.relT = t; p.dir = dir; p.end = t + (p.kind === 'bow' ? 320 : 260); }
  },

  breakWand(act, t) {
    const c = this.heroCenter(null, t);
    this.startPose({ kind: 'snap', t0: t, dur: 260, ic: act.ic, col: act.col });
    setTimeout(() => {
      const tt = this.clock();
      this.afx.push({ type: 'ring', x: c.x, y: c.y - 6, t0: tt, dur: 260, col: act.col, r: 26 });
      this.alights.push({ x: c.x, y: c.y, r: 110, rgb: act.col, k: 1.1, t0: tt, dur: 300 });
      this.burst(c.x, c.y - 4, 22, 'magic', { col: [rgba(act.col, 1), '#ffffff'], speed: 90, up: 40, life: 0.6 });
      this.addShake(0.8);
    }, 200);
  },

  // ------------------------------------------------------------------ messages
  // Returns true if the message was fully handled here.
  actionMessage(s, t) {
    let m;
    const recentFlight = this.flight && (!this.flight.ended || t - this.flight.endT < 600) ? this.flight : null;
    const heroThrew = this.heroThrow && t - this.heroThrow.t < 900 ? this.heroThrow : null;
    // a missile reaching someone: NetHack never draws it on the target's own cell
    if ((m = s.match(/^You are hit by (.+?)[.!]$/)) || (m = s.match(/^(?:The |Your |An? )?(.+?) (hits|misses) you[.!]$/))) {
      if (recentFlight || /arrow|dagger|dart|knife|bolt|spear|shuriken|star|rock|stone|potion|venom|boulder|javelin|missile/i.test(m[1])) {
        const hero = this.heroActor();
        if (hero && recentFlight) this.flightImpact(recentFlight, hero, m[2] !== 'misses', t);
        if (hero && m[2] !== 'misses') this.markHit(hero.x * T + C, hero.y * T + C - 4, 'pierce', recentFlight ? this.flightAngle(recentFlight) : Math.PI / 2, t + 30, [255, 80, 70]);
        return true;
      }
    }
    if ((recentFlight || heroThrew) && (m = s.match(/^(?:The |Your |An? |\d+ )?(.+?) (hits|misses) (?:the |your |an? )?(.+?)[.!]$/)) && !/^you$/i.test(m[3]) && !this.isMonsterName(m[1].toLowerCase())) {
      const target = this.findNamed(m[3].toLowerCase(), recentFlight);
      if (target) {
        let f = recentFlight;
        if (!f && heroThrew) f = this.syntheticFlight(heroThrew, target, t);
        if (f) this.flightImpact(f, target, m[2] === 'hits', t);
      }
      return true;
    }
    // a thrown potion breaking on someone, or against a wall
    if ((recentFlight || heroThrew) && (m = s.match(/crashes on (?:the |your )?(.+?)'s head/))) {
      const target = this.findNamed(m[1].toLowerCase(), recentFlight);
      const f = recentFlight || (target && this.syntheticFlight(heroThrew, target, t));
      if (f && target) this.flightImpact(f, target, true, t);
      return false;
    }
    if (recentFlight && OBJ.potion(recentFlight.o) && /shatters!|breaks into shards/.test(s) && !recentFlight.impact) {
      recentFlight.impact = { hit: true };
      if (!recentFlight.ended) { recentFlight.ended = true; recentFlight.endT = t; }
      return false;
    }
    // a missile (or something thrown) killed or hit a monster further away
    if ((recentFlight || heroThrew) && (m = s.match(/^You (kill|destroy|hit) (?:the |your |an? )?(.+?)[!.]$/))) {
      const target = this.findNamed(m[2].toLowerCase(), recentFlight);
      const h = this.heroCell;
      if (target && Math.max(Math.abs(target.x - h.x), Math.abs(target.y - h.y)) > 1) {
        const f = recentFlight || this.syntheticFlight(heroThrew, target, t);
        if (f) this.flightImpact(f, target, true, t);
        target.hurtT = t + 60; target.hurtCol = 'white';
        if (m[1] !== 'hit') this.pendingKills.push({ actor: target, t });
        return true;
      }
    }
    // picked something up (by , or by walking onto it with autopickup; a wish lands the same way)
    const ck = String.fromCharCode(this.lastCmd.key);
    const pickCmd = t - this.lastCmd.t < 5000 && (/^[,hjklyubnHJKLYUBN]$/.test(ck) || this.lastCmd.key === 0 || this.lastCmd.key === 23 || (this.lastCmd.key >= 1 && this.lastCmd.key <= 26 && /[hjklyubn]/.test(String.fromCharCode(this.lastCmd.key + 96))));
    if (pickCmd && (m = s.match(/^([a-zA-Z$]) - (.+?)\.?$/)) && !/\((weapon|wielded|in quiver|being worn|alternate|on (left|right))/.test(s)) {
      const code = m[1].charCodeAt(0), delay = 30 + (this.popQueue = ((this.popQueue || 0) + 1)) * 70;
      setTimeout(() => {
        this.popQueue = Math.max(0, (this.popQueue || 1) - 1);
        const it = code === 36 ? null : this.itemByLetter(code);
        const g = it ? it.glyph : code === 36 ? this.objGlyph[0].get(GOLD) : -1;
        this.popItem(g);
      }, delay);
      return false;
    }
    if (/^You don't have enough energy|^You fail to cast the spell correctly|^You are too hungry to cast|^Your concentration falters/.test(s)) {
      if (this.pose && this.pose.kind === 'cast') { this.pose.fizzle = true; this.pose.end = Math.min(this.pose.end || 1e12, t + 260); this.pose.flashT = 1e12; }
      return false;
    }
    return false;
  },

  // "The kitten misses the jackal." is a monster fighting, not a missile
  isMonsterName(name) {
    for (const a of this.actors.values()) if (!a.hero && (this.monsterName(a) === name || name.endsWith(' ' + this.monsterName(a)))) return true;
    return false;
  },

  findNamed(name, f) {
    let best = null, bd = 1e9;
    const ref = f && f.pts.length ? f.pts[f.pts.length - 1] : this.heroCell;
    for (const a of this.actors.values()) {
      if (a.hero) continue;
      const nm = this.monsterName(a);
      if (!(nm === name || name.endsWith(nm) || name === 'it')) continue;
      const d = Math.max(Math.abs(a.x - ref.x), Math.abs(a.y - ref.y));
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  },

  // ------------------------------------------------------------------ melee
  // The hero attacks `target`: draw the wielded weapon swinging (or thrusting, or a fist jab).
  // Returns false when no hand is involved (kicks, bites...), so the generic swipe arc is used.
  meleeSwing(hero, target, verb, t) {
    if (/^(kick|bite|butt|sting|touch)$/.test(verb)) return false;
    // "You kill the jackal!" right after throwing at it: the thrown object did that, not a swing
    const ht = this.heroThrow && t - this.heroThrow.t < 900 ? this.heroThrow : null;
    if (ht) {
      const f = this.flight && (!this.flight.ended || t - this.flight.endT < 600) ? this.flight : this.syntheticFlight(ht, target, t);
      if (f) this.flightImpact(f, target, verb !== 'miss', t);
      return true;
    }
    const dx = Math.sign(target.x - hero.x), dy = Math.sign(target.y - hero.y);
    const th = Math.atan2(dy * 0.85, dx);
    const main = this.equipment.main, g = main ? main.glyph : -1, o = this.objType(g);
    const ic = g >= 0 ? this.icon(g) : null;
    const kind = !ic ? 'jab' : OBJ.spear(o) || OBJ.polearm(o) ? 'thrust' : 'swing';
    // sideways targets get an overhead chop; up/down targets alternate forehand and backhand
    this.swingSide = Math.abs(Math.cos(th)) > 0.3 ? (Math.sin(th - 1.6) < Math.sin(th + 1.6) ? 1 : -1) : -this.swingSide;
    const dur = kind === 'thrust' ? 250 : kind === 'jab' ? 200 : 240;
    this.startPose({ kind, t0: t, dur, ang: th, side: this.swingSide, ic, col: ic ? mix(ic.rgb, WHITE, 0.25) : [255, 226, 190] });
    const hit = verb !== 'miss', kill = verb === 'kill' || verb === 'destroy';
    if (hit) {
      const impact = kind === 'thrust' ? 105 : kind === 'jab' ? 85 : 100;
      const ix = target.x * T + C, iy = target.y * T + C - 3;
      const col = ic ? mix(ic.rgb, WHITE, 0.55) : [255, 236, 200];
      if (kind === 'swing') this.markHit(ix, iy, 'slash', th + this.swingSide * (Math.PI / 2 - 0.5), t + impact, col, kill ? 26 : 20);
      else this.markHit(ix - Math.cos(th) * 3, iy - Math.sin(th) * 3, kind === 'jab' ? 'pow' : 'pierce', th, t + impact, col, kill ? 14 : 10);
      this.hitStop(impact + 25, kill ? 90 : 45);   // freeze just after the blow lands, on the spark
      const x0 = this.heroCenter(hero, t);
      this.alights.push({ x: ix, y: iy, r: 54, rgb: col, k: 0.75, t0: t + impact, dur: 140 });
      if (!this.reduced()) setTimeout(() => this.burst(ix, iy, 8, 'spark', { dir: Math.atan2(iy - x0.y, ix - x0.x), spread: 1.4, speed: 110, up: 20, life: 0.3, z: 9, col: ['#ffffff', rgba(col, 1), '#ffe08a'] }), impact);
    }
    return true;
  },

  // a monster struck the hero: claw rakes, bite marks or a hit
  monsterHitMark(hero, verb, dx, dy, t) {
    const x = hero.x * T + C, y = hero.y * T + C - 5, ang = Math.atan2(dy, dx);
    const kind = /bites/.test(verb) ? 'bite' : /claws|scratches|lashes/.test(verb) ? 'claw' : /stings|thrusts/.test(verb) ? 'pierce' : 'slash';
    this.markHit(x, y, kind, kind === 'slash' || kind === 'claw' ? ang + Math.PI / 2 - 0.6 : ang, t, [255, 90, 70], kind === 'pierce' ? 9 : 16);
  },

  markHit(x, y, type, ang, t0, col, size = 16) {
    this.afx.push({ type, x, y, ang, t0, dur: type === 'bite' ? 260 : 200, col, size });
  },

  // ------------------------------------------------------------------ item pops
  popItem(g) {
    const ic = this.icon(g), t = this.clock(), h = this.heroCell;
    if (!ic) return;
    this.afx.push({ type: 'pop', ic, x: h.x * T + C, y: h.y * T + C, t0: t, dur: 420 });
  },

  // ------------------------------------------------------------------ thrown objects
  // Called at every delay_output(). NetHack moves a thrown object by drawing its glyph one cell
  // further each step (and restoring the cell behind it): find that, and draw a projectile instead.
  onDelay() {
    const t = this.clock();
    this.trackFlight(t);
    // the zap's beam is showing: the wand's glow takes its colour (unidentified wands start neutral)
    const p = this.pose;
    if (p && (p.kind === 'wand' || p.kind === 'cast') && p.relT !== undefined && !p.beam && t - p.relT < 1500) {
      const beam = this.beamColour();
      if (beam) { p.col = beam; p.beam = true; }
    }
    return 0;
  },

  trackFlight(t) {
    const sets = this.stepSets; this.stepSets = new Map();
    const objs = [];
    // objects that just appeared somewhere they weren't remembered (not floor items being redrawn)
    for (const [i, { g, prev }] of sets) {
      if (g >= 0 && g !== prev && this.cls[g] === 'obj' && this.glyph[i] === g && !(this.gflags[i] & MG.HERO)) objs.push({ i, x: i % COLNO, y: Math.floor(i / COLNO), g });
    }
    const f = this.flight;
    if (f && !f.ended) {
      const last = f.pts[f.pts.length - 1];
      const nxt = objs.find((c) => c.g === f.g && Math.max(Math.abs(c.x - last.x), Math.abs(c.y - last.y)) === 1);
      if (nxt) {
        f.pts.push({ x: nxt.x, y: nxt.y, t });
        if (f.pts.length >= 2) f.step = Math.max(16, Math.min(90, (t - f.pts[0].t) / (f.pts.length - 1)));
        this.missileCells.add(nxt.i); this.markDirty(nxt.x, nxt.y);
        this.resolveOrigin(f, t);
        return;
      }
      this.endFlight(f, t);
    }
    if (!objs.length) return;
    const h = this.heroCell, ht = this.heroThrow && t - this.heroThrow.t < 2500 ? this.heroThrow : null;
    const fromHero = ht ? objs.find((c) => c.x === h.x + ht.dx && c.y === h.y + ht.dy) : null;
    const pick = fromHero || (objs.length === 1 ? objs[0] : null);
    if (!pick) return;
    const nf = { g: pick.g, o: this.objType(pick.g), ic: this.icon(pick.g), pts: [{ x: pick.x, y: pick.y, t }], t0: t, step: (this.settings.fastMissiles ? 18 : 40) + 8, ended: false, origin: null };
    if (fromHero) {
      nf.origin = { x: h.x, y: h.y, hero: true }; nf.hero = true;
      this.heroThrew(nf, t);
    }
    this.flight = nf; this.flights.push(nf);
    this.missileCells.add(pick.i); this.markDirty(pick.x, pick.y);
  },

  heroThrew(f, t) {
    const p = this.pose;
    if (p && (p.kind === 'bow' || p.kind === 'throw') && p.relT !== undefined) {
      if (t - p.relT > 120) { p.relT = t; p.end = t + 300; }   // the next of several shots
    } else {
      const ht = this.heroThrow;
      this.startThrowPose({ kind: 'throw', glyph: f.g, t }, t, false, ht ? { dx: ht.dx, dy: ht.dy } : null);
    }
  },

  resolveOrigin(f, t) {
    if (f.origin || f.pts.length < 2) return;
    const [p0, p1] = f.pts;
    const ox = p0.x - (p1.x - p0.x), oy = p0.y - (p1.y - p0.y);
    f.origin = { x: ox, y: oy };
    for (const a of this.actors.values()) {   // a monster threw/shot/spat it
      if (a.x === ox && a.y === oy && !a.hero) { a.atkT = t; this.setDir(a, p1.x - p0.x, p1.y - p0.y, t); a.lunge = { dx: p1.x - p0.x, dy: p1.y - p0.y, t0: t }; }
    }
  },

  endFlight(f, t) {
    if (f.ended) return;
    f.ended = true; f.endT = t;
    if (!f.origin) {   // a single step: it came from whoever is next to it
      const p = f.pts[0];
      let src = null;
      for (const a of this.actors.values()) if (Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) === 1 && (!src || a.hero)) src = a;
      f.origin = src ? { x: src.x, y: src.y, hero: src.hero } : { x: p.x, y: p.y };
    }
    for (const i of this.missileCells) this.markDirty(i % COLNO, Math.floor(i / COLNO));
    this.missileCells.clear();
  },

  // the hero threw at a monster right next to them: NetHack shows no flight at all
  syntheticFlight(ht, target, t) {
    const h = this.heroCell;
    const f = { g: ht.glyph, o: this.objType(ht.glyph), ic: this.icon(ht.glyph), pts: [], t0: t, step: 60, ended: true, endT: t, origin: { x: h.x, y: h.y, hero: true }, hero: true };
    if (!f.ic && !OBJ.missile(f.o)) return null;
    this.flights.push(f); this.flight = f;
    this.heroThrew(f, t);
    return f;
  },

  flightImpact(f, target, hit, t) {
    const last = f.pts[f.pts.length - 1];
    if (!last || last.x !== target.x || last.y !== target.y) f.pts.push({ x: target.x, y: target.y, t, extra: true });
    f.impact = { hit, idx: f.pts.length };
    if (!f.ended) { f.ended = true; f.endT = t; }
  },

  flightAngle(f) {
    const P = this.flightPath(f), n = P.length;
    if (n < 2) return 0;
    return Math.atan2(P[n - 1].y - P[n - 2].y, P[n - 1].x - P[n - 2].x);
  },
  flightPath(f) {
    const P = [];
    if (f.origin) P.push({ x: f.origin.x * T + C, y: f.origin.y * T + C, z: 13 });
    for (const p of f.pts) P.push({ x: p.x * T + C, y: p.y * T + C, z: 9 });
    return P;
  },
  // where a projectile is drawn: one step behind NetHack, gliding between cells
  flightPos(f, t) {
    const P = this.flightPath(f), n = P.length - 1;
    if (n < 0) return null;
    const v = Math.max(0, (t - f.t0) / f.step);
    const i = Math.min(n, Math.floor(v)), k = Math.min(1, v - i);
    const a = P[i], b = P[Math.min(n, i + 1)];
    const j = Math.max(1, Math.min(n, i + 1));
    const ang = n >= 1 ? Math.atan2(P[j].y - P[j - 1].y, P[j].x - P[j - 1].x) : 0;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, ang, v, n, done: v >= n };
  },

  drawMissiles(t) {
    const ctx = this.sctx;
    const f0 = this.flight;
    if (f0 && !f0.ended && f0.pts.length && t - f0.pts[f0.pts.length - 1].t > Math.max(160, f0.step * 3)) this.endFlight(f0, t);
    this.flights = this.flights.filter((f) => !(f.ended && f.goneT && t - f.goneT > 90) && t - f.t0 < 8000);
    for (const f of this.flights) {
      if (!f.origin && !f.ended) continue;    // wait for its second step to know where it came from
      const p = this.flightPos(f, t);
      if (!p) continue;
      if (p.done && f.ended && !f.goneT) {
        f.goneT = t;
        if (f.impact) this.flightHit(f, p);
      }
      const fade = f.goneT ? 1 - (t - f.goneT) / 90 : 1;
      if (fade <= 0) continue;
      f.lastPos = p;
      const x = p.x, y = p.y + 4 - p.z;
      ctx.globalAlpha = 0.35 * fade; ctx.drawImage(this.shadows.small, Math.round(p.x) - 7, Math.round(p.y + 7));
      ctx.globalAlpha = fade;
      const o = f.o;
      if (OBJ.missile(o)) this.drawArrow(ctx, x, y, p.ang, o);
      else if (OBJ.venom(o)) this.drawGlob(ctx, x, y, o === 480 ? [140, 230, 90] : [230, 236, 220]);
      else if (OBJ.blade(o) || OBJ.spear(o)) this.drawIconRot(ctx, f.ic, x, y, p.ang, 0.5, 0.5, 0.9);
      else if (f.ic) {
        const spin = OBJ.spinner(o) ? t / 28 : t / 70;
        this.drawIconRot(ctx, f.ic, x, y, spin, 0.5, 0.5, OBJ.potion(o) || OBJ.stone(o) ? 0.8 : 0.9, 1, true);
      }
      ctx.globalAlpha = 1;
    }
  },

  // the projectile reached its target
  flightHit(f, p) {
    const t = this.clock(), col = f.ic ? f.ic.rgb : [230, 230, 240];
    if (OBJ.potion(f.o)) {   // the potion shatters
      this.burst(p.x, p.y, 16, 'magic', { col: ['#e8f4ff', '#ffffff', rgba(col, 1)], speed: 70, up: 40, life: 0.5 });
      this.afx.push({ type: 'ring', x: p.x, y: p.y, t0: t, dur: 260, col, r: 14 });
    } else if (f.impact.hit) {
      this.markHit(p.x, p.y - 3, 'pierce', p.ang, t, [255, 240, 200], 10);
      this.burst(p.x, p.y - 2, 6, 'spark', { dir: p.ang, spread: 1.6, speed: 80, up: 18, life: 0.3, z: 8 });
    }
  },

  drawArrow(ctx, x, y, ang, o) {
    const len = o === 24 ? 7 : o === 23 ? 8 : 11, ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
    const shaft = ARROW_SHAFT[o] || '#9a6a3a';
    const px = (u, v, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x + ux * u + vx * v), Math.round(y + uy * u + vy * v), 1, 1); };
    for (let i = -len / 2; i <= len / 2 - 1; i += 0.5) px(i, 0, shaft);
    px(len / 2, 0, '#e8ecf4'); px(len / 2 - 1, 0, '#b8bcc8'); px(len / 2 - 1.5, 1, '#9aa0ac'); px(len / 2 - 1.5, -1, '#9aa0ac');
    if (o !== 23) { const fl = o === 22 ? '#d04040' : '#f0e8d8'; px(-len / 2, 1, fl); px(-len / 2, -1, fl); px(-len / 2 + 1, 1, fl); px(-len / 2 + 1, -1, fl); }
  },
  drawGlob(ctx, x, y, c) {
    ctx.fillStyle = rgba(c, 1); ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
  },

  // ------------------------------------------------------------------ the hero's poses
  // layer: 'under' (on the floor), 'back' (behind the sprite) or 'front'
  drawPose(a, cx, ground, t, layer) {
    const p = this.pose;
    if (!p || t < p.t0) return;
    const ctx = this.sctx, cy = ground - 11;
    p.cx = cx; p.cy = cy; p.ground = ground;
    const [fx, fy] = FACING[a.dir] || [0, 1];
    const facingN = a.dir === 2;
    switch (p.kind) {
      case 'swing': case 'thrust': case 'jab': {
        const k = (t - p.t0) / p.dur;
        if (k > 1 || layer === 'under') return;
        const g = this.meleeGeom(p, k, cx, cy);
        if ((layer === 'back') !== g.behind) return;
        const alpha = Math.min(1, k / 0.06) * (k > 0.82 ? (1 - k) / 0.18 : 1);
        if (p.kind === 'jab') this.drawFist(ctx, g.hx, g.hy, alpha);
        else if (p.kind === 'thrust') this.drawIconRot(ctx, p.ic, g.hx, g.hy, g.ang, 0.4, 0.6, 1, alpha);
        else this.drawIconRot(ctx, p.ic, g.hx, g.hy, g.ang, 0.2, 0.8, 1, alpha);
        return;
      }
      case 'wand': {
        if (layer === 'under' || (layer === 'back') !== facingN) return;
        const g = this.wandGeom(p, t, cx, cy, fx);
        p.tip = g.tip;
        this.drawIconRot(ctx, p.ic, g.hx, g.hy, g.ang, 0.2, 0.8, 0.8, g.alpha);
        return;
      }
      case 'cast': {
        if (layer === 'under') this.drawMagicCircle(ctx, p, cx, ground, t);
        return;
      }
      case 'throw': {
        if (layer === 'under' || (layer === 'back') !== facingN) return;
        const g = this.throwGeom(p, t, cx, cy, fx);
        if (g.show) this.drawIconRot(ctx, p.ic, g.hx, g.hy, g.ang, 0.5, 0.5, 0.85, g.alpha);
        p.hand = g;
        return;
      }
      case 'bow': {
        if (layer === 'under' || (layer === 'back') !== facingN) return;
        this.drawBow(ctx, p, t, cx, cy, fx, fy);
        return;
      }
      case 'quaff': case 'eat': case 'read': case 'wield': case 'snap': {
        if (layer === 'under' || (layer === 'back') !== facingN) return;
        this.drawHeld(ctx, p, t, cx, cy, fx);
        return;
      }
    }
  },

  meleeGeom(p, k, cx, cy) {
    const th = p.ang, s = p.side, ux = Math.cos(th), uy = Math.sin(th);
    if (p.kind === 'swing') {
      let ang;
      if (this.reduced()) ang = th - s * 1.1 + s * 2.2 * smooth(clamp01(k / 0.6));
      else if (k < 0.3) ang = th - s * (0.5 + 1.1 * ease(k / 0.3));
      else if (k < 0.55) ang = th - s * 1.6 + s * 2.8 * smooth((k - 0.3) / 0.25);
      else ang = th + s * (1.2 + 0.15 * ease((k - 0.55) / 0.45));
      const ext = k > 0.3 && k < 0.6 ? 2 : 0;
      return { ang, hx: cx + Math.cos(ang) * (4 + ext), hy: cy + Math.sin(ang) * (3 + ext), behind: Math.sin(ang) < -0.45 };
    }
    let reach;
    if (k < 0.3) reach = -5 * ease(k / 0.3);
    else if (k < 0.46) reach = -5 + 19 * smooth((k - 0.3) / 0.16);
    else if (k < 0.68) reach = 14;
    else reach = 14 * (1 - ease((k - 0.68) / 0.32));
    if (p.kind === 'jab') reach = reach * 0.6 + 2;
    return { ang: th, reach, hx: cx + ux * (4 + reach), hy: cy + uy * (3 + reach * 0.8), behind: uy < -0.45 };
  },

  drawFist(ctx, x, y, alpha) {
    ctx.save(); ctx.globalAlpha *= alpha;
    const X = Math.round(x) - 2, Y = Math.round(y) - 2;
    ctx.fillStyle = '#4a2a18'; ctx.fillRect(X - 1, Y - 1, 6, 6);
    ctx.fillStyle = '#e0a878'; ctx.fillRect(X, Y, 4, 4);
    ctx.fillStyle = '#f6cca0'; ctx.fillRect(X, Y, 4, 1); ctx.fillRect(X, Y, 1, 3);
    ctx.fillStyle = '#b07850'; ctx.fillRect(X + 1, Y + 2, 1, 1); ctx.fillRect(X + 3, Y + 2, 1, 1);
    ctx.restore();
  },

  wandGeom(p, t, cx, cy, fx) {
    const side = fx < 0 ? -1 : 1;
    const kr = ease(clamp01((t - p.t0) / 150));
    let ang = lerpAng(Math.PI / 2 - side * 0.5, -Math.PI / 2 + side * 0.35, kr);
    let hx = cx + side * 5, hy = cy + 1 - 7 * kr;
    if (p.relT !== undefined) {
      const ka = ease(clamp01((t - p.relT) / 80));
      const d = p.dir;
      const target = !d ? -Math.PI / 2 + side * 0.2 : d.down ? Math.PI / 2 - side * 0.3 : d.up ? -Math.PI / 2 : Math.atan2(d.dy * 0.85, d.dx);
      ang = lerpAng(ang, target, ka);
      if (d && !d.up) { hx += Math.cos(target) * 4 * ka; hy += (Math.sin(target) * 3 + (d.down ? 6 : 5)) * ka; }
    }
    const L = 13;
    const alpha = p.end ? clamp01((p.end - t) / 120) : 1;
    return { hx, hy, ang, alpha, tip: { x: hx + Math.cos(ang) * L, y: hy + Math.sin(ang) * L } };
  },

  wandCharge(p, t) {
    const kr = clamp01((t - p.t0) / 150);
    if (p.relT === undefined) return kr * (0.35 + 0.12 * Math.sin(t / 70));
    if (t < p.flashT) return 0.35 + 0.65 * clamp01((t - p.relT) / Math.max(1, p.flashT - p.relT));
    return Math.max(0, 1 - (t - p.flashT) / 260) * 0.9;
  },

  throwGeom(p, t, cx, cy, fx) {
    const d = p.dir, side = fx < 0 ? -1 : 1;
    const back = { x: cx - (d ? d.dx : fx) * 4 + side * 2, y: cy - 10 };
    if (p.relT === undefined) return { hx: back.x, hy: back.y, ang: -Math.PI / 2 - side * 0.5, show: true, alpha: ease(clamp01((t - p.t0) / 100)) };
    const k = clamp01((t - p.relT) / 90), th = d ? Math.atan2(d.dy, d.dx) : 0;
    const fwd = { x: cx + Math.cos(th) * 9, y: cy + Math.sin(th) * 6 - 2 };
    return { hx: back.x + (fwd.x - back.x) * ease(k), hy: back.y + (fwd.y - back.y) * ease(k), ang: lerpAng(-Math.PI / 2 - side * 0.5, th, ease(k)), show: k < 0.3, alpha: 1, k, th };
  },

  drawBow(ctx, p, t, cx, cy, fx, fy) {
    const d = p.dir, th = d ? Math.atan2(d.dy * 0.85, d.dx) : Math.atan2(fy * 0.85, fx);
    const ux = Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux;
    const hx = cx + ux * 6, hy = cy + uy * 4 - 1;
    const o = this.objType(this.equipment.main?.glyph ?? -1);
    const alpha = p.end ? clamp01((p.end - t) / 100) : ease(clamp01((t - p.t0) / 90));
    if (OBJ.crossbow(o)) { this.drawIconRot(ctx, p.ic, hx, hy, th + Math.PI / 2, 0.5, 0.5, 0.9, alpha, true); return; }
    this.drawIconRot(ctx, p.ic, hx, hy, th + Math.PI / 2, 0.5, 0.5, 0.9, alpha);   // belly faces the shot
    // string and nocked arrow: drawn back while aiming, snapping straight on release
    let pull = 4 * ease(clamp01((t - p.t0) / 140));
    if (p.relT !== undefined) { const k = (t - p.relT) / 160; pull = k < 1 ? -1.5 * Math.sin(k * Math.PI * 3) * (1 - k) : 0; }
    const R = 8, tip1 = [hx + vx * R - ux * 2, hy + vy * R - uy * 2], tip2 = [hx - vx * R - ux * 2, hy - vy * R - uy * 2];
    const nock = [hx - ux * (2 + pull), hy - uy * (2 + pull)];
    ctx.save(); ctx.globalAlpha *= alpha;
    this.pxLine(ctx, tip1[0], tip1[1], nock[0], nock[1], '#efe6d2');
    this.pxLine(ctx, tip2[0], tip2[1], nock[0], nock[1], '#efe6d2');
    if (p.relT === undefined) this.drawArrow(ctx, nock[0] + ux * 5, nock[1] + uy * 5, th, this.objType(p.ammo));
    ctx.restore();
  },

  // potions, food, scrolls, a weapon being wielded, a wand being snapped
  drawHeld(ctx, p, t, cx, cy, fx) {
    const k = (t - p.t0) / p.dur;
    if (k > 1 || !p.ic) return;
    const side = fx < 0 ? -1 : 1;
    const alpha = Math.min(1, k / 0.1) * (k > 0.85 ? (1 - k) / 0.15 : 1);
    if (p.kind === 'quaff') {
      const lift = ease(clamp01(k / 0.3));
      const hx = cx + side * (6 - 3 * lift), hy = cy + 2 - 11 * lift;
      const tilt = -side * 1.9 * smooth(clamp01((k - 0.25) / 0.3)) * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1);
      this.drawIconRot(ctx, p.ic, hx, hy, tilt, 0.5, 0.6, 0.75, alpha, true);
      p.hand = { x: hx, y: hy - 4 };
    } else if (p.kind === 'eat') {
      const lift = ease(clamp01(k / 0.25));
      const bite = Math.max(Math.exp(-(((k - 0.42) / 0.05) ** 2)), Math.exp(-(((k - 0.66) / 0.05) ** 2)));
      const hx = cx + side * (6 - 4 * lift), hy = cy + 2 - 9 * lift;
      this.drawIconRot(ctx, p.ic, hx, hy, 0, 0.5, 0.5, 0.75 - bite * 0.15, alpha, true);
      p.hand = { x: hx, y: hy };
    } else if (p.kind === 'read') {
      const lift = ease(clamp01(k / 0.25));
      const hx = cx + side * 1, hy = cy + 3 - 4 * lift;
      this.drawIconRot(ctx, p.ic, hx, hy, 0, 0.5, 0.5, 0.8, alpha, true);
      p.hand = { x: hx, y: hy };
    } else if (p.kind === 'wield') {
      const ang = -Math.PI / 2 + side * (0.4 + TAU * ease(clamp01(k / 0.6)));
      const hx = cx + side * 5, hy = cy - 4 - 4 * Math.sin(Math.PI * clamp01(k / 0.6));
      this.drawIconRot(ctx, p.ic, hx, hy, ang, 0.2, 0.8, 1, alpha);
      p.hand = { x: hx + Math.cos(ang) * 15, y: hy + Math.sin(ang) * 15 };
    } else if (p.kind === 'snap') {
      const bend = 0.5 * smooth(clamp01(k / 0.75));
      this.drawIconRot(ctx, p.ic, cx - 3, cy - 4, Math.PI + bend, 0.2, 0.8, 0.6, alpha);
      this.drawIconRot(ctx, p.ic, cx + 3, cy - 4, -bend, 0.2, 0.8, 0.6, alpha);
    }
  },

  drawMagicCircle(ctx, p, cx, ground, t) {
    const grow = ease(clamp01((t - p.t0) / 180)) * (p.end ? clamp01((p.end - t) / 180) : 1);
    if (grow <= 0) return;
    const rot = this.reduced() ? 0 : (t - p.t0) / 650;
    const rx = 17 * grow, ry = 6.5 * grow, cy = ground - 1;
    const flash = p.flashT && t >= p.flashT ? Math.max(0, 1 - (t - p.flashT) / 300) : 0;
    const col = mix(p.col, WHITE, flash * 0.6);
    const dot = (x, y, c, a) => { ctx.fillStyle = rgba(c, a); ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * TAU;
      dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, col, 0.95);
      if (i % 2 === 0) dot(cx + Math.cos(a) * rx * 0.72, cy + Math.sin(a) * ry * 0.72, col, 0.7);
    }
    // a hexagram turning inside
    for (let tri = 0; tri < 2; tri++) {
      for (let j = 0; j < 3; j++) {
        const a0 = rot + tri * Math.PI / 3 + j * TAU / 3, a1 = a0 + TAU / 3;
        this.pxLine(ctx, cx + Math.cos(a0) * rx * 0.72, cy + Math.sin(a0) * ry * 0.72, cx + Math.cos(a1) * rx * 0.72, cy + Math.sin(a1) * ry * 0.72, rgba(col, 0.6));
      }
    }
    // runes on the rim
    for (let j = 0; j < 8; j++) {
      const a = -rot * 1.4 + j * TAU / 8, x = cx + Math.cos(a) * rx * 0.86, y = cy + Math.sin(a) * ry * 0.86;
      ctx.fillStyle = rgba(mix(col, WHITE, 0.5), 1); ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 2);
    }
  },

  // ------------------------------------------------------------------ emissive pass
  drawActionFx(t) {
    const ctx = this.sctx;
    const p = this.pose;
    if (p && ((p.end && t > p.end) || (p.waiting && t - p.t0 > 60000))) this.pose = null;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.pose && this.pose.cx !== undefined) this.drawPoseGlow(ctx, this.pose, t);
    for (const f of this.flights) {   // streaks behind arrows and blades
      const q = f.lastPos;
      if (!q || f.goneT || this.reduced() || !(OBJ.missile(f.o) || OBJ.blade(f.o) || OBJ.spear(f.o) || OBJ.spinner(f.o) || OBJ.venom(f.o))) continue;
      const L = Math.min(14, q.v * 10), ux = Math.cos(q.ang), uy = Math.sin(q.ang), y0 = q.y + 4 - q.z;
      for (let i = 2; i < L; i++) { ctx.fillStyle = `rgba(255,248,230,${(0.5 * (1 - i / L)).toFixed(3)})`; ctx.fillRect(Math.round(q.x - ux * i), Math.round(y0 - uy * i), 1, 1); }
    }
    ctx.restore();
    this.afx = this.afx.filter((e) => t - e.t0 < e.dur);
    for (const e of this.afx) {
      const k = (t - e.t0) / e.dur;
      if (k < 0) continue;
      this.drawMark(ctx, e, k, t);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },

  drawPoseGlow(ctx, p, t) {
    const { cx, cy } = p;
    if (p.boltCheck && t >= p.boltCheck.t) {
      const b = p.boltCheck; p.boltCheck = null;
      if (!p.beam && !this.beamColour()) this.afx.push({ type: 'bolt', x: b.x, y: b.y, ang: b.ang, t0: t - 50, dur: 220, col: p.col, len: b.len });
    }
    if (p.kind === 'swing' && !this.reduced()) {   // motion blur behind the blade
      const k = (t - p.t0) / p.dur;
      if (k > 0.3 && k < 1) {
        const fade = k < 0.7 ? 1 : (1 - k) / 0.3;
        let prev = null;
        for (let j = 0; j <= 12; j++) {
          const kj = k - j * 0.016;
          if (kj < 0.3) break;
          const g = this.meleeGeom(p, kj, cx, cy);
          const cur = [g.hx + Math.cos(g.ang) * 6, g.hy + Math.sin(g.ang) * 6, g.hx + Math.cos(g.ang) * 17, g.hy + Math.sin(g.ang) * 17];
          if (prev) {
            ctx.fillStyle = rgba(p.col, 0.5 * fade * (1 - j / 12));
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(prev[2], prev[3]); ctx.lineTo(cur[2], cur[3]); ctx.lineTo(cur[0], cur[1]); ctx.closePath(); ctx.fill();
          }
          prev = cur;
        }
        const g = this.meleeGeom(p, k, cx, cy);   // a bright edge at the blade's tip
        ctx.fillStyle = rgba(WHITE, 0.7 * fade);
        ctx.fillRect(Math.round(g.hx + Math.cos(g.ang) * 16), Math.round(g.hy + Math.sin(g.ang) * 16), 1, 1);
      }
    } else if ((p.kind === 'thrust' || p.kind === 'jab') && !this.reduced()) {   // speed lines along the thrust
      const k = (t - p.t0) / p.dur;
      if (k > 0.3 && k < 0.62) {
        const g = this.meleeGeom(p, k, cx, cy), ux = Math.cos(p.ang), uy = Math.sin(p.ang), vx = -uy, vy = ux;
        const tip = p.kind === 'jab' ? 0 : 12, a = 1 - Math.abs(k - 0.46) / 0.16;
        for (const off of [-3, 0, 3]) for (let i = 0; i < 9; i++) {
          ctx.fillStyle = rgba(p.col, 0.55 * a * (1 - i / 9));
          ctx.fillRect(Math.round(g.hx + ux * (tip - 4 - i) + vx * off), Math.round(g.hy + uy * (tip - 4 - i) + vy * off), 1, 1);
        }
      }
    } else if (p.kind === 'wand' && p.tip) {
      const c = this.wandCharge(p, t), tip = p.tip;
      this.glow(ctx, tip.x, tip.y, 2 + c * 6, p.col, 0.35 + c * 0.6);
      if (!this.reduced() && c > 0.05) {   // sparks drawn into the tip
        for (let i = 0; i < 7; i++) {
          const ph = ((t / 300) + i / 7) % 1, a = i * 2.4 + Math.floor((t / 300) + i / 7) * 1.7, r = (1 - ph) * (6 + 10 * c);
          ctx.fillStyle = rgba(i % 2 ? WHITE : p.col, ph * c);
          ctx.fillRect(Math.round(tip.x + Math.cos(a) * r), Math.round(tip.y + Math.sin(a) * r * 0.8), 1, 1);
        }
      }
      if (p.flashT && t >= p.flashT && !p.flashed) {
        p.flashed = true;
        this.afx.push({ type: 'ring', x: tip.x, y: tip.y, t0: t, dur: 220, col: p.col, r: 16 });
        this.alights.push({ x: tip.x, y: tip.y, r: 90, rgb: p.col, k: 1, t0: t, dur: 240 });
        const d = p.dir, dir = d && (d.dx || d.dy) ? Math.atan2(d.dy, d.dx) : undefined;
        this.burst(tip.x, tip.y + 8, 14, 'magic', { col: ['#ffffff', rgba(p.col, 1)], dir, spread: dir === undefined ? TAU : 1.4, speed: 90, up: 30, life: 0.45, z: 8, g: 0.4 });
        // directed zaps that NetHack draws no beam for (striking...) get a short pulse, if no beam shows up
        if (d && (d.dx || d.dy)) p.boltCheck = { t: t + 50, x: tip.x, y: tip.y, ang: Math.atan2(d.dy * 0.85, d.dx), len: 30 };
        if (d && d.down) this.burst(tip.x, tip.y + 10, 10, 'spark', { speed: 50, up: 30, life: 0.4, col: ['#ffffff', rgba(p.col, 1)] });
      }
    } else if (p.kind === 'cast') {
      const grow = ease(clamp01((t - p.t0) / 180)) * (p.end ? clamp01((p.end - t) / 180) : 1);
      const lift = ease(clamp01((t - p.t0) / 200));
      let orbs = [[cx - 8, cy - 9 - 5 * lift], [cx + 8, cy - 9 - 5 * lift]];
      const d = p.dir, th = d && (d.dx || d.dy) ? Math.atan2(d.dy * 0.85, d.dx) : null;
      if (p.relT !== undefined && !p.fizzle) {   // the hands come together and push the spell out
        const k = ease(clamp01((t - p.relT) / Math.max(1, p.flashT - p.relT)));
        const front = th === null ? [cx, cy - 18] : [cx + Math.cos(th) * 9, cy + Math.sin(th) * 7 - 4];
        orbs = orbs.map(([x, y]) => [x + (front[0] - x) * k, y + (front[1] - y) * k]);
      }
      const pulse = 0.75 + 0.25 * Math.sin(t / 60);
      for (const [x, y] of orbs) this.glow(ctx, x, y, 3 + 2 * pulse, p.col, 0.8 * grow);
      if (!this.reduced() && !p.fizzle && Math.random() < 0.5 && t < (p.flashT || 1e12)) {   // motes rising from the circle
        const a = Math.random() * TAU;
        this.particles.push({ x: cx + Math.cos(a) * 15 * grow, y: p.ground - 1 + Math.sin(a) * 6 * grow, z: 0, vx: 0, vy: 0, vz: 22 + Math.random() * 18, g: -0.05, kind: 'magic', life: 0.7, age: 0, col: Math.random() < 0.3 ? '#ffffff' : rgba(p.col, 1) });
      }
      if (p.flashT && t >= p.flashT && !p.flashed) {
        p.flashed = true;
        const o = orbs[0];
        this.afx.push({ type: 'ring', x: cx, y: p.ground - 1, t0: t, dur: 300, col: p.col, r: 24, flat: true });
        this.alights.push({ x: o[0], y: o[1], r: 100, rgb: p.col, k: 1, t0: t, dur: 280 });
        this.burst(o[0], o[1] + 8, 16, 'magic', { col: ['#ffffff', rgba(p.col, 1)], dir: th ?? undefined, spread: th === null ? TAU : 1.2, speed: 95, up: 40, life: 0.5, z: 10, g: 0.3 });
        if (th !== null) p.boltCheck = { t: t + 50, x: o[0], y: o[1], ang: th, len: 34 };
      }
      if (p.fizzle && !p.fizzled) { p.fizzled = true; this.burst(cx, cy - 12, 8, 'magic', { col: '#9a9aa8', speed: 30, up: 20, life: 0.5 }); }
    } else if (p.kind === 'throw' && p.hand && p.hand.k !== undefined && p.hand.k < 1 && !this.reduced()) {
      const g = p.hand;   // a swoosh along the throwing arm
      ctx.fillStyle = 'rgba(255,250,235,0.35)';
      for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(g.hx - Math.cos(g.th) * i * 1.5), Math.round(g.hy - Math.sin(g.th) * i * 1.5 - i * 0.6), 1, 1);
    } else if (p.kind === 'quaff' && p.hand) {
      const k = (t - p.t0) / p.dur;
      const tw = Math.exp(-(((k - 0.45) / 0.08) ** 2));
      if (tw > 0.05) this.star(ctx, p.hand.x + 2, p.hand.y, 4 * tw, WHITE, tw);
      if (k > 0.5 && !p.dripped) { p.dripped = true; this.burst(p.hand.x, p.hand.y + 6, 4, 'magic', { col: rgba(p.col || WHITE, 1), speed: 18, up: 10, life: 0.5, z: 14 }); }
    } else if (p.kind === 'eat' && p.hand) {
      const k = (t - p.t0) / p.dur;
      for (const [b, flag] of [[0.42, 'b1'], [0.66, 'b2']]) if (k > b && !p[flag]) { p[flag] = true; this.burst(p.hand.x, p.hand.y + 4, 4, 'magic', { col: rgba(p.col || [200, 170, 120], 1), speed: 26, up: 14, life: 0.45, z: 14 }); }
    } else if (p.kind === 'read' && p.hand) {
      const k = (t - p.t0) / p.dur;
      const fl = Math.exp(-(((k - 0.35) / 0.1) ** 2));
      if (fl > 0.03) { this.glow(ctx, p.hand.x, p.hand.y, 9 * fl + 2, [255, 244, 210], fl * 0.8); }
      if (k > 0.33 && !p.paged) {
        p.paged = true;
        this.alights.push({ x: p.hand.x, y: p.hand.y, r: 60, rgb: [255, 240, 200], k: 0.8, t0: t, dur: 260 });
        for (let i = 0; i < 6; i++) this.particles.push({ x: p.hand.x + (Math.random() - 0.5) * 10, y: p.hand.y, z: 4, vx: (Math.random() - 0.5) * 8, vy: 0, vz: 16 + Math.random() * 12, g: -0.03, kind: 'magic', life: 0.7, age: 0, col: i % 2 ? '#ffe9a8' : '#ffffff' });
      }
    } else if (p.kind === 'wear') {
      const k = (t - p.t0) / p.dur;
      if (p.ic) { ctx.save(); ctx.globalCompositeOperation = 'source-over'; this.drawIconRot(ctx, p.ic, cx, cy - 18 + 14 * ease(clamp01(k / 0.6)), 0, 0.5, 0.5, 0.8, k < 0.6 ? Math.min(1, k / 0.15) : Math.max(0, 1 - (k - 0.6) / 0.25), true); ctx.restore(); }
      for (let i = 0; i < 6; i++) {
        const tw = Math.exp(-(((k - 0.35 - i * 0.08) / 0.07) ** 2));
        if (tw > 0.05) this.star(ctx, cx + Math.cos(i * 2.3) * 8, cy - 2 + Math.sin(i * 2.3) * 9, 3.5 * tw, i % 2 ? WHITE : mix(p.col || WHITE, WHITE, 0.5), tw);
      }
    } else if (p.kind === 'wield' && p.hand) {
      const k = (t - p.t0) / p.dur;
      const tw = Math.exp(-(((k - 0.72) / 0.08) ** 2));
      if (tw > 0.05) this.star(ctx, p.hand.x, p.hand.y, 5 * tw, WHITE, tw);
    }
  },

  drawMark(ctx, e, k, t) {
    const fade = 1 - k;
    ctx.save();
    switch (e.type) {
      case 'slash': {   // a bright cut across the target
        const L = e.size * ease(Math.min(1, k * 4)), ux = Math.cos(e.ang), uy = Math.sin(e.ang), vx = -uy, vy = ux;
        const x0 = e.x - ux * L / 2, y0 = e.y - uy * L / 2, x1 = e.x + ux * L / 2, y1 = e.y + uy * L / 2;
        ctx.globalCompositeOperation = 'lighter';
        const w = k < 0.25 ? 2 : 1;
        for (let o = -w; o <= w; o++) this.pxLine(ctx, x0 + vx * o, y0 + vy * o, x1 + vx * o, y1 + vy * o, rgba(e.col, fade * (o === 0 ? 1 : 0.5)));
        this.pxLine(ctx, x0, y0, x1, y1, rgba(WHITE, fade));
        if (k < 0.5) this.star(ctx, e.x, e.y, 6 * (1 - k * 2), WHITE, 1 - k * 2);
        break;
      }
      case 'pierce': case 'pow': {
        ctx.globalCompositeOperation = 'lighter';
        const s = e.size * (0.6 + 0.6 * ease(Math.min(1, k * 3)));
        this.star(ctx, e.x, e.y, s * fade, e.col, fade);
        if (e.type === 'pow') for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8 + 0.2, r0 = 4 + k * 8, r1 = r0 + 3;
          this.pxLine(ctx, e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0 * 0.8, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1 * 0.8, rgba(e.col, fade));
        }
        break;
      }
      case 'claw': {   // three rakes
        const L = e.size * ease(Math.min(1, k * 4)), ux = Math.cos(e.ang), uy = Math.sin(e.ang), vx = -uy, vy = ux;
        for (const o of [-4, 0, 4]) {
          const cx = e.x + vx * o, cy = e.y + vy * o;
          this.pxLine(ctx, cx - ux * L / 2, cy - uy * L / 2, cx + ux * L / 2, cy + uy * L / 2, rgba([200, 20, 30], fade));
          ctx.globalCompositeOperation = 'lighter';
          this.pxLine(ctx, cx - ux * L / 2 + vx, cy - uy * L / 2 + vy, cx + ux * L / 2 + vx, cy + uy * L / 2 + vy, rgba([255, 200, 190], fade * 0.8));
          ctx.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'bite': {   // two rows of teeth snapping shut
        const gap = 7 * (1 - ease(Math.min(1, k * 3)));
        for (const s of [-1, 1]) for (let i = -3; i <= 3; i++) {
          const x = e.x + i * 2, y = e.y + s * (gap + 1 + Math.abs(i) * 0.6);
          ctx.fillStyle = rgba([255, 250, 240], fade); ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
          ctx.fillStyle = rgba([200, 20, 30], fade); ctx.fillRect(Math.round(x), Math.round(y + s), 1, 1);
        }
        break;
      }
      case 'ring': {
        ctx.globalCompositeOperation = 'lighter';
        const r = e.r * ease(k), ry = e.flat ? 0.4 : 0.8;
        for (let i = 0; i < 64; i++) {
          const a = i / 64 * TAU;
          ctx.fillStyle = rgba(i % 3 ? e.col : WHITE, fade);
          ctx.fillRect(Math.round(e.x + Math.cos(a) * r), Math.round(e.y + Math.sin(a) * r * ry), 1, 1);
        }
        break;
      }
      case 'bolt': {   // a short pulse of force flying out
        ctx.globalCompositeOperation = 'lighter';
        const ux = Math.cos(e.ang), uy = Math.sin(e.ang), head = e.len * ease(k), tail = Math.max(0, head - 10);
        for (let d = tail; d <= head; d += 0.5) {
          const a = fade * (d - tail) / Math.max(1, head - tail);
          ctx.fillStyle = rgba(d > head - 1.5 ? WHITE : e.col, a);
          ctx.fillRect(Math.round(e.x + ux * d), Math.round(e.y + uy * d), 1, 1);
          ctx.fillRect(Math.round(e.x + ux * d - uy), Math.round(e.y + uy * d + ux), 1, 1);
        }
        this.glow(ctx, e.x + ux * head, e.y + uy * head, 4, e.col, fade);
        break;
      }
      case 'pop': {   // an item hopping up into the hero's pack
        const h = this.heroActor(), c = h ? this.heroCenter(h, t) : { x: e.x, y: e.y };
        const up = k < 0.55 ? ease(k / 0.55) : 1, s = k < 0.55 ? 0.75 : 0.75 * (1 - (k - 0.55) / 0.45 * 0.7);
        const y = c.y + 6 - 18 * up + (k > 0.55 ? 12 * smooth((k - 0.55) / 0.45) : 0);
        this.drawIconRot(ctx, e.ic, c.x, y, 0, 0.5, 0.5, s, k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1, true);
        ctx.globalCompositeOperation = 'lighter';
        const tw = Math.exp(-(((k - 0.5) / 0.08) ** 2));
        if (tw > 0.05) this.star(ctx, c.x + 4, y - 4, 4 * tw, WHITE, tw);
        break;
      }
    }
    ctx.restore();
  },

  // ------------------------------------------------------------------ lights & pixel helpers
  actionLights(t) {
    this.alights = this.alights.filter((l) => t - l.t0 < l.dur);
    for (const l of this.alights) { const k = (t - l.t0) / l.dur; if (k >= 0) this.light(l.x, l.y, l.r, l.rgb.join(','), l.k * (1 - k)); }
    const p = this.pose;
    if (!p || p.cx === undefined) return;
    if (p.kind === 'wand' && p.tip) { const c = this.wandCharge(p, t); if (c > 0.05) this.light(p.tip.x, p.tip.y, 30 + 40 * c, p.col.join(','), 0.6 * c); }
    if (p.kind === 'cast') {
      const grow = ease(clamp01((t - p.t0) / 180)) * (p.end ? clamp01((p.end - t) / 180) : 1);
      if (grow > 0) this.light(p.cx, p.ground - 4, 70, p.col.join(','), 0.75 * grow);
    }
  },

  glow(ctx, x, y, r, col, a) {
    if (a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(WHITE, a)); g.addColorStop(0.35, rgba(col, a * 0.8)); g.addColorStop(1, rgba(col, 0));
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = prev;
  },
  // a four-pointed sparkle
  star(ctx, x, y, s, col, a) {
    if (s < 0.5 || a <= 0) return;
    x = Math.round(x); y = Math.round(y);
    const n = Math.round(s);
    for (let i = -n; i <= n; i++) {
      const fall = 1 - Math.abs(i) / (n + 1);
      ctx.fillStyle = rgba(i === 0 ? WHITE : col, a * fall);
      ctx.fillRect(x + i, y, 1, 1); if (i) ctx.fillRect(x, y + i, 1, 1);
    }
    if (n >= 3) { ctx.fillStyle = rgba(col, a * 0.6); for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) ctx.fillRect(x + dx, y + dy, 1, 1); }
  },
  pxLine(ctx, x0, y0, x1, y1, style) {
    ctx.fillStyle = style;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1);
  },
};
