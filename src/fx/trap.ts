// 罠3枚の演出。伏せる（静かに：札が裏向きで伏せ札の枠へ滑り込む）と、発動の共通の流れ
// （伏せ札の枠が勢いよくめくれる → 紅い光が画面を横に走る → カットイン → 効果）、カードごとの効果（TRAP_FX）。
// 時間は「長め」の値で書き、短めでは ctx が半分にする。
// 決まり：相手の伏せ札は、発動するまで裏だけ見せる（伏せたときの中身・マスは出さない）
import * as THREE from 'three';
import type { GameEvent, GameState, Side, Square } from '../rules/types';
import { CARDS } from '../cards';
import type { Cue } from './plan';
import { PAL, PALS, rgba } from '../view/palette';
import { CD, CW, decal, ring, squarePos } from '../view/board3d';
import { pieceMesh, sync } from '../view/pieces3d';
import { cardHtml } from '../view/cardArt';
import {
  atHome, cameraHome, cameraTo, cutIn, dim, easeInOut, easeOut, flash, lightCap, localRect, overlay, puff, shakeBy, transient,
  type FxCtx,
} from './kit';

type TrapSetCue = Extract<Cue, { kind: 'trapSet' }>;
type TrapFireCue = Extract<Cue, { kind: 'trapFire' }>;
type TrapName = 'otoshiana' | 'kagami' | 'narifuuji';

