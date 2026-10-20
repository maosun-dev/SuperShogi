import { test, expect } from 'vitest';
import { pieceTargets, canPromote, mustPromote, dropTargets, isInCheck } from '../../src/rules/moves';
import { emptyState, put } from '../helpers';
import type { Square } from '../../src/rules/types';

const sortSq = (xs: Square[]) => [...xs].sort((a, b) => a.r - b.r || a.c - b.c);
const C = { c: 4, r: 4 };

test('歩は1マス前だけ', () => {
  const s = emptyState();
  put(s, { c: 4, r: 6 }, 'FU', 'sente');
  expect(pieceTargets(s, { c: 4, r: 6 })).toEqual([{ c: 4, r: 5 }]);
});

test('香は前に滑り、相手の駒で止まりそのマスを含む', () => {
  const s = emptyState();
  put(s, { c: 0, r: 8 }, 'KY', 'sente');
  put(s, { c: 0, r: 5 }, 'FU', 'gote');
  expect(sortSq(pieceTargets(s, { c: 0, r: 8 }))).toEqual([{ c: 0, r: 5 }, { c: 0, r: 6 }, { c: 0, r: 7 }]);
});

test('味方の駒のマスへは動けない', () => {
  const s = emptyState();
  put(s, { c: 0, r: 8 }, 'KY', 'sente');
  put(s, { c: 0, r: 6 }, 'FU', 'sente');
  expect(pieceTargets(s, { c: 0, r: 8 })).toEqual([{ c: 0, r: 7 }]);
});

test('桂は前の2マスへ跳ぶ（間の駒を飛び越す）', () => {
  const s = emptyState();
  put(s, { c: 1, r: 8 }, 'KE', 'sente');
  put(s, { c: 1, r: 7 }, 'FU', 'sente');
  put(s, { c: 0, r: 7 }, 'FU', 'sente');
  put(s, { c: 2, r: 7 }, 'FU', 'sente');
  expect(sortSq(pieceTargets(s, { c: 1, r: 8 }))).toEqual([{ c: 0, r: 6 }, { c: 2, r: 6 }]);
});

test('銀・金・王の動き', () => {
  for (const [kind, n] of [['GI', 5], ['KI', 6], ['OU', 8]] as const) {
    const s = emptyState();
    put(s, C, kind, 'sente');
    expect(pieceTargets(s, C)).toHaveLength(n);
  }
  const s = emptyState();
  put(s, C, 'GI', 'sente');
  expect(sortSq(pieceTargets(s, C))).toEqual(sortSq([
    { c: 3, r: 3 }, { c: 4, r: 3 }, { c: 5, r: 3 }, { c: 3, r: 5 }, { c: 5, r: 5 },
  ]));
});

test('飛は縦横に滑り、成った竜は斜め1マスも足す', () => {
  const a = emptyState(); put(a, C, 'HI', 'sente');
  expect(pieceTargets(a, C)).toHaveLength(16);
  const b = emptyState(); put(b, C, 'HI', 'sente', { promoted: true });
  expect(pieceTargets(b, C)).toHaveLength(20);
});

test('角は斜めに滑り、成った馬は縦横1マスも足す', () => {
  const a = emptyState(); put(a, C, 'KA', 'sente');
  expect(pieceTargets(a, C)).toHaveLength(16);
  const b = emptyState(); put(b, C, 'KA', 'sente', { promoted: true });
  expect(pieceTargets(b, C)).toHaveLength(20);
});

test('成った歩・香・桂・銀は金と同じ動き', () => {
  const g = emptyState(); put(g, C, 'KI', 'sente');
  const gold = sortSq(pieceTargets(g, C));
  for (const kind of ['FU', 'KY', 'KE', 'GI'] as const) {
    const s = emptyState();
    put(s, C, kind, 'sente', { promoted: true });
    expect(sortSq(pieceTargets(s, C))).toEqual(gold);
  }
});

test('後手の駒は向きが逆', () => {
  const s = emptyState();
  put(s, { c: 4, r: 2 }, 'FU', 'gote');
  expect(pieceTargets(s, { c: 4, r: 2 })).toEqual([{ c: 4, r: 3 }]);
  const t = emptyState();
  put(t, { c: 1, r: 0 }, 'KE', 'gote');
  expect(sortSq(pieceTargets(t, { c: 1, r: 0 }))).toEqual([{ c: 0, r: 2 }, { c: 2, r: 2 }]);
});

