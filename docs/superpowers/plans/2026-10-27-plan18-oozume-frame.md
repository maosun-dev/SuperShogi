# 計画18 大詰の画面と3人の枠 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 強さ選びを「序幕｜大詰｜稽古」にし、鬼・師範・傾奇者の3人を選んで対局できるようにする（名前・札・戦績・稽古・札見せ・結果画面まで）。

**Architecture:** `Level` の種類を6つに広げ、強さの名前・確かめ（`isLevel`）・札の決め方（決まった札か、札の範囲からくじ）を `src/ai/levels.ts` と `src/app/keiko.ts` の1か所に集める。画面ごとに書かれていた「weak/normal/strong のどれか」の確かめは `isLevel` に置き換える。強さ選びの画面は上に定式幕の切り替え、大詰の札は柄を札いっぱいに敷く。3人の読みの中身は、この計画では「速くなった読みを上限なしで、決めた秒数まで」。札の読みの深さ（計画19）・定跡と賢い見方（計画20）はあとで足す。

**Tech Stack:** TypeScript・vitest（happy-dom の画面テスト）・SVG

**Spec:** `docs/superpowers/specs/2026-10-27-oozume-levels-design.md`（2〜4章。7章の「2」）

## Global Constraints

- 3つのまとまり：**序幕**（弱い・ふつう・強い）・**大詰**（鬼・師範・傾奇者）・**稽古**。大詰は最初から全部選べる
- 序幕の3つは中身も見た目も今のまま
- 鬼のくじに入る札：落雷・押し返しの風・入れ替えの術・成り上がり・格落とし・呼び戻し・韋駄天・貫きの槍・天馬の蹄・重りの枷（id：rakurai・oshikaeshi・irekae・shoryu・kakuotoshi・yobimodoshi・idaten・tsuranuki・tenma・omori）。コスト10まで・同じ札は1枚
- 師範の札（コスト10）：鏡の結界・成り封じ・鋼の鎧・凍てつく床・退き陣の旗・押し返しの風（kagami・narifuuji・hagane・itetsuku・hikijin・oshikaeshi）
- 傾奇者の札：全18枚からくじ
- 考える時間：鬼3秒・師範4秒・傾奇者5秒
- 戦績は3人それぞれに数える。稽古は戦績に数えない（今どおり）
- 目安の文（仮）：鬼「札は毎局くじ・札で暴れる」、師範「定跡で堅く」、傾奇者「最後の相手」
- 大詰の札の柄は札いっぱい：鬼＝紅と金の鱗文様に隈取の紅の払い、師範＝藍の地に金の亀甲と白い花菱・右に白菊の丸紋、傾奇者＝黒の振袖（金の流水・紅の雲取りに金の青海波・牡丹・金の菊・紅白の桜）。アイコンの紅の振袖とは別の柄。画像は使わず SVG で手で描いた形を並べる。色は palette の名前付きの色
- 板・グラデーションでの飾り・光・影付きの縁取り文字・丸バッジは使わない（ユーザーの好み）。字を柄の上で読ませる影は可
- 画面の確かめは iPhone の大きさ（393×709）
- コメント・コミットは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 画面・見た目の課題は、手を付ける前に frontend-design スキルを読む

## Review Focus

1. 前の版で保存された値（戦績・稽古の強さ・幕の選択が無い・壊れている）：読めない値は今までどおり既定に戻り、落ちない → 課題1・3のテスト
2. 鬼・傾奇者のくじが、コスト10・同じ札1枚の決まりを破らない（何度引いても）→ 課題1のテスト（種を変えて200回）
3. 友と対局は強さを使わない：`level` を受け取る画面に友と対局から来ても、今までどおり動く → 課題4のテスト
4. 稽古で大詰の強さを選んで戻ってきたとき、強さ選びの幕・稽古の札の表示が壊れない → 課題3・4のテスト
5. 傾奇者は5秒考える：CPU の見張り（`client.ts` の時間切れ = 考える時間＋3秒）に引っかからない → 課題1のテスト

---

### Task 1: 強さを6つに広げ、名前・確かめ・札の決め方を1か所に

**Files:**
- Modify: `src/ai/levels.ts`、`src/app/deck.ts`（`autoDeck` に札の範囲）、`src/app/keiko.ts`、`src/app/outcome.ts`、`src/app/storage.ts`、`src/view/hud.ts`、`src/app/dev.ts`、`src/app/screens/{deck,reveal,result,match}.ts`
- Test: `tests/ai/levels.test.ts`、`tests/app/keiko.test.ts`、`tests/app/storage.test.ts`、`tests/app/outcome.test.ts`、`tests/ai/client.test.ts`

