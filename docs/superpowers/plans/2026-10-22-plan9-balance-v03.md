# 計画9：札の調整と札選びの作り直し（0.3.0）手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 遊んだ感想と CPU 同士の数字をもとに札8種類を直し（王の盾→退き陣の旗）、同じ札は1枚までにし、札選びの画面で説明を見ながら入れる・抜くができるようにする。

**Architecture:** ルールは `src/cards/*`（札の定義）と `src/rules/game.ts`・`moves.ts`（手番と動き）を直す。押し返しの続きは、忍札の「伏せても手番が終わらない」と同じく `turn` を変えずに返すので、CPU の読み（`search.ts` の「子の手番が同じなら符号を変えない」）はそのまま使える。画面は図鑑の「大きな札と説明」を部品 `src/app/screens/cardLook.ts` にまとめ、図鑑と札選びの両方で使う。

**Tech Stack:** TypeScript・Vite・Vitest・Three.js（演出）・自作 SVG（札の絵）

**Spec:** `docs/superpowers/specs/2026-10-22-balance-v03-design.md`

## Global Constraints

- 同じ札は1枚まで（`MAX_COPIES = 1`）。コストの合計は10まで（`COST_LIMIT = 10` は変えない）
- 札のプログラムの中の名前：成り上がりは `shoryu` のまま。退き陣の旗は `hikijin`。`tate` は消す
- 始めのコスト：押し返しの風1・成り上がり2・身代わり4・貫きの槍4・重りの枷3・韋駄天5・退き陣の旗1（Task 12 の数字で最後に決める）
- 画面に出す説明文は設計書 3.1 の文をそのまま使う
- コードのコメント・コミットメッセージは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 見た目に触る Task（10・11）は、手を付ける前に frontend-design スキルを読む。絵は自作の SVG で、色は `palette.ts` の名前だけを使う
- PowerShell では `npm.cmd`（Bash では `npm`）。テストは `npm test`、型は `npm run typecheck`

## Review Focus

1. 押し返しの続きで指せる手が1つもない（王だけで凍っている等）→ 手番が自動で相手に回り、止まらない（Task 3 にテスト）
2. 身代わりで王が移った先が相手の凍てつく床 → 王が1手番凍る。落とし穴なら何も起きない（Task 5 にテスト）
3. 保存した持ち込みに `tate` や同じ札2枚が入っている → 起動時に落ちず、その札だけ外れる（Task 1 にテスト）
4. 重りの枷を付けた駒が、外れる前に取られる・格落としされる → 例外にならない（取られたら札ごと消える。Task 7 にテスト）
5. 貫きの槍を付けた香車が飛び越えて成る手 → 成りと札が外れるのが両方起きる（Task 6 にテスト）

---

### Task 1: 同じ札は1枚まで・保存した持ち込みの掃除

**Files:**
- Modify: `src/cards/index.ts`（`MAX_COPIES = 1`、`validateDeck` の文「同じ札は1枚までです」、未知の札も弾く）
- Modify: `src/app/deck.ts`（`addReason` の文、`autoDeck` のコメント「18種を1枚ずつ」）
- Modify: `src/app/storage.ts`（`loadDeck`）
- Modify: `src/ai/levels.ts`（つよいの持ち込み）
- Test: `tests/rules/deck.test.ts`・`tests/app/deck.test.ts`・`tests/app/storage.test.ts`・`tests/ai/levels.test.ts`

**Interfaces:**
- Produces: `sanitizeDeck(ids: string[]): CardId[]`（`src/cards/index.ts`。知らない札と2枚目以降を外し、前から足してコスト10を超える札も外す）。`loadDeck` はこれを通した結果を返す（配列でなければ `null`）

- [ ] **Step 1: 失敗するテストを書く**
  - `validateDeck(['rakurai','rakurai'])` が `'同じ札は1枚までです'`
  - `addReason(['tenma'], 'tenma')` が `'同じ札は1枚までです'`
  - `autoDeck(makeRng(n))` を n=1..50 で回し、どれも重複なし・コスト10以内
  - `sanitizeDeck(['tate','rakurai','rakurai','hagane'])` が `['rakurai','hagane']`
  - 保存に `["tate","rakurai","rakurai"]` があると `loadDeck` が `['rakurai']`
  - `LEVELS.strong.deck` が `['itetsuku','aiuchi','tsuranuki','hagane']`、3段階とも `validateDeck(deck) === null`
