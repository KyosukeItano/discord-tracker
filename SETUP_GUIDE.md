# 設定情報の取得方法ガイド

このガイドでは、`config.json`に必要な情報の取得方法を詳しく説明します。

## 1. Discord User Token の取得方法

⚠️ **重要**: User Tokenは非常に機密情報です。絶対に他人に共有しないでください。

### 方法1: ブラウザの開発者ツールを使用（推奨）

1. **DiscordのWeb版を開く**
   - ブラウザで https://discord.com にアクセス
   - ログインする

2. **開発者ツールを開く**
   - Windows/Linux: `F12` キーを押す
   - Mac: `Cmd + Option + I` を押す
   - または、右クリック → 「検証」を選択

3. **Networkタブを開く**
   - 開発者ツールの上部にあるタブから「Network」（ネットワーク）を選択

4. **フィルターを設定**
   - Networkタブの検索ボックスに「api」と入力
   - これでDiscord APIへのリクエストのみが表示されます

5. **ページをリロード**
   - `F5` キーを押すか、ページをリロード
   - Networkタブにリクエストが表示されます

6. **リクエストを選択**
   - 以下のいずれかのリクエストを探してクリック：
     - `gateway` で始まるリクエスト
     - `users/@me` で始まるリクエスト
     - `guilds` で始まるリクエスト

7. **Headersタブを確認**
   - 選択したリクエストの「Headers」タブを開く
   - 「Request Headers」セクションを展開

