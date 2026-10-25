// 札の演出の舞台の道具：暗転（地明かりと背景を落とす）・スポットライト・点の光（稲妻など）・
// カメラの構え（低く横から・引いて見上げる）・煙玉。
// 決まり：
// - 光は prepareStagecraft で最初に1回だけ置く（あとで足すと材質の作り直しで引っかかる）
// - 暗転は「持ち主の ctx」を覚え、戻すのは持ち主だけ（打ち切られた古い演出が、次の演出の暗転を戻さない）
// - 打ち切り（投了・画面の片付け）では resetStagecraft で必ず元の明るさに戻す（player の cancel から呼ぶ）
// - 動きを減らす設定では、スポットライトの光の円すいを出さない。点の光は flashMax に合わせて弱める
import * as THREE from 'three';
import type { Stage } from '../view/stage';
import { PAL } from '../view/palette';
import { cameraMove, easeInOut, easeOut, lightCap, transient, type FxCtx } from './kit';

// ---------- 光の下ごしらえ ----------
interface Rig {
  stage: Stage;
  spot: THREE.SpotLight;
  beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  point: THREE.PointLight;
}
let rig: Rig | null = null;

const SPOT_POWER = 90;   // スポットライトのいちばん明るいとき
const BEAM_OPACITY = 0.07; // 光の円すいの濃さ
const SPOT_FROM = new THREE.Vector3(0, 13, 5); // 的から見た、光の出どころ

/** 演出役を作るときに1回呼ぶ */
export function prepareStagecraft(stage: Stage): void {
  if (rig) return;
  const spot = new THREE.SpotLight(PAL.skyLight, 0, 40, 0.075, 0.45, 1);
  const point = new THREE.PointLight(PAL.mahouBolt, 0, 22, 1.4);
  const g = new THREE.ConeGeometry(0.95, 14, 40, 1, true);
  g.translate(0, -7, 0); // 先（光の出どころ）を原点に
  const beam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: PAL.skyLight, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  beam.visible = false;
  rig = { stage, spot, beam, point };
  stage.scene.add(rig.spot, rig.spot.target, rig.point, rig.beam);
}

// ---------- 暗転 ----------

/** 暗転の明るさ：もとの明るさ base を k 倍（0〜1 に丸める）。純粋な計算 */
export function houseLevel(base: readonly number[], k: number): number[] {
  const c = Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 1;
  return base.map((b) => b * c);
}

interface House { owner: FxCtx; lights: THREE.Light[]; base: number[]; k: number; spot: number; els: HTMLElement[] }
let house: House | null = null;

function houseLights(stage: Stage): THREE.Light[] {
  return stage.scene.children.filter((o): o is THREE.Light =>
    (o as THREE.HemisphereLight).isHemisphereLight || (o as THREE.DirectionalLight).isDirectionalLight);
}

function applyHouse(h: House): void {
  const lv = houseLevel(h.base, h.k);
  h.lights.forEach((l, i) => { l.intensity = lv[i]; });
  for (const e of h.els) e.style.filter = h.k >= 0.999 ? '' : `brightness(${h.k.toFixed(3)})`;
  if (rig) {
    rig.spot.intensity = SPOT_POWER * h.spot;
    // 光の円すいは、動きを減らす設定では出さない
    const beamOn = h.spot > 0.001 && h.owner.timing.camera;
    rig.beam.visible = beamOn;
    rig.beam.material.opacity = BEAM_OPACITY * h.spot;
  }
}

function aim(at: THREE.Vector3): void {
  if (!rig) return;
  const from = at.clone().add(SPOT_FROM);
  rig.spot.position.copy(from);
  rig.spot.target.position.copy(at);
  rig.beam.position.copy(from);
  rig.beam.lookAt(at);
  rig.beam.rotateX(-Math.PI / 2); // 円すいの軸（-y）を的へ向ける
}

