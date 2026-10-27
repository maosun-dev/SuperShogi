// 友と対局（Game Center）：合言葉と、Game Center の「同じ番号どうしだけつなぐ」番号
import { describe, expect, it } from 'vitest';
import { GC_DIGITS, GC_PIECES, gcGroup, makeGcCode } from '../../src/net/gcCode';

function seq(...xs: number[]): () => number {
  let i = 0;
  return () => xs[i++ % xs.length];
}

const allCodes = (): string[] => GC_PIECES.flatMap((p) => GC_DIGITS.flatMap((a) => GC_DIGITS.map((b) => `${p}の${a}${b}`)));

describe('makeGcCode', () => {
  it('駒の名前＋の＋漢数字2つ', () => {
    expect(makeGcCode(seq(0.3, 0.2, 0.9))).toBe('桂馬の二九');
  });
});

describe('gcGroup', () => {
  it('567通りの合言葉で番号が重ならない', () => {
    const codes = allCodes();
    expect(codes).toHaveLength(567);
    expect(new Set(codes.map((c) => gcGroup(c, '1.0.2'))).size).toBe(567);
  });
  it('同じ合言葉でも版が違えば番号が違う', () => {
    expect(gcGroup('桂馬の三七', '1.0.2')).not.toBe(gcGroup('桂馬の三七', '1.0.3'));
  });
  it('同じ入力なら同じ番号で、正の整数', () => {
    const g = gcGroup('桂馬の三七', '1.0.2');
    expect(gcGroup('桂馬の三七', '1.0.2')).toBe(g);
    expect(Number.isSafeInteger(g) && g > 0).toBe(true);
  });
});
