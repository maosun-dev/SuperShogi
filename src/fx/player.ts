// 演出役（Presenter の本体）。出来事の記録を planFx で段取りにし、順に流して、最後に必ず sync する。
// 魔法は magic.ts、普段の駒の移動・打つ動きはここ（静かに 160ms）。罠・装備・決着はタスク11で足す。
// 決まり：present は決して reject しない。失敗は段取りごとに握って console.error し、最後に必ず sync して resolve する。
import type { Side } from '../rules/types';
import type { Presenter, Step } from '../app/match';
import type { Stage } from '../view/stage';
import type { Hud } from '../view/hud';
import { easeOut } from '../view/stage';
import { squarePos } from '../view/board3d';
import { pieceMesh, sync } from '../view/pieces3d';
import { loadSettings, safeStore } from '../app/storage';
import { fxTiming, planFx, type Cue, type FxTiming } from './plan';
import { atHome, cameraHome, clearLayers, makeCtx, type FxCtx } from './kit';
import { playMagic, prepareMagic } from './magic';

const MOVE_MS = 160;   // 普段の駒の移動（演出の長さの設定に関係なく、いつも静かで速く）
const HOP = 0.18;      // 動くときに少し浮かせる高さ
const DROP_FROM = 0.7; // 打つ駒が降りてくる高さ
const SETTLE_MS = 400; // 途中で止まったとき、カメラを普段の視点へ戻す時間

/** 今の設定（短め／長め）と OS の「視差効果を減らす」から、演出の強さを決める（毎回読み直す） */
function currentTiming(): FxTiming {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return fxTiming(loadSettings(safeStore()), reduced);
}

async function slide(ctx: FxCtx, pieceId: number, from: Parameters<typeof squarePos>[0], to: Parameters<typeof squarePos>[0]): Promise<void> {
  const m = pieceMesh(pieceId);
  if (!m) return;
  const a = squarePos(from), b = squarePos(to), y0 = m.position.y;
  await ctx.stage.tween(MOVE_MS, (t) => {
    m.position.set(a.x + (b.x - a.x) * t, y0 + Math.sin(Math.PI * t) * HOP, a.z + (b.z - a.z) * t);
  }, easeOut);
}

async function playCue(ctx: FxCtx, cue: Cue, step: Step): Promise<void> {
  switch (cue.kind) {
    case 'move':
    case 'second':
      await slide(ctx, cue.pieceId, cue.from, cue.to);
      return;
    case 'drop': {
      // 打った駒は局面を揃えてから、上から降ろす
      sync(ctx.stage, step.after, ctx.me);
      const m = pieceMesh(cue.pieceId);
      if (!m) return;
      const y0 = m.position.y;
      await ctx.stage.tween(MOVE_MS, (t) => { m.position.y = y0 + (1 - t) * DROP_FROM; }, easeOut);
      return;
    }
    case 'magic':
      await playMagic(ctx, cue);
      return;
    default:
      // 罠・装備・王手・決着などはタスク11で足す
      return;
  }
}

export function createPresenter(stage: Stage, hud: Hud, me: Side): Presenter {
  prepareMagic(stage);
  return {
    async present(step) {
      let ctx: FxCtx | null = null;
      try {
        ctx = makeCtx(stage, hud, currentTiming(), me, step.before, step.after);
        for (const cue of planFx(step.events, step.actor)) {
          try {
            await playCue(ctx, cue, step);
          } catch (e) {
            console.error(`演出に失敗しました（${cue.kind}）`, e);
          }
        }
      } catch (e) {
        console.error('演出の段取りを作れませんでした', e);
      } finally {
        // 後始末：重ね板を消し、カメラが寄ったままなら戻し（鏡で無効にされた魔法など）、盤を局面どおりに揃える
        if (ctx) {
          try {
            clearLayers(ctx);
            if (!atHome(ctx)) await cameraHome(ctx, SETTLE_MS);
          } catch (e) { console.error('演出の後始末に失敗しました', e); }
        }
        try { sync(stage, step.after, me); } catch (e) { console.error('盤を揃えられませんでした', e); }
      }
    },
  };
}
