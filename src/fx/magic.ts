// 魔法5枚の演出。共通の流れ（札が飛ぶ → 間と白い光 → 集中線 → カメラが寄る → カットイン → 効果 → 戻る）と、
// カードごとの効果（MAGIC_FX）。時間は「長め」の値（試作の値）で書き、短めでは ctx が半分にする。
import * as THREE from 'three';
import type { GameEvent, Square } from '../rules/types';
import { CARDS } from '../cards';
import type { Cue } from './plan';
import type { Stage } from '../view/stage';
import { PAL, PALS, rgba } from '../view/palette';
import { BD, BW, squarePos } from '../view/board3d';
import { pieceMesh } from '../view/pieces3d';
import { HAND_LABEL } from '../view/hud';
import {
  animateEl, cameraHome, cameraPush, cameraTo, cardFly, cutIn, dim, easeInOut, easeOut, flash, later, lightCap, puff, shakeBy, shatter,
  smokeRing, speedLines, transient, type FxCtx,
} from './kit';
import { getSound } from './sound';

type MagicCue = Extract<Cue, { kind: 'magic' }>;
type MagicName = 'oshikaeshi' | 'irekae' | 'rakurai' | 'yobimodoshi';

const PIECE_Y = 0.02; // pieces3d と同じ駒の置き高さ

function effect<T extends GameEvent['type']>(cue: MagicCue, type: T): Extract<GameEvent, { type: T }> | undefined {
  return cue.effects.find((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

function pieceIdAt(ctx: FxCtx, sq: Square): number | undefined {
  return ctx.before.board[sq.r * 9 + sq.c]?.id;
}

// ---------- 雷の光（シーンに光を足すと材質の作り直しが起きるので、最初に1回だけ足しておく） ----------
let boltLight: THREE.PointLight | null = null;

/** 魔法の演出の下ごしらえ（演出役を作るときに1回呼ぶ） */
export function prepareMagic(stage: Stage): void {
  if (boltLight) return;
  boltLight = new THREE.PointLight(PAL.mahouBolt, 0, 18, 1.6);
  stage.scene.add(boltLight);
}

// ---------- 押し返しの風 ----------
// 帯の模様は使うたびに作る（演出の物は片付けのときに模様ごと捨てるため、使い回さない）
function windTexture(): THREE.CanvasTexture {
  // 縦長の帯：先は細く明るく、尾は藍で薄れる
  const c = document.createElement('canvas'); c.width = 32; c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, rgba(PAL.gofun, 0));
  gr.addColorStop(0.12, rgba(PAL.gofun, 0.95));
  gr.addColorStop(0.35, rgba(PAL.mahou, 0.9));
  gr.addColorStop(1, rgba(PAL.mahou, 0));
  g.fillStyle = gr;
  // 帯の両端を細くする
  g.beginPath(); g.moveTo(16, 0); g.quadraticCurveTo(32, 60, 26, 256); g.lineTo(6, 256); g.quadraticCurveTo(0, 60, 16, 0); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function oshikaeshi(ctx: FxCtx, cue: MagicCue): Promise<void> {
  const e = effect(cue, 'pushed');
  if (!e) return;
  const a = squarePos(e.from), b = squarePos(e.to);
  const dir = Math.sign(b.z - a.z) || -1;   // 押される向き（奥が -z）
  // 藍の風の帯が3本、押す向きへ流れる
  const winds: Promise<void>[] = [];
  getSound().play('wind');
  const tex = windTexture();
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 2.8), mat);
    m.rotation.x = -Math.PI / 2;
    if (dir > 0) m.rotation.z = Math.PI; // 帯の先を進む向きに
    const x = a.x + (i - 1) * 0.34, y = 0.32 + i * 0.12;
    const LIFE = 2000;
    transient(ctx, m, LIFE);
    m.position.set(x, y, a.z - dir * 4);
    winds.push(later(ctx.wait(i * 110).then(() => ctx.tween(480, (t) => {
      m.position.z = a.z + dir * (-4 + 8 * t);
      m.position.x = x + Math.sin(t * Math.PI * 2 + i) * 0.12;
      mat.opacity = Math.sin(Math.PI * t);
    }, (t) => t)).then(() => { mat.opacity = 0; })));
  }
  // 最初の帯が駒に届くころ、駒が1マス滑る（風下へ少し傾いて、戻る）
  await ctx.wait(220);
  const m = pieceMesh(e.pieceId);
  if (m) {
    const rx0 = m.rotation.x;
    await ctx.tween(380, (t) => {
      m.position.x = a.x + (b.x - a.x) * t;
      m.position.z = a.z + (b.z - a.z) * t;
      m.rotation.x = rx0 + Math.sin(Math.PI * t) * 0.22 * (m.rotation.y === 0 ? dir : -dir);
    }, easeOut);
    m.rotation.x = rx0;
  }
  puff(ctx, b.clone().setZ(b.z - dir * 0.3), PAL.kayaLight, 46, 1.4);
  shakeBy(ctx, 0.18);
  await Promise.all(winds);
}

