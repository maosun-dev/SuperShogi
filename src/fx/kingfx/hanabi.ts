// 参「大花火」：取る駒が王を真上へ打ち上げる。王は火の尾を引いて昇り、カメラが見上げる。
// 夜空で王がはじけ、桃・青・金・紅のまざった大玉（真ん中に題字の「傾」が一瞬浮かぶ）。続いて外の星が
// ひとつひとつ金の小さな菊にはじける千輪で、画面いっぱいが金で埋まる（片貝まつりの四尺玉が参考。ユーザーの希望）。
// 火の粉と紅白の紙吹雪が盤へ降りそそぐ中、取った駒が王のマスにどっしり立つ
import * as THREE from 'three';
import { PAL, PALS } from '../../view/palette';
import { cameraMove, cameraTo, flash, later, lightCap, shakeBy, transient, type FxCtx } from '../kit';
import { darken, pointLight, pointOff, softTexture } from '../stagecraft';
import { getSound } from '../sound';
import { TITLE_GLYPHS } from '../../app/titleGlyphs';
import { glyphSprite, nearZ, petalStorm, settleTaker, takerAlong, type KingCapture } from './common';

const HIT_MS = 320;    // 取る駒が王に当たるまで
const LAUNCH_MS = 1150; // 打ち上がる
const HEIGHT = 11;     // はじける高さ

/** 火の尾：obj の通った跡に火の粉を置いていく */
function fireTail(ctx: FxCtx, obj: THREE.Object3D, ms: number): void {
  const N = 140, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const a = new THREE.Color(PAL.soubiPale), b = new THREE.Color(PAL.wana);
  for (let i = 0; i < N; i++) {
    arr.set([obj.position.x, obj.position.y, obj.position.z], i * 3);
    const c = i % 3 ? a : b;
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const peak = lightCap(ctx, 1);
  const pm = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: peak, blending: THREE.AdditiveBlending, depthWrite: false });
  let i = 0;
  transient(ctx, new THREE.Points(geo, pm), ms + 900, (_dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    if (age < ms) {
      for (let j = 0; j < 3; j++, i++) pos.setXYZ(i % N, obj.position.x + (Math.random() - 0.5) * 0.25, obj.position.y - Math.random() * 0.4, obj.position.z + (Math.random() - 0.5) * 0.25);
    }
    for (let j = 0; j < N; j++) pos.setY(j, pos.getY(j) - 0.01);
    pos.needsUpdate = true;
    pm.opacity = peak * Math.max(0, Math.min(1, (ms + 900 - age) / 900));
  });
}

/**
 * 大輪の花火：中心から球に広がる光の粒。colors からまぜて色を付け、重さで垂れながら消える。
 * r は広がる大きさ、n は粒の数。外の星の行き先（開ききった位置）を返す（千輪にする星を選ぶため）
 */
function burst(ctx: FxCtx, at: THREE.Vector3, r: number, n: number, colors: number[], life = 2400, size = 0.3): THREE.Vector3[] {
  const geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const v: THREE.Vector3[] = [];
  const cs = colors.map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) {
    arr.set([at.x, at.y, at.z], i * 3);
    // 球の上に均等に散らす（黄金角）
    const y = 1 - (i / Math.max(1, n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
    const dirv = new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr);
    v.push(dirv.multiplyScalar(r * (0.9 + Math.random() * 0.2)));
    const c = cs[Math.floor(Math.random() * cs.length)];
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const peak = lightCap(ctx, 1);
  const pm = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity: peak, blending: THREE.AdditiveBlending, depthWrite: false });
  transient(ctx, new THREE.Points(geo, pm), life, (_dt, age) => {
    const t = age / 1000;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // 速く開いて、空気でゆっくり止まり、重さで垂れる
    const spread = 1 - Math.exp(-t * 3.2);
    for (let i = 0; i < n; i++) pos.setXYZ(i, at.x + v[i].x * spread, at.y + v[i].y * spread - 0.9 * t * t, at.z + v[i].z * spread);
    pos.needsUpdate = true;
    const k = age / life;
    // 消える前にちらちら瞬く
    pm.opacity = peak * (k < 0.6 ? 1 : (1 - (k - 0.6) / 0.4) * (0.6 + 0.4 * Math.sin(age / 30)));
    pm.size = size * (1 - 0.4 * k);
  });
  return v.map((d) => at.clone().addScaledVector(d, 0.95));
}

