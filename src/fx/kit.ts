// 演出の共通の道具：白い光・集中線・墨しぶき・筆文字のカットイン・札が飛ぶ・カメラの寄りと戻り・揺れ・砕け散り・粒。
// 試作（docs/mockups/look-mockup.html）の flash / buildSpeedLines / buildInk / shatter を移したもの。
// 決まり：
// - 時間はすべて timing.scale を掛ける（ctx.wait・ctx.tween を通す）
// - 動きを減らす設定：camera:false ならカメラは瞬時に移る、shake:false なら揺らさない、白い光は flashMax まで
// - 駒・字・木の材質は全駒で共有なので、色や透明度を変えるときは必ず複製して使う
import * as THREE from 'three';
import type { CardId, GameState, Side } from '../rules/types';
import type { Stage } from '../view/stage';
import { easeInOut, easeOut } from '../view/stage';
import type { Hud } from '../view/hud';
import type { FxTiming } from './plan';
import { PAL, PALS, rgba } from '../view/palette';
import { decal, ring } from '../view/board3d';
import { pieceMesh } from '../view/pieces3d';
import { cardHtml } from '../view/cardArt';

export interface FxCtx {
  stage: Stage;
  hud: Hud;
  timing: FxTiming;
  me: Side;
  wait(ms: number): Promise<void>;          // ms × timing.scale だけ待つ
  tween(ms: number, fn: (t: number) => void, ease?: (t: number) => number): Promise<void>; // 同じく時間を縮める
  before: GameState;                        // この行動の前の局面（画面側から見た形）
  after: GameState;                         // この行動の後の局面
}

export function makeCtx(stage: Stage, hud: Hud, timing: FxTiming, me: Side, before: GameState, after: GameState): FxCtx {
  const scaled = (ms: number): number => Math.max(0, ms * timing.scale);
  return {
    stage, hud, timing, me, before, after,
    // 待ちも描画の時計（tween）で数える。タブが裏に回って描画が止まっても、ほかの動きと順番がずれない
    wait: (ms) => stage.tween(scaled(ms), () => {}),
    tween: (ms, fn, ease) => stage.tween(scaled(ms), fn, ease),
  };
}

// ---------- 重ね板（対局画面の root の中に1組だけ作る） ----------
interface Layers { dim: HTMLElement; lines: HTMLElement; cutin: HTMLElement; fly: HTMLElement; flash: HTMLElement }
const layerOf = new WeakMap<HTMLElement, Layers>();

function layers(ctx: FxCtx): Layers {
  const root = ctx.hud.root;
  const hit = layerOf.get(root);
  if (hit && hit.dim.isConnected) return hit;
  const mk = (cls: string): HTMLElement => {
    const d = document.createElement('div');
    d.className = `fx ${cls}`;
    d.setAttribute('aria-hidden', 'true');
    return d;
  };
  const L: Layers = { dim: mk('fx-dim'), lines: mk('fx-lines'), cutin: mk('fx-cutin'), fly: mk('fx-fly'), flash: mk('fx-flash') };
  // カットインの中身（文字はカード定義の定数だけが入る）
  L.cutin.innerHTML = '<div class="band"></div>'
    + '<svg class="ink" viewBox="-300 -150 600 300" preserveAspectRatio="xMidYMid meet"></svg>'
    + '<div class="word"></div><div class="sub"></div>';
  root.append(L.dim, L.lines, L.cutin, L.fly, L.flash);
  layerOf.set(root, L);
  return L;
}

/** 重ね板をすべて消す（演出の最後の後始末） */
export function clearLayers(ctx: FxCtx): void {
  const L = layerOf.get(ctx.hud.root);
  if (!L) return;
  L.dim.style.opacity = '0';
  L.lines.classList.remove('on');
  L.cutin.classList.remove('on', 'off');
  L.fly.replaceChildren();
  L.flash.style.transition = 'none';
  L.flash.style.opacity = '0';
  // 飛ばすために隠した手札を戻す（ふつうはこのあとの描き直しで消えるが、描き直しに失敗しても札が消えたままにならないように）
  for (const c of ctx.hud.root.querySelectorAll<HTMLElement>('.hand .card')) {
    if (c.style.visibility === 'hidden') c.style.visibility = '';
  }
}

