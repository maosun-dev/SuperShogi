import { test, expect } from 'vitest';
import { sanitizeDeck, validateDeck } from '../../src/cards';
import { createGame } from '../../src/rules/game';
import { IllegalActionError } from '../../src/rules/types';

test('コスト合計10ちょうどは通る', () => {
  expect(validateDeck(['idaten', 'rakurai', 'itetsuku'])).toBeNull();
});

test('コスト11は通らない', () => {
  expect(validateDeck(['idaten', 'rakurai', 'narifuuji'])).toBe('コストが10を超えています');
});

test('同じ札2枚は通らない', () => {
  expect(validateDeck(['rakurai', 'rakurai'])).toBe('同じ札は1枚までです');
});

test('空のデッキは通る', () => {
  expect(validateDeck([])).toBeNull();
});

test('createGame は不正なデッキで IllegalActionError', () => {
  expect(() => createGame({ sente: ['idaten', 'rakurai', 'narifuuji'], gote: [] })).toThrow(IllegalActionError);
});

test('createGame は持ち込んだカードを全部手札に入れ、uid を振る', () => {
  const s = createGame({ sente: ['rakurai', 'irekae', 'tenma'], gote: ['itetsuku'] });
  expect(s.players.sente.cards.map(c => c.cardId)).toEqual(['rakurai', 'irekae', 'tenma']);
  expect(s.players.gote.cards.map(c => c.cardId)).toEqual(['itetsuku']);
  const uids = [...s.players.sente.cards, ...s.players.gote.cards].map(c => c.uid);
  expect(new Set(uids).size).toBe(4);
  expect(s.players.sente.cards.every(c => !c.used)).toBe(true);
});

test('保存した持ち込みの掃除：知らない札と2枚目を外す', () => {
  expect(sanitizeDeck(['nazo', 'rakurai', 'rakurai', 'hagane'])).toEqual(['rakurai', 'hagane']);
});

test('保存した持ち込みの掃除：前から足してコスト10を超える札は外す', () => {
  expect(sanitizeDeck(['idaten', 'rakurai', 'narifuuji', 'tenma'])).toEqual(['idaten', 'rakurai']);
});
