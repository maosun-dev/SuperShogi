// 鏡の結界（コスト3・約4秒）「水鏡」
// 前振り：暗転し、盤の面が中央から一瞬で静かな水面に変わる（提灯の灯が揺れて映る）
// 見せ場：打ち消された相手の札が、読める向きのまま落ちてくる。水面に触れた瞬間「ちゃぽん」と波紋が盤じゅうに広がり、
//         札は水に沈んで溶ける（泡が上がる）
// 余韻：水面が引いて、盤に戻る
// 術札の演出（magic.ts）は打ち消されると名前ドンまでで止まり、続きをここで見せる
import * as THREE from 'three';
import type { CardId } from '../../rules/types';
import { CARDS } from '../../cards';
import { CARD_ART, KIND_MARK } from '../../view/cardArt';
import { BD, BW, ring } from '../../view/board3d';
import { PAL, PALS, rgba } from '../../view/palette';
import { cameraPush, easeInOut, easeOut, later, lightCap, puff, shakeBy, transient, type FxCtx } from '../kit';
import { brighten, darken } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type TrapFireCue } from './types';

const WATER_Y = 0.03;    // 水面の高さ（駒の足元が少し水に浸かる）
const CARD_W = 1.5;      // 落ちてくる札の大きさ
const CARD_H = CARD_W * 62 / 46;

// ---------- 水面 ----------

/** 水の模様：深い藍に、横に流れる淡い光と、奥の提灯の灯の映り（揺れる縦の筋） */
function waterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#1d3d6b'); gr.addColorStop(1, '#0a1730');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  // 提灯の灯の映り（奥＝上の側）
  for (const x of [90, 200, 312, 422]) {
    for (let k = 0; k < 9; k++) {
      g.fillStyle = rgba(PAL.kayaLight, 0.16 - k * 0.015);
      g.fillRect(x - 10 + Math.sin(k * 1.7) * 6, 30 + k * 26, 20, 14);
    }
  }
  // さざ波の淡い光
  g.strokeStyle = rgba(PAL.mahouPale, 0.12); g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const y = Math.random() * 512, x = Math.random() * 512, w = 30 + Math.random() * 90;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 中央から広がる丸い覆い（白い円・ふちはぼかし・外は黒）。repeat と offset で広がり具合を変える */
function revealTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 127);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.8, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

interface Water { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; reveal: THREE.Texture; spread(k: number): void; kill(): void }

function buildWater(ctx: FxCtx): Water {
  const map = waterTexture();
  const reveal = revealTexture();
  const mat = new THREE.MeshBasicMaterial({ map, alphaMap: reveal, transparent: true, opacity: 0.92, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.3, BD - 0.3), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 1;
  // k（0〜1）：中央の丸が盤いっぱいまで広がる
  const spread = (k: number): void => {
    const s = Math.max(0.001, k * 1.6);
    reveal.repeat.set(1 / s, 1 / s);
    reveal.offset.set(0.5 - 0.5 / s, 0.5 - 0.5 / s);
  };
  spread(0);
  // 水面はゆっくり流れて揺らめく
  let t0 = 0;
  const kill = transient(ctx, mesh, 60000, (dt) => {
    t0 += dt;
    map.offset.set(Math.sin(t0 * 0.6) * 0.01, t0 * 0.015);
  });
  return { mesh, reveal, spread, kill };
}

/** 波紋：細い輪が盤じゅうに広がって消える */
function ripple(ctx: FxCtx, at: THREE.Vector3, delay: number, maxR: number): void {
  const r = ring(0.2, 0.208, PAL.gofun, 96); // 細い輪（広げても線が太くなりすぎない）
  r.position.set(at.x, WATER_Y + 0.004, at.z);
  r.renderOrder = 2;
  r.material.opacity = 0;
  const LIFE = 1700 * Math.max(0.6, ctx.timing.scale);
  const D = delay * Math.max(0.6, ctx.timing.scale);
  transient(ctx, r, LIFE + D, (_dt, age) => {
    const t = Math.max(0, Math.min(1, (age - D) / LIFE));
    const k = 1 + easeOut(t) * maxR / 0.204;
    r.scale.set(k, k, k);
    r.material.opacity = t <= 0 ? 0 : lightCap(ctx, 0.55) * (1 - t) * (1 - t);
  });
}

/** 水しぶきと泡 */
function droplets(ctx: FxCtx, at: THREE.Vector3): void {
  const N = 50, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    arr.set([at.x, WATER_Y + 0.05, at.z], i * 3);
    const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.3;
    v.push(new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 2.5, Math.sin(a) * sp));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color: PAL.mahouPale, size: 0.09, transparent: true, opacity: lightCap(ctx, 0.95), depthWrite: false });
  transient(ctx, new THREE.Points(geo, pm), 900, (dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      v[i].y -= 9 * dt;
      pos.setXYZ(i, pos.getX(i) + v[i].x * dt, Math.max(WATER_Y, pos.getY(i) + v[i].y * dt), pos.getZ(i) + v[i].z * dt);
    }
    pos.needsUpdate = true;
    pm.opacity = lightCap(ctx, 0.95) * Math.max(0, 1 - age / 900);
  });
}

