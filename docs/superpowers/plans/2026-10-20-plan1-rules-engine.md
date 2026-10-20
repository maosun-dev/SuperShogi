# 超将棋 計画1：ルールの部品 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 画面なしで、将棋＋カード12枚のルールを最後まで処理できる部品を作る。自動テストで確かめる。

**Architecture:** 局面（`GameState`）と行動（`Action`）を受け取り、新しい局面と出来事の記録（`GameEvent[]`）を返す純粋な関数の集まり。カードは `src/cards/` に1枚ずつ定義し、ルール本体は定義を呼ぶだけでカードの中身を知らない。相手から見た局面（罠を隠したもの）を作る関数も用意する。

**Tech Stack:** TypeScript 5 / Vitest 3 / Node 24（Vite は計画3で使う）

**Spec:** `docs/superpowers/specs/2026-10-20-super-shogi-design.md`

**この計画のあと：** 計画2＝CPU、計画3＝画面と演出、計画4＝iPhone アプリ化（それぞれ別の計画書にする）

## Global Constraints

- 王を取ったら勝ち。詰みの判定はしない。王手放置の手も合法
- 二歩は禁止、行き所のない駒は禁止、打ち歩詰めの禁止はなし
- 同じ局面が4回出たら引き分け。300手を超えたら引き分け
- 持ち込みは合計コスト10以内、同じカードは2枚まで。持ち込んだカードは最初から全部手札、1枚ずつ使い切り
- 手番では「駒を動かす」「持ち駒を打つ」「カードを使う」のどれか1つ。カードを使ったら手番は終わり。罠の発動は手番に数えない
- 伏せておける罠は1人3枚まで（マスの罠と伏せ札置き場の罠を合わせて）
- 装備は1つの駒に1つまで。駒が取られたら装備も消える。成っても残る
- 罠の場所・中身は相手に渡さない（`viewFor` / `filterEventsFor` を通す）
- コードのコメントとコミットメッセージは日本語。コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- ルールの部品（`src/rules`・`src/cards`）は DOM・Three.js に依存しない

## Review Focus

1. **入れ替えの術で二歩ができる**：自分の歩を、自分の歩がある別の筋へ入れ替えると二歩になる。行き所のない駒と同じく「使えない」が自然 → タスク4にテストを足す
2. **乱暴な連続プレイで落ちる・終わらない**：合法手からでたらめに選び続けても、例外を出さず、必ず決着か引き分けで終わること → タスク7にテストを足す
3. **韋駄天の1手目で駒が消える**：1手目で落とし穴に落ちたり鎧に止められたりしたら、2手目は飛ばされ、例外にならないこと → タスク6にテストを足す
4. **相手の罠のマスへ自分の駒が押し出される・入れ替わる**：移動の理由を問わず、相手の落とし穴のマスに入ったら発動すること → タスク6にテストを足す
5. **相手から見た局面に罠が漏れる**：`viewFor` の結果だけでなく、`filterEventsFor` の出来事（`trapSet`）にも場所・中身が入らないこと → タスク6にテストを足す

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `package.json` / `tsconfig.json` / `vitest.config.ts` | 開発の設定 |
| `src/rules/types.ts` | 型（局面・駒・行動・出来事） |
| `src/rules/board.ts` | マス目の計算、初期配置、局面の複製、局面のキー |
| `src/rules/moves.ts` | 駒ごとの動ける先、成りの判定、打てる場所 |
| `src/rules/game.ts` | `createGame` / `applyAction` / `legalActions` / 勝敗 |
| `src/rules/view.ts` | `viewFor` / `filterEventsFor`（罠を隠す） |
| `src/cards/types.ts` | `CardDef` と `CardContext` の型 |
| `src/cards/magic.ts` / `equip.ts` / `trap.ts` | 種類ごとのカード定義 |
| `src/cards/index.ts` | 全カードの一覧 `CARDS` と `validateDeck` |
| `tests/rules/*.test.ts` | 自動テスト |
| `tests/helpers.ts` | テスト用：空の盤に駒を置いて局面を作る関数 |

