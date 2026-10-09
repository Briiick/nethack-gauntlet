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
      const ret = fn ? await fn.apply(handler, args) : undefined;
      return normalize(name, ret);
    } catch (err) {
      console.error('window-port call failed:', name, err);
      return normalize(name, undefined);
    }
  };
  const mod = await createNetHack({
    print: (s) => console.log('[nethack]', s),
    printErr: (s) => console.warn('[nethack]', s),
  });
  handler.mod = mod;
  try { mod.FS.mkdir(SAVE_DIR); } catch (e) { /* exists */ }
  try {
    mod.FS.mount(mod.IDBFS, {}, SAVE_DIR);
    await new Promise((res) => mod.FS.syncfs(true, () => res()));
  } catch (e) {
    console.warn('IndexedDB saves unavailable; this game will not persist', e);
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

export function persistSaves(mod) {
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
    out.push({ index: i, name: mod.UTF8ToString(txt), desc: desc ? mod.UTF8ToString(desc) : '' });
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
