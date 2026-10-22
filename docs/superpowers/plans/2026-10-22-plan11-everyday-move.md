# ふだんの1手 手順書（計画11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 駒を選ぶ・動かす・取る・成る・打つの動きと音を、短く気持ちいい手ざわりにする。

**Architecture:** 長さの計算は純粋な `src/fx/moveTiming.ts`、動きは新しい `src/fx/move.ts`（player.ts の move・drop の段取りから呼ぶ）。駒の裏の字と「選んだ駒を浮かせる」は `src/view/pieces3d.ts`、駒台に駒が収まる動きは `src/view/hud.ts` が描き直しのときに前後の枚数を比べて付ける。

**Tech Stack:** TypeScript・Three.js・Web Audio・Vitest・Vite

**Spec:** `docs/superpowers/specs/2026-10-22-everyday-move-design.md`

## Global Constraints

- コメント・コミットメッセージは日本語。コミットの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- PowerShell では `npm.cmd`（例：`npm.cmd test`）。Bash なら `npm`
- 演出のファイル（src/fx の kit.ts 以外）は舞台を直接さわらない：`ctx.tweenRaw / ctx.tween / ctx.wait / ctx.sync / transient / shakeBy` を通す（tests/fx/cancel-guard.test.ts が見張る）
- present は決して reject しない。最後に必ず sync（player.ts のいまの仕組みのまま）
- 長さは「長め」の値。「短め」は半分（FxTiming.scale を掛ける）。「動きを減らす」＝ `timing.camera === false`
- 王を取る手の移動は、いまどおり決着の演出（playGameOver）が動かす。韋駄天の2回目（playSecond）・札の演出には触らない
- 共有の材質（駒の木・字）を書き換えない。変えるときは複製

## Review Focus

1. 動いている途中で投了・画面の切り替え（打ち切り）→ 飛んでいる駒・浮いた駒が次の画面に残らない（Task 3 で clearTransients と sync を確かめる）
2. 駒を選んだまま相手の手番・演出が始まる／成るかを聞いている間 → 浮いた駒が演出とぶつからず、選ぶのをやめれば下りる（Task 2 のテスト）
3. 取る手で成る（取る＋成る）→ はじく動きと裏返しが両方、順に流れる（Task 3 の試し口 `?fx=capture` で成れる位置にする）
4. 後手（CPU）の駒の裏返し → 字が逆さ・鏡文字にならない（Task 3 の画面確認）
5. 持ち駒が同じ種類で2枚目になったとき → 駒台の既存の駒に「ポン」が付く（Task 4 のテスト）

---

### Task 1: 駒音を3つ足す

**Files:**
- Modify: `src/fx/sound.ts`（SoundName と RECIPES）
- Test: `tests/fx/sound.test.ts`

**Interfaces:**
- Produces: `SoundName` に `'koma' | 'komaHard' | 'kaesu'` を足す

- [ ] **Step 1: 失敗するテストを書く**（sound.test.ts の getSound の describe に足す）

```ts
it('駒音の3つも例外を出さない', () => {
  const s = getSound();
  expect(() => { s.play('koma'); s.play('komaHard'); s.play('kaesu'); }).not.toThrow();
});
```

- [ ] **Step 2: `npm test -- tests/fx/sound.test.ts` で型の失敗を確かめる**（vitest は型を見ないので、`npx tsc --noEmit` で SoundName に無い名前のエラーを確かめる）

- [ ] **Step 3: RECIPES に3つ足す**
  - `koma`：bandpass の雑音 dur 0.035・f0 1800・q 4 ＋ tone 820Hz→600Hz・0.07秒・gain 0.25。両方の周波数に `1 + (Math.random() - 0.5) * 0.08` を掛ける
  - `komaHard`：koma を gain 1.2 倍で鳴らし、tone 160Hz→90Hz・0.16秒・gain 0.45 を足す
  - `kaesu`：bandpass の雑音 dur 0.025・f0 3200・q 6 ＋ tone 1400Hz→1100Hz・0.05秒・gain 0.2
  - `tick` はそのまま（駒を選ぶ音になる）

- [ ] **Step 4: `npx tsc --noEmit` と `npm test` が通る**

- [ ] **Step 5: コミット**「駒音を3つ足す（パチン・強めのパチン・成りのカッ）」

---

### Task 2: 駒の裏の字と、選んだ駒を浮かせる

**Files:**
- Modify: `src/view/pieces3d.ts`
- Modify: `src/view/input.ts`（純粋な関数を1つ足す）
- Modify: `src/app/screens/match.ts`（show と submit から呼ぶ）
- Test: `tests/view/input.test.ts`、新規 `tests/view/pieces3d.test.ts`

