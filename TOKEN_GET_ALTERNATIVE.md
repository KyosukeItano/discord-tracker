# User Token取得の代替方法

コンソールでの取得方法が動作しない場合の代替方法です。

## 方法1: Networkタブを使用（最も確実・推奨）

この方法が最も確実です。必ずこの方法を試してください。

### 詳細な手順

1. **DiscordのWeb版を開く**
   - https://discord.com にアクセス
   - ログインする

2. **開発者ツールを開く**
   - `F12` キーを押す
   - または、右クリック → 「検証」

3. **Networkタブを開く**
   - 開発者ツールの上部タブから「Network」を選択

4. **フィルターを設定**
   - Networkタブの検索ボックス（フィルター）に「api」と入力
   - これでDiscord APIへのリクエストのみが表示されます

5. **ページをリロード**
   - `F5` キーを押すか、ページをリロード
   - Networkタブにリクエストが表示されます

6. **リクエストを探す**
   - 以下のいずれかのリクエストを探します：
     - `gateway` で始まるリクエスト
     - `users/@me` で始まるリクエスト
     - `guilds` で始まるリクエスト
   - リクエスト名をクリック

7. **Headersタブを確認**
   - 選択したリクエストの「Headers」タブを開く
   - 「Request Headers」セクションを展開（下にスクロール）

8. **authorizationヘッダーを探す**
   - 「authorization」という項目を探す
   - その値がUser Tokenです
   - 通常、以下のような形式です：
     - `mfa.` で始まる長い文字列
     - `ODA...` で始まる長い文字列
     - 例: `mfa.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

9. **トークンをコピー**
   - トークンの値を右クリック → 「Copy value」を選択
   - または、トークンを選択して `Ctrl+C` (Mac: `Cmd+C`)

### 見つからない場合の対処法

- **リクエストが表示されない場合**:
  - ページが完全に読み込まれるまで待つ
  - フィルターを「api」から「gateway」や「users」に変更してみる
  - ページを完全にリロード（`Ctrl+F5`）

- **authorizationヘッダーが見つからない場合**:
  - 別のリクエストを試す（`gateway`、`users/@me`、`guilds`など）
  - 「Request Headers」セクションを完全に展開する
  - ページをリロードしてから再度確認

## 方法2: コンソールの代替コード

コンソール方法が動作しない場合、以下のコードを順番に試してください：

### コード1（最も一般的）
```javascript
window.webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]);
let m = window.webpackChunkdiscord_app.pop();
let token = m.find(m=>m?.exports?.default?.getToken)?.exports.default.getToken();
console.log(token);
```

### コード2
```javascript
(webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken!==void 0)?.exports.default.getToken()
```

### コード3
```javascript
Object.values(webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}])).find(m=>m?.exports?.default?.getToken)?.exports.default.getToken()
```

### コード4（安全なオプショナルチェーン付き）
```javascript
let token = (webpackChunkdiscord_app.push([[''],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken!==void 0)?.exports?.default?.getToken();
console.log(token);
```

⚠️ **注意**: これらのコードが動作しない場合は、Discordの内部実装が変更された可能性があります。**必ず方法1（Networkタブ）を使用してください。**

## 方法3: Applicationタブから取得（限定的）

1. 開発者ツールの「Application」タブを開く
2. 左側の「Local Storage」→「https://discord.com」を選択
3. キーを探す（通常は見つかりませんが、試してみてください）

## トラブルシューティング

### エラー: "Cannot read properties of undefined"
- Discordの内部実装が変更された可能性があります
- **方法1（Networkタブ）を使用してください**

### エラー: "webpackChunkdiscord_app is not defined"
- ページが完全に読み込まれていない可能性があります
- ページをリロードしてから再度試してください

### トークンが見つからない
- 必ず**方法1（Networkタブ）**を使用してください
- これは最も確実な方法です

## 重要な注意事項

⚠️ **User Tokenは非常に機密情報です**:
- 絶対に他人に共有しないでください
- GitHubなどにコミットしないでください（`.gitignore`に含まれています）
- 漏洩した場合は、Discordの設定からトークンを再生成してください

## 推奨方法

**必ず方法1（Networkタブ）を使用してください。** これは最も確実で、Discordの更新に影響されません。

