// 王を取る・取られる演出（3案）で共通に使う道具：取る駒の動き・時止め・木っ端・花びら・衝撃の輪・周りの駒が跳ねる・
// 残像・画面を走る一閃・字の板・駒の半分（切り口）。
// 決まり（kit.ts と同じ）：舞台は直接さわらず ctx.tween / ctx.wait / transient / shakeBy / flash を通す。
// 駒の材質は全駒で共有なので、色や透明度を変えるときは必ず複製する
import * as THREE from 'three';
import type { Square } from '../../rules/types';
import { PAL, PALS } from '../../view/palette';
import { pieceMesh } from '../../view/pieces3d';
import { animateEl, easeOut, overlay, transient, type FxCtx } from '../kit';
import { timeStop } from '../stagecraft';
import { getSound } from '../sound';
import { TITLE_EM } from '../../app/titleGlyphs';

/** 王を取る一手の材料（finale.ts が作って各案へ渡す） */
export interface KingCapture {
  kingAt: Square;
  at: THREE.Vector3;                  // 王のマスの中心（盤の上面）
  kingId: number | null;
  king: THREE.Object3D | undefined;   // 取られる王
  takerId: number | null;
  taker: THREE.Object3D | undefined;  // 取る駒（まだ元のマスにいる）
  from: THREE.Vector3 | null;         // 取る駒の元の位置
  fromY: number;                      // 取る駒の今の高さ（自分で選んだ駒は「選んだしるし」で浮いている）
  takerY: number;                     // 取る駒を置く高さ（盤の上の決まった高さ PIECE_Y）
  takerRot: THREE.Euler | null;       // 取る駒のもとの向き
  win: boolean;                       // 見ている側の勝ち（どの案も流れは同じ。音の大きさなどにだけ使ってよい）
}

/** 案ごとの流れ。終わったら王は消え（visible=false）、取る駒は王のマスに置かれている（settleTaker）こと */
export type KingFxPlay = (ctx: FxCtx, k: KingCapture) => Promise<void>;

/** 見ている側の手前の向き（先手は +z） */
export function nearZ(ctx: FxCtx): number {
  return ctx.me === 'sente' ? 1 : -1;
}

/** 王手の輪・纏札の印は駒と一緒に動かさない */
export function hideDecor(obj: THREE.Object3D | undefined): void {
  if (obj) for (const c of obj.children.slice(2)) c.visible = false;
}

/** 取る駒を、元の位置→王のマスへ t（0〜1）だけ進める。arc は弧の高さ。浮いていた高さから盤の高さへ下りる */
export function takerAlong(k: KingCapture, t: number, arc = 0.36): void {
  if (!k.taker || !k.from) return;
  k.taker.position.set(
    k.from.x + (k.at.x - k.from.x) * t,
    k.fromY + (k.takerY - k.fromY) * t + Math.sin(Math.PI * t) * arc,
    k.from.z + (k.at.z - k.from.z) * t,
  );
}

/** 取る駒を王のマスにまっすぐ置き直す */
export function settleTaker(k: KingCapture): void {
  if (!k.taker) return;
  k.taker.position.set(k.at.x, k.takerY, k.at.z);
  if (k.takerRot) k.taker.rotation.copy(k.takerRot);
}

/** 時が止まる：色が抜けて ms のあいだ止まり、戻る。sound で拍子木を1つ */
export async function freezeFrame(ctx: FxCtx, ms: number, sound = true): Promise<void> {
  if (sound) getSound().play('hyoshigi', { gain: 0.7 });
  try {
    await ctx.tween(90, (t) => timeStop(ctx, 0.9 * t));
    await ctx.wait(Math.max(0, ms - 180));
    await ctx.tween(90, (t) => timeStop(ctx, 0.9 * (1 - t)));
  } finally {
    timeStop(ctx, 0);
  }
}

