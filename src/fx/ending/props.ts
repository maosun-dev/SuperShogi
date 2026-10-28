// 大詰のエンディングの3Dの部品：回り舞台・札の板・定式幕・桜（設計書 docs/superpowers/specs/2026-10-28-kabuki-ending-design.md 5章）。
// 口上の紙・大入袋・役名の字は、くっきり読めるように画面の層（HTML）に出す（src/app/screens/ending.ts）
import * as THREE from 'three';
import type { CardId } from '../../rules/types';
import { CARDS } from '../../cards';
import { CARD_ART, KIND_MARK } from '../../view/cardArt';
import { PAL, PALS } from '../../view/palette';
import { petalTexture, type PetalShape } from '../kingfx/common';

/** 部品の後片付け：形・材質・模様を捨てる */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      (mat as THREE.MeshStandardMaterial).map?.dispose();
      mat.dispose();
    }
  });
  root.removeFromParent();
}

// ---------- 回り舞台 ----------

/** 床の板目：中心から放射に継ぎ目、細かな木目 */
function floorTexture(outer: number): THREE.CanvasTexture {
  const N = 1024;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = PALS.butaiWood; g.fillRect(0, 0, N, N);
  // 木目：細い同心の筋
  for (let r = 8; r < N / 2; r += 3 + (r * 7919) % 5) {
    g.strokeStyle = `rgba(40,22,10,${0.05 + ((r * 31) % 7) / 100})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(N / 2, N / 2, r, 0, Math.PI * 2); g.stroke();
  }
  // 板の継ぎ目：10度ごと
  g.strokeStyle = 'rgba(25,14,6,0.55)'; g.lineWidth = 2.5;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    g.beginPath(); g.moveTo(N / 2, N / 2); g.lineTo(N / 2 + Math.cos(a) * N, N / 2 + Math.sin(a) * N); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // 押し出した形の UV は形の座標そのまま（-outer〜outer）なので、0〜1 に合わせる
  t.repeat.set(1 / (2 * outer), 1 / (2 * outer));
  t.offset.set(0.5, 0.5);
  return t;
}

export interface Turntable { root: THREE.Group; ring: THREE.Group; setTurn(rad: number): void; dispose(): void }

/**
 * 回り舞台：盤のまわりを囲む輪の床（inner〜outer）。ring に乗せたもの（札の板）が一緒に回る。
 * 盤と駒は真ん中に動かずに残す（対局の盤をそのまま使うため）
 */
export function makeTurntable(inner: number, outer: number, y: number): Turntable {
  const root = new THREE.Group();
  const ring = new THREE.Group();
  root.add(ring);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false, curveSegments: 96 });
  const floor = new THREE.Mesh(geo, [
    new THREE.MeshStandardMaterial({ map: floorTexture(outer), roughness: 0.78 }),
    new THREE.MeshStandardMaterial({ color: PAL.joshikiKuro, roughness: 0.6 }),
  ]);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y - 0.35;
  ring.add(floor);
  // 外の縁に金の細い輪
  const rim = new THREE.Mesh(new THREE.TorusGeometry(outer, 0.05, 6, 160), new THREE.MeshStandardMaterial({ color: PAL.soubi, metalness: 0.6, roughness: 0.35 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = y;
  ring.add(rim);
  return {
    root, ring,
    setTurn(rad) { ring.rotation.y = rad; },
    dispose() { disposeTree(root); },
  };
}

// ---------- 札の板 ----------

const ST_W = 1.6, ST_H = 2.4; // 札の板の幅と高さ（札の 46:62 に近い縦長）

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('札の絵を読めませんでした'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** 札の表：胡粉の地に種類の色の縁、金の細い縁、札の絵、下に札の名 */
async function standeeTexture(id: CardId): Promise<THREE.CanvasTexture> {
  const W = 320, H = 480;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const kind = KIND_MARK[CARDS[id].kind];
  g.fillStyle = PALS[kind.color]; g.fillRect(0, 0, W, H);
  g.fillStyle = PALS.soubi; g.fillRect(10, 10, W - 20, H - 20);
  g.fillStyle = PALS.gofun; g.fillRect(16, 16, W - 32, H - 32);
  const art = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 62">${CARD_ART[id]}</svg>`);
  g.drawImage(art, 40, 40, W - 80, (W - 80) * 62 / 46);
  g.fillStyle = PALS.sumi;
  g.font = '700 40px "Yuji Boku", "Shippori Mincho B1", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(CARDS[id].name, W / 2, H - 58, W - 40);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Standee { id: CardId; root: THREE.Group; dispose(): void }

/** 札の板：札の表を貼った板を、下の台に立てる。root の前（+z）が札の表 */
export async function makeStandee(id: CardId): Promise<Standee> {
  const root = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(ST_W, ST_H, 0.06),
    [
      new THREE.MeshStandardMaterial({ color: PAL.soubi, metalness: 0.5, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: PAL.soubi, metalness: 0.5, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: PAL.soubi, metalness: 0.5, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: PAL.soubi, metalness: 0.5, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ map: await standeeTexture(id), roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: PAL.joshikiKuro, roughness: 0.8 }),
    ],
  );
  face.position.y = ST_H / 2 + 0.12;
  root.add(face);
  const base = new THREE.Mesh(new THREE.BoxGeometry(ST_W * 0.7, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: PAL.joshikiKuro, roughness: 0.6 }));
  base.position.y = 0.06;
  root.add(base);
  return { id, root, dispose() { disposeTree(root); } };
}

