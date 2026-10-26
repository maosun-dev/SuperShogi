# 計画17 土台を速くする 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CPU の読み（1秒に調べられる局面の数）を3倍以上に速くし、序幕（弱い・ふつう・強い）の強さは今のまま保つ。

**Architecture:** ルールの部品は1か所のまま、測って時間を食っている所を順に軽くする。いちばん重いのは「駒の動ける先を全部並べる」（`pieceTargets`）を、王手の確かめ（`attackedBy`）と点数づけ（`attackMap`）が何度も呼ぶこと。そこを「1つの駒が1マスに利くか」を直接調べる形に替え、残りは並べる作りを軽くする。速くしても**読みの答え（選ぶ手と点数）は1つも変わらない**ことを、局面を決めた答え合わせのテストで守る。序幕は「読む局面数の上限」で今の強さに留める。

**Tech Stack:** TypeScript・vitest・vite-node（tools/arena の道具）

**Spec:** `docs/superpowers/specs/2026-10-27-oozume-levels-design.md`（5章「土台を速くする」・6章の1行目）

## 測った今の姿（2026-10-27、パソコン、強い・3秒）

- 強いは中盤で4手先まで（序盤5手）。1手あたり約3万〜7万局面＝1秒に1〜2万局面
- 時間の内訳（node --cpu-prof、強い同士30手）：`pieceTargets` 約35%、`attackMap`（点数づけの利き）10.5%、`attackedBy`（王手の確かめ）8.1%、`endTurn` 7.9%、`positionKey` 5.7%、ごみ集め 3.2%

## Global Constraints

- ルールの部品（駒の動き・18枚の札）は1か所のまま。CPU 専用の別の盤は作らない
- 今あるテスト（653件）をすべて通したまま進める
- 速くしても、同じ局面・同じ種・同じ読む量なら、選ぶ手と点数は前と1つも変わらない（答え合わせのテスト）
- 序幕の3つは今の強さのまま。考える時間の上限（弱い0.3秒・ふつう1秒・強い3秒）も今のまま
- コードのコメント・コミットメッセージは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- PowerShell では `npm.cmd` / `npx.cmd`（Bash なら `npm` / `npx`）

## Review Focus

1. 纏札の付いた駒（貫きの槍で1つ飛び越える・天馬の桂の動き・重りの枷で隣だけ・退き陣の旗は成る前だけ真後ろ）と凍った駒：利きの判定が `pieceTargets` とずれると、王手を見落とす／ない王手に怯える → 課題2・3の突き合わせのテストで全部の局面・全部の駒・全部のマスを比べる
2. 韋駄天の2回目（`secondMoves`）は一時的に作った盤で `pieceTargets` を呼ぶ → `pieceTargets` の答え（中身と並び順）を変えない。課題3で並び順まで比べる
3. 王がいない盤（取られた直後・テストの局面）：王の位置が -1 でも落ちない → 課題2・4のテストに王のいない局面を入れる
4. 遅い iPhone でも時間の上限は効く：読む量の上限を足しても時間の打ち切りは残す → 課題1のテストで両方を確かめる
5. 駒落ちの盤・伏せた罠を隠した局面（`viewFor`）：答え合わせの局面に入れる → 課題1の局面集に入れる

---

### Task 1: 測る道具と答え合わせの土台

**Files:**
- Modify: `src/ai/search.ts`（`SearchOptions` に `maxNodes`）
- Create: `tests/ai/helpers/positions.ts`（局面集）
- Create: `tests/ai/golden.test.ts`、`tests/ai/golden-moves.json`（答え）
- Create: `tools/arena/golden-record.ts`（答えを書き出す道具）
- Create: `tools/arena/bench.ts`（速さを測る道具）
- Test: `tests/ai/search.test.ts`

**Interfaces:**
- Produces: `SearchOptions.maxNodes?: number` — 調べた局面数がこれに達したら、時間切れと同じ扱いで打ち切る（根の候補を1つ読み終えるまでは2倍まで待つのも時間と同じ）。無いときは上限なし
- Produces: `benchPositions(): GameState[]` — 決まった局面の並び（毎回同じ）。どれも決着しておらず、手番の側から見た `viewFor` の局面
- Produces: `actionKey`（既にある `src/ai/search.ts` の export）を答えの記録に使う

