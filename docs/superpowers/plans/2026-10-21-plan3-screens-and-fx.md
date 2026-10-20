# 超将棋 計画3：画面と演出 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スマホの縦画面で、タイトル → 強さ選び → カード選び → CPU との対局 → 結果 までを最後まで遊べるようにする。カードを使うたび・罠が発動するたび・決着のときに、大げさな演出と効果音が流れる。

**Architecture:** テストできる「頭」と、目で確かめる「見た目」を分ける。頭は `src/app`（保存・カード選びの計算・対局の進行役）と `src/view/input.ts`（タップを行動に変える）と `src/fx/plan.ts`（出来事の記録を演出の段取りに変える）で、DOM も Three.js も使わない。見た目は `src/view`（3D の盤と駒・HTML の帯や札）と `src/fx`（演出と音）。演出は「段取りを順に再生 → 最後に `sync(局面)` で見た目を局面に必ず揃える」ので、演出に抜けがあっても盤の表示は狂わない。

**Tech Stack:** TypeScript 5 / Vite 7（vitest 3.2.7 が使っている 7.3 系にそろえる）/ Three.js 0.186 / Vitest 3 / `@fontsource/yuji-boku`・`@fontsource/shippori-mincho-b1`（文字を端末に同梱。計画4でアプリにしたときネットなしでも出るように）

**Spec:** `docs/superpowers/specs/2026-10-20-super-shogi-design.md`（特に 3・4・5.1「画面の部品と演出の部品」・5.3・6「画面」）。見た目の手本：`docs/mockups/look-mockup.html`（ユーザー確認済み。落雷の演出・盤・駒・札の形はここからそのまま移す）

**この計画のあと：** 計画4＝iPhone アプリ化（Capacitor・TestFlight）

## Global Constraints

- 色は設計書の7色だけを `src/app/style.css` の `:root` に置き、ほかの場所で色の値を直に書かない（3D 側は `src/view/palette.ts` に同じ値を数値で置く）：榧 `#E2B65B`・夜の藍 `#14213D`・藍 `#2B59C3`・隈取の紅 `#D7263D`・金箔 `#C9A227`・胡粉 `#EEE8DC`・墨 `#1d1a17`。試作にある濃淡（`#22386a`・`#0d1730`・`#7a0f1c`・`#F2D594` など）はこの7色の明暗として同じファイルに名前を付けて置く
- 文字：カットイン・ロゴ・大きな数字・結果の判は Yuji Boku、それ以外（説明文・ボタン・駒の字）は Shippori Mincho B1（500 と 800）
- 画面の言葉はすべて日本語。ボタンは何が起きるかを書く（「対局」「使う」「やめる」「もう一度」「カードを組み直す」）。英字の大文字ラベル・「→」付きのボタンは使わない
- 人間は先手（下側）、CPU は後手。画面に渡すのは `viewFor(本当の局面, 'sente')` と `filterEventsFor(events, 'sente')` だけ。本当の局面を `src/view`・`src/fx` に渡す口を作らない
- 画面から出す行動は、必ず `legalActions(人間側の局面)` の配列の要素そのもの（画面で行動を組み立てない）
- 演出の途中と CPU が考えている間は、盤・手札・駒台のタップを受け付けない（設計書 5.1）
- 普段の操作は静かで速く（駒の移動 160ms）。大げさな演出は「カード」「罠の発動」「決着」だけ。王手は短い帯（700ms）
- OS の「視差効果を減らす」（`prefers-reduced-motion: reduce`）のときは、画面の揺れなし・カメラは瞬時に移る・白い光は明るさ 0.4 まで
- `src/rules`・`src/cards`・`src/ai` は DOM・Three.js に依存しない（型チェックを分けて守る。タスク1）。`src/ai` に足すのは `client.ts` の変更だけ
- 対象：iPhone の縦画面（幅 375〜430px、高さ 667px 以上）。横向き・タブレットは崩れなければよい
- コードのコメントとコミットメッセージは日本語。コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **CPU の伏せた罠があるときの人間の手**：人間側の局面から作った行動の一覧が、本当の局面の一覧と同じであること（罠の場所が分かってしまう違いや、選べるのに反則になる手がない） → タスク4にテストを足す
2. **CPU の Worker が落ちる・答えない**：対局が止まったままにならず、見えている情報から選んだ合法な手で続くこと → タスク3・4にテストを足す
3. **演出中・CPU の思考中の連打**：その間のタップや `submit` は無視され、二重に手が進まないこと → タスク4にテストを足す
4. **対局の途中でタイトルへ戻る**：CPU の答えがあとから届いても、消えた画面に演出を流したり戦績を書いたりしないこと → タスク4にテストを足す
5. **壊れた保存データ**：中身が壊れた JSON・カードの調整で今は組めなくなった持ち込み・`localStorage` が使えない環境でも、既定の値で起動すること → タスク2にテストを足す

---

## 見た目の決めごと（新しく作る画面）

試作で決まった対局画面の見た目はそのまま使う。新しい画面は「芝居小屋」の流れでそろえる。大胆さは1か所に絞る：**画面が切り替わるたびに、墨・紅・藍の3色の縦縞の幕が横に引かれ、拍子木が「カン」と鳴る**（定式幕を、この作品の3色で描き直したもの。450ms、動きを減らす設定では 120ms のフェード）。ほかの画面の中は静かにする。