- [ ] **Step 2: `npm test` で上のテストが落ちるのを見る**
- [ ] **Step 3: 実装する**（`tsuranuki` のコストはまだ3だが、Task 6 で4にしても合計10に収まる組み合わせにしておく）
- [ ] **Step 4: `npm test` と `npm run typecheck` が通るのを見る**
- [ ] **Step 5: コミット**「同じ札は1枚までにし、保存した持ち込みは知らない札と2枚目を外して読む」

### Task 2: 王の盾をなくし、退き陣の旗を足す

**Files:**
- Modify: `src/rules/types.ts`（`CardId` の `'tate'` を `'hikijin'` に）
- Delete: `src/cards/shield.ts`。`src/cards/index.ts`・`magic.ts`・`equip.ts` の `isShielded` を消す
- Modify: `src/cards/types.ts`（`equip` の旗 `magicShield` を消し `retreat?: true` を足す）
- Modify: `src/cards/equip.ts`（`tate` を消し `hikijin` を足す。並びは今の `tate` の位置）
- Modify: `src/rules/moves.ts`（`pieceTargets`：`hikijin` を付けた成っていない駒は真後ろ1マスも動ける）
- Modify: `src/ai/evaluate.ts`（`EQUIP_VALUE` の `tate` を消し `hikijin: 80`）、`src/ai/cardHints.ts`（`case 'tate'` を消し、`hikijin` は「前に出ている駒ほど先」：相手陣に近い順に上位）
- Modify: `src/fx/equip.ts`（`EquipName` と表の `tate` を `hikijin` に。演出は Task 10 で作るので、ここでは天馬の蹄の演出を仮に使う）
- Modify: `src/view/cardArt.ts`（`tate` の絵を消し、`hikijin` に仮の1文字の絵「退」。Task 10 で描く）
- Test: `tests/rules/cards-equip.test.ts`・`cards-new.test.ts`・`tests/ai/evaluate.test.ts`・`tests/app/match.test.ts`・`tests/view/input.test.ts`（`tate` を使うテストは消すか `hikijin` に置き換える）

**Interfaces:**
- Produces: `CARDS.hikijin`：`{ id:'hikijin', name:'退き陣の旗', kind:'equip', cost:1, fx:'hikijin', equip:{ retreat:true } }`。対象は自分の、纏札の付いていない、成っていない `FU`/`KY`/`KE`/`GI`。`prompt` は他の纏札と同じ「纏札を付ける自分の駒を選んでください」

- [ ] **Step 1: 失敗するテストを書く**
  - 先手の歩（5五）に `hikijin` → `pieceTargets` に 5四 と 5六 の両方が入る（先手は r が小さい方が前）
  - 後手の銀に付けると、後手から見た真後ろ（r が1小さいマス）が増える
  - 成った歩（と金）に付いた旗では、動ける先が金と同じのまま（増えも減りもしない）
  - `CARDS.hikijin.targetSets` に金・飛車・成った駒・旗付きの駒が入らない
  - 落雷・押し返しの風・格落とし・重りの枷が、前に王の盾で守られていた形でも対象にできる（`isShielded` が消えたこと）
