// Settings screen: Display, Gameplay, Controls (every NetHack command, from the engine's own
// command table), Saves (export / import / delete) and About.
import { listSaves, deleteSave, persistSaves, readExtCommands } from './engine.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const DEFAULTS = {
  zoom: 'auto', animSpeed: 'smooth', shake: 'subtle', fastMissiles: false, reduceMotion: false,
  brightness: 'normal', gore: true, feedLines: 6, clickTravel: true, markers: true,
  game: { autopickup: '$', safePet: true, confirm: true, autoquiver: true, pushweapon: false, autoopen: true,
    verbose: true, showTime: true, showExp: true, tutorial: false, restOnSpace: false },
};

// NetHack options (.nethackrc) for a new game from the Gameplay settings.
export function gameOptions(g) {
  const o = [];
  const flag = (on, name) => o.push(on ? name : '!' + name);
  if (g.autopickup) o.push('autopickup', `pickup_types:${g.autopickup}`); else o.push('!autopickup');
  flag(g.safePet, 'safe_pet'); flag(g.confirm, 'confirm'); flag(g.autoquiver, 'autoquiver'); flag(g.pushweapon, 'pushweapon');
  flag(g.autoopen, 'autoopen'); flag(g.verbose, 'verbose'); flag(g.showTime, 'time'); flag(g.showExp, 'showexp');
  flag(g.tutorial, 'tutorial'); flag(g.restOnSpace, 'rest_on_space');
  return o;
}

// Which group each command belongs to in the Controls list.
const GROUPS = [
  ['Combat', /^(fight|fire|throw|wield|swap|quiver|twoweapon|kick|force|enhance)$/],
  ['Items', /^(inventory|inventtype|pickup|drop|droptype|wear|takeoff|takeoffall|puton|remove|apply|eat|quaff|read|zap|dip|rub|tip|invoke|adjust|loot|offer|name|call|engrave|autopickup|perminv|wipe)$/],
  ['Magic & faith', /^(cast|pray|turn|teleport|monster|spells|sit|ride)$/],
  ['World', /^(open|close|search|wait|up|down|chat|jump|untrap|travel|retravel|terrain|lookhere|herecmdmenu|therecmdmenu|reqmenu|run|rush)$/],
  ['Information', /^(look|glance|whatis|whatdoes|known|knownclass|discoveries|attributes|overview|conduct|history|help|prevmsg|redraw|vanquished|annotate|seeall|seeweapon|seearmor|seerings|seeamulets|seetools|seegold|seespells|showtrap|showgold|showspells|showweapon|showarmor|showrings|showamulets|showtools|chronicle|genocided|shell|versionshort|version)$/],
  ['Game', /^(save|quit|options|optionsfull|exploremode|repeat|saveoptions|suspend|sound|bugreport)$/],
];
const groupOf = (name) => (GROUPS.find(([, re]) => re.test(name)) || ['Other'])[0];
const F = { WIZMODECMD: 0x4, CMD_NOT_AVAILABLE: 0x10, INTERNALCMD: 0x40, PREFIXCMD: 0x200, MOVEMENTCMD: 0x400 };

export function keyLabel(k) {
  if (!k) return '';
  if (k === 27) return 'Esc';
  if (k === 10 || k === 13) return 'Enter';
  if (k === 32) return 'Space';
  if (k < 32) return 'Ctrl+' + ({ 31: '_', 30: '^', 29: ']', 28: '\\' }[k] || String.fromCharCode(k + 64));
  if (k >= 128) { const c = String.fromCharCode(k & 0x7f); return /[A-Z]/.test(c) ? 'Alt+Shift+' + c.toLowerCase() : 'Alt+' + c; }
  return String.fromCharCode(k);
}

export function commandList(mod, wizard = false) {
  return readExtCommands(mod)
    .filter((c) => !(c.flags & (F.INTERNALCMD | F.CMD_NOT_AVAILABLE | F.MOVEMENTCMD)) && (wizard || !(c.flags & F.WIZMODECMD)) && c.name !== '#')
    .map((c) => ({ ...c, group: c.flags & F.WIZMODECMD ? 'Debug mode' : (c.flags & F.PREFIXCMD ? 'Prefixes' : groupOf(c.name)) }));
}