8. **authorizationヘッダーを探す**
   - 「authorization」という項目を探す
   - その値がUser Tokenです
   - 通常、以下のような形式です：
     - `mfa.` で始まる長い文字列
     - `ODA...` で始まる長い文字列
     - 例: `mfa.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

9. **トークンをコピー**
   - トークンを右クリック → 「Copy value」を選択
   - または、トークンを選択して `Ctrl+C` (Mac: `Cmd+C`)

### 方法2: コンソールを使用（上級者向け・動作しない場合あり）

⚠️ **注意**: この方法はDiscordの内部実装に依存するため、Discordの更新で動作しなくなることがあります。**方法1（Networkタブ）を推奨します。**

#### 方法2-A: 最新の方法（2024年以降）

1. 開発者ツールの「Console」タブを開く
2. 以下のコードを順番に試してください：

**方法1:**
```javascript
window.webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m=window.webpackChunkdiscord_app.pop(),m.find(m=>m?.exports?.default?.getToken!==void 0)?.exports.default.getToken()
```

**方法2:**
```javascript
(webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken!==void 0)?.exports.default.getToken()
```

**方法3:**
```javascript
Object.values(webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}])).find(m=>m?.exports?.default?.getToken)?.exports.default.getToken()
```

**方法4（最も確実）:**
```javascript
window.webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]);
let m = window.webpackChunkdiscord_app.pop();
let token = m.find(m=>m?.exports?.default?.getToken)?.exports.default.getToken();
console.log(token);
```

3. エラーが出る場合は、**方法1（Networkタブ）を使用してください**

#### 方法2-B: ローカルストレージから取得（限定的）

1. 開発者ツールの「Application」タブを開く
2. 左側の「Local Storage」→「https://discord.com」を選択
3. キーを探す（通常は見つかりませんが、試してみてください）

⚠️ **推奨**: これらの方法が動作しない場合は、必ず**方法1（Networkタブ）**を使用してください。

---

## 2. チャンネルID (channelIds) の取得方法

監視したいボイスチャンネルのIDを取得します。

### 手順

1. **開発者モードを有効にする**
   - Discordの設定を開く（歯車アイコン）
   - 「詳細設定」または「Advanced」を選択
   - 「開発者モード」または「Developer Mode」をONにする

2. **ボイスチャンネルを右クリック**
   - 左側のチャンネルリストで、監視したいボイスチャンネルを右クリック
   - または、チャンネル名を右クリック

3. **IDをコピー**
   - メニューから「IDをコピー」または「Copy ID」を選択
   - これでチャンネルIDがクリップボードにコピーされます
   - 例: `123456789012345678`

4. **複数のチャンネルを監視する場合**
   - 各チャンネルに対して上記の手順を繰り返す
   - `config.json`の`channelIds`配列に追加:
   ```json
   "channelIds": [
     "123456789012345678",
     "234567890123456789",
     "345678901234567890"
   ]
   ```

### チャンネルIDの確認方法

- チャンネルIDは通常、18桁の数字です
- ボイスチャンネルかどうかは、チャンネル名の横にスピーカーアイコンがあるかで確認できます

---

## 3. Webhook URL (webhookUrl) の取得方法

Discord Webhook URLを取得して、入退室通知を送信できます。

### 手順

1. **Discordサーバーの設定を開く**
   - 通知を送信したいDiscordサーバーを選択
   - サーバー名を右クリック → 「サーバー設定」または「Server Settings」

2. **統合機能を開く**
   - 左側のメニューから「統合機能」または「Integrations」を選択
   - 「ウェブフック」または「Webhooks」を選択

3. **新しいWebhookを作成**
   - 「新しいウェブフック」または「New Webhook」をクリック
   - または、既存のWebhookを選択

4. **Webhookを設定**
   - 名前: 任意の名前（例: "Voice Tracker"）
   - チャンネル: 通知を送信したいチャンネルを選択
   - 「ウェブフックURLをコピー」または「Copy Webhook URL」をクリック

5. **URLを保存**
   - コピーしたURLは以下の形式です:
   ```
   https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
   ```

6. **既存のWebhookを使用する場合**
   - 既にWebhook URLを持っている場合は、それをそのまま使用できます

### Webhook URLの形式

```
https://discord.com/api/webhooks/{WEBHOOK_ID}/{WEBHOOK_TOKEN}
```

⚠️ **注意**: Webhook URLは機密情報です。他人に共有しないでください。

---

## 4. 自分のユーザーID (selfUserId) の取得方法（オプション）

自分の入退室をログから除外したい場合に使用します。

### 手順

1. **開発者モードを有効にする**（まだの場合）
   - 設定 → 詳細設定 → 開発者モードをON

2. **自分のプロフィールを右クリック**
   - 画面左下の自分のプロフィールアイコンを右クリック
   - または、自分のユーザー名を右クリック

3. **IDをコピー**
   - メニューから「IDをコピー」または「Copy ID」を選択
   - これで自分のユーザーIDがクリップボードにコピーされます
   - 例: `123456789012345678`

4. **設定に追加**
   - `config.json`の`selfUserId`に貼り付け:
   ```json
   "selfUserId": "123456789012345678"
   ```

### ユーザーIDの確認方法

- ユーザーIDは通常、18桁の数字です
- 自分のIDは、プロフィールを右クリックして「IDをコピー」で取得できます

---

## 設定ファイルの完成例

すべての情報を取得したら、`gateway-tracker/config.json`を以下のように設定します：

```json
{
  "token": "mfa.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "channelIds": [
    "123456789012345678",
    "234567890123456789"
  ],
  "webhookUrl": "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "selfUserId": "123456789012345678",
  "notificationsEnabled": true,
  "autoWebhookEnabled": true
}
```

## トラブルシューティング

### User Tokenが取得できない場合

- ページを完全にリロード（`Ctrl+F5`）してから再度試す
- 別のブラウザで試す
- Networkタブで「api」フィルターを確認
- リクエストが表示されない場合は、ページが完全に読み込まれるまで待つ

### チャンネルIDが取得できない場合

- 開発者モードが有効になっているか確認
- チャンネルを右クリックして「IDをコピー」が表示されるか確認
- ボイスチャンネルを選択しているか確認

### Webhook URLが取得できない場合

- サーバーの管理者権限があるか確認
- 「統合機能」→「ウェブフック」にアクセスできるか確認
- 新しいWebhookを作成する権限があるか確認

### ユーザーIDが取得できない場合

- 開発者モードが有効になっているか確認
- 自分のプロフィールを右クリックして「IDをコピー」が表示されるか確認

## セキュリティに関する注意事項

⚠️ **重要**: 以下の情報は機密情報です。絶対に他人に共有しないでください：

1. **User Token**: アカウントに完全アクセスできるため、最も重要
2. **Webhook URL**: 誰でもこのURLを使ってメッセージを送信できる
3. **チャンネルID**: 比較的安全だが、サーバー構造の情報が含まれる
4. **ユーザーID**: 比較的安全だが、個人情報が含まれる可能性がある

### 安全な管理方法

- `config.json`は`.gitignore`に含まれているため、Gitにコミットされません
- トークンやWebhook URLを他人と共有しない
- 定期的にトークンを再生成する（Discordの設定から）
- 不要になったWebhookは削除する

## 次のステップ

設定が完了したら、以下のコマンドで実行できます：

```bash
npm install ws
npm run test:gateway
```

実行すると、Gatewayに接続してボイスチャンネルの監視が開始されます。

