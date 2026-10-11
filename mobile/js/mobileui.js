// The desktop UI with phone manners: menus become bottom sheets with real buttons (no keyboard to
// press Enter or Esc with), yes/no questions get words, picking a spot is a tap, and the
// inventory is a Pixel Dungeon-style backpack.
import { UI } from '../../js/ui.js';
import { isInventoryMenu } from '../../js/inventory.js';
import { isSpellMenu } from '../../js/spells.js';
import { backpack } from './bag.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const key = (k) => dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === 'Escape' ? 'Escape' : '', bubbles: true }));

// what a letter means in NetHack's usual questions
const WORDS = { y: 'Yes', n: 'No', q: 'Cancel', a: 'All', '\x1b': 'Cancel' };

export class MobileUI extends UI {
  onPointer() { /* the touch layer (touch.js) owns the map */ }

  // ---- menus: a sheet that rises from the bottom, with buttons for what keys did
  menu(menu, how) {
    if (isSpellMenu(menu) && this.settings.spellCards !== false) return super.menu(menu, how);
    if (isInventoryMenu(menu, this.tiles)) return backpack(this, menu, how);
    const p = super.menu(menu, how);
    const el = this.modal && this.modal.el;
    if (el && el.classList.contains('menu')) {
      el.classList.add('sheet');
      const foot = el.querySelector('.foot');
      const pickAny = how === 2;
      foot.innerHTML = how === 0 ? '<button type="button" class="sbtn primary-ish" data-key="Escape">Close</button>'
        : `${pickAny ? '<button type="button" class="sbtn" data-key=",">All</button>' : ''}<span class="grow"></span><button type="button" class="sbtn" data-key="Escape">Cancel</button>${pickAny ? '<button type="button" class="sbtn primary-ish" data-key="Enter">Confirm</button>' : ''}`;
      foot.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) key(b.dataset.key); });
      if (how === 0) el.querySelector('.items').addEventListener('click', () => key('Escape'));
    }
    return p;
  }

  textWindow(lines, opts) {
    const p = super.textWindow(lines, opts);
    const el = this.modal && this.modal.el;
    if (el && el.classList.contains('text')) {
      el.classList.add('sheet');
      el.querySelector('.foot').textContent = 'Tap to close';
    }
    return p;
  }

  getline(query) {
    const p = super.getline(query);
    const el = this.modal && this.modal.el;
    if (el) {
      el.classList.add('sheet');
      el.querySelector('.foot').innerHTML = '<span class="grow"></span><button type="button" class="sbtn" data-key="Escape">Cancel</button><button type="submit" class="sbtn primary-ish">OK</button>';
      el.querySelector('.foot').addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) key(b.dataset.key); });
    }
    return p;
  }

  extCommand(cmds) {
    const p = super.extCommand(cmds);
    const el = this.modal && this.modal.el;
    if (el && el.classList.contains('ext')) {
      el.classList.add('sheet');
      el.querySelector('.foot').innerHTML = '<span class="grow"></span><button type="button" class="sbtn" data-key="Escape">Cancel</button><button type="submit" class="sbtn primary-ish">Run</button>';
      el.querySelector('.foot').addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) key(b.dataset.key); });
    }
    return p;
  }

  // ---- questions: buttons that say what they do
  yn(query, resp, def) {
    const p = super.yn(query, resp, def);
    if (this.prompt.hidden) return p;   // answered in advance
    let opts = resp ? resp.split('\x1b')[0].replace(/[^ -~]/g, '') : '';
    // NetHack often lists the answers in the question itself: "... for you? [ynaq]"
    const inQ = !opts && $('#compass').hidden && (query.match(/\[([A-Za-z]{2,8})\](?:\s*\(.\))?\s*$/) || [])[1];
    if (inQ) {
      opts = inQ;
      this.prompt.querySelector('.q').insertAdjacentHTML('afterend', `<span class="opts">${[...inQ].map((c) => `<button type="button" data-k="${esc(c)}">${esc(c)}</button>`).join('')}</span>`);
    }
    const plainYN = /^[ynq]+$/.test(opts);
    this.prompt.querySelectorAll('.opts button').forEach((b) => {
      const k = b.dataset.k;
      if (plainYN || k === 'y' || k === 'n') b.innerHTML = esc(WORDS[k] || k);
      else if (WORDS[k] && /\[[^\]]*\]/.test(query)) b.innerHTML = `<b>${esc(k)}</b> ${esc(WORDS[k])}`;
    });
    // there's no Esc key on a phone
    if (!this.prompt.querySelector('[data-k="\x1b"]') && !(opts.includes('q') || (plainYN && opts.includes('n')))) {
      const box = this.prompt.querySelector('.opts') || this.prompt;
      box.insertAdjacentHTML('beforeend', '<button type="button" class="cancel" data-k="\x1b">Cancel</button>');
    }
    this.prompt.classList.toggle('dir', !$('#compass').hidden);
    return p;
  }

  async more() {
    $('#more').hidden = false;
    document.body.classList.add('at-more');
    await this.waitKey();
    $('#more').hidden = true;
    document.body.classList.remove('at-more');
  }

  // picking a spot: tap it
  targeting(on) {
    if (on === this.isTargeting) return;
    this.isTargeting = on;
    let el = $('#target-hint');
    if (!el) {
      el = document.createElement('div'); el.id = 'target-hint'; el.setAttribute('role', 'status');
      el.innerHTML = '<span>Tap a spot to choose it</span><button type="button" class="sbtn">Cancel</button>';
      el.querySelector('button').addEventListener('click', () => this.pushKey(27));
      $('#stage').appendChild(el);
    }
    el.hidden = !on;
    document.body.classList.toggle('targeting', on);
  }

  bell() { try { navigator.vibrate?.(30); } catch (e) { /* no haptics */ } super.bell?.(); }

  message(text, attr, o) {
    // NetHack won't rest or search with a monster beside you unless you insist with the m prefix,
    // which a phone has no key for: the Search button insists when pressed again
    text = String(text).replace(/\s*Use '[^']*' prefix to force (a no-op \(to rest\)|another search)\./, ' Tap Search again to do it anyway.');
    super.message(text, attr, o);
    if (!o || !o.history) this.onMessage?.(text);
  }

  applySettings() {
    super.applySettings();
    this.hud?.layout();
  }
}