**Interfaces:**
- Produces（pieces3d.ts）:
  - `backLabelOf(p: Piece): { ch: string; color: string } | null` — 成れる駒（FU KY KE GI KA HI）で、まだ成っていなければ成った字（PROMOTED の字・色 PALS.wana）。OU・KI・成った駒は null
  - `setLifted(stage: Stage, id: number | null): void` — その駒を浮かせ、かすかに上下させる。前に浮いていた駒は約120msで下ろす。同じ id なら何もしない
  - `releaseLift(): void` — 浮いている駒を、今の高さのまま手放す（下ろす動きもやめる）。このあと演出が位置を引き継ぐ
  - `LIFT_Y = 0.22`（浮く高さ。盤からの上乗せ）を export
- Produces（input.ts）: `liftedSquare(st: InputState): Square | null` — mode `piece` のとき `st.from`、`promote` と `second` のとき null（駒はもう動いた先を選んでいる＝下ろしておく）、ほかは null

- [ ] **Step 1: 失敗するテストを書く**

```ts
// tests/view/pieces3d.test.ts
import { describe, expect, it } from 'vitest';
import { backLabelOf } from '../../src/view/pieces3d';
const P = (kind: any, promoted = false) => ({ id: 1, kind, side: 'sente', promoted, frozen: 0, sealed: false, equip: null }) as any;
describe('backLabelOf', () => {
  it('歩の裏は「と」、飛車の裏は「竜」、色は紅', () => {
    expect(backLabelOf(P('FU'))?.ch).toBe('と');
    expect(backLabelOf(P('HI'))?.ch).toBe('竜');
    expect(backLabelOf(P('FU'))?.color).toBe(backLabelOf(P('KA'))?.color);
  });
  it('金・王・成った駒には裏の字がない', () => {
    expect(backLabelOf(P('KI'))).toBeNull();
    expect(backLabelOf(P('OU'))).toBeNull();
    expect(backLabelOf(P('FU', true))).toBeNull();
  });
});
```

```ts
// tests/view/input.test.ts に足す
describe('liftedSquare', () => {
  it('駒を選んでいるときだけ、そのマス', () => {
    expect(liftedSquare({ mode: 'piece', from: { c: 2, r: 6 } })).toEqual({ c: 2, r: 6 });
    expect(liftedSquare({ mode: 'idle' })).toBeNull();
    expect(liftedSquare({ mode: 'promote', from: { c: 2, r: 3 }, to: { c: 2, r: 2 } })).toBeNull();
    expect(liftedSquare({ mode: 'drop', kind: 'FU' })).toBeNull();
  });
});
```

（Piece の実際の型に合わせて P の中身は直してよい）

- [ ] **Step 2: `npm test -- tests/view` で失敗を確かめる**

- [ ] **Step 3: 実装**
  - makePiece：`backLabelOf(p)` があれば、駒の底に裏の字の板を足す（PieceObj に `back: THREE.Mesh | null`）。底の面のすぐ下（y ≈ -0.026）に下向きに貼り、**駒を前後の軸（z 軸）まわりに π 回したとき正しく読める向き**にする（後手の駒は grp が y 軸で π 回っている点に注意。試し口で目で確かめる）
  - sync：裏の字の板も位置・向きを戻す。駒の種類・成りが変わったら作り直す（いまの「作り直す」条件に `promoted` の変化を足す）
  - setLifted / releaseLift：stage.onFrame の1つの見張り（spinOff と同じ作り）で、浮かせる駒は `PIECE_Y + LIFT_Y + sin(時間×4)×0.015`、下ろす駒は今の高さから PIECE_Y へ120msで。sync はこの見張りの「下ろす途中」の駒を消し、浮いている駒は浮かせ続ける（sync の直後も選んだままならそのまま）
  - match.ts：`show(res)` の最後で `setLifted(stage, idOf(liftedSquare(st)))`（idOf はそのマスの駒の id。無ければ null）。駒を選んだときに `getSound().play('tick')`（mode が piece に変わったときだけ）。`submit` の最初で `releaseLift()`。画面の片付け（cleanup）で `setLifted(stage, null)`

- [ ] **Step 4: `npm test` と `npx tsc --noEmit` が通る**

- [ ] **Step 5: コミット**「駒の裏に成った字を描き、選んだ駒を浮かせる」

---

### Task 3: 動かす・取る・成る・打つの演出（move.ts）と試し口

**Files:**
- Create: `src/fx/moveTiming.ts`、`src/fx/move.ts`
- Modify: `src/fx/player.ts`（slide と drop を移す）、`src/view/board3d.ts`（画面の点 → 盤の上の点）、`src/view/hud.ts`（駒台の位置）、`src/app/dev.ts`（試し口4つ）
- Test: 新規 `tests/fx/moveTiming.test.ts`