/** 花火の明かりに照らされた煙（ふわっと広がって薄れる） */
function litSmoke(ctx: FxCtx, at: THREE.Vector3, r: number, color: number): void {
  const tex = softTexture();
  const g = new THREE.Group();
  const ps = Array.from({ length: 10 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false }));
    const a = Math.random() * Math.PI * 2;
    s.position.set(at.x + Math.cos(a) * r * 0.6, at.y - r * (0.3 + Math.random() * 0.6), at.z + Math.sin(a) * r * 0.3);
    s.scale.setScalar(r * (0.7 + Math.random() * 0.6));
    g.add(s);
    return s;
  });
  const LIFE = 3200;
  transient(ctx, g, LIFE, (_dt, age) => {
    const k = age / LIFE;
    for (const s of ps) (s.material as THREE.SpriteMaterial).opacity = 0.28 * Math.sin(Math.PI * Math.min(1, k * 1.3));
  });
}

export async function hanabi(ctx: FxCtx, k: KingCapture): Promise<void> {
  const z = nearZ(ctx);
  await cameraTo(ctx, k.at, 600);
  // 1. 取る駒が王へぶつかる
  if (k.taker && k.from) await ctx.tween(HIT_MS, (u) => takerAlong(k, u, 0.3), (u) => u * u);
  settleTaker(k);
  getSound().play('komaHard');
  getSound().play('drum', { gain: 0.8 });
  flash(ctx, PALS.soubiPale, 0.6, 220);
  shakeBy(ctx, 0.4);
  // 2. 王が火の尾を引いて打ち上がる。カメラは引いて見上げる
  const king = k.king;
  const top = k.at.clone().setY(HEIGHT);
  getSound().play('slowWhoosh');
  // はじける所（top）が画面の真ん中に来て、大輪が画面いっぱいに開く距離
  const cam = later(cameraMove(ctx, k.at.clone().add(new THREE.Vector3(1.2 * z, 5.5, 11 * z)), top.clone(), LAUNCH_MS, (u) => 1 - (1 - u) ** 3));
  const dark = later(darken(ctx, null, LAUNCH_MS, 0.3));
  if (king) {
    const p0 = king.position.clone(), r0 = king.rotation.clone();
    fireTail(ctx, king, LAUNCH_MS * ctx.timing.scale);
    await ctx.tween(LAUNCH_MS, (u) => {
      king.position.set(p0.x, p0.y + (HEIGHT - p0.y) * u, p0.z);
      king.rotation.set(r0.x + 6 * u, r0.y + 9 * u, r0.z);
    }, (u) => 1 - (1 - u) * (1 - u));
    king.visible = false;
  }
  await cam;
  await dark;
  // 3. 夜空で大輪：桃・青・金・紅のまざった大玉（片貝まつりの四尺玉のように。ユーザーの参考の動画）
  getSound().play('bakuhatsu');
  flash(ctx, PALS.soubiPale, 0.55, 500);
  shakeBy(ctx, 0.35);
  pointLight(ctx, top, 60, PAL.soubiLight, 30);
  const stars = burst(ctx, top, 6, 560, [PAL.wana, PAL.sakura, PAL.mahouPale, PAL.soubiLight, PAL.gofun], 2400, 0.34);
  burst(ctx, top, 3, 180, [PAL.soubiPale, PAL.gofun], 1800);
  litSmoke(ctx, top, 5, PAL.sakura);
  // 題字の「傾」：金に紅の縁取り（白だけだと見づらいとユーザー）
  const glyph = glyphSprite(TITLE_GLYPHS['傾'], PALS.soubiLight, 3.4, PALS.wanaDeep);
  glyph.position.copy(top);
  const gm = glyph.material;
  transient(ctx, glyph, 1700, (_dt, age) => { gm.opacity = Math.max(0, 1 - Math.max(0, age - 700) / 1000); glyph.scale.setScalar(3.4 + age / 900); });
  await ctx.wait(700);
  pointOff();
  // 千輪：外の星のひとつひとつが金の小さな菊にはじけ、画面いっぱいが金の輪で埋まる
  const ring = stars.filter((_, i) => i % 9 === 0).sort(() => Math.random() - 0.5).slice(0, 34);
  for (let w = 0; w < 3; w++) {
    getSound().play('bakuhatsu2', { gain: 0.35 - w * 0.08 });
    for (const p of ring.slice(w * 12, w * 12 + 12)) burst(ctx, p.clone().setY(p.y - 0.3 - w * 0.25), 1.5, 70, [PAL.soubiPale, PAL.soubiLight, PAL.soubiLight], 1700, 0.22);
    pointLight(ctx, top, 30, PAL.soubiLight, 30);
    await ctx.wait(170);
  }
  getSound().play('kirakira', { gain: 0.7 });
  await ctx.wait(500);
  pointOff();
  // 4. 紙吹雪と火の粉が盤へ降りそそぐ。カメラは王のマスへ戻る
  petalStorm(ctx, { mode: 'rain', center: k.at, colors: [PALS.wana, PALS.gofun, PALS.soubiPale], shape: 'paper', n: 160, size: 0.2, life: 4200, area: 4.5, height: 6 });
  await ctx.wait(500);
  await cameraTo(ctx, k.at, 1100);
  await ctx.wait(900);
}
