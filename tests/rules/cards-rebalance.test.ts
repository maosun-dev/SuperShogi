// 2026-10 の札の直し（設計書 docs/superpowers/specs/2026-10-27-card-rebalance-design.md）のルール
import { describe, test, expect } from 'vitest';
import { applyAction, legalActions } from '../../src/rules/game';
import { idx } from '../../src/rules/board';
import { pieceTargets } from '../../src/rules/moves';
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
