// 定跡：自分の駒の組み方の手順と「勧める手」
import { describe, expect, it } from 'vitest';
import { JOSEKI, josekiMove } from '../../src/ai/joseki';
import { applyAction, createGame, legalActions } from '../../src/rules/game';
import type { Action, GameState, Side } from '../../src/rules/types';
import { actionKey } from '../../src/ai/search';

// 定跡に関係ない手：後手（先手）の飛車を左右に1マス行き来させる
function shuffle(s: GameState): Action {
  const acts = legalActions(s).filter(a => a.type === 'move' && s.board[a.from.r * 9 + a.from.c]?.kind === 'HI' && a.from.r === a.to.r && Math.abs(a.from.c - a.to.c) === 1);
  return acts[0];
}

// side が定跡 name を手順どおりに指しきる（相手は飛車を行き来させるだけ）。指した手の数を返す
function playOut(side: Side, seed: number): { moves: number; names: Set<string> } {
  let s = createGame({ sente: [], gote: [] }, { first: side });
  let moves = 0;
  const names = new Set<string>();
  for (let i = 0; i < 40; i++) {
    if (s.turn === side) {
      const m = josekiMove(s, side, seed);
      if (!m) break;
      expect(legalActions(s).some(a => actionKey(a) === actionKey(m.action))).toBe(true);
      names.add(m.name);
      s = applyAction(s, m.action).state;
      moves++;
    } else {
      s = applyAction(s, shuffle(s)).state;
    }
  }
  return { moves, names };
}

describe('定跡', () => {
  it('3本ある（矢倉・棒銀・四間飛車）', () => {
    expect(JOSEKI.map(j => j.name)).toEqual(['矢倉', '棒銀', '四間飛車']);
  });
  it.each([1, 2, 3, 4, 5, 6])('先手：種 %i でも、選んだ定跡を最後まで合法に指しきる（途中で別の定跡に移らない）', (seed) => {
    const { moves, names } = playOut('sente', seed);
    expect(names.size).toBe(1);
    const j = JOSEKI.find(x => names.has(x.name))!;
    expect(moves).toBe(j.steps.length);
  });
  it.each([1, 2, 3, 4, 5, 6])('後手（180度回した手順）：種 %i', (seed) => {
    const { moves, names } = playOut('gote', seed);
    expect(names.size).toBe(1);
    expect(moves).toBe(JOSEKI.find(x => names.has(x.name))!.steps.length);
  });
  it('種によって3本とも選ばれる', () => {
    const picked = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) picked.add(josekiMove(createGame({ sente: [], gote: [] }), 'sente', seed)!.name);
    expect(picked.size).toBe(3);
  });
  it('手番40を過ぎたら勧めない', () => {
    const s = createGame({ sente: [], gote: [] });
    expect(josekiMove({ ...s, ply: 41 }, 'sente', 1)).toBeNull();
  });
  it('手順の元の駒が消えていたら、その手を飛ばす', () => {
    const s = createGame({ sente: [], gote: [] });
    // 7七の歩（c=2, r=6）を消すと、矢倉の最初の手（76歩）は飛ばして 66歩
    s.board[6 * 9 + 2] = null;
    const yagura = Array.from({ length: 30 }, (_, i) => josekiMove(s, 'sente', i + 1)).find(m => m?.name === '矢倉')!;
    expect(yagura.action).toEqual({ type: 'move', from: { c: 3, r: 6 }, to: { c: 3, r: 5 }, promote: false });
  });
});
