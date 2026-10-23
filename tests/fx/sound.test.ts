import { describe, expect, it } from 'vitest';
import { getSound, volumeToGain } from '../../src/fx/sound';

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

describe('getSound（AudioContext のない Node）', () => {
  it('unlock と play が例外を出さず、音は出せない状態のまま', () => {
    const s = getSound();
    expect(() => { s.unlock(); s.play('hyoshigi'); s.setVolume(0.5); }).not.toThrow();
    expect(s.running()).toBe(false);
  });
  it('駒音の3つも例外を出さない', () => {
    const s = getSound();
    expect(() => { s.play('koma'); s.play('komaHard'); s.play('kaesu'); }).not.toThrow();
  });
});

describe('札の演出の仮の音', () => {
  it('14個とも例外を出さない', () => {
    const s = getSound();
    const names = ['ice', 'trapdoor', 'thud', 'paper', 'glass', 'slash', 'poof', 'reel', 'armor', 'chain', 'hoof', 'flame', 'tsuke', 'splash'] as const;
    expect(() => { for (const n of names) s.play(n); }).not.toThrow();
  });
});
