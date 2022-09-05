const { ipcRenderer, contextBridge} = require('electron')

// renderer
// window.menu.openTab(...params);
contextBridge.exposeInMainWorld('menu', {
    openTab: (store) => ipcRenderer.invoke('from_t&s', store),
})
