// 身代わり（コスト5・約5秒）忍者の「変わり身の術」
// 前振り：相手の駒が王へ飛びかかる途中で止まり、暗転
// 見せ場：王と味方の駒が煙でドロン。煙が晴れると、王は味方のいたマスに移っていて、王のいたマスには丸太。
//         飛びかかった駒が丸太を叩き割り、元のマスへ跳ね戻される
// 余韻：丸太のかけらが転がって消え、照明が戻る
// ルール：壊れるのは味方の駒（destroyed）、王は kingGuarded の at から to へ移り、取りに来た駒（attackerId）は動かない
import * as THREE from 'three';
import { PAL, PALS, rgba } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { PIECE_Y, pieceMesh } from '../../view/pieces3d';
import { cameraTo, easeInOut, easeOut, flash, later, puff, shakeBy, transient, type FxCtx } from '../kit';
import { brighten, darken, moveSpot, smokeBall } from '../stagecraft';
import { getSound } from '../sound';
import { effect, squareOf, type CardFx, type TrapFireCue } from './types';

const LEAP = 0.55;   // 飛びかかって止まる所（王までの割合）
const LEAP_Y = 0.8;  // 飛びかかって止まる高さ

/** 丸太の切り口の模様（年輪） */
function ringsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = rgba(PAL.kayaLight, 1); g.fillRect(0, 0, 64, 64);
  g.strokeStyle = rgba(PAL.kayaGrain, 0.7); g.lineWidth = 2;
  for (let r = 4; r < 32; r += 5) { g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = rgba(PAL.kayaLeg, 1); g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 立てた丸太（荒縄を1本巻く） */
function logMesh(): THREE.Group {
  const bark = new THREE.MeshStandardMaterial({ color: PAL.kayaLeg, roughness: 0.9 });
  const cut = new THREE.MeshStandardMaterial({ map: ringsTexture(), roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.9, 16), [bark, cut, cut]);
  body.position.y = 0.45;
  body.castShadow = true;
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 24), new THREE.MeshStandardMaterial({ color: PAL.kaya, roughness: 1 }));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = 0.55;
  const g = new THREE.Group();
  g.add(body, rope);
  return g;
}

/** 丸太のかけら：木の塊が飛び散って転がる */
function splinters(ctx: FxCtx, at: THREE.Vector3): void {
  const mats = [new THREE.MeshStandardMaterial({ color: PAL.kayaLeg, roughness: 0.9, transparent: true }), new THREE.MeshStandardMaterial({ color: PAL.kayaLight, roughness: 0.7, transparent: true })];
  const grp = new THREE.Group();
  const ps: { m: THREE.Mesh; v: THREE.Vector3; av: THREE.Vector3 }[] = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06 + Math.random() * 0.1, 0.12 + Math.random() * 0.3, 0.06 + Math.random() * 0.1), mats[i % 2]);
    m.castShadow = true;
    m.position.set(at.x + (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.6, at.z + (Math.random() - 0.5) * 0.4);
    grp.add(m);
    const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
    ps.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp), av: new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14) });
  }
  const LIFE = 2400;
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const p of ps) {
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.v.y *= -0.3; p.v.x *= 0.75; p.v.z *= 0.75; p.av.multiplyScalar(0.7); }
      p.m.rotation.x += p.av.x * dt; p.m.rotation.y += p.av.y * dt; p.m.rotation.z += p.av.z * dt;
    }
    for (const m of mats) m.opacity = Math.min(1, (LIFE - age) / 700);
  });
}

interface State { atk: THREE.Object3D | null; from: THREE.Vector3; mid: THREE.Vector3 }
const states = new WeakMap<TrapFireCue, State>();

