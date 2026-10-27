import { test, expect } from 'vitest';
import { sanitizeDeck, validateDeck } from '../../src/cards';
import { createGame } from '../../src/rules/game';
import { IllegalActionError } from '../../src/rules/types';

test('コスト合計10ちょうどは通る', () => {
  expect(validateDeck(['idaten', 'rakurai', 'irekae', 'itetsuku'])).toBeNull();
});

test('コスト11は通らない', () => {
  expect(validateDeck(['idaten', 'rakurai', 'otoshiana'])).toBe('コストが10を超えています');
});

test('同じ札2枚は通らない', () => {
  expect(validateDeck(['rakurai', 'rakurai'])).toBe('同じ札は1枚までです');
});

test('空のデッキは通る', () => {
  expect(validateDeck([])).toBeNull();
});

test('createGame は不正なデッキで IllegalActionError', () => {
  expect(() => createGame({ sente: ['idaten', 'rakurai', 'otoshiana'], gote: [] })).toThrow(IllegalActionError);
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
  expect(sanitizeDeck(['idaten', 'rakurai', 'otoshiana', 'tenma'])).toEqual(['idaten', 'rakurai', 'tenma']);
});

// 2026-10 の札の直し（設計書 docs/superpowers/specs/2026-10-27-card-rebalance-design.md）
test('札のコスト（2026-10 の直し）', async () => {
  const { CARDS } = await import('../../src/cards');
  const cost = Object.fromEntries(Object.values(CARDS).map(c => [c.id, c.cost]));
  expect(cost).toEqual({
    oshikaeshi: 2, irekae: 1, yobimodoshi: 2, shoryu: 2, kakuotoshi: 2, rakurai: 4,
    itetsuku: 1, narifuuji: 1, otoshiana: 3, kagami: 3, aiuchi: 3, migawari: 6,
    hikijin: 2, tenma: 2, omori: 2, hagane: 3, idaten: 4, bangasa: 2,
  });
  expect(CARDS.hikijin.name).toBe('陣替えの旗');
  expect(CARDS.bangasa.name).toBe('番傘');
});

test('保存された持ち込みの貫きの槍（なくなった札）とコスト超えは外れる', () => {
  expect(sanitizeDeck(['tsuranuki', 'rakurai'])).toEqual(['rakurai']);
  // 身代わり6＋落雷4＝10、成り封じ1は超えるので外れる
  expect(sanitizeDeck(['migawari', 'rakurai', 'narifuuji'])).toEqual(['migawari', 'rakurai']);
});
