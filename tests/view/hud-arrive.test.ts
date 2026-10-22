// 駒台に新しく来た持ち駒を見つけるテスト
import { describe, expect, it } from 'vitest';
import { arrivedKinds } from '../../src/view/hud';
import type { HandKind } from '../../src/rules/types';

const H = (o: Partial<Record<HandKind, number>>): Record<HandKind, number> =>
  ({ HI: 0, KA: 0, KI: 0, GI: 0, KE: 0, KY: 0, FU: 0, ...o });

describe('arrivedKinds', () => {
  it('増えた種類だけ', () => {
    expect(arrivedKinds(H({ FU: 1 }), H({ FU: 2, GI: 1 })).sort()).toEqual(['FU', 'GI']);
  });
  it('減った・同じ・最初は空', () => {
    expect(arrivedKinds(H({ FU: 2 }), H({ FU: 1 }))).toEqual([]);
    expect(arrivedKinds(H({ FU: 1 }), H({ FU: 1 }))).toEqual([]);
    expect(arrivedKinds(null, H({ FU: 1 }))).toEqual([]);
  });
  it('描き直しの直前にまだ「ポン」の途中だった種類は残す（CPU に取られた直後の描き直しで消さない）', () => {
    expect(arrivedKinds(H({ FU: 1 }), H({ FU: 1 }), ['FU'])).toEqual(['FU']);
    expect(arrivedKinds(H({ GI: 0 }), H({ GI: 1 }), ['GI'])).toEqual(['GI']);
  });
});
