# パソコン向けの広い画面 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 横幅 900px 以上の横長の画面だけ、対局を3列（相手｜盤｜自分）にし、札選び・札図鑑を広げ、マウスの操作（右クリック・乗せて説明・指のカーソル）を足す。

**Architecture:** 並べ方は CSS のメディアクエリだけで切り替え、部品（`view/hud.ts` の要素）の作りは変えない。`#app` の幅の上限（430px）は `:has()` で、対局・札選び・図鑑のときだけ外す。マウスの操作は `hud.ts`（乗せて説明）と `screens/match.ts`（右クリック）に少し足す。

**Tech Stack:** TypeScript・Vite・Three.js・素の CSS（`src/app/style.css`）・vitest（Node で動く。DOM のテストは無い）

**Spec:** `docs/superpowers/specs/2026-10-25-wide-screen-design.md`

## Global Constraints

- 広い画面の条件は `@media (min-width: 900px) and (min-aspect-ratio: 5/4)` の1つだけ。CSS の中で同じ条件を何度書いてもよいが、値は変えない
- スマホ・iPhone アプリ（広い画面でない）の見た目は1px も変えない。広い画面用の規則はすべて上のメディアクエリの中に書く
- 例外はマウスの操作（右クリック・乗せて説明・カーソル）で、これは画面の広さに関係なく、マウスのときだけ働く
- コメント・コミットメッセージは日本語。CSS のコメントは今の style.css と同じく、何のためかを1〜2行で
- 新しい依存は足さない

## Review Focus

- 対局中に窓の大きさを広い↔狭いと変えたとき：盤が新しい入れ物の大きさで描き直される（`stage.ts` は大きさの変化を見て `setSize` する作りのはず。Task 1 の確かめで窓を変えて見る）
- 手札が5枚以上・持ち駒が7種類のとき：右の列・左の列からはみ出さず、列の中でスクロールできる（Task 1 で `?fx=equips` など札の多い局面でも見る）
- 説明を「押して」開いている最中に別の札へマウスを乗せたとき：押して開いた説明（使うボタン付き）が乗せた札の説明に上書きされない（Task 3 の `peekAllowed` のテスト）
- 右クリックを、投了の確かめ・残り札の一覧・決着の演出の最中にしたとき：何も壊れず、ブラウザのメニューも出ない（Task 3 で確かめる）
- 900px ちょうど・縦長のパソコンの窓（例 1000×1200）のとき：縦長なら今の1列のまま（Task 4 で確かめる）

---

### Task 1: 対局画面の3列

**Files:**
- Modify: `src/app/style.css`（対局画面の節の最後、`/* 相手の残り札 */` の前に広い画面用の規則をまとめて足す。`#app` の規則の近くに幅の上限を外す規則を足す）
- Create（一時・コミットしない）: スクラッチの `layout-rects.mjs`（下の Step 1）

**Interfaces:**
- Consumes: `hud.ts` が作る要素。`.match` の直下に `header.side.foe`（`.row` と `.komadai.foe`）、`.board-area`（中に `.stage-host`）、`footer.mine-area`（中に `.detail`・`.side.me`・`.hand`・`.prompt`）、`.rest`
- Produces: 広い画面の対局画面の並べ方（Task 3 の「乗せて説明」は、広い画面では右の列の `.detail` に出る）

- [ ] **Step 1: 直す前のスマホの配置を記録する**

`tools/shots/appstore-shots.mjs` と同じ CDP の作りで、スクラッチに `layout-rects.mjs` を作る。開発サーバー（5173）を 393×852・DPR 1 で開き、`?fx=equips`（対局）・タイトルから「札図鑑」・「対局」→強さ選び→札選び の3つの画面で、`#app` の中の全要素の `getBoundingClientRect()` を（要素の道筋＋四角の4つの数、小数は丸める）JSON に書き出す。
Run: `node <scratch>/layout-rects.mjs <scratch>/before.json`
Expected: 3画面分の JSON ができる

- [ ] **Step 2: `#app` の幅の上限を、広い画面の対局のときだけ外す**

`@media (min-width: 900px) and (min-aspect-ratio: 5/4) { #app:has(> .match) { max-width: none; } }`

- [ ] **Step 3: 3列の並べ方を書く（同じメディアクエリの中）**

