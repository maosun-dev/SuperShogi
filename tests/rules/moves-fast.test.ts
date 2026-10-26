// 速くした利きの部品が、もとの pieceTargets と同じ答えを返すかの突き合わせ。
// 局面集（纏札・凍結・成り封じ・王のいない盤・伏せた罠を隠した局面を含む）の全部の駒・全部のマスで比べる
import { describe, expect, test } from 'vitest';
import { attackedBy, attacks, pieceTargets } from '../../src/rules/moves';
import { idx, sqOf } from '../../src/rules/board';
import type { GameState, Side } from '../../src/rules/types';
import { benchPositions } from '../ai/helpers/positions';

const positions = benchPositions();
const SIDES: Side[] = ['sente', 'gote'];

// もとの attackedBy（全部の駒の動ける先を並べて探す）
function attackedByRef(s: GameState, sq: { c: number; r: number }, side: Side): boolean {
  for (let i = 0; i < 81; i++) {
    const p = s.board[i];
    if (!p || p.side !== side) continue;
    if (pieceTargets(s, sqOf(i)).some(t => t.c === sq.c && t.r === sq.r)) return true;
  }
  return false;
}

describe('attacks', () => {
  test('全部の駒・全部のマスで pieceTargets と同じ', () => {
    let checked = 0;
    for (const s of positions) {
      for (let i = 0; i < 81; i++) {
        if (!s.board[i]) continue;
        const reach = new Set(pieceTargets(s, sqOf(i)).map(idx));
        for (let t = 0; t < 81; t++) {
          expect(attacks(s, i, t), `局面${positions.indexOf(s)} ${i}→${t}`).toBe(reach.has(t));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50_000);
  });
  test('駒のないマスからは利かない', () => {
    const s = positions[0];
    const empty = s.board.findIndex(p => p === null);
    expect(attacks(s, empty, 40)).toBe(false);
  });
});

describe('attackedBy', () => {
  test('全部のマス・両方の側で、もとの作りと同じ', () => {
    for (const s of positions) {
      for (let t = 0; t < 81; t++) {
        for (const side of SIDES) expect(attackedBy(s, sqOf(t), side)).toBe(attackedByRef(s, sqOf(t), side));
      }
    }
  });
});
