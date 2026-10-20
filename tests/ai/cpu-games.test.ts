import { test, expect } from 'vitest';

// lib に DOM がないので、console の型は最小のものを自前で宣言する
declare const console: { log(...args: unknown[]): void };
import { LEVELS } from '../../src/ai/levels';
import { search } from '../../src/ai/search';
import { applyAction, createGame } from '../../src/rules/game';
import { viewFor } from '../../src/rules/view';

test.each([1, 2, 3])('CPU 同士で120手指しても反則も例外も出ない（種 %i）', seed => {
  let s = createGame({ sente: LEVELS.weak.deck, gote: LEVELS.normal.deck });
  let plies = 0;
  for (; plies < 120 && !s.result; plies++) {
    const level = s.turn === 'sente' ? 'weak' : 'normal';
    const { deck: _deck, ...opts } = LEVELS[level];
    const r = search(viewFor(s, s.turn), s.turn, { ...opts, timeLimitMs: 50, seed: seed * 1000 + plies });
    s = applyAction(s, r.action).state;
  }
  console.log(`[通し] 種${seed}: ${plies}手 結果=${JSON.stringify(s.result)}`);
}, 120_000);