// ---------- 入れ替えの術 ----------
async function irekae(ctx: FxCtx, cue: MagicCue): Promise<void> {
  const e = effect(cue, 'swapped');
  if (!e) return;
  const ia = pieceIdAt(ctx, e.a), ib = pieceIdAt(ctx, e.b);
  const ma = ia === undefined ? undefined : pieceMesh(ia);
  const mb = ib === undefined ? undefined : pieceMesh(ib);
  if (!ma || !mb) return;
  const pa = squarePos(e.a), pb = squarePos(e.b);
  const RISE = 1.2;
  getSound().play('whoosh');
  // 1.2 浮く
  await ctx.tween(280, (t) => { ma.position.y = mb.position.y = PIECE_Y + RISE * t; }, easeOut);
  // 交差する弧：互いに反対側へふくらんで入れ替わる。そのあいだに1回転
  const d = pb.clone().sub(pa);
  const perp = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(Math.min(1.1, 0.35 + d.length() * 0.18));
  const ra = ma.rotation.y, rb = mb.rotation.y;
  await ctx.tween(640, (t) => {
    const bulge = Math.sin(Math.PI * t), lift = PIECE_Y + RISE + bulge * 0.35;
    ma.position.set(pa.x + d.x * t + perp.x * bulge, lift, pa.z + d.z * t + perp.z * bulge);
    mb.position.set(pb.x - d.x * t - perp.x * bulge, lift, pb.z - d.z * t - perp.z * bulge);
    ma.rotation.y = ra + Math.PI * 2 * t;
    mb.rotation.y = rb - Math.PI * 2 * t;
  }, easeInOut);
  // 落ちて着地
  await ctx.tween(180, (t) => { ma.position.y = mb.position.y = PIECE_Y + RISE * (1 - t * t); });
  smokeRing(ctx, pb);
  smokeRing(ctx, pa);
  shakeBy(ctx, 0.15);
}

