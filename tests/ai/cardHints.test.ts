import { describe, test, expect } from 'vitest';
import { cardHints, HINT_SQUARES, HINT_SWAP, HINT_TOP } from '../../src/ai/cardHints';
import { legalActions } from '../../src/rules/game';
import { createGame } from '../../src/rules/game';
import type { CardId, GameState } from '../../src/rules/types';
import { emptyState, giveCard, put } from '../helpers';

const hintsFor = (s: GameState, id: CardId) => {
  const uid = giveCard(s, s.turn, id);
  return cardHints(s, legalActions(s)).filter(a => a.uid === uid);
};

test('札ごとの候補の数には上限がある', () => {
  const s = createGame({ sente: [], gote: [] });
  expect(hintsFor(s, 'rakurai').length).toBeLessThanOrEqual(HINT_TOP + 2); // 飛車角2つ＋それ以外（2026-10）
  expect(hintsFor(createGame({ sente: [], gote: [] }), 'irekae').length).toBeLessThanOrEqual(HINT_SWAP);
  expect(hintsFor(createGame({ sente: [], gote: [] }), 'otoshiana').length).toBeLessThanOrEqual(HINT_SQUARES);
  expect(hintsFor(createGame({ sente: [], gote: [] }), 'kagami')).toHaveLength(1);
  expect(hintsFor(createGame({ sente: [], gote: [] }), 'tenma').length).toBeLessThanOrEqual(HINT_TOP);
});

test('落雷は点数の大きい相手の駒を選ぶ', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  for (let c = 1; c < 7; c++) put(s, { c, r: 2 }, 'FU', 'gote');
  put(s, { c: 7, r: 2 }, 'KI', 'gote');
  const h = hintsFor(s, 'rakurai');
  expect(h.map(a => a.targets[0])).toContainEqual({ c: 7, r: 2 });
});

test('王手をかけられているときの入れ替えの術は、王を含む組を候補に入れる', () => {
  const s = emptyState();
  put(s, { c: 4, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 2 }, 'HI', 'gote');
  put(s, { c: 0, r: 8 }, 'KI', 'sente');
  const h = hintsFor(s, 'irekae');
  expect(h.some(a => a.targets.some(t => t.c === 4 && t.r === 8))).toBe(true);
});

test('相手の竜への格落としは候補に入る', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  put(s, { c: 4, r: 4 }, 'HI', 'gote', { promoted: true });
  expect(hintsFor(s, 'kakuotoshi').map(a => a.targets)).toEqual([[{ c: 4, r: 4 }]]);
});

test('身代わりは、自分の王の隣に味方がいるときだけ', () => {
  const s = emptyState();
  put(s, { c: 8, r: 8 }, 'OU', 'sente');
  put(s, { c: 0, r: 0 }, 'OU', 'gote');
  expect(hintsFor(s, 'migawari')).toEqual([]);
  const t = emptyState();
  put(t, { c: 8, r: 8 }, 'OU', 'sente');
  put(t, { c: 7, r: 8 }, 'KI', 'sente');
  put(t, { c: 0, r: 0 }, 'OU', 'gote');
  expect(hintsFor(t, 'migawari')).toHaveLength(1);
});

describe('2026-10 の札の直し', () => {
  test('落雷は飛車・角も候補に入れ、飛車角以外の候補も残す', () => {
    const s = emptyState('sente');
    put(s, { c: 8, r: 8 }, 'OU', 'sente');
    put(s, { c: 4, r: 0 }, 'OU', 'gote');
    put(s, { c: 1, r: 1 }, 'HI', 'gote');
    put(s, { c: 7, r: 1 }, 'KA', 'gote');
    put(s, { c: 3, r: 0 }, 'KI', 'gote');
    put(s, { c: 5, r: 0 }, 'KI', 'gote');
    put(s, { c: 2, r: 0 }, 'GI', 'gote');
    giveCard(s, 'sente', 'rakurai');
    const t = cardHints(s, legalActions(s)).map(a => `${a.targets[0].c}${a.targets[0].r}`);
    expect(t).toContain('11');
    expect(t).toContain('71');
    expect(t.filter(x => !['11', '71'].includes(x)).length).toBeGreaterThanOrEqual(2);
  });
  test('番傘は、相手に伏せ札か忍札があるときだけ候補（価値の高い自分の駒）', () => {
    const s = emptyState('sente');
    put(s, { c: 8, r: 8 }, 'OU', 'sente');
    put(s, { c: 4, r: 0 }, 'OU', 'gote');
    put(s, { c: 7, r: 7 }, 'HI', 'sente');
    put(s, { c: 4, r: 6 }, 'FU', 'sente');
    giveCard(s, 'sente', 'bangasa');
    expect(cardHints(s, legalActions(s))).toEqual([]);
    s.traps.push({ uid: 99, owner: 'gote', cardId: null, at: null });
    const t = cardHints(s, legalActions(s)).map(a => `${a.targets[0].c}${a.targets[0].r}`);
    expect(t[0]).toBe('77');
  });
});
