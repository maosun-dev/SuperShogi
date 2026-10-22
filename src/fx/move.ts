// ふだんの1手の演出：動かす（弧を描いてパチン）・取る（はじいて駒台へ）・成る（くるっと裏返す）・打つ（上からストン）。
// 相手の手は、動く前に元の駒を一瞬光らせて、どこから動いたかを見せる。
// 長さは moveTiming.ts（長め／短め・動きを減らす）。決まりは kit.ts と同じ：舞台は kit の道具を通してさわる
import * as THREE from 'three';
import type { Square } from '../rules/types';
import type { Cue } from './plan';
import { BD, ring, screenToBoard, squarePos } from '../view/board3d';
import { PIECE_Y, pieceMesh, settleFlipped } from '../view/pieces3d';
import { PAL } from '../view/palette';
import { getSound } from './sound';
import { easeInOut, easeOut, later, puff, shakeBy, transient, type FxCtx } from './kit';
import { moveTimings } from './moveTiming';

type MoveCue = Extract<Cue, { kind: 'move' }>;
type DropCue = Extract<Cue, { kind: 'drop' }>;

const ARC = 0.35;        // 動くときの弧の高さ
const SINK = 0.04;       // 着いたときに沈む深さ
const FLIP_HOP = 0.5;    // 裏返すときに浮かせる高さ（駒が盤にめり込まないように）
const DROP_FROM = 1.1;   // 打つ駒が現れる高さ
const CALM_DROP = 0.7;   // 動きを減らすときに、打つ駒が降りてくる高さ
const FLY_Y = 1.2;       // 取られた駒が飛んでいく先の高さ
const FLY_FAR = 20;      // 駒台の方向がこれより遠くに当たったら、盤の手前の端へ飛ばす
const DUST = PAL.kayaLight;

const easeIn = (t: number): number => t * t;

/** 長さ 0 の動きは最後の形にするだけ（tweenRaw に 0 を渡さない） */
function run(ctx: FxCtx, ms: number, fn: (t: number) => void, ease?: (t: number) => number): Promise<void> {
  if (ms <= 0) { fn(1); return Promise.resolve(); }
  return ctx.tweenRaw(ms, fn, ease);
}

/** 駒の木の部分（いちばん目の子）。材質は共有なので、変えるときは複製を差し替える */
function bodyOf(m: THREE.Object3D): THREE.Mesh | null {
  const b = m.children[0];
  return b && (b as THREE.Mesh).isMesh ? (b as THREE.Mesh) : null;
}

/** 相手の駒が動く前に、一瞬明るく光る */
async function glow(ctx: FxCtx, m: THREE.Object3D, ms: number): Promise<void> {
  const body = bodyOf(m);
  if (!body) return;
  const shared = body.material as THREE.MeshStandardMaterial;
  const mat = shared.clone();
  mat.emissive = new THREE.Color(PAL.soubiLight);
  mat.emissiveIntensity = 0;
  body.material = mat;
  try {
    await run(ctx, ms, (t) => { mat.emissiveIntensity = Math.sin(Math.PI * t) * 0.7; });
  } finally {
    if (body.material === mat) body.material = shared;
    mat.dispose();
  }
}

/** 取った駒を飛ばす先：取った側の駒台の方向。取れなければ、取った側の盤の手前の端 */
function flyTarget(ctx: FxCtx, side: MoveCue['side'], from: THREE.Vector3): THREE.Vector3 {
  const rect = ctx.hud.komadaiRect(side === ctx.me ? 'me' : 'foe');
  if (rect) {
    const p = screenToBoard(ctx.stage, rect.left + rect.width / 2, rect.top + rect.height / 2, FLY_Y);
    if (p && p.distanceTo(from) < FLY_FAR) return p;
  }
  return new THREE.Vector3(from.x, FLY_Y, (side === 'sente' ? 1 : -1) * (BD / 2 + 0.5));
}

/** 取られた駒：はじかれて回りながら駒台の方へ飛び、縮んで消える */
function flyAway(ctx: FxCtx, pieceId: number, side: MoveCue['side'], ms: number): Promise<void> {
  const m = pieceMesh(pieceId);
  if (!m) return Promise.resolve();
  const a = m.position.clone();
  const b = flyTarget(ctx, side, a);
  const spin = (Math.random() < 0.5 ? -1 : 1) * Math.PI * 3;
  const r0 = m.rotation.clone();
  return run(ctx, ms, (t) => {
    const e = easeIn(t);
    m.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e + Math.sin(Math.PI * t) * 0.9, a.z + (b.z - a.z) * e);
    m.rotation.set(r0.x + spin * t * 0.6, r0.y, r0.z + spin * t);
    const k = Math.max(0.05, 1 - 0.9 * t);
    m.scale.set(k, k, k);
    if (t >= 1) m.visible = false;
  });
}

