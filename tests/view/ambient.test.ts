// 動く飾り：粒の計算（キャンバスを使わない部分）
import { describe, expect, it } from 'vitest';
import { MAX_PARTICLES, makeParticles, stepParticles } from '../../src/view/ambient';
import { makeRng } from '../../src/ai/random';

describe('動く飾りの粒', () => {
  it('どの舞台でも粒は上限まで。舞台ごとに粒の種類が違う', () => {
    for (const st of ['kabuki', 'ukiyoe', 'byobu'] as const) {
      const ps = makeParticles(st, 390, 844, makeRng(1));
      expect(ps.length).toBeGreaterThan(0);
      expect(ps.length).toBeLessThanOrEqual(MAX_PARTICLES);
    }
    expect(makeParticles('kabuki', 390, 844, makeRng(1))[0].kind).not.toBe(makeParticles('ukiyoe', 390, 844, makeRng(1))[0].kind);
  });
  it('粒は動き、画面の外へ出たら反対側から戻る（数は減らない）', () => {
    const ps = makeParticles('kabuki', 390, 844, makeRng(2));
    const n = ps.length;
    const y0 = ps[0].y;
    for (let i = 0; i < 2000; i++) stepParticles(ps, 0.05, 390, 844);
    expect(ps.length).toBe(n);
    expect(ps[0].y).not.toBe(y0);
    for (const p of ps) {
      expect(p.x).toBeGreaterThan(-200);
      expect(p.x).toBeLessThan(390 + 200);
      expect(p.y).toBeGreaterThan(-200);
      expect(p.y).toBeLessThan(844 + 200);
    }
  });
});
