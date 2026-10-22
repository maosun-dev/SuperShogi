// 相討ち（コスト3・約3.5秒）
// 前振り：取った駒が着いた瞬間に暗転し、時が止まる
// 見せ場：紅い斬撃が画面を斜めに一閃。少し遅れて、取った駒が真っ二つにずれて崩れる
// 余韻：紅い花びらが散り、照明が戻る
// 駒を割るのは材質の切り口（clippingPlanes）。形と材質は複製して使う（共有の物を捨てないため）
import * as THREE from 'three';
import { PAL, PALS, rgba } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { pieceMesh } from '../../view/pieces3d';
import { animateEl, cameraTo, flash, later, lightCap, overlay, puff, shakeBy, transient, type FxCtx } from '../kit';
import { brighten, darken } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type TrapFireCue } from './types';

/** 画面を斜めに走る紅い太刀筋（重ね板） */
async function slashAcross(ctx: FxCtx): Promise<void> {
  const box = ctx.hud.root.getBoundingClientRect();
  const el = document.createElement('div');
  const len = Math.hypot(box.width, box.height) * 1.2;
  Object.assign(el.style, {
    left: `${box.width / 2 - len / 2}px`, top: `${box.height * 0.45}px`, width: `${len}px`, height: '10px',
    background: `linear-gradient(90deg, ${rgba(PAL.wana, 0)} 0%, ${rgba(PAL.wana, 0.9)} 30%, ${rgba(PAL.gofun, lightCap(ctx, 1))} 50%, ${rgba(PAL.wana, 0.9)} 70%, ${rgba(PAL.wana, 0)} 100%)`,
    boxShadow: `0 0 18px 4px ${rgba(PAL.wana, 0.8)}`,
    borderRadius: '50%',
    transformOrigin: 'center',
  });
  overlay(ctx).append(el);
  try {
    await animateEl(ctx, el, [
      { transform: 'rotate(-32deg) scaleX(0)', opacity: 1, clipPath: 'inset(0 100% 0 0)' },
      { offset: 0.35, transform: 'rotate(-32deg) scaleX(1)', opacity: 1, clipPath: 'inset(0 0 0 0)' },
      { transform: 'rotate(-32deg) scaleX(1) scaleY(0.2)', opacity: 0, clipPath: 'inset(0 0 0 0)' },
    ], { duration: Math.max(1, 420 * ctx.timing.scale), easing: 'cubic-bezier(.2,.8,.3,1)' });
  } finally {
    el.remove();
  }
}

/** 駒の半分（複製）。plane の表側だけ残る */
function half(piece: THREE.Object3D, plane: THREE.Plane): { obj: THREE.Object3D; mats: THREE.Material[] } {
  const obj = piece.clone(true);
  const mats: THREE.Material[] = [];
  obj.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry = m.geometry.clone();
    const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const mat = src.clone();
    mat.clippingPlanes = [plane];
    mat.clipShadows = true;
    mat.side = THREE.DoubleSide; // 切り口から中が見えても抜けないように
    mat.transparent = true;
    m.material = mat;
    mats.push(mat);
  });
  // 装備・印などの飾りは割らない（本体と字だけ）
  obj.children.slice(2).forEach((c) => { c.visible = false; });
  return { obj, mats };
}

/** 紅い花びら */
function petals(ctx: FxCtx, at: THREE.Vector3): void {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = PALS.wana;
  g.beginPath(); g.moveTo(16, 2); g.bezierCurveTo(30, 10, 26, 28, 16, 30); g.bezierCurveTo(6, 28, 2, 10, 16, 2); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const ps: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; ph: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(at.x + (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.6, at.z + (Math.random() - 0.5) * 0.4);
    grp.add(m);
    const a = Math.random() * Math.PI * 2;
    ps.push({ m, v: new THREE.Vector3(Math.cos(a) * 1.4, 1 + Math.random() * 1.5, Math.sin(a) * 1.4), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), ph: Math.random() * 6 });
  }
  const LIFE = 2200;
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const p of ps) {
      p.v.multiplyScalar(1 - dt * 1.8);
      p.v.y -= 0.6 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.position.x += Math.sin(age / 200 + p.ph) * 0.004;
      p.m.position.y = Math.max(0.04, p.m.position.y);
      p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt; p.m.rotation.z += p.spin.z * dt;
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (LIFE - age) / 600);
    }
  });
}

