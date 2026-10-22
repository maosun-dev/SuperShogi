// 層2：盤の下に置く舞台ごとの床と光。歌舞伎＝檜の板と光だまり、浮世絵＝雲の上、金屏風＝畳。
// 床の縁は透明へぼかし、全画面の背景の絵（層0）になじませる。光（半球光・日の光）の色も舞台ごとに替える。
import * as THREE from 'three';
import type { StageId } from '../app/storage';
import { BH } from './board3d';
import type { Stage } from './stage';

const FLOOR_Y = -BH - 1.3 + 0.01;   // 影を落とす床のすぐ上
const SIZE = 26;                      // 床の板の大きさ（盤のまわりを広く覆う）

interface Look { sky: number; ground: number; hemi: number; sun: number; sunPower: number }
const LOOKS: Record<StageId, Look> = {
  kabuki: { sky: 0xfff0d8, ground: 0x8a5a30, hemi: 1.15, sun: 0xffefd2, sunPower: 2.0 },
  ukiyoe: { sky: 0xf4fbff, ground: 0x9ec8dc, hemi: 1.25, sun: 0xfff8ec, sunPower: 1.9 },
  byobu: { sky: 0xfff6e2, ground: 0xb5a46a, hemi: 1.2, sun: 0xfff1d6, sunPower: 1.8 },
};

/** 正方形のキャンバスに描き、縁を透明へぼかす */
function fadedCanvas(draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas'); c.width = s; c.height = s;
  const g = c.getContext('2d')!;
  draw(g, s);
  // 真ん中は残し、縁ほど透明に
  g.globalCompositeOperation = 'destination-in';
  const r = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(0,0,0,1)');
  r.addColorStop(0.7, 'rgba(0,0,0,.75)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function kabukiFloor(g: CanvasRenderingContext2D, s: number): void {
  // 檜の板（奥へ向かう板目）と、真ん中の暖かい光だまり
  const cols = ['#EBCB93', '#E2BE80', '#EFD3A1', '#DDB577'];
  const w = s / 12;
  for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 4]; g.fillRect(i * w, 0, w, s); }
  g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 2;
  for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, s); g.stroke(); }
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.42);
  r.addColorStop(0, 'rgba(255,246,220,.75)');
  r.addColorStop(1, 'rgba(255,246,220,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
}

function ukiyoeFloor(g: CanvasRenderingContext2D, s: number): void {
  // 雲の上：白い玉を重ね、墨の輪郭を少しだけ
  g.fillStyle = 'rgba(252,248,238,0)'; g.fillRect(0, 0, s, s);
  const puffs: [number, number, number][] = [];
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2, d = s * (0.26 + 0.1 * Math.sin(k * 2.3));
    puffs.push([s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.07 + 0.03 * Math.sin(k * 1.7))]);
  }
  g.lineWidth = 3; g.strokeStyle = 'rgba(29,26,23,.55)';
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
  g.fillStyle = '#FCF8EE';
  for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x, y, r - 1.5, 0, 7); g.fill(); }
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.3, 0, 7); g.fill();
}

function byobuFloor(g: CanvasRenderingContext2D, s: number): void {
  // 畳（い草の細い縞）と黒い縁
  g.fillStyle = '#CFC98F'; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(150,140,80,.25)';
  for (let x = 0; x < s; x += 6) g.fillRect(x, 0, 2, s);
  g.fillStyle = '#22301F';
  for (const p of [0.18, 0.5, 0.82]) { g.fillRect(0, s * p - 5, s, 10); }
  g.fillRect(s / 2 - 5, 0, 10, s);
}

const DRAW: Record<StageId, (g: CanvasRenderingContext2D, s: number) => void> = {
  kabuki: kabukiFloor, ukiyoe: ukiyoeFloor, byobu: byobuFloor,
};

/** 舞台の床と光を替える（前の床は片付ける） */
export function setStageLook(stage: Stage, id: StageId): void {
  const old = stage.scene.getObjectByName('stage-floor') as THREE.Mesh | undefined;
  if (old) {
    stage.scene.remove(old);
    old.geometry.dispose();
    const m = old.material as THREE.MeshStandardMaterial;
    m.map?.dispose();
    m.dispose();
  }
  const mat = new THREE.MeshStandardMaterial({ map: fadedCanvas(DRAW[id]), transparent: true, roughness: 0.85, depthWrite: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), mat);
  floor.name = 'stage-floor';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y - 0.02;
  floor.renderOrder = -1;
  stage.scene.add(floor);
  const look = LOOKS[id];
  stage.scene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight) { o.color.setHex(look.sky); o.groundColor.setHex(look.ground); o.intensity = look.hemi; }
    if (o instanceof THREE.DirectionalLight) { o.color.setHex(look.sun); o.intensity = look.sunPower; }
  });
}
