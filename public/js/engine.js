// Loads NetHack 5.0 (compiled to WebAssembly with the "shim" window port) and
// routes every window-port call to a handler object. Each call is async: the
// engine suspends (Asyncify) until the returned Promise resolves.
import createNetHack from '../nethack/nethack.js';

export const SAVE_DIR = '/save';

// field offsets inside the wasm32 structs (verified with offsetof() under emcc)
export const GI = { glyph: 0, ttychar: 4, framecolor: 8, flags: 12, color: 16, symidx: 20, size: 36 };
export const MENU_ITEM = { size: 16, count: 8, flags: 12 };
export const EXTCMD = { size: 24, txt: 4, desc: 8, flags: 16 };

// Phase 1: load the engine, mount IndexedDB-backed saves, register the window port.
export async function loadEngine(handler) {
  const cbName = '__nethackGauntletCallback';
  globalThis[cbName] = async (name, ...args) => {
    if (globalThis.__nhgDebug && !/print_glyph|status_update|curs$/.test(name)) console.log('[shim]', name, JSON.stringify(args).slice(0, 200));
    try {
      const fn = handler[name];
      // what the engine is blocked on right now (read by tests and the debug console)
      handler.waiting = name; handler.calls = (handler.calls || 0) + 1;
      const ret = fn ? await fn.apply(handler, args) : undefined;
      handler.waiting = null;
      return normalize(name, ret);
    } catch (err) {
      console.error('window-port call failed:', name, err);
      return normalize(name, undefined);
    }
  };
  // NetHack can end by calling exit() without closing its windows first (quitting and skipping
  // the summary, some panics): tell the window port either way
  const ended = (code) => { try { handler.onEngineExit?.(code); } catch (e) { console.error(e); } };
  const mod = await createNetHack({
    print: (s) => console.log('[nethack]', s),
    printErr: (s) => console.warn('[nethack]', s),
    onExit: ended,
    // wrap the engine's exit imports so the UI hears about every exit
    instantiateWasm(info, receive) {
      for (const ns of Object.values(info)) {
        for (const [k, f] of Object.entries(ns)) {
          if (typeof f === 'function' && /^(_proc_exit|exitJS|_exit)$/.test(f.name)) ns[k] = (code, ...rest) => { ended(code); return f(code, ...rest); };
        }
      }
      const url = new URL('../nethack/nethack.wasm', import.meta.url);
      WebAssembly.instantiateStreaming(fetch(url), info)
        .catch(async () => WebAssembly.instantiate(await (await fetch(url)).arrayBuffer(), info))
        .then((r) => receive(r.instance), (e) => console.error('could not load nethack.wasm', e));
      return {};
    },
  });
  handler.mod = mod;
  try { mod.FS.mkdir(SAVE_DIR); } catch (e) { /* exists */ }
  if (desktop()) {
    // desktop app: saved games are real files in the app's saves folder
    try {
      for (const f of await desktop().listSaves()) { mod.FS.writeFile(SAVE_DIR + '/' + f.name, new Uint8Array(f.data)); synced.add(f.name); }
    } catch (e) { console.error('could not read the saves folder', e); }
  } else {
    try {
      mod.FS.mount(mod.IDBFS, {}, SAVE_DIR);
      await new Promise((res) => mod.FS.syncfs(true, () => res()));
    } catch (e) {
      console.warn('IndexedDB saves unavailable; this game will not persist', e);
    }
  }
  mod.ccall('shim_graphics_set_callback', null, ['string'], [cbName]);
  return mod;
}

// Phase 2: write the player's options and start NetHack's main loop.
export function runGame(mod, nethackrc) {
  try { mod.FS.mkdirTree(HOME); } catch (e) { /* exists */ }
  mod.FS.writeFile(HOME + '/.nethackrc', nethackrc);
  setTimeout(() => {
    try { mod.callMain([]); } catch (e) { if (!(e && e.name === 'ExitStatus')) console.error(e); }
  }, 0);
}

