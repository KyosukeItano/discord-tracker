const { ipcRenderer } = require('electron');

let isRunning = false;

const reloadBtn = document.getElementById('reloadBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const logContent = document.getElementById('logContent');
const clearLogBtn = document.getElementById('clearLogBtn');
const systemLogContentInner = document.getElementById('systemLogContentInner');
const webhookEnabledCheckbox = document.getElementById('webhookEnabled');

// 階層構造のログデータを管理
let joinLeaveLogData = {
  // guildName: { userName: [{ type: 'join'|'leave', time, channelName, stayDuration }] }
};

function addLog(message, type = 'info', isSystemLog = false, logData = null) {
  if (isSystemLog || !logData || !logData.logCategory || (logData.logCategory !== 'join' && logData.logCategory !== 'leave')) {
    // システムログの処理
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const hasTimestamp = /^\[.*?\]/.test(message);
    if (hasTimestamp) {
      logEntry.textContent = message;
    } else {
      const timestamp = new Date().toLocaleTimeString('ja-JP');
      logEntry.textContent = `[${timestamp}] ${message}`;
    }
    
    systemLogContentInner.appendChild(logEntry);
    systemLogContentInner.scrollTop = systemLogContentInner.scrollHeight;
  } else if (logData.logCategory === 'join' || logData.logCategory === 'leave') {
    // 入退室ログの処理（階層構造）
    addJoinLeaveLog(logData);
    renderJoinLeaveLogs();
  }
}

function addJoinLeaveLog(logData) {
  const { logCategory, guildName, userName, channelName, timestamp, stayDuration } = logData;
  
  if (!joinLeaveLogData[guildName]) {
    joinLeaveLogData[guildName] = {};
  }
  
  if (!joinLeaveLogData[guildName][userName]) {
    joinLeaveLogData[guildName][userName] = [];
  }
  
  joinLeaveLogData[guildName][userName].push({
    type: logCategory,
    time: new Date(timestamp),
    channelName: channelName,
    stayDuration: stayDuration || ''
  });
}

function renderJoinLeaveLogs() {
  logContent.innerHTML = '';
  
  // ギルド名でソート（アルファベット順）
  const sortedGuilds = Object.keys(joinLeaveLogData).sort();
  
  sortedGuilds.forEach(guildName => {
    // ギルドコンテナ
    const guildContainer = document.createElement('div');
    guildContainer.className = 'guild-container';
    
    const guildHeader = document.createElement('div');
    guildHeader.className = 'guild-header';
    guildHeader.innerHTML = `
      <span class="guild-icon">▼</span>
      <span class="guild-name">${guildName}</span>
    `;
    guildHeader.addEventListener('click', () => toggleGuild(guildHeader));
    
    const guildContent = document.createElement('div');
    guildContent.className = 'guild-content expanded';
    
    // ユーザー名でソート
    const sortedUsers = Object.keys(joinLeaveLogData[guildName]).sort();
    
    sortedUsers.forEach(userName => {
      // ユーザーコンテナ
      const userContainer = document.createElement('div');
      userContainer.className = 'user-container';
      
      const userHeader = document.createElement('div');
      userHeader.className = 'user-header';
      userHeader.innerHTML = `
        <span class="user-icon">▼</span>
        <span class="user-name">${userName}</span>
      `;
      userHeader.addEventListener('click', () => toggleUser(userHeader));
      
      const userContent = document.createElement('div');
      userContent.className = 'user-content expanded';
      
      // ユーザーのログを時系列順で表示（新しいものが上）
      const userLogs = [...joinLeaveLogData[guildName][userName]].sort((a, b) => b.time - a.time);
      
      userLogs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${log.type}`;
        
        const timeStr = log.time.toLocaleTimeString('ja-JP');
        if (log.type === 'join') {
          logEntry.innerHTML = `<span class="log-time">${timeStr}</span> <span class="log-icon">🔵</span> ${log.channelName} に入室`;
        } else {
          logEntry.innerHTML = `<span class="log-time">${timeStr}</span> <span class="log-icon">🔴</span> ${log.channelName} から退出${log.stayDuration}`;
        }
        
        userContent.appendChild(logEntry);
      });
      
      userContainer.appendChild(userHeader);
      userContainer.appendChild(userContent);
      guildContent.appendChild(userContainer);
    });
    
    guildContainer.appendChild(guildHeader);
    guildContainer.appendChild(guildContent);
    logContent.appendChild(guildContainer);
  });
}

function toggleGuild(header) {
  const guildContainer = header.parentElement;
  const guildContent = guildContainer.querySelector('.guild-content');
  const icon = header.querySelector('.guild-icon');
  
  if (guildContent.classList.contains('expanded')) {
    guildContent.classList.remove('expanded');
    icon.textContent = '▶';
  } else {
    guildContent.classList.add('expanded');
    icon.textContent = '▼';
  }
}

function toggleUser(header) {
  const userContainer = header.parentElement;
  const userContent = userContainer.querySelector('.user-content');
  const icon = header.querySelector('.user-icon');
  
  if (userContent.classList.contains('expanded')) {
    userContent.classList.remove('expanded');
    icon.textContent = '▶';
  } else {
    userContent.classList.add('expanded');
    icon.textContent = '▼';
  }
}

function isSystemLog(message, logData) {
  // logCategoryが指定されている場合はそれを使用
  if (logData && logData.logCategory) {
    return logData.logCategory === 'system';
  }
  
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
  } else {
    statusIndicator.classList.remove('running');
    statusText.textContent = '停止中';
  }
}

// Webhookチェックボックスの変更を監視
webhookEnabledCheckbox.addEventListener('change', () => {
  const enabled = webhookEnabledCheckbox.checked;
  ipcRenderer.send('set-webhook-enabled', enabled);
  addLog(`Webhook通知: ${enabled ? '有効' : '無効'}`, 'info', true);
});

// リロードボタンの処理
reloadBtn.addEventListener('click', () => {
  addLog('トラッカーをリロードしています...', 'info', true);
  ipcRenderer.send('reload-tracker');
});

clearLogBtn.addEventListener('click', () => {
  logContent.innerHTML = '';
  joinLeaveLogData = {};
  addLog('ログをクリアしました', 'info', true);
});

// タブ切り替え機能
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    const targetTab = button.dataset.tab;
    
    // すべてのタブボタンとコンテンツからactiveクラスを削除
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // クリックされたタブボタンと対応するコンテンツにactiveクラスを追加
    button.classList.add('active');
    const targetContent = document.getElementById(`tab-${targetTab}`);
    if (targetContent) {
      targetContent.classList.add('active');
    }
  });
});

// IPC通信の受信
ipcRenderer.on('log-message', (event, data) => {
  const isSystem = isSystemLog(data.message, data);
  addLog(data.message, data.type || 'info', isSystem, data);
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

ipcRenderer.on('tracker-reloaded', () => {
  addLog('✅ トラッカーがリロードされました', 'success', true);
  updateStatus(true);
});

ipcRenderer.on('tracker-error', (event, data) => {
  addLog(`❌ エラー: ${data.message}`, 'error', true);
  updateStatus(false);
});

// 初期状態の確認
ipcRenderer.send('get-status');
ipcRenderer.on('status', (event, data) => {
  updateStatus(data.running);
});

// 起動時のメッセージ
addLog('アプリケーションを起動しました。自動でトラッカーを開始します...', 'info', true);

// ==================== 新機能の実装 ====================

// フィルタ変数
let filterUser = '';
let filterChannel = '';
let filterGuild = '';

// 統計データとグラフ
let currentStats = null;
let currentPeriod = 'today';
let currentChart = null;
let chartType = 'channel';

// フィルタ適用済みのログデータ
function getFilteredLogData() {
  let filtered = {};
  
  Object.keys(joinLeaveLogData).forEach(guildName => {
    // ギルド名フィルタ
    if (filterGuild && !guildName.toLowerCase().includes(filterGuild.toLowerCase())) {
      return;
    }
    
    filtered[guildName] = {};
    Object.keys(joinLeaveLogData[guildName]).forEach(userName => {
      // ユーザー名フィルタ
      if (filterUser && !userName.toLowerCase().includes(filterUser.toLowerCase())) {
        return;
      }
      
      filtered[guildName][userName] = joinLeaveLogData[guildName][userName].filter(log => {
        // チャンネル名フィルタ
        if (filterChannel && !log.channelName.toLowerCase().includes(filterChannel.toLowerCase())) {
          return false;
        }
        return true;
      });
      
      // 空のユーザーエントリは削除
      if (filtered[guildName][userName].length === 0) {
        delete filtered[guildName][userName];
      }
    });
    
    // 空のギルドエントリは削除
    if (Object.keys(filtered[guildName]).length === 0) {
      delete filtered[guildName];
    }
  });
  
  return filtered;
}

// フィルタを適用してログを再表示
function applyFilters() {
  const filtered = getFilteredLogData();
  
  logContent.innerHTML = '';
  
  const sortedGuilds = Object.keys(filtered).sort();
  
  sortedGuilds.forEach(guildName => {
    const guildContainer = document.createElement('div');
    guildContainer.className = 'guild-container';
    
    const guildHeader = document.createElement('div');
    guildHeader.className = 'guild-header';
    guildHeader.innerHTML = `
      <span class="guild-icon">▼</span>
      <span class="guild-name">${guildName}</span>
    `;
    guildHeader.addEventListener('click', () => toggleGuild(guildHeader));
    
    const guildContent = document.createElement('div');
    guildContent.className = 'guild-content expanded';
    
    const sortedUsers = Object.keys(filtered[guildName]).sort();
    
    sortedUsers.forEach(userName => {
      const userContainer = document.createElement('div');
      userContainer.className = 'user-container';
      
      const userHeader = document.createElement('div');
      userHeader.className = 'user-header';
      userHeader.innerHTML = `
        <span class="user-icon">▼</span>
        <span class="user-name">${userName}</span>
      `;
      userHeader.addEventListener('click', () => toggleUser(userHeader));
      
      const userContent = document.createElement('div');
      userContent.className = 'user-content expanded';
      
      const userLogs = [...filtered[guildName][userName]].sort((a, b) => b.time - a.time);
      
      userLogs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${log.type}`;
        
        const timeStr = log.time.toLocaleTimeString('ja-JP');
        if (log.type === 'join') {
          logEntry.innerHTML = `<span class="log-time">${timeStr}</span> <span class="log-icon">🔵</span> ${log.channelName} に入室`;
        } else {
          logEntry.innerHTML = `<span class="log-time">${timeStr}</span> <span class="log-icon">🔴</span> ${log.channelName} から退出${log.stayDuration}`;
        }
        
        userContent.appendChild(logEntry);
      });
      
      userContainer.appendChild(userHeader);
      userContainer.appendChild(userContent);
      guildContent.appendChild(userContainer);
    });
    
    guildContainer.appendChild(guildHeader);
    guildContainer.appendChild(guildContent);
    logContent.appendChild(guildContainer);
  });
}

