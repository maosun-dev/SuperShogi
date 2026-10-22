// ふだんの1手の動きは、途中で盤を後の局面に揃えない。
// 揃えると、同じ手番のあとに続く演出（落とし穴・相討ち・身代わり・凍る・纏札が外れる・韋駄天の2回目）の駒が先に消える
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('playMove', () => {
  it('ctx.sync を呼ばない（盤を揃えるのは player.ts の最後の後始末）', () => {
    const src = readFileSync('src/fx/move.ts', 'utf8');
    const start = src.indexOf('export async function playMove');
    const end = src.indexOf('export async function playDrop');
    expect(start).toBeGreaterThan(-1);
    expect(src.slice(start, end)).not.toMatch(/ctx\.sync\(/);
  });
});
