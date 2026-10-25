// 王手と決着の演出（歌舞伎の幕切れ。設計書 docs/superpowers/specs/2026-10-23-finale-design.md）。
// 王手：盤の上に衡山の「王手」の墨の字が小さく跳ねて出る（拍子木だけ。しぶきは怖く見えるのでやめた）。カメラは動かさない。王手中の王の輪は sync が出す。
// 決着：王を取る一手は、勝ちでも負けでも同じ案で流す（src/fx/kingfx の3案から、対局の始まりに setKingFx で決めた1つ。
//       動きを減らす設定ではどの案でも、取る駒がまっすぐ入って王がふっと消えるだけ）
//       → 暗転してスポットライト、筆文字（勝＝金泥・負＝胡粉のかすれ・引分＝淡い胡粉）を一画ずつ書く → 見得
//       → 結果画面への幕は画面の切り替えが引く（字は層に残したまま。結果画面が同じ字を描く）
// 引き分けは盤全体を映したまま、浅い暗転で「引分」を書く。投了は playResign（王が墨の泡になって消える → 「負」）。
// 筆文字を書き始めてから見得の終わりまでは、skipFinale（画面のタップ）で飛ばせる。
// 王を取る手の駒の移動は、演出役（player.ts）が普段の移動として流さずに、ここでゆっくり流す
import * as THREE from 'three';
import type { Square } from '../rules/types';
import type { Cue } from './plan';
import { PAL, PALS } from '../view/palette';
import { squarePos } from '../view/board3d';
import { pieceMesh } from '../view/pieces3d';
import {
  animateEl, atHome, brushLayer, cameraHome, cameraTo, dim, easeInOut, easeOut, flash, localRect, transient, type FxCtx,
} from './kit';
import { darken, timeStop } from './stagecraft';
import { brushWord, type Ink } from './brush';
import { getSound } from './sound';
import { squareOf } from './trap';
import type { KingFx } from './kingfx/kinds';
import { hideDecor, settleTaker, takerAlong, type KingCapture } from './kingfx/common';
import { KING_FX_PLAY } from './kingfx';

type CheckCue = Extract<Cue, { kind: 'check' }>;
type GameOverCue = Extract<Cue, { kind: 'gameOver' }>;
export type Verdict = '勝' | '負' | '引分';

const MOVE_MS = 160;     // 普段の駒の移動（player.ts と同じ）
const STOP_MS = 600;     // 時が止まっている長さ
const CHECK_MS = 900;    // 王手の字を見せる長さ
const OPEN_MS = 1300;    // 開戦の字を見せる長さ
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

