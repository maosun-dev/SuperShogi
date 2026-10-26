# 計画19 鬼の札の読み 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鬼（と傾奇者）が、札の使いどころを3手先まで読み、候補も広く見て、札で暴れる相手になる。鬼は強いに7割以上勝つ。

**Architecture:** 読みの仕組みはそのまま。札を候補に入れる深さ（`cardPlies`）と数（`cardWidth`）、1枚の札から残す候補の数（今は定数 `CARD_CANDIDATES_PER_CARD = 3`）を強さごとの設定にして、鬼・傾奇者だけ広げる。札を出し惜しむ判断は、今の点数づけ（使っていない札はコスト×80点）がすでに持っている。CPU 同士の対局の道具が、くじの強さ（鬼・傾奇者）の札をくじで組めるようにして、数字で決める。

**Tech Stack:** TypeScript・vitest・vite-node（tools/arena）

**Spec:** `docs/superpowers/specs/2026-10-27-oozume-levels-design.md`（4章の表「札の読み：深く広く（根から3手目まで札を候補に入れ、候補の数も増やす）」、6章「鬼 対 強い：鬼が7割以上」）

## Global Constraints

- 序幕の3つの答えは変えない（答え合わせのテスト `tests/ai/golden.test.ts` が通ったまま）
- 鬼の考える時間は3秒のまま。1手のいちばん長い時間が 3秒＋少し を超えない
- コメント・コミットは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. 札を広く読むと深さが浅くなり、かえって弱くなることがある → 対局の数字（課題2）で、広げた設定と広げない設定を比べて決める
2. 1枚の札の候補の数を変えても、序幕（既定の3）の答えは同じ → 答え合わせのテスト
3. くじの強さの対局で札が空にならない → 課題2の道具のテスト

---

### Task 1: 1枚の札から残す候補の数を設定に

**Files:**
- Modify: `src/ai/search.ts`（`SearchOptions.cardPerCard?: number`、`cardCandidates(s, actions, cardWidth, perCard = CARD_CANDIDATES_PER_CARD)`）
- Test: `tests/ai/search.test.ts`

- [ ] **Step 1: テスト** — 同じ札の候補が4つ以上ある局面（例：落雷を持ち、相手の駒が5つ以上）で、`cardCandidates(s, acts, 12)` はその札から3つ、`cardCandidates(s, acts, 12, 5)` は5つ返す
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 書く** — `search` は `opts.cardPerCard ?? CARD_CANDIDATES_PER_CARD` を渡す
- [ ] **Step 4: 通るのを確かめる** — `npx vitest run tests/ai`（答え合わせを含む）
- [ ] **Step 5: コミット** — 「札の候補の数を強さごとに決められるように」

### Task 2: 対局の道具でくじの強さを戦わせ、鬼の設定を決める

**Files:**
- Modify: `tools/arena/arena.ts`（くじの強さの札は `autoDeck(rand, 範囲)` で組む）、`src/ai/levels.ts`（鬼・傾奇者の札の読み）
- Test: `tests/tools/`（arena の札の組み方。既存の tests/tools にならう）

- [ ] **Step 1: テスト** — arena の組み方の関数（`deckFor(level, rand)` を export）が、鬼なら鬼の範囲からコスト10以内、傾奇者は全18枚から、強いは決まった4枚
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 書く**
- [ ] **Step 4: 数字で決める** — `node tools/arena/run.mjs pair:oni:strong 28 7 1 1` を、鬼の設定 A（今：cardPlies 2・cardWidth 8・cardPerCard 3）と B（cardPlies 3・cardWidth 12・cardPerCard 4）で走らせ、鬼の勝率の高い方を採る。どちらも7割に届かなければ、B を基に cardPlies 3・cardWidth 10・cardPerCard 3 も試す。結果を下の表に書く
- [ ] **Step 5: 傾奇者にも同じ札の読みを入れる**（設計書の表「鬼と同じ」）
- [ ] **Step 6: コミット** — 「鬼・傾奇者の札の読みを深く広く（数字で決めた）」

## 結果

| 鬼の設定 | 鬼 対 強い（鬼の勝ち） | 鬼の1手の平均・最大 |
|---|---|---|
| A 今のまま | | |
| B 深く広く | | |
