import { describe, it, expect } from 'vitest';
import { cameraDistance, titleCameraDistance, titleFarEdgeExtent } from '../../src/view/fit';

const tan19 = Math.tan((19 * Math.PI) / 180);

describe('カメラの距離', () => {
  it('縦長の画面でも横幅9.9の盤が収まる', () => {
    const aspect = 375 / 520;
    const d = cameraDistance(aspect, 38);
    expect(2 * d * tan19 * aspect).toBeGreaterThanOrEqual(11.5 - 1e-9);
  });

  it('横長の画面では縦で決まる', () => {
    expect(cameraDistance(2, 38)).toBeCloseTo(6.4 / tan19);
  });
});

describe('タイトルのカメラ', () => {
  const aspect = 430 / 932;
  it('揺れのどの角度でも、盤の奥の縁が画面の横幅の92%に収まる距離を返す', () => {
    const d = titleCameraDistance(aspect);
    expect(titleFarEdgeExtent(aspect, d)).toBeLessThanOrEqual(0.92 + 1e-6);
    expect(titleFarEdgeExtent(aspect, d)).toBeGreaterThan(0.9);
  });
  it('それより寄ると、奥の縁が横幅の92%を超える', () => {
    const d = titleCameraDistance(aspect);
    expect(titleFarEdgeExtent(aspect, d * 0.9)).toBeGreaterThan(0.92);
  });
  it('対局画面のカメラより近い（広角で寄って遠近感を出す）', () => {
    expect(titleCameraDistance(aspect)).toBeLessThan(cameraDistance(aspect, 38));
  });
});
