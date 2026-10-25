// 格落とし（コスト3・約4秒）
// 前振り：暗転し、的の成り駒だけにスポットライト
// 見せ場：駒の上に朱の成り字が浮き出て、ひびが入りパリンと割れる。駒がくるっと裏返って元の字に戻る
// 余韻：朱のかけらが落ちて消え、照明が戻る
import * as THREE from 'three';
import { PAL, PALS, rgba } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { PIECE_Y, labelOf, pieceMesh } from '../../view/pieces3d';
import { cameraTo, easeInOut, easeOut, flash, later, lightCap, shakeBy, transient, type FxCtx } from '../kit';
import { brighten, darken } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type MagicCue } from './types';

const CHAR_Y = 1.25; // 浮き出る字の高さ

/** 朱の成り字（光をまとう）。ひびは cracks（0〜1）で描き足す */
function charCanvas(ch: string): { canvas: HTMLCanvasElement; draw(cracks: number): void } {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  // ひびの線は最初に決めておく（描き足すたびに同じ形）
  const lines: [number, number][][] = [];
  for (let i = 0; i < 7; i++) {
    let a = (i / 7) * Math.PI * 2 + Math.random() * 0.5, r = 6;
    const pts: [number, number][] = [[128, 128]];
    while (r < 120) {
      r += 14 + Math.random() * 18; a += (Math.random() - 0.5) * 0.6;
      pts.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r]);
    }
    lines.push(pts);
  }
  const draw = (cracks: number): void => {
    g.clearRect(0, 0, 256, 256);
    g.save();
    g.shadowColor = rgba(PAL.wana, 0.95); g.shadowBlur = 26;
    g.fillStyle = PALS.wana;
    g.font = '800 190px "Shippori Mincho B1", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, 128, 140);
    g.restore();
    if (cracks <= 0) return;
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = PALS.gofun; g.lineWidth = 5; g.lineCap = 'round';
    for (const pts of lines) {
      const n = Math.max(1, Math.round((pts.length - 1) * cracks));
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k <= n; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
    }
    g.restore();
  };
  draw(0);
  return { canvas: c, draw };
}

/** 朱のかけら：三角の板が飛び散って落ちる */
function shards(ctx: FxCtx, at: THREE.Vector3): void {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: PAL.wana, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
  const ps: { m: THREE.Mesh; v: THREE.Vector3; av: THREE.Vector3 }[] = [];
  for (let i = 0; i < 26; i++) {
    const s = 0.05 + Math.random() * 0.12;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, s, 0), new THREE.Vector3(-s * 0.8, -s * 0.6, 0), new THREE.Vector3(s * (0.4 + Math.random() * 0.5), -s * 0.5, 0),
    ]);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3));
    grp.add(m);
    const a = Math.random() * Math.PI * 2;
    ps.push({ m, v: new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), 1 + Math.random() * 2.5, Math.sin(a) * (1 + Math.random() * 2)), av: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12) });
  }
  const LIFE = 1800;
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const p of ps) {
      p.v.y -= 6 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.03) { p.m.position.y = 0.03; p.v.set(p.v.x * 0.5, 0, p.v.z * 0.5); p.av.multiplyScalar(0.5); }
      p.m.rotation.x += p.av.x * dt; p.m.rotation.y += p.av.y * dt; p.m.rotation.z += p.av.z * dt;
    }
    mat.opacity = Math.min(1, (LIFE - age) / 600);
  });
}

function targetOf(ctx: FxCtx, cue: MagicCue): { id: number; at: THREE.Vector3; ch: string } | null {
  const e = effect(cue, 'demoted');
  if (!e) return null;
  const p = ctx.before.board[e.at.r * 9 + e.at.c];
  return p ? { id: e.pieceId, at: squarePos(e.at), ch: labelOf(p).ch } : null;
}

export const kakuotoshi: CardFx<MagicCue> = {
  async pre(ctx, cue) {
    const p = targetOf(ctx, cue);
    const at = p?.at ?? (cue.targets[0] ? squarePos(cue.targets[0]) : null);
    if (!at) return;
    const cam = later(cameraTo(ctx, at, 800));
    getSound().play('hyoshigi', { gain: 0.6 });
    await darken(ctx, at, 700);
    await cam;
  },
  async main(ctx, cue) {
    const p = targetOf(ctx, cue);
    if (!p) return;
    const m = pieceMesh(p.id);
    if (!m) return;
    // 朱の成り字が浮き出る（いつも画面に向ける）
    const art = charCanvas(p.ch);
    const tex = new THREE.CanvasTexture(art.canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    const charAt = p.at.clone().setY(CHAR_Y);
    sprite.position.copy(charAt).setY(0.4);
    const kill = transient(ctx, sprite, 60000);
    try {
      await ctx.tween(520, (t) => {
        sprite.position.y = 0.4 + (CHAR_Y - 0.4) * easeOut(t);
        sprite.scale.setScalar(0.6 + 0.6 * easeOut(t));
        sprite.material.opacity = lightCap(ctx, 1) * t;
      });
      await ctx.wait(200);
      // ひびが入る（ピシッ、ピシッ）
      for (const k of [0.35, 0.7, 1]) {
        art.draw(k);
        tex.needsUpdate = true;
        getSound().play('tick', { gain: 0.8 });
        shakeBy(ctx, 0.05);
        await ctx.wait(150);
      }
      // パリン
      sprite.visible = false;
      getSound().play('glass');
      flash(ctx, PALS.wana, 0.35, 220);
      shards(ctx, charAt);
      shakeBy(ctx, 0.22);
    } finally {
      kill();
    }
    // 駒がくるっと裏返って、元の字に戻る（半分回ったところで字を戻す）
    const yaw = m.rotation.y;
    await ctx.tween(200, (t) => {
      m.position.y = PIECE_Y + Math.sin(Math.PI * t * 0.5) * 0.5;
      m.rotation.set(0, yaw, (Math.PI / 2) * t);
    }, (t) => t);
    ctx.sync();
    const m2 = pieceMesh(p.id) ?? m;
    getSound().play('kaesu');
    await ctx.tween(260, (t) => {
      m2.position.y = PIECE_Y + Math.cos(Math.PI * t * 0.5) * 0.5;
      m2.rotation.set(0, m2.rotation.y, -(Math.PI / 2) * (1 - t));
    }, easeInOut);
    m2.rotation.set(0, m2.rotation.y, 0);
    m2.position.y = PIECE_Y;
    getSound().play('komaHard');
    shakeBy(ctx, 0.12);
  },
  async after(ctx) {
    await ctx.wait(600);
    await brighten(ctx, 700);
  },
};
