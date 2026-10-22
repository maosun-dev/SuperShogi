// 押し返しの風（コスト1・約2.5秒）
// 前振り：カメラが低く横から見る。盤の上を木の葉（紅葉と銀杏）がさっと流れる
// 見せ場：藍の突風が吹き抜け、駒がずずっと押し戻される（木の粉が散り、駒がぐらっと傾いて戻る）
// 余韻：木の葉が舞い残る。続けて指せるので短く切り上げる
import * as THREE from 'three';
import { PAL, rgba } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { pieceMesh } from '../../view/pieces3d';
import { easeOut, later, puff, shakeBy, transient, type FxCtx } from '../kit';
import { cameraLow } from '../stagecraft';
import { getSound } from '../sound';
import { effect, type CardFx, type MagicCue } from './types';

/** 葉の模様：紅葉（5つの尖り）と銀杏（扇）を1枚の絵に並べ、板ごとに半分を使う */
function leafTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  // 紅葉
  g.fillStyle = rgba(PAL.wana, 1);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 11 : 28;
    const x = 32 + Math.cos(a) * r, y = 34 + Math.sin(a) * r;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath(); g.fill();
  g.strokeStyle = rgba(PAL.wanaDeep, 1); g.lineWidth = 2; g.beginPath(); g.moveTo(32, 36); g.lineTo(32, 62); g.stroke();
  // 銀杏
  g.fillStyle = rgba(PAL.soubiLight, 1);
  g.beginPath(); g.moveTo(96, 54); g.arc(96, 54, 30, -Math.PI * 0.85, -Math.PI * 0.15); g.closePath(); g.fill();
  g.fillStyle = rgba(PAL.soubi, 1); g.fillRect(95, 50, 2, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 木の葉が風下（dir の向き）へ流れる。n 枚、life ミリ秒。舞い残る葉はゆっくり落ちる。
 * at は流れの中心、spread は横の広がり
 */
function leaves(ctx: FxCtx, at: THREE.Vector3, dir: number, n: number, life: number, speed: number): void {
  const tex = leafTexture();
  const grp = new THREE.Group();
  const ls: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; ph: number }[] = [];
  for (let i = 0; i < n; i++) {
    const geo = new THREE.PlaneGeometry(0.26, 0.26);
    // 紅葉か銀杏か（模様の左右半分）
    const u0 = i % 3 === 0 ? 0.5 : 0;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, u0 + uv.getX(k) * 0.5);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(at.x + (Math.random() - 0.5) * 4, 0.2 + Math.random() * 1.1, at.z - dir * (3 + Math.random() * 3));
    grp.add(m);
    ls.push({
      m,
      v: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, dir * speed * (0.7 + Math.random() * 0.6)),
      spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
      ph: Math.random() * 6,
    });
  }
  const LIFE = life * Math.max(0.6, ctx.timing.scale);
  transient(ctx, grp, LIFE, (dt, age) => {
    for (const l of ls) {
      // 風が弱まると、ひらひら落ちてくる
      l.v.z *= 1 - dt * 1.2;
      l.v.y = -0.25 + Math.sin(age / 180 + l.ph) * 0.35;
      l.m.position.addScaledVector(l.v, dt);
      l.m.position.y = Math.max(0.04, l.m.position.y);
      l.m.rotation.x += l.spin.x * dt; l.m.rotation.y += l.spin.y * dt; l.m.rotation.z += l.spin.z * dt;
      (l.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (LIFE - age) / 500);
    }
  });
}

/** 突風の帯の模様：先は細く明るく、尾は藍で薄れる（使うたびに作る） */
function windTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 32; c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, rgba(PAL.gofun, 0));
  gr.addColorStop(0.12, rgba(PAL.gofun, 0.95));
  gr.addColorStop(0.35, rgba(PAL.mahou, 0.9));
  gr.addColorStop(1, rgba(PAL.mahou, 0));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(16, 0); g.quadraticCurveTo(32, 60, 26, 256); g.lineTo(6, 256); g.quadraticCurveTo(0, 60, 16, 0); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 押される向き（奥が -z）。動かない向きなら奥へ */
function pushDir(cue: MagicCue): number {
  const e = effect(cue, 'pushed');
  if (!e) return -1;
  return Math.sign(squarePos(e.to).z - squarePos(e.from).z) || -1;
}

export const oshikaeshi: CardFx<MagicCue> = {
  nameMs: 800,
  async pre(ctx, cue) {
    const e = effect(cue, 'pushed');
    if (!e) return;
    const a = squarePos(e.from);
    const dir = pushDir(cue);
    const cam = later(cameraLow(ctx, a, 520));
    getSound().play('wind', { gain: 0.45 });
    leaves(ctx, a, dir, 16, 2600, 7);
    await cam;
  },
  async main(ctx, cue) {
    const e = effect(cue, 'pushed');
    if (!e) return;
    const a = squarePos(e.from), b = squarePos(e.to);
    const dir = pushDir(cue);
    getSound().play('wind');
    leaves(ctx, a, dir, 22, 3200, 9);
    // 藍の突風が5本、押す向きへ吹き抜ける
    const tex = windTexture();
    const winds: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3.4), mat);
      m.rotation.x = -Math.PI / 2;
      if (dir > 0) m.rotation.z = Math.PI; // 帯の先を進む向きに
      const x = a.x + (i - 2) * 0.32, y = 0.25 + (i % 3) * 0.14;
      transient(ctx, m, 2400);
      m.position.set(x, y, a.z - dir * 5);
      winds.push(later(ctx.wait(i * 70).then(() => ctx.tween(420, (t) => {
        m.position.z = a.z + dir * (-5 + 10 * t);
        m.position.x = x + Math.sin(t * Math.PI * 2 + i) * 0.1;
        mat.opacity = Math.sin(Math.PI * t);
      }, (t) => t)).then(() => { mat.opacity = 0; })));
    }
    // 最初の帯が駒に届くころ、駒がずずっと押し戻される（風下へ傾き、戻る）
    await ctx.wait(190);
    const m = pieceMesh(e.pieceId);
    if (m) {
      const rx0 = m.rotation.x;
      const lean = m.rotation.y === 0 ? dir : -dir; // 後手の駒は向きが逆
      let dusted = 0;
      await ctx.tween(460, (t) => {
        // ずずっ：2段に分けて滑る
        const k = t < 0.5 ? easeOut(t * 2) * 0.62 : 0.62 + easeOut((t - 0.5) * 2) * 0.38;
        m.position.x = a.x + (b.x - a.x) * k;
        m.position.z = a.z + (b.z - a.z) * k;
        m.rotation.x = rx0 + Math.sin(Math.PI * t) * 0.3 * lean;
        if (dusted < 3 && t > dusted * 0.33) {
          dusted++;
          puff(ctx, new THREE.Vector3(m.position.x, 0, m.position.z - dir * 0.3), PAL.kayaLight, 14, 0.8);
        }
      });
      // ぐらっ：揺り戻して止まる
      await ctx.tween(220, (t) => { m.rotation.x = rx0 - Math.sin(Math.PI * t) * 0.1 * lean * (1 - t); });
      m.rotation.x = rx0;
    }
    getSound().play('komaHard', { gain: 0.6 });
    shakeBy(ctx, 0.16);
    await Promise.all(winds);
  },
  async after(ctx) {
    await ctx.wait(350);
  },
};