export const migawari: CardFx<TrapFireCue> = {
  async pre(ctx, cue) {
    const g = effect(cue, 'kingGuarded');
    if (!g) return;
    const kingAt = squarePos(g.at);
    const atk = pieceMesh(g.attackerId) ?? null;
    const fromSq = squareOf(ctx.before, g.attackerId);
    const from = fromSq ? squarePos(fromSq) : kingAt.clone();
    const mid = from.clone().lerp(kingAt, LEAP).setY(PIECE_Y + LEAP_Y);
    states.set(cue, { atk, from, mid });
    const cam = later(cameraTo(ctx, kingAt.clone().lerp(from, 0.3), 450));
    // 飛びかかって、宙で止まる
    if (atk) {
      getSound().play('whoosh', { gain: 0.6 });
      await ctx.tween(260, (t) => {
        atk.position.set(from.x + (mid.x - from.x) * t, PIECE_Y + Math.sin(t * Math.PI * 0.5) * LEAP_Y, from.z + (mid.z - from.z) * t);
        atk.rotation.x = -0.25 * t * (atk.rotation.y === 0 ? 1 : -1);
      }, easeOut);
    }
    getSound().play('hyoshigi');
    flash(ctx, PALS.gofun, 0.35, 160);
    await darken(ctx, kingAt, 220, 0.12);
    await cam;
  },
  async main(ctx, cue) {
    const d = effect(cue, 'destroyed');
    const g = effect(cue, 'kingGuarded');
    const st = states.get(cue);
    if (!d || !g || !st) return;
    const kingAt = squarePos(g.at), subAt = squarePos(g.to);
    const king = pieceMesh(g.kingId);
    const sub = pieceMesh(d.pieceId);
    // ドロン：王と味方の駒が煙に消える
    getSound().play('poof');
    smokeBall(ctx, kingAt, 1.2);
    smokeBall(ctx, subAt, 1.0);
    shakeBy(ctx, 0.15);
    if (king) king.visible = false;
    if (sub) sub.visible = false;
    await ctx.wait(520);
    // 煙が晴れると、王は味方のマスに、王のマスには丸太
    if (king) { king.position.set(subAt.x, PIECE_Y, subAt.z); king.visible = true; }
    const log = logMesh();
    log.position.set(kingAt.x, 0, kingAt.z);
    const killLog = transient(ctx, log, 60000);
    moveSpot(ctx, kingAt);
    getSound().play('koma', { gain: 0.7 });
    await ctx.wait(380);
    // 飛びかかった駒が丸太を叩き割る
    const atk = st.atk;
    if (atk) {
      const p0 = atk.position.clone(), hit = kingAt.clone().setY(PIECE_Y + 0.55);
      await ctx.tween(150, (t) => { atk.position.lerpVectors(p0, hit, t * t); });
    }
    killLog();
    getSound().play('shatter');
    getSound().play('thud');
    flash(ctx, PALS.gofun, 0.4, 160);
    splinters(ctx, kingAt);
    puff(ctx, kingAt, PAL.kayaLight, 40, 1.6);
    shakeBy(ctx, 0.4);
    // 元のマスへ跳ね戻される
    if (atk) {
      const p1 = atk.position.clone();
      const rx = atk.rotation.x;
      await ctx.tween(420, (t) => {
        atk.position.set(p1.x + (st.from.x - p1.x) * t, PIECE_Y + (p1.y - PIECE_Y) * (1 - t) + Math.sin(Math.PI * t) * 0.7, p1.z + (st.from.z - p1.z) * t);
        atk.rotation.x = rx * (1 - t);
        atk.rotation.z = Math.sin(t * Math.PI * 2) * 0.3;
      }, easeInOut);
      atk.position.set(st.from.x, PIECE_Y, st.from.z);
      atk.rotation.x = 0; atk.rotation.z = 0;
      getSound().play('komaHard');
    }
    // 王の見得：小さく弾む
    if (king) await ctx.tween(260, (t) => { king.position.y = PIECE_Y + Math.sin(Math.PI * t) * 0.18; }, easeOut);
  },
  async after(ctx) {
    await ctx.wait(500);
    await brighten(ctx, 600);
  },
  cleanup(_ctx, cue) {
    states.delete(cue);
  },
};
