// 計画5で足した・直したルール：忍札の手番、凍てつく床、成れない駒、格落とし、昇竜、相討ち、身代わり、貫きの槍、重りの枷
import { test, expect } from 'vitest';
import { applyAction, legalActions } from '../../src/rules/game';
import { idx, positionKey } from '../../src/rules/board';
import { canPromote, isInCheck, pieceTargets } from '../../src/rules/moves';
import { CARDS } from '../../src/cards';
import type { Action, GameState, Square } from '../../src/rules/types';
import { emptyState, giveCard, put, setTrap } from '../helpers';

type CardAction = Extract<Action, { type: 'card' }>;
const card = (uid: number, targets: Square[]): Action => ({ type: 'card', uid, targets });
const cardActs = (s: GameState, uid: number) =>
  legalActions(s).filter((a): a is CardAction => a.type === 'card' && a.uid === uid);
const mv = (from: Square, to: Square, promote = false, second?: { to: Square; promote: boolean }): Action =>
  second ? { type: 'move', from, to, promote, second } : { type: 'move', from, to, promote };
const at = (s: GameState, c: number, r: number) => s.board[idx({ c, r })];
const has = (list: Square[], c: number, r: number) => list.some(t => t.c === c && t.r === r);

function base(): GameState {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  return s;
}

// ---------- 忍札の手番 ----------

test('忍札を伏せても手番は続き、同じ手番に2枚目は伏せられない。駒を動かすと手番が終わる', () => {
  const s = base();
  const a = giveCard(s, 'sente', 'kagami');
  const b = giveCard(s, 'sente', 'aiuchi');
  const r1 = applyAction(s, card(a, []));
  expect(r1.state.turn).toBe('sente');
  expect(cardActs(r1.state, b)).toEqual([]);
  const r2 = applyAction(r1.state, mv({ c: 8, r: 8 }, { c: 8, r: 7 }));
  expect(r2.state.turn).toBe('gote');
  expect(r2.state.trapSetThisTurn).toBe(false);
  const r3 = applyAction(r2.state, mv({ c: 0, r: 0 }, { c: 0, r: 1 }));
  expect(cardActs(r3.state, b)).toHaveLength(1);
});

test('忍札を伏せたあとに行える行動が無ければ、手番が相手へ回る', () => {
  const s = base();
  // 先手の王は凍っていて動けない。ほかに駒も持ち駒も札も無い
  s.board[idx({ c: 8, r: 8 })]!.frozen = 1;
  const a = giveCard(s, 'sente', 'kagami');
  const { state, events } = applyAction(s, card(a, []));
  expect(events).toContainEqual({ type: 'passed', side: 'sente' });
  expect(state.turn).toBe('gote');
});

test('局面のキーには、凍結・成れない・この手番に伏せたか が入る', () => {
  const s = base();
  const k0 = positionKey(s);
  s.board[idx({ c: 8, r: 8 })]!.frozen = 1;
  const k1 = positionKey(s);
  expect(k1).not.toBe(k0);
  put(s, { c: 4, r: 4 }, 'GI', 'sente', { sealed: true });
  const k2 = positionKey(s);
  s.board[idx({ c: 4, r: 4 })]!.sealed = undefined;
  delete s.board[idx({ c: 4, r: 4 })]!.sealed;
  expect(positionKey(s)).not.toBe(k2);
  s.trapSetThisTurn = true;
  expect(positionKey(s)).not.toBe(k1);
});

// ---------- 凍てつく床 ----------

test('凍てつく床：自分で入った駒は、次の自分の手番から2手番動けず、3手番目に動ける', () => {
  const s = base();
  s.turn = 'gote';
  setTrap(s, 'sente', 'itetsuku', { c: 4, r: 4 });
  const gi = put(s, { c: 4, r: 3 }, 'GI', 'gote');
  const r1 = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 4 }));
  expect(r1.events).toContainEqual({ type: 'frozen', pieceId: gi.id, at: { c: 4, r: 4 }, turns: 2 });
  expect(r1.state.traps).toEqual([]);
  let st = r1.state;
  const giMoves = (x: GameState) => legalActions(x).filter(a => a.type === 'move' && a.from.c === 4 && a.from.r === 4);
  for (let i = 0; i < 2; i++) {
    const [sf, stt] = i === 0 ? [{ c: 8, r: 8 }, { c: 8, r: 7 }] : [{ c: 8, r: 7 }, { c: 8, r: 8 }];
    st = applyAction(st, mv(sf, stt)).state; // 先手
    expect(giMoves(st)).toEqual([]);
    const [gf, gt] = i === 0 ? [{ c: 0, r: 0 }, { c: 0, r: 1 }] : [{ c: 0, r: 1 }, { c: 0, r: 0 }];
    st = applyAction(st, mv(gf, gt)).state; // 後手（銀は動けない）
  }
  st = applyAction(st, mv({ c: 8, r: 8 }, { c: 8, r: 7 })).state;
  expect(giMoves(st).length).toBeGreaterThan(0);
  expect(at(st, 4, 4)!.frozen).toBeUndefined();
});