- [ ] **Step 1: 読む量の上限のテストを書く**（`tests/ai/search.test.ts` に足す）

```ts
test('maxNodes に達したら打ち切り、それまでに読み終えた深さの手を返す', () => {
  const s = createGame({ sente: [], gote: [] });
  const r = search(s, 'sente', { ...BASE, maxDepth: 6, timeLimitMs: 60_000, maxNodes: 3000 });
  expect(r.nodes).toBeLessThan(3000 * 2 + 200);
  expect(r.depth).toBeGreaterThanOrEqual(1);
});
test('maxNodes があっても時間の上限は効く', () => {
  let t = 0;
  const now = () => (t += 10);
  const s = createGame({ sente: [], gote: [] });
  const r = search(s, 'sente', { ...BASE, maxDepth: 6, timeLimitMs: 100, maxNodes: 10_000_000, now });
  expect(r.depth).toBeLessThan(6);
});
```

- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/ai/search.test.ts`。1つめが「nodes が大きすぎる」で落ちる

- [ ] **Step 3: `search` に `maxNodes` を足す** — `tick()` と根の候補ごとの時計の確かめで、時間と同じ条件（`canStop` 前は2倍）で `nodes` も比べて `TimeUp` を投げる

- [ ] **Step 4: 通るのを確かめる** — 同じコマンドで PASS、`npx vitest run tests/ai` も全部 PASS

- [ ] **Step 5: 局面集 `benchPositions()` を書く**（`tests/ai/helpers/positions.ts`）
  - 種 1〜8 の8局。持ち込みは 18枚が全部どこかに出るよう決めた組（例：先手 `['itetsuku','aiuchi','tsuranuki','hagane']`／後手 `['rakurai','omori','tenma']` など、局ごとに替える）。種 7 は駒落ち（`yonmai`）、種 8 は先手を後手に
  - 各局を `makeRng(seed)` と `tests/rules/random-play.test.ts` と同じ選び方（動かす・打つ・札の種類を先に選ぶ）で進め、6・20・40・60 手目の局面を `viewFor(s, s.turn)` で取る（決着していたらその局は打ち切り）
  - 手で作る局面を足す：初期配置の盤に、天馬・退き陣（成る前と成った駒）・貫きの槍（飛車と香）・重りの枷・韋駄天・鋼の鎧の駒、凍った駒（王と金）、成り封じの駒を置いたもの。王のいない盤（後手の王を消したもの）を1つ
  - 合わせて40局面ほど。同じ呼び出しで毎回同じ局面になること

- [ ] **Step 6: 答えを書き出す道具 `tools/arena/golden-record.ts`** — 局面ごとに `search(view, view.turn, { maxDepth: 6, timeLimitMs: 600_000, maxNodes: 20_000, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 0, seed: 1 })` を走らせ、`{ action: actionKey(r.action), score: r.score, depth: r.depth }` の配列を `tests/ai/golden-moves.json` に書く。実行：`npx vite-node tools/arena/golden-record.ts`

- [ ] **Step 7: 答え合わせのテスト `tests/ai/golden.test.ts`** — 同じ局面・同じ設定で `search` を走らせ、局面ごとに `action`・`score`・`depth` が JSON と完全に一致することを確かめる（1局面1件の `test.each`。時間がかかるので `{ timeout: 60_000 }`）

- [ ] **Step 8: 答えを記録して通るのを確かめる** — Step 6 の道具を一度だけ走らせ、`npx vitest run tests/ai/golden.test.ts` が PASS。**この JSON は以後の課題で書き直さない**（書き直すのは、答えが変わってよい理由がこの手順書に書いてあるときだけ）

- [ ] **Step 9: 速さを測る道具 `tools/arena/bench.ts`** — 局面集の各局面で `chooseCpuAction(view, view.turn, level, seed)` を時間どおり（timeScale 1）に走らせ、強さごとに「1秒あたりの局面数の中央値」「読めた深さの数（深さごとの局面の数）」「1手の局面数の中央値」「1手のいちばん長い時間」を表にして出す。引数で強さをしぼれる（`npx vite-node tools/arena/bench.ts -- strong`）

- [ ] **Step 10: 今の数字を記録する** — `bench.ts` を weak・normal・strong で走らせ、下の「結果」の表の「前」の列に書く

- [ ] **Step 11: コミット** — `git add src/ai/search.ts tests/ai tools/arena docs/superpowers/plans/2026-10-27-plan17-fast-search.md` → 「CPU の読む量の上限・答え合わせのテスト・速さを測る道具」

### Task 2: 1つの駒が1マスに利くかを直接調べる

**Files:**
- Modify: `src/rules/moves.ts`（`attacks` を足し、`attackedBy` をそれで書き直す）
- Test: `tests/rules/moves-fast.test.ts`

**Interfaces:**
- Consumes: `benchPositions()`（Task 1）
- Produces: `attacks(s: GameState, from: number, to: number): boolean` — `from` の駒が `to` へ動けるか。**`pieceTargets(s, sqOf(from))` に `to` が入っているかと必ず同じ答え**（味方のいるマスは false、凍った駒は false、纏札の動きも同じ）。`from` に駒がなければ false
- Produces: `attackedBy(s, sq, side)` は名前と意味そのまま、中身だけ `attacks` を使う

- [ ] **Step 1: 突き合わせのテストを書く** — 局面集の全局面 × 盤の全部の駒 × 81マスで `attacks(s, i, t) === pieceTargets(s, sqOf(i)).some(q => idx(q) === t)`。さらに全局面 × 81マス × 両方の側で、新しい `attackedBy` と「全部の駒の `pieceTargets` を並べて探す」元の作り（テストの中に写しておく）が同じ答え

- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/rules/moves-fast.test.ts`（`attacks` が無い）

