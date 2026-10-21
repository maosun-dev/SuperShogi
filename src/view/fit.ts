// 画面の縦横比からカメラの距離を出す（試作の fitCamera の計算を取り出したもの。three を使わない）

/**
 * 盤が画面に収まるカメラの距離。
 * 横は半幅 5.75（盤の横幅 9.9 に余白を足した 11.5 の半分）、縦は半高 6.4 が見えるようにし、遠いほうを取る。
 */
export function cameraDistance(aspect: number, fovDeg: number): number {
  const tv = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(5.75 / (tv * aspect), 6.4 / tv);
}

// ---- タイトルのカメラ：広角で低めから盤を見て、左右にゆっくり揺らす ----
// 縦長の画面は横に見える範囲が狭く、全部を収めようとすると遠くなって遠近感が消える（のっぺりする）。
// そこで奥の縁だけが横に収まる距離まで寄り、手前の角は画面の外へはみ出してよいことにする（客席から舞台を見る感じ）。
export const TITLE_FOV = 70;          // 画角（度）
export const TITLE_ELEV = 32;         // 見下ろす角度（度）
export const TITLE_SWAY = 0.3;        // 左右に揺れる幅（ラジアン。約17度）
export const TITLE_LOOK = [0, -0.6, 0.5] as const;   // 見る先
const FAR_EDGE: [number, number, number][] = [[-4.95, 0.2, -5.4], [4.95, 0.2, -5.4]];   // 盤の奥の縁（上面）
const FAR_FILL = 0.92;

/** 揺れの角度 angle のときのカメラの向き（見る先からカメラへの単位ベクトル） */
export function titleViewDir(angle: number): [number, number, number] {
  const e = (TITLE_ELEV * Math.PI) / 180;
  return [Math.sin(angle) * Math.cos(e), Math.sin(e), Math.cos(angle) * Math.cos(e)];
}

/** 距離 d のとき、揺れのどこかで盤の奥の縁が画面の横にどこまで広がるか（1で画面の端） */
export function titleFarEdgeExtent(aspect: number, d: number): number {
  const tv = Math.tan((TITLE_FOV * Math.PI) / 360);
  let max = 0;
  for (let i = -20; i <= 20; i++) {
    const dir = titleViewDir((TITLE_SWAY * i) / 20);
    const pos = TITLE_LOOK.map((x, k) => x + dir[k] * d);
    const f = [-dir[0], -dir[1], -dir[2]];
    // 右向き = f × 上(0,1,0) を正規化
    const rl = Math.hypot(f[2], f[0]);
    const r = [-f[2] / rl, 0, f[0] / rl];
    for (const p of FAR_EDGE) {
      const v = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
      const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
      const x = v[0] * r[0] + v[2] * r[2];
      max = Math.max(max, Math.abs(x / (z * tv * aspect)));
    }
  }
  return max;
}

/** 盤の奥の縁が揺れのどの角度でも横幅の92%に収まる、いちばん近いカメラの距離 */
export function titleCameraDistance(aspect: number): number {
  let lo = 3, hi = 300;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (titleFarEdgeExtent(aspect, m) <= FAR_FILL) hi = m; else lo = m;
  }
  return hi;
}
