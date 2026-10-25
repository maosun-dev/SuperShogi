// 韋駄天（コスト5・付けるとき約3.5秒）
// 付けるとき：暗転。駒の足元に炎の輪が灯り、風が巻き上がる。駒の残像が盤の上をひと回り駆けてから元に戻る
// 出番（2回目の移動）：炎の足跡と残像を残して走る
import * as THREE from 'three';
import { PAL, PALS, rgba } from '../../view/palette';
import { BD, BW, squarePos } from '../../view/board3d';
import { PIECE_Y, pieceMesh } from '../../view/pieces3d';
import { flame } from '../../view/equipProps';
import { cameraPush, cameraTo, easeOut, flash, later, lightCap, puff, shakeBy, transient, type FxCtx } from '../kit';
import { brighten, darken, pointLight, pointOff } from '../stagecraft';
import { getSound } from '../sound';
import { ghost } from './parts';
import { squareOf, type EquipFx } from './types';

/** 炎の足跡：小さな炎を1つ置き、life ミリ秒で燃え尽きる */
function flamePrint(ctx: FxCtx, at: THREE.Vector3, h: number, life: number): void {
  const f = flame(h, true);
  f.position.set(at.x, 0.02, at.z);
  const LIFE = life * Math.max(0.6, ctx.timing.scale);
  transient(ctx, f, LIFE, (_dt, age) => {
    const t = age / LIFE;
    const k = (1 - t) * (1 + Math.sin(age / 30) * 0.1);
    f.scale.set(h * 0.5 * k, h * k, 1);
    f.material.opacity = lightCap(ctx, 1) * Math.min(1, t * 6) * (1 - t);
  });
}

/** 足元から巻き上がる風の筋（ms ミリ秒） */
async function whirl(ctx: FxCtx, at: THREE.Vector3, ms: number): Promise<void> {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, rgba(PAL.gofun, 0)); gr.addColorStop(0.2, rgba(PAL.gofun, 0.95));
  gr.addColorStop(0.5, rgba(PAL.soubiLight, 0.7)); gr.addColorStop(1, rgba(PAL.soubiLight, 0));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(8, 0); g.quadraticCurveTo(16, 40, 11, 128); g.lineTo(5, 128); g.quadraticCurveTo(0, 40, 8, 0); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  grp.position.set(at.x, 0, at.z);
  const streaks: { m: THREE.Mesh; a: number; r: number; d: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.1), mat);
    grp.add(m);
    streaks.push({ m, a: (i / 8) * Math.PI * 2, r: 0.55 + (i % 2) * 0.15, d: i * 0.05 });
  }
  const kill = transient(ctx, grp, 60000);
  try {
    await ctx.tween(ms, (t) => {
      for (const s of streaks) {
        const u = Math.min(1, Math.max(0, (t - s.d) / (1 - s.d)));
        const a = s.a + u * Math.PI * 3;
        s.m.position.set(Math.cos(a) * s.r * (1 - u * 0.3), 0.3 + u * 1.9, Math.sin(a) * s.r * (1 - u * 0.3));
        s.m.rotation.set(0, -a, 0.5);
        (s.m.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * u) * lightCap(ctx, 0.9);
      }
    });
  } finally {
    kill();
  }
}

export const idaten: EquipFx = {
  async pre(ctx, cue) {
    const sq = squareOf(ctx.after, cue.pieceId);
    if (!sq) return;
    const at = squarePos(sq);
    const cam = later(cameraTo(ctx, at, 600));
    getSound().play('tsuke', { gain: 0.8 });
    await darken(ctx, at, 500, 0.15);
    await cam;
  },
  async main(ctx, cue) {
    const sq = squareOf(ctx.after, cue.pieceId);
    if (!sq) return;
    const at = squarePos(sq);
    // 炎の輪が灯る
    getSound().play('flame');
    pointLight(ctx, at.clone().setY(0.4), 10, PAL.soubiLight, 4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = at.clone().add(new THREE.Vector3(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62));
      void later(ctx.wait(i * 30).then(() => flamePrint(ctx, p, 0.55, 2200)));
    }
    await ctx.wait(300);
    // 風が巻き上がる
    getSound().play('wind', { gain: 0.7 });
    puff(ctx, at, PAL.kayaLight, 30, 1.5);
    await whirl(ctx, at, 700);
    // 残像が盤の上をひと回り駆ける（盤の縁の内側を回って、元のマスへ）
    const m = pieceMesh(cue.pieceId);
    if (m) {
      await cameraPush(ctx, 0.08, 400);
      getSound().play('whoosh');
      const hx = BW / 2 - 0.9, hz = BD / 2 - 0.9;
      const corners = [new THREE.Vector3(hx, 0, hz), new THREE.Vector3(hx, 0, -hz), new THREE.Vector3(-hx, 0, -hz), new THREE.Vector3(-hx, 0, hz)];
      const path = [at.clone(), ...corners, at.clone()];
      const lens = path.slice(1).map((p, i) => p.distanceTo(path[i]));
      const total = lens.reduce((x, y) => x + y, 0);
      const p0 = m.position.clone();
      let next = 0;
      await ctx.tween(1100, (t) => {
        let d = t * total, i = 0;
        while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
        const q = path[i].clone().lerp(path[i + 1], Math.min(1, d / lens[i]));
        m.position.set(q.x, PIECE_Y + 0.05, q.z);
        if (t > next) {
          ghost(ctx, cue.pieceId, PAL.soubiLight, 420, 0.5);
          flamePrint(ctx, q, 0.3, 500);
          next += 0.04;
        }
      }, (t) => t);
      m.position.copy(p0);
      await cameraTo(ctx, at, 300);
    }
    // 元に戻って、炎が足元へ収まる
    getSound().play('flame', { gain: 0.9 });
    flash(ctx, PALS.soubiPale, 0.35, 200);
    shakeBy(ctx, 0.2);
    pointOff();
    await ctx.wait(350);
  },
  async after(ctx) {
    await brighten(ctx, 500);
  },
  cleanup() {
    pointOff();
  },
  async onSecond(ctx, cue) {
    // 2回目は速く動き、炎の足跡と残像を残す
    const m = pieceMesh(cue.pieceId);
    if (!m) return;
    const a = squarePos(cue.from), b = squarePos(cue.to), y0 = m.position.y;
    const marks = [0.2, 0.4, 0.6, 0.8];
    let next = 0;
    getSound().play('flame', { gain: 0.9 });
    getSound().play('whoosh', { gain: 0.7 });
    await ctx.tweenRaw(160, (t) => {
      m.position.set(a.x + (b.x - a.x) * t, y0, a.z + (b.z - a.z) * t);
      while (next < marks.length && t >= marks[next]) {
        ghost(ctx, cue.pieceId, PAL.soubiLight, 380);
        flamePrint(ctx, m.position, 0.35, 700);
        next++;
      }
    }, easeOut);
    while (next < marks.length) { ghost(ctx, cue.pieceId, PAL.soubiLight, 380); next++; }
    flamePrint(ctx, b, 0.45, 800);
    puff(ctx, b, PAL.kayaLight, 22, 1.1);
  },
};