export async function deleteSave(mod, file) {
  try { mod.FS.unlink(SAVE_DIR + '/' + file); } catch (e) { /* gone */ }
  await persistSaves(mod);
}

const HOME = '/home/web_user';

// The desktop app's bridge (desktop/preload.cjs), or null in a browser.
// (also the iPhone app's file bridge, mobile/js/native.js: same interface, saves in Documents)
const desktop = () => globalThis.nhgDesktop || globalThis.nhgFiles || null;

// the save files this session knows are on disk: only these may be deleted when they leave memory
// (a backup copied into the folder while the app runs is left alone)
const synced = new Set();
export async function persistSaves(mod) {
  if (desktop()) {
    // mirror the in-memory save folder to disk: write what's there, remove what's gone
    try {
      const here = listSaves(mod);
      for (const f of here) { await desktop().writeSave(f, mod.FS.readFile(SAVE_DIR + '/' + f)); synced.add(f); }
      for (const f of [...synced]) if (!here.includes(f)) { await desktop().deleteSave(f); synced.delete(f); }
    } catch (e) { console.error('could not write the saves folder', e); }
    return;
  }
  return new Promise((res) => { try { mod.FS.syncfs(false, () => res()); } catch (e) { res(); } });
}

export function listSaves(mod) {
  try { return mod.FS.readdir(SAVE_DIR).filter((f) => !f.startsWith('.')); } catch (e) { return []; }
}

// coerce handler results to what the C side expects for each return type
const STRING_RET = new Set(['shim_getmsghistory', 'shim_get_color_string']);
const BOOL_RET = new Set(['shim_player_selection_or_tty']);
const CHAR_RET = new Set(['shim_yn_function', 'shim_message_menu']);
function normalize(name, v) {
  if (STRING_RET.has(name)) return typeof v === 'string' ? v : '';
  if (BOOL_RET.has(name)) return !!v;
  if (CHAR_RET.has(name)) {
    const n = typeof v === 'string' ? v.charCodeAt(0) : (v | 0);
    return Math.max(0, Math.min(127, n));
  }
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  return v | 0;
}

// readers for engine memory
export function readGlyphInfo(mod, ptr) {
  if (!ptr) return null;
  const h32 = mod.HEAP32;
  const b = ptr >> 2;
  return {
    glyph: h32[b],
    ttychar: h32[b + 1],
    flags: h32[(ptr + GI.flags) >> 2] >>> 0,
    color: h32[(ptr + GI.color) >> 2],
  };
}

export function readExtCommands(mod) {
  const base = globalThis.nethackGlobal?.pointers?.extcmdlist;
  const out = [];
  if (!base) return out;
  for (let i = 0; i < 400; i++) {
    const p = base + i * EXTCMD.size;
    const txt = mod.getValue(p + EXTCMD.txt, '*');
    if (!txt) break;
    const desc = mod.getValue(p + EXTCMD.desc, '*');
    out.push({ index: i, name: mod.UTF8ToString(txt), desc: desc ? mod.UTF8ToString(desc) : '',
      key: mod.HEAPU8[p], flags: mod.getValue(p + EXTCMD.flags, 'i32') >>> 0 });
  }
  return out;
}

export function writeMenuSelection(mod, listPtr, selected) {
  if (!selected.length) { mod.setValue(listPtr, 0, '*'); return 0; }
  const buf = mod._malloc(selected.length * MENU_ITEM.size);
  selected.forEach((s, i) => {
    const p = buf + i * MENU_ITEM.size;
    mod.setValue(p, s.ident, 'i32');        // anything.a_int / a_obj (low 32 bits)
    mod.setValue(p + 4, s.identHi || 0, 'i32');
    mod.setValue(p + MENU_ITEM.count, s.count ?? -1, 'i32');
    mod.setValue(p + MENU_ITEM.flags, 0, 'i32');
  });
  mod.setValue(listPtr, buf, '*');
  return selected.length;
}
