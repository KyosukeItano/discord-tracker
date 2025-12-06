// Discord Gateway API を使ったボイスチャンネル監視
// ⚠️ 警告: User Tokenの使用はDiscord利用規約に違反する可能性があります

const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// ログディレクトリの作成
// pkgでビルドした場合、実行ファイルの場所を基準にする
let logDir;
if (process.pkg) {
  // pkgでビルドされた場合、実行ファイルと同じディレクトリにlogを作成
  logDir = path.join(path.dirname(process.execPath), 'log');
} else {
  // 通常のNode.js実行の場合
  logDir = path.join(__dirname, 'log');
}

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    // ディレクトリ作成に失敗した場合は、カレントディレクトリを使用
    logDir = path.join(process.cwd(), 'log');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
}

// 日時でログファイル名を生成
function getLogFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `gateway-tracker-${year}${month}${day}-${hour}${minute}.log`;
}

// ロガーの設定（errorとwarnレベルのみ）
const logger = winston.createLogger({
  level: 'warn', // warn以上（warn, error）を記録
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [${level.toUpperCase()}] ${stack || message}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, getLogFileName()),
      maxsize: 5242880, // 5MB
      maxFiles: 10 // 最大10ファイル保持
    })
  ]
});

// 設定ファイルを読み込む
const configPath = path.join(__dirname, 'config.json');
let config = {};

try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    logger.error('❌ config.json が見つかりません。config.example.json をコピーして設定してください。');
    console.error('❌ config.json が見つかりません。config.example.json をコピーして設定してください。');
    process.exit(1);
  }
} catch (error) {
  logger.error('❌ config.json の読み込みに失敗しました:', error.message);
  console.error('❌ config.json の読み込みに失敗しました:', error.message);
  process.exit(1);
}

// 必須設定の確認
if (!config.token || config.token === 'YOUR_USER_TOKEN_HERE') {
  logger.error('❌ config.json に有効な token を設定してください。');
  console.error('❌ config.json に有効な token を設定してください。');
  process.exit(1);
}

if (!config.channelIds || config.channelIds.length === 0) {
  logger.error('❌ config.json に監視したい channelIds を設定してください。');
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

// 現在のボイス状態（ユーザーID -> チャンネルID）
const voiceStates = new Map();

// 入室時刻の記録（ユーザーID -> 入室時刻のDateオブジェクト）
const joinTimes = new Map();

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
    logger.error('❌ Gateway URL取得エラー:', error.message);
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
    logger.warn(`⚠️ チャンネル ${channelId} の情報取得に失敗:`, error.message);
    return null;
  }
}

// ユーザー情報を取得（グローバル情報）
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
    } else if (response.status === 401) {
      logger.error(`❌ 認証エラー: トークンが無効です。ステータス: ${response.status}`);
      console.error(`❌ 認証エラー: トークンが無効です。ステータス: ${response.status}`);
      return null;
    } else if (response.status === 403) {
      // 403はプライバシー設定により情報が非公開の場合など、正常な動作なのでログを出さない
      return null;
    } else if (response.status === 404) {
      // 404も正常な動作（ユーザーが存在しない等）なのでログを出さない
      return null;
    } else if (response.status === 429) {
      logger.warn(`⚠️ レート制限: ユーザー ${userId} の情報取得が制限されています。ステータス: ${response.status}`);
      return null;
    } else {
      // その他のエラーもログを出さない（Gatewayイベントから取得できる可能性があるため）
      return null;
    }
  } catch (error) {
    logger.warn(`⚠️ ユーザー ${userId} の情報取得に失敗:`, error.message);
    return null;
  }
}

