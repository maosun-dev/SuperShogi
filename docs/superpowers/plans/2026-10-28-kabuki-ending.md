# 大詰のエンディング 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**ねらい：** 本番で傾奇者の王を取ったら、専用の王取りの演出「大見得」から幕が開き、回り舞台・定式幕・桜のエンディング（サクラドリフト 0:00〜1:50）を流して結果画面へ進む。

**作りの考え方：** 何秒に何をするか（台本）と、流す・飛ばせる・見返せるの決まりは、three を読まない純粋な部品にしてテストで固める。3Dの部品（回り舞台・札の板・立体の幕・口上の紙・大入袋）は src/fx/ending にまとめ、エンディングの画面がその台本に沿って動かす。場面の時刻は曲の位置（裏から戻っても続きから流れる）に合わせる。

**使うもの：** TypeScript・Three.js・Vite・Vitest（テストは純粋な部品だけ。見た目は試し口でブラウザに流して確かめる）

**設計書：** docs/superpowers/specs/2026-10-28-kabuki-ending-design.md

## 全体の決まり

- 流すのは本番（稽古・友と対局・自動対局でない）の傾奇者（level `kabuki`）に、人（`sente`）が王を取って勝ったときだけ。毎回流す
- 初めては飛ばせない。最後まで見たら記録し、2回目からと設定からの見返しは飛ばせる。途中で抜けたら記録しない
- 曲はサクラドリフト（`sakura`）の 0:00〜1:50。1:45 で曲を止め始める（今の止め方は約1秒で消える）
- スペシャルサンクスは横書きの「DAIKI YAMADA」だけ。本名の漢字はどこにも書かない（コード・コメント・テスト・コミットも）
- 作りは「作 maosun-dev」（横書き）
- 定式幕の色は黒・柿・萌葱（強さ選びの画面の定式幕と同じ値を使う）
- 文字・コメント・コミットメッセージは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 見た目の作業（課題4〜7）の前に frontend-design スキルを読む。グラデーション・光・影付きの縁取り文字・丸バッジは使わない

## 見落としやすい所

- 傾奇者に**負けた**とき（CPU が人の王を取った）：大見得もエンディングも流さず、いつもの演出（課題3のテスト）
- 稽古の傾奇者に勝ったとき：流さない（課題2のテスト）
- エンディングの途中で裏に回って戻る：曲も場面も続きから（課題5の時計のテスト）
- 音を出せない（AudioContext が無い・失敗した）ときでも、時計で最後まで進み、結果画面へ行ける（課題5のテスト）
- 初回の途中でアプリを閉じた：見たことにしない＝次も飛ばせない（課題2のテスト）

---

### 課題1：台本（何秒に何をするか）と役名

**Files:**
- Create: `src/app/ending/script.ts`
- Test: `tests/app/endingScript.test.ts`

**Interfaces:**
- Produces:
  - `export const ENDING_TRACK: MusicName = 'sakura'`
  - `export const ENDING_LEN = 110`（秒）、`export const MUSIC_STOP_AT = 105`
  - `export type EndingScene = 'open' | 'turn' | 'bloom' | 'kojo' | 'ooiri' | 'done'`
  - `export const SCENES: readonly { scene: EndingScene; at: number }[]` ＝ open 0・turn 5・bloom 87・kojo 95・ooiri 105・done 110（bloom＝桜が一気に舞い幕が閉まり始める、kojo＝口上の紙）
  - `export function sceneAt(t: number): EndingScene`（t 秒のときの場面。t<0 は open、t≥110 は done）
  - `export const ROLES: Record<CardId, string>`（設計書4章の18枚の役名。例 `rakurai: '雷神の役'`、`hikijin: '旗本の役'`）
  - `export const CAST_ORDER: readonly CardId[]`（回り舞台に並べる順。CARDS の並びのまま18枚）
  - `export function castAt(t: number): CardId | null`（turn の間（5〜87秒）を18等分して、正面に来ている札。それ以外は null）
  - `export const STAFF = [{ role: '作', name: 'maosun-dev' }, { role: '御礼', name: 'DAIKI YAMADA' }] as const`

- [ ] **Step 1: 失敗するテストを書く** — `sceneAt` が各区切りの手前と境目で正しい（例 `sceneAt(4.99)==='open'`、`sceneAt(5)==='turn'`、`sceneAt(86.9)==='turn'`、`sceneAt(87)==='bloom'`、`sceneAt(110)==='done'`、`sceneAt(-1)==='open'`）。`SCENES` の時刻が増えていく・最後が `ENDING_LEN`。`ROLES` のキーが `Object.keys(CARDS)` と同じ18個で、どれも「の役」で終わる。`CAST_ORDER` が18枚で重複なし。`castAt(5)===CAST_ORDER[0]`、`castAt(86.99)===CAST_ORDER[17]`、`castAt(4)===null`、`castAt(87)===null`。`STAFF` に漢字の名前が入っていない（`/[一-龯]/` が name に当たらない）
- [ ] **Step 2: テストが失敗するのを見る** — `npx vitest run tests/app/endingScript.test.ts` → script.ts が無いので FAIL
- [ ] **Step 3: script.ts を書く**（上の名前と値のとおり。three を読まない）
- [ ] **Step 4: テストが通るのを見る** — 同じコマンドで PASS
- [ ] **Step 5: コミット** — 「エンディングの台本：場面の時刻・18枚の役名・クレジット」

