// 成り封じ（コスト2・約3秒）
// 前振り：成ろうとして裏返りかけた駒が、途中の角度で固まる
// 見せ場：朱のお札が上から「ペタッ」と貼り付き、駒がガクンと元の向きに戻される
// 余韻：封の印が残る（成れない印は sync が出す）
// 決まり：ルールでは成り封じの発動が駒の移動より先に記録されるので、ここで駒を行き先まで運んでおく
// （このあとのふだんの1手は、駒が着いていれば動かさない）。成り上がりの中で発動したときは動かない
import * as THREE from 'three';
import { PAL, PALS, rgba } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { PIECE_Y, pieceMesh } from '../../view/pieces3d';
import { cameraTo, easeOut, flash, later, shakeBy, transient, type FxCtx } from '../kit';
import { getSound } from '../sound';
import { effect, squareOf, type CardFx, type TrapFireCue } from './types';

const TILT = Math.PI * 0.42; // 固まる角度
const HOVER = 0.75;          // 裏返りかけて浮く高さ

/** 朱のお札：縦長の紙に墨の「封」と呪文の線（Yuji Boku が読めればその字体） */
function ofudaMesh(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const c = document.createElement('canvas'); c.width = 128; c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = PALS.gofun; g.fillRect(6, 4, 116, 312);
  g.fillStyle = PALS.wana; g.fillRect(12, 10, 104, 300);
  g.fillStyle = PALS.gofun; g.fillRect(20, 18, 88, 284);
  g.fillStyle = PALS.wana;
  g.font = '96px "Yuji Boku", "Shippori Mincho B1", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('封', 64, 92);
  // 呪文の線（墨の筆）
  g.strokeStyle = PALS.sumi; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const y = 160 + i * 26;
    g.beginPath(); g.moveTo(36, y); g.bezierCurveTo(52, y - 10, 76, y + 10, 92, y - 2); g.stroke();
  }
  g.strokeStyle = rgba(PAL.wana, 0.9); g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 140); g.lineTo(64, 296); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.05),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  return m;
}

interface State { m: THREE.Object3D; at: THREE.Vector3; y0: number; rz: number }
const states = new WeakMap<TrapFireCue, State>();

export const narifuuji: CardFx<TrapFireCue> = {
  async pre(ctx, cue) {
    const e = effect(cue, 'promotionBlocked');
    if (!e) return;
    const m = pieceMesh(e.pieceId);
    const dest = squareOf(ctx.after, e.pieceId) ?? squareOf(ctx.before, e.pieceId);
    if (!m || !dest) return;
    const at = squarePos(dest);
    const cam = later(cameraTo(ctx, at, 450));
    // 行き先へ運ぶ（ふだんの1手と同じ弧）
    const a = m.position.clone();
    if (Math.hypot(at.x - a.x, at.z - a.z) > 0.01) {
      await ctx.tween(220, (t) => {
        m.position.set(a.x + (at.x - a.x) * t, a.y + (PIECE_Y - a.y) * t + Math.sin(Math.PI * t) * 0.35, a.z + (at.z - a.z) * t);
      }, easeOut);
      getSound().play('koma');
    }
    await cam;
    // 成ろうと裏返りかけて、途中で固まる（ぶるぶる震える）
    const rz = m.rotation.z;
    const y0 = PIECE_Y;
    getSound().play('kaesu', { gain: 0.6 });
    await ctx.tween(240, (t) => {
      m.position.y = y0 + HOVER * easeOut(t);
      m.rotation.z = rz + TILT * easeOut(t);
    });
    await ctx.tween(380, (t) => {
      m.rotation.z = rz + TILT + Math.sin(t * Math.PI * 14) * 0.03 * (1 - t);
    });
    states.set(cue, { m, at, y0, rz });
  },
  async main(ctx, cue) {
    const st = states.get(cue);
    if (!st) return;
    const { m, at, y0, rz } = st;
    try {
      await Promise.race([document.fonts?.load('96px "Yuji Boku"'), ctx.wait(200)]);
    } catch { /* 字体がなければ代わりの字体で描く */ }
    // お札が上から舞い降りて、ペタッ
    const ofuda = ofudaMesh();
    const cam = ctx.stage.camera;
    const kill = transient(ctx, ofuda, 60000, () => { ofuda.quaternion.copy(cam.quaternion); });
    try {
      const top = at.clone().setY(3.4), hit = at.clone().setY(y0 + HOVER + 0.2);
      await ctx.tween(260, (t) => {
        ofuda.position.lerpVectors(top, hit, t);
        ofuda.position.x += Math.sin(t * Math.PI * 2) * 0.25 * (1 - t);
        ofuda.scale.setScalar(1.6 - 0.6 * t);
      }, (t) => t * t);
      getSound().play('fuuin');
      flash(ctx, PALS.wana, 0.35, 220);
      shakeBy(ctx, 0.2);
      // ガクン：元の向きに戻され、落ちる（お札は駒に貼り付いたまま一緒に下りる）
      await ctx.tween(220, (t) => {
        m.rotation.z = rz + TILT * (1 - t);
        m.position.y = y0 + HOVER * (1 - t * t);
        ofuda.position.y = y0 + 0.2 + HOVER * (1 - t * t);
      }, (t) => t);
      m.rotation.z = rz;
      m.position.y = y0;
      getSound().play('komaHard');
      shakeBy(ctx, 0.28);
      await ctx.wait(420);
      // お札は小さくなって、封の印へ
      await ctx.tween(280, (t) => {
        ofuda.scale.setScalar(1 - 0.7 * t);
        ofuda.position.y = y0 + 0.2 - 0.15 * t;
        ofuda.material.opacity = 1 - t;
      });
    } finally {
      kill();
    }
    // ここでは盤を揃えない（取る手なら、このあとのふだんの1手が取られた駒をはじく）。成れない印は最後の sync で出る
  },
  async after(ctx) {
    await ctx.wait(300);
  },
  cleanup(_ctx, cue) {
    states.delete(cue);
  },
};
