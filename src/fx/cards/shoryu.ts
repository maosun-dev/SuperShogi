// 成り上がり（コスト2・約3.5秒）
// 前振り：駒の足元から金の光が湧き、下から照らされる
// 見せ場：駒が回りながら宙へ昇り、朱の光の輪が何重にも広がる。てっぺんでくるっと裏返り、ドスンと着地して金の粒が噴き上がる
// 余韻：成った字が一度光る
// 成り封じに止められたとき（効果に promotedInPlace が無い）は、昇りかけて下り、続く成り封じの演出に任せる
// 50手目からの2つ成らせるときは、1つずつ順に同じ流れを見せる（2つ目は足元の光から）
import * as THREE from 'three';
import { PAL, PALS } from '../../view/palette';
import { ring, squarePos } from '../../view/board3d';
import { PIECE_Y, pieceLabel, pieceMesh, settleFlipped } from '../../view/pieces3d';
import { cameraTo, easeInOut, easeOut, flash, later, lightCap, puff, shakeBy, transient, type FxCtx } from '../kit';
import { pointLight, pointOff } from '../stagecraft';
import { getSound } from '../sound';
import { pieceIdAt, type CardFx, type MagicCue } from './types';

const RISE = 1.6;

type Target = { id: number; m: THREE.Object3D; at: THREE.Vector3 };

function target(ctx: FxCtx, cue: MagicCue, i = 0): Target | null {
  const sq = cue.targets[i];
  if (!sq) return null;
  const id = pieceIdAt(ctx, sq);
  const m = id === undefined ? undefined : pieceMesh(id);
  return id === undefined || !m ? null : { id, m, at: squarePos(sq) };
}

/** 足元から湧き上がる金の粒（life ミリ秒） */
function goldRise(ctx: FxCtx, at: THREE.Vector3, life: number): void {
  const N = 60, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3);
  const seed: { a: number; r: number; y: number; v: number }[] = [];
  for (let i = 0; i < N; i++) {
    const s = { a: Math.random() * Math.PI * 2, r: 0.15 + Math.random() * 0.45, y: Math.random() * 0.4, v: 0.6 + Math.random() * 1.4 };
    seed.push(s);
    arr.set([at.x, s.y, at.z], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color: PAL.soubiLight, size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const LIFE = life * ctx.timing.scale;
  transient(ctx, new THREE.Points(geo, pm), LIFE, (dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      s.y += s.v * dt;
      s.a += dt * 1.5;
      if (s.y > 2.2) s.y = 0;
      pos.setXYZ(i, at.x + Math.cos(s.a) * s.r, s.y, at.z + Math.sin(s.a) * s.r);
    }
    pos.needsUpdate = true;
    const t = age / LIFE;
    pm.opacity = lightCap(ctx, 0.9) * Math.min(1, t * 4, (1 - t) * 4);
  });
}

/** 足元の金の光だまり（life ミリ秒、ふくらんで消える） */
function goldPool(ctx: FxCtx, at: THREE.Vector3, life: number): void {
  const r = ring(0.02, 0.75, PAL.soubiLight, 48);
  r.position.set(at.x, 0.025, at.z);
  r.material.blending = THREE.AdditiveBlending;
  const LIFE = life * ctx.timing.scale;
  transient(ctx, r, LIFE, (_dt, age) => {
    const t = Math.min(1, age / LIFE);
    r.scale.setScalar(0.6 + easeOut(Math.min(1, t * 3)) * 0.6);
    r.material.opacity = lightCap(ctx, 0.6) * Math.min(1, t * 5, (1 - t) * 3);
  });
}

/** 朱の光の輪が1つ、高さ y で広がる */
function redRing(ctx: FxCtx, at: THREE.Vector3, y: number): void {
  const r = ring(0.36, 0.48, PAL.wana, 48);
  r.position.set(at.x, y, at.z);
  r.material.blending = THREE.AdditiveBlending;
  const LIFE = 620;
  transient(ctx, r, LIFE, (_dt, age) => {
    const t = Math.min(1, age / LIFE);
    const k = 1 + easeOut(t) * 2.2;
    r.scale.set(k, k, k);
    r.material.opacity = lightCap(ctx, 0.95) * (1 - t);
  });
}

/** 噴き上がる金の粒（着地のとき） */
function goldBurst(ctx: FxCtx, at: THREE.Vector3): void {
  const N = 90, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    arr.set([at.x, 0.1, at.z], i * 3);
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
    v.push(new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color: PAL.soubiPale, size: 0.11, transparent: true, opacity: lightCap(ctx, 1), blending: THREE.AdditiveBlending, depthWrite: false });
  transient(ctx, new THREE.Points(geo, pm), 1100, (dt) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      v[i].y -= 9 * dt;
      pos.setXYZ(i, pos.getX(i) + v[i].x * dt, Math.max(0.03, pos.getY(i) + v[i].y * dt), pos.getZ(i) + v[i].z * dt);
    }
    pos.needsUpdate = true;
    pm.opacity = Math.max(0, pm.opacity - dt * 1.0);
  });
}