function effect<T extends GameEvent['type']>(cue: TrapFireCue, type: T): Extract<GameEvent, { type: T }> | undefined {
  return cue.effects.find((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** 局面の中で、その駒がいるマス */
export function squareOf(s: GameState, pieceId: number): Square | null {
  const i = s.board.findIndex((p) => p?.id === pieceId);
  return i < 0 ? null : { c: i % 9, r: Math.floor(i / 9) };
}

// ---------- 伏せ札の枠 ----------

/** 持ち主の帯の、i 番目の伏せ札の枠 */
function slotOf(ctx: FxCtx, owner: Side, i: number): HTMLElement | null {
  const band = owner === ctx.me ? '.side.me .traps' : '.side.foe .traps';
  return ctx.hud.root.querySelectorAll<HTMLElement>(`${band} .slot`)[i] ?? null;
}

/** 発動した罠が何番目の枠か（前の局面にあって後の局面に無い罠。相手の罠も uid は見えている） */
function firedIndex(ctx: FxCtx, owner: Side): number {
  const mine = ctx.before.traps.filter((t) => t.owner === owner);
  const left = new Set(ctx.after.traps.map((t) => t.uid));
  const i = mine.findIndex((t) => !left.has(t.uid));
  return i >= 0 ? i : Math.max(0, mine.length - 1);
}

/** Web Animations を待つ（途中で消されても例外を出さない） */
async function run(el: HTMLElement, kf: Keyframe[], ms: number, easing: string): Promise<void> {
  try {
    await el.animate(kf, { duration: Math.max(1, ms), easing, fill: 'forwards' }).finished;
  } catch { /* 途中で消されたときは何もしない */ }
}

/** 罠を伏せる：静かに。裏向きの札が伏せ札の枠へ滑り込む（300ms）。自分の落とし穴ならマスに罠の印 */
export async function playTrapSet(ctx: FxCtx, cue: TrapSetCue): Promise<void> {
  const owner = cue.side;
  const n = ctx.before.traps.filter((t) => t.owner === owner).length;
  const slot = slotOf(ctx, owner, Math.min(n, 2));
  if (!slot) return;
  const root = ctx.hud.root;
  const to = localRect(ctx, slot);
  const mine = owner === ctx.me && cue.cardId !== null;
  // 出どころ：自分は手札のその札、相手は上の帯の上から
  let src: HTMLElement | undefined;
  if (mine) {
    src = [...root.querySelectorAll<HTMLElement>('.hand .card')]
      .find((c) => c.dataset.card === cue.cardId && c.style.visibility !== 'hidden');
  }
  let dx: number, dy: number, k: number;
  if (src) {
    const r = localRect(ctx, src);
    dx = r.x + r.w / 2 - (to.x + to.w / 2);
    dy = r.y + r.h / 2 - (to.y + to.h / 2);
    k = r.w / Math.max(1, to.w);
    src.style.visibility = 'hidden'; // 後始末の clearLayers で戻し、描き直しで消える
  } else {
    dx = 0; dy = -70; k = 2.4;
  }
  const back = document.createElement('i');
  back.className = 'slot back';
  Object.assign(back.style, { left: `${to.x}px`, top: `${to.y}px`, width: `${to.w}px`, height: `${to.h}px`, boxSizing: 'border-box' });
  overlay(ctx).append(back);
  try {
    await run(back, [
      { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(-14deg)`, opacity: src ? 1 : 0 },
      { offset: 0.35, opacity: 1 },
      { transform: 'none', opacity: 1 },
    ], 300 * ctx.timing.scale, 'cubic-bezier(.2,.8,.25,1)');
  } finally {
    back.remove();
  }
  // 枠を埋めた見た目にしておく（このあとの描き直しで正しく描き直される）
  // aria-label も帯の描き直し（hud.ts）と同じ言い方にそろえる
  if (mine && cue.cardId) {
    slot.className = 'slot mine';
    slot.textContent = CARDS[cue.cardId].name[0];
    slot.setAttribute('aria-label', `伏せた${CARDS[cue.cardId].name}`);
  } else {
    slot.className = 'slot back';
    slot.setAttribute('aria-label', '伏せ札');
  }
  // 自分の落とし穴：マスに罠の印を出し、紅い輪が小さく広がって知らせる
  if (mine && cue.at) {
    sync(ctx.stage, ctx.after, ctx.me);
    const r = ring(0.42, 0.5, PAL.wana, 4);
    r.rotation.z = Math.PI / 4;
    r.position.copy(squarePos(cue.at)).setY(0.02);
    const LIFE = 520 * ctx.timing.scale;
    transient(ctx, r, LIFE, (_dt, age) => {
      const t = Math.min(1, age / LIFE);
      const s = 1 + easeOut(t) * 0.6;
      r.scale.set(s, s, s);
      r.material.opacity = 0.9 * (1 - t);
    });
  }
}

// ---------- 発動の共通の流れ ----------

/** 伏せ札の枠が勢いよくめくれる（Y 軸の回転 180°、200ms）。相手の罠もここで中身が分かる */
async function flipSlot(ctx: FxCtx, cue: TrapFireCue): Promise<void> {
  const slot = slotOf(ctx, cue.owner, firedIndex(ctx, cue.owner));
  if (!slot) return;
  const half = 100 * ctx.timing.scale;
  slot.style.position = 'relative';
  slot.style.zIndex = '3';
  // 前半：裏のまま 90° まで回りながら大きくなる
  await run(slot, [
    { transform: 'perspective(90px) rotateY(0deg) scale(1)' },
    { transform: 'perspective(90px) rotateY(90deg) scale(1.9)' },
  ], half, 'cubic-bezier(.5,0,1,.6)');
  // 表に替えて、残りの 90° を回り切る（表の字が裏返しにならないよう -90° から戻す）
  slot.className = 'slot mine';
  slot.textContent = CARDS[cue.cardId].name[0];
  slot.setAttribute('aria-label', `発動した${CARDS[cue.cardId].name}`);
  slot.style.boxShadow = `0 0 10px 2px ${rgba(PAL.wana, 0.9)}`;
  await run(slot, [
    { transform: 'perspective(90px) rotateY(-90deg) scale(1.9)' },
    { offset: 0.6, transform: 'perspective(90px) rotateY(10deg) scale(1.6)' },
    { transform: 'perspective(90px) rotateY(0deg) scale(1.45)' },
  ], half, 'cubic-bezier(.2,.9,.3,1)');
}

/** 紅い光が画面を横に走る */
async function redSweep(ctx: FxCtx): Promise<void> {
  const el = document.createElement('div');
  // 帯の芯は胡粉の白。動きを減らす設定では帯全体の濃さを flashMax までにする（芯は 0.95×0.4 ≒ 0.38）
  const peak = lightCap(ctx, 1);
  Object.assign(el.style, {
    left: '0', top: '34%', width: '70%', height: '30%',
    background: `linear-gradient(90deg, ${rgba(PAL.wana, 0)} 0%, ${rgba(PAL.wana, 0.75)} 55%, ${rgba(PAL.gofun, 0.95)} 78%, ${rgba(PAL.wana, 0.6)} 88%, ${rgba(PAL.wana, 0)} 100%)`,
    transform: 'translateX(-110%) skewX(-24deg)',
    filter: 'blur(2px)',
    opacity: String(peak),
  });
  overlay(ctx).append(el);
  flash(ctx, PALS.wana, 0.3, 260);
  try {
    await run(el, [
      { transform: 'translateX(-110%) skewX(-24deg)' },
      { transform: 'translateX(170%) skewX(-24deg)' },
    ], 280 * ctx.timing.scale, 'cubic-bezier(.6,0,.4,1)');
  } finally {
    el.remove();
  }
}

/** 罠の発動：枠がめくれる → 紅い光 → カットイン（鏡の結界は下の札が「無効」）→ 効果 → 戻る */
export async function playTrapFire(ctx: FxCtx, cue: TrapFireCue): Promise<void> {
  const def = CARDS[cue.cardId];
  try {
    await flipSlot(ctx, cue);
    await ctx.wait(80);
    await redSweep(ctx);
    await cutIn(ctx, def.name, cue.cardId === 'kagami' ? '無効' : '罠・発動', 'wana', 900);
    const fx = TRAP_FX[def.fx as TrapName];
    if (fx) await fx(ctx, cue);
    await ctx.wait(350);
  } finally {
    if (!atHome(ctx)) await cameraHome(ctx, 700);
  }
}

// ---------- 落とし穴 ----------

/** 割れて開く黒い穴（ふちがぎざぎざ） */
function holeMesh(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  return decal((g) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, r = 92 + (i % 2 ? -14 : 8) + Math.random() * 16;
      pts.push([128 + Math.cos(a) * r, 128 + Math.sin(a) * r]);
    }
    const path = (): void => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    // ふちの割れた木（少し明るい）
    g.save(); g.translate(128, 128); g.scale(1.1, 1.1); g.translate(-128, -128); path();
    g.fillStyle = rgba(PAL.kayaGrainDeep, 0.95); g.fill(); g.restore();
    path();
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 112);
    gr.addColorStop(0, rgba(PAL.sumiHole, 1)); gr.addColorStop(0.75, rgba(PAL.sumiHole, 1)); gr.addColorStop(1, rgba(PAL.sumiBurnEdge, 1));
    g.fillStyle = gr; g.fill();
  }, CW * 0.98, CD * 0.98);
}

/** 穴のまわりに走るひび */
function crackMesh(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  return decal((g) => {
    g.strokeStyle = rgba(PAL.sumi, 0.9); g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, r = 70, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(x, y);
      while (r < 124) {
        r += 12 + Math.random() * 16; a += (Math.random() - 0.5) * 0.5;
        x = 128 + Math.cos(a) * r; y = 128 + Math.sin(a) * r;
        g.lineTo(x, y); g.lineWidth = Math.max(1.5, g.lineWidth - 1);
      }
      g.stroke();
    }
  }, CW * 1.6, CD * 1.6);
}

async function otoshiana(ctx: FxCtx, cue: TrapFireCue): Promise<void> {
  const e = effect(cue, 'destroyed');
  if (!e) return;
  const at = squarePos(e.at);
  await cameraTo(ctx, at, 500);
  const crack = crackMesh();
  crack.position.set(at.x, 0.008, at.z);
  crack.material.opacity = 0;
  const hole = holeMesh();
  hole.position.set(at.x, 0.012, at.z);
  hole.scale.setScalar(0.01);
  const killCrack = transient(ctx, crack, 60000); // 片付けはこの関数の最後（寿命は念のための上限）
  const killHole = transient(ctx, hole, 60000);
  const m = pieceMesh(e.pieceId);
  try {
    // ひびが走り、マスが割れて穴が開く
    await ctx.tween(140, (t) => { crack.material.opacity = t; });
    shakeBy(ctx, 0.22);
    puff(ctx, at, PAL.kayaLight, 34, 1.3);
    await ctx.tween(220, (t) => { hole.scale.setScalar(Math.max(0.01, t)); }, easeOut);
    // 駒が回りながら落ちて消える（盤の面より下は盤に隠れるので、穴に吸い込まれて見える）
    if (m) {
      const y0 = m.position.y, ry = m.rotation.y;
      await ctx.tween(700, (t) => {
        m.position.y = y0 - 1.1 * t * t;
        m.rotation.y = ry + Math.PI * 3 * t;
        m.rotation.x = Math.sin(t * Math.PI) * 0.35;
        m.scale.setScalar(1 - 0.7 * t);
      }, (t) => t);
      m.visible = false;
    }
    await ctx.wait(160);
    // 穴は閉じ、ひびは薄れる
    await ctx.tween(300, (t) => {
      hole.scale.setScalar(Math.max(0.01, 1 - t));
      crack.material.opacity = 1 - t;
    }, easeInOut);
  } finally {
    killCrack();
    killHole();
  }
}

// ---------- 鏡の結界 ----------
let mirrorSeq = 0;

/** 金の縁の丸い鏡（SVG。色は palette から） */
function mirrorSvg(): string {
  const id = `fxm${++mirrorSeq}`;
  let studs = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    studs += `<circle cx="${(Math.cos(a) * 86).toFixed(1)}" cy="${(Math.sin(a) * 86).toFixed(1)}" r="3.2" fill="${PALS.soubiPale}"/>`;
  }
  return `<svg viewBox="-100 -100 200 200" width="100%" height="100%">`
    + `<defs><radialGradient id="${id}" cx="38%" cy="34%" r="75%">`
    + `<stop offset="0" stop-color="${PALS.gofun}"/><stop offset=".45" stop-color="${PALS.mahouPale}"/>`
    + `<stop offset="1" stop-color="${PALS.yoruLight}"/></radialGradient></defs>`
    + `<circle r="97" fill="${PALS.sumi}"/>`
    + `<circle r="94" fill="${PALS.soubi}"/>`
    + `<circle r="78" fill="none" stroke="${PALS.soubiLight}" stroke-width="2"/>`
    + studs
    + `<circle r="74" fill="url(#${id})" stroke="${PALS.sumi}" stroke-width="2.5"/>`
    + `<path d="M-48 -30 Q-30 -58 4 -62" fill="none" stroke="${PALS.hakkou}" stroke-width="7" stroke-linecap="round" opacity=".85"/>`
    + `<path d="M-56 -8 Q-54 -18 -50 -24" fill="none" stroke="${PALS.hakkou}" stroke-width="5" stroke-linecap="round" opacity=".6"/>`
    + `</svg>`;
}

async function kagami(ctx: FxCtx, cue: TrapFireCue): Promise<void> {
  const neg = effect(cue, 'magicNegated');
  const fly = overlay(ctx);
  const box = ctx.hud.root.getBoundingClientRect();
  const size = Math.min(box.width * 0.62, 260);
  const cx = box.width / 2, cy = box.height * 0.46;
  const mirror = document.createElement('div');
  Object.assign(mirror.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px` });
  mirror.innerHTML = mirrorSvg(); // 定数と palette の色だけでできた文字列
  const els: HTMLElement[] = [mirror];
  fly.append(mirror);
  dim(ctx, 0.35);
  const S = ctx.timing.scale;
  try {
    // 鏡が画面の前に現れる
    await run(mirror, [
      { transform: 'scale(.2) rotate(-30deg)', opacity: 0 },
      { offset: 0.7, transform: 'scale(1.06) rotate(4deg)', opacity: 1 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ], 300 * S, 'ease-out');
    if (!neg) return;
    // 止められた魔法の札が飛んできて、鏡に当たる
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHtml(neg.cardId); // 定数だけでできた文字列
    const card = wrap.firstElementChild as HTMLElement;
    card.removeAttribute('aria-label');
    const cw = 74, ch = 112;
    const x = cx - cw / 2, y = cy - ch / 2;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    fly.append(card);
    els.push(card);
    const fromY = neg.side === ctx.me ? box.height * 0.5 : -box.height * 0.5;
    await run(card, [
      { transform: `translateY(${fromY}px) scale(1.6) rotate(-10deg)`, opacity: 0 },
      { offset: 0.2, opacity: 1 },
      { transform: 'translateY(0) scale(1.15) rotate(3deg)', opacity: 1 },
    ], 360 * S, 'cubic-bezier(.6,0,1,1)');
    // 当たって砕ける：札を三角のかけらに分けて飛ばす
    card.remove();
    flash(ctx, PALS.hakkou, 0.75, 160);
    shakeBy(ctx, 0.28);
    void run(mirror, [{ filter: `brightness(${1 + lightCap(ctx, 0.9)})` }, { filter: 'brightness(1)' }], 260 * S, 'ease-out');
    const ripple = document.createElement('div');
    Object.assign(ripple.style, {
      left: `${cx - size * 0.4}px`, top: `${cy - size * 0.4}px`, width: `${size * 0.8}px`, height: `${size * 0.8}px`,
      borderRadius: '50%', border: `3px solid ${PALS.gofun}`,
    });
    fly.append(ripple);
    els.push(ripple);
    void run(ripple, [{ transform: 'scale(.4)', opacity: lightCap(ctx, 1) }, { transform: 'scale(1.5)', opacity: 0 }], 420 * S, 'ease-out');
    const shards: Promise<void>[] = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const p = (a: number): string => `${(50 + Math.cos(a) * 90).toFixed(0)}% ${(50 + Math.sin(a) * 90).toFixed(0)}%`;
      const w2 = document.createElement('div');
      w2.innerHTML = cardHtml(neg.cardId);
      const sh = w2.firstElementChild as HTMLElement;
      sh.removeAttribute('aria-label');
      sh.style.left = `${x}px`;
      sh.style.top = `${y}px`;
      sh.style.clipPath = `polygon(${48 + Math.random() * 4}% ${48 + Math.random() * 4}%, ${p(a0)}, ${p(a1)})`;
      fly.append(sh);
      els.push(sh);
      const mid = (a0 + a1) / 2, dist = 120 + Math.random() * 90;
      const dx = Math.cos(mid) * dist, dy = Math.sin(mid) * dist + 60;
      const rot = (Math.random() - 0.5) * 300;
      shards.push(run(sh, [
        { transform: 'scale(1.15) rotate(3deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(.9) rotate(${rot}deg)`, opacity: 0 },
      ], 620 * S, 'cubic-bezier(.1,.7,.3,1)'));
    }
    await Promise.all(shards);
    await ctx.wait(200);
    // 鏡は静かに消える
    await run(mirror, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.1)', opacity: 0 }], 300 * S, 'ease-in');
  } finally {
    for (const el of els) el.remove();
    dim(ctx, 0);
  }
}

// ---------- 成り封じ ----------

/** 紅の角判「封」（筆文字の字体が読み込めていれば Yuji Boku） */
function sealMesh(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = PALS.wana;
  // 判のふちは少しかすれさせる
  g.beginPath(); g.moveTo(22, 26); g.lineTo(232, 18); g.lineTo(238, 230); g.lineTo(18, 236); g.closePath(); g.fill();
  g.strokeStyle = PALS.gofun; g.lineWidth = 7; g.strokeRect(40, 40, 176, 176);
  g.fillStyle = PALS.gofun; g.font = '160px "Yuji Boku", "Shippori Mincho B1", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('封', 128, 136);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 60; i++) {
    g.fillStyle = rgba(PAL.sumi, 0.5 + Math.random() * 0.5);
    g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = 10;
  return m;
}

async function narifuuji(ctx: FxCtx, cue: TrapFireCue): Promise<void> {
  const e = effect(cue, 'promotionBlocked');
  if (!e) return;
  const sq = squareOf(ctx.before, e.pieceId);
  const m = pieceMesh(e.pieceId);
  if (!sq || !m) return;
  const at = squarePos(sq);
  // 判の字体を待つ（読み込み済みならすぐ。長くは待たない）
  try {
    await Promise.race([document.fonts?.load('160px "Yuji Boku"'), ctx.wait(250)]);
  } catch { /* 字体がなければ代わりの字体で描く */ }
  await cameraTo(ctx, at, 450);
  const y0 = m.position.y, rz = m.rotation.z;
  // 駒が成ろうと裏返りかける
  await ctx.tween(300, (t) => {
    m.position.y = y0 + 0.55 * t;
    m.rotation.z = rz + Math.PI * 0.62 * t;
  }, easeOut);
  // 紅の「封」の判が叩きつけられる
  const seal = sealMesh();
  const cam = ctx.stage.camera;
  const top = at.clone().setY(3.2), hit = at.clone().setY(y0 + 0.75);
  const kill = transient(ctx, seal, 60000, () => { seal.quaternion.copy(cam.quaternion); });
  try {
    await ctx.tween(150, (t) => {
      seal.position.lerpVectors(top, hit, t);
      seal.scale.setScalar(2.4 - 1.4 * t);
    }, (t) => t * t);
    flash(ctx, PALS.wana, 0.4, 220);
    shakeBy(ctx, 0.32);
    // 駒は表に戻って落ちる（少し弾む）
    await ctx.tween(240, (t) => {
      m.rotation.z = rz + Math.PI * 0.62 * (1 - t);
      m.position.y = y0 + 0.55 * (1 - t) + Math.sin(Math.PI * t) * 0.08;
      seal.scale.setScalar(1 + Math.sin(Math.PI * t) * 0.08);
    }, easeOut);
    m.rotation.z = rz;
    m.position.y = y0;
    await ctx.wait(450);
    await ctx.tween(300, (t) => { seal.material.opacity = 1 - t; });
  } finally {
    kill();
  }
}

export const TRAP_FX: Record<TrapName, (ctx: FxCtx, cue: TrapFireCue) => Promise<void>> = {
  otoshiana, kagami, narifuuji,
};
