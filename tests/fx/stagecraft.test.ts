import { describe, expect, it } from 'vitest';
import { houseLevel } from '../../src/fx/stagecraft';

describe('暗転の明るさ houseLevel', () => {
  it('もとの明るさを k 倍にする', () => {
    expect(houseLevel([1.1, 1.9], 0.5)).toEqual([0.55, 0.95]);
  });
  it('1 なら元のまま、0 なら真っ暗', () => {
    expect(houseLevel([1.1, 1.9], 1)).toEqual([1.1, 1.9]);
    expect(houseLevel([1.1, 1.9], 0)).toEqual([0, 0]);
  });
  it('範囲外は 0〜1 に丸め、数でなければ元のまま', () => {
    expect(houseLevel([2], 3)).toEqual([2]);
    expect(houseLevel([2], -1)).toEqual([0]);
    expect(houseLevel([2], NaN)).toEqual([2]);
  });
});
