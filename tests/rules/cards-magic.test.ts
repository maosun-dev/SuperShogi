import { test, expect } from 'vitest';
import { applyAction, legalActions } from '../../src/rules/game';
import { idx } from '../../src/rules/board';
import { IllegalActionError } from '../../src/rules/types';
import type { Action, GameState, HandKind, Square } from '../../src/rules/types';
import { emptyState, giveCard, put } from '../helpers';

type CardAction = Extract<Action, { type: 'card' }>;
const card = (uid: number, targets: Square[], pick?: HandKind): Action =>
  pick ? { type: 'card', uid, targets, pick } : { type: 'card', uid, targets };
const cardActs = (s: GameState, uid: number) =>
  legalActions(s).filter((a): a is CardAction => a.type === 'card' && a.uid === uid);
const mv = (from: Square, to: Square): Action => ({ type: 'move', from, to, promote: false });

// 両方の王を隅に置いた局面
function base(): GameState {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  return s;
}

test('落雷で相手の銀が消え、誰の持ち駒にもならない。destroyed が出て手番が終わる', () => {
  const s = base();
  const gi = put(s, { c: 4, r: 4 }, 'GI', 'gote');
  const uid = giveCard(s, 'sente', 'rakurai');
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 4 }]));
  expect(state.board[idx({ c: 4, r: 4 })]).toBeNull();
  expect(state.players.sente.hand.GI).toBe(0);
  expect(state.players.gote.hand.GI).toBe(0);
  expect(events).toContainEqual({ type: 'cardUsed', side: 'sente', cardId: 'rakurai', targets: [{ c: 4, r: 4 }] });
  expect(events).toContainEqual({ type: 'destroyed', pieceId: gi.id, at: { c: 4, r: 4 }, cause: 'rakurai' });
  expect(state.turn).toBe('gote');
  expect(state.ply).toBe(1);
});

test('落雷の対象に王・飛・角・竜・馬は入らない', () => {
  const s = base();
  put(s, { c: 1, r: 1 }, 'HI', 'gote');
  put(s, { c: 2, r: 1 }, 'KA', 'gote');
  put(s, { c: 3, r: 1 }, 'HI', 'gote', { promoted: true });
  put(s, { c: 4, r: 1 }, 'KA', 'gote', { promoted: true });
  put(s, { c: 5, r: 1 }, 'KI', 'gote');
  put(s, { c: 6, r: 6 }, 'GI', 'sente');
  const uid = giveCard(s, 'sente', 'rakurai');
  expect(cardActs(s, uid).map(a => a.targets)).toEqual([[{ c: 5, r: 1 }]]);
  expect(() => applyAction(s, card(uid, [{ c: 0, r: 0 }]))).toThrow(IllegalActionError);
});

test('押し返しの風：後手の歩 {4,3} が {4,2} へ。後ろが埋まっていれば対象外', () => {
  const s = base();
  const fu = put(s, { c: 4, r: 3 }, 'FU', 'gote');
  put(s, { c: 6, r: 3 }, 'FU', 'gote');
  put(s, { c: 6, r: 2 }, 'KI', 'gote');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const targets = cardActs(s, uid).map(a => a.targets[0]);
  expect(targets).toContainEqual({ c: 4, r: 3 });
  expect(targets).not.toContainEqual({ c: 6, r: 3 });
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 3 }]));
  expect(state.board[idx({ c: 4, r: 2 })]?.id).toBe(fu.id);
  expect(state.board[idx({ c: 4, r: 3 })]).toBeNull();
  expect(events).toContainEqual({ type: 'pushed', pieceId: fu.id, from: { c: 4, r: 3 }, to: { c: 4, r: 2 } });
});

