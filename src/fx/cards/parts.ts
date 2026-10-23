// 札ごとの演出で使い回す小道具：金属の火花・駒の残像・駒の位置を追いかける物
import * as THREE from 'three';
import { PAL } from '../../view/palette';
import { pieceMesh } from '../../view/pieces3d';
import { lightCap, transient, type FxCtx } from '../kit';

/** 駒に付けていた纏札の印（駒の組の中の組）を隠す。片付けは sync（外れた局面で消える） */
export function hideEquipMark(pieceId: number): void {
  const eqGrp = pieceMesh(pieceId)?.children.find((c) => (c as THREE.Group).isGroup);
  if (eqGrp) eqGrp.visible = false;
}

/** 金属の火花：at から back の向きへ多めに散る */
export function sparks(ctx: FxCtx, at: THREE.Vector3, back: THREE.Vector3, n = 110, color: number = PAL.soubiPale): void {
  const geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    arr.set([at.x, at.y, at.z], i * 3);
    const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().add(back.clone().multiplyScalar(0.8));
    v.push(d.normalize().multiplyScalar(3 + Math.random() * 6));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color, size: 0.1, transparent: true, opacity: lightCap(ctx, 1), blending: THREE.AdditiveBlending, depthWrite: false });
  transient(ctx, new THREE.Points(geo, pm), 800, (dt) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      v[i].y -= 14 * dt;
      pos.setXYZ(i, pos.getX(i) + v[i].x * dt, Math.max(0.02, pos.getY(i) + v[i].y * dt), pos.getZ(i) + v[i].z * dt);
    }
    pos.needsUpdate = true;
    pm.opacity = Math.max(0, pm.opacity - dt * 1.4);
  });
}

/** 駒の残像を今の位置に1つ置き、life ミリ秒で薄れさせる（形は複製、材質は新しく作る） */
export function ghost(ctx: FxCtx, pieceId: number, color: number, life: number, opacity = 0.55): void {
  const m = pieceMesh(pieceId);
  const body = m?.children[0] as THREE.Mesh | undefined;
  if (!m || !body) return;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const g = new THREE.Mesh(body.geometry.clone(), mat);
  g.position.copy(m.position);
  g.rotation.copy(m.rotation);
  const LIFE = life * Math.max(0.5, ctx.timing.scale);
  transient(ctx, g, LIFE, (_dt, age) => { mat.opacity = opacity * Math.max(0, 1 - age / LIFE); });
}

/**
 * 駒について回る物を置く（駒の組には足さない：舞台に置いて毎フレーム駒の位置へ合わせる）。
 * step には駒の物と経った時間が渡る。life ミリ秒で片付く
 */
export function follow(
  ctx: FxCtx, pieceId: number, obj: THREE.Object3D, life: number,
  step: (piece: THREE.Object3D, age: number) => void,
): () => void {
  return transient(ctx, obj, life, (_dt, age) => {
    const m = pieceMesh(pieceId);
    if (m) step(m, age);
  });
}
