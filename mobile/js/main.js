// NetHack Gauntlet for phones: the same engine, art, renderer and window port as the desktop
// build (../js), with a touch interface on top. Boot: load assets and the engine, show the start
// screen, then hand control to NetHack.
import { loadEngine, runGame, listSaves, deleteSave } from '../../js/engine.js';
import { Game } from '../../js/game.js';
import { Renderer } from '../../js/render.js';
import { DEFAULTS, SETTINGS_VERSION, gameOptions } from '../../js/settings.js';
import { MobileUI } from './mobileui.js';
import { Touch } from './touch.js';
import { Hud } from './hud.js';

// Phone settings are kept apart from the desktop page's (same site, different screen)
const KEY = 'nhg-m-settings';
const PHONE = { zoom: 1.5, controls: 'classic', clickTravel: false, feedLines: 4, holdWalk: false, autoSave: true };
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* private mode */ }
  if ((s.version || 1) < SETTINGS_VERSION) { delete s.game; s.version = SETTINGS_VERSION; }
  const out = { ...DEFAULTS, ...PHONE, ...s, game: { ...DEFAULTS.game, tutorial: false, ...(s.game || {}) } };
  out.controls = 'classic';   // the touch interface sends NetHack's own keys
  if (s.reduceMotion === undefined && matchMedia('(prefers-reduced-motion: reduce)').matches) { out.reduceMotion = true; out.shake = 'off'; }   // first run only
  return out;
}
const settings = loadSettings();
const saveSettings = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } };

// NetHack reads "Name-Role" as options, and save files are "<digits><name>": no dashes, no leading digits
export const cleanName = (s) => String(s).trim().replace(/[^A-Za-z0-9 _]/g, '').replace(/^[\d\s_]+/, '').slice(0, 30).trim() || 'Adventurer';
const NAMES = ['Brunhilde', 'Sigrid', 'Astrid', 'Freydis', 'Gudrun', 'Ingrid', 'Thyra', 'Ragna', 'Hervor', 'Eir'];
const RESUME = 'nhg-m-resume';   // set when the game saved itself because you left the app

