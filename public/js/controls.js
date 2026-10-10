// Modern controls: WASD movement (two keys together for diagonals), E to interact, I for the
// inventory, Space to wait, Tab for every action, and an action bar. They only translate keys
// into NetHack's own commands, so the game itself is unchanged. Settings > Controls switches
// between these and NetHack's classic keys.
import { commandList, keyLabel } from './settings.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ESC = 27;

// direction keys -> compass point
export const DIR_KEYS = { w: 'N', a: 'W', s: 'S', d: 'E', ArrowUp: 'N', ArrowLeft: 'W', ArrowDown: 'S', ArrowRight: 'E' };
const NUMPAD = { Numpad8: 'k', Numpad2: 'j', Numpad4: 'h', Numpad6: 'l', Numpad7: 'y', Numpad9: 'u', Numpad1: 'b', Numpad3: 'n' };
const VI = { N: 'k', S: 'j', W: 'h', E: 'l', NW: 'y', NE: 'u', SW: 'b', SE: 'n' };
const DIAG = { 'N+E': 'NE', 'E+N': 'NE', 'N+W': 'NW', 'W+N': 'NW', 'S+E': 'SE', 'E+S': 'SE', 'S+W': 'SW', 'W+S': 'SW' };
const VI_OF = { '0,-1': 'k', '0,1': 'j', '-1,0': 'h', '1,0': 'l', '-1,-1': 'y', '1,-1': 'u', '-1,1': 'b', '1,1': 'n' };
const perpendicular = (a, b) => ('NS'.includes(a) && 'EW'.includes(b)) || ('EW'.includes(a) && 'NS'.includes(b));
const CHORD_MS = 70;   // how long a direction waits for a second key to make a diagonal

// The modern actions: [id, label, key shown, what it does]
export const ACTIONS = [
  ['action', 'Attack / act', 'Space'], ['inventory', 'Inventory', 'I'], ['interact', 'Stairs / pick up', 'E'], ['wait', 'Wait / search', '.'],
  ['rest', 'Rest 20 turns', 'R'], ['examine', 'Examine', 'X'], ['fire', 'Fire', 'F'], ['throw', 'Throw', 'T'],
  ['cast', 'Cast a spell', 'Z'], ['character', 'Character', 'C'], ['overview', 'Dungeon overview', 'M'],
  ['commands', 'All actions', 'Tab'], ['save', 'Save and quit', 'Ctrl+S'], ['help', 'Help', '?'],
];
export const KEY_ACTION = { i: 'inventory', e: 'interact', Enter: 'interact', ' ': 'action', '.': 'wait', r: 'rest', x: 'examine', f: 'fire', t: 'throw',
  z: 'cast', c: 'character', m: 'overview', Tab: 'commands', g: 'pickup' };

export const MODERN_HELP = [
  ['Move', '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or the arrow keys'],
  ['Diagonals', 'Hold two at once, e.g. <kbd>W</kbd>+<kbd>D</kbd> for up-right (or the numpad, Home/PgUp/End/PgDn)'],
  ['Run', 'Shift + direction'],
  ['Action', '<kbd>Space</kbd>: attack the monster next to you (the one you\'re facing), else take the stairs or pick up what\'s here, else wait a turn and search'],
  ['Attack', '<kbd>Space</kbd>, or move into a monster, or click it'],
  ['Interact', '<kbd>E</kbd> or <kbd>Enter</kbd>: take the stairs, or pick up what you\'re standing on'],
  ['Inventory', '<kbd>I</kbd>; click an item to see everything you can do with it'],
  ['Wait / rest', '<kbd>.</kbd> waits a turn and searches (so does <kbd>Space</kbd> with nothing to do); <kbd>R</kbd> rests 20 turns'],
  ['Pick up', '<kbd>G</kbd> (or <kbd>E</kbd>)'],
  ['Examine', '<kbd>X</kbd> then pick a spot, or right-click anything'],
  ['Fire / throw', '<kbd>F</kbd> fires what\'s in your quiver, <kbd>T</kbd> throws'],
  ['Cast', '<kbd>Z</kbd>'],
  ['Character / map', '<kbd>C</kbd> character sheet, <kbd>M</kbd> dungeon overview'],
  ['Quickbar', '<kbd>1</kbd>–<kbd>9</kbd> use what you put there: hover an item in the inventory (or a spell card) and press a number'],
  ['Everything else', '<kbd>Tab</kbd> lists every action, searchable'],
  ['Save', '<kbd>Ctrl</kbd>+<kbd>S</kbd> saves and quits (NetHack saves only on the way out); start again with the same name to resume'],
  ['Travel', 'Click a spot on the map'],
  ['Pick a spot', 'When asked: move with WASD, <kbd>E</kbd>/<kbd>Space</kbd>/<kbd>Enter</kbd> or click to choose'],
  ['Directions', 'When asked "in what direction?": WASD (two keys for diagonals), <kbd>Space</kbd> for yourself'],
  ['Cancel', '<kbd>Esc</kbd> always backs out without doing anything'],
  ['Settings', '<kbd>F1</kbd> or the gear button'],
];

