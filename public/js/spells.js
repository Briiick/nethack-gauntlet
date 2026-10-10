// Spell cards: NetHack's spell menus ("Choose which spell to cast", "Currently known spells") as
// a row of cards (school colour and icon, level, failure chance, retention) instead of a text
// table. Click a card or press its letter; Esc cancels. Same choice NetHack would get.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SCHOOL = {
  attack: { col: '#e0503c', icon: 'M12 2 9 9H3l5 4-2 8 6-5 6 5-2-8 5-4h-6z' },
  healing: { col: '#58c060', icon: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z' },
  divination: { col: '#58a0f0', icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  enchantment: { col: '#e070c0', icon: 'M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z' },
  clerical: { col: '#e0b040', icon: 'M11 2h2v6h6v2h-6v12h-2V10H5V8h6z' },
  escape: { col: '#c8e4f0', icon: 'M4 12h12M12 6l6 6-6 6M20 4v16' },
  matter: { col: '#b08050', icon: 'M12 2 21 7v10l-9 5-9-5V7zm0 0v20M3 7l9 5 9-5' },
};

export const isSpellMenu = (menu) => /spell to cast|Currently known spells/i.test(menu.prompt || '');

function parse(text) {
  const t = text.split('\t').length >= 5 ? text.split('\t').map((s) => s.trim()) : null;
  const m = t ? [null, ...t] : text.match(/^(.*?)\s{2,}(\d+)\s+(\S+)\s+(\d+)%\s+(\S.*?)\s*$/);
  if (!m) return { name: text.trim() };
  return { name: m[1].trim(), level: +m[2], school: m[3].toLowerCase(), fail: parseInt(m[4], 10), retention: m[5].trim() };
}

export function spellCards(ui, menu, how) {
  return new Promise((resolve) => {
    const spells = menu.items.filter((it) => !it.header && it.ident !== 0).map((it) => ({ it, ...parse(it.text) }));
    const el = document.createElement('div');
    el.className = 'panel spells';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', menu.prompt);
    const failCol = (f) => (f <= 10 ? '#7ad070' : f <= 40 ? '#e8c050' : '#ff6a50');
    el.innerHTML = `<h2>${esc(/cast/i.test(menu.prompt) ? 'Cast a spell' : 'Your spells')}</h2>
      <div class="cards">${spells.map((s, i) => {
        const sc = SCHOOL[s.school] || { col: '#a8957a', icon: 'M5 4h12l2 2v14H5z' };
        const ret = (String(s.retention).match(/\d+/g) || []).map(Number);
        const keep = ret.length ? Math.max(...ret) : 100;
        return `<button type="button" class="card${s.it.selected ? ' sel' : ''}" data-i="${i}" style="--sc:${sc.col}">
          <span class="key">${esc(String.fromCharCode(s.it.ch || 32))}</span>
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="${sc.icon}"/></svg>
          <b class="nm">${esc(s.name)}</b>
          <span class="meta">${s.level ? `Level ${s.level} · ` : ''}${esc(s.school || '')}</span>
          ${s.fail !== undefined ? `<span class="fail" style="color:${failCol(s.fail)}">${s.fail}%<small> fail</small></span>` : ''}
          ${s.retention ? `<span class="ret" title="Memory of this spell: ${esc(s.retention)}"><i style="width:${Math.min(100, keep)}%"></i></span>` : ''}
        </button>`;
      }).join('')}</div>
      <div class="foot">${how === 0 ? 'Press any key to close' : '<kbd>letter</kbd> or click to cast · point at a spell and press <kbd>1</kbd>–<kbd>9</kbd> for the quickbar · <kbd>Esc</kbd> cancel'}</div>`;
    const finish = (sel) => { ui.closeModal(); resolve(sel); };
    const choose = (s) => finish(how === 0 ? [] : [{ ident: s.it.ident, count: -1 }]);
    el.addEventListener('click', (e) => { const b = e.target.closest('.card'); if (b) choose(spells[+b.dataset.i]); });
    let hovered = null;
    el.addEventListener('mouseover', (e) => { const b = e.target.closest('.card'); if (b) hovered = spells[+b.dataset.i]; });
    ui.openModal(el, (e) => {
      if (e.key === 'Escape') return finish(how === 0 ? [] : null);
      if (/^[1-9]$/.test(e.key) && hovered && ui.quickbar) {   // put the spell under the mouse on the quickbar
        ui.quickbar.assign(+e.key, { kind: 'spell', letter: String.fromCharCode(hovered.it.ch), name: hovered.name, school: hovered.school });
        el.querySelector('.foot').textContent = `${hovered.name} is on the quickbar: ${e.key}`;
        return;
      }
      if (how === 0) return finish([]);
      if (e.key.length === 1) { const s = spells.find((x) => x.it.ch === e.key.charCodeAt(0)); if (s) choose(s); return; }
      return false;
    });
  });
}
