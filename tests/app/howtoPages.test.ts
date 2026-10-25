import { describe, it, expect } from 'vitest';
import { HOWTO_PAGES } from '../../src/app/howto/pages';

const NIN = '伏せておき、相手が条件を満たすと発動。伏せても手番は終わらない（1手番に1枚設置できる・同時設置は最大3枚まで）';

describe('遊び方の6枚', () => {
  it('6枚ある', () => {
    expect(HOWTO_PAGES).toHaveLength(6);
  });

  it('2枚目は8つの駒の図', () => {
    expect(HOWTO_PAGES[1].figure).toEqual({ type: 'pieces', kinds: ['OU', 'HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'] });
  });

  it('4枚目で王を取ったら勝ちと伝える', () => {
    expect(HOWTO_PAGES[3].lines.join('')).toContain('王を取ったら勝ち');
  });

  it('6枚目は術・忍・纏の3つで、忍の文はそのまま', () => {
    const f = HOWTO_PAGES[5].figure;
    expect(f.type).toBe('kinds');
    if (f.type !== 'kinds') return;
    expect(f.items.map((i) => i.kind)).toEqual(['magic', 'trap', 'equip']);
    expect(f.items[1].text).toBe(NIN);
  });

  it('どの頁にも見出しと文がある', () => {
    for (const p of HOWTO_PAGES) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.lines.length).toBeGreaterThan(0);
    }
  });
});
