// 2026-10 の札の直し（設計書 docs/superpowers/specs/2026-10-27-card-rebalance-design.md）のルール
import { describe, test, expect } from 'vitest';
import { applyAction, legalActions } from '../../src/rules/game';
import { idx } from '../../src/rules/board';
import { isInCheck, pieceTargets } from '../../src/rules/moves';
import type { Action, GameState, Square } from '../../src/rules/types';
import { emptyState, giveCard, put, setTrap } from '../helpers';

type CardAction = Extract<Action, { type: 'card' }>;
const card = (uid: number, targets: Square[]): Action => ({ type: 'card', uid, targets });
const cardActs = (s: GameState, uid: number) =>
  legalActions(s).filter((a): a is CardAction => a.type === 'card' && a.uid === uid);
const mv = (from: Square, to: Square, promote = false): Action => ({ type: 'move', from, to, promote });
const at = (s: GameState, c: number, r: number) => s.board[idx({ c, r })];
const has = (list: Square[], c: number, r: number) => list.some(t => t.c === c && t.r === r);

function base(): GameState {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  return s;
}

describe('押し返しの風', () => {
  test('使った手番の続きの手では、王を取れない', () => {
    const s = emptyState();
    put(s, { c: 8, r: 8 }, 'OU', 'sente');
    put(s, { c: 4, r: 2 }, 'OU', 'gote');
    put(s, { c: 4, r: 4 }, 'KI', 'gote');   // 押し返す駒（後手の駒は r−1 へ押し戻される）
    put(s, { c: 4, r: 3 }, 'KI', 'sente');  // 王の前にいる金：王を取れる位置
    // 押し返す先（4,3）は埋まっているので、別の駒を押す
    put(s, { c: 6, r: 4 }, 'FU', 'gote');
    const uid = giveCard(s, 'sente', 'oshikaeshi');
    const r = applyAction(s, card(uid, [{ c: 6, r: 4 }]));
    expect(r.state.pushFollowUp).toBe(true);
    const takesKing = legalActions(r.state).some(a => a.type === 'move' && a.to.c === 4 && a.to.r === 2);
    expect(takesKing).toBe(false);
  });
  test('ふだんの手番では、王を取れる', () => {
    const s = emptyState();
    put(s, { c: 8, r: 8 }, 'OU', 'sente');
    put(s, { c: 4, r: 2 }, 'OU', 'gote');
    put(s, { c: 4, r: 3 }, 'KI', 'sente');
    expect(legalActions(s).some(a => a.type === 'move' && a.to.c === 4 && a.to.r === 2)).toBe(true);
  });
});

describe('鏡の結界', () => {
  test('コスト2以上の纏札を打ち消す：纏札は付かず、手番は終わり、罠は消える', () => {
    const s = base();
    setTrap(s, 'gote', 'kagami');
    put(s, { c: 4, r: 6 }, 'GI', 'sente');
    const uid = giveCard(s, 'sente', 'hagane');
    const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 6 }]));
    expect(events.some(e => e.type === 'magicNegated')).toBe(true);
    expect(at(state, 4, 6)?.equip).toBeNull();
    expect(state.turn).toBe('gote');
    expect(state.traps).toHaveLength(0);
  });
  test('忍札を伏せるのは打ち消さない', () => {
    const s = base();
    setTrap(s, 'gote', 'kagami');
    const uid = giveCard(s, 'sente', 'aiuchi');
    const { events, state } = applyAction(s, card(uid, []));
    expect(events.some(e => e.type === 'magicNegated')).toBe(false);
    expect(state.traps).toHaveLength(2);
  });
});

describe('陣替えの旗', () => {
  test('成る前の歩・銀は、真後ろと左右へ1マス動ける（味方のいるマスは除く）', () => {
    const s = base();
    put(s, { c: 4, r: 6 }, 'FU', 'sente', { equip: 'hikijin' });
    put(s, { c: 3, r: 6 }, 'KI', 'sente');
    const t = pieceTargets(s, { c: 4, r: 6 });
    expect(has(t, 4, 5)).toBe(true);   // 前
    expect(has(t, 4, 7)).toBe(true);   // 真後ろ
    expect(has(t, 5, 6)).toBe(true);   // 右
    expect(has(t, 3, 6)).toBe(false);  // 左は味方
    const g = base();
    put(g, { c: 4, r: 6 }, 'GI', 'sente', { equip: 'hikijin' });
    const tg = pieceTargets(g, { c: 4, r: 6 });
    expect(has(tg, 3, 6) && has(tg, 5, 6) && has(tg, 4, 7)).toBe(true);
  });
  test('後手の駒は向きが逆（真後ろは r−1）', () => {
    const s = base();
    put(s, { c: 4, r: 2 }, 'FU', 'gote', { equip: 'hikijin' });
    const t = pieceTargets(s, { c: 4, r: 2 });
    expect(has(t, 4, 1) && has(t, 3, 2) && has(t, 5, 2)).toBe(true);
  });
  test('成ったら、付けたままでも後ろ・左右は足さない（と金の動きだけ）', () => {
    const s = base();
    put(s, { c: 4, r: 4 }, 'FU', 'sente', { equip: 'hikijin', promoted: true });
    const t = pieceTargets(s, { c: 4, r: 4 }).map(q => `${q.c}${q.r}`).sort();
    expect(t).toEqual(['33', '34', '43', '45', '53', '54'].sort());
  });
});

