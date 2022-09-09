const {ipcRenderer, contextBridge} = require('electron')

// renderer
// window.menu.openTab(...params);
contextBridge.exposeInMainWorld('menu', {
    openTab: (store) => ipcRenderer.invoke('from_t&s', store),
})

window.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll('a');

    buttons.forEach((button) => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            ipcRenderer.invoke('from_t&s', {url: button.href, title: button.innerText})
        })

    }
)
});
