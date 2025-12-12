const { ipcRenderer } = require('electron');

let isRunning = false;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const logContent = document.getElementById('logContent');
const clearLogBtn = document.getElementById('clearLogBtn');
const systemLogToggle = document.getElementById('systemLogToggle');
const systemLogContent = document.getElementById('systemLogContent');
const systemLogContentInner = document.getElementById('systemLogContentInner');
const accordionIcon = document.getElementById('accordionIcon');
const webhookEnabledCheckbox = document.getElementById('webhookEnabled');

function addLog(message, type = 'info', isSystemLog = false) {
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  
  // メッセージに既にタイムスタンプが含まれているかチェック（[で始まる形式）
  const hasTimestamp = /^\[.*?\]/.test(message);
  
  if (hasTimestamp) {
    // 既にタイムスタンプが含まれている場合はそのまま使用
    logEntry.textContent = message;
  } else {
    // タイムスタンプがない場合は追加
    const timestamp = new Date().toLocaleTimeString('ja-JP');
    logEntry.textContent = `[${timestamp}] ${message}`;
  }
  
  if (isSystemLog) {
    systemLogContentInner.appendChild(logEntry);
    systemLogContentInner.scrollTop = systemLogContentInner.scrollHeight;
  } else {
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
  }
}

function isSystemLog(message) {
  // 入退出ログの判定（🔵 または 🔴 で始まる）
  const isJoinLeave = message.includes('🔵') || message.includes('🔴');
  
  if (isJoinLeave) {
    return false; // 入退出ログ
  }
  
  // チャンネル情報の取得ログ（✓ で始まり、括弧内にIDがある）
  if (message.match(/^\s*✓\s+.+\([0-9]+\)/)) {
    return true; // システムログ
  }
  
  // システムログの判定
  const systemKeywords = [
    '🚀 Gateway Tracker',
    '📋 チャンネル情報',
    '🔌 Gateway',
    '✓ WebSocket',
    '📤 Identify',
    '✓ Gateway接続',
    '✓ ログイン成功',
    '⚠️ 再接続',
    '⚠️ セッション',
    '✓ セッション再開',
    'セッションID',
    '監視チャンネル数',
    '⏹️ Gateway Tracker',
    'トラッカーを開始',
    'トラッカーを停止',
    'アプリケーションを起動',
    'ログをクリア'
  ];
  
  return systemKeywords.some(keyword => message.includes(keyword));
}

function updateStatus(running) {
  isRunning = running;
  if (running) {
    statusIndicator.classList.add('running');
    statusText.textContent = '実行中';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusIndicator.classList.remove('running');
    statusText.textContent = '停止中';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// Webhookチェックボックスの変更を監視
webhookEnabledCheckbox.addEventListener('change', () => {
  const enabled = webhookEnabledCheckbox.checked;
  ipcRenderer.send('set-webhook-enabled', enabled);
  addLog(`Webhook通知: ${enabled ? '有効' : '無効'}`, 'info', true);
});

startBtn.addEventListener('click', () => {
  const webhookEnabled = webhookEnabledCheckbox.checked;
  ipcRenderer.send('start-tracker', { webhookEnabled });
  addLog('トラッカーを開始しています...', 'info', true);
});

stopBtn.addEventListener('click', () => {
  ipcRenderer.send('stop-tracker');
  addLog('トラッカーを停止しています...', 'info', true);
});

clearLogBtn.addEventListener('click', () => {
  logContent.innerHTML = '';
  addLog('ログをクリアしました', 'info', false);
});

// アコーディオンの開閉
let isSystemLogExpanded = false;
systemLogToggle.addEventListener('click', () => {
  isSystemLogExpanded = !isSystemLogExpanded;
  if (isSystemLogExpanded) {
    systemLogContent.style.display = 'block';
    systemLogContent.classList.add('expanded');
    systemLogToggle.classList.add('active');
  } else {
    systemLogContent.style.display = 'none';
    systemLogContent.classList.remove('expanded');
    systemLogToggle.classList.remove('active');
  }
});

// IPC通信の受信
ipcRenderer.on('log-message', (event, data) => {
  const isSystem = isSystemLog(data.message);
  addLog(data.message, data.type || 'info', isSystem);
});

ipcRenderer.on('status-update', (event, data) => {
  updateStatus(data.running);
});

ipcRenderer.on('tracker-started', () => {
  addLog('✅ トラッカーが開始されました', 'success', true);
  updateStatus(true);
});

ipcRenderer.on('tracker-stopped', () => {
  addLog('⏹️ トラッカーが停止されました', 'info', true);
  updateStatus(false);
});

// 初期状態の確認
ipcRenderer.send('get-status');
ipcRenderer.on('status', (event, data) => {
  updateStatus(data.running);
});

