// 背景の絵の部品：計算の部分（DOM を使わない）
import { describe, expect, it } from 'vitest';
import { LAYERS, layerUrl, parallaxShift } from '../../src/view/backdrop';

describe('背景の絵', () => {
  it('奥・中・手前の3枚を、舞台ごとの場所から読む', () => {
    expect(LAYERS).toEqual(['back', 'mid', 'front']);
    expect(layerUrl('/', 'ukiyoe', 'mid')).toBe('/stages/ukiyoe/mid.webp');
    expect(layerUrl('./', 'kabuki', 'thumb')).toBe('./stages/kabuki/thumb.webp');
  });
  it('ずれは奥ほど小さく、手前ほど大きい。入力は -1〜1 に丸める', () => {
    expect(parallaxShift('back', 1, 0)).toEqual({ x: 0, y: 0 });
    const mid = parallaxShift('mid', 1, -1);
    const front = parallaxShift('front', 1, -1);
    expect(Math.abs(front.x)).toBeGreaterThan(Math.abs(mid.x));
    expect(parallaxShift('front', 5, 0)).toEqual(parallaxShift('front', 1, 0));
  });
});
