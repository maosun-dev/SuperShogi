// CPU 同士の対局の道具：強さごとの持ち込みの組み方（くじの強さはくじで組む）
import { describe, expect, it } from 'vitest';
import { deckFor } from '../../tools/arena/decks';
import { LEVELS } from '../../src/ai/levels';
import { makeRng } from '../../src/ai/random';
import { validateDeck } from '../../src/cards';

describe('対局の道具の持ち込み', () => {
  it('決まった札の強さは、その札', () => {
    expect(deckFor('strong', makeRng(1))).toEqual(LEVELS.strong.deck);
    expect(deckFor('shihan', makeRng(1))).toEqual(LEVELS.shihan.deck);
  });
  it('鬼は鬼の範囲から、傾奇者は全部から、決まりを守ってくじで組む（空にならない）', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 50; i++) {
      const oni = deckFor('oni', rng);
      expect(oni.length).toBeGreaterThan(0);
      expect(validateDeck(oni)).toBeNull();
      for (const id of oni) expect(LEVELS.oni.kuji).toContain(id);
      const kabuki = deckFor('kabuki', rng);
      expect(kabuki.length).toBeGreaterThan(0);
      expect(validateDeck(kabuki)).toBeNull();
    }
  });
});
