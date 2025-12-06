# Discord Gateway Tracker

Discord User Tokenを使ったボイスチャンネル監視ツール

## クイックスタート

1. **依存関係をインストール**
   ```bash
   npm install
   ```

2. **設定ファイルを作成**
   ```bash
   cp config.example.json config.json
   ```

3. **config.jsonを編集**
   - `token`: Discord User Token（詳細は`SETUP_GUIDE.md`参照）
   - `channelIds`: 監視したいボイスチャンネルIDの配列

4. **実行**
   ```bash
   npm run test:gateway
   # または
   node gateway-tracker.js
   ```

## ビルド（exe化）

```bash
npm run build
```

生成された`gateway-tracker.exe`を実行すると、実行ファイルと同じディレクトリに`log`フォルダが作成され、エラー・警告ログが保存されます。

## ログ機能

- ログ保存先: `./log/`ディレクトリ
- ファイル名: `gateway-tracker-YYYYMMDD-HHMM.log`
- ログレベル: `error`と`warn`のみ

## 詳細情報

詳細な設定方法は`SETUP_GUIDE.md`を参照してください。