/** 字の板を一度光らせる（材質は複製して差し替え、最後に戻す） */
async function glowLabel(ctx: FxCtx, id: number): Promise<void> {
  const label = pieceLabel(id);
  if (!label) return;
  const shared = label.material as THREE.MeshStandardMaterial;
  const mat = shared.clone();
  mat.emissive = new THREE.Color(PAL.wana);
  mat.emissiveIntensity = 0;
  label.material = mat;
  try {
    await ctx.tween(520, (t) => { mat.emissiveIntensity = Math.sin(Math.PI * t) * 1.6 * (lightCap(ctx, 0.9) / 0.9); });
  } finally {
    if (label.material === mat) label.material = shared;
    mat.dispose();
  }
}

/** その駒が成った知らせ（成り封じに止められたら無い） */
function promotedOf(cue: MagicCue, pieceId: number): boolean {
  return cue.effects.some((e) => e.type === 'promotedInPlace' && e.pieceId === pieceId);
}

/** 1つの駒：回りながら昇って裏返り、ドスンと着く。止められたら昇りかけて下りる */
async function riseOne(ctx: FxCtx, p: Target, done: boolean): Promise<void> {
  const { id, m, at } = p;
  const s = (m.userData.s as number | undefined) ?? 1;
  const yaw = m.rotation.y;
  const y0 = m.position.y;
  if (!done) {
    // 成り封じに止められる：昇りかけて下りる（封じの演出が続く）
    await ctx.tween(420, (t) => { m.position.y = y0 + 0.6 * Math.sin(Math.PI * t); m.rotation.y = yaw + Math.PI * 2 * t; }, easeInOut);
    m.rotation.y = yaw;
    pointOff();
    return;
  }
  // 回りながら昇る。朱の輪が何重にも広がる
  getSound().play('whoosh', { gain: 0.6 });
  let rings = 0;
  await ctx.tween(760, (t) => {
    m.position.y = y0 + RISE * easeOut(t);
    m.rotation.y = yaw + Math.PI * 4 * easeOut(t);
    pointLight(ctx, at.clone().setY(0.3 + RISE * t * 0.5), 8 + 6 * t, PAL.soubiLight, 4);
    while (rings < 4 && t >= rings * 0.22) { redRing(ctx, at, y0 + RISE * easeOut(t) * 0.9); rings++; }
  });
  m.rotation.y = yaw;
  // てっぺんでくるっと裏返る（裏の字＝成った字が上に）
  let rang = false;
  await ctx.tween(300, (t) => {
    m.rotation.set(0, yaw, Math.PI * easeInOut(t));
    if (!rang && t > 0.5) { rang = true; getSound().play('kaesu'); flash(ctx, PALS.soubiPale, 0.5, 200); }
  });
  // ドスン：裏返った駒の厚みのぶん高く着く
  const land = PIECE_Y + 0.16 * s;
  const top = m.position.y;
  await ctx.tween(200, (t) => { m.position.y = top + (land - top) * t * t; });
  pointOff();
  getSound().play('thud');
  getSound().play('levelup');
  goldBurst(ctx, at);
  puff(ctx, at, PAL.kayaLight, 30, 1.4);
  shakeBy(ctx, 0.3);
  if (ctx.alive()) settleFlipped(id);
}

export const shoryu: CardFx<MagicCue> = {
  async pre(ctx, cue) {
    const p = target(ctx, cue);
    if (!p) return;
    const cam = later(cameraTo(ctx, p.at, 620));
    goldPool(ctx, p.at, 2400);
    goldRise(ctx, p.at, 2400);
    // 下から照らす光がだんだん強くなる
    await ctx.tween(620, (t) => { pointLight(ctx, p.at.clone().setY(0.3), 8 * t, PAL.soubiLight, 3.5); });
    await cam;
  },
  async main(ctx, cue) {
    for (let i = 0; i < cue.targets.length; i++) {
      const p = target(ctx, cue, i);
      if (!p) continue;
      if (i > 0) {
        // 2つ目：カメラを寄せ、足元の光を湧かせてから昇る
        const cam = later(cameraTo(ctx, p.at, 480));
        goldPool(ctx, p.at, 1800);
        goldRise(ctx, p.at, 1800);
        await ctx.tween(480, (t) => { pointLight(ctx, p.at.clone().setY(0.3), 8 * t, PAL.soubiLight, 3.5); });
        await cam;
      }
      await riseOne(ctx, p, promotedOf(cue, p.id));
    }
    pointOff();
  },
  async after(ctx, cue) {
    const done = cue.effects.filter((e) => e.type === 'promotedInPlace');
    await Promise.all(done.map((e) => glowLabel(ctx, e.pieceId)));
    await ctx.wait(400);
  },
  cleanup() {
    pointOff();
  },
};
