// 落とし穴（コスト2・約3.5秒）
// 前振り：駒が着いた瞬間、床がぐらっと揺れて止まる（ひと呼吸の間）
// 見せ場：床板がぱかっと割れて開き、駒が回りながら暗い穴へ吸い込まれる。少し遅れて底で「ドスン」、土ぼこりが吹き上がる
// 余韻：床板が閉じる
import * as THREE from 'three';
import { PAL, rgba } from '../../view/palette';
import { CD, CW, decal, squarePos } from '../../view/board3d';
import { pieceMesh } from '../../view/pieces3d';
import { easeInOut, easeOut, puff, shakeBy, transient, type FxCtx } from '../kit';
import { cameraAbove } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type TrapFireCue } from './types';

/** 穴の底の闇（ふちは木の割れ目） */
function holeMesh(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  return decal((g) => {
    g.fillStyle = rgba(PAL.kayaGrainDeep, 1);
    g.fillRect(6, 6, 244, 244);
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 130);
    gr.addColorStop(0, rgba(PAL.sumiHole, 1)); gr.addColorStop(0.7, rgba(PAL.sumiHole, 1)); gr.addColorStop(1, rgba(PAL.sumiBurnEdge, 1));
    g.fillStyle = gr; g.fillRect(16, 16, 224, 224);
  }, CW * 0.96, CD * 0.96);
}

/** 床板1枚（マスの半分）。木の色と木目を描いた箱 */
function boardHalf(): THREE.Mesh {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = rgba(PAL.kaya, 1); g.fillRect(0, 0, 64, 128);
  g.strokeStyle = rgba(PAL.kayaGrain, 0.35); g.lineWidth = 2;
  for (let x = 6; x < 64; x += 9 + Math.random() * 6) { g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 4, 40, x - 4, 90, x + 2, 128); g.stroke(); }
  g.strokeStyle = rgba(PAL.sumi, 0.5); g.lineWidth = 3; g.strokeRect(1, 1, 62, 126);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // 下へ開くと盤の中に入って隠れてしまうので、盤より手前に描く（穴の中へ開いて見える）
  const opts = { transparent: true, depthTest: false, depthWrite: false };
  const top = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, ...opts });
  const side = new THREE.MeshStandardMaterial({ color: PAL.kayaGrainDeep, roughness: 0.7, ...opts });
  const geo = new THREE.BoxGeometry(CW * 0.48, 0.04, CD * 0.96);
  const m = new THREE.Mesh(geo, [side, side, top, side, side, side]);
  m.renderOrder = 4;
  return m;
}

interface Trap {
  grp: THREE.Group;
  hinges: THREE.Group[]; // 左右の蝶番（床板はその子）
  hole: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  kill(): void;
}
const traps = new WeakMap<TrapFireCue, Trap>();

function build(ctx: FxCtx, at: THREE.Vector3): Trap {
  const grp = new THREE.Group();
  grp.position.set(at.x, 0, at.z);
  const hole = holeMesh();
  hole.position.y = 0.006;
  hole.visible = false;
  grp.add(hole);
  const hinges = [-1, 1].map((s) => {
    const h = new THREE.Group();
    h.position.set(s * CW * 0.48, 0.022, 0);
    const b = boardHalf();
    b.position.x = -s * CW * 0.24;
    h.add(b);
    grp.add(h);
    return h;
  });
  grp.visible = false; // 開くまでは本物の盤の目が見えたままにする
  return { grp, hinges, hole, kill: transient(ctx, grp, 60000) };
}

export const otoshiana: CardFx<TrapFireCue> = {
  async pre(ctx, cue) {
    const e = effect(cue, 'destroyed');
    if (!e) return;
    const at = squarePos(e.at);
    traps.set(cue, build(ctx, at));
    await cameraAbove(ctx, at, 450);
    // ぐらっ：床が一度揺れて、止まる（ひと呼吸）
    getSound().play('komaHard', { gain: 0.4 });
    const m = pieceMesh(e.pieceId);
    const x0 = m?.position.x ?? 0;
    await ctx.tween(260, (t) => { if (m) m.position.x = x0 + Math.sin(t * Math.PI * 5) * 0.04 * (1 - t); });
    if (m) m.position.x = x0;
    shakeBy(ctx, 0.08);
    await ctx.wait(320);
  },
  async main(ctx, cue) {
    const e = effect(cue, 'destroyed');
    const tr = traps.get(cue);
    if (!e || !tr) return;
    const at = squarePos(e.at);
    tr.grp.visible = true;
    tr.hole.visible = true;
    // 床板がぱかっと下へ開く
    getSound().play('trapdoor');
    shakeBy(ctx, 0.2);
    puff(ctx, at, PAL.kayaLight, 24, 1.0);
    const open = (k: number): void => { tr.hinges.forEach((h, i) => { h.rotation.z = (i ? 1 : -1) * (Math.PI * 0.55) * k; }); };
    await ctx.tween(200, (t) => open(easeOut(t)));
    // 駒が回りながら吸い込まれる（盤の面より下は盤に隠れる）
    const m = pieceMesh(e.pieceId);
    if (m) {
      const y0 = m.position.y, ry = m.rotation.y;
      await ctx.tween(650, (t) => {
        m.position.y = y0 - 1.3 * t * t;
        m.rotation.y = ry + Math.PI * 3 * t;
        m.rotation.x = Math.sin(t * Math.PI) * 0.4;
        m.scale.setScalar(1 - 0.6 * t);
      }, (t) => t);
      m.visible = false;
    }
    // 少し遅れて、底でドスン。土ぼこりが吹き上がる
    await ctx.wait(260);
    getSound().play('thud');
    shakeBy(ctx, 0.3);
    puff(ctx, at.clone().setY(0), PAL.kayaGrainDeep, 40, 0.7);
    puff(ctx, at, PAL.kayaLight, 30, 0.5);
    await ctx.wait(250);
  },
  async after(ctx, cue) {
    const tr = traps.get(cue);
    if (!tr) return;
    // 床板が閉じる
    await ctx.tween(320, (t) => { tr.hinges.forEach((h, i) => { h.rotation.z = (i ? 1 : -1) * (Math.PI * 0.55) * (1 - t); }); }, easeInOut);
    getSound().play('koma', { gain: 0.6 });
    tr.hole.visible = false;
    await ctx.wait(250);
  },
  cleanup(_ctx, cue) {
    traps.get(cue)?.kill();
    traps.delete(cue);
  },
};
