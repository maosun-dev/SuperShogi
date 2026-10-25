// 伍「屋台崩し」（歌舞伎の大仕掛け：舞台の建物が一気に崩れる見せ場）：
// 王を取った一撃で、王のマスから盤にひびが走り、舞台全体がぐらりと揺れる。
// 後ろの舞台の絵（背景の3枚）がいくつかに割れて崩れ落ち、土ぼこりが舞う。崩れた向こうに紅の幕が現れ、
// 桜吹雪がどっと降る中、王の駒は弾き飛ばされて盤の外へ落ちる。
// 背景の絵は複製を崩し、本物は隠すだけ。片付け（resetStagecraft）で必ず元に戻す
import * as THREE from 'three';
import { PAL, PALS, rgba } from '../../view/palette';
import { decal } from '../../view/board3d';
import { animateEl, cameraHome, cameraTo, flash, later, puff, shakeBy, transient, type FxCtx } from '../kit';
import { onStageReset } from '../stagecraft';
import { getSound } from '../sound';
import { fadeable, petalStorm, settleTaker, takerAlong, type KingCapture } from './common';

const HIT_MS = 380;     // 取る駒が叩きつける
const FALL_MS = 1500;   // 背景が崩れ落ちる

/** 王のマスから放射状に走るひび（盤に寝かせた絵） */
function cracks(ctx: FxCtx, at: THREE.Vector3): void {
  const m = decal((g) => {
    g.strokeStyle = rgba(PAL.sumi, 0.9);
    g.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      let a = (i / 11) * Math.PI * 2 + Math.random() * 0.3, x = 128, y = 128;
      g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 7; j++) {
        a += (Math.random() - 0.5) * 0.7;
        const r = 9 + Math.random() * 12;
        x += Math.cos(a) * r; y += Math.sin(a) * r;
        g.lineTo(x, y);
        g.lineWidth = Math.max(0.8, g.lineWidth * 0.82);
      }
      g.stroke();
    }
  }, 6, 6);
  m.position.set(at.x, 0.007, at.z);
  const LIFE = 9000;
  transient(ctx, m, LIFE, (_dt, age) => {
    m.scale.setScalar(Math.min(1, 0.15 + age / 260));
    m.material.opacity = Math.min(1, (LIFE - age) / 1500);
  });
}

