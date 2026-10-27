// 纏札の演出の共通の流れ：札が飛ぶ → 前振り → 名前ドン（金の帯）→ 札の力が駒に宿る（見せ場）→ 余韻 → 戻る。
// 札ごとの中身は src/fx/cards/<札の id>.ts（表は cards/index.ts）。付けたあとの印は pieces3d が札ごとの物で出し続ける。
// 付けたあとの出番もここから札ごとへ渡す：鋼の鎧が守った（playArmor）・纏札が外れた（playEquipBreak）・
// 韋駄天の2回目の移動（playSecond）・札の力を使う手（playEquipMove：陣替え・天馬）
import { CARDS } from '../cards';
import type { Cue } from './plan';
import { atHome, cameraHome, cutIn, showNotice, startCardFly, type FxCtx } from './kit';
import { brighten, lightsUp } from './stagecraft';
import { EQUIP_FX } from './cards';
import { equipMoveKind } from './equipMove';
import { hideEquipMark } from './cards/parts';
import type { ArmorCue, BreakCue, EquipCue, MoveCue, SecondCue, WardCue } from './cards/types';

const NAME_MS = 700;

/** 纏札を付ける */
export async function playEquip(ctx: FxCtx, cue: EquipCue): Promise<void> {
  const def = CARDS[cue.cardId];
  const fx = EQUIP_FX[cue.cardId];
  let fly: Promise<void> = Promise.resolve();
  try {
    fly = (await startCardFly(ctx, cue.cardId, cue.side)).done;
    if (fx?.pre) await fx.pre(ctx, cue);
    await cutIn(ctx, def.name, `纏・コスト${def.cost}`, 'soubi', fx?.nameMs ?? NAME_MS);
    if (cue.negated) {
      // 鏡の結界に打ち消された：付けずに、鏡の結界の演出へ
      await brighten(ctx, 300);
      return;
    }
    if (fx) {
      await fx.main(ctx, cue);
      if (fx.after) await fx.after(ctx, cue);
    }
    // 付けた印を出す（ここから先は sync が出し続ける）
    ctx.sync();
    await brighten(ctx, 500);
    if (!atHome(ctx)) await cameraHome(ctx, 700);
  } finally {
    try { fx?.cleanup?.(ctx, cue); } catch (e) { console.error('纏札の演出の後始末に失敗しました', e); }
    lightsUp(ctx);
    await fly;
  }
}

/** 札の力を使う手なら、その札の飾りを流す（ふだんの1手の前に呼ぶ。飾りだけなら待たずに戻る） */
export async function playEquipMove(ctx: FxCtx, cue: MoveCue): Promise<void> {
  const kind = equipMoveKind(ctx.before, cue.from, cue.to);
  const fx = kind ? EQUIP_FX[kind] : undefined;
  if (fx?.onMove) await fx.onMove(ctx, cue);
}

/** 鋼の鎧が守った */
export async function playArmor(ctx: FxCtx, cue: ArmorCue): Promise<void> {
  const fx = EQUIP_FX.hagane;
  try {
    if (fx?.onArmor) await fx.onArmor(ctx, cue);
  } finally {
    lightsUp(ctx);
    if (!atHome(ctx)) await cameraHome(ctx, 600);
  }
}

/** 番傘が罠を受け止めた：傘が開いて受け止め、破れて外れる。何の罠だったかを知らせる */
export async function playWard(ctx: FxCtx, cue: WardCue): Promise<void> {
  try {
    await EQUIP_FX.bangasa?.onWard?.(ctx, cue);
  } finally {
    lightsUp(ctx);
  }
  ctx.sync();
  await showNotice(ctx, `番傘が${CARDS[cue.cardId].name}を受け止めました`);
  if (!atHome(ctx)) await cameraHome(ctx, 600);
}

/** 纏札が外れた（重りの枷の手番が尽きた）：札ごとの壊れ方のあと、名前で知らせる */
export async function playEquipBreak(ctx: FxCtx, cue: BreakCue): Promise<void> {
  // 付けていた印を隠すのは札ごとの演出に任せる（寄ってから隠す、など）。片付けは sync（外れた局面で消える）
  const fx = EQUIP_FX[cue.cardId];
  if (fx?.onBreak) {
    await fx.onBreak(ctx, cue);
  } else {
    hideEquipMark(cue.pieceId, cue.cardId === 'omori' ? 'shackle' : 'equip');
    await ctx.wait(300);
  }
  ctx.sync();
  await showNotice(ctx, `${CARDS[cue.cardId].name}が外れました`);
}

/** 韋駄天の2回目の移動 */
export async function playSecond(ctx: FxCtx, cue: SecondCue): Promise<void> {
  const fx = EQUIP_FX.idaten;
  if (fx?.onSecond) await fx.onSecond(ctx, cue);
}