- [ ] **Step 2: `npm test` で落ちるのを見る**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` と `npm run typecheck` が通るのを見る**
- [ ] **Step 5: コミット**「王の盾をなくし、退き陣の旗（真後ろへ1マス下がれる）を足す」

### Task 3: 押し返しの風のあと、続けて指せる

**Files:**
- Modify: `src/rules/types.ts`（`GameState.pushFollowUp: boolean` を足す。コメント「押し返しの風を使ったあとの続きの手。駒を動かすか打つだけ」）
- Modify: `src/rules/game.ts`（`createGame`・`legalActions`・`applyActionUnchecked`・`endTurn`）、`src/rules/board.ts`（`cloneState` と `positionKey` の最後に `'P'`/`'-'`）
- Modify: `src/cards/types.ts`（`CardDef.continuesTurn?: true`）、`src/cards/magic.ts`（`oshikaeshi` に `continuesTurn: true` と設計書 3.1 の文）
- Modify: `src/ai/levels.ts`（`view.pushFollowUp` のときも `TRAP_AFTER_SHARE` の時間）
- Modify: `tests/helpers.ts`（`pushFollowUp: false`）
- Check: `src/app/match.ts`・`src/view/input.ts` が「札を使っても手番が同じ」場合に、忍札と同じく人の入力を続けて受けるか読み、受けないなら直す
- Test: `tests/rules/cards-magic.test.ts`・`tests/ai/levels.test.ts`

**Interfaces:**
- Produces: `GameState.pushFollowUp`。`continuesTurn` の札を使ったら `true`、`endTurn` で `false`。`true` の間 `legalActions` は術札・纏札を出さない（忍札は `trapSetThisTurn` の決まりどおり）

- [ ] **Step 1: 失敗するテストを書く**
  - 押し返しを使ったあと `state.turn` が同じ・`pushFollowUp === true`・`legalActions` に `move` があり、術札・纏札の `card` がない
  - 続けて駒を動かすと手番が相手に移り、`pushFollowUp === false`
  - 続きで忍札を1枚伏せても続きの手が残る
  - 自分の駒が凍った王だけ・持ち駒なしで押し返す → `passed` が出て手番が相手に回る
  - 鏡の結界を伏せた相手にも押し返しは打ち消されない（今までどおり）
  - `positionKey` が `pushFollowUp` の違いで変わる
- [ ] **Step 2: `npm test` で落ちるのを見る**
- [ ] **Step 3: 実装する**（`applyActionUnchecked` の札の分岐で、`trap` と同じく「続けて行える行動が無いときだけ `passed` で回す」を `continuesTurn` にも使う）
- [ ] **Step 4: `npm test` と `npm run typecheck` が通るのを見る**
- [ ] **Step 5: コミット**「押し返しの風を使ったあと、続けて駒を動かすか打てるようにする」

### Task 4: 昇竜を成り上がりに

**Files:**
- Modify: `src/cards/magic.ts`（`shoryu`：名前「成り上がり」・コスト2・設計書 3.1 の文・対象は成っていない、封じられていない `FU`/`KY`/`KE`/`GI` だけ）
- Modify: 画面に「昇竜」と出ている所（`grep -rn 昇竜 src`）を「成り上がり」に。演出の名前 `fx: 'shoryu'` はそのまま
- Test: `tests/rules/cards-new.test.ts`

- [ ] **Step 1: 失敗するテスト**：飛車・角・金・王・成った駒が対象に入らない。歩・香・桂・銀は入る。`CARDS.shoryu.name === '成り上がり'`、`cost === 2`
- [ ] **Step 2: 落ちるのを見る**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` が通るのを見る**
- [ ] **Step 5: コミット**「昇竜を成り上がりにする（歩・香・桂・銀だけ。コスト2）」

### Task 5: 身代わりで王が移る

**Files:**
- Modify: `src/rules/types.ts`（`kingGuarded` に `to: Square` を足す）
- Modify: `src/rules/game.ts`（`guardKing`：壊したマスへ王を移し、`enterSquare` を呼ぶ）
- Modify: `src/cards/trap.ts`（`migawari` の文を設計書 3.1 に）
- Modify: `src/fx/trap.ts`・`src/fx/plan.ts`（`kingGuarded` の演出で王が `to` へ動く。凝った演出は Task 10）
- Test: `tests/rules/cards-new.test.ts`・`tests/fx/plan.test.ts`

- [ ] **Step 1: 失敗するテスト**
  - 発動後、王が壊れた駒のマスにいて、元の王のマスは空。取りに来た駒は動いていない。手番は相手（取りに来た側）から王の側へ移っている
  - 移った先に相手の凍てつく床 → 王が `frozen === 1`。相手の落とし穴 → 王は残り、罠も残る
  - `kingGuarded` の `to` が壊れたマス
- [ ] **Step 2: 落ちるのを見る**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` が通るのを見る**
- [ ] **Step 5: コミット**「身代わりで、王が壊れた味方のマスへ移るようにする」

### Task 6: 貫きの槍は1回きり

**Files:**
- Modify: `src/rules/types.ts`（イベント `{ type: 'equipBroken'; pieceId: number; at: Square; cardId: CardId }` を足す。Task 7 でも使う）
- Modify: `src/rules/game.ts`（`stepMove`：槍付きの駒の動きが、from と to の間に駒を挟む滑る動きなら、動いたあと `equip = null` と `equipBroken`。相討ちで壊れたときは出さない）
- Modify: `src/cards/equip.ts`（`tsuranuki`：コスト4・設計書 3.1 の文）
- Modify: `src/ai/evaluate.ts`（`EQUIP_VALUE.tsuranuki` を 300→150）
- Modify: `src/fx/plan.ts`（`equipBroken` は今は `notice` で「〇〇が外れました」。Task 10 で演出）
- Test: `tests/rules/cards-equip.test.ts`

**Interfaces:**
- Produces: `GameEvent` の `equipBroken`

- [ ] **Step 1: 失敗するテスト**
  - 飛車が間の駒を飛び越えて動いたら、槍が外れ `equipBroken` が出る。2回目は飛び越えられない
  - 飛び越えない動きでは外れない
  - 香車が飛び越えて敵陣に入り成る手 → 成り（`promoted`）と外れるのが両方起きる
- [ ] **Step 2: 落ちるのを見る**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` が通るのを見る**
- [ ] **Step 5: コミット**「貫きの槍を1回きりにする（コスト4）」