/** 王手：盤の上に「王手」の墨の字が小さく跳ねて出て、低い拍子木がチョン。すぐ消す（1局に何度も出るので軽く） */
export async function playCheck(ctx: FxCtx, _cue: CheckCue): Promise<void> {
  const L = boardLayer(ctx);
  const word = brushWord('王手', 'sumi');
  word.finish();
  const box = document.createElement('div');
  box.className = 'brush-check';
  box.append(word.el);
  L.replaceChildren(box);
  getSound().play('ote');
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

/** 開戦：対局の始まりに、王手と同じ形で「開戦」の墨の字が跳ねて出て、尺八が鳴る。消えるまで指せない */
export async function playOpening(ctx: FxCtx): Promise<void> {
  const L = boardLayer(ctx);
  const word = brushWord('開戦', 'sumi');
  word.finish();
  const box = document.createElement('div');
  box.className = 'brush-check';
  box.append(word.el);
  L.replaceChildren(box);
  getSound().play('shakuhachi');
  try {
    await animateEl(ctx, box, [
      { transform: 'scale(1.25) rotate(-6deg)', opacity: 0 },
      { transform: 'scale(1) rotate(-4deg)', opacity: 1 },
    ], { duration: 220, easing: 'cubic-bezier(.2,1.4,.3,1)' });
    await ctx.wait(OPEN_MS - 220);
    await animateEl(ctx, box, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
  } finally {
    box.remove();
  }
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

/** 墨の泡：王の足元から湧いて昇り、膨らんで弾ける。ms のあいだ少しずつ湧かせる */
function inkBubbles(ctx: FxCtx, at: THREE.Vector3, size: number, ms: number): void {
  // 墨の玉：つやのある黒（照り返しで泡の丸みが見える）
  const mat = new THREE.MeshStandardMaterial({ color: PAL.sumi, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.95 });
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const grp = new THREE.Group();
  const N = 44;
  const bs = Array.from({ length: N }, (_, i) => {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    grp.add(m);
    return {
      m,
      born: (i / N) * ms * (0.6 + Math.random() * 0.4),   // 湧く時刻
      life: 520 + Math.random() * 640,                       // 弾けるまで
      r: (0.06 + Math.random() * 0.1) * size,
      x: at.x + (Math.random() - 0.5) * 0.42 * size,
      z: at.z + (Math.random() - 0.5) * 0.42 * size,
      y: at.y + 0.04 + Math.random() * 0.14 * size,
      rise: 0.6 + Math.random() * 0.8,
      ph: Math.random() * Math.PI * 2,
    };
  });
  transient(ctx, grp, ms * ctx.timing.scale + 1400, (_dt, age) => {
    for (const b of bs) {
      const k = (age - b.born * ctx.timing.scale) / b.life;
      if (k < 0 || k > 1) { b.m.visible = false; continue; }
      b.m.visible = true;
      const t = k * b.life / 1000;
      // ふくらむ → 最後に少し大きくなって弾ける
      const s = k < 0.8 ? easeOut(k / 0.8) : 1 + (k - 0.8) * 1.6;
      b.m.scale.setScalar(b.r * s * (k > 0.96 ? 0.2 : 1));
      b.m.position.set(b.x + Math.sin(b.ph + t * 7) * 0.03, b.y + b.rise * t, b.z + Math.cos(b.ph + t * 6) * 0.03);
    }
  });
}

/**
 * 王が墨になって泡のように消える（負け・投了）：足元に墨がにじみ、王の木と字が墨の黒に染まり、
 * しぼみながら墨の泡がぷつぷつと湧いて弾けて消える。取る駒と重ならないよう、負けでは取る駒を手前で止めてから呼び、
 * 消えてからマスに収める。動きを減らす設定では泡を出さず、染まってから静かに薄れる。王の駒が見つからなければ何もしない。
 * 材質は駒どうしで共有なので複製に差し替える（sync が元に戻す）
 */
export async function playKingInk(ctx: FxCtx, at: Square): Promise<void> {
  const king = ctx.before.board[at.r * 9 + at.c];
  const km = king ? pieceMesh(king.id) : undefined;
  if (!km) return;
  // 王手の輪・纏札の印は王と一緒に染めず消す
  for (const c of km.children.slice(2)) c.visible = false;
  const parts = km.children.slice(0, 2).filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
  const mats = parts.map((m) => {
    const c = (m.material as THREE.MeshStandardMaterial).clone();
    c.transparent = true;
    m.material = c;
    return { c, from: c.color.clone() };
  });
  const ink = new THREE.Color(PAL.sumi);
  const p = squarePos(at);
  const s = (km.userData.s as number | undefined) ?? 1;
  inkPool(ctx, p);
  getSound().play('thud', { gain: 0.5 });
  // 1. 墨に染まる
  await ctx.tween(520, (t) => {
    for (const m of mats) m.c.color.copy(m.from).lerp(ink, t);
  }, easeOut);
  // 2. しぼみながら泡になって消える
  const DISSOLVE = 1000;
  if (ctx.timing.camera) inkBubbles(ctx, km.position.clone(), s, DISSOLVE);
  const sc = km.scale.clone();
  await ctx.tween(DISSOLVE, (t) => {
    for (const m of mats) m.c.opacity = 1 - t;
    if (ctx.timing.camera) km.scale.set(sc.x * (1 - 0.35 * t), sc.y * (1 - 0.8 * t), sc.z * (1 - 0.35 * t));
  }, easeInOut);
  km.visible = false;
  await ctx.wait(ctx.timing.camera ? 450 : 200); // 最後の泡が弾けるのを待つ
}

/** 墨の種類と、書き終わりの音 */
const INK: Record<Verdict, Ink> = { '勝': 'gold', '負': 'kasure', '引分': 'usuzumi' };
function endSound(v: Verdict): void {
  if (v === '勝') getSound().play('kachi');
  else if (v === '負') getSound().play('make');
  else getSound().play('suzu', { gain: 0.6 });
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

/** 投了：自分の王が墨の泡になって消え、「負」を書く（時は止めない）。kingAt は自分の王のマス */
export async function playResign(ctx: FxCtx, kingAt: Square | null): Promise<void> {
  if (kingAt) {
    if (ctx.timing.camera) await cameraTo(ctx, squarePos(kingAt), 600);
    await playKingInk(ctx, kingAt);
  }
  await writeVerdict(ctx, '負', kingAt ? squarePos(kingAt) : null);
}

/** 案の名前（setKingFx で対局の始まりに決める） */
let kingFx: KingFx = 'tataki';

/** この対局の王を取る演出の案を決める（対局画面が始まりに呼ぶ） */
export function setKingFx(k: KingFx): void {
  kingFx = k;
}

/** 動きを減らす設定：どの案でも、取る駒がまっすぐ入って王がふっと消えるだけ */
async function plainCapture(ctx: FxCtx, k: KingCapture): Promise<void> {
  if (k.taker && k.from) await ctx.tween(MOVE_MS * 2, (t) => takerAlong(k, t, 0.2), easeOut);
  flash(ctx, PALS.soubiPale, 0.4, 260);
  getSound().play('drum');
  if (k.king) k.king.visible = false;
  await ctx.wait(STOP_MS);
}

/**
 * 決着。kingAt は取られた王のマス（演出役が前の局面から出す。引き分けなら null）。
 * 王を取る一手は、勝ちでも負けでも同じ案（kingFx）で流し、そのあと暗転して「勝」「負」を書く。
 * 終わったあとカメラは戻さない（見得を切ったまま結果画面へ。次に対局画面を開くとき普段の視点に戻る）
 */
export async function playGameOver(ctx: FxCtx, cue: GameOverCue, kingAt: Square | null): Promise<void> {
  const r = cue.result;
  getSound().music(null); // 対局の曲はここで消し、書き終わりの決め音を聞かせる
  if (r.winner === null || !kingAt) {
    // 引き分け：盤全体を映したまま「引分」
    getSound().play('drum', { gain: 0.6 });
    if (!atHome(ctx)) await cameraHome(ctx, 700);
    await writeVerdict(ctx, '引分', null);
    return;
  }
  const win = r.winner === ctx.me;
  const king = ctx.before.board[kingAt.r * 9 + kingAt.c];
  const taker = ctx.after.board[kingAt.r * 9 + kingAt.c];
  const km = king ? pieceMesh(king.id) : undefined;
  const am = taker ? pieceMesh(taker.id) : undefined;
  const from = taker ? squareOf(ctx.before, taker.id) : null;
  const at = squarePos(kingAt);
  const k: KingCapture = {
    kingAt, at, win,
    kingId: king?.id ?? null, king: km,
    takerId: taker?.id ?? null, taker: am,
    from: from && am ? new THREE.Vector3(am.position.x, 0, am.position.z) : null,
    takerY: am?.position.y ?? 0,
    takerRot: am ? am.rotation.clone() : null,
  };
  try {
    hideDecor(km);
    hideDecor(am);
    if (!ctx.timing.camera) await plainCapture(ctx, k);
    else await KING_FX_PLAY[kingFx](ctx, k);
    // 案がどこで終わっても、王は消え、取る駒は王のマスにいる
    if (km) km.visible = false;
    settleTaker(k);
    await writeVerdict(ctx, win ? '勝' : '負', at);
  } finally {
    dim(ctx, 0);
    timeStop(ctx, 0);
  }
}
