import { describe, it, expect } from 'vitest';
import { cameraDistance } from '../../src/view/fit';

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
