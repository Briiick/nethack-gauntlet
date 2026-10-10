// Boot: load assets and the engine, show the start screen, then hand control to NetHack.
import { loadEngine, runGame, listSaves, deleteSave } from './engine.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { DEFAULTS, SETTINGS_VERSION, gameOptions } from './settings.js';

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('nhg-settings') || '{}'); } catch (e) { /* private mode */ }
  // settings saved before version 2 carried this interface's own gameplay defaults: reset those to NetHack's
  if ((s.version || 1) < SETTINGS_VERSION) { delete s.game; s.version = SETTINGS_VERSION; }
  const out = { ...DEFAULTS, ...s, game: { ...DEFAULTS.game, ...(s.game || {}) } };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { out.reduceMotion = true; out.shake = 'off'; }
  return out;
}
const settings = loadSettings();
const saveSettings = () => { try { localStorage.setItem('nhg-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

const NAMES = ['Brunhilde', 'Sigrid', 'Astrid', 'Freydis', 'Gudrun', 'Ingrid', 'Thyra', 'Ragna', 'Hervor', 'Eir'];

async function boot() {
  const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [tiles, atlas, actors, items] = await Promise.all([
    fetch('assets/tiles.json').then((r) => r.json()),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'assets/atlas.png'; }),
    fetch('assets/actors/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    Promise.all([fetch('assets/items/items.json').then((r) => r.json()), img('assets/items/items18.png')])
      .then(([meta, img18]) => ({ ...meta, img18 })).catch(() => null),
  ]);
  [32, 48].forEach((n) => img(`assets/items/items${n}.png`).catch(() => {}));   // warm the cache for the inventory
  const officialImg = img('assets/official.png').catch(() => null);   // NetHack's own tiles (Settings > Graphics)
  const renderer = new Renderer(document.getElementById('view'), tiles, atlas, actors, settings, items);
  officialImg.then((i) => { renderer.officialImg = i; });
  const ui = new UI({ tiles, atlas, renderer, settings, saveSettings });
  ui.startPortraitLoop();
  const game = new Game({ ui, renderer, tiles });
  ui.game = game;
  const mod = await loadEngine(game);
  renderer.objDescr = (o) => mod._nhg_obj_descr(o);
  ui.mod = mod; ui.wizard = location.hash === '#wizard';
  window.__nhg = { game, renderer, ui, mod };   // handy for debugging in the console

  const nameInput = document.getElementById('start-name');
  let last = '';
  try { last = localStorage.getItem('nhg-last-name') || ''; } catch (e) { /* ignore */ }
  nameInput.value = last || NAMES[Math.floor(Math.random() * NAMES.length)];

  if (globalThis.nhgDesktop) document.getElementById('start-fine').innerHTML = 'Closing the window saves your game; it resumes when you start again with the same name. You can also save with <kbd>S</kbd>.';

  const saves = listSaves(mod).map((f) => ({ file: f, name: f.replace(/^\d+/, '') }));
  const savesEl = document.getElementById('saves');
  if (saves.length) {
    savesEl.innerHTML = '<h2>Continue</h2>' + saves.map((s) => `<div class="save"><button type="button" class="resume" data-name="${s.name}">${s.name}</button><button type="button" class="del" data-file="${s.file}" aria-label="Delete the save for ${s.name}">Delete</button></div>`).join('');
    savesEl.addEventListener('click', async (e) => {
      const r = e.target.closest('.resume'), d = e.target.closest('.del');
      if (r) { nameInput.value = r.dataset.name; start(); }
      if (d) {
        if (d.dataset.confirm) { await deleteSave(mod, d.dataset.file); d.closest('.save').remove(); }
        else { d.dataset.confirm = '1'; d.textContent = 'Really delete?'; }
      }
    });
  }

  // the start screen mirrors the Gameplay settings
  const pk = document.getElementById('start-pickup');
  if ([...pk.options].some((o) => o.value === settings.game.autopickup)) pk.value = settings.game.autopickup;
  document.getElementById('start-tutorial').checked = !!settings.game.tutorial;
  const ctl = document.getElementById('start-controls');
  ctl.value = settings.controls === 'classic' ? 'classic' : 'modern';
  ctl.addEventListener('change', () => { settings.controls = ctl.value; saveSettings(); ui.applySettings(); });
  document.getElementById('start-settings')?.addEventListener('click', () => ui.openSettings());
  const go = document.getElementById('start-go');
  go.disabled = false; go.textContent = 'Enter the dungeon';
  const form = document.getElementById('start-form');
  form.addEventListener('submit', (e) => { e.preventDefault(); start(); });
  setTimeout(() => nameInput.focus(), 50);

  function start() {
    const name = nameInput.value.trim().replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 30) || 'Adventurer';
    try { localStorage.setItem('nhg-last-name', name); } catch (e) { /* ignore */ }
    const role = document.getElementById('start-role').value;
    settings.game.autopickup = document.getElementById('start-pickup').value;
    settings.game.tutorial = document.getElementById('start-tutorial').checked;
    saveSettings();
    // display-only options, then gameplay options only where you changed NetHack's defaults
    const opts = [`name:${name}`, 'number_pad:0', 'color', 'hilite_pet', 'lit_corridor', 'dark_room', 'pile_limit:3', ...gameOptions(settings.game)];
    if (role === 'random') opts.push('role:random', 'race:random', 'gender:random', 'align:random');
    else if (role !== 'ask') opts.push(`role:${role}`);   // NetHack asks about race, gender and alignment
    if (location.hash === '#wizard') {   // developer mode: NetHack's debug ("wizard") mode
      opts.push('playmode:debug');
      const sc = new TextDecoder().decode(mod.FS.readFile('/sysconf')).replace(/^WIZARDS=.*$/m, 'WIZARDS=*');
      mod.FS.writeFile('/sysconf', sc);
    }
    document.getElementById('start').hidden = true;
    game.started = true;
    runGame(mod, `OPTIONS=${opts.join(',')}\n`);
  }
}

// Desktop app: closing the window saves the game in progress first.
// Browser: a game in progress isn't saved by closing the tab, so ask first (S saves).
if (globalThis.nhgDesktop) {
  nhgDesktop.onCloseRequested(async () => {
    try { await window.__nhg?.game.saveAndQuit(); } finally { nhgDesktop.readyToClose(); }
  });
} else {
  addEventListener('beforeunload', (e) => {
    const g = window.__nhg?.game;
    if (g && g.started && !g.over) { e.preventDefault(); e.returnValue = ''; }
  });
}

boot().catch((err) => {
  console.error(err);
  const go = document.getElementById('start-go');
  go.textContent = 'Could not load NetHack. Is the page served over http? (see README)';
});
