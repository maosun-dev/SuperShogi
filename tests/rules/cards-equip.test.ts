import { test, expect } from 'vitest';
import { applyAction, legalActions } from '../../src/rules/game';
import { idx } from '../../src/rules/board';
import { IllegalActionError } from '../../src/rules/types';
import type { Action, GameState, Square } from '../../src/rules/types';
import { emptyState, giveCard, put } from '../helpers';

type CardAction = Extract<Action, { type: 'card' }>;
const card = (uid: number, targets: Square[]): Action => ({ type: 'card', uid, targets });
const cardActs = (s: GameState, uid: number) =>
  legalActions(s).filter((a): a is CardAction => a.type === 'card' && a.uid === uid);
const mv = (from: Square, to: Square, promote = false, second?: { to: Square; promote: boolean }): Action =>
  second ? { type: 'move', from, to, promote, second } : { type: 'move', from, to, promote };
const pass = (s: GameState, side: 'sente' | 'gote') =>
  side === 'gote' ? mv({ c: 0, r: 0 }, { c: 0, r: 1 }) : mv({ c: 8, r: 8 }, { c: 8, r: 7 });

function base(): GameState {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  return s;
}

test('鋼の鎧は纏札の付いていない自分の王以外の駒にだけ付けられる', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'KI', 'sente');
  put(s, { c: 5, r: 5 }, 'GI', 'sente', { equip: 'tenma' });
  put(s, { c: 3, r: 3 }, 'GI', 'gote');
  const uid = giveCard(s, 'sente', 'hagane');
  const targets = cardActs(s, uid).map(a => a.targets);
  expect(targets).toContainEqual([{ c: 4, r: 4 }]);
  expect(targets).not.toContainEqual([{ c: 8, r: 8 }]); // 王には付けられない
  expect(targets).not.toContainEqual([{ c: 5, r: 5 }]);
  expect(targets).not.toContainEqual([{ c: 3, r: 3 }]);
  const ki = s.board[idx({ c: 4, r: 4 })]!;
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 4 }]));
  expect(state.board[idx({ c: 4, r: 4 })]!.equip).toEqual({ cardId: 'hagane' });
  expect(events).toContainEqual({ type: 'equipped', pieceId: ki.id, cardId: 'hagane' });
  expect(state.turn).toBe('gote');
});

test('天馬の蹄を付けた歩は桂馬の位置へ動ける', () => {
  const s = base();
  put(s, { c: 4, r: 6 }, 'FU', 'sente');
  const uid = giveCard(s, 'sente', 'tenma');
  const r1 = applyAction(s, card(uid, [{ c: 4, r: 6 }]));
  const r2 = applyAction(r1.state, pass(r1.state, 'gote'));
  expect(legalActions(r2.state)).toContainEqual(mv({ c: 4, r: 6 }, { c: 3, r: 4 }));
  expect(legalActions(r2.state)).toContainEqual(mv({ c: 4, r: 6 }, { c: 5, r: 4 }));
});

test('鋼の鎧：取られそうになると1回守り、攻めた駒は元のマスのまま。鎧は外れる', () => {
  const s = base();
  s.turn = 'gote';
  const ki = put(s, { c: 4, r: 4 }, 'KI', 'sente', { equip: 'hagane' });
  const hi = put(s, { c: 4, r: 1 }, 'HI', 'gote');
  const { state, events } = applyAction(s, mv({ c: 4, r: 1 }, { c: 4, r: 4 }));
  expect(events).toContainEqual({ type: 'armorBlocked', defenderId: ki.id, attackerId: hi.id, at: { c: 4, r: 4 } });
  expect(events.some(e => e.type === 'captured' || e.type === 'moved')).toBe(false);
  expect(state.board[idx({ c: 4, r: 4 })]).toMatchObject({ id: ki.id, equip: null });
  expect(state.board[idx({ c: 4, r: 1 })]?.id).toBe(hi.id);
  expect(state.players.gote.hand.KI).toBe(0);
  expect(state.turn).toBe('sente');
});

test('鋼の鎧：成る手で止められても、攻めた駒は成らない', () => {
  const s = base();
  put(s, { c: 4, r: 2 }, 'KI', 'gote', { equip: 'hagane' });
  put(s, { c: 4, r: 3 }, 'GI', 'sente');
  const { state } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 2 }, true));
  expect(state.board[idx({ c: 4, r: 3 })]).toMatchObject({ kind: 'GI', promoted: false });
});

test('鋼の鎧：2回目は普通に取られる', () => {
  const s = base();
  s.turn = 'gote';
  put(s, { c: 4, r: 4 }, 'KI', 'sente', { equip: 'hagane' });
  put(s, { c: 4, r: 1 }, 'HI', 'gote');
  const r1 = applyAction(s, mv({ c: 4, r: 1 }, { c: 4, r: 4 }));
  const r2 = applyAction(r1.state, pass(r1.state, 'sente'));
  const r3 = applyAction(r2.state, mv({ c: 4, r: 1 }, { c: 4, r: 4 }));
  expect(r3.state.board[idx({ c: 4, r: 4 })]).toMatchObject({ kind: 'HI', side: 'gote' });
  expect(r3.state.players.gote.hand.KI).toBe(1);
});

test('鋼の鎧は落雷を防がない', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'KI', 'gote', { equip: 'hagane' });
  const uid = giveCard(s, 'sente', 'rakurai');
  const { state } = applyAction(s, card(uid, [{ c: 4, r: 4 }]));
  expect(state.board[idx({ c: 4, r: 4 })]).toBeNull();
});

