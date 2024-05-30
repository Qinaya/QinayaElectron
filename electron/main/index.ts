import { app, BrowserWindow, shell, ipcMain, powerMonitor } from 'electron';
import { release } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.__filename = fileURLToPath(import.meta.url);
globalThis.__dirname = dirname(__filename);

process.env.DIST_ELECTRON = join(__dirname, '..');

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
const preload = join(__dirname, '../preload/index.mjs');

const createWindow = () => {
  win = new BrowserWindow({
    fullscreen: true, // Make the window fill the whole screen
    frame: false, // Remove window decorations, including the menu bar
    webPreferences: {
      preload,
      webSecurity: false, // Disable webSecurity to disable CORS
    },
  });

  // Directly load app.qinaya.co
  const appURL = 'https://xapp.qinaya.co';
  win.loadURL(appURL);
  win.webContents.session.clearStorageData({
    storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage']

  });
  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
};

app.on('ready', () => {
  powerMonitor.on('suspend', () => {
    console.log('System suspended');
    app.relaunch()
    app.exit()
  })
  powerMonitor.on('resume', () => {
    console.log('System resumed');
    //createWindow();
  })
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

});
