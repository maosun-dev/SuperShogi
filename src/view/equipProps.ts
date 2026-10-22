// 纏札の小さな物：退き陣の旗・天馬の蹄の跡・鋼の鎧の板・重りの鎖と鉄球・貫きの槍・韋駄天の炎。
// 盤の上にずっと出る印（pieces3d の makeEquip）と、札の演出（src/fx/cards）の両方で使う。
// 形は駒の組の中に置く前提で、駒の原点（足元の中心）から測る。駒の「後ろ」は +z（後手の駒は組ごと π 回る）。
// 模様：own が false なら使い回しの模様（盤の印用。捨てない）、true なら新しく作る（演出用。片付けで捨ててよい）
import * as THREE from 'three';
import { PAL, PALS, rgba } from './palette';

const shared = new Map<string, THREE.CanvasTexture>();

function texture(key: string, own: boolean, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  if (!own) {
    const hit = shared.get(key);
    if (hit) return hit;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (!own) shared.set(key, t);
  return t;
}

/** 退き陣の旗の模様：金の地に墨の下向きの山形2つ（札の絵と同じ） */
export function bannerTexture(own: boolean): THREE.CanvasTexture {
  return texture('banner', own, 64, 128, (g) => {
    g.fillStyle = PALS.soubi;
    g.beginPath(); g.moveTo(4, 4); g.lineTo(60, 4); g.lineTo(60, 112); g.quadraticCurveTo(46, 102, 32, 114); g.quadraticCurveTo(18, 124, 4, 114); g.closePath(); g.fill();
    g.strokeStyle = PALS.sumi; g.lineWidth = 6; g.stroke();
    g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const y of [30, 62]) { g.beginPath(); g.moveTo(14, y); g.lineTo(32, y + 16); g.lineTo(50, y); g.stroke(); }
  });
}

/** のぼり旗（竿と旗）。h は竿の長さ。旗の板は userData.flag（はためかせるため） */
export function banner(h: number, own: boolean): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, h, 6), new THREE.MeshStandardMaterial({ color: PAL.sumi, roughness: 0.6 }));
  pole.position.y = h / 2;
  const fw = h * 0.42, fh = h * 0.72;
  const geo = new THREE.PlaneGeometry(fw, fh, 6, 1);
  geo.translate(fw / 2, 0, 0); // 竿の側を原点に
  const flag = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: bannerTexture(own), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  flag.position.set(0.006, h - fh / 2 - 0.01, 0);
  g.add(pole, flag);
  g.userData.flag = flag;
  return g;
}

/** 旗をはためかせる（t は秒。amp は揺れの大きさ） */
export function flutter(flag: THREE.Mesh, t: number, amp = 1): void {
  const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
  const w = (flag.geometry as THREE.PlaneGeometry).parameters.width;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin(x / w * 5 - t * 7) * 0.03 * (x / w) * amp);
  }
  pos.needsUpdate = true;
}

/** 蹄の跡の模様（光る U の字） */
function hoofTexture(own: boolean): THREE.CanvasTexture {
  return texture('hoof', own, 64, 64, (g) => {
    g.shadowColor = rgba(PAL.soubiLight, 1); g.shadowBlur = 10;
    g.strokeStyle = rgba(PAL.soubiPale, 1); g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(32, 30, 17, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke();
    g.fillStyle = rgba(PAL.soubiPale, 1);
    for (const x of [18, 32, 46]) { g.beginPath(); g.arc(x, 14 + Math.abs(x - 32) * 0.4, 2.5, 0, Math.PI * 2); g.fill(); }
  });
}

/** 光る蹄の跡1つ（盤に寝かせた板）。size は一辺 */
export function hoofprint(size: number, own: boolean): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: hoofTexture(own), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** 鋼の鎧の板：鉄の板に鋲を2つ打った物。駒のわきに斜めに立てかけて使う（上から見ても板の面が見える） */
export function armorPlate(s: number): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: PAL.haganeSteel, emissive: PAL.yoruLight, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.26 * s, 0.56 * s), steel);
  plate.castShadow = true;
  g.add(plate);
  const rivet = new THREE.MeshStandardMaterial({ color: PAL.soubiLight, metalness: 0.8, roughness: 0.3 });
  for (const z of [-0.17, 0.17]) {
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.025 * s, 8, 6), rivet);
    r.position.set(0.03 * s, 0.04 * s, z * s);
    g.add(r);
  }
  return g;
}

/** 鎖（輪をつないだ物）。n 個の輪を半径 r の円に並べる */
export function chainRing(r: number, n: number, color: number = PAL.sumi): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.5 });
  const link = new THREE.TorusGeometry(0.05, 0.017, 6, 12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = new THREE.Mesh(i === 0 ? link : link.clone(), mat);
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.rotation.set(i % 2 ? Math.PI / 2 : 0, -a, 0);
    g.add(m);
  }
  return g;
}

/** 黒い鉄球 */
export function ironBall(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color: PAL.sumi, metalness: 0.5, roughness: 0.4 }));
  m.castShadow = true;
  return m;
}

/** 槍：細い柄と金の穂先。先が -z（駒の前）を向く。len は全長 */
export function spear(len: number): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len * 0.8, 6), new THREE.MeshStandardMaterial({ color: PAL.wanaDeep, roughness: 0.6 }));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = len * 0.1;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, len * 0.2, 4), new THREE.MeshStandardMaterial({ color: PAL.soubiLight, metalness: 0.8, roughness: 0.25 }));
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -len * 0.4;
  g.add(shaft, tip);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  return g;
}

/** 炎の模様（下が白く、上へ紅く細る） */
function flameTexture(own: boolean): THREE.CanvasTexture {
  return texture('flame', own, 32, 64, (g) => {
    const gr = g.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, rgba(PAL.soubiPale, 1)); gr.addColorStop(0.35, rgba(PAL.soubiLight, 0.95)); gr.addColorStop(0.75, rgba(PAL.wana, 0.8)); gr.addColorStop(1, rgba(PAL.wana, 0));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(16, 0); g.quadraticCurveTo(30, 34, 24, 56); g.quadraticCurveTo(16, 66, 8, 56); g.quadraticCurveTo(2, 34, 16, 0); g.fill();
  });
}

/** 小さな炎（いつも画面に向く板）。h は高さ */
export function flame(h: number, own: boolean): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(own), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(h * 0.5, h, 1);
  s.center.set(0.5, 0.05); // 足元を原点に
  return s;
}
