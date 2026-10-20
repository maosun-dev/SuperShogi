// 装備4枚の演出。共通の流れ（札が飛ぶ → 短いカットイン（金の帯 600ms）→ 金の光の柱が駒に降りる（700ms）
// → 足元に金の六角形が現れる。以降の六角形は sync が出し続ける）と、カードごとの飾り（EQUIP_FX）。
// 鋼の鎧が守った瞬間（playArmor）と、韋駄天の2回目の移動（playSecond）もここ。
// 決まり：駒の形・材質は共有なので、残像や光は形を複製して作り、材質は新しく作るか複製する
import * as THREE from 'three';
import { CARDS } from '../cards';
import type { Cue } from './plan';
import { PAL, PALS, rgba } from '../view/palette';
import { ring, squarePos } from '../view/board3d';
import { pieceMesh, sync } from '../view/pieces3d';
import { cameraHome, cameraTo, cardFly, cutIn, easeInOut, easeOut, flash, lightCap, puff, shakeBy, transient, type FxCtx } from './kit';
import { squareOf } from './trap';

type EquipCue = Extract<Cue, { kind: 'equip' }>;
type ArmorCue = Extract<Cue, { kind: 'armor' }>;
type SecondCue = Extract<Cue, { kind: 'second' }>;
type EquipName = 'tenma' | 'hagane' | 'tate' | 'idaten';

const PILLAR_MS = 700;
const PILLAR_H = 9;

/** 縦の帯の模様：下ほど明るく、上へ薄れる（使うたびに作る。片付けで模様ごと捨てるため） */
function columnTexture(color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 8; c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, rgba(PAL.soubiPale, 1));
  gr.addColorStop(0.25, rgba(color, 0.8));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 金の光の柱が駒に降りる（700ms）。天から落ちてきて、細くなって消える */
async function pillar(ctx: FxCtx, at: THREE.Vector3): Promise<void> {
  const grp = new THREE.Group();
  const mk = (r: number, opacity: number, color: number): THREE.MeshBasicMaterial => {
    const mat = new THREE.MeshBasicMaterial({
      map: columnTexture(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, PILLAR_H, 32, 1, true), mat);
    m.position.y = PILLAR_H / 2;
    grp.add(m);
    return mat;
  };
  // 光の濃さ（動きを減らす設定では flashMax まで）
  const OUTER = lightCap(ctx, 0.45), CORE = lightCap(ctx, 0.75), GLOW = lightCap(ctx, 0.6);
  const outer = mk(0.62, OUTER, PAL.soubiLight);
  const core = mk(0.24, CORE, PAL.soubiPale);
  // 足元の光だまり
  const glow = ring(0.05, 0.9, PAL.soubiLight, 48);
  glow.position.y = 0.02;
  glow.material.blending = THREE.AdditiveBlending;
  glow.material.opacity = 0;
  grp.add(glow);
  grp.position.set(at.x, PILLAR_H * 1.4, at.z);
  const kill = transient(ctx, grp, 60000); // 片付けはこの関数の最後
  try {
    // 天から落ちてくる
    await ctx.tween(220, (t) => { grp.position.y = PILLAR_H * 1.4 * (1 - t); }, (t) => t * t);
    flash(ctx, PALS.soubiPale, 0.35, 200);
    // しばらく光り、細くなって消える
    await ctx.tween(PILLAR_MS - 220, (t) => {
      const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      const thin = t < 0.6 ? 1 : 1 - 0.85 * ((t - 0.6) / 0.4);
      grp.children[0].scale.set(thin, 1, thin);
      grp.children[1].scale.set(thin, 1, thin);
      outer.opacity = OUTER * fade;
      core.opacity = CORE * fade;
      glow.material.opacity = GLOW * Math.sin(Math.PI * Math.min(1, t * 1.3));
    });
  } finally {
    kill();
  }
}

/** 足元に六角形が現れたことを知らせる、広がって消える金の六角形 */
function hexBurst(ctx: FxCtx, at: THREE.Vector3): void {
  const r = ring(0.5, 0.68, PAL.soubiPale, 6);
  r.position.set(at.x, 0.03, at.z);
  r.material.blending = THREE.AdditiveBlending;
  const LIFE = 520;
  transient(ctx, r, LIFE, (_dt, age) => {
    const t = Math.min(1, age / LIFE);
    const s = 1 + easeOut(t) * 1.4;
    r.scale.set(s, s, s);
    r.rotation.z = t * 0.6;
    r.material.opacity = lightCap(ctx, 0.95) * (1 - t);
  });
}

// ---------- カードごとの飾り（光の柱と同時に流れる） ----------

/** 天馬の蹄：光の柱の中を羽が舞い降りる */
async function tenma(ctx: FxCtx, at: THREE.Vector3): Promise<void> {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const g = c.getContext('2d')!;
  // 羽の形（軸と、片側がふくらんだ羽根）
  g.fillStyle = PALS.gofun;
  g.beginPath(); g.moveTo(16, 2); g.quadraticCurveTo(29, 12, 17, 30); g.quadraticCurveTo(5, 14, 16, 2); g.fill();
  g.strokeStyle = PALS.soubi; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(16, 4); g.lineTo(17, 30); g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const N = 34, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3);
  const seed: { a: number; r: number; y: number; v: number; w: number }[] = [];
  for (let i = 0; i < N; i++) {
    const s = { a: Math.random() * Math.PI * 2, r: 0.15 + Math.random() * 0.55, y: 1 + Math.random() * 5, v: 1.4 + Math.random() * 1.6, w: 1 + Math.random() * 2 };
    seed.push(s);
    arr.set([at.x, s.y, at.z], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ map: tex, size: 0.36, transparent: true, opacity: 0, depthWrite: false });
  const LIFE = 1500 * ctx.timing.scale;
  transient(ctx, new THREE.Points(geo, pm), LIFE, (dt, age) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      s.y = Math.max(0.08, s.y - s.v * dt);
      s.a += s.w * dt;
      pos.setXYZ(i, at.x + Math.cos(s.a) * s.r, s.y, at.z + Math.sin(s.a) * s.r);
    }
    pos.needsUpdate = true;
    const t = age / LIFE;
    pm.opacity = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.6) / 0.4);
  });
  await ctx.wait(PILLAR_MS);
}

