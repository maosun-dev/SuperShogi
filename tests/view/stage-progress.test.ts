// 動きの進み具合（0〜1）のテスト。描画の時刻は、動きを登録した時刻より少し前を指すことがある
import { describe, expect, it } from 'vitest';
import { tweenProgress } from '../../src/view/stage';

describe('tweenProgress', () => {
  it('登録より前の時刻でもマイナスにならない（駒が一瞬後ろ・下にはみ出さない）', () => {
    expect(tweenProgress(95, 100, 200)).toBe(0);
  });
  it('途中と終わり', () => {
    expect(tweenProgress(200, 100, 200)).toBe(0.5);
    expect(tweenProgress(900, 100, 200)).toBe(1);
  });
});