describe('重りの枷（纏札と別の状態）', () => {
  test('纏札が付いた相手の駒にも付けられ、両方持つ。枷の間は隣8マスだけ', () => {
    const s = base();
    put(s, { c: 4, r: 1 }, 'HI', 'gote', { equip: 'hagane' });
    const uid = giveCard(s, 'sente', 'omori');
    expect(cardActs(s, uid).map(a => a.targets)).toContainEqual([{ c: 4, r: 1 }]);
    const { state } = applyAction(s, card(uid, [{ c: 4, r: 1 }]));
    const p = at(state, 4, 1)!;
    expect(p.equip).toEqual({ cardId: 'hagane' });
    expect(p.shackle).toEqual({ left: 3 });
    expect(pieceTargets(state, { c: 4, r: 1 }).every(q => Math.abs(q.c - 4) <= 1 && Math.abs(q.r - 1) <= 1)).toBe(true);
  });
  test('枷の付いた駒には、もう一つ枷は付けられない', () => {
    const s = base();
    put(s, { c: 4, r: 1 }, 'HI', 'gote', { shackle: 3 });
    const uid = giveCard(s, 'sente', 'omori');
    expect(cardActs(s, uid).map(a => a.targets)).not.toContainEqual([{ c: 4, r: 1 }]);
  });
  test('相手の3手番で外れ、元の纏札（鎧）は残って守る', () => {
    let s = base();
    put(s, { c: 4, r: 1 }, 'KI', 'gote', { equip: 'hagane' });
    const uid = giveCard(s, 'sente', 'omori');
    s = applyAction(s, card(uid, [{ c: 4, r: 1 }])).state;
    // 後手と先手が王を行き来させて、後手の手番を3つ終える
    const moves: [Square, Square][] = [
      [{ c: 0, r: 0 }, { c: 0, r: 1 }], [{ c: 8, r: 8 }, { c: 8, r: 7 }],
      [{ c: 0, r: 1 }, { c: 0, r: 0 }], [{ c: 8, r: 7 }, { c: 8, r: 8 }],
      [{ c: 0, r: 0 }, { c: 0, r: 1 }],
    ];
    let events: import('../../src/rules/types').GameEvent[] = [];
    for (const [f, t] of moves) ({ state: s, events } = applyAction(s, mv(f, t)));
    const p = at(s, 4, 1)!;
    expect(p.shackle).toBeUndefined();
    expect(p.equip).toEqual({ cardId: 'hagane' });
    expect(events).toContainEqual({ type: 'equipBroken', pieceId: p.id, at: { c: 4, r: 1 }, cardId: 'omori' });
    expect(pieceTargets(s, { c: 4, r: 1 }).length).toBeGreaterThan(0);
  });
});

