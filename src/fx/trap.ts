// 忍札の演出。伏せる（静かに：札が裏向きで伏せ札の枠へ滑り込む）と、発動の共通の流れ
// （伏せ札の枠が勢いよくめくれる → 前振り → 名前ドン（紅の帯）→ 見せ場 → 余韻 → 照明とカメラが戻る）。
// 札ごとの中身は src/fx/cards/<札の id>.ts（表は cards/index.ts）。
// 時間は「長め」の値で書き、短めでは ctx が半分にする。
// 決まり：相手の伏せ札は、発動するまで裏だけ見せる（伏せたときの中身・マスは出さない）
import type { Side } from '../rules/types';
import { CARDS } from '../cards';
import type { Cue } from './plan';
import { PAL, rgba } from '../view/palette';
import { ring, squarePos } from '../view/board3d';
import { animateEl, atHome, cameraHome, cutIn, easeOut, localRect, overlay, startCardFly, transient, type FxCtx } from './kit';
import { brighten, lightsUp } from './stagecraft';
import { TRAP_FX } from './cards';
import { getSound } from './sound';

type TrapSetCue = Extract<Cue, { kind: 'trapSet' }>;
type TrapFireCue = Extract<Cue, { kind: 'trapFire' }>;

// 局面の中で駒がいるマス（札ごとの演出も使うので cards/types に置く）
export { squareOf } from './cards/types';

// ---------- 伏せ札の枠 ----------

/** 持ち主の帯の、i 番目の伏せ札の枠 */
function slotOf(ctx: FxCtx, owner: Side, i: number): HTMLElement | null {
  const band = owner === ctx.me ? '.side.me .traps' : '.side.foe .traps';
  return ctx.hud.root.querySelectorAll<HTMLElement>(`${band} .slot`)[i] ?? null;
}

/** 発動した罠が何番目の枠か（前の局面にあって後の局面に無い罠。相手の罠も uid は見えている） */
function firedIndex(ctx: FxCtx, owner: Side): number {
  const mine = ctx.before.traps.filter((t) => t.owner === owner);
  const left = new Set(ctx.after.traps.map((t) => t.uid));
  const i = mine.findIndex((t) => !left.has(t.uid));
  return i >= 0 ? i : Math.max(0, mine.length - 1);
}

/** Web Animations を待つ（途中で消されても例外を出さない。打ち切られたら FxCancelled で止める） */
function run(ctx: FxCtx, el: HTMLElement, kf: Keyframe[], ms: number, easing: string): Promise<void> {
  return animateEl(ctx, el, kf, { duration: Math.max(1, ms), easing });
}

