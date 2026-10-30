# 配信向けの広い対局画面 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** パソコンの横長の画面で、対局を「左：相手と自分の帯｜まん中：盤｜右：札の説明と手札」の3列にし、相手が使った札の説明も右上に出す。

**Architecture:** 部品（`view/hud.ts`）の並びはほぼそのまま、広い画面のときだけ CSS の grid で置き場所を変える。右上の「札の説明の場所」は新しい小さな部品（`view/cardPanel.ts`）で、空・相手の札を出す。自分の札の説明は今の説明の板（`.detail`）を同じ場所に重ねて出す。

**Tech Stack:** TypeScript・Vite・Three.js・vitest（DOM は既存の view テストと同じ環境）

**Spec:** `docs/superpowers/specs/2026-10-31-wide-match-design.md`

## Global Constraints

- 広い画面の条件はどこでも同じ：`@media (min-width: 900px) and (min-aspect-ratio: 5/4)`
- スマホ・iPhone アプリ（広い画面でないとき）の見た目は 1px も変えない。新しい要素は広い画面でないとき `display: none`
- 変えるのは対局画面だけ。タイトル・札選び・図鑑・結果・エンディングなどは縦の列（`#app` の max-width 430px）のまま
- ルール・CPU・演出の中身は変えない（演出は位置の基準を直すだけ）
- 伏せただけの忍札の中身は出さない（`trapSet` は見ない）
- コメント・コミットメッセージは日本語

## Review Focus

- 相手が1手の中で札を使い、さらに罠も発動した：最後に表になった札を出す（Task 1 のテスト）
- 自分の罠が発動した（owner が自分）：相手の札として出さない（Task 1 のテスト）
- 相手の札を出している間に自分の札を押し、「やめる」で閉じた：相手の札には戻らず空の案内（Task 2 のテスト）
- 待った（友と対局）や投了で描き直した：右上が古い札のまま残っても害はないが、新しい対局では空から始まる（対局画面ごと作り直すので自然に満たす。Task 4 で目で確かめる）
- 窓を広い↔狭いと行き来した：狭い画面で説明の板が盤の上に戻り、広い画面で右上に戻る（Task 4 で確かめる）

---

### Task 1: 相手の札を拾う関数と、札の説明の場所の部品

**Files:**
- Create: `src/view/cardPanel.ts`
- Test: `tests/view/cardPanel.test.ts`

**Interfaces:**
- Produces:
  - `foeCardFrom(events: GameEvent[], me: Side): CardId | null` — 出来事のうち、相手の `cardUsed`（side が me でない）と相手の罠の `trapTriggered`（owner が me でない）を見て、最後のものの cardId。無ければ null
  - `createCardPanel(): CardPanel`
  - `interface CardPanel { root: HTMLElement; showFoe(id: CardId): void; clear(): void }` — root の class は `card-panel`。clear で「札を押すと説明が出ます」の案内だけにする（作った直後も clear の状態）。showFoe で「相手が使った札」の一言・札の絵（`cardHtml(id)`）・名前・`${KIND_MARK[kind].label}・コスト${cost}`・説明文を出し、root に札の種類の色の class（`KIND_MARK[kind].color`）を付ける

- [ ] **Step 1: 失敗するテストを書く**

`foeCardFrom`：
- 相手の `cardUsed`（rakurai）だけ → `'rakurai'`
- 自分の `cardUsed` だけ → `null`
- 相手の `trapSet`（cardId あり）だけ → `null`
- 相手の罠の `trapTriggered`（otoshiana）→ `'otoshiana'`、自分の罠の `trapTriggered` → `null`
- 相手の `cardUsed`（rakurai）のあと相手の罠の `trapTriggered`（kagami）→ `'kagami'`
- 空 → `null`

`createCardPanel`：
- 作った直後の `root.textContent` に「札を押すと説明が出ます」
- `showFoe('rakurai')` のあと、textContent に「相手が使った札」と `CARDS.rakurai.name` と `CARDS.rakurai.text`、root に `.card` の要素がある
- そのあと `clear()` で案内に戻り、`.card` が無い

- [ ] **Step 2: `npx vitest run tests/view/cardPanel.test.ts` で失敗を確かめる**（モジュールが無い）

- [ ] **Step 3: `src/view/cardPanel.ts` を書く**（hud.ts の `el` と同じ小さな作り方。cardHtml は定数だけでできた文字列なので innerHTML でよい）

- [ ] **Step 4: 同じコマンドで通るのを確かめる**

- [ ] **Step 5: コミット**「札の説明の場所の部品と、相手の札を拾う関数」

---

### Task 2: 対局の部品（hud）と対局画面に組み込む

**Files:**
- Modify: `src/view/hud.ts`（Hud の型・createHud・showDetail）
- Modify: `src/app/screens/match.ts:141-155`（presenter.present）
- Test: `tests/view/hud-panel.test.ts`

**Interfaces:**
- Consumes: Task 1 の `createCardPanel`・`foeCardFrom`
- Produces:
  - `Hud.showFoeCard(id: CardId): void` — 札の説明の場所に相手の札を出す
  - 説明の板（`.detail`）の頭に札の絵の要素 `.dart`（`cardHtml(id)`）。showDetail のたびに入れ替える
  - 札の説明の場所の要素は `root` の子（`foe, board, footer, rest` のあと）に置く

- [ ] **Step 1: 失敗するテストを書く**（`createHud(document.createElement('div'))` を作り、`render` に初期局面を渡す。局面の作り方は `tests/view/hud-arrive.test.ts` にならう）
  - `showFoeCard('rakurai')` のあと、root の `.card-panel` の textContent に `CARDS.rakurai.name`
  - その状態で自分の札の `showDetail(uid, true)` → `.card-panel` が案内に戻る（「札を押すと説明が出ます」）、`.detail .dart .card` がある
  - `hideDetail()` のあとも `.card-panel` は案内のまま（相手の札には戻らない）