// サーバー内でのメンバー情報を取得（ニックネーム等）
async function fetchGuildMember(guildId, userId) {
  const cacheKey = `${guildId}_${userId}`;
  if (userMap.has(cacheKey)) {
    return userMap.get(cacheKey);
  }
  
  try {
    const response = await httpsRequest({
      hostname: 'discord.com',
      path: `/api/v10/guilds/${guildId}/members/${userId}`,
      method: 'GET',
      headers: {
        'Authorization': config.token,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.status === 200) {
      userMap.set(cacheKey, response.data);
      return response.data;
    } else if (response.status === 401) {
      logger.error(`❌ 認証エラー: トークンが無効です。ステータス: ${response.status}`);
      console.error(`❌ 認証エラー: トークンが無効です。ステータス: ${response.status}`);
      return null;
    } else if (response.status === 403) {
      // 403は一般的で、サーバーにアクセス権限がない場合など
      return null;
    } else if (response.status === 404) {
      // 404は一般的で、メンバーがサーバーにいない場合など
      return null;
    } else if (response.status === 429) {
      logger.warn(`⚠️ レート制限: メンバー情報取得が制限されています。ステータス: ${response.status}`);
      return null;
    } else {
      // その他のエラーは無視（ログを出さない）
      return null;
    }
  } catch (error) {
    // エラーは無視（ログを出さない）
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
      logger.warn('⚠️ Webhook送信失敗:', response.status, response.data);
    }
  } catch (error) {
    logger.warn('⚠️ Webhook送信エラー:', error.message);
  }
}

// ユーザー名を取得（優先順位: Gatewayイベント > キャッシュ > API）
function getUserDisplayName(userId, eventData = null, cachedUser = null, cachedGuildMember = null) {
  // 1. Gatewayイベントのmemberオブジェクトから取得（最優先）
  if (eventData) {
    // VOICE_STATE_UPDATEイベントでは、data.memberが直接含まれる場合がある
    const member = eventData.member || (eventData.user ? eventData : null);
    
    if (member) {
      // ニックネームがあれば使用（サーバー内での表示名）
      if (member.nick) {
        return member.nick;
      }
      // ユーザー情報があれば使用
      if (member.user) {
        const user = member.user;
        return user.global_name || user.username || `User ${userId}`;
      }
      // memberオブジェクト自体にuser情報が含まれている場合
      if (member.id === userId && (member.global_name || member.username)) {
        return member.global_name || member.username;
      }
    }
  }
  
  // 2. キャッシュされたサーバーメンバー情報から取得
  if (cachedGuildMember) {
    if (cachedGuildMember.nick) {
      return cachedGuildMember.nick;
    }
    if (cachedGuildMember.user) {
      const user = cachedGuildMember.user;
      return user.global_name || user.username || `User ${userId}`;
    }
  }
  
  // 3. キャッシュされたユーザー情報から取得
  if (cachedUser) {
    return cachedUser.global_name || cachedUser.username || `User ${userId}`;
  }
  
  // 4. フォールバック: IDのみ
  return `User ${userId}`;
}

// ユーザー情報をキャッシュに保存
function cacheUserInfo(userId, userData, guildId = null, memberData = null) {
  if (userData) {
    userMap.set(userId, userData);
  }
  
  if (guildId && memberData) {
    const cacheKey = `${guildId}_${userId}`;
    userMap.set(cacheKey, memberData);
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
  
  // Gatewayイベントのmemberオブジェクトから情報を取得（最優先）
  if (data.member && data.member.user) {
    const memberUser = data.member.user;
    cacheUserInfo(userId, memberUser, guildId, data.member);
  }
  
  // 監視対象チャンネルか確認
  const isWatchedChannel = config.channelIds.includes(channelId);
  const previousChannelId = voiceStates.get(userId);
  const wasWatchedChannel = previousChannelId && config.channelIds.includes(previousChannelId);
  
  // キャッシュからユーザー情報を取得
  const cachedUser = userMap.get(userId);
  const cachedGuildMember = guildId ? userMap.get(`${guildId}_${userId}`) : null;
  
  // ユーザー名を取得（Gatewayイベントのデータを優先）
  let username = getUserDisplayName(userId, data, cachedUser, cachedGuildMember);
  
  // キャッシュにない場合のみAPIから取得を試みる（403エラーを避けるため、静かに失敗）
  if (!cachedUser && !cachedGuildMember) {
    // バックグラウンドで取得を試みる（エラーは無視）
    fetchUser(userId).then(user => {
      if (user) {
        cacheUserInfo(userId, user);
      }
    }).catch(() => {
      // エラーは無視
    });
    
    if (guildId) {
      fetchGuildMember(guildId, userId).then(member => {
        if (member) {
          cacheUserInfo(userId, null, guildId, member);
        }
      }).catch(() => {
        // エラーは無視
      });
    }
  }
  
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
    joinTimes.set(userId, new Date()); // 入室時刻を記録
    
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
    
    // 滞在時間を計算
    const joinTime = joinTimes.get(userId);
    let stayDuration = '';
    if (joinTime) {
      const durationMs = Date.now() - joinTime.getTime();
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
      
      if (hours > 0) {
        stayDuration = ` (滞在時間: ${hours}時間${minutes}分${seconds}秒)`;
      } else if (minutes > 0) {
        stayDuration = ` (滞在時間: ${minutes}分${seconds}秒)`;
      } else {
        stayDuration = ` (滞在時間: ${seconds}秒)`;
      }
      
      joinTimes.delete(userId);
    }
    
    if (channelId) {
      voiceStates.set(userId, channelId);
      // 新しいチャンネルに入室した場合は、入室時刻を更新
      if (isWatchedChannel) {
        joinTimes.set(userId, new Date());
      }
    } else {
      voiceStates.delete(userId);
    }
    
    console.log(`🔴 [${now}] ${username} が ${previousChannelName} から退出しました${stayDuration}`);
    
    if (config.notificationsEnabled) {
      console.log(`   → 通知: ${username} が ${previousChannelName} から退出${stayDuration}`);
    }
    
    if (config.autoWebhookEnabled) {
      await sendWebhook(`🔴 **${username}** が **${previousChannelName}** から退出しました${stayDuration}`);
    }
  } else if (channelId) {
    voiceStates.set(userId, channelId);
    // 監視対象外のチャンネルに移動した場合は、入室時刻をクリア
    if (!isWatchedChannel) {
      joinTimes.delete(userId);
    }
  } else if (previousChannelId) {
    voiceStates.delete(userId);
    joinTimes.delete(userId);
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
        logger.error('❌ メッセージ解析エラー:', error.message);
        console.error('❌ メッセージ解析エラー:', error.message);
      }
    });
    
    ws.on('error', (error) => {
      logger.error('❌ WebSocketエラー:', error.message);
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
        logger.error('❌ 最大再接続試行回数に達しました。終了します。');
        console.error('❌ 最大再接続試行回数に達しました。終了します。');
        process.exit(1);
      }
    });
    
  } catch (error) {
    logger.error('❌ 接続エラー:', error.message);
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
        logger.error('❌ Voice State Update処理エラー:', err.message);
        console.error('❌ Voice State Update処理エラー:', err.message);
      });
      break;
      
    case 'GUILD_MEMBERS_CHUNK':
      // サーバーメンバーの一括取得イベントからユーザー情報をキャッシュ
      if (data.members && Array.isArray(data.members)) {
        data.members.forEach(member => {
          if (member.user) {
            const userId = member.user.id;
            cacheUserInfo(userId, member.user, data.guild_id, member);
          }
        });
      }
      break;
      
    case 'GUILD_MEMBER_UPDATE':
      // サーバーメンバー情報の更新イベントからユーザー情報をキャッシュ
      if (data.user && data.guild_id) {
        const userId = data.user.id;
        cacheUserInfo(userId, data.user, data.guild_id, data);
      }
      break;
      
    case 'GUILD_MEMBER_ADD':
      // サーバーにメンバーが追加されたイベントからユーザー情報をキャッシュ
      if (data.user && data.guild_id) {
        const userId = data.user.id;
        cacheUserInfo(userId, data.user, data.guild_id, data);
      }
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

