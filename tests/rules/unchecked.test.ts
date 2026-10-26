import { test, expect } from 'vitest';
import { applyAction, applyActionUnchecked, createGame, legalActions } from '../../src/rules/game';
import { IllegalActionError } from '../../src/rules/types';
import { makeRng } from '../../src/ai/random';

test('確認を省いた版も、合法な行動では applyAction と同じ結果になる', () => {
  const rand = makeRng(7);
  let s = createGame({ sente: [], gote: [] });
  for (let i = 0; i < 60 && !s.result; i++) {
    const acts = legalActions(s);
    const a = acts[Math.floor(rand() * acts.length)];
    const checked = applyAction(s, a);
    const unchecked = applyActionUnchecked(s, a);
    expect(unchecked.state).toEqual(checked.state);
    expect(unchecked.events).toEqual(checked.events);
    s = checked.state;
  }
});

test('applyAction は今まで通り反則の行動を拒む', () => {
  const s = createGame({ sente: [], gote: [] });
  expect(() => applyAction(s, { type: 'move', from: { c: 0, r: 6 }, to: { c: 0, r: 4 }, promote: false }))
    .toThrow(IllegalActionError);
});

test('終わった対局には確認を省いた版でも例外', () => {
  const s = createGame({ sente: [], gote: [] });
  const a = legalActions(s)[0];
  s.result = { winner: 'sente', reason: 'king-captured' };
  expect(() => applyActionUnchecked(s, a)).toThrow(IllegalActionError);
});

test('quiet の適用は、知らせを作らないだけで局面は同じ', async () => {
  const { benchPositions } = await import('../ai/helpers/positions');
  let n = 0;
  for (const s of benchPositions()) {
    for (const a of legalActions(s)) {
      expect(applyActionUnchecked(s, a, { quiet: true }).state).toEqual(applyActionUnchecked(s, a).state);
      n++;
    }
  }
  expect(n).toBeGreaterThan(1000);
});
