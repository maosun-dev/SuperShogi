import { test, expect } from 'vitest';
import { applyAction, legalActions } from '../../src/rules/game';
import { idx } from '../../src/rules/board';
import { pieceTargets } from '../../src/rules/moves';
import { CARDS } from '../../src/cards';
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

test('王の盾がなくなり、落雷・押し返しはどの相手の駒にも使える（王・大駒の決まりは別）', () => {
  const s = base();
  put(s, { c: 4, r: 3 }, 'GI', 'gote');
  put(s, { c: 5, r: 4 }, 'KI', 'gote');
  const rak = giveCard(s, 'sente', 'rakurai');
  const osh = giveCard(s, 'sente', 'oshikaeshi');
  for (const uid of [rak, osh]) {
    const ts = cardActs(s, uid).map(a => a.targets[0]);
    expect(ts).toContainEqual({ c: 4, r: 3 });
    expect(ts).toContainEqual({ c: 5, r: 4 });
  }
});

test('退き陣の旗：先手の歩が真後ろへ1マス下がれる', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'FU', 'sente', { equip: 'hikijin' });
  const t = pieceTargets(s, { c: 4, r: 4 });
  expect(t).toContainEqual({ c: 4, r: 3 });
  expect(t).toContainEqual({ c: 4, r: 5 });
  expect(t).toHaveLength(2);
});

test('退き陣の旗：後手の銀は後手から見た真後ろ（r が1小さいマス）が増える', () => {
  const s = base();
  put(s, { c: 4, r: 3 }, 'GI', 'gote', { equip: 'hikijin' });
  const t = pieceTargets(s, { c: 4, r: 3 });
  expect(t).toContainEqual({ c: 4, r: 2 });
  expect(t).toHaveLength(6);
});

test('退き陣の旗：成った駒では効き目がない（金と同じ動きのまま）', () => {
  const s = base();
  put(s, { c: 4, r: 4 }, 'FU', 'sente', { promoted: true, equip: 'hikijin' });
  expect(pieceTargets(s, { c: 4, r: 4 })).toHaveLength(6);
});

test('退き陣の旗：付けられるのは纏札のない、成っていない自分の歩・香・桂・銀だけ', () => {
  const s = base();
  for (const [c, k] of [[0, 'FU'], [1, 'KY'], [2, 'KE'], [3, 'GI']] as const) put(s, { c, r: 6 }, k, 'sente');
  put(s, { c: 5, r: 6 }, 'KI', 'sente');
  put(s, { c: 6, r: 6 }, 'HI', 'sente');
  put(s, { c: 7, r: 6 }, 'FU', 'sente', { promoted: true });
  put(s, { c: 8, r: 6 }, 'GI', 'sente', { equip: 'tenma' });
  put(s, { c: 0, r: 3 }, 'FU', 'gote');
  const uid = giveCard(s, 'sente', 'hikijin');
  const ts = cardActs(s, uid).map(a => a.targets[0]);
  expect(ts.sort((x, y) => x.c - y.c)).toEqual([0, 1, 2, 3].map(c => ({ c, r: 6 })));
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

// ---------- 重りの枷は3手番で外れる（計画9） ----------

// 先手が後手の銀に枷を付け、両者が王を動かして手番を回す
function shackled() {
  const s = base();
  put(s, { c: 8, r: 6 }, 'GI', 'gote');
  const uid = giveCard(s, 'sente', 'omori');
  return applyAction(s, card(uid, [{ c: 8, r: 6 }])).state;
}
const kingShuffle = (s: GameState): GameState => {
  const side = s.turn;
  const from = s.board.findIndex(p => p?.kind === 'OU' && p.side === side);
  const f = { c: from % 9, r: Math.floor(from / 9) };
  const to = legalActions(s).find(a => a.type === 'move' && a.from.c === f.c && a.from.r === f.r)!;
  return applyAction(s, to).state;
};

test('重りの枷：付けたときは残り3。先手の手番の終わりでは減らない', () => {
  const s = shackled();
  expect(s.board[idx({ c: 8, r: 6 })]?.equip).toEqual({ cardId: 'omori', left: 3 });
});

test('重りの枷：付けられた側の手番が3回終わると外れ、equipBroken が出る', () => {
  let s = shackled();               // 後手の番
  s = kingShuffle(s);               // 後手1回目の終わり → 2
  expect(s.board[idx({ c: 8, r: 6 })]?.equip).toEqual({ cardId: 'omori', left: 2 });
  s = kingShuffle(s);               // 先手
  s = kingShuffle(s);               // 後手2回目 → 1
  expect(s.board[idx({ c: 8, r: 6 })]?.equip).toEqual({ cardId: 'omori', left: 1 });
  s = kingShuffle(s);               // 先手
  const gi = s.board[idx({ c: 8, r: 6 })]!;
  const side = s.turn;
  const from = s.board.findIndex(p => p?.kind === 'OU' && p.side === side);
  const act = legalActions(s).find(a => a.type === 'move' && a.from.c === from % 9 && a.from.r === Math.floor(from / 9))!;
  const r = applyAction(s, act);    // 後手3回目 → 外れる
  expect(r.state.board[idx({ c: 8, r: 6 })]?.equip).toBeNull();
  expect(r.events).toContainEqual({ type: 'equipBroken', pieceId: gi.id, at: { c: 8, r: 6 }, cardId: 'omori' });
});

test('重りの枷：凍っていても手番の終わりで減る', () => {
  const s = shackled();
  s.board[idx({ c: 8, r: 6 })]!.frozen = 2;
  const t = kingShuffle(s);
  expect(t.board[idx({ c: 8, r: 6 })]?.equip).toEqual({ cardId: 'omori', left: 2 });
});

test('重りの枷：付いた駒が取られても例外にならず、取った側の持ち駒になる', () => {
  let s = shackled();
  s = kingShuffle(s);
  put(s, { c: 8, r: 7 }, 'KI', 'sente');
  const r = applyAction(s, mv({ c: 8, r: 7 }, { c: 8, r: 6 }));
  expect(r.state.players.sente.hand.GI).toBe(1);
});

test('韋駄天：飛車・角（竜・馬も）には付けられず、金・銀・王には付けられる（計画9）', () => {
  const s = base();
  put(s, { c: 1, r: 6 }, 'HI', 'sente');
  put(s, { c: 2, r: 6 }, 'KA', 'sente', { promoted: true });
  put(s, { c: 3, r: 6 }, 'KI', 'sente');
  put(s, { c: 4, r: 6 }, 'GI', 'sente');
  const uid = giveCard(s, 'sente', 'idaten');
  const ts = cardActs(s, uid).map(a => a.targets[0]);
  expect(ts).not.toContainEqual({ c: 1, r: 6 });
  expect(ts).not.toContainEqual({ c: 2, r: 6 });
  expect(ts).toContainEqual({ c: 3, r: 6 });
  expect(ts).toContainEqual({ c: 4, r: 6 });
  expect(ts).toContainEqual({ c: 8, r: 8 });
});

test('落とし穴・凍てつく床の説明に「相手からは場所が見えない」がある', () => {
  expect(CARDS.otoshiana.text).toContain('相手からは場所が見えない');
  expect(CARDS.itetsuku.text).toContain('相手からは場所が見えない');
});
