const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const GatewayTracker = require('./gateway-tracker-core');
const DataManager = require('./data-manager');

let mainWindow = null;
let tracker = null;
let dataManager = null;

// データマネージャーの初期化
function initDataManager() {
  if (!dataManager) {
    const logDir = path.join(__dirname, 'log');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    dataManager = new DataManager(logDir);
  }
  return dataManager;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // ウィンドウが読み込まれたら自動で開始
  mainWindow.webContents.once('did-finish-load', () => {
    initDataManager();
    autoStartTracker();
  });

  // ウィンドウが閉じられたときにmainWindowをnullに設定
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

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

// ウィンドウが読み込まれたら自動で開始
function autoStartTracker() {
  if (!tracker) {
    tracker = new GatewayTracker();
    tracker.on('log', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('log-message', data);
        } catch (error) {
          // ウィンドウが破棄されている場合は無視
        }
      }
    });
    tracker.on('status', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('status-update', data);
        } catch (error) {
          // ウィンドウが破棄されている場合は無視
        }
      }
    });
    
    // Webhookの設定を読み込む（config.jsonから）
    const configPath = path.join(__dirname, 'config.json');
    let webhookEnabled = true;
    try {
      const fs = require('fs');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        webhookEnabled = config.autoWebhookEnabled !== false;
      }
    } catch (error) {
      console.error('設定読み込みエラー:', error);
    }
    
    tracker.start({ webhookEnabled })
      .then(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.webContents.send('tracker-started');
          } catch (error) {
            // ウィンドウが破棄されている場合は無視
          }
        }
      })
      .catch(err => {
        console.error('トラッカー起動エラー:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.webContents.send('tracker-error', { message: err.message });
          } catch (error) {
            // ウィンドウが破棄されている場合は無視
          }
        }
      });
  }
}

// アプリケーションが閉じられる前にトラッカーを停止
app.on('before-quit', () => {
  if (tracker) {
    // イベントリスナーを削除して、破棄されたウィンドウへの送信を防ぐ
    tracker.removeAllListeners('log');
    tracker.removeAllListeners('status');
    tracker.stop();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC通信ハンドラー
ipcMain.on('start-tracker', async (event, options = {}) => {
  if (!tracker) {
    tracker = new GatewayTracker();
    tracker.on('log', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('log-message', data);
        } catch (error) {
          // ウィンドウが破棄されている場合は無視
        }
      }
    });
    tracker.on('status', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('status-update', data);
        } catch (error) {
          // ウィンドウが破棄されている場合は無視
        }
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

ipcMain.on('reload-tracker', async (event) => {
  // 既存のトラッカーを停止
  if (tracker) {
    tracker.stop();
    tracker = null;
  }
  
  // 少し待ってから再起動
  setTimeout(() => {
    autoStartTracker();
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('tracker-reloaded');
      } catch (error) {
        // ウィンドウが破棄されている場合は無視
      }
    }
  }, 500);
});

// 統計データの取得
ipcMain.on('get-statistics', (event, period = 'all') => {
  const dm = initDataManager();
  const logs = dm.loadLogs();
  const stats = dm.calculateStatistics(logs, period);
  event.reply('statistics-data', stats);
});

// ログデータのエクスポート
ipcMain.on('export-logs', async (event, format = 'csv') => {
  const dm = initDataManager();
  const logs = dm.loadLogs();
  
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'ログデータをエクスポート',
    defaultPath: `voice_logs_${new Date().toISOString().split('T')[0]}.${format}`,
    filters: [
      { name: format === 'csv' ? 'CSV ファイル' : 'JSON ファイル', extensions: [format] }
    ]
  });
  
  if (!result.canceled && result.filePath) {
    try {
      let content;
      if (format === 'csv') {
        content = dm.exportToCsv(logs);
      } else {
        content = dm.exportToJson(logs);
      }
      fs.writeFileSync(result.filePath, content, 'utf8');
      event.reply('export-complete', { success: true, path: result.filePath });
    } catch (error) {
      event.reply('export-complete', { success: false, error: error.message });
    }
  }
});

// 設定の読み込み
ipcMain.on('load-config', (event) => {
  const configPath = path.join(__dirname, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      event.reply('config-loaded', config);
    } else {
      event.reply('config-loaded', null);
    }
  } catch (error) {
    event.reply('config-error', { message: error.message });
  }
});

// 設定の保存
ipcMain.on('save-config', (event, configUpdates) => {
  const configPath = path.join(__dirname, 'config.json');
  try {
    // 既存のconfig.jsonを読み込んで、更新分だけをマージ
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    // configUpdatesの内容で既存のconfigを更新（すべてのフィールドを保持）
    Object.keys(configUpdates).forEach(key => {
      config[key] = configUpdates[key];
    });
    
    // config.jsonに保存
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    event.reply('config-saved', { success: true });
    
    // トラッカーが実行中の場合は設定を更新し、再初期化を提案
    if (tracker && tracker.config) {
      tracker.config = config;
      // チャンネル情報の再取得が必要な場合は再初期化を提案
      if (configUpdates.channelIds) {
        tracker.initializeChannels().catch(err => {
          console.error('チャンネル情報の再取得エラー:', err);
        });
      }
    }
  } catch (error) {
    event.reply('config-saved', { success: false, error: error.message });
  }
});

// チャンネル情報の取得
ipcMain.on('fetch-channel-info', async (event, channelId) => {
  if (!tracker || !tracker.config) {
    event.reply('channel-info', { error: 'トラッカーが起動していません' });
    return;
  }
  
  try {
    const channel = await tracker.fetchChannel(channelId);
    if (channel) {
      event.reply('channel-info', { 
        success: true, 
        channelId: channelId,
        channelName: channel.name,
        guildId: channel.guild_id 
      });
    } else {
      event.reply('channel-info', { error: 'チャンネル情報の取得に失敗しました' });
    }
  } catch (error) {
    event.reply('channel-info', { error: error.message });
  }
});

