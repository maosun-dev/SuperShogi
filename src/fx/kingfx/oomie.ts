// 「大見得」：本番の傾奇者の王を取ったときだけの王取り（設計書 docs/superpowers/specs/2026-10-28-kabuki-ending-design.md 3章）。
// 最後の一手：カメラが王へ寄り、取る駒がとてもゆっくり迫るあいだ、カメラが王のまわりを回り込む（盤が回って見える）。
// 色が少し抜け、画面のまわりがぼやけて真ん中だけくっきり（2026-10-28 ユーザー「スローになってブラーになって盤が回転」）。
// 取った瞬間に太鼓の一打で、ぼかしと遅さが一気に解ける。
// 駒は少し傾いて見得を切り、桜吹雪が舞う。そのままエンディングの幕（柝の「チョーン」で開く）へつなぐ。
// 3案（tataki・iai・hanabi）のくじには入れない。「勝」の字は書かない（エンディングのあとの結果画面が書く）
import * as THREE from 'three';
import { PAL, PALS } from '../../view/palette';
import { timeStop } from '../stagecraft';
import { cameraTo, easeInOut, easeOut, flash, overlay, shakeBy, speedLines, type FxCtx } from '../kit';
import { getSound } from '../sound';
import { freezeFrame, petalStorm, settleTaker, shockRing, sparks, takerAlong, type KingCapture } from './common';

const NEAR_MS = 550;   // カメラが王へ寄る
const SLOW_MS = 2700;  // 取る駒がゆっくり迫り、カメラが回り込む（声「傾奇者、討ち取ったりー」の長さに合わせる）
const ORBIT = 1.5;     // 回り込む角度（ラジアン。約86度）
const BLUR_PX = 7;     // まわりのぼかしの強さ
const ZOOM_MS = 700;   // 取ったあと、取った駒へ寄り直す
const MIE_TILT = 0.14; // 見得の傾き（ラジアン）
const MIE_MS = 260;    // 傾いて止まるまで
const HOLD_MS = 900;   // 見得を見せてから柝の刻みに入るまで（桜が舞う）
const KIZAMI_MS = 6400; // 柝の刻み（拍子木3）の長さ

/** 迫り方：ほとんどの間ゆっくり進み、最後の一瞬で一気に入る */
function lastStep(t: number): number {
  return t < 0.82 ? 0.55 * (t / 0.82) : 0.55 + 0.45 * easeOut((t - 0.82) / 0.18);
}

/** 画面のまわりだけぼかす層（真ん中は丸く残す）。戻り値の関数で強さ（0〜1）を変える。0 で外す */
function edgeBlur(ctx: FxCtx): (k: number) => void {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
    + '-webkit-mask-image:radial-gradient(ellipse at center,transparent 28%,#000 72%);mask-image:radial-gradient(ellipse at center,transparent 28%,#000 72%)';
  overlay(ctx).append(el);
  return (k) => {
    if (k <= 0) { el.remove(); return; }
    const f = `blur(${(BLUR_PX * k).toFixed(2)}px)`;
    el.style.setProperty('backdrop-filter', f);
    el.style.setProperty('-webkit-backdrop-filter', f);
  };
}

export async function oomie(ctx: FxCtx, k: KingCapture): Promise<void> {
  // 王へ寄る
  await cameraTo(ctx, k.at, NEAR_MS);
  // 最後の一手：ゆっくり迫る駒、回り込むカメラ、抜ける色とまわりのぼかし
  const blur = edgeBlur(ctx);
  const cam = ctx.stage.cam;
  const center = k.at.clone().setY(0.3);
  const off = cam.pos.clone().sub(center);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = ctx.me === 'sente' ? 1 : -1;
  speedLines(ctx, true);
  // 溜めの音：スローに入る音と声「傾奇者、討ち取ったりー」、取る直前に風を切る音（2026-10-28 ユーザーの頼みと録音）
  getSound().play('slowmo', { gain: 0.45 });
  getSound().play('uchitottari');
  void ctx.wait(SLOW_MS * 0.86).then(() => getSound().play('slowWhoosh', { gain: 0.7 }));
  try {
    await ctx.tween(SLOW_MS, (t) => {
      if (k.taker && k.from) takerAlong(k, lastStep(t), 0.3);
      cam.pos.copy(center).add(off.clone().applyAxisAngle(up, dir * ORBIT * easeInOut(t)));
      cam.look.copy(center);
      const ramp = Math.min(1, t / 0.25);
      timeStop(ctx, 0.55 * ramp);
      blur(ramp);
    });
  } finally {
    blur(0);
    timeStop(ctx, 0);
    speedLines(ctx, false);
  }
  if (k.king) k.king.visible = false;
  settleTaker(k);
  // 取った瞬間は太鼓だけ（拍子木は多いとユーザー。2026-10-28）
  getSound().play('drum', { gain: 1 });
  flash(ctx, PALS.soubiPale, 0.55, 260);
  shakeBy(ctx, 0.22);
  // 取った瞬間の派手さ：金の火花・胡粉と金の衝撃の輪・紅白の花びらの噴き出し
  const hit = k.at.clone().setY(0.5);
  sparks(ctx, hit, PAL.soubiLight, 180, 8, 1500);
  sparks(ctx, hit, PAL.wana, 80, 6, 1200);
  shockRing(ctx, k.at, PAL.gofun, 8, 700);
  shockRing(ctx, k.at, PAL.soubi, 5, 900);
  petalStorm(ctx, { mode: 'burst', center: hit, colors: [PALS.wana, PALS.gofun, PALS.sakura], shapes: ['notch', 'petal'], n: 120, size: 0.2, life: 2600, power: 1.8 });
  // 一拍止めてから、取った駒へ寄り直す
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
  petalStorm(ctx, { mode: 'rain', center: k.at, colors, shapes: ['notch', 'petal'], n: 220, size: 0.2, life: 4200, area: 5, height: 7 });
  petalStorm(ctx, { mode: 'swirl', center: k.at, colors: [PALS.sakura, PALS.soubiPale], shapes: ['blossom', 'notch'], n: 110, size: 0.24, life: 3600 });
  // 溜め：柝の刻み（拍子木3。だんだん速くなる）を最後まで聞かせる。そのあいだカメラはゆっくり回り込む。
  // 刻みが終わったら、対局画面がエンディングへ移る（2026-10-28 ユーザーの流れ）
  await ctx.wait(HOLD_MS);
  getSound().play('kizami');
  const c2 = k.at.clone().setY(0.3);
  const off2 = cam.pos.clone().sub(c2);
  await ctx.tween(KIZAMI_MS, (t) => {
    cam.pos.copy(c2).add(off2.clone().applyAxisAngle(up, dir * 0.6 * t));
    cam.look.copy(c2);
  });
  // 取った駒は傾いたまま見せて終わる（KingFxPlay の約束どおり、王のマスにいる）
  if (taker) taker.position.set(k.at.x, k.takerY, k.at.z);
}
