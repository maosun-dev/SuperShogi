// 纏札の「出番の手」を決める純粋な計算：その手が、付けた纏札の力を使った手か。
// 退き陣の旗＝真後ろへ1マス下がる、天馬の蹄＝桂馬の跳び方、貫きの槍＝まっすぐ進む途中の駒を飛び越える。
// DOM も Three.js も使わない
import type { CardId, GameState, Square } from '../rules/types';

export type EquipMoveKind = Extract<CardId, 'hikijin' | 'tenma' | 'tsuranuki'>;

/** 局面 before で from の駒を to へ動かす手が、纏札の力を使う手ならその札の id。そうでなければ null */
export function equipMoveKind(before: GameState, from: Square, to: Square): EquipMoveKind | null {
  const p = before.board[from.r * 9 + from.c];
  const card = p?.equip?.cardId;
  if (!p || !card) return null;
  const dc = to.c - from.c, dr = to.r - from.r;
  const back = p.side === 'sente' ? 1 : -1; // 先手の後ろは r が増える向き
  if (card === 'hikijin') return !p.promoted && dc === 0 && dr === back ? 'hikijin' : null;
  if (card === 'tenma') return Math.abs(dc) === 1 && dr === -2 * back ? 'tenma' : null;
  if (card === 'tsuranuki') {
    const n = Math.max(Math.abs(dc), Math.abs(dr));
    const sc = Math.sign(dc), sr = Math.sign(dr);
    if (n < 2 || dc !== sc * n || dr !== sr * n) return null; // まっすぐ（縦・横・斜め）で2マス以上
    for (let k = 1; k < n; k++) {
      if (before.board[(from.r + sr * k) * 9 + from.c + sc * k]) return 'tsuranuki';
    }
    return null;
  }
  return null;
}