### 課題2：流す・飛ばせる・見返せるの決まりと記録

**Files:**
- Create: `src/app/ending/rules.ts`
- Modify: `src/app/storage.ts`（新しい鍵 `superShogi.ending` を足し、`SAVE_KEYS` にも入れる）
- Test: `tests/app/endingRules.test.ts`、`tests/app/storage.test.ts`（SAVE_KEYS の数のテストがあれば直す）

**Interfaces:**
- Produces:
  - `export interface EndingWhen { level: Level; keiko: boolean; friend: boolean; auto: boolean }`
  - `export function oomieOn(w: EndingWhen): boolean` ＝ `level==='kabuki' && !keiko && !friend && !auto`（対局の始まりに、大見得を使う対局かを決める）
  - `export function endingAfter(w: EndingWhen, result: Result): boolean` ＝ `oomieOn(w) && result.reason==='king-captured' && result.winner==='sente'`
  - `export function canSkip(seen: boolean): boolean` ＝ `seen`
  - storage.ts：`export function loadEndingSeen(st: KeyValueStore): boolean`、`export function markEndingSeen(st: KeyValueStore): void`（中身は `true` の JSON。読めない値は false）

- [ ] **Step 1: 失敗するテストを書く** — `endingAfter`：本番の傾奇者・王を取って先手の勝ち → true。稽古・友・自動 → false。ほかの強さ（`oni`・`shihan`・`strong`）→ false。後手の勝ち（負け）→ false。`repetition`・`move-limit`・`resign` → false。`canSkip(false)===false`・`canSkip(true)===true`。`loadEndingSeen` は何も無いとき false、`markEndingSeen` のあと true、壊れた値（`'{'`）でも false。`SAVE_KEYS` に `'superShogi.ending'` が入っている
- [ ] **Step 2: 失敗を見る** — `npx vitest run tests/app/endingRules.test.ts tests/app/storage.test.ts` → FAIL
- [ ] **Step 3: rules.ts と storage.ts を書く**（storage は今の `readJson`・`KEY_*` の書き方に合わせる）
- [ ] **Step 4: 通るのを見る** — 同じコマンドで PASS
- [ ] **Step 5: コミット** — 「エンディングを流す・飛ばせる決まりと、見たかの記録」

### 課題3：大見得（傾奇者専用の王取り）と、対局画面からエンディングへ

**Files:**
- Create: `src/fx/kingfx/oomie.ts`
- Modify: `src/fx/finale.ts`（`setOomie` と `playGameOver` の分かれ道）、`src/app/screens/match.ts`（始まりに `setOomie(oomieOn(...))`、`onOver` でエンディングへ）、`src/app/screens.ts`（`ScreenName` に `'ending'` を足す）
- Test: `tests/fx/kingfx.test.ts`（分かれ道の純粋な判定）

**Interfaces:**
- Consumes: `oomieOn`・`endingAfter`（課題2）、`KingFxPlay`・`KingCapture`・`petalStorm`・`freezeFrame`・`takerAlong`・`settleTaker`（src/fx/kingfx/common.ts）
- Produces:
  - `export const oomie: KingFxPlay`（oomie.ts）
  - finale.ts：`export function setOomie(on: boolean): void`、`export function useOomie(on: boolean, win: boolean): boolean` ＝ `on && win`（純粋。テストする）
  - `playGameOver`：`useOomie(...)` が真なら `KING_FX_PLAY[kingFx]` の代わりに `oomie` を流し、`writeVerdict` は書かずに返る（「勝」は結果画面が書く）。偽なら今のまま
  - match.ts の `onOver`：`endingAfter(...)` が真なら `showScreen('ending', { result, level, deck, keiko })`、偽なら今の `toResult(result)`。戦績の記録（`record`）はどちらでも先に1回
  - 開発中は `?king=oomie` で、どの強さでも勝ったときに大見得を流せる（エンディングへは進まない）