test('押し返しの風：先手の駒は r+1 へ押される。盤の外へは押せない', () => {
  const s = base();
  s.turn = 'gote';
  const fu = put(s, { c: 4, r: 5 }, 'FU', 'sente');
  const uid = giveCard(s, 'gote', 'oshikaeshi');
  const targets = cardActs(s, uid).map(a => a.targets[0]);
  expect(targets).not.toContainEqual({ c: 8, r: 8 });   // 先手の王は最下段
  const { state } = applyAction(s, card(uid, [{ c: 4, r: 5 }]));
  expect(state.board[idx({ c: 4, r: 6 })]?.id).toBe(fu.id);
});

test('押し返しの風は王も押せる', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  const ou = put(s, { c: 4, r: 3 }, 'OU', 'gote');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const { state } = applyAction(s, card(uid, [{ c: 4, r: 3 }]));
  expect(state.board[idx({ c: 4, r: 2 })]?.id).toBe(ou.id);
});

test('入れ替えの術：自分の王と金を入れ替えられる', () => {
  const s = base();
  const ki = put(s, { c: 7, r: 7 }, 'KI', 'sente');
  const uid = giveCard(s, 'sente', 'irekae');
  const ou = s.board[idx({ c: 8, r: 8 })]!;
  const { state, events } = applyAction(s, card(uid, [{ c: 7, r: 7 }, { c: 8, r: 8 }]));
  expect(state.board[idx({ c: 7, r: 7 })]?.id).toBe(ou.id);
  expect(state.board[idx({ c: 8, r: 8 })]?.id).toBe(ki.id);
  expect(events).toContainEqual({ type: 'swapped', a: { c: 7, r: 7 }, b: { c: 8, r: 8 } });
});

test('入れ替えの術：歩を r=0 へ動かす組は対象外', () => {
  const s = emptyState();
  put(s, { c: 4, r: 0 }, 'KI', 'sente');
  put(s, { c: 3, r: 5 }, 'FU', 'sente');
  const uid = giveCard(s, 'sente', 'irekae');
  expect(cardActs(s, uid)).toEqual([]);
});

test('入れ替えの術：二歩になる組は対象外', () => {
  const s = emptyState();
  put(s, { c: 2, r: 6 }, 'FU', 'sente');
  put(s, { c: 3, r: 6 }, 'FU', 'sente');
  put(s, { c: 3, r: 7 }, 'KI', 'sente');
  const uid = giveCard(s, 'sente', 'irekae');
  const pairs = cardActs(s, uid).map(a => a.targets);
  // 2筋の歩と3筋の金を入れ替えると3筋に歩が2枚になる
  expect(pairs).not.toContainEqual([{ c: 2, r: 6 }, { c: 3, r: 7 }]);
  // 歩どうしの入れ替えは二歩にならない
  expect(pairs).toContainEqual([{ c: 2, r: 6 }, { c: 3, r: 6 }]);
  expect(pairs).toContainEqual([{ c: 3, r: 6 }, { c: 3, r: 7 }]);
});

test('呼び戻し：相手の持ち駒が飛と歩なら、legalActions に pick:"HI" と pick:"FU" の2つが出る。pick:"HI" で飛がこちらへ移り handTransferred が出る', () => {
  const s = base();
  s.players.gote.hand.HI = 1;
  s.players.gote.hand.FU = 2;
  const uid = giveCard(s, 'sente', 'yobimodoshi');
  const acts = cardActs(s, uid);
  expect(acts).toHaveLength(2);
  expect(acts.map(a => a.pick).sort()).toEqual(['FU', 'HI']);
  const { state, events } = applyAction(s, card(uid, [], 'HI'));
  expect(state.players.sente.hand.HI).toBe(1);
  expect(state.players.gote.hand.HI).toBe(0);
  expect(state.players.gote.hand.FU).toBe(2);
  expect(events).toContainEqual({ type: 'handTransferred', kind: 'HI', from: 'gote', to: 'sente' });
});

test('呼び戻し：pick がないか、相手が持っていない種類なら IllegalActionError', () => {
  const s = base();
  s.players.gote.hand.FU = 1;
  const uid = giveCard(s, 'sente', 'yobimodoshi');
  expect(() => applyAction(s, card(uid, []))).toThrow(IllegalActionError);
  expect(() => applyAction(s, card(uid, [], 'HI'))).toThrow(IllegalActionError);
});