// renderJoinLeaveLogs関数を更新
const originalRenderJoinLeaveLogs = renderJoinLeaveLogs;
renderJoinLeaveLogs = function() {
  applyFilters();
};

// 統計データの表示
function renderStatistics(stats) {
  currentStats = stats;
  const statsContent = document.getElementById('statsContent');
  
  if (!stats || !stats.userStats || stats.userStats.length === 0) {
    statsContent.innerHTML = '<div class="stats-empty">データがありません</div>';
    return;
  }
  
  let html = '<div class="stats-grid">';
  
  // ユーザー別統計（トップ10）
  html += '<div class="stats-section"><h3>👤 ユーザー別（トップ10）</h3><div class="stats-list">';
  stats.userStats.slice(0, 10).forEach(stat => {
    const hours = Math.floor(stat.totalDuration / (1000 * 60 * 60));
    const minutes = Math.floor((stat.totalDuration % (1000 * 60 * 60)) / (1000 * 60));
    html += `<div class="stat-item"><span class="stat-name">${stat.userName}</span><span class="stat-value">${hours}時間${minutes}分 (${stat.joinCount}回)</span></div>`;
  });
  html += '</div></div>';
  
  // チャンネル別統計（トップ10）
  html += '<div class="stats-section"><h3>📢 チャンネル別（トップ10）</h3><div class="stats-list">';
  stats.channelStats.slice(0, 10).forEach(stat => {
    const hours = Math.floor(stat.totalDuration / (1000 * 60 * 60));
    const minutes = Math.floor((stat.totalDuration % (1000 * 60 * 60)) / (1000 * 60));
    html += `<div class="stat-item"><span class="stat-name">${stat.channelName}</span><span class="stat-value">${hours}時間${minutes}分 (${stat.joinCount}回)</span></div>`;
  });
  html += '</div></div>';
  
  html += '</div>';
  statsContent.innerHTML = html;
  
  // グラフも更新
  updateChart(stats);
}