// ---------- 画面の重ね板の演出 ----------

/** 画面全体が一瞬光る。peak は flashMax で頭打ち */
export function flash(ctx: FxCtx, color: string, peak: number, ms: number): void {
  const f = layers(ctx).flash;
  f.style.background = color;
  f.style.transition = 'none';
  f.style.opacity = String(Math.min(peak, ctx.timing.flashMax));
  void f.offsetWidth; // いまの明るさを確定させてから消していく
  f.style.transition = `opacity ${Math.max(1, ms * ctx.timing.scale)}ms ease-out`;
  f.style.opacity = '0';
}

/** 集中線（試作の buildSpeedLines） */
export function speedLines(ctx: FxCtx, on: boolean): void {
  const el = layers(ctx).lines;
  if (!on) { el.classList.remove('on'); return; }
  let s = '<svg viewBox="-400 -400 800 800" preserveAspectRatio="xMidYMid slice">';
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, w = 0.006 + Math.random() * 0.012, r0 = 150 + Math.random() * 120, r1 = 760;
    const p = (r: number, aa: number): string => `${(Math.cos(aa) * r).toFixed(1)},${(Math.sin(aa) * r).toFixed(1)}`;
    s += `<polygon points="${p(r0, a)} ${p(r1, a - w)} ${p(r1, a + w)}" fill="${PALS.gofun}" opacity="${(0.35 + Math.random() * 0.5).toFixed(2)}"/>`;
  }
  el.innerHTML = s + '</svg>';
  el.classList.add('on');
}

/** 墨しぶき：大きな塊＋飛び散る粒＋垂れ（試作の buildInk） */
function inkSvg(): string {
  const k = PALS.sumi;
  let s = `<path d="M-230 -40 Q-150 -110 -20 -95 Q120 -120 220 -60 Q260 0 210 55 Q90 115 -60 95 Q-210 90 -245 30Z" fill="${k}"/>`;
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 170;
    s += `<circle cx="${(Math.cos(a) * r * 1.3).toFixed(0)}" cy="${(Math.sin(a) * r * 0.55).toFixed(0)}" r="${(2 + Math.random() * 11).toFixed(1)}" fill="${k}"/>`;
  }
  for (const x of [-140, -30, 95, 170]) s += `<path d="M${x - 6} 80 Q${x} ${(135 + Math.random() * 30).toFixed(0)} ${x + 6} 80Z" fill="${k}"/>`;
  return s;
}

/** 墨しぶき＋筆文字のカットイン。ms だけ見せて消す */
export async function cutIn(ctx: FxCtx, word: string, sub: string, band: 'mahou' | 'wana' | 'soubi', ms = 1000): Promise<void> {
  const el = layers(ctx).cutin;
  el.querySelector('.ink')!.innerHTML = inkSvg();
  const w = el.querySelector<HTMLElement>('.word')!;
  w.textContent = word;
  // 字数が多いほど小さくして、画面の幅に収める（2字までは試作の大きさ）
  const n = Math.max(2, [...word].length);
  w.style.fontSize = `min(${(Math.min(30, 88 / n)).toFixed(1)}vw, ${Math.round(Math.min(128, 380 / n))}px)`;
  w.classList.toggle('long', n >= 4);
  el.querySelector<HTMLElement>('.sub')!.textContent = sub;
  el.style.setProperty('--band', `var(--${band})`);
  el.classList.remove('on', 'off');
  void el.offsetWidth; // 前の動きを外してから付け直す（毎回はじめから動かす）
  el.classList.add('on');
  try {
    await ctx.wait(ms);
  } finally {
    el.classList.add('off');
    el.classList.remove('on');
  }
}

/** 画面を暗くする（0 で戻す） */
export function dim(ctx: FxCtx, opacity: number): void {
  layers(ctx).dim.style.opacity = String(opacity);
}

/** root の中での位置（重ね板に置くため） */
function localRect(ctx: FxCtx, el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect(), o = ctx.hud.root.getBoundingClientRect();
  return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
}

