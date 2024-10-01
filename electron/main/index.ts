import { app, powerSaveBlocker, BrowserWindow, shell, ipcMain, powerMonitor, screen } from 'electron';
import { release } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as net from 'net';

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
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width, // Set the window width to the screen width
    height, // Set the window height to the screen height
    frame: false, // Remove window decorations, including the menu bar
    fullscreen: true,
    webPreferences: {
      preload,
      webSecurity: false, // Disable webSecurity to disable CORS
    },
  });

  // Directly load app.qinaya.co
  const appURL = 'https://tapp.qinaya.co';
  win.loadURL(appURL, { extraHeaders: 'pragma: no-cache\n' });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
};
// Adding powerSaveBlocker to prevent app suspension
//const id = powerSaveBlocker.start('prevent-app-suspension');
//console.log('PowerSaveBlocker is started:', powerSaveBlocker.isStarted(id));

// TCP Ping functionality
async function ping(options: { host: string, port: number, timeout?: number }) {
  const _options = options || {};
  const host = _options.host || 'localhost';
  const port = _options.port || 80;
  const timeout = _options.timeout || 5000;
  const start = process.hrtime();
  const result: { host: string, port: number, time?: string, success?: boolean, error?: string } = { host, port };

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.connect(parseInt(port.toString()), host, () => {
      result.time = _getElapsedTime(start);
      result.success = true;
      socket.destroy();
      resolve(result);
    });

    socket.on('error', (e) => {
      result.time = _getElapsedTime(start);
      result.success = false;
      result.error = e.message;
      socket.destroy();
      resolve(result);
    });

    socket.setTimeout(timeout, () => {
      result.time = _getElapsedTime(start);
      result.success = false;
      result.error = 'Request Timeout';
      socket.destroy();
      resolve(result);
    });
  });
}

function _getElapsedTime(startAt: [number, number]) {
  const elapsed = process.hrtime(startAt);
  const ms = (elapsed[0] * 1e3) + (elapsed[1] * 1e-6);
  return ms.toFixed(3);
}

// Function to calculate stats
function calculateStats(times: number[]) {
  const total = times.length;
  const successTimes = times.filter(time => time !== null);
  const lostPackets = total - successTimes.length;

  // Average response time
  const avgTime = successTimes.reduce((acc, cur) => acc + cur, 0) / successTimes.length;

  // Jitter (average of differences between consecutive pings)
  const jitter = successTimes.reduce((acc, cur, i, arr) => {
    if (i === 0) return acc;
    return acc + Math.abs(cur - arr[i - 1]);
  }, 0) / (successTimes.length - 1);

  return {
    avgTime: avgTime.toFixed(3),
    jitter: jitter.toFixed(3),
    lostPackets,
    successCount: successTimes.length,
  };
}

// Function to run 5 pings every 5 seconds and log stats
async function runPingTest() {
  const times: number[] = [];

  for (let i = 0; i < 5; i++) {
    const result = await ping({ host: 'ping.qinaya.co', port: 80 });
    
    // Log each individual ping result
    if (result.success) {
      console.log(`Ping ${i + 1}: ${result.time} ms`);

      times.push(parseFloat(result.time));
    } else {
      console.log(`Ping ${i + 1}: Failed (${result.error})`);
      times.push(null); // Represent packet loss as null
    }

    // Wait for 5 seconds before next ping
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const stats = calculateStats(times);
  console.log(`Ping test complete. Stats:
    - Average Time: ${stats.avgTime} ms
    - Jitter: ${stats.jitter} ms
    - Lost Packets: ${stats.lostPackets}/5
    - Successful Pings: ${stats.successCount}/5
  `);
}

// Function to continuously run ping test every 5 seconds
function startContinuousPing() {
  // Run the ping test every 5 seconds continuously
  runPingTest(); // Run initial ping test immediately
  setInterval(runPingTest, 5000); // Repeat every 5 seconds
}

// Electron app lifecycle events
app.on('ready', async () => {
  powerMonitor.on('suspend', () => {
    console.log('System suspended');
  });

  powerMonitor.on('resume', async () => {
    console.log('System resumed');
    app.relaunch();
    app.exit();
  });

  powerMonitor.on('unlock-screen', async () => {
    console.log('unlocked screen');
    app.relaunch();
    app.exit();
  });

  // Start continuous ping test when the app is ready
  startContinuousPing();
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

