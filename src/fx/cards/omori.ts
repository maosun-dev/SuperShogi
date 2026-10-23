// 重りの枷（コスト3・付けるとき約2.5秒）相手の駒に付ける重荷
// 付けるとき：上から鎖付きの黒い鉄球がずしんと落ち、駒の足元に鎖が巻き付く。盤が沈むように揺れ、土ぼこり
// 出番（外れるとき）：鎖が錆びて、ボロッと崩れ落ちる
import * as THREE from 'three';
import { PAL, PALS } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { pieceMesh } from '../../view/pieces3d';
import { chainRing, ironBall } from '../../view/equipProps';
import { cameraTo, easeOut, flash, later, puff, shakeBy, transient } from '../kit';
import { getSound } from '../sound';
import { squareOf, type EquipFx } from './types';
import { hideEquipMark } from './parts';

const R = 0.42; // 足元の鎖の輪の大きさ

/** 鉄球から上へ伸びる鎖（縦に並べた輪） */
function hangingChain(n: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: PAL.sumi, metalness: 0.6, roughness: 0.5 });
  const geo = new THREE.TorusGeometry(0.05, 0.017, 6, 12);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(i ? geo.clone() : geo, mat);
    m.position.y = 0.12 + i * 0.085;
    m.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(m);
  }
  return g;
}

export const omori: EquipFx = {
  async main(ctx, cue) {
    const sq = squareOf(ctx.after, cue.pieceId);
    if (!sq) return;
    const at = squarePos(sq);
    const cam = later(cameraTo(ctx, at, 500));
    const ball = ironBall(0.2);
    const hang = hangingChain(18);
    ball.add(hang);
    const ballAt = at.clone().add(new THREE.Vector3(0.5, 0, -0.2));
    const killBall = transient(ctx, ball, 60000);
    const ring = chainRing(R * 2.6, 16);
    ring.visible = false;
    const killRing = transient(ctx, ring, 60000);
    try {
      await cam;
      // ずしん：鉄球が上から落ちる
      getSound().play('whoosh', { gain: 0.5 });
      await ctx.tween(380, (t) => { ball.position.set(ballAt.x, 0.2 + 5 * (1 - t * t), ballAt.z); });
      getSound().play('thud');
      getSound().play('drum', { gain: 0.6 });
      shakeBy(ctx, 0.45);
      flash(ctx, PALS.sumi, 0.25, 220);
      puff(ctx, ballAt, PAL.kayaGrainDeep, 40, 1.4);
      // 盤が沈むように、駒も一瞬沈む
      const m = pieceMesh(cue.pieceId);
      const y0 = m?.position.y ?? 0;
      await ctx.tween(220, (t) => { if (m) m.position.y = y0 - Math.sin(Math.PI * t) * 0.07; });
      // 鎖が足元に巻き付く（大きな輪が回りながら締まる）
      ring.visible = true;
      getSound().play('chain');
      await ctx.tween(520, (t) => {
        const k = 1 - (1 - 1 / 2.6) * easeOut(t);
        ring.scale.setScalar(k);
        ring.position.set(at.x, 0.05 + (1 - t) * 0.5, at.z);
        ring.rotation.y = (1 - t) * Math.PI * 2;
      });
      getSound().play('chain', { gain: 0.6 });
      // 吊り鎖は鉄球に縮んでいく（盤の印の小さな鉄球になる）
      await ctx.tween(300, (t) => { hang.scale.set(1, Math.max(0.01, 1 - t), 1); ball.scale.setScalar(1 - 0.35 * t); });
      await ctx.wait(250);
    } finally {
      killBall();
      killRing();
    }
  },
  async onBreak(ctx, cue) {
    const at = squarePos(cue.at);
    // まず枷の付いた駒へ寄る（盤の印の鎖が見えているうちに）
    await cameraTo(ctx, at, 450);
    await ctx.wait(150);
    hideEquipMark(cue.pieceId);
    // 錆びる：鎖の色が錆の色へ変わり、輪がばらばらに崩れ落ちる
    const ring = chainRing(R, 14);
    ring.position.set(at.x, 0.05, at.z);
    const mats = new Set<THREE.MeshStandardMaterial>();
    ring.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) mats.add(m.material as THREE.MeshStandardMaterial); });
    for (const m of mats) m.transparent = true;
    const rust = new THREE.Color(PAL.kayaLeg), dark = new THREE.Color(PAL.sumi);
    const parts = ring.children.map((c) => ({ c, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5), av: Math.random() * 8 }));
    let phase = 0; // 0 = 錆びる、1 = 崩れる
    const kill = transient(ctx, ring, 60000, (dt) => {
      if (phase !== 1) return;
      for (const p of parts) {
        p.v.y -= 9 * dt;
        p.c.position.addScaledVector(p.v, dt);
        if (p.c.position.y < -0.04) { p.c.position.y = -0.04; p.v.set(p.v.x * 0.5, 0, p.v.z * 0.5); }
        p.c.rotation.x += p.av * dt;
      }
    });
    try {
      await ctx.tween(500, (t) => { for (const m of mats) m.color.copy(dark).lerp(rust, t); });
      phase = 1;
      getSound().play('chain', { gain: 0.8 });
      puff(ctx, at, PAL.kayaLeg, 26, 0.9);
      await ctx.tween(500, (t) => { for (const m of mats) m.opacity = 1 - t * t; });
    } finally {
      kill();
    }
  },
};
