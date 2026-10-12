// Inventory screen in the spirit of Baldur's Gate: a carved-stone page with the hero
// standing in the middle, equipment slots cracked into the rock around them, a quick
// weapons panel, the backpack along the bottom and party portraits down the side.
// Used for every NetHack menu whose entries are mostly objects (inventory, pick up,
// drop, "what do you want to ..." pickers).

import { verbFor, useItem, offhandPlan } from './actions.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MG_PET = 0x10;
const BL = { TITLE: 0, ALIGN: 7, CAP: 9, GOLD: 10, XP: 13, AC: 14, HUNGER: 17, HP: 18, HPMAX: 19 };

export function isInventoryMenu(menu, tiles) {
  const sel = menu.items.filter((it) => !it.header && it.ident !== 0);
  if (sel.length === 0) return false;
  const objs = sel.filter((it) => it.glyph >= 0 && ['obj', 'statue'].includes(tiles.classes[tiles.gcls[it.glyph]]));
  return objs.length / sel.length >= 0.6;
}

// Ghost silhouettes for empty slots (24x24 paths, drawn as engraved strokes).
const GHOST = {
  head: 'M6 16c0-6 2.7-10 6-10s6 4 6 10M5 16h14v2H5zM12 6V3',
  neck: 'M7 4c0 5 2 8 5 9 3-1 5-4 5-9M12 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  cloak: 'M8 4h8l4 16H4L8 4zm1 0c0 3 1.5 5 3 5s3-2 3-5',
  body: 'M7 4h10l3 4-3 2v10H7V10L4 8l3-4zm3 0 2 3 2-3M9 13h6M9 16h6',
  shirt: 'M8 5h8l3 3-2 2v9H7v-9L5 8l3-3zm2 0a2 2 0 0 0 4 0',
  hands: 'M8 20v-8l-2-3 1-1 3 2V5h2v6h1V4h2v7h1V6h2v9l-2 5H8z',
  feet: 'M8 4h5v10l6 3v3H8V4zm0 12h11',
  eyes: 'M3 11h18M5 11a3 3 0 1 0 6 0M13 11a3 3 0 1 0 6 0',
  ringL: 'M12 7a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM10 4h4l-2 3z',
  ringR: 'M12 7a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM10 4h4l-2 3z',
  main: 'M19 3l2 2-11 11-2-2L19 3zM6 14l4 4M7 17l-3 3',
  off: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3zm0 3v12',
  alt: 'M19 3l2 2-11 11-2-2L19 3zM6 14l4 4M7 17l-3 3',
  quiver: 'M5 19 17 7M14 5l5 0 0 5M5 19l-1 1M7 21l-2-2M3 17l2 2',
};
const LABEL = { head: 'Helmet', neck: 'Amulet', cloak: 'Cloak', body: 'Armour', shirt: 'Shirt', hands: 'Gloves', feet: 'Boots',
  eyes: 'Eyewear', ringL: 'Left ring', ringR: 'Right ring', main: 'Weapon', off: 'Shield / off hand', alt: 'Swap weapon', quiver: 'Quiver' };

