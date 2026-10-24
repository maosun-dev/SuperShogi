// 落雷（コスト4・約5秒）
// 前振り：暗転＋カメラが引いて見上げる。雷雲が集まる
// 見せ場：雲の中でゴロゴロ光ってから、枝分かれした太い稲妻。稲妻の光で盤が一瞬照らされる。駒が砕け、衝撃の輪が広がる
// 余韻：小さな稲妻 → 雲が晴れて照明が戻る
// 見本（spike/card-fx-samples の freeRakurai）の作りを移したもの
import * as THREE from 'three';
import { PAL, PALS } from '../../view/palette';
import { ring, squarePos } from '../../view/board3d';
import { easeOut, flash, later, lightCap, puff, shakeBy, shatter, transient, type FxCtx } from '../kit';
import { brighten, cameraLookUp, darken, pointLight, pointOff, softTexture } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type MagicCue } from './types';

const CLOUD_Y = 3.4;

function boltPath(from: THREE.Vector3, to: THREE.Vector3, n: number, jit: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let prev = from.clone();
  for (let i = 1; i <= n; i++) {
    const t = i / n, j = (1 - t * 0.7) * jit;
    const pt = i === n ? to.clone() : from.clone().lerp(to, t).add(new THREE.Vector3((Math.random() - 0.5) * j, 0, (Math.random() - 0.5) * j));
    path.add(new THREE.LineCurve3(prev, pt));
    prev = pt;
  }
  return path;
}

/** 稲妻（白い芯＋藍の光）。cap は動きを減らす設定で光を抑える関数 */
function bolt(from: THREE.Vector3, to: THREE.Vector3, r: number, cap: (a: number) => number, n = 16, jit = 1.4): THREE.Group {
  const p = boltPath(from, to, n, jit);
  const g = new THREE.Group();
  const add = (rad: number, color: number, op: number): void => {
    g.add(new THREE.Mesh(new THREE.TubeGeometry(p, n * 4, rad, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: cap(op), blending: THREE.AdditiveBlending, depthWrite: false })));
  };
  add(r * 5, PAL.mahouGlow, 0.3);
  add(r, PAL.mahouCore, 1);
  return g;
}

/** 雷雲：暗い煙のかたまり。gather（0〜1）で集まり、glow（0〜1）で中から光る */
interface Storm { gather: number; glow: number; kill(): void }
const storms = new WeakMap<MagicCue, Storm>();

function storm(ctx: FxCtx, at: THREE.Vector3): Storm {
  const tex = softTexture();
  const clouds: { s: THREE.Sprite; a: number; r: number; y: number; k: number }[] = [];
  const cg = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: PAL.stormCloud, transparent: true, opacity: 0, depthWrite: false }));
    clouds.push({ s, a: Math.random() * Math.PI * 2, r: 0.6 + Math.random() * 3.6, y: CLOUD_Y + Math.random() * 0.9, k: 2.0 + Math.random() * 2.6 });
    cg.add(s);
  }
  const lit = new THREE.Color(PAL.stormLit), dark = new THREE.Color(PAL.stormCloud);
  const st: Storm = { gather: 0, glow: 0, kill: () => {} };
  st.kill = transient(ctx, cg, 60000, (dt) => {
    for (const c of clouds) {
      c.a += dt * 0.35 / Math.max(0.6, c.r);
      const rr = c.r * (2.4 - 1.4 * st.gather);
      c.s.position.set(at.x + Math.cos(c.a) * rr, c.y, at.z + Math.sin(c.a) * rr * 0.8);
      c.s.scale.setScalar(c.k);
      c.s.material.opacity = 0.82 * st.gather;
      c.s.material.color.copy(dark).lerp(lit, st.glow);
    }
  });
  return st;
}

function targetAt(cue: MagicCue): THREE.Vector3 | null {
  const e = effect(cue, 'destroyed');
  if (e) return squarePos(e.at);
  return cue.targets[0] ? squarePos(cue.targets[0]) : null;
}

