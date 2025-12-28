# Discord Gateway Tracker (Electron版)

Discord User Tokenを使用したボイスチャンネル監視ツール（Electronデスクトップアプリ）

## 機能

- Discord Gateway APIを使用したリアルタイムボイスチャンネル監視
- ユーザーの入退出通知
- Webhook通知対応
- GUIによる操作
- **統計・分析機能**: ユーザー別/チャンネル別の滞在時間集計（今日/今週/今月/全期間）
- **フィルタ・検索機能**: ユーザー名/チャンネル名/サーバー名で検索
- **統計グラフ**: チャンネル別/ユーザー別/時間帯別の棒グラフ表示
- **設定UI**: GUIでチャンネルIDの追加/削除、設定の変更
- **データ永続化**: CSV形式でログデータを保存
- **エクスポート機能**: CSV/JSON形式でログデータをエクスポート

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

## データ保存

- **ログファイル**: `log/` ディレクトリに保存されます
  - ファイル名: `gateway-tracker-YYYYMMDD-HHMM.log`
  - ログレベル: `error` と `warn` のみ

- **CSVデータ**: `data/` ディレクトリに保存されます
  - ファイル名: `voice_logs.csv`
  - 入退室イベントの全履歴を保存
  - 統計計算のデータソースとして使用

## 使用方法

1. アプリを起動（自動でトラッカーが開始されます）
2. 監視中のチャンネルにユーザーが入退出すると、階層構造のログに表示されます
3. Webhook通知を有効にする場合は、チェックボックスをオンにしてください
4. 統計パネルで期間を選択してデータを確認できます
5. フィルタ機能でユーザー名/チャンネル名/サーバー名を検索できます
6. 設定ボタンからチャンネルIDの追加/削除や設定の変更ができます
7. リロードボタンでトラッカーを再起動できます

## プロジェクト構造

```
gateway-tracker/
├── main.js                  # Electronメインプロセス（IPC通信ハンドラー）
├── renderer.js              # レンダラープロセス（UI処理、統計・フィルタ・グラフ）
├── gateway-tracker-core.js  # コアロジック（Gateway接続、ボイス状態監視）
├── data-manager.js          # データ管理（CSV保存、統計計算、エクスポート）
├── index.html               # UIのHTML
├── styles.css               # スタイルシート
├── prebuild.js              # ビルド前処理スクリプト
├── config.json              # 設定ファイル（.gitignoreに含まれる）
├── config.example.json      # 設定ファイルの例
├── package.json             # 依存関係とビルド設定
├── log/                     # ログファイル（.gitignoreに含まれる）
├── data/                    # CSVデータファイル（.gitignoreに含まれる）
└── dist/                    # ビルド出力（.gitignoreに含まれる）
```

### 設定ファイル（config.json）

設定はGUIから変更可能ですが、直接編集することもできます：

```json
{
  "token": "YOUR_DISCORD_USER_TOKEN",
  "channelIds": ["チャンネルID1", "チャンネルID2"],
  "webhookUrl": "Webhook URL（オプション）",
  "selfUserId": "自分のユーザーID（オプション）",
  "notificationsEnabled": true,
  "autoWebhookEnabled": true
}
```

**注意**: `config.json`は`.gitignore`に含まれているため、Gitにコミットされません。機密情報（token）を含むため、安全に管理してください。

## ライセンス

このプロジェクトのライセンスについては、各ファイルを参照してください。
