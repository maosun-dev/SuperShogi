// 罠カード3枚。伏せる・発動するのはルール本体（game.ts）が trap の指定を見て行う
import type { GameState, Side, Square } from '../rules/types';
import { sameSq, sqOf } from '../rules/board';
import type { CardDef } from './types';

export const TRAP_LIMIT = 3;

function trapRoom(s: GameState, side: Side): boolean {
  return s.traps.filter(t => t.owner === side).length < TRAP_LIMIT;
}

// 空きマス。自分の落とし穴がすでにあるマスは除く（相手の罠は見えないので考えない）
function squareTargets(s: GameState, side: Side): Square[][] {
  if (!trapRoom(s, side)) return [];
  const out: Square[][] = [];
  s.board.forEach((p, i) => {
    if (p) return;
    const sq = sqOf(i);
    if (s.traps.some(t => t.owner === side && t.at && sameSq(t.at, sq))) return;
    out.push([sq]);
  });
  return out;
}

function slotTargets(s: GameState, side: Side): Square[][] {
  return trapRoom(s, side) ? [[]] : [];
}

export const otoshiana: CardDef = {
  id: 'otoshiana', name: '落とし穴', kind: 'trap', cost: 2, fx: 'otoshiana',
  text: 'このマスに入った相手の駒を破壊する。王が入ったときは発動せず、罠は残る',
  prompt: '落とし穴を仕掛けるマスを選んでください',
  targetSets: squareTargets,
  trap: { placement: 'square', trigger: 'enter' },
};

export const kagami: CardDef = {
  id: 'kagami', name: '鏡の結界', kind: 'trap', cost: 3, fx: 'kagami',
  text: '相手が魔法を使ったとき、その魔法を無効にする。無効にされた側の手番は終わる',
  targetSets: slotTargets,
  trap: { placement: 'slot', trigger: 'magic' },
};

export const narifuuji: CardDef = {
  id: 'narifuuji', name: '成り封じ', kind: 'trap', cost: 1, fx: 'narifuuji',
  text: '相手が成ろうとしたとき、成れなくする。成らないと行き所がなくなる場合は発動しない',
  targetSets: slotTargets,
  trap: { placement: 'slot', trigger: 'promote' },
};

export const TRAP_CARDS: CardDef[] = [otoshiana, kagami, narifuuji];