/** 駒の木と字の材質の複製（透明にできるもの） */
function cloneMats(obj: THREE.Object3D): { body: THREE.MeshStandardMaterial; label: THREE.MeshStandardMaterial | null } {
  const body = ((obj.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).clone();
  body.transparent = true;
  const lm = (obj.children[1] as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
  const label = lm ? lm.clone() : null;
  if (label) label.transparent = true;
  return { body, label };
}

/**
 * 木っ端みじん：王を消し、木のかけらを四方へ飛ばす。字の付いた大きな欠片がくるくる回って高く上がる。
 * power で飛ぶ強さ（1 がふつう）
 */
export function woodBurst(ctx: FxCtx, k: KingCapture, power = 1): void {
  const king = k.king;
  if (!king) return;
  const s = (king.userData.s as number | undefined) ?? 1;
  const at = king.position.clone();
  const { body, label } = cloneMats(king);
  king.visible = false;
  const dark = new THREE.MeshStandardMaterial({ color: PAL.kayaGrain, roughness: 0.8, transparent: true });
  const grp = new THREE.Group();
  const frags: { m: THREE.Object3D; v: THREE.Vector3; av: THREE.Vector3 }[] = [];
  const N = 46;
  for (let i = 0; i < N; i++) {
    // くさび形のかけら（木を割ったときの鋭い形）
    const w = (0.06 + Math.random() * 0.2) * s, h = (0.04 + Math.random() * 0.1) * s, d = (0.05 + Math.random() * 0.24) * s;
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, i % 6 === 0 ? dark : body);
    m.castShadow = true;
    m.position.set(at.x + (Math.random() - 0.5) * 0.4 * s, at.y + 0.12, at.z + (Math.random() - 0.5) * 0.4 * s);
    grp.add(m);
    const a = Math.random() * Math.PI * 2, sp = (2.5 + Math.random() * 5) * power;
    frags.push({
      m, v: new THREE.Vector3(Math.cos(a) * sp, (3 + Math.random() * 7) * power, Math.sin(a) * sp),
      av: new THREE.Vector3(Math.random() * 24 - 12, Math.random() * 24 - 12, Math.random() * 24 - 12),
    });
  }
  // 字の付いた欠片：駒の字の板の複製を、木の小さな板に貼って高く飛ばす
  if (label) {
    const chip = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.06, 0.48 * s), body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * s, 0.625 * s), label);
    face.rotation.x = -Math.PI / 2; face.position.y = 0.035;
    chip.add(wood, face);
    chip.position.set(at.x, at.y + 0.2, at.z);
    grp.add(chip);
    frags.push({ m: chip, v: new THREE.Vector3((Math.random() - 0.5) * 2, 11 * power, (Math.random() - 0.5) * 2), av: new THREE.Vector3(9, 4, 13) });
  }
  const LIFE = 3600;
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const f of frags) {
      f.v.y -= 20 * dt;
      f.m.position.addScaledVector(f.v, dt);
      if (f.m.position.y < 0.05) { f.m.position.y = 0.05; f.v.y *= -0.3; f.v.x *= 0.7; f.v.z *= 0.7; f.av.multiplyScalar(0.6); }
      f.m.rotation.x += f.av.x * dt; f.m.rotation.y += f.av.y * dt; f.m.rotation.z += f.av.z * dt;
    }
    const fade = Math.min(1, Math.max(0, (LIFE - age) / 800));
    body.opacity = fade; dark.opacity = fade;
    if (label) label.opacity = fade;
  });
  sparks(ctx, at, PAL.soubiPale, 140, 8 * power);
}

/** 火花（加算の点）。色と数と速さを変えて使う */
export function sparks(ctx: FxCtx, at: THREE.Vector3, color: number, n = 120, speed = 7, life = 1300): void {
  const geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    arr.set([at.x, at.y + 0.25, at.z], i * 3);
    v.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8)));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color, size: 0.12, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  transient(ctx, new THREE.Points(geo, pm), life, (dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      v[i].y -= 9 * dt;
      v[i].multiplyScalar(1 - dt * 0.8);
      pos.setXYZ(i, pos.getX(i) + v[i].x * dt, Math.max(0.03, pos.getY(i) + v[i].y * dt), pos.getZ(i) + v[i].z * dt);
    }
    pos.needsUpdate = true;
    pm.opacity = Math.max(0, 1 - age / life);
  });
}

/**
 * 花びら・紙吹雪の模様（色ごとに作る）。notch と blossom はアプリのアイコン（振袖の柄）の桜と同じ形：
 * 先に切れ込みのある花びらに紅の縁、blossom は5枚の花と金のしべ
 */