/** 使った札が飛ぶ。自分は手札から上へ、相手は上の帯から現れて下へ */
export async function cardFly(ctx: FxCtx, cardId: CardId, from: 'me' | 'foe'): Promise<void> {
  const L = layers(ctx);
  const root = ctx.hud.root;
  const wrap = document.createElement('div');
  wrap.innerHTML = cardHtml(cardId); // 定数だけでできた文字列
  const card = wrap.firstElementChild as HTMLElement;
  card.removeAttribute('aria-label');
  let src: HTMLElement | undefined;
  let x: number, y: number;
  if (from === 'me') {
    src = [...root.querySelectorAll<HTMLElement>('.hand .card')]
      .find((c) => c.dataset.card === cardId && c.style.visibility !== 'hidden');
  }
  if (src) {
    const r = localRect(ctx, src);
    x = r.x; y = r.y;
    src.style.visibility = 'hidden'; // 本物は隠す（演出の最後の clearLayers で戻し、描き直しで消える）
  } else {
    const foe = root.querySelector('.side.foe');
    const rr = root.getBoundingClientRect();
    const fr = foe ? localRect(ctx, foe) : { x: 0, y: 0, w: rr.width, h: 40 };
    x = rr.width / 2 - 37;
    y = from === 'me' ? rr.height - 140 : fr.y + fr.h - 30;
  }
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
  L.fly.append(card);
  const kf: Keyframe[] = from === 'me'
    ? [
      { transform: 'none', filter: 'brightness(1)' },
      { offset: 0.3, transform: 'translateY(-60px) scale(1.25) rotate(-4deg)', filter: 'brightness(1.4)' },
      { transform: 'translateY(-320px) scale(1.9) rotate(8deg)', opacity: 0, filter: 'brightness(3)' },
    ]
    : [
      { transform: 'translateY(-60px) scale(.6) rotate(6deg)', opacity: 0, filter: 'brightness(1)' },
      { offset: 0.3, transform: 'translateY(40px) scale(1.25) rotate(4deg)', opacity: 1, filter: 'brightness(1.4)' },
      { transform: 'translateY(300px) scale(1.9) rotate(-8deg)', opacity: 0, filter: 'brightness(3)' },
    ];
  try {
    const a = card.animate(kf, { duration: Math.max(1, 520 * ctx.timing.scale), easing: 'cubic-bezier(.5,0,.8,.3)', fill: 'forwards' });
    await a.finished;
  } catch { /* 途中で消されたときは何もしない */ } finally {
    card.remove();
  }
}

// ---------- カメラと揺れ ----------

async function moveCam(ctx: FxCtx, pos: THREE.Vector3, look: THREE.Vector3, ms: number, ease: (t: number) => number): Promise<void> {
  const s = ctx.stage;
  if (!ctx.timing.camera) { s.cam.pos.copy(pos); s.cam.look.copy(look); return; }
  const p0 = s.cam.pos.clone(), l0 = s.cam.look.clone();
  await ctx.tween(ms, (t) => { s.cam.pos.lerpVectors(p0, pos, t); s.cam.look.lerpVectors(l0, look, t); }, ease);
}

/** カメラが盤の上の点へぐっと寄る（試作の値）。camera:false なら瞬時 */
export function cameraTo(ctx: FxCtx, at: THREE.Vector3, ms: number): Promise<void> {
  const z = ctx.me === 'sente' ? 1 : -1; // 見ている側の手前から寄る
  const pos = at.clone().add(new THREE.Vector3(1.2 * z, 4.6, 4.4 * z));
  return moveCam(ctx, pos, at.clone().setY(0.3), ms, easeOut);
}

/** 対象のない演出：盤の中央を見たまま、普段の視点から frac だけ近づく */
export function cameraPush(ctx: FxCtx, frac: number, ms: number): Promise<void> {
  const s = ctx.stage;
  const look = s.home.look.clone();
  const pos = s.home.pos.clone().lerp(look, frac);
  return moveCam(ctx, pos, look, ms, easeOut);
}

