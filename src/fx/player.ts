// 演出役（Presenter の本体）。出来事の記録を planFx で段取りにし、順に流して、最後に必ず sync する。
// 術札は magic.ts、忍札は trap.ts、纏札（付ける・鎧・外れる・韋駄天の2回目・札の力を使う手）は equip.ts、王手・決着は finale.ts。
// 札ごとの中身は src/fx/cards。
// ふだんの駒の移動・取る・成る・打つは move.ts。王を取る手の移動だけは、決着の演出がゆっくり流す。
// 決まり：present は決して reject しない。失敗は段取りごとに握って console.error し、最後に必ず sync して resolve する。
import type { GameState, Side, Square } from '../rules/types';
import type { Presenter, Step } from '../app/match';
import type { Stage } from '../view/stage';
import type { Hud } from '../view/hud';
import { sync } from '../view/pieces3d';
import { loadSettings, safeStore } from '../app/storage';
import { fxTiming, planFx, type Cue, type FxTiming } from './plan';
import { FxCancelled, atHome, cameraHome, clearLayers, clearTransients, makeCtx, showNotice, type FxCtx } from './kit';
import { playMagic, prepareMagic } from './magic';
import { resetStagecraft } from './stagecraft';
import { playTrapFire, playTrapSet } from './trap';
import { playArmor, playEquip, playEquipBreak, playEquipMove, playSecond } from './equip';
import { playCheck, playGameOver, playOpening, playResign } from './finale';
import { playDrop, playMove } from './move';

const SETTLE_MS = 400; // 途中で止まったとき、カメラを普段の視点へ戻す時間

/**
 * 今の設定（短め／長め）と OS の「視差効果を減らす」から、演出の強さを決める（毎回読み直す）。
 * fx を渡すと、保存された設定を書き換えずに長さだけ差し替える（開発用の自動対局で「短め」にする）
 */
function currentTiming(fx?: 'short' | 'long'): FxTiming {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const s = loadSettings(safeStore());
  return fxTiming(fx ? { ...s, fx } : s, reduced);
}

/** 取られた王のマス：前の局面で、動いた先に（動かした側でない）王がいたマス。なければ null */
export function capturedKingAt(before: GameState, events: Step['events']): Square | null {
  for (const e of events) {
    if (e.type !== 'moved') continue;
    const p = before.board[e.to.r * 9 + e.to.c];
    const mover = before.board[e.from.r * 9 + e.from.c];
    if (p?.kind === 'OU' && p.side !== mover?.side) return e.to;
  }
  return null;
}

async function playCue(ctx: FxCtx, cue: Cue, step: Step, kingAt: Square | null): Promise<void> {
  switch (cue.kind) {
    case 'move':
      // 王を取る手は、決着の演出（playGameOver）がゆっくり動かす
      if (kingAt && step.after.result && cue.to.c === kingAt.c && cue.to.r === kingAt.r) return;
      // 纏札の力を使う手（陣替えで下がる・横へずれる・天馬で跳ぶ）は、札の飾りを足す
      await playEquipMove(ctx, cue);
      await playMove(ctx, cue);
      return;
    case 'second':
      await playSecond(ctx, cue);
      return;
    case 'drop':
      await playDrop(ctx, cue);
      return;
    case 'magic':
      await playMagic(ctx, cue);
      return;
    case 'trapSet':
      await playTrapSet(ctx, cue);
      return;
    case 'trapFire':
      await playTrapFire(ctx, cue);
      return;
    case 'equip':
      await playEquip(ctx, cue);
      return;
    case 'armor':
      await playArmor(ctx, cue);
      return;
    case 'equipBreak':
      await playEquipBreak(ctx, cue);
      return;
    case 'check':
      await playCheck(ctx, cue);
      return;
    case 'gameOver':
      await playGameOver(ctx, cue, kingAt);
      return;
    case 'notice':
      // 小さな知らせ：静かな帯で出す（墨しぶきなし）
      await showNotice(ctx, cue.text);
      return;
  }
}

/** 自分の王のマス（なければ null） */
function kingOf(s: GameState, side: Side): Square | null {
  const i = s.board.findIndex((p) => p?.kind === 'OU' && p.side === side);
  return i < 0 ? null : { r: Math.floor(i / 9), c: i % 9 };
}

/**
 * 演出役。cancel() で打ち切ると、流している演出は残りを流さず、共有の舞台（カメラ・盤）にも触れずに終わる。
 * resign(state) は、流している演出を打ち切ってから投了の演出（王が墨の泡になって消える → 「負」）を流す。cancel() で途中でも止まる。
 * interrupt() は、いま流している演出だけを打ち切る（そのあとの present は流れる。友と対局の待ったで使う）
 */
