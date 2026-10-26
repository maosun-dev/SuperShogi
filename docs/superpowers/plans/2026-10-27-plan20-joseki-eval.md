# 計画20 師範・傾奇者の定跡と局面の見方 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 師範と傾奇者が、序盤に定跡の形（囲いと攻めの形）を組み、局面を「駒の置き場所・囲い・王の逃げ道」まで見て指す。師範は鬼に、傾奇者は師範に6割以上勝つ。

**Architecture:**
- **定跡＝自分の駒の組み方の手順**（相手の手には合わせない）。手順の各手は「駒の種類・元のマス・行き先」。行き先にその駒がもう居れば済んだとみなし（手順が前後しても合う）、まだの手のうち今指せる最初の1手を「勧める手」にする。勧める手は読みの根で少しだけ点を足す（`SearchOptions.prefer`・`preferBonus`）だけで、読みが損と見れば指さない＝ただで駒を取られる手は指さない。手番40を過ぎたらやめる。
- 1局の中でどの定跡を使うかは、いちばん進んでいる手順を選び（同じなら種で決める）、最初の1手で決まったものがそのまま続く。
- **賢くした見方**は `evaluate` に足す3つの点（駒の置き場所・囲い・王の逃げ道）。強さの設定 `smartEval` が true のときだけ足す。序幕・鬼は今のまま（答え合わせのテストが守る）。

**Tech Stack:** TypeScript・vitest・vite-node（tools/arena）

**Spec:** `docs/superpowers/specs/2026-10-27-oozume-levels-design.md`（4章「定跡」「賢くした見方」、6章の表）

## Global Constraints

- 盤のマス：c は先手から見て左が0（＝9筋）、r は上が0（＝一段目）。将棋の「7六」は c = 9 − 7 = 2、r = 6 − 1 = 5。後手の手順は先手の手順を180度回す（c → 8 − c、r → 8 − r）
- 定跡は3本：居飛車・矢倉、居飛車・棒銀＋舟囲い、四間飛車＋美濃囲い
- 定跡を使うのは師範・傾奇者。手番（`ply`）40 を過ぎたら使わない
- 賢くした見方は師範・傾奇者だけ
- 序幕の3つと鬼の答えは変えない（答え合わせのテスト）
- コメント・コミットは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. 札で駒が動かされた・消えた・凍った・枷が付いた：勧める手が指せないときは次の手を探し、どれも指せなければ勧めない（落ちない）
2. 駒落ち・相手が先に指す：手順の元のマスに駒が無ければその手は飛ばす
3. 勧める手が実は損（駒をただで取られる）：読みの点が上回らなければ指さない → 課題2のテスト
4. 王がいない・王が手順と違う所にいる：見方の点が落ちずに出る
5. 定跡の手順そのものの誤り（行き先が埋まる・二重に動かす）：3本とも、平手の初期配置から CPU 抜きで手順どおり指して、全部合法に指せることをテストする

---

### Task 1: 定跡の手順と「勧める手」

**Files:**
- Create: `src/ai/joseki.ts`
- Test: `tests/ai/joseki.test.ts`

**Interfaces:**
- Produces: `JOSEKI: { name: string; steps: { kind: PieceKind; from: string; to: string }[] }[]`（マスは将棋の書き方 `'77'` = 7筋7段、先手の向き）
- Produces: `josekiMove(s: GameState, side: Side, seed: number): Action | null` — 手番40以下で、いちばん進んでいる定跡の「まだの手のうち今指せる最初の1手」（`legalActions` に入っている成らない移動）。無ければ null

- [ ] **Step 1: テスト**
  - 3本とも：平手の初期配置で、後手は動かず（後手の手番は手順に関係ない手、たとえば端の歩を動かす）、先手が `josekiMove` を順に指すと、手順の最後まで全部合法に指せて、そのあと null
  - 後手の側でも同じ（180度回した手順）
  - 1手指したあとは、同じ定跡が続く（種を変えても同じ）
  - 手番41以降は null
  - 手順の元のマスの駒が札で消えていたら、その手を飛ばして次の手
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 書く** — 手順は下のとおり（先手の向き）
  - 矢倉：76歩(77→76)・66歩(67→66)・68銀(79→68)・77銀(68→77)・78金(69→78)・58金(49→58)・67金(58→67)・69玉(59→69)・79玉(69→79)・26歩(27→26)・25歩(26→25)
  - 棒銀：26歩(27→26)・25歩(26→25)・76歩(77→76)・38銀(39→38)・27銀(38→27)・68玉(59→68)・78玉(68→78)・58金(49→58)・26銀(27→26)
  - 四間飛車：76歩(77→76)・66歩(67→66)・68飛(28→68)・48玉(59→48)・38玉(48→38)・28玉(38→28)・38銀(39→38)・58金(69→58)・16歩(17→16)・46歩(47→46)