describe('落雷（2026-10 の作り直し）', () => {
  // 先手が落雷を使う。後手の銀（4,3）のまわり：後手の金（3,3）、先手の金（5,4）、後手の王（4,2）
  function setup() {
    const s = emptyState();
    put(s, { c: 8, r: 8 }, 'OU', 'sente');
    put(s, { c: 4, r: 2 }, 'OU', 'gote');
    put(s, { c: 4, r: 3 }, 'GI', 'gote');
    put(s, { c: 3, r: 3 }, 'KI', 'gote');
    put(s, { c: 5, r: 4 }, 'KI', 'sente');
    put(s, { c: 1, r: 1 }, 'HI', 'gote');
    put(s, { c: 7, r: 1 }, 'KA', 'gote', { promoted: true });
    const uid = giveCard(s, 'sente', 'rakurai');
    return { s, uid };
  }
  test('飛・角・竜・馬も選べる。王は選べない', () => {
    const { s, uid } = setup();
    const t = cardActs(s, uid).map(a => a.targets[0]);
    expect(t).toContainEqual({ c: 1, r: 1 });
    expect(t).toContainEqual({ c: 7, r: 1 });
    expect(t).not.toContainEqual({ c: 4, r: 2 });
  });
  test('銀を壊すと、まわり8マスの駒（相手・自分・王）が痺れる', () => {
    const { s, uid } = setup();
    const { state, events } = applyAction(s, card(uid, [{ c: 4, r: 3 }]));
    expect(at(state, 4, 3)).toBeNull();
    expect(at(state, 3, 3)?.numb).toBe(1);   // 相手の駒
    expect(at(state, 4, 2)?.numb).toBe(1);   // 相手の王
    expect(at(state, 5, 4)?.numb).toBe(1);   // 自分の駒（使った手番の終わりで 2→1）
    expect(events.filter(e => e.type === 'numbed')).toHaveLength(3);
  });
  test('相手の駒は相手の次の手番に動けず、その次から動ける。自分の駒は自分の次の手番に動けない', () => {
    const { s, uid } = setup();
    let st = applyAction(s, card(uid, [{ c: 4, r: 3 }])).state;  // 後手の番
    expect(pieceTargets(st, { c: 3, r: 3 })).toEqual([]);
    expect(pieceTargets(st, { c: 4, r: 2 })).toEqual([]);           // 痺れた王は逃げられない
    st = applyAction(st, mv({ c: 1, r: 1 }, { c: 1, r: 2 })).state; // 後手の手番が終わる
    expect(at(st, 3, 3)?.numb).toBeUndefined();
    expect(pieceTargets(st, { c: 5, r: 4 })).toEqual([]);           // 先手の金はまだ痺れている
    st = applyAction(st, mv({ c: 8, r: 8 }, { c: 8, r: 7 })).state; // 先手の手番が終わる
    expect(at(st, 5, 4)?.numb).toBeUndefined();
    expect(pieceTargets(st, { c: 3, r: 3 }).length).toBeGreaterThan(0);
  });
  test('凍結と痺れが重なったら、長い方まで動けない', () => {
    const s = base();
    put(s, { c: 4, r: 4 }, 'KI', 'gote', { frozen: 2, numb: 1 });
    expect(pieceTargets(s, { c: 4, r: 4 })).toEqual([]);
    const t = emptyState();
    put(t, { c: 4, r: 4 }, 'KI', 'gote', { frozen: 1 });
    put(t, { c: 4, r: 3 }, 'KI', 'gote', { numb: 2 });
    put(t, { c: 8, r: 8 }, 'OU', 'sente');
    put(t, { c: 0, r: 0 }, 'OU', 'gote');
    t.turn = 'gote';
    const u = applyAction(t, mv({ c: 0, r: 0 }, { c: 0, r: 1 })).state;
    expect(at(u, 4, 4)?.frozen).toBeUndefined();
    expect(at(u, 4, 3)?.numb).toBe(1);
  });
  test('飛車は壊れず、3マスまでになる。痺れは出ない', () => {
    const { s, uid } = setup();
    const { state, events } = applyAction(s, card(uid, [{ c: 1, r: 1 }]));
    const hi = at(state, 1, 1)!;
    expect(hi.kind).toBe('HI');
    expect(hi.reach).toBe(3);
    expect(events.some(e => e.type === 'numbed')).toBe(false);
    expect(events.some(e => e.type === 'reachLimited')).toBe(true);
    const t = pieceTargets(state, { c: 1, r: 1 });
    expect(has(t, 1, 4)).toBe(true);   // 3マス下
    expect(has(t, 1, 5)).toBe(false);  // 4マス下
  });
  test('3マスまでは成っても続く（竜の斜め1マスは使える）。王手の確かめも3マスまで', () => {
    const s = base();
    put(s, { c: 4, r: 4 }, 'HI', 'sente', { promoted: true, reach: 3 });
    const t = pieceTargets(s, { c: 4, r: 4 });
    expect(has(t, 4, 1)).toBe(true);
    expect(has(t, 4, 0)).toBe(false);
    expect(has(t, 3, 3)).toBe(true);   // 斜め1マス
    const k = emptyState();
    put(k, { c: 4, r: 8 }, 'HI', 'sente', { reach: 3 });
    put(k, { c: 4, r: 0 }, 'OU', 'gote');
    put(k, { c: 0, r: 8 }, 'OU', 'sente');
    expect(isInCheck(k, 'gote')).toBe(false);
  });
  test('落雷の説明文', async () => {
    const { CARDS } = await import('../../src/cards');
    expect(CARDS.rakurai.text).toBe('相手の王以外の駒1つに雷を落とす。飛車・角（竜・馬も）でなければ壊し、まわり8マスの駒（自分の駒も）は、使った人の次の手番が終わるまで痺れて動けない。飛車・角なら壊さず、対局の終わりまで滑って進めるのは3マスまでになる');
  });
});
