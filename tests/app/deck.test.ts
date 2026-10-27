import { describe, it, expect } from 'vitest';
import { deckCost, addReason, autoDeck, lookActions } from '../../src/app/deck';
import { validateDeck } from '../../src/cards';
import { makeRng } from '../../src/ai/random';

describe('カード選びの計算', () => {
  it('残りのコストと足せない理由', () => {
    expect(deckCost(['rakurai', 'idaten'])).toBe(8);
    expect(addReason(['rakurai', 'idaten'], 'aiuchi')).toBe('残りのコストが足りません');
    expect(addReason(['tenma'], 'tenma')).toBe('同じ札は1枚までです');
    expect(addReason([], 'tenma')).toBeNull();
  });
  it('おまかせは必ず組める持ち込みで、コストは9以上', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = autoDeck(makeRng(seed));
      expect(validateDeck(d)).toBeNull();
      expect(deckCost(d)).toBeGreaterThanOrEqual(9);
      expect(new Set(d).size).toBe(d.length);
    }
    expect(autoDeck(makeRng(7))).toEqual(autoDeck(makeRng(7)));
  });
});

describe('大きな札のボタン（入れる・抜く）', () => {
  it('入っていない札は「入れる」', () => {
    expect(lookActions([], 'rakurai')).toEqual({ kind: 'add', disabled: false, note: '' });
  });
  it('入っている札は「抜く」', () => {
    expect(lookActions(['rakurai'], 'rakurai')).toEqual({ kind: 'remove', disabled: false, note: '' });
  });
  it('コストが足りない札は「入れる」を押せず、理由を添える', () => {
    expect(lookActions(['idaten', 'rakurai'], 'hagane')).toEqual({ kind: 'add', disabled: true, note: '残りのコストが足りません' });
  });
});
