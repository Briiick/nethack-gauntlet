// NetHack Gauntlet desktop app: the same game as the web page, in its own window.
//
// - The game is served from a private nethack:// origin, so settings persist between launches.
// - Saved games are real files in the app's data folder (see the Saves tab in Settings).
// - Closing the window saves the game in progress (like NetHack's S command), then quits.
const { app, BrowserWindow, Menu, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'nethack', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (process.env.NHG_USER_DATA) app.setPath('userData', process.env.NHG_USER_DATA);   // tests use a scratch profile

const savesDir = () => path.join(app.getPath('userData'), 'saves');
const safeName = (n) => {
  const s = path.basename(String(n)).replace(/[^\w.\- ]/g, '_');
  if (!s || /^\.+$/.test(s)) throw new Error('bad save name');
  return s;
};

// ---- saved games on disk
ipcMain.handle('saves:dir', () => { fs.mkdirSync(savesDir(), { recursive: true }); return savesDir(); });
ipcMain.handle('saves:list', () => {
  fs.mkdirSync(savesDir(), { recursive: true });
  return fs.readdirSync(savesDir(), { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith('.'))
    .map((d) => ({ name: d.name, data: fs.readFileSync(path.join(savesDir(), d.name)) }));
});
ipcMain.handle('saves:write', (_e, name, data) => {
  fs.mkdirSync(savesDir(), { recursive: true });
  const file = path.join(savesDir(), safeName(name));
  fs.writeFileSync(file + '.tmp', Buffer.from(data));
  fs.renameSync(file + '.tmp', file);   // never leave a half-written save behind
});
ipcMain.handle('saves:delete', (_e, name) => { fs.rmSync(path.join(savesDir(), safeName(name)), { force: true }); });
ipcMain.handle('saves:open', () => { fs.mkdirSync(savesDir(), { recursive: true }); return shell.openPath(savesDir()); });

// ---- the window
let win = null, allowClose = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    title: 'NetHack Gauntlet', backgroundColor: '#06060a', show: false,
    icon: path.join(__dirname, 'resources', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('nethack://game/index.html');

  // closing the window saves the game in progress first (the page answers when it's done)
  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send('nhg:close-requested');
    setTimeout(() => { allowClose = true; if (win && !win.isDestroyed()) win.close(); }, 10000);   // never hang on quit
  });
  win.on('closed', () => { win = null; });

  // keep NetHack's keys for the game: no browser shortcuts (Ctrl+R would reload and lose the game)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (process.platform === 'darwin' && input.meta && input.control && input.key.toLowerCase() === 'f')) {
      win.setFullScreen(!win.isFullScreen()); e.preventDefault();
    }
  });
  // links in the README/About open in the real browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('nethack://')) e.preventDefault(); });
}

ipcMain.on('nhg:ready-to-close', () => { allowClose = true; if (win && !win.isDestroyed()) win.close(); });

function buildMenu() {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }   // F11 toggles full screen
  // macOS needs an app menu for Quit and for copy/paste in text fields; nothing here uses Ctrl keys
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { label: 'Saves', submenu: [{ label: 'Open Saves Folder', click: () => { fs.mkdirSync(savesDir(), { recursive: true }); shell.openPath(savesDir()); } }] },
    { role: 'windowMenu' },
  ]));
}

// one copy at a time: two would each write the same saves folder
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });

app.whenReady().then(() => {
  if (!gotLock) return;
  protocol.handle('nethack', async (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC)) return new Response('forbidden', { status: 403 });
    try {
      const body = await fs.promises.readFile(file);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) {
      return new Response('not found', { status: 404 });
    }
  });
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!win) { allowClose = false; createWindow(); } });
});

app.on('window-all-closed', () => app.quit());
