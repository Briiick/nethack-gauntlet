// Quickbar: nine slots along the bottom of the screen. Put an item there (hover it in the
// inventory and press 1-9) or a spell (hover its card and press 1-9); the number key, or a click,
// then uses it the natural way (drink, read, zap, eat, wear/take off, wield, cast...).
// Slots are remembered per character.
import { verbFor, useItem, castSpell } from './actions.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const baseName = (t) => String(t || '').replace(/^(a|an|the|\d+)\s+/i, '').replace(/\b(uncursed|blessed|cursed)\s+/i, '').replace(/^[+-]\d+\s+/, '').replace(/\s*\(.*\)\s*$/, '').trim();
const buc = (t) => ((String(t).match(/\b(uncursed|blessed|cursed)\b/) || [])[1] || '');
const SPELL_COL = { attack: '#e0503c', healing: '#58c060', divination: '#58a0f0', enchantment: '#e070c0', clerical: '#e0b040', escape: '#c8e4f0', matter: '#b08050' };

export class Quickbar {
  constructor(ui) {
    this.ui = ui; ui.quickbar = this;
    this.slots = Array(10).fill(null);
    this.el = document.createElement('nav');
    this.el.id = 'quickbar'; this.el.setAttribute('aria-label', 'Quickbar'); this.el.hidden = true;
    this.el.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) this.use(+b.dataset.n); });
    this.el.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-n]'); if (b) { e.preventDefault(); this.clear(+b.dataset.n); } });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.getElementById('stage').appendChild(this.el);
    addEventListener('resize', () => this.place());
  }

  // centred along the bottom, but never under the character panel on the left
  place() {
    if (this.el.hidden) return;
    const plate = document.getElementById('plate'), stage = document.getElementById('stage');
    const w = this.el.offsetWidth, sw = stage.clientWidth;
    let left = (sw - w) / 2;
    if (plate && plate.offsetParent) left = Math.max(left, plate.getBoundingClientRect().right - stage.getBoundingClientRect().left + 12);
    this.el.style.left = Math.round(Math.min(left, sw - w - 8)) + 'px';
  }

  get on() { return this.ui.settings.quickbar !== false; }
  storeKey() { return 'nhg-quickbar-' + (this.ui.playerName || 'hero'); }
  load() {
    try { const s = JSON.parse(localStorage.getItem(this.storeKey()) || 'null'); if (Array.isArray(s)) this.slots = s.concat(Array(10).fill(null)).slice(0, 10); } catch (e) { /* none */ }
    this.render();
  }
  save() { try { localStorage.setItem(this.storeKey(), JSON.stringify(this.slots)); } catch (e) { /* private mode */ } }
  show(on) { this.el.hidden = !(on && this.on); document.body.classList.toggle('has-quickbar', !this.el.hidden); this.place(); }

  assign(n, entry) {
    for (let i = 1; i <= 9; i++) if (this.slots[i] && entry && this.same(this.slots[i], entry)) this.slots[i] = null;   // one slot per thing
    this.slots[n] = entry; this.save(); this.render();
  }
  clear(n) { this.slots[n] = null; this.save(); this.render(); }
  same(a, b) { return a.kind === b.kind && (a.kind === 'spell' ? a.name === b.name : baseName(a.text) === baseName(b.text)); }

  // After every inventory change: follow items to their current letter, grey out what's gone.
  refresh(items) {
    if (!items) return;
    const inv = []; let cat = '';
    for (const it of items) { if (it.header || it.ident === 0) { cat = it.text.trim(); continue; } inv.push({ ...it, cat }); }
    for (const s of this.slots) {
      if (!s || s.kind !== 'item') continue;
      const name = baseName(s.text);
      // the same thing, never quietly a cursed one standing in for an uncursed one (or the other way round)
      const same = (it) => baseName(it.text) === name && (!buc(s.text) || !buc(it.text) || buc(it.text) === buc(s.text));
      const hit = inv.find((it) => it.ch === s.ch && same(it)) || inv.find(same);
      if (hit) Object.assign(s, { ch: hit.ch, text: hit.text, glyph: hit.glyph, cat: hit.cat, gone: false });
      else s.gone = true;
    }
    this.save(); this.render();
  }

  use(n) {
    const s = this.slots[n], ui = this.ui;
    // only at the command prompt (not a --More-- pause, a prompt, or while picking a spot)
    if (!s || !ui.waiter || !ui.waiter.allowClick || ui.modal || ui.isTargeting || !document.getElementById('more').hidden || (ui.game && ui.game.over)) return false;
    if (s.kind === 'spell') { castSpell(ui, s.letter); return true; }
    if (s.gone) { ui.message(`You don't have ${s.name || baseName(s.text)} any more.`); return true; }
    const verb = verbFor(s);
    if (!verb) { ui.message(`${baseName(s.text)}: nothing to do with it from the quickbar.`); return true; }
    if (/^[WTPRw]$/.test(verb.key)) ui.reopenInventory = false;
    useItem(ui, s, verb);
    return true;
  }

  render() {
    const qty = (t) => (String(t || '').match(/^(\d+) /) || [])[1];
    this.el.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
      const s = this.slots[n];
      let body = '', title = `Slot ${n}: empty (hover an item in the inventory or a spell card and press ${n})`;
      if (s && s.kind === 'item') {
        const verb = verbFor(s);
        body = `${this.ui.itemIcon(s.glyph, 32)}${qty(s.text) ? `<span class="q">${qty(s.text)}</span>` : ''}`;
        title = `${n}: ${verb ? verb.label + ' ' : ''}${baseName(s.text)}${s.gone ? ' (gone)' : ''}`;
      } else if (s && s.kind === 'spell') {
        body = `<span class="sp" style="--sc:${SPELL_COL[s.school] || '#a8957a'}">${esc((s.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>`;
        title = `${n}: cast ${s.name}`;
      }
      return `<button type="button" data-n="${n}" class="${s ? '' : 'empty'}${s && s.gone ? ' gone' : ''}" title="${esc(title)}" aria-label="${esc(title)}">${body}<kbd>${n}</kbd></button>`;
    }).join('');
    this.place();
  }
}
