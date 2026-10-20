// 王手と決着の演出。
// 王手：紅の帯に筆文字「王手」（700ms、墨しぶきなし、カメラは動かさない）。王手中の王の輪は sync が出す。
// 決着：取られる王へカメラが寄る → 時間がゆっくり（0.25 倍）になり、取る駒がじわりと入る
//       → カメラが王の周りを一周（2400ms、camera:false なら省く）→ 取られた王が回りながら天高く飛ぶ。
//       引き分けは盤全体を映すだけ（そのあと結果画面への幕は画面の切り替えが引く）。
// 王を取る手の駒の移動は、演出役（player.ts）が普段の移動として流さずに、ここでゆっくり流す
import * as THREE from 'three';
import type { Square } from '../rules/types';
import type { Cue } from './plan';
import { PAL, PALS } from '../view/palette';
import { squarePos } from '../view/board3d';
import { pieceMesh } from '../view/pieces3d';
import { atHome, cameraHome, cameraTo, cutIn, dim, easeInOut, easeOut, flash, lightCap, shakeBy, transient, type FxCtx } from './kit';
import { getSound } from './sound';
import { squareOf } from './trap';

type CheckCue = Extract<Cue, { kind: 'check' }>;
type GameOverCue = Extract<Cue, { kind: 'gameOver' }>;

const SLOW = 4;          // 時間がゆっくり（0.25 倍）
const MOVE_MS = 160;     // 普段の駒の移動（player.ts と同じ）
const ORBIT_MS = 2400;
const FLY_MS = 1100;

/** 王手：紅の帯に筆文字「王手」 */
export async function playCheck(ctx: FxCtx, _cue: CheckCue): Promise<void> {
  await cutIn(ctx, '王手', '', 'wana', 700, false);
}

/** カメラが center の周りを一周する（高さと距離はいまの寄りのまま） */
function orbit(ctx: FxCtx, center: THREE.Vector3, ms: number): Promise<void> {
  const s = ctx.stage;
  const off = s.cam.pos.clone().sub(center);
  const look = s.cam.look.clone();
  const up = THREE.Object3D.DEFAULT_UP;
  return ctx.tween(ms, (t) => {
    s.cam.pos.copy(center).add(off.clone().applyAxisAngle(up, Math.PI * 2 * t));
    s.cam.look.copy(look);
  }, easeInOut);
}

/** 王が飛んだ跡に残る金の粒 */
function trail(ctx: FxCtx, obj: THREE.Object3D, ms: number): void {
  const N = 90, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) arr.set([obj.position.x, obj.position.y, obj.position.z], i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const peak = lightCap(ctx, 0.9);
  const pm = new THREE.PointsMaterial({ color: PAL.soubiPale, size: 0.12, transparent: true, opacity: peak, blending: THREE.AdditiveBlending, depthWrite: false });
  let k = 0;
  transient(ctx, new THREE.Points(geo, pm), ms + 900, (_dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    if (age < ms) {
      // 王の今の位置に1粒ずつ置いていく
      pos.setXYZ(k % N, obj.position.x + (Math.random() - 0.5) * 0.3, obj.position.y, obj.position.z + (Math.random() - 0.5) * 0.3);
      k++;
      pos.needsUpdate = true;
    }
    pm.opacity = peak * Math.max(0, Math.min(1, (ms + 900 - age) / 900));
  });
}

/**
 * 決着。kingAt は取られた王のマス（演出役が前の局面から出す。引き分けなら null）。
 * 終わったあとカメラは戻さない（見得を切ったまま結果画面へ。次に対局画面を開くとき普段の視点に戻る）
 */
export async function playGameOver(ctx: FxCtx, cue: GameOverCue, kingAt: Square | null): Promise<void> {
  const r = cue.result;
  if (r.winner === null || !kingAt) {
    // 引き分け：盤全体を映すだけ
    getSound().play('drum');
    if (!atHome(ctx)) await cameraHome(ctx, 700);
    await ctx.wait(500);
    return;
  }
  const win = r.winner === ctx.me;
  const king = ctx.before.board[kingAt.r * 9 + kingAt.c];
  const km = king ? pieceMesh(king.id) : undefined;
  const taker = ctx.after.board[kingAt.r * 9 + kingAt.c];
  const am = taker ? pieceMesh(taker.id) : undefined;
  const from = taker ? squareOf(ctx.before, taker.id) : null;
  const at = squarePos(kingAt);
  try {
    // 1. 取られる王へカメラが寄る
    flash(ctx, win ? PALS.soubiPale : PALS.wana, 0.45, 260);
    await cameraTo(ctx, at, 700);
    // 2. 時間がゆっくりになる。camera:false なら一周は省き、短く間を取るだけ
    dim(ctx, 0.3);
    const round = ctx.timing.camera ? orbit(ctx, at, ORBIT_MS) : ctx.wait(MOVE_MS * SLOW + 500);
    // 取る駒がじわりと入る
    if (am && from) {
      const a = squarePos(from), y0 = am.position.y;
      await ctx.tween(MOVE_MS * SLOW, (t) => {
        am.position.set(a.x + (at.x - a.x) * t, y0 + Math.sin(Math.PI * t) * 0.18 * 2, a.z + (at.z - a.z) * t);
      }, easeOut);
    }
    // 当たった瞬間：光と揺れ。王はゆっくり浮き上がり始める
    flash(ctx, PALS.hakkou, 0.8, 200 * SLOW);
    getSound().play('drum');
    shakeBy(ctx, 0.45);
    let lift: Promise<void> = Promise.resolve();
    if (km) {
      // 王手の輪・装備の六角形は王と一緒に浮かせず消す（取られた王は sync が片付ける）
      for (const c of km.children.slice(2)) c.visible = false;
      const ky = km.position.y, rx = km.rotation.x;
      lift = ctx.tween(700, (t) => {
        km.position.y = ky + 0.6 * t;
        km.rotation.x = rx - 0.5 * t;
      }, easeOut);
    }
    await Promise.all([round, lift]);
    // 3. 時間が戻り、取られた王が回りながら天高く飛ぶ（カメラが動けるなら見上げて追う）
    dim(ctx, 0);
    if (km) {
      const p0 = km.position.clone(), ry = km.rotation.y, rx = km.rotation.x;
      const s = ctx.stage, look0 = s.cam.look.clone();
      const tilt = ctx.timing.camera;
      trail(ctx, km, FLY_MS * ctx.timing.scale);
      flash(ctx, win ? PALS.soubiPale : PALS.wana, 0.5, 300);
      await ctx.tween(FLY_MS, (t) => {
        km.position.set(p0.x + t * 0.8, p0.y + 22 * t * t, p0.z - t * 0.6);
        km.rotation.y = ry + Math.PI * 10 * t;
        km.rotation.x = rx - Math.PI * 1.5 * t;
        // 見上げすぎると盤が画面から消えるので、少しだけ（盤は画面の下に残る）
        if (tilt) s.cam.look.set(look0.x, look0.y + 1.3 * easeOut(t), look0.z);
      }, (t) => t);
      km.visible = false;
    }
    // 見得：一瞬止まる
    await ctx.wait(500);
  } finally {
    dim(ctx, 0);
  }
}