// グラフの更新
function updateChart(stats) {
  const canvas = document.getElementById('statsChart');
  const ctx = canvas.getContext('2d');
  
  if (currentChart) {
    currentChart.destroy();
  }
  
  let labels = [];
  let data = [];
  let chartLabel = '';
  
  if (chartType === 'channel') {
    labels = stats.channelStats.slice(0, 10).map(s => s.channelName);
    data = stats.channelStats.slice(0, 10).map(s => Math.floor(s.totalDuration / (1000 * 60)));
    chartLabel = 'チャンネル別滞在時間（分）';
  } else if (chartType === 'user') {
    labels = stats.userStats.slice(0, 10).map(s => s.userName);
    data = stats.userStats.slice(0, 10).map(s => Math.floor(s.totalDuration / (1000 * 60)));
    chartLabel = 'ユーザー別滞在時間（分）';
  } else if (chartType === 'hour') {
    labels = Array.from({length: 24}, (_, i) => `${i}時`);
    data = Array.from({length: 24}, (_, i) => Math.floor((stats.hourStats[i] || 0) / (1000 * 60)));
    chartLabel = '時間帯別滞在時間（分）';
  }
  
  currentChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: chartLabel,
        data: data,
        backgroundColor: 'rgba(102, 126, 234, 0.6)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// 期間選択
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    ipcRenderer.send('get-statistics', currentPeriod);
  });
});