- [ ] **Step 3: `attacks` を書く** — 駒の種類と向きで、`to` が1マスの動き・桂の跳び・滑る筋のどれに当たるかを差し引きで決め、滑る筋なら間のマスだけ見る。纏札：天馬は桂の跳びを足す、退き陣は成る前だけ真後ろ1マス、貫きの槍は筋の途中の駒を1つまで飛び越える、重りの枷は隣8マスに限る。`attackedBy` は相手の駒のうち `attacks` が true のものがあるか

- [ ] **Step 4: 通るのを確かめる** — 同じテスト、`npx vitest run tests/rules` 全部、`npx vitest run tests/ai/golden.test.ts` が PASS

- [ ] **Step 5: コミット** — 「王手の確かめを、駒ごとに1マスへ利くかで調べる（速くする）」

### Task 3: 動ける先を数字で並べる

**Files:**
- Modify: `src/rules/moves.ts`（`pieceTargetIdx` を足し、`pieceTargets` はそれを包む）
- Modify: `src/rules/game.ts`（`moveActions`・`hasAnyAction` が数字の版を使う）
- Modify: `src/ai/evaluate.ts`（`nonKingReach`）・`src/ai/cardHints.ts`（`foeReach`）
- Test: `tests/rules/moves-fast.test.ts`

**Interfaces:**
- Consumes: `benchPositions()`
- Produces: `pieceTargetIdx(s: GameState, from: number): number[]` — `pieceTargets` と**同じマスを同じ並び順で**、マスの番号（`r*9+c`）で返す。重なりの確かめ（今の `Set`）は、重なりが起こりうる纏札（天馬・退き陣・貫きの槍）の駒のときだけ行う
- Produces: `pieceTargets(s, from: Square): Square[]` は答えそのまま（`pieceTargetIdx` の結果を `sqOf` で写す）

- [ ] **Step 1: テストを足す** — 全局面 × 全部の駒で `pieceTargetIdx(s, i)` と `pieceTargets(s, sqOf(i)).map(idx)` が並び順まで同じ（`toEqual`）

- [ ] **Step 2: 失敗を確かめる**