// ---------- 落雷（試作の castRakurai の後半） ----------
function makeBolt(from: THREE.Vector3, to: THREE.Vector3, radius: number, cap: (a: number) => number): THREE.Group {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let prev = from.clone();
  const n = 14;
  for (let i = 1; i <= n; i++) {
    const t = i / n, jit = (1 - t) * 0.9;
    const pt = i === n ? to.clone()
      : from.clone().lerp(to, t).add(new THREE.Vector3((Math.random() - 0.5) * jit, 0, (Math.random() - 0.5) * jit));
    path.add(new THREE.LineCurve3(prev, pt));
    prev = pt;
  }
  const grp = new THREE.Group();
  const core = new THREE.Mesh(new THREE.TubeGeometry(path, n * 4, radius, 6),
    new THREE.MeshBasicMaterial({ color: PAL.mahouCore, transparent: true, opacity: cap(1), blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Mesh(new THREE.TubeGeometry(path, n * 4, radius * 4.5, 8),
    new THREE.MeshBasicMaterial({ color: PAL.mahouGlow, transparent: true, opacity: cap(0.35), blending: THREE.AdditiveBlending, depthWrite: false }));
  grp.add(glow, core);
  return grp;
}

async function rakurai(ctx: FxCtx, cue: MagicCue): Promise<void> {
  const e = effect(cue, 'destroyed');
  if (!e) return;
  const at = squarePos(e.at);
  // 空が暗くなる → 雷3回
  dim(ctx, 0.55);
  await ctx.wait(260);
  const top = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 16, (Math.random() - 0.5) * 2));
  boltLight?.position.set(at.x, 2.2, at.z);
  try {
    for (let k = 0; k < 3; k++) {
      const bolt = makeBolt(top, at.clone().setY(0.25), k === 0 ? 0.07 : 0.05, (a) => lightCap(ctx, a));
      const shown = k === 0 ? 120 : 70;
      transient(ctx, bolt, shown * ctx.timing.scale);
      if (boltLight) boltLight.intensity = 90 * lightCap(ctx, 0.9) / 0.9; // 動きを減らす設定では光を弱める
      flash(ctx, PALS.mahouFlash, k === 0 ? 0.85 : 0.5, 160);
      if (k === 0) { shatter(ctx, e.pieceId); shakeBy(ctx, 0.55); getSound().play('thunder'); getSound().play('shatter'); }
      await ctx.wait(shown);
      bolt.visible = false;
      if (boltLight) boltLight.intensity = 0;
      await ctx.wait(k === 0 ? 90 : 120);
    }
  } finally {
    if (boltLight) boltLight.intensity = 0;
    dim(ctx, 0);
  }
}

// ---------- 霜の模様（凍てつく床で使う） ----------
let frostSrc: HTMLCanvasElement | null = null;
const FROST_W = 512, FROST_H = Math.round(512 * BD / BW);

/** 盤いっぱいの霜の模様（六方の結晶と、中央から伸びるひび） */
function frostPattern(): HTMLCanvasElement {
  if (frostSrc) return frostSrc;
  const c = document.createElement('canvas'); c.width = FROST_W; c.height = FROST_H;
  const g = c.getContext('2d')!;
  const cx = FROST_W / 2, cy = FROST_H / 2;
  const base = g.createRadialGradient(cx, cy, 10, cx, cy, FROST_W * 0.75);
  base.addColorStop(0, rgba(PAL.gofun, 0.42)); base.addColorStop(1, rgba(PAL.mahouPale, 0.22));
  g.fillStyle = base; g.fillRect(0, 0, FROST_W, FROST_H);
  g.lineCap = 'round';
  // 中央から外へ伸びる、枝分かれする霜のすじ
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    if (depth === 0 || len < 6) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.strokeStyle = rgba(PAL.gofun, 0.35 + depth * 0.1); g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    branch(x2, y2, a + (Math.random() - 0.5) * 0.5, len * 0.82, w * 0.8, depth - 1);
    if (Math.random() < 0.7) branch(x2, y2, a + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4), len * 0.55, w * 0.6, depth - 2);
  };
  for (let i = 0; i < 14; i++) branch(cx, cy, (i / 14) * Math.PI * 2 + Math.random() * 0.2, 34 + Math.random() * 16, 3, 7);
  // 六方の結晶
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * FROST_W, y = Math.random() * FROST_H, r = 5 + Math.random() * 13;
    g.strokeStyle = rgba(i % 3 === 0 ? PAL.mahouPale : PAL.gofun, 0.55 + Math.random() * 0.4);
    g.lineWidth = 1.2 + Math.random() * 1.4;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      const ex = x + Math.cos(ang) * r, ey = y + Math.sin(ang) * r;
      g.moveTo(x, y); g.lineTo(ex, ey);
      const bx = x + Math.cos(ang) * r * 0.58, by = y + Math.sin(ang) * r * 0.58;
      for (const s of [-1, 1]) {
        const b = ang + s * 0.85;
        g.moveTo(bx, by); g.lineTo(bx + Math.cos(b) * r * 0.34, by + Math.sin(b) * r * 0.34);
      }
    }
    g.stroke();
  }
  frostSrc = c;
  return c;
}

