// 友と対局：後手の席の iPhone で見せる形を180度回し、先手と後手を入れ替える。
// 駒の id・札の uid は変えない。どの関数も2回通すと元に戻る
import type { Action, GameEvent, GameState, Result, Side, Square } from '../rules/types';
import { cloneState } from '../rules/board';

export function mirrorSq(q: Square): Square {
  return { c: 8 - q.c, r: 8 - q.r };
}

export function mirrorSide(s: Side): Side {
  return s === 'sente' ? 'gote' : 'sente';
}

const sqOrNull = (q: Square | null): Square | null => (q ? mirrorSq(q) : null);

export function mirrorResult(r: Result): Result {
  return r.winner ? { ...r, winner: mirrorSide(r.winner) } : { ...r };
}

/** 局面を回す。千日手の記録（seen）は回さず空にする（合法手は本当の局面から作るため） */
export function mirrorState(s: GameState): GameState {
  const v = cloneState(s);
  const board = new Array<GameState['board'][number]>(81).fill(null);
  for (let i = 0; i < 81; i++) {
    const p = v.board[i];
    if (p) board[80 - i] = { ...p, side: mirrorSide(p.side) };
  }
  return {
    ...v,
    board,
    players: { sente: v.players.gote, gote: v.players.sente },
    traps: v.traps.map((t) => ({ ...t, owner: mirrorSide(t.owner), at: sqOrNull(t.at) })),
    turn: mirrorSide(v.turn),
    seen: {},
    result: v.result ? mirrorResult(v.result) : null,
  };
}

export function mirrorAction(a: Action): Action {
  switch (a.type) {
    case 'move': {
      const m: Action = { type: 'move', from: mirrorSq(a.from), to: mirrorSq(a.to), promote: a.promote };
      return a.second ? { ...m, second: { to: mirrorSq(a.second.to), promote: a.second.promote } } : m;
    }
    case 'drop': return { ...a, to: mirrorSq(a.to) };
    case 'card': return { ...a, targets: a.targets.map(mirrorSq) };
  }
}

function mirrorEvent(e: GameEvent): GameEvent {
  switch (e.type) {
    case 'moved': case 'pushed': return { ...e, from: mirrorSq(e.from), to: mirrorSq(e.to) };
    case 'dropped': return { ...e, side: mirrorSide(e.side), to: mirrorSq(e.to) };
    case 'captured': return { ...e, at: mirrorSq(e.at), by: mirrorSide(e.by) };
    case 'cardUsed': return { ...e, side: mirrorSide(e.side), targets: e.targets.map(mirrorSq) };
    case 'trapSet': return { ...e, side: mirrorSide(e.side), at: sqOrNull(e.at) };
    case 'trapTriggered': return { ...e, owner: mirrorSide(e.owner), at: sqOrNull(e.at) };
    case 'destroyed': case 'armorBlocked': case 'frozen': case 'demoted': case 'promotedInPlace': case 'equipBroken':
      return { ...e, at: mirrorSq(e.at) };
    case 'swapped': return { ...e, a: mirrorSq(e.a), b: mirrorSq(e.b) };
    case 'kingGuarded': return { ...e, at: mirrorSq(e.at), to: mirrorSq(e.to) };
    case 'magicNegated': case 'passed': case 'check': return { ...e, side: mirrorSide(e.side) };
    case 'handTransferred': return { ...e, from: mirrorSide(e.from), to: mirrorSide(e.to) };
    case 'gameOver': return { ...e, result: mirrorResult(e.result) };
    case 'equipped': case 'promotionBlocked': case 'secondMoveSkipped': return { ...e };
  }
}

export function mirrorEvents(es: GameEvent[]): GameEvent[] {
  return es.map(mirrorEvent);
}
