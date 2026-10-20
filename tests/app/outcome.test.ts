import { describe, it, expect } from 'vitest';
import { costMarks, outcomeOf, resultWords, tallyText } from '../../src/app/outcome';
import { CARDS } from '../../src/cards';

describe('結果の言葉', () => {
  it('勝ち・負け・引き分けと理由', () => {
    expect(outcomeOf({ winner: 'sente', reason: 'king-captured' })).toBe('win');
    expect(outcomeOf({ winner: 'gote', reason: 'king-captured' })).toBe('loss');
    expect(outcomeOf({ winner: null, reason: 'repetition' })).toBe('draw');
    expect(resultWords({ winner: 'sente', reason: 'king-captured' })).toEqual({ seal: '勝', reason: '王を取りました' });
    expect(resultWords({ winner: 'gote', reason: 'king-captured' })).toEqual({ seal: '負', reason: '王を取られました' });
    expect(resultWords({ winner: null, reason: 'repetition' })).toEqual({ seal: '引分', reason: '同じ局面が4回出ました' });
    expect(resultWords({ winner: null, reason: 'move-limit' })).toEqual({ seal: '引分', reason: '300手を超えました' });
  });
  it('戦績の言葉', () => {
    expect(tallyText({ wins: 3, losses: 1, draws: 0 })).toBe('3勝 1敗');
    expect(tallyText({ wins: 0, losses: 0, draws: 2 })).toBe('0勝 0敗 2分');
  });
  it('コストの目盛りは10個で、カードの種類とコストの分だけ埋まる', () => {
    expect(costMarks([])).toEqual(Array(10).fill(null));
    const m = costMarks(['rakurai', 'otoshiana']);
    expect(m).toHaveLength(10);
    const a = CARDS.rakurai.cost, b = CARDS.otoshiana.cost;
    expect(m.slice(0, a).every((k) => k === 'magic')).toBe(true);
    expect(m.slice(a, a + b).every((k) => k === 'trap')).toBe(true);
    expect(m.slice(a + b).every((k) => k === null)).toBe(true);
  });
});
