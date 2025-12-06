// Discord Gateway API を使ったボイスチャンネル監視
// ⚠️ 警告: User Tokenの使用はDiscord利用規約に違反する可能性があります

const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 設定ファイルを読み込む
const configPath = path.join(__dirname, 'config.json');
let config = {};

try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    console.error('❌ config.json が見つかりません。config.example.json をコピーして設定してください。');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ config.json の読み込みに失敗しました:', error.message);
  process.exit(1);
}

// 必須設定の確認
if (!config.token || config.token === 'YOUR_USER_TOKEN_HERE') {
  console.error('❌ config.json に有効な token を設定してください。');
  process.exit(1);
}

if (!config.channelIds || config.channelIds.length === 0) {
  console.error('❌ config.json に監視したい channelIds を設定してください。');
  process.exit(1);
}

// 定数
const DISCORD_API = 'https://discord.com/api/v10';
const GATEWAY_VERSION = 10;
const GATEWAY_ENCODING = 'json';

let ws = null;
let heartbeatInterval = null;
let sequence = null;
let sessionId = null;
let resumeGatewayUrl = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000;

// チャンネルIDと名前のマッピング（後で更新）
const channelMap = new Map();
const userMap = new Map();

// 現在のボイス状態（チャンネルID -> ユーザーIDの配列）
const voiceStates = new Map();

// 日付フォーマット
function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

// HTTPリクエスト（Gateway URL取得用）
function httpsRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Gateway URLを取得
async function getGatewayUrl() {
  try {
    const response = await httpsRequest({
      hostname: 'discord.com',
      path: '/api/v10/gateway',
      method: 'GET',
      headers: {
        'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0)'
      }
    });
    
    if (response.status === 200 && response.data.url) {
      return response.data.url;
    }
    throw new Error('Gateway URLの取得に失敗しました');
  } catch (error) {
    console.error('❌ Gateway URL取得エラー:', error.message);
    throw error;
  }
}

