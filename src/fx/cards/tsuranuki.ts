// 貫きの槍（コスト4・付けるとき約3秒）
// 付けるとき：駒の後ろに長い槍が現れ、駒に重なって収まる。穂先がきらり
// 出番（飛び越える手）：駒が槍を構えて一直線に突進し、間の駒を高く跳び越える。着地で槍が折れて外れる（onBreak）
import * as THREE from 'three';
import { PAL, PALS } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { PIECE_Y, pieceMesh } from '../../view/pieces3d';
import { spear } from '../../view/equipProps';
import { cameraTo, easeInOut, easeOut, flash, later, lightCap, puff, shakeBy, transient, type FxCtx } from '../kit';
import { getSound } from '../sound';
import { follow, ghost, sparks } from './parts';
import { squareOf, type EquipFx } from './types';

/** 穂先のきらめき（十字の光） */
function glint(ctx: FxCtx, at: THREE.Vector3): void {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, PALS.hakkou); gr.addColorStop(0.2, PALS.soubiPale); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(29, 0, 6, 64); g.fillRect(0, 29, 64, 6);
  g.beginPath(); g.arc(32, 32, 10, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.position.copy(at);
  const LIFE = 520;
  transient(ctx, s, LIFE, (_dt, age) => {
    const k = Math.sin(Math.PI * Math.min(1, age / LIFE));
    s.scale.setScalar(0.1 + k * 0.7);
    s.material.rotation = age / 300;
    s.material.opacity = lightCap(ctx, 1) * k;
  });
}

/** 持ち主から見た前（先手は -z） */
function fwd(side: 'sente' | 'gote'): number {
  return side === 'sente' ? -1 : 1;
}

export const tsuranuki: EquipFx = {
  async main(ctx, cue) {
    const sq = squareOf(ctx.after, cue.pieceId);
    if (!sq) return;
    const at = squarePos(sq);
    const cam = later(cameraTo(ctx, at, 500));
    const f = fwd(cue.side);
    const sp = spear(1.8);
    if (cue.side === 'gote') sp.rotation.y = Math.PI; // 穂先を持ち主の前へ
    const kill = transient(ctx, sp, 60000);
    try {
      await cam;
      // 駒の後ろの遠くに現れ、前へすべって駒に重なる
      getSound().play('whoosh', { gain: 0.6 });
      const z0 = at.z - f * 2.4, z1 = at.z - f * 0.1;
      await ctx.tween(520, (t) => {
        sp.position.set(at.x, 0.32, z0 + (z1 - z0) * t);
        sp.scale.setScalar(Math.min(1, t * 3));
      }, easeOut);
      getSound().play('clang', { gain: 0.45 });
      shakeBy(ctx, 0.1);
      // 穂先がきらり
      glint(ctx, new THREE.Vector3(at.x, 0.32, z1 + f * 0.75));
      getSound().play('chime', { gain: 0.6 });
      await ctx.wait(480);
      // 小さくなって、駒が担ぐ（盤の印の槍になる）
      await ctx.tween(260, (t) => { sp.scale.setScalar(1 - 0.3 * t); sp.position.y = 0.32 + 0.05 * t; }, easeInOut);
    } finally {
      kill();
    }
  },
  async onMove(ctx, cue) {
    // 突進して高く跳び越える：駒をここで行き先まで運ぶ（このあとのふだんの1手は、着いた駒の着地だけ）
    const m = pieceMesh(cue.pieceId);
    if (!m) return;
    // 盤の印の槍は隠し、構えた槍だけ見せる（印は、槍が外れた局面の sync で消える）
    const eqGrp = m.children.find((c) => (c as THREE.Group).isGroup);
    if (eqGrp) eqGrp.visible = false;
    const a = m.position.clone(), b = squarePos(cue.to);
    const dir = b.clone().sub(a).setY(0).normalize();
    const sp = spear(1.5);
    sp.lookAt(dir.clone().negate()); // 穂先（-z）を進む向きへ
    const killSp = follow(ctx, cue.pieceId, sp, 60000, (p) => { sp.position.set(p.position.x, p.position.y + 0.3, p.position.z); });
    try {
      await cameraTo(ctx, a.clone().lerp(b, 0.5), 380);
      // 構える：後ろへ少し引いてためる
      await ctx.tween(220, (t) => { m.position.copy(a).addScaledVector(dir, -0.18 * easeOut(t)); });
      getSound().play('whoosh');
      const a2 = m.position.clone();
      const dist = a2.distanceTo(b);
      let next = 0;
      await ctx.tween(260 + dist * 70, (t) => {
        m.position.lerpVectors(a2, b, t).setY(PIECE_Y + Math.sin(Math.PI * t) * 1.5);
        if (t > next) { ghost(ctx, cue.pieceId, PAL.soubiLight, 360, 0.45); next += 0.2; }
      }, (t) => t);
      m.position.set(b.x, PIECE_Y, b.z);
      sparks(ctx, b.clone().setY(0.2), new THREE.Vector3(0, 1, 0), 60);
      flash(ctx, PALS.soubiPale, 0.3, 160);
      puff(ctx, b, PAL.kayaLight, 30, 1.2);
      shakeBy(ctx, 0.25);
    } finally {
      killSp();
    }
  },
  async onBreak(ctx, cue) {
    // 槍が二つに折れ、金の破片が左右へ跳ねて落ちる
    const at = squarePos(cue.at);
    const grp = new THREE.Group();
    grp.position.set(at.x, 0, at.z);
    const halves = [-1, 1].map((s) => {
      const h = spear(0.8);
      h.position.set(s * 0.18, 0.45, 0);
      h.rotation.y = s * 0.4;
      grp.add(h);
      return { m: h, v: new THREE.Vector3(s * 1.8, 2.6, (Math.random() - 0.5)), av: s * 9 };
    });
    const mats: THREE.Material[] = [];
    grp.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { (mm.material as THREE.Material).transparent = true; mats.push(mm.material as THREE.Material); } });
    const LIFE = 1000;
    transient(ctx, grp, LIFE, (dt, age) => {
      for (const h of halves) {
        h.v.y -= 9 * dt;
        h.m.position.addScaledVector(h.v, dt);
        h.m.position.y = Math.max(0.04, h.m.position.y);
        h.m.rotation.x += h.av * dt;
      }
      for (const mm of mats) mm.opacity = Math.max(0, 1 - age / LIFE);
    });
    sparks(ctx, at.clone().setY(0.5), new THREE.Vector3(0, 1, 0), 80);
    getSound().play('clang', { gain: 0.7 });
    getSound().play('shatter', { gain: 0.4 });
    await ctx.wait(420);
  },
};