function bubbles(ctx: FxCtx, at: THREE.Vector3, life: number): void {
  const N = 26, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3);
  const seed: { x: number; z: number; y: number; v: number }[] = [];
  for (let i = 0; i < N; i++) {
    const s = { x: (Math.random() - 0.5) * 0.9, z: (Math.random() - 0.5) * 0.6, y: WATER_Y, v: 0.15 + Math.random() * 0.35 };
    seed.push(s);
    arr.set([at.x + s.x, s.y, at.z + s.z], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color: PAL.gofun, size: 0.06, transparent: true, opacity: 0, depthWrite: false });
  const LIFE = life * Math.max(0.6, ctx.timing.scale);
  transient(ctx, new THREE.Points(geo, pm), LIFE, (dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      s.y += s.v * dt;
      if (s.y > WATER_Y + 0.25) s.y = WATER_Y;
      pos.setXYZ(i, at.x + s.x, s.y, at.z + s.z);
    }
    pos.needsUpdate = true;
    const t = age / LIFE;
    pm.opacity = lightCap(ctx, 0.8) * Math.min(1, t * 5) * (1 - t);
  });
}

// ---------- 落ちてくる札（読める向きのまま） ----------

/** 札の表をキャンバスに描く（札の絵の SVG は読み込みを少しだけ待つ） */
async function cardCanvas(ctx: FxCtx, id: CardId): Promise<HTMLCanvasElement> {
  const def = CARDS[id];
  const kind = KIND_MARK[def.kind];
  const color = PALS[kind.color];
  const c = document.createElement('canvas'); c.width = 230; c.height = 310;
  const g = c.getContext('2d')!;
  const draw = (img: HTMLImageElement | null): void => {
    g.clearRect(0, 0, 230, 310);
    g.fillStyle = PALS.gofun; g.strokeStyle = color; g.lineWidth = 12;
    g.beginPath(); g.roundRect(8, 8, 214, 294, 12); g.fill(); g.stroke();
    if (img) g.drawImage(img, 24, 70, 140, 190);
    // コストの丸と札の名前（縦書き）と種類の判
    g.fillStyle = color; g.beginPath(); g.arc(40, 40, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = PALS.gofun; g.font = '800 26px "Shippori Mincho B1", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(def.cost), 40, 42);
    g.fillStyle = PALS.sumi; g.font = '800 30px "Shippori Mincho B1", serif';
    [...def.name].forEach((ch, i) => g.fillText(ch, 192, 46 + i * 32));
    g.fillStyle = PALS.wana; g.fillRect(170, 250, 36, 36);
    g.fillStyle = PALS.gofun; g.font = '800 24px "Shippori Mincho B1", serif'; g.fillText(kind.mark, 188, 269);
  };
  draw(null);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 62" width="140" height="190">${CARD_ART[id]}</svg>`;
  const img = new Image();
  const loaded = new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await Promise.race([loaded, ctx.wait(250)]);
  if (img.complete && img.naturalWidth > 0) draw(img);
  return c;
}

interface State { water: Water; card?: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; kill(): void } }
const states = new WeakMap<TrapFireCue, State>();

