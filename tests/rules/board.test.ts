import { test, expect } from 'vitest';
import { initialBoard, idx, cloneState, positionKey } from '../../src/rules/board';
import { emptyState, put } from '../helpers';
import { createGame } from '../../src/rules/game';

test('初期配置は40枚で、先手の王は5九＝{c:4,r:8}、後手の王は{c:4,r:0}', () => {
  const { board } = initialBoard();
  expect(board.filter(Boolean)).toHaveLength(40);
  expect(board[idx({ c: 4, r: 8 })]).toMatchObject({ kind: 'OU', side: 'sente' });
  expect(board[idx({ c: 4, r: 0 })]).toMatchObject({ kind: 'OU', side: 'gote' });
});

test('先手の飛車は{c:7,r:7}、角は{c:1,r:7}。後手の飛車は{c:1,r:1}、角は{c:7,r:1}', () => {
  const { board } = initialBoard();
  expect(board[idx({ c: 7, r: 7 })]).toMatchObject({ kind: 'HI', side: 'sente' });
  expect(board[idx({ c: 1, r: 7 })]).toMatchObject({ kind: 'KA', side: 'sente' });
  expect(board[idx({ c: 1, r: 1 })]).toMatchObject({ kind: 'HI', side: 'gote' });
  expect(board[idx({ c: 7, r: 1 })]).toMatchObject({ kind: 'KA', side: 'gote' });
});

test('初期配置の駒の id はすべて違う', () => {
  const { board, nextId } = initialBoard();
  const ids = board.filter(Boolean).map(p => p!.id);
  expect(new Set(ids).size).toBe(40);
  expect(Math.max(...ids)).toBeLessThan(nextId);
});

test('cloneState は盤を共有しない', () => {
  const s = emptyState();
  put(s, { c: 4, r: 4 }, 'GI', 'sente');
  const t = cloneState(s);
  t.board[idx({ c: 4, r: 4 })]!.promoted = true;
  t.players.sente.hand.FU = 3;
  expect(s.board[idx({ c: 4, r: 4 })]!.promoted).toBe(false);
  expect(s.players.sente.hand.FU).toBe(0);
});

test('positionKey は手番が違えば違う', () => {
  const s = emptyState('sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  const t = cloneState(s);
  t.turn = 'gote';
  expect(positionKey(s)).not.toBe(positionKey(t));
});

test('positionKey は押し返しの続きの最中かどうかを区別する', () => {
  const s = emptyState('sente');
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  const t = cloneState(s);
  t.pushFollowUp = true;
  expect(positionKey(s)).not.toBe(positionKey(t));
  expect(cloneState(t).pushFollowUp).toBe(true);
});

test('positionKey は装備と持ち駒の違いも区別する', () => {
  const s = emptyState();
  put(s, { c: 4, r: 4 }, 'KI', 'sente');
  const a = cloneState(s);
  a.board[idx({ c: 4, r: 4 })]!.equip = { cardId: 'hagane' };
  const b = cloneState(s);
  b.players.gote.hand.FU = 1;
  expect(positionKey(a)).not.toBe(positionKey(s));
  expect(positionKey(b)).not.toBe(positionKey(s));
});

test('cloneState：元と同じ形で、書き換えても元は変わらない', () => {
  const s = createGame({ sente: ['tenma', 'otoshiana'], gote: [] });
  s.board[idx({ c: 4, r: 6 })] = { ...s.board[idx({ c: 4, r: 6 })]!, equip: { cardId: 'tenma' }, frozen: 2, sealed: true };
  s.traps.push({ uid: 99, owner: 'sente', cardId: 'otoshiana', at: { c: 4, r: 4 } });
  s.players.sente.hand.FU = 2;
  s.result = { winner: 'sente', reason: 'king-captured' };
  const c = cloneState(s);
  expect(c).toEqual(s);
  c.board[idx({ c: 4, r: 6 })]!.equip!.cardId = 'hagane';
  c.board[idx({ c: 4, r: 6 })]!.frozen = 1;
  c.traps[0].at!.c = 0;
  c.players.sente.hand.FU = 0;
  c.players.sente.cards[0].used = true;
  c.seen.x = 5;
  expect(s.board[idx({ c: 4, r: 6 })]).toMatchObject({ equip: { cardId: 'tenma' }, frozen: 2 });
  expect(s.traps[0].at).toEqual({ c: 4, r: 4 });
  expect(s.players.sente.hand.FU).toBe(2);
  expect(s.players.sente.cards[0].used).toBe(false);
  expect(s.seen.x).toBeUndefined();
});
