# 超将棋 計画4：iPhone アプリ化 設計書

- 日付：2026-10-21
- 状態：実装済み（2026-10-21。TestFlight にビルド 0.1.0 (2) まで届いた。実機の確認待ち）
- 親の設計書：`docs/superpowers/specs/2026-10-20-super-shogi-design.md`（1 の「公開先」、5.3、7）

## 1. ねらい

計画3までで Web として遊べるようになった超将棋を、iPhone アプリにして TestFlight で自分の iPhone で遊べるようにする。実機で速さ・音・画面の端・強さを確かめ、ストアに出す準備（説明文・画面写真・審査）は次の計画に回す。

### うまくいった状態

- GitHub の「Actions」から実行すると、TestFlight に新しい組み立てが届く
- iPhone で起動して、ネットにつながっていなくても文字が出て、CPU と最後まで対局できる
- 戦績・設定・前回の持ち込みが、アプリを閉じて開き直しても残る
- 裏に回して戻っても音が鳴る。CPU の裏の計算が落ちても対局が止まらない

### やらないこと

- 広告、Game Center
- App Store の説明文・画面写真・プライバシーポリシー・審査への提出
- 横向き・iPad への対応（崩れなければよい）

## 2. 決めたこと

| 項目 | 値 |
|---|---|
| アプリの名前 | 超将棋 |
| アプリの ID | `com.maosundev.supershogi` |
| 版 | 0.1.0 から。組み立ての番号は GitHub Actions の実行回数 |
| 入れ物 | Capacitor 8（前のアプリと同じ版：`@capacitor/core`・`@capacitor/ios`・`@capacitor/cli` 8.5.2、`@capacitor/preferences` 8.0.1） |
| アプリに入れる中身 | `npm run build` で作る `dist`（Capacitor の `webDir`） |
| 画面の端 | Capacitor の `ios.contentInset` は `never`。ノッチとホームバーの余白は今の CSS の `env(safe-area-inset-*)` で取る |
| 起動画面の色 | 夜の藍 `#14213D` の無地 |
| GitHub | `maosun-dev/SuperShogi` を公開で新しく作る（前のアプリと同じく公開。Mac での組み立てが無料） |
| アイコン | 見本の A 案「駒に『超』、背に紅の隈取」を仕上げる（見本：https://claude.ai/artifact/Vp69HxyvbwxvRspWWh6Y2N） |

## 3. 組み立ての流れ

前のアプリ（転落牌・ワンタップ収支など）の `ios-testflight.yml` と同じ形にする。

1. GitHub の Mac で `npm ci` → `npm run build` → `npx cap sync ios`
2. 署名なしで archive し、部品とアプリ本体に仮の署名を付ける
3. App Store Connect の API キーで、配布用の署名を付けて TestFlight へ送る
4. 置いた鍵を消す

- 必要な Secrets：`APPLE_TEAM_ID`・`APPSTORE_API_KEY_ID`・`APPSTORE_API_ISSUER_ID`・`APPSTORE_API_PRIVATE_KEY`
  - p8 の中身（`APPSTORE_API_PRIVATE_KEY`）はユーザーが入れる。ほかの3つ（鍵を示す番号）は Claude が `gh secret set` で入れる。値は前のアプリの記録から探し、見つからなければユーザーに聞く
- App Store Connect でのアプリの登録（`com.maosundev.supershogi`）はユーザーが行う
- 安全の決まり：リポジトリに maosun-dev 以外の共同作業者を足さない。ワークフローに `pull_request_target` を使わない。実行は手動（`workflow_dispatch`）だけ
- 結果の確認は `gh run list` / `gh run view --log-failed` で文字で読む

## 4. コードの変え方

### 4.1 アプリの中だけで使う部品をまとめる

- `src/app/native.ts` を新しく作り、アプリの中で動いているかの見分け（`Capacitor.isNativePlatform()`）と、アプリだけで使う部品をここにまとめる
- Web 版（アーティファクト・`npm run dev`）は今までどおり動く

### 4.2 消えにくい保存

- iPhone は容量が足りないときなどに、アプリの中の localStorage を消すことがある。保存する3つ（設定・前回の持ち込み・戦績。鍵は `superShogi.*`）を、`@capacitor/preferences` にも書く
- 起動時：localStorage にない値だけを Preferences から戻す（ある値はそちらが新しい）。localStorage にある値は Preferences へ写す。戻し終わってから最初の画面を出す
- 書くたび：localStorage と Preferences の両方に書く（Preferences への書き込みは待たない。失敗しても遊びは止めない）
- `src/app/storage.ts` の `KeyValueStore` の形は変えない。アプリでは `safeStore()` が両方へ書く版を返す

### 4.3 計画3からの持ち越し

- **CPU の裏の計算の作り直し**：Worker が落ちたら（`onerror`）、待っている頼みを失敗にしたうえで、次の頼みの前に新しい Worker を作る（`src/app/cpu.ts`）。止めた（`dispose`）あとの頼みはすぐ失敗にする
- **音の鳴らし直し**：アプリが裏から戻ったとき（`visibilitychange` で見えるようになったとき）、音の仕組みが止まっていれば鳴らし直す（`src/fx/sound.ts`）
- **文字ファイルの軽量化**：組み立てのあと、古い形式（.woff）のファイルを消し、CSS からその読み込みを外す。.woff2 だけを残す（iPhone の WebKit は .woff2 を読む）
- **影の警告**：three の `PCFSoftShadowMap` の警告が出なくなる設定に替える（見た目は変えない）

### 4.4 アイコンと起動画面

- A 案を仕上げる：駒に木目と面取りの光、「超」は筆のかすれを残しつつ小さくても潰れない太さ、隈取は払いの勢いを整える
- 1024×1024 の PNG で、透明な部分を入れない（App Store が受け付けない）
- 起動画面は夜の藍の無地（2732×2732）
- 作り方は前のアプリと同じく、作る道具（スクリプト）をリポジトリに置き、何度でも作り直せるようにする

## 5. 確かめ方

### 自動テスト（Node）

- 保存：起動時の戻し（localStorage にない値だけ戻る、ある値は写される）、書くたびに両方へ書く、Preferences が失敗しても遊びが止まらない（Preferences は偽物で置き換える）
- CPU：Worker が落ちたあと、次の頼みで新しい Worker が作られて答えが返る。止めたあとの頼みはすぐ失敗する
- 文字：組み立てた CSS に `.woff"`／`.woff)` の読み込みが残っていない

### 組み立て

- GitHub Actions で TestFlight まで届く

### 実機（ユーザーの iPhone。チェック表を渡す）

- 起動・文字・アイコンの見た目
- 対局を最後まで指せる
- 音が鳴る。裏に回して戻っても鳴る
- ノッチ・ホームバーと重ならない
- 「強い」の CPU の考える長さ（今は3秒）が長すぎないか
- アプリを閉じて開き直しても戦績が残る

Claude は実機を見られないので、実機の結果はユーザーの報告で確かめる。
