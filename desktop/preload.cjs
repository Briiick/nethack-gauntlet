// The small, fixed set of desktop features the game page may use (saves on disk, save-on-close).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nhgDesktop', {
  listSaves: () => ipcRenderer.invoke('saves:list'),
  writeSave: (name, data) => ipcRenderer.invoke('saves:write', name, data),
  deleteSave: (name) => ipcRenderer.invoke('saves:delete', name),
  savesDir: () => ipcRenderer.invoke('saves:dir'),
  openSavesFolder: () => ipcRenderer.invoke('saves:open'),
  onCloseRequested: (fn) => ipcRenderer.on('nhg:close-requested', () => fn()),
  readyToClose: () => ipcRenderer.send('nhg:ready-to-close'),
});
