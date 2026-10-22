// 入れ替えの術（コスト2・約3秒）
// 前振り：2つの駒がぴくっと縮む
// 見せ場：煙玉がボン。煙の中から、入れ替わった場所で駒が跳ねて出てくる
// 余韻：煙が薄れる
import * as THREE from 'three';
import { PAL, PALS } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { PIECE_Y, pieceMesh } from '../../view/pieces3d';
import { cameraTo, easeInOut, easeOut, flash, later, puff, shakeBy, type FxCtx } from '../kit';
import { smokeBall } from '../stagecraft';
import { getSound } from '../sound';
import { effect, pieceIdAt, type CardFx, type MagicCue } from './types';

function pair(ctx: FxCtx, cue: MagicCue): { ma: THREE.Object3D; mb: THREE.Object3D; pa: THREE.Vector3; pb: THREE.Vector3 } | null {
  const e = effect(cue, 'swapped');
  if (!e) return null;
  const ia = pieceIdAt(ctx, e.a), ib = pieceIdAt(ctx, e.b);
  const ma = ia === undefined ? undefined : pieceMesh(ia);
  const mb = ib === undefined ? undefined : pieceMesh(ib);
  if (!ma || !mb) return null;
  return { ma, mb, pa: squarePos(e.a), pb: squarePos(e.b) };
}

export const irekae: CardFx<MagicCue> = {
  async pre(ctx, cue) {
    const p = pair(ctx, cue);
    if (!p) return;
    const cam = later(cameraTo(ctx, p.pa.clone().add(p.pb).multiplyScalar(0.5), 600));
    await ctx.wait(300);
    // ぴくっ：2回縮んで戻る
    getSound().play('tick');
    await ctx.tween(240, (t) => {
      const k = 1 - Math.abs(Math.sin(t * Math.PI * 2)) * 0.22;
      p.ma.scale.set(1, k, 1); p.mb.scale.set(1, k, 1);
    });
    p.ma.scale.set(1, 1, 1); p.mb.scale.set(1, 1, 1);
    await cam;
  },
  async main(ctx, cue) {
    const p = pair(ctx, cue);
    if (!p) return;
    const { ma, mb, pa, pb } = p;
    // 縮んでためて、煙玉がボン
    await ctx.tween(160, (t) => { const k = 1 - 0.28 * t; ma.scale.set(1 + 0.1 * t, k, 1 + 0.1 * t); mb.scale.set(1 + 0.1 * t, k, 1 + 0.1 * t); });
    getSound().play('poof');
    smokeBall(ctx, pa, 1.1);
    smokeBall(ctx, pb, 1.1);
    flash(ctx, PALS.gofun, 0.3, 200);
    shakeBy(ctx, 0.2);
    ma.visible = mb.visible = false;
    ma.scale.set(1, 1, 1); mb.scale.set(1, 1, 1);
    await ctx.wait(560);
    // 煙の中から、入れ替わった場所で跳ねて出てくる（少しずらして）
    ma.position.set(pb.x, PIECE_Y, pb.z);
    mb.position.set(pa.x, PIECE_Y, pa.z);
    const hop = async (m: THREE.Object3D, at: THREE.Vector3, delay: number): Promise<void> => {
      await ctx.wait(delay);
      m.visible = true;
      getSound().play('koma');
      await ctx.tween(400, (t) => {
        const h = Math.sin(t * Math.PI) * 0.95, sq = 1 + Math.sin(t * Math.PI) * 0.15;
        m.position.y = PIECE_Y + h;
        m.rotation.z = Math.sin(t * Math.PI * 2) * 0.18;
        m.scale.set(1, sq, 1);
      }, easeInOut);
      m.rotation.z = 0;
      getSound().play('komaHard');
      puff(ctx, at, PAL.gofun, 12, 0.7);
      await ctx.tween(150, (t) => { const k = 1 - Math.sin(t * Math.PI) * 0.14; m.scale.set(1 + (1 - k) * 0.5, k, 1 + (1 - k) * 0.5); }, easeOut);
      m.scale.set(1, 1, 1);
    };
    await Promise.all([later(hop(ma, pb, 0)), later(hop(mb, pa, 120))]);
    shakeBy(ctx, 0.1);
  },
  async after(ctx) {
    await ctx.wait(500);
  },
};