/** 背景の絵を割って崩す。紅の幕を後ろに敷き、本物の絵は隠す。戻すのは onStageReset に預ける */
async function collapseBackdrop(ctx: FxCtx): Promise<void> {
  const box = document.getElementById('backdrop');
  if (!box || !box.parentElement) return;
  const ambient = document.getElementById('ambient');
  const layer = document.createElement('div');
  layer.className = 'yatai-fall';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none';
  // 崩れた向こうの紅の幕（ひだの縞）
  const curtain = document.createElement('div');
  curtain.style.cssText = `position:absolute;inset:0;background:repeating-linear-gradient(90deg,${PALS.wanaDeep} 0 22px,${PALS.makuBeni} 22px 34px,${PALS.wanaDeep} 34px 56px)`;
  layer.append(curtain);
  // 背景を斜めのぎざぎざで3つに割る（左・真ん中・右）
  const cuts = [
    'polygon(0 0, 38% 0, 30% 34%, 41% 58%, 28% 100%, 0 100%)',
    'polygon(38% 0, 66% 0, 58% 40%, 70% 66%, 61% 100%, 28% 100%, 41% 58%, 30% 34%)',
    'polygon(66% 0, 100% 0, 100% 100%, 61% 100%, 70% 66%, 58% 40%)',
  ];
  const pieces = cuts.map((clip) => {
    const p = document.createElement('div');
    p.style.cssText = `position:absolute;inset:0;clip-path:${clip}`;
    for (const img of box.querySelectorAll('img')) p.append(img.cloneNode(true));
    layer.append(p);
    return p;
  });
  box.after(layer);
  box.style.visibility = 'hidden';
  if (ambient) ambient.style.visibility = 'hidden';
  onStageReset(() => {
    layer.remove();
    box.style.visibility = '';
    if (ambient) ambient.style.visibility = '';
  });
  // 左は左へ、右は右へ倒れ、真ん中はそのまま沈む。少しずつずらして
  const moves = [
    { origin: '0% 100%', rot: -38, x: -12, delay: 120 },
    { origin: '50% 100%', rot: 6, x: 0, delay: 0 },
    { origin: '100% 100%', rot: 34, x: 12, delay: 220 },
  ];
  await Promise.all(pieces.map((p, i) => {
    const m = moves[i];
    p.style.transformOrigin = m.origin;
    return animateEl(ctx, p, [
      { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
      { transform: `translate(${m.x * 0.1}%, 1%) rotate(${m.rot * 0.08}deg)`, offset: 0.25 },
      { transform: `translate(${m.x}%, 115%) rotate(${m.rot}deg)`, offset: 1 },
    ], { duration: FALL_MS * ctx.timing.scale, delay: m.delay * ctx.timing.scale, easing: 'cubic-bezier(.55,0,.9,.5)' });
  }));
  // 幕だけが残る。結果画面への幕まで少し沈めておく（筆文字が読めるように）
  void animateEl(ctx, curtain, [{ filter: 'brightness(1)' }, { filter: 'brightness(.45)' }], { duration: 900 * ctx.timing.scale }).catch(() => {});
}

export async function yatai(ctx: FxCtx, k: KingCapture): Promise<void> {
  await cameraTo(ctx, k.at, 600);
  // 1. 叩きつける：盤にひびが走り、舞台がぐらりと揺れる
  if (k.taker && k.from) await ctx.tween(HIT_MS, (u) => takerAlong(k, u, 1.4), (u) => u * u * u);
  settleTaker(k);
  getSound().play('naguru');
  getSound().play('drum');
  flash(ctx, PALS.hakkou, 0.8, 240);
  shakeBy(ctx, 1);
  cracks(ctx, k.at);
  getSound().play('shatter', { gain: 0.7 });
  await ctx.wait(500);
  // 2. 引いて舞台ぜんたいを見せ、背景が崩れ落ちる
  const camOut = later(cameraHome(ctx, 700));
  getSound().play('bakuhatsu');
  shakeBy(ctx, 1.2);
  const fall = later(collapseBackdrop(ctx));
  for (const x of [-4.2, 0, 4.2]) puff(ctx, new THREE.Vector3(x, 0, -5.6 * (ctx.me === 'sente' ? 1 : -1)), PAL.smokeShade, 50, 2.4);
  await ctx.wait(450);
  getSound().play('shatter', { gain: 0.6 });
  shakeBy(ctx, 0.8);
  await camOut;
  await fall;
  // 3. 桜吹雪がどっと降り、王は弾き飛ばされて盤の外へ落ちる
  getSound().play('kirakira', { gain: 0.7 });
  petalStorm(ctx, { mode: 'rain', center: new THREE.Vector3(), colors: [PALS.sakura, PALS.sakura, PALS.gofun], n: 240, size: 0.22, life: 5200, area: 6.5, height: 6 });
  const king = k.king;
  if (king) {
    const mats = fadeable(king);
    const p0 = king.position.clone(), r0 = king.rotation.clone();
    const out = k.at.clone().sub(k.from ?? new THREE.Vector3()).setY(0);
    if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
    out.normalize();
    getSound().play('komaHard');
    await ctx.tween(1100, (u) => {
      king.position.set(p0.x + out.x * 6 * u, p0.y + 2.4 * Math.sin(Math.PI * u * 0.8) - 4 * u * u, p0.z + out.z * 6 * u);
      king.rotation.set(r0.x + 7 * u, r0.y + 3 * u, r0.z + 5 * u);
      for (const m of mats) m.opacity = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    }, (u) => u);
    king.visible = false;
  }
  await cameraTo(ctx, k.at, 900);
  await ctx.wait(700);
}
