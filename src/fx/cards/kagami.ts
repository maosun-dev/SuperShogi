// 鏡の結界（コスト3・約4.5秒）「時が止まって跳ね返す」
// 前振り：暗転。相手の術の光が的へ向かいかけて、宙で止まる
// 見せ場：巨大な銅鏡が、裏の文様を見せて回りながら盤から立ち上がり、表へ返る。術の光が当たった瞬間に時が止まり（白黒・無音）、
//         光の柱になって術を使った側の帯へ一直線に跳ね返る。鏡に映った札にひびが入り、破片が画面の手前へ飛び散る
// 余韻：鏡がくるりと裏を見せて、盤へ沈む
// 術札の演出（magic.ts）は打ち消されると名前ドンまでで止まり、続きをここで見せる
import * as THREE from 'three';
import { CARDS } from '../../cards';
import { PAL, PALS, rgba } from '../../view/palette';
import { animateEl, cameraPush, easeInOut, easeOut, flash, later, lightCap, overlay, shakeBy, transient, type FxCtx } from '../kit';
import { darken, pointLight, pointOff, softTexture, timeStop } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type TrapFireCue } from './types';

const MIRROR_R = 1.9;
const MIRROR_Y = 2.3;

/** ひびの線（最初に決めておき、描き足すたびに同じ形） */
function crackLines(): [number, number][][] {
  const lines: [number, number][][] = [];
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * Math.PI * 2 + Math.random() * 0.4, r = 8;
    const pts: [number, number][] = [[256, 256]];
    while (r < 190) {
      r += 20 + Math.random() * 28; a += (Math.random() - 0.5) * 0.5;
      pts.push([256 + Math.cos(a) * r, 256 + Math.sin(a) * r]);
    }
    lines.push(pts);
  }
  return lines;
}