// ---------- 呼び戻し（HTML の駒札が飛ぶ） ----------
async function yobimodoshi(ctx: FxCtx, cue: MagicCue): Promise<void> {
  const e = effect(cue, 'handTransferred');
  if (!e) return;
  const root = ctx.hud.root;
  const fly = root.querySelector<HTMLElement>('.fx-fly');
  const fromBox = root.querySelector<HTMLElement>(e.from === ctx.me ? '.komadai.me' : '.komadai.foe');
  const toBox = root.querySelector<HTMLElement>(e.to === ctx.me ? '.komadai.me' : '.komadai.foe');
  if (!fly || !fromBox || !toBox) return;
  const o = root.getBoundingClientRect();
  const label = HAND_LABEL[e.kind];
  const src = [...fromBox.querySelectorAll<HTMLElement>('.koma')].find((k) => k.querySelector('.face')?.textContent === label);
  const sr = (src ?? fromBox).getBoundingClientRect();
  const x0 = sr.left - o.left, y0 = sr.top - o.top + (src ? 0 : 4);
  // 行き先：相手（受け取る側）の駒台の今の駒札の右どなり
  const toks = toBox.querySelectorAll<HTMLElement>('.koma');
  const last = toks[toks.length - 1];
  const tr = toBox.getBoundingClientRect();
  const x2 = last ? last.getBoundingClientRect().right - o.left + 6 : tr.left - o.left + 2;
  const y2 = tr.top - o.top + 2;
  // 弧のふくらみ：画面の右へ大きく回り込む
  const x1 = Math.max(x0, x2) + o.width * 0.6, y1 = (y0 + y2) / 2;
  const flipFrom = e.from === ctx.me ? 0 : 180; // 相手の駒札は先が下。飛びながら自分の向きへ回る
  const flipTo = e.to === ctx.me ? 0 : 180;
  if (src) src.style.opacity = '.3';

  const N = 14;
  const kf: Keyframe[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
    const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    const s = 1 + Math.sin(Math.PI * t) * 0.7;
    const rot = flipFrom + (flipTo - flipFrom) * t + Math.sin(Math.PI * t) * 20;
    kf.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${s.toFixed(2)})` });
  }
  const make = (ghost: number): HTMLElement => {
    const k = document.createElement('span');
    k.className = 'koma';
    k.style.left = '0'; k.style.top = '0';
    const f = document.createElement('span');
    f.className = 'face';
    f.textContent = label;
    if (ghost > 0) {
      // 藍の尾：後ろほど薄く小さい
      f.style.background = PALS.mahou;
      f.style.color = 'transparent';
      k.style.opacity = String(0.85 - ghost * 0.13);
      f.style.transform = `scale(${(1 - ghost * 0.1).toFixed(2)})`;
    }
    k.append(f);
    return k;
  };
  const DUR = 780;
  const anims: Promise<unknown>[] = [];
  const els: HTMLElement[] = [];
  for (let gI = 5; gI >= 0; gI--) {
    const k = make(gI);
    fly.append(k);
    els.push(k);
    anims.push(later(animateEl(ctx, k, kf, {
      duration: Math.max(1, DUR * ctx.timing.scale), delay: gI * 34 * ctx.timing.scale,
      easing: 'cubic-bezier(.45,0,.35,1)', fill: 'both',
    })));
  }
  try {
    await Promise.all(anims);
    flash(ctx, PALS.mahouPale, 0.2, 200);
    await ctx.wait(200);
  } finally {
    for (const k of els) k.remove();
  }
}

export const MAGIC_FX: Record<MagicName, (ctx: FxCtx, cue: MagicCue) => Promise<void>> = {
  oshikaeshi, irekae, rakurai, yobimodoshi,
};

/** カメラが寄る先（対象のマス。2つなら真ん中）。対象がなければ null */
function focusOf(cue: MagicCue): THREE.Vector3 | null {
  if (cue.targets.length === 0) return null;
  const v = new THREE.Vector3();
  for (const t of cue.targets) v.add(squarePos(t));
  return v.multiplyScalar(1 / cue.targets.length);
}

/**
 * 魔法の共通の流れ。negated（鏡の結界で無効）のときはカットインまでで終える。
 * 鏡の演出は、このあとに続く kagami の trapFire の段取りが流す（タスク11）
 */
export async function playMagic(ctx: FxCtx, cue: MagicCue): Promise<void> {
  const def = CARDS[cue.cardId];
  const fly = later(cardFly(ctx, cue.cardId, cue.side === ctx.me ? 'me' : 'foe'));
  try {
    // 拍子木の「間」：白く光って一瞬止まる
    await ctx.wait(260);
    flash(ctx, PALS.hakkou, 0.9, 180);
    speedLines(ctx, true);
    const at = focusOf(cue);
    if (at) await cameraTo(ctx, at, 620);
    else await cameraPush(ctx, 0.28, 620);
    await cutIn(ctx, def.name, `魔法・コスト${def.cost}`, 'mahou', 1000);
    speedLines(ctx, false);
    if (cue.negated) return;
    const fx = MAGIC_FX[def.fx as MagicName];
    if (fx) await fx(ctx, cue);
    await ctx.wait(900);
    await cameraHome(ctx, 900);
  } finally {
    speedLines(ctx, false);
    await fly;
  }
}
