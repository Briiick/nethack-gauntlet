// The backpack on a phone, Pixel Dungeon style: what you have on, then a grid of everything else,
// filtered by kind. Tap an item to see it with buttons for what to do; when NetHack asks for an
// item ("What do you want to drop?") a tap answers; when it lets you take several (picking up,
// dropping many) taps mark them and Confirm sends the lot.
import { equipmentOf } from '../../js/inventory.js';
import { verbFor, useItem } from '../../js/actions.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SLOTS = ['main', 'off', 'alt', 'quiver', 'body', 'cloak', 'shirt', 'head', 'hands', 'feet', 'neck', 'ringL', 'ringR', 'eyes'];
const SLOT_NAME = { main: 'weapon', off: 'off hand', alt: 'swap weapon', quiver: 'quiver', body: 'armour', cloak: 'cloak', shirt: 'shirt', head: 'helmet',
  hands: 'gloves', feet: 'boots', neck: 'amulet', ringL: 'left ring', ringR: 'right ring', eyes: 'eyes' };
const TAB = (c) => (/^coins/i.test(c) ? 'Gold' : /weapon/i.test(c) ? 'Weapons' : /armou?r/i.test(c) ? 'Armour' : /comestible/i.test(c) ? 'Food'
  : /scroll|spellbook/i.test(c) ? 'Scrolls & books' : /potion/i.test(c) ? 'Potions' : /ring|amulet/i.test(c) ? 'Rings & amulets'
    : /wand/i.test(c) ? 'Wands' : /tool/i.test(c) ? 'Tools' : /gem|stone/i.test(c) ? 'Gems' : c);

function parse(it, cat) {
  const t = it.text;
  const qty = (t.match(/^(\d+) /) || [])[1];
  const buc = /\buncursed\b/.test(t) ? 'uncursed' : /\bblessed\b/.test(t) ? 'blessed' : /\bcursed\b/.test(t) ? 'cursed' : '';
  return { it, cat, tab: TAB(cat), qty, buc };
}

