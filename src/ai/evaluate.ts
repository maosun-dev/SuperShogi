// CPU 用の局面の点数（side から見た 自分−相手）
import { CARDS } from '../cards';
import { HAND_KINDS, idx, opponent, sqOf } from '../rules/board';
import { pieceTargets } from '../rules/moves';
import type { CardId, GameState, PieceKind, Side, Square } from '../rules/types';

export const PIECE_VALUE: Record<PieceKind, number> = {
  FU: 100, KY: 300, KE: 350, GI: 500, KI: 600, KA: 800, HI: 1000, OU: 0,
};
// 成り駒の点数（金は成れないので無し）
export const PROMOTED_VALUE: Partial<Record<PieceKind, number>> = {
  FU: 600, KY: 600, KE: 600, GI: 600, KA: 1100, HI: 1300,
};
export const HAND_FACTOR = 1.1;   // 持ち駒は盤上の1.1倍（どこにでも打てるため）
export const CARD_PER_COST = 80;  // 未使用のカード：コスト×80
export const TRAP_PER_COST = 100; // 中身の分かる伏せた罠：コスト×100
export const PITFALL_BONUS = 100; // 自分の落とし穴のマスに、相手の王以外の駒が動ける
export const EQUIP_VALUE: Partial<Record<CardId, number>> = {
  tenma: 200, hagane: 350, tate: 350, idaten: 500,
};

// 相手の王以外の駒が動けるマスの集合
function nonKingReach(s: GameState, by: Side): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== by || p.kind === 'OU') continue;
    for (const t of pieceTargets(s, sqOf(i))) out.add(idx(t));
  }
  return out;
}

function sideScore(s: GameState, side: Side): number {
  let total = 0;
  for (const p of s.board) {
    if (!p || p.side !== side) continue;
    total += p.promoted ? (PROMOTED_VALUE[p.kind] ?? PIECE_VALUE[p.kind]) : PIECE_VALUE[p.kind];
    if (p.equip) total += EQUIP_VALUE[p.equip.cardId] ?? 0;
  }
  for (const k of HAND_KINDS) total += s.players[side].hand[k] * PIECE_VALUE[k] * HAND_FACTOR;
  for (const c of s.players[side].cards) {
    if (!c.used) total += CARDS[c.cardId].cost * CARD_PER_COST;
  }
  let reach: Set<number> | null = null;
  for (const t of s.traps) {
    if (t.owner !== side || t.cardId === null) continue; // 隠れた罠は0点
    const def = CARDS[t.cardId];
    total += def.cost * TRAP_PER_COST;
    if (t.cardId === 'otoshiana' && t.at) {
      reach ??= nonKingReach(s, opponent(side));
      if (reach.has(idx(t.at as Square))) total += PITFALL_BONUS;
    }
  }
  return total;
}

export function evaluate(s: GameState, side: Side): number {
  return sideScore(s, side) - sideScore(s, opponent(side));
}
