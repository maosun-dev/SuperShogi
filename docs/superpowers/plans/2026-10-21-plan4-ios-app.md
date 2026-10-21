# 超将棋 計画4：iPhone アプリ化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 超将棋を Capacitor で iPhone アプリにし、GitHub Actions から TestFlight に届けて、ユーザーの iPhone で遊べるようにする。

**Architecture:** 今の Web の組み立て（Vite の `dist`）をそのまま Capacitor の中身にする。アプリだけで使う部品（消えにくい保存）は `src/app/native.ts` にまとめ、Web 版はこれまでどおり動かす。TestFlight への組み立ては前のアプリ（`../tenrakuhai/.github/workflows/ios-testflight.yml`）と同じ形。

**Tech Stack:** Capacitor 8.5.2（`@capacitor/core`・`@capacitor/ios`・`@capacitor/cli`）、`@capacitor/preferences` 8.0.1、`@resvg/resvg-js` と `wawoff2`（アイコンの PNG 作り。開発用）、既存の TypeScript 5 / Vite 7 / Vitest 3

**Spec:** `docs/superpowers/specs/2026-10-21-plan4-ios-app-design.md`

## Global Constraints

- アプリの名前「超将棋」、アプリの ID `com.maosundev.supershogi`、版 `0.1.0`、組み立ての番号は GitHub Actions の `run_number`
- Capacitor の設定：`webDir: "dist"`、`ios.contentInset: "never"`、`ios.backgroundColor: "#14213D"`
- 画面は縦向きだけ（iPhone）
- Web 版（`npm run dev`・アーティファクト）の動きを変えない。アプリだけの処理は `Capacitor.isNativePlatform()` が真のときだけ
- 保存の鍵は今の3つ（`superShogi.settings`・`superShogi.deck`・`superShogi.tally`）のまま
- アイコンは 1024×1024 の PNG で、透明な部分を入れない。起動画面は `#14213D` の無地 2732×2732
- 色は設計書の7色（`src/view/palette.ts` と `style.css` の `:root`）だけを使う
- ワークフローは手動実行（`workflow_dispatch`）だけ。`pull_request_target` を使わない。リポジトリに maosun-dev 以外の共同作業者を足さない
- p8（`APPSTORE_API_PRIVATE_KEY`）の中身には触れない（ユーザーが入れる）。鍵ファイルを読まない
- 公開するもの（コミット・リポジトリ）に本名や個人のメールアドレスを書かない
- コードのコメントとコミットメッセージは日本語。コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Windows の PowerShell では `npm` が動かないので、コマンドは Git Bash で `npm` を使う（PowerShell なら `npm.cmd`）

## Review Focus

1. **アプリの保存と localStorage の食い違い**：Preferences に新しい値、localStorage に古い値がある・どちらかが壊れた JSON・Preferences が失敗する、のどれでも起動して遊べること → タスク2にテストを足す
2. **Worker が落ちた直後の頼み**：落ちた瞬間に待っていた頼みは失敗（代わりの手で対局は続く）、次の頼みは新しい Worker が答えること → タスク3にテストを足す
3. **裏から戻ったときの音**：iPhone で別のアプリに切り替えて戻ると AudioContext が止まり、操作のきっかけの登録はもう外れている。戻ったあとの最初のタップで鳴らし直せること → タスク4にテストを足す
4. **文字ファイルを外したあとの CSS**：.woff を消しても、CSS に .woff の読み込みが残って 404 の通信を起こさないこと → タスク1にテストを足す
5. **Web 版を壊さない**：Capacitor の部品を読み込んでも、ブラウザ（アプリでない所）で起動・保存がこれまでどおり動くこと → タスク2にテストを足す

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `capacitor.config.json` | Capacitor の設定 |
| `ios/` | `npx cap add ios` で作る Xcode の入れ物（コミットする） |
| `tools/strip-woff.mjs` | 組み立てのあと .woff を消し、CSS からその読み込みを外す |
| `src/app/fonts.ts` | CSS から .woff の読み込みを外す純粋な関数（テストあり） |
| `src/app/native.ts` | アプリの中かの見分けと、消えにくい保存（Preferences との両書き） |
| `src/app/storage.ts`（変更） | `safeStore()` がアプリでは両書きの版を返す |
| `src/app/cpu.ts`（変更） | Worker が落ちたら作り直す |
| `src/ai/client.ts`（変更） | `dispose` のあとの頼みをすぐ失敗にする |
| `src/fx/sound.ts`・`src/app/main.ts`（変更） | 裏から戻ったときの音の鳴らし直し |
| `tools/icon/icon.mjs` | アイコンの SVG を作る（A 案の仕上げ） |
| `tools/icon/make-ios-assets.mjs` | SVG → PNG（アイコン・起動画面）を作り、Xcode の場所へ置く |
| `.github/workflows/ios-testflight.yml` | TestFlight へ送る組み立て |
| `docs/testflight-checklist.md` | 実機で確かめるチェック表 |