export const rakurai: CardFx<MagicCue> = {
  async pre(ctx, cue) {
    const at = targetAt(cue);
    if (!at) return;
    const st = storm(ctx, at);
    storms.set(cue, st);
    getSound().play('tsuke', { gain: 0.8 });
    const cam = later(cameraLookUp(ctx, at, 900));
    const dark = later(darken(ctx, null, 800, 0.35));
    getSound().play('wind', { gain: 0.6 });
    await ctx.tween(800, (t) => { st.gather = t; }, easeOut);
    await Promise.all([cam, dark]);
  },
  async main(ctx, cue) {
    const e = effect(cue, 'destroyed');
    const st = storms.get(cue);
    if (!e || !st) return;
    const at = squarePos(e.at);
    const cap = (a: number): number => lightCap(ctx, a);
    // 雲の中でゴロゴロと光をためる（雲の中だけを横に走る細い稲妻）
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2;
      const q0 = at.clone().add(new THREE.Vector3(Math.cos(a) * 2.5, CLOUD_Y + 0.5, Math.sin(a) * 2));
      const q1 = at.clone().add(new THREE.Vector3(-Math.cos(a) * 1.5, CLOUD_Y + 0.2, -Math.sin(a) * 1.2));
      transient(ctx, bolt(q0, q1, 0.025, cap, 8, 0.8), 90);
      st.glow = 1;
      pointLight(ctx, at.clone().setY(CLOUD_Y + 0.2), 25);
      if (k === 0) getSound().play('raimei', { gain: 0.6 }); // 雷鳴は1回だけ。光のためと一緒に転がっていく
      await ctx.wait(90);
      st.glow = 0;
      pointOff();
      await ctx.wait(140 + k * 60);
    }
    await ctx.wait(160);
    // 本命：太い稲妻と枝分かれ
    const top = at.clone().setY(CLOUD_Y + 0.5);
    const main = bolt(top, at.clone().setY(0.2), 0.11, cap, 18, 1.8);
    for (let b = 0; b < 3; b++) {
      const from = boltPath(top, at, 6, 1).getPointAt(0.25 + b * 0.18);
      const ang = Math.random() * Math.PI * 2;
      main.add(bolt(from, from.clone().add(new THREE.Vector3(Math.cos(ang) * 1.6, -1.4 - Math.random(), Math.sin(ang) * 1.6)), 0.035, cap, 6, 0.6));
    }
    transient(ctx, main, 230);
    st.glow = 1;
    pointLight(ctx, at.clone().setY(1.6), 140);
    flash(ctx, PALS.mahouFlash, 0.95, 320);
    getSound().play('rakurai');
    getSound().play('shatter');
    shatter(ctx, e.pieceId);
    shakeBy(ctx, 0.9);
    // 衝撃の輪
    const r = ring(0.2, 0.42, PAL.mahouCore, 56);
    r.position.set(at.x, 0.04, at.z);
    r.material.blending = THREE.AdditiveBlending;
    const RL = 700;
    transient(ctx, r, RL, (_dt, age) => {
      const t = Math.min(1, age / RL), k = 1 + easeOut(t) * 7;
      r.scale.set(k, k, k);
      r.material.opacity = cap(1) * (1 - t);
    });
    puff(ctx, at, PAL.stormCloud, 50, 2.2);
    await ctx.wait(230);
    st.glow = 0;
    pointOff();
  },
  async after(ctx, cue) {
    const st = storms.get(cue);
    const at = targetAt(cue);
    if (st && at) {
      const top = at.clone().setY(CLOUD_Y + 0.5);
      // 余韻の小さな2発
      for (let k = 0; k < 2; k++) {
        await ctx.wait(160 + k * 120);
        const off = new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
        transient(ctx, bolt(top.clone().add(off), at.clone().add(off).setY(0.1), 0.04, (a) => lightCap(ctx, a), 10, 1), 70);
        flash(ctx, PALS.mahouFlash, 0.35, 120);
        getSound().play('thunder', { gain: 0.35 });
      }
      // 雲が晴れていく
      const light = later(brighten(ctx, 900));
      await ctx.tween(900, (t) => { st.gather = 1 - t; });
      await light;
    }
  },
  cleanup(_ctx, cue) {
    pointOff();
    storms.get(cue)?.kill();
    storms.delete(cue);
  },
};