// グラフタイプ選択
document.querySelectorAll('.chart-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartType = btn.dataset.type;
    if (currentStats) {
      updateChart(currentStats);
    }
  });
});

// フィルタ入力
document.getElementById('searchUserInput').addEventListener('input', (e) => {
  filterUser = e.target.value;
  applyFilters();
});

document.getElementById('searchChannelInput').addEventListener('input', (e) => {
  filterChannel = e.target.value;
  applyFilters();
});

document.getElementById('searchGuildInput').addEventListener('input', (e) => {
  filterGuild = e.target.value;
  applyFilters();
});

document.getElementById('clearFilterBtn').addEventListener('click', () => {
  document.getElementById('searchUserInput').value = '';
  document.getElementById('searchChannelInput').value = '';
  document.getElementById('searchGuildInput').value = '';
  filterUser = '';
  filterChannel = '';
  filterGuild = '';
  applyFilters();
});

// エクスポート機能
document.getElementById('exportBtn').addEventListener('click', () => {
  const format = confirm('CSV形式でエクスポートしますか？（OK: CSV / キャンセル: JSON）') ? 'csv' : 'json';
  ipcRenderer.send('export-logs', format);
});

ipcRenderer.on('export-complete', (event, result) => {
  if (result.success) {
    addLog(`✅ エクスポート完了: ${result.path}`, 'success', true);
  } else {
    addLog(`❌ エクスポートエラー: ${result.error}`, 'error', true);
  }
});