---

### Task 1: Capacitor の入れ物と、文字ファイルの軽量化

**Files:**
- Modify: `package.json`（依存と scripts）
- Create: `capacitor.config.json`, `ios/`（`npx cap add ios`）, `src/app/fonts.ts`, `tools/strip-woff.mjs`
- Test: `tests/app/fonts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/app/fonts.ts
  export function stripWoff(css: string): string; // url(...woff) format("woff") の項を、前のカンマごと外す。woff2 はそのまま
  ```
- 依存：`npm i @capacitor/core@8.5.2 @capacitor/ios@8.5.2 @capacitor/preferences@8.0.1` と `npm i -D @capacitor/cli@8.5.2`
- scripts：`"build": "npm run typecheck && vite build && node tools/strip-woff.mjs"`、`"sync": "npm run build && npx cap sync ios"`
- `tools/strip-woff.mjs`：`dist/assets` の .css を `stripWoff` で書き換え、`dist/assets/*.woff` を消す。`stripWoff` は `import { stripWoff } from '../src/app/fonts.ts'` で読む（Node 24 は TypeScript の型を外してそのまま読める。GitHub Actions も `node-version: 24`）。`fonts.ts` は型の書き方を「消すだけで JS になる」範囲にとどめる（enum・namespace を使わない）
- `ios/App/App/Info.plist`：`CFBundleDisplayName` を `超将棋`、`UISupportedInterfaceOrientations` を縦（`UIInterfaceOrientationPortrait`）だけ、`CFBundleShortVersionString` を `0.1.0`（または `MARKETING_VERSION=0.1.0`）
- `.gitignore` に Capacitor が勧める `ios/App/App/public`・`ios/App/App/capacitor.config.json`・`ios/App/App/config.xml` などを足す（`npx cap add ios` が作る ios 側の .gitignore があればそれに従う）

