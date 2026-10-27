# 友と対局を Game Center でもつなぐ 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 友と対局に「Game Center で」の入口を足し、合言葉（駒＋漢数字2つ）で離れた iPhone ともつなぐ。

**Architecture:** 決まりごと（`src/net/session.ts`）はそのまま使い、つなぐ部分だけ Game Center 版の Link（`src/net/gcLink.ts`）を足す。Link の下は新しい iPhone の部品 `plugins/capacitor-gamecenter`（GKMatchmaker・GKMatch）。画面は「つなぎ方を選ぶ」と「Game Center の誘う・入れる」を足す。

**Tech Stack:** TypeScript・Vite・vitest・Capacitor 8（SPM）・Swift（GameKit）

**Spec:** `docs/superpowers/specs/2026-10-28-gamecenter-match-design.md`

## Global Constraints

- 入口は2つ。今の近距離通信（`src/net/link.ts` の `createNativeLink`・`plugins/capacitor-nearby`）は動きを変えない
- Game Center の合言葉は「駒の名前＋の＋漢数字2つ」（例「桂馬の三七」、7×9×9＝567通り）。近距離通信の合言葉（漢数字1つ）はそのまま
- playerGroup には合言葉と**アプリの版**を混ぜる。playerAttributes は誘う側 `0xFFFF0000`・入れる側 `0x0000FFFF`
- 入れる側は60秒で見切って `failed`（誘う側は見切らない）
- 文言は設計書の「困ったときの知らせ」の表のとおり
- src/ai・src/cards・src/rules は触らない（別の会話が作業中）。コミットは自分のファイルだけ
- コード中のコメント・コミットメッセージは日本語。push と TestFlight はユーザーの確認を取ってから

## Review Focus

- 入れる側が合言葉を入れたあと「やめる」を押した → 探すのが止まり、あとから相手が来てもつながらない（Task 2 のテスト）
- 誘う側が待っている間に Game Center のサインインが切れた・ネットが切れた → `failed` が来たら「相手が見つかりませんでした…」でやり直せる（Task 2・Task 5）
- 対局中に切れて、相手より先に自分が探し直し始めた → 同じ合言葉で両方がまた見つけ合い、記録が続く（Task 2 のテスト）
- 「Game Center で」を選んでから戻り、「近くの人と」を選ぶ → 前の Game Center の Session は捨てられ、近距離の Session が新しく作られる（Task 3 のテスト）
- 版が違う2台 → つながらず、60秒後に「相手が見つかりませんでした。合言葉と、2台が同じ版かを確かめてください」（Task 1 の番号のテスト＋Task 5 の文言）

---

### Task 1: Game Center の合言葉と番号

**Files:**
- Create: `src/net/gcCode.ts`
- Modify: `src/net/session.ts`（`createSession` の opts に `makeCode`）
- Test: `tests/net/gcCode.test.ts`、`tests/net/session.test.ts`

**Interfaces:**
- Produces:
  - `makeGcCode(rng: () => number): string` — 駒の名前（session.ts の PIECE_NAMES と同じ7つ）＋「の」＋漢数字2つ
  - `gcGroup(code: string, version: string): number` — 合言葉の通し番号（0〜566）と版の小さなハッシュ（0〜9999）から作る正の整数。`hash * 1000 + index`
  - `GC_PIECES: readonly string[]`・`GC_DIGITS: readonly string[]`（入力画面のボタンに使う。session.ts の PIECE_NAMES・KANSUJI と同じ並び）
  - `createSession(link, { ..., makeCode?: (rng: () => number) => string })` — 誘うときの合言葉の作り方（無ければ今の `makeCode`）

- [ ] **Step 1: テストを書く** — `tests/net/gcCode.test.ts`
  - `makeGcCode(seq(0.3, 0.2, 0.9))` が `'桂馬の二九'`
  - 567通りすべての合言葉で `gcGroup(code, '1.0.2')` が重ならない
  - 同じ合言葉でも版が違えば番号が違う（`gcGroup('桂馬の三七','1.0.2') !== gcGroup('桂馬の三七','1.0.3')`）
  - 同じ入力なら同じ番号・`Number.isSafeInteger` で正
  - `tests/net/session.test.ts` に：`createSession(link, { makeCode: makeGcCode })` で `host()` したら `code()` が漢数字2つの形（`/^.+の[一二三四五六七八九]{2}$/`）