export type PetalShape = 'petal' | 'paper' | 'notch' | 'blossom';
function petalTexture(color: string, shape: PetalShape): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  // アイコンの桜の花びら（tools/icon/furisode.mjs の sakura と同じ式）。原点が付け根、-y が先
  const notch = (r: number): void => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-0.62 * r, -0.3 * r, -0.55 * r, -0.98 * r, -0.16 * r, -r);
    g.lineTo(0, -0.82 * r);
    g.lineTo(0.16 * r, -r);
    g.bezierCurveTo(0.55 * r, -0.98 * r, 0.62 * r, -0.3 * r, 0, 0);
    g.closePath();
    g.fillStyle = color; g.fill();
    g.lineWidth = Math.max(1.5, r * 0.07); g.lineJoin = 'round'; g.strokeStyle = PALS.wanaDeep; g.stroke();
  };
  g.save();
  if (shape === 'paper') { g.fillStyle = color; g.fillRect(12, 20, 40, 24); }
  else if (shape === 'petal') {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(60, 20, 52, 56, 32, 60); g.bezierCurveTo(12, 56, 4, 20, 32, 4); g.fill();
  } else if (shape === 'notch') {
    g.translate(32, 60); notch(56);
  } else {
    g.translate(32, 32);
    for (let i = 0; i < 5; i++) { g.save(); g.rotate((i * 2 * Math.PI) / 5); notch(29); g.restore(); }
    g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fillStyle = PALS.soubi; g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface PetalOpts {
  colors: string[];
  shape?: PetalShape;
  /** shape に加えて混ぜる形（アイコンの桜の花をまぜるなど）。colors と同じ順に交互に使う */
  shapes?: PetalShape[];
  n?: number;
  size?: number;
  life?: number;
  /** burst：center から噴き出す／rain：area（盤の真ん中からの半径）の上から降る／swirl：center のまわりを渦を巻いて昇る */
  mode: 'burst' | 'rain' | 'swirl';
  center?: THREE.Vector3;
  area?: number;
  height?: number;
  power?: number;
}

/** 花びら・紙吹雪。噴き出す（切り口から）か、上から降りそそぐ（花火のあと） */
export function petalStorm(ctx: FxCtx, o: PetalOpts): void {
  const n = o.n ?? 80, size = o.size ?? 0.18, life = o.life ?? 3000, power = o.power ?? 1;
  const c = o.center ?? new THREE.Vector3();
  const shapes = o.shapes ?? [o.shape ?? 'petal'];
  const mats = o.colors.flatMap((col) => shapes.map((sh) => new THREE.MeshBasicMaterial({ map: petalTexture(col, sh), transparent: true, side: THREE.DoubleSide, depthWrite: false })));
  const geo = new THREE.PlaneGeometry(size, size);
  const grp = new THREE.Group();
  const ps: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; ph: number; born: number; r: number; a: number }[] = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mats[i % mats.length]);
    let v: THREE.Vector3;
    let born = 0;
    const ring = 0.5 + Math.random() * (o.area ?? 1.4), ang = Math.random() * Math.PI * 2;
    if (o.mode === 'swirl') {
      m.position.set(c.x + Math.cos(ang) * ring, c.y + Math.random() * 0.4, c.z + Math.sin(ang) * ring);
      v = new THREE.Vector3(0, (0.9 + Math.random() * 1.6) * power, 0);
      born = Math.random() * life * 0.3;
    } else if (o.mode === 'burst') {
      m.position.set(c.x + (Math.random() - 0.5) * 0.5, c.y + 0.3 + Math.random() * 0.5, c.z + (Math.random() - 0.5) * 0.5);
      const a = Math.random() * Math.PI * 2, sp = (1 + Math.random() * 2.6) * power;
      v = new THREE.Vector3(Math.cos(a) * sp, (1.4 + Math.random() * 2.8) * power, Math.sin(a) * sp);
    } else {
      const r = (o.area ?? 5) * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      m.position.set(c.x + Math.cos(a) * r, (o.height ?? 7) + Math.random() * 3, c.z + Math.sin(a) * r);
      v = new THREE.Vector3((Math.random() - 0.5) * 0.4, -(1.1 + Math.random() * 0.9), (Math.random() - 0.5) * 0.4);
      born = Math.random() * life * 0.35;
    }
    m.visible = born === 0;
    grp.add(m);
    ps.push({ m, v, spin: new THREE.Vector3(Math.random() * 7, Math.random() * 7, Math.random() * 7), ph: Math.random() * 6, born, r: ring, a: ang });
  }
  transient(ctx, grp, life, (dt, age) => {
    const fade = Math.min(1, (life - age) / 700);
    for (const p of ps) {
      if (age < p.born) continue;
      p.m.visible = true;
      if (o.mode === 'swirl') {
        // 渦：角を進めながら少しずつ外へ広がって昇る
        p.a += dt * (2.6 + 1.2 / p.r) * power;
        p.r += dt * 0.25;
        p.m.position.set(c.x + Math.cos(p.a) * p.r, p.m.position.y + p.v.y * dt, c.z + Math.sin(p.a) * p.r);
        p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt; p.m.rotation.z += p.spin.z * dt;
        continue;
      }
      if (o.mode === 'burst') { p.v.multiplyScalar(1 - dt * 1.6); p.v.y -= 0.7 * dt; }
      p.m.position.addScaledVector(p.v, dt);
      p.m.position.x += Math.sin(age / 240 + p.ph) * 0.006;
      p.m.position.y = Math.max(0.04, p.m.position.y);
      if (p.m.position.y > 0.05) { p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt; p.m.rotation.z += p.spin.z * dt; }
    }
    for (const m of mats) m.opacity = fade;
  });
}