| 画面 | 形 |
|---|---|
| タイトル | 3D の盤がゆっくり回る。右上から縦書きの大きなロゴ「超将棋」（Yuji Boku、胡粉の字に墨の縁、後ろに紅の隈取の一筆）。下に千社札の形の縦長ボタン「対局」「カード図鑑」。左下に小さな角印「設」で設定 |
| 強さ選び | 3枚の札「弱い」「ふつう」「強い」を縦に並べる。各札に CPU の持ち込みカードの小さな札と、その強さの戦績（例「3勝 1敗」） |
| カード選び | 上：残りのコストを Yuji Boku の大きな数字で。横に墨の丸10個の「コストの目盛り」があり、選んだカードの分が種類の色の判で押される。中：12枚を種類ごとに1行（魔法5・罠3・装備4、横にはみ出す分は横スクロール）。タップで1枚足す、選んだ枚数を札の右上に「二」「一」。下：持ち込み中の札の列（タップで外す）と「おまかせ」「対局へ」 |
| 対局前の札見せ | 上に CPU の持ち込み、下に自分の持ち込みを表向きで並べ、拍子木と同時に中央で「いざ」の筆文字。1.6 秒、タップで飛ばせる |
| 対局 | 試作の通り。上の帯：相手の持ち駒（五角形の駒札と枚数）・伏せ札3枠・「残り札」（相手の未使用カードの一覧を開く）。下の帯：自分の持ち駒・伏せ札。いちばん下に手札。最後に動いた駒のマスは薄い榧色、王手中の王の足元に紅の輪 |
| 結果 | 画面中央に紅の角判を押す：「勝」「負」「引分」（Yuji Boku）。下に理由（「王を取りました」「王を取られました」「同じ局面が4回出ました」「300手を超えました」）。ボタン「もう一度」「カードを組み直す」、小さく「タイトルへ」 |
| カード図鑑 | 種類ごとの行に12枚。タップで大きな札と説明文 |
| 設定 | 演出の長さ「短め／長め」の切り替え、音の大きさのつまみ |

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` / `vite.config.ts` / `tsconfig.core.json` | 入口・組み立て・ルール側だけの型チェック |
| `src/app/main.ts` | 起動。画面の切り替え（`showScreen`）と幕の演出 |
| `src/app/style.css` | 色・文字・共通の部品（札・ボタン・帯）の見た目 |
| `src/app/storage.ts` | 設定・前回の持ち込み・戦績の保存（テストあり） |
| `src/app/deck.ts` | カード選びの計算と「おまかせ」（テストあり） |
| `src/app/match.ts` | 対局の進行役：本当の局面を持ち、人間と CPU の行動を順に適用し、演出役に渡す（テストあり） |
| `src/app/cpu.ts` | 本物の Worker を作って `createCpuClient` に渡す |
| `src/app/screens/*.ts` | `title`・`level`・`deck`・`reveal`・`match`・`result`・`zukan`・`settings` |
| `src/view/input.ts` | タップ → 行動（テストあり） |
| `src/view/fit.ts` | 画面の縦横比からカメラの距離を出す（テストあり） |
| `src/view/palette.ts` | 3D 用の色の数値 |
| `src/view/stage.ts` | Three.js の描画・カメラ・毎フレームの更新・小さな動きの道具（tween） |
| `src/view/board3d.ts` | 足付きの盤・木目・マスの判定（タップ位置 → マス）・光るマス |
| `src/view/pieces3d.ts` | 駒の形と字・`sync(局面)` で駒・装備の六角形・自分の落とし穴の印・王手の輪を揃える |
| `src/view/hud.ts` | 上下の帯（持ち駒・伏せ札・手番）・手札・説明の板・案内の帯・成る/成らない・駒の種類選び |
| `src/view/cardArt.ts` | 12枚の絵（自作の SVG）と札の HTML |
| `src/fx/plan.ts` | 出来事の記録 → 演出の段取り（テストあり） |
| `src/fx/kit.ts` | 演出の共通の道具：白い光・集中線・墨しぶき・筆文字のカットイン・カメラの寄りと戻り・揺れ・砕け散り・粒 |
| `src/fx/magic.ts` / `trap.ts` / `equip.ts` / `finale.ts` | カードごと・決着の演出 |
| `src/fx/player.ts` | 段取りを順に再生し、最後に `sync` する（`Presenter` の本体） |
| `src/fx/sound.ts` | 効果音（Web Audio で合成。音のファイルは使わない） |
| `tests/app/*.test.ts` / `tests/view/*.test.ts` / `tests/fx/*.test.ts` | 自動テスト（すべて Node で動く。DOM の偽物は使わない） |

---

### Task 1: 土台（Vite・Three.js・文字・型チェックの分割・画面の切り替え）

**Files:**
- Modify: `package.json`（scripts と依存）, `tsconfig.json`
- Create: `tsconfig.core.json`, `vite.config.ts`, `index.html`, `src/app/main.ts`, `src/app/style.css`, `src/view/palette.ts`, `.claude/launch.json`
- Test: `tests/app/boundaries.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/app/main.ts
  export type ScreenName = 'title' | 'level' | 'deck' | 'reveal' | 'match' | 'result' | 'zukan' | 'settings';
  export interface Screen { mount(root: HTMLElement): void; unmount(): void }
  export function registerScreen(name: ScreenName, make: (params: unknown) => Screen): void;
  export function showScreen(name: ScreenName, params?: unknown): Promise<void>; // 幕を引いて入れ替える
  // src/view/palette.ts
  export const PAL: { kaya: number; yoru: number; mahou: number; wana: number; soubi: number; gofun: number; sumi: number; /* 濃淡も名前付きで */ };
  ```
- 依存：`npm i three @fontsource/yuji-boku @fontsource/shippori-mincho-b1` と `npm i -D vite@^7.3.7 @types/three`。入った版を `package.json` に固定（`^` のまま可）
- scripts：`"dev": "vite"`, `"build": "npm run typecheck && vite build"`, `"preview": "vite preview"`, `"typecheck": "tsc --noEmit -p tsconfig.core.json && tsc --noEmit"`
- `tsconfig.core.json`：今の `tsconfig.json` の中身（`lib: ["ES2022"]`）で `include: ["src/rules", "src/cards", "src/ai"]`。`tsconfig.json` は `lib: ["ES2022", "DOM", "DOM.Iterable"]`、`types: ["vite/client"]`
- `.claude/launch.json`：`{ "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }`
- この時点の画面：各画面は名前だけ出す仮の中身。幕の演出（「見た目の決めごと」）と拍子木の音は入れる（音はタスク12で差し替えるので、ここでは無音でよい）

- [ ] **Step 1: 失敗するテストを書く** — `tests/app/boundaries.test.ts`
  - `ルールと CPU の部品は画面の部品を読み込まない`：`src/rules`・`src/cards`・`src/ai` の全 `.ts` を `fs` で読み、`from '...'` に `three`・`/view`・`/fx`・`/app` を含む行がない
  - `画面の部品は本当の局面を作らない`：`src/view`・`src/fx` の全 `.ts` に `createGame`・`applyAction` の import がない（まだファイルがなければ0件で通る。後のタスクの見張り役）
- [ ] **Step 2: 失敗を確かめる** — このテスト自体は今の状態で通ってしまうので、試しに `src/ai/client.ts` に `import 'three'` を一時的に足して FAIL を確かめ、戻す
- [ ] **Step 3: 上の Interfaces の通りに土台を作る**
- [ ] **Step 4: 確かめる** — Run: `npm test` / `npm run typecheck` / `npm run build` / Expected: すべて通る。`preview_start`（name: dev）で開き、タイトルの仮画面 → 別の画面へ幕が引かれて切り替わるのを目で見る。終わったら閉じる
- [ ] **Step 5: コミット** — `git commit -m "画面づくりの土台（Vite・Three.js・文字・画面の切り替え）を追加"`

---

### Task 2: 保存と、カード選びの計算

**Files:**
- Create: `src/app/storage.ts`, `src/app/deck.ts`
- Test: `tests/app/storage.test.ts`, `tests/app/deck.test.ts`

**Interfaces:**
- Consumes: `CARDS`, `COST_LIMIT`, `MAX_COPIES`, `validateDeck`, `Level`, `makeRng`（テストで使う）
- Produces:
  ```ts
  // storage.ts
  export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
  export interface Settings { fx: 'short' | 'long'; volume: number }        // volume は 0〜1
  export interface Tally { wins: number; losses: number; draws: number }
  export const DEFAULT_SETTINGS: Settings;                                   // { fx: 'long', volume: 0.7 }
  export function safeStore(): KeyValueStore;  // localStorage。使えなければ（例外）メモリの中だけの代わり
  export function loadSettings(st: KeyValueStore): Settings;
  export function saveSettings(st: KeyValueStore, s: Settings): void;
  export function loadDeck(st: KeyValueStore): CardId[] | null;             // validateDeck を通らなければ null
  export function saveDeck(st: KeyValueStore, deck: CardId[]): void;
  export function loadTally(st: KeyValueStore, level: Level): Tally;
  export function recordResult(st: KeyValueStore, level: Level, outcome: 'win' | 'loss' | 'draw'): Tally;
  // deck.ts
  export function deckCost(deck: CardId[]): number;
  export function addReason(deck: CardId[], id: CardId): string | null;   // 足せない理由。足せるなら null
  export function autoDeck(rng: () => number): CardId[];
  ```
- 保存の鍵：`superShogi.settings` / `superShogi.deck` / `superShogi.tally`（中身は `Record<Level, Tally>` の JSON）
- `loadSettings` は項目ごとに確かめる：`fx` が `'short' | 'long'` 以外なら既定、`volume` が数でなければ既定、0〜1 に丸める
- `addReason` の文言：コスト超えは `'残りのコストが足りません'`、3枚目は `'同じカードは2枚までです'`
- `autoDeck`：12種を2枚ずつ並べた24枚を `rng` で混ぜ、前から「入れてもコスト10以内」のものを足していく

- [ ] **Step 1: 失敗するテストを書く**（保存先は `Map` で作った偽物）
  - `設定を保存して読み戻せる` / `何もなければ既定の設定`
  - `壊れた JSON や変な値は既定に戻る`：`'{'`・`'{"fx":"fast","volume":"大"}'` → `DEFAULT_SETTINGS`。`volume: 3` → 1
  - `今は組めない持ち込みは null`：`['rakurai','rakurai','rakurai']`・`['nazo']`・`'{'` → `null`
  - `戦績は強さごとに数える`：`recordResult(st,'weak','win')` を2回、`'strong','loss'` を1回 → `loadTally(st,'weak')` が `{wins:2,losses:0,draws:0}`、`normal` は全部0
  - `localStorage がなくても動く`：`globalThis.localStorage` がない Node で `safeStore()` に保存して読み戻せる
  - `残りのコストと足せない理由`：`deckCost(['rakurai','idaten']) === 9`、それに `irekae` → `'残りのコストが足りません'`、`['tenma','tenma']` に `tenma` → `'同じカードは2枚までです'`、足せるなら `null`
  - `おまかせは必ず組める持ち込みで、コストは9以上`：種 1〜200 の `autoDeck(makeRng(seed))` がすべて `validateDeck === null` かつ `deckCost >= 9`。同じ種なら同じ結果
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/app` / Expected: FAIL（モジュールがない）
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通るのを確かめる** — Run: `npx vitest run tests/app` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "設定・持ち込み・戦績の保存と、カード選びの計算を追加"`

---

### Task 3: CPU を本物の Worker で動かす

**Files:**
- Modify: `src/ai/client.ts`
- Create: `src/app/cpu.ts`
- Test: `tests/ai/client.test.ts`（足す）

**Interfaces:**
- Produces:
  ```ts
  // client.ts（変更）
  export interface WorkerLike {
    postMessage(m: ThinkRequest): void;
    onmessage: ((e: { data: ThinkResponse }) => void) | null;
    onerror: ((e: unknown) => void) | null;
    terminate?(): void;
  }
  export interface CpuClient {
    think(view: GameState, side: Side, level: Level, seed: number): Promise<Action>;
    dispose(): void;   // 待っている頼みをすべて reject('CPU を止めました')、terminate があれば呼ぶ
  }
  export function createCpuClient(worker: WorkerLike, opts?: { timeoutMs?: (level: Level) => number }): CpuClient;
  // 既定の timeoutMs は LEVELS[level].timeLimitMs + 3000。過ぎたら reject('CPU が時間内に答えませんでした')
  // onerror が来たら、待っている頼みをすべて reject('CPU が止まりました')
  // src/app/cpu.ts
  export function createBrowserCpu(): CpuClient; // new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' })
  ```

- [ ] **Step 1: 失敗するテストを書く**（偽の Worker に `onerror` を足す）
  - `Worker が落ちたら待っている頼みが reject される`：2つ頼んだあと `onerror` を呼ぶ → 2つとも `'CPU が止まりました'`
  - `答えが来なければ時間切れで reject`：答えない偽の Worker、`timeoutMs: () => 20` → `'CPU が時間内に答えませんでした'`
  - `dispose で待ちが reject され、あとから来た答えは捨てる`
  - 今ある3件のテストもそのまま通る
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/ai/client.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**（`setTimeout` を使う。時間切れや reject のあとは待ち一覧から消す）
- [ ] **Step 4: 確かめる** — Run: `npm test` と `npm run typecheck` / Expected: PASS。さらに仮のタイトル画面に一時的なボタンを置き、`createBrowserCpu().think(...)` が初期局面で手を返すのをブラウザで確かめたら、そのボタンは消す
- [ ] **Step 5: コミット** — `git commit -m "CPU の Worker が落ちたとき・答えないときに待ち続けないようにし、本物の Worker を作る口を追加"`

---

### Task 4: 対局の進行役

**Files:**
- Create: `src/app/match.ts`
- Test: `tests/app/match.test.ts`

**Interfaces:**
- Consumes: `createGame`, `applyAction`, `legalActions`, `viewFor`, `filterEventsFor`, `LEVELS`, `CpuClient`, `makeRng`
- Produces:
  ```ts
  export interface Step { actor: Side; events: GameEvent[]; before: GameState; after: GameState } // events・before・after は人間側から見た形
  export interface Presenter { present(step: Step): Promise<void> }
  export type MatchPhase = 'human' | 'cpu' | 'presenting' | 'over' | 'disposed';
  export interface Match {
    view(): GameState;               // 人間側から見た今の局面
    legal(): Action[];               // phase が 'human' のときだけ中身がある。legalActions(view()) の結果
    phase(): MatchPhase;
    result(): Result | null;
    start(): Promise<void>;          // 人間が先手なのですぐ返る（将来、後手もできる形）
    submit(a: Action): Promise<void>;// 人間の行動 → 演出 → CPU の考え → 演出 → 人間の手番に戻るまで待つ。phase が 'human' 以外なら何もしない
    dispose(): void;                 // 以降、present も onOver も呼ばない
  }
  export function createMatch(opts: {
    level: Level; humanDeck: CardId[]; cpu: CpuClient; presenter: Presenter;
    onOver?(r: Result): void; seed?: number;
  }): Match;
  ```
- 人間は先手。CPU の持ち込みは `LEVELS[level].deck`
- CPU に渡すのは `viewFor(real, 'gote')`、種は `seed`（既定 `Date.now()`）から `makeRng` で毎手引く
- CPU が reject したとき・返した手が `applyAction(real, …)` で例外になったとき：`legalActions(viewFor(real,'gote'))` を順に試し、本当の局面でも通る最初の手を指す（`console.warn` に理由を出す）
- 罠の発動などで手番が自動で回った（`passed`）ときも、`real.turn` を見て次が CPU なら続けて考える
- 戦績は書かない（画面の側が `onOver` で書く。進行役を保存から切り離すため）

- [ ] **Step 1: 失敗するテストを書く**（偽の CPU：頼まれた局面の `legalActions` から種で選ぶ／わざと失敗する／答えを保留する、の3種。偽の演出役：受け取った `Step` を配列にためる）
  - `人間の手のあと、CPU の手まで演出してから人間の手番に戻る`：初期局面で `legal()[0]` を `submit` → `present` が2回（actor が sente、gote の順）、そのあと `phase() === 'human'`
  - `演出に渡るのは人間側から見た形`：CPU が落とし穴を伏せる偽の CPU → その `Step.events` の `trapSet` は `cardId: null, at: null`、`after.traps` の CPU の罠も隠れている
  - `CPU の伏せた罠があっても、人間の行動の一覧は本当の局面と同じ`：CPU の落とし穴・鏡の結界・成り封じが伏せてあり、人間が全種類のカードを持つ局面で、`legal()` と `legalActions(real)` が（並び順も含めて）`toEqual`
  - `演出中・CPU の思考中の submit は無視`：保留する偽の CPU で `submit` 中にもう一度 `submit` → 局面は1手分しか進まず、`present` も増えない
  - `CPU が失敗しても対局は続く`：常に reject する偽の CPU、また反則の手を返す偽の CPU → どちらも `present` が2回、`real` の手数が2進む
  - `途中で dispose すると、あとから届いた答えでは何も起きない`：保留中に `dispose` → 答えを返しても `present` は1回のまま、`onOver` も呼ばれない
  - `決着したら onOver を1回呼び、そのあとの submit は無視`：王を取れる局面を `emptyState` から作って取る手を `submit` → `onOver` が `{ winner:'sente', reason:'king-captured' }` で1回、`phase() === 'over'`
  - 進行役は本当の局面を `createGame` で作るので、テスト用に局面を差し込む口として `createMatch` の `opts.initial?: GameState`（テスト専用とコメントを書く）を足してよい
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/app/match.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通るのを確かめる** — Run: `npx vitest run tests/app` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "対局の進行役（人間と CPU の手を順に適用して演出役に渡す）を追加"`

---

### Task 5: タップを行動に変える

**Files:**
- Modify: `src/cards/types.ts`（`prompt?: string` を足す）, `src/cards/magic.ts`, `src/cards/trap.ts`, `src/cards/equip.ts`
- Create: `src/view/input.ts`
- Test: `tests/view/input.test.ts`

**Interfaces:**
- Consumes: `legalActions`, `pieceTargets`, `CARDS`
- Produces:
  ```ts
  export type InputState =
    | { mode: 'idle' }
    | { mode: 'piece'; from: Square }
    | { mode: 'drop'; kind: HandKind }
    | { mode: 'promote'; from: Square; to: Square; second?: Square }        // 成る／成らないを聞いている
    | { mode: 'second'; from: Square; to: Square; promote: boolean }        // 韋駄天の2回目を選ぶか止めるか
    | { mode: 'card'; uid: number; picked: Square[] }
    | { mode: 'pick'; uid: number };                                        // 呼び戻す駒の種類を選ぶ
  export type InputEvent =
    | { type: 'square'; sq: Square } | { type: 'hand'; kind: HandKind } | { type: 'useCard'; uid: number }
    | { type: 'promote'; yes: boolean } | { type: 'pick'; kind: HandKind } | { type: 'stop' } | { type: 'cancel' };
  export interface Highlight { sq: Square; kind: 'move' | 'equipMove' | 'capture' | 'target' | 'selected' }
  export interface InputResult {
    state: InputState; action?: Action; highlights: Highlight[];
    prompt?: string;            // 案内の帯に出す文
    choices?: HandKind[];       // mode 'pick' のときの選択肢
  }
  export function reduceInput(view: GameState, legal: Action[], st: InputState, ev: InputEvent): InputResult;
  export function cardUsable(legal: Action[], uid: number): boolean;
  ```
- `action` は必ず `legal` の要素そのもの（`toBe` で同じもの）
- `equipMove`：その駒の装備を外した局面の `pieceTargets` に入っていない移動先（天馬の蹄で増えたマス）。`capture`：相手の駒がいるマス
- 対象が2つのカード（入れ替えの術）は選ぶ順を問わない。1つ目のあとは、それと組になれるマスだけを光らせる。選び済みのマスをもう一度タップしたら外す
- 対象なしのカード（凍てつく盤・鏡の結界・成り封じ）は `useCard` ですぐ `action`。呼び戻しは `mode: 'pick'`
- 光っていないマスのタップ：自分の駒なら選び直し、それ以外は `idle`。`cancel` はいつでも `idle`
- カードの `prompt`（そのまま使う文）：押し返しの風 `押し戻す相手の駒を選んでください`／入れ替えの術 `入れ替える自分の駒を2つ選んでください`／落雷 `壊す相手の駒を選んでください`／呼び戻し `呼び戻す駒の種類を選んでください`／落とし穴 `落とし穴を仕掛けるマスを選んでください`／装備4枚 `装備を付ける自分の駒を選んでください`。そのほかの案内：成り `成りますか？`、韋駄天 `もう1回動かせます（動かさなくても終われます）`

- [ ] **Step 1: 失敗するテストを書く**（局面は `tests/helpers.ts` で作る）
  - `駒を選ぶと動けるマスが光り、そこをタップすると行動になる`：初期局面、(2,6) の歩 → `move` が1つ光り、(2,5) をタップ → `legal` の中の同じ物（`toBe`）
  - `天馬の蹄で増えたマスは equipMove`：空の盤の (4,6) に `tenma` 付きの先手の金 → (3,4)・(5,4) が `equipMove`、(4,5) は `move`
  - `成れるときは聞く／必ず成るときは聞かない`：(2,3) の銀 → (2,2) で `mode:'promote'`、`yes:false` で成らない行動。(0,1) の歩 → (0,0) はすぐ成る行動
  - `韋駄天：2回目を選ぶか止められる`：`idaten` の金で1回目 → `mode:'second'`、`stop` で `second` なしの行動、2回目のマスで `second` 付きの行動。2回目に相手の駒のマスは光らない
  - `持ち駒を打つ`：持ち駒の歩 → 二歩になる筋は光らない、空きマスで `drop`
  - `入れ替えの術は順不同`：(8,8)→(0,8) の順に選んでも `legal` の中の `[ (0,8),(8,8) ]` の行動が返る
  - `対象なしのカードはすぐ使う／呼び戻しは種類を選ぶ`：`itetsuku` の `useCard` → 行動。`yobimodoshi` → `choices` が相手の持ち駒の種類、`pick` で `pick` 付きの行動
  - `使えないカード`：対象のない落雷 → `cardUsable === false`、`useCard` しても `idle` のまま
  - `どのカードも案内の文がある`：`targetSets` が対象を取りうる9枚（上の一覧）の `CARDS[id].prompt` が上の文と一致
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/view/input.test.ts` / Expected: FAIL
- [ ] **Step 3: `prompt` をカード定義に足し、`reduceInput`・`cardUsable` を実装する**
- [ ] **Step 4: 通るのを確かめる** — Run: `npm test` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "タップを合法な行動に変える仕組みと、カードごとの案内の文を追加"`

---

### Task 6: カードの札と絵・カード図鑑

**Files:**
- Create: `src/view/cardArt.ts`, `src/app/screens/zukan.ts`
- Modify: `src/app/style.css`
- Test: `tests/view/cardArt.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const CARD_ART: Record<CardId, string>;   // viewBox="0 0 46 62" の中身（SVG の要素の文字列）
  export const KIND_MARK: Record<CardKind, { mark: '魔' | '罠' | '装'; label: '魔法' | '罠' | '装備'; color: 'mahou' | 'wana' | 'soubi' }>;
  export function cardHtml(id: CardId, opts?: { size?: 'hand' | 'small' | 'large'; count?: number }): string; // 試作の .card と同じ組み立て
  ```
- 絵は試作の4枚（落雷・鏡の結界・天馬の蹄・押し返しの風）をそのまま移し、残り8枚を同じ描き方（墨の太い線＋種類の色1つ＋金箔をひと差し）で描く：入れ替えの術＝交差する2本の弧の矢と2つの駒／凍てつく盤＝六方の霜の結晶が盤の格子にかかる／呼び戻し＝手招きする袖と五角形の駒／落とし穴＝割れた地面と口を開けた黒い穴／成り封じ＝「封」の字の朱印が駒に押される／鋼の鎧＝鉄の胴の板の重なり／王の盾＝六角の盾に王の字／韋駄天＝風を切る草鞋と2本の速さの線
- 札の大きさ：手札 74×112（試作の通り）、`small` 36×54（名前は出さずコストと印だけ）、`large` 180×272

- [ ] **Step 1: 失敗するテストを書く**
  - `12枚すべてに絵がある`：`Object.keys(CARDS)` の各 id で `CARD_ART[id]` が空でなく、`<script`・`on` で始まる属性を含まない
  - `札の HTML にコスト・名前・種類の印が入る`：`cardHtml('rakurai')` に `'4'`・`'落雷'`・`'魔'`、`count: 2` で `'二'`
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/view/cardArt.test.ts` / Expected: FAIL
- [ ] **Step 3: 絵・札・図鑑の画面を作る**（図鑑はタイトルの「カード図鑑」から開く。説明は `CARDS[id].text`）
- [ ] **Step 4: 確かめる** — Run: `npx vitest run tests/view` と `npm run typecheck` / Expected: PASS。ブラウザを 375×812 にして図鑑の12枚を見て、絵が札からはみ出ない・名前の縦書きが切れないのを確かめる。画面を撮ってユーザーに送る（`SendUserFile`）
- [ ] **Step 5: コミット** — `git commit -m "12枚のカードの絵と札、カード図鑑の画面を追加"`

---

### Task 7: 3D の盤と駒

**Files:**
- Create: `src/view/fit.ts`, `src/view/stage.ts`, `src/view/board3d.ts`, `src/view/pieces3d.ts`
- Test: `tests/view/fit.test.ts`

**Interfaces:**
- Consumes: `PAL`, `GameState`, `isInCheck`, `Highlight`
- Produces:
  ```ts
  // fit.ts（試作の fitCamera の計算を取り出したもの）
  export function cameraDistance(aspect: number, fovDeg: number): number; // max(5.75/(tan(fov/2)*aspect), 6.4/tan(fov/2))
  // stage.ts
  export interface Stage {
    scene: THREE.Scene; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement;
    home: { pos: THREE.Vector3; look: THREE.Vector3 };     // 普段の視点（画面の大きさが変わるたびに計算し直す）
    cam: { pos: THREE.Vector3; look: THREE.Vector3 };      // 今の視点（演出が動かす）
    shake: number;                                         // 揺れの強さ（毎フレーム減る）
    tween(ms: number, fn: (t: number) => void, ease?: (t: number) => number): Promise<void>;
    onFrame(fn: (dt: number, now: number) => void): () => void;  // 戻り値で外す
    mode: 'title' | 'match';                               // title：盤の周りをゆっくり回る
    attach(el: HTMLElement): void;                         // 画面ごとに描画先を付け替える（renderer は1つを使い回す）
  }
  export function getStage(): Stage;
  export const easeOut: (t: number) => number; export const easeInOut: (t: number) => number;
  // board3d.ts
  export function squareAt(stage: Stage, clientX: number, clientY: number): Square | null;
  export function squarePos(sq: Square): THREE.Vector3;          // 試作の sq(c, r)：((c-4)*1, 0, (r-4)*1.1)
  export function setHighlights(stage: Stage, hs: Highlight[], lastMove: Square[]): void;
  // pieces3d.ts
  export function pieceMesh(id: number): THREE.Object3D | undefined;
  export function sync(stage: Stage, view: GameState, me: Side): void;  // 駒の位置・向き・成り（裏の字は赤）・装備の六角形と印・自分の落とし穴の印・王手の輪・凍っている側の青み を局面どおりに揃える
  ```
- 盤・脚・木目・駒の形・字の貼り方・光は試作の値をそのまま使う。木目の乱数は `makeRng(1)` にして毎回同じ木目にする
- 成り駒の字：と・成香・成桂・成銀・馬・竜（成香・成桂・成銀は1文字にするため 杏・圭・全 を使う）。字の色は紅。王は先手が「玉」、後手が「王」
- 装備の六角形：試作の金の輪（`RingGeometry` の6角）に、その装備の札の絵を小さな板にして中央に乗せる
- `squareAt` は盤の上面の平面とレイの交点から求める（駒に当たらなくてもマスが取れるように）

- [ ] **Step 1: 失敗するテストを書く** — `tests/view/fit.test.ts`
  - `縦長の画面でも横幅9.9の盤が収まる`：aspect 375/520、fov 38 のとき、距離 d で見える横幅 `2*d*tan(19°)*aspect >= 11.5`
  - `横長の画面では縦で決まる`：aspect 2 のとき `d === 6.4/tan(19°)`（`toBeCloseTo`）
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/view/fit.test.ts` / Expected: FAIL
- [ ] **Step 3: 盤と駒を作る**（タイトル画面の仮の中身を、ゆっくり回る盤に差し替える）
- [ ] **Step 4: 確かめる** — `npm run typecheck`。ブラウザ 375×812 と 375×667 で、タイトルの盤が回る・初期配置の駒が並ぶ（後手の駒が逆向き）・コンソールにエラーがないのを確かめ、画面を撮ってユーザーに送る
- [ ] **Step 5: コミット** — `git commit -m "3D の盤と駒、局面どおりに駒を揃える sync を追加"`

---

### Task 8: 対局画面（演出なしで最後まで指せる）

**Files:**
- Create: `src/view/hud.ts`, `src/app/screens/match.ts`, `src/fx/player.ts`（この時点では `present` は「駒を 160ms で動かして `sync`」だけ）
- Modify: `src/app/style.css`

**Interfaces:**
- Consumes: `createMatch`, `createBrowserCpu`, `reduceInput`, `cardUsable`, `getStage`, `sync`, `squareAt`, `setHighlights`, `cardHtml`
- Produces:
  ```ts
  // hud.ts
  export interface Hud {
    render(view: GameState, me: Side, opts: { thinking: boolean; level: Level }): void; // 帯・駒台・伏せ札・手札を描き直す
    setPrompt(text: string | null, opts?: { stop?: boolean; choices?: HandKind[] }): void;
    askPromote(): void;          // 成る／成らないの2つのボタン
    on(ev: 'hand' | 'card' | 'use' | 'promote' | 'pick' | 'stop' | 'cancel', fn: (arg?: unknown) => void): void;
    lock(locked: boolean): void; // 演出中・思考中は押せない見た目にする
    root: HTMLElement;
  }
  export function createHud(root: HTMLElement): Hud;
  // fx/player.ts
  export function createPresenter(stage: Stage, hud: Hud, me: Side): Presenter;
  ```
- 画面の組み立ては試作の通り（上の帯・盤・下の帯・手札・説明の板・案内の帯）。持ち駒は五角形の駒札（CSS の `clip-path`）に字と枚数（「歩 三」のように漢数字）。CPU の考え中は上の帯に「考えています」と小さく、`aria-live="polite"` で読み上げる
- 「残り札」：相手の `cards` のうち `used` でないものを `small` の札で並べた板を開く（`viewFor` が伏せた罠を未使用に見せるので、そのまま並べてよい）
- 手札で使えないカードは薄くし、説明の板の「使う」を押せなくして「今は使えません」と書く
- 決着したら `showScreen('result', { result, level })`。この時点の結果画面は仮でよい（タスク13で仕上げる）

- [ ] **Step 1: 確かめる手順を先に書く**（このタスクは画面なので自動テストの代わりに、次の手順を通す）
  1. `npm run dev`、ブラウザを 375×812 にして、仮の強さ選び（ここでは「弱い」固定でよい）から対局を始める
  2. 駒を選ぶ → 光る → 動かす。持ち駒を打つ。成る／成らないを選ぶ。カード（落雷・入れ替えの術・呼び戻し・凍てつく盤・落とし穴・装備）を1回ずつ使う
  3. CPU の考え中に盤や手札を連打しても何も起きない
  4. 対局を最後（王を取る・取られる）まで指し、結果の仮画面に移る。途中でコンソールにエラーが出ない
- [ ] **Step 2: hud・対局画面・仮の演出役を作る**
- [ ] **Step 3: Step 1 の手順を通す** — 通らなかった所は superpowers:systematic-debugging で原因を確かめて直す。画面を撮ってユーザーに送る
- [ ] **Step 4: 全体を確かめる** — Run: `npm test` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "対局画面を追加（演出なしで CPU と最後まで指せる）"`

---

### Task 9: 演出の段取り

**Files:**
- Create: `src/fx/plan.ts`
- Test: `tests/fx/plan.test.ts`

**Interfaces:**
- Consumes: `GameEvent`, `CARDS`, `Settings`
- Produces:
  ```ts
  export type Cue =
    | { kind: 'move'; side: Side; pieceId: number; from: Square; to: Square; promoted: boolean; captured?: { pieceId: number; at: Square } }
    | { kind: 'drop'; side: Side; pieceId: number; piece: HandKind; to: Square }
    | { kind: 'magic'; side: Side; cardId: CardId; targets: Square[]; effects: GameEvent[]; negated: boolean }
    | { kind: 'trapSet'; side: Side; cardId: CardId | null; at: Square | null }
    | { kind: 'trapFire'; owner: Side; cardId: CardId; at: Square | null; effects: GameEvent[] }
    | { kind: 'equip'; side: Side; pieceId: number; cardId: CardId }
    | { kind: 'armor'; defenderId: number; attackerId: number; at: Square }
    | { kind: 'second'; pieceId: number; from: Square; to: Square; promoted: boolean }   // 韋駄天の2回目
    | { kind: 'notice'; text: string }                                                   // 小さな知らせ
    | { kind: 'check'; side: Side }
    | { kind: 'gameOver'; result: Result };
  export function planFx(events: GameEvent[], actor: Side): Cue[];
  export interface FxTiming { scale: number; camera: boolean; shake: boolean; flashMax: number }
  export function fxTiming(settings: Settings, reducedMotion: boolean): FxTiming;
  ```
- まとめ方：
  - `captured` は直後の `moved` にまとめて1つの `move`。同じ駒の2つ目の `moved`（同じ行動の中）は `second`
  - `cardUsed`（魔法）は、そのあとの `pushed`・`swapped`・`destroyed`（`cause` がそのカード）・`frozen`・`handTransferred` を `effects` に取り込む。`cardUsed`（装備）は直後の `equipped` と合わせて `equip` 1つ
  - `trapTriggered` は新しい `trapFire` を始め、直後の `destroyed`・`promotionBlocked`・`magicNegated` を `effects` に取り込む。`magicNegated` があれば、その前の `magic` の `negated` を `true` にする（演出は「魔法が飛ぶ → 鏡が跳ね返す」の順に流す）
  - `trapFire` は、取り込んだ出来事を含めてその場で流す。その前の `move` や `magic` が先、`trapFire` があと（出来事の順を保つ）
  - `notice` の文：`passed` → `相手は指せる手がないので、手番が戻りました`（人間なら `指せる手がないので、手番が相手に移りました`）／`secondMoveSkipped` → `2回目の移動はできませんでした`／`armorBlocked` は `armor` に、`promotionBlocked` は `trapFire` の中
- `fxTiming`：`long` は `scale 1`、`short` は `scale 0.5`。動きを減らす設定なら `camera:false, shake:false, flashMax:0.4`、それ以外は `true, true, 0.9`

- [ ] **Step 1: 失敗するテストを書く**（実際の `applyAction` で出来事を作り、`filterEventsFor(…, 'sente')` を通して渡す）
  - `ふつうの移動と駒取りは move 1つ`
  - `落雷は magic 1つで、破壊が effects に入る`
  - `押し返した先の落とし穴：magic のあとに trapFire`：押し返しの風で落とし穴のマスへ押す → `[magic, trapFire]`、`trapFire.effects` に `destroyed`
  - `鏡の結界：magic が negated になり、そのあとに kagami の trapFire`
  - `成り封じ：trapFire（promotionBlocked 入り）のあとに move（promoted:false）`
  - `CPU が伏せた罠は中身なしの trapSet`：`cardId:null, at:null`
  - `韋駄天：move と second`、`鋼の鎧：armor`、`王手：check`、`決着：最後が gameOver`
  - `演出の長さと動きを減らす設定`：`fxTiming({fx:'short',volume:1}, true)` が `{ scale:0.5, camera:false, shake:false, flashMax:0.4 }`
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/fx/plan.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通るのを確かめる** — Run: `npx vitest run tests/fx` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "出来事の記録を演出の段取りにまとめる planFx を追加"`

---

### Task 10: 演出の共通の道具と、魔法5枚

**Files:**
- Create: `src/fx/kit.ts`, `src/fx/magic.ts`
- Modify: `src/fx/player.ts`（`planFx` の段取りを順に流す形にする。最後に必ず `sync`）

**Interfaces:**
- Consumes: `Stage`, `Cue`, `FxTiming`, `pieceMesh`, `squarePos`, `cardHtml`
- Produces:
  ```ts
  // kit.ts（試作の同名の処理を移したもの。時間はすべて timing.scale を掛ける）
  export interface FxCtx { stage: Stage; hud: Hud; timing: FxTiming; me: Side; wait(ms: number): Promise<void> }
  export function flash(ctx: FxCtx, color: string, peak: number, ms: number): void;      // peak は flashMax で頭打ち
  export function speedLines(ctx: FxCtx, on: boolean): void;
  export function cutIn(ctx: FxCtx, word: string, sub: string, band: 'mahou' | 'wana' | 'soubi', ms?: number): Promise<void>;  // 墨しぶき＋筆文字
  export function cardFly(ctx: FxCtx, cardId: CardId, from: 'me' | 'foe'): Promise<void>;   // 自分は手札から、相手は上の帯から飛ぶ
  export function cameraTo(ctx: FxCtx, at: THREE.Vector3, ms: number): Promise<void>;      // camera:false なら瞬時
  export function cameraHome(ctx: FxCtx, ms: number): Promise<void>;
  export function shakeBy(ctx: FxCtx, amount: number): void;                               // shake:false なら何もしない
  export function shatter(ctx: FxCtx, pieceId: number): void;
  export function dim(ctx: FxCtx, opacity: number): void;
  // magic.ts
  export const MAGIC_FX: Record<'oshikaeshi' | 'irekae' | 'rakurai' | 'itetsuku' | 'yobimodoshi', (ctx: FxCtx, cue: Extract<Cue, { kind: 'magic' }>) => Promise<void>>;
  export function playMagic(ctx: FxCtx, cue: Extract<Cue, { kind: 'magic' }>): Promise<void>; // 共通の流れ ＋ MAGIC_FX[CARDS[id].fx]
  ```
- 魔法の共通の流れ（長めの時間。試作の値）：札が飛ぶ 520 → 間 260 と白い光 → 集中線 → カメラが対象へ 620（対象なしは盤の中央）→ カットイン 1000（字＝カード名、下の小さな札＝`魔法・コスト4`）→ 効果 → 揺れ → 900 待ってカメラが戻る 900。`negated` のときは効果の代わりにタスク11の `kagami` の演出を呼んで終わる
- カードごとの効果：
  - 押し返しの風：藍の風の帯が手前から奥へ3本流れ、駒が1マス滑って戻り、足元に土ぼこり
  - 入れ替えの術：2つの駒が 1.2 浮き、交差する弧を描いて入れ替わる。着地で白い煙の輪
  - 落雷：試作の通り（暗くなる → 雷3回 → 砕け散り → 焦げ跡）
  - 凍てつく盤：盤の中央から霜の模様が丸く広がり（盤の上の板に描いた霜を広げる）、相手の駒が青白くなる。青みは `sync` が `view.frozen` を見て付け外しする
  - 呼び戻し：相手の駒台の駒札が藍の尾を引いて自分の駒台へ弧を描いて飛ぶ（HTML の動き）

- [ ] **Step 1: 確かめる手順を書く** — 開発中だけ使える演出の試し口を作る：`?fx=rakurai` のように付けて開くと、その魔法を使える局面で対局画面が開き、`Space` キーで自分がそのカードを使う（`import.meta.env.DEV` のときだけ有効）
- [ ] **Step 2: 共通の道具・魔法5枚・再生の形を作る**
- [ ] **Step 3: 目で確かめる** — 5枚それぞれを `?fx=` で開いて流し、長め・短め、動きを減らす設定（ブラウザの `prefers-reduced-motion` の切り替え）でも見る。演出のあと盤の駒が局面どおり（`sync`）・操作できる・コンソールにエラーなし。落雷・凍てつく盤の画面を撮ってユーザーに送る
- [ ] **Step 4: 全体を確かめる** — Run: `npm test` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "魔法5枚の演出と、カットイン・カメラ・揺れなどの共通の道具を追加"`

---

### Task 11: 罠・装備・王手・決着の演出

**Files:**
- Create: `src/fx/trap.ts`, `src/fx/equip.ts`, `src/fx/finale.ts`
- Modify: `src/fx/player.ts`

**Interfaces:**
- Consumes: `kit.ts` の道具, `Cue`
- Produces:
  ```ts
  export const TRAP_FX: Record<'otoshiana' | 'kagami' | 'narifuuji', (ctx: FxCtx, cue: Extract<Cue, { kind: 'trapFire' }>) => Promise<void>>;
  export function playTrapSet(ctx: FxCtx, cue: Extract<Cue, { kind: 'trapSet' }>): Promise<void>;
  export function playTrapFire(ctx: FxCtx, cue: Extract<Cue, { kind: 'trapFire' }>): Promise<void>;
  export const EQUIP_FX: Record<'tenma' | 'hagane' | 'tate' | 'idaten', (ctx: FxCtx, cue: Extract<Cue, { kind: 'equip' }>) => Promise<void>>;
  export function playArmor(ctx: FxCtx, cue: Extract<Cue, { kind: 'armor' }>): Promise<void>;
  export function playSecond(ctx: FxCtx, cue: Extract<Cue, { kind: 'second' }>): Promise<void>;
  export function playCheck(ctx: FxCtx, cue: Extract<Cue, { kind: 'check' }>): Promise<void>;
  export function playGameOver(ctx: FxCtx, cue: Extract<Cue, { kind: 'gameOver' }>, kingAt: Square | null): Promise<void>;
  ```
- 罠を伏せる：静かに。札が伏せ札の枠へ裏向きで滑り込む（300ms）。落とし穴なら自分にだけマスに罠の印（試作の点線の印）
- 罠の発動の共通の流れ：その伏せ札の枠が勢いよくめくれる（Y 軸回転 180°、200ms）→ 紅い光が画面を横に走る → カットイン（紅の帯）→ 効果
  - 落とし穴：マスが割れて黒い穴が開き、駒が回りながら落ちて消える。穴は閉じる
  - 鏡の結界：画面の前に金の縁の丸い鏡が現れ、飛んできた魔法の札が当たって砕ける。カットインの下の札は `無効`
  - 成り封じ：駒が裏返りかけたところに紅の「封」の判が叩きつけられ、表に戻る
- 装備の共通の流れ：札が飛ぶ → 金の光の柱が駒に降りる（700ms）→ 足元に金の六角形が現れる（以降は `sync` が出し続ける）。カットインは短く（600ms、金の帯）
  - 天馬の蹄：光の柱に羽の粒。王の盾：駒の周り3×3に金の薄い半球が一瞬かかる。鋼の鎧：駒の表面に鉄色の光がひと筋走る。韋駄天：足元から風の筋
  - 鋼の鎧が守った（`armor`）：攻めた駒が突っ込んで弾き返され、金属の火花と揺れ。六角形が割れて消える
  - 韋駄天の2回目（`second`）：速く（120ms）動き、通った跡に駒の残像を3つ残して消す
- 王手：紅の帯に筆文字「王手」（700ms、カメラは動かさない）。王手中の王の輪は `sync` が出す
- 決着：取られる王へカメラが寄る → 時間がゆっくり（0.25 倍）→ カメラが王の周りを一周（2400ms、`camera:false` なら省く）→ 取られた王が回りながら天高く飛ぶ → 結果画面へ。引き分けは盤全体を映して幕が引かれるだけ

- [ ] **Step 1: 確かめる手順を書く** — タスク10の試し口を `?fx=otoshiana`・`kagami`・`narifuuji`・`tenma`・`hagane`・`tate`・`idaten`・`check`・`win`・`lose` に広げる。罠は CPU が伏せた状態で始まり、`Space` で自分がその罠を踏む行動をする
- [ ] **Step 2: 演出を作る**
- [ ] **Step 3: 目で確かめる** — 全部の `?fx=` を流し（長め・短め・動きを減らす設定）、演出のあと盤が局面どおり・コンソールにエラーなし。鏡の結界と決着の画面を撮ってユーザーに送る
- [ ] **Step 4: 全体を確かめる** — Run: `npm test` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "罠・装備・王手・決着の演出を追加"`

---

### Task 12: 効果音

**Files:**
- Create: `src/fx/sound.ts`
- Modify: `src/fx/kit.ts`・`magic.ts`・`trap.ts`・`equip.ts`・`finale.ts`・`player.ts`・`src/app/main.ts`（鳴らす所）

**Interfaces:**
- Produces:
  ```ts
  export type SoundName = 'hyoshigi' | 'tick' | 'whoosh' | 'thunder' | 'shatter' | 'wind' | 'frost' | 'flip' | 'stamp' | 'clang' | 'chime' | 'drum';
  export interface Sound { unlock(): void; play(name: SoundName, opts?: { gain?: number }): void; setVolume(v: number): void }
  export function getSound(): Sound;   // AudioContext は最初の unlock で作る。作れなければ何もしない Sound
  ```
- 合成のしかた（音のファイルは使わない）：拍子木＝短い雑音を 2.2kHz で帯域を絞り 40ms で消す、を 90ms 空けて2回／駒の音 `tick`＝同じものを1回・小さく／`thunder`＝低域を残した雑音のうなり 1.6 秒／`whoosh`・`wind`＝雑音の帯域を上から下へ動かす／`clang`＝倍音のずれた正弦波4つを 1.2 秒で消す／`stamp`＝低い正弦波 90Hz の短い打撃／`chime`＝金の光の高い正弦波2つ／`drum`＝決着の太鼓
- 鳴らす所：幕の切り替え＝`hyoshigi`、駒の移動と打つ＝`tick`、カットイン＝`hyoshigi`、落雷＝`thunder`＋`shatter`、押し返しの風＝`wind`、入れ替えの術＝`whoosh`、凍てつく盤＝`frost`、罠の発動＝`flip`、成り封じ＝`stamp`、鋼の鎧＝`clang`、装備＝`chime`、決着＝`drum`
- `main.ts` の最初の `pointerdown` で `unlock()`（設計書：音は最初の操作のあとに鳴らし始める）。音量は設定の `volume`

- [ ] **Step 1: 確かめる手順を書く** — 設定画面ができるまでは、`?fx=` の試し口で音を聞く。ユーザーに「音が鳴る所を確かめてください」と頼む（Claude は音を聞けないので、鳴る仕組みが例外なく動くことまでを自分で確かめる）
- [ ] **Step 2: 音を作り、鳴らす所に足す**
- [ ] **Step 3: 確かめる** — ブラウザのコンソールで `AudioContext` の状態が `running` になること、各演出でエラーが出ないこと。音の聞こえ方はユーザーに確かめてもらい、その結果をそのまま報告する
- [ ] **Step 4: 全体を確かめる** — Run: `npm test` と `npm run typecheck` / Expected: PASS
- [ ] **Step 5: コミット** — `git commit -m "拍子木・雷鳴などの効果音を合成して鳴らす"`

---

### Task 13: タイトル・強さ選び・カード選び・札見せ・結果・設定

**Files:**
- Create/Modify: `src/app/screens/title.ts`・`level.ts`・`deck.ts`・`reveal.ts`・`result.ts`・`settings.ts`, `src/app/style.css`

**Interfaces:**
- Consumes: `storage.ts`・`deck.ts` のすべて, `cardHtml`, `getStage`, `getSound`, `showScreen`
- 画面の行き来（`params` の形）：
  - `title` → `level` / `zukan` / `settings`
  - `level` → `deck`（`{ level }`）
  - `deck`（`{ level }`）→ `reveal`（`{ level, deck }`）。「対局へ」で `saveDeck`。前回の持ち込み（`loadDeck`）があればそれで始め、なければ空
  - `reveal` → `match`（`{ level, deck }`）
  - `match` → `result`（`{ result, level, deck }`）。`onOver` で `recordResult`
  - `result` → 「もう一度」`reveal`（同じ `level`・`deck`）／「カードを組み直す」`deck`（`{ level }`）／「タイトルへ」`title`
  - どの画面にも左上に「戻る」（`title` 以外）。対局中の「戻る」は `投了してタイトルへ戻りますか？` と確かめ、はいなら負けとして記録して `match.dispose()`
- 見た目は「見た目の決めごと」の表の通り
- 設定：演出の長さ・音の大きさを変えたらすぐ保存し、すぐ効く（`getSound().setVolume`、`fxTiming`）

- [ ] **Step 1: 確かめる手順を書く**
  1. 375×812 と 375×667 で全画面を開き、文字やボタンが切れない・重ならない・横にはみ出してスクロールしない
  2. カード選び：コストが10を超える札を足そうとすると理由が出て足せない。「おまかせ」で組める。対局を始めてから戻ると、前回の持ち込みが残っている
  3. 結果の「もう一度」「カードを組み直す」「タイトルへ」がそれぞれの画面へ行く。強さ選びの戦績が増えている
  4. 設定を「短め」にすると演出が短くなる。再読み込みしても設定が残る
  5. Tab キーで全部のボタンに枠が付いて選べる
- [ ] **Step 2: 画面を作る**
- [ ] **Step 3: Step 1 の手順を通す**。各画面を撮ってユーザーに送る
- [ ] **Step 4: 全体を確かめる** — Run: `npm test` / `npm run typecheck` / `npm run build` / Expected: すべて通る
- [ ] **Step 5: コミット** — `git commit -m "タイトル・強さ選び・カード選び・札見せ・結果・設定の画面を仕上げる"`

---

### Task 14: 通しの確認

**Files:**
- Modify: `src/app/screens/match.ts`（自動対局の口）, `docs/superpowers/specs/2026-10-20-super-shogi-design.md`（状態を「計画3まで実装済み」に）, この計画書（実装後に変えたことを冒頭に書き足す）

**Interfaces:**
- 自動対局：`?auto=weak`（`normal`・`strong` も可）を付けると、人間側も2つ目の Worker の CPU（その強さ）が指し、演出は「短め」で流れ続ける。`import.meta.env.DEV` のときだけ有効

- [ ] **Step 1: 自動対局の口を作る**
- [ ] **Step 2: 通しで確かめる**（superpowers:verification-before-completion を読み込んでから）
  1. `?auto=weak` で3局、`?auto=normal` で1局、最後まで流す。毎局：結果画面まで行く・コンソールにエラーがない・途中で止まらない
  2. 自分の手で `弱い` に1局、最後まで指す（375×812）
  3. `npm run build` のあと `npm run preview` で同じことが1局できる（Worker と文字が組み立て後も読み込める）
  4. 確かめられなかったこと（音の聞こえ方、実機の iPhone での速さなど）を一覧にする
- [ ] **Step 3: 全体を確かめる** — Run: `npm test` / `npm run typecheck` / `npm run build` / Expected: すべて通る
- [ ] **Step 4: 書き残す** — 設計書の状態と、この計画書の冒頭に「実装後に変えたこと」を書く。開いたブラウザのタブ・手元のサーバーを閉じる
- [ ] **Step 5: コミット** — `git commit -m "自動対局で通しの確認をし、計画3の完了を書き残す"`