- [ ] **Step 2: 落ちるのを確かめる** — `npx vitest run tests/net/gcCode.test.ts tests/net/session.test.ts`（モジュールが無い・opts が無いで FAIL）

- [ ] **Step 3: 作る** — `gcCode.ts` を作り、session.ts の `host()` で `(opts.makeCode ?? makeCode)(rng)` を使う。ハッシュは版の文字コードを31倍で足して10000で割った余りでよい

- [ ] **Step 4: 通るのを確かめる** — 同じコマンドで PASS

- [ ] **Step 5: コミット**（`src/net/gcCode.ts src/net/session.ts tests/net/gcCode.test.ts tests/net/session.test.ts`）

### Task 2: Game Center 版の Link

**Files:**
- Create: `src/net/gcLink.ts`
- Test: `tests/net/gcLink.test.ts`

**Interfaces:**
- Consumes: `gcGroup`（Task 1）、`Link`・`LinkEvent`（`src/net/link.ts`）、`emitter`（`src/net/emitter.ts`）
- Produces:
  - `interface GcPlugin { signIn(): Promise<{ signedIn: boolean }>; find(o: { group: number; host: boolean; timeoutSec: number }): Promise<void>; send(o: { data: string }): Promise<void>; stop(): Promise<void>; addListener(name: 'connected' | 'failed' | 'disconnected' | 'message', fn: (e: Record<string, string>) => void): Promise<PluginListenerHandle> }` — iPhone の部品（Task 4）の形。`failed` は `{ reason }`、`message` は `{ data }`
  - `interface GcLink extends Link { signIn(): Promise<boolean>; enter(code: string): void }`
  - `createGcLink(plugin: GcPlugin, version: string): GcLink`
  - `createFakeGcPlugins(): { a: GcPlugin; b: GcPlugin; cut(): void }`（テスト用。同じ group で host と guest がそろったらつなぐ。cut で両方に disconnected）

Link への当てはめ（設計書の表のとおり）：
- `host(code)` → 覚えて `find({ group: gcGroup(code, version), host: true, timeoutSec: 0 })`（0＝見切らない）
- `enter(code)` → 覚えて `found { peer: code, name: code, version }` を出す
- `browse()` → 覚えた合言葉があれば `found` を出し直す（つなぎ直し用）。無ければ何もしない
- `join(code)` → `find({ group: gcGroup(code, version), host: false, timeoutSec: 60 })`
- 部品の `connected` → `connected { peer: code, name: code }`、`failed` → `failed { peer: code }`、`disconnected` → `disconnected { peer: code }`、`message` → `message { data }`
- `stop()` → 部品の `stop()`

- [ ] **Step 1: テストを書く** — `tests/net/gcLink.test.ts`（偽の部品の対で Session を2つ作る。誘う側は `makeCode: makeGcCode`）
  - 誘う→（入れる側）`browse()`＋`enter(host.code())`＋`join(host.code())`→ 両方 `phase()==='deck'`
  - 合言葉が違えばつながらない（偽の部品は group が違えば待ったまま）
  - 入れる側が join のあと `quit()` したら、そのあと誘う側が来てもつながらない
  - 札選び→対局→`cut()`→両方 `lost`→（偽の部品は探し直しで再びつなぐ）→ `back`、記録が同じ
  - 偽の部品が `failed` を出す設定（`failNext`）で、Session が `joinRetry` を2回出してからつながる
  - `signIn()` が部品の `signedIn` を返す

- [ ] **Step 2: 落ちるのを確かめる** — `npx vitest run tests/net/gcLink.test.ts`

- [ ] **Step 3: 作る** — `createGcLink` と `createFakeGcPlugins`（`createPairLinks` と同じく `queueMicrotask` で知らせを遅らせる）