// NetHack's tutorial and a few hints name classic keys ("Use 's' to search", "'M-u'" for Alt+U).
// With modern controls those keys do something else, so say how to do it with these controls.
const inv = (verb) => `open the inventory (I), click the item, then ${verb}`;
const tab = (cmd) => `Tab, then "${cmd}"`;
const MODERN_HINTS = [
  [/^Move around with .*/, 'Move around with W A S D or the arrow keys'],
  [/^Move diagonally with .*/, 'Move diagonally by holding two keys together, like W+D (or use the numpad)'],
  [/^Knights can jump with '[^']*'/, `Knights can jump: ${tab('jump')}`],
  [/^Close the door with '[^']*'/, `Close the door: ${tab('close')}`],
  [/^This door is locked\. Kick it with '[^']*'/, `This door is locked. Kick it: ${tab('kick')}`],
  [/^Look around the map with '[^']*', press ESC when you're done/, 'Look around the map with X (or right-click a spot); Esc when you\'re done'],
  [/^Use '[^']*' to search for secret doors/, 'Press Space next to a wall to search for secret doors'],
  [/^Some traps can be disabled with '[^']*'/, `Some traps can be disabled: ${tab('untrap')}`],
  [/^Pick up items with '[^']*'/, 'Pick up items with E (or G)'],
  [/^Wear armor with '[^']*'/, `Wear armor: ${inv('Wear')}`],
  [/^Wield weapons with '[^']*'/, `Wield weapons: ${inv('Wield')}`],
  [/^Take off armor with '[^']*'/, `Take off armor: ${inv('Take off')}`],
  [/^Pick up this scroll, read it with '[^']*', and try to remove the armor again/, 'Pick up this scroll (E), read it (I, click it, Read), and try to remove the armor again'],
  [/^Drop items with '[^']*'/, `Drop items: ${inv('Drop')}`],
  [/^You can drop partial stacks by prefixing the item slot letter with a number/, `You can drop part of a stack: ${tab('drop')}, then type a number before the item's letter`],
  [/^Throw items with '[^']*'/, 'Throw items with T'],
  [/^Use '[^']*' to fire missiles with the wielded launcher/, 'Press F to fire missiles with the wielded launcher'],
  [/^Firing launches items from your quiver; Use '[^']*' to put items in it/, `Firing launches items from your quiver; to fill it, ${inv('Quiver')}`],
  [/^You can wait a turn with '[^']*'/, 'You can wait a turn with . (or Space, when nothing is next to you)'],
  [/^You loot containers with '[^']*'/, `You loot containers: stand on one, then ${tab('loot')}`],
  [/^Containers can also be emptied with '[^']*'/, `Containers can also be emptied: ${tab('tip')}`],
  [/^Magic wands are used with '[^']*'/, `Magic wands are used: ${inv('Zap')}`],
  [/^You can run by prefixing a movement key with '[^']*'/, 'You can run by holding Shift with a direction'],
  [/^Travel across the level with '[^']*'/, 'Travel across the level by clicking where you want to go'],
  [/^Use '[^']*' to eat edible things/, `Eat edible things: ${inv('Eat')}`],
  [/^Comestibles are eaten with '[^']*'/, `Comestibles are eaten: ${inv('Eat')}`],
  [/^Use '[^']*' to use two weapons at once/, `Use two weapons at once: ${tab('twoweapon')}`],
  [/^Swap weapons quickly with '[^']*'/, `Swap weapons quickly: ${tab('swap')}`],
  [/^Put on accessories with '[^']*'/, `Put on accessories: ${inv('Put on')}`],
  [/^Remove accessories with '[^']*'/, `Remove accessories: ${inv('Remove')}`],
  [/^Use '[^']*' to go down the stairs/, 'Stand on the stairs and press E to go down'],
  [/^Use '[^']*' to go up the stairs/, 'Stand on the stairs and press E to go up'],
  [/^Pick up the spellbook with '[^']*'/, 'Pick up the spellbook with E'],
  [/^Read the spellbook with '[^']*'/, `Read the spellbook: ${inv('Read')}`],
  [/^Use '[^']*' to cast a spell/, 'Press Z to cast a spell'],
  [/^You "quaff" potions with '[^']*'/, `You "quaff" (drink) potions: ${inv('Quaff')}`],
  [/^Note: Outside the tutorial, Ctrl-key combinations are shown prefixed with a caret.*/, 'Note: NetHack writes Ctrl+X as ^X and Alt+X as M-X'],
];