// 設定モーダル
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');

settingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'flex';
  ipcRenderer.send('load-config');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

cancelSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

let currentConfig = null;

function renderChannelList(config) {
  const channelList = document.getElementById('channelList');
  channelList.innerHTML = '';
  
  if (!config || !config.channelIds) return;
  
  config.channelIds.forEach((channelId, index) => {
    if (!channelId) return;
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.innerHTML = `
      <span>${channelId}</span>
      <button class="btn-small remove-channel-btn" data-index="${index}">削除</button>
    `;
    channelList.appendChild(item);
    
    item.querySelector('.remove-channel-btn').addEventListener('click', () => {
      config.channelIds.splice(index, 1);
      renderChannelList(config);
    });
  });
}

ipcRenderer.on('config-loaded', (event, config) => {
  currentConfig = config;
  if (config) {
    document.getElementById('tokenInput').value = config.token || '';
    document.getElementById('webhookUrlInput').value = config.webhookUrl || '';
    document.getElementById('selfUserIdInput').value = config.selfUserId || '';
    renderChannelList(config);
  }
});

saveSettingsBtn.addEventListener('click', () => {
  if (!currentConfig) return;
  
  // 現在の入力値を反映（既存のconfigの内容は保持される）
  const tokenValue = document.getElementById('tokenInput').value.trim();
  const webhookUrlValue = document.getElementById('webhookUrlInput').value.trim();
  const selfUserIdValue = document.getElementById('selfUserIdInput').value.trim();
  
  // tokenが空の場合は既存の値を保持
  const configUpdates = {
    ...currentConfig,
    token: tokenValue || currentConfig.token,
    webhookUrl: webhookUrlValue,
    selfUserId: selfUserIdValue,
    channelIds: currentConfig.channelIds || []
  };
  
  // tokenやその他のフィールドも保持されるようにする
  ipcRenderer.send('save-config', configUpdates);
  settingsModal.style.display = 'none';
});

document.getElementById('addChannelBtn').addEventListener('click', () => {
  const channelId = document.getElementById('newChannelIdInput').value.trim();
  if (!channelId) return;
  
  if (!currentConfig) {
    ipcRenderer.send('load-config');
    ipcRenderer.once('config-loaded', () => {
      addChannel(channelId);
    });
  } else {
    addChannel(channelId);
  }
});

function addChannel(channelId) {
  if (!currentConfig.channelIds) {
    currentConfig.channelIds = [];
  }
  
  if (!currentConfig.channelIds.includes(channelId)) {
    currentConfig.channelIds.push(channelId);
    renderChannelList(currentConfig);
    document.getElementById('newChannelIdInput').value = '';
    
    // チャンネル情報を取得
    ipcRenderer.send('fetch-channel-info', channelId);
  }
}

ipcRenderer.on('config-saved', (event, result) => {
  if (result.success) {
    addLog('✅ 設定を保存しました', 'success', true);
  } else {
    addLog(`❌ 設定の保存に失敗: ${result.error}`, 'error', true);
  }
});

// 統計データの取得
ipcRenderer.on('statistics-data', (event, stats) => {
  renderStatistics(stats);
});

// 初期統計データの取得
setTimeout(() => {
  ipcRenderer.send('get-statistics', currentPeriod);
}, 2000);

// 定期的に統計を更新（1分ごと）
setInterval(() => {
  if (currentPeriod) {
    ipcRenderer.send('get-statistics', currentPeriod);
  }
}, 60000);