**Interfaces:**
- Produces（moveTiming.ts、import は FxTiming の型だけ）:

```ts
export interface MoveTimings {
  travel: number;   // 持ち上げ→弧→着く
  settle: number;   // 着いて少し沈んで戻る
  fly: number;      // 取られた駒がはじかれて駒台へ飛ぶ
  flip: number;     // 成りの裏返し
  hang: number;     // 打つ駒が上で止まる
  fall: number;     // 打つ駒が落ちる
  foeGlow: number;  // 相手の駒が動く前に光る
  calm: boolean;    // 動きを減らす（timing.camera === false）
}
export function moveTimings(t: FxTiming): MoveTimings;
```

  長めの値：travel 190・settle 60・fly 300・flip 350・hang 120・fall 180・foeGlow 120。すべて `× t.scale`。calm のときは settle 0・hang 0・flip 0（光の輪だけ）・fly 200（その場で薄くなる）、travel と fall は 160 × scale

- Produces（board3d.ts）: `screenToBoard(stage: Stage, clientX: number, clientY: number, y: number): THREE.Vector3 | null` — squareAt と同じ光線で、高さ y の平らな面との交点
- Produces（hud.ts の Hud）: `komadaiRect(side: 'me' | 'foe'): DOMRect | null` — 駒台の箱の画面上の四角（幅か高さが0なら null）
- Produces（move.ts）:
  - `playMove(ctx: FxCtx, cue: Extract<Cue, { kind: 'move' }>): Promise<void>`
  - `playDrop(ctx: FxCtx, cue: Extract<Cue, { kind: 'drop' }>): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**（tests/fx/moveTiming.test.ts）

```ts
const T = (scale: number, camera: boolean) => ({ scale, camera, shake: camera, flashMax: 0.9 });
it('長めのふつうの手は約0.25秒', () => {
  const m = moveTimings(T(1, true));
  expect(m.travel + m.settle).toBe(250);
  expect(m.calm).toBe(false);
});
it('短めは半分', () => {
  expect(moveTimings(T(0.5, true)).fly).toBe(150);
});
it('動きを減らすときは、沈み・止まり・裏返しがない', () => {
  const m = moveTimings(T(1, false));
  expect([m.calm, m.settle, m.hang, m.flip]).toEqual([true, 0, 0, 0]);
});
```

- [ ] **Step 2: `npm test -- tests/fx/moveTiming.test.ts` で失敗を確かめる**

- [ ] **Step 3: moveTiming.ts を実装し、テストを通す**

- [ ] **Step 4: move.ts を実装する**（設計書 2章の表どおり。player.ts の `MOVE_MS`・`HOP`・`DROP_FROM`・`slide` は move.ts へ移して消す）
  - playMove の順番：(相手の手なら) 元の駒を foeGlow の間だけ明るく（駒の材質の複製を差し替え、emissive を上げて戻す。最後の sync が共有の材質へ戻す）→ 弧を描いて travel（高さ `sin(πt) × 0.35`、始めの高さは今の y＝浮いていればそこから）→ 取る手なら取られた駒を fly の間はじく：上へ跳ねて回りながら、取った側の駒台へ（`ctx.hud.komadaiRect(cue.side === ctx.me ? 'me' : 'foe')` の中心を `screenToBoard(…, 1.2)` で盤の上の点にする。取れなければ取った側の盤の手前の端 `z = ±(BD/2 + 0.5)`）飛びながら縮んで消える。はじく動きは `later(ctx.tweenRaw(...))` で並べて走らせ、settle と同時に進めて最後に await → 着く瞬間に settle（y を -0.04 まで沈めて戻す）・`puff(ctx, 着いた点, PAL.kayaLight, 10, 0.5)`・`shakeBy(ctx, 取る手 ? 0.08 : 0.03)`・音（取る手 `komaHard`、ほか `koma`）→ 成るなら flip の間 grp を z 軸まわりに π 回し、半分の所で `ring` の朱の輪を transient で広げて `kaesu` → `ctx.sync()`
  - calm のとき：まっすぐ travel だけ動かし、取られた駒はその場で fly の間に薄くして消し（材質は複製）、成りは輪と音だけ。粉と揺れはなし
  - playDrop：`ctx.sync()` → 駒を `y + 1.1` に置いて hang の間待つ → fall で落とす → puff・`shakeBy(ctx, 0.05)`・`komaHard`
  - player.ts の playCue：`move` は（王を取る手の例外はそのまま）`playMove`、`drop` は `playDrop`
  - 時間はすべて `ctx.tweenRaw` に moveTimings の値（scale 込み）を渡す（ctx.tween だと scale が2重に掛かる）

- [ ] **Step 5: 試し口を足す**（dev.ts。FxScene・SCENES・コメントの一覧・pickFxAction）
  - `move`：初期配置のまま。Space で歩を1つ進める（quietPawnMove）
  - `capture`：相手の 7三 の歩を 7五（{c:2,r:4}）へ置き、自分の 7七 の歩を 7六（{c:2,r:5}）へ。Space でその歩を取る
  - `promote`：自分の 5七 の歩を 5四（{c:4,r:3}）へ置き、相手の 5三 の歩を外す。Space で 5三 へ成る
  - `drop`：自分に持ち駒の歩を1枚（7七 の歩を外して二歩にしない）。Space で歩を 7五 に打つ
  - 相手（CPU）の手の光りと取る動きは、`capture` の Space のあと CPU が取り返すことで見る（`&cpu=normal` を付けてもよい）

- [ ] **Step 6: `npm test`・`npx tsc --noEmit`（cancel-guard を含む）が通る**

- [ ] **Step 7: 画面で確かめる**（ブラウザの画面を出した状態で。隠れていると演出が止まる）
  - `npm run dev` を preview_start で起こし、`?fx=move` `?fx=capture` `?fx=promote` `?fx=drop` を開いて Space。動きの途中と終わりを画面撮影
  - 後手の駒の裏返し：`?fx=capture&cpu=normal` で CPU の駒が成る場面が出なければ、設定から「長め」にして普通の対局で確かめる。出なかったらそう書き残す
  - 設定の「短め」と、動きを減らす（resize_window ではなく、DevTools がなければ `matchMedia` を確かめるだけでよい）での動き
  - 動いている途中で投了 → タイトルに戻って、駒が飛んだまま残っていないこと

- [ ] **Step 8: コミット**「ふだんの1手の演出（弧・パチン・はじく・裏返す・打つ）と試し口」

---

### Task 4: 駒台に駒が「ポン」と収まる

**Files:**
- Modify: `src/view/hud.ts`、`src/app/style.css`
- Test: 新規 `tests/view/hud-arrive.test.ts`

**Interfaces:**
- Produces（hud.ts）: `arrivedKinds(prev: Record<HandKind, number> | null, next: Record<HandKind, number>): HandKind[]` — prev より増えた種類（prev が null＝最初の描き直しなら空）

- [ ] **Step 1: 失敗するテストを書く**

```ts
const H = (o: Partial<Record<HandKind, number>>) => ({ HI: 0, KA: 0, KI: 0, GI: 0, KE: 0, KY: 0, FU: 0, ...o });
it('増えた種類だけ', () => {
  expect(arrivedKinds(H({ FU: 1 }), H({ FU: 2, GI: 1 })).sort()).toEqual(['FU', 'GI']);
});
it('減った・同じ・最初は空', () => {
  expect(arrivedKinds(H({ FU: 2 }), H({ FU: 1 }))).toEqual([]);
  expect(arrivedKinds(null, H({ FU: 1 }))).toEqual([]);
});
```

- [ ] **Step 2: 失敗を確かめる**

- [ ] **Step 3: 実装** — render の中で、前回の `last.view` のその側の持ち駒と比べ、増えた種類の駒台の駒に `arrive` の class を付ける（同じ side・同じ対局の続きのときだけ。me が変わったら null 扱い）。CSS：`.match .komadai .koma.arrive { animation: koma-arrive .32s cubic-bezier(.2,1.4,.4,1) both; }`、`@keyframes koma-arrive { from { transform: scale(1.6); filter: brightness(1.4); } to { transform: none; filter: none; } }`。`prefers-reduced-motion: reduce` のときは animation を消す

- [ ] **Step 4: `npm test` が通る。`?fx=capture` で Space → 自分の駒台の歩が「ポン」と収まるのを画面撮影**

- [ ] **Step 5: コミット**「取った駒が駒台にポンと収まる」

---

### Task 5: 全体の確かめ

- [ ] **Step 1: `npm test` と `npx tsc --noEmit` と `npm run build` がすべて通る**
- [ ] **Step 2: CPU 同士の対局で止まらない** — `tools/arena` の README どおり短く回す（例：各組み合わせ数局）。止まったり例外が出たりしないこと
- [ ] **Step 3: ブラウザで CPU（よわい）と1局の序盤〜中盤を指し、選ぶ→浮く・動く・取る・取られる・成る・打つを一通り見る。コンソールにエラーがないこと**
- [ ] **Step 4: 開いたプレビューのサーバーとタブを閉じる**
- [ ] **Step 5: 記録**（メモリの進み具合に「ふだんの1手 完了・未push、次は札の演出」を書く）
