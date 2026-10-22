// 鋼の鎧（コスト2・付けるとき約2.5秒）
// 付けるとき：鎧の板が左右から飛んできて、駒に「ガシャン」とはまる。火花
// 出番（守ったとき）：取りに来た駒が鎧に弾かれ、火花と金属音。元のマスへ跳ね戻され、鎧が砕け散る
import * as THREE from 'three';
import { PALS } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { pieceMesh } from '../../view/pieces3d';
import { armorPlate } from '../../view/equipProps';
import { cameraTo, easeOut, flash, later, shakeBy, transient, type FxCtx } from '../kit';
import { getSound } from '../sound';
import { sparks } from './parts';
import { squareOf, type EquipFx } from './types';

const S = 0.93; // 銀・金くらいの駒の大きさ（演出の板の大きさの目安）

/** 鎧の板が2枚、飛び散って落ちる */
function platesOff(ctx: FxCtx, at: THREE.Vector3): void {
  const grp = new THREE.Group();
  const ps: { m: THREE.Object3D; v: THREE.Vector3; av: THREE.Vector3 }[] = [];
  for (const k of [-1, 1]) {
    const p = armorPlate(S);
    p.position.set(at.x + k * 0.38, 0.12, at.z);
    p.rotation.z = k * 0.5;
    grp.add(p);
    ps.push({ m: p, v: new THREE.Vector3(k * (2 + Math.random()), 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2), av: new THREE.Vector3(Math.random() * 10, Math.random() * 10, k * 8) });
  }
  const mats: THREE.Material[] = [];
  grp.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { (m.material as THREE.Material).transparent = true; mats.push(m.material as THREE.Material); } });
  const LIFE = 1400;
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const p of ps) {
      p.v.y -= 12 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.v.multiplyScalar(0.4); p.v.y = Math.abs(p.v.y) * 0.3; p.av.multiplyScalar(0.5); }
      p.m.rotation.x += p.av.x * dt; p.m.rotation.y += p.av.y * dt; p.m.rotation.z += p.av.z * dt;
    }
    for (const m of mats) m.opacity = Math.min(1, (LIFE - age) / 500);
  });
}

export const hagane: EquipFx = {
  async main(ctx, cue) {
    const sq = squareOf(ctx.after, cue.pieceId);
    if (!sq) return;
    const at = squarePos(sq);
    const cam = later(cameraTo(ctx, at, 500));
    const plates = [-1, 1].map((k) => {
      const p = armorPlate(S);
      p.rotation.set(0, k > 0 ? 0 : Math.PI, 0.5);
      return { p, k };
    });
    const kills = plates.map(({ p }) => transient(ctx, p, 60000));
    try {
      await cam;
      // 左右の遠くから回りながら飛んでくる
      getSound().play('whoosh', { gain: 0.6 });
      await ctx.tween(420, (t) => {
        for (const { p, k } of plates) {
          const d = 2.6 * (1 - t);
          p.position.set(at.x + k * (0.39 + d), 0.1 + Math.sin(Math.PI * t) * 0.9, at.z - d * 0.3);
          p.rotation.y = (k > 0 ? 0 : Math.PI) + (1 - t) * Math.PI * 3 * k;
        }
      }, (t) => 1 - (1 - t) * (1 - t));
      // ガシャン
      getSound().play('armor');
      flash(ctx, PALS.hakkou, 0.4, 160);
      shakeBy(ctx, 0.22);
      for (const k of [-1, 1]) sparks(ctx, at.clone().add(new THREE.Vector3(k * 0.4, 0.2, 0)), new THREE.Vector3(k, 0.5, 0), 50);
      // 駒が一瞬沈んで、締まる
      const m = pieceMesh(cue.pieceId);
      if (m) {
        const y0 = m.position.y;
        await ctx.tween(200, (t) => { m.position.y = y0 - Math.sin(Math.PI * t) * 0.05; });
      }
      // 鉄の面に光がひと筋
      getSound().play('chime', { gain: 0.5 });
      await ctx.wait(450);
    } finally {
      kills.forEach((k) => k());
    }
  },
  async onArmor(ctx, cue) {
    const from = squareOf(ctx.before, cue.attackerId);
    const atk = pieceMesh(cue.attackerId);
    const def = pieceMesh(cue.defenderId);
    const b = squarePos(cue.at);
    await cameraTo(ctx, b, 450);
    if (!from || !atk) return;
    const a = squarePos(from);
    const y0 = atk.position.y;
    const reach = 0.62; // 相手のマスの手前で止められる
    await ctx.tween(200, (t) => {
      atk.position.set(a.x + (b.x - a.x) * reach * t, y0 + Math.sin(Math.PI * t) * 0.12, a.z + (b.z - a.z) * reach * t);
    }, (t) => t * t);
    // ぶつかる：火花と金属音。鎧の印は隠して、板が飛び散る（片付けは sync。鎧が外れた局面で消える）
    const hit = a.clone().lerp(b, 0.78).setY(0.35);
    const backDir = a.clone().sub(b).normalize();
    sparks(ctx, hit, backDir);
    getSound().play('armor');
    getSound().play('clang', { gain: 0.5 });
    flash(ctx, PALS.hakkou, 0.6, 140);
    shakeBy(ctx, 0.38);
    const eqGrp = def?.children.find((c) => (c as THREE.Group).isGroup);
    if (eqGrp) eqGrp.visible = false;
    platesOff(ctx, b);
    const dx0 = def?.position.x ?? 0;
    const sx = atk.position.x, sz = atk.position.z;
    // 弾かれて、元のマスへ跳ね戻される（守った駒は小さく震える）
    await ctx.tween(380, (t) => {
      if (def) def.position.x = dx0 + Math.sin(t * Math.PI * 6) * 0.05 * (1 - t);
      atk.position.set(sx + (a.x - sx) * t, y0 + Math.sin(Math.PI * t) * 0.45, sz + (a.z - sz) * t);
      atk.rotation.z = Math.sin(t * Math.PI * 2) * 0.25;
    }, easeOut);
    if (def) def.position.x = dx0;
    atk.position.set(a.x, y0, a.z);
    atk.rotation.z = 0;
    getSound().play('komaHard');
    await ctx.wait(350);
  },
};
