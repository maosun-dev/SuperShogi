// 術札の演出の共通の流れ：札が飛ぶ → 前振り → 名前ドン（藍の帯）→ 見せ場 → 余韻 → カメラが戻る。
// 札ごとの中身は src/fx/cards/<札の id>.ts（表は cards/index.ts）。
// 鏡の結界で打ち消された術札は、名前ドンまでで止める（続きは鏡の結界の演出が見せる）。
// 時間は「長め」の値で書き、短めでは ctx が半分にする。
import { CARDS } from '../cards';
import type { Cue } from './plan';
import type { Stage } from '../view/stage';
import { atHome, cameraHome, cutIn, startCardFly, type FxCtx } from './kit';
import { brighten, lightsUp, prepareStagecraft } from './stagecraft';
import { MAGIC_FX } from './cards';

type MagicCue = Extract<Cue, { kind: 'magic' }>;

const NAME_MS = 1000;

/** 演出の下ごしらえ（演出役を作るときに1回呼ぶ）。光は最初に置いておく */
export function prepareMagic(stage: Stage): void {
  prepareStagecraft(stage);
}

export async function playMagic(ctx: FxCtx, cue: MagicCue): Promise<void> {
  const def = CARDS[cue.cardId];
  const fx = MAGIC_FX[cue.cardId];
  let fly: Promise<void> = Promise.resolve();
  try {
    fly = (await startCardFly(ctx, cue.cardId, cue.side)).done;
    if (fx?.pre) await fx.pre(ctx, cue);
    await cutIn(ctx, def.name, `術・コスト${def.cost}`, 'mahou', fx?.nameMs ?? NAME_MS);
    if (cue.negated) {
      // 打ち消された：暗転していたら戻して、鏡の結界の演出へ
      await brighten(ctx, 300);
      return;
    }
    if (fx) {
      await fx.main(ctx, cue);
      if (fx.after) await fx.after(ctx, cue);
    }
    await brighten(ctx, 500);
    if (!atHome(ctx)) await cameraHome(ctx, 800);
  } finally {
    try { fx?.cleanup?.(ctx, cue); } catch (e) { console.error('術札の演出の後始末に失敗しました', e); }
    lightsUp(ctx);
    await fly;
  }
}
