// 演出役（Presenter の本体）。出来事の記録を planFx で段取りにし、順に流して、最後に必ず sync する。
// 魔法は magic.ts、罠は trap.ts、装備・鋼の鎧・韋駄天の2回目は equip.ts、王手・決着は finale.ts。
// 普段の駒の移動・打つ動きはここ（静かに 160ms）。王を取る手の移動だけは、決着の演出がゆっくり流す。
// 決まり：present は決して reject しない。失敗は段取りごとに握って console.error し、最後に必ず sync して resolve する。
import type { GameState, Side, Square } from '../rules/types';
import type { Presenter, Step } from '../app/match';
import type { Stage } from '../view/stage';
import type { Hud } from '../view/hud';
import { easeOut } from '../view/stage';
import { squarePos } from '../view/board3d';
import { pieceMesh, sync } from '../view/pieces3d';
import { loadSettings, safeStore } from '../app/storage';
import { fxTiming, planFx, type Cue, type FxTiming } from './plan';
import { FxCancelled, atHome, cameraHome, clearLayers, clearTransients, makeCtx, showNotice, type FxCtx } from './kit';
import { playMagic, prepareMagic } from './magic';
import { playTrapFire, playTrapSet } from './trap';
import { playArmor, playEquip, playSecond } from './equip';
import { playCheck, playGameOver } from './finale';
import { getSound } from './sound';

const MOVE_MS = 160;   // 普段の駒の移動（演出の長さの設定に関係なく、いつも静かで速く）
const HOP = 0.18;      // 動くときに少し浮かせる高さ
const DROP_FROM = 0.7; // 打つ駒が降りてくる高さ
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

async function slide(ctx: FxCtx, pieceId: number, from: Parameters<typeof squarePos>[0], to: Parameters<typeof squarePos>[0]): Promise<void> {
  const m = pieceMesh(pieceId);
  if (!m) return;
  const a = squarePos(from), b = squarePos(to), y0 = m.position.y;
  await ctx.tweenRaw(MOVE_MS, (t) => {
    m.position.set(a.x + (b.x - a.x) * t, y0 + Math.sin(Math.PI * t) * HOP, a.z + (b.z - a.z) * t);
  }, easeOut);
  getSound().play('tick');
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
      await slide(ctx, cue.pieceId, cue.from, cue.to);
      return;
    case 'second':
      await playSecond(ctx, cue);
      return;
    case 'drop': {
      // 打った駒は局面を揃えてから、上から降ろす
      ctx.sync();
      const m = pieceMesh(cue.pieceId);
      if (!m) return;
      const y0 = m.position.y;
      await ctx.tweenRaw(MOVE_MS, (t) => { m.position.y = y0 + (1 - t) * DROP_FROM; }, easeOut);
      getSound().play('tick');
      return;
    }
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

/** 演出役。cancel() で打ち切ると、流している演出は残りを流さず、共有の舞台（カメラ・盤）にも触れずに終わる */
export interface FxPresenter extends Presenter { cancel(): void }

export function createPresenter(stage: Stage, hud: Hud, me: Side, opts?: { fx?: 'short' | 'long' }): FxPresenter {
  prepareMagic(stage);
  let cancelled = false;
  const alive = (): boolean => !cancelled;
  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      // 舞台に残した演出の物と揺れは、次の画面に持ち越さない
      try { clearTransients(); } catch (e) { console.error('演出の物を片付けられませんでした', e); }
      stage.shake = 0;
    },
    async present(step) {
      if (cancelled) return;
      let ctx: FxCtx | null = null;
      try {
        ctx = makeCtx(stage, hud, currentTiming(opts?.fx), me, step.before, step.after, alive);
        const kingAt = capturedKingAt(step.before, step.events);
        for (const cue of planFx(step.events, step.actor)) {
          if (cancelled) break;
          try {
            await playCue(ctx, cue, step, kingAt);
          } catch (e) {
            if (!cancelled && !(e instanceof FxCancelled)) console.error(`演出に失敗しました（${cue.kind}）`, e);
          }
        }
      } catch (e) {
        if (!cancelled) console.error('演出の段取りを作れませんでした', e);
      } finally {
        // 後始末：カメラが寄ったままなら戻し（鏡で無効にされた魔法など）、重ね板を消して隠した手札を戻し、
        // 盤を局面どおりに揃える。1つの失敗がほかを止めないよう、それぞれ別に包む
        if (cancelled) {
          // 打ち切られた：重ね板（対局画面の中）だけ片付け、カメラと盤は次の画面に任せる
          if (ctx) { try { clearLayers(ctx); } catch { /* 片付けの失敗は無視 */ } }
          return;
        }
        if (ctx) {
          try {
            // 王が取られて決着したときは、見得を切ったまま結果画面へ（カメラは戻さない）
            const finale = step.after.result?.winner != null;
            if (!finale && !atHome(ctx)) await cameraHome(ctx, SETTLE_MS);
          } catch (e) { if (!cancelled) console.error('カメラを戻せませんでした', e); }
          try { clearLayers(ctx); } catch (e) { console.error('重ね板を消せませんでした', e); }
        }
        // カメラを戻している間に打ち切られたら、盤は次の画面に任せる
        if (!cancelled) {
          try { sync(stage, step.after, me); } catch (e) { console.error('盤を揃えられませんでした', e); }
        }
      }
    },
  };
}
