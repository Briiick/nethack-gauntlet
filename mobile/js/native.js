// Inside the iPhone/iPad app (ios-app/, Capacitor), the phone version gets a few native extras.
// In a browser none of this runs. Capacitor's native side puts each plugin on
// window.Capacitor.Plugins, so nothing needs bundling.
//  - Saves are real files in the app's Documents folder (visible in the Files app and backed up by
//    iCloud), through the same small interface the desktop app uses (engine.js picks it up).
//  - Your Hall of Fame, saved-game cards, quick slots and settings (kept in localStorage) are
//    mirrored to Documents/records.json, so they survive iOS clearing web data.
//  - Haptics, and the app's pause/resume events (leaving the app saves the game).
const cap = globalThis.Capacitor;
export const isNative = () => !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

const DIR = 'DOCUMENTS', SAVES = 'saves', RECORDS = 'records.json';
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (str) => { const s = atob(str), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
const safe = (n) => { const s = String(n).replace(/[^\w.\- ]/g, '_'); if (!s || /^\.+$/.test(s)) throw new Error('bad save name'); return s; };

export async function setupNative() {
  if (!isNative()) return false;
  const P = cap.Plugins || {}, FS = P.Filesystem;
  document.documentElement.classList.add('native');

  if (FS) {
    globalThis.nhgFiles = {
      async listSaves() {
        let files = [];
        try { files = (await FS.readdir({ path: SAVES, directory: DIR })).files || []; } catch (e) { return []; }   // no folder yet
        const out = [];
        for (const f of files) {
          const name = typeof f === 'string' ? f : f.name;
          if (!name || name.startsWith('.') || (f && f.type === 'directory')) continue;
          try { const r = await FS.readFile({ path: `${SAVES}/${name}`, directory: DIR }); out.push({ name, data: unb64(r.data) }); } catch (e) { console.warn('could not read save', name, e); }
        }
        return out;
      },
      writeSave: (name, bytes) => FS.writeFile({ path: `${SAVES}/${safe(name)}`, data: b64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)), directory: DIR, recursive: true }),
      deleteSave: (name) => FS.deleteFile({ path: `${SAVES}/${safe(name)}`, directory: DIR }).catch(() => {}),
    };
    // the saves folder, made up front (so the first launch doesn't log a "does not exist" error)
    try { const top = (await FS.readdir({ path: '', directory: DIR })).files || []; if (!top.some((f) => (f.name || f) === SAVES)) await FS.mkdir({ path: SAVES, directory: DIR, recursive: true }); } catch (e) { /* listSaves copes */ }
    await restoreRecords(FS);
  }

  globalThis.nhgHaptic = (kind = 'light') => { try { P.Haptics?.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' }); } catch (e) { /* none */ } };

  // the app going to the background / coming back (main.js saves and resumes on these)
  P.App?.addListener('pause', () => { document.dispatchEvent(new Event('nhg-pause')); if (FS) backupRecords(FS); });
  P.App?.addListener('resume', () => document.dispatchEvent(new Event('nhg-resume')));
  return true;
}

// localStorage <-> Documents/records.json
// (everything of ours except the one-shot "carry on after leaving the app" flag)
const KEYS = (k) => k.startsWith('nhg-') && k !== 'nhg-m-resume';
async function restoreRecords(FS) {
  try {
    const r = await FS.readFile({ path: RECORDS, directory: DIR, encoding: 'utf8' });
    const saved = JSON.parse(r.data);
    for (const [k, v] of Object.entries(saved)) if (KEYS(k) && localStorage.getItem(k) === null) localStorage.setItem(k, v);
  } catch (e) { /* first launch */ }
}
export async function backupRecords(FS = cap?.Plugins?.Filesystem) {
  if (!FS) return;
  const out = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (KEYS(k)) out[k] = localStorage.getItem(k); }
  try { await FS.writeFile({ path: RECORDS, data: JSON.stringify(out), directory: DIR, encoding: 'utf8' }); } catch (e) { console.warn('could not back up records', e); }
}