- [ ] **Step 1: 失敗するテストを書く** — `tests/app/fonts.test.ts`
  - `woff の項だけを外す`：`src:url(a.woff2) format("woff2"),url(a.woff) format("woff")` → `src:url(a.woff2) format("woff2")`
  - `組み立て後の形（引用符なし・空白あり）にも効く`：`src: url(./x-0-400-normal.woff2) format('woff2'), url(./x-0-400-normal.woff) format('woff');` → woff の項が消え、woff2 は残る
  - `woff2 だけの CSS は変わらない`
  - `組み立てた CSS に woff の読み込みが残らない`：`node_modules/@fontsource/yuji-boku/400.css` を読んで `stripWoff` した結果に `.woff)` も `.woff"` も `.woff'` もない
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/app/fonts.test.ts` / Expected: FAIL（モジュールがない）
- [ ] **Step 3: 実装する**（依存・設定・`npx cap add ios`・Info.plist・scripts・`stripWoff`・`strip-woff.mjs`）
- [ ] **Step 4: 確かめる** — Run: `npm test`・`npm run build`・`npx cap sync ios` / Expected: すべて成功。`dist/assets` に `.woff` が0個、`.woff2` が残る、`dist` の合計が 20MB 未満（`du -sh dist` を報告）。`npm run dev` でタイトルの筆文字が出る（組み込みブラウザで1回見て閉じる）
- [ ] **Step 5: コミット** — `git commit -m "Capacitor で iPhone アプリの入れ物を作り、文字ファイルを woff2 だけにする"`

---

### Task 2: 消えにくい保存

**Files:**
- Create: `src/app/native.ts`
- Modify: `src/app/storage.ts`, `src/app/main.ts`（起動時に戻し終わってから最初の画面を出す）
- Test: `tests/app/native.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore`（storage.ts）
- Produces:
  ```ts
  // native.ts
  export interface PrefsLike {
    get(o: { key: string }): Promise<{ value: string | null }>;
    set(o: { key: string; value: string }): Promise<void>;
    keys(): Promise<{ keys: string[] }>;
  }
  // 保存の鍵の一覧 SAVE_KEYS は storage.ts が export し、native.ts はそれを import する
  export function isNativeApp(): boolean;      // Capacitor.isNativePlatform()。読み込みに失敗したら false
  export async function restoreSaves(ls: KeyValueStore, prefs: PrefsLike): Promise<void>;
  //  localStorage にない鍵だけ Preferences から戻す。ある鍵は Preferences へ写す。Preferences の失敗は握る
  export function mirrorStore(ls: KeyValueStore, prefs: PrefsLike): KeyValueStore;
  //  getItem は ls から。setItem は ls に書き、SAVE_KEYS なら prefs.set も呼ぶ（待たない・失敗は握る）
  export async function prepareSaves(): Promise<void>;  // アプリなら restoreSaves を本物の Preferences で。Web なら何もしない
  ```
- `storage.ts`：鍵を `SAVE_KEYS` として export。`safeStore()` は、アプリのとき `mirrorStore(今の ls 版, Preferences)` を返す（Web では今のまま）
- `main.ts`：`start()` の最初の画面を出す前に `await prepareSaves()`（失敗しても画面は出す）

- [ ] **Step 1: 失敗するテストを書く**（Preferences は `Map` で作った偽物。失敗する偽物も用意）
  - `localStorage にない鍵だけ戻す`：prefs に settings と tally、ls に settings（別の値）→ ls の settings は ls の値のまま、tally は prefs の値になる
  - `localStorage にある鍵は Preferences へ写す`：ls に deck、prefs は空 → prefs に deck が入る
  - `書くたびに両方へ`：`mirrorStore` で settings を書く → ls と prefs の両方にある。保存の鍵でない `x` は prefs に書かない
  - `Preferences が失敗しても止まらない`：get/set/keys が reject する偽物で `restoreSaves` が例外を出さずに終わり、`mirrorStore().setItem` も例外を出さず ls には書ける
  - `壊れた値が戻っても既定で起動`：prefs の settings が `'{'` → 戻したあと `loadSettings` が `DEFAULT_SETTINGS`
  - `Web では何もしない`：Node（アプリでない）で `isNativeApp() === false`、`prepareSaves()` が resolve し、`safeStore()` が今までどおり読み書きできる
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/app/native.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**（`@capacitor/core` の `Capacitor`、`@capacitor/preferences` の `Preferences` を使う。Node のテストで読み込んでも落ちないこと）
- [ ] **Step 4: 確かめる** — Run: `npm test`・`npm run build` / Expected: PASS。`npm run dev` で設定を変えて再読み込みしても残る（組み込みブラウザで1回）
- [ ] **Step 5: コミット** — `git commit -m "アプリでは保存を消えにくい保存領域にも書き、起動時に戻す"`

---

### Task 3: CPU の裏の計算を作り直す

**Files:**
- Modify: `src/ai/client.ts`, `src/app/cpu.ts`
- Test: `tests/ai/client.test.ts`（足す）, `tests/app/cpu.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // client.ts（変更）：dispose のあとの think はすぐ reject('CPU を止めました')
  // cpu.ts
  export function createRestartingCpu(makeWorker: () => WorkerLike): CpuClient;
  //  内側に createCpuClient を持つ。worker の onerror が来たら、今の client の待ちは（client.ts の仕組みで）失敗にし、
  //  次の think の前に今の worker を terminate して makeWorker() で作り直す。dispose 後は作り直さない
  export function createBrowserCpu(): CpuClient;   // createRestartingCpu(() => new Worker(...)) に変える
  ```
- 作り直しの合図：`onerror` を受けたことを覚える。`createCpuClient` が `onerror` を上書きするので、`makeWorker` の結果を包んで、外側でも `onerror` を受けられるようにする（包み方は任せる。包んだ形を報告する）

- [ ] **Step 1: 失敗するテストを書く**（偽の Worker：`handleThinkRequest` で答える。わざと `onerror` を起こせる）
  - `dispose のあとの頼みはすぐ失敗`（client.test.ts）：`dispose()` のあと `think` が `'CPU を止めました'` で reject し、`postMessage` は呼ばれない
  - `落ちたあと、次の頼みは新しい Worker が答える`（cpu.test.ts）：1つ目の偽 Worker で `onerror` → 待っていた頼みは reject、`makeWorker` が2回目に呼ばれ、次の `think` は合法な手で resolve、1つ目の偽 Worker の `terminate` が呼ばれている
  - `落ちていなければ作り直さない`：3回続けて頼んでも `makeWorker` は1回
  - `dispose 後は作り直さない`
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/ai/client.test.ts tests/app/cpu.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 確かめる** — Run: `npm test` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "CPU の Worker が落ちたら作り直し、止めたあとの頼みはすぐ失敗にする"`

