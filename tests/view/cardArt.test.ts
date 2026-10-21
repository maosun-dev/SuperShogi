// カードの絵と札の HTML のテスト（Node で動く文字列の確認）
import { describe, expect, it } from 'vitest';
import { CARD_ART, KIND_MARK, cardHtml } from '../../src/view/cardArt';
import { CARDS } from '../../src/cards';
import type { CardId } from '../../src/rules/types';

describe('カードの絵', () => {
  it('18枚すべてに絵がある', () => {
    const ids = Object.keys(CARDS) as CardId[];
    expect(ids.length).toBe(18);
    for (const id of ids) {
      const art = CARD_ART[id];
      expect(art, id).toBeTruthy();
      expect(art.trim().length, id).toBeGreaterThan(0);
      expect(art.toLowerCase(), id).not.toContain('<script');
      expect(/\son[a-z]*\s*=/i.test(art), id).toBe(false);
    }
  });

  it('絵の色はパレットの値だけ（#xxxxxx は7色とその明暗のどれか）', () => {
    const allowed = new Set(['#E2B65B', '#14213D', '#2B59C3', '#D7263D', '#C9A227', '#EEE8DC', '#1D1A17',
      '#22386A', '#0D1730', '#7A0F1C', '#F2D594']);
    for (const art of Object.values(CARD_ART)) {
      for (const m of art.match(/#[0-9a-fA-F]{6}/g) ?? []) expect(allowed.has(m.toUpperCase()), m).toBe(true);
    }
  });
});

describe('札の HTML', () => {
  it('札の HTML にコスト・名前・種類の印が入る', () => {
    const h = cardHtml('rakurai');
    expect(h).toContain('4');
    expect(h).toContain('落雷');
    expect(h).toContain('魔');
    expect(h).toContain('mahou');
    expect(cardHtml('rakurai', { count: 2 })).toContain('二');
  });

  it('種類の印は種類ごとに決まっている', () => {
    expect(KIND_MARK.magic).toEqual({ mark: '魔', label: '魔法', color: 'mahou' });
    expect(KIND_MARK.trap).toEqual({ mark: '罠', label: '罠', color: 'wana' });
    expect(KIND_MARK.equip).toEqual({ mark: '装', label: '装備', color: 'soubi' });
    expect(cardHtml('kagami')).toContain('罠');
    expect(cardHtml('tenma')).toContain('装');
  });

  it('小さい札は名前を出さず、コストと印だけ', () => {
    const h = cardHtml('rakurai', { size: 'small' });
    expect(h).not.toContain('落雷</');
    expect(h).toContain('>4<');
    expect(h).toContain('魔');
  });
});