- [ ] **Step 4: 通るのを確かめる** — 同じコマンドで PASS。`npx vitest run tests/net` も PASS

- [ ] **Step 5: コミット**

### Task 3: どちらのつなぎ方で Session を作るか

**Files:**
- Modify: `src/net/current.ts`、`src/net/link.ts`（`pickLink`）
- Test: `tests/net/current.test.ts`（新しい）

**Interfaces:**
- Consumes: `createGcLink`・`GcLink`（Task 2）、`makeGcCode`（Task 1）
- Produces:
  - `type LinkKind = 'nearby' | 'gc'`
  - `getSession(kind?: LinkKind): Session` — kind を省けば今のものを使う（無ければ `'nearby'`）。今の Session と kind が違えば、今のを `quit()` して作り直す。`'gc'` のときは `makeCode: makeGcCode`
  - `sessionKind(): LinkKind | null`
  - `currentGcLink(): GcLink | null` — Game Center の画面が `signIn`・`enter` に使う
  - `pickLink(kind: LinkKind): Link`（`'nearby'` は今のまま。`'gc'` はアプリなら `createGcLink(registerPlugin<GcPlugin>('GameCenterMatch'), APP_VERSION)`、開発中の `?link=fake` なら Task 5 の偽の部品）
  - 窓口は kind ごとに1つを使い回す（今の `shared` と同じ考え）

- [ ] **Step 1: テストを書く** — `getSession('gc')` のあと `getSession('nearby')` で別の Session になり、前の Session は `phase()==='closed'`。`getSession()` は今の kind を保つ（窓口は vi.mock で偽物に差し替える）
- [ ] **Step 2: 落ちるのを確かめる**
- [ ] **Step 3: 作る**
- [ ] **Step 4: 通るのを確かめる** — `npx vitest run tests/net` と `npm run typecheck`
- [ ] **Step 5: コミット**

### Task 4: iPhone の部品（capacitor-gamecenter）と Game Center の許可

**Files:**
- Create: `plugins/capacitor-gamecenter/package.json`・`Package.swift`・`index.js`・`ios/Sources/GameCenterMatchPlugin/GameCenterMatchPlugin.swift`（形は `plugins/capacitor-nearby` と同じ。名前は `capacitor-gamecenter`・SPM の product `CapacitorGameCenter`・target `GameCenterMatchPlugin`・jsName `GameCenterMatch`）
- Create: `ios/App/App/App.entitlements`（`com.apple.developer.game-center` を true。転落牌と同じ）
- Modify: `package.json`（`"capacitor-gamecenter": "file:plugins/capacitor-gamecenter"`）、`ios/App/App.xcodeproj/project.pbxproj`（Debug と Release に `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;`）、`ios/App/CapApp-SPM/Package.swift`（`npx cap sync ios` で更新）、`.github/workflows/ios-testflight.yml`（アプリ本体の仮の署名に `--entitlements ios/App/App/App.entitlements`）

**Interfaces:**
- Produces: Task 2 の `GcPlugin` の形そのもの
  - `signIn` — 転落牌 `../tenrakuhai/ios/App/App/GameCenter.swift` の signIn と同じ作り（authenticateHandler は1回だけ付ける・画面が来たら出す）
  - `find({ group, host, timeoutSec })` — 前の探し・対局を片付けてから `GKMatchRequest`（min/max 2・`playerGroup = group`・`playerAttributes = host ? 0xFFFF0000 : 0x0000FFFF`）で `GKMatchmaker.shared().findMatch`。`timeoutSec > 0` なら時間で `cancel()` して `failed { reason: "timeout" }`。エラーは `failed { reason: エラーの説明 }`。見つかった GKMatch の `delegate = self`、`expectedPlayerCount == 0` なら `connected`
  - GKMatchDelegate：相手が `.connected` で `connected`、`.disconnected` で `disconnected`、受け取ったら `message { data }`（UTF-8）
  - `send({ data })` — `sendData(toAllPlayers:with: .reliable)`。対局が無ければ捨てる
  - `stop()` — 探すのを取り消し、`disconnect()`、片付け
  - 呼ばれる知らせ・GameKit の返事は main で扱う（近距離の部品と同じ）

