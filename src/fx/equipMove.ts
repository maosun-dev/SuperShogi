// 纏札の「出番の手」を決める純粋な計算：その手が、付けた纏札の力を使った手か。
// 陣替えの旗＝真後ろか左右へ1マス、天馬の蹄＝桂馬の跳び方。
// DOM も Three.js も使わない
import type { CardId, GameState, Square } from '../rules/types';

export type EquipMoveKind = Extract<CardId, 'hikijin' | 'tenma'>;

/** 局面 before で from の駒を to へ動かす手が、纏札の力を使う手ならその札の id。そうでなければ null */
export function equipMoveKind(before: GameState, from: Square, to: Square): EquipMoveKind | null {
  const p = before.board[from.r * 9 + from.c];
  const card = p?.equip?.cardId;
  if (!p || !card) return null;
  const dc = to.c - from.c, dr = to.r - from.r;
  const back = p.side === 'sente' ? 1 : -1; // 先手の後ろは r が増える向き
  // 陣替えの旗：成る前の駒が、真後ろか左右へ1マス
  if (card === 'hikijin') return !p.promoted && ((dc === 0 && dr === back) || (dr === 0 && Math.abs(dc) === 1)) ? 'hikijin' : null;
  if (card === 'tenma') return Math.abs(dc) === 1 && dr === -2 * back ? 'tenma' : null;
  return null;
}
