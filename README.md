# Discord Gateway Tracker (Electron版)

Discord User Tokenを使用したボイスチャンネル監視ツール（Electronデスクトップアプリ）

## 機能

- Discord Gateway APIを使用したリアルタイムボイスチャンネル監視
- ユーザーの入退出通知
- Webhook通知対応
- GUIによる操作

## 必要なもの

- Node.js (v18以上推奨)
- Discord User Token

## セットアップ

1. **依存関係をインストール**
   ```bash
   npm install
   ```

2. **設定ファイルを作成**
   ```bash
   cp config.example.json config.json
   ```

3. **config.jsonを編集**
   - `token`: Discord User Token
   - `channelIds`: 監視したいボイスチャンネルIDの配列
   - `webhookUrl`: (オプション) Webhook通知用のURL
   - `selfUserId`: (オプション) 自分のユーザーID
   - `notificationsEnabled`: (オプション) 通知を有効にするかどうか
   - `autoWebhookEnabled`: (オプション) Webhook通知を自動で有効にするかどうか

## 起動方法

### 開発モード

```bash
npm start
```

Electronアプリが起動し、GUIウィンドウが表示されます。

## ビルド

Windows用のポータブル版をビルドします：

```bash
npm run build
```

ビルド後、`dist\win-unpacked\Gateway Tracker.exe` が生成されます。

**注意**: ビルド時にファイルアクセス権限のエラーが出る場合がありますが、`dist\win-unpacked` ディレクトリにアプリが生成されている場合は問題ありません。エラーが出る場合は、管理者権限でPowerShellを実行してからビルドしてください。

## ログ

ログファイルは `log/` ディレクトリに保存されます：
- ファイル名: `gateway-tracker-YYYYMMDD-HHMM.log`
- ログレベル: `error` と `warn` のみ

## 使用方法

1. アプリを起動
2. 「開始」ボタンをクリックしてトラッカーを開始
3. 監視中のチャンネルにユーザーが入退出すると、ログに表示されます
4. Webhook通知を有効にする場合は、チェックボックスをオンにしてください
5. 「停止」ボタンでトラッカーを停止

## プロジェクト構造

```
gateway-tracker/
├── main.js              # Electronメインプロセス
├── renderer.js          # レンダラープロセス（UI処理）
├── gateway-tracker-core.js  # コアロジック
├── index.html           # UIのHTML
├── styles.css           # スタイルシート
├── prebuild.js          # ビルド前処理スクリプト
├── config.example.json  # 設定ファイルの例
└── package.json         # 依存関係とビルド設定
```

## ライセンス

このプロジェクトのライセンスについては、各ファイルを参照してください。
