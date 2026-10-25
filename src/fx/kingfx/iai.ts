// 弐「居合一閃」：一瞬で真っ暗になり、取る駒と王だけが照らされてにらみ合う（尺八）。
// 居合の音とともに取る駒が残像を引いて王を駆け抜け、画面を斜めに白い一閃が走る。
// 一拍おいて王が斜めにずれ、上半分が滑り落ちる。切り口から紅の花びらが噴き出して舞う（ユーザーの希望、2026-10-25）
import * as THREE from 'three';
import { PALS } from '../../view/palette';
import { flash, later, shakeBy, transient, type FxCtx } from '../kit';
import { cameraLow, darken, moveSpot } from '../stagecraft';
import { getSound } from '../sound';
import { ghost, nearZ, petalStorm, pieceHalf, screenSlash, settleTaker, type KingCapture } from './common';

const STARE_MS = 1000;  // にらみ合う
const DASH_MS = 130;    // 駆け抜ける
const HOLD_MS = 650;    // 斬ったあとの一拍

export async function iai(ctx: FxCtx, k: KingCapture): Promise<void> {
  const t = k.taker, from = k.from ?? k.at;
  const mid = from.clone().lerp(k.at, 0.5);
  // 1. 暗転してにらみ合う
  getSound().play('shakuhachi', { gain: 1.2 });
  const cam = later(cameraLow(ctx, mid, 700, nearZ(ctx) * (k.at.x >= from.x ? -1 : 1)));
  await darken(ctx, mid, 260, 0.04);
  await cam;
  await ctx.wait(STARE_MS);
  // 2. 駆け抜ける：王の向こうまで一気に。通った跡に残像
  const dir = k.at.clone().sub(from).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
  dir.normalize();
  const past = k.at.clone().addScaledVector(dir, 1.3);
  getSound().play('iai');
  if (t) {
    let lastGhost = -1;
    await ctx.tweenRaw(DASH_MS, (u) => {
      t.position.set(from.x + (past.x - from.x) * u, k.takerY, from.z + (past.z - from.z) * u);
      const g = Math.floor(u * 6);
      if (g !== lastGhost) { lastGhost = g; ghost(ctx, t, 0.45, 520); }
    });
  }
  moveSpot(ctx, k.at);
  flash(ctx, PALS.hakkou, 0.85, 240);
  shakeBy(ctx, 0.25);
  await screenSlash(ctx, -24);
  // 3. 一拍の静けさ
  await ctx.wait(HOLD_MS);
  // 4. 王が斜めにずれて上半分が滑り落ち、紅の花びらが噴き出す
  const king = k.king;
  if (king) {
    getSound().play('daiken');
    const center = king.position.clone().setY(king.position.y + 0.1);
    const n = new THREE.Vector3(dir.z, 0.75, -dir.x).normalize(); // 駆け抜けた向きに沿った斜めの切り口
    const planeA = new THREE.Plane(n.clone(), -n.dot(center));
    const planeB = new THREE.Plane(n.clone().negate(), n.dot(center));
    const A = pieceHalf(king, planeA), B = pieceHalf(king, planeB);
    king.visible = false;
    const grp = new THREE.Group();
    grp.add(A.obj, B.obj);
    const kill = transient(ctx, grp, 60000);
    try {
      petalStorm(ctx, { mode: 'burst', center, colors: [PALS.wana, PALS.wana, PALS.gofun], shapes: ['notch', 'petal'], n: 110, size: 0.22, life: 3400, power: 1.5 });
      shakeBy(ctx, 0.35);
      const slide = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
      if (slide.lengthSq() < 1e-6) slide.copy(dir);
      A.obj.updateMatrix(); B.obj.updateMatrix();
      const invA = A.obj.matrix.clone().invert(), invB = B.obj.matrix.clone().invert();
      const pA0 = planeA.clone(), pB0 = planeB.clone();
      const follow = (o: THREE.Object3D, plane: THREE.Plane, plane0: THREE.Plane, inv0: THREE.Matrix4): void => {
        o.updateMatrix();
        plane.copy(plane0).applyMatrix4(o.matrix.clone().multiply(inv0));
      };
      const a0 = A.obj.position.clone(), rA = A.obj.rotation.clone(), rB = B.obj.rotation.clone();
      await ctx.tween(900, (u) => {
        const q = u * u;
        A.obj.position.copy(a0).addScaledVector(slide, 0.7 * q).add(new THREE.Vector3(0, -0.15 * q, 0));
        A.obj.rotation.set(rA.x, rA.y, rA.z - 0.8 * q * Math.sign(slide.x || 1));
        B.obj.rotation.set(rB.x + 0.15 * q, rB.y, rB.z);
        follow(A.obj, planeA, pA0, invA);
        follow(B.obj, planeB, pB0, invB);
      });
      getSound().play('komaHard');
      // 取る駒は王のマスへ戻り、半分になった王は薄れて消える
      const p0 = t?.position.clone();
      await ctx.tween(420, (u) => {
        for (const m of [...A.mats, ...B.mats]) m.opacity = 1 - u;
        if (t && p0) t.position.lerpVectors(p0, new THREE.Vector3(k.at.x, k.takerY, k.at.z), u);
      });
    } finally {
      kill();
    }
  }
  settleTaker(k);
  await ctx.wait(500);
}