test('凍てつく床：王は1手番だけ凍る（落とし穴と違って王にも発動する）', () => {
  const s = emptyState('gote');
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  const ou = put(s, { c: 4, r: 3 }, 'OU', 'gote');
  setTrap(s, 'sente', 'itetsuku', { c: 4, r: 4 });
  const r1 = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 4 }));
  expect(r1.events).toContainEqual({ type: 'frozen', pieceId: ou.id, at: { c: 4, r: 4 }, turns: 1 });
  const r2 = applyAction(r1.state, mv({ c: 8, r: 8 }, { c: 8, r: 7 }));
  // 後手は凍った王しかいないので手番が回る
  expect(r2.events).toContainEqual({ type: 'passed', side: 'gote' });
  const r3 = applyAction(r2.state, mv({ c: 8, r: 7 }, { c: 8, r: 8 }));
  expect(legalActions(r3.state).some(a => a.type === 'move')).toBe(true);
});

test('凍てつく床：押し返しの風で押し込まれた駒も、持ち主の次の手番から2手番動けない', () => {
  const s = base();
  setTrap(s, 'sente', 'itetsuku', { c: 4, r: 3 });
  const kin = put(s, { c: 4, r: 4 }, 'KI', 'gote');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const r1 = applyAction(s, card(uid, [{ c: 4, r: 4 }]));
  expect(r1.events).toContainEqual({ type: 'frozen', pieceId: kin.id, at: { c: 4, r: 3 }, turns: 2 });
  expect(at(r1.state, 4, 3)!.frozen).toBe(2);
  // 押し返しのあとは続けて指す（計画9）
  const r1b = applyAction(r1.state, mv({ c: 8, r: 8 }, { c: 8, r: 7 }));
  expect(at(r1b.state, 4, 3)!.frozen).toBe(2);
  const r2 = applyAction(r1b.state, mv({ c: 0, r: 0 }, { c: 0, r: 1 }));
  expect(at(r2.state, 4, 3)!.frozen).toBe(1);
});

test('凍った駒は動けず、王手にも数えない。凍った自分の駒は入れ替えの術で選べない', () => {
  const s = base();
  put(s, { c: 8, r: 2 }, 'HI', 'gote', { frozen: 2 });
  expect(pieceTargets(s, { c: 8, r: 2 })).toEqual([]);
  expect(isInCheck(s, 'sente')).toBe(false);
  put(s, { c: 4, r: 4 }, 'GI', 'sente', { frozen: 1 });
  put(s, { c: 3, r: 4 }, 'KI', 'sente');
  const uid = giveCard(s, 'sente', 'irekae');
  const pairs = cardActs(s, uid).map(a => a.targets);
  expect(pairs.some(p => p.some(t => t.c === 4 && t.r === 4))).toBe(false);
});

test('韋駄天の1回目で凍てつく床に入ったら、2回目は飛ばす', () => {
  const s = base();
  setTrap(s, 'gote', 'itetsuku', { c: 4, r: 5 });
  const gi = put(s, { c: 4, r: 6 }, 'GI', 'sente', { equip: 'idaten' });
  const { state, events } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 4 }, promote: false }));
  expect(events).toContainEqual({ type: 'secondMoveSkipped', pieceId: gi.id });
  expect(at(state, 4, 5)!.id).toBe(gi.id);
});

// ---------- 成り封じ・成れない駒 ----------

