import { test, expect } from 'vitest';
import { applyAction, legalActions } from '../../src/rules/game';
import { idx } from '../../src/rules/board';
import type { Action, GameState, Square } from '../../src/rules/types';
import { emptyState, giveCard, put, setTrap } from '../helpers';

type CardAction = Extract<Action, { type: 'card' }>;
const card = (uid: number, targets: Square[]): Action => ({ type: 'card', uid, targets });
const cardActs = (s: GameState, uid: number) =>
  legalActions(s).filter((a): a is CardAction => a.type === 'card' && a.uid === uid);
const mv = (from: Square, to: Square, promote = false, second?: { to: Square; promote: boolean }): Action =>
  second ? { type: 'move', from, to, promote, second } : { type: 'move', from, to, promote };

function base(): GameState {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  return s;
}

test('落とし穴は空きマスにだけ伏せられる', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'GI', 'gote');
  const uid = giveCard(s, 'sente', 'otoshiana');
  const targets = cardActs(s, uid).map(a => a.targets);
  expect(targets).toHaveLength(81 - 3);
  expect(targets).not.toContainEqual([{ c: 4, r: 4 }]);
  expect(targets).not.toContainEqual([{ c: 8, r: 8 }]);
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 5 }]));
  expect(state.traps).toEqual([expect.objectContaining({ owner: 'sente', cardId: 'otoshiana', at: { c: 4, r: 5 } })]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'trapSet', side: 'sente', cardId: 'otoshiana', at: { c: 4, r: 5 } }));
  // 罠の場所が漏れないよう、罠には cardUsed を出さない
  expect(events.some(e => e.type === 'cardUsed')).toBe(false);
  expect(state.players.sente.cards[0].used).toBe(true);
  expect(state.turn).toBe('gote');
});

test('自分の落とし穴があるマスには、もう1つ伏せられない', () => {
  const s = base();
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 5 });
  const uid = giveCard(s, 'sente', 'otoshiana');
  expect(cardActs(s, uid).map(a => a.targets)).not.toContainEqual([{ c: 4, r: 5 }]);
});

test('鏡の結界・成り封じは対象なしで伏せ札置き場に置く', () => {
  const s = base();
  const uid = giveCard(s, 'sente', 'kagami');
  expect(cardActs(s, uid).map(a => a.targets)).toEqual([[]]);
  const { state, events } = applyAction(s, card(uid, []));
  expect(state.traps).toEqual([expect.objectContaining({ owner: 'sente', cardId: 'kagami', at: null })]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'trapSet', cardId: 'kagami', at: null }));
});

test('相手の駒が落とし穴のマスに入ると壊れ、罠は消える', () => {
  const s = base();
  s.turn = 'gote';
  const trap = setTrap(s, 'sente', 'otoshiana', { c: 4, r: 4 });
  const fu = put(s, { c: 4, r: 3 }, 'FU', 'gote');
  const { state, events } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 4 }));
  expect(state.board[idx({ c: 4, r: 4 })]).toBeNull();
  expect(state.traps).toEqual([]);
  const ti = events.findIndex(e => e.type === 'trapTriggered');
  const mi = events.findIndex(e => e.type === 'moved');
  expect(mi).toBeGreaterThanOrEqual(0);
  expect(ti).toBeGreaterThan(mi);
  expect(events[ti]).toEqual({ type: 'trapTriggered', owner: 'sente', uid: trap, cardId: 'otoshiana', at: { c: 4, r: 4 } });
  expect(events).toContainEqual({ type: 'destroyed', pieceId: fu.id, at: { c: 4, r: 4 }, cause: 'otoshiana' });
  expect(state.players.sente.hand.FU + state.players.gote.hand.FU).toBe(0);
});

test('自分の駒が自分の落とし穴に入っても発動しない', () => {
  const s = base();
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 5 });
  put(s, { c: 4, r: 6 }, 'FU', 'sente');
  const { state } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 5 }));
  expect(state.board[idx({ c: 4, r: 5 })]).toMatchObject({ kind: 'FU' });
  expect(state.traps).toHaveLength(1);
});