---

### Task 4: 裏から戻ったときの音と、影の警告

**Files:**
- Modify: `src/app/main.ts`, `src/fx/sound.ts`（必要なら）, `src/view/stage.ts`
- Create: `src/app/unlock.ts`
- Test: `tests/app/unlock.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // unlock.ts（main.ts の解錠の仕組みを取り出して、裏から戻ったときに付け直せるようにする）
  export interface EventTargetLike { addEventListener(t: string, f: () => void, o?: { capture: boolean }): void; removeEventListener(t: string, f: () => void, o?: { capture: boolean }): void }
  export function armSoundUnlock(sound: Pick<Sound, 'unlock' | 'running'>, target: EventTargetLike): void;
  //  pointerdown/touchend/click/keydown で unlock を試し、running になったら外す（今の main.ts と同じ）
  export function watchResume(sound: Pick<Sound, 'unlock' | 'running'>, target: EventTargetLike, doc: { visibilityState: string; addEventListener(t: 'visibilitychange', f: () => void): void }): void;
  //  見えるようになったとき running でなければ、unlock を1回試し、まだ running でなければ armSoundUnlock で付け直す
  ```
- 影：`renderer.shadowMap.type = THREE.PCFSoftShadowMap` を、three 0.186 で警告の出ない種類に替える（`PCFShadowMap` など）。見た目がほぼ変わらないことを組み込みブラウザで1回見る

- [ ] **Step 1: 失敗するテストを書く**（偽の sound・target・document）
  - `操作で解錠したら登録を外す`：click を送る → unlock が呼ばれ、running が true なら4種類とも外れている
  - `裏から戻って止まっていたら付け直す`：running が true で登録が外れたあと、running を false にして visibilitychange（visible）→ unlock が1回呼ばれ、まだ false なら4種類が付け直され、次の touchend で unlock が呼ばれる
  - `見えなくなっただけでは何もしない`：visibilityState が hidden のときは何もしない
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/app/unlock.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**（main.ts は `armSoundUnlock` と `watchResume` を呼ぶだけにする）
- [ ] **Step 4: 確かめる** — Run: `npm test`・`npm run typecheck` / Expected: PASS。`npm run dev` で、コンソールに PCFSoftShadowMap の警告が出ない・タイトルと対局の影が出ている
- [ ] **Step 5: コミット** — `git commit -m "裏から戻ったあとも音を鳴らし直せるようにし、影の警告を消す"`

---

### Task 5: アイコンと起動画面

**Files:**
- Create: `tools/icon/icon.mjs`, `tools/icon/make-ios-assets.mjs`, `tools/icon/README.md`（作り方を2〜3行）
- Modify: `package.json`（devDependencies：`@resvg/resvg-js`、`wawoff2`。scripts：`"icon": "node tools/icon/make-ios-assets.mjs"`）, `ios/App/App/Assets.xcassets/AppIcon.appiconset/*`, `ios/App/App/Assets.xcassets/Splash.imageset/*`
- Test: `tests/tools/icon.test.ts`

**Interfaces:**
- Produces:
  ```js
  // tools/icon/icon.mjs
  export function iconSvg(fontFamily) // 1024×1024 の SVG 文字列。A 案の仕上げ
  // tools/icon/make-ios-assets.mjs（実行すると）
  //  1. node_modules/@fontsource/yuji-boku の CSS から「超」(U+8D85) を含む woff2 を探し、wawoff2 で TTF に戻して一時フォルダへ
  //  2. resvg で iconSvg を 1024 の PNG に（背景 #14213D で塗りつぶし、透明なし）→ AppIcon.appiconset の 1024 の画像として置く
  //  3. 起動画面：#14213D の無地 2732×2732 を Splash.imageset の3枚として置く
  ```