- [ ] **Step 1: 失敗するテストを書く** — `useOomie(true, true)===true`、`useOomie(true, false)===false`（傾奇者に負けたらいつもの演出）、`useOomie(false, true)===false`
- [ ] **Step 2: 失敗を見る** — `npx vitest run tests/fx/kingfx.test.ts` → FAIL
- [ ] **Step 3: oomie.ts を書く** — 流れは設計書3章：取る駒が王のマスへ動く（`takerAlong`）→ 取った瞬間にツケ打ちの音（録った音に無ければ `'drum'` を短く2回＋強く1回で代える）→ `freezeFrame` でゆっくり → カメラが取った駒へ寄り（`cameraTo`）、駒が少し傾いて止まる → `petalStorm`（桜の `notch`・`blossom`、アイコンと同じ色）→ 柝（`'maku'`）。全体で4〜5秒。終わりに王は `visible=false`、取る駒は `settleTaker` 済み（KingFxPlay の約束）。動きを減らす設定では今の `plainCapture` を使う
- [ ] **Step 4: finale.ts・match.ts・screens.ts をつなぐ**（`'ending'` の画面はまだ無いので、課題5で登録するまでは `showScreen('ending')` が結果画面へ流れないことに注意：課題5と同じ日に通す。間をあけるなら `endingAfter` の呼び出しを課題5で入れる）
- [ ] **Step 5: 通るのを見る** — `npx vitest run tests/fx/kingfx.test.ts tests/app` → PASS。`npx tsc --noEmit -p .` で型の誤りなし
- [ ] **Step 6: ブラウザで見る** — `?king=oomie` で対局し（試し口の `fxKey` で王を取れる局面から）、大見得の流れを画面写真に撮る
- [ ] **Step 7: コミット** — 「傾奇者専用の王取りの演出「大見得」」

### 課題4：エンディングの3Dの部品

**Files:**
- Create: `src/fx/ending/props.ts`
- Test: なし（three と canvas を使うので、課題6でブラウザに流して確かめる）

**Interfaces:**
- Consumes: `cardHtml` か札の SVG（src/view/cardArt.ts）、定式幕の色（強さ選びの画面で使っている値。src/app/screens/level.ts か style.css から探して同じ値を palette に置く）、`PAL`・`PALS`
- Produces（どれも `THREE.Object3D` を返し、`dispose(): void` で後片付けできる形）:
  - `export function makeTurntable(radius: number): { root: THREE.Group; setTurn(rad: number): void; dispose(): void }`（木の円い床。真ん中に盤を乗せる場所。`setTurn` で回す）
  - `export function makeStandee(id: CardId): Promise<{ root: THREE.Group; dispose(): void }>`（札の絵を板に貼って立てる。SVG を画像にしてテクスチャにする。金の縁）
  - `export function makeCurtain(width: number, height: number): { root: THREE.Group; setOpen(t: number): void; sway(now: number): void; dispose(): void }`（黒・柿・萌葱の縦縞の布を左右2枚。`setOpen(0)`＝閉、`1`＝開。`sway` で少し揺らす）
  - `export function makeKojo(): { root: THREE.Group; dispose(): void }`（口上の紙：胡粉の紙に「千穐楽」（衡山の筆文字）と、横書きの `STAFF`（課題1））
  - `export function makeOoiri(): { root: THREE.Group; dispose(): void }`（朱の大入袋に「大入」）

- [ ] **Step 1: frontend-design スキルを読み、見本（設計の会話で出した3場面）と設計書4章に沿って部品を作る**
- [ ] **Step 2: `npx tsc --noEmit -p .` で型の誤りなし**
- [ ] **Step 3: コミット** — 「エンディングの3Dの部品：回り舞台・札の板・定式幕・口上の紙・大入袋」

### 課題5：エンディングの画面と時計

**Files:**
- Create: `src/app/ending/clock.ts`、`src/app/screens/ending.ts`
- Modify: `src/fx/sound.ts`（`musicTime` を足す）、`src/app/main.ts`（`registerScreen('ending', ...)`）
- Test: `tests/app/endingClock.test.ts`、`tests/fx/sound.test.ts`

**Interfaces:**
- Consumes: 課題1の台本、課題2の決まりと記録、課題4の部品、`getStage()`、`getSound()`
- Produces:
  - sound.ts：`Sound` に `musicTime(): number | null`（いま鳴っている曲の位置。`musicPosition` を使う。鳴っていなければ null）。音なし（`silent`）は null
  - clock.ts：`export function createEndingClock(src: { musicTime(): number | null; now(): number }): { t(): number }` — 曲の位置が取れればそれを、取れなければ自分の時計（`now()` の差）を使う。曲の位置が取れなくなっても、最後に取れた位置から続けて進む（戻らない）
  - ending.ts：`export interface EndingParams { result: Result; level: Level; deck: CardId[]; keiko?: Keiko; replay?: boolean }`。`replay` のときは設定から（大見得なし・終わったら設定へ・いつでも飛ばせる）
  - 画面の動き：曲 `ENDING_TRACK` を流し、毎フレーム `sceneAt(clock.t())` と `castAt` で部品を動かす。`MUSIC_STOP_AT` で `music(null)`。`done` で、見返しでなければ `markEndingSeen` してから結果画面へ（`showScreen('result', { result, level, deck, keiko })`）、見返しなら設定へ
  - 飛ばす：`canSkip(loadEndingSeen(...)) || replay` のときだけ、画面を押すと「飛ばす」のボタンを出す。押したら記録はそのまま（初回は飛ばせないので、飛ばす＝見たことがある）で結果画面（見返しなら設定）へ
  - 抜けたとき（画面の片付け）は記録しない