export interface FxPresenter extends Presenter {
  cancel(): void; interrupt(): void; resign(state: GameState): Promise<void>;
  /** 対局の始まりの「開戦」。決して reject しない */
  opening(state: GameState): Promise<void>;
}

export function createPresenter(stage: Stage, hud: Hud, me: Side, opts?: { fx?: 'short' | 'long' }): FxPresenter {
  prepareMagic(stage);
  let cancelled = false;
  let resigning = false; // 投了の演出に移った：それまでの演出（present）は打ち切り扱い
  let epoch = 0;         // interrupt のたびに進める（それより前に始めた present は打ち切り扱い）
  const alive = (): boolean => !cancelled && !resigning;
  const tidy = (): void => {
    try { clearTransients(); } catch (e) { console.error('演出の物を片付けられませんでした', e); }
    try { resetStagecraft(); } catch (e) { console.error('照明を戻せませんでした', e); }
    stage.shake = 0;
  };
  return {
    interrupt() {
      if (cancelled || resigning) return;
      epoch++;
      tidy();
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      // 舞台に残した演出の物と揺れは、次の画面に持ち越さない
      try { clearTransients(); } catch (e) { console.error('演出の物を片付けられませんでした', e); }
      // 暗転・スポットライト・点の光は、次の画面に持ち越さない
      try { resetStagecraft(); } catch (e) { console.error('照明を戻せませんでした', e); }
      stage.shake = 0;
    },
    async resign(state) {
      if (cancelled || resigning) return;
      resigning = true;
      // 流していた演出の物・照明・揺れを片付け、盤を局面どおりに揃えてから始める
      try { clearTransients(); } catch (e) { console.error('演出の物を片付けられませんでした', e); }
      try { resetStagecraft(); } catch (e) { console.error('照明を戻せませんでした', e); }
      stage.shake = 0;
      let ctx: FxCtx | null = null;
      try {
        ctx = makeCtx(stage, hud, currentTiming(opts?.fx), me, state, state, () => !cancelled);
        clearLayers(ctx);
        ctx.sync();
        await playResign(ctx, kingOf(state, me));
      } catch (e) {
        if (!cancelled && !(e instanceof FxCancelled)) console.error('投了の演出に失敗しました', e);
      }
    },
    async opening(state) {
      if (!alive()) return;
      let ctx: FxCtx | null = null;
      try {
        ctx = makeCtx(stage, hud, currentTiming(opts?.fx), me, state, state, alive);
        await playOpening(ctx);
      } catch (e) {
        if (alive() && !(e instanceof FxCancelled)) console.error('開戦の演出に失敗しました', e);
      } finally {
        if (ctx && alive()) { try { clearLayers(ctx); } catch { /* 片付けの失敗は無視 */ } }
      }
    },
    async present(step) {
      if (!alive()) return;
      const mine = epoch;
      const live = (): boolean => !cancelled && !resigning && epoch === mine; // この present がまだ生きているか
      let ctx: FxCtx | null = null;
      try {
        ctx = makeCtx(stage, hud, currentTiming(opts?.fx), me, step.before, step.after, live);
        const kingAt = capturedKingAt(step.before, step.events);
        for (const cue of planFx(step.events, step.actor)) {
          if (!live()) break;
          try {
            await playCue(ctx, cue, step, kingAt);
          } catch (e) {
            if (live() && !(e instanceof FxCancelled)) console.error(`演出に失敗しました（${cue.kind}）`, e);
          }
        }
      } catch (e) {
        if (live()) console.error('演出の段取りを作れませんでした', e);
      } finally {
        // 後始末：カメラが寄ったままなら戻し（鏡で無効にされた魔法など）、重ね板を消して隠した手札を戻し、
        // 盤を局面どおりに揃える。1つの失敗がほかを止めないよう、それぞれ別に包む
        if (!live()) {
          // 打ち切られた：重ね板（対局画面の中）だけ片付け、カメラと盤は次の画面（や投了の演出）に任せる。
          // 投了の演出が重ね板を使っているときは触らない
          if (ctx && !resigning) { try { clearLayers(ctx); } catch { /* 片付けの失敗は無視 */ } }
          return;
        }
        if (ctx) {
          try {
            // 王が取られて決着したときは、見得を切ったまま結果画面へ（カメラは戻さない）
            const finale = step.after.result?.winner != null;
            if (!finale && !atHome(ctx)) await cameraHome(ctx, SETTLE_MS);
          } catch (e) { if (live()) console.error('カメラを戻せませんでした', e); }
          try { clearLayers(ctx); } catch (e) { console.error('重ね板を消せませんでした', e); }
        }
        // カメラを戻している間に打ち切られたら、盤は次の画面（や投了の演出）に任せる
        if (live()) {
          try { sync(stage, step.after, me); } catch (e) { console.error('盤を揃えられませんでした', e); }
        }
      }
    },
  };
}
