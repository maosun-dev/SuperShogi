// 駒の点数（CPU の評価と、身代わりの「いちばん安い駒」で使う）
import type { Piece, PieceKind } from './types';

export const PIECE_VALUE: Record<PieceKind, number> = {
  FU: 100, KY: 300, KE: 350, GI: 500, KI: 600, KA: 800, HI: 1000, OU: 0,
};
// 成り駒の点数（金は成れないので無し）
export const PROMOTED_VALUE: Partial<Record<PieceKind, number>> = {
  FU: 600, KY: 600, KE: 600, GI: 600, KA: 1100, HI: 1300,
};

export function pieceValue(p: Piece): number {
  return p.promoted ? (PROMOTED_VALUE[p.kind] ?? PIECE_VALUE[p.kind]) : PIECE_VALUE[p.kind];
}