test('王が入っても発動せず、罠は残る', () => {
  const s = emptyState('gote');
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 3 }, 'OU', 'gote');
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 4 });
  const { state, events } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 4 }));
  expect(state.board[idx({ c: 4, r: 4 })]).toMatchObject({ kind: 'OU', side: 'gote' });
  expect(state.traps).toHaveLength(1);
  expect(events.some(e => e.type === 'trapTriggered')).toBe(false);
});

test('持ち駒を落とし穴のマスに打っても発動する', () => {
  const s = base();
  s.turn = 'gote';
  s.players.gote.hand.KI = 1;
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 4 });
  const { state, events } = applyAction(s, { type: 'drop', kind: 'KI', to: { c: 4, r: 4 } });
  expect(state.board[idx({ c: 4, r: 4 })]).toBeNull();
  expect(state.players.gote.hand.KI).toBe(0);
  expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['dropped', 'trapTriggered', 'destroyed']));
});

test('取る手で落とし穴に入ると、取ったあと落ちる（取った駒は持ち駒に入る）', () => {
  const s = base();
  s.turn = 'gote';
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 4 });
  put(s, { c: 4, r: 4 }, 'GI', 'sente');   // 先手が自分の穴の上に置いた駒
  put(s, { c: 4, r: 3 }, 'FU', 'gote');
  const { state, events } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 4 }));
  expect(state.players.gote.hand.GI).toBe(1);
  expect(state.board[idx({ c: 4, r: 4 })]).toBeNull();
  const types = events.map(e => e.type);
  expect(types.indexOf('captured')).toBeLessThan(types.indexOf('moved'));
  expect(types.indexOf('moved')).toBeLessThan(types.indexOf('trapTriggered'));
  expect(types.indexOf('trapTriggered')).toBeLessThan(types.indexOf('destroyed'));
});

test('押し返しの風で、相手の駒をこちらの落とし穴へ押し込める', () => {
  const s = base();
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 2 });
  const fu = put(s, { c: 4, r: 3 }, 'FU', 'gote');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 3 }]));
  expect(state.board[idx({ c: 4, r: 2 })]).toBeNull();
  expect(events).toContainEqual({ type: 'destroyed', pieceId: fu.id, at: { c: 4, r: 2 }, cause: 'otoshiana' });
});

test('入れ替えの術で、自分の駒が相手の落とし穴のマスに入ると発動する', () => {
  const s = emptyState();
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  // 先手の王が後手の穴の上にいる（王なので発動していない）
  put(s, { c: 4, r: 4 }, 'OU', 'sente');
  setTrap(s, 'gote', 'otoshiana', { c: 4, r: 4 });
  const ki = put(s, { c: 6, r: 6 }, 'KI', 'sente');
  const uid = giveCard(s, 'sente', 'irekae');
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 4 }, { c: 6, r: 6 }]));
  expect(state.board[idx({ c: 6, r: 6 })]).toMatchObject({ kind: 'OU' });
  expect(state.board[idx({ c: 4, r: 4 })]).toBeNull();
  expect(events).toContainEqual({ type: 'destroyed', pieceId: ki.id, at: { c: 4, r: 4 }, cause: 'otoshiana' });
  expect(state.traps).toEqual([]);
});

test('韋駄天の1手目で落とし穴に落ちたら、2手目は secondMoveSkipped', () => {
  const s = base();
  setTrap(s, 'gote', 'otoshiana', { c: 4, r: 5 });
  const ki = put(s, { c: 4, r: 6 }, 'KI', 'sente', { equip: 'idaten' });
  const a = mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 4 }, promote: false });
  const { state, events } = applyAction(s, a);
  expect(events).toContainEqual({ type: 'secondMoveSkipped', pieceId: ki.id });
  expect(state.board[idx({ c: 4, r: 4 })]).toBeNull();
  expect(state.board[idx({ c: 4, r: 5 })]).toBeNull();
  expect(state.turn).toBe('gote');
});

