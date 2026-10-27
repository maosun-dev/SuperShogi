import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/rules/game';
import type { CardId, GameState, Square } from '../../src/rules/types';
import { equipMoveKind } from '../../src/fx/equipMove';

const sq = (c: number, r: number): Square => ({ c, r });

/** 初期配置の局面で、(c, r) の駒に纏札を付ける */
function withEquip(c: number, r: number, cardId: CardId): GameState {
  const s = createGame({ sente: [], gote: [] });
  s.board[r * 9 + c]!.equip = { cardId };
  return s;
}

describe('纏札の出番の手 equipMoveKind', () => {
  it('退き陣の旗：真後ろへ1マス下がる手（先手は r が増える向き）', () => {
    const s = withEquip(4, 6, 'hikijin'); // 先手の 5七 の歩
    s.board[7 * 9 + 4] = null;            // 真後ろを空ける
    expect(equipMoveKind(s, sq(4, 6), sq(4, 7))).toBe('hikijin');
    expect(equipMoveKind(s, sq(4, 6), sq(4, 5))).toBeNull(); // 前へ進む手はふつうの手
  });
  it('退き陣の旗：後手は r が減る向きが後ろ', () => {
    const s = withEquip(4, 2, 'hikijin');
    expect(equipMoveKind(s, sq(4, 2), sq(4, 1))).toBe('hikijin');
  });
  it('天馬の蹄：桂馬の跳び方の手', () => {
    const s = withEquip(4, 6, 'tenma');
    expect(equipMoveKind(s, sq(4, 6), sq(3, 4))).toBe('tenma');
    expect(equipMoveKind(s, sq(4, 6), sq(4, 5))).toBeNull();
  });

  it('纏札の無い駒・別の札の駒は null', () => {
    const s = createGame({ sente: [], gote: [] });
    expect(equipMoveKind(s, sq(4, 6), sq(4, 5))).toBeNull();
    const h = withEquip(4, 6, 'hagane');
    expect(equipMoveKind(h, sq(4, 6), sq(4, 5))).toBeNull();
  });
});
