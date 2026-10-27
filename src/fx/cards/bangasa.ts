// 番傘（コスト2・付けるとき約2秒）
// 付けるとき：閉じた番傘が上からくるくる回りながら降りてきて、駒の上でぱっと開き、ひと揺れして駒の後ろに収まる。
// 出番（罠を受け止めた）：駒の上で傘がぱっと開き、罠の紅の光を受け止めて震え、破れて骨ごと崩れ落ちる。
// 罠は使い切られて表に出るので、見せても伏せた側の損にはならない（罠が効いたときと同じだけ分かる）
import * as THREE from 'three';
import { PALS } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { umbrella } from '../../view/equipProps';
import { cameraTo, easeOut, flash, later, puff, shakeBy, transient } from '../kit';
import { getSound } from '../sound';
import { hideEquipMark } from './parts';
import { squareOf, type EquipFx } from './types';

const R = 0.42; // 演出の傘の半径（駒に差す傘より少し大きく見せる）

export const bangasa: EquipFx = {
  async main(ctx, cue) {
    const sq = squareOf(ctx.after, cue.pieceId);
    if (!sq) return;
    const at = squarePos(sq);
    const cam = later(cameraTo(ctx, at, 500));
    const u = umbrella(R, 0.1);
    const canopy = u.getObjectByName('canopy')!;
    const kill = transient(ctx, u, 60000);
    try {
      await cam;
      // 閉じたまま、回りながら降りてくる
      getSound().play('whoosh', { gain: 0.5 });
      await ctx.tween(560, (t) => {
        u.position.set(at.x, 2.6 - 1.8 * t, at.z);
        u.rotation.y = (1 - t) * Math.PI * 4;
      }, easeOut);
      // ぱっと開く
      getSound().play('flip');
      await ctx.tween(220, (t) => {
        const k = 0.1 + 0.9 * t + Math.sin(Math.PI * t) * 0.15;
        canopy.scale.set(k, 1, k);
      });
      shakeBy(ctx, 0.06);
      // ひと揺れして、駒の後ろへ小さく収まる（印の傘に引き継ぐ）
      await ctx.tween(420, (t) => {
        u.rotation.z = Math.sin(t * Math.PI * 2) * 0.12 * (1 - t);
        const sc = 1 - 0.2 * t;
        u.scale.setScalar(sc);
        u.position.y = 0.8 - 0.1 * t;
      });
      await ctx.wait(250);
    } finally {
      kill();
    }
  },
  async onWard(ctx, cue) {
    const at = squarePos(cue.at);
    await cameraTo(ctx, at, 450);
    hideEquipMark(cue.pieceId); // 駒に差していた小さな傘を隠す（片付けは sync）
    const u = umbrella(R, 0.2);
    const canopy = u.getObjectByName('canopy')!;
    u.position.set(at.x, 0.9, at.z);
    const kill = transient(ctx, u, 60000);
    try {
      // ぱっと開いて、駒の上にかざす
      getSound().play('flip');
      await ctx.tween(200, (t) => { const k = 0.2 + 0.8 * t; canopy.scale.set(k, 1, k); });
      // 罠の力を受け止める：紅の光と、傘が押し下げられて震える
      getSound().play('glass', { gain: 0.6 });
      flash(ctx, PALS.wana, 0.45, 220);
      shakeBy(ctx, 0.25);
      await ctx.tween(420, (t) => {
        u.position.y = 0.9 - Math.sin(Math.PI * Math.min(1, t * 2)) * 0.25;
        u.rotation.z = Math.sin(t * 40) * 0.08 * (1 - t);
      });
      // 破れて、骨ごと崩れ落ちる
      getSound().play('shatter', { gain: 0.5 });
      puff(ctx, at.clone().setY(0.8), new THREE.Color(PALS.wana).getHex(), 24, 1.2);
      await ctx.tween(520, (t) => {
        canopy.scale.set(1 - 0.6 * t, 1 - 0.7 * t, 1 - 0.6 * t);
        u.position.y = 0.65 - 0.6 * t * t;
        u.rotation.x = t * 1.1;
      }, easeOut);
    } finally {
      kill();
    }
  },
};