- [ ] **Step 4: 通るのを確かめる**
- [ ] **Step 5: コミット** — 「定跡の手順と勧める手」

### Task 2: 読みの根で勧める手に少し点を足す

**Files:**
- Modify: `src/ai/search.ts`（`SearchOptions.prefer?: string`（行動のキー）・`preferBonus?: number`）、`src/ai/levels.ts`（`LevelConfig.joseki?: boolean`、`chooseCpuAction` が `josekiMove` を渡す）
- Test: `tests/ai/search.test.ts`、`tests/ai/levels.test.ts`

- [ ] **Step 1: テスト**
  - 初期配置で `prefer` に 7六歩 のキー・`preferBonus: 80` を渡すと 7六歩 を選ぶ（渡さなければ別の手でもよい）
  - 勧める手が駒をただで取られる手（例：飛車の前に出る手）なら、`preferBonus: 80` でも選ばない
  - `chooseCpuAction(初期配置, 'sente', 'shihan', 1)` が定跡の最初の手のどれか（76歩 か 26歩）
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 書く** — 根の候補の点（親から見た点）に、キーが `prefer` と同じなら `preferBonus` を足して比べる（返す点は足す前）。師範・傾奇者に `joseki: true`、`preferBonus` は 80（歩1枚＝100 より少し小さい）
- [ ] **Step 4: 通るのを確かめる** — `npx vitest run tests/ai`（答え合わせを含む）
- [ ] **Step 5: コミット** — 「師範・傾奇者は序盤に定跡を勧める手として指す」

### Task 3: 賢くした見方

**Files:**
- Modify: `src/ai/evaluate.ts`（`evaluate(s, side, smart = false)`・`positional(s, side)`）、`src/ai/search.ts`（`SearchOptions.smartEval?: boolean`、末端の点で使う）、`src/ai/levels.ts`（師範・傾奇者に `smartEval: true`）
- Test: `tests/ai/evaluate.test.ts`

**Interfaces:**
- Produces: `positional(s, side): number`（side から見た 自分−相手）。`evaluate(s, side, true) === evaluate(s, side) + positional(s, side)`

- [ ] **Step 1: テスト**
  - 王：自陣の奥（先手なら8・9段、後手は1・2段）で端寄りほど高い。王が中央の5段目に出た局面は、初期配置より低い
  - 囲い：王から2マス以内の自分の金・銀1枚につき点。金銀を王のそばに寄せた局面は高い
  - 逃げ道：王が動けるマスのうち、相手の利きが無く味方の駒も無いマスの数に点
  - 歩：前に出た歩に少し点（出すぎた歩には足さない＝敵陣の手前まで）
  - 王がいない盤でも落ちない
  - 初期配置で `positional` は 0（左右・先後が同じ形）
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 書く** — 点の大きさ（はじめの値。課題4の対局で直してよい）：王の位置 最大60、囲いの金銀 1枚30、逃げ道 1マス15、歩の前進 1段5
- [ ] **Step 4: 通るのを確かめる** — `npx vitest run tests/ai`（答え合わせを含む）
- [ ] **Step 5: コミット** — 「師範・傾奇者の局面の見方（駒の置き場所・囲い・王の逃げ道）」

### Task 4: 数字で確かめる

- [ ] `node tools/arena/run.mjs pair:shihan:oni 28 7 1 1` → 師範の勝ち 6割以上
- [ ] `node tools/arena/run.mjs pair:kabuki:shihan 28 7 1 1` → 傾奇者の勝ち 6割以上
- [ ] 届かなければ、`preferBonus` と見方の点の大きさを直して1回だけやり直す。それでも届かなければ数字をそのまま記録し、ユーザーに伝える（設計書8章：考える時間・CPU 専用の盤）
- [ ] 1手のいちばん長い時間が、師範4秒・傾奇者5秒＋少し を超えない
- [ ] 結果を下の表に書いてコミット

## 結果

| 組 | 勝ち | 1手の平均・最大 |
|---|---|---|
| 師範 対 鬼 | | |
| 傾奇者 対 師範 | | |
