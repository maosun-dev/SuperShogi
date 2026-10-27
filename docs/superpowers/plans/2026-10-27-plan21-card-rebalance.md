# 計画21 札の直し（2026-10） 手順書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設計書のとおりに札のコスト・効果を直し、貫きの槍を番傘に入れ替え、画面・演出・CPU・強さごとの持ち込みまでそろえる。

**Architecture:** ルールの変更は札の定義（`src/cards/*.ts`）とルール本体（`src/rules/game.ts`・`moves.ts`）に入れ、駒の新しい状態（痺れ `numb`・3マスまで `reach`・枷 `shackle`）は `Piece` に足す。枷は纏札の枠から外して別の状態にする。CardId の `tsuranuki` は `bangasa` に置き換え、型の誤りを頼りに使っている所を全部直す。

**Tech Stack:** TypeScript・vitest・Three.js（印・演出）

**Spec:** `docs/superpowers/specs/2026-10-27-card-rebalance-design.md`

## Global Constraints

- コスト：押し返しの風2・入れ替えの術1・呼び戻し2・成り上がり2・格落とし2・落雷4・凍てつく床1・成り封じ1・落とし穴3・鏡の結界3・相討ち3・身代わり6・陣替えの旗2・天馬の蹄2・重りの枷2・鋼の鎧3・韋駄天4・番傘2
- 陣替えの旗の id は `hikijin` のまま。番傘の id は `bangasa`
- 落雷：痺れは「落雷を使った人の次の手番が終わるまで」。相手の駒 `numb = 1`、使った側の駒 `numb = 2`（使った手番の終わりで1減るため）。王も痺れる。飛・角・竜・馬は壊さず `reach = 3`（対局の終わりまで、成っても続く、1マスの動きはそのまま）
- 番傘が止める忍札：落とし穴・凍てつく床・相討ち・成り封じ・身代わり（その駒に対しては発動せず、札は伏せたまま残る）
- 鏡の結界：コスト2以上の術札・纏札を打ち消す。打ち消された側の手番は終わる
- 強さごとの持ち込み：弱い［押し返しの風・呼び戻し・落とし穴・天馬の蹄］、ふつう［落雷・鋼の鎧・呼び戻し］、強い［凍てつく床・相討ち・鋼の鎧・天馬の蹄］、師範［鏡の結界・成り封じ・鋼の鎧・凍てつく床・陣替えの旗］。鬼のくじの攻めの札から貫きの槍を外し、守りの札に番傘を足す
- 板・グラデーション・光・丸バッジ・影付き縁取り文字は使わない。見た目の課題は frontend-design を読んでから
- コメント・コミットは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. 番傘で罠が発動しなかったとき、伏せた罠の中身・場所が相手に漏れない（知らせ・演出を出さない）→ 課題5のテスト（events に trapTriggered も別の知らせも出ない）
2. 痺れと凍結が同じ駒に重なっても、長い方まで動けない。痺れた王は王手を逃げられない → 課題4のテスト
3. 3マスまでの竜・馬：1マスの動き（竜の斜め・馬の縦横）は使える、王手の確かめ（attacks）も3マスまで → 課題4のテスト
4. 枷が外れたあと、元の纏札（鎧・天馬など）の効果が戻る。枷の付いた駒が取られたら枷も消える → 課題3のテスト
5. 保存された持ち込みに貫きの槍・コスト超えがあっても、読み込みで落ちずに外れる → 課題1のテスト

---

### Task 1: コストと説明文・持ち込み

**Files:** `src/cards/{magic,trap,equip}.ts`（cost・text・name）、`src/ai/levels.ts`（持ち込み）、テスト `tests/rules/deck.test.ts`・`tests/ai/levels.test.ts`・`tests/app/keiko.test.ts`

- [ ] テスト：全18枚のコストが Global Constraints の表どおり（`CARDS[id].cost` の表で比べる）。陣替えの旗の名前。強さごとの持ち込みが上のとおりで `validateDeck` を通る。`sanitizeDeck(['tsuranuki','rakurai'])` が `['rakurai']`、コスト超えの組は後ろから外れる
- [ ] 失敗を確かめる → 直す → 通す（`npx vitest run tests/rules tests/ai tests/app`。答え合わせ（golden）は課題7で録り直すので、ここで落ちてよい：Ruling に書く）
- [ ] コミット「札のコストと説明文、強さごとの持ち込みを直す」

### Task 2: 押し返しの風・鏡の結界・陣替えの旗