/** 普段の視点へ戻る */
export function cameraHome(ctx: FxCtx, ms: number): Promise<void> {
  return moveCam(ctx, ctx.stage.home.pos.clone(), ctx.stage.home.look.clone(), ms, easeInOut);
}

export function atHome(ctx: FxCtx): boolean {
  const s = ctx.stage;
  return s.cam.pos.distanceTo(s.home.pos) < 1e-4 && s.cam.look.distanceTo(s.home.look) < 1e-4;
}

/** 画面を揺らす。shake:false なら何もしない */
export function shakeBy(ctx: FxCtx, amount: number): void {
  if (!ctx.timing.shake) return;
  ctx.stage.shake = Math.max(ctx.stage.shake, amount);
}

// ---------- 一時的な 3D の物（寿命が来たら自動で片付ける） ----------
interface Live { obj: THREE.Object3D; age: number; life: number; step(dt: number, age: number): void }
const lives = new Set<Live>();

/** 網の物・点の物の形・材質・模様を捨てる（board3d の disposeTree は網の物だけなので、点も扱うこちらを使う） */
function disposeAll(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh | THREE.Points;
    if (!(m as THREE.Mesh).isMesh && !(m as THREE.Points).isPoints) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      (mat as THREE.MeshBasicMaterial).map?.dispose();
      mat.dispose();
    }
  });
}
let liveOff: (() => void) | null = null;

/**
 * 物を舞台に置き、毎フレーム step を呼ぶ。life ミリ秒たったら外して形・材質・模様を捨てる。
 * 共有の材質（駒の木など）は渡さないこと（捨てられてしまう）。使うときは複製を渡す。
 * 戻り値を呼ぶと、寿命を待たずに次のフレームで片付ける
 */
export function transient(
  ctx: FxCtx, obj: THREE.Object3D, life: number, step: (dt: number, age: number) => void = () => {},
): () => void {
  const stage = ctx.stage;
  if (!liveOff) {
    liveOff = stage.onFrame((dt) => {
      for (const l of [...lives]) {
        l.age += dt * 1000;
        try { l.step(dt, l.age); } catch (e) { console.error('演出の物を動かせませんでした', e); l.age = l.life; }
        if (l.age >= l.life) {
          lives.delete(l);
          l.obj.parent?.remove(l.obj);
          disposeAll(l.obj);
        }
      }
    });
  }
  stage.scene.add(obj);
  const l: Live = { obj, age: 0, life, step };
  lives.add(l);
  return () => { obj.visible = false; l.age = l.life; };
}