export const aiuchi: CardFx<TrapFireCue> = {
  async pre(ctx, cue) {
    const e = effect(cue, 'destroyed');
    if (!e) return;
    const at = squarePos(e.at);
    // 時が止まる：一気に暗転し、白く一瞬光る
    getSound().play('hyoshigi', { gain: 0.8 });
    flash(ctx, PALS.gofun, 0.5, 200);
    const cam = later(cameraTo(ctx, at, 380));
    await darken(ctx, at, 180, 0.1);
    await cam;
    await ctx.wait(250);
  },
  async main(ctx, cue) {
    const e = effect(cue, 'destroyed');
    if (!e) return;
    const at = squarePos(e.at);
    const piece = pieceMesh(e.pieceId);
    // 一閃
    getSound().play('slash');
    flash(ctx, PALS.wana, 0.45, 220);
    await slashAcross(ctx);
    await ctx.wait(320);
    if (!piece) return;
    // 真っ二つ：斜めの切り口の両側を複製で作り、本物は隠す
    const center = piece.position.clone().setY(piece.position.y + 0.1);
    const n = new THREE.Vector3(0.75, 0.6, 0.28).normalize();
    const planeA = new THREE.Plane(n.clone(), -n.dot(center));
    const planeB = new THREE.Plane(n.clone().negate(), n.dot(center));
    const A = half(piece, planeA), B = half(piece, planeB);
    piece.visible = false;
    const grp = new THREE.Group();
    grp.add(A.obj, B.obj);
    const kill = transient(ctx, grp, 60000);
    try {
      getSound().play('shatter', { gain: 0.5 });
      shakeBy(ctx, 0.3);
      // 切り口に沿って、上の半分がずれ落ちる。下の半分はぐらりと倒れる
      const tangent = new THREE.Vector3(-n.y, n.x, 0).normalize(); // 切り口の面の中の、下り向き
      if (tangent.y > 0) tangent.negate();
      // 切り口の面も半分と一緒に動かす：はじめの形からの動き（行列）を面に当てる
      const follow = (o: THREE.Object3D, plane: THREE.Plane, plane0: THREE.Plane, inv0: THREE.Matrix4): void => {
        o.updateMatrix();
        plane.copy(plane0).applyMatrix4(o.matrix.clone().multiply(inv0));
      };
      A.obj.updateMatrix(); B.obj.updateMatrix();
      const invA = A.obj.matrix.clone().invert(), invB = B.obj.matrix.clone().invert();
      const pA0 = planeA.clone(), pB0 = planeB.clone();
      const a0 = A.obj.position.clone(), ra = A.obj.rotation.z, rb = B.obj.rotation.z;
      await ctx.tween(620, (t) => {
        const k = t * t;
        A.obj.position.copy(a0).addScaledVector(tangent, 0.55 * k).addScaledVector(n, 0.12 * k);
        A.obj.rotation.z = ra - 0.5 * k;
        B.obj.rotation.z = rb + 0.2 * k;
        follow(A.obj, planeA, pA0, invA);
        follow(B.obj, planeB, pB0, invB);
      });
      getSound().play('komaHard');
      puff(ctx, at, PAL.kayaLight, 30, 1.2);
      petals(ctx, at);
      await ctx.tween(380, (t) => { for (const m of [...A.mats, ...B.mats]) m.opacity = 1 - t; });
    } finally {
      kill();
    }
  },
  async after(ctx) {
    await ctx.wait(450);
    await brighten(ctx, 600);
  },
};