- [ ] **Step 3: `pieceTargetIdx` を書き、呼び出し側を替える** — 向きの配列を広げ直さない（`[...steps, ...extra]` をやめる）、マスの物（`{c,r}`）を作らない

- [ ] **Step 4: 通るのを確かめる** — `npx vitest run` 全部（答え合わせを含む）が PASS

- [ ] **Step 5: 速さを測る** — `bench.ts -- strong` を走らせ、結果の表の「課題3のあと」に書く

- [ ] **Step 6: コミット** — 「駒の動ける先をマスの番号で並べる（速くする）」

### Task 4: 点数づけの利きを王のまわりだけ数える

**Files:**
- Modify: `src/ai/evaluate.ts`（`attackMap` をやめる）
- Modify: `src/rules/moves.ts`（`attackCount` を足す）
- Test: `tests/rules/moves-fast.test.ts`、既存の `tests/ai/evaluate.test.ts`

**Interfaces:**
- Consumes: `attacks`（Task 2）
- Produces: `attackCount(s: GameState, to: number, by: Side, cap: number): number` — `by` の駒のうち `to` へ動けるものの数。`cap` に達したらそこで数えるのをやめて `cap` を返す
- Produces: `kingSafety(s, side)` の答えは前と同じ

- [ ] **Step 1: テストを足す** — 全局面 × 81マス × 両側で、`attackCount(s, t, by, 2)` が「`by` の全部の駒の `pieceTargetIdx` に `t` が入っている数」と `2` の小さい方に等しい。全局面で `kingSafety(s, 'sente')` が元の作り（テストの中に写す）と同じ

- [ ] **Step 2: 失敗を確かめる**

- [ ] **Step 3: 書く** — `kingSafety` の `danger += Math.min(2, enemy[i])` を `attackCount(s, i, 相手, 2)` に。相手の駒の一覧は王ごとに一度だけ作り、遠くて届きえない駒（滑らない駒で2マスより遠い・桂の届かない位置）は先に外す

- [ ] **Step 4: 通るのを確かめる** — `npx vitest run` 全部 PASS

- [ ] **Step 5: 速さを測って記録** — 結果の表の「課題4のあと」

- [ ] **Step 6: コミット** — 「点数づけの利きを王のまわりだけ数える（速くする）」

### Task 5: 読みの中では知らせを作らない・局面のキーを軽く

**Files:**
- Modify: `src/rules/game.ts`（`applyActionUnchecked` に `opts`）
- Modify: `src/rules/board.ts`（`positionKey` の作り）
- Modify: `src/ai/search.ts`（読みの中の適用は `quiet: true`）
- Test: `tests/rules/unchecked.test.ts`、`tests/rules/board.test.ts`

**Interfaces:**
- Produces: `applyActionUnchecked(s0: GameState, a: Action, opts?: { quiet?: boolean }): { state: GameState; events: GameEvent[] }` — `quiet` のときは `endTurn` の王手の知らせ（`check` の event のための `isInCheck`）を作らない。**局面（state）は quiet でもそうでなくても完全に同じ**
- Produces: `positionKey(s)` は前と1文字も違わない文字列を返す（作り方だけ速く）

- [ ] **Step 1: テストを足す** — 局面集の全局面 × `legalActions` の全部の行動で、`applyActionUnchecked(s, a, { quiet: true }).state` と `applyActionUnchecked(s, a).state` が `toEqual`。全局面で新しい `positionKey` と元の作り（テストの中に写す）が同じ文字列

- [ ] **Step 2: 失敗を確かめる**

- [ ] **Step 3: 書く** — `quiet` は `endTurn` まで渡す（手番が自動で回る `passed` の続きも同じ）。`positionKey` は `map`/`filter`/`join` の重ねをやめ、1回の繰り返しで文字列をつなぐ。`search.ts` と `cardCandidates` の `applyActionUnchecked` に `{ quiet: true }`

- [ ] **Step 4: 通るのを確かめる** — `npx vitest run` 全部 PASS

