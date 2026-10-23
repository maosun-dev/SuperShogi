// 王手と決着の演出（歌舞伎の幕切れ。設計書 docs/superpowers/specs/2026-10-23-finale-design.md）。
// 王手：盤の上に衡山の「王手」の墨の字が小さく跳ねて出る（拍子木だけ。しぶきは怖く見えるのでやめた）。カメラは動かさない。王手中の王の輪は sync が出す。
// 決着：取られる王へカメラが寄る → スローで取る駒がじわりと入る（カメラは王の周りを一周。camera:false なら省く）
//       → 当たった瞬間に時が止まる（色が抜け、拍子木がチョン、チョン）
//       → 勝ちは取った王が回りながら天高く飛び、負けは自分の王が伏せられる
//       → 暗転してスポットライト、筆文字（勝＝金の粉・負＝かすれ・引分＝薄墨）を一画ずつ書く → 見得
//       → 結果画面への幕は画面の切り替えが引く（字は層に残したまま。結果画面が同じ字を描く）
// 引き分けは盤全体を映したまま、浅い暗転で「引分」を書く。投了は playResign（王が伏せられる → 「負」）。
// 筆文字を書き始めてから見得の終わりまでは、skipFinale（画面のタップ）で飛ばせる。
// 王を取る手の駒の移動は、演出役（player.ts）が普段の移動として流さずに、ここでゆっくり流す
import * as THREE from 'three';
import type { Square } from '../rules/types';
import type { Cue } from './plan';
import { PAL, PALS } from '../view/palette';
import { squarePos } from '../view/board3d';
import { pieceMesh } from '../view/pieces3d';
import {
  animateEl, atHome, brushLayer, cameraHome, cameraTo, dim, easeInOut, easeOut, flash, later, lightCap, localRect, shakeBy,
  transient, type FxCtx,
} from './kit';
import { darken, timeStop } from './stagecraft';
import { brushWord, type Ink } from './brush';
import { getSound } from './sound';
import { squareOf } from './trap';

type CheckCue = Extract<Cue, { kind: 'check' }>;
type GameOverCue = Extract<Cue, { kind: 'gameOver' }>;
export type Verdict = '勝' | '負' | '引分';

const SLOW = 4;          // 時間がゆっくり（0.25 倍）
const MOVE_MS = 160;     // 普段の駒の移動（player.ts と同じ）
const ORBIT_MS = 2400;
const FLY_MS = 1100;
const STOP_MS = 600;     // 時が止まっている長さ
const CHECK_MS = 900;    // 王手の字を見せる長さ
const MIE_MS = 700;      // 書き終わりの見得

/** 筆文字の層を、盤の場所（上下の駒台の間）に合わせて返す。字は盤の真ん中に出る */
function boardLayer(ctx: FxCtx): HTMLElement {
  const L = brushLayer(ctx);
  const r = localRect(ctx, ctx.hud.board);
  if (r.h > 0) { L.style.top = `${r.y}px`; L.style.height = `${r.h}px`; L.style.bottom = 'auto'; }
  return L;
}

// ---------- タップで飛ばす ----------
let skipNow: (() => void) | null = null;

/** 筆文字を書いている途中〜見得の終わりなら、残りを飛ばす。それ以外（決着の一手の途中など）では何もしない */
export function skipFinale(): void {
  skipNow?.();
}

