// 画面の縦横比からカメラの距離を出す（試作の fitCamera の計算を取り出したもの。three を使わない）

/**
 * 盤が画面に収まるカメラの距離。
 * 横は半幅 5.75（盤の横幅 9.9 に余白を足した 11.5 の半分）、縦は半高 6.4 が見えるようにし、遠いほうを取る。
 */
export function cameraDistance(aspect: number, fovDeg: number): number {
  const tv = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(5.75 / (tv * aspect), 6.4 / tv);
}
