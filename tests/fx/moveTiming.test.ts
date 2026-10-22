// ふだんの1手の長さのテスト
import { describe, expect, it } from 'vitest';
import { moveTimings } from '../../src/fx/moveTiming';

const T = (scale: number, camera: boolean) => ({ scale, camera, shake: camera, flashMax: 0.9 });

describe('moveTimings', () => {
  it('長めのふつうの手は約0.25秒', () => {
    const m = moveTimings(T(1, true));
    expect(m.travel + m.settle).toBe(250);
    expect(m.calm).toBe(false);
  });
  it('短めは半分', () => {
    expect(moveTimings(T(0.5, true)).fly).toBe(150);
  });
  it('動きを減らすときは、沈み・止まり・裏返しがない', () => {
    const m = moveTimings(T(1, false));
    expect([m.calm, m.settle, m.hang, m.flip]).toEqual([true, 0, 0, 0]);
    expect(m.travel).toBe(160);
  });
});