const MOVE_HELP = [
  ['Move', 'Arrow keys, <kbd>h j k l</kbd>, or the numpad'],
  ['Diagonals', '<kbd>y u b n</kbd>, <kbd>Home</kbd> <kbd>PgUp</kbd> <kbd>End</kbd> <kbd>PgDn</kbd>, or numpad 7 9 1 3'],
  ['Run', 'Shift + direction'],
  ['Attack', 'Move into a monster. <kbd>F</kbd> + direction attacks even if nothing is visible'],
  ['Travel', 'Click a spot on the map, or <kbd>_</kbd> then pick a spot'],
  ['Wait a turn', '<kbd>.</kbd> or numpad 5; <kbd>s</kbd> searches'],
  ['Stairs', '<kbd>&lt;</kbd> up, <kbd>&gt;</kbd> down'],
  ['Repeat count', 'Type a number first: <kbd>2</kbd><kbd>0</kbd><kbd>s</kbd> searches 20 times'],
  ['Cancel', '<kbd>Esc</kbd> backs out of any prompt or menu'],
  ['Settings', '<kbd>F1</kbd> or the gear button'],
];

export function openSettings(ui, startTab = 'display') {
  const s = ui.settings;
  s.game = { ...DEFAULTS.game, ...(s.game || {}) };
  const el = document.createElement('form');
  el.className = 'panel settings big';
  el.setAttribute('aria-label', 'Settings');
  const TABS = [['display', 'Display'], ['gameplay', 'Gameplay'], ['controls', 'Controls'], ['saves', 'Saves'], ['about', 'About']];
  let tab = startTab;

  const sel = (id, label, opts, val, hint = '') => `<label for="${id}">${label}${hint ? `<small>${hint}</small>` : ''}</label>
    <select id="${id}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const chk = (id, label, val, hint = '') => `<label for="${id}">${label}${hint ? `<small>${hint}</small>` : ''}</label>
    <input type="checkbox" id="${id}" ${val ? 'checked' : ''}>`;

  const panes = {
    display: () => `<div class="grid">
      ${sel('set-zoom', 'Zoom', [['auto', 'Auto (fit the window)'], [2, '2×'], [3, '3×'], [4, '4×'], [5, '5×']], s.zoom)}
      ${sel('set-bright', 'Brightness', [['dim', 'Dim'], ['normal', 'Normal'], ['bright', 'Bright']], s.brightness, 'How dark unlit areas are')}
      ${sel('set-anim', 'Animation speed', [['smooth', 'Smooth'], ['snappy', 'Snappy'], ['instant', 'Instant']], s.animSpeed)}
      ${sel('set-shake', 'Screen shake', [['subtle', 'Subtle'], ['off', 'Off'], ['full', 'Full']], s.shake)}
      ${sel('set-missiles', 'Missiles & zaps', [['normal', 'Normal speed'], ['fast', 'Fast']], s.fastMissiles ? 'fast' : 'normal')}
      ${sel('set-feed', 'Message lines', [[3, '3'], [6, '6'], [10, '10']], s.feedLines)}
      ${chk('set-gore', 'Blood', s.gore, 'Blood splashes and stains')}
      ${chk('set-markers', 'Hero & pet rings', s.markers, 'Coloured rings under you and your pets')}
      ${chk('set-reduce', 'Reduce motion', s.reduceMotion, 'Fewer particles, no screen shake')}
    </div>`,
    gameplay: () => `<p class="note">These apply when you start or resume a game. Inside a game, NetHack's own option
      screen (<kbd>O</kbd>) changes them for the current session.</p><div class="grid">
      ${sel('set-pickup', 'Autopickup', [['$', 'Gold only'], ['$?!/="+', 'Gold, scrolls, potions, wands, rings, amulets, books'], ['$?!/="+*', '…and gems'], ['', 'Off']], s.game.autopickup)}
      ${chk('set-click', 'Click to travel', s.clickTravel, 'Clicking the map walks you there')}
      ${chk('set-safepet', 'Safe pets', s.game.safePet, 'Ask before attacking your pet')}
      ${chk('set-confirm', 'Confirm peacefuls', s.game.confirm, 'Ask before attacking peaceful monsters')}
      ${chk('set-autoopen', 'Auto-open doors', s.game.autoopen, 'Walking into a closed door opens it')}
      ${chk('set-autoquiver', 'Auto-quiver', s.game.autoquiver, 'Fill an empty quiver when firing')}
      ${chk('set-pushweapon', 'Push weapon', s.game.pushweapon, 'Wielding something new makes the old weapon your swap weapon')}
      ${chk('set-rest', 'Space rests', s.game.restOnSpace, 'The space bar waits a turn')}
      ${chk('set-verbose', 'Verbose messages', s.game.verbose)}
      ${chk('set-time', 'Show turn counter', s.game.showTime)}
      ${chk('set-exp', 'Show experience points', s.game.showExp)}
      ${chk('set-tutorial', 'Tutorial', s.game.tutorial, 'Offer the tutorial level on a new game')}
    </div>
    <div class="row-actions"><button type="button" class="ghostbtn" data-run="O">Open NetHack options (O)</button></div>`,
    controls: () => {
      const cmds = ui.mod ? commandList(ui.mod, ui.wizard) : [];
      const groups = {};
      for (const c of cmds) (groups[c.group] = groups[c.group] || []).push(c);
      const order = ['Prefixes', 'Combat', 'Items', 'Magic & faith', 'World', 'Information', 'Game', 'Other', 'Debug mode'];
      return `<div class="controls">
        <section class="move"><h3>Moving and fighting</h3>
          <div class="pad" aria-hidden="true">${['y', 'k', 'u', 'h', '.', 'l', 'b', 'j', 'n'].map((k) => `<kbd>${k}</kbd>`).join('')}</div>
          <dl>${MOVE_HELP.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></section>
        <section class="cmds"><h3>Every command <small>(click one to use it)</small></h3>
          <input type="search" class="filter" placeholder="Search commands…" aria-label="Search commands">
          <div class="cmdlist">${order.filter((g) => groups[g]).map((g) => `<h4>${g}</h4>${groups[g].map((c) => `
            <button type="button" class="cmd" data-cmd="${esc(c.name)}" data-key="${c.key || 0}" title="#${esc(c.name)}">
              <kbd class="${c.key ? '' : 'ext'}">${esc(c.key ? keyLabel(c.key) : '#' + c.name)}</kbd><span>${esc(c.desc || c.name)}</span></button>`).join('')}`).join('')}
            ${cmds.length ? '' : '<p class="note">The command list appears once the game has loaded.</p>'}</div>
        </section></div>`;
    },
    saves: () => {
      const saves = ui.mod ? listSaves(ui.mod) : [];
      return `<p class="note">Saved games live in this browser's storage on this computer. Export one to keep a copy
        or move it to another browser; import puts it back. Save during play with <kbd>S</kbd>.</p>
        <ul class="saves">${saves.length ? saves.map((f) => `<li><span>${esc(f.replace(/^\d+/, '').replace(/\.gz$|\.Z$/, ''))}</span><small>${esc(f)}</small>
          <button type="button" class="ghostbtn" data-export="${esc(f)}">Export</button>
          <button type="button" class="ghostbtn danger" data-delete="${esc(f)}">Delete</button></li>`).join('') : '<li class="none">No saved games yet.</li>'}</ul>
        <div class="row-actions"><label class="ghostbtn file">Import a save…<input type="file" class="import" hidden></label></div>`;
    },
    about: () => `<div class="about"><p><b>NetHack Gauntlet</b>: NetHack 5.0.0, the real game, compiled to WebAssembly
      and running entirely on this computer. No internet connection is needed or used.</p>
      <p>NetHack is © Stichting Mathematisch Centrum and M. Stephenson and the NetHack DevTeam, distributed under the
      NetHack General Public License. Fonts: Cinzel, Barlow Condensed, EB Garamond, IBM Plex Mono and Pirata One
      (SIL Open Font License).</p><p>In-game help: <kbd>?</kbd>. Command list: the Controls tab.</p></div>`,
  };

  const render = () => {
    el.innerHTML = `<header><h2>Settings</h2><button type="button" class="x" aria-label="Close">✕</button></header>
      <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}">${t}</button>`).join('')}</nav>
      <div class="pane">${panes[tab]()}</div>
      <div class="foot"><span class="hint"><kbd>Tab</kbd> next tab · <kbd>Esc</kbd> close</span><button type="submit" class="primary">Done</button></div>`;
    const f = el.querySelector('.filter');
    if (f) f.addEventListener('input', () => {
      const q = f.value.trim().toLowerCase();
      el.querySelectorAll('.cmd').forEach((b) => { b.hidden = !!q && !b.textContent.toLowerCase().includes(q); });
      el.querySelectorAll('.cmdlist h4').forEach((h) => {
        let n = h.nextElementSibling, any = false;
        while (n && n.tagName !== 'H4') { if (!n.hidden) any = true; n = n.nextElementSibling; }
        h.hidden = !any;
      });
    });
  };

  // read every control on the current pane back into settings
  const collect = () => {
    const v = (id) => el.querySelector('#' + id);
    if (v('set-zoom')) {
      s.zoom = v('set-zoom').value; s.brightness = v('set-bright').value; s.animSpeed = v('set-anim').value;
      s.shake = v('set-shake').value; s.fastMissiles = v('set-missiles').value === 'fast'; s.feedLines = +v('set-feed').value;
      s.gore = v('set-gore').checked; s.markers = v('set-markers').checked; s.reduceMotion = v('set-reduce').checked;
      if (s.reduceMotion) s.shake = 'off';
    }
    if (v('set-pickup')) {
      Object.assign(s.game, { autopickup: v('set-pickup').value, safePet: v('set-safepet').checked, confirm: v('set-confirm').checked,
        autoopen: v('set-autoopen').checked, autoquiver: v('set-autoquiver').checked, pushweapon: v('set-pushweapon').checked,
        restOnSpace: v('set-rest').checked, verbose: v('set-verbose').checked, showTime: v('set-time').checked,
        showExp: v('set-exp').checked, tutorial: v('set-tutorial').checked });
      s.clickTravel = v('set-click').checked;
    }
    ui.saveSettings(); ui.applySettings();
  };
  const close = () => { collect(); ui.closeModal(); };
  const run = (key, name) => {
    close();
    if (name && !key) { ui.pendingExt = name; ui.pushKey('#'.charCodeAt(0)); } else ui.pushKey(key);
  };

  el.addEventListener('change', collect);
  el.addEventListener('submit', (e) => { e.preventDefault(); close(); });
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { collect(); tab = t.dataset.tab; render(); return; }
    if (e.target.closest('.x')) { close(); return; }
    const r = e.target.closest('[data-run]');
    if (r) { run(r.dataset.run.charCodeAt(0)); return; }
    const c = e.target.closest('.cmd');
    if (c) { run(+c.dataset.key, c.dataset.cmd); return; }
    const x = e.target.closest('[data-export]');
    if (x) {
      const data = ui.mod.FS.readFile('/save/' + x.dataset.export);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
      a.download = x.dataset.export; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    const d = e.target.closest('[data-delete]');
    if (d) {
      if (!d.dataset.sure) { d.dataset.sure = '1'; d.textContent = 'Really delete?'; return; }
      await deleteSave(ui.mod, d.dataset.delete); render();
    }
  });
  el.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('import') || !e.target.files[0]) return;
    const file = e.target.files[0];
    ui.mod.FS.writeFile('/save/' + file.name.replace(/[^\w.-]/g, ''), new Uint8Array(await file.arrayBuffer()));
    await persistSaves(ui.mod); render();
  });
  render();
  ui.openModal(el, (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab' && !(e.target && e.target.matches('input[type=search]'))) {
      collect();
      const i = TABS.findIndex(([k]) => k === tab);
      tab = TABS[(i + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length][0]; render(); return;
    }
    return false;
  });
}
