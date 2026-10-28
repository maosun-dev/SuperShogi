// 「大見得」：本番の傾奇者の王を取ったときだけの王取り（設計書 docs/superpowers/specs/2026-10-28-kabuki-ending-design.md 3章）。
// 取る駒が王のマスへ入った瞬間にツケ打ち（バタバタ…バッタリ）。時がゆっくりになり、カメラが取った駒へ寄る。
// 駒は少し傾いて見得を切り、桜吹雪が舞う。柝の「チョーン」で終わり、エンディングの幕へつなぐ。
// 3案（tataki・iai・hanabi）のくじには入れない。「勝」の字は書かない（エンディングのあとの結果画面が書く）
import { PALS } from '../../view/palette';
import { cameraTo, easeInOut, easeOut, flash, shakeBy, type FxCtx } from '../kit';
import { getSound } from '../sound';
import { freezeFrame, petalStorm, settleTaker, takerAlong, type KingCapture } from './common';

const HIT_MS = 380;    // 取る駒が王のマスへ入るまで
const ZOOM_MS = 900;   // カメラが取った駒へ寄る
const MIE_TILT = 0.14; // 見得の傾き（ラジアン）
const MIE_MS = 260;    // 傾いて止まるまで
const HOLD_MS = 1300;  // 見得を見せる長さ（桜が舞う）
const TAIL_MS = 500;   // 柝のあと

/** ツケ打ち：バタ・バタ…バッタリ（録った音が無いので、太鼓を短く2つと強く1つで代える） */
function tsuke(ctx: FxCtx): void {
  const s = getSound();
  s.play('drum', { gain: 0.45 });
  void ctx.wait(110).then(() => s.play('drum', { gain: 0.45 }));
  void ctx.wait(330).then(() => s.play('drum', { gain: 1 }));
}

export async function oomie(ctx: FxCtx, k: KingCapture): Promise<void> {
  if (k.taker && k.from) await ctx.tween(HIT_MS, (t) => takerAlong(k, t, 0.3), easeInOut);
  if (k.king) k.king.visible = false;
  settleTaker(k);
  tsuke(ctx);
  flash(ctx, PALS.soubiPale, 0.35, 220);
  shakeBy(ctx, 0.12);
  // ゆっくりになった中で、カメラが取った駒へ寄る
  await Promise.all([freezeFrame(ctx, ZOOM_MS, false), cameraTo(ctx, k.at, ZOOM_MS)]);
  // 見得：少し傾いて止まる（見ている側から見て右へ）
  const taker = k.taker;
  if (taker) {
    const z0 = taker.rotation.z;
    const dir = ctx.me === 'sente' ? -1 : 1;
    await ctx.tween(MIE_MS, (t) => { taker.rotation.z = z0 + dir * MIE_TILT * t; }, easeOut);
  }
  getSound().play('drum', { gain: 0.8 });
  // 桜吹雪：駒のまわりから噴き出し、上からも降る（アイコンと同じ形の花びらと花）
  const colors = [PALS.sakura, PALS.gofun, PALS.wana];
  petalStorm(ctx, { mode: 'burst', center: k.at.clone().setY(0.4), colors, shapes: ['notch', 'blossom'], n: 90, size: 0.22, life: 3200, power: 1.2 });
  petalStorm(ctx, { mode: 'rain', center: k.at, colors, shapes: ['notch', 'petal'], n: 160, size: 0.2, life: 4200, area: 4.5, height: 6 });
  await ctx.wait(HOLD_MS);
  getSound().play('maku');
  await ctx.wait(TAIL_MS);
  // 取った駒は傾いたまま見せて終わる（KingFxPlay の約束どおり、王のマスにいる）
  if (taker) taker.position.set(k.at.x, k.takerY, k.at.z);
}
