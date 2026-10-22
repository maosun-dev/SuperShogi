// 凍てつく床（コスト1・約3秒）
// 前振り：駒が着いた瞬間、マスの縁から霜が走る
// 見せ場：床から氷がバキバキと伸びて駒を包む。青白い光と「パキッ」
// 余韻：氷の粒がきらめき、凍った印に変わる（印と駒の青みは sync が出す）
import * as THREE from 'three';
import { PAL, PALS, rgba } from '../../view/palette';
import { CD, CW, decal, squarePos } from '../../view/board3d';
import { cameraTo, easeOut, flash, later, lightCap, shakeBy, transient, type FxCtx } from '../kit';
import { pointLight, pointOff } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type TrapFireCue } from './types';

/** マスの縁から内へ伸びる霜の筋（grow は 0〜1） */
function edgeFrostCanvas(): { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; draw(grow: number): void } {
  // 霜の枝は最初に決めておく（伸ばすたびに同じ形）
  const branches: { x: number; y: number; a: number; len: number }[] = [];
  for (let i = 0; i < 28; i++) {
    const side = i % 4, u = 20 + Math.random() * 216;
    const [x, y, a] = side === 0 ? [u, 8, Math.PI / 2] : side === 1 ? [248, u, Math.PI] : side === 2 ? [u, 248, -Math.PI / 2] : [8, u, 0];
    branches.push({ x, y, a: a + (Math.random() - 0.5) * 0.7, len: 40 + Math.random() * 70 });
  }
  let g: CanvasRenderingContext2D | null = null;
  let tex: THREE.Texture | null = null;
  const mesh = decal((ctx2) => { g = ctx2; }, CW * 1.02, CD * 1.02);
  tex = mesh.material.map;
  const draw = (grow: number): void => {
    if (!g) return;
    g.clearRect(0, 0, 256, 256);
    g.lineCap = 'round';
    for (const b of branches) {
      const L = b.len * grow;
      const ex = b.x + Math.cos(b.a) * L, ey = b.y + Math.sin(b.a) * L;
      g.strokeStyle = rgba(PAL.gofun, 0.95); g.lineWidth = 5;
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = rgba(PAL.mahouPale, 0.9); g.lineWidth = 2;
      for (const k of [0.4, 0.7]) {
        if (grow < k) continue;
        const bx = b.x + Math.cos(b.a) * L * k, by = b.y + Math.sin(b.a) * L * k;
        for (const sg of [-1, 1]) {
          g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(b.a + sg * 0.8) * 14, by + Math.sin(b.a + sg * 0.8) * 14); g.stroke();
        }
      }
    }
    if (tex) tex.needsUpdate = true;
  };
  draw(0);
  return { mesh, draw };
}

/** 氷の結晶：細長い六角の柱（青白く半透明） */
function crystals(at: THREE.Vector3): { grp: THREE.Group; spikes: { m: THREE.Mesh; h: number }[]; mat: THREE.MeshStandardMaterial } {
  const mat = new THREE.MeshStandardMaterial({
    color: PAL.mahouPale, emissive: PAL.mahou, emissiveIntensity: 0.25, roughness: 0.15, metalness: 0.1,
    transparent: true, opacity: 0.78, depthWrite: false,
  });
  const grp = new THREE.Group();
  grp.position.set(at.x, 0, at.z);
  const spikes: { m: THREE.Mesh; h: number }[] = [];
  for (let i = 0; i < 18; i++) {
    const h = 0.3 + Math.random() * 0.6;
    const geo = new THREE.CylinderGeometry(0, 0.06 + Math.random() * 0.08, h, 6);
    geo.translate(0, h / 2, 0); // 根元を原点に
    const m = new THREE.Mesh(geo, mat);
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3, r = 0.36 + Math.random() * 0.2;
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    // 外へ少し開き、ばらばらの向きに
    const lean = -0.15 + Math.random() * 0.35;
    m.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
    m.scale.set(1, 0.001, 1);
    grp.add(m);
    spikes.push({ m, h });
  }
  return { grp, spikes, mat };
}

/** きらめく氷の粒 */
function glitter(ctx: FxCtx, at: THREE.Vector3): void {
  const N = 50, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    arr.set([at.x + (Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.8, at.z + (Math.random() - 0.5) * 0.8], i * 3);
    v.push(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color: PAL.mahouPale, size: 0.07, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const LIFE = 1300;
  transient(ctx, new THREE.Points(geo, pm), LIFE, (dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) pos.setXYZ(i, pos.getX(i) + v[i].x * dt, pos.getY(i) + v[i].y * dt, pos.getZ(i) + v[i].z * dt);
    pos.needsUpdate = true;
    // ちかちか瞬く
    pm.opacity = lightCap(ctx, 0.95) * (0.5 + 0.5 * Math.sin(age / 40)) * Math.max(0, 1 - age / LIFE);
  });
}

interface State { frost: ReturnType<typeof edgeFrostCanvas>; killFrost(): void; ice?: ReturnType<typeof crystals>; killIce?(): void }
const states = new WeakMap<TrapFireCue, State>();

export const itetsuku: CardFx<TrapFireCue> = {
  nameMs: 800,
  async pre(ctx, cue) {
    const e = effect(cue, 'frozen');
    if (!e) return;
    const at = squarePos(e.at);
    const cam = later(cameraTo(ctx, at, 450));
    const frost = edgeFrostCanvas();
    frost.mesh.position.set(at.x, 0.011, at.z);
    const st: State = { frost, killFrost: transient(ctx, frost.mesh, 60000) };
    states.set(cue, st);
    getSound().play('frost', { gain: 0.5 });
    await ctx.tween(420, (t) => frost.draw(easeOut(t)));
    await cam;
  },
  async main(ctx, cue) {
    const e = effect(cue, 'frozen');
    const st = states.get(cue);
    if (!e || !st) return;
    const at = squarePos(e.at);
    const ice = crystals(at);
    st.ice = ice;
    st.killIce = transient(ctx, ice.grp, 60000);
    pointLight(ctx, at.clone().setY(0.8), 10, PAL.mahouPale, 4);
    getSound().play('ice');
    // バキバキ：結晶が順に伸びる
    await ctx.tween(520, (t) => {
      ice.spikes.forEach((s, i) => {
        const u = Math.min(1, Math.max(0, (t - i * 0.035) / 0.4));
        s.m.scale.set(1, Math.max(0.001, easeOut(u)), 1);
      });
    });
    // パキッ：凍る（駒の青みと凍った印は sync が付ける）
    ctx.sync();
    flash(ctx, PALS.mahouPale, 0.45, 240);
    getSound().play('frost');
    shakeBy(ctx, 0.14);
    glitter(ctx, at);
    await ctx.wait(500);
  },
  async after(ctx, cue) {
    const st = states.get(cue);
    if (!st?.ice) return;
    const ice = st.ice;
    pointOff();
    // 結晶は砕けて縮み、きらめきだけ残して印に変わる
    await ctx.tween(420, (t) => {
      for (const s of ice.spikes) s.m.scale.set(1 - t * 0.5, Math.max(0.001, 1 - t), 1 - t * 0.5);
      ice.mat.opacity = 0.78 * (1 - t);
      st.frost.mesh.material.opacity = 1 - t;
    });
    await ctx.wait(150);
  },
  cleanup(_ctx, cue) {
    pointOff();
    const st = states.get(cue);
    st?.killFrost();
    st?.killIce?.();
    states.delete(cue);
  },
};
