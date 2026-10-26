// 大詰の3人の札の柄：外の画像を使わない SVG。3人で別の柄
import { describe, expect, it } from 'vitest';
import { oozumeGara, actLevels } from '../../src/app/screens/oozumeGara';

describe('大詰の札の柄', () => {
  it('3人とも札いっぱいに敷く横長の SVG で、外のファイルを読まない', () => {
    for (const lv of ['oni', 'shihan', 'kabuki'] as const) {
      const svg = oozumeGara(lv);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('preserveAspectRatio="xMaxYMid slice"');
      expect(svg).not.toMatch(/href="(https?:|\/\/|data:)/);
      expect(svg).not.toContain('<image');
    }
  });
  it('3人で柄が違う', () => {
    expect(new Set(['oni', 'shihan', 'kabuki'].map((l) => oozumeGara(l as 'oni')))).toHaveProperty('size', 3);
  });
  it('柄の中の名前（id）が札ごとに分かれていて、同じ画面に3枚並べてもぶつからない', () => {
    const ids = ['oni', 'shihan', 'kabuki'].flatMap((l) => [...oozumeGara(l as 'oni').matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('幕ごとの強さ', () => {
  it('序幕は弱い・ふつう・強い、大詰は鬼・師範・傾奇者', () => {
    expect(actLevels('jo')).toEqual(['weak', 'normal', 'strong']);
    expect(actLevels('oo')).toEqual(['oni', 'shihan', 'kabuki']);
  });
});