test('王の盾：盾の駒と周り8マスの味方は、相手の落雷・押し返しの対象外。9マス外の味方は対象', () => {
  const s = base();
  put(s, { c: 4, r: 3 }, 'GI', 'gote', { equip: 'tate' });
  put(s, { c: 5, r: 4 }, 'KI', 'gote');    // 斜め隣
  put(s, { c: 6, r: 3 }, 'KI', 'gote');    // 2マス離れている
  put(s, { c: 3, r: 4 }, 'FU', 'sente');   // 隣の相手の駒は守られない（先手の駒）
  const rak = giveCard(s, 'sente', 'rakurai');
  const osh = giveCard(s, 'sente', 'oshikaeshi');
  const rakT = cardActs(s, rak).map(a => a.targets[0]);
  const oshT = cardActs(s, osh).map(a => a.targets[0]);
  for (const ts of [rakT, oshT]) {
    expect(ts).not.toContainEqual({ c: 4, r: 3 });
    expect(ts).not.toContainEqual({ c: 5, r: 4 });
    expect(ts).toContainEqual({ c: 6, r: 3 });
  }
});

test('王の盾：自分の入れ替えの術は防がない', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'GI', 'sente', { equip: 'tate' });
  const uid = giveCard(s, 'sente', 'irekae');
  expect(cardActs(s, uid).map(a => a.targets)).toContainEqual([{ c: 4, r: 4 }, { c: 8, r: 8 }]);
});

test('韋駄天：1手で2回動ける。2回目に取る手は不正', () => {
  const s = base();
  const ki = put(s, { c: 4, r: 6 }, 'KI', 'sente', { equip: 'idaten' });
  put(s, { c: 4, r: 3 }, 'FU', 'gote');
  const acts = legalActions(s);
  expect(acts).toContainEqual(mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 4 }, promote: false }));
  expect(acts).not.toContainEqual(mv({ c: 4, r: 6 }, { c: 4, r: 4 }, false, { to: { c: 4, r: 3 }, promote: false }));
  expect(() => applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 3 }, promote: false })))
    .toThrow(IllegalActionError);
  const { state, events } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 4 }, promote: false }));
  expect(state.board[idx({ c: 4, r: 4 })]?.id).toBe(ki.id);
  expect(events.filter(e => e.type === 'moved')).toHaveLength(2);
  expect(state.turn).toBe('gote');
  expect(state.ply).toBe(1);
});

test('韋駄天：1手目で取って、2回目で元のマスへ戻れる', () => {
  const s = base();
  put(s, { c: 4, r: 6 }, 'KI', 'sente', { equip: 'idaten' });
  put(s, { c: 4, r: 5 }, 'FU', 'gote');
  const a = mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 6 }, promote: false });
  expect(legalActions(s)).toContainEqual(a);
  const { state } = applyAction(s, a);
  expect(state.players.sente.hand.FU).toBe(1);
  expect(state.board[idx({ c: 4, r: 6 })]).toMatchObject({ kind: 'KI', side: 'sente' });
});

test('韋駄天：2回目なしでもよい', () => {
  const s = base();
  put(s, { c: 4, r: 6 }, 'KI', 'sente', { equip: 'idaten' });
  const { state } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 5 }));
  expect(state.board[idx({ c: 4, r: 5 })]).toMatchObject({ kind: 'KI' });
  expect(state.turn).toBe('gote');
});

test('韋駄天：1手目で王を取ったら second は不正、second なしなら勝ち', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 5 }, 'OU', 'gote');
  put(s, { c: 4, r: 6 }, 'KI', 'sente', { equip: 'idaten' });
  expect(() => applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 4 }, promote: false })))
    .toThrow(IllegalActionError);
  const { state } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 5 }));
  expect(state.result).toEqual({ winner: 'sente', reason: 'king-captured' });
});

test('韋駄天の2回目でも成れる', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'GI', 'sente', { equip: 'idaten' });
  const a = mv({ c: 4, r: 4 }, { c: 4, r: 3 }, false, { to: { c: 4, r: 2 }, promote: true });
  expect(legalActions(s)).toContainEqual(a);
  const { state } = applyAction(s, a);
  expect(state.board[idx({ c: 4, r: 2 })]).toMatchObject({ kind: 'GI', promoted: true, equip: { cardId: 'idaten' } });
});

test('装備した駒が成っても装備は残る', () => {
  const s = base();
  put(s, { c: 4, r: 3 }, 'GI', 'sente', { equip: 'hagane' });
  const { state } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 2 }, true));
  expect(state.board[idx({ c: 4, r: 2 })]).toMatchObject({ promoted: true, equip: { cardId: 'hagane' } });
});

test('装備した駒が取られると、持ち駒に装備は付いてこない', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'FU', 'sente');
  put(s, { c: 4, r: 3 }, 'GI', 'gote', { equip: 'tenma' });
  const r1 = applyAction(s, mv({ c: 4, r: 4 }, { c: 4, r: 3 }));
  expect(r1.state.players.sente.hand.GI).toBe(1);
  const r2 = applyAction(r1.state, pass(r1.state, 'gote'));
  const r3 = applyAction(r2.state, { type: 'drop', kind: 'GI', to: { c: 2, r: 4 } });
  expect(r3.state.board[idx({ c: 2, r: 4 })]).toMatchObject({ kind: 'GI', equip: null });
});