export function backpack(ui, menu, how) {
  return new Promise((resolve) => {
    const entries = []; let cat = 'Items';
    for (const it of menu.items) {
      if (it.header || it.ident === 0) { cat = it.text.trim(); continue; }
      entries.push(parse(it, cat));
    }
    // what's worn or wielded (by the same reading of the item text as the desktop screen)
    const eq = equipmentOf(menu.items);
    const worn = new Map();
    for (const k of SLOTS) if (eq[k]) { const e = entries.find((x) => x.it.text === eq[k].text && !worn.has(x)); if (e) worn.set(e, k); }

    const pickAny = how === 2, pickNone = how === 0;
    const asked = menu.prompt || menu.context || '';
    const prompt = asked && !/^\s*inventory:?\s*$/i.test(asked) ? asked.replace(/\s*\[[^\]]*\]\s*$/, '') : '';
    const acting = !!prompt && !pickNone;
    const tabs = ['All', ...new Set(entries.map((e) => e.tab))];
    let tab = 'All', sel = null, done = false;

    const el = document.createElement('div');
    el.className = 'panel bag sheet' + (acting ? ' acting' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', asked || 'Inventory');
    el.innerHTML = `
      <header><h2>${esc(prompt || 'Backpack')}</h2><button type="button" class="x" aria-label="Close">✕</button></header>
      ${acting ? `<p class="ask">${pickAny ? 'Tap to mark, then Confirm' : 'Tap an item to choose it'}</p>` : ''}
      <nav class="tabs">${tabs.map((t) => `<button type="button" data-tab="${esc(t)}">${esc(t)}</button>`).join('')}</nav>
      <div class="cells" role="listbox" ${pickAny ? 'aria-multiselectable="true"' : ''}></div>
      <section class="detail" hidden></section>
      <footer class="foot"></footer>`;
    const cells = el.querySelector('.cells'), detail = el.querySelector('.detail'), foot = el.querySelector('.foot');

    const finish = (v) => { if (done) return; done = true; ui.closeModal(); resolve(v); };
    const cancel = () => finish(pickNone ? [] : null);
    const chosen = () => entries.filter((e) => e.it.selected).map((e) => ({ ident: e.it.ident, count: -1 }));

    const cell = (e) => {
      const i = entries.indexOf(e), slot = worn.get(e);
      return `<button type="button" class="cell ${e.buc}${slot ? ' worn' : ''}${e.it.selected ? ' marked' : ''}${sel === e ? ' on' : ''}" data-i="${i}" aria-label="${esc(e.it.text)}">
        ${ui.itemIcon(e.it.glyph, 48)}${e.qty ? `<span class="qty">${esc(e.qty)}</span>` : ''}${slot ? `<span class="eqp">${esc(SLOT_NAME[slot])}</span>` : ''}${e.it.selected ? '<span class="tick">✓</span>' : ''}</button>`;
    };
    const render = () => {
      el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      const list = entries.filter((e) => tab === 'All' || e.tab === tab);
      const on = list.filter((e) => worn.has(e)), rest = list.filter((e) => !worn.has(e));
      cells.innerHTML = (on.length ? `<h3>Equipped</h3><div class="grid">${on.map(cell).join('')}</div>` : '')
        + (rest.length ? `${on.length ? '<h3>Pack</h3>' : ''}<div class="grid">${rest.map(cell).join('')}</div>` : '')
        + (!list.length ? '<p class="none">Nothing here.</p>' : '');
      const n = chosen().length;
      foot.innerHTML = pickAny
        ? `<button type="button" class="sbtn" data-f="all">All</button><span class="grow"></span><button type="button" class="sbtn" data-f="cancel">Cancel</button><button type="button" class="sbtn primary-ish" data-f="ok"${n ? '' : ' disabled'}>Confirm${n ? ` (${n})` : ''}</button>`
        : acting ? `${ui.game && ui.game.autoPicking ? '<button type="button" class="sbtn" data-f="any">Any item…</button>' : ''}<span class="grow"></span><button type="button" class="sbtn" data-f="cancel">Cancel</button>`
          : '';
      foot.hidden = !foot.innerHTML;
      showDetail();
    };
    const showDetail = () => {
      if (!sel || acting || pickAny) { detail.hidden = true; return; }
      const e = sel, slot = worn.get(e), verb = !pickNone && verbFor({ text: e.it.text, cat: e.cat });
      detail.hidden = false;
      detail.innerHTML = `<div class="what">${ui.itemIcon(e.it.glyph, 48)}<div><b class="${e.buc}">${esc(e.it.text)}</b><small>${esc(e.cat)}${slot ? ' · ' + esc(SLOT_NAME[slot]) : ''}</small></div></div>
        ${pickNone ? '' : `<div class="do">${verb ? `<button type="button" class="sbtn primary-ish" data-f="use">${esc(verb.label)}</button>` : ''}
          <button type="button" class="sbtn" data-f="actions">All actions…</button>
          <button type="button" class="sbtn" data-f="quick">Quick slot</button></div>
          <div class="qpick" hidden>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="sbtn" data-q="${n}">${n}</button>`).join('')}</div>`}`;
    };

    el.addEventListener('click', (ev) => {
      const t = ev.target;
      if (t.closest('.x')) return cancel();
      const tb = t.closest('[data-tab]');
      if (tb) { tab = tb.dataset.tab; render(); return; }
      const c = t.closest('.cell');
      if (c) {
        const e = entries[+c.dataset.i];
        if (pickAny) { e.it.selected = !e.it.selected; render(); return; }
        if (acting) { finish([{ ident: e.it.ident, count: -1 }]); return; }
        sel = sel === e ? null : e; render();
        if (sel) detail.scrollIntoView({ block: 'nearest' });
        return;
      }
      const f = t.closest('[data-f]')?.dataset.f;
      if (f === 'cancel') return cancel();
      if (f === 'ok') return finish(chosen());
      if (f === 'all') { const all = !entries.every((e) => e.it.selected); entries.forEach((e) => { e.it.selected = all; }); render(); return; }
      if (f === 'any') { ui.pendingLetter = '*'; return finish(null); }
      if (f === 'actions' && sel) return finish([{ ident: sel.it.ident, count: -1 }]);   // NetHack's "Do what with ...?"
      if (f === 'use' && sel) {
        const verb = verbFor({ text: sel.it.text, cat: sel.cat });
        const it = sel;
        finish(null);
        if (/^[WTPRw]$/.test(verb.key)) ui.reopenInventory = true;   // come back to see it on
        useItem(ui, { ch: it.it.ch, text: it.it.text, cat: it.cat }, verb);
        return;
      }
      if (f === 'quick') { const q = detail.querySelector('.qpick'); q.hidden = !q.hidden; return; }
      const q = t.closest('[data-q]');
      if (q && sel) {
        const name = sel.it.text.replace(/^(a|an|the|\d+)\s+/i, '').replace(/\s*\(.*\)\s*$/, '');
        ui.quickbar.assign(+q.dataset.q, { kind: 'item', ch: sel.it.ch, text: sel.it.text, cat: sel.cat, glyph: sel.it.glyph, name });
        ui.hud?.flash(`Quick slot ${q.dataset.q}: ${name}`);
        detail.querySelector('.qpick').hidden = true;
      }
    });

    render();
    ui.openModal(el, (ev) => {
      if (ev.key === 'Escape') return cancel();
      if (ev.key === 'Enter' && pickAny) return finish(chosen());
      if (ev.key.length === 1) {   // a hardware keyboard still works
        const code = ev.key.charCodeAt(0);
        const e = entries.find((x) => x.it.ch === code);
        if (e && pickAny) { e.it.selected = !e.it.selected; render(); return; }
        if (e && acting) return finish([{ ident: e.it.ident, count: -1 }]);
        if (e) { sel = e; render(); }
        return;
      }
      return false;
    });
  });
}