export function modernHint(text) {
  for (const [re, say] of MODERN_HINTS) if (re.test(text)) return say;
  return null;
}

export class ModernControls {
  constructor(ui) {
    this.ui = ui;
    this.held = new Map();     // compass point -> key currently held
    this.pending = null;       // a single direction waiting to see if a second key makes it diagonal
    addEventListener('keyup', (e) => { const d = DIR_KEYS[e.key] || DIR_KEYS[e.key.toLowerCase?.()]; if (d) this.held.delete(d); });
    addEventListener('blur', () => { this.held.clear(); });
  }

  get on() { return this.ui.settings.controls !== 'classic'; }

  // A message as the player should read it with these controls: engraved tutorial hints and
  // "Comestibles are eaten with 'e'" say how to do it here instead of naming a classic key.
  explain(msg) {
    if (!this.on || !msg) return msg;
    const read = msg.match(/^(You read: ")(.*)("\.?)$/);
    if (read) { const h = modernHint(read[2]); return h ? read[1] + h + read[3] : msg; }
    return modernHint(msg) || msg;
  }

  // A direction key went down: emit(viKey) once we know whether it's straight or diagonal.
  direction(e, emit) {
    if (NUMPAD[e.code]) { emit(e.shiftKey ? NUMPAD[e.code].toUpperCase() : NUMPAD[e.code]); return true; }
    const home = { Home: 'y', PageUp: 'u', End: 'b', PageDown: 'n' }[e.key];
    if (home) { emit(e.shiftKey ? home.toUpperCase() : home); return true; }
    const d = DIR_KEYS[e.key] || DIR_KEYS[e.key.toLowerCase()];
    if (!d) return false;
    const run = e.shiftKey;
    const send = (dir) => { const k = VI[dir]; emit(run ? k.toUpperCase() : k); };
    if (e.repeat) {   // holding a key keeps walking (diagonally if two are held)
      if (this.pending) return true;
      const other = [...this.held.keys()].find((h) => perpendicular(h, d));
      send(other ? DIAG[`${other}+${d}`] : d);
      return true;
    }
    this.held.set(d, e.key);
    if (this.pending && perpendicular(this.pending.dir, d)) {   // second key arrived in time: diagonal
      const p = this.pending; clearTimeout(p.timer); this.pending = null;
      send(DIAG[`${p.dir}+${d}`]);
      return true;
    }
    const other = [...this.held.keys()].find((h) => h !== d && perpendicular(h, d));
    if (other) { send(DIAG[`${other}+${d}`]); return true; }
    if (this.pending) { clearTimeout(this.pending.timer); const p = this.pending; this.pending = null; p.fire(); }
    const fire = () => { if (this.pending && this.pending.dir === d) this.pending = null; send(d); };
    this.pending = { dir: d, timer: setTimeout(fire, CHORD_MS), fire };
    return true;
  }

