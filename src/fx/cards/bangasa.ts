// 番傘（コスト2・付けるとき約2秒）
// 付けるとき：閉じた番傘が上からくるくる回りながら降りてきて、駒の上でぱっと開き、ひと揺れして駒の後ろに収まる。
// 出番の演出は作らない（罠が効かなかったことを見せると、伏せた罠の場所と中身が相手に漏れるため）
import { squarePos } from '../../view/board3d';
import { umbrella } from '../../view/equipProps';
import { cameraTo, easeOut, later, shakeBy, transient } from '../kit';
import { getSound } from '../sound';
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
};
