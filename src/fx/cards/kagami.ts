// 鏡の結界（コスト3・約3.5秒）
// 前振り：相手の術札の名前ドンのあと、術の光が的へ向かいかけて止まる
// 見せ場：盤の上に大きな丸い銅鏡が立ち上がる。術の光を受け止めて跳ね返し、相手の札が鏡に映ったまま、ひびが入って割れる
// 余韻：鏡がくるりと回って消える
// 術札の演出（magic.ts）は打ち消されると名前ドンまでで止まり、続きをここで見せる
import * as THREE from 'three';
import { CARDS } from '../../cards';
import { PAL, PALS, rgba } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { cameraPush, easeInOut, easeOut, flash, later, lightCap, shakeBy, transient, type FxCtx } from '../kit';
import { pointLight, pointOff, softTexture } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type TrapFireCue } from './types';

const MIRROR_R = 1.9;
const MIRROR_Y = 2.2;

/** 銅鏡の面：金の縁・鋲・青白く光る鏡面。映った札の名前（左右が逆）と、ひび（cracks 0〜1）を描く */
function mirrorFace(name: string): { canvas: HTMLCanvasElement; draw(cracks: number): void } {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const lines: [number, number][][] = [];
  for (let i = 0; i < 9; i++) {
    let a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, r = 10;
    const pts: [number, number][] = [[256 + (Math.random() - 0.5) * 20, 256 + (Math.random() - 0.5) * 20]];
    while (r < 190) {
      r += 22 + Math.random() * 30; a += (Math.random() - 0.5) * 0.5;
      pts.push([256 + Math.cos(a) * r, 256 + Math.sin(a) * r]);
    }
    lines.push(pts);
  }
  const draw = (cracks: number): void => {
    g.clearRect(0, 0, 512, 512);
    // 縁（墨 → 金 → 細い明るい線）と鋲
    g.fillStyle = PALS.sumi; g.beginPath(); g.arc(256, 256, 252, 0, Math.PI * 2); g.fill();
    g.fillStyle = PALS.soubi; g.beginPath(); g.arc(256, 256, 244, 0, Math.PI * 2); g.fill();
    g.strokeStyle = PALS.soubiLight; g.lineWidth = 5; g.beginPath(); g.arc(256, 256, 204, 0, Math.PI * 2); g.stroke();
    g.fillStyle = PALS.soubiPale;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.beginPath(); g.arc(256 + Math.cos(a) * 224, 256 + Math.sin(a) * 224, 8, 0, Math.PI * 2); g.fill();
    }
    // 鏡面
    const gr = g.createRadialGradient(200, 180, 10, 256, 256, 196);
    gr.addColorStop(0, PALS.gofun); gr.addColorStop(0.45, PALS.mahouPale); gr.addColorStop(1, PALS.yoruLight);
    g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 192, 0, Math.PI * 2); g.fill();
    // 映った札の名前（鏡なので左右が逆）
    g.save();
    g.translate(256, 268); g.scale(-1, 1);
    g.fillStyle = rgba(PAL.mahou, 0.75);
    const n = [...name].length;
    g.font = `800 ${Math.min(150, 520 / Math.max(2, n))}px "Shippori Mincho B1", serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, 0, 0);
    g.restore();
    // 照り
    g.strokeStyle = rgba(PAL.hakkou, 0.85); g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.arc(256, 256, 160, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
    if (cracks <= 0) return;
    g.save();
    g.beginPath(); g.arc(256, 256, 192, 0, Math.PI * 2); g.clip();
    g.strokeStyle = PALS.gofun; g.lineWidth = 6; g.lineCap = 'round';
    for (const pts of lines) {
      const k = Math.max(1, Math.round((pts.length - 1) * cracks));
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= k; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.stroke();
    }
    g.restore();
  };
  draw(0);
  return { canvas: c, draw };
}

/** 術の光の玉（藍） */
function orb(): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: PAL.mahouGlow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(0.9);
  return s;
}

/** 鏡のかけら：銀色の三角が飛び散る */
function shards(ctx: FxCtx, at: THREE.Vector3, facing: THREE.Quaternion): void {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: PAL.mahouPale, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
  const ps: { m: THREE.Mesh; v: THREE.Vector3; av: THREE.Vector3 }[] = [];
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(facing), up = new THREE.Vector3(0, 1, 0).applyQuaternion(facing);
  for (let i = 0; i < 34; i++) {
    const s = 0.12 + Math.random() * 0.22;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, s, 0), new THREE.Vector3(-s * 0.7, -s * 0.5, 0), new THREE.Vector3(s * 0.6, -s * 0.6, 0),
    ]);
    const m = new THREE.Mesh(geo, mat);
    const a = Math.random() * Math.PI * 2, r = Math.random() * MIRROR_R * 0.8;
    m.position.copy(at).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
    m.quaternion.copy(facing);
    grp.add(m);
    const v = right.clone().multiplyScalar(Math.cos(a) * (1 + Math.random() * 2.5)).addScaledVector(up, Math.sin(a) * 2 + 1.5);
    ps.push({ m, v, av: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10) });
  }
  const LIFE = 1400;
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const p of ps) {
      p.v.y -= 7 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.av.x * dt; p.m.rotation.y += p.av.y * dt;
    }
    mat.opacity = Math.max(0, 1 - age / LIFE) * lightCap(ctx, 1);
  });
}

interface State { center: THREE.Vector3; orb: THREE.Sprite; killOrb(): void; spin: number; mirror?: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; killMirror?(): void }
const states = new WeakMap<TrapFireCue, State>();

/** 鏡が立つ場所：術の的のあたり（的がなければ盤の中央）。画面の手前寄りに */
function centerOf(ctx: FxCtx, targets: { c: number; r: number }[]): THREE.Vector3 {
  if (targets.length === 0) return new THREE.Vector3(0, 0, ctx.me === 'sente' ? 0.5 : -0.5);
  const v = new THREE.Vector3();
  for (const t of targets) v.add(squarePos(t));
  return v.multiplyScalar(1 / targets.length);
}

export const kagami: CardFx<TrapFireCue> = {
  async pre(ctx, cue) {
    // 打ち消された術の的（前の局面のカードの出来事は見えないので、局面から探さずに盤の中央寄りにする）
    const neg = effect(cue, 'magicNegated');
    const center = centerOf(ctx, []);
    const cam = later(cameraPush(ctx, 0.2, 500));
    const o = orb();
    const st: State = { center, orb: o, killOrb: transient(ctx, o, 60000), spin: 0 };
    states.set(cue, st);
    if (!neg) { await cam; return; }
    // 術の光が上から的へ向かいかけて、止まる
    const from = center.clone().setY(6), stop = center.clone().setY(MIRROR_Y + 0.6);
    getSound().play('whoosh', { gain: 0.5 });
    await ctx.tween(380, (t) => {
      o.position.lerpVectors(from, stop, easeOut(t));
      o.material.opacity = lightCap(ctx, 0.95) * t;
    });
    await ctx.tween(260, (t) => { o.scale.setScalar(0.9 + Math.sin(t * Math.PI * 6) * 0.08); });
    await cam;
  },
  async main(ctx, cue) {
    const st = states.get(cue);
    if (!st) return;
    const neg = effect(cue, 'magicNegated');
    const name = neg ? CARDS[neg.cardId].name : '';
    const face = mirrorFace(name);
    const tex = new THREE.CanvasTexture(face.canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(MIRROR_R, 64),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    st.mirror = mirror;
    const cam = ctx.stage.camera;
    // いつも画面に向け、消えるときだけ縦の軸でくるりと回す
    st.killMirror = transient(ctx, mirror, 60000, () => {
      mirror.quaternion.copy(cam.quaternion);
      mirror.rotateY(st.spin);
    });
    // 盤の下から立ち上がる（盤より下は盤に隠れる）
    const c = st.center;
    getSound().play('chime');
    getSound().play('whoosh', { gain: 0.4 });
    await ctx.tween(420, (t) => {
      mirror.position.set(c.x, -MIRROR_R + (MIRROR_Y + MIRROR_R) * easeOut(t), c.z);
    });
    shakeBy(ctx, 0.12);
    if (!neg) { await ctx.wait(400); return; }
    // 術の光を受け止めて、跳ね返す
    const o = st.orb;
    const hit = mirror.position.clone();
    const p0 = o.position.clone();
    await ctx.tween(160, (t) => { o.position.lerpVectors(p0, hit, t * t); });
    flash(ctx, PALS.hakkou, 0.7, 180);
    pointLight(ctx, hit, 40, PAL.mahouPale, 8);
    getSound().play('clang', { gain: 0.6 });
    shakeBy(ctx, 0.25);
    const away = hit.clone().add(new THREE.Vector3(0, 6, 0));
    await ctx.tween(300, (t) => {
      o.position.lerpVectors(hit, away, easeOut(t));
      o.material.opacity = lightCap(ctx, 0.95) * (1 - t);
    });
    pointOff();
    // 映った札にひびが入り、割れる
    for (const k of [0.3, 0.65, 1]) {
      face.draw(k);
      tex.needsUpdate = true;
      getSound().play('tick', { gain: 0.8 });
      await ctx.wait(140);
    }
    getSound().play('glass');
    flash(ctx, PALS.mahouPale, 0.4, 200);
    shards(ctx, mirror.position.clone(), cam.quaternion.clone());
    // 割れたのは映った札：鏡は面だけ新しくなって残る
    face.draw(0);
    tex.needsUpdate = true;
    await ctx.wait(350);
  },
  async after(ctx, cue) {
    const st = states.get(cue);
    const mirror = st?.mirror;
    if (!st || !mirror) return;
    // くるりと回って消える
    getSound().play('whoosh', { gain: 0.4 });
    const y0 = mirror.position.y;
    await ctx.tween(420, (t) => {
      mirror.scale.setScalar(Math.max(0.01, 1 - t));
      mirror.position.y = y0 + t * 0.6;
      mirror.material.opacity = 1 - t * t;
      st.spin = Math.PI * 2 * t;
    }, easeInOut);
    await ctx.wait(150);
  },
  cleanup(_ctx, cue) {
    pointOff();
    const st = states.get(cue);
    st?.killOrb();
    st?.killMirror?.();
    states.delete(cue);
  },
};