async function boot() {
  const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [tiles, atlas, actors, items] = await Promise.all([
    fetch('assets/tiles.json').then((r) => r.json()),
    img('assets/atlas.png'),
    fetch('assets/actors/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    Promise.all([fetch('assets/items/items.json').then((r) => r.json()), img('assets/items/items18.png')])
      .then(([meta, img18]) => ({ ...meta, img18 })).catch(() => null),
  ]);
  [32, 48].forEach((n) => img(`assets/items/items${n}.png`).catch(() => {}));
  const officialImg = img('assets/official.png').catch(() => null);
  const renderer = new Renderer(document.getElementById('view'), tiles, atlas, actors, settings, items);
  officialImg.then((i) => { renderer.officialImg = i; });
  const ui = new MobileUI({ tiles, atlas, renderer, settings, saveSettings });
  ui.startPortraitLoop();
  const game = new Game({ ui, renderer, tiles });
  ui.game = game;
  const hud = new Hud(ui);
  new Touch(ui, hud);
  const mod = await loadEngine(game);
  renderer.objDescr = (o) => mod._nhg_obj_descr(o);
  ui.mod = mod; ui.wizard = location.hash === '#wizard';
  window.__nhg = { game, renderer, ui, mod, hud };

  const nameInput = document.getElementById('start-name');
  let last = '';
  try { last = localStorage.getItem('nhg-last-name') || ''; } catch (e) { /* ignore */ }
  nameInput.value = last || NAMES[Math.floor(Math.random() * NAMES.length)];

  const saves = listSaves(mod).map((f) => ({ file: f, name: f.replace(/^\d+/, '') }));
  const savesEl = document.getElementById('saves');
  if (saves.length) {
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    savesEl.innerHTML = '<h2>Continue</h2>' + saves.map((s) => `<div class="save"><button type="button" class="resume" data-name="${esc(s.name)}">${esc(s.name)}</button><button type="button" class="del" data-file="${esc(s.file)}" aria-label="Delete the save for ${esc(s.name)}">Delete</button></div>`).join('');
    savesEl.addEventListener('click', async (e) => {
      const r = e.target.closest('.resume'), d = e.target.closest('.del');
      if (r) { nameInput.value = r.dataset.name; start(); }
      if (d) {
        if (d.dataset.confirm) { await deleteSave(mod, d.dataset.file); d.closest('.save').remove(); }
        else { d.dataset.confirm = '1'; d.textContent = 'Really delete?'; }
      }
    });
  }

  const pk = document.getElementById('start-pickup');
  if ([...pk.options].some((o) => o.value === settings.game.autopickup)) pk.value = settings.game.autopickup;
  document.getElementById('start-tutorial').checked = !!settings.game.tutorial;
  document.getElementById('start-settings')?.addEventListener('click', () => ui.openSettings());
  const go = document.getElementById('start-go');
  go.disabled = false; go.textContent = 'Enter the dungeon';
  document.getElementById('start-form').addEventListener('submit', (e) => { e.preventDefault(); start(); });
  installHint();

  // back from another app after the game saved itself: carry straight on
  let resume = null;
  try { resume = sessionStorage.getItem(RESUME); sessionStorage.removeItem(RESUME); } catch (e) { /* ignore */ }
  if (resume && saves.some((s) => s.name === resume)) { nameInput.value = resume; start(); }

  function start() {
    const name = cleanName(nameInput.value);
    try { localStorage.setItem('nhg-last-name', name); } catch (e) { /* ignore */ }
    const role = document.getElementById('start-role').value;
    settings.game.autopickup = pk.value;
    settings.game.tutorial = document.getElementById('start-tutorial').checked;
    saveSettings();
    const opts = [`name:${name}`, 'number_pad:0', 'color', 'hilite_pet', 'lit_corridor', 'dark_room', 'pile_limit:3', 'perm_invent', '!tips', ...gameOptions(settings.game)];   // (NetHack's tips explain keyboard keys)
    if (!opts.some((o) => /^!?tutorial$/.test(o))) opts.push(settings.game.tutorial ? 'tutorial' : '!tutorial');
    if (role === 'random') opts.push('role:random', 'race:random', 'gender:random', 'align:random');
    else if (role !== 'ask') opts.push(`role:${role}`);
    if (location.hash === '#wizard') {
      opts.push('playmode:debug');
      const sc = new TextDecoder().decode(mod.FS.readFile('/sysconf')).replace(/^WIZARDS=.*$/m, 'WIZARDS=*');
      mod.FS.writeFile('/sysconf', sc);
    }
    document.getElementById('start').hidden = true;
    game.started = true;
    ui.playerName = name; ui.quickbar.load(); ui.quickbar.show(true);
    hud.started();
    // NetHack's own mouse actions are the touch controls: a tap (button 2 here) is #mouseaction
    // (walk, travel, attack, open, use the stairs, pick up...), a long press (button 1) is
    // #therecmdmenu ("What do you want to do?" for that spot)
    const rc = `OPTIONS=${opts.join(',')}\nBIND=mouse1:therecmdmenu\nBIND=mouse2:mouseaction\n`;
    runGame(mod, rc);
  }

  // Phones close apps without asking: leaving the app saves the game exactly as NetHack's S
  // command does, and coming back picks it up again.
  let leaving = false;
  const leave = async () => {
    if (leaving || !settings.autoSave || !game.started || game.over || document.visibilityState !== 'hidden') return;
    leaving = true;
    try { sessionStorage.setItem(RESUME, ui.playerName); } catch (e) { /* ignore */ }
    ui.autoSaved = true;
    // (a hidden page runs slowly or not at all: if you're back before the save is done, carry on playing)
    await game.saveAndQuit(4000, () => document.visibilityState === 'visible');
    if (game.over) { await game.persisted; if (document.visibilityState === 'visible') location.reload(); return; }
    ui.autoSaved = false; leaving = false;
    try { sessionStorage.removeItem(RESUME); } catch (e) { /* ignore */ }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave();
    else if (ui.autoSaved && game.over) location.reload();
  });
  addEventListener('pagehide', leave);
}

// "Add to Home Screen" plays full screen and offline
function installHint() {
  const el = document.getElementById('start-install');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || !el) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  el.innerHTML = ios ? 'For full screen and offline play: Share <b>⎙</b> → <b>Add to Home Screen</b>.' : 'For full screen and offline play: browser menu → <b>Install app</b> / <b>Add to Home screen</b>.';
  el.hidden = false;
}

// (the dev server has no precache.json, so there the worker never installs and nothing is cached)
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('m/sw.js', { scope: './m/' }).then((reg) => {
    // a new version is ready: switch now if no game is running (else on the next visit)
    const offer = () => { if (reg.waiting && !window.__nhg?.game?.started) reg.waiting.postMessage('take-over'); };
    offer(); reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', offer));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!window.__nhg?.game?.started) location.reload(); });
  }).catch((e) => console.warn('offline cache unavailable', e));
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('start-go').textContent = 'Could not load NetHack (see the console)';
});