- [ ] **Step 1: 部品のファイルを作る**（Swift は Windows で組み立てられないので、近距離の部品と見比べて形をそろえる）
- [ ] **Step 2: 許可・組み立ての手順・pbxproj を直し、`npm install` と `npx cap sync ios`** — CapApp-SPM/Package.swift に `CapacitorGameCenter` が入ったことを `git diff` で確かめる
- [ ] **Step 3: `npm run typecheck` と `npx vitest run`** — PASS（JS 側は変わらないことの確認）
- [ ] **Step 4: コミット**

### Task 5: 画面（つなぎ方を選ぶ・Game Center の誘う・入れる）と開発用の偽の Game Center

**Files:**
- Create: `src/app/screens/friend.ts`（つなぎ方を選ぶ。ScreenName `'friend'`）、`src/app/screens/gcLink.ts`（ScreenName `'gclink'`）、`src/net/fakeGc.ts`（開発中の `?link=fake` だけ。BroadcastChannel で `GcPlugin` の形を真似る）
- Modify: `src/app/screens.ts`（ScreenName）、`src/app/main.ts`（registerScreen）、`src/app/screens/title.ts`（「友と対局」→ `'friend'`）、`src/app/screens/link.ts`（`getSession('nearby')`・戻るは `'friend'`）、`src/app/style.css`
- Test: ブラウザのタブ2枚（`?link=fake`）

**Interfaces:**
- Consumes: `getSession(kind)`・`currentGcLink()`（Task 3）、`GC_PIECES`・`GC_DIGITS`（Task 1）
- Produces: なし（画面）

画面の中身（文言は設計書のまま）：
- `friend`：見出し「友と対局」、千社札2枚「近くの人と」「Game Center で」、それぞれの下に注意書き。アプリでない（ブラウザ版）ときは今どおりタイトルに「友と対局」が出ないので、この画面にも来ない
- `gclink`：開いたら `signIn()`。だめなら「iPhone の 設定 → Game Center でサインインしてください」と戻る。よければ千社札「誘う」「入れる」
  - 誘う：今の link.ts の誘うと同じ大きな駒に合言葉、「相手の iPhone で「入れる」を押し、この合言葉を入れてもらってください」
  - 入れる：駒の名前7つ（1つ選ぶ）・漢数字9つ×2段（1つずつ選ぶ）・選んだ合言葉を駒に書いて見せる・「つなぐ」。押したら `browse()`→`enter(code)`→`join(code)`、「相手を探しています」＋「やめる」
  - `joinRetry` →「つなぎ直しています」、`joinFailed` →「相手が見つかりませんでした。合言葉と、2台が同じ版かを確かめてください」、`connected` → `showScreen('deck', { friend: true })`
  - 見た目は今の link.ts の部品（`komaOf`・千社札・`link-note`）を使い回す。ボタンの並びは駒の形の小さなボタン（新しい CSS は最小限）。作る前に frontend-design スキルを読む

- [ ] **Step 1: 画面を作る**
- [ ] **Step 2: `npm run typecheck` と `npx vitest run`** — PASS
- [ ] **Step 3: ブラウザのタブ2枚で確かめる** — タイトル→友と対局→Game Center で→誘う／入れる（合言葉を入力）→ 両方札選び。札選びで切断のふり→つなぎ直し→札選びに戻る。393×852 で崩れない。近くの人との流れも今どおり
- [ ] **Step 4: コミット**

### Task 6: 仕上げ

- [ ] **Step 1: `npm run build`**（型チェック込み）と `npx vitest run` が通る
- [ ] **Step 2: メモリの進み具合に書く**（何を作ったか・ユーザーの作業：App Store Connect で Game Center を有効に、2つ目の Apple アカウント）
- [ ] **Step 3: ユーザーに push と TestFlight の確認を取る**（別の会話のコミットも一緒に出るので、そのことも伝える）
