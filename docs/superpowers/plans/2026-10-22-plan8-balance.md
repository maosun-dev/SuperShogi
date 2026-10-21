# 計画8 強さの調整 作業手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** CPU 同士を数百局戦わせ、強さの段階と札の強さを数字で確かめて直す。

**Architecture:** `tools/arena/arena.ts`（1組ぶんの対局を指して1局1行の JSON を書く）を `tools/arena/run.mjs` が7組同時に走らせ、`tools/arena/summary.mjs` が数える。CPU はアプリと同じ `chooseCpuAction` を使い、考える時間だけ短くする（`timeScale`、ふつう 0.1）。

**Spec:** `docs/superpowers/specs/2026-10-21-cards-cpu-handicap-design.md` の1章「うまくいった状態」と8章

## Global Constraints

- 目標：つよい→ふつう 8割以上、ふつう→よわい 8割以上、引き分け5%未満、どの札も入れた側の勝率 42〜58%
- 道具はアプリに入れない（`tools/` に置き、記録 `tools/arena/out/` は git に入れない）
- 時間を短くした対局で数えるので、強さの差はアプリより小さく出る見込み（つよいの読みが浅くなるため）

## Review Focus

1. 千日手の引き分けが多い → 読みの中で前の局面へ戻るのを損とする（計画7の追加で入れた）
2. 時間を短くしたことで、つよいとふつうの差が縮む → 差が出ないときは timeScale を上げて確かめ直す
3. 札の勝率は持ち込みがでたらめなので揺れる。1枚あたり100局以上で見る

---

### Task 1: 戦わせる道具
- [x] `arena.ts`・`run.mjs`・`summary.mjs` を作り、7局で動くのを見る

### Task 2: 強さの段階を数える
- [ ] `node tools/arena/run.mjs levels 105 7 2 0.1` → `node tools/arena/summary.mjs tools/arena/out/levels-2.jsonl`
- [ ] 目標に届かない組があれば、深さ・ゆらぎ・でたらめの割合・持ち込みを直して数え直す

### Task 3: 札ごとの勝率を数える
- [ ] `node tools/arena/run.mjs cards 420 7 3 0.1`（ふつう同士・でたらめな持ち込み）
- [ ] 勝率が 42〜58% を外れる札のコストか効果を直す。まず見るのは入れ替えの術・韋駄天・貫きの槍
- [ ] 直したらテストを合わせ、数え直す

### Task 4: 持ち込みを決め直す
- [ ] 数字を見て、よわい＝わかりやすい札、ふつう＝攻めと守りを1枚ずつ、つよい＝組み合わせを考えた札、に決め直す