/**
 * 暗転する（level は地明かりの残る割合）。spotAt があれば、そのマスにスポットライトを当てる。
 * 打ち切られていたら FxCancelled で止まる（ctx.tween と同じ）
 */
export async function darken(ctx: FxCtx, spotAt: THREE.Vector3 | null, ms = 600, level = 0.12): Promise<void> {
  if (!house && ctx.alive()) {
    const lights = houseLights(ctx.stage);
    const els = [document.getElementById('backdrop'), document.getElementById('ambient')].filter((e): e is HTMLElement => !!e);
    house = { owner: ctx, lights, base: lights.map((l) => l.intensity), k: 1, spot: 0, els };
  }
  if (house) house.owner = ctx;
  if (spotAt) aim(spotAt);
  const h = house;
  if (!h) return;
  const k0 = h.k, s0 = h.spot, s1 = spotAt ? 1 : 0;
  await ctx.tween(ms, (t) => {
    if (house !== h) return;
    h.k = k0 + (level - k0) * t;
    h.spot = s0 + (s1 - s0) * t;
    applyHouse(h);
  }, easeOut);
}

/** スポットライトだけ別のマスへ移す（暗転中だけ） */
export function moveSpot(ctx: FxCtx, at: THREE.Vector3): void {
  if (!ctx.alive() || !house || house.owner !== ctx) return;
  aim(at);
}

/** 暗転から明るさを戻す。暗転していなければ何もしない */
export async function brighten(ctx: FxCtx, ms = 600): Promise<void> {
  const h = house;
  if (!h || h.owner !== ctx) return;
  if (ctx.alive()) {
    const k0 = h.k, s0 = h.spot;
    try {
      await ctx.tween(ms, (t) => {
        if (house !== h) return;
        h.k = k0 + (1 - k0) * t;
        h.spot = s0 * (1 - t);
        applyHouse(h);
      }, easeInOut);
    } finally {
      lightsUp(ctx);
    }
  } else {
    lightsUp(ctx);
  }
}

/** すぐに元の明るさへ（演出の finally 用。暗転の持ち主のときだけ戻す） */
export function lightsUp(ctx: FxCtx): void {
  if (!house || house.owner !== ctx) return;
  const h = house;
  h.k = 1; h.spot = 0;
  applyHouse(h);
  house = null;
}

/** 暗転中か（試すとき・テスト用） */
export function isDark(): boolean {
  return house !== null;
}

// ---------- 点の光（稲妻・炎などで盤を照らす） ----------

/** at に点の光を灯す。power は「ふだんの設定」での強さ、reach は光の届く距離。動きを減らす設定では弱める */
export function pointLight(ctx: FxCtx, at: THREE.Vector3, power: number, color: number = PAL.mahouBolt, reach = 22): void {
  if (!rig || !ctx.alive()) return;
  rig.point.position.copy(at);
  rig.point.distance = reach;
  rig.point.color.setHex(color);
  rig.point.intensity = power * lightCap(ctx, 0.9) / 0.9;
}

export function pointOff(): void {
  if (rig) rig.point.intensity = 0;
}

// ---------- 時が止まる（3D の画面を白黒にする） ----------
let frozenCanvas: HTMLCanvasElement | null = null;

/** 時が止まる：k（0〜1）だけ白黒にして、少し硬い光にする。0 で戻す */
export function timeStop(ctx: FxCtx, k: number): void {
  const c = ctx.stage.canvas;
  if (k <= 0) { c.style.filter = ''; frozenCanvas = null; return; }
  if (!ctx.alive()) return; // 打ち切り後は止めない（戻すのはよい）
  c.style.filter = `grayscale(${k.toFixed(3)}) contrast(${(1 + 0.3 * k).toFixed(3)})`;
  frozenCanvas = c;
}

// ---------- 元に戻す約束（屋台崩しで崩した背景の絵など） ----------
const resetHooks = new Set<() => void>();

