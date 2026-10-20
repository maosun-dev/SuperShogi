import { describe, it, expect } from 'vitest';
import { deckCost, addReason, autoDeck } from '../../src/app/deck';
import { validateDeck } from '../../src/cards';
import { makeRng } from '../../src/ai/random';

describe('カード選びの計算', () => {
  it('残りのコストと足せない理由', () => {
    expect(deckCost(['rakurai', 'idaten'])).toBe(9);
    expect(addReason(['rakurai', 'idaten'], 'irekae')).toBe('残りのコストが足りません');
    expect(addReason(['tenma', 'tenma'], 'tenma')).toBe('同じカードは2枚までです');
    expect(addReason([], 'tenma')).toBeNull();
  });
  it('おまかせは必ず組める持ち込みで、コストは9以上', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = autoDeck(makeRng(seed));
      expect(validateDeck(d)).toBeNull();
      expect(deckCost(d)).toBeGreaterThanOrEqual(9);
    }
    expect(autoDeck(makeRng(7))).toEqual(autoDeck(makeRng(7)));
  });
});