test('成り封じを受けた駒は対局の終わりまで成れない。取られて打ち直すと成れる', () => {
  const s = base();
  setTrap(s, 'gote', 'narifuuji');
  const gi = put(s, { c: 4, r: 3 }, 'GI', 'sente');
  const { state } = applyAction(s, mv({ c: 4, r: 3 }, { c: 4, r: 2 }, true));
  const moved = at(state, 4, 2)!;
  expect(moved.id).toBe(gi.id);
  expect(moved.sealed).toBe(true);
  expect(canPromote(moved, { c: 4, r: 2 }, { c: 4, r: 1 })).toBe(false);
  expect(CARDS.narifuuji.cost).toBe(2);
});

test('成れない歩は、成らないと行き所のない最奥段へ動けない', () => {
  const s = base();
  put(s, { c: 4, r: 1 }, 'FU', 'sente', { sealed: true });
  const fuMoves = legalActions(s).filter(a => a.type === 'move' && a.from.c === 4 && a.from.r === 1);
  expect(fuMoves).toEqual([]);
});

// ---------- 鏡の結界 ----------

test('鏡の結界：コスト1の押し返しの風には発動しない', () => {
  const s = base();
  setTrap(s, 'gote', 'kagami');
  put(s, { c: 4, r: 4 }, 'KI', 'gote');
  const uid = giveCard(s, 'sente', 'oshikaeshi');
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 4 }]));
  expect(events.some(e => e.type === 'magicNegated')).toBe(false);
  expect(at(state, 4, 3)?.kind).toBe('KI');
  expect(state.traps).toHaveLength(1);
});

// ---------- 格落とし ----------

test('格落とし：相手の成った駒だけを選べ、成る前に戻す。纏札は残る', () => {
  const s = base();
  const ryu = put(s, { c: 4, r: 4 }, 'HI', 'gote', { promoted: true, equip: 'tenma' });
  put(s, { c: 5, r: 4 }, 'KI', 'gote');
  const uid = giveCard(s, 'sente', 'kakuotoshi');
  expect(cardActs(s, uid).map(a => a.targets)).toEqual([[{ c: 4, r: 4 }]]);
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 4 }]));
  expect(at(state, 4, 4)).toMatchObject({ kind: 'HI', promoted: false, equip: { cardId: 'tenma' } });
  expect(events).toContainEqual({ type: 'demoted', pieceId: ryu.id, at: { c: 4, r: 4 } });
});

test('格落とし：二歩・行き所のない駒になる駒は選べない', () => {
  const s = base();
  put(s, { c: 2, r: 4 }, 'FU', 'gote', { promoted: true });   // 同じ列に後手の歩 → 二歩
  put(s, { c: 2, r: 2 }, 'FU', 'gote');
  put(s, { c: 3, r: 8 }, 'KE', 'gote', { promoted: true });   // 後手の桂が最奥段 → 行き所なし
  const uid = giveCard(s, 'sente', 'kakuotoshi');
  expect(cardActs(s, uid)).toEqual([]);
});

// ---------- 昇竜 ----------

test('昇竜：自分の駒をその場で成らせる。金・王・成った駒・成れない駒は選べない', () => {
  const s = base();
  const fu = put(s, { c: 4, r: 6 }, 'FU', 'sente');
  put(s, { c: 3, r: 6 }, 'KI', 'sente');
  put(s, { c: 2, r: 6 }, 'GI', 'sente', { promoted: true });
  put(s, { c: 1, r: 6 }, 'GI', 'sente', { sealed: true });
  const uid = giveCard(s, 'sente', 'shoryu');
  expect(cardActs(s, uid).map(a => a.targets)).toEqual([[{ c: 4, r: 6 }]]);
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 6 }]));
  expect(at(state, 4, 6)).toMatchObject({ kind: 'FU', promoted: true });
  expect(events).toContainEqual({ type: 'promotedInPlace', pieceId: fu.id, at: { c: 4, r: 6 } });
});

test('昇竜：相手の成り封じが発動すると成れず、その駒は成れなくなる', () => {
  const s = base();
  setTrap(s, 'gote', 'narifuuji');
  const gi = put(s, { c: 4, r: 6 }, 'GI', 'sente');
  const uid = giveCard(s, 'sente', 'shoryu');
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 6 }]));
  expect(at(state, 4, 6)).toMatchObject({ promoted: false, sealed: true });
  expect(events).toContainEqual({ type: 'promotionBlocked', pieceId: gi.id });
  expect(state.traps).toEqual([]);
});

