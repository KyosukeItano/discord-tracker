const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const GatewayTracker = require('./gateway-tracker-core');

let mainWindow = null;
let tracker = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // 開発時のみDevToolsを開く
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (tracker) {
    tracker.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC通信ハンドラー
ipcMain.on('start-tracker', async (event, options = {}) => {
  if (!tracker) {
    tracker = new GatewayTracker();
    tracker.on('log', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('log-message', data);
      }
    });
    tracker.on('status', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('status-update', data);
      }
    });
    try {
      await tracker.start(options);
      event.reply('tracker-started');
    } catch (error) {
      event.reply('tracker-error', { message: error.message });
    }
  }
});

ipcMain.on('set-webhook-enabled', (event, enabled) => {
  if (tracker) {
    tracker.setWebhookEnabled(enabled);
  }
});

ipcMain.on('stop-tracker', (event) => {
  if (tracker) {
    tracker.stop();
    tracker = null;
    event.reply('tracker-stopped');
  }
});

ipcMain.on('get-status', (event) => {
  if (tracker) {
    event.reply('status', { running: true });
  } else {
    event.reply('status', { running: false });
  }
});

