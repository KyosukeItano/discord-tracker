# Discord User Token を使ったボイスチャンネル監視

⚠️ **重要な警告**

この実装はDiscord User Tokenを使用します。以下のリスクがあります：

1. **Discord利用規約違反の可能性**: User Tokenの使用は公式にサポートされておらず、利用規約に違反する可能性があります
2. **アカウントBANのリスク**: 検出された場合、アカウントが永久BANされる可能性があります
3. **セキュリティリスク**: トークンが漏洩すると、アカウントが悪用される可能性があります

**自己責任で使用してください。推奨はしません。**

## 必要な情報

実装を開始する前に、以下の情報が必要です。**詳細な取得方法は `SETUP_GUIDE.md` を参照してください。**

### 1. Discord User Token

Discord User Tokenを取得する必要があります。

**簡単な手順:**
1. DiscordのWeb版（https://discord.com）を開く
2. ブラウザの開発者ツール（F12）を開く
3. 「Network」タブを開く
4. フィルターに「api」と入力
5. ページをリロード（F5）
6. リクエストを選択（例：`gateway` や `users/@me`）
7. 「Headers」タブ → 「Request Headers」の「authorization」を確認
8. その値がUser Tokenです（`mfa.` や `ODA...` で始まる長い文字列）

⚠️ **トークンは絶対に他人に共有しないでください！**

詳細は `SETUP_GUIDE.md` の「1. Discord User Token の取得方法」を参照してください。

### 2. 監視したいチャンネルID

監視したいボイスチャンネルのIDが必要です。

**簡単な手順:**
1. Discordで「開発者モード」を有効にする（設定 > 詳細設定 > 開発者モード）
2. 監視したいボイスチャンネルを右クリック
3. 「IDをコピー」を選択

詳細は `SETUP_GUIDE.md` の「2. チャンネルID (channelIds) の取得方法」を参照してください。

### 3. Webhook URL（オプション）

通知を送信したいDiscord Webhook URL。

**簡単な手順:**
1. サーバー設定 → 統合機能 → ウェブフック
2. 新しいウェブフックを作成
3. ウェブフックURLをコピー

詳細は `SETUP_GUIDE.md` の「3. Webhook URL (webhookUrl) の取得方法」を参照してください。

### 4. 自分のユーザーID（オプション）

自分の入退室をログから除外したい場合に使用します。

**簡単な手順:**
1. 開発者モードを有効にする
2. 自分のプロフィールを右クリック
3. 「IDをコピー」を選択

詳細は `SETUP_GUIDE.md` の「4. 自分のユーザーID (selfUserId) の取得方法」を参照してください。

## セットアップ

1. 依存関係をインストール：
```bash
npm install ws
```

2. 設定ファイルを作成：
```bash
cp gateway-tracker/config.example.json gateway-tracker/config.json
```

3. `gateway-tracker/config.json` を編集して、以下を設定：
```json
{
  "token": "YOUR_USER_TOKEN_HERE",
  "channelIds": ["チャンネルID1", "チャンネルID2"],
  "webhookUrl": "https://discord.com/api/webhooks/...",
  "selfUserId": "自分のユーザーID（オプション）"
}
```

4. 実行：
```bash
npm run test:gateway
# または
node gateway-tracker/gateway-tracker.js
```

## 動作確認

- 接続成功時: "Gateway接続成功" と表示
- 入退室検知時: コンソールにログが表示され、Webhookが送信されます

## トラブルシューティング

- **接続エラー**: トークンが無効または期限切れの可能性
- **イベントが来ない**: チャンネルIDが正しいか確認
- **Webhookエラー**: Webhook URLが正しいか確認

