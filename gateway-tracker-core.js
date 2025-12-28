// Gateway Tracker Core Module (Electron用)
const EventEmitter = require('events');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const DataManager = require('./data-manager');

class GatewayTracker extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.heartbeatInterval = null;
    this.sequence = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.reconnectAttempts = 0;
    this.MAX_RECONNECT_ATTEMPTS = 5;
    this.RECONNECT_DELAY = 5000;
    this.reconnectTimeout = null;
    this.channelMap = new Map();
    this.guildMap = new Map();
    this.userMap = new Map();
    this.voiceStates = new Map();
    this.joinTimes = new Map();
    this.config = null;
    this.logger = null;
    this.logDir = null;
    this.isRunning = false;
    this.webhookEnabled = false;
    this.dataManager = null;
    
    this.initializeLogger();
    // loadConfig()は非同期のため、start()で呼び出す
  }

  initializeLogger() {
    // ログディレクトリの作成
    if (process.pkg) {
      this.logDir = path.join(path.dirname(process.execPath), 'log');
    } else {
      this.logDir = path.join(__dirname, 'log');
    }

    if (!fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (error) {
        this.logDir = path.join(process.cwd(), 'log');
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true });
        }
      }
    }

    // データマネージャーの初期化
    this.dataManager = new DataManager(this.logDir);

    // ロガーの設定
    this.logger = winston.createLogger({
      level: 'warn',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level.toUpperCase()}] ${stack || message}`;
        })
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(this.logDir, this.getLogFileName()),
          maxsize: 5242880,
          maxFiles: 10
        })
      ]
    });
  }

  getLogFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    return `gateway-tracker-${year}${month}${day}-${hour}${minute}.log`;
  }

  async loadConfig() {
    // AWS Secrets Managerを使用する場合
    if (process.env.SECRET_NAME) {
      try {
        await this.loadConfigFromSecretsManager();
      } catch (error) {
        this.emit('log', { type: 'error', message: `❌ AWS Secrets Managerからの読み込みに失敗: ${error.message}`, logCategory: 'system' });
        // フォールバック: config.jsonを試す
        this.loadConfigFromFile();
      }
    } else {
      // 通常のconfig.jsonから読み込み
      this.loadConfigFromFile();
    }

    // 設定の検証
    if (!this.config.token || this.config.token === 'YOUR_USER_TOKEN_HERE') {
      this.emit('log', { type: 'error', message: '❌ 有効な token を設定してください。', logCategory: 'system' });
      throw new Error('Invalid token');
    }

    if (!this.config.channelIds || this.config.channelIds.length === 0) {
      this.emit('log', { type: 'error', message: '❌ 監視したい channelIds を設定してください。', logCategory: 'system' });
      throw new Error('No channel IDs');
    }
  }

  async loadConfigFromSecretsManager() {
    try {
      // AWS SDKを動的にインポート（オプショナル依存）
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
      
      const region = process.env.AWS_REGION || 'ap-northeast-1';
      const secretName = process.env.SECRET_NAME;
      
      const client = new SecretsManagerClient({ region });
      const command = new GetSecretValueCommand({ SecretId: secretName });
      
      const response = await client.send(command);
      
      if (response.SecretString) {
        this.config = JSON.parse(response.SecretString);
        this.emit('log', { type: 'success', message: '✅ AWS Secrets Managerから設定を読み込みました', logCategory: 'system' });
      } else {
        throw new Error('SecretString not found in response');
      }
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error('@aws-sdk/client-secrets-manager がインストールされていません。npm install @aws-sdk/client-secrets-manager を実行してください。');
      }
      throw error;
    }
  }

  loadConfigFromFile() {
    const configPath = path.join(__dirname, 'config.json');
    try {
      if (fs.existsSync(configPath)) {
        this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } else {
        this.emit('log', { type: 'error', message: '❌ config.json が見つかりません。', logCategory: 'system' });
        throw new Error('config.json not found');
      }
    } catch (error) {
      this.emit('log', { type: 'error', message: `❌ config.json の読み込みに失敗: ${error.message}`, logCategory: 'system' });
      throw error;
    }
  }

  setWebhookEnabled(enabled) {
    this.webhookEnabled = enabled;
    this.emit('log', { type: 'info', message: `Webhook通知: ${enabled ? '有効' : '無効'}`, logCategory: 'system' });
  }

  async start(options = {}) {
    if (this.isRunning) {
      return;
    }
    
    // 設定がまだ読み込まれていない場合は読み込む
    if (!this.config) {
      try {
        await this.loadConfig();
      } catch (error) {
        this.emit('log', { type: 'error', message: `設定の読み込みエラー: ${error.message}` });
        throw error;
      }
    }
    
    this.isRunning = true;
    if (options.webhookEnabled !== undefined) {
      this.webhookEnabled = options.webhookEnabled;
    }
    this.emit('log', { type: 'info', message: '🚀 Gateway Tracker を起動します...', logCategory: 'system' });
    this.initializeChannels().then(() => {
      this.connect();
    }).catch(err => {
      this.emit('log', { type: 'error', message: `初期化エラー: ${err.message}`, logCategory: 'system' });
    });
  }

  stop() {
    this.isRunning = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // 再接続回数をリセット
    this.reconnectAttempts = 0;
    this.emit('log', { type: 'info', message: '⏹️ Gateway Tracker を停止しました', logCategory: 'system' });
    this.emit('status', { running: false });
  }

  // 既存のgateway-tracker.jsの関数をここに移動・適応
  // (コードが長いので、主要な関数のみ実装)
  // 実際にはgateway-tracker.jsのロジックをここに移植する必要があります

  async initializeChannels() {
    this.emit('log', { type: 'info', message: '📋 チャンネル情報を取得中...', logCategory: 'system' });
    
    for (const channelId of this.config.channelIds) {
      if (!channelId) continue;
      try {
        const channel = await this.fetchChannel(channelId);
        if (channel) {
          this.channelMap.set(channelId, channel.name);
          this.emit('log', { type: 'success', message: `   ✓ ${channel.name} (${channelId})`, logCategory: 'system' });
        } else {
          this.emit('log', { type: 'warn', message: `   ⚠️ チャンネル ${channelId} の情報を取得できませんでした`, logCategory: 'system' });
        }
      } catch (error) {
        this.emit('log', { type: 'warn', message: `   ⚠️ チャンネル ${channelId} の情報取得に失敗: ${error.message}`, logCategory: 'system' });
      }
    }
  }

  async fetchChannel(channelId) {
    try {
      const response = await this.httpsRequest({
        hostname: 'discord.com',
        path: `/api/v10/channels/${channelId}`,
        method: 'GET',
        headers: {
          'Authorization': this.config.token,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.status === 200) {
        const channel = response.data;
        // ギルドIDがあればギルド情報も取得
        if (channel.guild_id && !this.guildMap.has(channel.guild_id)) {
          await this.fetchGuild(channel.guild_id);
        }
        return channel;
      }
      return null;
    } catch (error) {
      this.logger.warn(`⚠️ チャンネル ${channelId} の情報取得に失敗:`, error.message);
      return null;
    }
  }

  async fetchGuild(guildId) {
    try {
      const response = await this.httpsRequest({
        hostname: 'discord.com',
        path: `/api/v10/guilds/${guildId}`,
        method: 'GET',
        headers: {
          'Authorization': this.config.token,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.status === 200 && response.data.name) {
        this.guildMap.set(guildId, response.data.name);
        return response.data.name;
      }
      return null;
    } catch (error) {
      this.logger.warn(`⚠️ ギルド ${guildId} の情報取得に失敗:`, error.message);
      return null;
    }
  }

  httpsRequest(options, data = null) {
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

  async connect(useResume = false) {
    this.emit('log', { type: 'info', message: '🔌 Gatewayに接続中...', logCategory: 'system' });
    
    try {
      // Resumeを使用する場合はresumeGatewayUrlを使用
      let url;
      if (useResume && this.resumeGatewayUrl) {
        url = `${this.resumeGatewayUrl}?v=10&encoding=json`;
        this.emit('log', { type: 'info', message: '📋 セッション再開を試みます...', logCategory: 'system' });
      } else {
        const gatewayUrl = await this.getGatewayUrl();
        url = `${gatewayUrl}?v=10&encoding=json`;
      }
      
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        this.emit('log', { type: 'success', message: '✓ WebSocket接続確立', logCategory: 'system' });
        if (useResume && this.sessionId && this.sequence !== null) {
          this.sendResume();
        } else {
          this.sendIdentify();
        }
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleGatewayMessage(message);
        } catch (error) {
          this.logger.error('❌ メッセージ解析エラー:', error.message);
          this.emit('log', { type: 'error', message: `❌ メッセージ解析エラー: ${error.message}`, logCategory: 'system' });
        }
      });
      
      this.ws.on('error', (error) => {
        this.logger.error('❌ WebSocketエラー:', error.message);
        this.emit('log', { type: 'error', message: `❌ WebSocketエラー: ${error.message}`, logCategory: 'system' });
      });
      
      this.ws.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : '';
        this.emit('log', { type: 'warn', message: `⚠️ WebSocket接続が閉じられました (コード: ${code}${reasonStr ? `, 理由: ${reasonStr}` : ''})`, logCategory: 'system' });
        
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        
        // 既存の再接続タイマーをクリア
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
        
        // 1006エラー（異常終了）の場合は無限に再接続を試みる
        const isAbnormalClose = code === 1006;
        const shouldReconnect = this.isRunning && (isAbnormalClose || this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS);
        
        if (shouldReconnect) {
          if (!isAbnormalClose) {
            this.reconnectAttempts++;
          }
          
          // 1006エラーの場合は指数バックオフを使用（最大60秒）
          let delay = this.RECONNECT_DELAY;
          if (isAbnormalClose) {
            delay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts), 60000);
            this.reconnectAttempts++;
          }
          
          const attemptInfo = isAbnormalClose 
            ? `再接続試行: ${this.reconnectAttempts}回目` 
            : `${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`;
          
          this.emit('log', { 
            type: 'info', 
            message: `🔄 ${delay / 1000}秒後に再接続を試みます... (${attemptInfo})`,
            logCategory: 'system'
          });
          
            this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            // セッション情報がある場合はResumeを試みる（1006以外のエラーでも可能）
            if (this.sessionId && this.resumeGatewayUrl && this.sequence !== null) {
              this.attemptResume();
            } else {
              this.connect();
            }
          }, delay);
        } else if (this.isRunning) {
          this.emit('log', { type: 'error', message: '❌ 再接続回数の上限に達しました。手動で再起動してください。', logCategory: 'system' });
          this.logger.error('❌ 再接続回数の上限に達しました');
        }
      });
    } catch (error) {
      this.logger.error('❌ 接続エラー:', error.message);
      this.emit('log', { type: 'error', message: `❌ 接続エラー: ${error.message}`, logCategory: 'system' });
    }
  }

  async getGatewayUrl() {
    try {
      const response = await this.httpsRequest({
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
      this.logger.error('❌ Gateway URL取得エラー:', error.message);
      throw error;
    }
  }

  sendIdentify() {
    const payload = {
      op: 2,
      d: {
        token: this.config.token,
        properties: {
          $os: process.platform,
          $browser: 'DiscordTracker',
          $device: 'DiscordTracker'
        },
        intents: 1 << 7
      }
    };
    
    this.ws.send(JSON.stringify(payload));
    this.emit('log', { type: 'info', message: '📤 Identify送信', logCategory: 'system' });
  }

  sendResume() {
    if (!this.sessionId || this.sequence === null) {
      this.emit('log', { type: 'warn', message: '⚠️ セッション情報が不足しています。Identifyにフォールバックします。', logCategory: 'system' });
      this.sendIdentify();
      return;
    }
    
    const payload = {
      op: 6,
      d: {
        token: this.config.token,
        session_id: this.sessionId,
        seq: this.sequence
      }
    };
    
    this.ws.send(JSON.stringify(payload));
    this.emit('log', { type: 'info', message: '📤 Resume送信', logCategory: 'system' });
  }

  attemptResume() {
    // 再接続回数をリセット（Resumeを試みるため）
    this.reconnectAttempts = 0;
    this.connect(true);
  }

  handleGatewayMessage(message) {
    const { op, d, s, t } = message;
    
    if (s !== null && s !== undefined) {
      this.sequence = s;
    }
    
    switch (op) {
      case 10:
        this.emit('log', { type: 'success', message: '✓ Gateway接続成功', logCategory: 'system' });
        const heartbeatInterval_ms = d.heartbeat_interval;
        this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), heartbeatInterval_ms);
        break;
        
      case 11:
        break;
        
      case 0:
        this.handleDispatchEvent(t, d);
        break;
        
      case 7:
        this.emit('log', { type: 'warn', message: '⚠️ 再接続要求を受信', logCategory: 'system' });
        this.ws.close();
        break;
        
      case 9:
        this.emit('log', { type: 'warn', message: '⚠️ セッションが無効です。再識別します。', logCategory: 'system' });
        this.sessionId = null;
        this.sequence = null;
        setTimeout(() => this.sendIdentify(), 5000);
        break;
    }
  }

  sendHeartbeat() {
    const payload = {
      op: 1,
      d: this.sequence
    };
    this.ws.send(JSON.stringify(payload));
  }

  handleDispatchEvent(eventType, data) {
    switch (eventType) {
      case 'READY':
        this.emit('log', { type: 'success', message: '✓ ログイン成功', logCategory: 'system' });
        this.sessionId = data.session_id;
        this.resumeGatewayUrl = data.resume_gateway_url;
        // 再接続回数をリセット（正常に接続できたため）
        this.reconnectAttempts = 0;
        this.emit('log', { type: 'info', message: `   セッションID: ${this.sessionId}`, logCategory: 'system' });
        this.emit('log', { type: 'info', message: `   監視チャンネル数: ${this.config.channelIds.length}`, logCategory: 'system' });
        this.emit('status', { running: true });
        break;
        
      case 'RESUMED':
        this.emit('log', { type: 'success', message: '✓ セッション再開成功', logCategory: 'system' });
        // 再接続回数をリセット（成功したため）
        this.reconnectAttempts = 0;
        break;
        
      case 'VOICE_STATE_UPDATE':
        this.handleVoiceStateUpdate(data).catch(err => {
          this.logger.error('❌ Voice State Update処理エラー:', err.message);
          this.emit('log', { type: 'error', message: `❌ Voice State Update処理エラー: ${err.message}`, logCategory: 'system' });
        });
        break;
    }
  }

  async handleVoiceStateUpdate(data) {
    const userId = data.user_id;
    const channelId = data.channel_id;
    const guildId = data.guild_id;
    
    if (this.config.selfUserId && userId === this.config.selfUserId) {
      return;
    }
    
    // ギルド情報を取得（まだ取得していない場合）
    let guildName = 'Unknown Server';
    if (guildId) {
      if (!this.guildMap.has(guildId)) {
        await this.fetchGuild(guildId);
      }
      guildName = this.guildMap.get(guildId) || `Guild ${guildId}`;
    }
    
    const isWatchedChannel = this.config.channelIds.includes(channelId);
    const previousChannelId = this.voiceStates.get(userId);
    const wasWatchedChannel = previousChannelId && this.config.channelIds.includes(previousChannelId);
    
    let username = `User ${userId}`;
    if (data.member && data.member.user) {
      username = data.member.user.global_name || data.member.user.username || username;
      if (data.member.nick) {
        username = data.member.nick;
      }
    }
    
    let channelName = channelId;
    if (channelId && this.channelMap.has(channelId)) {
      channelName = this.channelMap.get(channelId);
    }
    
    const now = new Date();
    const nowStr = now.toLocaleString('ja-JP');
    
    if (channelId && isWatchedChannel && (!previousChannelId || previousChannelId !== channelId)) {
      this.voiceStates.set(userId, channelId);
      this.joinTimes.set(userId, now);
      // CSVに保存
      if (this.dataManager) {
        this.dataManager.saveLogEntry({
          logCategory: 'join',
          guildName: guildName,
          userName: username,
          channelName: channelName,
          channelId: channelId,
          timestamp: now.getTime()
        });
      }
      
      this.emit('log', { 
        type: 'info', 
        message: `${username} が ${channelName} に入室しました`,
        logCategory: 'join',
        guildName: guildName,
        userName: username,
        channelName: channelName,
        timestamp: now.getTime()
      });
      
      // Webhook送信（チェックが入っている時だけ）
      if (this.webhookEnabled && this.isRunning) {
        this.sendWebhook(`🔵 **${username}** が **${channelName}** に入室しました`).catch(err => {
          this.logger.warn('⚠️ Webhook送信エラー:', err.message);
        });
      }
    }
    
    if (previousChannelId && wasWatchedChannel && (!channelId || channelId !== previousChannelId)) {
      const previousChannelName = this.channelMap.get(previousChannelId) || previousChannelId;
      const joinTime = this.joinTimes.get(userId);
      let stayDuration = '';
      
      let durationMs = 0;
      if (joinTime) {
        durationMs = Date.now() - joinTime.getTime();
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
        this.joinTimes.delete(userId);
      }
      
      // CSVに保存
      if (this.dataManager) {
        this.dataManager.saveLogEntry({
          logCategory: 'leave',
          guildName: guildName,
          userName: username,
          channelName: previousChannelName,
          channelId: previousChannelId,
          timestamp: now.getTime(),
          stayDurationMs: durationMs
        });
      }
      
      if (channelId) {
        this.voiceStates.set(userId, channelId);
        if (isWatchedChannel) {
          this.joinTimes.set(userId, new Date());
        }
      } else {
        this.voiceStates.delete(userId);
      }
      
      this.emit('log', { 
        type: 'info', 
        message: `${username} が ${previousChannelName} から退出しました${stayDuration}`,
        logCategory: 'leave',
        guildName: guildName,
        userName: username,
        channelName: previousChannelName,
        stayDuration: stayDuration,
        timestamp: now.getTime(),
        stayDurationMs: durationMs
      });
      
      // Webhook送信（チェックが入っている時だけ）
      if (this.webhookEnabled && this.isRunning) {
        this.sendWebhook(`🔴 **${username}** が **${previousChannelName}** から退出しました${stayDuration}`).catch(err => {
          this.logger.warn('⚠️ Webhook送信エラー:', err.message);
        });
      }
    } else if (channelId) {
      this.voiceStates.set(userId, channelId);
    } else if (previousChannelId) {
      this.voiceStates.delete(userId);
      this.joinTimes.delete(userId);
    }
  }

  async sendWebhook(content) {
    if (!this.config.webhookUrl || !this.webhookEnabled) {
      return;
    }
    
    try {
      const url = new URL(this.config.webhookUrl);
      const payload = {
        content: content,
        username: 'Voice Tracker'
      };
      
      const response = await this.httpsRequest({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DiscordTracker/1.0'
        }
      }, payload);
      
      if (response.status >= 200 && response.status < 300) {
        // Webhook送信成功（ログ出力なし）
      } else {
        this.logger.warn('⚠️ Webhook送信失敗:', response.status, response.data);
        this.emit('log', { type: 'warn', message: `⚠️ Webhook送信失敗: ${response.status}`, logCategory: 'system' });
      }
    } catch (error) {
      this.logger.warn('⚠️ Webhook送信エラー:', error.message);
      this.emit('log', { type: 'warn', message: `⚠️ Webhook送信エラー: ${error.message}`, logCategory: 'system' });
    }
  }
}

module.exports = GatewayTracker;