test('昇竜：鏡の結界が先に打ち消し、成り封じは残る', () => {
  const s = base();
  setTrap(s, 'gote', 'narifuuji');
  setTrap(s, 'gote', 'kagami');
  put(s, { c: 4, r: 6 }, 'GI', 'sente');
  const uid = giveCard(s, 'sente', 'shoryu');
  const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 6 }]));
  expect(events.some(e => e.type === 'magicNegated')).toBe(true);
  expect(at(state, 4, 6)).toMatchObject({ promoted: false });
  expect(at(state, 4, 6)!.sealed).toBeUndefined();
  expect(state.traps.map(t => t.cardId)).toEqual(['narifuuji']);
});

// ---------- 相討ち ----------

test('相討ち：取った相手の駒も壊れ、取られた駒は相手の持ち駒になる', () => {
  const s = base();
  setTrap(s, 'gote', 'aiuchi');
  const hi = put(s, { c: 4, r: 6 }, 'HI', 'sente');
  put(s, { c: 4, r: 3 }, 'KI', 'gote');
  const { state, events } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 3 }));
  expect(at(state, 4, 3)).toBeNull();
  expect(state.players.sente.hand.KI).toBe(1);
  expect(events).toContainEqual({ type: 'destroyed', pieceId: hi.id, at: { c: 4, r: 3 }, cause: 'aiuchi' });
  expect(state.traps).toEqual([]);
});

test('相討ち：王で取ったときは発動せず残る', () => {
  const s = base();
  setTrap(s, 'gote', 'aiuchi');
  put(s, { c: 8, r: 7 }, 'FU', 'gote');
  const { state } = applyAction(s, mv({ c: 8, r: 8 }, { c: 8, r: 7 }));
  expect(at(state, 8, 7)?.kind).toBe('OU');
  expect(state.traps).toHaveLength(1);
});

test('相討ち：鋼の鎧が先に守ると発動しない', () => {
  const s = base();
  setTrap(s, 'gote', 'aiuchi');
  put(s, { c: 4, r: 6 }, 'HI', 'sente');
  put(s, { c: 4, r: 3 }, 'KI', 'gote', { equip: 'hagane' });
  const { state } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 3 }));
  expect(at(state, 4, 6)?.kind).toBe('HI');
  expect(state.traps).toHaveLength(1);
});

test('相討ち：韋駄天の1回目で発動したら2回目は飛ばす', () => {
  const s = base();
  setTrap(s, 'gote', 'aiuchi');
  const gi = put(s, { c: 4, r: 6 }, 'GI', 'sente', { equip: 'idaten' });
  put(s, { c: 4, r: 5 }, 'FU', 'gote');
  const { events } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 5 }, false, { to: { c: 4, r: 4 }, promote: false }));
  expect(events).toContainEqual({ type: 'secondMoveSkipped', pieceId: gi.id });
});

// ---------- 身代わり ----------

test('身代わり：王の隣のいちばん安い駒が代わりに壊れ、取りに来た駒は動かない', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  const ou = put(s, { c: 4, r: 1 }, 'OU', 'gote');
  put(s, { c: 3, r: 1 }, 'KI', 'gote');
  const fu = put(s, { c: 5, r: 0 }, 'FU', 'gote');
  put(s, { c: 3, r: 0 }, 'FU', 'gote'); // 同じ点数なら盤の順で先（r が小さい (3,0) が先）
  setTrap(s, 'gote', 'migawari');
  const hi = put(s, { c: 4, r: 6 }, 'HI', 'sente');
  const { state, events } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 1 }));
  expect(state.result).toBeNull();
  expect(at(state, 4, 6)?.id).toBe(hi.id);
  expect(at(state, 4, 1)?.id).toBe(ou.id);
  expect(at(state, 3, 0)).toBeNull();
  expect(at(state, 5, 0)?.id).toBe(fu.id);
  expect(events).toContainEqual({ type: 'kingGuarded', attackerId: hi.id, kingId: ou.id, at: { c: 4, r: 1 } });
  expect(state.turn).toBe('gote');
});

test('身代わり：王の隣に味方がいなければ発動せず、王が取られる', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 4, r: 1 }, 'OU', 'gote');
  setTrap(s, 'gote', 'migawari');
  put(s, { c: 4, r: 6 }, 'HI', 'sente');
  const { state } = applyAction(s, mv({ c: 4, r: 6 }, { c: 4, r: 1 }));
  expect(state.result).toEqual({ winner: 'sente', reason: 'king-captured' });
});