決めてある値：
- `.match` を grid に：列は `200px minmax(0, 1fr) 280px`、行は1つ（高さいっぱい）。`.side.foe` は1列目、`.board-area` は2列目、`.mine-area` は3列目
- 左の列：`.side.foe` を縦の flex に。`.row` は折り返して名前・伏せ札・残り札を縦に並べてよい。`.komadai.foe` は `height: auto`・縦方向に折り返し、はみ出たら列の中で縦にスクロール
- 右の列：`.mine-area` を縦の flex に。順番は `.side.me`（`order: 1`）→ `.hand`（`order: 2`）→ `.detail`（`order: 3`）。`.komadai.me` も `height: auto` で折り返す
- 手札：`.hand` を `grid-template-columns: repeat(2, max-content)` の2列・中央寄せ、札は `--s: 1.15`。はみ出たら `.hand` の中で縦にスクロール
- 説明：`.detail` は `position: static`（手札の下に流す）、`left/right/bottom` を外し、影は弱めてよい
- 短冊（`.prompt`）：`.mine-area` を `position: static` にして、短冊の基準を `.match` にする。`top: auto; bottom: 18px; left: calc(200px + (100% - 480px) / 2)`（盤の列の真ん中の下）。`.mine-area` の `z-index: 3` は `.detail`・`.hand` 側に移して、重なり順を保つ
- 盤の列に枠や地の色は付けない（舞台の背景が見えるまま）

- [ ] **Step 4: ブラウザで確かめる（1280×800・1920×1080・900×700）**

`npm run dev` を preview で開き、各大きさで `?fx=equips` と、普通の対局（強さ選び→札選び→対局へ）を見る。
Expected: 盤が真ん中で縦いっぱい、相手は左・自分は右、手札は2列。駒を動かす・持ち駒を打つ・札を押して説明→使う、ができる。窓を 1280→600 幅に変えると1列に戻り、盤も描き直される

- [ ] **Step 5: スマホの配置が変わっていないことを確かめる**

Run: `node <scratch>/layout-rects.mjs <scratch>/after.json` のあと、before.json と after.json を比べる（`diff` かスクラッチの比べる一行）
Expected: 違いなし（アニメーションで動く要素が混じるなら、その要素だけを除いて違いなし）

- [ ] **Step 6: コミット**

```bash
git add src/app/style.css
git commit -m "広い画面では対局を3列に（相手｜盤｜自分）"
```

### Task 2: 札選び・札図鑑を広げる

**Files:**
- Modify: `src/app/style.css`（カード選び・図鑑の節の近く、Task 1 と同じメディアクエリ）

**Interfaces:**
- Consumes: 札選びの入れ物 `.page.deckb`（`.rows` の中に `.row`、札は `.pick .card`）、図鑑の入れ物 `.zukan`（`.row` は6列の grid）
- Produces: なし

- [ ] **Step 1: 幅の上限を外す**

広い画面のとき `#app:has(> .deckb), #app:has(> .zukan) { max-width: 820px; }`

- [ ] **Step 2: 札を大きく、一列に多く**

- 図鑑：`.zukan .row .card { --s: 1; }`（6列の grid はそのまま）
- 札選び：`.deckb .row` を `flex-wrap: wrap; justify-content: center; overflow-x: visible;`、`.deckb .pick .card { --s: .95; }`。下の「持ち込む札」の帯と「対局へ」は今のまま

- [ ] **Step 3: ブラウザで確かめる（1280×800・900×700）**

Expected: 図鑑の18枚と札選びの一覧が、横スクロールなしで見える（縦は画面に収まらなければ今と同じく縦スクロール）。札を押すと大きな札と説明が出て、「入れる」「抜く」ができる

- [ ] **Step 4: スマホの配置が変わっていないことを確かめる**

Task 1 Step 5 と同じ比べ方。Expected: 違いなし

- [ ] **Step 5: コミット**

```bash
git add src/app/style.css
git commit -m "広い画面では札選び・札図鑑を広げて札を大きく"
```

### Task 3: マウスの操作（右クリック・乗せて説明・指のカーソル）

**Files:**
- Modify: `src/view/hud.ts`（`peekAllowed` を足して export、`handCards` の札に乗せたときの処理、説明の「のぞき見」の出し方）
- Modify: `src/app/screens/match.ts:257-270`（取り消しを1つの関数にまとめ、右クリックでも呼ぶ）
- Modify: `src/app/style.css`（`.detail.peek` とカーソル）
- Test: `tests/view/hud-peek.test.ts`

**Interfaces:**
- Produces: `export function peekAllowed(pointerType: string, detailOpen: boolean, peeking: boolean): boolean` — マウスのときだけ、説明が閉じているか「のぞき見」中なら true

- [ ] **Step 1: 失敗するテストを書く**

