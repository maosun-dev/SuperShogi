// 友と対局：盤面の指紋。2台の盤面が食い違っていないかを、手を送るたびに確かめる
import type { GameState } from '../rules/types';

// キーの順番を決めて文字にする（同じ中身なら必ず同じ文字）
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${k}:${stable(o[k])}`).join(',')}}`;
}

/** FNV-1a（32ビット）の16進8桁 */
export function fingerprint(s: GameState): string {
  const text = stable({
    board: s.board, players: s.players, traps: s.traps, turn: s.turn, ply: s.ply,
    trapSetThisTurn: s.trapSetThisTurn, pushFollowUp: s.pushFollowUp, result: s.result,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