/** 罠を伏せる：静かに。裏向きの札が伏せ札の枠へ滑り込む（300ms）。自分の落とし穴ならマスに罠の印 */
export async function playTrapSet(ctx: FxCtx, cue: TrapSetCue): Promise<void> {
  const owner = cue.side;
  const n = ctx.before.traps.filter((t) => t.owner === owner).length;
  const slot = slotOf(ctx, owner, Math.min(n, 2));
  if (!slot) return;
  const root = ctx.hud.root;
  const to = localRect(ctx, slot);
  const mine = owner === ctx.me && cue.cardId !== null;
  // 出どころ：自分は手札のその札、相手は上の帯の上から
  let src: HTMLElement | undefined;
  if (mine) {
    src = [...root.querySelectorAll<HTMLElement>('.hand .card')]
      .find((c) => c.dataset.card === cue.cardId && c.style.visibility !== 'hidden');
  }
  let dx: number, dy: number, k: number;
  if (src) {
    const r = localRect(ctx, src);
    dx = r.x + r.w / 2 - (to.x + to.w / 2);
    dy = r.y + r.h / 2 - (to.y + to.h / 2);
    k = r.w / Math.max(1, to.w);
    src.style.visibility = 'hidden'; // 後始末の clearLayers で戻し、描き直しで消える
  } else {
    dx = 0; dy = -70; k = 2.4;
  }
  const back = document.createElement('i');
  back.className = 'slot back';
  Object.assign(back.style, { left: `${to.x}px`, top: `${to.y}px`, width: `${to.w}px`, height: `${to.h}px`, boxSizing: 'border-box' });
  overlay(ctx).append(back);
  try {
    await run(ctx, back, [
      { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(-14deg)`, opacity: src ? 1 : 0 },
      { offset: 0.35, opacity: 1 },
      { transform: 'none', opacity: 1 },
    ], 300 * ctx.timing.scale, 'cubic-bezier(.2,.8,.25,1)');
  } finally {
    back.remove();
  }
  // 枠を埋めた見た目にしておく（このあとの描き直しで正しく描き直される）
  // aria-label も帯の描き直し（hud.ts）と同じ言い方にそろえる
  if (mine && cue.cardId) {
    slot.className = 'slot mine';
    slot.textContent = CARDS[cue.cardId].name[0];
    slot.setAttribute('aria-label', `伏せた${CARDS[cue.cardId].name}`);
  } else {
    slot.className = 'slot back';
    slot.setAttribute('aria-label', '伏せ札');
  }
  // 自分の落とし穴：マスに罠の印を出し、紅い輪が小さく広がって知らせる
  if (mine && cue.at) {
    ctx.sync();
    const r = ring(0.42, 0.5, PAL.wana, 4);
    r.rotation.z = Math.PI / 4;
    r.position.copy(squarePos(cue.at)).setY(0.02);
    const LIFE = 520 * ctx.timing.scale;
    transient(ctx, r, LIFE, (_dt, age) => {
      const t = Math.min(1, age / LIFE);
      const s = 1 + easeOut(t) * 0.6;
      r.scale.set(s, s, s);
      r.material.opacity = 0.9 * (1 - t);
    });
  }
}

// ---------- 発動の共通の流れ ----------

/** 伏せ札の枠が勢いよくめくれる（Y 軸の回転 180°、200ms）。相手の罠もここで中身が分かる */
async function flipSlot(ctx: FxCtx, cue: TrapFireCue): Promise<void> {
  const slot = slotOf(ctx, cue.owner, firedIndex(ctx, cue.owner));
  if (!slot) return;
  const half = 100 * ctx.timing.scale;
  getSound().play('flip');
  slot.style.position = 'relative';
  slot.style.zIndex = '3';
  // 前半：裏のまま 90° まで回りながら大きくなる
  await run(ctx, slot, [
    { transform: 'perspective(90px) rotateY(0deg) scale(1)' },
    { transform: 'perspective(90px) rotateY(90deg) scale(1.9)' },
  ], half, 'cubic-bezier(.5,0,1,.6)');
  // 表に替えて、残りの 90° を回り切る（表の字が裏返しにならないよう -90° から戻す）
  slot.className = 'slot mine';
  slot.textContent = CARDS[cue.cardId].name[0];
  slot.setAttribute('aria-label', `発動した${CARDS[cue.cardId].name}`);
  slot.style.boxShadow = `0 0 10px 2px ${rgba(PAL.wana, 0.9)}`;
  await run(ctx, slot, [
    { transform: 'perspective(90px) rotateY(-90deg) scale(1.9)' },
    { offset: 0.6, transform: 'perspective(90px) rotateY(10deg) scale(1.6)' },
    { transform: 'perspective(90px) rotateY(0deg) scale(1.45)' },
  ], half, 'cubic-bezier(.2,.9,.3,1)');
}

/** 罠の発動：枠がめくれる → 前振り → 名前ドン（鏡の結界は下の札が「無効」）→ 見せ場 → 余韻 → 戻る */
export async function playTrapFire(ctx: FxCtx, cue: TrapFireCue): Promise<void> {
  const def = CARDS[cue.cardId];
  const fx = TRAP_FX[cue.cardId];
  let fly: Promise<void> = Promise.resolve();
  try {
    await flipSlot(ctx, cue);
    // 相手の罠は、何の札か読めるように大きく見せてから名前ドンへ
    if (cue.owner !== ctx.me) fly = (await startCardFly(ctx, cue.cardId, cue.owner)).done;
    else await ctx.wait(80);
    if (fx?.pre) await fx.pre(ctx, cue);
    await cutIn(ctx, def.name, cue.cardId === 'kagami' ? '無効' : '忍・発動', 'wana', fx?.nameMs ?? 900);
    if (fx) {
      await fx.main(ctx, cue);
      if (fx.after) await fx.after(ctx, cue);
    }
    await brighten(ctx, 500);
  } finally {
    try { fx?.cleanup?.(ctx, cue); } catch (e) { console.error('忍札の演出の後始末に失敗しました', e); }
    lightsUp(ctx);
    if (!atHome(ctx)) await cameraHome(ctx, 700);
    await fly;
  }
}
