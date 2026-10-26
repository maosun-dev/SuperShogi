// 衡山の字：画面で筆の字にする言葉の字が、全部そろっている
import { describe, expect, it } from 'vitest';
import { KOUZAN_GLYPHS } from '../../src/app/kouzanGlyphs';
import { LEVEL_NAME } from '../../src/ai/levels';

describe('衡山の字', () => {
  it('強さの名前と、強さ選びの幕の名前の字がある', () => {
    const words = [...Object.values(LEVEL_NAME), '序幕', '大詰', '稽古'];
    const missing = [...new Set(words.join(''))].filter((ch) => !KOUZAN_GLYPHS[ch]);
    expect(missing).toEqual([]);
  });
});
