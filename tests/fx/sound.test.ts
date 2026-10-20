import { describe, expect, it } from 'vitest';
import { volumeToGain } from '../../src/fx/sound';

describe('volumeToGain', () => {
  it('0 は無音、1 は最大', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
  });
  it('つまみが上がるほど大きくなる', () => {
    expect(volumeToGain(0.3)).toBeLessThan(volumeToGain(0.6));
  });
  it('範囲外や数でない値は丸める', () => {
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(5)).toBe(1);
    expect(volumeToGain(NaN)).toBe(0);
  });
});
