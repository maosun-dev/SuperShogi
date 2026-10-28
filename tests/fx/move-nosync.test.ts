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

describe('withDropped（打った直後・罠が働く前の局面）', () => {
  it('打った駒を置き、持ち駒を1つ減らす。もとの局面は変えない', async () => {
    const { withDropped } = await import('../../src/fx/move');
    const { createGame } = await import('../../src/rules/game');
    const s = createGame({ sente: [], gote: [] });
    s.board[4 * 9 + 2] = null;
    s.players.sente.hand.FU = 1;
    const r = withDropped(s, { kind: 'drop', side: 'sente', pieceId: 777, piece: 'FU', to: { c: 2, r: 4 } });
    expect(r.board[4 * 9 + 2]).toMatchObject({ id: 777, kind: 'FU', side: 'sente', promoted: false });
    expect(r.players.sente.hand.FU).toBe(0);
    expect(s.board[4 * 9 + 2]).toBeNull();
    expect(s.players.sente.hand.FU).toBe(1);
  });
});
