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

// もとの positionKey の写し（速くする前の作り。比べる相手）
function positionKeyRef(s: import('../../src/rules/types').GameState): string {
  const sides = ['sente', 'gote'] as const;
  const cells = s.board.map(p => {
    if (!p) return '.';
    return `${p.side[0]}${p.kind}${p.promoted ? '+' : ''}${p.equip ? '@' + p.equip.cardId + (p.equip.left ?? '') : ''}`
      + `${p.frozen ? '~' + p.frozen : ''}${p.sealed ? '!' : ''}`;
  });
  const hands = sides.map(side => (['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'] as const).map(k => s.players[side].hand[k]).join(','));
  const used = sides.map(side =>
    s.players[side].cards.filter(c => c.used).length
    - s.traps.filter(t => t.owner === side && t.cardId !== null).length);
  const traps = sides.map(side => s.traps.filter(t => t.owner === side).length);
  return [cells.join(''), hands.join('|'), s.turn, used.join('|'), traps.join(','), s.trapSetThisTurn ? 'T' : '-', s.pushFollowUp ? 'P' : '-'].join('/');
}

test('positionKey は速くする前と1文字も違わない', async () => {
  const { benchPositions } = await import('../ai/helpers/positions');
  const { applyActionUnchecked, legalActions } = await import('../../src/rules/game');
  for (const s of benchPositions()) {
    expect(positionKey(s)).toBe(positionKeyRef(s));
    // 伏せた罠の中身が見える側の局面（適用したあと）も比べる
    for (const a of legalActions(s).slice(0, 20)) {
      const t = applyActionUnchecked(s, a).state;
      expect(positionKey(t)).toBe(positionKeyRef(t));
    }
  }
});
