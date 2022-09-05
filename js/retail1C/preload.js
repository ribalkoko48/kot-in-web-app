const { session} = require('electron')

window.addEventListener("DOMContentLoaded", async () => {
    const ext = await session.defaultSession.loadExtension('C:/projects/trade-and-service-electron/extension1C')

    console.log('ext', ext)
});