- デザイン（A 案の仕上げ。見本：`https://claude.ai/artifact/Vp69HxyvbwxvRspWWh6Y2N` の A、見本の SVG は `C:\Users\USER\AppData\Local\Temp\claude\C--Users-USER-Desktop-game-SuperShogi\bc9636f5-4e9b-4dcc-9edc-dc206b443e90\scratchpad\icons\super-shogi-icons.html` にある。読めなければ見本の説明だけで作る）：
  - 地：夜の藍の放射状のぼかし（中心 `#22386a` → `#14213D` → 縁 `#0d1730`）
  - 背の隈取：紅 `#D7263D` の一筆を右上から左下へ斜めに。払いの先が細くかすれる
  - 駒：榧の五角形を少し左へ傾け、木目（細い筋を数本）と、上の面取りの光・右下の厚みの影
  - 字：Yuji Boku の「超」を墨 `#1d1a17` で、駒の中に大きく。60px に縮めても字の形が分かる太さ
  - 角の丸みは iOS が付けるので、SVG は四角いまま
- 見た目の作業なので、手を付ける前に frontend-design スキル（`frontend-design:frontend-design`）を読み込む

- [ ] **Step 1: 失敗するテストを書く** — `tests/tools/icon.test.ts`
  - `アイコンの SVG は 1024 四方で、7色以外の色を使わない`：`iconSvg('Yuji Boku')` の `viewBox="0 0 1024 1024"`、含まれる `#xxxxxx` がすべて `src/view/palette.ts` の文字列の値（`PALS`）にある。榧の明るい面・暗い面など新しい明暗が要るときは、palette.ts に名前を付けて足してから使う（`icon.mjs` は palette.ts を import する）
  - `字は「超」`：SVG に `超` が入っている
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/tools/icon.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する** — `iconSvg` と `make-ios-assets.mjs`。`npm run icon` で PNG を作る
- [ ] **Step 4: 確かめる** — Run: `npm test`・`npm run icon` / Expected: PASS。PNG を Read で見て、1024 と 60px 相当に縮めた見え方を確かめる（縮小は resvg の `fitTo` で 60px のものを一時的に作って見る）。透明がないこと（PNG の色の種類が RGB）を確かめる。見た目を2回まで直してよい
- [ ] **Step 5: コミット** — `git commit -m "アイコン（駒に「超」と紅の隈取）と起動画面を作る道具を足し、Xcode に置く"`

---

### Task 6: GitHub のリポジトリと TestFlight への組み立て（とりまとめ役がユーザーと一緒に行う）

**Files:**
- Create: `.github/workflows/ios-testflight.yml`, `docs/testflight-checklist.md`

**Interfaces:**
- ワークフローは `../tenrakuhai/.github/workflows/ios-testflight.yml` を写し、次だけ変える：広告の入力（`production`）と `ADS_PRODUCTION` を消す、Game Center の entitlements の行を消す（アプリ本体の仮の署名は entitlements なしで付ける）、名前は「iPhone版をTestFlightへ」のまま、`node-version: 24`、runner の選択肢はそのまま
- `docs/testflight-checklist.md`：設計書 5「実機」の6項目を、チェック欄つきの表にする

- [ ] **Step 1: ワークフローとチェック表を書いてコミット**（`git commit -m "TestFlight へ送る組み立てと、実機で確かめるチェック表を足す"`）
- [ ] **Step 2: ユーザーに確かめてから**、`gh repo create maosun-dev/SuperShogi --public --source . --push`（公開の操作なので、押す前にユーザーに確認する）
- [ ] **Step 3: 鍵を示す番号の Secrets を入れる** — `APPLE_TEAM_ID`・`APPSTORE_API_KEY_ID`・`APPSTORE_API_ISSUER_ID` を `gh secret set` で入れる。値は前のアプリの記録（`C:\Users\USER\.claude\projects\` の各メモ、前のリポジトリの docs）から探し、なければユーザーに聞く。p8 の中身は読まない・入れない
- [ ] **Step 4: ユーザーにお願いする** — ① `APPSTORE_API_PRIVATE_KEY` に p8 の中身を入れる（GitHub の Settings → Secrets and variables → Actions）② App Store Connect で `com.maosundev.supershogi` のアプリを「超将棋」で登録する。手順を短く書いて渡す
- [ ] **Step 5: 実行して結果を読む** — `gh workflow run ios-testflight.yml` → `gh run watch`（裏で）→ 失敗なら `gh run view --log-failed` を読み、superpowers:systematic-debugging で原因を確かめて直す。成功したら TestFlight に届くまで待つ
- [ ] **Step 6: ユーザーに実機で確かめてもらう** — チェック表を渡し、結果を聞く。直す所が出たら、それぞれ別のタスクとして扱う
- [ ] **Step 7: 書き残す** — 設計書（計画4）の状態を「実装済み」に、この計画書の冒頭に「実装後に変えたこと」を書き、メモを更新する
