// 足付きの盤・木目・マスの判定（タップ位置 → マス）・光るマス。
// 大きさ・色・木目の描き方は試作（docs/mockups/look-mockup.html）の値をそのまま使う。
import * as THREE from 'three';
import type { Square } from '../rules/types';
import type { Highlight } from './input';
import type { Stage } from './stage';
import { PAL, PALS, rgba } from './palette';
import { makeRng } from '../ai/random';

export const CW = 1, CD = 1.1;                 // マスの幅と奥行き
export const BW = 9.9, BD = 10.8, BH = 1.5;    // 盤の大きさ

/** マスの中心（盤の上面の高さ 0） */
export function squarePos(sq: Square): THREE.Vector3 {
  return new THREE.Vector3((sq.c - 4) * CW, 0, (sq.r - 4) * CD);
}

// 木目をキャンバスで描く（乱数は種付きで、毎回同じ木目になる）
function wood(rng: () => number, w: number, h: number, base: string, grain: number, n: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const y = rng() * h, a = 0.03 + rng() * 0.09;
    g.strokeStyle = rgba(grain, a); g.lineWidth = 0.6 + rng() * 2.6;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 24) g.lineTo(x, y + Math.sin(x * 0.006 + i) * 9 + (rng() - 0.5) * 2);
    g.stroke();
  }
  return c;
}