/** 王手：盤の上に「王手」の墨の字が小さく跳ねて出て、拍子木がチョン。すぐ消す（1局に何度も出るので軽く） */
export async function playCheck(ctx: FxCtx, _cue: CheckCue): Promise<void> {
  const L = boardLayer(ctx);
  const word = brushWord('王手', 'sumi');
  word.finish();
  const box = document.createElement('div');
  box.className = 'brush-check';
  box.append(word.el);
  L.replaceChildren(box);
  getSound().play('hyoshigi');
  try {
    await animateEl(ctx, box, [
      { transform: 'scale(1.25) rotate(-6deg)', opacity: 0 },
      { transform: 'scale(1) rotate(-4deg)', opacity: 1 },
    ], { duration: 220, easing: 'cubic-bezier(.2,1.4,.3,1)' });
    await ctx.wait(CHECK_MS - 220);
    await animateEl(ctx, box, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
  } finally {
    box.remove();
  }
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

/** 足元に広がる墨のにじみ（盤の上に寝かせた円） */
function inkPool(ctx: FxCtx, at: THREE.Vector3): void {
  const mat = new THREE.MeshBasicMaterial({ color: PAL.sumi, transparent: true, opacity: 0, depthWrite: false });
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(at.x, at.y + 0.012, at.z);
  transient(ctx, m, 4000, (_dt, age) => {
    const t = Math.min(1, age / 900);
    m.scale.setScalar(0.4 + 1.1 * easeOut(t));
    mat.opacity = 0.55 * Math.min(1, age / 250);
  });
}

/**
 * 王が伏せられる（負け・投了）：少し浮いて、前後の軸まわりに裏返り、盤へパタリと落ちる。墨がにじむ。
 * 動きを減らす設定では、裏返さずにふっと消す。王の駒が見つからなければ何もしない
 */
export async function playKingFall(ctx: FxCtx, at: Square): Promise<void> {
  const king = ctx.before.board[at.r * 9 + at.c];
  const km = king ? pieceMesh(king.id) : undefined;
  if (!km) return;
  // 王手の輪・纏札の印は王と一緒に回さず消す
  for (const c of km.children.slice(2)) c.visible = false;
  const p = squarePos(at);
  if (!ctx.timing.camera) {
    km.visible = false;
    inkPool(ctx, p);
    getSound().play('thud');
    await ctx.wait(300);
    return;
  }
  const y0 = km.position.y, rz = km.rotation.z;
  await ctx.tween(520, (t) => {
    km.position.y = y0 + Math.sin(Math.PI * t) * 0.5;
    km.rotation.z = rz + Math.PI * easeInOut(t);
  });
  km.position.y = y0;
  getSound().play('thud');
  shakeBy(ctx, 0.2);
  inkPool(ctx, p);
  await ctx.wait(350);
}

/** 墨の種類と、書き終わりの音 */
const INK: Record<Verdict, Ink> = { '勝': 'gold', '負': 'kasure', '引分': 'usuzumi' };
function endSound(v: Verdict): void {
  if (v === '勝') getSound().play('drum');
  else getSound().play('suzu', { gain: v === '負' ? 1 : 0.6 });
}

/**
 * 暗転して、筆文字を一画ずつ書き、見得を切る。spot があればそこへスポットライト、無ければ浅い暗転（引き分け）。
 * 字は層に残す（結果画面への幕が閉まるまで見せる）。書いている途中から見得の終わりまでは skipFinale で飛ばせる
 */
export async function writeVerdict(ctx: FxCtx, v: Verdict, spot: THREE.Vector3 | null): Promise<void> {
  await darken(ctx, spot, 600, spot ? 0.12 : 0.5);
  const L = boardLayer(ctx);
  L.dataset.keep = '1';
  const word = brushWord(v, INK[v]);
  if (v === '引分') word.el.classList.add('two');
  L.replaceChildren(word.el);
  let skipped = false;
  const skip = new Promise<void>((resolve) => {
    skipNow = () => { skipped = true; word.finish(); resolve(); };
  });
  try {
    if (!ctx.timing.camera) {
      // 動きを減らす設定：一画ずつ書かずにふわっと出す
      word.finish();
      await Promise.race([animateEl(ctx, word.el as unknown as HTMLElement, [{ opacity: 0 }, { opacity: 1 }], { duration: 450 }), skip]);
    } else {
      await Promise.race([word.write(ctx.tweenRaw, ctx.timing.scale, () => getSound().play('fude')), skip]);
    }
    endSound(v);
    if (!skipped) await Promise.race([ctx.wait(MIE_MS), skip]);
  } finally {
    skipNow = null;
  }
}

/** 投了：自分の王が伏せられ、「負」を書く（時は止めない）。kingAt は自分の王のマス */
export async function playResign(ctx: FxCtx, kingAt: Square | null): Promise<void> {
  if (kingAt) {
    if (ctx.timing.camera) await cameraTo(ctx, squarePos(kingAt), 600);
    await playKingFall(ctx, kingAt);
  }
  await writeVerdict(ctx, '負', kingAt ? squarePos(kingAt) : null);
}

/** 時が止まる：色が抜け、拍子木がチョン、チョン。動きを減らす設定では色を抜かず、間だけ取る */
async function freeze(ctx: FxCtx): Promise<void> {
  getSound().play('hyoshigi');
  if (!ctx.timing.camera) { await ctx.wait(STOP_MS / 2); return; }
  try {
    await ctx.tween(120, (t) => timeStop(ctx, 0.85 * t));
    await ctx.wait(STOP_MS - 240);
    getSound().play('hyoshigi');
    await ctx.tween(120, (t) => timeStop(ctx, 0.85 * (1 - t)));
  } finally {
    timeStop(ctx, 0);
  }
}

/**
 * 決着。kingAt は取られた王のマス（演出役が前の局面から出す。引き分けなら null）。
 * 終わったあとカメラは戻さない（見得を切ったまま結果画面へ。次に対局画面を開くとき普段の視点に戻る）
 */
export async function playGameOver(ctx: FxCtx, cue: GameOverCue, kingAt: Square | null): Promise<void> {
  const r = cue.result;
  if (r.winner === null || !kingAt) {
    // 引き分け：盤全体を映したまま「引分」
    getSound().play('drum', { gain: 0.6 });
    if (!atHome(ctx)) await cameraHome(ctx, 700);
    await writeVerdict(ctx, '引分', null);
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
    flash(ctx, win ? PALS.soubiPale : PALS.mahou, 0.45, 260);
    await cameraTo(ctx, at, 700);
    // 2. 時間がゆっくりになる。camera:false なら一周は省き、短く間を取るだけ
    dim(ctx, 0.3);
    const round = later(ctx.timing.camera ? orbit(ctx, at, ORBIT_MS) : ctx.wait(MOVE_MS * SLOW + 500));
    // 取る駒がじわりと入る
    if (am && from) {
      const a = squarePos(from), y0 = am.position.y;
      await ctx.tween(MOVE_MS * SLOW, (t) => {
        am.position.set(a.x + (at.x - a.x) * t, y0 + Math.sin(Math.PI * t) * 0.18 * 2, a.z + (at.z - a.z) * t);
      }, easeOut);
    }
    // 当たった瞬間：光と揺れ、そして時が止まる
    flash(ctx, PALS.hakkou, 0.8, 200 * SLOW);
    getSound().play('drum');
    shakeBy(ctx, 0.45);
    await round;
    dim(ctx, 0);
    await freeze(ctx);
    // 3. 王の最後：勝ちは取った王が回りながら天高く飛ぶ、負けは自分の王が伏せられる
    if (!win) {
      await playKingFall(ctx, kingAt);
    } else if (km) {
      for (const c of km.children.slice(2)) c.visible = false;
      flash(ctx, PALS.soubiPale, 0.5, 300);
      if (!ctx.timing.camera) {
        km.visible = false;
      } else {
        const p0 = km.position.clone(), ry = km.rotation.y, rx = km.rotation.x;
        trail(ctx, km, FLY_MS * ctx.timing.scale);
        await ctx.tween(FLY_MS, (t) => {
          km.position.set(p0.x + t * 0.8, p0.y + 22 * t * t, p0.z - t * 0.6);
          km.rotation.y = ry + Math.PI * 10 * t;
          km.rotation.x = rx - Math.PI * 1.5 * t;
        }, (t) => t);
        km.visible = false;
      }
    }
    // 4. 暗転して筆文字 → 見得
    await writeVerdict(ctx, win ? '勝' : '負', at);
  } finally {
    dim(ctx, 0);
  }
}