**Files:** `src/rules/game.ts`（legalActions・useCard）、`src/rules/moves.ts`（陣替えの左右）、`src/fx/equipMove.ts`（陣替えの出番の判定）、テスト `tests/rules/cards-magic.test.ts`・`cards-trap.test.ts`・`cards-equip.test.ts`・`moves-fast.test.ts`（元の作りの写しを新しい動きに直す）

- [ ] テスト
  - 押し返しの続きの手（`pushFollowUp`）では、王を取る手が `legalActions` に無い（王の隣に押し返して、続けて取れる形で確かめる）。押し返しでない普段の手番では取れる
  - 鏡の結界：相手がコスト2以上の纏札（例：鋼の鎧）を使うと打ち消され（`magicNegated`）、駒に纏札は付かず、手番が終わる。コスト1の纏札は打ち消さない（コスト1の纏札は今は無いので、テストではコスト2の纏札で発動・凍てつく床（忍）では発動しない、を確かめる）
  - 陣替えの旗：成る前の歩・銀に付けると、真後ろと左右1マスに動ける（味方がいるマスは除く）。成ったら付けたままでも左右・後ろは足さない
- [ ] 失敗を確かめる → 直す → 通す
- [ ] コミット「押し返しの続きで王を取れない・鏡の結界は纏札も打ち消す・陣替えの旗は左右にも動ける」

### Task 3: 重りの枷を駒の別の状態に

**Files:** `src/rules/types.ts`（`Piece.shackle?: { left: number }`）、`src/rules/board.ts`（cloneState・positionKey に `#left`）、`src/cards/equip.ts`（omori の targetSets・resolve）、`src/rules/moves.ts`（枷の動きの制限を shackle で）、`src/rules/game.ts`（endTurn の残り手番）、`src/ai/evaluate.ts`（枷の点を shackle で）、`src/view/pieces3d.ts`・`src/view/equipProps.ts`（枷の印・物を equip でなく shackle から）、`src/app/dev.ts`（試し口の枷）、テスト `tests/rules/cards-equip.test.ts`

**Interfaces:** Produces `Piece.shackle?: { left: number }`（`OMORI_TURNS` から1ずつ減り、0で消えて `equipBroken`（cardId 'omori'）を出す）

- [ ] テスト：纏札（鋼の鎧）が付いた相手の駒に枷を付けられ、両方持つ。枷の間は隣8マスだけ。相手の3手番で外れ、鎧が残っている（取ろうとすると鎧が守る）。枷の付いた駒を同じ駒にもう一度は付けられない。枷の付いた駒が取られると、取った側の持ち駒には何も付かない
- [ ] 失敗を確かめる → 直す（`p.equip?.cardId === 'omori'` の所を全部 `p.shackle` に）→ 通す
- [ ] コミット「重りの枷を纏札と別の状態にし、纏札の付いた駒にも付けられるように」

### Task 4: 落雷の作り直しと、痺れ・3マスまで

**Files:** `src/rules/types.ts`（`Piece.numb?: number`・`Piece.reach?: number`、知らせ `{ type: 'numbed'; pieceId; at }`・`{ type: 'reachLimited'; pieceId; at }`）、`src/rules/board.ts`（複製・キーに `^n` と `r3`）、`src/rules/moves.ts`（numb の駒は動けない、reach の滑りは reach マスまで。`pieceTargetIdx` と `attacks` の両方）、`src/rules/game.ts`（endTurn で numb を凍結と同じく減らす）、`src/cards/magic.ts`（rakurai の targetSets・resolve・text）、テスト `tests/rules/cards-magic.test.ts`・`moves-fast.test.ts`

- [ ] テスト
  - 飛・角・竜・馬も落雷の対象。王は対象外
  - 銀を落雷：銀は壊れ、隣8マスの駒（相手の駒・自分の駒・王）に numb。相手の駒は相手の次の手番に動けず、その次から動ける。自分の駒は自分の次の手番に動けず、その次から動ける
  - 痺れた王は動けない（王手をかけられても逃げる手が無い）。凍結と痺れが重なったら長い方
  - 飛車を落雷：壊れず `reach = 3`、痺れは出ない。縦横に4マス以上は進めない（1〜3マスは進める）。成って竜になっても3マスまで、斜め1マスは動ける。`attacks` も3マスまで
  - 説明文が設計書3章の案のとおり
- [ ] 失敗を確かめる → 直す → 通す
- [ ] コミット「落雷を作り直す（まわりが痺れる・飛車角は3マスまで）」

### Task 5: 番傘（貫きの槍を入れ替える）