  // Keys while NetHack waits for a command. Returns true if handled.
  command(e) {
    const ui = this.ui;
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    if (this.direction(e, (k) => ui.pushKey(k.charCodeAt(0)))) return true;
    if (/^[1-9]$/.test(e.key) && ui.quickbar && ui.quickbar.on) { ui.quickbar.use(+e.key); return true; }   // quickbar slots
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const act = KEY_ACTION[k];
    if (!act || (e.key.length === 1 && e.key !== e.key.toLowerCase() && act !== 'commands')) return false;   // Shift+letter: NetHack's own command
    this.act(act);
    return true;
  }

  // Keys while picking a spot on the map: WASD moves the cursor, E/Space/Enter picks.
  targeting(e) {
    const ui = this.ui;
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    if (this.direction(e, (k) => ui.pushKey(k.charCodeAt(0)))) return true;
    if (['e', 'E', ' ', 'Enter'].includes(e.key)) { ui.pushKey('.'.charCodeAt(0)); return true; }
    return false;
  }

  // Keys while NetHack asks "in what direction?": finish(code).
  directionPrompt(e, finish) {
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    if (this.direction(e, (k) => finish(k.charCodeAt(0)))) return true;
    if ([' ', 'e', 'E'].includes(e.key)) { finish('.'.charCodeAt(0)); return true; }
    return false;
  }

  // What's under the hero: stairs to take ('<' or '>'), and whether objects were seen here.
  here() {
    const r = this.ui.renderer, h = this.ui.game?.hero || r.heroCell, i = h.y * 80 + h.x;
    const tg = r.terrMem[i] >= 0 ? r.terrMem[i] : r.glyph[i];
    const n = tg >= 0 ? r.tiles.gname[tg] : '';
    return { stairs: /(staircase|ladder) down/.test(n) ? '>' : /(staircase|ladder) up/.test(n) ? '<' : '', items: r.objMem[i] >= 0 };
  }

  act(name) {
    const ui = this.ui, push = (s) => [...s].forEach((c) => ui.pushKey(c.charCodeAt(0)));
    switch (name) {
      case 'inventory': push('i'); break;
      case 'pickup': push(','); break;
      case 'wait': push('s'); break;
      case 'rest': push('20s'); break;
      case 'examine': push(';'); break;
      case 'fire': push('f'); break;
      case 'throw': push('t'); break;
      case 'cast': push('Z'); break;
      case 'character': ui.pushKey(24); break;   // ^X
      case 'overview': ui.pushKey(15); break;    // ^O
      case 'help': push('?'); break;
      case 'save': push('S'); break;   // NetHack asks "Really save?"
      case 'commands': openCommandPalette(ui); break;
      case 'action': {
        // attack whatever is next to you, else the same as interact, else wait (and search)
        const t = ui.renderer.attackTarget();
        if (t) { push('F' + VI_OF[`${t.dx},${t.dy}`]); break; }   // F: fight in that direction
        const here = this.here();
        push(here.stairs || (here.items ? ',' : 's'));
        break;
      }
      case 'interact': {
        // stairs if you're on them, otherwise pick up whatever is here
        const here = this.here();
        push(here.stairs || ',');
        break;
      }
      default: break;
    }
  }
}

