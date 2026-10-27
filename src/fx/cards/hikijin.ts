// 陣替えの旗（もと退き陣の旗。コスト2・付けるとき約2秒）
// 付けるとき：駒の後ろに金ののぼり旗がすっと立ち、はためいてから小さくなって駒のわきに収まる
// 出番（真後ろへ下がる手）：駒の上で旗が大きくひるがえる
import * as THREE from 'three';
import { PAL } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { banner, flutter } from '../../view/equipProps';
import { cameraTo, easeInOut, easeOut, later, puff, transient } from '../kit';
import { getSound } from '../sound';
import { follow } from './parts';
import { squareOf, type EquipFx } from './types';

export const hikijin: EquipFx = {
  nameMs: 600,
  async main(ctx, cue) {
    const sq = squareOf(ctx.after, cue.pieceId);
    if (!sq) return;
    const at = squarePos(sq);
    const cam = later(cameraTo(ctx, at, 450));
    const back = cue.side === 'sente' ? 1 : -1; // 持ち主から見た後ろ（先手は +z）
    const b = banner(1.3, true);
    const flag = b.userData.flag as THREE.Mesh;
    b.position.set(at.x, 0, at.z + back * 0.55);
    if (cue.side === 'gote') b.rotation.y = Math.PI;
    b.scale.set(1, 0.01, 1);
    let t0 = 0;
    const kill = transient(ctx, b, 60000, (dt) => { t0 += dt; flutter(flag, t0, 2.2); });
    try {
      // すっと立つ
      getSound().play('whoosh', { gain: 0.5 });
      puff(ctx, b.position.clone(), PAL.soubiLight, 16, 0.6);
      await ctx.tween(320, (t) => { b.scale.set(1, Math.max(0.01, easeOut(t)), 1); });
      getSound().play('tick');
      await cam;
      // はためく
      await ctx.wait(620);
      // 小さくなって、駒のわきへ収まる（盤の印の旗の位置へ）
      const p0 = b.position.clone();
      const side = cue.side === 'sente' ? -1 : 1; // 駒の左わき（後手は向きが逆）
      const p1 = new THREE.Vector3(at.x + side * 0.38, 0.02, at.z + back * 0.1);
      await ctx.tween(380, (t) => {
        b.position.lerpVectors(p0, p1, t);
        const k = 1 - 0.45 * t;
        b.scale.set(k, k, k);
      }, easeInOut);
    } finally {
      kill();
    }
  },
  async onMove(ctx, cue) {
    // 駒について回る大きな旗が、下がるあいだひるがえる（待たずに戻り、ふだんの1手と一緒に流れる）
    const b = banner(1.0, true);
    const flag = b.userData.flag as THREE.Mesh;
    if (cue.side === 'gote') b.rotation.y = Math.PI;
    const LIFE = 900 * Math.max(0.6, ctx.timing.scale);
    getSound().play('whoosh', { gain: 0.6 });
    follow(ctx, cue.pieceId, b, LIFE, (m, age) => {
      const t = age / LIFE;
      b.position.set(m.position.x, m.position.y + 0.1, m.position.z);
      const k = Math.sin(Math.PI * Math.min(1, t * 1.4));
      b.scale.set(1, Math.max(0.01, k), 1);
      flutter(flag, age / 1000, 3);
    });
  },
};