// チャンネル情報を取得
async function fetchChannel(channelId) {
  try {
    const response = await httpsRequest({
      hostname: 'discord.com',
      path: `/api/v10/channels/${channelId}`,
      method: 'GET',
      headers: {
        'Authorization': config.token,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.status === 200) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.warn(`⚠️ チャンネル ${channelId} の情報取得に失敗:`, error.message);
    return null;
  }
}

// ユーザー情報を取得
async function fetchUser(userId) {
  if (userMap.has(userId)) {
    return userMap.get(userId);
  }
  
  try {
    const response = await httpsRequest({
      hostname: 'discord.com',
      path: `/api/v10/users/${userId}`,
      method: 'GET',
      headers: {
        'Authorization': config.token,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.status === 200) {
      userMap.set(userId, response.data);
      return response.data;
    }
    return null;
  } catch (error) {
    console.warn(`⚠️ ユーザー ${userId} の情報取得に失敗:`, error.message);
    return null;
  }
}

// Webhook送信
async function sendWebhook(content) {
  if (!config.webhookUrl || !config.autoWebhookEnabled) {
    return;
  }
  
  try {
    const url = new URL(config.webhookUrl);
    const payload = {
      content: content,
      username: 'Voice Tracker'
    };
    
    const response = await httpsRequest({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DiscordTracker/1.0'
      }
    }, payload);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('✓ Webhook送信成功');
    } else {
      console.warn('⚠️ Webhook送信失敗:', response.status, response.data);
    }
  } catch (error) {
    console.warn('⚠️ Webhook送信エラー:', error.message);
  }
}

// 入退室イベントを処理
async function handleVoiceStateUpdate(data) {
  const userId = data.user_id;
  const channelId = data.channel_id;
  const guildId = data.guild_id;
  
  // 自分自身を除外
  if (config.selfUserId && userId === config.selfUserId) {
    return;
  }
  
  // 監視対象チャンネルか確認
  const isWatchedChannel = config.channelIds.includes(channelId);
  const previousChannelId = voiceStates.get(userId);
  const wasWatchedChannel = previousChannelId && config.channelIds.includes(previousChannelId);
  
  // ユーザー情報を取得
  const user = await fetchUser(userId);
  const username = user ? (user.global_name || user.username) : `User ${userId}`;
  
  // チャンネル情報を取得
  let channelName = channelId;
  if (channelId) {
    if (!channelMap.has(channelId)) {
      const channel = await fetchChannel(channelId);
      if (channel) {
        channelMap.set(channelId, channel.name);
      }
    }
    channelName = channelMap.get(channelId) || channelId;
  }
  
  const now = formatDate(new Date());
  
  // 入室
  if (channelId && isWatchedChannel && (!previousChannelId || previousChannelId !== channelId)) {
    voiceStates.set(userId, channelId);
    
    console.log(`🔵 [${now}] ${username} が ${channelName} に入室しました`);
    
    if (config.notificationsEnabled) {
      console.log(`   → 通知: ${username} が ${channelName} に入室`);
    }
    
    if (config.autoWebhookEnabled) {
      await sendWebhook(`🔵 **${username}** が **${channelName}** に入室しました`);
    }
  }
  
  // 退出
  if (previousChannelId && wasWatchedChannel && (!channelId || channelId !== previousChannelId)) {
    const previousChannelName = channelMap.get(previousChannelId) || previousChannelId;
    
    if (channelId) {
      voiceStates.set(userId, channelId);
    } else {
      voiceStates.delete(userId);
    }
    
    console.log(`🔴 [${now}] ${username} が ${previousChannelName} から退出しました`);
    
    if (config.notificationsEnabled) {
      console.log(`   → 通知: ${username} が ${previousChannelName} から退出`);
    }
    
    if (config.autoWebhookEnabled) {
      await sendWebhook(`🔴 **${username}** が **${previousChannelName}** から退出しました`);
    }
  } else if (channelId) {
    voiceStates.set(userId, channelId);
  } else if (previousChannelId) {
    voiceStates.delete(userId);
  }
}

// WebSocket接続
async function connect() {
  try {
    let gatewayUrl = resumeGatewayUrl;
    
    if (!gatewayUrl) {
      gatewayUrl = await getGatewayUrl();
      gatewayUrl = `${gatewayUrl}?v=${GATEWAY_VERSION}&encoding=${GATEWAY_ENCODING}`;
    }
    
    console.log('🔌 Gatewayに接続中...');
    
    ws = new WebSocket(gatewayUrl);
    
    ws.on('open', () => {
      console.log('✓ WebSocket接続確立');
      reconnectAttempts = 0;
      
      // ResumeまたはIdentifyを送信
      if (sessionId && sequence !== null) {
        sendResume();
      } else {
        sendIdentify();
      }
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleGatewayMessage(message);
      } catch (error) {
        console.error('❌ メッセージ解析エラー:', error.message);
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocketエラー:', error.message);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`⚠️ WebSocket接続が閉じられました (コード: ${code})`);
      
      // ハートビートを停止
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      
      // 再接続を試みる
      if (code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`${RECONNECT_DELAY / 1000}秒後に再接続を試みます... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(connect, RECONNECT_DELAY);
      } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ 最大再接続試行回数に達しました。終了します。');
        process.exit(1);
      }
    });
    
  } catch (error) {
    console.error('❌ 接続エラー:', error.message);
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      setTimeout(connect, RECONNECT_DELAY);
    } else {
      process.exit(1);
    }
  }
}

// Identifyを送信
function sendIdentify() {
  const payload = {
    op: 2, // Identify
    d: {
      token: config.token,
      properties: {
        $os: process.platform,
        $browser: 'DiscordTracker',
        $device: 'DiscordTracker'
      },
      intents: 1 << 7 // GUILD_VOICE_STATES intent
    }
  };
  
  ws.send(JSON.stringify(payload));
  console.log('📤 Identify送信');
}

// Resumeを送信
function sendResume() {
  const payload = {
    op: 6, // Resume
    d: {
      token: config.token,
      session_id: sessionId,
      seq: sequence
    }
  };
  
  ws.send(JSON.stringify(payload));
  console.log('📤 Resume送信');
}

// ハートビートを送信
function sendHeartbeat() {
  const payload = {
    op: 1, // Heartbeat
    d: sequence
  };
  
  ws.send(JSON.stringify(payload));
}

// Gatewayメッセージを処理
function handleGatewayMessage(message) {
  const { op, d, s, t } = message;
  
  // シーケンス番号を更新
  if (s !== null && s !== undefined) {
    sequence = s;
  }
  
  switch (op) {
    case 10: // Hello
      console.log('✓ Gateway接続成功');
      const heartbeatInterval_ms = d.heartbeat_interval;
      heartbeatInterval = setInterval(sendHeartbeat, heartbeatInterval_ms);
      break;
      
    case 11: // Heartbeat ACK
      // ハートビート応答受信
      break;
      
    case 0: // Dispatch (イベント)
      handleDispatchEvent(t, d);
      break;
      
    case 7: // Reconnect
      console.log('⚠️ 再接続要求を受信');
      ws.close();
      break;
      
    case 9: // Invalid Session
      console.log('⚠️ セッションが無効です。再識別します。');
      sessionId = null;
      sequence = null;
      setTimeout(sendIdentify, 5000);
      break;
      
    default:
      console.log(`⚠️ 未知のオペコード: ${op}`);
  }
}

// Dispatchイベントを処理
function handleDispatchEvent(eventType, data) {
  switch (eventType) {
    case 'READY':
      console.log('✓ ログイン成功');
      sessionId = data.session_id;
      resumeGatewayUrl = data.resume_gateway_url;
      console.log(`   セッションID: ${sessionId}`);
      console.log(`   監視チャンネル数: ${config.channelIds.length}`);
      break;
      
    case 'RESUMED':
      console.log('✓ セッション再開成功');
      break;
      
    case 'VOICE_STATE_UPDATE':
      handleVoiceStateUpdate(data).catch(err => {
        console.error('❌ Voice State Update処理エラー:', err.message);
      });
      break;
      
    default:
      // その他のイベントは無視
      break;
  }
}

// 初期化
console.log('🚀 Discord Gateway Tracker を起動します...');
console.log('⚠️  警告: User Tokenの使用はDiscord利用規約に違反する可能性があります');
console.log('');

// チャンネル情報を事前取得
async function initializeChannels() {
  console.log('📋 チャンネル情報を取得中...');
  for (const channelId of config.channelIds) {
    const channel = await fetchChannel(channelId);
    if (channel) {
      channelMap.set(channelId, channel.name);
      console.log(`   ✓ ${channel.name} (${channelId})`);
    } else {
      console.log(`   ⚠️ チャンネル ${channelId} の情報を取得できませんでした`);
    }
  }
  console.log('');
}

// メイン処理
(async () => {
  await initializeChannels();
  await connect();
})();

// クリーンアップ
process.on('SIGINT', () => {
  console.log('\n⚠️ 終了シグナルを受信しました。接続を閉じます...');
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