/** resetStagecraft のときに1回だけ呼ぶ後始末を預ける。戻り値を呼ぶと預けたものを取り消す */
export function onStageReset(fn: () => void): () => void {
  resetHooks.add(fn);
  return () => { resetHooks.delete(fn); };
}

/** 打ち切りのとき：暗転・スポットライト・点の光・時止めを必ず元に戻す（持ち主は問わない）。預かった後始末も呼ぶ */
export function resetStagecraft(): void {
  for (const fn of [...resetHooks]) {
    resetHooks.delete(fn);
    try { fn(); } catch (e) { console.error('演出の後始末に失敗しました', e); }
  }
  if (frozenCanvas) { frozenCanvas.style.filter = ''; frozenCanvas = null; }
  if (house) {
    const h = house;
    h.k = 1; h.spot = 0;
    applyHouse(h);
    house = null;
  }
  if (rig) {
    rig.spot.intensity = 0;
    rig.beam.visible = false;
    rig.point.intensity = 0;
  }
}

// ---------- カメラの構え ----------

/** 見ている側の手前の向き（先手は +z） */
function near(ctx: FxCtx): number {
  return ctx.me === 'sente' ? 1 : -1;
}

/** 低く横から：盤すれすれの高さで、的を横から見る */
export function cameraLow(ctx: FxCtx, at: THREE.Vector3, ms: number, side = -1): Promise<void> {
  const z = near(ctx);
  const pos = at.clone().add(new THREE.Vector3(3.1 * side * z, 1.25, 2.6 * z));
  return cameraMove(ctx, pos, at.clone().setY(0.35), ms, easeOut);
}

/** 引いて見上げる：的の上の空（雲や稲妻）が画面に入る角度 */
export function cameraLookUp(ctx: FxCtx, at: THREE.Vector3, ms: number): Promise<void> {
  const z = near(ctx);
  const pos = at.clone().add(new THREE.Vector3(1.4 * z, 2.6, 7.2 * z));
  return cameraMove(ctx, pos, at.clone().setY(1.5), ms, easeOut);
}

/** 真上寄り：的を上から大きく見る（落とし穴など、盤の面が主役のとき） */
export function cameraAbove(ctx: FxCtx, at: THREE.Vector3, ms: number): Promise<void> {
  const z = near(ctx);
  const pos = at.clone().add(new THREE.Vector3(0.3 * z, 5.6, 2.2 * z));
  return cameraMove(ctx, pos, at.clone().setY(0), ms, easeOut);
}

// ---------- 煙玉 ----------

/** 柔らかい丸の模様（中心が白く、ふちへ薄れる）。使うたびに作る（片付けで模様ごと捨てるため） */
export function softTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 煙玉：白い煙のかたまりがボンと広がり、ゆっくり薄れる。size で大きさ、life で消えるまでの長さ（ms） */
export function smokeBall(ctx: FxCtx, at: THREE.Vector3, size = 1, life = 1600, n = 18): void {
  const tex = softTexture();
  const g = new THREE.Group();
  const ps: { s: THREE.Sprite; v: THREE.Vector3; k: number }[] = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: i % 4 ? PAL.gofun : PAL.smokeShade, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    s.position.set(at.x, 0.3, at.z);
    const a = Math.random() * Math.PI * 2, sp = (0.5 + Math.random() * 1.1) * size;
    ps.push({ s, v: new THREE.Vector3(Math.cos(a) * sp, (0.5 + Math.random() * 1.2) * size, Math.sin(a) * sp), k: (0.28 + Math.random() * 0.3) * size });
    g.add(s);
  }
  const LIFE = life * Math.max(0.6, ctx.timing.scale);
  transient(ctx, g, LIFE, (dt, age) => {
    const t = Math.min(1, age / LIFE);
    for (const p of ps) {
      p.v.multiplyScalar(1 - dt * 2.6);
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.k * (1 + easeOut(t) * 1.5));
      p.s.material.opacity = 0.95 * (1 - t * t);
    }
  });
}
