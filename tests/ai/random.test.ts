import { test, expect } from 'vitest';
import { makeRng } from '../../src/ai/random';

test('同じ種なら同じ並び', () => {
  const a = makeRng(1);
  const b = makeRng(1);
  const xs = Array.from({ length: 10 }, () => a());
  const ys = Array.from({ length: 10 }, () => b());
  expect(xs).toEqual(ys);
});

test('0以上1未満', () => {
  const r = makeRng(42);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    expect(v >= 0 && v < 1).toBe(true);
  }
});
