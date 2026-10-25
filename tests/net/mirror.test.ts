// 友と対局：後手の席の iPhone で見せる形を180度回す
import { test, expect } from 'vitest';
import { createGame, applyAction, legalActions } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';
import { makeRng } from '../../src/ai/random';
import type { Action, GameEvent, GameState } from '../../src/rules/types';
import { mirrorAction, mirrorEvents, mirrorResult, mirrorSq, mirrorState } from '../../src/net/mirror';
import { fingerprint } from '../../src/net/fingerprint';

const A = { c: 1, r: 2 };
const B = { c: 7, r: 5 };

const ACTIONS: Action[] = [
  { type: 'move', from: A, to: B, promote: true },
  { type: 'move', from: A, to: B, promote: false, second: { to: { c: 0, r: 0 }, promote: true } },
  { type: 'drop', kind: 'FU', to: B },
  { type: 'card', uid: 41, targets: [A, B] },
  { type: 'card', uid: 42, targets: [], pick: 'KA' },
];

const EVENTS: GameEvent[] = [
  { type: 'moved', pieceId: 1, from: A, to: B, promoted: true },
  { type: 'dropped', pieceId: 2, side: 'sente', kind: 'GI', to: A },
  { type: 'captured', pieceId: 3, at: A, by: 'gote' },
  { type: 'cardUsed', side: 'sente', cardId: 'irekae', targets: [A, B] },
  { type: 'trapSet', side: 'gote', uid: 9, cardId: 'otoshiana', at: B },
  { type: 'trapSet', side: 'gote', uid: 9, cardId: null, at: null },
  { type: 'trapTriggered', owner: 'sente', uid: 9, cardId: 'kagami', at: null },
  { type: 'trapTriggered', owner: 'sente', uid: 9, cardId: 'otoshiana', at: A },
  { type: 'destroyed', pieceId: 4, at: B, cause: 'rakurai' },
  { type: 'pushed', pieceId: 5, from: A, to: B },
  { type: 'swapped', a: A, b: B },
  { type: 'equipped', pieceId: 6, cardId: 'hagane' },
  { type: 'armorBlocked', defenderId: 7, attackerId: 8, at: A },
  { type: 'promotionBlocked', pieceId: 9 },
  { type: 'magicNegated', side: 'gote', cardId: 'oshikaeshi' },
  { type: 'handTransferred', kind: 'KI', from: 'sente', to: 'gote' },
  { type: 'frozen', pieceId: 10, at: B, turns: 2 },
  { type: 'demoted', pieceId: 11, at: A },
  { type: 'promotedInPlace', pieceId: 12, at: B },
  { type: 'kingGuarded', attackerId: 13, kingId: 14, at: A, to: B },
  { type: 'secondMoveSkipped', pieceId: 15 },
  { type: 'equipBroken', pieceId: 16, at: A, cardId: 'omori' },
  { type: 'passed', side: 'sente' },
  { type: 'check', side: 'gote' },
  { type: 'gameOver', result: { winner: 'sente', reason: 'king-captured' } },
  { type: 'gameOver', result: { winner: null, reason: 'repetition' } },
];

test('マスは180度回り、2回回すと元どおり', () => {
  expect(mirrorSq({ c: 1, r: 2 })).toEqual({ c: 7, r: 6 });
  expect(mirrorSq(mirrorSq(B))).toEqual(B);
});

test('行動の全種類は2回回すと元どおり、1回なら違う', () => {
  for (const a of ACTIONS) {
    expect(mirrorAction(mirrorAction(a))).toEqual(a);
    if (a.type !== 'card' || a.targets.length) expect(mirrorAction(a)).not.toEqual(a);
  }
});

test('出来事の全種類は2回回すと元どおり', () => {
  expect(mirrorEvents(mirrorEvents(EVENTS))).toEqual(EVENTS);
  expect(mirrorEvents([EVENTS[1]])[0]).toMatchObject({ side: 'gote', to: { c: 7, r: 6 } });
});

test('決着は勝った側が入れ替わり、引き分けはそのまま', () => {
  expect(mirrorResult({ winner: 'sente', reason: 'resign' })).toEqual({ winner: 'gote', reason: 'resign' });
  expect(mirrorResult({ winner: null, reason: 'move-limit' })).toEqual({ winner: null, reason: 'move-limit' });
});

test('初期局面を回すと、後手の玉が手前に来て先手として見える', () => {
  const s = createGame({ sente: ['rakurai'], gote: ['kagami'] });
  const m = mirrorState(s);
  expect(m.board[8 * 9 + 4]).toMatchObject({ kind: 'OU', side: 'sente' });
  expect(m.players.sente.cards[0].cardId).toBe('kagami');
  expect(m.turn).toBe('gote');
  expect(fingerprint(mirrorState(m))).toBe(fingerprint(s));
});

test('回した局面の合法手は、本当の局面の合法手を回したものと同じ（でたらめ対局）', () => {
  // 入れ替えの術の2つの駒は、回すと並びが逆になるだけなので並べ替えて比べる
  const norm = (a: Action): Action => (a.type === 'card'
    ? { ...a, targets: [...a.targets].sort((p, q) => p.r * 9 + p.c - (q.r * 9 + q.c)) } : a);
  const key = (as: Action[]) => as.map((a) => JSON.stringify(norm(a))).sort();
  for (let seed = 1; seed <= 6; seed++) {
    const rand = makeRng(seed);
    let s: GameState = createGame({ sente: ['oshikaeshi', 'otoshiana', 'tenma'], gote: ['irekae', 'itetsuku', 'hagane'] });
    for (let i = 0; i < 80 && !s.result; i++) {
      const g = viewFor(s, 'gote');
      if (s.turn === 'gote') expect(key(legalActions(mirrorState(g)))).toEqual(key(legalActions(g).map(mirrorAction)));
      const acts = legalActions(s);
      s = applyAction(s, acts[Math.floor(rand() * acts.length)]).state;
    }
  }
});
