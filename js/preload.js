// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { ipcRenderer, contextBridge} = require('electron')

let openTabListener = null;

contextBridge.exposeInMainWorld('menu', {
  getCurrentWindow: () => ipcRenderer.invoke('getCurrentWindow'),
  openMenu: () => ipcRenderer.invoke('openMenu'),
  minimizeWindow: () => ipcRenderer.invoke('minimizeWindow'),
  maxUnmaxWindow: () => ipcRenderer.invoke('maxUnmaxWindow'),
  isMaximizable: () => ipcRenderer.invoke('isMaximizable'),
  closeWindow: () => ipcRenderer.invoke('closeWindow'),
})

contextBridge.exposeInMainWorld('preloadTabGroup', {
  setPreloadTabGroup: (innerListener) => openTabListener = innerListener
})

ipcRenderer.on('from_t&s2', (event, args) => openTabListener(args))
