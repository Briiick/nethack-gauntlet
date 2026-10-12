// NetHack Gauntlet for phones: the same engine, art, renderer and window port as the desktop
// build (../js), with a touch interface on top. Boot: load assets and the engine, show the start
// screen, then hand control to NetHack.
import { loadEngine, runGame, listSaves, deleteSave } from '../../js/engine.js';
import { Game } from '../../js/game.js';
import { Renderer } from '../../js/render.js';
import { DEFAULTS, SETTINGS_VERSION, gameOptions } from '../../js/settings.js';
import { mountSaves, openHallOfFame } from '../../js/records.js';
import { MobileUI } from './mobileui.js';
import { Touch } from './touch.js';
import { Hud } from './hud.js';
import { setupNative, isNative, backupRecords } from './native.js';

// Phone settings are kept apart from the desktop page's (same site, different screen)
const KEY = 'nhg-m-settings';
// walkStepMs: travelling shows the hero walking, one square per this many ms (with runmode:walk below)
const PHONE = { zoom: 1.5, controls: 'classic', clickTravel: false, feedLines: 4, holdWalk: false, autoSave: true, walkStepMs: 95 };
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
// a browser tab forgets it when closed; the iPhone app keeps it, so reopening after iOS closed the app carries on
const resumeStore = () => (isNative() ? localStorage : sessionStorage);

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
  await setupNative();   // the iPhone app: saves as files, haptics, pause/resume (a browser: nothing)
  const mod = await loadEngine(game);
  renderer.objDescr = (o) => mod._nhg_obj_descr(o);
  ui.mod = mod; ui.wizard = location.hash === '#wizard';
  window.__nhg = { game, renderer, ui, mod, hud };

  const nameInput = document.getElementById('start-name');
  let last = '';
  try { last = localStorage.getItem('nhg-last-name') || ''; } catch (e) { /* ignore */ }
  nameInput.value = last || NAMES[Math.floor(Math.random() * NAMES.length)];

  const saves = listSaves(mod).map((f) => ({ file: f, name: f.replace(/^\d+/, '') }));
  // saved games as cards: who, where, when; Resume carries straight on (no retyping the name)
  mountSaves(document.getElementById('saves'), saves, {
    onResume: (name) => { nameInput.value = name; start(); },
    onDelete: (file) => deleteSave(mod, file),
  });
  document.getElementById('start-fame')?.addEventListener('click', () => openHallOfFame(ui));
  document.getElementById('gameover-fame')?.addEventListener('click', () => openHallOfFame(ui));

  const pk = document.getElementById('start-pickup');
  if ([...pk.options].some((o) => o.value === settings.game.autopickup)) pk.value = settings.game.autopickup;
  document.getElementById('start-tutorial').checked = !!settings.game.tutorial;
  document.getElementById('start-settings')?.addEventListener('click', () => ui.openSettings());
  const go = document.getElementById('start-go');
  go.disabled = false; go.textContent = saves.length ? 'New game' : 'Enter the dungeon';
  document.getElementById('start-form').addEventListener('submit', (e) => { e.preventDefault(); start(); });
  installHint();

  // back from another app after the game saved itself: carry straight on
  let resume = null;
  try { resume = resumeStore().getItem(RESUME); resumeStore().removeItem(RESUME); } catch (e) { /* ignore */ }
  if (resume && saves.some((s) => s.name === resume)) { nameInput.value = resume; start(); }

  function start() {
    const name = cleanName(nameInput.value);
    try { localStorage.setItem('nhg-last-name', name); } catch (e) { /* ignore */ }
    const role = document.getElementById('start-role').value;
    settings.game.autopickup = pk.value;
    settings.game.tutorial = document.getElementById('start-tutorial').checked;
    saveSettings();
    const opts = [`name:${name}`, 'number_pad:0', 'color', 'hilite_pet', 'lit_corridor', 'dark_room', 'pile_limit:3', 'perm_invent', '!tips', 'runmode:walk', ...gameOptions(settings.game)];   // (tips explain keyboard keys; runmode: see walkStepMs)
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
  // (the browser tells us through page visibility; the iPhone app also through its pause/resume)
  let leaving = false, away = false;
  const leave = async () => {
    away = true;
    if (leaving || !settings.autoSave || !game.started || game.over) return;
    leaving = true;
    try { resumeStore().setItem(RESUME, ui.playerName); } catch (e) { /* ignore */ }
    ui.autoSaved = true;
    // (a hidden page runs slowly or not at all: if you're back before the save is done, carry on playing)
    await game.saveAndQuit(4000, () => !away);
    if (game.over) { await game.persisted; if (isNative()) backupRecords(); if (!away) location.reload(); return; }
    ui.autoSaved = false; leaving = false;
    try { resumeStore().removeItem(RESUME); } catch (e) { /* ignore */ }
  };
  const back = () => { away = false; if (ui.autoSaved && game.over) location.reload(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); else back(); });
  addEventListener('pagehide', () => { if (document.visibilityState === 'hidden') leave(); });   // (not a reload)
  document.addEventListener('nhg-pause', leave);
  document.addEventListener('nhg-resume', back);
}

// "Add to Home Screen" plays full screen and offline
function installHint() {
  const el = document.getElementById('start-install');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone || isNative();
  if (standalone || !el) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  el.innerHTML = ios ? 'For full screen and offline play: Share <b>⎙</b> → <b>Add to Home Screen</b>.' : 'For full screen and offline play: browser menu → <b>Install app</b> / <b>Add to Home screen</b>.';
  el.hidden = false;
}

// (the dev server has no precache.json, so there the worker never installs and nothing is cached)
if ('serviceWorker' in navigator && window.isSecureContext && !isNative()) {   // (the app has every file already)
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
