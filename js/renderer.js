// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

let STORE_ID = null;
let TAB_1C = null;

const tabGroup = document.querySelector("tab-group");

window.tabGroup = tabGroup;

tabGroup?.setDefaultTab({
    title: "Яндекс",
    src: "https://ya.ru/",
    active: true
});

const tradeAndServiceTab =  tabGroup?.addTab({
    title: "T&S",
    // src: "http://localhost:4002/",
    src: "https://trade-and-service.test-middle.megafon.ru:2047/",
    webviewAttributes: {
        preload: 'js/trade-and-service/preload.js',

        /*  plugins: true,
          webSecurity: false,
          enableRemoteModule: true,
          contextIsolation: false,
          nodeIntegration: true,
          nodeIntegrationInWorker: true*/
    },
    active: true,
    closable: false,
});

tabGroup?.addTab({
    title: "CCM Portal",
    src: "https://ccmp.megafon.ru/",
    closable: false,
});

// DevTools
// tradeAndServiceTab.on("webview-ready", t => t.webview.openDevTools());

const tab1CListener = async () => {
    const tradeAndServiceStore = await window.versions.ping();

    if (tradeAndServiceStore && tradeAndServiceStore?.id !== STORE_ID) {
        if (TAB_1C) {
            TAB_1C.closable = true;
            TAB_1C.close();
        }

        STORE_ID = tradeAndServiceStore?.id || null;
        TAB_1C = tabGroup.addTab({
            title: "1C",
            src: 'http://hqpv-1ctester/Terminal_Reliz/ru_RU/',
            active: true,
            closable: false,
        })
        tab1CListener();
    } else {
        setTimeout(() => {
            tab1CListener();
        }, 500)
    }
}

tab1CListener();

// menu
window.addEventListener("DOMContentLoaded", () => {
    const menuButton = document.getElementById("menu-btn");
    const minimizeButton = document.getElementById("minimize-btn");
    const maxUnmaxButton = document.getElementById("max-unmax-btn");
    const closeButton = document.getElementById("close-btn");

    menuButton.addEventListener("click", e => {
        // Opens menu at (x,y) coordinates of mouse click on the hamburger icon.
        window.menu.openMenu(e.x, e.y);
    });

    minimizeButton.addEventListener("click", async () => {
        await window.menu.minimizeWindow();
    });

    maxUnmaxButton.addEventListener("click", e => {
        const icon = maxUnmaxButton.querySelector("i.far");

        window.menu.maxUnmaxWindow(window.menu.isMaximizable);

        // Change the middle maximize-unmaximize icons.
        if (window.menu.isMaximizable) {
            icon.classList.remove("fa-square");
            icon.classList.add("fa-clone");
        } else {
            icon.classList.add("fa-square");
            icon.classList.remove("fa-clone");
        }
    });

    closeButton.addEventListener("click", async () => {
        await window.menu.closeWindow();
    });
});