/** 鋼の鎧：駒の表面に鉄色の光がひと筋走る（本体の材質は複製して光らせ、最後に戻す） */
async function hagane(ctx: FxCtx, _at: THREE.Vector3, pieceId: number): Promise<void> {
  const m = pieceMesh(pieceId);
  const body = m?.children[0] as THREE.Mesh | undefined;
  if (!m || !body) { await ctx.wait(PILLAR_MS); return; }
  // 光の柱が細くなってから走らせる（柱の中だと光に埋もれて見えないため）
  await ctx.wait(PILLAR_MS * 0.8);
  const orig = body.material as THREE.MeshStandardMaterial;
  const mat = orig.clone();
  mat.emissive = new THREE.Color(PAL.haganeSteel);
  mat.emissiveIntensity = 0;
  body.material = mat;
  // 光のすじ：駒の上を斜めに横切る細い板（駒の組の子にして、駒と一緒に向く）
  const s = (m.userData.s as number | undefined) ?? 1;
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.1 * s, 1.3 * s),
    new THREE.MeshBasicMaterial({ color: PAL.hakkou, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  bar.rotation.set(-Math.PI / 2, 0, 0.6);
  bar.position.y = 0.16 * s + 0.04;
  m.add(bar);
  try {
    await ctx.tween(520, (t) => {
      bar.position.x = (-0.5 + t) * 0.9 * s;
      bar.material.opacity = Math.sin(Math.PI * t) * lightCap(ctx, 0.95);
      mat.emissiveIntensity = Math.sin(Math.PI * t) * 1.2 * (lightCap(ctx, 0.9) / 0.9);
    }, easeInOut);
  } finally {
    m.remove(bar);
    bar.geometry.dispose();
    bar.material.dispose();
    if (body.material === mat) body.material = orig;
    mat.dispose();
  }
}

/** 王の盾：駒の周り3×3に金の薄い半球が一瞬かかる */
async function tate(ctx: FxCtx, at: THREE.Vector3): Promise<void> {
  await ctx.wait(PILLAR_MS * 0.5);
  const grp = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.65, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PAL.soubiLight, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const wire = new THREE.Mesh(new THREE.SphereGeometry(1.66, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PAL.soubiPale, wireframe: true, transparent: true, opacity: 0, depthWrite: false }));
  const base = ring(1.55, 1.7, PAL.soubiLight, 48);
  base.position.y = 0.02;
  grp.add(shell, wire, base);
  grp.position.set(at.x, 0, at.z);
  const kill = transient(ctx, grp, 60000);
  try {
    await ctx.tween(200, (t) => {
      grp.scale.setScalar(0.3 + 0.7 * t);
      (shell.material as THREE.MeshBasicMaterial).opacity = 0.32 * t;
      (wire.material as THREE.MeshBasicMaterial).opacity = lightCap(ctx, 0.7) * t;
      base.material.opacity = lightCap(ctx, 0.9) * t;
    }, easeOut);
    await ctx.wait(160);
    await ctx.tween(320, (t) => {
      (shell.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - t);
      (wire.material as THREE.MeshBasicMaterial).opacity = lightCap(ctx, 0.7) * (1 - t);
      base.material.opacity = lightCap(ctx, 0.9) * (1 - t);
    });
  } finally {
    kill();
  }
}