/** 鏡の表：金の縁・鋲・青白く光る鏡面。映った札の名前（左右が逆）と、ひび（cracks 0〜1） */
function frontFace(name: string): { canvas: HTMLCanvasElement; draw(cracks: number, glow: number): void } {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const lines = crackLines();
  const draw = (cracks: number, glow: number): void => {
    g.clearRect(0, 0, 512, 512);
    g.fillStyle = PALS.sumi; g.beginPath(); g.arc(256, 256, 254, 0, Math.PI * 2); g.fill();
    g.fillStyle = PALS.soubi; g.beginPath(); g.arc(256, 256, 246, 0, Math.PI * 2); g.fill();
    g.strokeStyle = PALS.soubiLight; g.lineWidth = 5; g.beginPath(); g.arc(256, 256, 206, 0, Math.PI * 2); g.stroke();
    g.fillStyle = PALS.soubiPale;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath(); g.arc(256 + Math.cos(a) * 226, 256 + Math.sin(a) * 226, 8, 0, Math.PI * 2); g.fill();
    }
    const gr = g.createRadialGradient(200, 180, 10, 256, 256, 196);
    gr.addColorStop(0, PALS.gofun); gr.addColorStop(0.45, PALS.mahouPale); gr.addColorStop(1, PALS.yoruLight);
    g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 194, 0, Math.PI * 2); g.fill();
    if (glow > 0) {
      const gl = g.createRadialGradient(256, 256, 0, 256, 256, 194);
      gl.addColorStop(0, rgba(PAL.hakkou, glow)); gl.addColorStop(1, rgba(PAL.mahouPale, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(256, 256, 194, 0, Math.PI * 2); g.fill();
    }
    if (name) {
      g.save();
      g.translate(256, 268); g.scale(-1, 1);
      g.fillStyle = rgba(PAL.mahou, 0.8);
      const n = [...name].length;
      g.font = `800 ${Math.min(150, 520 / Math.max(2, n))}px "Shippori Mincho B1", serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, 0, 0);
      g.restore();
    }
    g.strokeStyle = rgba(PAL.hakkou, 0.85); g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.arc(256, 256, 160, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    if (cracks <= 0) return;
    g.save();
    g.beginPath(); g.arc(256, 256, 194, 0, Math.PI * 2); g.clip();
    g.strokeStyle = PALS.gofun; g.lineWidth = 6; g.lineCap = 'round';
    for (const pts of lines) {
      const k = Math.max(1, Math.round((pts.length - 1) * cracks));
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= k; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
    }
    g.restore();
  };
  draw(0, 0);
  return { canvas: c, draw };
}

/** 鏡の裏（鏡背）：古い青銅に、中央の鈕（つまみ）・内区の菊の花びら・外区の波の文様 */
function backFace(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const bronze = '#5d4a2a', bronzeLight = '#9a7a3e', patina = '#4f6b5a';
  g.fillStyle = PALS.sumi; g.beginPath(); g.arc(256, 256, 254, 0, Math.PI * 2); g.fill();
  const gr = g.createRadialGradient(220, 200, 20, 256, 256, 250);
  gr.addColorStop(0, bronzeLight); gr.addColorStop(0.7, bronze); gr.addColorStop(1, '#3a2c17');
  g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 246, 0, Math.PI * 2); g.fill();
  // 緑青のしみ
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rgba(0x4f6b5a, 0.12 + Math.random() * 0.2);
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 6 + Math.random() * 26, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = bronzeLight; g.lineWidth = 4;
  for (const r of [232, 196, 120]) { g.beginPath(); g.arc(256, 256, r, 0, Math.PI * 2); g.stroke(); }
  // 外区：波の文様（青海波）
  g.lineWidth = 3; g.strokeStyle = rgba(0xd9b45a, 0.85);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = 256 + Math.cos(a) * 214, y = 256 + Math.sin(a) * 214;
    for (const r of [14, 9, 4]) { g.beginPath(); g.arc(x, y, r, a + Math.PI * 0.1, a + Math.PI * 0.9 + Math.PI); g.stroke(); }
  }
  // 内区：菊の花びら
  g.fillStyle = rgba(0xd9b45a, 0.9);
  for (let i = 0; i < 16; i++) {
    g.save(); g.translate(256, 256); g.rotate((i / 16) * Math.PI * 2);
    g.beginPath(); g.ellipse(0, -84, 13, 38, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // 鈕（中央のつまみ）
  const kn = g.createRadialGradient(244, 244, 4, 256, 256, 44);
  kn.addColorStop(0, '#e0c070'); kn.addColorStop(1, bronze);
  g.fillStyle = kn; g.beginPath(); g.arc(256, 256, 42, 0, Math.PI * 2); g.fill();
  g.strokeStyle = patina; g.lineWidth = 3; g.beginPath(); g.arc(256, 256, 42, 0, Math.PI * 2); g.stroke();
  return c;
}

/** 術の光の玉（藍） */
function orb(): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: PAL.mahouGlow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(1.1);
  return s;
}

/** 鏡のかけら：銀の三角が、画面の手前（カメラの方）へ飛んでくる */
function shardsToCamera(ctx: FxCtx, at: THREE.Vector3, cam: THREE.Camera): void {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: PAL.mahouPale, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
  const edge = new THREE.MeshBasicMaterial({ color: PAL.hakkou, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const toCam = cam.position.clone().sub(at).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  const ps: { m: THREE.Mesh; v: THREE.Vector3; av: THREE.Vector3 }[] = [];
  for (let i = 0; i < 46; i++) {
    const s = 0.12 + Math.random() * 0.3;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, s, 0), new THREE.Vector3(-s * 0.7, -s * 0.5, 0), new THREE.Vector3(s * 0.6, -s * 0.6, 0),
    ]);
    const m = new THREE.Mesh(geo, i % 5 ? mat : edge);
    const a = Math.random() * Math.PI * 2, r = Math.random() * MIRROR_R * 0.85;
    m.position.copy(at).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
    m.quaternion.copy(cam.quaternion);
    grp.add(m);
    const v = toCam.clone().multiplyScalar(5 + Math.random() * 7)
      .addScaledVector(right, Math.cos(a) * (1 + Math.random() * 3)).addScaledVector(up, Math.sin(a) * (1 + Math.random() * 3));
    ps.push({ m, v, av: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12) });
  }
  const LIFE = 1100;
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const p of ps) {
      p.v.y -= 3 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.av.x * dt; p.m.rotation.y += p.av.y * dt;
    }
    const k = Math.max(0, 1 - age / LIFE) * lightCap(ctx, 1);
    mat.opacity = k; edge.opacity = k;
  });
}

/** 3D の点が、対局画面（root）の中でどこに見えるか */
function toScreen(ctx: FxCtx, p: THREE.Vector3): { x: number; y: number } {
  const v = p.clone().project(ctx.stage.camera);
  const c = ctx.stage.canvas.getBoundingClientRect(), o = ctx.hud.root.getBoundingClientRect();
  return { x: c.left - o.left + (v.x + 1) / 2 * c.width, y: c.top - o.top + (1 - v.y) / 2 * c.height };
}

/** 跳ね返した光の柱：鏡から、術を使った側の帯へ一直線（重ね板） */
async function beamTo(ctx: FxCtx, from: { x: number; y: number }, band: HTMLElement | null): Promise<void> {
  const o = ctx.hud.root.getBoundingClientRect();
  const r = band?.getBoundingClientRect();
  const to = r ? { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 } : { x: o.width / 2, y: 0 };
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const el = document.createElement('div');
  Object.assign(el.style, {
    left: `${from.x}px`, top: `${from.y - 9}px`, width: `${len}px`, height: '18px',
    transformOrigin: '0 50%',
    background: `linear-gradient(180deg, ${rgba(PAL.mahouGlow, 0)} 0%, ${rgba(PAL.mahouPale, 0.9)} 35%, ${rgba(PAL.hakkou, lightCap(ctx, 1))} 50%, ${rgba(PAL.mahouPale, 0.9)} 65%, ${rgba(PAL.mahouGlow, 0)} 100%)`,
    boxShadow: `0 0 24px 6px ${rgba(PAL.mahouGlow, 0.7)}`,
    borderRadius: '9px',
  });
  overlay(ctx).append(el);
  const S = ctx.timing.scale;
  try {
    await animateEl(ctx, el, [
      { transform: `rotate(${ang}deg) scaleX(0)`, opacity: 1 },
      { transform: `rotate(${ang}deg) scaleX(1)`, opacity: 1 },
    ], { duration: Math.max(1, 160 * S), easing: 'cubic-bezier(.2,.9,.3,1)' });
    // 帯に当たる：白く光って、帯が揺れる
    flash(ctx, PALS.hakkou, 0.6, 240);
    shakeBy(ctx, 0.35);
    getSound().play('thunder', { gain: 0.35 });
    if (band) void later(animateEl(ctx, band, [
      { transform: 'translate(0, 0)' }, { transform: 'translate(-6px, 3px)' }, { transform: 'translate(5px, -2px)' },
      { transform: 'translate(-3px, 1px)' }, { transform: 'translate(0, 0)' },
    ], { duration: Math.max(1, 360 * S), easing: 'ease-out', fill: 'none' }));
    await animateEl(ctx, el, [
      { transform: `rotate(${ang}deg) scaleX(1) scaleY(1)`, opacity: 1 },
      { transform: `rotate(${ang}deg) scaleX(1) scaleY(.1)`, opacity: 0 },
    ], { duration: Math.max(1, 360 * S), easing: 'ease-in' });
  } finally {
    el.remove();
  }
}

interface Mirror {
  grp: THREE.Group;          // 位置（立ち上がる高さ）
  spinner: THREE.Group;      // 縦の軸で回す（0 で表が画面を向く、π で裏）
  face: ReturnType<typeof frontFace>;
  tex: THREE.CanvasTexture;
  mats: THREE.Material[];
  kill(): void;
}

interface State { center: THREE.Vector3; orb: THREE.Sprite; killOrb(): void; mirror?: Mirror }
const states = new WeakMap<TrapFireCue, State>();

function buildMirror(ctx: FxCtx, name: string): Mirror {
  const face = frontFace(name);
  const tex = new THREE.CanvasTexture(face.canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const btex = new THREE.CanvasTexture(backFace()); btex.colorSpace = THREE.SRGBColorSpace;
  const fm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const bm = new THREE.MeshBasicMaterial({ map: btex, transparent: true, depthWrite: false });
  const front = new THREE.Mesh(new THREE.CircleGeometry(MIRROR_R, 64), fm);
  front.position.z = 0.03;
  const back = new THREE.Mesh(new THREE.CircleGeometry(MIRROR_R, 64), bm);
  back.rotation.y = Math.PI;
  back.position.z = -0.03;
  const rimMat = new THREE.MeshStandardMaterial({ color: PAL.soubi, metalness: 0.7, roughness: 0.35, emissive: PAL.soubi, emissiveIntensity: 0.25 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(MIRROR_R, MIRROR_R, 0.08, 64, 1, true), rimMat);
  rim.rotation.x = Math.PI / 2;
  const spinner = new THREE.Group();
  spinner.add(front, back, rim);
  const grp = new THREE.Group();
  grp.add(spinner);
  const cam = ctx.stage.camera;
  // 毎フレーム、鏡の面を画面へ向ける（回すのは spinner）
  const kill = transient(ctx, grp, 60000, () => { grp.quaternion.copy(cam.quaternion); });
  return { grp, spinner, face, tex, mats: [fm, bm, rimMat], kill };
}

/** 鏡が立つ場所：盤の中央の少し手前 */
function centerOf(ctx: FxCtx): THREE.Vector3 {
  return new THREE.Vector3(0, 0, ctx.me === 'sente' ? 0.5 : -0.5);
}

export const kagami: CardFx<TrapFireCue> = {
  async pre(ctx, cue) {
    const neg = effect(cue, 'magicNegated');
    const center = centerOf(ctx);
    const cam = later(cameraPush(ctx, 0.18, 500));
    const dark = later(darken(ctx, null, 450, 0.18));
    const o = orb();
    const st: State = { center, orb: o, killOrb: transient(ctx, o, 60000) };
    states.set(cue, st);
    if (neg) {
      // 術の光が上から的へ向かいかけて、宙で止まる（ぶるぶる震える）
      const from = center.clone().setY(7), stop = center.clone().setY(MIRROR_Y + 1.4);
      getSound().play('whoosh', { gain: 0.5 });
      await ctx.tween(380, (t) => {
        o.position.lerpVectors(from, stop, easeOut(t));
        o.material.opacity = lightCap(ctx, 0.95) * t;
      });
      await ctx.tween(300, (t) => { o.scale.setScalar(1.1 + Math.sin(t * Math.PI * 8) * 0.1); });
    }
    await Promise.all([cam, dark]);
  },
  async main(ctx, cue) {
    const st = states.get(cue);
    if (!st) return;
    const neg = effect(cue, 'magicNegated');
    const mirror = buildMirror(ctx, neg ? CARDS[neg.cardId].name : '');
    st.mirror = mirror;
    const c = st.center;
    // 裏の文様を見せながら回って、盤から立ち上がり、表へ返る（盤より下は盤に隠れる）
    getSound().play('chime');
    getSound().play('whoosh', { gain: 0.5 });
    pointLight(ctx, c.clone().setY(MIRROR_Y), 12, PAL.soubiLight, 7);
    await ctx.tween(900, (t) => {
      mirror.grp.position.set(c.x, -MIRROR_R + (MIRROR_Y + MIRROR_R) * easeOut(Math.min(1, t * 1.5)), c.z);
      // 2回り半して、最後に表（0）で止まる
      mirror.spinner.rotation.y = Math.PI * 5 * (1 - easeOut(t)) + Math.PI;
    });
    mirror.spinner.rotation.y = 0;
    getSound().play('clang', { gain: 0.5 });
    shakeBy(ctx, 0.15);
    if (!neg) { pointOff(); await ctx.wait(500); return; }
    // 術の光が鏡に当たる
    const o = st.orb;
    const hit = mirror.grp.position.clone();
    const p0 = o.position.clone();
    await ctx.tween(150, (t) => { o.position.lerpVectors(p0, hit, t * t); });
    // 時が止まる：白黒・無音。鏡の面だけが白く光をためる
    flash(ctx, PALS.hakkou, 0.5, 120);
    timeStop(ctx, 1);
    getSound().play('frost', { gain: 0.5 });
    await ctx.tween(650, (t) => {
      mirror.face.draw(0, t * 0.9);
      mirror.tex.needsUpdate = true;
      o.scale.setScalar(1.1 + t * 0.6);
    });
    // 時が動き出す：光の柱になって、術を使った側の帯へ跳ね返す
    timeStop(ctx, 0);
    o.visible = false;
    pointLight(ctx, hit, 50, PAL.mahouPale, 9);
    getSound().play('clang');
    getSound().play('whoosh');
    const band = ctx.hud.root.querySelector<HTMLElement>(neg.side === ctx.me ? '.side.me' : '.side.foe');
    await beamTo(ctx, toScreen(ctx, hit), band);
    pointOff();
    // 映った札にひびが入り、破片が手前へ飛び散る
    for (const k of [0.3, 0.65, 1]) {
      mirror.face.draw(k, 0);
      mirror.tex.needsUpdate = true;
      getSound().play('tick', { gain: 0.9 });
      await ctx.wait(120);
    }
    getSound().play('glass');
    flash(ctx, PALS.mahouPale, 0.55, 220);
    shakeBy(ctx, 0.3);
    shardsToCamera(ctx, hit, ctx.stage.camera);
    // 割れたのは映った札：鏡は面だけ新しくなって残る
    mirror.face.draw(0, 0);
    mirror.tex.needsUpdate = true;
    await ctx.wait(450);
  },
  async after(ctx, cue) {
    const st = states.get(cue);
    const mirror = st?.mirror;
    if (!st || !mirror) return;
    // くるりと裏を見せて、盤へ沈む
    getSound().play('whoosh', { gain: 0.4 });
    const y0 = mirror.grp.position.y;
    await ctx.tween(650, (t) => {
      mirror.spinner.rotation.y = Math.PI * easeInOut(Math.min(1, t * 1.6));
      mirror.grp.position.y = y0 - (y0 + MIRROR_R) * Math.max(0, (t - 0.45) / 0.55) ** 2;
    });
    getSound().play('stamp', { gain: 0.6 });
    await ctx.wait(150);
  },
  cleanup(ctx, cue) {
    pointOff();
    timeStop(ctx, 0);
    const st = states.get(cue);
    st?.killOrb();
    st?.mirror?.kill();
    states.delete(cue);
  },
};