// ---------- 貫きの槍 ----------

test('貫きの槍：途中の駒を1つ飛び越え、次の駒の手前まで進むか、相手の駒なら取れる', () => {
  const s = base();
  put(s, { c: 4, r: 8 }, 'KY', 'sente', { equip: 'tsuranuki' });
  put(s, { c: 4, r: 6 }, 'FU', 'sente');   // 飛び越える味方
  put(s, { c: 4, r: 3 }, 'FU', 'gote');    // 次の相手の駒（取れる）
  put(s, { c: 4, r: 1 }, 'KI', 'gote');    // 2つ目は飛び越えない
  const t = pieceTargets(s, { c: 4, r: 8 });
  expect(has(t, 4, 7)).toBe(true);
  expect(has(t, 4, 6)).toBe(false);
  expect(has(t, 4, 5)).toBe(true);
  expect(has(t, 4, 4)).toBe(true);
  expect(has(t, 4, 3)).toBe(true);
  expect(has(t, 4, 2)).toBe(false);
  expect(has(t, 4, 1)).toBe(false);
});

test('貫きの槍：最初にぶつかった相手の駒も取れ、その先へも飛び越えられる', () => {
  const s = base();
  put(s, { c: 4, r: 8 }, 'HI', 'sente', { equip: 'tsuranuki' });
  put(s, { c: 4, r: 5 }, 'FU', 'gote');
  const t = pieceTargets(s, { c: 4, r: 8 });
  expect(has(t, 4, 5)).toBe(true);
  expect(has(t, 4, 4)).toBe(true);
  expect(has(t, 4, 0)).toBe(true);
});

test('貫きの槍：付けられるのは飛・角・香（竜・馬も）で、成香には付けられない', () => {
  const s = base();
  put(s, { c: 1, r: 6 }, 'KY', 'sente', { promoted: true });
  put(s, { c: 2, r: 6 }, 'KA', 'sente', { promoted: true });
  put(s, { c: 3, r: 6 }, 'KY', 'sente');
  put(s, { c: 4, r: 6 }, 'GI', 'sente');
  const uid = giveCard(s, 'sente', 'tsuranuki');
  const targets = cardActs(s, uid).map(a => a.targets);
  expect(targets).toEqual([[{ c: 2, r: 6 }], [{ c: 3, r: 6 }]]);
});

// ---------- 重りの枷 ----------

test('重りの枷：付けた駒は隣8マスだけ。桂は動けない。王は選べない', () => {
  const s = base();
  put(s, { c: 4, r: 1 }, 'HI', 'gote');
  put(s, { c: 6, r: 1 }, 'KE', 'gote');
  const uid = giveCard(s, 'sente', 'omori');
  const targets = cardActs(s, uid).map(a => a.targets);
  expect(targets).toContainEqual([{ c: 4, r: 1 }]);
  expect(targets).toContainEqual([{ c: 6, r: 1 }]);
  expect(targets).not.toContainEqual([{ c: 0, r: 0 }]);
  const { state } = applyAction(s, card(uid, [{ c: 4, r: 1 }]));
  const t = pieceTargets(state, { c: 4, r: 1 });
  expect(t.every(q => Math.abs(q.c - 4) <= 1 && Math.abs(q.r - 1) <= 1)).toBe(true);
  expect(has(t, 4, 2)).toBe(true);
  const s2 = base();
  put(s2, { c: 6, r: 1 }, 'KE', 'gote', { equip: 'omori' });
  expect(pieceTargets(s2, { c: 6, r: 1 })).toEqual([]);
});

test('札は全18種類で、術・忍・纏が6種類ずつ。王の盾はなく、退き陣の旗がコスト1', () => {
  const defs = Object.values(CARDS);
  expect(defs).toHaveLength(18);
  for (const kind of ['magic', 'trap', 'equip'] as const) {
    expect(defs.filter(d => d.kind === kind)).toHaveLength(6);
  }
  expect('tate' in CARDS).toBe(false);
  expect(CARDS.hikijin.cost).toBe(1);
  expect(CARDS.itetsuku.kind).toBe('trap');
});
