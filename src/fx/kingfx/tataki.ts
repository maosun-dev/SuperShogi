// 壱「叩き割り」：取る駒が天井近くまで跳び上がってスローで振りかぶり、王へ叩き込む。
// 駒は立ち上がって五角形のとがった先を下へ向け（ユーザーの案）、まわりでアイコン（振袖の柄）の桜が渦を巻く（集中線は AIっぽいのでやめた）。
// 叩き込んだ瞬間に時が止まり（色が抜ける）、衝撃の輪が盤を走って桜がぱっと散り、周りの駒がいっせいに跳ねる。
// 時が戻ると王が木っ端みじんに砕け、「王」の字の欠片がくるくる回って高く上がる
import * as THREE from 'three';
import { PAL, PALS } from '../../view/palette';
import { cameraMove, cameraTo, dim, flash, later, shakeBy, type FxCtx } from '../kit';
import { getSound } from '../sound';
import { bounceNeighbors, freezeFrame, nearZ, petalStorm, settleTaker, shockRing, woodBurst, type KingCapture, type PetalShape } from './common';

const RISE_MS = 900;   // 跳び上がる
const HANG_MS = 420;   // 宙で振りかぶる（スロー）
const SLAM_MS = 170;   // 叩き込む
const TOP = 3.2;       // 跳び上がる高さ

export async function tataki(ctx: FxCtx, k: KingCapture): Promise<void> {
  const z = nearZ(ctx);
  const t = k.taker, from = k.from;
  await cameraTo(ctx, k.at, 600);
  dim(ctx, 0.35);
  // 1. 跳び上がる：カメラは少し引いて見上げる。駒は立ち上がって、五角形のとがった先を下へ向ける
  getSound().play('slowWhoosh');
  const cam = later(cameraMove(ctx, k.at.clone().add(new THREE.Vector3(1.8 * z, 5.4, 7.2 * z)), k.at.clone().setY(2.2), RISE_MS + HANG_MS));
  const top = k.at.clone().setY(k.takerY + TOP);
  const r0 = t ? t.rotation.clone() : new THREE.Euler();
  // 駒の先は先手なら -z、後手なら +z（y 軸に半回転）を向く。x 軸まわりに倒して先を真下へ
  const down = (Math.abs(r0.y) > 1 ? 1 : -1) * Math.PI / 2;
  const s = (t?.userData.s as number | undefined) ?? 1;
  const tip = 0.4 * s; // 立てた駒の真ん中から先までの長さ
  // アイコン（振袖の柄）の桜が、跳び上がる駒のまわりで渦を巻いて昇る
  const ICON = { colors: [PALS.sakura, PALS.sakura, PALS.gofun], shapes: ['notch', 'blossom'] as PetalShape[] };
  petalStorm(ctx, { ...ICON, mode: 'swirl', center: k.at.clone().setY(0.3), n: 70, size: 0.26, life: (RISE_MS + HANG_MS + 500) * ctx.timing.scale, area: 1.2, power: 1.3 });
  if (t && from) {
    await ctx.tween(RISE_MS, (u) => {
      t.position.set(from.x + (top.x - from.x) * u, k.fromY + (k.takerY + TOP - k.fromY) * Math.sin(u * Math.PI / 2), from.z + (top.z - from.z) * u);
      t.rotation.set(r0.x + down * u, r0.y + 0.6 * Math.sin(Math.PI * u), r0.z);
      t.scale.setScalar(1 + 0.35 * u);
    }, (u) => 1 - (1 - u) * (1 - u));
  }
  // 2. 宙で止まりかけ、少し引いて溜める（スロー）
  if (t) await ctx.tween(HANG_MS, (u) => { t.position.y = k.takerY + TOP + 0.3 * Math.sin(u * Math.PI); });
  await cam;
  // 3. とがった先から王へ突き下ろす
  const king = k.king;
  const kingTop = king ? king.position.y + 0.18 * ((king.userData.s as number | undefined) ?? 1) : k.takerY;
  const hitY = kingTop * 0.4 + tip; // 王を潰した高さに先が届く所
  const camIn = later(cameraTo(ctx, k.at, SLAM_MS + 80));
  if (t) {
    const y0 = t.position.y;
    await ctx.tween(SLAM_MS, (u) => {
      t.position.set(k.at.x, y0 + (hitY - y0) * u, k.at.z);
      t.scale.setScalar(1.35 - 0.35 * u);
    }, (u) => u * u * u);
    t.scale.setScalar(1);
  }
  // 王はぐしゃっと潰れる
  if (king) king.scale.set(king.scale.x * 1.2, king.scale.y * 0.35, king.scale.z * 1.2);
  await camIn;
  getSound().play('naguru');
  getSound().play('drum');
  flash(ctx, PALS.hakkou, 0.95, 260);
  shakeBy(ctx, 0.9);
  shockRing(ctx, k.at, PAL.gofun, 8, 800);
  // 叩き込んだ所から、アイコンの桜がぱっと散る
  petalStorm(ctx, { ...ICON, mode: 'burst', center: k.at, n: 90, size: 0.26, life: 3000, power: 1.6 });
  // 4. 時が止まる（ドン！の一瞬）
  await freezeFrame(ctx, 520);
  // 5. 時が戻る：王が砕け散り、周りの駒が跳ねる。取った駒はぱたんと倒れてマスに収まる
  getSound().play('shatter', { gain: 0.9 });
  getSound().play('bakuhatsu2', { gain: 0.5 });
  woodBurst(ctx, k, 1.15);
  shakeBy(ctx, 0.6);
  const bounce = later(bounceNeighbors(ctx, k, 3.4, 720));
  if (t) {
    const y1 = t.position.y;
    await ctx.tween(260, (u) => {
      t.position.y = y1 + (k.takerY - y1) * u + Math.sin(Math.PI * u) * 0.25;
      t.rotation.set(r0.x + down * (1 - u), r0.y, r0.z);
    }, (u) => u * u);
    getSound().play('komaHard');
  }
  settleTaker(k);
  await bounce;
  dim(ctx, 0);
  await ctx.wait(600);
}