/** 衝撃の輪：盤の面を走って広がる白い輪（2重） */
export function shockRing(ctx: FxCtx, at: THREE.Vector3, color: number = PAL.gofun, reach = 7, life = 700): void {
  for (const [delay, w] of [[0, 0.16], [110, 0.08]] as const) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - w, 1, 64), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, 0.04, at.z);
    m.scale.setScalar(0.01);
    transient(ctx, m, life + delay, (_dt, age) => {
      const t = Math.max(0, Math.min(1, (age - delay) / life));
      m.scale.setScalar(0.2 + reach * easeOut(t));
      mat.opacity = t <= 0 ? 0 : 0.9 * (1 - t);
    });
  }
}

/**
 * 周りの駒が跳ねる：王のマスから近い順に少し遅れて跳ね上がり、くるっと傾いて戻る。
 * radius マスより遠い駒・取る駒・王は動かさない。終わったら（打ち切りでも）高さと向きを元に戻す
 */
export async function bounceNeighbors(ctx: FxCtx, k: KingCapture, radius = 3.2, ms = 700): Promise<void> {
  const list: { o: THREE.Object3D; y: number; rx: number; rz: number; d: number }[] = [];
  for (const p of ctx.before.board) {
    if (!p || p.id === k.kingId || p.id === k.takerId) continue;
    const o = pieceMesh(p.id);
    if (!o || !o.visible) continue;
    const d = Math.hypot(o.position.x - k.at.x, o.position.z - k.at.z);
    if (d <= radius) list.push({ o, y: o.position.y, rx: o.rotation.x, rz: o.rotation.z, d });
  }
  try {
    await ctx.tween(ms, (t) => {
      for (const b of list) {
        const lag = (b.d / radius) * 0.35;
        const u = Math.max(0, Math.min(1, (t - lag) / (1 - 0.35)));
        const hop = Math.sin(Math.PI * u) * (0.55 - 0.1 * b.d) ;
        b.o.position.y = b.y + Math.max(0, hop);
        b.o.rotation.x = b.rx + Math.sin(Math.PI * u) * 0.35 * Math.sign(b.o.position.z - k.at.z || 1);
        b.o.rotation.z = b.rz - Math.sin(Math.PI * u) * 0.35 * Math.sign(b.o.position.x - k.at.x || 1);
      }
    });
  } finally {
    for (const b of list) { b.o.position.y = b.y; b.o.rotation.x = b.rx; b.o.rotation.z = b.rz; }
  }
}

