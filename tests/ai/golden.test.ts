// 答え合わせ：決まった局面で、CPU の選ぶ手・点数・読めた深さが記録と完全に同じ。
// 読みを速くしても、読みの中身（答え）は変えないことを守る
import { describe, expect, test } from 'vitest';
import { actionKey, search } from '../../src/ai/search';
import { benchPositions, GOLDEN_OPTS } from './helpers/positions';
import golden from './golden-moves.json';

const positions = benchPositions();

describe('答え合わせ', () => {
  test('局面の数が記録と同じ', () => {
    expect(positions.length).toBe(golden.length);
  });
  // 記録（JSON）では -0 が 0 になるので、点数は +0 でそろえる
  test.each(positions.map((s, i) => [i, s] as const))('局面 %i', (i, s) => {
    const r = search(s, s.turn, { ...GOLDEN_OPTS });
    expect({ action: actionKey(r.action), score: r.score + 0, depth: r.depth }).toEqual(golden[i]);
  }, 60_000);
});