座標の決まり：`Square = { c, r }`。`c` は先手から見て左が0・右が8、`r` は上（後手側）が0・下（先手側）が8。先手（`'sente'`＝プレイヤー側）は `r` が減る向きに進む。盤は `board[r * 9 + c]`。

---

### Task 1: 土台・型・初期配置

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`（`node_modules/`, `dist/`）
- Create: `src/rules/types.ts`, `src/rules/board.ts`, `tests/helpers.ts`
- Test: `tests/rules/board.test.ts`

**Interfaces:**
- Produces（`types.ts`）:
  ```ts
  export type Side = 'sente' | 'gote';
  export type PieceKind = 'FU'|'KY'|'KE'|'GI'|'KI'|'KA'|'HI'|'OU';
  export type HandKind = Exclude<PieceKind, 'OU'>;
  export type CardId = 'oshikaeshi'|'irekae'|'rakurai'|'itetsuku'|'yobimodoshi'
    |'otoshiana'|'kagami'|'narifuuji'|'tenma'|'hagane'|'tate'|'idaten';
  export interface Square { c: number; r: number }
  export interface Equip { cardId: CardId }
  export interface Piece { id: number; kind: PieceKind; side: Side; promoted: boolean; equip: Equip | null }
  export interface CardInstance { uid: number; cardId: CardId; used: boolean }
  // 伏せた罠。cardId / at が null なのは「相手から見て隠されている」状態
  export interface SetTrap { uid: number; owner: Side; cardId: CardId | null; at: Square | null }
  export interface PlayerState { hand: Record<HandKind, number>; cards: CardInstance[] }
  export type Result = { winner: Side; reason: 'king-captured' } | { winner: null; reason: 'repetition' | 'move-limit' };
  export interface GameState {
    board: (Piece | null)[]; players: Record<Side, PlayerState>; traps: SetTrap[];
    turn: Side; ply: number; frozen: Side | null;   // frozen = この手番、駒を取れない側
    seen: Record<string, number>; result: Result | null; nextId: number;
  }
  export type Action =
    | { type: 'move'; from: Square; to: Square; promote: boolean; second?: { to: Square; promote: boolean } }
    | { type: 'drop'; kind: HandKind; to: Square }
    | { type: 'card'; uid: number; targets: Square[] };
  export type GameEvent =
    | { type: 'moved'; pieceId: number; from: Square; to: Square; promoted: boolean }
    | { type: 'dropped'; pieceId: number; side: Side; kind: HandKind; to: Square }
    | { type: 'captured'; pieceId: number; at: Square; by: Side }
    | { type: 'cardUsed'; side: Side; cardId: CardId; targets: Square[] }
    | { type: 'trapSet'; side: Side; uid: number; cardId: CardId | null; at: Square | null }
    | { type: 'trapTriggered'; owner: Side; uid: number; cardId: CardId; at: Square | null }
    | { type: 'destroyed'; pieceId: number; at: Square; cause: CardId }
    | { type: 'pushed'; pieceId: number; from: Square; to: Square }
    | { type: 'swapped'; a: Square; b: Square }
    | { type: 'equipped'; pieceId: number; cardId: CardId }
    | { type: 'armorBlocked'; defenderId: number; attackerId: number; at: Square }
    | { type: 'promotionBlocked'; pieceId: number }
    | { type: 'magicNegated'; side: Side; cardId: CardId }
    | { type: 'handTransferred'; kind: HandKind; from: Side; to: Side }
    | { type: 'frozen'; side: Side }
    | { type: 'secondMoveSkipped'; pieceId: number }
    | { type: 'check'; side: Side }      // side の王が狙われている
    | { type: 'gameOver'; result: Result };
  export class IllegalActionError extends Error {}
  ```
- Produces（`board.ts`）:
  - `idx(sq: Square): number` / `sqOf(i: number): Square` / `onBoard(sq: Square): boolean` / `sameSq(a, b): boolean`
  - `opponent(side: Side): Side`
  - `forward(side: Side): -1 | 1`（先手 -1、後手 +1）
  - `initialBoard(): { board: (Piece|null)[]; nextId: number }`（ふつうの平手。後手の王も種類は `'OU'`）
  - `cloneState(s: GameState): GameState`（深い複製）
  - `positionKey(s: GameState): string`（盤・持ち駒・手番・装備・罠の数・使用済みカードを含む）
- Produces（`tests/helpers.ts`）:
  - `emptyState(turn?: Side): GameState`（盤が空、持ち駒0、カードなし）
  - `put(s: GameState, sq: Square, kind: PieceKind, side: Side, opts?: { promoted?: boolean; equip?: CardId }): Piece`

- [ ] **Step 1: 土台を作る**
  `npm init -y` のあと `npm i -D typescript@^5.6 vitest@^3`。`package.json` の scripts に `"test": "vitest run"`、`"typecheck": "tsc --noEmit"`。`tsconfig.json` は `strict: true`、`target/module: ES2022`、`moduleResolution: bundler`。

- [ ] **Step 2: 失敗するテストを書く** `tests/rules/board.test.ts`
  ```ts
  test('初期配置は40枚で、先手の王は5九＝{c:4,r:8}、後手の王は{c:4,r:0}', () => {
    const { board } = initialBoard();
    expect(board.filter(Boolean)).toHaveLength(40);
    expect(board[idx({ c: 4, r: 8 })]).toMatchObject({ kind: 'OU', side: 'sente' });
    expect(board[idx({ c: 4, r: 0 })]).toMatchObject({ kind: 'OU', side: 'gote' });
  });
  test('先手の飛車は{c:7,r:7}、角は{c:1,r:7}。後手の飛車は{c:1,r:1}、角は{c:7,r:1}', ...);
  test('cloneState は盤を共有しない', () => { /* 複製の駒を変えても元が変わらない */ });
  test('positionKey は手番が違えば違う', ...);
  ```

- [ ] **Step 3: 実行して失敗を確認** — `npx vitest run tests/rules/board.test.ts` → 関数がないので FAIL
- [ ] **Step 4: `types.ts`・`board.ts`・`tests/helpers.ts` を実装**
- [ ] **Step 5: 実行して成功を確認** — 同じコマンドで PASS。`npm run typecheck` もエラーなし
- [ ] **Step 6: コミット** — `git add -A && git commit -m "ルールの土台（型・初期配置）を追加"`

---

### Task 2: 駒の動き・成り

**Files:**
- Create: `src/rules/moves.ts`
- Test: `tests/rules/moves.test.ts`

**Interfaces:**
- Consumes: Task 1 の型と `board.ts`
- Produces:
  - `pieceTargets(s: GameState, from: Square): Square[]` — その駒が動ける先（味方のいるマスは除く。相手の駒のマスは含む）。天馬の蹄を装備していれば、その駒の前向きの桂馬の2マスを足す（`equip.cardId === 'tenma'`）
  - `canPromote(p: Piece, from: Square, to: Square): boolean` — 成れる駒（王・金・成り済みは不可）で、`from` か `to` が敵陣（先手は r≤2、後手は r≥6）
  - `mustPromote(kind: PieceKind, side: Side, to: Square): boolean` — 成らないと行き所がない（歩・香が最奥段、桂が奥2段）
  - `dropTargets(s: GameState, side: Side, kind: HandKind): Square[]` — 空きマスのうち、二歩・行き所のない駒にならない所
  - `attackedBy(s: GameState, sq: Square, side: Side): boolean` — side の駒のどれかが sq に動けるか
  - `isInCheck(s: GameState, side: Side): boolean` — side の王が相手に狙われているか

- [ ] **Step 1: 失敗するテストを書く**（`emptyState` と `put` で盤を作る）
  - `'歩は1マス前だけ'`：先手の歩 {4,6} → `[{4,5}]`
  - `'香は前に滑り、相手の駒で止まりそのマスを含む'`
  - `'桂は前の2マスへ跳ぶ（間の駒を飛び越す）'`
  - `'銀・金・王の動き'`：中央 {4,4} の動き数がそれぞれ 5・6・8
  - `'飛は縦横に滑り、成った竜は斜め1マスも足す'`：空の盤の中央で飛 16、竜 20
  - `'角は斜めに滑り、成った馬は縦横1マスも足す'`：中央で角 16、馬 20
  - `'成った歩・香・桂・銀は金と同じ動き'`
  - `'後手の駒は向きが逆'`：後手の歩 {4,2} → `[{4,3}]`
  - `'天馬の蹄を付けた金は、桂馬の2マスも動ける'`：先手の金 {4,4} に `equip:'tenma'` → 6＋2＝8
  - `'canPromote：敵陣に入る・敵陣から出る・敵陣の中で動くとき true。金・王は false'`
  - `'mustPromote：先手の歩が r=0、桂が r=1 で true'`
  - `'dropTargets：同じ筋に自分の成っていない歩があると、その筋に歩は打てない'`
  - `'dropTargets：先手の歩は r=0 に、桂は r=0,1 に打てない'`
  - `'isInCheck：後手の飛車の筋に先手の王がいると true'`
- [ ] **Step 2: 実行して失敗を確認** — `npx vitest run tests/rules/moves.test.ts` → FAIL
- [ ] **Step 3: `moves.ts` を実装** — 駒ごとに「1マス動く向き」と「滑る向き」の表を持ち、`forward(side)` で上下を反転する
- [ ] **Step 4: 実行して成功を確認** — PASS
- [ ] **Step 5: コミット** — `git commit -m "駒の動きと成りの判定を追加"`

---

### Task 3: 指す・打つ・勝敗（カードなしの将棋が最後まで動く）

**Files:**
- Create: `src/rules/game.ts`, `src/cards/types.ts`（中身は Task 4 で埋める。ここでは空の `CARDS` だけ）, `src/cards/index.ts`
- Test: `tests/rules/game.test.ts`

**Interfaces:**
- Consumes: Task 1・2
- Produces:
  - `createGame(decks: Record<Side, CardId[]>): GameState` — 初期配置。先手から。デッキが不正なら `IllegalActionError`（検証は Task 4 で `validateDeck` に差し替え。ここでは空配列だけ受け付ける）
  - `applyAction(s: GameState, a: Action): { state: GameState; events: GameEvent[] }` — 元の `s` は変えない。不正な行動は `IllegalActionError`。決着後の行動も `IllegalActionError`
  - `legalActions(s: GameState): Action[]` — 手番側の合法な行動すべて（この Task では移動と打つだけ）。成りが選べる手は `promote: true/false` の2つを返し、成りが必須なら `true` だけ
  - 処理の順番（`applyAction` の move）：取る → 取った駒は成りを戻して取った側の持ち駒へ（`captured`）→ 王を取ったら `gameOver` で即終了 → 動かす（`moved`）→ 手番交代・`ply+1` → 次の手番側が王手なら `check` → 局面キーを数え、4回目なら引き分け → `ply > 300` なら引き分け

- [ ] **Step 1: 失敗するテストを書く**
  - `'初手 7六歩（{2,6}→{2,5}）で手番が後手になり、moved が出る'`
  - `'相手の駒を取ると、成りを戻して持ち駒に入る'`：成った銀を取る → 先手の `hand.GI === 1`
  - `'王を取ったら勝ち、そのあとの行動は IllegalActionError'`
  - `'王手を放置する手も合法'`：王手がかかった局面で、王と関係ない歩を突ける
  - `'王手をかけると check が出る'`
  - `'成りが必須の手に promote:false を渡すと IllegalActionError'`
  - `'legalActions の初期局面は30手'`
  - `'持ち駒を打つと持ち駒が減り、dropped が出る'`
  - `'同じ局面が4回で repetition の引き分け'`：両者の金を行ったり来たりさせる
  - `'301手目のあとで move-limit の引き分け'`：`ply` を 300 にした局面から1手
  - `'相手の手番の駒は動かせない'`
- [ ] **Step 2: 実行して失敗を確認** — `npx vitest run tests/rules/game.test.ts` → FAIL
- [ ] **Step 3: `game.ts` を実装** — `applyAction` は `cloneState` した局面を書き換える。合法判定は「`legalActions` に同じ行動があるか」で行う（`second` を含めて比較）
- [ ] **Step 4: 実行して成功を確認** — PASS
- [ ] **Step 5: コミット** — `git commit -m "指す・打つ・勝敗の処理を追加"`

---

### Task 4: カードの仕組みと魔法5枚

**Files:**
- Modify: `src/cards/types.ts`, `src/cards/index.ts`, `src/rules/game.ts`
- Create: `src/cards/magic.ts`
- Test: `tests/rules/cards-magic.test.ts`, `tests/rules/deck.test.ts`

**Interfaces:**
- Produces（`src/cards/types.ts`）:
  ```ts
  export type CardKind = 'magic' | 'trap' | 'equip';
  export interface CardContext {
    state: GameState;            // 書き換えてよい複製
    side: Side;                  // カードを使った側
    emit(e: GameEvent): void;
    destroy(sq: Square, cause: CardId): void;   // 駒を消す（持ち駒にならない）
    relocate(from: Square, to: Square): void;   // 駒を移す。移った先に相手の落とし穴があれば発動させる
  }
  export interface CardDef {
    id: CardId; name: string; kind: CardKind; cost: number; text: string;
    fx: string;                                   // 演出の名前（計画3で使う）。例 'rakurai'
    targetSets(s: GameState, side: Side): Square[][];  // 使える対象の組。対象なしのカードは [[]]。空配列なら使えない
    resolve?(ctx: CardContext, targets: Square[]): void;         // 魔法・装備の効果
    trap?: { placement: 'square' | 'slot'; trigger: 'enter' | 'magic' | 'promote' };
    equip?: { knight?: true; armor?: true; magicShield?: true; doubleMove?: true };
  }
  ```
- Produces（`src/cards/index.ts`）:
  - `CARDS: Record<CardId, CardDef>`
  - `validateDeck(ids: CardId[]): string | null` — 問題なしなら `null`。コスト合計 >10 なら `'コストが10を超えています'`、同じカード3枚以上なら `'同じカードは2枚までです'`
  - `isShielded(s: GameState, sq: Square): boolean` — sq の駒自身か、その周り8マスの同じ側の駒に `tate`（王の盾）が付いていれば true（Task 5 で使う。ここで用意）
- `createGame` は `validateDeck` を通し、カードに `uid` を振って `players[side].cards` に入れる
- `applyAction` の card：未使用のカードで、`targets` が `targetSets` のどれかと一致すること → `used = true` → `cardUsed` → 効果 → 手番交代（Task 3 と同じ後処理）
- `凍てつく盤`：`state.frozen = 相手`、`frozen` イベント。`frozen` の側の手番では、相手の駒がいるマスへの移動は不正。その手番が終わったら `frozen = null`
- `legalActions` にカード行動を足す（`targetSets` の組ごとに1つ）

| id | name | cost | targetSets |
|---|---|---|---|
| oshikaeshi | 押し返しの風 | 1 | 相手の駒1つ `[sq]`。相手側へ1マス（後手の駒なら r-1、先手の駒なら r+1）が盤内で空き。`isShielded` の駒は除く |
| irekae | 入れ替えの術 | 2 | 自分の駒2つ `[a, b]`（a のインデックス < b）。入れ替えた結果、行き所のない駒・二歩ができる組は除く |
| rakurai | 落雷 | 4 | 相手の駒1つ。王・飛・角（成っていても）と `isShielded` は除く |
| itetsuku | 凍てつく盤 | 3 | `[[]]` |
| yobimodoshi | 呼び戻し | 2 | `[[]]`。移す駒の種類は行動の `pick` で選ぶ（`choices` が返す種類のどれか）。相手の持ち駒が0なら `choices` が空で使えない |

- 呼び戻しのために、型を2か所足す：
  - `Action` の card に `pick?: HandKind` を足す
  - `CardDef` に `choices?(s: GameState, side: Side): HandKind[]` を足す（呼び戻しは「相手の持ち駒にある種類」を返す）
  - `legalActions` は `choices` があるカードについて、種類ごとに1つずつ行動を返す。`resolve` には `pick` を渡す：`resolve?(ctx, targets, pick?)`

- [ ] **Step 1: 失敗するテストを書く** — `deck.test.ts`
  - `'コスト合計10ちょうどは通る'`：`['idaten','idaten']` → `null`
  - `'コスト11は通らない'`：`['idaten','idaten','narifuuji']` → `'コストが10を超えています'`
  - `'同じカード3枚は通らない'`：`['narifuuji','narifuuji','narifuuji']` → `'同じカードは2枚までです'`
  - `'createGame は不正なデッキで IllegalActionError'`
- [ ] **Step 2: 失敗するテストを書く** — `cards-magic.test.ts`
  - `'落雷で相手の銀が消え、誰の持ち駒にもならない。destroyed が出て手番が終わる'`
  - `'落雷の対象に王・飛・角・竜・馬は入らない'`
  - `'押し返しの風：後手の歩 {4,3} が {4,2} へ。後ろが埋まっていれば対象外'`
  - `'押し返しの風は王も押せる'`
  - `'入れ替えの術：自分の王と金を入れ替えられる'`
  - `'入れ替えの術：歩を r=0 へ動かす組は対象外'`（行き所のない駒）
  - `'入れ替えの術：二歩になる組は対象外'`（Review Focus 1）
  - `'凍てつく盤：次の相手の手番では、こちらの駒のマスへの移動が legalActions に入らない。その次の手番では戻る'`
  - `'凍てつく盤のあとは王も取れない'`
  - `'呼び戻し：相手の持ち駒が飛と歩なら、legalActions に pick:"HI" と pick:"FU" の2つが出る。pick:"HI" で飛がこちらへ移り handTransferred が出る'`
  - `'呼び戻し：相手の持ち駒が0なら legalActions に入らない'`
  - `'使ったカードはもう使えない（used）'`
- [ ] **Step 3: 実行して失敗を確認** — `npx vitest run tests/rules/deck.test.ts tests/rules/cards-magic.test.ts` → FAIL
- [ ] **Step 4: `cards/types.ts`・`index.ts`・`magic.ts` を実装し、`game.ts` にカード行動を足す**
- [ ] **Step 5: 実行して成功を確認** — 全テスト PASS（`npm test`）
- [ ] **Step 6: コミット** — `git commit -m "カードの仕組みと魔法5枚を追加"`

---

### Task 5: 装備4枚

**Files:**
- Create: `src/cards/equip.ts`
- Modify: `src/cards/index.ts`, `src/rules/game.ts`, `src/rules/moves.ts`（必要なら）
- Test: `tests/rules/cards-equip.test.ts`

**Interfaces:**
- 4枚とも `targetSets` は「装備が付いていない自分の駒1つ」。`resolve` で `piece.equip = { cardId }` と `equipped`

| id | name | cost | equip | 効果の場所 |
|---|---|---|---|---|
| tenma | 天馬の蹄 | 2 | `knight` | `pieceTargets`（Task 2 で対応済み） |
| hagane | 鋼の鎧 | 3 | `armor` | `applyAction` の move：取る先の駒が `hagane` なら、取らずに `armorBlocked`、守った駒の装備を外し、攻めた駒は動かず、手番交代 |
| tate | 王の盾 | 4 | `magicShield` | `isShielded`（Task 4 で用意）。相手の魔法の対象から外れる |
| idaten | 韋駄天 | 5 | `doubleMove` | move の `second`。1手目のあとに同じ駒をもう1回動かす。2回目は取る手を除く。`legalActions` は `second` なし＋取らない2手目すべてを返す |

- 成った駒の装備は残る。取られた駒の装備は消える（持ち駒に戻るとき `equip` を持たない）
- 韋駄天：1手目で王を取ったら即終了（`second` 付きは不正）。1手目のあと駒が消えた・動けない場合は `secondMoveSkipped`（Task 6 の落とし穴で起きる）

- [ ] **Step 1: 失敗するテストを書く**
  - `'装備は付いていない自分の駒にだけ付けられる。装備済みの駒は対象外'`
  - `'天馬の蹄を付けた歩は桂馬の位置へ動ける'`
  - `'鋼の鎧：取られそうになると1回守り、攻めた駒は元のマスのまま。鎧は外れる'`
  - `'鋼の鎧：2回目は普通に取られる'`
  - `'鋼の鎧は落雷を防がない'`
  - `'王の盾：盾の駒と周り8マスの味方は、相手の落雷・押し返しの対象外。9マス外の味方は対象'`
  - `'韋駄天：1手で2回動ける。2回目に取る手は不正'`
  - `'韋駄天：2回目なしでもよい'`
  - `'韋駄天：1手目で王を取ったら second は不正、second なしなら勝ち'`
  - `'装備した駒が成っても装備は残る'`
  - `'装備した駒が取られると、持ち駒に装備は付いてこない'`
- [ ] **Step 2: 実行して失敗を確認** — `npx vitest run tests/rules/cards-equip.test.ts` → FAIL
- [ ] **Step 3: `equip.ts` を実装し、`game.ts` に鎧・韋駄天の処理を足す**
- [ ] **Step 4: 実行して成功を確認** — `npm test` 全 PASS
- [ ] **Step 5: コミット** — `git commit -m "装備カード4枚を追加"`

---

### Task 6: 罠3枚と、罠を隠す仕組み

**Files:**
- Create: `src/cards/trap.ts`, `src/rules/view.ts`
- Modify: `src/cards/index.ts`, `src/rules/game.ts`
- Test: `tests/rules/cards-trap.test.ts`, `tests/rules/view.test.ts`

**Interfaces:**
- 罠を伏せる：card 行動で `targets` は、`otoshiana` なら空きマス1つ `[sq]`、`kagami`・`narifuuji` なら `[]`。`state.traps` に `{ uid, owner, cardId, at }` を足し `trapSet`。自分の伏せている罠が3枚なら、罠カードは `targetSets` が空（使えない）
- 発動は `game.ts` の決まった場所で、`trap.trigger` ごとに調べる：
  - `'enter'`（落とし穴）：駒がマスに入るたび（移動・打つ・`relocate`）。そのマスに **駒の持ち主と反対の側** の落とし穴があれば発動。王なら発動しない（罠は残る）。王以外なら `trapTriggered` → `destroyed`。取る手の場合は「取る → 入る → 落ちる」の順
  - `'magic'`（鏡の結界）：魔法の `cardUsed` の直後、効果の前。使った側の相手の鏡の結界があれば発動 → `magicNegated`、効果なしで手番交代。複数あれば uid が小さい1枚だけ
  - `'promote'`（成り封じ）：`promote: true` の移動で、`mustPromote` でないとき。相手の成り封じがあれば発動 → `promotionBlocked`、成らずに動く
  - 発動した罠は `state.traps` から消える
- Produces（`view.ts`）:
  - `viewFor(s: GameState, side: Side): GameState` — 相手の罠を `{ uid, owner, cardId: null, at: null }` にした複製
  - `filterEventsFor(events: GameEvent[], side: Side): GameEvent[]` — 相手が出した `trapSet` の `cardId` と `at` を `null` に。`trapTriggered` はそのまま（発動したら見せてよい）

- [ ] **Step 1: 失敗するテストを書く** — `cards-trap.test.ts`
  - `'落とし穴は空きマスにだけ伏せられる'`
  - `'相手の駒が落とし穴のマスに入ると壊れ、罠は消える'`
  - `'自分の駒が自分の落とし穴に入っても発動しない'`
  - `'王が入っても発動せず、罠は残る'`
  - `'持ち駒を落とし穴のマスに打っても発動する'`
  - `'取る手で落とし穴に入ると、取ったあと落ちる（取った駒は持ち駒に入る）'`
  - `'押し返しの風で、相手の駒をこちらの落とし穴へ押し込める'`（Review Focus 4）
  - `'入れ替えの術で、自分の駒が相手の落とし穴のマスに入ると発動する'`（Review Focus 4）
  - `'韋駄天の1手目で落とし穴に落ちたら、2手目は secondMoveSkipped'`（Review Focus 3）
  - `'韋駄天の1手目が鋼の鎧に止められたら、2手目は secondMoveSkipped'`（Review Focus 3）
  - `'鏡の結界：相手の落雷が無効になり、相手の手番は終わる。落雷のカードは使用済み'`
  - `'成り封じ：相手が成ろうとすると成らずに動く'`
  - `'成り封じ：歩が最奥段に入る（成りが必須）ときは発動しない'`
  - `'罠が3枚伏せてあると、4枚目の罠カードは legalActions に入らない'`
  - `'罠の発動は手番に数えない（発動のあとも手番は普通に交代する）'`
- [ ] **Step 2: 失敗するテストを書く** — `view.test.ts`
  - `'viewFor で相手の罠の cardId と at が null になる。自分の罠はそのまま'`
  - `'filterEventsFor で相手の trapSet の cardId と at が null になる'`（Review Focus 5）
  - `'filterEventsFor は自分の trapSet と、発動した trapTriggered を隠さない'`
- [ ] **Step 3: 実行して失敗を確認** — `npx vitest run tests/rules/cards-trap.test.ts tests/rules/view.test.ts` → FAIL
- [ ] **Step 4: `trap.ts`・`view.ts` を実装し、`game.ts` に発動の調べを足す**
- [ ] **Step 5: 実行して成功を確認** — `npm test` 全 PASS
- [ ] **Step 6: コミット** — `git commit -m "罠カード3枚と罠を隠す仕組みを追加"`

---

### Task 7: 通しの確認（でたらめ対局）

**Files:**
- Test: `tests/rules/random-play.test.ts`

**Interfaces:**
- Consumes: `createGame` / `legalActions` / `applyAction` / `viewFor`

- [ ] **Step 1: テストを書く**（Review Focus 2）
  ```ts
  // 種（シード）付きの乱数で、合法手からでたらめに選び続ける
  test.each(range(200))('でたらめ対局 %i は例外なく決着か引き分けで終わる', seed => {
    const decks = randomDecks(seed);            // validateDeck を通る組をランダムに作る
    let s = createGame(decks);
    for (let i = 0; i < 400 && !s.result; i++) {
      const acts = legalActions(s);
      expect(acts.length).toBeGreaterThan(0);
      s = applyAction(s, pick(acts, seed, i)).state;
    }
    expect(s.result).not.toBeNull();
  });
  ```
  - あわせて：各手のあと、盤の駒の数＋持ち駒の数＋壊れた駒の数＝40 であること
- [ ] **Step 2: 実行** — `npx vitest run tests/rules/random-play.test.ts`。失敗したらその種の局面を `systematic-debugging` で調べて直す
- [ ] **Step 3: 全体の確認** — `npm test` 全 PASS、`npm run typecheck` エラーなし
- [ ] **Step 4: コミット** — `git commit -m "でたらめ対局の通しテストを追加"`