**Interfaces:**
- Produces: `type Level = 'weak' | 'normal' | 'strong' | 'oni' | 'shihan' | 'kabuki'`
- Produces: `LEVEL_IDS: readonly Level[]`（序幕の3つ→大詰の3つの順）、`JOMAKU: readonly Level[]`、`OOZUME: readonly Level[]`、`isLevel(v: unknown): v is Level`（`src/ai/levels.ts`）
- Produces: `LevelConfig.kuji?: CardId[] | 'all'` — あれば `deck` の代わりに、札見せのたびにこの範囲からくじで組む（`'all'` は全18枚）。`deck` は決まった札（くじの強さでは空）
- Produces: `autoDeck(rng: () => number, pool?: CardId[]): CardId[]`（`src/app/deck.ts`。pool を省くと全18枚＝今と同じ答え）
- Produces: `drawFoeDeck(level, keiko, rng)` は、稽古でなく `LEVELS[level].kuji` があるときそのくじ
- Produces: `LEVEL_NAME` に `oni: '鬼', shihan: '師範', kabuki: '傾奇者'`。`hud.ts` の `LEVEL_LABEL` はやめて `LEVEL_NAME` を使う

- [ ] **Step 1: テストを書く**
  - `isLevel`：6つの id は true、`'hard'`・`undefined`・`3` は false。`LEVEL_IDS` は `['weak','normal','strong','oni','shihan','kabuki']`
  - `LEVELS.oni/shihan/kabuki`：`timeLimitMs` が 3000・4000・5000。`maxNodes` は無い。師範の `deck` が上の6枚で `validateDeck` を通る。鬼の `kuji` が上の10枚、傾奇者は `'all'`
  - `drawFoeDeck('oni', undefined, makeRng(seed))` を種 1〜200 で：どれも `validateDeck` が null、どの札も鬼の範囲の中、200回のうち2種類以上の組が出る。傾奇者も同じく（範囲は全18枚）。師範は毎回6枚そのまま
  - `autoDeck(makeRng(7))` が pool を渡さない前と同じ答え（今の `tests/app/deck.test.ts` が通ること）
  - 戦績：`saveTally`/`loadTally` が `'kabuki'` でも往復する。保存に知らない強さの鍵があっても読み込める
  - 稽古：`keikoOf({ level: 'shihan', deck: 'kuji' })` が通る。`foeLabel('oni')` が `'鬼'`、`foeLabel('kabuki', { level: 'kabuki', deck: 'kuji' })` が `'稽古・傾奇者'`
  - `client.ts`：傾奇者の時間切れの見張りが 8000ms（5000＋3000）

- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/ai/levels.test.ts tests/app` が新しいテストで落ちる

- [ ] **Step 3: 書く** — 3人の `LevelConfig`：`maxDepth: 8, qDepth: 6, cardPlies: 2, cardWidth: 8, noise: 4, blunder: 0`、上の時間・札。画面ごとの `=== 'normal' || === 'strong'` の確かめを `isLevel(x) ? x : 'weak'` に置き換える（deck・reveal・result・match・dev・keiko・storage）

- [ ] **Step 4: 通るのを確かめる** — `npx vitest run` 全部・`npm run typecheck`

- [ ] **Step 5: コミット** — 「強さを6つに（鬼・師範・傾奇者の札と考える時間）」

### Task 2: 衡山の字を足す

**Files:**
- Modify: `src/app/kouzanGlyphs.ts`（字を足す）
- Test: `tests/app/fonts.test.ts` か新しい `tests/app/kouzanGlyphs.test.ts`

**Interfaces:**
- Produces: `KOUZAN_GLYPHS` に 序・幕・大・詰・鬼・師・範・傾・奇・者（すでにある字は足さない）

- [ ] **Step 1: テスト** — `'序幕大詰鬼師範傾奇者'` の各字が `KOUZAN_GLYPHS` にある
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 取り出す** — `node tools/title/glyphs.mjs tools/title/fonts/kouzant.ttf "序幕大詰鬼師範傾奇者"` の出力を、今の並びと同じ形（`'字': { advance, d }`）で足す。ファイルの頭の字数と作り直しのコマンドの説明も直す。「傾」は題字（titleGlyphs）の詰めた形ではなく、フォントそのままの形
- [ ] **Step 4: 通るのを確かめる**
- [ ] **Step 5: コミット** — 「衡山の字に 序幕・大詰・鬼・師範・傾奇者 を足す」

### Task 3: 強さ選びの画面（定式幕の切り替えと大詰の柄）

**Files:**
- Modify: `src/app/screens/level.ts`、`src/app/style.css`（強さ選び）、`src/app/storage.ts`（幕の選択の保存）
- Create: `src/app/screens/oozumeGara.ts`（3人の柄の SVG）
- Test: `tests/app/screens.test.ts`（か新しい `tests/app/levelScreen.test.ts`）、`tests/app/storage.test.ts`

**Interfaces:**
- Consumes: `JOMAKU`・`OOZUME`・`LEVEL_NAME`（Task 1）、衡山の字（Task 2）
- Produces: `type LevelAct = 'jo' | 'oo'`、`loadLevelAct(st): LevelAct`（読めない・無いときは `'jo'`）、`saveLevelAct(st, act)`。鍵 `superShogi.levelAct` を `SAVE_KEYS` に足す
- Produces: `oozumeGara(level: 'oni' | 'shihan' | 'kabuki'): string` — 札の後ろに敷く SVG（定数だけでできた文字列。`viewBox` は横長、`preserveAspectRatio="xMaxYMid slice"`）

- [ ] **Step 1: テスト**
  - 画面を出すと、幕の切り替えに「序幕」「大詰」の2つ（`role="tab"`、選んでいる方が `aria-selected="true"`）、札が3枚と稽古の札
  - 保存が無ければ序幕（弱い・ふつう・強い）。「大詰」を押すと札が鬼・師範・傾奇者に替わり、`loadLevelAct` が `'oo'` になる。もう一度画面を出すと大詰のまま
  - 大詰の札を押すと、その強さで札選び（`deck`）へ（今の序幕と同じ流れ）
  - 大詰の札にはその強さの戦績と目安の文
  - `loadLevelAct` は壊れた値・無い値で `'jo'`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 書く**（frontend-design を読んでから）
  - 切り替えは上の帯：定式幕（黒・柿・萌葱の縦縞）を選んだ方に敷き、字は衡山で胡粉。下に小さく「はじめての方に」「将棋を指せる方に」
  - 大詰の札：今の `.level-fuda` と同じ並び（名前・戦績・札・目安）。地は `oozumeGara` の SVG を札いっぱいに敷き、名前は衡山の字（傾奇者は金・ほかは胡粉）、文字に影
  - 鬼・傾奇者の札の欄は、くじの札の裏を1枚（稽古のくじと同じ `kujiBacksHtml`）。師範は6枚の小さな札
  - 柄の中身は Global Constraints のとおり。見本 `.superpowers/brainstorm/1716-1793027609/content/oozume-gara-v2.html` を下敷きに描き直す（形は仮だったので、亀甲は正しい六角形の格子に）
- [ ] **Step 4: 通るのを確かめる** — テスト・型。ブラウザ（393×709）で序幕⇔大詰・柄の見え方・字の読みやすさ・稽古の札が隠れないことを目で見る
- [ ] **Step 5: コミット** — 「強さ選びを 序幕｜大詰 の切り替えに・大詰の3人の札」

### Task 4: 稽古・札見せ・対局・結果での3人

**Files:**
- Modify: `src/app/screens/deck.ts`（稽古の強さの切り替え）、`src/app/style.css`
- Test: `tests/app/screens.test.ts`・`tests/app/keiko.test.ts`

**Interfaces:**
- Consumes: Task 1 の全部

- [ ] **Step 1: テスト**
  - 稽古の札選び（`role: 'foe'`）の強さの切り替えが2段：上に序幕の3つ、下に大詰の3つ。大詰の強さを押して「次へ」で、保存された稽古の強さがそれになる
  - 札見せ：鬼の対局は相手の札が鬼の範囲の札（くじ）、師範は6枚
  - 結果画面：相手の名前が「鬼」「師範」「傾奇者」。勝てばその強さの戦績が1増える
  - 対局の上の帯：相手の名前が「CPU・鬼」など今と同じ形
  - 友と対局から来た `level` の無い・おかしい値でも、札選び・札見せ・結果が今までどおり出る
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 書く** — 2段の切り替えは今の `.seg` を2行に（大詰の行は少し濃い地）。目安：393px で6つが切れずに読める
- [ ] **Step 4: 通るのを確かめる** — `npx vitest run` 全部・`npm run typecheck`・`npm run build`。ブラウザ（393×709）で、大詰の鬼と1局（投了まで）・結果画面・戦績、稽古で師範を選ぶ流れを目で見る
- [ ] **Step 5: コミット** — 「稽古・札見せ・結果に鬼・師範・傾奇者」

## 確かめ方

- ブラウザ：`.claude/launch.json` の `dev`。393×709 に合わせる。画面が隠れていると演出が止まるので、押したあとに screenshot を挟む
- CPU の速さ：傾奇者の1手が 5秒＋少しを超えないことを `tools/arena/bench.ts -- kabuki` で見る（上限なし）
