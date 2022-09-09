// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

let TABS = {};
const tabGroup = document.querySelector("tab-group");

tabGroup?.setDefaultTab({
    title: "Яндекс",
    src: "https://ya.ru/",
    active: true
});

const listener = (data) => {
    console.log('listener', data)

    if (TABS[data.title]) {
        TABS[data.title].closable = true;
        TABS[data.title].close();
    }

    TABS[data.title] = tabGroup.addTab({
        title: data.title,
        src: data.url,
        active: true,
        closable: true,
    })
}

window.preloadTabGroup.setListener(listener);

const mainPage =  tabGroup?.addTab({
    title: "Kot.inc",
    src: "https://ribalkoko48.github.io/",
    webviewAttributes: {
        preload: 'js/mainPage/preload.js',
    },
    active: true,
    closable: false,
});

mainPage.on("webview-ready", t => t.webview.openDevTools());

// DevTools
// tradeAndServiceTab.on("webview-ready", t => t.webview.openDevTools());

// menu
window.addEventListener("DOMContentLoaded", () => {
    const menuButton = document.getElementById("menu-btn");
    const minimizeButton = document.getElementById("minimize-btn");
    const maxUnmaxButton = document.getElementById("max-unmax-btn");
    const closeButton = document.getElementById("close-btn");

    menuButton.addEventListener("click", async (e) => {
        // Opens menu at (x,y) coordinates of mouse click on the hamburger icon.
        await window.menu.openMenu(e.x, e.y);
    });

    minimizeButton.addEventListener("click", async () => {
        await window.menu.minimizeWindow();
    });

    maxUnmaxButton.addEventListener("click", e => {
        const icon = maxUnmaxButton.querySelector("i.far");

        window.menu.maxUnmaxWindow();

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