- [ ] **Step 2: `npx vitest run tests/view/hud-panel.test.ts` で失敗を確かめる**

- [ ] **Step 3: hud.ts を直す**：createCardPanel を作って root に足す、`showFoeCard` を足す、showDetail で `panel.clear()` と `.dart` の入れ替え

- [ ] **Step 4: match.ts の presenter.present で、render のあとに `const foeCard = foeCardFrom(step.events, 'sente'); if (foeCard) hud.showFoeCard(foeCard);`**

- [ ] **Step 5: `npm test` と `npm run typecheck` が全部通るのを確かめる**

- [ ] **Step 6: コミット**「相手が使った札を札の説明の場所に出す」

---

### Task 3: 広い画面の並べ方（CSS）

**Files:**
- Modify: `src/app/style.css`（末尾に広い画面の区切りを足す。`.card-panel` と `.detail .dart` の「ふだんは出さない」もここに）

**Interfaces:**
- Consumes: Task 2 の `.card-panel`・`.detail .dart`、既存の `.side.foe`・`.board-area`・`.mine-area`（中に `.detail`・`.side.me`・`.hand`・`.prompt`）

ふだん（広い画面でない）：`.match .card-panel { display: none; }`、`.match .detail .dart { display: none; }`

広い画面の中身（数値は出発点。1280×720 と 1920×1080 で見て整える）：
- `#app:has(> .match) { max-width: none; }`
- `.match`：grid、列 `220px minmax(0, 1fr) 300px`、行 `auto minmax(0, 1fr) auto`、置き場所 `"foe board panel" ". board panel" "me board hand"`
- `.mine-area { display: contents; }` にして、中の `.side.me`→me、`.hand`→hand、`.detail`→panel に置く。`.card-panel`→panel。`.detail` は `.card-panel` の上に重ねる（z-index）。木の板の見た目は `.side.foe`・`.side.me`・`.hand`・`.card-panel` のそれぞれに付け直す（`.mine-area` の背景は display: contents で消えるため）
- `.detail` は `position: static`（ふだんは盤の上に浮かせている）。`.dart .card` は `--s: 1.6` くらいで大きく
- 手札は右の列の中で折り返して並べる（横スクロールにしない）、`--s: 1` のまま
- 持ち駒（`.komadai`）は左の列の幅で折り返す
- 短冊（`.prompt`）は `.match` を基準に、盤の列の下の端の真ん中へ（左右 220px・300px を除いた幅の中）
- 札の説明の場所の案内は控えめ（小さめの字・薄め）

- [ ] **Step 1: CSS を書く**

- [ ] **Step 2: スマホの幅が変わっていないことを確かめる**：直す前のコミットと直したあとで、393×852 と 360×740 の対局画面（`?fx=rakurai`）の `#app` の中の全要素の四角を書き出して比べ、違い 0。札を押して説明の板を出した状態でも比べる（前回 2026-10-25 と同じやり方）

- [ ] **Step 3: 広い画面（1280×720・1920×1080・900×700）で、盤が縦いっぱい・左に2つの帯・右に説明と手札が出るのを画面写真で確かめる**

- [ ] **Step 4: `npm run build` が通るのを確かめる**

- [ ] **Step 5: コミット**「広い画面では対局を3列に（帯｜盤｜札）」

---

### Task 4: 演出・エンディングの確かめと直し

**Files:**
- Modify（ずれが見つかったものだけ）：`src/fx/kit.ts`・`src/fx/cards/aiuchi.ts:17`・`src/fx/cards/yobimodoshi.ts:92` など、`hud.root` の四角を「盤の場所」の代わりに使っている所。直すときは `localRect(ctx, ctx.hud.board)`（盤の場所）を基準にする

確かめる場所：1280×720 と 1920×1080（必要なら 900×700）。アプリ内ブラウザは画面が隠れると描画が止まるので、画面を出したまま見る（だめなら画面なしの Chrome）

- [ ] **Step 1: 開発用の試し口を全部流す**：`?fx=` の札（全部の札）・`otoshiana`・`kagami`・`narifuuji`・`hagane-block`・`check`・`win`（`&king=tataki`・`iai`・`hanabi`・`oomie`）・`lose`・`draw`・`resign`・`itetsuku`・`aiuchi`・`migawari`・`kakuotoshi`・`omori-break`・`move`・`capture`・`promote`・`drop`・`otoshiana-drop`。札が飛ぶ元（手札）・見せる位置（盤の真ん中）・カットイン・筆文字・持ち駒が駒台へ飛ぶ先が、ずれていないか見る

- [ ] **Step 2: 相手が札を使ったとき**（`?fx=capture&cpu=...` などで CPU に札を使わせる。無理なら普通の対局で）右上に相手の札が出て、自分の札を押すと入れ替わる

- [ ] **Step 3: エンディング**：本番の傾奇者に勝つ流れ（王を取る → 大見得 → エンディング → 結果）を広い画面で通す。設定からの見返しも。舞台・回り舞台・札の役者・口上の紙がずれないか。エンディングの最中に窓を広い↔狭いに変えても崩れないか

- [ ] **Step 4: 対局の途中で窓を広い↔狭いと行き来して、説明の板・短冊・盤の大きさが崩れないか**

- [ ] **Step 5: 見つかったずれを直し、そのつど `npm test` を通してコミット**「広い画面で〇〇の演出の位置がずれるのを直す」

- [ ] **Step 6: 最後に `npm test`・`npm run build` が通るのを確かめる**