test('呼び戻し：相手の持ち駒が0なら legalActions に入らない', () => {
  const s = base();
  const uid = giveCard(s, 'sente', 'yobimodoshi');
  expect(cardActs(s, uid)).toEqual([]);
});

test('使ったカードはもう使えない（used）', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'GI', 'gote');
  put(s, { c: 5, r: 4 }, 'GI', 'gote');
  const uid = giveCard(s, 'sente', 'rakurai');
  const r1 = applyAction(s, card(uid, [{ c: 4, r: 4 }]));
  expect(r1.state.players.sente.cards[0].used).toBe(true);
  const r2 = applyAction(r1.state, mv({ c: 0, r: 0 }, { c: 0, r: 1 }));
  expect(cardActs(r2.state, uid)).toEqual([]);
  expect(() => applyAction(r2.state, card(uid, [{ c: 5, r: 4 }]))).toThrow(IllegalActionError);
});

test('相手のカードは使えない', () => {
  const s = base();
  put(s, { c: 4, r: 6 }, 'GI', 'sente');
  const uid = giveCard(s, 'gote', 'rakurai');
  expect(() => applyAction(s, card(uid, [{ c: 4, r: 6 }]))).toThrow(IllegalActionError);
});


// ---------- 押し返しの風の続き（計画9） ----------

test('押し返しの風のあと、手番は終わらず駒を動かせる。術札・纏札はもう使えない', () => {
  const s = base();
  put(s, { c: 4, r: 3 }, 'FU', 'gote');
  put(s, { c: 4, r: 6 }, 'FU', 'sente');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const rak = giveCard(s, 'sente', 'rakurai');
  const ten = giveCard(s, 'sente', 'tenma');
  const { state } = applyAction(s, card(uid, [{ c: 4, r: 3 }]));
  expect(state.turn).toBe('sente');
  expect(state.pushFollowUp).toBe(true);
  const acts = legalActions(state);
  expect(acts.some(a => a.type === 'move')).toBe(true);
  expect(acts.some(a => a.type === 'card' && (a.uid === rak || a.uid === ten))).toBe(false);
});

test('押し返しの続きで駒を動かすと、手番が相手へ移り続きの印が消える', () => {
  const s = base();
  put(s, { c: 4, r: 3 }, 'FU', 'gote');
  put(s, { c: 4, r: 6 }, 'FU', 'sente');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const r1 = applyAction(s, card(uid, [{ c: 4, r: 3 }]));
  const r2 = applyAction(r1.state, mv({ c: 4, r: 6 }, { c: 4, r: 5 }));
  expect(r2.state.turn).toBe('gote');
  expect(r2.state.pushFollowUp).toBe(false);
});

test('押し返しの続きでも忍札を1枚伏せられ、伏せたあとも続きの手が残る', () => {
  const s = base();
  put(s, { c: 4, r: 3 }, 'FU', 'gote');
  put(s, { c: 4, r: 6 }, 'FU', 'sente');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const kag = giveCard(s, 'sente', 'kagami');
  const r1 = applyAction(s, card(uid, [{ c: 4, r: 3 }]));
  const r2 = applyAction(r1.state, card(kag, []));
  expect(r2.state.turn).toBe('sente');
  expect(r2.state.pushFollowUp).toBe(true);
  expect(legalActions(r2.state).some(a => a.type === 'move')).toBe(true);
});

test('押し返しの続きに指せる手が1つもなければ、passed で手番が相手へ回る', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente', { frozen: 2 });
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 3 }, 'FU', 'gote');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 3 }]));
  expect(events.some(e => e.type === 'passed' && e.side === 'sente')).toBe(true);
  expect(state.turn).toBe('gote');
  expect(state.pushFollowUp).toBe(false);
});