```ts
// tests/view/hud-peek.test.ts
import { describe, expect, it } from 'vitest';
import { peekAllowed } from '../../src/view/hud';

describe('peekAllowed', () => {
  it('マウスで説明が閉じていれば、のぞき見できる', () => {
    expect(peekAllowed('mouse', false, false)).toBe(true);
  });
  it('のぞき見の最中なら、別の札に乗せ替えられる', () => {
    expect(peekAllowed('mouse', true, true)).toBe(true);
  });
  it('押して開いた説明は、乗せただけでは上書きしない', () => {
    expect(peekAllowed('mouse', true, false)).toBe(false);
  });
  it('指やペンでは、のぞき見しない', () => {
    expect(peekAllowed('touch', false, false)).toBe(false);
    expect(peekAllowed('pen', false, false)).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗するのを見る**

Run: `npx vitest run tests/view/hud-peek.test.ts`
Expected: FAIL（`peekAllowed` が無い）

- [ ] **Step 3: `peekAllowed` と「のぞき見」を `hud.ts` に足す**

- `peekAllowed` を上の形で export
- `handCards` の各札に `pointerenter`（`peekAllowed(e.pointerType, !detail.hidden, peeking)` のときだけ）で説明に名前・種類とコスト・文を出し、`detail` に `peek` の印を付ける。選択（`sel`）は変えず、フォーカスも動かさない。`pointerleave` で、のぞき見中なら閉じる
- `showDetail`（押したとき）は `peek` の印を外して今まで通りに開く。`hideDetail` は `peek` の印も外す
- 説明の中身を詰める処理は `showDetail` と共通にする（名前・種類・コスト・文を入れる小さな関数）

- [ ] **Step 4: テストが通るのを見る**

Run: `npx vitest run tests/view/hud-peek.test.ts`
Expected: PASS

- [ ] **Step 5: 右クリックで取り消す（`match.ts`）**

`onKey` の中身を `const cancelSel = (): void => { hud.hideDetail(); dispatch({ type: 'cancel' }); };` にまとめ、Esc と、`box` の `contextmenu`（`e.preventDefault()` してから `cancelSel()`）の両方から呼ぶ。片付け（`cleanup`）に `contextmenu` の取り外しも足す

- [ ] **Step 6: CSS**

- `.match .detail.peek .dbtns, .match .detail.peek .dnote { display: none; }`（のぞき見ではボタンと注意書きを出さない）
- `.match .stage-host { cursor: pointer; }`、`.match.locked .stage-host { cursor: default; }`。手札の札は `cursor: pointer`（今が違えば）

- [ ] **Step 7: ブラウザで確かめる（1280×800 と 393×852 のマウス）**

Expected: 手札に乗せると説明が出て、離すと消える。押すと「使う」付きで開き、そのあと別の札に乗せても上書きされない。右クリックで駒・札の選択が外れ、メニューは出ない。投了の確かめ・残り札の一覧・決着の演出の最中に右クリックしても何も壊れない

- [ ] **Step 8: テスト全部と型**

Run: `npm run typecheck && npx vitest run`
Expected: すべて通る

- [ ] **Step 9: コミット**

```bash
git add src/view/hud.ts src/app/screens/match.ts src/app/style.css tests/view/hud-peek.test.ts
git commit -m "マウスの操作：右クリックで取り消し・手札に乗せて説明・盤の上で指のカーソル"
```

### Task 4: 通しの確かめとブラウザ版への反映

**Files:**
- なし（`npm run web` が `../maosun-dev.github.io/kabukishogi/` を書き換える）

- [ ] **Step 1: 通しで遊ぶ**

`npm run dev` で 1280×800・1920×1080・900×700・1000×1200（縦長）と 393×852 を順に見る。各大きさで：対局を数手指す・札を1枚使う・忍札を伏せる・投了→結果→もう一度、札選び・札図鑑。
Expected: 1000×1200 と 393×852 は今の1列。ほかは広い並べ方。どれも崩れ・はみ出しなし

- [ ] **Step 2: スマホの配置の最終の比べ**

Task 1 Step 5 と同じ。Expected: 違いなし

- [ ] **Step 3: ブラウザ版に写す**

Run: `npm run web`
Expected: 組み立てが通り「写しました」と出る。サイトのリポジトリで `kabukishogi/` が変わっている

- [ ] **Step 4: サイトに置いた形で確かめる**

preview の `site`（8123）で `/kabukishogi/` を 1280×800 で開き、対局が3列で出る・エラーなし

- [ ] **Step 5: コミット（push はユーザーに確かめてから）**

```bash
cd ../maosun-dev.github.io
git add -A kabukishogi
git commit -m "傾将棋のブラウザ版を更新（パソコンの広い画面）"
```
