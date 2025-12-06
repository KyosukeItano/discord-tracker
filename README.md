# Discord Gateway Tracker

Discord User Tokenを使ったボイスチャンネル監視ツール（デスクトップアプリ版）

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

4. **デスクトップアプリとして起動**
   ```bash
   npm start
   ```

5. **コンソール版で実行（オプション）**
   ```bash
   npm run test:gateway
   # または
   node gateway-tracker.js
   ```

## ビルド（exe化）

### Electronアプリのビルド

```bash
npm run build
```

`dist`ディレクトリに以下のファイルが生成されます：
- `Gateway Tracker Setup X.X.X.exe` - インストーラー
- `Gateway Tracker X.X.X.exe` - ポータブル版（単一exeファイル）

**注意**: ビルド時にコード署名ツールのエラーが出る場合がありますが、これは無視して問題ありません。生成されたexeファイルは正常に動作します。

### コンソール版のビルド（旧方式）

```bash
npm run build:exe
```

`gateway-tracker.exe`が生成されます（コンソール版）。

## ログ機能

- ログ保存先: `./log/`ディレクトリ
- ファイル名: `gateway-tracker-YYYYMMDD-HHMM.log`
- ログレベル: `error`と`warn`のみ

## 詳細情報

詳細な設定方法は`SETUP_GUIDE.md`を参照してください。