function boardTopTex(rng: () => number): THREE.CanvasTexture {
  const s = 100, c = wood(rng, BW * s, BD * s, PALS.kaya, PAL.kayaGrain, 140), g = c.getContext('2d')!;
  const mx = (BW - 9 * CW) / 2 * s, my = (BD - 9 * CD) / 2 * s;
  g.strokeStyle = rgba(PAL.sumi, 0.85); g.lineWidth = 2.4;
  for (let i = 0; i <= 9; i++) {
    g.beginPath(); g.moveTo(mx + i * CW * s, my); g.lineTo(mx + i * CW * s, my + 9 * CD * s); g.stroke();
    g.beginPath(); g.moveTo(mx, my + i * CD * s); g.lineTo(mx + 9 * CW * s, my + i * CD * s); g.stroke();
  }
  g.lineWidth = 5; g.strokeRect(mx, my, 9 * CW * s, 9 * CD * s);
  g.fillStyle = rgba(PAL.sumi, 0.9);
  for (const [i, j] of [[3, 3], [3, 6], [6, 3], [6, 6]]) { g.beginPath(); g.arc(mx + i * CW * s, my + j * CD * s, 7, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** 盤・脚・影を落とす床を舞台に置く（getStage から1回だけ呼ばれる） */
export function buildBoard(stage: Stage): void {
  const rng = makeRng(1);
  const topTex = boardTopTex(rng);
  const sideTex = new THREE.CanvasTexture(wood(rng, 1024, 160, PALS.kayaSide, PAL.kayaGrainDeep, 50));
  sideTex.colorSpace = THREE.SRGBColorSpace;
  const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.6 });
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.55 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
  board.position.y = -BH / 2; board.receiveShadow = true; board.castShadow = true;
  stage.scene.add(board);
  const legMat = new THREE.MeshStandardMaterial({ color: PAL.kayaLeg, roughness: 0.7 });
  const legGeo = new THREE.CylinderGeometry(0.75, 0.55, 1.3, 20);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(sx * (BW / 2 - 1.3), -BH - 0.65, sz * (BD / 2 - 1.3)); leg.castShadow = true;
    stage.scene.add(leg);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -BH - 1.3; floor.receiveShadow = true;
  stage.scene.add(floor);
  stage.onFrame((_dt, now) => {
    for (const p of pulses) p.mat.opacity = p.lo + (p.hi - p.lo) * (0.5 + 0.5 * Math.sin((now / 1000) * p.speed));
  });
}

// ---------- 小物（試作の ring / decal） ----------

/** 平らに寝かせた輪。segs を 6 にすると六角形 */
export function ring(inner: number, outer: number, color: number, segs = 40): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, segs),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** 256×256 のキャンバスに描いたものを、平らに寝かせた板にする */
export function decal(draw: (g: CanvasRenderingContext2D) => void, w: number, h: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** 物と、それが持つ形・材質・模様を片付ける */
export function disposeTree(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

// ---------- 点滅する目印 ----------
interface Pulse { mat: THREE.Material; lo: number; hi: number; speed: number }
const pulses = new Set<Pulse>();

/** 材質の透明度を lo〜hi で揺らす。戻り値で止める */
export function addPulse(mat: THREE.Material, lo: number, hi: number, speed: number): () => void {
  const p: Pulse = { mat, lo, hi, speed };
  pulses.add(p);
  return () => { pulses.delete(p); };
}

// ---------- タップ位置 → マス ----------
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
const TOP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);  // 盤の上面
const hitPt = new THREE.Vector3();

/** 画面の点が指す盤のマス。盤の上面の平面との交点から求めるので、駒に当たらなくても取れる */
export function squareAt(stage: Stage, clientX: number, clientY: number): Square | null {
  const b = stage.canvas.getBoundingClientRect();
  if (b.width === 0 || b.height === 0) return null;
  ptr.set(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
  stage.camera.updateMatrixWorld();
  ray.setFromCamera(ptr, stage.camera);
  if (!ray.ray.intersectPlane(TOP, hitPt)) return null;
  const c = Math.floor(hitPt.x / CW + 4.5);
  const r = Math.floor(hitPt.z / CD + 4.5);
  if (c < 0 || c > 8 || r < 0 || r > 8) return null;
  return { c, r };
}

// ---------- 光るマス ----------
let hlGroup: THREE.Group | null = null;
const hlStops: (() => void)[] = [];

function flat(geo: THREE.BufferGeometry, color: number, opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

function highlightMesh(kind: Highlight['kind']): THREE.Object3D {
  switch (kind) {
    case 'selected': {
      // 選んだ駒のマス：胡粉の太い枠（最後に動いたマスの薄い榧色と見分けられるように）
      const m = decal((g) => {
        g.fillStyle = rgba(PAL.gofun, 0.22); g.fillRect(0, 0, 256, 256);
        g.strokeStyle = rgba(PAL.gofun, 0.95); g.lineWidth = 22; g.strokeRect(11, 11, 234, 234);
      }, CW * 0.98, CD * 0.98);
      m.position.y = 0.005;
      return m;
    }
    case 'move': {
      // 動けるマス：藍の小さな丸
      const m = flat(new THREE.CircleGeometry(0.14, 24), PAL.mahou, 0.85);
      m.position.y = 0.012;
      return m;
    }
    case 'equipMove': {
      // 装備で増えた動き：墨の縁取りの金箔の六角形（色も形も変える。榧の盤に埋もれないよう縁を付ける）
      const g = new THREE.Group();
      const edge = flat(new THREE.CircleGeometry(0.22, 6), PAL.sumi, 0.85);
      edge.rotation.z = Math.PI / 2;
      edge.position.y = 0.011;
      const m = flat(new THREE.CircleGeometry(0.17, 6), PAL.soubi, 1);
      m.rotation.z = Math.PI / 2;
      m.position.y = 0.013;
      g.add(edge, m);
      return g;
    }
    case 'capture': {
      // 取れる駒：藍の輪で駒を囲む
      const m = ring(0.44, 0.55, PAL.mahou);
      m.material.opacity = 0.9;
      m.position.y = 0.012;
      return m;
    }
    case 'target': {
      // カードの対象：紅の輪が点滅する（試作の落雷の対象選び）
      const m = ring(0.46, 0.56, PAL.wana);
      m.position.y = 0.012;
      hlStops.push(addPulse(m.material, 0.25, 0.95, 6));
      return m;
    }
  }
}

/** 光るマスを置き直す。lastMove は最後に動いた駒のマス（薄い榧色） */
export function setHighlights(stage: Stage, hs: Highlight[], lastMove: Square[]): void {
  if (hlGroup) {
    stage.scene.remove(hlGroup);
    disposeTree(hlGroup);
    for (const stop of hlStops.splice(0)) stop();
  }
  hlGroup = new THREE.Group();
  for (const sq of lastMove) {
    const m = flat(new THREE.PlaneGeometry(CW * 0.98, CD * 0.98), PAL.kayaLight, 0.45);
    m.position.copy(squarePos(sq)).setY(0.003);
    hlGroup.add(m);
  }
  for (const h of hs) {
    const m = highlightMesh(h.kind);
    const p = squarePos(h.sq);
    m.position.x = p.x; m.position.z = p.z;
    hlGroup.add(m);
  }
  stage.scene.add(hlGroup);
}