/** 韋駄天：足元から風の筋が巻き上がる */
async function idaten(ctx: FxCtx, at: THREE.Vector3): Promise<void> {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, rgba(PAL.gofun, 0)); gr.addColorStop(0.2, rgba(PAL.gofun, 0.95));
  gr.addColorStop(0.5, rgba(PAL.soubiLight, 0.7)); gr.addColorStop(1, rgba(PAL.soubiLight, 0));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(8, 0); g.quadraticCurveTo(16, 40, 11, 128); g.lineTo(5, 128); g.quadraticCurveTo(0, 40, 8, 0); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  grp.position.set(at.x, 0, at.z);
  const streaks: { m: THREE.Mesh; a: number; r: number; d: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.1), mat);
    grp.add(m);
    streaks.push({ m, a: (i / 6) * Math.PI * 2, r: 0.5 + (i % 2) * 0.15, d: i * 0.06 });
  }
  const kill = transient(ctx, grp, 60000);
  puff(ctx, at, PAL.kayaLight, 30, 1.5);
  try {
    await ctx.tween(PILLAR_MS + 200, (t) => {
      for (const s of streaks) {
        const u = Math.min(1, Math.max(0, (t - s.d) / (1 - s.d)));
        const a = s.a + u * Math.PI * 3;
        s.m.position.set(Math.cos(a) * s.r * (1 - u * 0.3), 0.3 + u * 1.9, Math.sin(a) * s.r * (1 - u * 0.3));
        s.m.rotation.set(0, -a, 0.5);
        (s.m.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * u) * lightCap(ctx, 0.9);
      }
    });
  } finally {
    kill();
  }
}

export const EQUIP_FX: Record<EquipName, (ctx: FxCtx, cue: EquipCue) => Promise<void>> = {
  tenma: (ctx, cue) => withAt(ctx, cue, (at) => tenma(ctx, at)),
  hagane: (ctx, cue) => withAt(ctx, cue, (at) => hagane(ctx, at, cue.pieceId)),
  tate: (ctx, cue) => withAt(ctx, cue, (at) => tate(ctx, at)),
  idaten: (ctx, cue) => withAt(ctx, cue, (at) => idaten(ctx, at)),
};

function withAt(ctx: FxCtx, cue: EquipCue, fn: (at: THREE.Vector3) => Promise<void>): Promise<void> {
  const sq = squareOf(ctx.after, cue.pieceId);
  return sq ? fn(squarePos(sq)) : Promise.resolve();
}

/** 装備の共通の流れ */
export async function playEquip(ctx: FxCtx, cue: EquipCue): Promise<void> {
  const def = CARDS[cue.cardId];
  const fly = cardFly(ctx, cue.cardId, cue.side === ctx.me ? 'me' : 'foe');
  try {
    const sq = squareOf(ctx.after, cue.pieceId);
    await ctx.wait(220);
    flash(ctx, PALS.soubiPale, 0.5, 180);
    const cam = sq ? cameraTo(ctx, squarePos(sq), 520) : Promise.resolve();
    await cutIn(ctx, def.name, `装備・コスト${def.cost}`, 'soubi', 600);
    await cam;
    if (!sq) return;
    const at = squarePos(sq);
    const extra = EQUIP_FX[def.fx as EquipName];
    await Promise.all([pillar(ctx, at), extra ? extra(ctx, cue) : Promise.resolve()]);
    // 足元に六角形が現れる（ここから先は sync が出し続ける）
    sync(ctx.stage, ctx.after, ctx.me);
    hexBurst(ctx, at);
    await ctx.wait(600);
    await cameraHome(ctx, 700);
  } finally {
    await fly;
  }
}

// ---------- 鋼の鎧が守った ----------

/** 六角形が6つのかけらに割れて飛び散る */
function hexShatter(ctx: FxCtx, at: THREE.Vector3): void {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: PAL.soubiLight, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  const parts: { m: THREE.Mesh; v: THREE.Vector3; av: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const th = (k * Math.PI) / 3;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 1, 1, th, Math.PI / 3), mat);
    m.rotation.x = -Math.PI / 2;
    grp.add(m);
    const mid = th + Math.PI / 6; // 板を寝かせると (x, y) → (x, 0, -y)
    const dir = new THREE.Vector3(Math.cos(mid), 0, -Math.sin(mid));
    parts.push({ m, v: dir.multiplyScalar(2 + Math.random() * 1.5).setY(2.5 + Math.random() * 2), av: (Math.random() - 0.5) * 14 });
  }
  grp.position.set(at.x, 0.03, at.z);
  const LIFE = 1000;
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const p of parts) {
      p.v.y -= 12 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0) { p.m.position.y = 0; p.v.y *= -0.3; p.v.x *= 0.6; p.v.z *= 0.6; }
      p.m.rotation.y += p.av * dt;
    }
    mat.opacity = 0.95 * Math.max(0, 1 - age / LIFE);
  });
}

