// ビルド前にlogディレクトリを作成するスクリプト
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'log');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
  console.log('✓ logディレクトリを作成しました');
} else {
  console.log('✓ logディレクトリは既に存在します');
}