/** 残像：駒の形の白い影を置き、すっと消す */
export function ghost(ctx: FxCtx, obj: THREE.Object3D, opacity = 0.5, life = 420): void {
  const s = (obj.userData.s as number | undefined) ?? 1;
  const mat = new THREE.MeshBasicMaterial({ color: PAL.gofun, transparent: true, opacity, depthWrite: false });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.18 * s, 0.72 * s), mat);
  m.position.copy(obj.position).setY(obj.position.y + 0.09 * s);
  m.rotation.copy(obj.rotation);
  transient(ctx, m, life, (_dt, age) => { mat.opacity = opacity * (1 - age / life); });
}

/** 画面を斜めに走る一閃（重ね板の SVG）。白い太い線が一気に伸び、細くなって消える */
export async function screenSlash(ctx: FxCtx, angle = -28, color: string = PALS.hakkou): Promise<void> {
  const L = overlay(ctx);
  const box = document.createElement('div');
  box.className = 'king-slash';
  box.innerHTML = `<svg viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid slice"><g transform="rotate(${angle})">`
    + `<polygon points="-700,-7 700,-2 700,2 -700,7" fill="${color}"/>`
    + `<polygon points="-700,-22 700,-4 700,4 -700,22" fill="${color}" opacity=".35"/></g></svg>`;
  L.append(box);
  try {
    await animateEl(ctx, box, [
      { clipPath: 'inset(0 100% 0 0)', opacity: 1 },
      { offset: 0.3, clipPath: 'inset(0 0 0 0)', opacity: 1, transform: 'scaleY(1)' },
      { clipPath: 'inset(0 0 0 0)', opacity: 0, transform: 'scaleY(0.15)' },
    ], { duration: 520 * ctx.timing.scale, easing: 'ease-out' });
  } finally {
    box.remove();
  }
}

/**
 * 筆の字の板（Sprite）：花火の真ん中に浮かぶ題字の「傾」（題字と同じ衡山の形。titleGlyphs）。
 * edge があれば縁取り、side があれば右下へ厚み（側面）を付けて立体に見せる。題字と同じく線を足して太らせる
 */
export function glyphSprite(path: string, color: string, size: number, edge?: string, side?: string): THREE.Sprite {
  const N = 384;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  const pad = 110;
  g.scale(N / (TITLE_EM + pad * 2), N / (TITLE_EM + pad * 2));
  g.translate(pad, pad);
  const p2 = new Path2D(path);
  g.lineJoin = 'round';
  // 厚み：少しずつずらして側面の色で重ね塗り（奥ほど暗く）
  if (side) {
    const STEPS = 16;
    for (let i = STEPS; i >= 1; i--) {
      g.save();
      g.translate(i * 2.4, i * 3.4);
      g.fillStyle = side; g.strokeStyle = side; g.lineWidth = edge ? 46 : 22;
      g.globalAlpha = 0.55 + 0.45 * (1 - i / STEPS);
      g.fill(p2); g.stroke(p2);
      g.restore();
    }
  }
  // 縁取り：太い線を先に引いてから、字の色で塗る
  if (edge) { g.strokeStyle = edge; g.lineWidth = 46; g.stroke(p2); }
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 22;
  g.fill(p2); g.stroke(p2);
  // 左上の照り：字の中だけに、明るい線を少しずらして引く
  if (side) {
    g.save();
    g.clip(p2);
    g.translate(-7, -9);
    g.strokeStyle = PALS.soubiPale; g.lineWidth = 12; g.globalAlpha = 0.85;
    g.stroke(p2);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // 縁取りの暗い色が見えるよう、縁取りがあるときは光の足し算にしない
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: edge ? THREE.NormalBlending : THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

/** 駒の半分（複製）。plane の表側だけ残る。飾り（印・輪）は割らない */
export function pieceHalf(piece: THREE.Object3D, plane: THREE.Plane): { obj: THREE.Object3D; mats: THREE.Material[] } {
  const obj = piece.clone(true);
  const mats: THREE.Material[] = [];
  obj.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry = m.geometry.clone();
    const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const mat = src.clone();
    mat.clippingPlanes = [plane];
    mat.clipShadows = true;
    mat.side = THREE.DoubleSide;
    mat.transparent = true;
    m.material = mat;
    mats.push(mat);
  });
  obj.children.slice(2).forEach((c) => { c.visible = false; });
  obj.visible = true;
  return { obj, mats };
}