- [ ] **Step 5: もう一度測る** — `node --cpu-prof` で強い同士30手（測り方は下の「測り方」）を取り直し、上位5つを結果の欄に書く。`bench.ts -- strong` も「課題5のあと」に記録。**1秒あたりの局面数が前の3倍に届いていなければ**、上位の関数を見て、同じ形（答えを変えない・突き合わせのテストを先に書く）の課題を1つ足してから Task 6 へ進む

- [ ] **Step 6: コミット** — 「読みの中では王手の知らせを作らない・局面のキーを軽く」

### Task 6: 序幕の読む量に上限を付けて仕上げる

**Files:**
- Modify: `src/ai/levels.ts`（`LEVELS` の3つに `maxNodes`）
- Test: `tests/ai/levels.test.ts`
- Modify: この手順書の結果の表

**Interfaces:**
- Consumes: `SearchOptions.maxNodes`（Task 1）、Task 1 Step 10 の「前」の数字

- [ ] **Step 1: テストを足す** — `LEVELS.weak/normal/strong.maxNodes` が数として決まっていること、weak ≤ normal ≤ strong

- [ ] **Step 2: 失敗を確かめる**

- [ ] **Step 3: 値を入れる** — 各強さの `maxNodes` は、Task 1 Step 10 で測った「前」の「1手の局面数の中央値」（切りのいい数に丸める）。コメントに「今の作りがパソコンで時間いっぱいに読む量。序幕の強さを今のまま保つための上限」と書く

- [ ] **Step 4: 通るのを確かめる** — `npx vitest run` 全部 PASS、`npm run typecheck` が通る

- [ ] **Step 5: 序幕の強さが変わっていないことを確かめる**
  - `bench.ts` を weak・normal・strong で走らせ、「読めた深さの数」が「前」とほぼ同じ（いちばん多い深さが同じ）こと、1手の時間が上限を超えないことを確かめて「あと」の列に書く
  - `node tools/arena/run.mjs pair:normal:strong 40 7 1 1`（考える時間は本番どおり。上限の局面数で止まるので1手1秒ほど・全部で15分ほど）→ `node tools/arena/summary.mjs tools/arena/out/pair-normal-strong-1.jsonl` で、強いの勝ちが計画8の数字（86〜95%）の幅に入ること。外れたら値を決め直す前にユーザーに数字を見せる
  - 読みは同じで速さだけ変わったので、上限の量まで読めば前と同じ手を選ぶ（答え合わせのテストが示す）。そのため「新しい強い 対 前の強い」は前の作りを残さず、この2つで確かめる（設計書6章の1行目の代わり）

- [ ] **Step 6: 大詰に使える速さを記録** — `maxNodes` を外した強い（時間3秒だけ）を `bench.ts` で測り、「上限なしの強い」の行に書く（何手先まで読めるようになったか）

- [ ] **Step 7: コミット** — 「序幕の読む量に上限を付け、速くなった数字を記録」

## 測り方

- 速さ：`npx vite-node tools/arena/bench.ts -- <強さ>`（パソコンのほかのアプリを閉じて、2回走らせて良い方）
- 時間の内訳：`tools/arena/` に強い同士で30手指す使い捨ての台本を置き、`node --cpu-prof --cpu-prof-dir=<作業用フォルダ> node_modules/vite-node/vite-node.mjs <台本>` → `.cpuprofile` を関数ごとの自分の時間で並べる。台本は測ったら消す

## 結果

| | 前 | 課題3のあと | 課題4のあと | 課題5のあと | あと（上限あり） |
|---|---|---|---|---|---|
| 強い：1秒あたりの局面数 | 17,700 | | | | |
| 強い：読めた深さ（多い順） | 4手16・5手13・3手4・1手1 | | | | |
| 強い：1手の局面数の中央値 | 52,336（いちばん長い 3001ms） | | | | |
| ふつう：1手の局面数の中央値 | 2,332（3手32・2手1・1手1、いちばん長い 1001ms） | | | | |
| 弱い：1手の局面数の中央値 | 69（1手32・0手2） | | | | |
| 上限なしの強い：読めた深さ | — | — | — | — | |
