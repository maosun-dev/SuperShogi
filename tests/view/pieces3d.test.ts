// 駒の裏の字（成ったときの字）を描くかどうかのテスト
import { describe, expect, it } from 'vitest';
import { backLabelOf } from '../../src/view/pieces3d';
import type { Piece, PieceKind } from '../../src/rules/types';

const P = (kind: PieceKind, promoted = false): Piece => ({ id: 1, kind, side: 'sente', promoted, equip: null });

describe('backLabelOf', () => {
  it('歩の裏は「と」、飛車の裏は「竜」、色はどれも同じ紅', () => {
    expect(backLabelOf(P('FU'))?.ch).toBe('と');
    expect(backLabelOf(P('HI'))?.ch).toBe('竜');
    expect(backLabelOf(P('FU'))?.color).toBe(backLabelOf(P('KA'))?.color);
  });
  it('金・王・成った駒には裏の字がない', () => {
    expect(backLabelOf(P('KI'))).toBeNull();
    expect(backLabelOf(P('OU'))).toBeNull();
    expect(backLabelOf(P('FU', true))).toBeNull();
  });
});
