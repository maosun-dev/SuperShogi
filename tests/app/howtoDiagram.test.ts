import { describe, it, expect } from 'vitest';
import { diagramFor, PIECE_LABEL, type DiagramKind } from '../../src/app/howto/pieceDiagram';
import { createGame } from '../../src/rules/game';
import { pieceTargets } from '../../src/rules/moves';
import type { Square } from '../../src/rules/types';

const key = (s: Square) => `${s.c},${s.r}`;
const keys = (a: Square[]) => a.map(key).sort();
const ALL: DiagramKind[] = ['OU', 'HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU', 'RYU', 'UMA'];

describe('遊び方の駒の図', () => {
  it('歩は前1マスだけ', () => {
    const d = diagramFor('FU');
    expect(keys(d.dots)).toEqual(['2,1']);
    expect(d.rays).toEqual([]);
  });

  it('桂は前へ2・横へ1の2マス', () => {
    expect(keys(diagramFor('KE').dots)).toEqual(['1,0', '3,0']);
  });

  it('金は6マス（斜め後ろには行けない）', () => {
    const d = diagramFor('KI');
    expect(d.dots).toHaveLength(6);
    expect(keys(d.dots)).not.toContain('1,3');
    expect(keys(d.dots)).not.toContain('3,3');
  });

  it('飛は上下左右に線、点は無い', () => {
    const d = diagramFor('HI');
    expect(keys(d.rays)).toEqual(['0,2', '1,2', '2,0', '2,1', '2,3', '2,4', '3,2', '4,2']);
    expect(d.dots).toEqual([]);
  });

  it('竜は飛の線に斜め4つの点', () => {
    const d = diagramFor('RYU');
    expect(keys(d.rays)).toEqual(keys(diagramFor('HI').rays));
    expect(keys(d.dots)).toEqual(['1,1', '1,3', '3,1', '3,3']);
  });

  it('10種すべて、図の点と線がルールの動けるマス（真ん中から2マス以内）とそろう', () => {
    for (const kind of ALL) {
      const d = diagramFor(kind);
      expect(d.size).toBe(5);
      expect(d.center).toEqual({ c: 2, r: 2 });
      expect(PIECE_LABEL[kind]).toBeTruthy();
      const s = createGame({ sente: [], gote: [] });
      s.board.fill(null);
      const base = kind === 'RYU' ? 'HI' : kind === 'UMA' ? 'KA' : kind;
      s.board[4 * 9 + 4] = { id: 1, kind: base, side: 'sente', promoted: kind === 'RYU' || kind === 'UMA', equip: null };
      const want = pieceTargets(s, { c: 4, r: 4 })
        .filter((t) => Math.abs(t.c - 4) <= 2 && Math.abs(t.r - 4) <= 2)
        .map((t) => ({ c: t.c - 2, r: t.r - 2 }));
      expect(keys([...d.dots, ...d.rays]), kind).toEqual(keys(want));
    }
  });
});