/** 金属の火花 */
function sparks(ctx: FxCtx, at: THREE.Vector3, back: THREE.Vector3): void {
  const N = 110, geo = new THREE.BufferGeometry(), arr = new Float32Array(N * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < N; i++) {
    arr.set([at.x, at.y, at.z], i * 3);
    const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().add(back.clone().multiplyScalar(0.8));
    v.push(d.normalize().multiplyScalar(3 + Math.random() * 6));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pm = new THREE.PointsMaterial({ color: PAL.soubiPale, size: 0.1, transparent: true, opacity: lightCap(ctx, 1), blending: THREE.AdditiveBlending, depthWrite: false });
  transient(ctx, new THREE.Points(geo, pm), 800, (dt) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      v[i].y -= 14 * dt;
      pos.setXYZ(i, pos.getX(i) + v[i].x * dt, Math.max(0.02, pos.getY(i) + v[i].y * dt), pos.getZ(i) + v[i].z * dt);
    }
    pos.needsUpdate = true;
    pm.opacity = Math.max(0, pm.opacity - dt * 1.4);
  });
}

/** 鋼の鎧が守った：攻めた駒が突っ込んで弾き返され、金属の火花と揺れ。六角形が割れて消える */
export async function playArmor(ctx: FxCtx, cue: ArmorCue): Promise<void> {
  const from = squareOf(ctx.before, cue.attackerId);
  const atk = pieceMesh(cue.attackerId);
  const def = pieceMesh(cue.defenderId);
  const b = squarePos(cue.at);
  try {
    await cameraTo(ctx, b, 450);
    if (!from || !atk) return;
    const a = squarePos(from);
    const y0 = atk.position.y;
    const reach = 0.62; // 相手のマスの手前で止められる
    await ctx.tween(200, (t) => {
      atk.position.set(a.x + (b.x - a.x) * reach * t, y0 + Math.sin(Math.PI * t) * 0.12, a.z + (b.z - a.z) * reach * t);
    }, (t) => t * t);
    // ぶつかる
    const hit = a.clone().lerp(b, 0.78).setY(0.35);
    const backDir = a.clone().sub(b).normalize();
    sparks(ctx, hit, backDir);
    flash(ctx, PALS.hakkou, 0.6, 140);
    shakeBy(ctx, 0.38);
    const dx0 = def?.position.x ?? 0;
    // 守った駒が小さく震え、六角形が割れる
    const eqGrp = def?.children.find((c) => (c as THREE.Group).isGroup);
    if (eqGrp) eqGrp.visible = false; // 片付けは sync（鎧が外れた局面で消える）
    hexShatter(ctx, b);
    const sx = atk.position.x, sz = atk.position.z;
    await ctx.tween(340, (t) => {
      if (def) def.position.x = dx0 + Math.sin(t * Math.PI * 6) * 0.05 * (1 - t);
      atk.position.set(sx + (a.x - sx) * t, y0 + Math.sin(Math.PI * t) * 0.3, sz + (a.z - sz) * t);
    }, easeOut);
    if (def) def.position.x = dx0;
    atk.position.set(a.x, y0, a.z);
    await ctx.wait(350);
  } finally {
    await cameraHome(ctx, 600);
  }
}

// ---------- 韋駄天の2回目 ----------

/** 速く（120ms）動き、通った跡に駒の残像を3つ残して消す */
export async function playSecond(ctx: FxCtx, cue: SecondCue): Promise<void> {
  const m = pieceMesh(cue.pieceId);
  const body = m?.children[0] as THREE.Mesh | undefined;
  if (!m || !body) return;
  const a = squarePos(cue.from), b = squarePos(cue.to), y0 = m.position.y;
  const marks = [0.25, 0.5, 0.75];
  let next = 0;
  const ghost = (): void => {
    // 形は複製（共有の形を捨てないため）、材質は新しく作る
    const mat = new THREE.MeshBasicMaterial({ color: PAL.soubiLight, transparent: true, opacity: 0.55, depthWrite: false });
    const g = new THREE.Mesh(body.geometry.clone(), mat);
    g.position.copy(m.position);
    g.rotation.copy(m.rotation);
    const LIFE = 380 * Math.max(0.5, ctx.timing.scale);
    transient(ctx, g, LIFE, (_dt, age) => { mat.opacity = 0.55 * Math.max(0, 1 - age / LIFE); });
  };
  await ctx.stage.tween(120, (t) => {
    m.position.set(a.x + (b.x - a.x) * t, y0, a.z + (b.z - a.z) * t);
    while (next < marks.length && t >= marks[next]) { ghost(); next++; }
  }, easeOut);
  while (next < marks.length) { ghost(); next++; }
  puff(ctx, b, PAL.kayaLight, 22, 1.1);
}
