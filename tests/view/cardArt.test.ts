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

describe('計画9の絵', () => {
  it('成り上がり・退き陣の旗は文字だけの仮の絵ではなく、形で描いてある', () => {
    for (const id of ['shoryu', 'hikijin'] as const) {
      expect(CARD_ART[id], id).not.toContain('<text');
      expect((CARD_ART[id].match(/<(path|polygon|rect|circle)/g) ?? []).length, id).toBeGreaterThanOrEqual(4);
    }
  });
  it('成り上がりは竜の絵ではない（昇竜の絵を描き直した）', () => {
    expect(CARD_ART.shoryu).not.toContain('Q1 36 14 30');
  });
});

describe('札の HTML', () => {
  it('札の HTML にコスト・名前・種類の印が入る', () => {
    const h = cardHtml('rakurai');
    expect(h).toContain('4');
    expect(h).toContain('落雷');
    expect(h).toContain('術');
    expect(h).toContain('mahou');
    expect(cardHtml('rakurai', { count: 2 })).toContain('二');
  });

  it('種類の印は種類ごとに決まっている', () => {
    expect(KIND_MARK.magic).toEqual({ mark: '術', label: '術札', color: 'mahou' });
    expect(KIND_MARK.trap).toEqual({ mark: '忍', label: '忍札', color: 'wana' });
    expect(KIND_MARK.equip).toEqual({ mark: '纏', label: '纏札', color: 'soubi' });
    expect(cardHtml('kagami')).toContain('忍');
    expect(cardHtml('tenma')).toContain('纏');
  });

  it('小さい札は名前を出さず、コストと印だけ', () => {
    const h = cardHtml('rakurai', { size: 'small' });
    expect(h).not.toContain('落雷</');
    expect(h).toContain('>4<');
    expect(h).toContain('術');
  });
});
