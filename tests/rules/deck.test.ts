import { test, expect } from 'vitest';
import { validateDeck } from '../../src/cards';
import { createGame } from '../../src/rules/game';
import { IllegalActionError } from '../../src/rules/types';

test('コスト合計10ちょうどは通る', () => {
  expect(validateDeck(['idaten', 'idaten'])).toBeNull();
});

test('コスト11は通らない', () => {
  expect(validateDeck(['idaten', 'idaten', 'narifuuji'])).toBe('コストが10を超えています');
});

test('同じカード3枚は通らない', () => {
  expect(validateDeck(['narifuuji', 'narifuuji', 'narifuuji'])).toBe('同じ札は2枚までです');
});

test('空のデッキは通る', () => {
  expect(validateDeck([])).toBeNull();
});

test('createGame は不正なデッキで IllegalActionError', () => {
  expect(() => createGame({ sente: ['idaten', 'idaten', 'narifuuji'], gote: [] })).toThrow(IllegalActionError);
});

test('createGame は持ち込んだカードを全部手札に入れ、uid を振る', () => {
  const s = createGame({ sente: ['rakurai', 'irekae', 'irekae'], gote: ['itetsuku'] });
  expect(s.players.sente.cards.map(c => c.cardId)).toEqual(['rakurai', 'irekae', 'irekae']);
  expect(s.players.gote.cards.map(c => c.cardId)).toEqual(['itetsuku']);
  const uids = [...s.players.sente.cards, ...s.players.gote.cards].map(c => c.uid);
  expect(new Set(uids).size).toBe(4);
  expect(s.players.sente.cards.every(c => !c.used)).toBe(true);
});