test('韋駄天の1手目が鋼の鎧に止められたら、2手目は secondMoveSkipped', () => {
  const s = base();
  put(s, { c: 4, r: 5 }, 'FU', 'gote', { equip: 'hagane' });
  const ki = put(s, { c: 4, r: 6 }, 'KI', 'sente', { equip: 'idaten' });
  const a = mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 3, r: 5 }, promote: false });
  expect(legalActions(s)).toContainEqual(a);
  const { state, events } = applyAction(s, a);
  expect(events).toContainEqual({ type: 'secondMoveSkipped', pieceId: ki.id });
  expect(state.board[idx({ c: 4, r: 6 })]?.id).toBe(ki.id);
  expect(state.board[idx({ c: 3, r: 5 })]).toBeNull();
});

test('韋駄天の2手目で落とし穴に入っても発動する', () => {
  const s = base();
  setTrap(s, 'gote', 'otoshiana', { c: 4, r: 4 });
  put(s, { c: 4, r: 6 }, 'KI', 'sente', { equip: 'idaten' });
  const a = mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 4 }, promote: false });
  const { state } = applyAction(s, a);
  expect(state.board[idx({ c: 4, r: 4 })]).toBeNull();
});

test('鏡の結界：相手の落雷が無効になり、相手の手番は終わる。落雷のカードは使用済み', () => {
  const s = base();
  const trap = setTrap(s, 'gote', 'kagami');
  const gi = put(s, { c: 4, r: 4 }, 'GI', 'gote');
  const uid = giveCard(s, 'sente', 'rakurai');
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 4 }]));
  expect(state.board[idx({ c: 4, r: 4 })]?.id).toBe(gi.id);
  expect(state.players.sente.cards[0].used).toBe(true);
  expect(state.traps).toEqual([]);
  expect(state.turn).toBe('gote');
  expect(events).toContainEqual({ type: 'trapTriggered', owner: 'gote', uid: trap, cardId: 'kagami', at: null });
  expect(events).toContainEqual({ type: 'magicNegated', side: 'sente', cardId: 'rakurai' });
  expect(events.some(e => e.type === 'destroyed')).toBe(false);
});

test('鏡の結界：2枚あっても発動するのは uid が小さい1枚だけ。自分の魔法には発動しない', () => {
  const s = base();
  const t1 = setTrap(s, 'gote', 'kagami');
  const t2 = setTrap(s, 'gote', 'kagami');
  setTrap(s, 'sente', 'kagami');
  const uid = giveCard(s, 'sente', 'itetsuku');
  const { state } = applyAction(s, card(uid, []));
  expect(state.traps.map(t => t.uid)).toContain(t2);
  expect(state.traps.map(t => t.uid)).not.toContain(t1);
  expect(state.traps.filter(t => t.owner === 'sente')).toHaveLength(1);
  expect(state.frozen).toBeNull();
});

test('鏡の結界は装備カードには発動しない', () => {
  const s = base();
  setTrap(s, 'gote', 'kagami');
  const uid = giveCard(s, 'sente', 'hagane');
  const { state } = applyAction(s, card(uid, [{ c: 8, r: 8 }]));
  expect(state.board[idx({ c: 8, r: 8 })]!.equip).toEqual({ cardId: 'hagane' });
  expect(state.traps).toHaveLength(1);
});

test('成り封じ：相手が成ろうとすると成らずに動く', () => {
  const s = base();
  const trap = setTrap(s, 'gote', 'narifuuji');
  const gi = put(s, { c: 4, r: 3 }, 'GI', 'sente');
  const { state, events } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 2 }, true));
  expect(state.board[idx({ c: 4, r: 2 })]).toMatchObject({ kind: 'GI', promoted: false });
  expect(events).toContainEqual({ type: 'trapTriggered', owner: 'gote', uid: trap, cardId: 'narifuuji', at: null });
  expect(events).toContainEqual({ type: 'promotionBlocked', pieceId: gi.id });
  expect(events).toContainEqual(expect.objectContaining({ type: 'moved', promoted: false }));
  expect(state.traps).toEqual([]);
});

test('成り封じ：成らない手では発動しない', () => {
  const s = base();
  setTrap(s, 'gote', 'narifuuji');
  put(s, { c: 4, r: 3 }, 'GI', 'sente');
  const { state } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 2 }, false));
  expect(state.traps).toHaveLength(1);
});

