// 天馬の蹄（コスト2・付けるとき約2.5秒）
// 付けるとき：光の線で描いた天馬が駆けてきて、桂馬の跳び方（L字）に跳ねて駒に飛び込む。蹄の「カッカッ」
// 出番（桂馬の動きで跳ぶ手）：蹄の音と光の足跡
import * as THREE from 'three';
import { PAL, PALS, rgba } from '../../view/palette';
import { squarePos } from '../../view/board3d';
import { hoofprint } from '../../view/equipProps';
import { cameraTo, flash, later, lightCap, puff, transient, type FxCtx } from '../kit';
import { getSound } from '../sound';
import { squareOf, type EquipFx } from './types';

/** 光の線で描いた天馬（翼のある馬）の模様 */
function pegasusTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192;
  const g = c.getContext('2d')!;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const stroke = (w: number, color: string, blur: number): void => {
    g.strokeStyle = color; g.lineWidth = w; g.shadowColor = rgba(PAL.soubiLight, 1); g.shadowBlur = blur;
    // 胴と首と頭
    g.beginPath();
    g.moveTo(70, 112); g.bezierCurveTo(90, 92, 150, 92, 172, 104); // 背
    g.bezierCurveTo(186, 80, 192, 58, 206, 44);                    // 首
    g.lineTo(226, 54); g.lineTo(214, 66);                          // 頭
    g.bezierCurveTo(204, 86, 196, 112, 176, 126);                  // 喉と胸
    g.bezierCurveTo(140, 138, 100, 136, 70, 112);                  // 腹
    g.stroke();
    // 脚（駆ける形）
    g.beginPath();
    g.moveTo(166, 128); g.lineTo(186, 156); g.lineTo(200, 150);
    g.moveTo(150, 132); g.lineTo(140, 162); g.lineTo(150, 172);
    g.moveTo(96, 128); g.lineTo(74, 152); g.lineTo(60, 148);
    g.moveTo(84, 120); g.lineTo(76, 160); g.lineTo(86, 170);
    g.stroke();
    // 尾
    g.beginPath(); g.moveTo(70, 112); g.bezierCurveTo(50, 104, 40, 120, 26, 116); g.stroke();
    // 翼
    g.beginPath();
    g.moveTo(130, 98); g.bezierCurveTo(120, 60, 96, 30, 70, 18);
    g.moveTo(130, 98); g.bezierCurveTo(132, 64, 120, 40, 104, 26);
    g.moveTo(130, 98); g.bezierCurveTo(144, 70, 142, 48, 134, 32);
    g.stroke();
  };
  stroke(9, rgba(PAL.soubiLight, 0.55), 18);
  stroke(3.5, PALS.soubiPale, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 光の足跡を盤に1つ置き、life ミリ秒で消す */
function printAt(ctx: FxCtx, at: THREE.Vector3, life: number, rot = 0): void {
  const p = hoofprint(0.42, true);
  p.position.set(at.x, 0.02, at.z);
  p.rotation.z = rot;
  const LIFE = life * Math.max(0.6, ctx.timing.scale);
  transient(ctx, p, LIFE, (_dt, age) => {
    const t = age / LIFE;
    p.material.opacity = lightCap(ctx, 1) * Math.min(1, t * 8) * (1 - t);
  });
}

export const tenma: EquipFx = {
  async main(ctx, cue) {
    const sq = squareOf(ctx.after, cue.pieceId);
    if (!sq) return;
    const at = squarePos(sq);
    const cam = later(cameraTo(ctx, at, 500));
    // 桂馬の跳び方の形で、画面の奥（見る側から遠い方）から L字に跳ねてくる。盤の外へ出ないよう、盤の中央の側から
    const far = ctx.me === 'sente' ? -1 : 1;
    const side = at.x > 0 ? -1 : 1;
    const p0 = new THREE.Vector3(at.x + side * 2.2, 0, at.z + far * 2.2);  // 遠く
    const p1 = new THREE.Vector3(at.x + side * 1.1, 0, at.z + far * 2.2);  // 1マス目の着地
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pegasusTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    // 絵の馬は右を向いているので、左へ駆けるときは左右を返す
    const face = side > 0 ? -1 : 1;
    sprite.scale.set(1.5 * face, 1.1, 1);
    sprite.center.set(0.5, 0.1);
    const kill = transient(ctx, sprite, 60000);
    try {
      await cam;
      // 駆けてくる
      getSound().play('hoof');
      await ctx.tween(380, (t) => {
        sprite.position.lerpVectors(p0, p1, t).setY(Math.abs(Math.sin(t * Math.PI * 3)) * 0.18);
        sprite.material.opacity = lightCap(ctx, 1) * Math.min(1, t * 3);
        sprite.material.rotation = side * 0.06 * Math.sin(t * Math.PI * 6);
      });
      printAt(ctx, p1, 1200);
      // L字の跳び：大きく弧を描いて駒へ
      getSound().play('hoof');
      const p2 = at.clone();
      await ctx.tween(460, (t) => {
        sprite.position.lerpVectors(p1, p2, t).setY(Math.sin(Math.PI * t) * 1.3);
        const k = 1 - 0.55 * t;
        sprite.scale.set(1.5 * k * face, 1.1 * k, 1);
      }, (t) => t);
      // 駒に飛び込む
      sprite.visible = false;
      printAt(ctx, at, 1400, 0.2);
      flash(ctx, PALS.soubiPale, 0.45, 220);
      puff(ctx, at, PAL.soubiLight, 36, 1.2);
      getSound().play('hoof', { gain: 1.2 });
      getSound().play('inanaki');
      await ctx.wait(450);
    } finally {
      kill();
    }
  },
  async onMove(ctx, cue) {
    // 跳び立ちと着地に、光の足跡と蹄の音（待たずに戻り、ふだんの1手と一緒に流れる）
    const a = squarePos(cue.from), b = squarePos(cue.to);
    const rot = Math.atan2(b.x - a.x, b.z - a.z);
    getSound().play('hoof');
    printAt(ctx, a, 1100, rot);
    void later(ctx.tweenRaw(200, () => {}).then(() => {
      printAt(ctx, b, 1300, rot);
      puff(ctx, b, PAL.soubiLight, 18, 0.8);
      getSound().play('hoof', { gain: 0.8 });
    }));
    // 少しだけ待って、跳び立つ間を作る
    await ctx.tweenRaw(60, () => {});
  },
};