/** 砕け散り：駒を消し、かけら・火花・焦げ跡を残す（試作の shatter） */
export function shatter(ctx: FxCtx, pieceId: number): void {
  const piece = pieceMesh(pieceId);
  if (!piece) return;
  const at = piece.position.clone();
  const s = (piece.userData.s as number | undefined) ?? 1;
  piece.visible = false; // 盤から消える（片付けは sync がする）

  // かけら：駒の木の材質は共有なので複製して使う
  const body = piece.children[0] as THREE.Mesh | undefined;
  const src = body?.material as THREE.MeshStandardMaterial | undefined;
  const m1 = src ? src.clone() : new THREE.MeshStandardMaterial({ color: PAL.kayaLight, roughness: 0.45 });
  const m2 = new THREE.MeshStandardMaterial({ color: PAL.sumiChar, roughness: 0.8 });
  m1.transparent = true; m2.transparent = true;
  const grp = new THREE.Group();
  const frags: { m: THREE.Mesh; v: THREE.Vector3; av: THREE.Vector3 }[] = [];
  for (let i = 0; i < 18; i++) {
    const g = new THREE.BoxGeometry(0.08 + Math.random() * 0.2, 0.06 + Math.random() * 0.1, 0.08 + Math.random() * 0.2);
    const m = new THREE.Mesh(g, i % 5 === 0 ? m2 : m1);
    m.castShadow = true;
    m.position.set(at.x + (Math.random() - 0.5) * 0.4 * s, 0.15, at.z + (Math.random() - 0.5) * 0.4 * s);
    grp.add(m);
    const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
    frags.push({
      m, v: new THREE.Vector3(Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp),
      av: new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10),
    });
  }
  const FRAG_LIFE = 3200;
  transient(ctx, grp, FRAG_LIFE, (dt, age) => {
    for (const f of frags) {
      f.v.y -= 20 * dt;
      f.m.position.addScaledVector(f.v, dt);
      if (f.m.position.y < 0.05) { f.m.position.y = 0.05; f.v.y *= -0.32; f.v.x *= 0.7; f.v.z *= 0.7; f.av.multiplyScalar(0.7); }
      f.m.rotation.x += f.av.x * dt; f.m.rotation.y += f.av.y * dt; f.m.rotation.z += f.av.z * dt;
    }
    const fade = Math.min(1, Math.max(0, (FRAG_LIFE - age) / 700));
    m1.opacity = fade; m2.opacity = fade;
  });

  // 火花
  const N = 160, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    arr.set([at.x, 0.3, at.z], i * 3);
    v.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 7));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color: PAL.mahouSpark, size: 0.13, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.Points(geo, pm);
  transient(ctx, sparks, 1200, (dt) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      v[i].y -= 9 * dt;
      pos.setXYZ(i, pos.getX(i) + v[i].x * dt, pos.getY(i) + v[i].y * dt, pos.getZ(i) + v[i].z * dt);
    }
    pos.needsUpdate = true;
    pm.opacity = Math.max(0, pm.opacity - dt * 0.9);
  });

  // 焦げ跡（しばらく残ってから薄れて消える）
  const burn = decal((g) => {
    const gr = g.createRadialGradient(128, 128, 8, 128, 128, 124);
    gr.addColorStop(0, rgba(PAL.sumiBurn, 0.9)); gr.addColorStop(0.5, rgba(PAL.sumiBurnEdge, 0.55)); gr.addColorStop(1, rgba(PAL.sumiBurnEdge, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }, 1.5, 1.6);
  burn.position.set(at.x, 0.006, at.z);
  const BURN_LIFE = 5000;
  transient(ctx, burn, BURN_LIFE, (_dt, age) => {
    burn.material.opacity = Math.min(1, Math.max(0, (BURN_LIFE - age) / 1500));
  });
}

/** 粒：足元の土ぼこりなど。色と数を変えて使う */
export function puff(ctx: FxCtx, at: THREE.Vector3, color: number, n = 40, spread = 1.6): void {
  const geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    arr.set([at.x + (Math.random() - 0.5) * 0.5, 0.05 + Math.random() * 0.1, at.z + (Math.random() - 0.5) * 0.5], i * 3);
    const a = Math.random() * Math.PI * 2, sp = (0.4 + Math.random()) * spread;
    v.push(new THREE.Vector3(Math.cos(a) * sp, 0.4 + Math.random() * 1.1, Math.sin(a) * sp));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false });
  const LIFE = 900;
  transient(ctx, new THREE.Points(geo, pm), LIFE, (dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      v[i].multiplyScalar(1 - dt * 3); // 空気でゆっくり止まる
      pos.setXYZ(i, pos.getX(i) + v[i].x * dt, Math.max(0.03, pos.getY(i) + v[i].y * dt), pos.getZ(i) + v[i].z * dt);
    }
    pos.needsUpdate = true;
    pm.opacity = 0.85 * Math.max(0, 1 - age / LIFE);
  });
}

/** 白い煙の輪：着地した所から広がって消える */
export function smokeRing(ctx: FxCtx, at: THREE.Vector3): void {
  const r = ring(0.3, 0.46, PAL.gofun, 48);
  r.position.set(at.x, 0.03, at.z);
  const LIFE = 650;
  transient(ctx, r, LIFE, (_dt, age) => {
    const t = Math.min(1, age / LIFE);
    const k = 1 + easeOut(t) * 1.6;
    r.scale.set(k, k, k);
    r.material.opacity = 0.85 * (1 - t);
  });
  puff(ctx, at, PAL.gofun, 26, 1.2);
}

export { easeOut, easeInOut };
