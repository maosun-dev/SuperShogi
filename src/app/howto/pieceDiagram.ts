// 遊び方の駒の図：5×5 の小さな盤の真ん中に駒を1つ置き、動けるマスを点（1マス）と線（まっすぐどこまでも）で示す。
// 動ける先はルールの pieceTargets に出させるので、説明と実際の動きが食い違わない
import type { PieceKind, Square } from '../../rules/types';
import { createGame } from '../../rules/game';
import { pieceTargets } from '../../rules/moves';

export type DiagramKind = 'OU' | 'HI' | 'KA' | 'KI' | 'GI' | 'KE' | 'KY' | 'FU' | 'RYU' | 'UMA';
export interface PieceDiagram { kind: DiagramKind; label: string; size: number; center: Square; dots: Square[]; rays: Square[] }

export const PIECE_LABEL: Record<DiagramKind, string> = {
  OU: '王', HI: '飛', KA: '角', KI: '金', GI: '銀', KE: '桂', KY: '香', FU: '歩', RYU: '竜', UMA: '馬',
};

const SIZE = 5;
const MID = 4; // 9×9 の真ん中
const HALF = 2; // 図の真ん中

export function diagramFor(kind: DiagramKind): PieceDiagram {
  const base: PieceKind = kind === 'RYU' ? 'HI' : kind === 'UMA' ? 'KA' : kind;
  const s = createGame({ sente: [], gote: [] });
  s.board.fill(null);
  s.board[MID * 9 + MID] = { id: 1, kind: base, side: 'sente', promoted: kind === 'RYU' || kind === 'UMA', equip: null };
  // 図の座標へ（真ん中から2マス以内だけ）
  const near = pieceTargets(s, { c: MID, r: MID })
    .map((t) => ({ dc: t.c - MID, dr: t.r - MID }))
    .filter(({ dc, dr }) => Math.abs(dc) <= HALF && Math.abs(dr) <= HALF);
  const has = (dc: number, dr: number) => near.some((v) => v.dc === dc && v.dr === dr);
  const dots: Square[] = [];
  const rays: Square[] = [];
  for (const { dc, dr } of near) {
    // まっすぐ（縦・横・斜め）の向きで、1マス目と2マス目の両方に行けるなら線
    const straight = dc === 0 || dr === 0 || Math.abs(dc) === Math.abs(dr);
    const ux = Math.sign(dc), uy = Math.sign(dr);
    const ray = straight && has(ux, uy) && has(ux * 2, uy * 2);
    (ray ? rays : dots).push({ c: dc + HALF, r: dr + HALF });
  }
  return { kind, label: PIECE_LABEL[kind], size: SIZE, center: { c: HALF, r: HALF }, dots, rays };
}
