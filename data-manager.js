// データ管理モジュール（CSV保存・読み込み・統計計算）
const fs = require('fs');
const path = require('path');

class DataManager {
  constructor(logDir) {
    this.logDir = logDir;
    this.dataDir = path.join(logDir, '..', 'data');
    this.csvPath = path.join(this.dataDir, 'voice_logs.csv');
    
    // データディレクトリを作成
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    // CSVファイルが存在しない場合はヘッダーを作成
    if (!fs.existsSync(this.csvPath)) {
      this.writeCsvHeader();
    }
  }

  writeCsvHeader() {
    const header = 'timestamp,date,time,eventType,guildName,userName,channelName,channelId,stayDurationMs\n';
    fs.appendFileSync(this.csvPath, header, 'utf8');
  }

  saveLogEntry(data) {
    const { logCategory, guildName, userName, channelName, channelId, timestamp, stayDurationMs } = data;
    
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0];
    
    const stayDuration = stayDurationMs || '';
    
    const row = [
      timestamp,
      dateStr,
      timeStr,
      logCategory,
      this.escapeCsv(guildName || ''),
      this.escapeCsv(userName || ''),
      this.escapeCsv(channelName || ''),
      channelId || '',
      stayDuration
    ].join(',') + '\n';
    
    fs.appendFileSync(this.csvPath, row, 'utf8');
  }

  escapeCsv(str) {
    if (!str) return '';
    // CSVの特殊文字をエスケープ
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  loadLogs(startDate = null, endDate = null) {
    if (!fs.existsSync(this.csvPath)) {
      return [];
    }
    
    const content = fs.readFileSync(this.csvPath, 'utf8');
    const lines = content.trim().split('\n');
    
    // ヘッダーをスキップ
    if (lines.length <= 1) return [];
    
    const logs = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const row = this.parseCsvRow(line);
        const logDate = new Date(row.date + 'T' + row.time);
        
        // 日付フィルタリング
        if (startDate && logDate < startDate) continue;
        if (endDate && logDate > endDate) continue;
        
        logs.push({
          timestamp: parseInt(row.timestamp),
          date: row.date,
          time: row.time,
          eventType: row.eventType,
          guildName: row.guildName,
          userName: row.userName,
          channelName: row.channelName,
          channelId: row.channelId,
          stayDurationMs: row.stayDurationMs ? parseInt(row.stayDurationMs) : null
        });
      } catch (error) {
        console.error('CSV解析エラー:', error, line);
      }
    }
    
    return logs;
  }

  parseCsvRow(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // 次の"をスキップ
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    
    return {
      timestamp: values[0] || '',
      date: values[1] || '',
      time: values[2] || '',
      eventType: values[3] || '',
      guildName: values[4] || '',
      userName: values[5] || '',
      channelName: values[6] || '',
      channelId: values[7] || '',
      stayDurationMs: values[8] || ''
    };
  }

  calculateStatistics(logs, period = 'all') {
    const now = new Date();
    let startDate = null;
    
    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const filteredLogs = logs.filter(log => {
      if (!startDate) return true;
      const logDate = new Date(log.date + 'T' + log.time);
      return logDate >= startDate;
    });
    
    // ユーザー別統計
    const userStats = {};
    // チャンネル別統計
    const channelStats = {};
    // ギルド別統計
    const guildStats = {};
    // 時間帯別統計
    const hourStats = {};
    
    filteredLogs.forEach(log => {
      if (log.eventType === 'leave' && log.stayDurationMs) {
        // ユーザー別
        const userKey = `${log.guildName}|${log.userName}`;
        if (!userStats[userKey]) {
          userStats[userKey] = {
            guildName: log.guildName,
            userName: log.userName,
            totalDuration: 0,
            joinCount: 0,
            leaveCount: 0
          };
        }
        userStats[userKey].totalDuration += log.stayDurationMs;
        userStats[userKey].leaveCount++;
        
        // チャンネル別
        const channelKey = `${log.guildName}|${log.channelName}`;
        if (!channelStats[channelKey]) {
          channelStats[channelKey] = {
            guildName: log.guildName,
            channelName: log.channelName,
            totalDuration: 0,
            joinCount: 0,
            leaveCount: 0
          };
        }
        channelStats[channelKey].totalDuration += log.stayDurationMs;
        channelStats[channelKey].leaveCount++;
        
        // ギルド別
        if (!guildStats[log.guildName]) {
          guildStats[log.guildName] = {
            guildName: log.guildName,
            totalDuration: 0,
            joinCount: 0,
            leaveCount: 0
          };
        }
        guildStats[log.guildName].totalDuration += log.stayDurationMs;
        guildStats[log.guildName].leaveCount++;
        
        // 時間帯別
        const hour = parseInt(log.time.split(':')[0]);
        if (!hourStats[hour]) {
          hourStats[hour] = 0;
        }
        hourStats[hour] += log.stayDurationMs;
      } else if (log.eventType === 'join') {
        // 参加回数をカウント
        const userKey = `${log.guildName}|${log.userName}`;
        if (!userStats[userKey]) {
          userStats[userKey] = {
            guildName: log.guildName,
            userName: log.userName,
            totalDuration: 0,
            joinCount: 0,
            leaveCount: 0
          };
        }
        userStats[userKey].joinCount++;
        
        const channelKey = `${log.guildName}|${log.channelName}`;
        if (!channelStats[channelKey]) {
          channelStats[channelKey] = {
            guildName: log.guildName,
            channelName: log.channelName,
            totalDuration: 0,
            joinCount: 0,
            leaveCount: 0
          };
        }
        channelStats[channelKey].joinCount++;
        
        if (!guildStats[log.guildName]) {
          guildStats[log.guildName] = {
            guildName: log.guildName,
            totalDuration: 0,
            joinCount: 0,
            leaveCount: 0
          };
        }
        guildStats[log.guildName].joinCount++;
      }
    });
    
    return {
      userStats: Object.values(userStats).sort((a, b) => b.totalDuration - a.totalDuration),
      channelStats: Object.values(channelStats).sort((a, b) => b.totalDuration - a.totalDuration),
      guildStats: Object.values(guildStats).sort((a, b) => b.totalDuration - a.totalDuration),
      hourStats: hourStats,
      period: period
    };
  }

  exportToJson(logs) {
    return JSON.stringify(logs, null, 2);
  }

  exportToCsv(logs) {
    const header = 'timestamp,date,time,eventType,guildName,userName,channelName,channelId,stayDurationMs\n';
    const rows = logs.map(log => {
      const date = new Date(log.timestamp);
      const dateStr = date.toISOString().split('T')[0];
      const timeStr = date.toTimeString().split(' ')[0];
      
      return [
        log.timestamp,
        dateStr,
        timeStr,
        log.eventType,
        this.escapeCsv(log.guildName || ''),
        this.escapeCsv(log.userName || ''),
        this.escapeCsv(log.channelName || ''),
        log.channelId || '',
        log.stayDurationMs || ''
      ].join(',');
    });
    
    return header + rows.join('\n');
  }
}

module.exports = DataManager;

