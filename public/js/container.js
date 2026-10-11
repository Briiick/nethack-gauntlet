// The loot screen: a container's contents beside your pack. Click (or tap) things on either side
// to mark them, then one button takes out and puts in everything marked. Double-click moves a
// single item straight away. Keys: your inventory letters mark pack items, "," takes everything,
// Enter confirms, Esc cancels. Used by loot.js, on the desktop and on phones alike.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const qty = (t) => (String(t).match(/^(\d+) /) || [])[1];
const buc = (t) => (/\buncursed\b/.test(t) ? 'uncursed' : /\bblessed\b/.test(t) ? 'blessed' : /\bcursed\b/.test(t) ? 'cursed' : '');
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());

// opts: { title, contents: [menu item], pack: [{ it, locked }], canTake, canPut, empty }
// -> Promise<{ take: [ident], put: [inventory letter] } | null>
export function lootScreen(ui, opts) {
  return new Promise((resolve) => {
    const { contents, pack } = opts;
    const take = new Set(), put = new Set();
    let done = false, info = null;
    const name = opts.title || 'the container';

    const el = document.createElement('div');
    el.className = 'panel loot sheet';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `Loot ${name}`);
    el.innerHTML = `
      <header><h2>${esc(cap(name))}</h2><button type="button" class="x" aria-label="Close">✕</button></header>
      <div class="cols">
        <section class="side inside"><h3>Inside <small></small></h3><div class="lgrid" role="listbox" aria-multiselectable="true" aria-label="Inside ${esc(name)}"></div></section>
        <div class="arrows" aria-hidden="true"><span>→</span><span>←</span></div>
        <section class="side mine"><h3>Your pack <small></small></h3><div class="lgrid" role="listbox" aria-multiselectable="true" aria-label="Your pack"></div></section>
      </div>
      <p class="linfo"></p>
      <footer class="foot">
        <button type="button" class="sbtn takeall"${contents.length ? '' : ' disabled'}>Take all</button>
        <span class="grow"></span>
        <button type="button" class="sbtn cancel">Cancel</button>
        <button type="button" class="sbtn primary-ish go">Done</button>
      </footer>`;
    const [gIn, gMine] = el.querySelectorAll('.lgrid');
    const linfo = el.querySelector('.linfo'), go = el.querySelector('.go');

    const cell = (it, side, marked, locked) => `<button type="button" class="lcell ${buc(it.text)}${marked ? ' marked' : ''}${locked ? ' locked' : ''}" data-side="${side}" data-k="${side === 'in' ? it.ident : it.ch}"
      title="${esc(it.text)}" aria-label="${esc(it.text)}" aria-selected="${marked}"${locked ? ' aria-disabled="true"' : ''}>
      ${ui.itemIcon(it.glyph, 48)}${qty(it.text) ? `<span class="qty">${qty(it.text)}</span>` : ''}${side === 'mine' && it.ch ? `<span class="acc">${esc(String.fromCharCode(it.ch))}</span>` : ''}${marked ? `<span class="mv">${side === 'in' ? 'take' : 'put in'}</span>` : ''}</button>`;
    const render = () => {
      gIn.innerHTML = contents.map((it) => cell(it, 'in', take.has(it.ident), false)).join('')
        || `<p class="none">${opts.empty ? 'Empty.' : 'Nothing to take.'}</p>`;
      gMine.innerHTML = opts.canPut ? pack.map((e) => cell(e.it, 'mine', put.has(e.it.ch), e.locked)).join('') || '<p class="none">Nothing to put in.</p>'
        : '<p class="none">Nothing to put in.</p>';
      el.querySelector('.inside small').textContent = contents.length ? `${contents.length}` : '';
      el.querySelector('.mine small').textContent = put.size ? `${put.size} to put in` : '';
      const parts = [take.size && `Take ${take.size}`, put.size && `Put in ${put.size}`].filter(Boolean);
      go.textContent = parts.length ? parts.join(' · ') : 'Done';
      linfo.innerHTML = info ? esc(info) : `${opts.canTake && contents.length ? 'Tap things to take' : ''}${opts.canTake && contents.length && opts.canPut ? ' or ' : ''}${opts.canPut ? (opts.canTake && contents.length ? 'to put in' : 'Tap things to put in') : ''}, then ${parts.length ? 'press the button' : 'Done'}.`;
    };
    const finish = (v) => { if (done) return; done = true; ui.closeModal(); resolve(v); };
    const confirm = () => finish({ take: [...take], put: [...put] });
    const toggle = (side, k) => {
      if (side === 'in') { const it = contents.find((x) => x.ident === k); if (!it) return; take.has(k) ? take.delete(k) : take.add(k); info = it.text; }
      else { const e = pack.find((x) => x.it.ch === k); if (!e) return; if (e.locked) { info = `${e.it.text}: take it off first.`; render(); return; } put.has(k) ? put.delete(k) : put.add(k); info = e.it.text; }
      render();
    };

    let clickT = null;
    el.addEventListener('click', (ev) => {
      const t = ev.target;
      if (t.closest('.x') || t.closest('.cancel')) return finish(null);
      if (t.closest('.go')) return confirm();
      if (t.closest('.takeall')) { contents.forEach((it) => take.add(it.ident)); return confirm(); }
      const c = t.closest('.lcell');
      if (c) toggle(c.dataset.side, +c.dataset.k);
    });
    // double-click: move just this one, now
    el.addEventListener('dblclick', (ev) => {
      const c = ev.target.closest('.lcell');
      if (!c || c.classList.contains('locked')) return;
      clearTimeout(clickT);
      const k = +c.dataset.k;
      if (c.dataset.side === 'in') finish({ take: [k], put: [] }); else finish({ take: [], put: [k] });
    });
    el.addEventListener('mouseover', (ev) => {
      const c = ev.target.closest('.lcell');
      if (c) { linfo.textContent = c.getAttribute('aria-label'); }
    });

    render();
    ui.openModal(el, (ev) => {
      if (ev.key === 'Escape') return finish(null);
      if (ev.key === 'Enter') return confirm();
      if (ev.key === ',' && contents.length) { contents.forEach((it) => take.add(it.ident)); return confirm(); }
      if (ev.key.length === 1 && opts.canPut) {
        const code = ev.key.charCodeAt(0);
        if (pack.some((e) => e.it.ch === code)) toggle('mine', code);
        return;
      }
      return false;
    });
  });
}