- [ ] **Step 1: 失敗するテストを書く** — clock：曲の位置 12.5 が取れるとき `t()===12.5`。取れないときは `now` の差（0→3000ms で 3）。曲の位置が 40 のあと null になったら、そこから自分の時計で 40 より先へ進む（例 2000ms 後に 42）。sound：`createSound` が AudioContext の無い Node で `musicTime()===null`
- [ ] **Step 2: 失敗を見る** — `npx vitest run tests/app/endingClock.test.ts tests/fx/sound.test.ts` → FAIL
- [ ] **Step 3: clock.ts・sound.ts を書く**
- [ ] **Step 4: 通るのを見る** — 同じコマンドで PASS
- [ ] **Step 5: ending.ts を書いて main.ts で登録する**（舞台は対局と同じ `getStage()` を使い、終わったら部品を `dispose` して舞台から外す。動きを減らす設定では回転をゆっくり、桜を少なく。18枚の札の板（`makeStandee`）は画面を開いたらすぐ作り始め、幕が開く 0:05 までに間に合わなかった札は、できたものから舞台に足す）
- [ ] **Step 6: `npx vitest run` 全部と `npx tsc --noEmit -p .` が通る**
- [ ] **Step 7: コミット** — 「エンディングの画面：曲に合わせて回り舞台・幕・口上・大入を流す」

### 課題6：設定の「幕切れを見る」と試し口、目で確かめる

**Files:**
- Modify: `src/app/screens/settings.ts`（名の由来・クレジットのところ）、`src/app/dev.ts`（試し口）
- Test: `tests/app/endingRules.test.ts`（入り口を出すかの判定）

**Interfaces:**
- Consumes: `loadEndingSeen`（課題2）、`EndingParams`（課題5）
- Produces:
  - rules.ts：`export function showReplay(seen: boolean): boolean` ＝ `seen`
  - settings.ts：`showReplay(loadEndingSeen(...))` のときだけ「幕切れを見る」ボタン。押すと `showScreen('ending', { result: { winner: 'sente', reason: 'king-captured' }, level: 'kabuki', deck: [], replay: true })`
  - dev.ts：開発中だけ `?ending=1` でエンディングを直に開く（`replay: true` と同じ扱い）

- [ ] **Step 1: 失敗するテストを書く** — `showReplay(false)===false`、`showReplay(true)===true`
- [ ] **Step 2: 失敗を見る → 書く → 通るのを見る** — `npx vitest run tests/app/endingRules.test.ts`
- [ ] **Step 3: ブラウザで確かめる** — `preview_start {name:'dev'}` で `?ending=1` を開き、0:02（幕が開く）・0:30（回り舞台）・1:30（桜と幕）・1:40（口上）・1:48（大入）の画面写真を撮る。iPhone の大きさ（`resize_window` mobile）でも1枚。札の名と役名が正面の札と合っているか、ローマ字が横書きか、漢字の名前が出ていないかを見る。飛ばすボタンが見返しで出るか
- [ ] **Step 4: 本番の流れを確かめる** — 試し口で傾奇者・王を取れる局面から勝ち、大見得→エンディング→結果画面と進むこと。初回は飛ばすが出ないこと（保存を消してから）。2回目は出ること。設定に「幕切れを見る」が出ること
- [ ] **Step 5: 片付け** — 開いたタブとサーバーを閉じる（`preview_stop`）
- [ ] **Step 6: コミット** — 「設定から幕切れを見返せるように・エンディングの試し口」

### 課題7：仕上げ

- [ ] **Step 1: `npx vitest run` 全部・`npx tsc --noEmit -p .`・`npm.cmd run build` が通る**
- [ ] **Step 2: 曲の区切り（87・95・105秒）は音の大きさで見立てたもの。ユーザーに TestFlight で聴いてもらい、ずれていれば `SCENES` の値だけ直す**（このことを報告に書く）
- [ ] **Step 3: 見直し（別の目）で、全体の差分を確かめる**
- [ ] **Step 4: メモリの進み具合に、できたことと次にやること（TestFlight で見てもらう・1.0.2 に入れるか）を書く**