// Rail icons per NetHack inventory heading (used when a category has no item to show).
const CAT_ICON = {
  All: 'M7 8c0-3 2-5 5-5s5 2 5 5M5 8h14l-1 13H6L5 8zm4 4h6',
  Coins: 'M12 4a8 4 0 1 0 0 1M4 5v6c0 2 4 4 8 4s8-2 8-4V5M4 11v6c0 2 4 4 8 4s8-2 8-4v-6',
  Weapons: 'M19 3l2 2-11 11-2-2L19 3zM6 14l4 4M7 17l-3 3',
  Armor: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z',
  Comestibles: 'M8 21c-3 0-4-4-4-8s2-7 5-7c1 0 2 1 3 1s2-1 3-1c3 0 5 3 5 7s-1 8-4 8c-1 0-2-1-4-1s-3 1-4 1zM12 7c0-2 1-4 3-4',
  Scrolls: 'M6 5h11a2 2 0 0 1 0 4H8v10a2 2 0 0 1-4 0V7a2 2 0 0 1 2-2zM9 12h6M9 15h6',
  Spellbooks: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4zM5 18a2 2 0 0 1 2-2h12M10 8h5',
  Potions: 'M10 3h4M10 3v5L6 15a4 4 0 0 0 4 6h4a4 4 0 0 0 4-6l-4-7V3M7 14h10',
  Rings: 'M12 8a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM10 4h4l-2 4z',
  Wands: 'M4 20 16 8M15 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  Tools: 'M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2z',
  Gems: 'M7 4h10l4 5-9 12L3 9l4-5zM3 9h18M12 21 8 9l4-5 4 5z',
  Amulets: 'M7 4c0 5 2 8 5 9 3-1 5-4 5-9M12 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};
const catKey = (c) => (/^coins/i.test(c) ? 'Coins' : /weapon/i.test(c) ? 'Weapons' : /armou?r/i.test(c) ? 'Armor' : /comestible/i.test(c) ? 'Comestibles'
  : /scroll/i.test(c) ? 'Scrolls' : /spellbook/i.test(c) ? 'Spellbooks' : /potion/i.test(c) ? 'Potions' : /ring/i.test(c) ? 'Rings'
    : /wand/i.test(c) ? 'Wands' : /tool/i.test(c) ? 'Tools' : /gem|stone/i.test(c) ? 'Gems' : /amulet/i.test(c) ? 'Amulets' : 'All');

// Where an item belongs on the body, by what it is (for armour, from its name).
function wearSlot(t, cat) {
  if (/amulet/.test(cat) || /amulet/.test(t)) return 'neck';
  if (/blindfold|towel|lenses|sunglasses/.test(t)) return 'eyes';
  // cloaks first ("hooded cloak", "dwarvish cloak" are cloaks, not hats); a leather jacket is body armour
  if (/cloak|cape|robe|apron|mantle|alchemy smock|mummy wrapping|piece of cloth|\bcope\b/.test(t)) return 'cloak';
  if (/helm|hat|cap\b|hood|cornuthaum|fedora|dunce|visor|kabuto|dented pot/.test(t)) return 'head';
  if (/shield|buckler/.test(t)) return 'off';
  if (/glove|gauntlet|yugake/.test(t)) return 'hands';
  if (/boot|shoes/.test(t)) return 'feet';
  if (/shirt/.test(t)) return 'shirt';
  return 'body';
}

// Dragging an item onto the character (or a slot) does what a player means by it, as the real
// NetHack command: [command key, slots that light up as targets].
function equipAction(e) {
  const t = e.it.text.toLowerCase(), k = catKey(e.cat);
  if (k === 'Weapons') return { key: 'w', slots: ['main'] };
  if (k === 'Armor') return { key: 'W', slots: [wearSlot(t, k.toLowerCase())] };
  if (k === 'Rings') return { key: 'P', slots: ['ringL', 'ringR'] };
  if (k === 'Amulets') return { key: 'P', slots: ['neck'] };
  if (k === 'Tools' && /blindfold|towel|lenses|sunglasses/.test(t)) return { key: 'P', slots: ['eyes'] };
  if (k === 'Tools' && /pick-axe|mattock|unicorn horn|grappling hook|bullwhip/.test(t)) return { key: 'w', slots: ['main'] };
  return null;
}
// ...and dragging something you're wearing or wielding back into the pack takes it off.
function unequipKeys(slot) {
  if (slot === 'main') return ['w', '-'];           // wield nothing: bare hands
  if (slot === 'quiver') return ['Q', '-'];          // empty the quiver
  if (/^(ring[LR]|neck|eyes)$/.test(slot)) return ['R'];
  if (slot === 'alt') return null;
  return ['T'];
}

// NetHack 5.0 heroes can be left-handed: the main weapon is "(weapon in left hand)" for them, and
// with two weapons both say "(wielded in ... hand)", so remember which hand the main one is in.
let mainHand = 'right';
function slotOf(it, cat) {
  const t = it.text.toLowerCase();
  const hand = t.match(/\(weapon in (right|left) /);
  if (hand) mainHand = hand[1];
  const two = t.match(/\(wielded in (right|left) /);
  if (two) return two[1] === mainHand ? 'main' : 'off';
  if (/\((weapon in|tethered to) |\(wielded\)/.test(t)) return 'main';
  if (/wielded in other hand|\(in other hand\)/.test(t)) return 'off';
  if (/alternate weapon; not wielded/.test(t)) return 'alt';
  if (/\(in quiver/.test(t)) return 'quiver';
  if (/on left hand/.test(t)) return 'ringL';
  if (/on right hand/.test(t)) return 'ringR';
  if (/\(being worn\)|\(embedded in your skin\)/.test(t) || /\(on your eyes|\(over your eyes/.test(t)) {
    return /eyes/.test(t) && !/amulet/.test(t) ? 'eyes' : wearSlot(t, cat);
  }
  return null;
}

// What the hero has on, from an inventory listing: { main, off, alt, quiver, head, neck, cloak,
// body, shirt, hands, feet, eyes, ringL, ringR } -> { name, text, glyph, cat }.
export function equipmentOf(items) {
  const eq = {};
  let cat = 'Items';
  for (const it of items) {
    if (it.header || it.ident === 0) { cat = it.text.trim(); continue; }
    const e = parseItem(it, cat);
    if (e.slot && !eq[e.slot]) eq[e.slot] = { name: e.name, text: it.text, glyph: it.glyph, cat };
  }
  return eq;
}

function parseItem(it, cat) {
  const t = it.text;
  const qty = (t.match(/^(\d+) /) || [])[1];
  const buc = /\buncursed\b/.test(t) ? 'uncursed' : /\bblessed\b/.test(t) ? 'blessed' : /\bcursed\b/.test(t) ? 'cursed' : 'unknown';
  const ench = (t.match(/(^|\s)([+-]\d+) /) || [])[2];
  const charges = (t.match(/\((\d+:-?\d+)\)/) || [])[1];
  const status = (t.match(/\(([^)]*)\)\s*$/) || [])[1];
  let name = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/^(a|an|the|\d+)\s+/i, '');
  name = name.replace(/\b(uncursed|blessed|cursed)\s+/i, '').replace(/^[+-]\d+\s+/, '');
  return { qty, buc, ench, charges, status, name, cat, slot: slotOf(it, cat.toLowerCase()) };
}

// Opaque bounding box of a sheet's first (south idle) frame, cached on the sheet.
function opaqueBounds(sheet) {
  if (sheet.bounds) return sheet.bounds;
  const n = sheet.meta.size, c = document.createElement('canvas'); c.width = n; c.height = n;
  const x = c.getContext('2d'); x.drawImage(sheet.img, 0, 0, n, n, 0, 0, n, n);
  const d = x.getImageData(0, 0, n, n).data;
  let x0 = n, y0 = n, x1 = -1, y1 = -1;
  for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) if (d[(y * n + i) * 4 + 3] > 0) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  sheet.bounds = x1 < 0 ? [0, 0, n, n] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  return sheet.bounds;
}

// Small seeded PRNG so the cracks look the same every time the screen opens.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const svg = (d, s = 26) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="${d}"/></svg>`;

export function inventoryMenu(ui, menu, how) {
  return new Promise((resolve) => {
    const tiles = ui.tiles, st = (ui.game && ui.game.status) || {};
    const val = (k) => (st[k] ? st[k].val : '');
    const entries = [];
    let cat = 'Items';
    const cats = [];
    for (const it of menu.items) {
      if (it.header || it.ident === 0) { cat = it.text.trim(); if (cat && !cats.includes(cat)) cats.push(cat); continue; }
      entries.push({ it, ...parseItem(it, cat) });
    }
    const equipped = {};
    for (const e of entries) {
      if (!e.slot) continue;
      if (equipped[e.slot]) { e.slot = null; continue; }   // two things claim one slot: the second stays in the pack
      equipped[e.slot] = e;
    }
    const pickAny = how === 2, pickNone = how === 0;
    const icon = (e, px) => ui.itemIcon(e.it.glyph, px);
    const gold = entries.find((e) => /gold piece/.test(e.it.text));
    const goldN = gold ? (gold.it.text.match(/\d+/) || ['0'])[0] : ((val(BL.GOLD).split(':').pop().match(/\d+/) || ['0'])[0]);
    const titleVal = val(BL.TITLE) || '';
    const heroName = titleVal.split(' the ')[0] || 'Adventurer';
    const heroRank = titleVal.includes(' the ') ? 'the ' + titleVal.split(' the ').slice(1).join(' the ') : '';
    const xl = (val(BL.XP).match(/\d+/) || [])[0];
    const hp = +val(BL.HP) || 0, hpmax = +val(BL.HPMAX) || 0;
    const asked = menu.prompt || menu.context || '';
    const prompt = asked && !/^\s*inventory:?\s*$/i.test(asked) ? asked : '';
    // When NetHack opens this screen to *do* something (drop, eat, wear...), say so loudly:
    // a click here acts, it doesn't just inspect.
    const bare = prompt.replace(/\s*\[[^\]]*\]\s*$/, '');
    const verbMatch = bare.match(/what (?:do you want|would you like) to ([a-z][a-z -]*?)(?: from [^?]*)?\??$/i) || bare.match(/^([a-z][a-z -]*?) what(?: type of [a-z ]+)?\??$/i);
    const verb = verbMatch ? verbMatch[1].trim().toLowerCase() : '';
    const acting = !!verb || (!!prompt && how !== 0);
    const title = verb ? verb.replace(/^./, (c) => c.toUpperCase()) : 'Inventory';

    const el = document.createElement('div');
    el.className = 'bg-inv' + (acting ? ' acting' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', menu.prompt || 'Inventory');

    const slot = (key) => {
      const e = equipped[key];
      return `<button type="button" class="eq s-${key} ${e ? 'filled ' + e.buc : ''}" data-slot="${key}" ${e ? `data-i="${entries.indexOf(e)}"` : 'tabindex="-1"'}
        aria-label="${esc(LABEL[key])}${e ? ': ' + esc(e.name) : ' (empty)'}" title="${esc(LABEL[key])}">
        ${e ? icon(e, 48) : `<span class="ghost">${svg(GHOST[key], 28)}</span>`}${e && e.qty ? `<span class="qty">${esc(e.qty)}</span>` : ''}</button>`;
    };
    const tabsList = ['All', ...cats];
    const railIcon = (c) => {
      if (c === 'All') return svg(CAT_ICON.All, 30);
      const first = entries.find((e) => e.cat === c);
      return first ? icon(first, 48) : svg(CAT_ICON[catKey(c)] || CAT_ICON.All, 30);
    };

    el.innerHTML = `
      <div class="screen">
        <nav class="rail" role="tablist" aria-label="Item categories">
          ${tabsList.map((c) => `<button type="button" role="tab" class="rb" data-tab="${esc(c)}" title="${esc(c)}" aria-label="${esc(c)}">${railIcon(c)}</button>`).join('')}
          <span class="grow"></span>
          <button type="button" class="rb x" aria-label="Close" title="Close (Esc)">${svg('M6 6l12 12M18 6 6 18', 24)}</button>
        </nav>
        <main class="page">
          <canvas class="cracks" aria-hidden="true"></canvas>
          <header class="top">
            <div class="plaque"><h2>${esc(title)}</h2></div>
            <div class="who"><b>${esc(heroName)}</b><span>${esc([heroRank, val(BL.ALIGN), xl && 'Level ' + xl].filter(Boolean).join(' · '))}</span></div>
          </header>
          ${acting ? `<div class="actbar" role="alert">${how === 2
            ? `Choose what to <b>${esc(verb || 'select')}</b>, then <kbd>Enter</kbd>`
            : `Click an item to <b>${esc(verb || 'choose')}</b> it`}<br><small><kbd>Esc</kbd> cancels and does nothing</small></div>` : ''}
          <section class="stage">
            <div class="badges">
              <div class="badge ac" title="Armour class (lower is better)"><svg viewBox="0 0 60 70" aria-hidden="true"><path d="M30 3 56 12v20c0 17-11 29-26 35C15 61 4 49 4 32V12z"/></svg><b>${esc(val(BL.AC) || '?')}</b><small>AC</small></div>
              <div class="badge hp" title="Hit points" style="--p:${hpmax ? Math.max(0, Math.min(1, hp / hpmax)) : 1}"><svg viewBox="0 0 70 70" aria-hidden="true"><circle cx="35" cy="35" r="29" class="track"/><circle cx="35" cy="35" r="29" class="fill" pathLength="100"/></svg><b>${hp}<i></i>${hpmax}</b><small>HP</small></div>
            </div>
            <div class="box quick"><h3>Quick weapons</h3><div class="row">${slot('main')}${slot('off')}${slot('alt')}</div></div>
            <div class="box worn"><h3>Worn</h3><div class="row">${slot('shirt')}${slot('eyes')}</div></div>
            <div class="toprow">${slot('head')}${slot('neck')}${slot('cloak')}${slot('body')}</div>
            <div class="figure">
              <div class="pool"></div>
              <canvas class="hero" width="256" height="256" aria-label="Your character"></canvas>
              <div class="turn"><button type="button" data-turn="-1" aria-label="Turn left">${svg('M15 6l-6 6 6 6', 18)}</button><button type="button" data-turn="1" aria-label="Turn right">${svg('M9 6l6 6-6 6', 18)}</button></div>
            </div>
            <div class="sidecol">${slot('ringL')}${slot('ringR')}</div>
            <div class="botrow">${slot('hands')}${slot('feet')}</div>
            <div class="goldbox" title="Gold"><span class="coins" aria-hidden="true"></span><b>${esc(goldN)}</b></div>
            <div class="box quiver"><h3>Quiver</h3><div class="row">${slot('quiver')}</div></div>
            <div class="state">${[val(BL.HUNGER), val(BL.CAP)].filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join('')}</div>
          </section>
          <div class="info" aria-live="polite"><div class="desc"></div><div class="hint">${prompt && !verb ? `<span class="ask">${esc(prompt)}</span>` : ''}${
            pickNone ? '<span><kbd>Esc</kbd> close</span>' : pickAny ? '<span><kbd>letter</kbd> mark · <kbd>,</kbd> all · <kbd>Enter</kbd> confirm</span>'
              : acting ? '<span><kbd>letter</kbd> or click</span>' : `<span>Double-click to use · click for all actions · drag onto yourself to equip · <kbd>1</kbd>–<kbd>9</kbd> quickbar · ${ui.controls.on ? '<kbd>I</kbd> or ' : ''}<kbd>Esc</kbd> close</span>`}${
            pickAny ? '<button type="button" class="takeall">Take all</button><button type="button" class="confirm">Confirm</button>' : ''}${
            acting && !pickAny && ui.game && ui.game.autoPicking ? '<button type="button" class="anyitem" title="NetHack lets you choose any item, not only the ones it suggests">Any item…</button>' : ''}</div></div>
          <section class="pack">
            <div class="bag" title="Inventory letters in use"><span class="sack" aria-hidden="true"></span><b>${entries.filter((e) => !/gold piece/.test(e.it.text)).length}</b><small>of 52</small></div>
            <div class="grid" role="listbox" aria-label="Backpack" ${pickAny ? 'aria-multiselectable="true"' : ''}></div>
          </section>
        </main>
        <aside class="party" aria-label="Party"></aside>
      </div>`;

    // ---- party portraits: the hero, then any pets in view
    const party = el.querySelector('.party');
    const actors = [...ui.renderer.actors.values()];
    const heroA = actors.find((a) => a.hero);
    const pets = actors.filter((a) => !a.hero && (a.f & MG_PET)).slice(0, 5);
    const ports = [];
    for (const a of [heroA, ...pets].filter(Boolean)) {
      const fig = document.createElement('figure');
      fig.className = 'port' + (a.hero ? ' on' : '');
      const name = a.hero ? heroName : ui.renderer.monsterName(a);
      fig.title = name;
      const c = document.createElement('canvas'); c.width = 64; c.height = 80;
      fig.append(c);
      const cap = document.createElement('figcaption'); cap.textContent = name; fig.append(cap);
      if (a.hero) { const bar = document.createElement('i'); bar.className = 'hpbar'; bar.style.setProperty('--p', hpmax ? hp / hpmax : 1); fig.append(bar); }
      party.append(fig);
      ports.push({ a, c, done: false });
    }
    // sprite sheets load lazily, so portraits redraw until their sheet has arrived
    const drawPorts = () => {
      for (const p of ports) {
        if (p.done) continue;
        const { a, c } = p;
        const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
        const g = ctx.createRadialGradient(32, 28, 4, 32, 40, 56);
        g.addColorStop(0, a.hero ? '#5a6a8a' : '#4a6a48'); g.addColorStop(1, '#0a0d0e');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 80);
        const sh = ui.official ? null : ui.renderer.sheets.get(tiles.gmon[a.g]);
        if (ui.official) {
          ui.renderer.drawOfficial(ctx, a.g, 0, 8, 64);
          p.done = true;
        } else if (sh) {
          const [bx, by, bw, bh] = opaqueBounds(sh);
          if (sh.meta.rig === 'humanoid') {   // head and shoulders
            const w = Math.max(18, bw * 0.92), h = w * 1.25;
            ctx.drawImage(sh.img, bx + bw / 2 - w / 2, by - 2, w, h, 0, 0, 64, 80);
          } else {                             // the whole animal, fitted
            const k = Math.min(56 / bw, 64 / bh), dw = bw * k, dh = bh * k;
            ctx.drawImage(sh.img, bx, by, bw, bh, 32 - dw / 2, 74 - dh, dw, dh);
          }
          p.done = true;
        } else {
          const t = tiles.g2t[a.g], cell = tiles.cell, cols = tiles.cols;
          ctx.drawImage(ui.atlas, (t % cols) * cell, Math.floor(t / cols) * cell, cell, cell, 8, 16, 48, 48);
          if (tiles.gmon[a.g] < 0) p.done = true;
        }
      }
    };
    drawPorts();

    // ---- hero figure: breathes, turns on demand, swings when you inspect a weapon
    const cv = el.querySelector('canvas.hero'), hx = cv.getContext('2d');
    hx.imageSmoothingEnabled = false;
    let dir = 0, swingT = -1;
    const t0 = performance.now();
    const drawHero = () => {
      hx.clearRect(0, 0, 256, 256);
      if (ui.official) { if (heroA) ui.renderer.drawOfficial(hx, heroA.g, 32, 48, 192); return; }   // NetHack's own tile, 12x
      const base = heroA ? ui.renderer.sheets.get(tiles.gmon[heroA.g]) : null;
      const worn = heroA && base && ui.renderer.heroGearSheet ? ui.renderer.heroGearSheet(heroA, performance.now()) : null;   // in their actual gear
      const heroSheet = base && worn ? { ...base, img: worn } : base;
      if (!heroSheet) {
        if (heroA) {
          const t = tiles.g2t[heroA.g], cell = tiles.cell, cols = tiles.cols;
          hx.drawImage(ui.atlas, (t % cols) * cell, Math.floor(t / cols) * cell, cell, cell, 56, 100, 144, 144);
        }
        return;
      }
      const { size, feet } = heroSheet.meta;
      const now = performance.now();
      let col = Math.floor((now - t0) / 650) % 2;
      if (swingT >= 0) {
        const k = (now - swingT) / 420;
        if (k >= 1) swingT = -1; else col = 6 + Math.min(2, Math.floor(k * 3));
      }
      const s = size <= 48 ? 5 : 3.75;
      hx.drawImage(heroSheet.img, col * size, dir * size, size, size, 128 - feet[0] * s, 248 - feet[1] * s, size * s, size * s);
    };
    // sheet rows are S, E, N, W
    el.querySelector('.turn').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-turn]'); if (!b) return;
      dir = (dir + (+b.dataset.turn > 0 ? 3 : 1)) % 4;
      drawHero();
    });
    cv.addEventListener('click', () => { swingT = performance.now(); });
    const tick = setInterval(() => { if (!el.isConnected) { clearInterval(tick); return; } drawHero(); drawPorts(); }, 70);
    drawHero();

    // ---- cracks running from the hero's feet out to every slot, chiselled at half resolution
    const page = el.querySelector('.page'), cracks = el.querySelector('canvas.cracks');
    const drawCracks = () => {
      if (!el.isConnected) return;
      const pr = page.getBoundingClientRect();
      const z = pr.width / page.offsetWidth || 1;      // the page is zoomed to fit the window
      const W = Math.round(page.offsetWidth / 2), H = Math.round(page.offsetHeight / 2);
      cracks.width = W; cracks.height = H;
      const c = cracks.getContext('2d');
      const fr = el.querySelector('.figure').getBoundingClientRect();
      const ox = ((fr.left + fr.width / 2) - pr.left) / z / 2, oy = ((fr.top + fr.height * 0.86) - pr.top) / z / 2;
      const R = rng(1234);
      const line = (pts) => {
        c.fillStyle = 'rgba(160,180,160,.16)';
        for (const [x, y] of pts) c.fillRect(Math.round(x) + 1, Math.round(y) + 1, 1, 1);
        c.fillStyle = 'rgba(4,7,6,.9)';
        for (const [x, y] of pts) c.fillRect(Math.round(x), Math.round(y), 1, 1);
      };
      const crack = (x0, y0, x1, y1, rough) => {
        const n = Math.max(2, Math.hypot(x1 - x0, y1 - y0) | 0);
        const nx = -(y1 - y0) / n, ny = (x1 - x0) / n, len = Math.hypot(nx, ny) || 1;
        const pts = [];
        let off = 0;
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          off = (off + (R() - 0.5) * rough) * 0.93;
          const px = x0 + (x1 - x0) * k + (nx / len) * off, py = y0 + (y1 - y0) * k + (ny / len) * off;
          pts.push([px, py]);
          if (R() < 0.014 && k > 0.15 && k < 0.85) {   // splinter
            const a = Math.atan2(y1 - y0, x1 - x0) + (R() < 0.5 ? -1 : 1) * (0.5 + R());
            const l = 5 + R() * 12, sub = [];
            for (let j = 0; j < l; j++) sub.push([px + Math.cos(a) * j + (R() - 0.5), py + Math.sin(a) * j + (R() - 0.5)]);
            line(sub);
          }
        }
        line(pts);
      };
      el.querySelectorAll('.stage .eq, .stage .box, .goldbox, .badges').forEach((b, i) => {
        if (b.closest('.box') && b.classList.contains('eq')) return;   // the panel gets one crack, not each slot
        const r = b.getBoundingClientRect();
        const tx = ((r.left + r.width / 2) - pr.left) / z / 2, ty = ((r.top + r.height / 2) - pr.top) / z / 2;
        const a = Math.atan2(ty - oy, tx - ox);
        crack(ox + Math.cos(a) * 16, oy + Math.sin(a) * 6, tx, ty, 1.5 + (i % 3) * 0.4);
      });
      for (let i = 0; i < 4; i++) {   // stray fractures under the hero's feet
        const a = R() * Math.PI * 2, l = 24 + R() * 50;
        crack(ox + Math.cos(a) * 12, oy + Math.sin(a) * 5, ox + Math.cos(a) * l, oy + Math.sin(a) * l * 0.45, 1.3);
      }
    };

    // ---- backpack
    const grid = el.querySelector('.grid'), desc = el.querySelector('.info .desc');
    let tab = 'All', focus = 0;
    const packList = () => entries.filter((e) => !e.slot && (tab === 'All' || e.cat === tab));
    const navList = () => { const p = packList(); return p.length ? p : entries.filter((e) => e.slot && (tab === 'All' || e.cat === tab)); };
    const showDesc = (e, note = '') => {
      if (!e) { desc.innerHTML = `<span class="none">${entries.length ? 'Point at an item to examine it.' : 'Your pack is empty.'}</span>`; return; }
      const tags = [];
      if (note) tags.push([note, 'eqp']);
      const verbNow = !acting && !pickAny && verbFor({ text: e.it.text, cat: e.cat });
      if (verbNow) tags.push([`double-click: ${verbNow.label}`, 'n']);
      if (e.slot) tags.push([LABEL[e.slot], 'eqp']);
      tags.push([e.buc, e.buc]);
      if (e.ench) tags.push([e.ench, 'n']);
      if (e.charges) tags.push([`charges ${e.charges}`, 'n']);
      desc.innerHTML = `<span class="di">${icon(e, 32)}</span><kbd>${esc(String.fromCharCode(e.it.ch || 32))}</kbd>
        <b class="${e.buc}">${e.qty ? esc(e.qty) + ' ' : ''}${esc(e.name)}</b>${tags.map(([t, k]) => `<span class="tag ${k}">${esc(t)}</span>`).join('')}
        ${e.status && !e.slot ? `<i>${esc(e.status)}</i>` : ''}`;
    };
    const render = () => {
      el.querySelectorAll('.rail [data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      const list = packList(), nav = navList();
      focus = Math.min(focus, Math.max(0, nav.length - 1));
      const cells = list.map((e) => {
        const idx = entries.indexOf(e);
        return `<button type="button" class="slot ${e.buc}${e.it.selected ? ' sel' : ''}${nav[focus] === e ? ' focus' : ''}" data-i="${idx}" ${!acting && !pickAny ? 'draggable="true"' : ''} role="option" aria-selected="${!!e.it.selected}" aria-label="${esc(e.it.text)}">
          ${icon(e, 48)}<span class="acc">${esc(String.fromCharCode(e.it.ch || 32))}</span>${e.qty ? `<span class="qty">${esc(e.qty)}</span>` : ''}</button>`;
      });
      const total = Math.max(26, Math.ceil(cells.length / 13) * 13);
      grid.innerHTML = cells.join('') + '<span class="slot empty"></span>'.repeat(total - cells.length);
      el.querySelectorAll('.eq[data-i]').forEach((b) => {
        const e = entries[+b.dataset.i];
        b.classList.toggle('sel', !!e.it.selected); b.classList.toggle('focus', nav[focus] === e);
        b.classList.toggle('dim', tab !== 'All' && e.cat !== tab);
      });
      showDesc(nav[focus]);
    };
    const fit = () => {   // the screen is one fixed composition, zoomed to fit the window
      const k = Math.min(1.25, (innerWidth - 24) / 1180, (innerHeight - 24) / 800);
      el.style.setProperty('--k', Math.max(0.45, k).toFixed(3));
      requestAnimationFrame(drawCracks);
    };
    let done = false, clickTimer = null;
    const finish = (sel) => {
      if (done) return;   // a late click (or click + Enter) must not close whatever opened next
      done = true; clearTimeout(clickTimer); clearInterval(tick); window.removeEventListener('resize', fit); ui.closeModal(); resolve(sel);
    };
    const choose = (e) => {
      if (pickNone) { tab = 'All'; focus = Math.max(0, navList().indexOf(e)); render(); return; }
      if (pickAny) { e.it.selected = !e.it.selected; render(); return; }
      finish([{ ident: e.it.ident, count: -1 }]);
    };
    // plain inventory: double-click does the item's natural action (drink, wear, zap...);
    // a single click (delayed a moment to tell them apart) or right-click lists every action
    let hovered = null;
    const quick = (e) => {
      const verb = verbFor({ text: e.it.text, cat: e.cat });
      if (!verb) return choose(e);
      finish(pickNone ? [] : null);
      if (/^[WTPRw]$/.test(verb.key)) ui.reopenInventory = true;   // equipping: come back to see it on
      useItem(ui, { ch: e.it.ch, text: e.it.text, cat: e.cat }, verb);
    };
    el.addEventListener('dblclick', (ev) => {
      const b = ev.target.closest('[data-i]');
      if (!b || b.classList.contains('empty') || acting || pickAny) return;
      clearTimeout(clickTimer); clickTimer = null;
      quick(entries[+b.dataset.i]);
    });
    el.addEventListener('contextmenu', (ev) => {
      const b = ev.target.closest('[data-i]');
      if (!b) return;
      ev.preventDefault();
      if (!b.classList.contains('empty')) choose(entries[+b.dataset.i]);
    });
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-i]');
      if (b && !b.classList.contains('empty')) {
        const e = entries[+b.dataset.i];
        if (acting || pickAny || pickNone) { choose(e); return; }
        clearTimeout(clickTimer); clickTimer = setTimeout(() => { clickTimer = null; choose(e); }, 240);
        return;
      }
      const tb = ev.target.closest('[data-tab]');
      if (tb) { tab = tb.dataset.tab; focus = 0; render(); return; }
      if (ev.target.closest('.x')) finish(pickNone ? [] : null);
      if (ev.target.closest('.confirm')) finish(entries.filter((e) => e.it.selected).map((e) => ({ ident: e.it.ident, count: -1 })));
      if (ev.target.closest('.takeall')) finish(entries.map((e) => ({ ident: e.it.ident, count: -1 })));
      if (ev.target.closest('.anyitem')) { ui.pendingLetter = '*'; finish(null); }
    });
    // leaving the items: number keys go back to the keyboard-focused item
    el.addEventListener('mouseout', (ev) => { if (!ev.relatedTarget || !ev.relatedTarget.closest || !ev.relatedTarget.closest('[data-i]')) hovered = null; });
    el.addEventListener('mouseover', (ev) => {
      const b = ev.target.closest('[data-i]');
      if (!b) return;
      hovered = entries[+b.dataset.i];
      showDesc(entries[+b.dataset.i]);
      if (b.closest('.quick, .quiver') && swingT < 0) swingT = performance.now();
    });
    // ---- drag to equip: pack item onto the character or a slot; worn item back onto the pack
    const plain = !acting && !pickAny;
    const run = (keys, answers) => runAll([{ keys, answers }]);
    const runAll = (steps) => {   // leave this screen, then type the commands; NetHack's questions are pre-answered
      finish(pickNone ? [] : null);
      ui.reopenInventory = true;          // ...and come back here to see the result
      ui.queueCommands(steps);
    };
    const held = (k) => equipped[k] && { ch: equipped[k].it.ch, text: equipped[k].it.text, cat: equipped[k].cat };
    // a second weapon onto the off hand: fight with both, when NetHack would allow it
    const offPlan = (e) => offhandPlan(ui, { ch: e.it.ch, text: e.it.text, cat: e.cat }, { main: held('main'), off: held('off'), alt: held('alt') });
    let drag = null;
    const targets = () => [...el.querySelectorAll('.eq, .figure, .grid')];
    const clearDrop = () => targets().forEach((t) => t.classList.remove('droptarget', 'dropover'));
    el.addEventListener('dragstart', (ev) => {
      const b = ev.target.closest('[data-i]');
      if (!plain || !b) { ev.preventDefault(); return; }
      const e = entries[+b.dataset.i];
      const fromSlot = b.classList.contains('eq') ? b.dataset.slot : null;
      const act = fromSlot ? null : equipAction(e);
      const plan = (!fromSlot || fromSlot === 'alt') && act?.key !== 'W' ? offPlan(e) : null;
      if (!fromSlot && !act && !b.closest('.grid')) { ev.preventDefault(); return; }
      if (fromSlot === 'alt' && !plan) { ev.preventDefault(); return; }
      drag = { e, fromSlot, act, plan };
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(e.it.ch));
      requestAnimationFrame(() => {
        if (plan) el.querySelector('.s-off').classList.add('droptarget');
        if (fromSlot === 'alt') return;
        if (fromSlot) el.querySelector('.grid').classList.add('droptarget');
        else {
          el.querySelector('.s-quiver').classList.add('droptarget');
          if (act) { el.querySelector('.figure').classList.add('droptarget'); act.slots.forEach((k) => el.querySelector('.s-' + k)?.classList.add('droptarget')); }
        }
      });
    });
    const dropZone = (ev) => {
      if (!drag) return null;
      const z = ev.target.closest('.eq, .figure, .grid');
      return z && z.classList.contains('droptarget') ? z : null;
    };
    el.addEventListener('dragover', (ev) => {
      const z = dropZone(ev);
      el.querySelectorAll('.dropover').forEach((x) => { if (x !== z) x.classList.remove('dropover'); });
      if (!z) return;
      ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; z.classList.add('dropover');
    });
    el.addEventListener('dragend', () => { drag = null; clearDrop(); });
    el.addEventListener('drop', (ev) => {
      const z = dropZone(ev), d = drag;
      drag = null; clearDrop();
      if (!z || !d) return;
      ev.preventDefault();
      const letter = String.fromCharCode(d.e.it.ch);
      if (z.dataset.slot === 'off' && d.plan) { runAll(d.plan); return; }
      if (d.fromSlot === 'off' && d.e.cat && catKey(d.e.cat) === 'Weapons') { runAll([{ ext: 'twoweapon' }]); return; }   // back to one weapon
      if (d.fromSlot) {   // take it off / unwield / empty the quiver
        const keys = unequipKeys(d.fromSlot);
        // w - / Q -: "What do you want to wield?" answered with "-" (bare hands / empty quiver)
        if (keys) run([keys[0]], keys.length > 1 ? [{ re: /wield|ready|quiver/i, key: keys[1] }] : [{ re: /take off|remove/i, key: letter }]);
        return;
      }
      if (z.dataset.slot === 'quiver') { run(['Q'], [{ re: /ready|quiver/i, key: letter }]); return; }
      const hand = z.dataset.slot === 'ringL' ? 'l' : z.dataset.slot === 'ringR' ? 'r' : null;
      run([d.act.key], [{ re: /wield|wear|put on/i, key: letter }, ...(hand ? [{ re: /ring-finger|which hand/i, key: hand }] : [])]);
    });
    if (plain) {
      el.querySelectorAll('.eq[data-i]').forEach((b) => { if (unequipKeys(b.dataset.slot) || (b.dataset.slot === 'alt' && offPlan(entries[+b.dataset.i]))) b.draggable = true; });
      el.classList.add('can-drag');
    }

    window.addEventListener('resize', fit);
    render();
    ui.openModal(el, (ev) => {
      if (ev.key === 'Escape') return finish(pickNone ? [] : null);
      // modern controls: I toggles the inventory like in other games (the item lettered i is a click away)
      if (!acting && !pickAny && ui.controls.on && (ev.key === 'i' || ev.key === 'I')) return finish(pickNone ? [] : null);
      const nav = navList();
      const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -13, ArrowDown: 13 }[ev.key];
      if (move) { focus = Math.max(0, Math.min(nav.length - 1, focus + move)); render(); return; }
      if (ev.key === 'Tab') { tab = tabsList[(tabsList.indexOf(tab) + (ev.shiftKey ? tabsList.length - 1 : 1)) % tabsList.length]; focus = 0; render(); return; }
      if (ev.key === 'Enter' || ev.key === ' ') {
        if (pickNone) return finish([]);
        if (pickAny) return finish(entries.filter((e) => e.it.selected).map((e) => ({ ident: e.it.ident, count: -1 })));
        if (nav[focus]) return choose(nav[focus]);
        return;
      }
      // 1-9: put the item under the mouse (or the focused one) on the quickbar
      if (!acting && !pickAny && /^[1-9]$/.test(ev.key) && ui.quickbar) {
        const e = hovered || navList()[focus];
        if (e) { ui.quickbar.assign(+ev.key, { kind: 'item', ch: e.it.ch, text: e.it.text, cat: e.cat, glyph: e.it.glyph, name: e.name }); showDesc(e, `On the quickbar: ${ev.key}`); }
        return;
      }
      if (pickAny && ev.key === ',') { const all = !entries.every((e) => e.it.selected); entries.forEach((e) => { e.it.selected = all; }); render(); return; }
      if (ev.key.length === 1) {
        const code = ev.key.charCodeAt(0);
        const e = entries.find((x) => x.it.ch === code) || entries.find((x) => x.it.gch === code);
        if (e) choose(e); else if (pickNone) finish([]);
        // NetHack accepts any item, not just the ones it suggests ("throw that potion"): pass the letter on
        else if (acting && ui.game && ui.game.autoPicking && (ui.game.inventory || []).some((it) => it.ch === code)) { ui.pendingLetter = ev.key; finish(null); }
        return;
      }
      return false;
    });
    fit();
    if (document.fonts) document.fonts.ready.then(() => requestAnimationFrame(drawCracks));
  });
}
