const {ipcRenderer, contextBridge} = require('electron')

const waitElement = (selector, delay) => new Promise((resolve) => {
    let waitTime = delay || 5000;

    const checkExist = setInterval(function () {
        const element = document.querySelector(selector);

        if (waitTime <= 0) {
            clearInterval(checkExist);
            resolve(null);
        }
        if (waitTime > 0 && element) {
            clearInterval(checkExist);
            resolve(element);
        }
        waitTime -= 100;
    }, 100);
});

contextBridge.exposeInMainWorld('versions', {
    ping: () => ipcRenderer.invoke('ping'),
})

window.addEventListener("DOMContentLoaded", () => {
    const startListener = async () => {
        const selectedShopButton = await waitElement('[data-test-id="ShopModal-button"]', Infinity)
        const listener = () => {
            ipcRenderer.send('t&s -> main: store', JSON.parse(localStorage.getItem('shopItem')))
            ipcRenderer.on('main -> t&s', (e, args) => console.log(args))

            selectedShopButton.removeEventListener('click', listener);
            startListener();
        }

        selectedShopButton.addEventListener('click', listener);
    }

    // TODO нужно добавить возобновление прослушки по закрытию модалки
    startListener();
})
