// 王の盾：盾を付けた駒と、その周り8マスの味方は、相手の術札と重りの枷を受けない
import type { GameState, Square } from '../rules/types';
import { idx, onBoard } from '../rules/board';

export function isShielded(s: GameState, sq: Square): boolean {
  const p = s.board[idx(sq)];
  if (!p) return false;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const q = { c: sq.c + dc, r: sq.r + dr };
      if (!onBoard(q)) continue;
      const g = s.board[idx(q)];
      if (g && g.side === p.side && g.equip?.cardId === 'tate') return true;
    }
  }
  return false;
}