// 24x24 stroke icons for the action bar
const ICON = {
  action: 'M14 4h6v6L9 21l-3-3L17 7M5 14l5 5M3 21l3-3',
  inventory: 'M7 8c0-3 2-5 5-5s5 2 5 5M5 8h14l-1 13H6L5 8zm4 4h6',
  interact: 'M4 20h4v-4h4v-4h4V8h4M14 4l6 0 0 6',
  wait: 'M7 3h10M7 21h10M8 3c0 6 8 6 8 9s-8 3-8 9M16 3c0 6-8 6-8 9s8 3 8 9',
  rest: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  examine: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4',
  fire: 'M5 19 19 5M14 5h5v5M5 19l2-6M5 19l6-2',
  throw: 'M14 3l7 7-9 9-4-4 6-12zM3 21l5-5',
  cast: 'M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 17l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  character: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 4-7 8-7s8 3 8 7',
  overview: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zm6-2v14m6-12v14',
  commands: 'M4 6h16M4 12h16M4 18h10',
  save: 'M5 3h11l3 3v15H5V3zm3 0v5h7V3M8 21v-7h8v7',
};

// ---- the action bar down the right-hand edge
export function mountActionBar(ui) {
  let bar = document.getElementById('actionbar');
  if (!bar) {
    bar = document.createElement('nav');
    bar.id = 'actionbar'; bar.setAttribute('aria-label', 'Actions');
    bar.innerHTML = ACTIONS.filter(([id]) => id !== 'help').map(([id, label, key]) => `<button type="button" data-act="${id}" aria-label="${esc(label)} (${esc(key)})">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[id]}"/></svg>
      <kbd>${esc(key === 'Space' ? '␣' : key)}</kbd><span class="lbl">${esc(label)}</span></button>`).join('');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b || ui.modal) return;
      ui.controls.act(b.dataset.act);
    });
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.getElementById('stage').appendChild(bar);
  }
  bar.hidden = !(ui.settings.actionBar !== false && ui.controls.on);
  document.body.classList.toggle('has-actionbar', !bar.hidden);   // the message feed keeps clear of it
}

// ---- Tab: every action, searchable; Enter or click runs it
export function openCommandPalette(ui) {
  if (!ui.mod) return;
  const cmds = commandList(ui.mod, ui.wizard);
  const el = document.createElement('form');
  el.className = 'panel getline palette';
  el.innerHTML = `<label for="pal-input">What do you want to do?</label>
    <input id="pal-input" autocomplete="off" spellcheck="false" placeholder="pray, eat, wear, read, open, kick, loot…">
    <div class="pal-list" role="listbox"></div>
    <div class="foot"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> do it · <kbd>Esc</kbd> cancel</div>`;
  const input = el.querySelector('input'), list = el.querySelector('.pal-list');
  let matches = [], focus = 0;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    matches = cmds.filter((c) => !q || c.name.includes(q) || (c.desc || '').toLowerCase().includes(q)).slice(0, 12);
    focus = Math.min(focus, Math.max(0, matches.length - 1));
    list.innerHTML = matches.map((c, i) => `<button type="button" data-i="${i}" class="${i === focus ? 'focus' : ''}">
      <span class="d">${esc((c.desc || c.name).replace(/^./, (x) => x.toUpperCase()))}</span><kbd>${esc(c.key ? keyLabel(c.key) : '#' + c.name)}</kbd></button>`).join('');
  };
  const run = (c) => {
    ui.closeModal();
    if (!c) return;
    if (c.key) ui.pushKey(c.key); else { ui.pendingExt = c.name; ui.pushKey('#'.charCodeAt(0)); }
  };
  input.addEventListener('input', () => { focus = 0; render(); });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) run(matches[+b.dataset.i]); });
  el.addEventListener('submit', (e) => { e.preventDefault(); run(matches[focus]); });
  render();
  ui.openModal(el, (e) => {
    if (e.key === 'Escape') { ui.closeModal(); return; }
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { focus = Math.min(matches.length - 1, focus + 1); render(); return; }
    if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { focus = Math.max(0, focus - 1); render(); return; }
    return false;
  });
  setTimeout(() => input.focus(), 0);
}

export { ESC };