**Files:** `src/rules/types.ts`（CardId の `tsuranuki` → `bangasa`）、`src/cards/equip.ts`（tsuranuki を消し bangasa を足す。`equip: { umbrella: true }`）、`src/cards/types.ts`（`umbrella`）、`src/rules/game.ts`（罠の発動の前に番傘を確かめる：enterSquare・相討ち・成り封じ（stepMove と promoteInPlace）・身代わり。槍の飛び越えを消す）、`src/rules/moves.ts`（pierce を消す）、型の誤りが出る所すべて（`src/fx/*`・`src/view/*`・`src/ai/*`・`src/app/dev.ts`）、テスト `tests/rules/cards-new.test.ts`（か新しい `cards-bangasa.test.ts`）

- [ ] テスト（番傘を付けた駒で）
  - 相手の落とし穴・凍てつく床のマスに入っても発動せず、罠は伏せたまま残る
  - 相手の駒を取っても相討ちが発動しない（罠は残る）
  - 成ろうとしても成り封じが発動しない（成れる）
  - 相手の王を取りに行っても身代わりが発動しない（王を取れる）
  - 番傘の駒が罠を素通りしたとき、events に `trapTriggered` も罠の知らせも出ない（Review Focus 1）
  - 番傘は自分の王以外の纏札の付いていない駒に付けられる
- [ ] 失敗を確かめる → 直す → 通す（`npm run typecheck` も）
- [ ] コミット「貫きの槍をなくし、番傘（付けた駒には忍札が効かない）を足す」

### Task 6: 画面・演出

**Files:** `src/view/cardArt.ts`（番傘の絵・陣替えの名前）、`src/view/equipProps.ts`（番傘の物、槍を消す）、`src/view/pieces3d.ts`（印：痺れ `n+数`＝雷のジグザグ、3マスまで `reach`＝三つの点）、`src/fx/cards/rakurai.ts`（2通り：壊す＋まわりにジグザグ／壊さず3マスの印）、`src/fx/cards/bangasa.ts`（付けるときの演出。tsuranuki.ts を置き換え）、`src/fx/cards/index.ts`、`src/fx/equipMove.ts`（槍を消す・陣替えの左右）、`src/app/dev.ts`（試し口：`?fx=rakurai`・`?fx=rakurai-hisha`・`?fx=bangasa`・`?fx=marks` に痺れと3マス）、`src/app/howto/pages.ts`（札の説明の文）

- [ ] frontend-design を読んでから作る
- [ ] 試し口で1枚ずつ目で見る：落雷（銀に落として、まわりの駒にジグザグの印）・落雷（飛車に落として、壊れず3マスの印）・番傘を付ける・印の一覧・陣替えの旗の左右の出番
- [ ] `npx vitest run`・`npm run typecheck`・`npm run build`
- [ ] 設計書4章の「番傘が罠を弾く短い演出」は作らない（Ruling：罠の場所・中身が相手に漏れるため。Review Focus 1）
- [ ] コミット「札の直しの見た目（番傘・落雷の2通り・痺れと3マスの印）」

### Task 7: CPU と答え合わせの録り直し

**Files:** `src/ai/cardHints.ts`（落雷は飛車・角も候補：壊す候補は今どおり、飛車角は価値の高い順。番傘は相手に伏せ札があるとき価値の高い自分の駒）、`src/ai/evaluate.ts`（痺れ：凍結と同じ割合。3マスまでの飛車角：駒の点から 300 引く。番傘：EQUIP_VALUE 150。陣替え：120。槍を消す）、`tests/ai/golden-moves.json`（録り直し）

- [ ] テスト：cardHints が飛車への落雷を候補に入れる。evaluate で reach の飛車は普通の飛車より300低い、痺れた駒は凍結と同じだけ低い
- [ ] 失敗を確かめる → 直す → 通す
- [ ] 答えの録り直し：`npx vite-node tools/arena/golden-record.ts`（Ruling：札の効果とコストが変わったため。設計書5章）。そのあと `npx vitest run` 全部が通る
- [ ] コミット「CPU の札の見立てと点数づけを新しい札に合わせる・答え合わせを録り直す」

### Task 8: 対局で確かめる

- [ ] 札ごとの勝率：`node tools/arena/run.mjs cards 280 7 21 0.1` → `summary.mjs` で、どの札も 45〜55%。外れた札は記録して、ユーザーに伝える（コストは勝手に変えない）
- [ ] 強さの並び：`pair:normal:strong`・`pair:weak:normal` を 28局ずつ（timeScale 1）
- [ ] 鬼 対 強い：28局（鬼の調整の続き）
- [ ] 結果を下の表に書いてコミット

## 結果

| 確かめ | 結果 |
|---|---|
| 札ごとの勝率（45〜55% を外れた札） | |
| 強い 対 ふつう | |
| ふつう 対 弱い | |
| 鬼 対 強い | |