test('成り封じ：歩が最奥段に入る（成りが必須）ときは発動しない', () => {
  const s = base();
  setTrap(s, 'gote', 'narifuuji');
  put(s, { c: 4, r: 1 }, 'FU', 'sente');
  const { state } = applyAction(s, mv({ c: 4, r: 1 }, { c: 4, r: 0 }, true));
  expect(state.board[idx({ c: 4, r: 0 })]).toMatchObject({ promoted: true });
  expect(state.traps).toHaveLength(1);
});

test('罠が3枚伏せてあると、4枚目の罠カードは legalActions に入らない', () => {
  const s = base();
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 4 });
  setTrap(s, 'sente', 'kagami');
  setTrap(s, 'gote', 'kagami');
  const a = giveCard(s, 'sente', 'narifuuji');
  const b = giveCard(s, 'sente', 'otoshiana');
  expect(cardActs(s, a)).toHaveLength(1);
  const r1 = applyAction(s, card(a, []));
  const r2 = applyAction(r1.state, mv({ c: 0, r: 0 }, { c: 0, r: 1 }));
  expect(cardActs(r2.state, b)).toEqual([]);
});

test('罠の発動は手番に数えない（発動のあとも手番は普通に交代する）', () => {
  const s = base();
  s.turn = 'gote';
  setTrap(s, 'sente', 'otoshiana', { c: 4, r: 4 });
  put(s, { c: 4, r: 3 }, 'FU', 'gote');
  const { state } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 4 }));
  expect(state.turn).toBe('sente');
  expect(state.ply).toBe(1);
});

test('韋駄天＋成り封じ：1手目の成りを封じられ、2手目がその駒で動けない手なら secondMoveSkipped', () => {
  const s = base();
  setTrap(s, 'gote', 'narifuuji');
  const gi = put(s, { c: 4, r: 3 }, 'GI', 'sente', { equip: 'idaten' });
  // 成銀なら横へ動けるが、成れなかった銀は横へ動けない
  const a = mv({ c: 4, r: 3 }, { c: 4, r: 2 }, true, { to: { c: 5, r: 2 }, promote: false });
  expect(legalActions(s)).toContainEqual(a);
  const { state, events } = applyAction(s, a);
  expect(events).toContainEqual({ type: 'secondMoveSkipped', pieceId: gi.id });
  expect(state.board[idx({ c: 4, r: 2 })]).toMatchObject({ kind: 'GI', promoted: false });
  expect(state.board[idx({ c: 5, r: 2 })]).toBeNull();
});

test('韋駄天＋成り封じ：成れなかった歩が、成らずに最奥段へ入ることはない', () => {
  const s = base();
  setTrap(s, 'gote', 'narifuuji');
  const fu = put(s, { c: 4, r: 2 }, 'FU', 'sente', { equip: 'idaten' });
  const a = mv({ c: 4, r: 2 }, { c: 4, r: 1 }, true, { to: { c: 4, r: 0 }, promote: false });
  expect(legalActions(s)).toContainEqual(a);
  const { state, events } = applyAction(s, a);
  expect(events).toContainEqual({ type: 'secondMoveSkipped', pieceId: fu.id });
  expect(state.board[idx({ c: 4, r: 0 })]).toBeNull();
  expect(state.board[idx({ c: 4, r: 1 })]).toMatchObject({ kind: 'FU', promoted: false });
});

test('韋駄天＋成り封じ：2手目がその駒でも動ける手なら、そのまま動く', () => {
  const s = base();
  setTrap(s, 'gote', 'narifuuji');
  put(s, { c: 4, r: 3 }, 'GI', 'sente', { equip: 'idaten' });
  const a = mv({ c: 4, r: 3 }, { c: 4, r: 2 }, true, { to: { c: 4, r: 1 }, promote: false });
  const { state } = applyAction(s, a);
  expect(state.board[idx({ c: 4, r: 1 })]).toMatchObject({ kind: 'GI', promoted: false });
});
