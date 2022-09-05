// Modules to control application life and create native browser window
const {app, BrowserWindow, ipcMain, Menu} = require('electron')
const path = require('path')

let isPageInMaxSize = false;
let selectedStore = null;

// const isMac = process.platform === 'darwin'

const template = [
  // { role: 'appMenu' }
  // { role: 'fileMenu' }
  {
    label: 'File',
    submenu: [
      { role: 'quit' }
    ]
  },
  // { role: 'editMenu' }
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'delete' },
      { type: 'separator' },
      { role: 'selectAll' }
    ]
  },
  // { role: 'viewMenu' }
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  // { role: 'windowMenu' }
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { role: 'close' }
    ]
  },
  {
    role: 'help',
    submenu: [
      {
        label: 'Learn More',
        click: async () => {
          const { shell } = require('electron')
          await shell.openExternal('https://electronjs.org')
        }
      }
    ]
  }
]

const menu = Menu.buildFromTemplate(template)

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
  /*    plugins: true,
      webSecurity: false,
      enableRemoteModule: true,*/
      webviewTag: true,
      // contextIsolation: false,
      preload: path.join(__dirname, 'js/preload.js')
    },
    frame: false
  })
  ipcMain.on(`display-app-menu`, function(e, args) {
    if (mainWindow) {
      menu.popup({
        window: mainWindow,
        x: args.x,
        y: args.y
      });
    }
  });

  ipcMain.handle('ping', () => selectedStore);

  ipcMain.handle('from_t&s', (event, store) => mainWindow.webContents.send('from_t&s2', store))

  // menu
  ipcMain.handle('getCurrentWindow', () => mainWindow.getCurrentWindow())
  ipcMain.handle('openMenu', () => menu.popup())
  ipcMain.handle('minimizeWindow', () => mainWindow.minimize())
  ipcMain.handle('maxUnmaxWindow', () => {
    if (isPageInMaxSize) {
      isPageInMaxSize = false;
      mainWindow.unmaximize();
    } else {
      isPageInMaxSize = true;
      mainWindow.maximize();
    }
  })
  ipcMain.handle('closeWindow', () => mainWindow.close())

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')
  mainWindow.webContents.openDevTools();

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