/** 動きを減らすとき：取られた駒はその場で薄くなって消える（材質は複製） */
function fadeAway(ctx: FxCtx, pieceId: number, ms: number): Promise<void> {
  const m = pieceMesh(pieceId);
  if (!m) return Promise.resolve();
  const mats: THREE.Material[] = [];
  for (const c of m.children) {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh || !c.visible) { c.visible = false; continue; }
    const mat = (mesh.material as THREE.Material).clone();
    mat.transparent = true;
    mesh.material = mat;
    mats.push(mat);
  }
  return run(ctx, ms, (t) => {
    for (const mat of mats) mat.opacity = 1 - t;
    if (t >= 1) m.visible = false;
  }).finally(() => { for (const mat of mats) mat.dispose(); });
}

/** 着いた所の木の粉と揺れと音 */
function land(ctx: FxCtx, at: THREE.Vector3, hard: boolean, shake: number): void {
  getSound().play(hard ? 'komaHard' : 'koma');
  if (moveTimings(ctx.timing).calm) return;
  puff(ctx, new THREE.Vector3(at.x, 0, at.z), DUST, 10, 0.5);
  shakeBy(ctx, shake);
}

/** 成りの朱の輪：盤の上に1つ広がって消える */
function promoteRing(ctx: FxCtx, at: THREE.Vector3): void {
  const r = ring(0.34, 0.5, PAL.wana, 48);
  r.position.set(at.x, 0.03, at.z);
  const LIFE = 520;
  transient(ctx, r, LIFE, (_dt, age) => {
    const t = Math.min(1, age / LIFE);
    const k = 1 + easeOut(t) * 1.4;
    r.scale.set(k, k, k);
    r.material.opacity = 0.9 * (1 - t);
  });
}

/** 成り：その場で前後の軸まわりにくるっと裏返し、裏の字（成った字）を見せる */
async function flip(ctx: FxCtx, m: THREE.Object3D, at: THREE.Vector3, ms: number): Promise<void> {
  const s = (m.userData.s as number | undefined) ?? 1;
  const yaw = m.rotation.y;
  let rang = false;
  await run(ctx, ms, (t) => {
    const e = easeInOut(t);
    // 裏返ると駒の厚み（0.16×大きさ）だけ下へ出るので、そのぶん持ち上げる
    m.position.y = PIECE_Y + Math.sin(Math.PI * t) * FLIP_HOP + 0.16 * s * e;
    m.rotation.set(0, yaw, Math.PI * e);
    if (!rang && t >= 0.5) {
      rang = true;
      promoteRing(ctx, at);
      getSound().play('kaesu');
    }
  });
}

export async function playMove(ctx: FxCtx, cue: MoveCue): Promise<void> {
  const m = pieceMesh(cue.pieceId);
  if (!m) return;
  const T = moveTimings(ctx.timing);
  const a = m.position.clone();             // 浮いていれば、その高さから始める
  const b = squarePos(cue.to);
  const y0 = a.y;

  if (cue.side !== ctx.me) await glow(ctx, m, T.foeGlow);

  if (T.calm) {
    await run(ctx, T.travel, (t) => {
      m.position.set(a.x + (b.x - a.x) * t, y0 + (PIECE_Y - y0) * t, a.z + (b.z - a.z) * t);
    }, easeOut);
  } else {
    await run(ctx, T.travel, (t) => {
      m.position.set(a.x + (b.x - a.x) * t, y0 + (PIECE_Y - y0) * t + Math.sin(Math.PI * t) * ARC, a.z + (b.z - a.z) * t);
    }, easeOut);
  }

  // 着いた瞬間：取られた駒をはじく（並べて走らせ、沈みと一緒に進める）
  const away = cue.captured
    ? later(T.calm ? fadeAway(ctx, cue.captured.pieceId, T.fly) : flyAway(ctx, cue.captured.pieceId, cue.side, T.fly))
    : null;
  land(ctx, b, !!cue.captured, cue.captured ? 0.08 : 0.03);
  await run(ctx, T.settle, (t) => { m.position.y = PIECE_Y - Math.sin(Math.PI * t) * SINK; });
  if (away) await away;

  if (cue.promoted) {
    if (T.calm) {
      promoteRing(ctx, b);
      getSound().play('kaesu');
    } else {
      await flip(ctx, m, b, T.flip);
      // 盤全体はまだ揃えない（このあとに罠などの演出が続くことがある）。この駒だけ成った見た目にする
      if (ctx.alive()) settleFlipped(cue.pieceId);
    }
  }
}

export async function playDrop(ctx: FxCtx, cue: DropCue): Promise<void> {
  // 打った駒は局面を揃えてから、上から降ろす
  ctx.sync();
  const m = pieceMesh(cue.pieceId);
  if (!m) return;
  const T = moveTimings(ctx.timing);
  const y0 = m.position.y;
  const at: Square = cue.to;
  if (T.calm) {
    await run(ctx, T.fall, (t) => { m.position.y = y0 + (1 - t) * CALM_DROP; }, easeOut);
  } else {
    m.position.y = y0 + DROP_FROM;
    await run(ctx, T.hang, (t) => { m.position.y = y0 + DROP_FROM + Math.sin(Math.PI * t) * 0.05; });
    await run(ctx, T.fall, (t) => { m.position.y = y0 + DROP_FROM * (1 - t); }, easeIn);
  }
  land(ctx, squarePos(at), true, 0.05);
}