### Task 7: 重りの枷は3手番で外れる

**Files:**
- Modify: `src/rules/types.ts`（`Equip` に `left?: number`。コメント「重りの枷の残りの手番」）
- Modify: `src/cards/equip.ts`（`omori` を付けるとき `left: 3`。文を設計書 3.1 に）
- Modify: `src/rules/game.ts`（`endTurn`：手番を終えた側の駒の `omori` の `left` を1減らし、0で `equip = null` と `equipBroken`）
- Modify: `src/rules/board.ts`（`positionKey` の装備に `left` を入れる。`cloneState` が `equip` を写しているか確かめる）
- Modify: `src/ai/evaluate.ts`（枷の損を `left / 3` 倍）
- Modify: `src/view/pieces3d.ts`（駒の印に枷の残り：凍結の数字と同じ作りで、色は `soubi`）
- Test: `tests/rules/cards-equip.test.ts`・`tests/ai/evaluate.test.ts`

- [ ] **Step 1: 失敗するテスト**
  - 後手の銀に枷 → 後手の手番が3回終わると枷が外れ、`equipBroken`（`cardId:'omori'`）が出る。2回目の終わりではまだ付いている（`left === 1`）
  - 先手の手番の終わりでは減らない
  - 枷付きの駒が取られても例外にならない（取った側の持ち駒になり、札は消える）
  - 凍った駒にも数えられる（凍っていても手番の終わりで減る）
- [ ] **Step 2: 落ちるのを見る**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` と `npm run typecheck` が通るのを見る**
- [ ] **Step 5: コミット**「重りの枷を、付けられた側の3手番で外れるようにする」

### Task 8: 韋駄天の対象と、罠の説明文

**Files:**
- Modify: `src/cards/equip.ts`（`idaten`：対象から `HI`・`KA`（成った竜・馬も）を外す。文を設計書 3.1 に）
- Modify: `src/cards/trap.ts`（`otoshiana`・`itetsuku` の文を設計書 3.1 に）
- Test: `tests/rules/cards-equip.test.ts`

- [ ] **Step 1: 失敗するテスト**：韋駄天の `targetSets` に飛車・角・竜・馬が入らず、金・銀・王は入る
- [ ] **Step 2: 落ちるのを見る**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` が通るのを見る**
- [ ] **Step 5: コミット**「韋駄天を飛車・角に付けられなくし、罠の説明に『相手からは場所が見えない』を足す」

### Task 9: CPU の札の扱いを合わせる

**Files:**
- Modify: `src/ai/cardHints.ts`（`shoryu`：対象が減ったので今の値打ち順のまま。`oshikaeshi`：押し返したあと取れる駒が増える手を上位に＝押し返した駒が自分の駒の利きに入る手を先に）
- Modify: `src/ai/evaluate.ts`（Task 2・6・7 で入れた値の見直し）
- Test: `tests/ai/cardHints.test.ts`・`tests/ai/search.test.ts`

- [ ] **Step 1: 失敗するテスト**
  - 押し返すと自分の駒で取れるようになる局面で、CPU（ふつう）が押し返しの風 → 取る、の2つを続けて選ぶ（`chooseCpuAction` を2回呼ぶ）
  - 退き陣の旗を持たせた CPU が、例外なく行動を返す（`tests/ai/cpu-games.test.ts` の自動対局に `hikijin` を入れる）