/** 札が落ちてくる所：盤の中央の少し手前 */
function centerOf(ctx: FxCtx): THREE.Vector3 {
  return new THREE.Vector3(0, WATER_Y, ctx.me === 'sente' ? 0.6 : -0.6);
}

export const kagami: CardFx<TrapFireCue> = {
  async pre(ctx, cue) {
    // 暗転し、盤の面が中央から一瞬で水面に変わる
    const cam = later(cameraPush(ctx, 0.12, 500));
    const dark = later(darken(ctx, null, 400, 0.3));
    const water = buildWater(ctx);
    states.set(cue, { water });
    getSound().play('frost', { gain: 0.35 });
    await ctx.tween(520, (t) => water.spread(easeOut(t)));
    await Promise.all([cam, dark]);
  },
  async main(ctx, cue) {
    const st = states.get(cue);
    if (!st) return;
    const neg = effect(cue, 'magicNegated');
    const at = centerOf(ctx);
    if (!neg) {
      // 打ち消す術がない（念のため）：水面に波紋がひとつ
      getSound().play('splash', { gain: 0.6 });
      ripple(ctx, at, 0, 4);
      await ctx.wait(700);
      return;
    }
    // 打ち消された札が、読める向きのまま落ちてくる（いつも画面に向け、水面より下は切り落とす）
    const tex = new THREE.CanvasTexture(await cardCanvas(ctx, neg.cardId));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y)],
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), mat);
    mesh.renderOrder = 3;
    const cam = ctx.stage.camera;
    let sway = 0;
    const kill = transient(ctx, mesh, 60000, () => { mesh.quaternion.copy(cam.quaternion); mesh.rotateZ(sway); });
    st.card = { mesh, kill };
    const top = 4.2, rest = WATER_Y + CARD_H / 2;
    getSound().play('whoosh', { gain: 0.4 });
    await ctx.tween(820, (t) => {
      mesh.position.set(at.x + Math.sin(t * Math.PI * 1.5) * 0.25, top + (rest - top) * easeInOut(t), at.z);
      sway = Math.sin(t * Math.PI * 2) * 0.12 * (1 - t);
    });
    sway = 0;
    // ちゃぽん：触れた瞬間、波紋が盤じゅうに広がる
    getSound().play('splash');
    shakeBy(ctx, 0.08);
    droplets(ctx, at);
    // 盤の中に収まる大きさまで（盤の幅の半分くらい）
    for (let i = 0; i < 5; i++) ripple(ctx, at, i * 170, 1.6 + i * 0.6);
    // 札は水に沈み、藍に染まって溶ける（泡が上がる）
    bubbles(ctx, at, 1600);
    await ctx.tween(1100, (t) => {
      mesh.position.y = rest - (CARD_H + 0.1) * easeInOut(t);
      mat.color.setRGB(1 - 0.55 * t, 1 - 0.4 * t, 1 - 0.1 * t);
      mat.opacity = 1 - 0.6 * t;
    });
    kill();
    st.card = undefined;
    getSound().play('splash', { gain: 0.3 });
    await ctx.wait(300);
  },
  async after(ctx, cue) {
    const st = states.get(cue);
    if (!st) return;
    // 水面が引いて、盤に戻る
    const light = later(brighten(ctx, 600));
    puff(ctx, centerOf(ctx), PAL.mahouPale, 18, 0.6);
    await ctx.tween(600, (t) => st.water.spread(1 - easeInOut(t)));
    await light;
  },
  cleanup(_ctx, cue) {
    const st = states.get(cue);
    st?.card?.kill();
    st?.water.kill();
    st?.water.reveal.dispose(); // 覆いの模様は片付けの対象外なのでここで捨てる
    states.delete(cue);
  },
};