// ---------- 定式幕 ----------

/** 画面の層（HTML）で描く定式幕の縞（左右1枚ずつ、それぞれの左の端から黒・柿・萌葱）。大見得で閉める幕と、エンディングの最初の覆いで同じものを使う */
export function makuStripesCss(): string {
  return `repeating-linear-gradient(90deg, ${PALS.joshikiKuro} 0 9%, ${PALS.joshikiKaki} 9% 18%, ${PALS.joshikiMoegi} 18% 27%)`;
}

/** 閉まった定式幕の層（左右2枚。width 51% ずつで真ん中を少し重ねる）。z は重なりの順 */
export function closedMakuEl(z: number): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${z}`;
  for (const left of [true, false]) {
    const e = document.createElement('div');
    e.style.cssText = `position:absolute;top:0;bottom:0;width:51%;${left ? 'left:0' : 'right:0'};background:${makuStripesCss()}`;
    box.append(e);
  }
  return box;
}

/** 縦縞（黒・柿・萌葱）の布の模様。stripes は縞の本数 */
function curtainTexture(stripes: number): THREE.CanvasTexture {
  const W = 64 * stripes, H = 8;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const cols = [PALS.joshikiKuro, PALS.joshikiKaki, PALS.joshikiMoegi];
  for (let i = 0; i < stripes; i++) { g.fillStyle = cols[i % 3]; g.fillRect(i * 64, 0, 64, H); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Curtain { root: THREE.Group; setOpen(t: number): void; sway(now: number): void; dispose(): void }

/**
 * 定式幕：左右2枚の布。setOpen(0)＝閉じている、1＝開ききって両脇に寄っている。
 * sway で布をゆらし、寄るほどひだを深くする。root は幕の真ん中（布の面が xy、手前が +z）
 */
export function makeCurtain(width: number, height: number): Curtain {
  const root = new THREE.Group();
  const half = width / 2;
  const SEG = 48;
  // 1枚は半分より少し広くし、閉じたとき真ん中で重ねる（突き合わせだと、揺れで合わせ目に隙間がちらつく。2026-10-28）
  const pw = half * 1.08;
  const panels = [-1, 1].map((side) => {
    const geo = new THREE.PlaneGeometry(pw, height, SEG, 1);
    // 光を受けない材質：大見得の終わりに閉めた幕（画面の層の縞）と同じ色に見せる。
    // 幕はいつもいちばん手前なので、奥行きを比べずに後から描く（重なりのちらつきを出さない）
    // 半透明の組（盤など）より後に描くため、幕も半透明の組に入れて描く順を最後にする
    const mat = new THREE.MeshBasicMaterial({ map: curtainTexture(7), side: THREE.DoubleSide, depthTest: false, depthWrite: false, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1000 + side;
    root.add(mesh);
    return { side, mesh, base: Float32Array.from(geo.attributes.position.array as Float32Array) };
  });
  let open = 0;
  const place = (): void => {
    const s = 1 - 0.86 * open; // 寄ったときの幅の割合
    for (const p of panels) {
      p.mesh.scale.x = s;
      // 外の端は動かさず、内の端が外へ寄る
      p.mesh.position.x = p.side * (half - (pw * s) / 2);
    }
  };
  place();
  return {
    root,
    setOpen(t) { open = Math.min(1, Math.max(0, t)); place(); },
    sway(now) {
      const amp = 0.06 + 0.32 * open; // 寄るほど、ひだが深い
      for (const p of panels) {
        const pos = p.mesh.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = p.base[i * 3];
          pos.setZ(i, Math.sin(x * 5.5 + now * 0.0016 + p.side) * amp + Math.sin(x * 1.7 - now * 0.0009) * 0.05);
        }
        pos.needsUpdate = true;
        p.mesh.geometry.computeVertexNormals();
      }
    },
    dispose() { disposeTree(root); },
  };
}

// ---------- 桜 ----------

/** update の dt は秒 */
export interface Petals { root: THREE.Group; setAmount(k: number): void; update(dt: number): void; dispose(): void }

/**
 * 舞台に降る桜（アイコンと同じ形の花びらと花）。setAmount(0〜1) で降る量を変える（0.15＝ちらほら、1＝一気に）。
 * 花びらは center のまわり radius の中を、高さ height から舞い落ちる
 */
export function makePetals(center: THREE.Vector3, radius: number, height: number, max = 260): Petals {
  const root = new THREE.Group();
  root.position.copy(center);
  const looks: [string, PetalShape][] = [[PALS.sakura, 'notch'], [PALS.gofun, 'notch'], [PALS.sakura, 'blossom'], [PALS.wana, 'petal']];
  const mats = looks.map(([c, sh]) => new THREE.MeshBasicMaterial({ map: petalTexture(c, sh), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  const geo = new THREE.PlaneGeometry(0.26, 0.26);
  const items: { m: THREE.Mesh; vy: number; spin: number; phase: number }[] = [];
  const respawn = (m: THREE.Mesh, top: boolean): void => {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    m.position.set(Math.cos(a) * r, top ? height * (0.8 + Math.random() * 0.4) : Math.random() * height, Math.sin(a) * r);
  };
  for (let i = 0; i < max; i++) {
    const m = new THREE.Mesh(geo, mats[i % mats.length]);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    m.scale.setScalar(0.7 + Math.random() * 0.8);
    respawn(m, false);
    m.visible = false;
    root.add(m);
    items.push({ m, vy: 0.6 + Math.random() * 0.7, spin: (Math.random() - 0.5) * 3, phase: Math.random() * 6 });
  }
  let amount = 0;
  let t = 0;
  return {
    root,
    setAmount(k) { amount = Math.min(1, Math.max(0, k)); },
    update(dt) {
      t += dt;
      const shown = Math.round(items.length * amount);
      items.forEach((it, i) => {
        const on = i < shown;
        if (on && !it.m.visible) respawn(it.m, false); // 増えたぶんは、見えている高さのあちこちから舞い始める
        it.m.visible = on;
        if (!on) return;
        it.m.position.y -= it.vy * dt;
        it.m.position.x += Math.sin(t * 1.3 + it.phase) * 0.4 * dt;
        it.m.rotation.x += it.spin * dt;
        it.m.rotation.z += it.spin * 0.7 * dt;
        if (it.m.position.y < -height * 0.15) respawn(it.m, true);
      });
    },
    dispose() {
      geo.dispose();
      for (const m of mats) { m.map?.dispose(); m.dispose(); }
      root.removeFromParent();
    },
  };
}