- [ ] **Step 2: 落ちるのを見る**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` が通るのを見る**
- [ ] **Step 5: コミット**「CPU が押し返しの続き・退き陣の旗・新しい札の形を使えるようにする」

### Task 10: 札の絵と演出（frontend-design を読んでから）

**Files:**
- Modify: `src/view/cardArt.ts`（`shoryu`：駒が金色に光りながら一段上がる絵。`hikijin`：陣の旗と後ろ向きの矢印の絵。どちらも viewBox 46×62、墨の太い線＋術は藍・纏は金箔）
- Modify: `src/fx/equip.ts`（`hikijin` を付ける演出、`equipBroken` の演出：槍が折れる・枷が砕ける）
- Modify: `src/fx/trap.ts`（身代わり：壊れた駒のマスへ王がすっと移る）
- Modify: `src/fx/plan.ts`（`equipBroken` を演出の合図へ）
- Modify: `src/app/dev.ts`（試し口 `?fx=hikijin`・`?fx=migawari`（王が移る）・`?fx=tsuranuki-break`・`?fx=omori-break`）
- Test: `tests/view/cardArt.test.ts`・`tests/fx/plan.test.ts`

- [ ] **Step 1: frontend-design スキルを読む**
- [ ] **Step 2: 失敗するテスト**：`CARD_ART.hikijin`・`CARD_ART.shoryu` が palette の色だけでできている（今のテストの決まりに乗る）。`equipBroken` が演出の合図になる
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` が通るのを見る。開発用サーバー（preview_start `dev`）で試し口を開き、画面を出したまま演出を見て撮る**
- [ ] **Step 5: コミット**「成り上がり・退き陣の旗の絵と、槍・枷が外れる・身代わりで王が移る演出を作る」

### Task 11: 札選びの画面を図鑑と同じ仕組みに（frontend-design を読んでから）

**Files:**
- Create: `src/app/screens/cardLook.ts`（大きな札と説明を出す部品）
- Modify: `src/app/screens/zukan.ts`（`cardLook` を使う）
- Modify: `src/app/screens/deck.ts`（設計書 4章）
- Modify: `src/app/style.css`（入っている札の印・沈んだ見た目・入れられない札の薄さ・ボタン）
- Test: `tests/app/deck.test.ts`（`lookActions` の判断）

**Interfaces:**
- Produces:
  - `createCardLook(): { el: HTMLElement; open(id: CardId, from: HTMLElement, actions: LookAction[]): void; close(): void; destroy(): void }`
  - `interface LookAction { label: string; disabled?: boolean; note?: string; primary?: boolean; run(): void }`（ボタン。`note` はボタンの下に出す理由）
  - `lookActions(deck: CardId[], id: CardId): { kind: 'add' | 'remove'; disabled: boolean; note: string }`（`src/app/deck.ts`。入っていれば remove、入っていなければ add で `addReason` を note に）

- [ ] **Step 1: frontend-design スキルを読む**
- [ ] **Step 2: 失敗するテスト**：`lookActions([], 'rakurai')` が `{kind:'add', disabled:false, note:''}`。`lookActions(['rakurai'], 'rakurai')` が remove。コスト不足の札は `{kind:'add', disabled:true, note:'残りのコストが足りません'}`
- [ ] **Step 3: 実装する**（閉じる：ボタン・外側を押す・Esc。閉じたら押した札に枠を戻す。入れる・抜くのあとは閉じて画面を描き直す）
- [ ] **Step 4: `npm test` と `npm run typecheck` が通るのを見る。開発用サーバーで、札選び（一覧から入れる・抜く、下の列から抜く、入れられない札）と図鑑を、スマホの幅（375×812）とパソコンの幅で操作して撮る**
- [ ] **Step 5: コミット**「札選びの画面で、札を押すと説明が出て入れる・抜くができるようにする（図鑑と同じ部品）」

### Task 12: 数字で確かめて直す

- [ ] **Step 1:** `node tools/arena/run.mjs cards 420 7 10 0.1` → `node tools/arena/summary.mjs tools/arena/out/cards-10.jsonl`（`tools/arena/arena.ts` が `tate` や2枚持ちを使っていたら先に直す）
- [ ] **Step 2:** 42〜58% を外れた札のコストを1ずつ動かし、もう1回（`cards ... 11`）。2回続けて外れる札だけ直す
- [ ] **Step 3:** `node tools/arena/run.mjs levels 105 7 12 0.1` → つよい→ふつう8割以上・ふつう→よわい8割以上・引き分け5%未満。届かなければ、つよいの持ち込みを替えて数え直す
- [ ] **Step 4:** コストを変えた札は、設計書の表とテストを合わせる。結果をこの手順書の「結果」に表で書く
- [ ] **Step 5: コミット**「計画9の結果（札ごとの勝率と強さの段階）で数字を直す」

### Task 13: 0.3.0 にする

- [ ] **Step 1:** `ios/App/App.xcodeproj/project.pbxproj` の `MARKETING_VERSION` を 0.3.0 に（2か所）
- [ ] **Step 2:** `npm test`・`npm run typecheck`・`npm run build` がすべて通るのを見る
- [ ] **Step 3: コミット**「版を 0.3.0 にする（札の調整・札選びの作り直し）」。push と TestFlight はユーザーに確認してから

## 結果

（Task 12 で書く）