test('天馬の蹄を付けた金は、桂馬の2マスも動ける', () => {
  const s = emptyState();
  put(s, C, 'KI', 'sente', { equip: 'tenma' });
  const ts = pieceTargets(s, C);
  expect(ts).toHaveLength(8);
  expect(ts).toContainEqual({ c: 3, r: 2 });
  expect(ts).toContainEqual({ c: 5, r: 2 });
});

test('canPromote：敵陣に入る・敵陣から出る・敵陣の中で動くとき true。金・王は false', () => {
  const s = emptyState();
  const gi = put(s, { c: 4, r: 3 }, 'GI', 'sente');
  expect(canPromote(gi, { c: 4, r: 3 }, { c: 4, r: 2 })).toBe(true);
  expect(canPromote(gi, { c: 4, r: 2 }, { c: 3, r: 3 })).toBe(true);
  expect(canPromote(gi, { c: 4, r: 2 }, { c: 4, r: 1 })).toBe(true);
  expect(canPromote(gi, { c: 4, r: 5 }, { c: 4, r: 4 })).toBe(false);
  const ki = put(s, { c: 0, r: 0 }, 'KI', 'sente');
  expect(canPromote(ki, { c: 4, r: 3 }, { c: 4, r: 2 })).toBe(false);
  const ou = put(s, { c: 1, r: 0 }, 'OU', 'sente');
  expect(canPromote(ou, { c: 4, r: 3 }, { c: 4, r: 2 })).toBe(false);
  const done = put(s, { c: 2, r: 0 }, 'GI', 'sente', { promoted: true });
  expect(canPromote(done, { c: 4, r: 3 }, { c: 4, r: 2 })).toBe(false);
  const g = put(s, { c: 3, r: 0 }, 'GI', 'gote');
  expect(canPromote(g, { c: 4, r: 5 }, { c: 4, r: 6 })).toBe(true);
  expect(canPromote(g, { c: 4, r: 2 }, { c: 4, r: 3 })).toBe(false);
});

test('mustPromote：先手の歩が r=0、桂が r=1 で true', () => {
  expect(mustPromote('FU', 'sente', { c: 0, r: 0 })).toBe(true);
  expect(mustPromote('FU', 'sente', { c: 0, r: 1 })).toBe(false);
  expect(mustPromote('KY', 'sente', { c: 0, r: 0 })).toBe(true);
  expect(mustPromote('KE', 'sente', { c: 0, r: 1 })).toBe(true);
  expect(mustPromote('KE', 'sente', { c: 0, r: 2 })).toBe(false);
  expect(mustPromote('FU', 'gote', { c: 0, r: 8 })).toBe(true);
  expect(mustPromote('KE', 'gote', { c: 0, r: 7 })).toBe(true);
  expect(mustPromote('GI', 'sente', { c: 0, r: 0 })).toBe(false);
});

test('dropTargets：同じ筋に自分の成っていない歩があると、その筋に歩は打てない', () => {
  const s = emptyState();
  put(s, { c: 3, r: 6 }, 'FU', 'sente');
  put(s, { c: 5, r: 6 }, 'FU', 'sente', { promoted: true });
  put(s, { c: 6, r: 6 }, 'FU', 'gote');
  const ts = dropTargets(s, 'sente', 'FU');
  expect(ts.some(q => q.c === 3)).toBe(false);
  expect(ts.some(q => q.c === 5)).toBe(true);
  expect(ts.some(q => q.c === 6)).toBe(true);
});

test('dropTargets：先手の歩は r=0 に、桂は r=0,1 に打てない', () => {
  const s = emptyState();
  expect(dropTargets(s, 'sente', 'FU').some(q => q.r === 0)).toBe(false);
  expect(dropTargets(s, 'sente', 'FU')).toHaveLength(72);
  expect(dropTargets(s, 'sente', 'KE').some(q => q.r <= 1)).toBe(false);
  expect(dropTargets(s, 'gote', 'KE').some(q => q.r >= 7)).toBe(false);
  expect(dropTargets(s, 'sente', 'KI')).toHaveLength(81);
});

test('dropTargets：駒のあるマスには打てない', () => {
  const s = emptyState();
  put(s, C, 'KI', 'gote');
  expect(dropTargets(s, 'sente', 'GI')).not.toContainEqual(C);
});

test('isInCheck：後手の飛車の筋に先手の王がいると true', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 1 }, 'HI', 'gote');
  expect(isInCheck(s, 'sente')).toBe(true);
  put(s, { c: 4, r: 5 }, 'FU', 'sente');
  expect(isInCheck(s, 'sente')).toBe(false);
});
